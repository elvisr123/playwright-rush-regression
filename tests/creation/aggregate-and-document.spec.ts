import { test } from '@playwright/test';
import * as fs from 'fs';
import * as path from 'path';
import { runRegressionCase } from '../helpers/run_regression_case';
import { TestCase } from '../config/testcases';
import { LifecycleState } from '../config/lifecycles';
import { CreationEvidenceEntry, CreationAttributeRow } from '../helpers/buildReport';

// Run this AFTER: (1) tests/sql/create-and-insert-identity.spec.ts created an
// identity and wrote temp/pending_aggregation_<label>.json, and (2) you've
// manually run source aggregation in the SailPoint sandbox (Admin > Sources
// > [source] > Import/Aggregate) for every source in that identity — no
// aggregation automation is attempted here.
//
// Produces ONE combined Word report: the SQL creation evidence (INSERT/
// SELECT screenshots + attribute table, from the handoff JSON) prepended to
// the full sandbox documentation walkthrough (Account Search, Process
// Identity, Identity Details, Roles/Entitlements, Accounts, per-source
// Account Detail) — via runRegressionCase()'s new optional
// creationEvidenceEntries parameter (tests/helpers/run_regression_case.ts),
// which is otherwise completely unchanged from every tests/sources/**
// spec's usage.
//
// Hand-edit this, same convention as every other spec in this repo — set it
// to the label create-and-insert-identity.spec.ts printed (e.g.
// "Anthony_Gibson_futurehire"), matching the pending_aggregation_<label>.json
// filename it wrote.
const LABEL = 'PASTE_LABEL_HERE';

// New, dedicated SharePoint folder for combined creation+documentation
// reports — separate from both the main documentation pipeline's per-source
// folders and the creation-only VDI_Automation_Evidence folder.
const COMBINED_REPORT_FOLDER_URL =
  'https://netorgft1314491.sharepoint.com/sites/AsbRushISC/Shared%20Documents/Forms/AllItems.aspx?id=%2Fsites%2FAsbRushISC%2FShared%20Documents%2FASB%2FRush%5FTestCases%2FVDI%5Fplaywright%5Fcombined%5Fdoc&viewid=bf9387e7%2D2afb%2D4447%2D9521%2Dd0be1432113c';

interface PendingAggregationRow {
  sourceKey: string;
  sourceName: string;
  stageKey: string;
  dbVerified: boolean;
  insertScreenshotPath: string;
  selectScreenshotPath: string;
  attributeRows: CreationAttributeRow[];
}

interface PendingAggregation {
  lifecycle: LifecycleState;
  firstName: string;
  lastName: string;
  rows: PendingAggregationRow[];
}

test('Document a created identity — combined creation + sandbox report', async ({ page }) => {
  const handoffPath = path.resolve('temp', `pending_aggregation_${LABEL}.json`);
  test.skip(
    LABEL === 'PASTE_LABEL_HERE' || !fs.existsSync(handoffPath),
    `Set LABEL at the top of this file to a real pending_aggregation_<label>.json (looked for ${handoffPath}).`
  );
  // Same reasoning as create-and-insert-identity.spec.ts: the full search ->
  // process identity -> details -> roles/entitlements -> accounts ->
  // account-detail flow, plus a SharePoint upload that may need a one-time
  // manual SSO sign-in, needs more than Playwright's 30s default.
  test.setTimeout(600_000);

  const pending: PendingAggregation = JSON.parse(fs.readFileSync(handoffPath, 'utf8'));

  const unverified = pending.rows.filter((r) => !r.dbVerified);
  if (unverified.length > 0) {
    console.log(
      `Warning: ${unverified.length} row(s) were not DB-verified during creation — ${unverified
        .map((r) => `${r.sourceName} (${r.stageKey})`)
        .join(', ')}. Documenting anyway, but double-check those accounts.`
    );
  }

  const testCase: TestCase = {
    scenarioName: `${pending.firstName}_${pending.lastName}_${pending.lifecycle}`.replace(/\s+/g, '_'),
    lifecycle: pending.lifecycle,
    sources: pending.rows.map((r) => ({ name: r.sourceName, stageKey: r.stageKey })),
  };

  const creationEvidenceEntries: CreationEvidenceEntry[] = pending.rows.map((r) => ({
    sourceName: r.sourceName,
    stageKey: r.stageKey,
    insertScreenshotPath: r.insertScreenshotPath,
    selectScreenshotPath: r.selectScreenshotPath,
    attributeRows: r.attributeRows,
  }));

  console.log(
    `Documenting ${pending.firstName} ${pending.lastName} — ${testCase.sources.map((s) => s.name).join(', ')} ` +
      `(assumes aggregation already ran manually in the sandbox for every source above).`
  );

  await runRegressionCase(page, testCase, creationEvidenceEntries, COMBINED_REPORT_FOLDER_URL);
});
