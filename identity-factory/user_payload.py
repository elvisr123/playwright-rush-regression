"""Shared Stage_Key + Copley test-user payload.

The source of truth is a full [SOA].[dbo].[My_Rush_Jobs] row (same columns as
the VDI INSERT). SailPoint is not required to populate or inspect that row.
"""

from __future__ import annotations

import hashlib
import os
import random
from datetime import date, timedelta

from name_generator import unused_person_name
from source_templates import structural_fields

INITIALS = os.environ.get("CREATOR_INITIALS", "AA").upper()

LIFECYCLES = ("futurehire", "prehire", "active", "termed", "inactive", "rehire", "processing")

SOURCES = {
    "copley": {"name": "Copley Lawson", "prefix": "CL"},
    "rush": {"name": "RUSH Lawson", "prefix": "RL"},
    "echo": {"name": "ECHO Credentialed Providers", "prefix": "EC"},
    "ellucian": {"name": "Ellucian Students", "prefix": "ES"},
    "nerm": {"name": "Non-Employee Workforce", "prefix": "NE"},
    "workday": {"name": "Rush Workday", "prefix": "WD"},
}

# Column order matches the VDI INSERT into [SOA].[dbo].[My_Rush_Jobs].
MY_RUSH_JOBS_COLUMNS = (
    "Stage_Key",
    "Source_Name",
    "Correlation_Key",
    "Username",
    "Work_Email",
    "User_ID",
    "Initials",
    "Provider_National_ID",
    "Legacy_User",
    "Email_Required",
    "Given_Name",
    "Middle_Name",
    "Family_Name",
    "Preferred_First_Name",
    "Preferred_Last_Name",
    "Preferred_Name",
    "Display_Name",
    "Nerm_Displayname",
    "Birth_Date",
    "Last_4_SSN",
    "Original_Start_Date",
    "User_Type",
    "Employee_Level",
    "Employee_Type",
    "Preferred_Language",
    "Alternate_Email",
    "Alternate_Phone_Number",
    "Country",
    "City",
    "State",
    "Street_Address",
    "Postal_Code",
    "Company_Name",
    "Organization",
    "Vendor_Code",
    "Location",
    "Location_Code",
    "Department_Name",
    "Department",
    "Cost_Center",
    "Title",
    "Job_Code",
    "Start_Date",
    "End_Date",
    "Status",
    "IIQDisabled",
    "Job_Family",
    "Manager_Name",
    "Primary_Position",
    "Relationship_Status",
    "Salary_Structure",
    "Manager_Username",
    "Manager_Employee_ID",
    "OneUp_Manager_Employee_ID",
    "OneUp_Manager_Network_ID",
    "Work_Phone_Number",
    "Work_Hours",
    "Do_Not_Rehire",
    "Working_Remotely",
    "Manager_Hold",
    "Legal_Hold",
)


def lifecycle_dates(lifecycle: str) -> dict:
    today = date.today()
    if lifecycle == "futurehire":
        start, end, disabled, status = today + timedelta(days=35), today + timedelta(days=180), True, "Disabled"
    elif lifecycle == "prehire":
        start, end, disabled, status = today + timedelta(days=14), today + timedelta(days=180), False, "Enabled"
    elif lifecycle == "active":
        start, end, disabled, status = today - timedelta(days=1), today + timedelta(days=180), False, "Active"
    elif lifecycle == "termed":
        start, end, disabled, status = today - timedelta(days=90), today + timedelta(days=1), True, "Disabled"
    elif lifecycle == "inactive":
        start, end, disabled, status = today - timedelta(days=180), today - timedelta(days=30), True, "Disabled"
    elif lifecycle == "rehire":
        start, end, disabled, status = today, today + timedelta(days=180), False, "Active"
    elif lifecycle == "processing":
        # Same date/status logic as "active" - the only difference for this
        # state is Primary_Position="NO", applied in build_my_rush_jobs_row.
        start, end, disabled, status = today - timedelta(days=1), today + timedelta(days=180), False, "Active"
    else:
        raise SystemExit(f"Unknown lifecycle: {lifecycle}")
    return {
        "Start_Date": start.isoformat(),
        "End_Date": end.isoformat(),
        "Original_Start_Date": start.isoformat(),
        "IIQDisabled": "true" if disabled else "false",
        "Status": status,
    }


