import { test } from '@playwright/test';
import { runSourceLifecycle } from '../runSourceLifecycle';
import {
  ELLUCIAN_SOURCE,
  ELLUCIAN_IDENTITYNOW_ACCOUNT_FIELDS,
  ELLUCIAN_SERVICENOW_ACCOUNT_FIELDS,
  ELLUCIAN_AD_ACCOUNT_FIELDS,
} from './profile';

// Ellucian Students — Termed
// From Ellucian_Students_Term.docx — stage key was blank in the Word doc.
// Paste a Stage Key when an identity exists; empty STAGE_KEY skips the test.
//   npx playwright test tests/sources/ellucian/termed.spec.ts --headed
const STAGE_KEY = '';

const TERMED_DETAIL_FIELDS = [
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
  'Active Student',
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

const TERMED_ELLUCIAN_ACCOUNT_FIELDS = [
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

const TERMED_SERVICENOW_ACCOUNT_FIELDS = [
  ...ELLUCIAN_SERVICENOW_ACCOUNT_FIELDS,
  'locked_out',
];

test('Ellucian Students — Termed', async ({ page }) => {
  await runSourceLifecycle(page, ELLUCIAN_SOURCE, 'termed', STAGE_KEY, {
    searchHighlightTexts: ['Ellucian Students', 'JDBC', 'Disabled'],
    highlightIdentityOnAccess: true,
    detailFields: TERMED_DETAIL_FIELDS,
    accountDetailFields: TERMED_ELLUCIAN_ACCOUNT_FIELDS,
    accountDetailFieldsBySource: {
      IdentityNow: ELLUCIAN_IDENTITYNOW_ACCOUNT_FIELDS,
      'ServiceNow SaaS': TERMED_SERVICENOW_ACCOUNT_FIELDS,
      'TEST RUSH AD': ELLUCIAN_AD_ACCOUNT_FIELDS,
    },
    accountStatusSources: [ELLUCIAN_SOURCE, 'IdentityNow', 'ServiceNow SaaS', 'TEST RUSH AD'],
    accountDetailSources: [ELLUCIAN_SOURCE, 'IdentityNow', 'ServiceNow SaaS', 'TEST RUSH AD'],
    expectedValues: [
      { field: 'Lifecycle State', expected: 'termed' },
      { field: 'Identity State', expected: 'INACTIVE_SHORT_TERM' },
      { field: 'Identity Profile', expected: 'Ellucian Students' },
      { field: 'Active Student', expected: 'No' },
      { field: 'Status', expected: 'Disabled' },
      { field: 'IIQDisabled', expected: 'true' },
      { field: 'Primary_Position', expected: 'Yes' },
    ],
  });
});
