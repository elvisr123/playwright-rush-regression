import { LifecycleState } from './lifecycles';

// Per-source, per-lifecycle cases live under tests/sources/<source>/<lifecycle>.spec.ts
// (Copley Lawson, RUSH Lawson, RUSH Workday, NERM, ECHO, Ellucian). SOURCE_FIELD_PROFILES
// below are source-wide extras applied on every lifecycle; put lifecycle-only highlights
// on the spec's detailExtras / accountDetailExtras instead.
//
// TEST_CASES is the leftover multi-source list used by rush_regression.spec.ts.

export interface TestCaseSource {
  /** Exact source name as it appears under Admin > Sources in SailPoint. */
  name: string;
  /** Stage Key (or other search-bar identifier) used to find this identity. */
  stageKey: string;
}

export interface ExpectedValueCheck {
  /** Field label as it appears on-screen — Identity Details page or the
      primary source's own account detail page (both are checked). */
  field: string;
  /** Expected value to compare the field's actual value against. */
  expected: string;
  /** Extra accepted values (case-insensitive exact). `expected` always counts too. */
  allowed?: string[];
  /** 'exact' = case-insensitive full match (default). 'contains' = substring
      match — use this for fields like Distinguished Name / Manager DN where
      only part of the value (e.g. an OU=) is what's actually being verified. */
  matchType?: 'exact' | 'contains';
}

export type EmailAudience = 'manager' | 'user';

export interface TestCase {
  /** Used for file names, the test title, and the report title fallback. Keep it unique. */
  scenarioName: string;
  /** First entry = primary/search source. Any additional entries get an account-detail drill-down. */
  sources: TestCaseSource[];
  /** Lifecycle this case is validating. Drives report labeling; highlights come from extras below. */
  lifecycle?: LifecycleState;
  /** Extra Identity Details fields to highlight for this lifecycle (on top of source/base). */
  detailExtras?: string[];
  /** If set, used as the full Identity Details highlight list (replaces base + source extras). */
  detailFields?: string[];
  /** Extra account-detail fields to highlight on the primary source for this lifecycle. */
  accountDetailExtras?: string[];
  /** If set, used as the full account-detail highlight list for the primary source. */
  accountDetailFields?: string[];
  /** Per-source account-detail highlight lists (e.g. IdentityNow vs Copley Lawson). */
  accountDetailFieldsBySource?: Record<string, string[]>;
  /** If set, only these sources are drilled into on the Accounts tab. */
  accountDetailSources?: string[];
  /** Sources whose Enabled/Disabled status to highlight on the Accounts summary. Defaults to configured sources. */
  accountStatusSources?: string[];
  /** Extra exact-match labels to highlight on the account-search screenshot (e.g. JDBC, Disabled). */
  searchHighlightTexts?: string[];
  /** Highlight the identity name on Access Roles/Entitlements screenshots. */
  highlightIdentityOnAccess?: boolean;
  /** Optional value-level assertions — e.g. from a formal QA test case
      document's "Expected Results" — checked against the Identity Details
      page and the primary source's account detail page. Only include
      genuinely literal/pattern checks here; skip anything that's really a
      format description (e.g. "Personal Email - FirstNameLastName@gmail.com")
      or a relative-date description, since those aren't real comparison
      targets and would just produce noise. Produces a "Value Assertions"
      report section. */
  expectedValues?: ExpectedValueCheck[];
  /** Drop the account-search page from the Word report (still used to open the identity). */
  omitSearchFromReport?: boolean;
  /** Visit every matching account row, including two accounts on the same source. */
  keepDuplicateAccounts?: boolean;
  /** Do not yellow-highlight OU= values on HR account pages. */
  skipOuHighlight?: boolean;
  /** Highlight Stage Key on the Accounts summary. Defaults to true. */
  highlightStageKeyOnAccounts?: boolean;
  /**
   * Provisioning email screenshot in the Word report.
   * Defaults: prehire → manager, active → user. Set `none` to skip.
   */
  emailNotification?: EmailAudience | 'none';
}

export interface SourceFieldProfile {
  /** Extra fields to highlight on the Identity Details page when this source is primary. */
  detailExtras?: string[];
  /** Extra fields to highlight on this source's own account detail page when it's a drill-down. */
  accountDetailExtras?: string[];
}

