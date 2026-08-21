import { test } from '@playwright/test';
import { runSourceLifecycle } from '../runSourceLifecycle';
import { COPLEY_SOURCE } from './profile';

// Copley Lawson — Active  (Copley_Lawson_003)
//   npx playwright test tests/sources/copley-lawson/active.spec.ts --headed
const STAGE_KEY = 'CL-95129456TESTCL560ER';

test('Copley Lawson — Active', async ({ page }) => {
  await runSourceLifecycle(page, COPLEY_SOURCE, 'active', STAGE_KEY, {
    expectedValues: [
      { field: 'Lifecycle State', expected: 'active' },
      { field: 'Identity State', expected: 'ACTIVE' },
      { field: 'Identity Profile', expected: 'Copley Lawson' },
      { field: 'Active Copley Infor', expected: 'Yes' },
      { field: 'Primary_Position', expected: 'Yes' },
      { field: 'Distinguished Name', expected: 'OU=Staging', matchType: 'contains' },
      { field: 'Manager DN', expected: 'OU=Users', matchType: 'contains' },
    ],
  });
});

