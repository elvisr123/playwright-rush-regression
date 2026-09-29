import { test } from '@playwright/test';
import { runSourceLifecycle } from '../runSourceLifecycle';
import { WORKDAY_SOURCE, WORKDAY_ACCOUNT_SOURCE } from './profile';

// RUSH Workday — Termed
// Same screenshot field list as RUSH Lawson Termed. Paste a Stage Key when an identity exists.
//   npx playwright test tests/sources/rush-workday/termed.spec.ts --headed
const STAGE_KEY = '';

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
  'User Type',
  'Relationship Status',
  'Legal Hold',
  'Manager Hold',
];

const TERMED_WORKDAY_ACCOUNT_FIELDS = [
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

test('RUSH Workday — Termed', async ({ page }) => {
  await runSourceLifecycle(page, WORKDAY_SOURCE, 'termed', STAGE_KEY, {
    searchHighlightTexts: ['Rush Workday', 'RUSH Workday', 'Disabled'],
    highlightIdentityOnAccess: true,
    detailFields: TERMED_DETAIL_FIELDS,
    accountDetailFields: TERMED_WORKDAY_ACCOUNT_FIELDS,
    accountDetailFieldsBySource: {
      [WORKDAY_ACCOUNT_SOURCE]: TERMED_WORKDAY_ACCOUNT_FIELDS,
      [WORKDAY_SOURCE]: TERMED_WORKDAY_ACCOUNT_FIELDS,
      IdentityNow: TERMED_IDENTITYNOW_ACCOUNT_FIELDS,
      'ServiceNow SaaS': TERMED_SERVICENOW_ACCOUNT_FIELDS,
      'TEST RUSH AD': TERMED_AD_ACCOUNT_FIELDS,
    },
    accountStatusSources: [WORKDAY_ACCOUNT_SOURCE, WORKDAY_SOURCE, 'IdentityNow', 'ServiceNow SaaS', 'TEST RUSH AD'],
    accountDetailSources: [WORKDAY_ACCOUNT_SOURCE, WORKDAY_SOURCE, 'IdentityNow', 'ServiceNow SaaS', 'TEST RUSH AD'],
    expectedValues: [
      { field: 'Lifecycle State', expected: 'termed' },
      { field: 'Identity State', expected: 'INACTIVE_SHORT_TERM' },
      { field: 'Identity Profile', expected: 'RUSH Workday' },
      { field: 'Active Workday', expected: 'No' },
      { field: 'Status', expected: 'Disabled' },
      { field: 'IIQDisabled', expected: 'true' },
      { field: 'Primary_Position', expected: 'Yes' },
      { field: 'Relationship_Status', expected: 'ACTIVE REGULAR', allowed: ['ACTIVE', 'A'] },
      { field: 'User Type', expected: 'RCMC' },
      { field: 'Distinguished Name', expected: 'OU=Staging', matchType: 'contains' },
    ],
  });
});
