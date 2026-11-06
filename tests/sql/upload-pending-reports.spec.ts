import { test, expect } from '@playwright/test';
import * as fs from 'fs';
import * as path from 'path';
import { uploadFileToSharePointFolder, removeLocalReportCopy } from '../helpers/sharepointUpload';
import { BATCH_EVIDENCE_FOLDER_URL, BATCH_MANIFEST_PATH, ROWS_TO_DOCUMENT, readBatchManifest } from '../config/batch';

// Uploads report .docx files already sitting in temp/ to the batch evidence
// folder, one at a time.
//
//   npm run batch:upload-reports
//
// Recovery tool for the case where the sandbox walkthrough succeeded and
// the report was built, but only the SharePoint upload failed —
// run_regression_case keeps the local staging copy when publishing doesn't
// happen, so the finished report is still on disk and re-running the whole
// walkthrough to produce an identical file is pure waste.
//
// Hit live on 2026-11-06: all 8 RUSH/NERM walkthroughs completed and built
// their reports, then every upload died with "Target page, context or
// browser has been closed" because four Playwright workers each called
// uploadFileToSharePointFolder at once. That function starts with
// stopChromeUsingProfile(UPLOAD_PROFILE_DIR), which kills any Chrome using
// the shared upload profile — so each worker's first act was to kill the
// upload a sibling worker was in the middle of. See the --workers=1 note on
// batch:document.
//
// SERIAL BY CONSTRUCTION, and that is the point: a for-loop over one
// browser profile, never parallel. Do not "optimize" this into parallel
// uploads — that is precisely the bug it exists to recover from.
// ONLY files belonging to an identity this batch documents are uploaded.
//
// The first version of this spec globbed every .docx in temp/ and started
// pushing 25 stale September/October reports into Evidence_Nov_11_2026
// before it was interrupted — two landed there and had their local copies
// deleted. temp/ is a long-lived scratch directory full of reports whose
// uploads failed or were never attempted, going back months; "every .docx
// in temp/" is emphatically not "the reports from this run".
//
// Matching is by identity name against the batch manifest, because that is
// the only thing tying a report file to a batch row: buildReportFileName
// turns the on-screen display name into
// "<Given><SourceSuffix>_[<MiddleInitial>_]<Family>_<date>_<time>.docx"
// (e.g. "CoraRush_W_Williams_2026-11-06_13-29-01.docx" for Cora Williams —
// note the source suffix glued onto the given name, and the optional
// middle initial). So the first token must START WITH the manifest's
// firstName rather than equal it, and the last token must equal lastName.
const REPORT_DIR = 'temp';

// Each file is retried, because a single upload is only about half
// reliable. Observed 2026-11-06, serially, with --workers=1 already in
// place: results alternated almost exactly FAIL/OK/FAIL/OK, every failure
// being "Target page, context or browser has been closed" on the REST call
// and then again on the UI fallback.
//
// Likely mechanism (not yet proven, and not fixed here): the upload kills
// and relaunches Chrome on a FIXED CDP port (9878) against one shared
// profile dir. When the previous Chrome has not finished dying, the new
// launch sees the profile in use and exits immediately, so the port still
// belongs to the old instance — connectOverCDP then attaches to a browser
// that is shutting down, and it closes mid-upload. The next iteration finds
// it properly dead and succeeds, which is exactly the alternation.
//
// The real fix belongs in sharepointUpload.ts (wait for the CDP port to be
// free, or use a per-call port), but that helper is on the critical path of
// every tests/sources/** spec, so it is deliberately not touched from this
// recovery tool. Retrying here is enough to converge: at ~50% per attempt,
// three attempts clears a file ~88% of the time, and re-running the command
// retries whatever is left.
const UPLOAD_ATTEMPTS = 3;

// Give Chrome time to actually exit before the next attempt reuses the
// profile and port — the whole failure mode is launching too soon after a
// teardown.
const SETTLE_MS = 8_000;

const REPORT_NAME = /^(.+)_(\d{4}-\d{2}-\d{2})_(\d{2}-\d{2}-\d{2})\.docx$/i;

