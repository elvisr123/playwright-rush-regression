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
- **No timeout on the REST calls, fixed (2026-09-16)**: `uploadViaSharePointRest`'s
  `context.request.get/post` calls (`_api/contextinfo`, folder list/create,
  file add) had no `timeout` set. Confirmed live: one of these calls just
  hung — no error, browser sat frozen on the folder page — until the window
  was closed manually, at which point the pending request failed with
  `"Target page, context or browser has been closed"`. That message is a
  side effect of the manual close, not the actual cause; don't chase GoDaddy
  bot-detection or session issues for *this* error shape specifically —
  check whether the browser was actually frozen first. Fixed: every
  `context.request.*` call in that function now has an explicit
  `REST_TIMEOUT_MS` (20s), and the whole REST attempt is wrapped in a
  try/catch that returns `false` (not throw) on timeout/any network error —
  matters because `uploadAutomatically`'s retry loop only falls through to
  the UI-based upload fallback when this returns `false`; an uncaught
  exception would've skipped that fallback entirely.

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
   - `Escape-SendKeys`'s `$specials` array must process `{` and `}` **first**
     (2026-09-11 fix). Escaping any other special char wraps it in braces
     (e.g. `(` -> `{(}`) — if `{`/`}` are escaped in a *later* pass (the
     original order was `+^%~(){}[]`), that later pass re-escapes the braces
     the earlier pass just inserted, compounding into garbage (traced: a
     lone `(` becomes `{{{}}({}}` instead of the correct `{(}`). This stayed
     hidden through every SELECT query tried so far because they had
     brackets but no parens (nothing to compound with). It broke badly on
     the first real INSERT (`tests/sql/create-and-insert-identity.spec.ts`,
     61 bracketed column names + parens for the column list/VALUES clause):
     SendKeys choked partway through and SSMS ended up with only
     `INSERT INTO [SOA].[dbo].[My_Rush_Jobs] ` typed — cut off at exactly the
     first `(`, matching the corruption's onset. Fixed order: `{}+^%~()[]`.
   - Once typing itself worked (raised `create-and-insert-identity.spec.ts`'s
     timeouts — SendKeys typing a ~2000+ char INSERT needs well over 60s),
     the fully-typed INSERT still failed: `Msg 102 ... Incorrect syntax near
     '<Stage_Key value>'`. Cause: `identity-factory/local_table.py`'s
     `to_insert_sql()` annotated each value with a `-- ColumnName` **line**
     comment, relying on the newline after it to end the comment. But
     `ssms-capture.ps1` flattens all whitespace (including newlines) to
     single spaces before typing — so once flattened, the *first* `--`
     comment has no newline left to stop at and swallows everything after
     it, including the closing `)` and `;`. Fixed by switching to `/* ... */`
     block comments in `to_insert_sql()`, which don't depend on newlines at
     all. If a future generated query embeds a `-- comment` anywhere else,
     it will hit this same failure mode once flattened.
   - A live run after both fixes above still failed: the verification
     SELECT's query tab showed leftover INSERT-shaped text and
     "Disconnected." in the status bar (2026-09-15). **Confirmed the cause**:
     stale/accumulated query tabs from many repeated test runs in the same
     SSMS session — the "find the SSMS window" + `Ctrl+N` logic only checks
     for the SSMS *process* window, not which tab is actually
     focused/connected. Closing extra tabs / reconnecting to a clean state
     before a run fixed it on the very next attempt. Current workaround
     (close extra tabs before running); a more robust fix (detecting
     "Disconnected" and reconnecting, or avoiding tab accumulation) hasn't
     been built.
   - **Line breaks (2026-09-15, requested)**: typing used to flatten the
     whole query to one line (`-replace '\s+', ' '`) — reliable for SendKeys
     but produces an unreadable 2000+ character single line in the
     screenshot. Now types real `{ENTER}` presses at the original line
     breaks instead, with each line trimmed (not just whitespace-collapsed)
     before typing — SSMS's editor auto-indents to match the previous line,
     so also typing the source file's own leading whitespace would compound
     across lines (line 2 = auto-indent + typed indent, line 3 = that +
     typed indent again, ...). Also sends `{ESC}` before each `{ENTER}` to
     dismiss any IntelliSense/autocomplete popup first — Enter with a
     popup open accepts the suggestion instead of inserting a newline,
     which would silently corrupt the next line. **Verified working
     (2026-09-15, same successful Rush Workday run above)** — no corruption
     from IntelliSense/auto-indent observed.
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
     date in different formats. `EQUIVALENT_VALUE_GROUPS` handles fields
     that use a different vocabulary in each system for the same state (e.g.
     `Status`: UI shows Enabled/Disabled derived from `IIQDisabled`, while
     `My_Rush_Jobs`'s own `Status` column uses Active/Inactive/Terminated) —
     confirmed via a live run (2026-09-11, Non-Employee Workforce) that this
     pairing genuinely differs by vocabulary, not by an actual data problem.
   - **Verified end-to-end against a live VDI run (2026-09-11)**: the report
     produced a "Database Checks" section with one flagged line
     (`Status: Enabled vs. Active`, the vocabulary case above) plus a new
     "Database Checks — Evidence" section — a screenshot per checked source
     of the actual field-by-field comparison (rendered as an HTML table via
     `captureDbCheckEvidence`, screenshotted in a throwaway page opened on
     the same browser context so it never disturbs the main `page`'s
     navigation state) — added specifically because a text-only summary
     doesn't prove the check ran against a real, live row.

## Identity creation pipeline (in progress — Phase 1 built, unverified on the VDI)

Everything above only **documents** identities that already exist in the sandbox. This is the start of the missing upstream half: **create** new synthetic identities instead of requiring one to already exist. Full envisioned pipeline: generate → INSERT via SSMS (screenshotted) → verify → trigger SailPoint source aggregation → hand off to the existing, unmodified documentation pipeline. Only the first three steps (generate/insert/verify) are built so far — aggregation and beyond-Copley source packs are deliberately deferred (see the plan this was built from, `~/.claude/plans/ok-now-we-are-crispy-crab.md`, for the full phased design and rationale).

- **`identity-factory/user_payload.py`** was refactored (2026-09-11) to split `build_my_rush_jobs_row` into a generic identity scaffold (name/date/generated-ID fields, same for every source) merged with a new **`identity-factory/source_templates.py`**'s per-source structural fields (department/manager/location/job-code, constant per source). Only `SOURCE_TEMPLATES["copley"]` is populated (extracted byte-for-byte from the pre-refactor hardcoded values — confirmed identical output for a fixed input). The other 4 sources raise `NotImplementedError` with a clear message until someone populates their template from a live reference row (Stage_Keys already known for RUSH/ECHO/NERM from existing spec files; Ellucian has no known reference Stage_Key anywhere in this repo and needs a fresh VDI `SELECT`).
- **`identity-factory/generate_identity.py`** — new CLI, no SailPoint API calls, no SQL connection. `python generate_identity.py --sources copley --lifecycle active [--first X --last Y]`. Reuses existing `unused_person_name`/`unique_id`/`stage_key`/`save_row`/`append_identity` unchanged. Prints **only** a JSON payload to stdout (progress lines go to stderr — don't add `print()` calls without `file=sys.stderr` here, it'll break the TS side's parsing) containing one row per requested source, each with a ready-to-run `insertSql` string (from the existing `local_table.to_insert_sql()`).
- **`tests/helpers/generatorClient.ts`** — shells out to the above via `execFileSync('python', ...)`, same cross-process pattern already established for `powershell.exe`. Throws a clear, actionable error (not a raw `ENOENT`) if `python` isn't on PATH — **this is a real, confirmed risk**: an earlier VDI session showed `python --version` failing with "Python was not found; run without arguments to install from the Microsoft Store" (the Windows App Execution Alias shim), meaning Python may not actually be installed/usable on the VDI yet. Confirm `python --version` works there before relying on this.
- **`tests/sql/create-and-insert-identity.spec.ts`** — new spec (auto-routes into the `sql-tools` project, confirmed via `--list`, zero `playwright.config.ts` changes needed). Hand-edited `SOURCES_TO_CREATE`/`LIFECYCLE` constants at the top, same convention as every other spec. Flow per generated row: `runGenerator()` → INSERT via `scripts/ssms-capture.ps1` (screenshot) → verification SELECT via the same script (screenshot) → `getStagingRow` + `evaluateCheck` self-check per field (expected values are the row we just generated, not hand-maintained) → **`buildIdentityCreationReport()`** (new, in `tests/helpers/buildReport.ts`, 2026-09-15) compiles both SSMS screenshots plus a real Word **table** (not just images — `docx`'s `Table`/`TableRow`/`TableCell`, color-coded MATCH/MISMATCH/SKIPPED/NO ROW per field) into `temp/Creation_<source>_<stageKey>_<timestamp>.docx`, one per source → writes `temp/pending_aggregation_<label>.json`, the documented handoff point for the not-yet-built aggregation step. This is a separate report builder from the existing `buildReport()` (that one is the multi-page UI-based regression report; this one is purpose-built for the two-screenshot-plus-table creation-evidence shape) — don't conflate the two or try to unify their signatures, they serve different report shapes. Verified offline (fake screenshot + fake rows) that the docx actually contains a real `<w:tbl>` table with the expected field names and MATCH/MISMATCH/SKIPPED labels. **The actual INSERT-via-SSMS step itself is still not yet confirmed to succeed end-to-end on the VDI** — the report-building code is verified independently of that.
- Local test-run pollution note: running `generate_identity.py` for real writes to `identity-factory/data/My_Rush_Jobs.sqlite`, `Copley_test_identities.xlsx`, and overwrites `latest_insert.sql` (all tracked in git) — a throwaway/verification run's output was reverted with `git checkout` during this build rather than committed; be mindful of this when testing so real generated-identity history doesn't get committed by accident alongside throwaway test runs.
- **INSERT execution bugs found on the first live VDI attempts (2026-09-11/15), all fixed**: `Escape-SendKeys` in `scripts/ssms-capture.ps1` escaped `(){}[]` in the wrong order (parens/brackets before braces), corrupting long queries — fixed by escaping `{`/`}` first. `to_insert_sql()`'s per-value `-- ColumnName` line comments broke once `ssms-capture.ps1` flattens all whitespace to one line (a line comment with no newline left to stop at swallows everything after it, including the closing `);`) — fixed by switching to `/* ColumnName */` block comments (later superseded by real line breaks, see below). A stale/disconnected query tab (from accumulated tabs across many repeated runs) once caused a "no row found" false failure — worked around by closing extra SSMS tabs before a run. **Confirmed end-to-end working (2026-09-15, Rush Workday, `WD-2609158204TESTCL000EE`)**: INSERT executed, verification SELECT found the row, and every non-date field matched exactly.
  - **Date comparison bug, found by that first successful run, fixed**: `getStagingRow` did `String(value)` on every column — for a JS `Date` (how `mssql` parses a SQL `date` column with no time component), `String()` formats in the *local machine* timezone, rolling a UTC-midnight date back to the previous evening (e.g. stored `1998-05-10` read back as `"Sat May 09 1998 19:00:00 GMT-0500 ..."`). The stored data was correct; only the stringification was wrong, and it broke exact-match comparisons in `create-and-insert-identity.spec.ts` (four date fields falsely flagged MISMATCH). Fixed via `formatDbValue()`: format as plain `YYYY-MM-DD` when the UTC time-of-day is exactly midnight, matching the format `identity-factory/user_payload.py`'s `lifecycle_dates()` already generates; full ISO otherwise. This also quietly fixes the same latent risk everywhere else `getStagingRow` is used (the `run_regression_case.ts` "Database Checks" cross-check already had its own `valuesRoughlyMatch` date-fallback working around this same issue — that fallback is now redundant but harmless, left in place).
- **`workday` source added (2026-09-15)**, from a real Rush Workday INSERT sample + a user-provided old-vs-new field mapping note — `SOURCES["workday"]` (prefix `WD`) in `user_payload.py`, template in `source_templates.py`. Open items worth confirming once this runs live, not yet validated:
  - `Manager_Hold` defaults to the string `"False"` and `Legal_Hold` stays `NULL`, per an explicit user decision to keep the old-Workday convention — new Workday's actual behavior here was flagged by the user themselves as unconfirmed.
  - `Status`/`End_Date` still come from the shared `lifecycle_dates()` scaffold (`Active`/`Enabled` vocabulary) even though the one real sample row had both `NULL` — kept this way because the whole lifecycle-generation feature depends on it, but if Workday's real lifecycle-state vocabulary differs from Copley's, this will need its own `EQUIVALENT_VALUE_GROUPS`-style handling later (same pattern already used in `run_regression_case.ts` for `Status` Enabled/Active).
  - `Manager_Name: None` and `Relationship_Status: "true"` came directly from the one sample row provided — worth double-checking they're representative of Workday identities generally, not just that specific record.
  - This source is **not** yet added to `tests/config/sources.ts` or `KNOWN_HR_SOURCES` in `run_regression_case.ts` — those belong to the separate, not-yet-built documentation-handoff phase (Phase 2+), not this creation-pipeline addition.
- **`processing` lifecycle state added (2026-09-16, user-requested, generator-only)** — not one of the original 6 canonical states. Same `Start_Date`/`End_Date`/`Status`/`IIQDisabled` logic as `active` (`lifecycle_dates()` in `user_payload.py`), but `build_my_rush_jobs_row` overrides `Primary_Position` to `"NO"` after the structural-template merge (every source's template otherwise hardcodes `"YES"` as a constant) — this is the one deliberate difference, per explicit user instruction. Added to both `identity-factory/user_payload.py`'s `LIFECYCLES` tuple (so `generate_identity.py --lifecycle processing` works) and `tests/config/lifecycles.ts`'s `LIFECYCLE_STATES` (so the TS `LifecycleState` type accepts it — required for `create-and-insert-identity.spec.ts`'s `LIFECYCLE` constant to type-check). Verified via `build_my_rush_jobs_row`: `Primary_Position` is `"NO"` for both `workday` and `copley` under `processing`, while `active` is unaffected (`"YES"`) for both. **Not a validated SailPoint-side lifecycle state** — no `tests/sources/*/processing.spec.ts` exists, and there's no confirmation this maps to anything meaningful in the live Identity Profile's lifecycle classification; it exists purely as a generator input for now.
- **Known unresolved risk, confirmed real (2026-09-16)**: a Workday identity generated with `--lifecycle prehire` (`Start_Date` = +14 days, `Status="Enabled"`, `IIQDisabled=false`) was manually aggregated into IdentityNow and showed up there as **Active**, not Prehire. This is a live SailPoint Identity Profile classification question, not a bug in this repo's generator — the actual rule Workday's Identity Profile uses to classify lifecycle state lives entirely in the tenant's admin config (Admin > Identity Profiles > [Workday profile] > Lifecycle States), which this repo has no visibility into and doesn't attempt to guess at. **Do not blind-guess a new date/status combination for prehire based on this** — the next step is checking that live config (or empirically trying a few different `Start_Date` offsets and re-aggregating to observe what actually flips the classification) before changing `lifecycle_dates()`. This may also affect `active`/`processing`, which share the exact same `Start_Date`/`Status`/`IIQDisabled` values — if `prehire`'s future `Start_Date` still classifies as Active, it's plausible the classification is driven primarily by `IIQDisabled`/`Status` rather than `Start_Date` at all for this source.
- **Stage_Key format changed (2026-09-16, user-requested)**: `stage_key()` now produces `<prefix>-95<7 random digits>ER` (e.g. `WD-951234567ER`) instead of the old `<prefix>-<10-char yyMMdd+4digit number>TESTCL000<INITIALS>` shape. Applies uniformly to every source (just the prefix changes). `unique_id()` now returns exactly 7 random digits (`random.randint(0, 9999999)`, zero-padded) instead of `yyMMdd` + 4 digits — this value is also still what `User_ID`/`Provider_National_ID`/`Correlation_Key` derive from (`number[-6:]` etc.), so those are unaffected in shape, just sourced from a plain random 7-digit string now. The now-unused `SLOT = "000"` constant and the `time` import were removed. Uniqueness is still enforced the same way (`generate_identity.py`'s `allocate_number()` retries against `excel_store.used_stage_keys()`), not by `stage_key()`/`unique_id()` themselves.
- **Creation reports now upload to SharePoint (2026-09-16, user-requested)**: `create-and-insert-identity.spec.ts` calls `uploadFileToSharePointFolder()` (from `tests/helpers/sharepointUpload.ts` — the same function the main documentation pipeline uses) after building each `buildIdentityCreationReport()`. On successful upload, the local `.docx` is removed via `removeLocalReportCopy()`, same as the main pipeline; on skip/failure it's left in `temp/`. `uploadFileToSharePointFolder` spawns its own separate Chrome/SSO session internally (doesn't depend on a Playwright `page`), so this works fine from `create-and-insert-identity.spec.ts`'s browserless `sql-tools` test — no `playwright.config.ts` changes needed. Test timeout raised to 600s (matching `RUN_TIMEOUT_MS` elsewhere) to cover a possible one-time manual SSO sign-in.
  - **Destination, corrected (2026-09-16)**: initially wired as a `'VDI_Automation_Evidence'` *subfolder* passed to `uploadFileToSharePointFolder`'s `subfolder` param — this resolved relative to the default `SHAREPOINT_FOLDER_URL` (which points at `.../Rush_TestCases/testplaywright_testcases`), so it auto-created a NEW `VDI_Automation_Evidence` folder *nested inside* `testplaywright_testcases`. Wrong location: the teammate-created folder is a **sibling** of `testplaywright_testcases`, directly under `Rush_TestCases`, not a child of it. Fixed by using the folder's own direct sharing URL as the `folderSharingUrl` argument instead (constant `VDI_AUTOMATION_EVIDENCE_FOLDER_URL` at the top of `create-and-insert-identity.spec.ts`), with no `subfolder` passed — uploads go straight into that folder, nothing gets auto-created. Confirmed live (2026-09-16) that the automation runs and successfully creates/uploads (into the wrong nested location, before this fix) — the upload mechanism itself works; only the destination path was wrong. **Not yet re-run against the corrected URL.**

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
