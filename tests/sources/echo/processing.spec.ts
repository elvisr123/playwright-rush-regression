import { test } from '@playwright/test';
import { runSourceLifecycle } from '../runSourceLifecycle';
import {
  ECHO_SOURCE,
  ECHO_IDENTITYNOW_ACCOUNT_FIELDS,
} from './profile';

// ECHO Credentialed Providers — Processing
// From Echo_Credentialed Providers_Proccessing.docx (EC-0982112TESTEC334PD).
//   npx playwright test tests/sources/echo/processing.spec.ts --headed
const STAGE_KEY = 'EC-0982112TESTEC334PD';

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
  'User Type',
  'Relationship Status',
];

const PROCESSING_ECHO_ACCOUNT_FIELDS = [
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

test('ECHO Credentialed Providers — Processing', async ({ page }) => {
  await runSourceLifecycle(page, ECHO_SOURCE, 'processing', STAGE_KEY, {
    searchHighlightTexts: ['ECHO Credentialed Providers', 'Echo', 'Enabled', 'Disabled'],
    highlightIdentityOnAccess: true,
    detailFields: PROCESSING_DETAIL_FIELDS,
    accountDetailFields: PROCESSING_ECHO_ACCOUNT_FIELDS,
    accountDetailFieldsBySource: {
      IdentityNow: ECHO_IDENTITYNOW_ACCOUNT_FIELDS,
    },
    accountStatusSources: [ECHO_SOURCE, 'IdentityNow'],
    accountDetailSources: [ECHO_SOURCE, 'IdentityNow'],
    expectedValues: [
      { field: 'Lifecycle State', expected: 'processing' },
      { field: 'Identity Profile', expected: 'ECHO Credentialed Providers' },
      { field: 'Relationship_Status', expected: 'ACTIVE', allowed: ['ACTIVE REGULAR', 'A'] },
    ],
  });
});
