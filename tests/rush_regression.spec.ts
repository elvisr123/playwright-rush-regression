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
import { TEST_CASES, SOURCE_FIELD_PROFILES } from './config/testcases';

// Fields highlighted on every source's Identity Details page, regardless of source.
const DETAIL_FIELDS_BASE = [
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

// Fields highlighted on every source's individual account detail page, regardless of source.
const ACCOUNT_DETAIL_FIELDS_BASE = [
  'Status',
  'Identity',
  'Source Name',
  'Stage_Key',
  'Source_Name',
  'Correlation_Key',
];

function extraFieldsFor(sourceName: string, kind: 'detailExtras' | 'accountDetailExtras'): string[] {
  return SOURCE_FIELD_PROFILES[sourceName]?.[kind] ?? [];
}

test.beforeEach(async ({ page }) => {
  await page.setViewportSize({ width: 1600, height: 2000 });
});

for (const testCase of TEST_CASES) {
  test(`Regression verification - ${testCase.scenarioName}`, async ({ page }) => {
    test.setTimeout(180_000);

    const primary = testCase.sources[0];
    const secondarySources = testCase.sources.slice(1);
    const allSourceNames = testCase.sources.map((s) => s.name);
    const label = testCase.scenarioName;

    await page.goto('https://rush-sb.identitynow.com/ui/d/mysailpoint');
    await page.getByRole('link', { name: 'Admin' }).click();
    await page.getByRole('link', { name: 'Sources', exact: true }).click();
    await page.getByRole('link', { name: primary.name }).click();

    await page.getByRole('link', { name: 'Accounts', exact: true }).click();
    await page.waitForSelector('[data-testid="search-bar-input"]', { timeout: 15000 });

    // Section 1: Account Search
    await page.getByTestId('search-bar-input').click();
    await page.getByTestId('search-bar-input').fill(primary.stageKey);

    const settled = await waitForStableSearchResults(page, 5, 20000);
    if (!settled) {
      throw new Error(`Search results never settled for Stage Key ${primary.stageKey}`);
    }

    const identityName = await getIdentityNameFromSearchResult(page);
    if (!identityName) {
      throw new Error(`Could not determine identity name for Stage Key ${primary.stageKey}`);
    }
    console.log(`Identity found: ${identityName}`);

    await highlightSearchInput(page, 'search-bar-input');
    await highlightIdentityLink(page, identityName);
    await screenshotContent(page, `temp/${label}_1_Search.png`);
    await removeHighlightOverlays(page);

    await page.getByRole('link', { name: identityName }).click();

    // Section 2: Identity Page - Details & Attributes
    const detailFields = [...DETAIL_FIELDS_BASE, ...extraFieldsFor(primary.name, 'detailExtras')];
    await captureSection(page, {
      waitForText: 'COST CENTER',
      highlightFn: () => highlightFields(page, detailFields),
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

    // Section 4: Accounts summary - all sources in this scenario
    await captureSection(page, {
      clickAction: () => page.getByText('Accounts', { exact: true }).click(),
      highlightFn: () => highlightMultipleAccountRows(page, allSourceNames),
      screenshotPath: `temp/${label}_4_Accounts.png`,
    });

    // Section 5: Individual account detail page(s) — ONLY for non-primary sources
    // (the primary source is already covered by the search screenshot)
    const accountDetailImages: { path: string; caption: string }[] = [];

    for (const source of secondarySources) {
      const marked = await markAccountRowLink(page, source.name, 'target-account-link');
      if (!marked) {
        console.log(`Could not find account row for ${source.name} — skipping detail capture.`);
        continue;
      }

      await page.locator('[data-marker="target-account-link"]').click();
      await waitForLoadingToFinish(page);
      await expandAllScrollAreas(page);

      await highlightPageTitle(page, source.name);
      const accountFields = [...ACCOUNT_DETAIL_FIELDS_BASE, ...extraFieldsFor(source.name, 'accountDetailExtras')];
      await highlightFields(page, accountFields);

      const detailPath = `temp/${label}_5_${source.name.replace(/\s+/g, '_')}.png`;
      await screenshotContent(page, detailPath);
      accountDetailImages.push({ path: detailPath, caption: `${source.name} — Account Detail` });

      await page.goBack();
      await waitForLoadingToFinish(page);
    }

    const sections: Parameters<typeof buildReport>[1] = [
      { title: `Account Search — ${primary.name}`, images: [{ path: `temp/${label}_1_Search.png` }] },
      { title: 'Identity Page — Details & Attributes', images: [{ path: `temp/${label}_2_Details.png` }] },
      {
        title: 'Access — Roles & Entitlements',
        images: [
          { path: `temp/${label}_3_Roles.png`, caption: 'Roles' },
          { path: `temp/${label}_3_Entitlements.png`, caption: 'Entitlements' },
        ],
      },
      {
        title: allSourceNames.length > 1 ? 'Accounts — Multi-Source Status' : 'Accounts',
        images: [{ path: `temp/${label}_4_Accounts.png` }],
      },
    ];

    if (accountDetailImages.length > 0) {
      sections.push({
        title: 'Account Detail Pages',
        note: `Account detail shown below for: ${secondarySources.map((s) => s.name).join(', ')}.`,
        images: accountDetailImages,
      });
    }

    await buildReport(
      {
        sourceLabel: allSourceNames.join(' & '),
        identityName,
        caseId: testCase.sources.map((s) => s.stageKey).join(' / '),
      },
      sections,
      `output/${label}_report.docx`
    );
  });
}