import { test, expect } from '@playwright/test';
import * as fs from 'fs';
import * as path from 'path';
import { GeneratedIdentity, runMultiAccountGenerator } from '../helpers/generatorClient';
import {
  getStagingRow,
  findRowsByName,
  findRowsByUserId,
  runGeneratedInsert,
  canInsert,
  isDbConfigured,
} from '../helpers/dbClient';
import { evaluateCheck } from '../helpers/expectedValueCheck';
import { buildIdentityCreationReport, CreationAttributeRow } from '../helpers/buildReport';
import { buildReportFileName, uploadFileToSharePointFolder, removeLocalReportCopy } from '../helpers/sharepointUpload';
import { runSsmsCapture, verificationSelect, VDI_AUTOMATION_EVIDENCE_FOLDER_URL } from '../helpers/ssmsCapture';
import { allocateUserIds, describeUserIdPicks, isInSourceTiers, userIdMap } from '../helpers/userIdAllocator';
import { SOURCES } from '../config/sources';
import {
  MULTI_ACCOUNT_SCENARIOS,
  MULTI_ACCOUNT_MANIFEST_PATH,
  MultiAccountManifestEntry,
  MultiAccountScenario,
  MultiAccountSide,
  readMultiAccountManifest,
  writeMultiAccountManifest,
  formatMultiAccountTable,
  scenarioLabel,
} from '../config/multiAccountScenarios';

// Creates the two-account identities in tests/config/multiAccountScenarios.ts
// (the user's Source1×Lifecycle1 / Source2×Lifecycle2 table, termed and
// inactive excluded — 63 scenarios). Each scenario = ONE identity with TWO
// My_Rush_Jobs rows, one per source, each in its own lifecycle.
//
//   npx playwright test tests/sql/create-multi-account-identities.spec.ts
//   (list the pairs in IDENTITIES_TO_CREATE below; npm run multi:create is the same command)
//
// Multi-account rules enforced here (and again in generate_identity.py):
//   shared across both rows — Given_Name/Family_Name/Display_Name,
//     Birth_Date, the 12-digit number (Stage_Key digits), Correlation_Key
//     (what SailPoint correlates the two accounts on), Provider_National_ID
//   per row — the source's own template (manager, one-up, department,
//     location, job code, holds, Academic_Program/School for Ellucian…),
//     Stage_Key prefix, a free source-prefixed User_ID from the live table
//     (rush 0001xx -> 001xxx -> 01xxxx -> 1xxxxx, nerm 003xxx -> 03xxxx -> ...), and that account's own lifecycle
//     Start_Date/End_Date/Status/IIQDisabled.
// A scenario that breaks any of these is rejected BEFORE anything is INSERTed.
//
// Same conventions as create-batch-identities.spec.ts: INSERT over the mssql
// connection (no SSMS, no SQL screenshots), live-DB duplicate checks with
// regeneration on collision, manifest rewritten after every scenario so the
// run is resumable (scenarios already in the manifest are skipped), failures
// asserted at the end so one bad scenario doesn't stop the rest. No
// aggregation — aggregate the sources manually afterwards.
const TABLE = 'My_Rush_Jobs';

// ---------------------------------------------------------------------------
// EDIT HERE, then run:
//   npx playwright test tests/sql/create-multi-account-identities.spec.ts
//
// One entry = one new identity with those two accounts. List as many as you
// want created in one run (1 for a single identity, 10 for a bulk run, ...).
// The same pair listed twice creates two separate identities; running the
// spec again creates new ones again (no skipping in this mode).
//
// sourceKey: 'rush' | 'copley' | 'nerm' | 'echo' | 'ellucian'
// lifecycle: 'active' | 'prehire' | 'futurehire'
// (Ellucian is active-only, and Copley + NERM has no NERM futurehire, as in
// the scenario table — an unsupported pair fails with the list of valid ones,
// and every pair is checked before anything is created.)
const IDENTITIES_TO_CREATE: MultiAccountSide[][] = [
  [{ sourceKey: 'rush', lifecycle: 'active' }, { sourceKey: 'copley', lifecycle: 'prehire' }],
];

// true = ignore IDENTITIES_TO_CREATE and create all 63 scenarios in one go
// (resumable: scenarios already in temp/multi_account_manifest.json are skipped).
const CREATE_ALL_SCENARIOS = false;

