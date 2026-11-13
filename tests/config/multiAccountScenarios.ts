import * as fs from 'fs';
import * as path from 'path';
import { SourceKey, SOURCES } from './sources';

/**
 * Two-account creation matrix from the user's Source1×Lifecycle1 /
 * Source2×Lifecycle2 table, with termed and inactive dropped.
 *
 * sNo matches the original table so a row here can be traced back. Pairings
 * that only existed as termed/inactive combinations are absent (no
 * renumbering). Ellucian has no prehire/futurehire rows in that table, and
 * Copley×NERM has no NERM futurehire rows — those gaps are kept.
 *
 * Each scenario is ONE identity with TWO My_Rush_Jobs rows:
 *   shared  — name, Birth_Date, 12-digit number, Correlation_Key
 *   per row — source template (manager/dept/location/…), Stage_Key prefix,
 *             source-prefixed User_ID, and that account's own lifecycle
 *             dates/Status/IIQDisabled
 *
 * Correlation_Key is what SailPoint joins the two accounts on. User_ID is
 * deliberately different per source (see source_user_id() in
 * identity-factory/user_payload.py).
 */
export const MULTI_ACCOUNT_LIFECYCLES = ['active', 'prehire', 'futurehire'] as const;
export type MultiAccountLifecycle = (typeof MULTI_ACCOUNT_LIFECYCLES)[number];

export interface MultiAccountSide {
  sourceKey: SourceKey;
  lifecycle: MultiAccountLifecycle;
}

export interface MultiAccountScenario {
  /** Original table row number (gaps are termed/inactive that were excluded). */
  sNo: number;
  accounts: [MultiAccountSide, MultiAccountSide];
}

function s(
  sNo: number,
  source1: SourceKey,
  lifecycle1: MultiAccountLifecycle,
  source2: SourceKey,
  lifecycle2: MultiAccountLifecycle
): MultiAccountScenario {
  return {
    sNo,
    accounts: [
      { sourceKey: source1, lifecycle: lifecycle1 },
      { sourceKey: source2, lifecycle: lifecycle2 },
    ],
  };
}

