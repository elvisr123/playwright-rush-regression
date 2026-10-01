import { test } from '@playwright/test';
import { runSourceLifecycle } from '../runSourceLifecycle';
import { WORKDAY_SOURCE, WORKDAY_ACCOUNT_SOURCE } from './profile';

// RUSH Workday — Active
// Same screenshot field list as RUSH Lawson Active, with Active Workday instead of Active Rush Infor.
// Paste a Stage Key when an identity exists. Empty STAGE_KEY skips the test.
// Selects RUSH Workday (not RUSH Lawson) under Admin → Sources in the sandbox.
//   npx playwright test tests/sources/rush-workday/active.spec.ts --headed
const STAGE_KEY = 'WD-2609165409TESTCL000EE';

const ACTIVE_DETAIL_FIELDS = [
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
  'Active Workday',
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

const ACTIVE_WORKDAY_ACCOUNT_FIELDS = [
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

const ACTIVE_IDENTITYNOW_ACCOUNT_FIELDS = [
  'Name',
  'Native Identity',
  'Identity',
  'Source Name',
  'Status',
];

const ACTIVE_SERVICENOW_ACCOUNT_FIELDS = [
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

const ACTIVE_AD_ACCOUNT_FIELDS = [
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

test('RUSH Workday — Active — Naomi Luna', async ({ page }) => {
  await runSourceLifecycle(page, WORKDAY_SOURCE, 'active', STAGE_KEY, {
    searchHighlightTexts: ['Rush Workday', 'RUSH Workday', 'Enabled'],
    highlightIdentityOnAccess: true,
    detailFields: ACTIVE_DETAIL_FIELDS,
    accountDetailFields: ACTIVE_WORKDAY_ACCOUNT_FIELDS,
    accountDetailFieldsBySource: {
      [WORKDAY_ACCOUNT_SOURCE]: ACTIVE_WORKDAY_ACCOUNT_FIELDS,
      [WORKDAY_SOURCE]: ACTIVE_WORKDAY_ACCOUNT_FIELDS,
      IdentityNow: ACTIVE_IDENTITYNOW_ACCOUNT_FIELDS,
      'ServiceNow SaaS': ACTIVE_SERVICENOW_ACCOUNT_FIELDS,
      'TEST RUSH AD': ACTIVE_AD_ACCOUNT_FIELDS,
    },
    accountStatusSources: [WORKDAY_ACCOUNT_SOURCE, WORKDAY_SOURCE, 'IdentityNow', 'ServiceNow SaaS', 'TEST RUSH AD'],
    accountDetailSources: [WORKDAY_ACCOUNT_SOURCE, WORKDAY_SOURCE, 'IdentityNow', 'ServiceNow SaaS', 'TEST RUSH AD'],
    expectedValues: [
      { field: 'Lifecycle State', expected: 'active' },
      { field: 'Identity State', expected: 'ACTIVE' },
      { field: 'Identity Profile', expected: 'RUSH Workday' },
      { field: 'Active Workday', expected: 'Yes' },
      { field: 'Status', expected: 'Enabled' },
      { field: 'IIQDisabled', expected: 'false' },
      { field: 'Primary_Position', expected: 'Yes' },
      { field: 'Distinguished Name', expected: 'OU=Staging', matchType: 'contains' },
    ],
  });
});
