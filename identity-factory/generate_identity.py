"""
Generate a synthetic My_Rush_Jobs identity — one row per requested source,
sharing the same name/DOB/generated IDs (a "multi-source" identity is one
person with a separate Stage_Key/account per source, correlating into one
IdentityNow identity once aggregated).

No SailPoint API calls, no SQL connection — this only builds rows in memory,
writes the local SQLite mirror + Excel audit log (same bookkeeping as
create_test_account.py), and prints a handoff JSON on stdout (only the JSON
goes to stdout; progress lines go to stderr) for
tests/sql/create-and-insert-identity.spec.ts to consume and actually INSERT
via SSMS.

  cd identity-factory
  python generate_identity.py --sources copley --lifecycle active
  python generate_identity.py --sources copley rush --lifecycle active --first Jane --last Doe
  python generate_identity.py --accounts rush:active copley:prehire

To add another source to an identity that already exists (e.g. someone
created Workday-only earlier and now also needs a Copley account), pass
--number with the 12-digit number embedded in their existing Stage_Key
(the digits between "-9001" and "ER", e.g. "179069605612" from
WD-9001179069605612ER) plus their exact --first/--last, and --sources with
only the NEW source(s) — this reuses that number instead of allocating a
fresh one, so the new row's User_ID lines up with the existing account(s).

Note (2026-10-23): User_ID (the 6-digit employee ID) is now prefixed per
source — 0001 rush, 0002 copley, 003 nerm, 004 echo, 005 ellucian, 006
workday — so the rows of one multi-source identity each carry a DIFFERENT
User_ID, by design (see source_user_id() in user_payload.py). On the
--number add-a-source path this means the new source's row does NOT reuse
the existing account's User_ID: it gets its own source-prefixed one from the
same number, and correlation to the existing identity rests entirely on
Correlation_Key matching (see below). Identities created before this change
share one User_ID across their sources; nothing migrates them.

IMPORTANT — Correlation_Key must be byte-for-byte identical across every
source's row for the same identity, confirmed against a real manually
correlated identity (Non-Employee Workforce + Copley Lawson: identical
Correlation_Key, different Stage_Key). New identities get this for free —
the default Correlation_Key is derived only from --number, so it's already
the same for every --sources value in one run. But an identity created
BEFORE this default existed has its own Correlation_Key already stored in
the DB (visible on its account/identity in the SailPoint UI, or via a
SELECT) that this script cannot re-derive on its own — pass it explicitly
with --correlation-key so the new source's row matches it exactly:
  python generate_identity.py --sources copley --lifecycle active --first Pablo --last Foster --number 179069605612 --correlation-key "..."

Note (2026-09-29): Stage_Key format changed from <prefix>-9512<6 digits>ER
to <prefix>-9001<epoch seconds><2 random digits>ER (12 digits total),
applied to every source, per user request — the digits after "9001" are the
Unix epoch timestamp (seconds) the identity was generated at, decodable at
epochconverter.com, plus 2 random digits as a same-second-collision safety
net. Correlation_Key's literal prefix switched from "9512" to "9001" to
match. Any --number example above uses the new 12-digit shape; identities
created before this change still have the old 6-digit shape in the DB and
their number can't be reused with today's stage_key() (it would produce a
different Stage_Key than what's already stored for them).
"""

from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path

from dotenv import load_dotenv

# Load identity-factory/.env by its own absolute path, not a bare
# load_dotenv() — this script is normally invoked as
# "python identity-factory/generate_identity.py" from the repo root (that's
# how tests/helpers/generatorClient.ts calls it too), and load_dotenv()'s
# default cwd-relative search would never find a .env one directory below
# the current working directory.
load_dotenv(Path(__file__).resolve().parent / ".env")

from excel_store import append_identity, used_first_last, used_stage_keys
from local_table import save_row, to_insert_sql
from user_payload import (
    LIFECYCLES,
    SOURCES,
    build_my_rush_jobs_row,
    random_birth_date,
    stage_key,
    unique_id,
    unused_person_name,
)

REPO_ROOT = Path(__file__).resolve().parent.parent
DEFAULT_OUT_DIR = REPO_ROOT / "temp"


def parse_account_token(token: str) -> tuple[str, str]:
    """'rush:active' -> ('rush', 'active'). Used by --accounts so each source
    on one identity can have its own lifecycle (mixed multi-account cases)
    while still sharing name/DOB/number/Correlation_Key."""
    if ":" not in token:
        raise argparse.ArgumentTypeError(
            f'--accounts values must be SOURCE:LIFECYCLE (e.g. rush:active), got "{token}".'
        )
    source_key, lifecycle = token.split(":", 1)
    source_key = source_key.strip().lower()
    lifecycle = lifecycle.strip().lower().replace(" ", "").replace("-", "")
    aliases = {"futurehire": "futurehire", "future": "futurehire"}
    lifecycle = aliases.get(lifecycle, lifecycle)
    if source_key not in SOURCES:
        raise argparse.ArgumentTypeError(
            f'Unknown source "{source_key}". Known: {", ".join(sorted(SOURCES))}.'
        )
    if lifecycle not in LIFECYCLES:
        raise argparse.ArgumentTypeError(
            f'Unknown lifecycle "{lifecycle}". Known: {", ".join(LIFECYCLES)}.'
        )
    return source_key, lifecycle


