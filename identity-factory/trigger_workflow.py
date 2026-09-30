"""
Trigger a SailPoint ISC workflow to create a Copley test user.

Your laptop never talks to SQL. This script POSTs to the sandbox workflow
External Trigger; the workflow's Create Account action uses the VA (inside
the firewall) to insert into My_Rush_Jobs.

Aggregation stays manual. After the workflow succeeds:
  1. Run Copley Lawson account aggregation in the UI
  2. Paste STAGE_KEY into tests/sources/copley-lawson/<lifecycle>.spec.ts
  3. Run Playwright

Setup:
  Admin → Workflows → your workflow → External Trigger
  Copy the workflow id and the trigger client id/secret into .env

  python trigger_workflow.py --dry-run --source copley --lifecycle futurehire
  python trigger_workflow.py --dry-run --source copley --lifecycle active --count 10

Identities are appended to identity-factory/data/Copley_test_identities.xlsx
(one sheet per lifecycle). Existing rows are never overwritten.
"""

from __future__ import annotations

import argparse
import json
import os

try:
    from dotenv import load_dotenv

    load_dotenv()
except ImportError:
    pass

from excel_store import EXCEL_PATH, append_identity, used_first_last, used_stage_keys
from local_table import DB_PATH, LATEST_SQL_PATH, format_row_table, save_row
from user_payload import (
    LIFECYCLES,
    SOURCES,
    build_workflow_input,
    stage_key,
    unique_id,
    unused_person_name,
)

TENANT = os.environ.get("ISC_TENANT", "")
WORKFLOW_ID = os.environ.get("ISC_WORKFLOW_ID", "").strip()
TRIGGER_CLIENT_ID = os.environ.get("ISC_WORKFLOW_CLIENT_ID") or os.environ.get("ISC_CLIENT_ID", "")
TRIGGER_CLIENT_SECRET = os.environ.get("ISC_WORKFLOW_CLIENT_SECRET") or os.environ.get("ISC_CLIENT_SECRET", "")
API = f"https://{TENANT}.api.identitynow.com"


def trigger_token() -> str:
    import requests

    r = requests.post(
        f"{API}/oauth/token",
        data={
            "grant_type": "client_credentials",
            "client_id": TRIGGER_CLIENT_ID,
            "client_secret": TRIGGER_CLIENT_SECRET,
        },
        timeout=60,
    )
    r.raise_for_status()
    return r.json()["access_token"]


def execute_workflow(tok: str, payload: dict) -> dict:
    """
    ISC External Trigger execute.
    If beta 404s on your tenant, switch the path to /v2025/workflows/execute/external/{id}
    """
    import requests

    path = f"/beta/workflows/execute/external/{WORKFLOW_ID}"
    r = requests.post(
        f"{API}{path}",
        headers={"Authorization": f"Bearer {tok}", "Content-Type": "application/json"},
        json=payload,
        timeout=60,
    )
    if r.status_code == 404:
        path = f"/v2025/workflows/execute/external/{WORKFLOW_ID}"
        r = requests.post(
            f"{API}{path}",
            headers={"Authorization": f"Bearer {tok}", "Content-Type": "application/json"},
            json=payload,
            timeout=60,
        )
    if not r.ok:
        raise SystemExit(f"POST {path} -> {r.status_code}\n{r.text}")
    return r.json() if r.text else {"ok": True}


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--source", default="copley", choices=list(SOURCES))
    parser.add_argument("--lifecycle", default="futurehire", choices=list(LIFECYCLES))
    parser.add_argument("--first", default=None, help="Override first name. Default: a new random name each run.")
    parser.add_argument("--last", default=None, help="Override last name. Default: a new random name each run.")
    parser.add_argument(
        "--count",
        type=int,
        default=1,
        help="How many identities to create. Each one is appended to the Excel sheet for this lifecycle.",
    )
    parser.add_argument(
        "--dry-run",
        action="store_true",
        help="Build the My_Rush_Jobs row locally. Do not call SailPoint.",
    )
    parser.add_argument(
        "--json",
        action="store_true",
        help="Also print the workflow JSON payload.",
    )
    args = parser.parse_args()
    if args.count < 1:
        raise SystemExit("--count must be at least 1")
    if args.count > 1 and (args.first or args.last):
        raise SystemExit("Do not use --first/--last with --count greater than 1. Names are picked uniquely from the pool.")
    if args.count > 1 and not args.dry_run:
        raise SystemExit("Use --dry-run when --count is greater than 1. SailPoint workflow is one identity at a time.")

    used_names = used_first_last()
    used_keys = used_stage_keys()
    prefix = SOURCES[args.source]["prefix"]

    last_payload = None
    for n in range(args.count):
        if args.first and args.last:
            first, last = args.first, args.last
        else:
            first, last = unused_person_name(used_names)
        number = None
        for _ in range(40):
            candidate = unique_id()
            key = stage_key(prefix, candidate)
            if key not in used_keys:
                number = candidate
                break
        if number is None:
            raise SystemExit("Could not allocate a unique Stage_Key. Run again.")
        payload = build_workflow_input(
            args.source, args.lifecycle, first=first, last=last, number=number
        )
        row = payload["sqlRow"]
        save_row(row)
        append_identity(args.lifecycle, row)
        used_names.add((first, last))
        used_keys.add(payload["stageKey"])
        last_payload = payload
        print(f"[{n + 1}/{args.count}] STAGE_KEY={payload['stageKey']}  DISPLAY_NAME={payload['displayName']}")

    assert last_payload is not None
    row = last_payload["sqlRow"]
    print(f"EXCEL= {EXCEL_PATH}  (sheet: {args.lifecycle})")
    print(f"LOCAL_TABLE= {DB_PATH}")
    print(f"LATEST_INSERT= {LATEST_SQL_PATH}")
    if args.count == 1:
        print("\nMy_Rush_Jobs row (local SQLite, same columns as VDI SQL):\n")
        print(format_row_table(row))

    if args.json:
        slim = {k: v for k, v in last_payload.items() if k != "sqlRow"}
        print("\nWorkflow input:\n")
        print(json.dumps(slim, indent=2, default=str))

    if args.dry_run:
        print("\nThese rows are only on your laptop (Excel + SQLite). SailPoint is not updated until the workflow is connected.")
        return

    if not TENANT or not WORKFLOW_ID or not TRIGGER_CLIENT_ID or not TRIGGER_CLIENT_SECRET:
        raise SystemExit(
            "Set ISC_TENANT, ISC_WORKFLOW_ID, and ISC_WORKFLOW_CLIENT_ID / ISC_WORKFLOW_CLIENT_SECRET in .env"
        )

    tok = trigger_token()
    workflow_body = {k: v for k, v in last_payload.items() if k != "sqlRow"}
    result = execute_workflow(tok, workflow_body)
    print("Workflow accepted:", result)
    print("\nNext: manually aggregate Copley Lawson, then paste into the spec:")
    print(f'const STAGE_KEY = "{last_payload["stageKey"]}";')


if __name__ == "__main__":
    main()
