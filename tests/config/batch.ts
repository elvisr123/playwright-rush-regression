import * as fs from 'fs';
import * as path from 'path';
import { LifecycleState } from './lifecycles';
import { SOURCES, SourceKey } from './sources';

// The 16-row batch the user asked for on 2026-11-06, verbatim from their
// table (S.No / Source / StageKey — the StageKey column is what this
// pipeline fills in).
//
// Each row is its OWN identity: 16 rows, 16 Stage_Keys, 16 names, 16
// numbers. That reading comes from the table itself — a Stage_Key column
// per row means 16 distinct My_Rush_Jobs rows, whereas one identity
// *transitioning* futurehire -> prehire -> active keeps a single Stage_Key
// throughout. It also matches the 2026-10-27 series, where the two
// lifecycle-transition users were likewise created separately per
// lifecycle rather than advanced in place.
//
// Lifecycle dates are deliberately left to each lifecycle's own defaults
// (identity-factory/user_payload.py's lifecycle_dates): futurehire
// start=+35d, prehire start=+14d, active/processing start=-1d, all with
// End_Date=+180d. The request named no dates, so nothing is overridden —
// same reasoning as the 2026-10-29 series, which explicitly reset the
// previous series' START_DATE/END_DATE rather than inheriting them.
//
// Copley has no 'processing' row because the user's table has none, and
// there is no tests/sources/copley-lawson/processing.spec.ts to document
// one with. Every other row below has a matching source spec.
export interface BatchRow {
  /** S.No from the user's table — kept so console output lines up with it. */
  sNo: number;
  /** identity-factory source key (also tests/config/sources.ts's SOURCES key). */
  sourceKey: SourceKey;
  lifecycle: LifecycleState;
  /**
   * Set when this row's identity ALREADY EXISTS, created outside this
   * pipeline — by a teammate, or by an earlier partial run. The creation
   * spec then ADOPTS the row (looks it up in My_Rush_Jobs and records it in
   * the manifest) instead of generating a new one, so phase 3 documents all
   * 16 while only the genuinely missing rows are created.
   *
   * Filled in 2026-11-06 from the user's updated table: a teammate had
   * already created Copley (1-3), ECHO (12-15) and Ellucian (16), leaving
   * RUSH (4-7) and NERM (8-11) blank — "just run these ones ... that r
   * missing".
   *
   * Convenient consequence: the 8 missing rows are exactly the 8 whose
   * templates gained the user's rush/nerm managers, so they pick up
   * kbarr / mparris1 at creation and nothing needs repairing. The adopted
   * rows were created before that change but are copley/echo/ellucian,
   * none of which changed.
   */
  existingStageKey?: string;
}

export const BATCH_ROWS: BatchRow[] = [
  { sNo: 1, sourceKey: 'copley', lifecycle: 'futurehire', existingStageKey: 'CL-9001179398934928ER' },
  { sNo: 2, sourceKey: 'copley', lifecycle: 'prehire', existingStageKey: 'CL-9001179398944842ER' },
  { sNo: 3, sourceKey: 'copley', lifecycle: 'active', existingStageKey: 'CL-9001179398951409ER' },
  { sNo: 4, sourceKey: 'rush', lifecycle: 'processing' },
  { sNo: 5, sourceKey: 'rush', lifecycle: 'futurehire' },
  { sNo: 6, sourceKey: 'rush', lifecycle: 'prehire' },
  { sNo: 7, sourceKey: 'rush', lifecycle: 'active' },
  { sNo: 8, sourceKey: 'nerm', lifecycle: 'processing' },
  { sNo: 9, sourceKey: 'nerm', lifecycle: 'futurehire' },
  { sNo: 10, sourceKey: 'nerm', lifecycle: 'prehire' },
  { sNo: 11, sourceKey: 'nerm', lifecycle: 'active' },
  { sNo: 12, sourceKey: 'echo', lifecycle: 'processing', existingStageKey: 'EC-9001179399093406ER' },
  { sNo: 13, sourceKey: 'echo', lifecycle: 'futurehire', existingStageKey: 'EC-9001179399070796ER' },
  { sNo: 14, sourceKey: 'echo', lifecycle: 'prehire', existingStageKey: 'EC-9001179399082838ER' },
  { sNo: 15, sourceKey: 'echo', lifecycle: 'active', existingStageKey: 'EC-9001179399087961ER' },
  { sNo: 16, sourceKey: 'ellucian', lifecycle: 'active', existingStageKey: 'ES-9001179398957407ER' },
];

