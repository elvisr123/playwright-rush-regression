import { test } from '@playwright/test';
import { runSourceLifecycle } from '../runSourceLifecycle';
import { RUSH_SOURCE } from './profile';

// RUSH Lawson — Rehire
// Edit STAGE_KEY, then:
//   npx playwright test tests/sources/rush-lawson/rehire.spec.ts --headed
const STAGE_KEY = '';

test('RUSH Lawson — Rehire', async ({ page }) => {
  await runSourceLifecycle(page, RUSH_SOURCE, 'rehire', STAGE_KEY, {
    expectedValues: [
      { field: 'Lifecycle State', expected: 'rehire' },
      { field: 'Identity Profile', expected: 'RUSH Lawson' },
    ],
    detailExtras: ['Start Date', 'End Date'],
  });
});
