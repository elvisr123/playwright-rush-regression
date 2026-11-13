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
import { SOURCES } from '../config/sources';
import {
  MULTI_ACCOUNT_SCENARIOS,
  MULTI_ACCOUNT_MANIFEST_PATH,
  MultiAccountManifestEntry,
  MultiAccountScenario,
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
//   npm run multi:create                              # all 63
//   $env:MULTI_ACCOUNT_SNOS='1,2,3'; npm run multi:create   # a subset (PowerShell)
//
// Multi-account rules enforced here (and again in generate_identity.py):
//   shared across both rows — Given_Name/Family_Name/Display_Name,
//     Birth_Date, the 12-digit number (Stage_Key digits), Correlation_Key
//     (what SailPoint correlates the two accounts on), Provider_National_ID
//   per row — the source's own template (manager, one-up, department,
//     location, job code, holds, Academic_Program/School for Ellucian…),
//     Stage_Key prefix, source-prefixed User_ID (0001 rush, 0002 copley,
//     003 nerm, 004 echo, 005 ellucian), and that account's own lifecycle
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

// Higher than the batch spec's 6: rush appears in 30 of these scenarios and
// copley in 27, and each of those sources has only 100 possible User_IDs
// (4-digit prefix + 2 random digits) across the project's whole history. A
// collision is expected here; running out of attempts means the space is
// nearly exhausted (see the failure message).
const MAX_GENERATION_ATTEMPTS = 15;

const USER_ID_PREFIX: Record<string, string> = {
  rush: '0001',
  copley: '0002',
  nerm: '003',
  echo: '004',
  ellucian: '005',
  workday: '006',
};

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

function selectedScenarios(): MultiAccountScenario[] {
  const raw = process.env.MULTI_ACCOUNT_SNOS?.trim();
  if (!raw) return MULTI_ACCOUNT_SCENARIOS;
  const wanted = raw.split(',').map((v) => Number(v.trim())).filter((n) => Number.isInteger(n));
  const unknown = wanted.filter((n) => !MULTI_ACCOUNT_SCENARIOS.some((s) => s.sNo === n));
  if (unknown.length > 0) {
    throw new Error(
      `MULTI_ACCOUNT_SNOS contains ${unknown.join(', ')}, which are not scenarios (termed/inactive rows were ` +
        `excluded). Valid: ${MULTI_ACCOUNT_SCENARIOS.map((s) => s.sNo).join(', ')}`
    );
  }
  return MULTI_ACCOUNT_SCENARIOS.filter((s) => wanted.includes(s.sNo));
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
    const prefix = USER_ID_PREFIX[r.sourceKey];
    if (!/^\d{6}$/.test(userId) || (prefix && !userId.startsWith(prefix))) {
      problems.push(`${r.sourceKey} User_ID "${userId}" is not 6 digits starting with ${prefix}`);
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

test('Create multi-account identities — INSERT + DB verify, no SSMS', async () => {
  test.skip(
    !isDbConfigured(),
    'Needs DB_SERVER/DB_DATABASE/DB_USERNAME/DB_PASSWORD — run this from inside the VDI.'
  );
  test.setTimeout(3_600_000);
  fs.mkdirSync(path.resolve('temp'), { recursive: true });

  const scenarios = selectedScenarios();
  console.log(`${scenarios.length} multi-account scenario(s) selected.`);

  const probe = await canInsert(TABLE, `MULTI-PROBE-${scenarios.length}`);
  console.log(`INSERT pre-flight: ${probe.verdict} — ${probe.detail}`);
  expect(probe.verdict, `The DB account cannot INSERT into ${TABLE}: ${probe.detail}`).not.toBe('denied');

  const existing = readMultiAccountManifest();
  const entries: MultiAccountManifestEntry[] = existing?.entries ? [...existing.entries] : [];
  const failures: ScenarioFailure[] = [];

  for (const scenario of scenarios) {
    const label = scenarioLabel(scenario);
    if (entries.some((e) => e.sNo === scenario.sNo)) {
      console.log(`\n--- S.No ${scenario.sNo}: ${label} — already in manifest, skipping ---`);
      continue;
    }
    console.log(`\n--- S.No ${scenario.sNo}: ${label} ---`);

    let generated: GeneratedIdentity | undefined;
    let lastProblem = '';
    for (let attempt = 1; attempt <= MAX_GENERATION_ATTEMPTS; attempt++) {
      // No date / Primary_Position / manager overrides: each account takes
      // its lifecycle's defaults and its source template's manager fields.
      const candidate = runMultiAccountGenerator(scenario.accounts);
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
          : `no collision-free identity after ${MAX_GENERATION_ATTEMPTS} attempts — last: ${lastProblem}. ` +
            `If this is a rush/copley User_ID, that source's 100-value ID space is nearly exhausted.`,
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
      try {
        const affected = await runGeneratedInsert(TABLE, r.insertSql);
        if (affected !== 1) accountProblems.push(`${r.stageKey}: INSERT affected ${affected} rows`);
      } catch (err) {
        allVerified = false;
        accountProblems.push(`${r.stageKey}: INSERT failed — ${(err as Error).message}`);
        break;
      }
      const dbRow = await getStagingRow(TABLE, r.stageKey);
      if (!dbRow) {
        allVerified = false;
        accountProblems.push(`${r.stageKey}: no row after INSERT`);
        continue;
      }
      dbRows.push(dbRow);
      const values: Record<string, string[]> = {};
      for (const [column, value] of Object.entries(dbRow)) values[column] = [value];
      for (const [field, value] of Object.entries(r.row)) {
        const expected = value === null || value === undefined ? '' : String(value);
        if (!expected.trim()) continue;
        if (evaluateCheck({ field, expected }, values)?.result !== 'PASS') {
          allVerified = false;
          accountProblems.push(`${r.stageKey} ${field}: generated "${expected}", DB "${dbRow[field] ?? '(missing)'}"`);
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
});
