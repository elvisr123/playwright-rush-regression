import { test } from '@playwright/test';
import { runSourceLifecycle } from '../runSourceLifecycle';
import { NERM_SOURCE } from './profile';

// Non-Employee Workforce — Processing
// From Non-Employee workforce_Proccessing.docx (NE-29983300TEST000PDELL).
//   npx playwright test tests/sources/nerm/processing.spec.ts --headed
const STAGE_KEY = 'NE-29983300TEST000PDELL';

const PROCESSING_DETAIL_FIELDS = [
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
  'Active NonEmployee',
  'AD GUID',
  'Correlation Key',
  'Distinguished Name',
  'Employee ID',
  'Employee Type',
  'Manager DN',
  'Manager Snow Sys ID',
  'Manager SNOW Sys Id',
  'Snow Sys ID',
  'SNOW Sys Id',
  'UPN',
  'User Type',
  'Relationship Status',
  'Legal Hold',
];

const PROCESSING_NERM_ACCOUNT_FIELDS = [
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
  'Legal_Hold',
];

const PROCESSING_IDENTITYNOW_ACCOUNT_FIELDS = [
  'Name',
  'Native Identity',
  'Identity',
  'Source Name',
  'Status',
];

test('Non-Employee Workforce — Processing', async ({ page }) => {
  await runSourceLifecycle(page, NERM_SOURCE, 'processing', STAGE_KEY, {
    searchHighlightTexts: ['Non-Employee Workforce', 'JDBC', 'Enabled', 'Disabled'],
    highlightIdentityOnAccess: true,
    detailFields: PROCESSING_DETAIL_FIELDS,
    accountDetailFields: PROCESSING_NERM_ACCOUNT_FIELDS,
    accountDetailFieldsBySource: {
      IdentityNow: PROCESSING_IDENTITYNOW_ACCOUNT_FIELDS,
    },
    accountStatusSources: [NERM_SOURCE, 'IdentityNow'],
    accountDetailSources: [NERM_SOURCE, 'IdentityNow'],
    expectedValues: [
      { field: 'Lifecycle State', expected: 'processing' },
      { field: 'Identity Profile', expected: 'Non-Employee Workforce' },
      { field: 'Employee Type', expected: 'Non-Employee' },
      { field: 'Relationship_Status', expected: 'ACTIVE', allowed: ['ACTIVE REGULAR', 'A'] },
    ],
  });
});
