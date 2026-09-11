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
"""

from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path

from excel_store import append_identity, used_first_last, used_stage_keys
from local_table import save_row, to_insert_sql
from user_payload import LIFECYCLES, SOURCES, build_my_rush_jobs_row, stage_key, unique_id, unused_person_name

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
    args = parser.parse_args()

    first, last = args.first, args.last
    if not first or not last:
        first, last = unused_person_name(used_first_last())

    used = used_stage_keys()
    prefixes = [SOURCES[s]["prefix"] for s in args.sources]
    number = allocate_number(prefixes, used)

    rows = []
    for source_key in args.sources:
        cfg = SOURCES[source_key]
        key = stage_key(cfg["prefix"], number)
        row = build_my_rush_jobs_row(source_key, key, number, first, last, args.lifecycle)
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
