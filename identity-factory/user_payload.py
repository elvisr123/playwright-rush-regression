"""Shared Stage_Key + Copley test-user payload.

The source of truth is a full [SOA].[dbo].[My_Rush_Jobs] row (same columns as
the VDI INSERT). SailPoint is not required to populate or inspect that row.
"""

from __future__ import annotations

import hashlib
import random
import time
from datetime import date, timedelta

from name_generator import unused_person_name
from source_templates import structural_fields

# Per team decision (2026-09-29, via Sravan Kumar): every automation-created
# identity's Given_Name/Display_Name embeds the literal marker "Rush" (e.g.
# "PaulRush Moore") so a name alone identifies it as automation-created,
# replacing the old per-machine CREATOR_INITIALS env var (which only tracked
# which teammate's machine generated the identity, e.g. "ER" for Elvis R) -
# combined with stage_key()'s "9001"+epoch-timestamp segment, this satisfies
# both of Sravan's stated requirements: identifiable as automation-created,
# and identifiable by creation time.
INITIALS = "Rush"

LIFECYCLES = ("futurehire", "prehire", "active", "termed", "inactive", "rehire", "processing")

# "prefix" is the Stage_Key prefix (see stage_key()); "user_id_prefix" is the
# literal leading digits of the 6-digit User_ID (the identity's employee ID,
# see source_user_id()). Both are per-source key-generation literals, kept in
# one registry rather than spread across modules — source_templates.py holds
# only the workplace/structural attributes, not generated keys.
SOURCES = {
    "copley": {"name": "Copley Lawson", "prefix": "CL", "user_id_prefix": "0002"},
    "rush": {"name": "RUSH Lawson", "prefix": "RL", "user_id_prefix": "0001"},
    "echo": {"name": "ECHO Credentialed Providers", "prefix": "EC", "user_id_prefix": "004"},
    "ellucian": {"name": "Ellucian Students", "prefix": "ES", "user_id_prefix": "005"},
    "nerm": {"name": "Non-Employee Workforce", "prefix": "NE", "user_id_prefix": "003"},
    # "name" here is used for reporting and the SailPoint API aggregation
    # lookup (getSourceIdByName) — "RUSH Workday" per tests/config/sources.ts
    # (the canonical name confirmed there, 2026-10-01), NOT the same as the
    # My_Rush_Jobs.Source_Name column value in source_templates.py, which
    # stays "Rush Workday" (the literal value from a real 2026-09-15 INSERT
    # sample) — these two can legitimately differ.
    "workday": {"name": "RUSH Workday", "prefix": "WD", "user_id_prefix": "006"},
}

# User_ID (the identity's employee ID) is always exactly this many digits.
USER_ID_LENGTH = 6

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
    # Live My_Rush_Jobs has 77 columns total; this tuple only models the 61
    # this pipeline actually sets. Academic_Program/School (cols 70/73 in
    # the live schema) were added 2026-10-08 because a live mandatory-fields
    # check requires them non-null/non-empty for Ellucian Students — see
    # AGENTS.md. The other 14 unmodeled columns (License_Status,
    # Lifecycle_State, Next_Processing_Date, PEGI, PEGI_Description,
    # Provider_Designation, Provider_Designation_Desc, Provider_Suffix,
    # DEA_License, Illinois_License, TimeZone, Created, Updated, Lex_ID)
    # remain out of scope.
    "Academic_Program",
    "School",
)


def lifecycle_dates(lifecycle: str, start_date: str | None = None) -> dict:
    """start_date (YYYY-MM-DD), if given, overrides the computed Start_Date/
    Original_Start_Date only - End_Date/IIQDisabled/Status still come from
    `lifecycle` and today's date as usual, so e.g. an "active" identity with
    a 2025 start_date still reads as currently active (not yet ended),
    just with a real historical start. Added 2026-10-08 per user request
    (generating active identities with a real 2025 Start_Date)."""
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

    # Guard confirmed necessary live (2026-10-12): a leftover start_date from
    # an earlier run (e.g. one of the 2025 dates used for the "6 active
    # users" task) silently carried over into a later futurehire run and
    # produced an identity with Status="Disabled" but a Start_Date already
    # in the past - SailPoint showed it as Active, not Future Hire, since no
    # reasonable classification can treat an already-passed Start_Date as a
    # future hire. Only lifecycles whose own natural start is in the future
    # (today only: futurehire/prehire) are guarded - no lifecycle-name
    # special-casing needed, this falls out of comparing `start` to `today`
    # directly. This is a different, resolved footgun from the still-open
    # 2026-09-16 AGENTS.md entry (prehire showing as Active with NO
    # start_date override involved at all - a live SailPoint Identity
    # Profile classification question, untouched by this guard).
    if start_date and start > today:
        override = date.fromisoformat(start_date)
        if override <= today:
            raise SystemExit(
                f'--start-date "{start_date}" is in the past, but lifecycle "{lifecycle}" represents someone '
                f"who hasn't started yet (its own computed default Start_Date would be {start.isoformat()}, "
                "in the future). A past Start_Date here would misclassify live - reset start_date/START_DATE "
                "to None/undefined for this lifecycle, or pass a future date instead."
            )

    start_iso = start_date if start_date else start.isoformat()
    return {
        "Start_Date": start_iso,
        "End_Date": end.isoformat(),
        "Original_Start_Date": start_iso,
        "IIQDisabled": "true" if disabled else "false",
        "Status": status,
    }


