import { test, Page } from '@playwright/test';
import * as fs from 'fs';
import { Document, ImageRun, Packer, Paragraph, TextRun } from 'docx';
import sizeOf from 'image-size';
import {
  highlightFields,
  highlightExactTexts,
  highlightMultipleAccountRows,
  highlightTabCount,
  getIdentityNameFromSearchResult,
  markAccountRowLink,
  getAllAccountSourceNames,
} from '../../helpers/screenshotEvidence';
import {
  captureSection,
  capturePaginatedSection,
  expandAllScrollAreas,
  screenshotContent,
  waitForLoadingToFinish,
  waitForStableSearchResults,
} from '../../helpers/pageActions';
import {
  localReportPath,
  uploadFileToSharePointFolder,
  removeLocalReportCopy,
} from '../../helpers/sharepointUpload';
import { SOURCES, SourceKey } from '../../config/sources';
import { findMultiAccountScenario } from '../../config/multiAccountScenarios';

// Multi-account scenario — sandbox screenshot evidence.
//   npx playwright test tests/sources/multi-account/document.spec.ts --headed

// EDIT HERE: the scenario's No. (report is saved as Lifecycle_State_<No.>) and its two Stage_Keys.
const S_NO = 10;
const STAGE_KEYS = ['RL-9001179511199005ER', 'CL-9001179511199005ER'];
// Text after "Use Case:". Empty = the scenario's sources and lifecycles from the table.
const USE_CASE = '';

// SHAREPOINT_FOLDER_URL in .env wins; the path below is the fallback.
const UPLOAD_FOLDER_URL =
  process.env.SHAREPOINT_FOLDER_URL?.trim() ||
  'https://netorgft1314491.sharepoint.com/sites/AsbRushISC/Shared%20Documents/Forms/AllItems.aspx?id=%2Fsites%2FAsbRushISC%2FShared%20Documents%2FASB%2FRush%5FTestCases%2FEnhancement%5FNov%5F18%5F2026%2FEvidence%5FNov%5F18%2FLifecycle%5FState';

const PREFIX_TO_SOURCE: Record<string, SourceKey> = {
  RL: 'rush',
  CL: 'copley',
  NE: 'nerm',
  EC: 'echo',
  ES: 'ellucian',
};

const HEADING: Record<SourceKey, string> = {
  rush: 'Rush Lawson',
  copley: 'Copley Lawson',
  nerm: 'Non-Employee',
  echo: 'Echo',
  ellucian: 'Ellucian',
  workday: 'Workday',
};

const ACTIVE_FLAG: Record<SourceKey, string> = {
  rush: 'Active Rush Infor',
  copley: 'Active Copley Infor',
  nerm: 'Active NonEmployee',
  echo: 'Active Provider',
  ellucian: 'Active Student',
  workday: 'Active Workday',
};

const DETAIL_FIELDS = [
  'Lifecycle State',
  'Identity State',
  'Identity Profile',
  'Manager',
  'Start Date',
  'End Date',
  'Auth Source',
  'authsource',
  'Distinguished Name',
];
const HR_ACCOUNT_FIELDS = ['Start_Date', 'End_Date', 'IIQDisabled'];
const AD_ACCOUNT_FIELDS = ['distinguishedName', 'Distinguished Name'];

const EXTRA_ACCOUNTS: { source: string; heading: string; fields: string[] }[] = [
  { source: 'IdentityNow', heading: 'IdentityNow', fields: [] },
  { source: 'ServiceNow SaaS', heading: 'ServiceNow Saas', fields: [] },
  { source: 'TEST RUSH AD', heading: 'TEST RUSH AD', fields: AD_ACCOUNT_FIELDS },
];

function sourceKeyFor(stageKey: string): SourceKey {
  const key = PREFIX_TO_SOURCE[stageKey.split('-')[0]];
  if (!key) throw new Error(`Unknown Stage_Key prefix in "${stageKey}" (expected RL/CL/NE/EC/ES).`);
  return key;
}

