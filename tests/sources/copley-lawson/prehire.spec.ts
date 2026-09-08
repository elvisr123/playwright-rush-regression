import { test } from '@playwright/test';
import { runSourceLifecycle } from '../runSourceLifecycle';
import { COPLEY_SOURCE } from './profile';

// Copley Lawson — Prehire
// Field list and highlights from Copley_prehire.pdf (LenaPD T Lambert).
// Paste a Stage Key, then:
//   npx playwright test tests/sources/copley-lawson/prehire.spec.ts --headed
const STAGE_KEY = 'CL-9811223361STCL000PD';

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

const PREHIRE_COPLEY_ACCOUNT_FIELDS = [
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

test('Copley Lawson — Prehire', async ({ page }) => {
  await runSourceLifecycle(page, COPLEY_SOURCE, 'prehire', STAGE_KEY, {
    searchHighlightTexts: ['JDBC', 'Enabled'],
    highlightIdentityOnAccess: true,
    detailFields: PREHIRE_DETAIL_FIELDS,
    accountDetailFields: PREHIRE_COPLEY_ACCOUNT_FIELDS,
    accountDetailFieldsBySource: {
      IdentityNow: PREHIRE_IDENTITYNOW_ACCOUNT_FIELDS,
      'ServiceNow SaaS': PREHIRE_SERVICENOW_ACCOUNT_FIELDS,
      'TEST RUSH AD': PREHIRE_AD_ACCOUNT_FIELDS,
    },
    accountStatusSources: [COPLEY_SOURCE, 'IdentityNow', 'ServiceNow SaaS', 'TEST RUSH AD'],
    accountDetailSources: [COPLEY_SOURCE, 'IdentityNow', 'ServiceNow SaaS', 'TEST RUSH AD'],
    expectedValues: [
      { field: 'Lifecycle State', expected: 'prehire' },
      { field: 'Identity State', expected: 'ACTIVE' },
      { field: 'Identity Profile', expected: 'Copley Lawson' },
      { field: 'Active Copley Infor', expected: 'Yes' },
      { field: 'Status', expected: 'Enabled' },
      { field: 'IIQDisabled', expected: 'false' },
      { field: 'Primary_Position', expected: 'YES' },
      { field: 'Relationship_Status', expected: 'ACTIVE REGULAR' },
      { field: 'Distinguished Name', expected: 'OU=Staging', matchType: 'contains' },
    ],
  });
});