def unique_id() -> str:
    """Current epoch-seconds timestamp (10 digits today, via epochconverter.com
    convention - stays 10 digits until year 2286) plus 2 random digits - the
    number segment embedded in stage_key(), and also the basis for
    User_ID/Provider_National_ID/Correlation_Key derivation. Per user request
    (2026-09-29): epoch-based so a Stage_Key's creation time can be decoded
    directly (paste the digits after the prefix into epochconverter.com),
    with the 2 random digits as a safety net against two identities being
    generated in the same second colliding. Collision-checking against
    excel_store.used_stage_keys() (see generate_identity.py's
    allocate_number) still applies on top of this, same as before."""
    epoch_seconds = int(time.time())
    random_suffix = random.randint(0, 99)
    return f"{epoch_seconds}{random_suffix:02d}"


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
    # e.g. WD-9001179069605612ER for prefix "WD" and number "179069605612"
    # (10 epoch-second digits + 2 random) - user-specified format (2026-09-29,
    # supersedes the prior <prefix>-9512<6 random digits>ER shape, applies to
    # every source): <source prefix>-9001<epoch seconds><2 random digits>ER.
    # Uniqueness is enforced by the caller retrying unique_id() against
    # excel_store.used_stage_keys() (see generate_identity.py's
    # allocate_number), not by this function.
    return f"{prefix}-9001{number}ER"


def source_user_id(source_key: str, number: str) -> str:
    """The identity's 6-digit employee ID for one source: that source's
    literal User_ID prefix (SOURCES[...]["user_id_prefix"]) followed by
    enough trailing digits of `number` to reach exactly 6.

    Per user-stated convention (2026-10-23): "Employee id/user id should be
    six digits" and "Employee ID should start with 0001 for rush, 0002 for
    Copley, 003 for Non-Employee workforce, 004 for Echo Credentialed
    Providers and 005 for Ellucian, 006 for Workday" - the prefixes are
    deliberately NOT all the same width (4 digits for rush/copley, 3 for the
    other four), which is how the user specified them; every case still
    totals 6 digits, so the tail length falls out of USER_ID_LENGTH minus the
    prefix length rather than being hardcoded per source.

    Supersedes the previous `user_id = number[-6:]` (source-independent, so
    every source's row for one identity shared one User_ID). Consequence,
    accepted deliberately by the user: a multi-source identity now has a
    DIFFERENT User_ID per source row - matching how a real person has their
    own employee ID in each HR system - so correlating those rows into one
    SailPoint identity rests solely on the shared Correlation_Key. That is
    why default_correlation_key() below is seeded from `number` only and
    never from this value (see its docstring).

    Note the collision budget shrank sharply: rush/copley have only 100
    possible User_IDs each (2 free digits) and the other four 1000 each,
    versus 1,000,000 before. create-and-insert-identity.spec.ts's pre-flight
    findRowsByUserId() check against the live My_Rush_Jobs is now the thing
    standing between a generated row and the 2026-10-06 mis-correlation bug
    (see AGENTS.md); expect it to reject re-runs once a source's space fills
    up, rather than it being the rare event it was before.
    """
    # Explicit lookup rather than SOURCES[source_key]: this function now runs
    # BEFORE the structural merge in build_my_rush_jobs_row, so a bad source
    # key used to surface as source_templates.structural_fields()'s clear
    # NotImplementedError and would otherwise now surface as a bare KeyError
    # from here instead. (The CLI can't reach this - argparse restricts
    # --sources to SOURCES' own keys - but build_workflow_input/
    # build_copley_attributes take a source key straight from their caller.)
    config = SOURCES.get(source_key)
    if config is None:
        raise NotImplementedError(
            f'No source config for "{source_key}". Known sources: '
            f"{', '.join(sorted(SOURCES))}. Add it to SOURCES (name/prefix/user_id_prefix) "
            "and to source_templates.SOURCE_TEMPLATES before generating it."
        )
    prefix = config["user_id_prefix"]
    tail_length = USER_ID_LENGTH - len(prefix)
    if tail_length < 1:
        raise AssertionError(
            f'User_ID prefix "{prefix}" for source "{source_key}" leaves no room for a tail '
            f"within {USER_ID_LENGTH} digits."
        )
    return f"{prefix}{number[-tail_length:]}"