def unique_id() -> str:
    """6 random digits - the number segment embedded in stage_key(), and also
    the basis for User_ID/Provider_National_ID/Correlation_Key derivation."""
    return f"{random.randint(0, 999999):06d}"


# Per user request (2026-09-18): random instead of the old fixed 1998-05-10,
# but capped at end-of-2002 ("at least 2002 and before" - i.e. born in 2002
# or earlier). Floor of 1965 is this repo's own assumption, not specified by
# the user - adjust here if a different minimum age/floor year is needed.
BIRTH_DATE_EARLIEST = date(1965, 1, 1)
BIRTH_DATE_LATEST = date(2002, 12, 31)


def random_birth_date() -> str:
    span_days = (BIRTH_DATE_LATEST - BIRTH_DATE_EARLIEST).days
    return (BIRTH_DATE_EARLIEST + timedelta(days=random.randint(0, span_days))).isoformat()


def random_person_name() -> tuple[str, str]:
    """New first + last every call. Initials AA are applied later on Given_Name / Display_Name."""
    return unused_person_name(set())


def stage_key(prefix: str, number: str) -> str:
    # e.g. WD-9512123456ER for prefix "WD" and number "123456" - user-specified
    # format (2026-09-21, supersedes the prior <prefix>-95<7 digits>ER shape,
    # applies to every source): <source prefix>-9512<6 random digits>ER.
    # Uniqueness is enforced by the caller retrying unique_id() against
    # excel_store.used_stage_keys() (see generate_identity.py's
    # allocate_number), not by this function.
    return f"{prefix}-9512{number}ER"


def default_correlation_key(user_id: str, number: str) -> str:
    """Long, hash-like Correlation_Key in the style of real Rush test data.
    Per user request (2026-09-21): match the shape of a real example
    (Pooja Vijay's manually-created identity, Correlation_Key
    "9512441111141186CE9CA6FEE37F97534D35DA9435AD2943995227D9D1AB3BB393A35
    FF419D73C9DA5FF2F21321C6A3BA01FF585124") - notably, that value starts
    with "9512", the same literal segment stage_key() uses - so this
    prepends "9512" to a long hex tail instead of just returning a bare
    hash. Deterministic from user_id/number alone (both already shared
    across every source for one identity, per build_my_rush_jobs_row's
    caller) so every source's row gets the identical value automatically -
    same correctness requirement as the original short default, just a
    longer/denser shape matching real examples."""
    digest = hashlib.sha512(f"{user_id}{number}".encode()).hexdigest().upper()
    return f"9512{digest}"


