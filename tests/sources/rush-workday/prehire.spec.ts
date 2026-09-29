import { test } from '@playwright/test';
import { runSourceLifecycle } from '../runSourceLifecycle';
import { WORKDAY_SOURCE, WORKDAY_ACCOUNT_SOURCE } from './profile';
import { LOCAL_IDENTITIES } from '../../config/localIdentities';

// RUSH Workday — Prehire
// Same screenshot field list as RUSH Lawson Prehire.
// Identities come from tests/config/identities.local.json (workdayPrehire).
//   npx playwright test tests/sources/rush-workday/prehire.spec.ts --headed
const PREHIRE_CASES = LOCAL_IDENTITIES.workdayPrehire ?? [];

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

const PREHIRE_WORKDAY_ACCOUNT_FIELDS = [
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

for (const { name, stageKey } of PREHIRE_CASES) {
  test(`RUSH Workday — Prehire — ${name}`, async ({ page }) => {
    await runSourceLifecycle(page, WORKDAY_SOURCE, 'prehire', stageKey, {
    searchHighlightTexts: ['Rush Workday', 'RUSH Workday', 'Enabled'],
    highlightIdentityOnAccess: true,
    detailFields: PREHIRE_DETAIL_FIELDS,
    accountDetailFields: PREHIRE_WORKDAY_ACCOUNT_FIELDS,
    accountDetailFieldsBySource: {
      [WORKDAY_ACCOUNT_SOURCE]: PREHIRE_WORKDAY_ACCOUNT_FIELDS,
      [WORKDAY_SOURCE]: PREHIRE_WORKDAY_ACCOUNT_FIELDS,
      IdentityNow: PREHIRE_IDENTITYNOW_ACCOUNT_FIELDS,
      'ServiceNow SaaS': PREHIRE_SERVICENOW_ACCOUNT_FIELDS,
      'TEST RUSH AD': PREHIRE_AD_ACCOUNT_FIELDS,
    },
    accountStatusSources: [WORKDAY_ACCOUNT_SOURCE, WORKDAY_SOURCE, 'IdentityNow', 'ServiceNow SaaS', 'TEST RUSH AD'],
    accountDetailSources: [WORKDAY_ACCOUNT_SOURCE, WORKDAY_SOURCE, 'IdentityNow', 'ServiceNow SaaS', 'TEST RUSH AD'],
    expectedValues: [
      { field: 'Lifecycle State', expected: 'prehire' },
      { field: 'Identity State', expected: 'ACTIVE' },
      { field: 'Identity Profile', expected: 'RUSH Workday' },
      { field: 'Active Workday', expected: 'Yes' },
      { field: 'Status', expected: 'Enabled' },
      { field: 'IIQDisabled', expected: 'false' },
      { field: 'Primary_Position', expected: 'Yes' },
      { field: 'Relationship_Status', expected: 'ACTIVE REGULAR', allowed: ['ACTIVE', 'A'] },
      { field: 'User Type', expected: 'RCMC' },
      { field: 'Distinguished Name', expected: 'OU=Staging', matchType: 'contains' },
    ],
  });
  });
}