// true = do it like create-and-insert-identity.spec.ts: run each account's
// INSERT and verification SELECT in the open, signed-in SSMS window
// (screenshotted), build a Word creation report per account (both
// screenshots + the field-by-field table) and upload it to the
// VDI_Automation_Evidence SharePoint folder. Windows/VDI only, and SSMS must
// already be open and connected. Takes a few minutes per account (2 per
// identity) and opens 2 query tabs per account — close old tabs first.
// false = fast: INSERT straight over the DB connection, no screenshots/report.
const USE_SSMS = true;
// ---------------------------------------------------------------------------

// Regenerations allowed per scenario on a name/Stage_Key/User_ID collision.
// User_IDs are picked free from the live table (userIdAllocator, walking the
// prefix tiers 0001xx -> 001xxx -> 01xxxx -> 1xxxxx), so a User_ID collision
// here only happens if someone else INSERTed the same ID in the meantime.
const MAX_GENERATION_ATTEMPTS = 15;

/** Fields that must be byte-for-byte identical on every row of one identity. */
const SHARED_FIELDS = [
  'Given_Name',
  'Family_Name',
  'Display_Name',
  'Birth_Date',
  'Correlation_Key',
  'Provider_National_ID',
] as const;

interface ScenarioFailure {
  sNo: number;
  label: string;
  reason: string;
}

/**
 * The scenario matching one IDENTITIES_TO_CREATE entry, in either order. Must
 * be one of the 63 rows in tests/config/multiAccountScenarios.ts, so a typo'd
 * source or an unsupported combination (e.g. Ellucian prehire) fails before
 * anything is generated.
 */
function scenarioForAccounts(accounts: MultiAccountSide[], index: number): MultiAccountScenario {
  const where = `IDENTITIES_TO_CREATE entry ${index + 1}`;
  if (accounts.length !== 2) {
    throw new Error(`${where} must list exactly 2 accounts, got ${accounts.length}.`);
  }
  const key = (a: MultiAccountSide) => `${a.sourceKey}:${a.lifecycle}`;
  const wanted = accounts.map(key).sort().join('+');
  const found = MULTI_ACCOUNT_SCENARIOS.find((s) => s.accounts.map(key).sort().join('+') === wanted);
  if (!found) {
    throw new Error(
      `${where} (${accounts.map(key).join(' + ')}) is not one of the multi-account scenarios. ` +
        `Valid combinations:\n` +
        MULTI_ACCOUNT_SCENARIOS.map((s) => `  ${s.accounts.map(key).join(' + ')}`).join('\n')
    );
  }
  return found;
}

function selectedScenarios(): MultiAccountScenario[] {
  if (CREATE_ALL_SCENARIOS) return MULTI_ACCOUNT_SCENARIOS;
  if (IDENTITIES_TO_CREATE.length === 0) throw new Error('IDENTITIES_TO_CREATE is empty — list at least one pair.');
  return IDENTITIES_TO_CREATE.map((accounts, i) => scenarioForAccounts(accounts, i));
}

/** Multi-account rule violations on a freshly generated identity (empty = OK). */
function ruleViolations(scenario: MultiAccountScenario, generated: GeneratedIdentity): string[] {
  const problems: string[] = [];
  const rows = generated.rows;
  if (rows.length !== scenario.accounts.length) {
    return [`expected ${scenario.accounts.length} rows, generator returned ${rows.length}`];
  }
  scenario.accounts.forEach((account, i) => {
    const r = rows[i];
    if (r.sourceKey !== account.sourceKey) problems.push(`row ${i + 1} is ${r.sourceKey}, expected ${account.sourceKey}`);
    if (r.lifecycle && r.lifecycle !== account.lifecycle) {
      problems.push(`row ${i + 1} lifecycle ${r.lifecycle}, expected ${account.lifecycle}`);
    }
    const userId = r.row['User_ID'] ?? '';
    if (!isInSourceTiers(r.sourceKey, userId)) {
      problems.push(`${r.sourceKey} User_ID "${userId}" is not 6 digits in one of that source's prefix tiers`);
    }
  });
  for (const field of SHARED_FIELDS) {
    const values = new Set(rows.map((r) => r.row[field] ?? ''));
    if (values.size !== 1) problems.push(`${field} differs across accounts: ${[...values].join(' | ')}`);
  }
  const numbers = new Set(rows.map((r) => r.stageKey.replace(/^[A-Z]+-/, '')));
  if (numbers.size !== 1) problems.push(`Stage_Key numbers differ: ${rows.map((r) => r.stageKey).join(', ')}`);
  const userIds = new Set(rows.map((r) => r.row['User_ID']));
  if (userIds.size !== rows.length) problems.push('User_ID is identical across accounts — must be per source');
  return problems;
}

