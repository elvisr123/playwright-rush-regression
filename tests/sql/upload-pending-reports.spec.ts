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
    try {
      const published = await uploadFileToSharePointFolder(full, file, BATCH_EVIDENCE_FOLDER_URL);
      if (published) {
        // Same contract as run_regression_case: the local copy is staging,
        // deleted only once the file is actually in SharePoint.
        removeLocalReportCopy(full);
        uploaded++;
        console.log(`  uploaded and removed local copy`);
      } else {
        failures.push(`${file}: upload skipped (SHAREPOINT_UPLOAD disabled?) — kept at ${full}`);
        console.log(`  skipped — kept locally`);
      }
    } catch (err) {
      failures.push(`${file}: ${(err as Error).message}`);
      console.log(`  FAILED — ${(err as Error).message}`);
    }
  }

  console.log(`\n${uploaded} of ${files.length} uploaded to Evidence_Nov_11_2026.`);
  if (failures.length > 0) {
    console.log('\nStill pending (local copies kept, safe to re-run this spec):');
    for (const f of failures) console.log(`  ${f}`);
  }

  expect(failures, `${failures.length} report(s) failed to upload:\n${failures.join('\n')}`).toEqual([]);
});
