import { execFileSync } from 'child_process';
import * as fs from 'fs';
import * as path from 'path';

/**
 * Runs one query in the already-open, signed-in SSMS window through
 * scripts/ssms-capture.ps1 and returns the screenshot path. Windows/VDI only.
 *
 * The query goes via a temp .sql file, not a CLI argument — powershell.exe
 * -File re-tokenizes trailing arguments and mangles SQL quotes/brackets
 * (see AGENTS.md, "SQL Server verification").
 *
 * Calls must be sequential: the script drives one live SSMS window, and two
 * at once would paste into the same editor. Each call opens a new query tab;
 * SSMS goes unresponsive once dozens accumulate, so close old tabs between
 * long runs.
 */
export function runSsmsCapture(query: string, outDir: string, stageKey: string, suffix: string): string {
  const queryPath = path.join(outDir, `create_${stageKey}_${suffix}.sql`);
  const outPath = path.join(outDir, `create_${stageKey}_${suffix}.png`);
  fs.writeFileSync(queryPath, query, 'utf8');
  const psScript = path.resolve('scripts', 'ssms-capture.ps1');
  try {
    execFileSync(
      'powershell.exe',
      ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', psScript, '-QueryFile', queryPath, '-OutputPath', outPath],
      // A full My_Rush_Jobs INSERT is ~2000+ characters; 180s covers it and
      // the short verification SELECT alike.
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

/** The verification SELECT the creation specs run (and screenshot) after an INSERT. */
export function verificationSelect(stageKey: string): string {
  return `SELECT * FROM [SOA].[dbo].[My_Rush_Jobs] WHERE Stage_Key = '${stageKey}';`;
}

// Dedicated SharePoint folder for identity-creation evidence, created by a
// teammate — a SIBLING of testplaywright_testcases under Rush_TestCases, so
// it's its own direct sharing URL rather than a subfolder name. Uploads go
// straight into it. Shared by the single- and multi-account creation specs.
export const VDI_AUTOMATION_EVIDENCE_FOLDER_URL =
  'https://netorgft1314491.sharepoint.com/:f:/s/AsbRushISC/IgCaiDn8JnZXRJHaP0WojAT4AUK0-wlDMgOshHbceu8ivy8?e=V6MMsT';