/**
 * Every generated field vs. the row read back from the DB — the same rows
 * the single-account spec puts in its Word report's attribute table.
 */
function compareWithDb(generatedRow: Record<string, unknown>, dbRow: Record<string, string> | undefined): CreationAttributeRow[] {
  const values: Record<string, string[]> = {};
  for (const [column, value] of Object.entries(dbRow ?? {})) values[column] = [value];
  return Object.entries(generatedRow).map(([field, value]) => {
    const generatedValue = value === null || value === undefined ? '' : String(value);
    const dbValue = dbRow?.[field] ?? '';
    if (!generatedValue.trim()) {
      return { field, generatedValue: 'NULL', dbValue: dbValue || 'NULL', result: 'skipped' as const };
    }
    if (!dbRow) return { field, generatedValue, dbValue: '(no row found)', result: 'no_row' as const };
    const pass = evaluateCheck({ field, expected: generatedValue }, values)?.result === 'PASS';
    return { field, generatedValue, dbValue: dbValue || '(not found)', result: pass ? ('match' as const) : ('mismatch' as const) };
  });
}

async function firstCollision(generated: GeneratedIdentity): Promise<string> {
  const given = generated.rows[0].row['Given_Name'];
  const family = generated.rows[0].row['Family_Name'];
  if (given && family) {
    const matches = await findRowsByName(TABLE, given, family);
    if (matches.length > 0) {
      return `name "${given} ${family}" already in ${TABLE} (${matches.map((r) => r['Stage_Key']).join(', ')})`;
    }
  }
  for (const r of generated.rows) {
    if (await getStagingRow(TABLE, r.stageKey)) return `Stage_Key "${r.stageKey}" already in ${TABLE}`;
    const userId = r.row['User_ID'];
    if (userId) {
      const matches = await findRowsByUserId(TABLE, userId);
      if (matches.length > 0) {
        return `${r.sourceKey} User_ID "${userId}" already in ${TABLE} (${matches.map((m) => m['Stage_Key']).join(', ')})`;
      }
    }
  }
  return '';
}

