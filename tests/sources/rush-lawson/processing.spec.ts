import { test } from '@playwright/test';
import { runSourceLifecycle } from '../runSourceLifecycle';
import { RUSH_SOURCE } from './profile';

// RUSH Lawson — Processing
// Same screenshot path as RUSH Workday processing. Primary Position is NO.
//   npx playwright test tests/sources/rush-lawson/processing.spec.ts --headed
const STAGE_KEY = 'RL-9512088329ER';

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
  'Active Rush Infor',
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

const PROCESSING_RUSH_ACCOUNT_FIELDS = [
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

test('RUSH Lawson — Processing', async ({ page }) => {
  await runSourceLifecycle(page, RUSH_SOURCE, 'processing', STAGE_KEY, {
    searchHighlightTexts: ['JDBC', 'Enabled', 'Disabled'],
    highlightIdentityOnAccess: true,
    detailFields: PROCESSING_DETAIL_FIELDS,
    accountDetailFields: PROCESSING_RUSH_ACCOUNT_FIELDS,
    accountDetailFieldsBySource: {
      IdentityNow: PROCESSING_IDENTITYNOW_ACCOUNT_FIELDS,
      'ServiceNow SaaS': PROCESSING_SERVICENOW_ACCOUNT_FIELDS,
      'TEST RUSH AD': PROCESSING_AD_ACCOUNT_FIELDS,
    },
    accountStatusSources: [RUSH_SOURCE, 'IdentityNow', 'ServiceNow SaaS', 'TEST RUSH AD'],
    accountDetailSources: [RUSH_SOURCE, 'IdentityNow', 'ServiceNow SaaS', 'TEST RUSH AD'],
    expectedValues: [
      { field: 'Lifecycle State', expected: 'processing' },
      { field: 'Identity Profile', expected: 'RUSH Lawson' },
      { field: 'Primary_Position', expected: 'NO', allowed: ['No', 'N'] },
      { field: 'Relationship_Status', expected: 'ACTIVE REGULAR', allowed: ['ACTIVE', 'A'] },
    ],
  });
});
