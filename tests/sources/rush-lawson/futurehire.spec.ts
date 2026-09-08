import { test } from '@playwright/test';
import { runSourceLifecycle } from '../runSourceLifecycle';
import { RUSH_SOURCE } from './profile';

// RUSH Lawson — Futurehire
// Field list and highlights from Rush_Lawson_Futurehire.pdf (RL-98100076TESTCL000PD).
// PDF accounts list is RUSH Lawson (Disabled) + IdentityNow (Enabled) only — no SN/AD.
//   npx playwright test tests/sources/rush-lawson/futurehire.spec.ts --headed
const STAGE_KEY = 'RL-98100076TESTCL000PD';

const FUTUREHIRE_DETAIL_FIELDS = [
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
  'Snow Sys ID',
  'UPN',
  'User Type',
  'Relationship Status',
];

const FUTUREHIRE_RUSH_ACCOUNT_FIELDS = [
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

const FUTUREHIRE_IDENTITYNOW_ACCOUNT_FIELDS = [
  'Name',
  'Native Identity',
  'Identity',
  'Source Name',
  'Status',
];

test('RUSH Lawson — Futurehire', async ({ page }) => {
  await runSourceLifecycle(page, RUSH_SOURCE, 'futurehire', STAGE_KEY, {
    searchHighlightTexts: ['JDBC', 'Disabled'],
    highlightIdentityOnAccess: true,
    detailFields: FUTUREHIRE_DETAIL_FIELDS,
    accountDetailFields: FUTUREHIRE_RUSH_ACCOUNT_FIELDS,
    accountDetailFieldsBySource: {
      IdentityNow: FUTUREHIRE_IDENTITYNOW_ACCOUNT_FIELDS,
    },
    accountStatusSources: [RUSH_SOURCE, 'IdentityNow'],
    accountDetailSources: [RUSH_SOURCE, 'IdentityNow'],
    expectedValues: [
      { field: 'Lifecycle State', expected: 'futurehire' },
      { field: 'Identity State', expected: 'ACTIVE' },
      { field: 'Identity Profile', expected: 'RUSH Lawson' },
      { field: 'Active Rush Infor', expected: 'No' },
      { field: 'Status', expected: 'Disabled' },
      { field: 'IIQDisabled', expected: 'true' },
      { field: 'Primary_Position', expected: 'Yes' },
      { field: 'Relationship_Status', expected: 'ACTIVE REGULAR' },
      { field: 'User Type', expected: 'RCMC' },
      { field: 'Manager DN', expected: 'OU=Terminated', matchType: 'contains' },
    ],
  });
});
