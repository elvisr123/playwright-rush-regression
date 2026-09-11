# Playwright Rush Regression

Playwright automation that logs into the Rush SailPoint ISC sandbox, searches for a
test identity by Stage Key, walks through Identity Details, Access
(Roles/Entitlements), Accounts, and per-source Account Detail pages, captures
highlighted screenshots at each step, and compiles everything into a Word (.docx)
regression report per scenario. Completed reports are uploaded automatically to the
team SharePoint folder.

## Setup

```bash
npm install
npx playwright install chromium
```

Create a `.env` file in the project root (gitignored — never commit this):

```
ISC_USERNAME=
ISC_PASSWORD=
SHAREPOINT_UPLOAD=
SHAREPOINT_FOLDER_URL=
```



## Authentication

`tests/auth.setup.ts` logs into SailPoint ISC and caches the session to
`playwright/.auth/user.json` (valid for ~1 hour). A fresh login requires manual MFA
via `page.pause()`, so the first run (or any run after the cached session expires)
must be **headed**:

```bash
npx playwright test tests/auth.setup.ts --headed
```

Once a valid session exists, subsequent test runs reuse it and can run headless.

## Running tests

Run the full regression suite (every scenario in `tests/config/testcases.ts`):

```bash
npx playwright test tests/rush_regression.spec.ts
```

Run a single ad-hoc scenario without touching `testcases.ts` — hand-edit the four
constants at the top of `tests/rush_regression_adhoc.spec.ts` (scenario name,
primary/secondary source, stage key), then:

```bash
npx playwright test tests/rush_regression_adhoc.spec.ts
```

Only the `chromium` project runs by default — see `playwright.config.ts`.

## SQL Server verification (VDI only)

`tests/sql/ssms-my-rush-jobs.spec.ts` + `scripts/ssms-capture.ps1` screenshot a live
query against `[SOA].[dbo].[My_Rush_Jobs]` on the RUSH SQL Server. This only works
**inside the VDI** — the server isn't reachable from a normal dev machine, and SSMS
itself is Windows-only. It runs under its own `sql-tools` Playwright project (no
browser, no IdentityNow login):

```bash
npx playwright test --project=sql-tools
```

Prerequisites:

- Running from inside the VDI, on Windows.
- SSMS already open and **connected** to `RUTWV-IGADB01.rushtst.com` — the script
deliberately does not launch or log into SSMS itself; it fails fast if no
connected SSMS window is found.

Override the target row or query without editing the file:

```bash
$env:STAGE_KEY="CL-26082137TESTCL000AA"; npx playwright test --project=sql-tools
# or a fully custom query:
$env:SQL_QUERY="SELECT * FROM [SOA].[dbo].[My_Rush_Jobs] WHERE Status = 'Enabled';"; npx playwright test --project=sql-tools
```

Output: `temp/My_Rush_Jobs_<STAGE_KEY>_<timestamp>.png`.

### Confirming attribute values, not just a screenshot

The screenshot above is visual evidence only — it can't be asserted against in
code. To actually confirm specific column values (the same `field` /
`expected` / `matchType` pattern used in `tests/sources/*/*.spec.ts`), add
`DB_SERVER` / `DB_DATABASE` / `DB_USERNAME` / `DB_PASSWORD` to `.env` (also VDI-only —
same server) and hand-edit `EXPECTED_VALUES` at the top of
`ssms-my-rush-jobs.spec.ts`:

```
DB_SERVER=RUTWV-IGADB01.rushtst.com
DB_DATABASE=SOA
DB_USERNAME=
DB_PASSWORD=
```

```ts
const EXPECTED_VALUES: ExpectedValueCheck[] = [
  { field: 'Source_Name', expected: 'Non-Employee Workforce' },
  { field: 'Status', expected: 'Enabled' },
];
```

This runs as a second test in the same file (`DB — verify My_Rush_Jobs attributes`), connecting directly via `mssql` (`tests/helpers/dbClient.ts`)
rather than going through SSMS — it fails the test and prints a `PASS` /
`FAIL` / `NOT FOUND` line per field if anything doesn't match. Leave
`EXPECTED_VALUES` empty to skip this check and only capture the screenshot.

### Database Checks in the main regression report

Once `DB_SERVER` / `DB_DATABASE` / `DB_USERNAME` / `DB_PASSWORD` are set in `.env`
(VDI-only), the main regression suite (`tests/rush_regression.spec.ts`,
`tests/sources/**/*.spec.ts`) automatically cross-checks each known HR
source's own Account Detail page against its own row in `My_Rush_Jobs`, and
adds a **Database Checks** section to the `.docx` report listing any
mismatches (or "no discrepancies found" if everything matched), plus a
**Database Checks — Evidence** section with an actual screenshot per
checked source — a table of every compared field, the on-screen value, the
live `My_Rush_Jobs` value, and the result — so the check's own proof of
having run against a real row is visible in the report, not just a text
summary. With no `DB_*` vars set — the normal case running outside the
VDI — both sections are skipped entirely. See `AGENTS.md` for how this
avoids false positives from fields the Identity Profile mapping hardcodes to
RUSH Lawson, and for `EQUIVALENT_VALUE_GROUPS` (fields like `Status` that
use a different vocabulary in the UI vs. the DB for the same state).

## Project structure

- `tests/config/testcases.ts` — the data: `TEST_CASES` (scenarios) and
`SOURCE_FIELD_PROFILES` (per-source extra fields). The file to edit when adding a
new scenario or source-specific field.
- `tests/helpers/run_regression_case.ts` — the core automation logic
(`runRegressionCase`), shared by the full-suite and ad-hoc spec files.
- `tests/helpers/screenshotEvidence.ts` — DOM highlighting/capture primitives.
- `tests/helpers/buildReport.ts` — compiles the `.docx` report.
- `tests/helpers/sharepointUpload.ts` — uploads the finished report to the team
SharePoint folder (`{IdentityName}_{yyyy-MM-dd}_{HH-mm-ss}.docx`); a local staging
copy is written only long enough to upload, then deleted.
- `tests/sources/copley-lawson/`, `tests/sources/nerm/`, `tests/sources/rush-lawson/`
— per-lifecycle-state spec files (active, inactive, prehire, futurehire, rehire,
termed) for each source.
- `tests/sql/ssms-my-rush-jobs.spec.ts` + `scripts/ssms-capture.ps1` — SSMS
screenshot verification against the RUSH SQL Server (VDI-only, see above).

See `.cursor/rules/rush-automation-context.mdc` for detailed conventions around field
highlighting, source-specific field profiles, and known identity attribute mapping
gotchas — read it before adding new fields or sources.

## Output

- `output/` — generated reports and working artifacts (gitignored)
- `test-results/`, `playwright-report/` — Playwright's own run artifacts (gitignored)
- `temp/` — staging files created/deleted during a run (gitignored)

