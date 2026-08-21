import { test } from '@playwright/test';
import { runSourceLifecycle } from './sources/runSourceLifecycle';
import { COPLEY_SOURCE } from './sources/copley-lawson/profile';

// Quick single-run entry. Same path as tests/sources/copley-lawson/active.spec.ts.
// Other Copley lifecycles:
//   npx playwright test tests/sources/copley-lawson/futurehire.spec.ts --headed
//   npx playwright test tests/sources/copley-lawson --headed
const STAGE_KEY = 'CL-9890777461STCL000PD';

test('Copley Lawson — Active (adhoc)', async ({ page }) => {
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