def default_correlation_key(base_user_id: str, number: str) -> str:
    """Long, hash-like Correlation_Key in the style of real Rush test data.

    base_user_id must be the SOURCE-INDEPENDENT `number[-6:]`, never
    source_user_id()'s per-source employee ID - the whole point of this value
    is that it comes out byte-for-byte identical for every source's row of
    one identity, which is what SailPoint correlates them on. Seeding it from
    a per-source User_ID would give the Copley and RUSH rows of one person
    different Correlation_Keys and stop them correlating at all. Keeping the
    seed on `number[-6:]` also means this function returns exactly the same
    value it did before User_ID became source-specific (2026-10-23), so the
    --correlation-key add-a-source path for identities created earlier is
    unaffected.
    Per user request (2026-09-21): match the shape of a real example
    (Pooja Vijay's manually-created identity, Correlation_Key
    "9512441111141186CE9CA6FEE37F97534D35DA9435AD2943995227D9D1AB3BB393A35
    FF419D73C9DA5FF2F21321C6A3BA01FF585124") - notably, that value starts
    with "9512", the same literal segment stage_key() uses - so this
    prepends "9512" to a long hex tail instead of just returning a bare
    hash. Extended to exactly 150 characters total per a further user
    request (2026-09-22) - a second hash segment (SHA-256 of the same seed,
    truncated) is appended after the SHA-512 segment to reach 150
    (4 + 128 + 18). Deterministic from user_id/number alone (both already
    shared across every source for one identity, per build_my_rush_jobs_row's
    caller) so every source's row gets the identical value automatically -
    same correctness requirement as the original short default, just a
    longer/denser shape matching real examples. (Real Rush samples aren't
    fully consistent with each other here - e.g. Evelyn Sanders' real RUSH
    Lawson Correlation_Key is a bare 128-char hash with no "9512" prefix at
    all - this is our own standardized template, not a replication of any
    one source's exact real-world convention.)

    Prefix switched from "9512" to "9001" (2026-09-29) to match stage_key()'s
    new literal segment, keeping the two consistent per user decision - same
    rationale as the original "9512" choice, just following stage_key()'s
    prefix change."""
    seed = f"{base_user_id}{number}"
    primary = hashlib.sha512(seed.encode()).hexdigest().upper()
    extra = hashlib.sha256((seed + "EXT").encode()).hexdigest().upper()[:18]
    return f"9001{primary}{extra}"


