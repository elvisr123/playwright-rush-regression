import { test } from '@playwright/test';
import {
  highlightFields,
  highlightSearchInput,
  highlightTabCount,
  highlightAccountRowStatus,
  highlightIdentityLink,
  removeHighlightOverlays,
} from './helpers/screenshotEvidence';
import { buildReport } from './helpers/buildReport';
import { captureSection, screenshotContent } from './helpers/pageActions';

const STAGE_KEY = 'CL-95129456TESTCL560ER';
const IDENTITY_NAME = 'PoojaER Vijay';
const SOURCE_NAME = 'Copley Lawson';
const IDENTITY_LABEL = STAGE_KEY;

const HIGHLIGHT_FIELDS = {
  details: [
    'Email',
    'Account Name',
    'Lifecycle State',
    'Identity State',
    'Identity Profile',
    'Display Name',
    'Start Date',
    'Active Copley Infor',
    'End Date',
    'Correlation Key',
  ],
};

test.beforeEach(async ({ page }) => {
  await page.setViewportSize({ width: 1600, height: 2000 });
});

test('Active lifecycle state - single identity verification', async ({ page }) => {
  test.setTimeout(120_000);

  await page.goto('https://rush-sb.identitynow.com/ui/d/mysailpoint');
  await page.getByRole('link', { name: 'Admin' }).click();
  await page.getByRole('link', { name: 'Sources', exact: true }).click();
  await page.getByRole('link', { name: SOURCE_NAME }).click();

  // Section 1: Account Search
  await page.getByTestId('search-bar-input').click();
  await page.getByTestId('search-bar-input').fill(STAGE_KEY);
  await page.waitForSelector(`text=${IDENTITY_NAME}`, { timeout: 15000 }).catch(() => {});
  await page.waitForTimeout(500);
  await highlightSearchInput(page, 'search-bar-input');
  await highlightIdentityLink(page, IDENTITY_NAME);
  await screenshotContent(page, `temp/${IDENTITY_LABEL}_1_Search.png`);
  await removeHighlightOverlays(page);

  await page.getByRole('link', { name: IDENTITY_NAME }).click();

  // Section 2: Identity Page - Details & Attributes
  await captureSection(page, {
    waitForText: 'COST CENTER',
    highlightFn: () => highlightFields(page, HIGHLIGHT_FIELDS.details),
    screenshotPath: `temp/${IDENTITY_LABEL}_2_Details.png`,
  });

  // Section 3: Access - Roles
  await captureSection(page, {
    clickAction: () => page.getByText('Access', { exact: true }).click(),
    highlightFn: () => highlightTabCount(page, 'Roles'),
    screenshotPath: `temp/${IDENTITY_LABEL}_3_Roles.png`,
  });

  // Section 3: Access - Entitlements
  await captureSection(page, {
    clickAction: () => page.getByRole('button', { name: /Entitlements/ }).click(),
    highlightFn: () => highlightTabCount(page, 'Entitlements'),
    screenshotPath: `temp/${IDENTITY_LABEL}_3_Entitlements.png`,
  });

  // Section 4: Accounts
  await captureSection(page, {
    clickAction: () => page.getByText('Accounts', { exact: true }).click(),
    highlightFn: () => highlightAccountRowStatus(page, SOURCE_NAME),
    screenshotPath: `temp/${IDENTITY_LABEL}_4_Accounts.png`,
  });

  await buildReport(
    { sourceLabel: SOURCE_NAME, identityName: IDENTITY_NAME, caseId: STAGE_KEY },
    [
      { title: 'Account Search — Copley Lawson', images: [{ path: `temp/${IDENTITY_LABEL}_1_Search.png` }] },
      { title: 'Identity Page — Details & Attributes', images: [{ path: `temp/${IDENTITY_LABEL}_2_Details.png` }] },
      {
        title: 'Access — Roles & Entitlements',
        images: [
          { path: `temp/${IDENTITY_LABEL}_3_Roles.png`, caption: 'Roles' },
          { path: `temp/${IDENTITY_LABEL}_3_Entitlements.png`, caption: 'Entitlements' },
        ],
      },
      { title: 'Accounts', images: [{ path: `temp/${IDENTITY_LABEL}_4_Accounts.png` }] },
    ],
    `output/${IDENTITY_LABEL}_Active_report.docx`
  );
});