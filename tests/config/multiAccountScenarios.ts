import * as fs from 'fs';
import * as path from 'path';
import { SourceKey, SOURCES } from './sources';

/**
 * Two-account creation matrix: the user's full 205-row Source1×Lifecycle1 /
 * Source2×Lifecycle2 table. sNo is the row number in that table.
 *
 * Each scenario is ONE identity with TWO My_Rush_Jobs rows:
 *   shared  — name, Birth_Date, 12-digit number, Correlation_Key
 *   per row — source template (manager/dept/location/…), Stage_Key prefix,
 *             source-prefixed User_ID, and that account's own lifecycle
 *             dates/Status/IIQDisabled
 *
 * Termed / inactive (2026-11-16, user-requested): "rest of the scenarios with
 * inactive or termed LC state in them should be created as active and then I
 * will update the LC to termed/inactive respectively". So a termed or
 * inactive account is GENERATED as active (createAs()) and the user changes
 * its lifecycle by hand afterwards; the scenario keeps the table's lifecycle
 * so the manifest and the console say which account needs that change.
 *
 * The 63 scenarios with no termed/inactive account were created first
 * (2026-11-13); the other 142 are TERMED_INACTIVE_SCENARIOS.
 */
export const MULTI_ACCOUNT_LIFECYCLES = ['active', 'prehire', 'futurehire', 'termed', 'inactive'] as const;
export type MultiAccountLifecycle = (typeof MULTI_ACCOUNT_LIFECYCLES)[number];
/** What the generator actually creates — never termed/inactive. */
export type CreatedLifecycle = 'active' | 'prehire' | 'futurehire';

/** Lifecycles the user sets by hand after creation; the account is created active. */
export const MANUAL_LIFECYCLES: readonly MultiAccountLifecycle[] = ['termed', 'inactive'];

export function createAs(lifecycle: MultiAccountLifecycle): CreatedLifecycle {
  return lifecycle === 'termed' || lifecycle === 'inactive' ? 'active' : lifecycle;
}

export function needsManualUpdate(lifecycle: MultiAccountLifecycle): boolean {
  return MANUAL_LIFECYCLES.includes(lifecycle);
}

export interface MultiAccountSide {
  sourceKey: SourceKey;
  /** The table's lifecycle. termed/inactive are created as active — see createAs(). */
  lifecycle: MultiAccountLifecycle;
}

export interface MultiAccountScenario {
  /** Row number in the user's 205-row table. */
  sNo: number;
  accounts: [MultiAccountSide, MultiAccountSide];
}

// The table is ten source-pair blocks in this order. Within a block, Source 1
// runs active, prehire, futurehire, termed, inactive and Source 2 runs through
// its own list inside each. Ellucian only has active/termed/inactive, and
// Copley × NERM has no NERM futurehire — both exactly as in the table, which
// is how the blocks come to 25/15/20 rows.
const ALL = ['active', 'prehire', 'futurehire', 'termed', 'inactive'] as const;
const ELLUCIAN = ['active', 'termed', 'inactive'] as const;
const NERM_WITH_COPLEY = ['active', 'prehire', 'termed', 'inactive'] as const;

const BLOCKS: [SourceKey, SourceKey, readonly MultiAccountLifecycle[]][] = [
  ['rush', 'copley', ALL], // 1–25
  ['rush', 'nerm', ALL], // 26–50
  ['rush', 'echo', ALL], // 51–75
  ['rush', 'ellucian', ELLUCIAN], // 76–90
  ['copley', 'nerm', NERM_WITH_COPLEY], // 91–110
  ['copley', 'echo', ALL], // 111–135
  ['copley', 'ellucian', ELLUCIAN], // 136–150
  ['nerm', 'echo', ALL], // 151–175
  ['nerm', 'ellucian', ELLUCIAN], // 176–190
  ['echo', 'ellucian', ELLUCIAN], // 191–205
];

function buildScenarios(): MultiAccountScenario[] {
  const out: MultiAccountScenario[] = [];
  for (const [source1, source2, lifecycles2] of BLOCKS) {
    for (const lifecycle1 of ALL) {
      for (const lifecycle2 of lifecycles2) {
        out.push({
          sNo: out.length + 1,
          accounts: [
            { sourceKey: source1, lifecycle: lifecycle1 },
            { sourceKey: source2, lifecycle: lifecycle2 },
          ],
        });
      }
    }
  }
  if (out.length !== 205) throw new Error(`multi-account table built ${out.length} rows, expected 205`);
  return out;
}

