import { test } from '@playwright/test';
import { runSourceLifecycle } from '../runSourceLifecycle';
import {
  ECHO_SOURCE,
  ECHO_IDENTITYNOW_ACCOUNT_FIELDS,
  ECHO_SERVICENOW_ACCOUNT_FIELDS,
  ECHO_AD_ACCOUNT_FIELDS,
} from './profile';

// ECHO Credentialed Providers — Prehire
// From Echo Credentialed_Provider_Prehire.docx (EC-0981298TESTEC334PG).
//   npx playwright test tests/sources/echo/prehire.spec.ts --headed
const STAGE_KEY = 'EC-0981298TESTEC334PG';

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
  'Active Provider',
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

const PREHIRE_ECHO_ACCOUNT_FIELDS = [
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

test('ECHO Credentialed Providers — Prehire', async ({ page }) => {
  await runSourceLifecycle(page, ECHO_SOURCE, 'prehire', STAGE_KEY, {
    searchHighlightTexts: ['ECHO Credentialed Providers', 'Echo', 'Enabled'],
    highlightIdentityOnAccess: true,
    detailFields: PREHIRE_DETAIL_FIELDS,
    accountDetailFields: PREHIRE_ECHO_ACCOUNT_FIELDS,
    accountDetailFieldsBySource: {
      IdentityNow: ECHO_IDENTITYNOW_ACCOUNT_FIELDS,
      'ServiceNow SaaS': ECHO_SERVICENOW_ACCOUNT_FIELDS,
      'TEST RUSH AD': ECHO_AD_ACCOUNT_FIELDS,
    },
    accountStatusSources: [ECHO_SOURCE, 'IdentityNow', 'ServiceNow SaaS', 'TEST RUSH AD'],
    accountDetailSources: [ECHO_SOURCE, 'IdentityNow', 'ServiceNow SaaS', 'TEST RUSH AD'],
    expectedValues: [
      { field: 'Lifecycle State', expected: 'prehire' },
      { field: 'Identity State', expected: 'ACTIVE' },
      { field: 'Identity Profile', expected: 'ECHO Credentialed Providers' },
      { field: 'Active Provider', expected: 'Yes' },
      { field: 'Status', expected: 'Enabled' },
      { field: 'IIQDisabled', expected: 'false' },
      { field: 'Primary_Position', expected: 'Yes' },
    ],
  });
});
