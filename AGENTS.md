# AGENTS.md

Context for coding agents (Codex, Claude Code, etc.) working in this repo. See
README.md for setup/run commands — this file covers non-obvious gotchas and
in-progress work that aren't visible just from reading the code.

## What this project is

Playwright automation that regression-tests identity lifecycle scenarios in the
"Rush" SailPoint ISC sandbox (`rush-sb.identitynow.com`), captures screenshot
evidence at each step, compiles a Word (.docx) report per scenario, and uploads
the finished report to a team SharePoint folder.

## SharePoint upload (`tests/helpers/sharepointUpload.ts`)

This took several iterations to get right — the failure modes were non-obvious:

- **GoDaddy SSO bot detection**: the tenant federates through GoDaddy, which
  fingerprints automated browsers ("Your browser is a bit unusual…"). Playwright
  driving Chrome via CDP is itself a detectable signal, independent of any
  launch flags. Fix: sign-in happens in a plain, unattached Chrome process
  (`spawn`, no debugging port, no CDP client). Playwright only attaches via
  `chromium.connectOverCDP` **after** the session cookies are already on disk —
  never during the actual login.
- **Session drops on browser restart**: this tenant marks the SSO session as
  browser-session-scoped for some flows. Closing and relaunching Chrome between
  sign-in and upload silently lost the session. Fix: sign-in and upload share
  one continuous Chrome process/session — never close-then-reopen.
- **Chrome "still open" detection**: don't rely on a `SingletonLock` file —
  some Chrome builds/versions never create it, making close-detection hang
  forever. Use real process detection instead.
- **Silent SSO redirects**: a valid session can still show a brief
  `sso_reload=true` bounce through `login.microsoftonline.com` before landing
  on the real page. Give redirects a few seconds to settle before deciding the
  page is "stuck" on a login screen.
- If SharePoint upload starts failing again with the login page reappearing,
  suspect one of the above before assuming credentials are wrong.

## Screenshot capture (`tests/helpers/pageActions.ts`)

- `screenshotContent()` temporarily **grows the Playwright viewport** to fit
  the page's actual content height before taking a `clip` screenshot, then
  restores it. This matters because Playwright's `clip` screenshots are bounded
  by the real browser viewport — a taller `clip.height` than the viewport
  silently truncates the image rather than erroring. Bit us on the AD account
  detail page, which has an unusually long attribute grid (exceeded the
  original fixed 2000px viewport with no visible warning). If a report
  screenshot looks cropped, check this function first, not the highlighting
  logic.

## SQL Server verification

The RUSH SQL Server (`RUTWV-IGADB01.rushtst.com`) is **only reachable from
inside a VDI** — no direct network path from a normal dev machine (confirmed:
DNS doesn't even resolve outside the VDI). Two approaches exist, in order of
current preference:

1. **`tests/sql/ssms-my-rush-jobs.spec.ts` + `scripts/ssms-capture.ps1`**
   (Windows-only, runs under the `sql-tools` Playwright project — no
   IdentityNow login dependency). Automates an **already-open, already
   signed-in** SSMS window: opens a new query tab on the existing connection
   (`Ctrl+N`, so no re-login), types the query via SendKeys, executes (F5),
   and screenshots the maximized window. Deliberately does not attempt to
   launch or log into SSMS itself. **Verified end-to-end in the VDI
   (2026-09-08)** — `npx playwright test --project=sql-tools` passes and
   produces a real screenshot. Two gotchas hit and fixed along the way:
   - The query is passed via a `-QueryFile` (written to a temp `.sql` file),
     not a `-Query` string argument — `powershell.exe -File` re-tokenizes the
     trailing argument list with PowerShell's own quoting/statement-separator
     rules, so a raw SQL string with single quotes/semicolons/brackets can get
     mangled even when Node passes it as one correctly-escaped argv entry.
   - `ssms-capture.ps1` must stay pure ASCII. Windows PowerShell 5.1
     (`powershell.exe`, not `pwsh`) reads `.ps1` files without a UTF-8 BOM
     using the system ANSI codepage, not UTF-8 — a stray em dash (`—`) inside
     a string literal threw off the parser's quote/brace tracking for the
     rest of the file (`"string missing terminator"` / `"missing closing
     '}'"` errors near EOF). Don't reintroduce non-ASCII characters in this
     file.
2. **`tests/helpers/dbClient.ts`** — a direct `mssql` connection
   (`getStagingRow`), scoped to an allowlist of known tables (`STG_*` plus
   `My_Rush_Jobs`) by design (safety guard against interpolating an arbitrary
   table name into a query). **Wired into two places (2026-09-08), both
   verified working from the VDI:**
   - `tests/sql/ssms-my-rush-jobs.spec.ts`'s second test
     (`DB — verify My_Rush_Jobs attributes`) — hand-edited `EXPECTED_VALUES`
     checked against a live row, using the shared `evaluateCheck`/
     `formatCheckResult` logic in `tests/helpers/expectedValueCheck.ts`
     (extracted out of `run_regression_case.ts` so both this and the
     UI-based `expectedValues` checks share identical match semantics).
   - The main regression report itself: `run_regression_case.ts` now cross-
     checks each known-HR source's own Account Detail page against its own
     row in `My_Rush_Jobs` (by that source's Stage_Key), populating
     `buildReport.ts`'s pre-existing-but-previously-unused `databaseChecks`
     parameter/"Database Checks" section. Only fields that exist as an
     exact-name column on the DB row are compared (Account Detail labels are
     already underscore-cased to match `My_Rush_Jobs` columns), and it's
     gated entirely on `isDbConfigured()` — with no `DB_*` vars in `.env`
     (the normal case outside the VDI) this adds nothing and the report
     section doesn't render at all, so it can't break a normal Mac-side run.
     Deliberately does **not** cross-check the Identity Details page: several
     of its fields (`Employee Type`, `Correlation Key`, `Manager Name`,
     `Birth Date`, `Relationship Status`) are hardcoded in the Identity
     Profile mapping to pull from RUSH Lawson specifically regardless of
     which source is primary (see
     `.cursor/rules/rush-automation-context.mdc`), so comparing them against
     a non-RUSH-Lawson source's own DB row would flag expected differences as
     false mismatches. Date-valued fields (e.g. `Birth_Date`) get a
     best-effort date-aware comparison (`valuesRoughlyMatch`) before falling
     back to string equality, since the UI and the DB often render the same
     date in different formats.

## Project layout notes

- Multiple local copies of this project exist on this machine at different
  states (Desktop, Downloads). **This repo (with a `.git` remote pointing at
  `github.com/elvisr123/playwright-rush-regression`) is the source of truth**
  — changes made only in a sibling folder without a `.git` directory have not
  been pushed anywhere and won't be visible from a fresh clone (e.g. in the
  VDI).
- `playwright.config.ts` has three projects: `setup` (IdentityNow login),
  `chromium` (the main regression suite, depends on `setup`), and `sql-tools`
  (SQL/SSMS scripts under `tests/sql/`, deliberately has **no** dependency on
  `setup` — don't add one, it would force an unnecessary IdentityNow login for
  scripts that never touch a browser).