def build_my_rush_jobs_row(
    source_key: str,
    key: str,
    number: str,
    first: str,
    last: str,
    lifecycle: str,
    birth_date: str | None = None,
    correlation_key: str | None = None,
) -> dict:
    """One fully populated My_Rush_Jobs row: identity scaffold (this
    function — name/date/generated-ID fields, the same for every source)
    merged with the source's structural template (source_templates.py —
    department/manager/location/job-code fields, constant per source).
    Same shape as the VDI INSERT.

    birth_date must be generated ONCE per identity and passed in explicitly
    by multi-source callers (generate_identity.py) — calling this per source
    with birth_date=None would give each source's row a different random
    Birth_Date for the same person, breaking cross-source consistency.

    Correlation_Key must likewise be identical across every source's row for
    the same identity — confirmed against a real, manually-correlated
    multi-source identity (Non-Employee Workforce + Copley Lawson) where the
    two accounts' Correlation_Key values were byte-for-byte identical despite
    different Stage_Keys. The default below (derived only from `number`, the
    value already shared across sources by the caller) is correlation-safe
    on its own; pass correlation_key explicitly only to match an *existing*
    identity's already-stored value verbatim (e.g. adding a source to an
    identity created before this default existed)."""
    given = f"{first}{INITIALS}"
    display = f"{given} {last}"
    dates = lifecycle_dates(lifecycle)
    user_id = number[-6:]
    email = f"{given}{last}@gmail.com"
    scaffold = {
        "Stage_Key": key,
        "Correlation_Key": correlation_key or default_correlation_key(user_id, number),
        "Username": display,
        "Work_Email": email,
        "User_ID": user_id,
        "Initials": INITIALS[0],
        "Provider_National_ID": f"12{user_id[-4:]}",
        "Legacy_User": None,
        "Email_Required": None,
        "Given_Name": given,
        "Middle_Name": (last[:1] or "A").upper(),
        "Family_Name": last,
        "Preferred_First_Name": given,
        "Preferred_Last_Name": last,
        "Preferred_Name": None,
        "Display_Name": display,
        "Nerm_Displayname": None,
        "Birth_Date": birth_date or random_birth_date(),
        "Last_4_SSN": "0006",
        "Original_Start_Date": dates["Original_Start_Date"],
        "Preferred_Language": None,
        "Alternate_Email": email,
        "Alternate_Phone_Number": "1897755752",
        "Start_Date": dates["Start_Date"],
        "End_Date": dates["End_Date"],
        "Status": dates["Status"],
        "IIQDisabled": dates["IIQDisabled"],
        "Salary_Structure": None,
        "Do_Not_Rehire": None,
        "Working_Remotely": None,
        "Manager_Hold": None,
        "Legal_Hold": None,
    }
    row = {**scaffold, **structural_fields(source_key)}
    if lifecycle == "processing":
        # Lifecycle-driven override: every source's template sets
        # Primary_Position="YES" as a structural constant, but "processing"
        # identities are always "NO" regardless of source - applied after
        # the structural merge so it takes precedence over the template.
        row["Primary_Position"] = "NO"
    missing = [c for c in MY_RUSH_JOBS_COLUMNS if c not in row]
    if missing:
        raise AssertionError(f"Source \"{source_key}\" template is missing columns: {missing}")
    # Preserve MY_RUSH_JOBS_COLUMNS order (matches the VDI INSERT column list).
    return {col: row[col] for col in MY_RUSH_JOBS_COLUMNS}


def build_copley_attributes(source_id: str | None, key: str, number: str, first: str, last: str, lifecycle: str) -> dict:
    """ISC Create Account attributes = full SQL row plus native identity `name`."""
    row = build_my_rush_jobs_row("copley", key, number, first, last, lifecycle)
    attrs = {"name": row["Stage_Key"], **row}
    if source_id:
        attrs["sourceId"] = source_id
    return attrs


def build_workflow_input(
    source_key: str,
    lifecycle: str,
    first: str | None = None,
    last: str | None = None,
    number: str | None = None,
) -> dict:
    """JSON body for the SailPoint External Trigger. Workflow uses this to Create Account."""
    if not first or not last:
        first, last = random_person_name()
    cfg = SOURCES[source_key]
    number = number or unique_id()
    key = stage_key(cfg["prefix"], number)
    # Raises NotImplementedError via source_templates.structural_fields() for
    # any source without a populated template yet — see source_templates.py.
    row = build_my_rush_jobs_row(source_key, key, number, first, last, lifecycle)
    attrs = {"name": row["Stage_Key"], **row}
    return {
        "creatorInitials": INITIALS,
        "sourceKey": source_key,
        "sourceName": cfg["name"],
        "sourcePrefix": cfg["prefix"],
        "lifecycle": lifecycle,
        "stageKey": key,
        "displayName": row["Display_Name"],
        "accountAttributes": attrs,
        "sqlRow": row,
    }
