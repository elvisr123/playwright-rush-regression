import { test } from '@playwright/test';
import { runSourceLifecycle } from '../runSourceLifecycle';
import { COPLEY_SOURCE } from './profile';

// Copley Lawson — Inactive
// Field list and highlights from Copley_Inactive.pdf (JosephinePD T Rosas).
// Paste a Stage Key, then:
//   npx playwright test tests/sources/copley-lawson/inactive.spec.ts --headed
const STAGE_KEY = 'CL-98188766261STCL000PD';

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
  'Active Copley Infor',
  'AD GUID',
  'Correlation Key',
  'Distinguished Name',
  'Employee ID',
  'Manager DN',
  'Manager Snow Sys ID',
  'Snow Sys ID',
  'UPN',
  'Legal Hold',
  'Manager Hold',
];

const INACTIVE_COPLEY_ACCOUNT_FIELDS = [
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

const INACTIVE_IDENTITYNOW_ACCOUNT_FIELDS = [
  'Name',
  'Native Identity',
  'Identity',
  'Source Name',
  'Status',
];

const INACTIVE_SERVICENOW_ACCOUNT_FIELDS = [
  'Name',
  'Native Identity',
  'Identity',
  'Source Name',
  'Status',
  'user_name',
  'sys_id',
  'email',
  'employee_number',
  'active',
  'locked_out',
];

const INACTIVE_AD_ACCOUNT_FIELDS = [
  'Name',
  'Native Identity',
  'Identity',
  'Source Name',
  'Status',
  'employeeNumber',
  'displayName',
  'manager',
  'distinguishedName',
  'mail',
  'userPrincipalName',
  'proxyAddresses',
  'extensionAttribute15',
  'sAMAccountName',
  'employeeID',
];

test('Copley Lawson — Inactive', async ({ page }) => {
  await runSourceLifecycle(page, COPLEY_SOURCE, 'inactive', STAGE_KEY, {
    searchHighlightTexts: ['JDBC', 'Disabled'],
    highlightIdentityOnAccess: true,
    detailFields: INACTIVE_DETAIL_FIELDS,
    accountDetailFields: INACTIVE_COPLEY_ACCOUNT_FIELDS,
    accountDetailFieldsBySource: {
      IdentityNow: INACTIVE_IDENTITYNOW_ACCOUNT_FIELDS,
      'ServiceNow SaaS': INACTIVE_SERVICENOW_ACCOUNT_FIELDS,
      'TEST RUSH AD': INACTIVE_AD_ACCOUNT_FIELDS,
    },
    accountStatusSources: [COPLEY_SOURCE, 'IdentityNow', 'ServiceNow SaaS', 'TEST RUSH AD'],
    accountDetailSources: [COPLEY_SOURCE, 'IdentityNow', 'ServiceNow SaaS', 'TEST RUSH AD'],
    expectedValues: [
      { field: 'Lifecycle State', expected: 'inactive' },
      { field: 'Identity State', expected: 'INACTIVE_SHORT_TERM' },
      { field: 'Identity Profile', expected: 'Copley Lawson' },
      { field: 'Active Copley Infor', expected: 'No' },
      { field: 'Status', expected: 'Disabled' },
      { field: 'IIQDisabled', expected: 'true' },
      { field: 'Primary_Position', expected: 'YES' },
      { field: 'Relationship_Status', expected: 'ACTIVE REGULAR' },
      { field: 'Distinguished Name', expected: 'OU=Terminated', matchType: 'contains' },
    ],
  });
});
