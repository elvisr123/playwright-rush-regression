import { test } from '@playwright/test';
import { runSourceLifecycle } from '../runSourceLifecycle';
import { NERM_SOURCE } from './profile';

// Non-Employee Workforce — Futurehire
// No QA PDF in Downloads yet. Paste a Stage Key, then:
//   npx playwright test tests/sources/nerm/futurehire.spec.ts --headed
const STAGE_KEY = '';

test('Non-Employee Workforce — Futurehire', async ({ page }) => {
  await runSourceLifecycle(page, NERM_SOURCE, 'futurehire', STAGE_KEY, {
    expectedValues: [
      { field: 'Lifecycle State', expected: 'futurehire' },
      { field: 'Identity Profile', expected: 'Non-Employee Workforce' },
    ],
  });
});
