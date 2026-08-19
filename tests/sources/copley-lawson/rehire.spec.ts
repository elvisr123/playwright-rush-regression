import { test } from '@playwright/test';
import { runSourceLifecycle } from '../runSourceLifecycle';
import { COPLEY_SOURCE } from './profile';

// Copley Lawson — Rehire
// Edit STAGE_KEY, then:
//   npx playwright test tests/sources/copley-lawson/rehire.spec.ts --headed
const STAGE_KEY = '';

test('Copley Lawson — Rehire', async ({ page }) => {
  await runSourceLifecycle(page, COPLEY_SOURCE, 'rehire', STAGE_KEY, {
    expectedValues: [
      { field: 'Lifecycle State', expected: 'rehire' },
      { field: 'Identity Profile', expected: 'Copley Lawson' },
    ],
    detailExtras: ['Start Date', 'End Date'],
  });
});