/** tests/sources/<folder>/<lifecycle>.spec.ts — folder names don't all match the source key. */
export const SOURCE_SPEC_FOLDER: Record<SourceKey, string> = {
  copley: 'copley-lawson',
  rush: 'rush-lawson',
  workday: 'rush-workday',
  echo: 'echo',
  ellucian: 'ellucian',
  nerm: 'nerm',
};

export interface BatchManifestEntry {
  sNo: number;
  sourceKey: SourceKey;
  /** Exact SailPoint source name — what the documentation specs search by. */
  sourceName: string;
  lifecycle: LifecycleState;
  stageKey: string;
  firstName: string;
  lastName: string;
  userId: string;
  /** Every generated field was read back from My_Rush_Jobs and matched. */
  dbVerified: boolean;
  /**
   * This row was created outside the pipeline and adopted from its
   * existingStageKey rather than generated here. Such rows always have
   * dbVerified=false, because there is no generated row to compare the
   * stored one against — absence of verification, not a failed one.
   */
  adopted?: boolean;
}

export interface BatchManifest {
  /** ISO timestamp stamped by the creation spec, for "is this stale?" checks. */
  createdAt: string;
  entries: BatchManifestEntry[];
}

// temp/ is gitignored, so this does NOT travel between the Mac and the VDI —
// which is correct: only the VDI run can create these identities, so only
// the VDI has a meaningful manifest. Both phases run in the same checkout
// there.
export const BATCH_MANIFEST_PATH = path.join('temp', 'batch_manifest.json');

export function readBatchManifest(): BatchManifest | undefined {
  const resolved = path.resolve(BATCH_MANIFEST_PATH);
  if (!fs.existsSync(resolved)) return undefined;
  try {
    return JSON.parse(fs.readFileSync(resolved, 'utf8')) as BatchManifest;
  } catch (err) {
    console.log(`Could not parse ${BATCH_MANIFEST_PATH} — ignoring it. (${(err as Error).message})`);
    return undefined;
  }
}

export function writeBatchManifest(manifest: BatchManifest): string {
  const resolved = path.resolve(BATCH_MANIFEST_PATH);
  fs.mkdirSync(path.dirname(resolved), { recursive: true });
  fs.writeFileSync(resolved, JSON.stringify(manifest, null, 2));
  return resolved;
}

/**
 * Stage_Key a tests/sources/** spec should document.
 *
 * Prefers the batch manifest written by
 * tests/sql/create-batch-identities.spec.ts, so after a batch creation run
 * the existing per-source specs document the freshly created identities
 * instead of their hand-pasted historical ones — that reuse is the whole
 * point, since each of those specs already carries its own curated field
 * lists and expectedValues for that source+lifecycle.
 *
 * Falls back to the spec's own hardcoded STAGE_KEY when there's no manifest
 * entry, so every spec behaves exactly as before outside a batch run. The
 * override is logged rather than silent — pointing a spec at a different
 * identity than the constant at the top of the file says is surprising
 * enough to announce. To force the hardcoded keys back, delete
 * temp/batch_manifest.json.
 */
