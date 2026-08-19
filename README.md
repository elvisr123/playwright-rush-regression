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
- `tests/sources/copley-lawson/` — per-lifecycle-state spec files (active, inactive,
  prehire, futurehire, rehire, termed) for the Copley Lawson source.

See `.cursor/rules/rush-automation-context.mdc` for detailed conventions around field
highlighting, source-specific field profiles, and known identity attribute mapping
gotchas — read it before adding new fields or sources.

## Output

- `output/` — generated reports and working artifacts (gitignored)
- `test-results/`, `playwright-report/` — Playwright's own run artifacts (gitignored)
- `temp/` — staging files created/deleted during a run (gitignored)