export const MULTI_ACCOUNT_SCENARIOS: MultiAccountScenario[] = [
  // Rush Lawson × Copley Lawson (original 1–25)
  s(1, 'rush', 'active', 'copley', 'active'),
  s(2, 'rush', 'active', 'copley', 'prehire'),
  s(3, 'rush', 'active', 'copley', 'futurehire'),
  s(6, 'rush', 'prehire', 'copley', 'active'),
  s(7, 'rush', 'prehire', 'copley', 'prehire'),
  s(8, 'rush', 'prehire', 'copley', 'futurehire'),
  s(11, 'rush', 'futurehire', 'copley', 'active'),
  s(12, 'rush', 'futurehire', 'copley', 'prehire'),
  s(13, 'rush', 'futurehire', 'copley', 'futurehire'),

  // Rush Lawson × Non-Employee Workforce (original 26–50)
  s(26, 'rush', 'active', 'nerm', 'active'),
  s(27, 'rush', 'active', 'nerm', 'prehire'),
  s(28, 'rush', 'active', 'nerm', 'futurehire'),
  s(31, 'rush', 'prehire', 'nerm', 'active'),
  s(32, 'rush', 'prehire', 'nerm', 'prehire'),
  s(33, 'rush', 'prehire', 'nerm', 'futurehire'),
  s(36, 'rush', 'futurehire', 'nerm', 'active'),
  s(37, 'rush', 'futurehire', 'nerm', 'prehire'),
  s(38, 'rush', 'futurehire', 'nerm', 'futurehire'),

  // Rush Lawson × ECHO (original 51–75)
  s(51, 'rush', 'active', 'echo', 'active'),
  s(52, 'rush', 'active', 'echo', 'prehire'),
  s(53, 'rush', 'active', 'echo', 'futurehire'),
  s(56, 'rush', 'prehire', 'echo', 'active'),
  s(57, 'rush', 'prehire', 'echo', 'prehire'),
  s(58, 'rush', 'prehire', 'echo', 'futurehire'),
  s(61, 'rush', 'futurehire', 'echo', 'active'),
  s(62, 'rush', 'futurehire', 'echo', 'prehire'),
  s(63, 'rush', 'futurehire', 'echo', 'futurehire'),

  // Rush Lawson × Ellucian — Ellucian only has Active in the source table (76–90)
  s(76, 'rush', 'active', 'ellucian', 'active'),
  s(79, 'rush', 'prehire', 'ellucian', 'active'),
  s(82, 'rush', 'futurehire', 'ellucian', 'active'),

  // Copley Lawson × Non-Employee — no NERM futurehire rows in the source table (91–110)
  s(91, 'copley', 'active', 'nerm', 'active'),
  s(92, 'copley', 'active', 'nerm', 'prehire'),
  s(95, 'copley', 'prehire', 'nerm', 'active'),
  s(96, 'copley', 'prehire', 'nerm', 'prehire'),
  s(99, 'copley', 'futurehire', 'nerm', 'active'),
  s(100, 'copley', 'futurehire', 'nerm', 'prehire'),

  // Copley Lawson × ECHO (original 111–135)
  s(111, 'copley', 'active', 'echo', 'active'),
  s(112, 'copley', 'active', 'echo', 'prehire'),
  s(113, 'copley', 'active', 'echo', 'futurehire'),
  s(116, 'copley', 'prehire', 'echo', 'active'),
  s(117, 'copley', 'prehire', 'echo', 'prehire'),
  s(118, 'copley', 'prehire', 'echo', 'futurehire'),
  s(121, 'copley', 'futurehire', 'echo', 'active'),
  s(122, 'copley', 'futurehire', 'echo', 'prehire'),
  s(123, 'copley', 'futurehire', 'echo', 'futurehire'),

  // Copley Lawson × Ellucian (original 136–150)
  s(136, 'copley', 'active', 'ellucian', 'active'),
  s(139, 'copley', 'prehire', 'ellucian', 'active'),
  s(142, 'copley', 'futurehire', 'ellucian', 'active'),

  // Non-Employee × ECHO (original 151–175)
  s(151, 'nerm', 'active', 'echo', 'active'),
  s(152, 'nerm', 'active', 'echo', 'prehire'),
  s(153, 'nerm', 'active', 'echo', 'futurehire'),
  s(156, 'nerm', 'prehire', 'echo', 'active'),
  s(157, 'nerm', 'prehire', 'echo', 'prehire'),
  s(158, 'nerm', 'prehire', 'echo', 'futurehire'),
  s(161, 'nerm', 'futurehire', 'echo', 'active'),
  s(162, 'nerm', 'futurehire', 'echo', 'prehire'),
  s(163, 'nerm', 'futurehire', 'echo', 'futurehire'),

  // Non-Employee × Ellucian (original 176–190)
  s(176, 'nerm', 'active', 'ellucian', 'active'),
  s(179, 'nerm', 'prehire', 'ellucian', 'active'),
  s(182, 'nerm', 'futurehire', 'ellucian', 'active'),

  // ECHO × Ellucian (original 191–205)
  s(191, 'echo', 'active', 'ellucian', 'active'),
  s(194, 'echo', 'prehire', 'ellucian', 'active'),
  s(197, 'echo', 'futurehire', 'ellucian', 'active'),
];

export function scenarioLabel(scenario: MultiAccountScenario): string {
  const [a, b] = scenario.accounts;
  return `${SOURCES[a.sourceKey]} ${a.lifecycle} + ${SOURCES[b.sourceKey]} ${b.lifecycle}`;
}

export function findMultiAccountScenario(sNo: number): MultiAccountScenario {
  const found = MULTI_ACCOUNT_SCENARIOS.find((row) => row.sNo === sNo);
  if (!found) {
    throw new Error(
      `No multi-account scenario with sNo ${sNo}. Valid numbers: ` +
        MULTI_ACCOUNT_SCENARIOS.map((row) => row.sNo).join(', ')
    );
  }
  return found;
}

export interface MultiAccountManifestAccount {
  sourceKey: SourceKey;
  sourceName: string;
  lifecycle: MultiAccountLifecycle;
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

export function formatMultiAccountTable(entries: MultiAccountManifestEntry[]): string {
  const bySNo = new Map(entries.map((e) => [e.sNo, e]));
  const lines = [
    'sNo   Source 1                        L1           Source 2                        L2           Stage Keys',
    '----  ------------------------------  -----------  ------------------------------  -----------  --------------------------------',
  ];
  for (const scenario of MULTI_ACCOUNT_SCENARIOS) {
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
