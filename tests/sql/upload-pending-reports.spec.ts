import { test, expect } from '@playwright/test';
import * as fs from 'fs';
import * as path from 'path';
import { uploadFileToSharePointFolder, removeLocalReportCopy } from '../helpers/sharepointUpload';
import { BATCH_EVIDENCE_FOLDER_URL } from '../config/batch';

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
const REPORT_DIR = 'temp';

test('Upload any report .docx left in temp/ to the batch evidence folder', async () => {
  // Each upload spawns its own Chrome, may need an SSO round-trip, and
  // there can be a dozen files.
  test.setTimeout(1_800_000);

  const dir = path.resolve(REPORT_DIR);
  const files = fs.existsSync(dir)
    ? fs
        .readdirSync(dir)
        .filter((f) => f.toLowerCase().endsWith('.docx'))
        // Oldest first, so an interrupted run resumes in a predictable
        // order rather than by whatever the filesystem returns.
        .sort((a, b) => fs.statSync(path.join(dir, a)).mtimeMs - fs.statSync(path.join(dir, b)).mtimeMs)
    : [];

  test.skip(files.length === 0, `No .docx files in ${REPORT_DIR}/ — nothing to upload.`);

  console.log(`Found ${files.length} report(s) in ${REPORT_DIR}/:`);
  for (const f of files) console.log(`  ${f}`);
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
