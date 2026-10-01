import { test } from '@playwright/test';
import { runSourceLifecycle } from '../runSourceLifecycle';
import { WORKDAY_SOURCE, WORKDAY_ACCOUNT_SOURCE } from './profile';

// RUSH Workday — Processing
//   npx playwright test tests/sources/rush-workday/processing.spec.ts --headed
const STAGE_KEY = 'WD-953141325ER';

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
];

const PROCESSING_WORKDAY_ACCOUNT_FIELDS = [
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

const PROCESSING_IDENTITYNOW_ACCOUNT_FIELDS = [
  'Name',
  'Native Identity',
  'Identity',
  'Source Name',
  'Status',
];

const PROCESSING_SERVICENOW_ACCOUNT_FIELDS = [
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

const PROCESSING_AD_ACCOUNT_FIELDS = [
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

test('RUSH Workday — Processing — Beatrice Gonzalez', async ({ page }) => {
  await runSourceLifecycle(page, WORKDAY_SOURCE, 'processing', STAGE_KEY, {
    searchHighlightTexts: ['Rush Workday', 'RUSH Workday', 'Enabled', 'Disabled'],
    highlightIdentityOnAccess: true,
    detailFields: PROCESSING_DETAIL_FIELDS,
    accountDetailFields: PROCESSING_WORKDAY_ACCOUNT_FIELDS,
    accountDetailFieldsBySource: {
      [WORKDAY_ACCOUNT_SOURCE]: PROCESSING_WORKDAY_ACCOUNT_FIELDS,
      [WORKDAY_SOURCE]: PROCESSING_WORKDAY_ACCOUNT_FIELDS,
      IdentityNow: PROCESSING_IDENTITYNOW_ACCOUNT_FIELDS,
      'ServiceNow SaaS': PROCESSING_SERVICENOW_ACCOUNT_FIELDS,
      'TEST RUSH AD': PROCESSING_AD_ACCOUNT_FIELDS,
    },
    accountStatusSources: [WORKDAY_ACCOUNT_SOURCE, WORKDAY_SOURCE, 'IdentityNow', 'ServiceNow SaaS', 'TEST RUSH AD'],
    accountDetailSources: [WORKDAY_ACCOUNT_SOURCE, WORKDAY_SOURCE, 'IdentityNow', 'ServiceNow SaaS', 'TEST RUSH AD'],
    expectedValues: [
      { field: 'Lifecycle State', expected: 'processing' },
      { field: 'Identity Profile', expected: 'RUSH Workday' },
      { field: 'Relationship_Status', expected: 'ACTIVE REGULAR', allowed: ['ACTIVE', 'A'] },
    ],
  });
});