/** The manifest entry this report belongs to, or undefined if it isn't ours. */
function matchEntry(fileName: string, entries: { firstName: string; lastName: string; sNo: number }[]) {
  const m = REPORT_NAME.exec(fileName);
  if (!m) return undefined;
  const tokens = m[1].split('_').filter(Boolean);
  if (tokens.length < 2) return undefined;
  const first = tokens[0];
  const last = tokens[tokens.length - 1];
  return entries.find(
    (e) =>
      e.firstName &&
      e.lastName &&
      first.toLowerCase().startsWith(e.firstName.toLowerCase()) &&
      last.toLowerCase() === e.lastName.toLowerCase()
  );
}

test('Upload any report .docx left in temp/ to the batch evidence folder', async () => {
  // Each upload spawns its own Chrome, may need an SSO round-trip, and
  // there can be a dozen files.
  test.setTimeout(1_800_000);

  const manifest = readBatchManifest();
  test.skip(!manifest || manifest.entries.length === 0, `No ${BATCH_MANIFEST_PATH} — nothing to match reports against.`);

  // Restricted to the rows this pipeline documents, so a report for a row a
  // teammate handled is never re-uploaded from here either.
  const documentedSNos = new Set(ROWS_TO_DOCUMENT.map((r) => r.sNo));
  const entries = manifest!.entries.filter((e) => documentedSNos.has(e.sNo));

  const dir = path.resolve(REPORT_DIR);
  const allDocx = fs.existsSync(dir) ? fs.readdirSync(dir).filter((f) => f.toLowerCase().endsWith('.docx')) : [];
  const files = allDocx
    .filter((f) => matchEntry(f, entries))
    // Oldest first, so an interrupted run resumes in a predictable order
    // rather than by whatever the filesystem returns.
    .sort((a, b) => fs.statSync(path.join(dir, a)).mtimeMs - fs.statSync(path.join(dir, b)).mtimeMs);

  const skipped = allDocx.filter((f) => !matchEntry(f, entries));
  if (skipped.length > 0) {
    console.log(
      `Ignoring ${skipped.length} .docx in ${REPORT_DIR}/ that do not belong to a documented batch identity ` +
        `(old runs, creation reports, other people's work):`
    );
    for (const f of skipped) console.log(`  - ${f}`);
    console.log('');
  }

  test.skip(
    files.length === 0,
    `No report in ${REPORT_DIR}/ matches a documented batch identity — nothing to upload.`
  );

  console.log(`Uploading ${files.length} report(s) for documented batch identities:`);
  for (const f of files) {
    const e = matchEntry(f, entries)!;
    console.log(`  ${f}  (S.No ${e.sNo})`);
  }
  console.log('');

  const failures: string[] = [];
  let uploaded = 0;

  for (const file of files) {
    const full = path.join(dir, file);
    console.log(`--- ${file} ---`);
    let lastError = '';
    let done = false;

    for (let attempt = 1; attempt <= UPLOAD_ATTEMPTS && !done; attempt++) {
      if (attempt > 1) {
        console.log(`  attempt ${attempt}/${UPLOAD_ATTEMPTS} after ${SETTLE_MS / 1000}s settle…`);
        await new Promise((r) => setTimeout(r, SETTLE_MS));
      }
      try {
        const published = await uploadFileToSharePointFolder(full, file, BATCH_EVIDENCE_FOLDER_URL);
        if (published) {
          // Same contract as run_regression_case: the local copy is
          // staging, deleted only once the file is actually in SharePoint.
          removeLocalReportCopy(full);
          uploaded++;
          done = true;
          console.log(`  uploaded and removed local copy`);
        } else {
          // Not retried: a falsy return means uploading is switched off
          // (SHAREPOINT_UPLOAD=false), which no amount of retrying changes.
          lastError = `upload skipped (SHAREPOINT_UPLOAD disabled?) — kept at ${full}`;
          console.log(`  skipped — kept locally`);
          break;
        }
      } catch (err) {
        lastError = (err as Error).message;
        console.log(`  attempt ${attempt} failed — ${lastError}`);
      }
    }

    if (!done) failures.push(`${file}: ${lastError}`);
  }

  console.log(`\n${uploaded} of ${files.length} uploaded to Evidence_Nov_11_2026.`);
  if (failures.length > 0) {
    console.log('\nStill pending (local copies kept, safe to re-run this spec):');
    for (const f of failures) console.log(`  ${f}`);
  }

  expect(failures, `${failures.length} report(s) failed to upload:\n${failures.join('\n')}`).toEqual([]);
});
