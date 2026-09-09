import { Page } from '@playwright/test';
import {
  highlightFields,
  highlightFieldRed,
  highlightSearchInput,
  highlightMultipleAccountRows,
  highlightIdentityLink,
  highlightTabCount,
  highlightPageTitle,
  highlightValuesContaining,
  removeHighlightOverlays,
  getIdentityNameFromSearchResult,
  markAccountRowLink,
  getAllAccountSourceNames,
  highlightExactTexts,
} from './screenshotEvidence';
import { buildReport } from './buildReport';
import {
  captureSection,
  capturePaginatedSection,
  captureProcessIdentityEvidence,
  screenshotContent,
  expandAllScrollAreas,
  waitForLoadingToFinish,
  waitForStableSearchResults,
} from './pageActions';
import { TestCase, SOURCE_FIELD_PROFILES } from '../config/testcases';
import { evaluateCheck, formatCheckResult } from './expectedValueCheck';
import { getStagingRow, isDbConfigured } from './dbClient';
import { lifecycleLabel } from '../config/lifecycles';
import {
  buildReportFileName,
  localReportPath,
  uploadReportForSource,
  removeLocalReportCopy,
} from './sharepointUpload';

// Fields highlighted on every source's Identity Details page, regardless of source.
// Employee Type and Distinguished Name confirmed present as exact on-screen labels
// (Ghoshal / Non-Employee Workforce) — Distinguished Name shows a real CN=...,OU=...,DC=...
// value here on the Details page, even though it's not present on the account
// detail drilldown pages (that's why highlightValuesContaining(page, 'OU=') below
// is kept as a fallback there instead of a label match).
//
// The six "Active *" flags come from the Identity Profile attribute mapping —
// each is independently derived from a different source's IIQDisabled
// (Active Copley Infor <- Copley Lawson, Active NonEmployee <- Non-Employee
// Workforce, Active Provider <- ECHO, Active Rush Infor <- RUSH Lawson,
// Active Student <- Ellucian, Active Workday <- Workday), all living on the
// same Details page regardless of which source is primary for this scenario —
// so they belong in the shared base, not gated behind any one source's profile.
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
  'Employee Type',
  'Distinguished Name',
  'Active Copley Infor',
  'Active NonEmployee',
  'Active Provider',
  'Active Rush Infor',
  'Active Student',
  'Active Workday',
  // Manager DN and User Type: requested by the Copley Lawson QA test case
  // document but not yet confirmed as exact on-screen labels the way the
  // fields above were — best-effort attempt, silently no-ops if the label
  // doesn't match.
  'Manager DN',
  'User Type',
];

// Fields highlighted on every source's individual account detail page, regardless of source.
// Manager_Name, Employee_Type, Birth_Date, and Relationship_Status were added per the
// Rush design doc's "always relevant, any lifecycle state" cross-source identity fields
// (Correlation Key, DOB, Manager, Employee Type, Lifecycle/Identity State) — confirmed
// present as exact on-screen labels on RUSH Lawson, ECHO, and Ellucian account detail pages.
// IIQDisabled confirmed present the same way across all sources checked so far.
const ACCOUNT_DETAIL_FIELDS_BASE = [
  'Status',
  'Identity',
  'Source Name',
  'Stage_Key',
  'Source_Name',
  'Correlation_Key',
  'Manager_Name',
  'Employee_Type',
  'Birth_Date',
  'Relationship_Status',
  'IIQDisabled',
];

function extraFieldsFor(sourceName: string, kind: 'detailExtras' | 'accountDetailExtras'): string[] {
  return SOURCE_FIELD_PROFILES[sourceName]?.[kind] ?? [];
}

function uniqueFields(fields: string[]): string[] {
  const seen = new Set<string>();
  const result: string[] = [];
  for (const field of fields) {
    const key = field.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    result.push(field);
  }
  return result;
}

// Sources with a confirmed field schema (verified via real screenshots) —
// these use ACCOUNT_DETAIL_FIELDS_BASE + SOURCE_FIELD_PROFILES extras.
const KNOWN_HR_SOURCES = new Set([
  'RUSH Lawson',
  'Copley Lawson',
  'ECHO Credentialed Providers',
  'Ellucian Students',
  'Non-Employee Workforce',
]);

