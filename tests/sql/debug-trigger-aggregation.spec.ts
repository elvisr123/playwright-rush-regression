import { test } from '@playwright/test';
import { triggerAggregation, waitForAggregationComplete } from '../helpers/sailpointClient';

// One-off debug test — isolates the aggregation API call against a known
// source ID, bypassing getSourceIdByName()'s name lookup entirely.
// /beta/sources/{id}/load-accounts + FormData(disableOptimization=true) is
// now confirmed working (2026-10-06, verified against Copley Lawson's source
// ID 30b9c8356e5a4c598b537587d8ff29d0) — this run is testing a DIFFERENT
// source ID to confirm the same approach works generally, not just for Copley.
// Delete this file once confirmed.
const SOURCE_ID = 'ebe5d44abef348e1bcc16f15e7828460'; // ECHO Credentialed Providers

test('Debug — trigger aggregation for a known source ID', async () => {
  test.setTimeout(300_000);
  console.log(`Triggering aggregation for source ID: ${SOURCE_ID}`);
  const taskId = await triggerAggregation(SOURCE_ID);
  console.log(`Task ID: ${taskId}`);
  await waitForAggregationComplete(taskId);
  console.log('Aggregation complete.');
});
