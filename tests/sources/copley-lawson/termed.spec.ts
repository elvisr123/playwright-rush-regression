import { test } from '@playwright/test';
import { runSourceLifecycle } from '../runSourceLifecycle';
import { COPLEY_SOURCE } from './profile';

// Copley Lawson — Termed
// Field list and highlights from Copley Term.pdf (LeroyPD T Anderson).
// Paste a Stage Key, then:
//   npx playwright test tests/sources/copley-lawson/termed.spec.ts --headed
const STAGE_KEY = 'CL-98123335261STCL000PD';

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

const TERMED_COPLEY_ACCOUNT_FIELDS = [
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

test('Copley Lawson — Termed', async ({ page }) => {
  await runSourceLifecycle(page, COPLEY_SOURCE, 'termed', STAGE_KEY, {
    searchHighlightTexts: ['JDBC', 'Disabled'],
    highlightIdentityOnAccess: true,
    detailFields: TERMED_DETAIL_FIELDS,
    accountDetailFields: TERMED_COPLEY_ACCOUNT_FIELDS,
    accountDetailFieldsBySource: {
      IdentityNow: TERMED_IDENTITYNOW_ACCOUNT_FIELDS,
      'ServiceNow SaaS': TERMED_SERVICENOW_ACCOUNT_FIELDS,
      'TEST RUSH AD': TERMED_AD_ACCOUNT_FIELDS,
    },
    accountStatusSources: [COPLEY_SOURCE, 'IdentityNow', 'ServiceNow SaaS', 'TEST RUSH AD'],
    accountDetailSources: [COPLEY_SOURCE, 'IdentityNow', 'ServiceNow SaaS', 'TEST RUSH AD'],
    expectedValues: [
      { field: 'Lifecycle State', expected: 'termed' },
      { field: 'Identity State', expected: 'ACTIVE' },
      { field: 'Identity Profile', expected: 'Copley Lawson' },
      { field: 'Active Copley Infor', expected: 'No' },
      { field: 'Status', expected: 'Disabled' },
      { field: 'IIQDisabled', expected: 'true' },
      { field: 'Primary_Position', expected: 'YES' },
      { field: 'Relationship_Status', expected: 'ACTIVE REGULAR' },
      { field: 'Distinguished Name', expected: 'OU=Staging', matchType: 'contains' },
    ],
  });
});
