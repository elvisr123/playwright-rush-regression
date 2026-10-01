import { test } from '@playwright/test';
import { runSourceLifecycle } from '../runSourceLifecycle';
import {
  ELLUCIAN_SOURCE,
  ELLUCIAN_IDENTITYNOW_ACCOUNT_FIELDS,
} from './profile';

// Ellucian Students — Processing
// From Ellucian_Student_Processing.docx (ES-11980598TEST000PDELL).
//   npx playwright test tests/sources/ellucian/processing.spec.ts --headed
const STAGE_KEY = 'ES-11980598TEST000PDELL';

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
  'Active Student',
  'AD GUID',
  'Correlation Key',
  'Distinguished Name',
  'Employee ID',
  'Manager DN',
  'Manager Snow Sys ID',
  'Manager SNOW Sys Id',
  'Snow Sys ID',
  'SNOW Sys Id',
  'UPN',
  'User Type',
  'Relationship Status',
];

const PROCESSING_ELLUCIAN_ACCOUNT_FIELDS = [
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

test('Ellucian Students — Processing', async ({ page }) => {
  await runSourceLifecycle(page, ELLUCIAN_SOURCE, 'processing', STAGE_KEY, {
    searchHighlightTexts: ['Ellucian Students', 'JDBC', 'Enabled', 'Disabled'],
    highlightIdentityOnAccess: true,
    detailFields: PROCESSING_DETAIL_FIELDS,
    accountDetailFields: PROCESSING_ELLUCIAN_ACCOUNT_FIELDS,
    accountDetailFieldsBySource: {
      IdentityNow: ELLUCIAN_IDENTITYNOW_ACCOUNT_FIELDS,
    },
    accountStatusSources: [ELLUCIAN_SOURCE, 'IdentityNow'],
    accountDetailSources: [ELLUCIAN_SOURCE, 'IdentityNow'],
    expectedValues: [
      { field: 'Lifecycle State', expected: 'processing' },
      { field: 'Identity Profile', expected: 'Ellucian Students' },
      { field: 'Relationship_Status', expected: 'ACTIVE', allowed: ['ACTIVE REGULAR', 'A'] },
    ],
  });
});