def build_my_rush_jobs_row(
    source_key: str,
    key: str,
    number: str,
    first: str,
    last: str,
    lifecycle: str,
    birth_date: str | None = None,
    correlation_key: str | None = None,
    start_date: str | None = None,
    primary_position: str | None = None,
    oneup_manager_employee_id: str | None = None,
    end_date: str | None = None,
) -> dict:
    """One fully populated My_Rush_Jobs row: identity scaffold (this
    function — name/date/generated-ID fields, the same for every source)
    merged with the source's structural template (source_templates.py —
    department/manager/location/job-code fields, constant per source).
    Same shape as the VDI INSERT.

    start_date (YYYY-MM-DD), if given, overrides Start_Date/
    Original_Start_Date only — see lifecycle_dates(). Same
    generate-once-share-across-sources rule as birth_date applies if used
    with a multi-source identity.

    primary_position ("YES"/"NO"), if given, overrides every source's
    template default ("YES") and takes precedence even over the
    lifecycle="processing" auto-override below — added 2026-10-14 per user
    request (generating a non-primary active Workday test user; the
    existing "processing" special-case was the only way to get
    Primary_Position="NO" before this, and that also changes Status/
    IIQDisabled/End_Date, not a clean "active, just non-primary" combo).

    oneup_manager_employee_id, if given, overrides the source template's
    OneUp_Manager_Employee_ID — added 2026-10-22 per user request (a RUSH
    Lawson identity whose one-up manager should be an existing Copley
    Lawson test identity's employee ID rather than RUSH's own template
    constant "181609"). OneUp_Manager_Network_ID is deliberately NOT
    touched: the two are separate attributes in My_Rush_Jobs and the
    network ID of that other identity isn't implied by its employee ID
    (Copley's own template, for instance, carries the same digits in both
    while RUSH's carries a username in the network ID).

    end_date, if given, overrides the lifecycle's computed End_Date
    (today + 180 days for every lifecycle except termed/inactive). Pass the
    literal string "BLANK" (or "NULL"/"NONE", case-insensitive) to store a
    genuinely empty End_Date - to_insert_sql() emits None as SQL NULL -
    which is what a futurehire/prehire test user with no scheduled end
    needs; pass a YYYY-MM-DD date to set a specific one. Added 2026-10-27
    per user request (futurehire/prehire lifecycle-transition test users
    specified with a blank End_Date). Status/IIQDisabled/Start_Date still
    come from `lifecycle` and `start_date` as usual, so this only blanks
    the end - it does not make the identity read as never-ending in any
    other column.

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
    identity created before this default existed).

    User_ID, by contrast, is intentionally the one generated field that does
    NOT match across an identity's sources since 2026-10-23 - it carries a
    per-source prefix (see source_user_id()). Identities created before that
    change have one shared User_ID across their sources; there is no
    migration."""
    given = f"{first}{INITIALS}"
    display = f"{given} {last}"
    dates = lifecycle_dates(lifecycle, start_date)
    # Two distinct 6-digit values since 2026-10-23, deliberately:
    #   user_id      - this source's employee ID, prefixed per source
    #                  (source_user_id()), so it DIFFERS across the rows of
    #                  one multi-source identity.
    #   base_user_id - the old source-independent number[-6:], kept only as
    #                  the seed for values that must stay identical across
    #                  every source of one identity: Correlation_Key (what
    #                  SailPoint correlates on) and Provider_National_ID (a
    #                  person-level national provider ID in real life, not a
    #                  per-system identifier like the employee ID).
    user_id = source_user_id(source_key, number)
    base_user_id = number[-6:]
    email = f"{given}{last}@gmail.com"
    scaffold = {
        "Stage_Key": key,
        "Correlation_Key": correlation_key or default_correlation_key(base_user_id, number),
        "Username": display,
        "Work_Email": email,
        "User_ID": user_id,
        "Initials": INITIALS[0],
        "Provider_National_ID": f"12{base_user_id[-4:]}",
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
        # Only Ellucian currently overrides these (see source_templates.py) —
        # every other source leaves them None.
        "Academic_Program": None,
        "School": None,
    }
    row = {**scaffold, **structural_fields(source_key)}
    if lifecycle == "processing":
        # Lifecycle-driven override: every source's template sets
        # Primary_Position="YES" as a structural constant, but "processing"
        # identities are always "NO" regardless of source - applied after
        # the structural merge so it takes precedence over the template.
        row["Primary_Position"] = "NO"
    if primary_position is not None:
        # Explicit override always wins, including over the "processing"
        # default just above.
        row["Primary_Position"] = primary_position
    if oneup_manager_employee_id is not None:
        # Applied after the structural merge so it takes precedence over the
        # source template's own constant — see the docstring above.
        row["OneUp_Manager_Employee_ID"] = oneup_manager_employee_id
    if end_date is not None:
        # Applied after the structural merge for the same reason as the
        # overrides above. "BLANK"/"NULL"/"NONE" mean a genuinely empty
        # End_Date (None -> SQL NULL via to_insert_sql()); anything else
        # must be a real YYYY-MM-DD date, validated here rather than
        # silently storing a typo that only surfaces as a bad row in the DB.
        if end_date.strip().upper() in {"BLANK", "NULL", "NONE", ""}:
            row["End_Date"] = None
        else:
            try:
                row["End_Date"] = date.fromisoformat(end_date).isoformat()
            except ValueError:
                raise SystemExit(
                    f'--end-date "{end_date}" is not a valid date. Use YYYY-MM-DD, '
                    f'or "BLANK" to leave End_Date empty.'
                ) from None
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