/** All 205 rows of the table. */
export const MULTI_ACCOUNT_SCENARIOS: MultiAccountScenario[] = buildScenarios();

/** The 142 rows with a termed or inactive account (created as active, updated by hand). */
export const TERMED_INACTIVE_SCENARIOS: MultiAccountScenario[] = MULTI_ACCOUNT_SCENARIOS.filter((s) =>
  s.accounts.some((a) => needsManualUpdate(a.lifecycle))
);

export function scenarioLabel(scenario: MultiAccountScenario): string {
  const side = (a: MultiAccountSide) =>
    `${SOURCES[a.sourceKey]} ${a.lifecycle}` + (needsManualUpdate(a.lifecycle) ? ' (created active)' : '');
  return scenario.accounts.map(side).join(' + ');
}

export function findMultiAccountScenario(sNo: number): MultiAccountScenario {
  const found = MULTI_ACCOUNT_SCENARIOS.find((row) => row.sNo === sNo);
  if (!found) throw new Error(`No multi-account scenario with sNo ${sNo} (valid: 1–205).`);
  return found;
}

export interface MultiAccountManifestAccount {
  sourceKey: SourceKey;
  sourceName: string;
  /** The table's lifecycle — what this account should end up as. */
  lifecycle: MultiAccountLifecycle;
  /** What was actually INSERTed; differs from lifecycle for termed/inactive. Absent on older entries. */
  createdAs?: CreatedLifecycle;
  stageKey: string;
  userId: string;
}

export interface MultiAccountManifestEntry {
  sNo: number;
  label: string;
  firstName: string;
  lastName: string;
  correlationKey: string;
  birthDate: string;
  accounts: MultiAccountManifestAccount[];
  dbVerified: boolean;
}

export interface MultiAccountManifest {
  createdAt: string;
  entries: MultiAccountManifestEntry[];
}

export const MULTI_ACCOUNT_MANIFEST_PATH = path.join('temp', 'multi_account_manifest.json');

export function readMultiAccountManifest(): MultiAccountManifest | undefined {
  const resolved = path.resolve(MULTI_ACCOUNT_MANIFEST_PATH);
  if (!fs.existsSync(resolved)) return undefined;
  try {
    return JSON.parse(fs.readFileSync(resolved, 'utf8')) as MultiAccountManifest;
  } catch (err) {
    console.log(`Could not parse ${MULTI_ACCOUNT_MANIFEST_PATH} — ignoring it. (${(err as Error).message})`);
    return undefined;
  }
}

export function writeMultiAccountManifest(manifest: MultiAccountManifest): string {
  const resolved = path.resolve(MULTI_ACCOUNT_MANIFEST_PATH);
  fs.mkdirSync(path.dirname(resolved), { recursive: true });
  fs.writeFileSync(resolved, JSON.stringify(manifest, null, 2));
  return resolved;
}

/** Table of the given scenarios (default: all 205) with their Stage_Keys from the manifest. */
export function formatMultiAccountTable(
  entries: MultiAccountManifestEntry[],
  scenarios: MultiAccountScenario[] = MULTI_ACCOUNT_SCENARIOS
): string {
  const bySNo = new Map(entries.map((e) => [e.sNo, e]));
  const lines = [
    'sNo   Source 1                        L1           Source 2                        L2           Stage Keys',
    '----  ------------------------------  -----------  ------------------------------  -----------  --------------------------------',
  ];
  for (const scenario of scenarios) {
    const [a, b] = scenario.accounts;
    const entry = bySNo.get(scenario.sNo);
    const keys = entry
      ? entry.accounts.map((acc) => acc.stageKey).join(' / ') + (entry.dbVerified ? '' : '  (NOT DB-VERIFIED)')
      : '(not created)';
    lines.push(
      `${String(scenario.sNo).padEnd(4)}  ${SOURCES[a.sourceKey].padEnd(30)}  ${a.lifecycle.padEnd(11)}  ` +
        `${SOURCES[b.sourceKey].padEnd(30)}  ${b.lifecycle.padEnd(11)}  ${keys}`
    );
  }
  return lines.join('\n');
}
