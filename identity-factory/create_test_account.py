"""
Create a unique sandbox test account via IdentityNow APIs.
Copley Lawson first. Requires Create Account provisioning on the source
so the connector writes the backend row and aggregation does not delete it.

  cd identity-factory
  copy .env.example .env   # then fill in client id/secret
  pip install -r requirements.txt
    python create_test_account.py --source copley --lifecycle futurehire
"""

from __future__ import annotations

import argparse
import os
import time

import requests
from dotenv import load_dotenv

load_dotenv()

from excel_store import append_identity, used_first_last
from local_table import save_row
from user_payload import (
    LIFECYCLES,
    MY_RUSH_JOBS_COLUMNS,
    SOURCES,
    build_copley_attributes,
    stage_key,
    unique_id,
    unused_person_name,
)

TENANT = os.environ.get("ISC_TENANT", "")
CLIENT_ID = os.environ.get("ISC_CLIENT_ID", "")
CLIENT_SECRET = os.environ.get("ISC_CLIENT_SECRET", "")
API = f"https://{TENANT}.api.identitynow.com"


def token() -> str:
    r = requests.post(
        f"{API}/oauth/token",
        data={
            "grant_type": "client_credentials",
            "client_id": CLIENT_ID,
            "client_secret": CLIENT_SECRET,
        },
        timeout=60,
    )
    r.raise_for_status()
    return r.json()["access_token"]


def api(method: str, path: str, tok: str, **kwargs):
    r = requests.request(
        method,
        f"{API}{path}",
        headers={"Authorization": f"Bearer {tok}", "Content-Type": "application/json"},
        timeout=60,
        **kwargs,
    )
    if not r.ok:
        raise SystemExit(f"{method} {path} -> {r.status_code}\n{r.text}")
    return r.json() if r.text else {}


def get_source(tok: str, name: str) -> dict:
    q = requests.utils.quote(name)
    data = api("GET", f'/v3/sources?filters=name eq "{q}"', tok)
    if not data:
        raise SystemExit(f"Source not found: {name}")
    return data[0]


def account_exists(tok: str, source_id: str, name: str) -> bool:
    filt = f'sourceId eq "{source_id}" and name eq "{name}"'
    data = api("GET", f"/v3/accounts?filters={requests.utils.quote(filt)}", tok)
    return bool(data)


def allocate_stage_key(tok: str, source_id: str, prefix: str) -> tuple[str, str]:
    for _ in range(20):
        number = unique_id()
        key = stage_key(prefix, number)
        if not account_exists(tok, source_id, key):
            return key, number
    raise SystemExit("Could not allocate a unique Stage_Key")


def create_account(tok: str, attributes: dict) -> dict:
    return api("POST", "/v3/accounts", tok, json={"attributes": attributes})


def find_identity(tok: str, key: str):
    body = {
        "indices": ["identities"],
        "query": {"query": f'"{key}"'},
        "queryResultFilter": {"includes": ["id", "name", "displayName", "attributes"]},
    }
    data = api("POST", "/v3/search", tok, json=body)
    hits = data if isinstance(data, list) else data.get("hits") or data
    if not hits:
        return None
    return hits[0]


def process_identity(tok: str, identity_id: str) -> None:
    api("POST", f"/v3/identities/{identity_id}/process", tok)


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--source", default="copley", choices=list(SOURCES))
    parser.add_argument("--lifecycle", default="futurehire", choices=list(LIFECYCLES))
    parser.add_argument("--first", default=None, help="Override first name. Default: a new random name each run.")
    parser.add_argument("--last", default=None, help="Override last name. Default: a new random name each run.")
    parser.add_argument(
        "--dump-schema",
        action="store_true",
        help="Print the source account schema and exit (use this if create fails on attribute names).",
    )
    args = parser.parse_args()

    if not TENANT or not CLIENT_ID or not CLIENT_SECRET:
        raise SystemExit("Set ISC_TENANT, ISC_CLIENT_ID, and ISC_CLIENT_SECRET in identity-factory/.env")

    cfg = SOURCES[args.source]
    tok = token()
    source = get_source(tok, cfg["name"])
    source_id = source["id"]

    if args.dump_schema:
        schema = api("GET", f"/v3/sources/{source_id}/schemas", tok)
        print(schema)
        return

    if args.source != "copley":
        raise SystemExit("Only Copley attribute mapping is filled in. Add a pack for this source next.")

    first, last = args.first, args.last
    if not first or not last:
        first, last = unused_person_name(used_first_last())

    key, number = allocate_stage_key(tok, source_id, cfg["prefix"])
    attrs = build_copley_attributes(source_id, key, number, first, last, args.lifecycle)
    row = {col: attrs.get(col) for col in MY_RUSH_JOBS_COLUMNS}
    save_row(row)
    append_identity(args.lifecycle, row)

    print(f"Creating {cfg['name']} account {key} ({args.lifecycle}) …")
    created = create_account(tok, attrs)
    print("Account id:", created.get("id") or created)

    identity = None
    for i in range(12):
        time.sleep(5)
        identity = find_identity(tok, key)
        if identity:
            break
        print(f"  waiting for identity ({i + 1}/12)")

    if not identity:
        print("Account created, but identity not searchable yet. Aggregate Copley Lawson, then Process Identity.")
        print("STAGE_KEY=", key)
        return

    ident_id = identity.get("id") or identity.get("_id")
    print("Identity:", identity.get("name") or identity.get("displayName"), ident_id)
    try:
        process_identity(tok, ident_id)
        print("Process Identity requested.")
    except SystemExit as exc:
        print("Process Identity API failed (account may still be provisioning):\n", exc)

    print("\nPaste into tests/sources/copley-lawson/<lifecycle>.spec.ts:")
    print(f'const STAGE_KEY = "{key}";')


if __name__ == "__main__":
    main()
