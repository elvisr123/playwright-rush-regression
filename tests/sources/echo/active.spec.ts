import { test } from '@playwright/test';
import { runSourceLifecycle } from '../runSourceLifecycle';
import {
  ECHO_SOURCE,
  ECHO_IDENTITYNOW_ACCOUNT_FIELDS,
  ECHO_SERVICENOW_ACCOUNT_FIELDS,
  ECHO_AD_ACCOUNT_FIELDS,
} from './profile';

// ECHO Credentialed Providers — Active
// From Echo_credentialed_Prvoiders_Active.docx (RL-98100122712TESTCL000PD).
//   npx playwright test tests/sources/echo/active.spec.ts --headed
const STAGE_KEY = 'RL-98100122712TESTCL000PD';

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

const ACTIVE_ECHO_ACCOUNT_FIELDS = [
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

test('ECHO Credentialed Providers — Active', async ({ page }) => {
  await runSourceLifecycle(page, ECHO_SOURCE, 'active', STAGE_KEY, {
    searchHighlightTexts: ['ECHO Credentialed Providers', 'Echo', 'Enabled'],
    highlightIdentityOnAccess: true,
    detailFields: ACTIVE_DETAIL_FIELDS,
    accountDetailFields: ACTIVE_ECHO_ACCOUNT_FIELDS,
    accountDetailFieldsBySource: {
      IdentityNow: ECHO_IDENTITYNOW_ACCOUNT_FIELDS,
      'ServiceNow SaaS': ECHO_SERVICENOW_ACCOUNT_FIELDS,
      'TEST RUSH AD': ECHO_AD_ACCOUNT_FIELDS,
    },
    accountStatusSources: [ECHO_SOURCE, 'IdentityNow', 'ServiceNow SaaS', 'TEST RUSH AD'],
    accountDetailSources: [ECHO_SOURCE, 'IdentityNow', 'ServiceNow SaaS', 'TEST RUSH AD'],
    expectedValues: [
      { field: 'Lifecycle State', expected: 'active' },
      { field: 'Identity State', expected: 'ACTIVE' },
      { field: 'Identity Profile', expected: 'ECHO Credentialed Providers' },
      { field: 'Active Provider', expected: 'Yes' },
      { field: 'Status', expected: 'Enabled' },
      { field: 'IIQDisabled', expected: 'false' },
      { field: 'Primary_Position', expected: 'Yes' },
    ],
  });
});