function useCaseText(): string {
  if (USE_CASE.trim()) return USE_CASE.trim();
  const words = (s: string) => s.replace(/futurehire/, 'Future Hire').replace(/^./, (c) => c.toUpperCase());
  return findMultiAccountScenario(S_NO)
    .accounts.map((a) => `${HEADING[a.sourceKey]} ${words(a.lifecycle)}`)
    .join(' / ');
}

/** Stops a run whose Stage_Keys don't belong to S_NO's two sources (wrong No. = wrong file name). */
function checkScenarioMatchesStageKeys(sourceKeys: SourceKey[]): void {
  const expected = findMultiAccountScenario(S_NO).accounts.map((a) => a.sourceKey).sort().join(' + ');
  const actual = [...sourceKeys].sort().join(' + ');
  if (expected !== actual) {
    throw new Error(`S_NO ${S_NO} is ${expected}, but STAGE_KEYS are ${actual} — check S_NO and STAGE_KEYS.`);
  }
}

/** Back on the identity's Accounts list with its rows rendered (goBack can land early or elsewhere). */
async function openAccountsList(page: Page): Promise<void> {
  const header = page.getByText('Source Name', { exact: true }).first();
  if (!(await header.isVisible().catch(() => false))) {
    await page.getByText('Accounts', { exact: true }).first().click().catch(() => {});
  }
  await header.waitFor({ state: 'visible', timeout: 15000 }).catch(() => {});
  await waitForLoadingToFinish(page);
}

async function captureAccount(page: Page, sourceName: string, fields: string[], path: string): Promise<boolean> {
  await openAccountsList(page);
  let listed: string[] = [];
  for (let attempt = 0; attempt < 10 && listed.length === 0; attempt++) {
    listed = await getAllAccountSourceNames(page);
    if (listed.length === 0) await page.waitForTimeout(1000);
  }
  const marked = listed.includes(sourceName) && (await markAccountRowLink(page, sourceName, 'target-account-link'));
  if (!marked) {
    console.log(`No ${sourceName} account on this identity — skipped.`);
    return false;
  }
  await page.locator('[data-marker="target-account-link"]').click();
  await waitForLoadingToFinish(page);
  await expandAllScrollAreas(page);
  if (fields.length) await highlightFields(page, fields);
  await screenshotContent(page, path);
  await page.goBack();
  await waitForLoadingToFinish(page);
  return true;
}

function text(value: string): Paragraph {
  return new Paragraph({ children: [new TextRun(value)], spacing: { after: 120 } });
}

function image(path: string): Paragraph {
  const buffer = fs.readFileSync(path);
  const { width = 1, height = 1 } = sizeOf(buffer);
  const w = 620;
  return new Paragraph({
    children: [new ImageRun({ type: 'png', data: buffer, transformation: { width: w, height: Math.round((height / width) * w) } })],
    spacing: { after: 200 },
  });
}

/** Admin -> Sources -> <source>. The Sources click can land before the nav is ready, leaving the
 *  list unrendered, so confirm the source link appeared and re-click Sources if it didn't. */
async function openSource(page: Page, sourceName: string): Promise<void> {
  const sourceLink = page.getByRole('link', { name: sourceName });
  for (let attempt = 1; attempt <= 3; attempt++) {
    const sources = page.getByRole('link', { name: 'Sources', exact: true });
    await sources.waitFor({ state: 'visible', timeout: 30000 });
    await sources.click();
    await waitForLoadingToFinish(page);
    const appeared = await sourceLink
      .waitFor({ state: 'visible', timeout: 20000 })
      .then(() => true)
      .catch(() => false);
    if (appeared) {
      await sourceLink.click();
      return;
    }
    console.log(`Sources list didn't render "${sourceName}" — retrying (${attempt}/3).`);
  }
  throw new Error(`Sources list never showed "${sourceName}" after 3 attempts.`);
}

