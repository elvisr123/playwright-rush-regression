import { test, expect } from '@playwright/test';
import { execFileSync } from 'child_process';
import * as fs from 'fs';
import * as path from 'path';
import { getStagingRow } from '../helpers/dbClient';
import { evaluateCheck, formatCheckResult } from '../helpers/expectedValueCheck';
import { ExpectedValueCheck } from '../config/testcases';

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

// Hand-edit this to assert specific My_Rush_Jobs column values for the
// Stage_Key above — same expectedValues pattern as
// tests/sources/*/*.spec.ts (field/expected/matchType). Field names here are
// the actual My_Rush_Jobs column names (underscore-separated), not the UI
// labels used elsewhere. Leave empty to skip this check and only capture the
// SSMS screenshot.
const EXPECTED_VALUES: ExpectedValueCheck[] = [
  // { field: 'Source_Name', expected: 'Non-Employee Workforce' },
  // { field: 'Status', expected: 'Enabled' },
];

test('SSMS — screenshot My_Rush_Jobs record', async () => {
  test.skip(process.platform !== 'win32', 'SSMS automation only runs on Windows — run this from inside the VDI.');

  const outDir = path.resolve('temp');
  fs.mkdirSync(outDir, { recursive: true });
  const outPath = path.join(outDir, `My_Rush_Jobs_${STAGE_KEY}_${Date.now()}.png`);
  const psScript = path.resolve('scripts', 'ssms-capture.ps1');

  // Write the query to a file rather than passing it as a CLI argument —
  // powershell.exe's -File mode re-tokenizes the trailing argument list
  // using PowerShell's own quoting/statement-separator rules, so a query
  // containing single quotes, semicolons, or brackets gets mangled (splits
  // on the semicolon as if it were a new statement) even when it arrives as
  // one properly-escaped argv entry from Node.
  const queryPath = path.join(outDir, `My_Rush_Jobs_${STAGE_KEY}_${Date.now()}.sql`);
  fs.writeFileSync(queryPath, QUERY, 'utf8');

  console.log(`Running query against My_Rush_Jobs (Stage_Key = ${STAGE_KEY})...`);
  try {
    execFileSync(
      'powershell.exe',
      ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', psScript, '-QueryFile', queryPath, '-OutputPath', outPath],
      { stdio: 'inherit', timeout: 60_000 }
    );
  } finally {
    fs.rmSync(queryPath, { force: true });
  }

  if (!fs.existsSync(outPath)) {
    throw new Error(`Expected screenshot at ${outPath} but it wasn't created.`);
  }
  console.log(`Screenshot saved: ${outPath}`);
});

// Confirms specific My_Rush_Jobs column values match EXPECTED_VALUES above,
// via a direct mssql connection (tests/helpers/dbClient.ts) rather than the
// SSMS screenshot — a screenshot is visual evidence only and can't be
// asserted against in code. Uses the same evaluateCheck/formatCheckResult
// logic as the UI-based expectedValues checks in run_regression_case.ts, so
// PASS/FAIL/NOT FOUND semantics (exact vs. contains, case-insensitive) match
// exactly. Requires DB_SERVER / DB_DATABASE / DB_USERNAME / DB_PASSWORD in
// .env — only reachable from inside the VDI (see AGENTS.md).
test('DB — verify My_Rush_Jobs attributes', async () => {
  test.skip(EXPECTED_VALUES.length === 0, 'Set EXPECTED_VALUES at the top of this file to assert specific field values.');

  const row = await getStagingRow('My_Rush_Jobs', STAGE_KEY);
  const values: Record<string, string[]> = {};
  if (row) {
    for (const [column, value] of Object.entries(row)) values[column] = [value];
  }

  console.log(`My_Rush_Jobs attribute checks (Stage_Key = ${STAGE_KEY}):`);
  let anyFailed = false;
  for (const check of EXPECTED_VALUES) {
    const outcome = evaluateCheck(check, values);
    const line = formatCheckResult(check, outcome);
    console.log(`  ${line}`);
    if (!outcome || outcome.result === 'FAIL') anyFailed = true;
  }

  expect(anyFailed, 'One or more My_Rush_Jobs attribute checks failed — see console output above.').toBe(false);
});
