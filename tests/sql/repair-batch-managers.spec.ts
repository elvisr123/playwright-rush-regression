import { test, expect } from '@playwright/test';
import { getStagingRow, updateRowFields, isDbConfigured } from '../helpers/dbClient';
import { readSourceTemplates, MANAGER_COLUMNS } from '../helpers/generatorClient';
import { readBatchManifest, BATCH_MANIFEST_PATH } from '../config/batch';

// Re-points already-created batch identities at their source template's
// CURRENT manager, for when the template changed after the identity was
// created.
//
//   npx playwright test tests/sql/repair-batch-managers.spec.ts
//
// Why this exists: the 2026-11-06 batch ran before the user supplied the
// RUSH and NERM manager details, so those 8 identities (S.No 4-7 and 8-11)
// were created carrying the 2026-10-29 test manager (MaeveAA Yamamoto /
// 259921, one-up FionaAA Lambert / 253476). Template edits do not retrofit
// existing rows — each row is a literal snapshot of the template as of the
// moment it was generated. The user chose repair-in-place over leaving them
// or recreating, matching the 2026-10-26 run-1 repair, so the Stage_Keys,
// names and User_IDs they already recorded all stay valid.
//
// AFTER this runs, two manual follow-ups are required and the spec prints
// both:
//   1. Re-aggregate the affected sources in the sandbox (Admin > Sources >
//      [source] > Import/Aggregate). Until then SailPoint still holds the
//      OLD manager on those accounts — the UPDATE only touches the staging
//      table, which is the upstream feed, not the identity.
//   2. Re-run the documentation for those rows, since the reports already
//      in Evidence_Nov_11_2026 were captured against the old manager:
//        npm run batch:document
//
// SCOPE: driven by the manifest and the templates, never by a hardcoded
// list of sources. Any manifest row whose five manager columns in
// My_Rush_Jobs differ from its source template's current values is
// repaired; rows that already agree are left untouched and reported as
// such. That means it naturally targets exactly the rows that drifted —
// today the 8 RUSH/NERM ones, since copley was created after its change and
// echo/ellucian still match their unchanged template — and it stays correct
// if a different source's manager is edited later.
const TABLE = 'My_Rush_Jobs';

interface Drift {
  sNo: number;
  sourceKey: string;
  sourceName: string;
  lifecycle: string;
  stageKey: string;
  changes: { column: string; from: string; to: string }[];
}

test('Repair batch identities whose manager drifted from their template', async () => {
  test.skip(
    !isDbConfigured(),
    'Needs DB_SERVER/DB_DATABASE/DB_USERNAME/DB_PASSWORD — run this from inside the VDI.'
  );
  test.setTimeout(600_000);

  const manifest = readBatchManifest();
  test.skip(
    !manifest || manifest.entries.length === 0,
    `No ${BATCH_MANIFEST_PATH} — nothing to repair. Run npm run batch:create first.`
  );

  const templates = readSourceTemplates();
  const entries = manifest!.entries;
  console.log(`Checking ${entries.length} batch identities against their source templates...\n`);

  const drifted: Drift[] = [];
  const missing: string[] = [];
  let alreadyCorrect = 0;

  for (const entry of entries) {
    const template = templates[entry.sourceKey];
    if (!template) {
      missing.push(`${entry.stageKey}: no template for source key "${entry.sourceKey}"`);
      continue;
    }
    const dbRow = await getStagingRow(TABLE, entry.stageKey);
    if (!dbRow) {
      // Reported, not thrown: a manifest entry with no row means that row
      // was deleted or never landed, which is worth surfacing but must not
      // stop the other rows from being repaired.
      missing.push(`${entry.stageKey} (S.No ${entry.sNo}, ${entry.sourceName}): no row in ${TABLE}`);
      continue;
    }

    const changes: Drift['changes'] = [];
    for (const column of MANAGER_COLUMNS) {
      const want = template[column];
      const wantStr = want === null || want === undefined ? '' : String(want);
      const have = dbRow[column] ?? '';
      if (have !== wantStr) {
        changes.push({ column, from: have || '(blank)', to: wantStr || '(blank)' });
      }
    }

    if (changes.length === 0) {
      alreadyCorrect++;
      continue;
    }
    drifted.push({
      sNo: entry.sNo,
      sourceKey: entry.sourceKey,
      sourceName: entry.sourceName,
      lifecycle: entry.lifecycle,
      stageKey: entry.stageKey,
      changes,
    });
  }

  console.log(`${alreadyCorrect} row(s) already match their template.`);
  if (missing.length > 0) {
    console.log(`\n${missing.length} row(s) could not be checked:`);
    for (const m of missing) console.log(`  ${m}`);
  }

  if (drifted.length === 0) {
    console.log('\nNothing to repair.');
    expect(missing, `Some manifest rows could not be checked:\n${missing.join('\n')}`).toEqual([]);
    return;
  }

  console.log(`\n${drifted.length} row(s) need repair:\n`);
  for (const d of drifted) {
    console.log(`  S.No ${d.sNo}  ${d.sourceName} ${d.lifecycle}  ${d.stageKey}`);
    for (const c of d.changes) {
      console.log(`      ${c.column.padEnd(26)} ${c.from}  ->  ${c.to}`);
    }
  }

  console.log('\nApplying updates...');
  const failures: string[] = [];
  for (const d of drifted) {
    const fields: Record<string, string | null> = {};
    for (const c of d.changes) fields[c.column] = c.to === '(blank)' ? null : c.to;
    try {
      await updateRowFields(TABLE, d.stageKey, fields);

      // Read back rather than trusting rowsAffected — the row is what the
      // sandbox will aggregate next, so "the UPDATE ran" is weaker than
      // "the row now reads correctly".
      const after = await getStagingRow(TABLE, d.stageKey);
      const stillWrong = d.changes.filter((c) => (after?.[c.column] ?? '') !== (c.to === '(blank)' ? '' : c.to));
      if (stillWrong.length > 0) {
        failures.push(
          `${d.stageKey}: still wrong after UPDATE — ${stillWrong.map((c) => c.column).join(', ')}`
        );
        console.log(`  S.No ${d.sNo} ${d.stageKey}: FAILED verification`);
      } else {
        console.log(`  S.No ${d.sNo} ${d.stageKey}: ${d.changes.length} column(s) updated and verified`);
      }
    } catch (err) {
      failures.push(`${d.stageKey}: ${(err as Error).message}`);
      console.log(`  S.No ${d.sNo} ${d.stageKey}: ERROR — ${(err as Error).message}`);
    }
  }

  const affectedSources = [...new Set(drifted.map((d) => d.sourceName))];
  console.log(`\n${'='.repeat(78)}`);
  console.log('NEXT — the staging table is fixed, SailPoint is NOT yet:');
  console.log(`${'='.repeat(78)}`);
  console.log(`  1. Re-aggregate in the sandbox (Admin > Sources > [source] > Import/Aggregate):`);
  for (const s of affectedSources) console.log(`       - ${s}`);
  console.log(`  2. Re-capture evidence, since the uploaded reports show the old manager:`);
  console.log(`       npm run batch:document`);
  console.log('');

  expect(
    failures,
    `${failures.length} row(s) failed to repair:\n${failures.join('\n')}`
  ).toEqual([]);
  expect(missing, `Some manifest rows could not be checked:\n${missing.join('\n')}`).toEqual([]);
});