test('Create multi-account identities — INSERT + DB verify', async () => {
  test.skip(
    !isDbConfigured(),
    'Needs DB_SERVER/DB_DATABASE/DB_USERNAME/DB_PASSWORD — run this from inside the VDI.'
  );
  test.skip(
    USE_SSMS && process.platform !== 'win32',
    'USE_SSMS drives the SSMS window, which only runs on Windows — run this from inside the VDI (or set USE_SSMS = false).'
  );
  const outDir = path.resolve('temp');
  fs.mkdirSync(outDir, { recursive: true });

  const scenarios = selectedScenarios();
  // SSMS: up to 2 × 180s captures per account plus an upload (which may need
  // a one-time SSO sign-in) — budget 15 min per identity.
  test.setTimeout(USE_SSMS ? Math.max(3_600_000, scenarios.length * 900_000) : 3_600_000);
  console.log(
    `${scenarios.length} multi-account scenario(s) selected — ` +
      (USE_SSMS ? 'INSERT via SSMS with screenshots + Word report per account.' : 'direct INSERT, no SSMS.')
  );
  const uploadFailures: string[] = [];

  const probe = await canInsert(TABLE, `MULTI-PROBE-${scenarios.length}`);
  console.log(`INSERT pre-flight: ${probe.verdict} — ${probe.detail}`);
  expect(probe.verdict, `The DB account cannot INSERT into ${TABLE}: ${probe.detail}`).not.toBe('denied');

  const existing = readMultiAccountManifest();
  const entries: MultiAccountManifestEntry[] = existing?.entries ? [...existing.entries] : [];
  const failures: ScenarioFailure[] = [];

  for (const scenario of scenarios) {
    const label = scenarioLabel(scenario);
    // Resume only applies to the all-scenarios run; a hand-picked pair always
    // creates a new identity, like the single-account spec.
    if (CREATE_ALL_SCENARIOS && entries.some((e) => e.sNo === scenario.sNo)) {
      console.log(`\n--- S.No ${scenario.sNo}: ${label} — already in manifest, skipping ---`);
      continue;
    }
    console.log(`\n--- S.No ${scenario.sNo}: ${label} ---`);

    let generated: GeneratedIdentity | undefined;
    let lastProblem = '';
    for (let attempt = 1; attempt <= MAX_GENERATION_ATTEMPTS; attempt++) {
      // No date / Primary_Position / manager overrides: each account takes
      // its lifecycle's defaults and its source template's manager fields.
      // Free User_IDs from the live table, one per source (tier walk:
      // 0001xx -> 001xxx -> 01xxxx -> 1xxxxx for rush, likewise for the rest).
      const picks = await allocateUserIds(TABLE, scenario.accounts.map((a) => a.sourceKey));
      console.log(`  User_IDs: ${describeUserIdPicks(picks)}`);
      const candidate = runMultiAccountGenerator(scenario.accounts, { userIds: userIdMap(picks) });
      const violations = ruleViolations(scenario, candidate);
      if (violations.length > 0) {
        // A rule violation is a code bug, not bad luck — don't retry it.
        lastProblem = `multi-account rule violation: ${violations.join('; ')}`;
        break;
      }
      const collision = await firstCollision(candidate);
      if (collision) {
        lastProblem = collision;
        console.log(`  attempt ${attempt}/${MAX_GENERATION_ATTEMPTS}: ${collision} — regenerating.`);
        continue;
      }
      generated = candidate;
      break;
    }
    if (!generated) {
      failures.push({
        sNo: scenario.sNo,
        label,
        reason: lastProblem.startsWith('multi-account rule')
          ? lastProblem
          : `no collision-free identity after ${MAX_GENERATION_ATTEMPTS} attempts — last: ${lastProblem}.`,
      });
      continue;
    }

    const shared = generated.rows[0].row;
    console.log(
      `  ${generated.firstName} ${generated.lastName} — DOB ${shared['Birth_Date']}, ` +
        `Correlation_Key ${String(shared['Correlation_Key']).slice(0, 16)}… (shared)`
    );

    // INSERT each account, then read it back. If the second INSERT fails
    // after the first succeeded, the identity is half-created — it still
    // goes into the manifest (dbVerified false) so it is visible for
    // cleanup and is not silently re-created on the next run.
    let allVerified = true;
    const accountProblems: string[] = [];
    const dbRows: Record<string, string>[] = [];
    for (const r of generated.rows) {
      console.log(
        `  ${r.sourceName} ${r.lifecycle}: ${r.stageKey}, User_ID ${r.row['User_ID']}, ` +
          `Start ${r.row['Start_Date']}, End ${r.row['End_Date']}, Status ${r.row['Status']}, ` +
          `IIQDisabled ${r.row['IIQDisabled']}, Manager ${r.row['Manager_Name']}/${r.row['Manager_Employee_ID']}, ` +
          `one-up ${r.row['OneUp_Manager_Employee_ID']}`
      );
      let insertScreenshot = '';
      let selectScreenshot = '';
      try {
        if (USE_SSMS) {
          // SSMS doesn't report SQL errors back to us — a failed INSERT shows
          // up as "no row after INSERT" below (and in the screenshot).
          console.log('  Running INSERT in SSMS...');
          insertScreenshot = runSsmsCapture(r.insertSql, outDir, r.stageKey, 'insert');
          console.log('  Running verification SELECT in SSMS...');
          selectScreenshot = runSsmsCapture(verificationSelect(r.stageKey), outDir, r.stageKey, 'select');
        } else {
          const affected = await runGeneratedInsert(TABLE, r.insertSql);
          if (affected !== 1) accountProblems.push(`${r.stageKey}: INSERT affected ${affected} rows`);
        }
      } catch (err) {
        allVerified = false;
        accountProblems.push(`${r.stageKey}: INSERT failed — ${(err as Error).message}`);
        break;
      }
      const dbRow = await getStagingRow(TABLE, r.stageKey);
      const attributeRows = compareWithDb(r.row, dbRow ?? undefined);
      if (!dbRow) {
        allVerified = false;
        accountProblems.push(`${r.stageKey}: no row after INSERT`);
      } else {
        dbRows.push(dbRow);
        for (const a of attributeRows.filter((x) => x.result === 'mismatch')) {
          allVerified = false;
          accountProblems.push(`${r.stageKey} ${a.field}: generated "${a.generatedValue}", DB "${a.dbValue}"`);
        }
      }

      if (USE_SSMS) {
        const reportPath = path.join(outDir, `Creation_${buildReportFileName(`${r.sourceKey}_${r.stageKey}`)}`);
        await buildIdentityCreationReport(
          {
            identityName: `${generated.firstName} ${generated.lastName}`,
            stageKey: r.stageKey,
            sourceName: r.sourceName,
            lifecycle: r.lifecycle ?? '',
          },
          insertScreenshot,
          selectScreenshot,
          attributeRows,
          reportPath
        );
        console.log('  Uploading creation report to SharePoint (VDI_Automation_Evidence)...');
        try {
          if (await uploadFileToSharePointFolder(reportPath, path.basename(reportPath), VDI_AUTOMATION_EVIDENCE_FOLDER_URL)) {
            removeLocalReportCopy(reportPath);
          } else {
            console.log(`  SharePoint publish skipped — report kept at ${reportPath}`);
          }
        } catch (err) {
          // Never costs the created row or the manifest; asserted at the end.
          const message = err instanceof Error ? err.message : String(err);
          console.log(`  SharePoint upload failed — report kept at ${reportPath}. (${message})`);
          uploadFailures.push(`S.No ${scenario.sNo} ${r.sourceName} (${r.stageKey}): ${message}`);
        }
      }
    }
    // Re-check the shared-field rules against what actually landed.
    if (dbRows.length === generated.rows.length) {
      for (const field of SHARED_FIELDS) {
        if (new Set(dbRows.map((d) => d[field] ?? '')).size !== 1) {
          allVerified = false;
          accountProblems.push(`${field} differs across the stored rows`);
        }
      }
    }
    if (accountProblems.length > 0) {
      for (const p of accountProblems) console.log(`  PROBLEM — ${p}`);
      failures.push({ sNo: scenario.sNo, label, reason: accountProblems.join('; ') });
    } else {
      console.log('  Both accounts verified in My_Rush_Jobs; multi-account rules hold.');
    }

    entries.push({
      sNo: scenario.sNo,
      label,
      firstName: generated.firstName,
      lastName: generated.lastName,
      correlationKey: String(shared['Correlation_Key'] ?? ''),
      birthDate: String(shared['Birth_Date'] ?? ''),
      accounts: generated.rows.map((r, i) => ({
        sourceKey: scenario.accounts[i].sourceKey,
        sourceName: SOURCES[scenario.accounts[i].sourceKey],
        lifecycle: scenario.accounts[i].lifecycle,
        stageKey: r.stageKey,
        userId: String(r.row['User_ID'] ?? ''),
      })),
      dbVerified: allVerified,
    });
    writeMultiAccountManifest({ createdAt: new Date().toISOString(), entries });
  }

  const manifestPath = writeMultiAccountManifest({ createdAt: new Date().toISOString(), entries });
  console.log(`\n${'='.repeat(78)}\nManifest: ${manifestPath} (${MULTI_ACCOUNT_MANIFEST_PATH})\n${'='.repeat(78)}`);
  console.log(formatMultiAccountTable(entries));
  const sourcesToAggregate = [...new Set(entries.flatMap((e) => e.accounts.map((a) => a.sourceName)))];
  console.log(
    `\nNEXT — aggregate manually in the sandbox (Admin > Sources > [source] > Import/Aggregate):\n` +
      sourcesToAggregate.map((s) => `  - ${s}`).join('\n') +
      `\nThen check each identity shows BOTH accounts correlated on one identity cube.`
  );

  expect(
    failures,
    `${failures.length} scenario(s) did not come out clean:\n` +
      failures.map((f) => `  S.No ${f.sNo} ${f.label}: ${f.reason}`).join('\n')
  ).toEqual([]);
  expect(
    uploadFailures,
    `${uploadFailures.length} creation report(s) were not uploaded — the identities are fine, ` +
      `the .docx files are still in temp/ for a manual upload:\n` +
      uploadFailures.map((f) => `  ${f}`).join('\n')
  ).toEqual([]);
});
