import { test } from '@playwright/test';
import { runSourceLifecycle } from '../runSourceLifecycle';
import { COPLEY_SOURCE } from './profile';

// Copley Lawson — Prehire
// Edit STAGE_KEY, then:
//   npx playwright test tests/sources/copley-lawson/prehire.spec.ts --headed
const STAGE_KEY = '';

test('Copley Lawson — Prehire', async ({ page }) => {
  await runSourceLifecycle(page, COPLEY_SOURCE, 'prehire', STAGE_KEY, {
    expectedValues: [
      { field: 'Lifecycle State', expected: 'prehire' },
      { field: 'Identity Profile', expected: 'Copley Lawson' },
    ],
    detailExtras: ['Start Date'],
  });
});
