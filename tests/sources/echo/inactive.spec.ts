import { test } from '@playwright/test';
import { runSourceLifecycle } from '../runSourceLifecycle';
import {
  ECHO_SOURCE,
  ECHO_IDENTITYNOW_ACCOUNT_FIELDS,
  ECHO_SERVICENOW_ACCOUNT_FIELDS,
  ECHO_AD_ACCOUNT_FIELDS,
} from './profile';

// ECHO Credentialed Providers — Inactive
// From Echo_Credentialed_Prvoiders_Inactive.docx (EC-1989899TESTEC334PD).
//   npx playwright test tests/sources/echo/inactive.spec.ts --headed
const STAGE_KEY = 'EC-1989899TESTEC334PD';

const INACTIVE_DETAIL_FIELDS = [
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

const INACTIVE_ECHO_ACCOUNT_FIELDS = [
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

const INACTIVE_SERVICENOW_ACCOUNT_FIELDS = [
  ...ECHO_SERVICENOW_ACCOUNT_FIELDS,
  'locked_out',
];

test('ECHO Credentialed Providers — Inactive', async ({ page }) => {
  await runSourceLifecycle(page, ECHO_SOURCE, 'inactive', STAGE_KEY, {
    searchHighlightTexts: ['ECHO Credentialed Providers', 'Echo', 'Disabled'],
    highlightIdentityOnAccess: true,
    detailFields: INACTIVE_DETAIL_FIELDS,
    accountDetailFields: INACTIVE_ECHO_ACCOUNT_FIELDS,
    accountDetailFieldsBySource: {
      IdentityNow: ECHO_IDENTITYNOW_ACCOUNT_FIELDS,
      'ServiceNow SaaS': INACTIVE_SERVICENOW_ACCOUNT_FIELDS,
      'TEST RUSH AD': ECHO_AD_ACCOUNT_FIELDS,
    },
    accountStatusSources: [ECHO_SOURCE, 'IdentityNow', 'ServiceNow SaaS', 'TEST RUSH AD'],
    accountDetailSources: [ECHO_SOURCE, 'IdentityNow', 'ServiceNow SaaS', 'TEST RUSH AD'],
    expectedValues: [
      { field: 'Lifecycle State', expected: 'inactive' },
      { field: 'Identity State', expected: 'INACTIVE_SHORT_TERM' },
      { field: 'Identity Profile', expected: 'ECHO Credentialed Providers' },
      { field: 'Active Provider', expected: 'No' },
      { field: 'Status', expected: 'Disabled' },
      { field: 'IIQDisabled', expected: 'true' },
      { field: 'Primary_Position', expected: 'Yes' },
    ],
  });
});
