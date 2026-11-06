import { test } from '@playwright/test';
import { runSourceLifecycle } from '../runSourceLifecycle';
import { COPLEY_SOURCE } from './profile';
import { resolveStageKey } from '../../config/batch';

// Copley Lawson — Futurehire
// Field list from Copley_Futurehire.docx. Paste a Stage Key, then:
//   npx playwright test tests/sources/copley-lawson/futurehire.spec.ts --headed
// Stage_Key comes from temp/batch_manifest.json once the 2026-11-06
// batch exists (tests/sql/create-batch-identities.spec.ts). The literal
// below is the fallback used when there is no manifest entry.
const STAGE_KEY = resolveStageKey('copley', 'futurehire', 'CL-98713241TESTCL000PD');

const FUTUREHIRE_DETAIL_FIELDS = [
  'Email Address',
  'Account Name',
  'Manager',
  'Lifecycle State',
  'Identity State',
  'Identity Profile',
  'Display Name',
  'Email',
  'End Date',
  'Start Date',
  'Username',
  'User Name',
  'Active Copley Infor',
  'AD GUID',
  'Correlation Key',
  'Distinguished Name',
  'Employee ID',
  'Manager DN',
  'Manager Snow Sys ID',
  'Snow Sys ID',
  'UPN',
];

const FUTUREHIRE_COPLEY_ACCOUNT_FIELDS = [
  'Name',
  'Native Identity',
  'Identity',
  'Source Name',
  'Status',
  'Stage_Key',
  'Correlation_Key',
  'Work_Email',
  'SamAccountName',
  'Start_Date',
  'End_Date',
  'Primary_Position',
  'IIQDisabled',
  'AD_Guid',
  'Relationship_Status',
  'Manager_name',
];

const FUTUREHIRE_IDENTITYNOW_ACCOUNT_FIELDS = [
  'Name',
  'Native Identity',
  'Identity',
  'Source Name',
  'Status',
];

test('Copley Lawson — Futurehire', async ({ page }) => {
  await runSourceLifecycle(page, COPLEY_SOURCE, 'futurehire', STAGE_KEY, {
    searchHighlightTexts: ['JDBC', 'Disabled'],
    highlightIdentityOnAccess: true,
    detailFields: FUTUREHIRE_DETAIL_FIELDS,
    accountDetailFields: FUTUREHIRE_COPLEY_ACCOUNT_FIELDS,
    accountDetailFieldsBySource: {
      IdentityNow: FUTUREHIRE_IDENTITYNOW_ACCOUNT_FIELDS,
    },
    accountStatusSources: [COPLEY_SOURCE, 'IdentityNow'],
    accountDetailSources: [COPLEY_SOURCE, 'IdentityNow'],
    expectedValues: [
      { field: 'Lifecycle State', expected: 'futurehire' },
      { field: 'Identity Profile', expected: 'Copley Lawson' },
      { field: 'Status', expected: 'Disabled' },
    ],
  });
});