// Field lists for Active Directory and ServiceNow SaaS, built from the
// technical attribute names in the Rush Master Data Mapping document
// (Identity Security Cloud Target Systems > Active Directory / ServiceNow
// Accounts columns) — NOT yet confirmed against a live screenshot the way
// the five HR sources' field names were. highlightFields silently skips any
// label that doesn't match on-screen text, so this is a safe attempt: fields
// that don't actually appear just won't highlight, rather than erroring.
const AD_ACCOUNT_FIELDS = [
  'sAMAccountName',
  'mail',
  'sn',
  'givenName',
  'distinguishedName',
  'employeeID',
  'displayName',
  'physicalDeliveryOfficeName',
  'telephoneNumber',
  'title',
  'departmentNumber',
  'mobile',
  'objectguid',
  'proxyAddresses',
];

const SERVICENOW_ACCOUNT_FIELDS = [
  'user_name',
  'email',
  'last_name',
  'first_name',
  'mobile_phone',
  'employee_number',
  'sys_id',
  'active',
  'locked_out',
  'vip',
  'time_zone',
  'ldap_server',
];

// Returns the best field list available for a source: the confirmed HR
// profile for known sources, a mapping-doc-derived list for AD/ServiceNow,
// or the generic account base as a last attempt for anything else
// (IdentityNow or any other source not otherwise recognized).
function accountFieldsFor(sourceName: string, lifecycleExtras: string[] = []): string[] {
  let base: string[];
  if (KNOWN_HR_SOURCES.has(sourceName)) {
    base = [...ACCOUNT_DETAIL_FIELDS_BASE, ...extraFieldsFor(sourceName, 'accountDetailExtras')];
  } else if (sourceName === 'TEST RUSH AD') {
    base = AD_ACCOUNT_FIELDS;
  } else if (sourceName === 'ServiceNow SaaS') {
    base = SERVICENOW_ACCOUNT_FIELDS;
  } else {
    base = ACCOUNT_DETAIL_FIELDS_BASE;
  }
  return uniqueFields([...base, ...lifecycleExtras]);
}

function resolveDetailFields(testCase: TestCase, primaryName: string): string[] {
  if (testCase.detailFields) {
    return uniqueFields([...testCase.detailFields, ...(testCase.detailExtras ?? [])]);
  }
  return uniqueFields([
    ...DETAIL_FIELDS_BASE,
    ...extraFieldsFor(primaryName, 'detailExtras'),
    ...(testCase.detailExtras ?? []),
  ]);
}

function resolveAccountFields(sourceName: string, testCase: TestCase, primaryName: string): string[] {
  const bySource = testCase.accountDetailFieldsBySource?.[sourceName];
  if (bySource) return uniqueFields(bySource);

  if (sourceName === primaryName && testCase.accountDetailFields) {
    return uniqueFields([...testCase.accountDetailFields, ...(testCase.accountDetailExtras ?? [])]);
  }

  const extras = sourceName === primaryName ? (testCase.accountDetailExtras ?? []) : [];
  return accountFieldsFor(sourceName, extras);
}

// Values matching any of these (case-insensitive, trimmed) count as "blank" for
// the end-of-report blank-field summary — SailPoint renders empty attributes as
// one of these placeholders rather than a truly empty string.
const BLANK_VALUES = new Set(['', '--', '-', 'n/a', 'null']);

function isBlank(value: string | undefined): boolean {
  return value === undefined || BLANK_VALUES.has(value.trim().toLowerCase());
}

// Records which highlighted fields came back blank, tagged with where they were found.
// A label can appear more than once on a page (e.g. a top-level "Status" badge
// plus a separate "Status" row in the attributes grid) — each occurrence is
// checked and reported individually rather than collapsing to one value, so a
// populated occurrence never masks a blank one or vice versa.
function collectBlanks(context: string, values: Record<string, string[]> | void, blankFields: string[]) {
  if (!values) return;
  for (const [field, occurrences] of Object.entries(values)) {
    occurrences.forEach((value, i) => {
      if (isBlank(value)) {
        const suffix = occurrences.length > 1 ? ` (occurrence ${i + 1} of ${occurrences.length} on page)` : '';
        blankFields.push(`${context} — ${field}${suffix}`);
      }
    });
  }
}

