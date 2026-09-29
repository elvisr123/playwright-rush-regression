import { test } from '@playwright/test';
import { runSourceLifecycle } from '../runSourceLifecycle';
import { NERM_SOURCE } from './profile';

// Non-Employee Workforce — Rehire
// No QA PDF in Downloads yet. Paste a Stage Key, then:
//   npx playwright test tests/sources/nerm/rehire.spec.ts --headed
const STAGE_KEY = '';

test('Non-Employee Workforce — Rehire', async ({ page }) => {
  await runSourceLifecycle(page, NERM_SOURCE, 'rehire', STAGE_KEY, {
    expectedValues: [
      { field: 'Lifecycle State', expected: 'rehire' },
      { field: 'Identity Profile', expected: 'Non-Employee Workforce' },
    ],
    detailExtras: ['Start Date', 'End Date'],
  });
});
