import { test } from '@playwright/test';
import { runSourceLifecycle } from '../runSourceLifecycle';
import { COPLEY_SOURCE, COPLEY_TERMINATION_ACCOUNT_FIELDS } from './profile';

// Copley Lawson — Inactive
// Edit STAGE_KEY, then:
//   npx playwright test tests/sources/copley-lawson/inactive.spec.ts --headed
const STAGE_KEY = '';

test('Copley Lawson — Inactive', async ({ page }) => {
  await runSourceLifecycle(page, COPLEY_SOURCE, 'inactive', STAGE_KEY, {
    expectedValues: [
      { field: 'Lifecycle State', expected: 'inactive' },
      { field: 'Identity Profile', expected: 'Copley Lawson' },
    ],
    detailExtras: ['End Date'],
    accountDetailExtras: COPLEY_TERMINATION_ACCOUNT_FIELDS,
  });
});