test('Multi-account — sandbox evidence', async ({ page }) => {
  test.setTimeout(600_000);
  const sourceKeys = STAGE_KEYS.map(sourceKeyFor);
  checkScenarioMatchesStageKeys(sourceKeys);
  const sourceNames = sourceKeys.map((k) => SOURCES[k]);
  const label = STAGE_KEYS.join('_');
  await page.setViewportSize({ width: 1600, height: 2000 });

  await page.goto('https://rush-sb.identitynow.com/ui/d/mysailpoint');
  const adminLink = page.getByRole('link', { name: 'Admin' });
  await adminLink.waitFor({ state: 'visible', timeout: 30000 });
  await adminLink.click();
  await openSource(page, sourceNames[0]);
  await page.getByRole('link', { name: 'Accounts', exact: true }).click();
  await page.waitForSelector('[data-testid="search-bar-input"]', { timeout: 15000 });
  await page.getByTestId('search-bar-input').fill(STAGE_KEYS[0]);
  if (!(await waitForStableSearchResults(page, 5, 20000))) {
    throw new Error(`Search results never settled for ${STAGE_KEYS[0]}`);
  }
  const identityName = await getIdentityNameFromSearchResult(page);
  if (!identityName) throw new Error(`No identity found for ${STAGE_KEYS[0]}`);
  await page.getByRole('link', { name: identityName }).click();

  const children: Paragraph[] = [text(`Use Case: ${useCaseText()}`), text(`User: ${STAGE_KEYS.join(' / ')}`)];

  const detailsPath = `temp/${label}_details.png`;
  await captureSection(page, {
    waitForText: 'COST CENTER',
    highlightFn: () => highlightFields(page, [...DETAIL_FIELDS, ...sourceKeys.map((k) => ACTIVE_FLAG[k])]),
    screenshotPath: detailsPath,
  });
  children.push(text('Identity Attributes:'), image(detailsPath));

  const roles = await capturePaginatedSection(page, {
    clickAction: () => page.getByText('Access', { exact: true }).click(),
    highlightFn: () => highlightTabCount(page, 'Roles'),
    screenshotPathPrefix: `temp/${label}_roles`,
    captionBase: 'Roles',
  });
  children.push(text('Access->Roles:'), ...roles.images.map((i) => image(i.path)));

  const entitlements = await capturePaginatedSection(page, {
    clickAction: () => page.getByRole('button', { name: /Entitlements/ }).click(),
    highlightFn: () => highlightTabCount(page, 'Entitlements'),
    screenshotPathPrefix: `temp/${label}_entitlements`,
    captionBase: 'Entitlements',
  });
  children.push(text('Entitlements:'), ...entitlements.images.map((i) => image(i.path)));

  const accountsPath = `temp/${label}_accounts.png`;
  await captureSection(page, {
    clickAction: () => page.getByText('Accounts', { exact: true }).click(),
    highlightFn: async () => {
      await highlightExactTexts(page, sourceNames);
      await highlightMultipleAccountRows(page, sourceNames);
    },
    screenshotPath: accountsPath,
  });
  children.push(text('Accounts:'), image(accountsPath));

  for (let i = 0; i < sourceKeys.length; i++) {
    const path = `temp/${label}_${sourceKeys[i]}.png`;
    if (await captureAccount(page, sourceNames[i], HR_ACCOUNT_FIELDS, path)) {
      children.push(text(`${HEADING[sourceKeys[i]]}:`), image(path));
    }
  }
  for (const extra of EXTRA_ACCOUNTS) {
    const path = `temp/${label}_${extra.source.replace(/\s+/g, '_')}.png`;
    if (await captureAccount(page, extra.source, extra.fields, path)) {
      children.push(text(`${extra.heading}:`), image(path));
    }
  }

  const reportFileName = `Lifecycle_State_${String(S_NO).padStart(3, '0')}.docx`;
  const reportPath = localReportPath(reportFileName);
  fs.writeFileSync(reportPath, await Packer.toBuffer(new Document({ sections: [{ children }] })));
  console.log(`Report: ${reportPath}`);

  const published = await uploadFileToSharePointFolder(reportPath, reportFileName, UPLOAD_FOLDER_URL);
  if (published) removeLocalReportCopy(reportPath);
  else console.log(`SharePoint publish skipped — report kept at ${reportPath}`);
});
