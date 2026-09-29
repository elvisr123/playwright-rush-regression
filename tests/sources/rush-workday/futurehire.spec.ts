import { test } from '@playwright/test';
import { runSourceLifecycle } from '../runSourceLifecycle';
import { WORKDAY_SOURCE, WORKDAY_ACCOUNT_SOURCE } from './profile';
import { LOCAL_IDENTITIES, EMPTY_IDENTITY } from '../../config/localIdentities';

// RUSH Workday — Futurehire
// Same screenshot field list as RUSH Lawson Futurehire. Accounts list is Workday + IdentityNow only.
// Identity comes from tests/config/identities.local.json (workdayFuturehire). Empty Stage Key skips the test.
//   npx playwright test tests/sources/rush-workday/futurehire.spec.ts --headed
const { name: IDENTITY_NAME, stageKey: STAGE_KEY } = LOCAL_IDENTITIES.workdayFuturehire ?? EMPTY_IDENTITY;

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

const FUTUREHIRE_WORKDAY_ACCOUNT_FIELDS = [
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

test(`RUSH Workday — Futurehire — ${IDENTITY_NAME || 'unset'}`,async ({ page }) => {
  await runSourceLifecycle(page, WORKDAY_SOURCE, 'futurehire', STAGE_KEY, {
    searchHighlightTexts: ['Rush Workday', 'RUSH Workday', 'Disabled'],
    highlightIdentityOnAccess: true,
    detailFields: FUTUREHIRE_DETAIL_FIELDS,
    accountDetailFields: FUTUREHIRE_WORKDAY_ACCOUNT_FIELDS,
    accountDetailFieldsBySource: {
      [WORKDAY_ACCOUNT_SOURCE]: FUTUREHIRE_WORKDAY_ACCOUNT_FIELDS,
      [WORKDAY_SOURCE]: FUTUREHIRE_WORKDAY_ACCOUNT_FIELDS,
      IdentityNow: FUTUREHIRE_IDENTITYNOW_ACCOUNT_FIELDS,
    },
    accountStatusSources: [WORKDAY_ACCOUNT_SOURCE, WORKDAY_SOURCE, 'IdentityNow'],
    accountDetailSources: [WORKDAY_ACCOUNT_SOURCE, WORKDAY_SOURCE, 'IdentityNow'],
    expectedValues: [
      { field: 'Lifecycle State', expected: 'futurehire' },
      { field: 'Identity State', expected: 'ACTIVE' },
      { field: 'Identity Profile', expected: 'RUSH Workday' },
      { field: 'Active Workday', expected: 'No' },
      { field: 'Status', expected: 'Disabled' },
      { field: 'IIQDisabled', expected: 'true' },
      { field: 'Primary_Position', expected: 'Yes' },
      { field: 'Relationship_Status', expected: 'ACTIVE REGULAR', allowed: ['ACTIVE', 'A'] },
      { field: 'User Type', expected: 'RCMC' },
    ],
  });
});
