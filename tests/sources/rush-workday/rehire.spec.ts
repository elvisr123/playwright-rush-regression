import { test } from '@playwright/test';
import { runSourceLifecycle } from '../runSourceLifecycle';
import { WORKDAY_SOURCE, WORKDAY_ACCOUNT_SOURCE } from './profile';

// RUSH Workday — Rehire
// Paste a Stage Key when an identity exists. Empty STAGE_KEY skips the test.
//   npx playwright test tests/sources/rush-workday/rehire.spec.ts --headed
const STAGE_KEY = '';

test('RUSH Workday — Rehire', async ({ page }) => {
  await runSourceLifecycle(page, WORKDAY_SOURCE, 'rehire', STAGE_KEY, {
    searchHighlightTexts: ['Rush Workday', 'RUSH Workday'],
    accountStatusSources: [WORKDAY_ACCOUNT_SOURCE, WORKDAY_SOURCE, 'IdentityNow', 'ServiceNow SaaS', 'TEST RUSH AD'],
    accountDetailSources: [WORKDAY_ACCOUNT_SOURCE, WORKDAY_SOURCE, 'IdentityNow', 'ServiceNow SaaS', 'TEST RUSH AD'],
    expectedValues: [
      { field: 'Lifecycle State', expected: 'rehire' },
      { field: 'Identity Profile', expected: 'RUSH Workday' },
    ],
    detailExtras: ['Start Date', 'End Date'],
  });
});
