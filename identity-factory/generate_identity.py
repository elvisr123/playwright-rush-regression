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

To add another source to an identity that already exists (e.g. someone
created Workday-only earlier and now also needs a Copley account), pass
--number with the 7-digit number embedded in their existing Stage_Key
(the digits between "-95" and "ER", e.g. "5763119" from WD-955763119ER)
plus their exact --first/--last, and --sources with only the NEW source(s)
— this reuses that number instead of allocating a fresh one, so the new
row's User_ID/Correlation_Key line up with the existing account(s) once
aggregated:
  python generate_identity.py --sources copley --lifecycle active --first Pablo --last Foster --number 5763119
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
        "--sources", nargs="+", required=True, choices=list(SOURCES),
        help="One or more source keys. Multiple = one person with an account on each.",
    )
    parser.add_argument("--lifecycle", required=True, choices=list(LIFECYCLES))
    parser.add_argument("--first", default=None, help="Override first name. Default: a new random name each run.")
    parser.add_argument("--last", default=None, help="Override last name. Default: a new random name each run.")
    parser.add_argument(
        "--out", default=None,
        help="Write the handoff JSON here too (default: temp/generated_identity_<label>.json in the repo root).",
    )
    parser.add_argument(
        "--number", default=None,
        help=(
            "Reuse this 7-digit number (from an existing Stage_Key, e.g. "
            "\"5763119\" from WD-955763119ER) instead of allocating a new "
            "one — use this to add another source to an identity that "
            "already exists elsewhere, so the new row correlates with it. "
            "Requires --first/--last to match that existing identity."
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
    args = parser.parse_args()

    if args.number and not (args.first and args.last):
        parser.error("--number requires --first and --last (the existing identity's exact name).")
    if args.number and not (args.number.isdigit() and len(args.number) == 7):
        parser.error(f'--number must be exactly 7 digits, got "{args.number}".')

    first, last = args.first, args.last
    if not first or not last:
        first, last = unused_person_name(used_first_last())

    used = used_stage_keys()
    prefixes = [SOURCES[s]["prefix"] for s in args.sources]
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
    for source_key in args.sources:
        cfg = SOURCES[source_key]
        key = stage_key(cfg["prefix"], number)
        row = build_my_rush_jobs_row(source_key, key, number, first, last, args.lifecycle, birth_date)
        save_row(row)
        append_identity(args.lifecycle, row)
        rows.append(
            {
                "sourceKey": source_key,
                "sourceName": cfg["name"],
                "stageKey": key,
                "insertSql": to_insert_sql(row),
                "row": row,
            }
        )
        print(f"Generated {cfg['name']} row: {key}", file=sys.stderr)

    label = f"{first}_{last}_{args.lifecycle}".replace(" ", "_")
    out_path = Path(args.out) if args.out else DEFAULT_OUT_DIR / f"generated_identity_{label}.json"
    out_path.parent.mkdir(parents=True, exist_ok=True)

    payload = {
        "lifecycle": args.lifecycle,
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
