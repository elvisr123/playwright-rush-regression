import { test } from '@playwright/test';
import { runSourceLifecycle } from '../runSourceLifecycle';
import { NERM_SOURCE } from './profile';

// Non-Employee Workforce — Termed
// Field list and highlights from Non-Employee_workforce_Term.pdf (NE-19828886TEST000PDPPL).
//   npx playwright test tests/sources/nerm/termed.spec.ts --headed
const STAGE_KEY = 'NE-19828886TEST000PDPPL';

const TERMED_DETAIL_FIELDS = [
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
  'Manager Hold',
];

const TERMED_NERM_ACCOUNT_FIELDS = [
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

const TERMED_IDENTITYNOW_ACCOUNT_FIELDS = [
  'Name',
  'Native Identity',
  'Identity',
  'Source Name',
  'Status',
];

const TERMED_SERVICENOW_ACCOUNT_FIELDS = [
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

const TERMED_AD_ACCOUNT_FIELDS = [
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

test('Non-Employee Workforce — Termed', async ({ page }) => {
  await runSourceLifecycle(page, NERM_SOURCE, 'termed', STAGE_KEY, {
    searchHighlightTexts: ['JDBC', 'Disabled'],
    highlightIdentityOnAccess: true,
    detailFields: TERMED_DETAIL_FIELDS,
    accountDetailFields: TERMED_NERM_ACCOUNT_FIELDS,
    accountDetailFieldsBySource: {
      IdentityNow: TERMED_IDENTITYNOW_ACCOUNT_FIELDS,
      'ServiceNow SaaS': TERMED_SERVICENOW_ACCOUNT_FIELDS,
      'TEST RUSH AD': TERMED_AD_ACCOUNT_FIELDS,
    },
    accountStatusSources: [NERM_SOURCE, 'IdentityNow', 'ServiceNow SaaS', 'TEST RUSH AD'],
    accountDetailSources: [NERM_SOURCE, 'IdentityNow', 'ServiceNow SaaS', 'TEST RUSH AD'],
    expectedValues: [
      { field: 'Lifecycle State', expected: 'termed' },
      { field: 'Identity State', expected: 'INACTIVE_SHORT_TERM' },
      { field: 'Identity Profile', expected: 'Non-Employee Workforce' },
      { field: 'Active NonEmployee', expected: 'No' },
      { field: 'Status', expected: 'Disabled' },
      { field: 'IIQDisabled', expected: 'true' },
      { field: 'Primary_Position', expected: 'Yes' },
      { field: 'Employee Type', expected: 'Non-Employee' },
      { field: 'Distinguished Name', expected: 'OU=Staging', matchType: 'contains' },
    ],
  });
});
