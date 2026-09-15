import { test, expect } from '@playwright/test';
import { execFileSync } from 'child_process';
import * as fs from 'fs';
import * as path from 'path';
import { runGenerator } from '../helpers/generatorClient';
import { getStagingRow } from '../helpers/dbClient';
import { evaluateCheck } from '../helpers/expectedValueCheck';
import { buildIdentityCreationReport, CreationAttributeRow } from '../helpers/buildReport';
import { buildReportFileName } from '../helpers/sharepointUpload';
import { LifecycleState } from '../config/lifecycles';

// Creates a brand-new synthetic My_Rush_Jobs identity and INSERTs it via
// SSMS (screenshotted), then verifies every generated field actually landed
// in the DB — the first half of the identity-creation pipeline (see
// AGENTS.md / the plan this was built from). The second half (SailPoint
// source aggregation, then handing off to the existing documentation
// pipeline) is a separate, not-yet-built phase — this test stops after
// writing temp/pending_aggregation_<label>.json, the documented handoff
// point for that future step.
//
// Produces a Word report per source (temp/Creation_<source>_<stageKey>_...
// .docx, via buildIdentityCreationReport in tests/helpers/buildReport.ts):
// the full SSMS window right after the INSERT, the full SSMS window showing
// the verification SELECT, and a table of every generated field vs. what
// was actually read back from the DB.
//
// Windows-only, same precondition as ssms-my-rush-jobs.spec.ts: SSMS itself
// only runs on Windows, and must already be open and connected (see
// scripts/ssms-capture.ps1 — this never launches or logs into SSMS itself).
//
// Hand-edit these, same convention as every other spec in this repo:
const SOURCES_TO_CREATE = ['copley']; // source keys from identity-factory/user_payload.py's SOURCES — only 'copley' has a real attribute template so far.
const LIFECYCLE: LifecycleState = 'active';
const FIRST: string | undefined = undefined; // leave undefined for a random, deduped name
const LAST: string | undefined = undefined;

// Runs one query through ssms-capture.ps1 and returns the screenshot path —
// same query-via-temp-file mechanism as ssms-my-rush-jobs.spec.ts (avoids
// passing SQL text as a CLI argument, which powershell.exe -File mangles).
function runSsmsCapture(query: string, outDir: string, stageKey: string, suffix: string): string {
  const queryPath = path.join(outDir, `create_${stageKey}_${suffix}.sql`);
  const outPath = path.join(outDir, `create_${stageKey}_${suffix}.png`);
  fs.writeFileSync(queryPath, query, 'utf8');
  const psScript = path.resolve('scripts', 'ssms-capture.ps1');
  try {
    execFileSync(
      'powershell.exe',
      ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', psScript, '-QueryFile', queryPath, '-OutputPath', outPath],
      // A full My_Rush_Jobs INSERT is ~2000+ escaped characters, and
      // SendKeys types character-by-character — confirmed via a live run
      // that 60s isn't enough (it was still typing, past character 1500,
      // when the process got killed). The SELECT verification query is
      // short and finishes in seconds either way, so one generous timeout
      // covers both without needing to special-case query length.
      { stdio: 'inherit', timeout: 180_000 }
    );
  } finally {
    fs.rmSync(queryPath, { force: true });
  }
  if (!fs.existsSync(outPath)) {
    throw new Error(`Expected screenshot at ${outPath} but it wasn't created.`);
  }
  return outPath;
}

