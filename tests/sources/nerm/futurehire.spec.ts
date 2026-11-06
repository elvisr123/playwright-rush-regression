import { test } from '@playwright/test';
import { runSourceLifecycle } from '../runSourceLifecycle';
import { NERM_SOURCE } from './profile';
import { resolveStageKey } from '../../config/batch';

// Non-Employee Workforce — Futurehire
// No QA PDF in Downloads yet. Paste a Stage Key, then:
//   npx playwright test tests/sources/nerm/futurehire.spec.ts --headed
// Stage_Key comes from temp/batch_manifest.json once the 2026-11-06
// batch exists (tests/sql/create-batch-identities.spec.ts). The literal
// below is the fallback used when there is no manifest entry.
const STAGE_KEY = resolveStageKey('nerm', 'futurehire', '');

test('Non-Employee Workforce — Futurehire', async ({ page }) => {
  await runSourceLifecycle(page, NERM_SOURCE, 'futurehire', STAGE_KEY, {
    expectedValues: [
      { field: 'Lifecycle State', expected: 'futurehire' },
      { field: 'Identity Profile', expected: 'Non-Employee Workforce' },
    ],
  });
});
