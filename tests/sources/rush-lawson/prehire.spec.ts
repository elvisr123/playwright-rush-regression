import { test } from '@playwright/test';
import { runSourceLifecycle } from '../runSourceLifecycle';
import { RUSH_SOURCE } from './profile';

// RUSH Lawson — Prehire
// Field list and highlights from Rush_Lawson_Prehire.pdf (RL-981000986TESTCL000PD).
//   npx playwright test tests/sources/rush-lawson/prehire.spec.ts --headed
const STAGE_KEY = 'RL-981000986TESTCL000PD';

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
  'Active Rush Infor',
  'AD GUID',
  'Correlation Key',
  'Distinguished Name',
  'Employee ID',
  'Manager DN',
  'Manager Snow Sys ID',
  'Snow Sys ID',
  'UPN',
  'User Type',
  'Relationship Status',
  'Legal Hold',
  'Manager Hold',
];

const PREHIRE_RUSH_ACCOUNT_FIELDS = [
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

test('RUSH Lawson — Prehire', async ({ page }) => {
  await runSourceLifecycle(page, RUSH_SOURCE, 'prehire', STAGE_KEY, {
    searchHighlightTexts: ['JDBC', 'Enabled'],
    highlightIdentityOnAccess: true,
    detailFields: PREHIRE_DETAIL_FIELDS,
    accountDetailFields: PREHIRE_RUSH_ACCOUNT_FIELDS,
    accountDetailFieldsBySource: {
      IdentityNow: PREHIRE_IDENTITYNOW_ACCOUNT_FIELDS,
      'ServiceNow SaaS': PREHIRE_SERVICENOW_ACCOUNT_FIELDS,
      'TEST RUSH AD': PREHIRE_AD_ACCOUNT_FIELDS,
    },
    accountStatusSources: [RUSH_SOURCE, 'IdentityNow', 'ServiceNow SaaS', 'TEST RUSH AD'],
    accountDetailSources: [RUSH_SOURCE, 'IdentityNow', 'ServiceNow SaaS', 'TEST RUSH AD'],
    expectedValues: [
      { field: 'Lifecycle State', expected: 'prehire' },
      { field: 'Identity State', expected: 'ACTIVE' },
      { field: 'Identity Profile', expected: 'RUSH Lawson' },
      { field: 'Active Rush Infor', expected: 'Yes' },
      { field: 'Status', expected: 'Enabled' },
      { field: 'IIQDisabled', expected: 'false' },
      { field: 'Primary_Position', expected: 'Yes' },
      { field: 'Relationship_Status', expected: 'ACTIVE REGULAR' },
      { field: 'User Type', expected: 'RCMC' },
      { field: 'Distinguished Name', expected: 'OU=Staging', matchType: 'contains' },
      { field: 'Manager DN', expected: 'OU=Terminated', matchType: 'contains' },
    ],
  });
});
