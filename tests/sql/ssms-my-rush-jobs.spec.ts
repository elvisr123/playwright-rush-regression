import { test } from '@playwright/test';
import { execFileSync } from 'child_process';
import * as fs from 'fs';
import * as path from 'path';

// Screenshots the live SSMS window running this exact query, against an
// already-open, already-connected SSMS session (see scripts/ssms-capture.ps1
// for why — VDI sessions here persist SSMS across reconnects, so no
// launch/login step is attempted).
//
// Windows-only: SSMS itself only runs on Windows, so this must run from
// inside the VDI, not from this Mac. Override the query or stage key via
// SQL_QUERY / STAGE_KEY env vars without editing this file.
const STAGE_KEY = process.env.STAGE_KEY?.trim() || 'NE-19825552TEST000PDPPL';
const QUERY =
  process.env.SQL_QUERY?.trim() ||
  `SELECT * FROM [SOA].[dbo].[My_Rush_Jobs] WHERE Stage_Key = '${STAGE_KEY}';`;

test('SSMS — screenshot My_Rush_Jobs record', async () => {
  test.skip(process.platform !== 'win32', 'SSMS automation only runs on Windows — run this from inside the VDI.');

  const outDir = path.resolve('temp');
  fs.mkdirSync(outDir, { recursive: true });
  const outPath = path.join(outDir, `My_Rush_Jobs_${STAGE_KEY}_${Date.now()}.png`);
  const psScript = path.resolve('scripts', 'ssms-capture.ps1');

  console.log(`Running query against My_Rush_Jobs (Stage_Key = ${STAGE_KEY})...`);
  execFileSync(
    'powershell.exe',
    ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', psScript, '-Query', QUERY, '-OutputPath', outPath],
    { stdio: 'inherit', timeout: 60_000 }
  );

  if (!fs.existsSync(outPath)) {
    throw new Error(`Expected screenshot at ${outPath} but it wasn't created.`);
  }
  console.log(`Screenshot saved: ${outPath}`);
});
