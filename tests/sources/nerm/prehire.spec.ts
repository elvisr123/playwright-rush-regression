import { test } from '@playwright/test';
import { runSourceLifecycle } from '../runSourceLifecycle';
import { NERM_SOURCE } from './profile';

// Non-Employee Workforce — Prehire
// Field list and highlights from Non-Employee workforce_prehire.pdf (NE-19822786TEST000PDPPL).
//   npx playwright test tests/sources/nerm/prehire.spec.ts --headed
const STAGE_KEY = 'NE-19822786TEST000PDPPL';

const PREHIRE_DETAIL_FIELDS = [
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

const PREHIRE_NERM_ACCOUNT_FIELDS = [
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

const PREHIRE_IDENTITYNOW_ACCOUNT_FIELDS = [
  'Name',
  'Native Identity',
  'Identity',
  'Source Name',
  'Status',
];

const PREHIRE_SERVICENOW_ACCOUNT_FIELDS = [
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
];

const PREHIRE_AD_ACCOUNT_FIELDS = [
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

test('Non-Employee Workforce — Prehire', async ({ page }) => {
  await runSourceLifecycle(page, NERM_SOURCE, 'prehire', STAGE_KEY, {
    searchHighlightTexts: ['JDBC', 'Enabled'],
    highlightIdentityOnAccess: true,
    detailFields: PREHIRE_DETAIL_FIELDS,
    accountDetailFields: PREHIRE_NERM_ACCOUNT_FIELDS,
    accountDetailFieldsBySource: {
      IdentityNow: PREHIRE_IDENTITYNOW_ACCOUNT_FIELDS,
      'ServiceNow SaaS': PREHIRE_SERVICENOW_ACCOUNT_FIELDS,
      'TEST RUSH AD': PREHIRE_AD_ACCOUNT_FIELDS,
    },
    accountStatusSources: [NERM_SOURCE, 'IdentityNow', 'ServiceNow SaaS', 'TEST RUSH AD'],
    accountDetailSources: [NERM_SOURCE, 'IdentityNow', 'ServiceNow SaaS', 'TEST RUSH AD'],
    expectedValues: [
      { field: 'Lifecycle State', expected: 'prehire' },
      { field: 'Identity State', expected: 'ACTIVE' },
      { field: 'Identity Profile', expected: 'Non-Employee Workforce' },
      { field: 'Active NonEmployee', expected: 'Yes' },
      { field: 'Status', expected: 'Enabled' },
      { field: 'IIQDisabled', expected: 'false' },
      { field: 'Primary_Position', expected: 'Yes' },
      { field: 'Employee Type', expected: 'Non-Employee' },
      { field: 'Distinguished Name', expected: 'OU=Staging', matchType: 'contains' },
      { field: 'Manager DN', expected: 'OU=Terminate', matchType: 'contains' },
    ],
  });
});
