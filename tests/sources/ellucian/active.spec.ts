import { test } from '@playwright/test';
import { runSourceLifecycle } from '../runSourceLifecycle';
import {
  ELLUCIAN_SOURCE,
  ELLUCIAN_IDENTITYNOW_ACCOUNT_FIELDS,
  ELLUCIAN_SERVICENOW_ACCOUNT_FIELDS,
  ELLUCIAN_AD_ACCOUNT_FIELDS,
} from './profile';

// Ellucian Students — Active
// From Ellucian_Students_Active.docx (ES-119811128TEST000PDELL).
//   npx playwright test tests/sources/ellucian/active.spec.ts --headed
const STAGE_KEY = 'ES-119811128TEST000PDELL';

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

const ACTIVE_ELLUCIAN_ACCOUNT_FIELDS = [
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

test('Ellucian Students — Active', async ({ page }) => {
  await runSourceLifecycle(page, ELLUCIAN_SOURCE, 'active', STAGE_KEY, {
    searchHighlightTexts: ['Ellucian Students', 'JDBC', 'Enabled'],
    highlightIdentityOnAccess: true,
    detailFields: ACTIVE_DETAIL_FIELDS,
    accountDetailFields: ACTIVE_ELLUCIAN_ACCOUNT_FIELDS,
    accountDetailFieldsBySource: {
      IdentityNow: ELLUCIAN_IDENTITYNOW_ACCOUNT_FIELDS,
      'ServiceNow SaaS': ELLUCIAN_SERVICENOW_ACCOUNT_FIELDS,
      'TEST RUSH AD': ELLUCIAN_AD_ACCOUNT_FIELDS,
    },
    accountStatusSources: [ELLUCIAN_SOURCE, 'IdentityNow', 'ServiceNow SaaS', 'TEST RUSH AD'],
    accountDetailSources: [ELLUCIAN_SOURCE, 'IdentityNow', 'ServiceNow SaaS', 'TEST RUSH AD'],
    expectedValues: [
      { field: 'Lifecycle State', expected: 'active' },
      { field: 'Identity State', expected: 'ACTIVE' },
      { field: 'Identity Profile', expected: 'Ellucian Students' },
      { field: 'Active Student', expected: 'Yes' },
      { field: 'Status', expected: 'Enabled' },
      { field: 'IIQDisabled', expected: 'false' },
      { field: 'Primary_Position', expected: 'Yes' },
    ],
  });
});