export function resolveStageKey(sourceKey: SourceKey, lifecycle: LifecycleState, fallback: string): string {
  const manifest = readBatchManifest();
  const entry = manifest?.entries.find((e) => e.sourceKey === sourceKey && e.lifecycle === lifecycle);
  if (!entry) return fallback;
  if (!entry.stageKey) return fallback;
  console.log(
    `[batch] ${SOURCES[sourceKey]} ${lifecycle}: documenting ${entry.stageKey} ` +
      `(${entry.firstName} ${entry.lastName}, S.No ${entry.sNo}) from ${BATCH_MANIFEST_PATH}` +
      (entry.adopted
        ? ' — adopted (created outside this pipeline, so not field-verified here)'
        : entry.dbVerified
          ? ''
          : ' — WARNING: this row was not DB-verified at creation') +
      `; the spec's own STAGE_KEY (${fallback}) is overridden.`
  );
  return entry.stageKey;
}

// Where every report from this batch is published — given by the user on
// 2026-11-06, decoding to:
//   /sites/AsbRushISC/Shared Documents/ASB/Rush_TestCases/
//     Enhancement_Nov_11_2026/Evidence_Nov_11_2026
//
// This is a DIFFERENT folder from aggregate-and-document.spec.ts's
// Enhancement_Nov_2026/Evidence_Nov/Lifecycle_Transition_Time — note
// Nov_11_2026, not Nov_2026 — so don't collapse the two.
//
// Only the `id` query param is read (sharepointUpload.ts does
// searchParams.get('id') and decodes it to the server-relative path), so
// the Teams-added p/ct/or/ga/LOF params from the user's copied link are
// dropped here rather than carried along as noise.
export const BATCH_EVIDENCE_FOLDER_URL =
  'https://netorgft1314491.sharepoint.com/sites/AsbRushISC/Shared%20Documents/Forms/AllItems.aspx' +
  '?id=%2Fsites%2FAsbRushISC%2FShared%20Documents%2FASB%2FRush%5FTestCases' +
  '%2FEnhancement%5FNov%5F11%5F2026%2FEvidence%5FNov%5F11%5F2026';

/**
 * SharePoint folder a given run's report should be published to.
 *
 * Returns the batch evidence folder for any source+lifecycle that is part
 * of the created batch, and `undefined` otherwise — `undefined` means
 * "upload normally", i.e. uploadReportForSource's per-source subfolder
 * routing (Copley / Rush / NERM_testcases under the default team folder).
 *
 * Gated on the manifest for the same reason resolveStageKey is: outside a
 * batch run these specs must behave exactly as they did before, and
 * silently redirecting an ordinary one-off run's report into the batch
 * folder would be wrong.
 *
 * Matched on sourceName rather than sourceKey because that is what
 * runSourceLifecycle has in hand; manifest entries carry both.
 */
export function resolveUploadFolderUrl(sourceName: string, lifecycle: LifecycleState): string | undefined {
  const manifest = readBatchManifest();
  const entry = manifest?.entries.find((e) => e.sourceName === sourceName && e.lifecycle === lifecycle);
  if (!entry) return undefined;
  console.log(`[batch] ${sourceName} ${lifecycle}: report → Evidence_Nov_11_2026 (batch evidence folder).`);
  return BATCH_EVIDENCE_FOLDER_URL;
}

/** The user's table, re-printed with whatever Stage_Keys are known so far. */
export function formatBatchTable(entries: BatchManifestEntry[]): string {
  const byKey = new Map(entries.map((e) => [`${e.sourceKey}|${e.lifecycle}`, e]));
  const lines = [
    'S.No  Source                        Lifecycle    StageKey',
    '----  ----------------------------  -----------  ------------------------',
  ];
  for (const row of BATCH_ROWS) {
    const entry = byKey.get(`${row.sourceKey}|${row.lifecycle}`);
    const note = !entry ? '' : entry.adopted ? '  (adopted)' : entry.dbVerified ? '' : '  (NOT DB-VERIFIED)';
    const stageKey = entry ? entry.stageKey + note : '(not created)';
    lines.push(
      `${String(row.sNo).padEnd(4)}  ${SOURCES[row.sourceKey].padEnd(28)}  ${row.lifecycle.padEnd(11)}  ${stageKey}`
    );
  }
  return lines.join('\n');
}