test('Create identity — INSERT + verify via SSMS', async () => {
  test.skip(process.platform !== 'win32', 'SSMS automation only runs on Windows — run this from inside the VDI.');
  // Default Playwright test timeout is 30s — nowhere near enough for a
  // multi-minute SendKeys typing session per row (see runSsmsCapture's own
  // 180s timeout, which can run twice per row: INSERT + verification SELECT).
  test.setTimeout(300_000);

  const outDir = path.resolve('temp');
  fs.mkdirSync(outDir, { recursive: true });

  console.log(`Generating identity: sources=${SOURCES_TO_CREATE.join(',')} lifecycle=${LIFECYCLE}...`);
  const generated = runGenerator(SOURCES_TO_CREATE, LIFECYCLE, { first: FIRST, last: LAST });
  console.log(`Generated: ${generated.firstName} ${generated.lastName} (${generated.rows.length} row(s))`);

  let anyFailed = false;
  const verifiedRows: { sourceKey: string; sourceName: string; stageKey: string; dbVerified: boolean }[] = [];

  // Sequential, not parallel — scripts/ssms-capture.ps1 drives one live SSMS
  // window; concurrent SendKeys streams into the same window would race.
  for (const row of generated.rows) {
    console.log(`\n--- ${row.sourceName} (${row.stageKey}) ---`);

    console.log('Running INSERT in SSMS...');
    const insertScreenshot = runSsmsCapture(row.insertSql, outDir, row.stageKey, 'insert');
    console.log(`INSERT screenshot: ${insertScreenshot}`);

    console.log('Running verification SELECT in SSMS...');
    const selectQuery = `SELECT * FROM [SOA].[dbo].[My_Rush_Jobs] WHERE Stage_Key = '${row.stageKey}';`;
    const selectScreenshot = runSsmsCapture(selectQuery, outDir, row.stageKey, 'select');
    console.log(`SELECT screenshot: ${selectScreenshot}`);

    // Structured verification: confirm every generated field actually landed
    // in the DB, via the same evaluateCheck logic already used by the
    // UI-based expectedValues checks and the standalone SQL DB-verify test
    // — "expected" here is the row we just generated, not a hand-maintained
    // list. Every field (not just failures) becomes a row in the Word
    // report's attribute table; only mismatches get logged to the console,
    // since a full row is 50+ fields and a wall of PASS lines isn't useful there.
    const dbRow = await getStagingRow('My_Rush_Jobs', row.stageKey);
    const values: Record<string, string[]> = {};
    if (dbRow) {
      for (const [column, value] of Object.entries(dbRow)) values[column] = [value];
    }

    if (!dbRow) {
      console.log(`  FAIL — no row found in My_Rush_Jobs for Stage_Key "${row.stageKey}" after INSERT`);
    }

    const attributeRows: CreationAttributeRow[] = Object.entries(row.row).map(([field, value]) => {
      const generatedValue = value === null || value === undefined ? '' : String(value);
      const dbValue = dbRow?.[field] ?? '';
      if (!generatedValue.trim()) {
        return { field, generatedValue: 'NULL', dbValue: dbValue || 'NULL', result: 'skipped' as const };
      }
      if (!dbRow) {
        return { field, generatedValue, dbValue: '(no row found)', result: 'no_row' as const };
      }
      const outcome = evaluateCheck({ field, expected: generatedValue }, values);
      if (outcome?.result !== 'PASS') {
        console.log(`  MISMATCH — ${field}: generated "${generatedValue}", My_Rush_Jobs has "${dbValue || '(not found)'}"`);
      }
      const result: CreationAttributeRow['result'] = outcome?.result === 'PASS' ? 'match' : 'mismatch';
      return { field, generatedValue, dbValue: dbValue || '(not found)', result };
    });

    const rowFailed = !dbRow || attributeRows.some((r) => r.result === 'mismatch' || r.result === 'no_row');
    if (!rowFailed) {
      console.log(`  All ${attributeRows.length} generated fields verified in My_Rush_Jobs.`);
    }

    const reportPath = path.join(outDir, `Creation_${buildReportFileName(`${row.sourceKey}_${row.stageKey}`)}`);
    await buildIdentityCreationReport(
      {
        identityName: `${generated.firstName} ${generated.lastName}`,
        stageKey: row.stageKey,
        sourceName: row.sourceName,
        lifecycle: generated.lifecycle,
      },
      insertScreenshot,
      selectScreenshot,
      attributeRows,
      reportPath
    );

    anyFailed = anyFailed || rowFailed;
    verifiedRows.push({
      sourceKey: row.sourceKey,
      sourceName: row.sourceName,
      stageKey: row.stageKey,
      dbVerified: !rowFailed,
    });
  }

  const label = `${generated.firstName}_${generated.lastName}_${generated.lifecycle}`.replace(/\s+/g, '_');
  const handoffPath = path.join(outDir, `pending_aggregation_${label}.json`);
  fs.writeFileSync(
    handoffPath,
    JSON.stringify(
      { lifecycle: generated.lifecycle, firstName: generated.firstName, lastName: generated.lastName, rows: verifiedRows },
      null,
      2
    ),
    'utf8'
  );
  console.log(`\nHandoff written: ${handoffPath}`);
  console.log('Next (not yet built): SailPoint source aggregation, then the existing documentation pipeline — see AGENTS.md.');

  expect(anyFailed, 'One or more rows failed DB verification after INSERT — see console output above.').toBe(false);
});