// Best-effort equality for the DB cross-check below: exact match first, then
// falls back to comparing as dates — the UI and the My_Rush_Jobs staging
// table often render the same date differently (e.g. "05/10/1998" on screen
// vs "1998-05-10" in the DB), which would otherwise flag as a false mismatch
// on every single date field, every run.
function valuesRoughlyMatch(uiValue: string, dbValue: string): boolean {
  const a = uiValue.trim().toLowerCase();
  const b = dbValue.trim().toLowerCase();
  if (a === b) return true;
  const dateA = new Date(uiValue);
  const dateB = new Date(dbValue);
  return !isNaN(dateA.getTime()) && !isNaN(dateB.getTime()) && dateA.getTime() === dateB.getTime();
}

// Cross-checks one source's Account Detail page against its own row in the
// My_Rush_Jobs staging table (by that source's Stage_Key) — safe to compare
// directly because both sides describe the SAME source's own account, unlike
// the Identity Details page (see the Correlation Key comment below), which
// pulls several fields from RUSH Lawson specifically regardless of which
// source is primary. Only fields that exist as an exact-name column on the DB
// row are compared (Account Detail field labels are already underscore-cased
// to match My_Rush_Jobs column names) — this also naturally skips UI-only
// fields like "Identity" or "Source Name" that have no DB equivalent. Returns
// only mismatch lines; a clean comparison contributes nothing.
function compareAccountToDbRow(sourceName: string, accountValues: Record<string, string[]>, dbRow: Record<string, string>): string[] {
  const mismatches: string[] = [];
  for (const [field, occurrences] of Object.entries(accountValues)) {
    if (!(field in dbRow)) continue;
    const uiValue = occurrences[0];
    const dbValue = dbRow[field];
    if (isBlank(uiValue) || isBlank(dbValue)) continue;
    if (!valuesRoughlyMatch(uiValue, dbValue)) {
      mismatches.push(`${sourceName}: ${field} — on-screen "${uiValue}" vs. My_Rush_Jobs "${dbValue}"`);
    }
  }
  return mismatches;
}

/**
 * Runs the full search -> Process Identity -> Details -> Roles/Entitlements ->
 * Accounts -> account-detail-drilldown pathway for one test case and writes
 * its report. Called from tests/sources/<source>/<lifecycle>.spec.ts
 * (Copley Lawson, then RUSH Lawson) and from rush_regression.spec.ts for leftover multi-source cases.
 */
