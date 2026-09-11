"""Shared Stage_Key + Copley test-user payload.

The source of truth is a full [SOA].[dbo].[My_Rush_Jobs] row (same columns as
the VDI INSERT). SailPoint is not required to populate or inspect that row.
"""

from __future__ import annotations

import os
import random
import time
from datetime import date, timedelta

from name_generator import unused_person_name
from source_templates import structural_fields

INITIALS = os.environ.get("CREATOR_INITIALS", "AA").upper()
SLOT = "000"

LIFECYCLES = ("futurehire", "prehire", "active", "termed", "inactive", "rehire")

SOURCES = {
    "copley": {"name": "Copley Lawson", "prefix": "CL"},
    "rush": {"name": "RUSH Lawson", "prefix": "RL"},
    "echo": {"name": "ECHO Credentialed Providers", "prefix": "EC"},
    "ellucian": {"name": "Ellucian Students", "prefix": "ES"},
    "nerm": {"name": "Non-Employee Workforce", "prefix": "NE"},
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
    """yyMMdd + 4 random digits so many identities can be created the same day."""
    return time.strftime("%y%m%d") + f"{random.randint(0, 9999):04d}"


def random_person_name() -> tuple[str, str]:
    """New first + last every call. Initials AA are applied later on Given_Name / Display_Name."""
    return unused_person_name(set())


def stage_key(prefix: str, number: str) -> str:
    return f"{prefix}-{number}TESTCL{SLOT}{INITIALS}"


def build_my_rush_jobs_row(source_key: str, key: str, number: str, first: str, last: str, lifecycle: str) -> dict:
    """One fully populated My_Rush_Jobs row: identity scaffold (this
    function — name/date/generated-ID fields, the same for every source)
    merged with the source's structural template (source_templates.py —
    department/manager/location/job-code fields, constant per source).
    Same shape as the VDI INSERT."""
    given = f"{first}{INITIALS}"
    display = f"{given} {last}"
    dates = lifecycle_dates(lifecycle)
    user_id = number[-6:]
    email = f"{given}{last}@gmail.com"
    scaffold = {
        "Stage_Key": key,
        "Correlation_Key": f"{user_id}-{key}",
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
        "Birth_Date": "1998-05-10",
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
