import { test } from '@playwright/test';
import {
  highlightFields,
  highlightSearchInput,
  highlightMultipleAccountRows,
  highlightIdentityLink,
  highlightTabCount,
  highlightPageTitle,
  removeHighlightOverlays,
  getIdentityNameFromSearchResult,
  markAccountRowLink,
} from './helpers/screenshotEvidence';
import { buildReport } from './helpers/buildReport';
import {
  captureSection,
  screenshotContent,
  expandAllScrollAreas,
  waitForLoadingToFinish,
  waitForStableSearchResults,
} from './helpers/pageActions';

interface MultiSourceCase {
  scenarioName: string;
  stageKeys: string[];
  sources: string[];
}

const TEST_CASES: MultiSourceCase[] = [
  {
    scenarioName: 'Rush_and_Eco_6',
    stageKeys: ['RL-9512021TESTCL902ER', 'EC-9512021TESTCL902ER'],
    sources: ['RUSH Lawson', 'ECHO Credentialed Providers'],
  },
];

const BASE_DETAIL_FIELDS = [
  'Email',
  'Account Name',
  'Lifecycle State',
  'Identity State',
  'Identity Profile',
  'Display Name',
  'Start Date',
  'End Date',
  'Correlation Key',
];

const ACCOUNT_DETAIL_FIELDS = [
  'Status',
  'Identity',
  'Source Name',
  'Stage_Key',
  'Source_Name',
  'Correlation_Key',
];

// Per-source additions to ACCOUNT_DETAIL_FIELDS, layered on top of the base set.
// Empty for now — add entries here if a source needs an extra field called out
// on its account detail page (e.g. { 'Some Source': ['Some_Field'] }).
const SOURCE_SPECIFIC_DETAIL_FIELDS: Record<string, string[]> = {};

test.beforeEach(async ({ page }) => {
  await page.setViewportSize({ width: 1600, height: 2000 });
});

for (const testCase of TEST_CASES) {
  test(`Multi-source verification - ${testCase.scenarioName}`, async ({ page }) => {
    test.setTimeout(180_000);

    const primarySource = testCase.sources[0];
    const primaryStageKey = testCase.stageKeys[0];
    const label = testCase.scenarioName;

    await page.goto('https://rush-sb.identitynow.com/ui/d/mysailpoint');
    await page.getByRole('link', { name: 'Admin' }).click();
    await page.getByRole('link', { name: 'Sources', exact: true }).click();
    await page.getByRole('link', { name: primarySource }).click();

    await page.getByRole('link', { name: 'Accounts', exact: true }).click();
    await page.waitForSelector('[data-testid="search-bar-input"]', { timeout: 15000 });

    // Section 1: Account Search
    await page.getByTestId('search-bar-input').click();
    await page.getByTestId('search-bar-input').fill(primaryStageKey);

    const settled = await waitForStableSearchResults(page, 5, 20000);
    if (!settled) {
      throw new Error(`Search results never settled for Stage Key ${primaryStageKey}`);
    }

    const identityName = await getIdentityNameFromSearchResult(page);
    if (!identityName) {
      throw new Error(`Could not determine identity name for Stage Key ${primaryStageKey}`);
    }
    console.log(`Identity found: ${identityName}`);

    await highlightSearchInput(page, 'search-bar-input');
    await highlightIdentityLink(page, identityName);
    await screenshotContent(page, `temp/${label}_1_Search.png`);
    await removeHighlightOverlays(page);

    await page.getByRole('link', { name: identityName }).click();

    // Section 2: Identity Page - Details & Attributes
    await captureSection(page, {
      waitForText: 'COST CENTER',
      highlightFn: () => highlightFields(page, BASE_DETAIL_FIELDS),
      screenshotPath: `temp/${label}_2_Details.png`,
    });

    // Section 3: Access - Roles
    await captureSection(page, {
      clickAction: () => page.getByText('Access', { exact: true }).click(),
      highlightFn: () => highlightTabCount(page, 'Roles'),
      screenshotPath: `temp/${label}_3_Roles.png`,
    });

    // Section 3: Access - Entitlements
    await captureSection(page, {
      clickAction: () => page.getByRole('button', { name: /Entitlements/ }).click(),
      highlightFn: () => highlightTabCount(page, 'Entitlements'),
      screenshotPath: `temp/${label}_3_Entitlements.png`,
    });

    // Section 4: Accounts summary - all sources
    await captureSection(page, {
      clickAction: () => page.getByText('Accounts', { exact: true }).click(),
      highlightFn: () => highlightMultipleAccountRows(page, testCase.sources),
      screenshotPath: `temp/${label}_4_Accounts.png`,
    });

    // Section 5: Individual account detail page — ONLY for non-primary sources
    // (the primary source, e.g. RUSH Lawson, is already covered by the search screenshot)
    const accountDetailImages: { path: string; caption: string }[] = [];
    const secondarySources = testCase.sources.slice(1);

    for (const sourceName of secondarySources) {
      const marked = await markAccountRowLink(page, sourceName, 'target-account-link');
      if (!marked) {
        console.log(`Could not find account row for ${sourceName} — skipping detail capture.`);
        continue;
      }

      await page.locator('[data-marker="target-account-link"]').click();
      await waitForLoadingToFinish(page);
      await expandAllScrollAreas(page);

      await highlightPageTitle(page, sourceName);
      const fieldsToHighlight = [
        ...ACCOUNT_DETAIL_FIELDS,
        ...(SOURCE_SPECIFIC_DETAIL_FIELDS[sourceName] ?? []),
      ];
      await highlightFields(page, fieldsToHighlight);

      const detailPath = `temp/${label}_5_${sourceName.replace(/\s+/g, '_')}.png`;
      await screenshotContent(page, detailPath);
      accountDetailImages.push({ path: detailPath, caption: `${sourceName} — Account Detail` });

      await page.goBack();
      await waitForLoadingToFinish(page);
    }

    await buildReport(
      { sourceLabel: testCase.sources.join(' & '), identityName, caseId: testCase.stageKeys.join(' / ') },
      [
        { title: `Account Search — ${primarySource}`, images: [{ path: `temp/${label}_1_Search.png` }] },
        { title: 'Identity Page — Details & Attributes', images: [{ path: `temp/${label}_2_Details.png` }] },
        {
          title: 'Access — Roles & Entitlements',
          images: [
            { path: `temp/${label}_3_Roles.png`, caption: 'Roles' },
            { path: `temp/${label}_3_Entitlements.png`, caption: 'Entitlements' },
          ],
        },
        { title: 'Accounts — Multi-Source Status', images: [{ path: `temp/${label}_4_Accounts.png` }] },
        {
          title: 'Account Detail Pages',
          note: `Account detail shown below for: ${secondarySources.join(', ')}.`,
          images: accountDetailImages,
        },
      ],
      `output/${label}_report.docx`
    );
  });
}