def allocate_number(prefixes: list[str], used: set[str]) -> str:
    """One number shared across every requested source's Stage_Key for this
    identity, retried together so no source's key collides with an
    already-used one (per the local Excel audit log)."""
    for _ in range(50):
        number = unique_id()
        keys = [stage_key(prefix, number) for prefix in prefixes]
        if not any(k in used for k in keys):
            return number
    raise SystemExit("Could not allocate a unique Stage_Key after 50 attempts")


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument(
        "--sources", nargs="+", choices=list(SOURCES),
        help="One or more source keys. Multiple = one person with an account on each. "
             "Requires --lifecycle (same state on every source). For mixed states use --accounts.",
    )
    parser.add_argument(
        "--lifecycle", choices=list(LIFECYCLES),
        help="Lifecycle applied to every --sources row. Omit when using --accounts.",
    )
    parser.add_argument(
        "--accounts", nargs="+", metavar="SOURCE:LIFECYCLE",
        help="Per-source lifecycle on one identity, e.g. rush:active copley:prehire. "
             "Same correlation rules as --sources (shared name/DOB/number/Correlation_Key); "
             "each row gets its own lifecycle dates plus that source's structural template. "
             "Mutually exclusive with --sources/--lifecycle.",
    )
    parser.add_argument("--first", default=None, help="Override first name. Default: a new random name each run.")
    parser.add_argument("--last", default=None, help="Override last name. Default: a new random name each run.")
    parser.add_argument(
        "--out", default=None,
        help="Write the handoff JSON here too (default: temp/generated_identity_<label>.json in the repo root).",
    )
    parser.add_argument(
        "--number", default=None,
        help=(
            "Reuse this 12-digit number (from an existing Stage_Key, e.g. "
            "\"179069605612\" from WD-9001179069605612ER) instead of "
            "allocating a new one — use this to add another source to an "
            "identity that already exists elsewhere, so the new row "
            "correlates with it. Requires --first/--last to match that "
            "existing identity."
        ),
    )
    parser.add_argument(
        "--birth-date", default=None, dest="birth_date",
        help=(
            "Reuse this exact Birth_Date (YYYY-MM-DD) instead of generating "
            "a random one — use this together with --number so a new "
            "source's row matches an existing identity's Birth_Date exactly. "
            "Default: one random date is generated and shared across every "
            "source in --sources for this run."
        ),
    )
    parser.add_argument(
        "--correlation-key", default=None, dest="correlation_key",
        help=(
            "Reuse this exact Correlation_Key instead of the default "
            "(derived from --number) — required when adding a source to an "
            "identity created before this default existed, so the new "
            "row's Correlation_Key matches what's already stored for that "
            "identity's other source(s). Paste the exact value from the "
            "existing account/identity in the SailPoint UI or a DB SELECT."
        ),
    )
    parser.add_argument(
        "--start-date", default=None, dest="start_date",
        help=(
            "Override Start_Date/Original_Start_Date (YYYY-MM-DD) instead "
            "of the lifecycle's computed default (e.g. 'active' normally "
            "uses yesterday). End_Date/Status/IIQDisabled still come from "
            "--lifecycle as usual, so e.g. an 'active' identity with a "
            "2025 --start-date still reads as currently active, just with "
            "a real historical start."
        ),
    )
    parser.add_argument(
        "--primary-position", default=None, dest="primary_position", choices=["YES", "NO"],
        help=(
            "Override Primary_Position instead of every source's template "
            "default ('YES') — e.g. for a non-primary test user. Takes "
            "precedence even over --lifecycle processing's own 'NO' "
            "default."
        ),
    )
    parser.add_argument(
        "--end-date", default=None, dest="end_date",
        help=(
            "Override End_Date instead of the lifecycle's computed value "
            "(today + 180 days). Pass BLANK (or NULL/NONE) to leave it "
            "genuinely empty — stored as SQL NULL — which is what a "
            "futurehire/prehire test user with no scheduled end needs. "
            "Otherwise pass a YYYY-MM-DD date. Status/IIQDisabled/Start_Date "
            "still come from --lifecycle/--start-date as usual."
        ),
    )
    parser.add_argument(
        "--oneup-manager-employee-id", default=None, dest="oneup_manager_employee_id",
        help=(
            "Override OneUp_Manager_Employee_ID instead of the source "
            "template's own constant — e.g. point a RUSH Lawson identity's "
            "one-up manager at an existing Copley Lawson test identity's "
            "employee ID. OneUp_Manager_Network_ID is left untouched."
        ),
    )
    parser.add_argument(
        "--user-id", nargs="+", default=None, dest="user_ids", metavar="SOURCE=ID",
        help=(
            "Use this exact 6-digit User_ID for a source instead of deriving a "
            "tier-1 one from the number, e.g. --user-id rush=001234 copley=000256. "
            "Must sit in one of that source's prefix tiers (rush 0001xx/001xxx/"
            "01xxxx/1xxxxx, nerm 003xxx/03xxxx/3xxxxx, ...). The creation specs "
            "pass a free one picked from the live My_Rush_Jobs table."
        ),
    )
    args = parser.parse_args()

    if args.accounts and (args.sources or args.lifecycle):
        parser.error("--accounts cannot be combined with --sources/--lifecycle.")
    if args.accounts:
        try:
            accounts = [parse_account_token(token) for token in args.accounts]
        except argparse.ArgumentTypeError as err:
            parser.error(str(err))
        seen_sources = [source for source, _ in accounts]
        if len(set(seen_sources)) != len(seen_sources):
            parser.error("--accounts lists the same source more than once — each source can appear only once on one identity.")
    elif args.sources and args.lifecycle:
        accounts = [(source_key, args.lifecycle) for source_key in args.sources]
    else:
        parser.error("Provide either --sources plus --lifecycle, or --accounts SOURCE:LIFECYCLE ...")

    user_ids: dict[str, str] = {}
    for token in args.user_ids or []:
        if "=" not in token:
            parser.error(f'--user-id values must be SOURCE=ID (e.g. rush=001234), got "{token}".')
        source_key, value = (part.strip() for part in token.split("=", 1))
        if source_key not in SOURCES:
            parser.error(f'--user-id: unknown source "{source_key}".')
        user_ids[source_key] = value
    extra = set(user_ids) - {source_key for source_key, _ in accounts}
    if extra:
        parser.error(f"--user-id given for source(s) not being generated: {', '.join(sorted(extra))}")

    if args.number and not (args.first and args.last):
        parser.error("--number requires --first and --last (the existing identity's exact name).")
    if args.number and not (args.number.isdigit() and len(args.number) == 12):
        parser.error(f'--number must be exactly 12 digits, got "{args.number}".')

    first, last = args.first, args.last
    if not first or not last:
        first, last = unused_person_name(used_first_last())

    used = used_stage_keys()
    prefixes = [SOURCES[source_key]["prefix"] for source_key, _ in accounts]
    if args.number:
        number = args.number
        collisions = [stage_key(p, number) for p in prefixes if stage_key(p, number) in used]
        if collisions:
            raise SystemExit(f"Stage_Key(s) already used for this number+source: {collisions}")
    else:
        number = allocate_number(prefixes, used)

    # Generated once and shared across every source below — calling
    # build_my_rush_jobs_row per source with no birth_date would give each
    # source's row a different random Birth_Date for the same person.
    birth_date = args.birth_date or random_birth_date()

    rows = []
    for source_key, lifecycle in accounts:
        cfg = SOURCES[source_key]
        key = stage_key(cfg["prefix"], number)
        row = build_my_rush_jobs_row(
            source_key, key, number, first, last, lifecycle, birth_date, args.correlation_key, args.start_date,
            args.primary_position, args.oneup_manager_employee_id, args.end_date,
            user_ids.get(source_key),
        )
        save_row(row)
        append_identity(lifecycle, row)
        rows.append(
            {
                "sourceKey": source_key,
                "sourceName": cfg["name"],
                "stageKey": key,
                "lifecycle": lifecycle,
                "insertSql": to_insert_sql(row),
                "row": row,
            }
        )
        print(f"Generated {cfg['name']} {lifecycle} row: {key}", file=sys.stderr)

    # Multi-account correlation rules: one person, two (or more) HR rows.
    correlation_keys = {item["row"]["Correlation_Key"] for item in rows}
    birth_dates = {item["row"]["Birth_Date"] for item in rows}
    if len(correlation_keys) != 1:
        raise SystemExit(f"Correlation_Key must be identical across sources, got {correlation_keys}")
    if len(birth_dates) != 1:
        raise SystemExit(f"Birth_Date must be identical across sources, got {birth_dates}")

    lifecycle_tag = accounts[0][1] if len(set(lc for _, lc in accounts)) == 1 else "mixed"
    source_tag = "_".join(f"{source_key}_{lifecycle}" for source_key, lifecycle in accounts)
    label = f"{first}_{last}_{source_tag}".replace(" ", "_")
    out_path = Path(args.out) if args.out else DEFAULT_OUT_DIR / f"generated_identity_{label}.json"
    out_path.parent.mkdir(parents=True, exist_ok=True)

    payload = {
        "lifecycle": lifecycle_tag,
        "firstName": first,
        "lastName": last,
        "rows": rows,
    }
    out_path.write_text(json.dumps(payload, indent=2), encoding="utf-8")
    print(f"Written to {out_path}", file=sys.stderr)

    # Only the JSON goes to stdout — this is what generatorClient.ts parses.
    print(json.dumps(payload))


if __name__ == "__main__":
    main()
