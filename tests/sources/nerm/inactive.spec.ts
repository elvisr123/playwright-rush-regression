import { test } from '@playwright/test';
import { runSourceLifecycle } from '../runSourceLifecycle';
import { NERM_SOURCE } from './profile';

// Non-Employee Workforce — Inactive
// Field list and highlights from Non-Employee workforce_Inactive.pdf (NE-198000056TEST000PDPPL).
//   npx playwright test tests/sources/nerm/inactive.spec.ts --headed
const STAGE_KEY = 'NE-198000056TEST000PDPPL';

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
  'Active NonEmployee',
  'AD GUID',
  'Correlation Key',
  'Distinguished Name',
  'Employee ID',
  'Employee Type',
  'Manager DN',
  'Manager Snow Sys ID',
  'Snow Sys ID',
  'UPN',
  'Legal Hold',
];

const INACTIVE_NERM_ACCOUNT_FIELDS = [
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

test('Non-Employee Workforce — Inactive', async ({ page }) => {
  await runSourceLifecycle(page, NERM_SOURCE, 'inactive', STAGE_KEY, {
    searchHighlightTexts: ['JDBC', 'Disabled'],
    highlightIdentityOnAccess: true,
    detailFields: INACTIVE_DETAIL_FIELDS,
    accountDetailFields: INACTIVE_NERM_ACCOUNT_FIELDS,
    accountDetailFieldsBySource: {
      IdentityNow: INACTIVE_IDENTITYNOW_ACCOUNT_FIELDS,
      'ServiceNow SaaS': INACTIVE_SERVICENOW_ACCOUNT_FIELDS,
      'TEST RUSH AD': INACTIVE_AD_ACCOUNT_FIELDS,
    },
    accountStatusSources: [NERM_SOURCE, 'IdentityNow', 'ServiceNow SaaS', 'TEST RUSH AD'],
    accountDetailSources: [NERM_SOURCE, 'IdentityNow', 'ServiceNow SaaS', 'TEST RUSH AD'],
    expectedValues: [
      { field: 'Lifecycle State', expected: 'inactive' },
      { field: 'Identity State', expected: 'INACTIVE_SHORT_TERM' },
      { field: 'Identity Profile', expected: 'Non-Employee Workforce' },
      { field: 'Active NonEmployee', expected: 'No' },
      { field: 'Status', expected: 'Disabled' },
      { field: 'IIQDisabled', expected: 'true' },
      { field: 'Primary_Position', expected: 'Yes' },
      { field: 'Employee Type', expected: 'Non-Employee' },
      { field: 'Distinguished Name', expected: 'OU=Terminated', matchType: 'contains' },
    ],
  });
});
