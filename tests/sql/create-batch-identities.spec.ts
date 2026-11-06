import { test, expect } from '@playwright/test';
import * as fs from 'fs';
import * as path from 'path';
import { runGenerator } from '../helpers/generatorClient';
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
  BATCH_ROWS,
  BatchManifest,
  BatchManifestEntry,
  BATCH_MANIFEST_PATH,
  readBatchManifest,
  writeBatchManifest,
  formatBatchTable,
} from '../config/batch';

// PHASE 1 of the 2026-11-06 batch request: create all 16 identities in
// tests/config/batch.ts (one per row of the user's table), each its own
// name/number/Stage_Key, and write temp/batch_manifest.json for phase 3.
//
//   npx playwright test tests/sql/create-batch-identities.spec.ts
//
// Then:
//   PHASE 2 (manual, you)  — aggregate each of the 5 sources once in the
//     sandbox UI: Admin > Sources > [source] > Import/Aggregate. Five
//     aggregations cover all 16 identities; TRIGGER_AGGREGATION-style
//     automation is deliberately not used here (standing instruction to
//     aggregate manually).
//   PHASE 3 (automated)    — npx playwright test tests/sources/
//     Each per-source spec picks its Stage_Key up out of the manifest and
//     captures the sandbox walkthrough. See AGENTS.md.
//
// NO SQL MANAGEMENT SCREENSHOTS, per the user's "screenshot only the
// sandbox details ... Dont screenshot sql management". Two consequences:
//
//  1. The INSERT runs over the mssql connection (dbClient's
//     runGeneratedInsert) instead of being typed into a live SSMS window by
//     scripts/ssms-capture.ps1. The SendKeys route existed to produce the
//     screenshot; with no screenshot wanted there is no reason to drive a
//     GUI, and 16 multi-minute typing sessions is the most fragile part of
//     the old pipeline. This spec therefore needs no SSMS and is not
//     Windows-only — it only needs DB access and Python, so it skips on
//     DB_SERVER etc. being unset rather than on platform.
//  2. No creation Word report is built or uploaded here. That report's
//     content was the two SSMS screenshots plus the attribute table, so
//     it would be empty of evidence by this request's own terms. Phase 3's
//     per-source sandbox reports are the deliverable instead; this spec's
//     own output is the manifest plus the printed Stage_Key table. The
//     attribute-level DB verification still runs — it just lands in the
//     console and the manifest's dbVerified flag rather than in a .docx.
//
// Compare tests/sql/create-and-insert-identity.spec.ts: that one is still
// the right tool for a SINGLE identity when you DO want SSMS creation
// evidence in a report. It is untouched.
//
// Safe to re-run: rows already present in temp/batch_manifest.json are
// skipped, so an interrupted batch resumes where it stopped instead of
// creating duplicates. Delete the manifest to start the whole batch over
// (the 16 already-created identities would then be duplicated — rename it
// instead if you just want the per-source specs back on their hardcoded
// Stage_Keys).
const TABLE = 'My_Rush_Jobs';

// Each row re-generates on a name/Stage_Key/User_ID collision rather than
// failing. This matters most for rush/copley: their User_ID is a 4-digit
// prefix plus only 2 random digits, i.e. 100 possible values per source
// across this project's entire history, and this batch wants 4 rush and 3
// copley rows on top of everything created since 2026-10-23. A collision is
// ordinary here, not an anomaly — see the User_ID notes in
// create-and-insert-identity.spec.ts and dbClient.findRowsByUserId.
const MAX_GENERATION_ATTEMPTS = 6;

interface RowFailure {
  sNo: number;
  label: string;
  reason: string;
}

