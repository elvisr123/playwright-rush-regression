import { test, expect } from '@playwright/test';
import * as fs from 'fs';
import * as path from 'path';
import { uploadFileToSharePointFolder, removeLocalReportCopy } from '../helpers/sharepointUpload';

// Uploads the multi-account evidence reports sitting in temp/ to the
// Lifecycle_State folder, one at a time.
//
//   npm run lifecycle:upload-reports
//
// Companion to upload-pending-reports.spec.ts, for the other evidence
// pipeline: tests/sources/multi-account/document.spec.ts names its report
// Lifecycle_State_<No.>.docx and keeps the local copy whenever publishing
// doesn't happen, so a walkthrough that succeeded and only failed to upload
// leaves a finished file on disk. Re-running the walkthrough to rebuild an
// identical file is pure waste.
//
// Hit live on 2026-11-16: scenarios 42 and 43 captured cleanly, built their
// reports, then hung inside the upload right after "reusing the saved
// Chrome sign-in" until the spec's own 600s test timeout killed them —
// 10 minutes each, with 8 Chrome processes left wedged on the shared upload
// profile. The documented alternative is to run the remaining walkthroughs
// with SHAREPOINT_UPLOAD=false and push everything up from here afterwards.
//
// SERIAL BY CONSTRUCTION. Every upload drives the one shared Chrome profile
// (playwright/.auth/chrome-sharepoint) and begins by killing whatever else
// is using it, so two concurrent uploads kill each other. Do not parallelize.
//
// Unlike the batch uploader, matching needs no manifest: the file name
// pattern is specific to this pipeline, so there is no risk of sweeping up
// months of unrelated reports from temp/.
const REPORT_DIR = 'temp';
const REPORT_NAME = /^Lifecycle_State_\d+\.docx$/i;

const UPLOAD_ATTEMPTS = 3;

// Give Chrome time to actually exit before the next attempt reuses the
// profile and the fixed CDP port — launching too soon after a teardown is
// the whole failure mode.
const SETTLE_MS = 8_000;

// A wedged upload doesn't fail, it stops responding — so retries alone
// don't help: the first hang eats the entire test. Bound each attempt so a
// hang costs one attempt instead of the whole run.
const ATTEMPT_TIMEOUT_MS = 180_000;

const FOLDER_URL =
  process.env.SHAREPOINT_FOLDER_URL?.trim() ||
  'https://netorgft1314491.sharepoint.com/sites/AsbRushISC/Shared%20Documents/Forms/AllItems.aspx?id=%2Fsites%2FAsbRushISC%2FShared%20Documents%2FASB%2FRush%5FTestCases%2FEnhancement%5FNov%5F18%5F2026%2FEvidence%5FNov%5F18%2FLifecycle%5FState';

function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`upload did not finish within ${ms / 1000}s`)), ms);
    promise.then(
      (value) => { clearTimeout(timer); resolve(value); },
      (err) => { clearTimeout(timer); reject(err); }
    );
  });
}

test('Upload Lifecycle_State report .docx files left in temp/', async () => {
  // Each upload spawns its own Chrome, may need an SSO round-trip, and
  // there can be a dozen files.
  test.setTimeout(1_800_000);

  const dir = path.resolve(REPORT_DIR);
  const files = (fs.existsSync(dir) ? fs.readdirSync(dir) : [])
    .filter((f) => REPORT_NAME.test(f))
    // Oldest first, so an interrupted run resumes in a predictable order.
    .sort((a, b) => fs.statSync(path.join(dir, a)).mtimeMs - fs.statSync(path.join(dir, b)).mtimeMs);

  test.skip(files.length === 0, `No Lifecycle_State_*.docx in ${REPORT_DIR}/ — nothing to upload.`);

  console.log(`Uploading ${files.length} report(s) to Lifecycle_State:`);
  for (const f of files) console.log(`  ${f}`);
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
        const published = await withTimeout(
          uploadFileToSharePointFolder(full, file, FOLDER_URL),
          ATTEMPT_TIMEOUT_MS
        );
        if (published) {
          // The local copy is staging, deleted only once the file is
          // actually in SharePoint.
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

  console.log(`\n${uploaded} of ${files.length} uploaded to Lifecycle_State.`);
  if (failures.length > 0) {
    console.log('\nStill pending (local copies kept, safe to re-run this spec):');
    for (const f of failures) console.log(`  ${f}`);
  }

  expect(failures, `${failures.length} report(s) failed to upload:\n${failures.join('\n')}`).toEqual([]);
});
