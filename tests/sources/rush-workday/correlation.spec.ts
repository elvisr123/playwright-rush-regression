import { test } from '@playwright/test';
import { runRegressionCase } from '../../helpers/run_regression_case';
import { WORKDAY_SOURCE, WORKDAY_ACCOUNT_SOURCE } from './profile';
import { RUSH_SOURCE } from '../rush-lawson/profile';

// Workday_Correlation_001 — Process Identity through AD.
// Highlight Correlation Key only on identity details and HR source accounts.
// Primary Workday account is highlighted on the Accounts tab.
//   npx playwright test tests/sources/rush-workday/correlation.spec.ts --headed
const STAGE_KEY = 'WD-930901CB6EAAFEFTESTAPSE';

const CORRELATION_ONLY = ['Correlation_Key'];
const NO_HIGHLIGHT: string[] = [];

test('Workday Correlation 001 — Process Identity to AD', async ({ page }) => {
  test.setTimeout(600_000);
  await runRegressionCase(page, {
    scenarioName: 'Workday_Correlation_001',
    lifecycle: 'active',
    sources: [{ name: WORKDAY_SOURCE, stageKey: STAGE_KEY }],
    omitSearchFromReport: true,
    keepDuplicateAccounts: true,
    skipOuHighlight: true,
    highlightStageKeyOnAccounts: false,
    highlightIdentityOnAccess: false,
    searchHighlightTexts: ['Rush Workday', 'RUSH Workday'],
    detailFields: ['Correlation Key'],
    accountDetailFields: CORRELATION_ONLY,
    accountDetailFieldsBySource: {
      [WORKDAY_ACCOUNT_SOURCE]: CORRELATION_ONLY,
      [WORKDAY_SOURCE]: CORRELATION_ONLY,
      [RUSH_SOURCE]: CORRELATION_ONLY,
      IdentityNow: NO_HIGHLIGHT,
      'ServiceNow SaaS': NO_HIGHLIGHT,
      'TEST RUSH AD': NO_HIGHLIGHT,
    },
    accountStatusSources: [WORKDAY_ACCOUNT_SOURCE, WORKDAY_SOURCE],
    accountDetailSources: [
      WORKDAY_ACCOUNT_SOURCE,
      WORKDAY_SOURCE,
      RUSH_SOURCE,
      'IdentityNow',
      'ServiceNow SaaS',
      'TEST RUSH AD',
    ],
  });
});