export const SOURCE_FIELD_PROFILES: Record<string, SourceFieldProfile> = {
  'Copley Lawson': {
    // Always-on Copley account fields. Legal_Hold / Manager_Hold are termed
    // (and inactive) extras on tests/sources/copley-lawson/termed.spec.ts —
    // they are not highlighted on every Copley lifecycle.
    accountDetailExtras: ['Primary_Position'],
  },
  'RUSH Lawson': {
    // Multiple possible assignments (Primary_Position), and both Legal Hold
    // and Manager Hold apply on termination per the design doc. Relationship_Status
    // moved to the shared account-detail base since it's cross-source, not RUSH-only.
    accountDetailExtras: ['Primary_Position', 'Legal_Hold', 'Manager_Hold'],
  },
  'RUSH Workday': {
    accountDetailExtras: ['Primary_Position', 'Legal_Hold', 'Manager_Hold'],
  },
  'Rush Workday': {
    accountDetailExtras: ['Primary_Position', 'Legal_Hold', 'Manager_Hold'],
  },
  'ECHO Credentialed Providers': {
    // Design doc: no Legal/Manager Hold applicability for this source —
    // intentionally no hold fields highlighted here.
  },
  'Ellucian Students': {
    // Design doc: no Legal/Manager Hold applicability for this source —
    // intentionally no hold fields highlighted here.
  },
  'Non-Employee Workforce': {
    // Design doc: Legal Hold applies here, but Manager Hold explicitly does
    // NOT — only Legal_Hold is highlighted, so an unexpected populated
    // Manager_Hold would stand out as unhighlighted/easy to notice.
    accountDetailExtras: ['Legal_Hold'],
  },
};

// Multi-source regression scenarios — one identity per entry, verified across
// its sources' correlated accounts in the sandbox UI. stageKey placeholders of
// the form "<PREFIX>-PENDING_STAGE_KEY" mark identities that haven't been
// created yet (see AGENTS.md); replace with the real Stage_Key once that
// identity is created via the SSMS pipeline and aggregated into SailPoint.
// RUSH Workday is intentionally not covered here — no Workday identity has
// been created yet.
export const TEST_CASES: TestCase[] = [
  {
    scenarioName: 'Rush_and_Eco_6',
    sources: [
      { name: 'RUSH Lawson', stageKey: 'RL-9001179087238267ER' },
      { name: 'ECHO Credentialed Providers', stageKey: 'EC-9001179087238267ER' },
    ],
  },
  {
    scenarioName: 'Rush_and_Copley',
    sources: [
      { name: 'RUSH Lawson', stageKey: 'RL-PENDING_STAGE_KEY' },
      { name: 'Copley Lawson', stageKey: 'CL-PENDING_STAGE_KEY' },
    ],
  },
  {
    scenarioName: 'Rush_and_Nerm',
    sources: [
      { name: 'RUSH Lawson', stageKey: 'RL-PENDING_STAGE_KEY' },
      { name: 'Non-Employee Workforce', stageKey: 'NE-PENDING_STAGE_KEY' },
    ],
  },
  {
    scenarioName: 'Rush_and_Ellucian',
    sources: [
      { name: 'RUSH Lawson', stageKey: 'RL-PENDING_STAGE_KEY' },
      { name: 'Ellucian Students', stageKey: 'ES-PENDING_STAGE_KEY' },
    ],
  },
  {
    scenarioName: 'Copley_and_Nerm',
    sources: [
      { name: 'Copley Lawson', stageKey: 'CL-PENDING_STAGE_KEY' },
      { name: 'Non-Employee Workforce', stageKey: 'NE-PENDING_STAGE_KEY' },
    ],
  },
  {
    scenarioName: 'Copley_and_Echo',
    sources: [
      { name: 'Copley Lawson', stageKey: 'CL-PENDING_STAGE_KEY' },
      { name: 'ECHO Credentialed Providers', stageKey: 'EC-PENDING_STAGE_KEY' },
    ],
  },
  {
    scenarioName: 'Copley_and_Ellucian',
    sources: [
      { name: 'Copley Lawson', stageKey: 'CL-PENDING_STAGE_KEY' },
      { name: 'Ellucian Students', stageKey: 'ES-PENDING_STAGE_KEY' },
    ],
  },
  {
    scenarioName: 'Nerm_and_Echo',
    sources: [
      { name: 'Non-Employee Workforce', stageKey: 'NE-PENDING_STAGE_KEY' },
      { name: 'ECHO Credentialed Providers', stageKey: 'EC-PENDING_STAGE_KEY' },
    ],
  },
  {
    scenarioName: 'Nerm_and_Ellucian',
    sources: [
      { name: 'Non-Employee Workforce', stageKey: 'NE-PENDING_STAGE_KEY' },
      { name: 'Ellucian Students', stageKey: 'ES-PENDING_STAGE_KEY' },
    ],
  },
  {
    scenarioName: 'Echo_and_Ellucian',
    sources: [
      { name: 'ECHO Credentialed Providers', stageKey: 'EC-PENDING_STAGE_KEY' },
      { name: 'Ellucian Students', stageKey: 'ES-PENDING_STAGE_KEY' },
    ],
  },
];