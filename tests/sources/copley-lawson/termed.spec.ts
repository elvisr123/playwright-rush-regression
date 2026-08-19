import { test } from '@playwright/test';
import { runSourceLifecycle } from '../runSourceLifecycle';
import { COPLEY_SOURCE, COPLEY_TERMINATION_ACCOUNT_FIELDS } from './profile';

// Copley Lawson — Termed
// Edit STAGE_KEY, then:
//   npx playwright test tests/sources/copley-lawson/termed.spec.ts --headed
// If the on-screen Lifecycle State is "terminated" instead of "termed", change expected below.
const STAGE_KEY = '';

test('Copley Lawson — Termed', async ({ page }) => {
  await runSourceLifecycle(page, COPLEY_SOURCE, 'termed', STAGE_KEY, {
    expectedValues: [
      { field: 'Lifecycle State', expected: 'termed' },
      { field: 'Identity Profile', expected: 'Copley Lawson' },
    ],
    detailExtras: ['End Date'],
    accountDetailExtras: COPLEY_TERMINATION_ACCOUNT_FIELDS,
  });
});
