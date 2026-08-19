import { LifecycleState } from './lifecycles';

// Per-source, per-lifecycle cases live under tests/sources/<source>/<lifecycle>.spec.ts
// (Copley is first). SOURCE_FIELD_PROFILES below are source-wide extras applied
// on every lifecycle; put lifecycle-only highlights on the spec's detailExtras /
// accountDetailExtras instead.
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
  /** 'exact' = case-insensitive full match (default). 'contains' = substring
      match — use this for fields like Distinguished Name / Manager DN where
      only part of the value (e.g. an OU=) is what's actually being verified. */
  matchType?: 'exact' | 'contains';
}

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

export const TEST_CASES: TestCase[] = [
  {
    scenarioName: 'Rush_and_Eco_6',
    sources: [
      { name: 'RUSH Lawson', stageKey: 'RL-9512021TESTCL902ER' },
      { name: 'ECHO Credentialed Providers', stageKey: 'EC-9512021TESTCL902ER' },
    ],
  },
];