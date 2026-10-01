import { test } from '@playwright/test';
import { runSourceLifecycle } from '../runSourceLifecycle';
import {
  ELLUCIAN_SOURCE,
  ELLUCIAN_IDENTITYNOW_ACCOUNT_FIELDS,
  ELLUCIAN_SERVICENOW_ACCOUNT_FIELDS,
  ELLUCIAN_AD_ACCOUNT_FIELDS,
} from './profile';

// Ellucian Students — Inactive
// From Ellucian_Students_Inactive.docx (ES-119812309TEST000PDELL).
//   npx playwright test tests/sources/ellucian/inactive.spec.ts --headed
const STAGE_KEY = 'ES-119812309TEST000PDELL';

const INACTIVE_DETAIL_FIELDS = [
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
];

const INACTIVE_ELLUCIAN_ACCOUNT_FIELDS = [
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
  'Manager_Hold',
  'Legal_Hold',
];

const INACTIVE_SERVICENOW_ACCOUNT_FIELDS = [
  ...ELLUCIAN_SERVICENOW_ACCOUNT_FIELDS,
  'locked_out',
  'manager',
];

test('Ellucian Students — Inactive', async ({ page }) => {
  await runSourceLifecycle(page, ELLUCIAN_SOURCE, 'inactive', STAGE_KEY, {
    searchHighlightTexts: ['Ellucian Students', 'JDBC', 'Disabled'],
    highlightIdentityOnAccess: true,
    detailFields: INACTIVE_DETAIL_FIELDS,
    accountDetailFields: INACTIVE_ELLUCIAN_ACCOUNT_FIELDS,
    accountDetailFieldsBySource: {
      IdentityNow: ELLUCIAN_IDENTITYNOW_ACCOUNT_FIELDS,
      'ServiceNow SaaS': INACTIVE_SERVICENOW_ACCOUNT_FIELDS,
      'TEST RUSH AD': ELLUCIAN_AD_ACCOUNT_FIELDS,
    },
    accountStatusSources: [ELLUCIAN_SOURCE, 'IdentityNow', 'ServiceNow SaaS', 'TEST RUSH AD'],
    accountDetailSources: [ELLUCIAN_SOURCE, 'IdentityNow', 'ServiceNow SaaS', 'TEST RUSH AD'],
    expectedValues: [
      { field: 'Lifecycle State', expected: 'inactive' },
      { field: 'Identity State', expected: 'INACTIVE_SHORT_TERM' },
      { field: 'Identity Profile', expected: 'Ellucian Students' },
      { field: 'Active Student', expected: 'No' },
      { field: 'Status', expected: 'Disabled' },
      { field: 'IIQDisabled', expected: 'true' },
      { field: 'Primary_Position', expected: 'Yes' },
    ],
  });
});