export async function runRegressionCase(page: Page, testCase: TestCase) {
  await page.setViewportSize({ width: 1600, height: 2000 });

  const primary = testCase.sources[0];
  const allSourceNames = testCase.sources.map((s) => s.name);
  const label = testCase.scenarioName;
  // Only Stage_Keys we actually configured are known — accounts discovered
  // beyond testCase.sources (ServiceNow SaaS, TEST RUSH AD, etc.) have no
  // Stage_Key to look up in My_Rush_Jobs and are skipped by the DB check.
  const stageKeyBySource = new Map(testCase.sources.map((s) => [s.name, s.stageKey]));
  const dbCheckEnabled = isDbConfigured();
  const databaseChecks: string[] = [];
  const dbCheckedSources: string[] = [];

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

  const blankFields: string[] = [];
  const checkedSummary: string[] = [
    `Account Search: Stage Key match ("${primary.stageKey}") on ${primary.name}`,
  ];
  if (testCase.lifecycle) {
    checkedSummary.push(`Lifecycle: ${lifecycleLabel(testCase.lifecycle)}`);
  }
  // Tracks which expected-value checks have been resolved (PASS/FAIL) already,
  // keyed by field name, so a check found on the Details page isn't
  // re-evaluated against the account page too, and so the final report lists
  // every check exactly once regardless of which page it lived on.
  const resolvedChecks = new Map<string, string>();

  await highlightSearchInput(page, 'search-bar-input');
  await highlightIdentityLink(page, identityName);
  if (testCase.searchHighlightTexts?.length) {
    for (const text of testCase.searchHighlightTexts) {
      await highlightValuesContaining(page, text);
    }
  }
  await screenshotContent(page, `temp/${label}_1_Search.png`);
  await removeHighlightOverlays(page);

  await page.getByRole('link', { name: identityName }).click();

  // Section 2: Process Identity (Actions menu + success toast)
  await captureProcessIdentityEvidence(
    page,
    `temp/${label}_2_ProcessIdentity.png`,
    `temp/${label}_2_ProcessSuccess.png`
  );
  checkedSummary.push('Process Identity: Actions → Process Identity, success toast');

  // Section 3: Identity Page - Details & Attributes
  const detailFields = resolveDetailFields(testCase, primary.name);
  const detailValues = await captureSection(page, {
    waitForText: 'COST CENTER',
    highlightFn: async () => {
      const values = await highlightFields(page, detailFields);
      // Resolve any expected-value checks whose field lives on this page,
      // and recolor failures red BEFORE the screenshot below is taken.
      for (const check of testCase.expectedValues ?? []) {
        const outcome = evaluateCheck(check, values);
        if (outcome) {
          resolvedChecks.set(check.field, formatCheckResult(check, outcome));
          if (outcome.result === 'FAIL') {
            await highlightFieldRed(page, check.field);
          }
        }
      }
      return values;
    },
    screenshotPath: `temp/${label}_2_Details.png`,
  });
  collectBlanks(`Identity Details (${primary.name})`, detailValues, blankFields);
  checkedSummary.push(`Identity Details (${primary.name}): ${detailFields.join(', ')}`);

  // Section 3: Access - Roles (every table page when paginated)
  const rolesCapture = await capturePaginatedSection(page, {
    clickAction: () => page.getByText('Access', { exact: true }).click(),
    highlightFn: async () => {
      await highlightTabCount(page, 'Roles');
      if (testCase.highlightIdentityOnAccess) {
        await highlightIdentityLink(page, identityName);
      }
    },
    screenshotPathPrefix: `temp/${label}_3_Roles`,
    captionBase: 'Roles',
  });
  checkedSummary.push(
    `Access — Roles: role count` +
      (rolesCapture.images.length > 1 ? ` (${rolesCapture.images.length} pages captured)` : '')
  );

  // Section 3: Access - Entitlements (every table page when paginated)
  const entitlementsCapture = await capturePaginatedSection(page, {
    clickAction: () => page.getByRole('button', { name: /Entitlements/ }).click(),
    highlightFn: async () => {
      await highlightTabCount(page, 'Entitlements');
      if (testCase.highlightIdentityOnAccess) {
        await highlightIdentityLink(page, identityName);
      }
    },
    screenshotPathPrefix: `temp/${label}_3_Entitlements`,
    captionBase: 'Entitlements',
  });
  checkedSummary.push(
    `Access — Entitlements: entitlement count` +
      (entitlementsCapture.images.length > 1
        ? ` (${entitlementsCapture.images.length} pages captured)`
        : '')
  );

  // Section 4: Accounts summary - all sources in this scenario
  const accountStatusSources = testCase.accountStatusSources ?? allSourceNames;
  await captureSection(page, {
    clickAction: () => page.getByText('Accounts', { exact: true }).click(),
    highlightFn: async () => {
      await highlightMultipleAccountRows(page, accountStatusSources);
      if (primary.stageKey) {
        await highlightExactTexts(page, [primary.stageKey]);
      }
    },
    screenshotPath: `temp/${label}_4_Accounts.png`,
  });
  checkedSummary.push(`Accounts: Enabled/Disabled status for ${accountStatusSources.join(', ')}`);

  // Discover every account this identity actually has, not just the sources
  // named in this TestCase — so incidental accounts (IdentityNow, ServiceNow
  // SaaS, TEST RUSH AD, etc.) get visited and validated too. Falls back to
  // the configured sources if discovery finds nothing (e.g. a page layout
  // change breaks the row-parsing heuristic), so the run degrades instead of
  // silently checking nothing.
  let sourcesToVisit = await getAllAccountSourceNames(page);
  console.log(`Account discovery found ${sourcesToVisit.length} source(s): ${sourcesToVisit.join(', ') || '(none)'}`);
  if (sourcesToVisit.length === 0) {
    console.log('Falling back to configured sources only.');
    sourcesToVisit = allSourceNames;
  }
  if (testCase.accountDetailSources?.length) {
    const wanted = testCase.accountDetailSources;
    const discovered = sourcesToVisit;
    sourcesToVisit = discovered.length === 0
      ? wanted
      : wanted.filter((name) => discovered.includes(name));
    console.log(`Account drill-down limited to: ${sourcesToVisit.join(', ') || '(none)'}`);
  }
  checkedSummary.push(`Accounts discovered on this identity: ${sourcesToVisit.join(', ')}`);

  // Section 5: Individual account detail page(s) — covers EVERY discovered
  // account, not just the ones this TestCase configured, so each source's
  // account can be cross-checked against the Identity Details page.
  const accountDetailImages: { path: string; caption: string }[] = [];
  const correlationMismatches: string[] = [];
  const unconfirmedFieldSources: string[] = [];

  // Identity Details page's Correlation Key — the ground-truth value every
  // correlated HR-source account's own Correlation_Key should match.
  const detailsCorrelationKey = detailValues?.['Correlation Key']?.[0];

  for (const sourceName of sourcesToVisit) {
    const marked = await markAccountRowLink(page, sourceName, 'target-account-link');
    if (!marked) {
      console.log(`Could not find account row for ${sourceName} — skipping detail capture.`);
      continue;
    }

    await page.locator('[data-marker="target-account-link"]').click();
    await waitForLoadingToFinish(page);
    await expandAllScrollAreas(page);
    await highlightPageTitle(page, sourceName);

    const isKnownHrSource = KNOWN_HR_SOURCES.has(sourceName);
    const accountFields = resolveAccountFields(sourceName, testCase, primary.name);
    const accountValues = await highlightFields(page, accountFields);
    collectBlanks(`${sourceName} Account Detail`, accountValues, blankFields);
    if (isKnownHrSource && dbCheckEnabled && stageKeyBySource.has(sourceName)) {
      const stageKey = stageKeyBySource.get(sourceName)!;
      dbCheckedSources.push(sourceName);
      try {
        const dbRow = await getStagingRow('My_Rush_Jobs', stageKey);
        if (!dbRow) {
          databaseChecks.push(`${sourceName}: no row found in My_Rush_Jobs for Stage_Key "${stageKey}"`);
        } else {
          databaseChecks.push(...compareAccountToDbRow(sourceName, accountValues, dbRow));
        }
      } catch (err) {
        databaseChecks.push(`${sourceName}: database check failed — ${(err as Error).message}`);
      }
    }
    if (sourceName === primary.name) {
      // Resolve any expected-value checks that weren't found on the Details
      // page (e.g. Primary_Position, which only exists on the account page),
      // recoloring failures red before this iteration's screenshot below.
      for (const check of testCase.expectedValues ?? []) {
        if (resolvedChecks.has(check.field)) continue;
        const outcome = evaluateCheck(check, accountValues);
        if (outcome) {
          resolvedChecks.set(check.field, formatCheckResult(check, outcome));
          if (outcome.result === 'FAIL') {
            await highlightFieldRed(page, check.field);
          }
        }
      }
    }
    if (isKnownHrSource) {
      const ouMatches = await highlightValuesContaining(page, 'OU=');
      if (ouMatches.length === 0) {
        blankFields.push(`${sourceName} Account Detail — Distinguished Name (no value containing "OU=" found on page)`);
      }
    }

    const hasExplicitFieldList = Boolean(testCase.accountDetailFieldsBySource?.[sourceName]);
    if (!isKnownHrSource && !hasExplicitFieldList) unconfirmedFieldSources.push(sourceName);
    checkedSummary.push(
      `${sourceName} Account Detail: ${accountFields.join(', ')}` +
        (isKnownHrSource ? ', Distinguished Name (OU= substring), Correlation Key match vs. Identity Details' : '') +
        (!isKnownHrSource && !hasExplicitFieldList ? ' (field list unconfirmed for this source)' : '')
    );

    // Correlation Key is the literal identifier linking an account to this
    // identity — unlike Employee Type/Manager/Birth Date/etc (which the
    // Identity Profile mapping hardcodes to RUSH Lawson specifically, so
    // comparing those against every source would flag expected differences
    // as false mismatches), every correlated HR-source account's own
    // Correlation_Key should match the Details page's value. AD and
    // ServiceNow are deliberately excluded from this check — per the design
    // doc's Non-Authoritative Source Correlation table, they correlate on
    // Employee Number / Username+Email respectively, not the same hashed
    // Correlation Key, so comparing them here would always mismatch.
    if (isKnownHrSource) {
      const accountCorrelationKey = accountValues['Correlation_Key']?.[0];
      if (detailsCorrelationKey && accountCorrelationKey && !isBlank(accountCorrelationKey)) {
        if (detailsCorrelationKey.trim() !== accountCorrelationKey.trim()) {
          correlationMismatches.push(
            `${sourceName}: Correlation_Key on this account ("${accountCorrelationKey}") does not match the Identity Details Correlation Key ("${detailsCorrelationKey}")`
          );
        }
      }
    }

    const detailPath = `temp/${label}_5_${sourceName.replace(/\s+/g, '_')}.png`;
    await screenshotContent(page, detailPath);
    accountDetailImages.push({ path: detailPath, caption: `${sourceName} — Account Detail` });

    await page.goBack();
    await waitForLoadingToFinish(page);
  }

  const sections: Parameters<typeof buildReport>[1] = [
    { title: `Account Search — ${primary.name}`, images: [{ path: `temp/${label}_1_Search.png` }] },
    {
      title: 'Process Identity',
      images: [
        { path: `temp/${label}_2_ProcessIdentity.png`, caption: 'Actions → Process Identity' },
        { path: `temp/${label}_2_ProcessSuccess.png`, caption: 'Success — identity is now processing' },
      ],
    },
    { title: 'Identity Page — Details & Attributes', images: [{ path: `temp/${label}_2_Details.png` }] },
    {
      title: 'Access — Roles & Entitlements',
      images: [...rolesCapture.images, ...entitlementsCapture.images],
    },
    {
      title: allSourceNames.length > 1 ? 'Accounts — Multi-Source Status' : 'Accounts',
      images: [{ path: `temp/${label}_4_Accounts.png` }],
    },
  ];

  if (accountDetailImages.length > 0) {
    sections.push({
      title: 'Account Detail Pages',
      note:
        `Account detail shown below for: ${sourcesToVisit.join(', ')}.` +
        (unconfirmedFieldSources.length > 0
          ? ` Field list for ${unconfirmedFieldSources.join(', ')} is based on the Rush Master Data Mapping document's technical attribute names, not yet confirmed against a live screenshot — verify the highlighted fields below look correct.`
          : ''),
      images: accountDetailImages,
    });
  }

  const valueAssertions = (testCase.expectedValues ?? []).map(
    (check) => resolvedChecks.get(check.field) ?? formatCheckResult(check, undefined)
  );
  if (valueAssertions.length > 0) {
    checkedSummary.push(`Expected value assertions: ${testCase.expectedValues!.map((c) => c.field).join(', ')}`);
  }

  if (dbCheckedSources.length > 0) {
    checkedSummary.push(`Database cross-check: My_Rush_Jobs staging table vs. Account Detail (${dbCheckedSources.join(', ')})`);
  }

  const reportFileName = buildReportFileName(identityName);
  const reportPath = localReportPath(reportFileName);

  await buildReport(
    {
      sourceLabel: allSourceNames.join(' & '),
      identityName,
      caseId: testCase.sources.map((s) => s.stageKey).join(' / '),
    },
    sections,
    reportPath,
    checkedSummary,
    blankFields,
    correlationMismatches,
    valueAssertions,
    dbCheckEnabled ? databaseChecks : undefined
  );

  // Destination is SharePoint. Stage locally → upload → delete local staging copy.
  const published = await uploadReportForSource(reportPath, reportFileName, primary.name);
  if (published) {
    removeLocalReportCopy(reportPath);
  } else {
    console.log(`SharePoint publish skipped — staging file kept at ${reportPath}`);
  }
}