test('Create the 16-identity batch — INSERT + DB verify, no SSMS', async () => {
  test.skip(
    !isDbConfigured(),
    'Needs DB_SERVER/DB_DATABASE/DB_USERNAME/DB_PASSWORD — run this from inside the VDI.'
  );
  // 16 identities, each a Python generation + up to 3 duplicate queries + an
  // INSERT + a verification SELECT. Well under the old SendKeys timings, but
  // still far past Playwright's 30s default.
  test.setTimeout(1_800_000);

  fs.mkdirSync(path.resolve('temp'), { recursive: true });

  // Pre-flight: prove the DB account can INSERT before generating anything.
  // A read-only grant is the one failure mode that would otherwise waste a
  // full pass over all 16 rows, and it is invisible until the first write.
  const probeKey = `BATCH-PROBE-${BATCH_ROWS.length}-ROWS`;
  const probe = await canInsert(TABLE, probeKey);
  console.log(`INSERT pre-flight: ${probe.verdict} — ${probe.detail}`);
  expect(
    probe.verdict,
    `The configured DB account is not permitted to INSERT into ${TABLE}, so this batch cannot create ` +
      `anything. Detail: ${probe.detail}\n\n` +
      `If the account is intentionally read-only, creation has to go back through SSMS — run ` +
      `tests/sql/create-and-insert-identity.spec.ts once per row instead (16 runs, hand-editing ` +
      `SOURCES_TO_CREATE/LIFECYCLE each time), and ignore the SSMS screenshots it produces.`
  ).not.toBe('denied');
  if (probe.verdict === 'inconclusive') {
    // Not fatal by design — see canInsert's docstring. A Stage_Key-only
    // probe can fail on the table's own constraints while permissions are
    // fine, and blocking 16 rows over that would be worse than letting row
    // 1 find out for real.
    console.log('Proceeding anyway — an actual permission problem will surface on the first row.');
  }

  const existing = readBatchManifest();
  const entries: BatchManifestEntry[] = existing?.entries ? [...existing.entries] : [];
  if (entries.length > 0) {
    console.log(
      `Resuming — ${entries.length} of ${BATCH_ROWS.length} row(s) already in ${BATCH_MANIFEST_PATH}; those are skipped.`
    );
  }

  const failures: RowFailure[] = [];

  for (const batchRow of BATCH_ROWS) {
    const sourceName = SOURCES[batchRow.sourceKey];
    const label = `${sourceName} ${batchRow.lifecycle}`;

    if (entries.some((e) => e.sourceKey === batchRow.sourceKey && e.lifecycle === batchRow.lifecycle)) {
      console.log(`\n--- S.No ${batchRow.sNo}: ${label} — already created, skipping ---`);
      continue;
    }

    // Rows the user marked as already created elsewhere (a teammate, or an
    // earlier run) are ADOPTED, not generated: look the row up, record it in
    // the manifest so phase 3 documents it, and move on. Without this, a
    // partially-complete batch could only be finished by either creating
    // duplicates or losing the existing identities from the documentation
    // run.
    if (batchRow.existingStageKey) {
      console.log(`\n--- S.No ${batchRow.sNo}: ${label} — adopting existing ${batchRow.existingStageKey} ---`);
      const dbRow = await getStagingRow(TABLE, batchRow.existingStageKey);
      if (!dbRow) {
        failures.push({
          sNo: batchRow.sNo,
          label,
          reason: `existingStageKey "${batchRow.existingStageKey}" not found in ${TABLE} — check the Stage_Key`,
        });
        console.log(`  NOT FOUND in ${TABLE}.`);
        continue;
      }
      // dbVerified is false for adopted rows and that is honest, not a
      // defect: this pipeline did not generate them, so there is no
      // generated row to compare the stored one against. The manager values
      // are logged so a wrong-looking one is visible here rather than only
      // in a screenshot later.
      console.log(
        `  ${dbRow['Given_Name']} ${dbRow['Family_Name']} — User_ID ${dbRow['User_ID']}, ` +
          `Status ${dbRow['Status']}, Start_Date ${dbRow['Start_Date']}, ` +
          `Primary_Position ${dbRow['Primary_Position']}`
      );
      console.log(
        `  Manager ${dbRow['Manager_Name']} / ${dbRow['Manager_Employee_ID']}, ` +
          `one-up ${dbRow['OneUp_Manager_Employee_ID']}`
      );
      entries.push({
        sNo: batchRow.sNo,
        sourceKey: batchRow.sourceKey,
        sourceName,
        lifecycle: batchRow.lifecycle,
        stageKey: batchRow.existingStageKey,
        firstName: dbRow['Given_Name'] ?? '',
        lastName: dbRow['Family_Name'] ?? '',
        userId: dbRow['User_ID'] ?? '',
        dbVerified: false,
        adopted: true,
      });
      writeBatchManifest({ createdAt: new Date().toISOString(), entries });
      continue;
    }

    console.log(`\n--- S.No ${batchRow.sNo}: ${label} ---`);

    let created: BatchManifestEntry | undefined;
    let lastCollision = '';

    for (let attempt = 1; attempt <= MAX_GENERATION_ATTEMPTS && !created; attempt++) {
      // One source per call: every row is an independent identity, so
      // nothing is shared between rows (no reused number/correlation key).
      // No date or Primary_Position overrides — each lifecycle's own
      // defaults are what this request asked for. No
      // oneUpManagerEmployeeId: the source template supplies the one-up
      // manager (copley = the 019811/jyates manager the user set on
      // 2026-11-06; the other sources still carry the 2026-10-29 test
      // manager until the user provides theirs).
      const generated = runGenerator([batchRow.sourceKey], batchRow.lifecycle);
      const row = generated.rows[0];
      if (!row) {
        failures.push({ sNo: batchRow.sNo, label, reason: 'generator returned no rows' });
        break;
      }

      const given = row.row['Given_Name'];
      const family = row.row['Family_Name'];
      const userId = row.row['User_ID'] ?? '';

      // Same three live-DB duplicate checks the single-identity spec runs,
      // for the same reason: the generator's own collision avoidance only
      // consults the local Excel audit log, which is per-machine. Here they
      // also cover rows created earlier in THIS batch, since each row is
      // INSERTed before the next is generated.
      let collision = '';
      if (given && family) {
        const nameMatches = await findRowsByName(TABLE, given, family);
        if (nameMatches.length > 0) {
          collision = `name "${given} ${family}" already in ${TABLE} (${nameMatches
            .map((r) => r['Stage_Key'])
            .join(', ')})`;
        }
      }
      if (!collision && (await getStagingRow(TABLE, row.stageKey))) {
        collision = `Stage_Key "${row.stageKey}" already in ${TABLE}`;
      }
      if (!collision && userId) {
        const userIdMatches = await findRowsByUserId(TABLE, userId);
        if (userIdMatches.length > 0) {
          collision = `User_ID "${userId}" already in ${TABLE} (${userIdMatches
            .map((r) => r['Stage_Key'])
            .join(', ')})`;
        }
      }
      if (collision) {
        lastCollision = collision;
        console.log(`  attempt ${attempt}/${MAX_GENERATION_ATTEMPTS}: ${collision} — regenerating.`);
        continue;
      }

      console.log(
        `  ${generated.firstName} ${generated.lastName} — ${row.stageKey}, User_ID ${userId}, ` +
          `Start_Date ${row.row['Start_Date']}, End_Date ${row.row['End_Date']}, ` +
          `Status ${row.row['Status']}, IIQDisabled ${row.row['IIQDisabled']}, ` +
          `Primary_Position ${row.row['Primary_Position']}`
      );
      console.log(
        `  Manager ${row.row['Manager_Name']} / ${row.row['Manager_Employee_ID']}, ` +
          `one-up ${row.row['OneUp_Manager_Employee_ID']}`
      );

      const affected = await runGeneratedInsert(TABLE, row.insertSql);
      console.log(`  INSERT affected ${affected} row(s).`);

      // Read the row back and confirm every generated field landed — the
      // same evaluateCheck comparison the single-identity spec reports in
      // its Word table, kept here because it is the only thing standing
      // between a silently-wrong row and a sandbox screenshot of it.
      const dbRow = await getStagingRow(TABLE, row.stageKey);
      let mismatches = 0;
      if (!dbRow) {
        console.log(`  FAIL — no row found for Stage_Key "${row.stageKey}" after INSERT.`);
      } else {
        const values: Record<string, string[]> = {};
        for (const [column, value] of Object.entries(dbRow)) values[column] = [value];
        for (const [field, value] of Object.entries(row.row)) {
          const generatedValue = value === null || value === undefined ? '' : String(value);
          if (!generatedValue.trim()) continue; // NULL/blank — nothing to compare
          const outcome = evaluateCheck({ field, expected: generatedValue }, values);
          if (outcome?.result !== 'PASS') {
            mismatches++;
            console.log(`  MISMATCH — ${field}: generated "${generatedValue}", ${TABLE} has "${dbRow[field] ?? '(not found)'}"`);
          }
        }
        if (mismatches === 0) console.log(`  All generated fields verified in ${TABLE}.`);
      }

      const dbVerified = Boolean(dbRow) && mismatches === 0;
      if (!dbVerified) {
        failures.push({
          sNo: batchRow.sNo,
          label,
          reason: dbRow ? `${mismatches} field mismatch(es) vs ${TABLE}` : `no row in ${TABLE} after INSERT`,
        });
      }

      created = {
        sNo: batchRow.sNo,
        sourceKey: batchRow.sourceKey,
        sourceName,
        lifecycle: batchRow.lifecycle,
        stageKey: row.stageKey,
        firstName: generated.firstName,
        lastName: generated.lastName,
        userId,
        dbVerified,
      };
    }

    if (created) {
      entries.push(created);
      // Written after EVERY row, not once at the end: these identities are
      // real rows in a shared table the moment they are INSERTed, and a
      // crash on row 12 must not lose the Stage_Keys of rows 1-11 — without
      // them there is no way to document or clean up what was created
      // short of hunting through My_Rush_Jobs by date.
      writeBatchManifest({ createdAt: new Date().toISOString(), entries });
    } else if (!failures.some((f) => f.sNo === batchRow.sNo)) {
      failures.push({
        sNo: batchRow.sNo,
        label,
        reason: `no collision-free identity after ${MAX_GENERATION_ATTEMPTS} attempts — last: ${lastCollision}`,
      });
    }
  }

  const manifestPath = writeBatchManifest({ createdAt: new Date().toISOString(), entries });

  const adoptedCount = entries.filter((e) => e.adopted).length;
  console.log(`\n${'='.repeat(78)}`);
  console.log(
    `Batch has ${entries.length} of ${BATCH_ROWS.length} identities — ` +
      `${entries.length - adoptedCount} created here, ${adoptedCount} adopted from existing rows.`
  );
  console.log(`Manifest: ${manifestPath}`);
  console.log(`${'='.repeat(78)}\n`);
  console.log(formatBatchTable(entries));
  // Only sources with NEWLY created rows need aggregating — the adopted
  // ones were already aggregated by whoever created them, and listing them
  // here would send you to re-run five aggregations when two are needed.
  const sourcesNeedingAggregation = [...new Set(entries.filter((e) => !e.adopted).map((e) => e.sourceName))];
  if (sourcesNeedingAggregation.length > 0) {
    console.log(
      `\nNEXT — aggregate these ${sourcesNeedingAggregation.length} source(s) in the sandbox UI ` +
        `(Admin > Sources > [source] > Import/Aggregate):\n` +
        sourcesNeedingAggregation.map((s) => `  - ${s}`).join('\n') +
        `\n\nThen run:  npm run batch:document\n`
    );
  } else {
    console.log('\nNothing newly created — no aggregation needed. Run: npm run batch:document\n');
  }

  if (failures.length > 0) {
    console.log('Failures:');
    for (const f of failures) console.log(`  S.No ${f.sNo} ${f.label}: ${f.reason}`);
  }

  // Fails at the end rather than mid-loop so a single bad row still leaves
  // the other 15 created, manifested and documentable.
  expect(
    failures,
    `${failures.length} of ${BATCH_ROWS.length} batch row(s) did not come out clean:\n` +
      failures.map((f) => `  S.No ${f.sNo} ${f.label}: ${f.reason}`).join('\n')
  ).toEqual([]);
});
