"""Per-source structural fields for a My_Rush_Jobs row.

These describe the SOURCE / workplace (department, manager, location, job
code, address, ...) — constant for every identity generated on that source —
as opposed to the identity-specific fields (name, dates, generated IDs) built
by user_payload.build_my_rush_jobs_row's scaffold.

All 6 sources ("copley", "rush", "echo", "ellucian", "nerm", "workday") are
populated as of 2026-10-01.

RULE for every template here (standing user rule, applied 2026-10-23,
revised 2026-10-29): the manager and one-up manager must never be real Rush
people. When you populate a new source from a real reference row below,
strip its manager fields instead of copying them across.

Three sources use managers the user supplied on 2026-11-06 - copley first
(scoped to copley alone at their correction), then rush and nerm later the
same day. In all three, Manager_Name mirrors the username and
OneUp_Manager_Network_ID carries the one-up's digits, because the user gave
only an employee ID / username / one-up ID for each:
    copley   jyates   / 019811      one-up 982564
    rush     kbarr    / 981715      one-up 981453
    nerm     mparris1 / 1933000635  one-up 19234400
The remaining 2 sources (echo, ellucian) still name the test identities set
on 2026-10-29:
    Manager  MaeveAA Yamamoto  / 259921  (CL-2608259921TESTCL000AA)
    One-up   FionaAA Lambert   / 253476  (CL-2608253476TESTCL000AA)
Those two are Copley Lawson test identities. The 2026-10-29 change replaced the
Manager_Name="default.manager" + all-NULL-IDs shape used between 2026-10-23
and 2026-10-29: that satisfied the no-real-people rule but left the manager
unresolvable in SailPoint, because the identity link resolves off
Manager_Employee_ID/Manager_Username and those were NULL -
"default.manager" is only a display string, not an identity. Identities
created in that window have no manager; nothing migrates them.

The 5 non-Copley sources share one test manager deliberately, even though
the original real templates disagreed on the shape of
OneUp_Manager_Network_ID (Copley carried digits there, RUSH a username).
That disagreement was an artifact of each template being copied from a
different real row; across those 5, consistency is worth more than
mimicking it, so the network ID carries the one-up manager's username.
Copley is now the exception on both counts - its own manager, and digits
rather than a username in the network ID, matching its original real row.

Override per run via create-and-insert-identity.spec.ts's
ONEUP_MANAGER_EMPLOYEE_ID (a test identity's own User_ID) - never a real
employee's.

To add a source: pull a real, known-good reference row for it — e.g. via
tests/helpers/dbClient.ts's getStagingRow() against a Stage_Key already used
in tests/sources/<source>/*.spec.ts (or a fresh SELECT in SSMS for a source
with no existing reference, like Ellucian) — and fill in its structural
fields the same way Copley's are below. See AGENTS.md.
"""

from __future__ import annotations

SOURCE_TEMPLATES: dict[str, dict] = {
    "copley": {
        "Source_Name": "Copley Lawson",
        # Per user request (2026-10-08): leave Username unset for every
        # source, not just Workday/Ellucian — see AGENTS.md.
        "Username": None,
        "User_Type": "RCMC",
        "Employee_Level": "NURSE",
        "Employee_Type": "EMPLOYEE",
        "Country": "US",
        "City": "CHANA",
        "State": "IL",
        "Street_Address": "2905 STONEHILL RD ",
        "Postal_Code": "61019",
        "Company_Name": "101",
        "Organization": "202",
        "Vendor_Code": "EMP",
        "Location": "NICU",
        "Location_Code": "101",
        "Department_Name": "NICU",
        "Department": "101",
        "Cost_Center": "43800",
        "Title": "REGISTERED NURSE",
        "Job_Code": "369",
        "Job_Family": "REGISTNURS",
        # Manager/one-up manager supplied directly by the user 2026-11-06
        # ("Manager EmployeeID - 019811, Manager Username - jyates, OneUp
        # Manager EmployeeID - 982564"), scoped to COPLEY ONLY at the
        # user's correction - the other 5 sources still carry the
        # 2026-10-29 test manager (MaeveAA Yamamoto / FionaAA Lambert).
        # The user gave no display name or one-up network ID, so per their
        # choice Manager_Name mirrors the username and
        # OneUp_Manager_Network_ID carries the one-up's digits - the shape
        # this template's original real row used (same value in both
        # one-up columns). Earlier values, for traceability:
        #   2026-10-29  MaeveAA Yamamoto / 259921, one-up FionaAA Lambert
        #               / 253476 (network ID "FionaAA Lambert").
        #   2026-10-23  "default.manager" + all-NULL manager IDs.
        #   real sample Manager_Name "REES, SHERRY A.",
        #               Manager_Username/Manager_Employee_ID "99314",
        #               OneUp_Manager_Employee_ID/
        #               OneUp_Manager_Network_ID "107641".
        "Manager_Name": "jyates",
        "Primary_Position": "YES",
        "Relationship_Status": "ACTIVE REGULAR",
        "Manager_Username": "jyates",
        "Manager_Employee_ID": "019811",
        "OneUp_Manager_Employee_ID": "982564",
        "OneUp_Manager_Network_ID": "982564",
        "Work_Phone_Number": "1678777754",
        "Work_Hours": "8hours",
    },
    "rush": {
        # Extracted from a real RUSH Lawson account (Evelyn Sanders,
        # 2026-09-22) — inactive in real life, so lifecycle-driven fields
        # (Status/IIQDisabled/End_Date/Relationship_Status) below reflect
        # what an ACTIVE RUSH Lawson identity should show instead of her
        # actual (inactive) values, per explicit user confirmation:
        #   - Relationship_Status: her real value was "Inactive" — user
        #     confirmed "ACTIVE REGULAR" (matching Copley's convention) for
        #     active identities instead.
        #   - Status/End_Date still come from the shared lifecycle_dates()
        #     scaffold, same as every other source — not overridden here.
        # City/State/Street_Address/Postal_Code confirmed by the user to be
        # a real work/facility address (not personal), safe to reuse as a
        # structural constant, same treatment as Copley's facility address.
        # Source_Name is "RUSH Lawson" (matching SOURCES["rush"]["name"] in
        # user_payload.py) rather than the raw sample's literal "Rush
        # Lawson" (different casing) — kept consistent with the rest of the
        # config rather than the one sample's exact casing.
        "Source_Name": "RUSH Lawson",
        "User_Type": "10001",
        "Employee_Level": "INDIVCONT",
        "Employee_Type": "EMPLOYEE",
        "Country": "US",
        "City": "Chicago",
        "State": "IL",
        "Street_Address": "628 S Racine Ave 3",
        "Postal_Code": "60607",
        "Company_Name": "RUSH MEDICAL CENTER",
        "Organization": "10",
        "Vendor_Code": "EMP",
        "Location": "14 W Tower (Med-Surg Oncology)",
        "Location_Code": "1H312",
        "Department_Name": "14 W Tower (Med-Surg Oncology)",
        "Department": "1H312",
        "Cost_Center": "1010-203-10",
        "Title": "Patient Care Tech",
        "Job_Code": "34",
        "Job_Family": "LICCERTECH",
        # Manager/one-up manager supplied by the user 2026-11-06 ("Rush
        # Manager Details - Manager EmployeeID 981715, Manager Username
        # kbarr, OneUp Manager EmployeeID 981453"), in the same message
        # that gave NERM's. As with copley, the user named no display name
        # and no one-up network ID, so the same two choices they made for
        # copley are applied: Manager_Name mirrors the username and
        # OneUp_Manager_Network_ID carries the one-up's digits.
        #
        # NOTE this changes RUSH's network-ID SHAPE. Its original real row
        # carried a username there ("KPIERRE") while copley carried digits
        # - and matching that here would need 981453's username, which the
        # user did not give. Digits is therefore the only option, and it
        # agrees with copley. Earlier values, for traceability:
        #   2026-10-29  MaeveAA Yamamoto / 259921, one-up FionaAA Lambert
        #               / 253476 (network ID "FionaAA Lambert").
        #   2026-10-23  "default.manager" + all-NULL manager IDs.
        #   real sample Manager_Name "Phalen, Lisa", Manager_Username
        #               "LPHALEN", Manager_Employee_ID "042558",
        #               OneUp_Manager_Employee_ID "181609",
        #               OneUp_Manager_Network_ID "KPIERRE".
        "Manager_Name": "kbarr",
        "Primary_Position": "YES",
        # Per user decision (2026-09-22): "ACTIVE REGULAR" for active
        # identities, not the real sample's "Inactive" (see note above).
        "Relationship_Status": "ACTIVE REGULAR",
        "Salary_Structure": "PCT-PCT ADV",
        "Manager_Username": "kbarr",
        "Manager_Employee_ID": "981715",
        "OneUp_Manager_Employee_ID": "981453",
        "OneUp_Manager_Network_ID": "981453",
        "Work_Phone_Number": None,
        "Work_Hours": "12",
        "Do_Not_Rehire": "false",
        "Working_Remotely": "No",
        "Manager_Hold": None,
        "Legal_Hold": None,
        # Username was deliberately left un-overridden here through
        # 2026-10-01 — the real sample's "esanders" looked like an
        # AD-provisioned value synced back post-creation, not something a
        # fresh pre-aggregation INSERT should carry. Superseded 2026-10-08:
        # user requested Username=None for every source, not just
        # Workday/Ellucian — see AGENTS.md. Work_Email is unaffected, still
        # left to the scaffold default.
        "Username": None,
    },
    "echo": {
        # Extracted from a real ECHO Credentialed Providers account (OnyxPD
        # Oliver, 2026-10-01 — a Word doc of SailPoint screenshots the user
        # supplied, since this identity turned out to have no My_Rush_Jobs
        # row reachable via a direct SELECT).
        "Source_Name": "ECHO Credentialed Providers",
        # Per user request (2026-10-08): leave Username unset for every
        # source, not just Workday/Ellucian — see AGENTS.md.
        "Username": None,
        "Email_Required": "Yes",
        "User_Type": None,
        "Employee_Level": None,
        "Employee_Type": "Provider",
        "Country": "US",
        "City": "Chicago",
        "State": "IL",
        "Street_Address": "1461 S Blue Island Ave",
        "Postal_Code": "60608",
        "Company_Name": "RUMC",
        "Organization": None,
        "Vendor_Code": "MSO",
        "Location": None,
        "Location_Code": "RUMC",
        "Department_Name": "Orthopaedic Surgery",
        "Department": None,
        "Cost_Center": None,
        "Title": "Occupational Therapist",
        "Job_Code": "2302",
        "Job_Family": None,
        # Per the Rush design doc, ECHO Credentialed Providers identities
        # are assigned the default manager (default.manager) in ISC, not a
        # real person — matches this sample's own identity-cube view
        # ("Manager: default.manager"). The raw ACCOUNT view's Manager_Name
        # field showed "ACTIVE REGULAR" instead, which looks like a data
        # misalignment in this specific sandbox record (that value belongs
        # under Relationship_Status, not Manager_Name) — used the
        # design-doc-confirmed value here rather than copying it blind.
        "Manager_Name": "MaeveAA Yamamoto",
        "Primary_Position": "YES",
        "Relationship_Status": "ACTIVE REGULAR",
        "Salary_Structure": None,
        "Manager_Username": "MaeveAA Yamamoto",
        "Manager_Employee_ID": "259921",
        "OneUp_Manager_Employee_ID": "253476",
        "OneUp_Manager_Network_ID": "FionaAA Lambert",
        "Work_Phone_Number": None,
        "Work_Hours": None,
        "Do_Not_Rehire": None,
        "Working_Remotely": None,
        "Manager_Hold": None,
        "Legal_Hold": None,
    },
    "ellucian": {
        # Extracted from a real Ellucian Students account (MakaiPD S Myers,
        # 2026-10-01, same Word-doc-of-screenshots source as "echo" above).
        # Many fields are genuinely blank for this source in the real
        # sample, not a gap — kept as None rather than guessed.
        #
        # Department_Name/Department/Academic_Program/School confirmed
        # 2026-10-08 against a live dump of every Ellucian Students row in
        # My_Rush_Jobs (not just the one original sample): Academic_Program
        # and School are NOT a source-wide constant in reality — they vary
        # per student's degree program — but every real row sharing this
        # Department_Name uses Department="CMHN" (the template previously had
        # "CMHH", which only ever appears on one obvious leftover test row,
        # Stage_Key "EL-119898...TESTCL000PDPL" / name "MiguelPD Little" —
        # not a real student), paired with Academic_Program="BFNP.DNP" (the
        # most frequent variant for this department) and School="CON".
        "Source_Name": "Ellucian Students",
        "Email_Required": None,
        "User_Type": None,
        "Employee_Level": None,
        "Employee_Type": "Student",
        "Country": None,
        "City": None,
        "State": None,
        "Street_Address": None,
        "Postal_Code": None,
        "Company_Name": None,
        "Organization": None,
        "Vendor_Code": "RUS",
        "Location": None,
        "Location_Code": None,
        "Department_Name": "Comm Systems & Mental Hlth Nsg",
        "Department": "CMHN",
        "Academic_Program": "BFNP.DNP",
        "School": "CON",
        # Per user request (2026-10-08): leave Username unset, same override
        # pattern as Workday's Username/Work_Email/Provider_National_ID.
        "Username": None,
        "Cost_Center": None,
        "Title": None,
        "Job_Code": None,
        "Job_Family": None,
        # Per the Rush design doc, Ellucian Students identities are
        # assigned the default manager (default.manager) in ISC — matches
        # this real sample directly (both the raw account and identity-cube
        # views show "default.manager").
        "Manager_Name": "MaeveAA Yamamoto",
        "Primary_Position": "YES",
        "Relationship_Status": None,
        "Salary_Structure": None,
        "Manager_Username": "MaeveAA Yamamoto",
        "Manager_Employee_ID": "259921",
        "OneUp_Manager_Employee_ID": "253476",
        "OneUp_Manager_Network_ID": "FionaAA Lambert",
        "Work_Phone_Number": None,
        "Work_Hours": None,
        "Do_Not_Rehire": None,
        "Working_Remotely": None,
        "Manager_Hold": None,
        "Legal_Hold": None,
    },
    "nerm": {
        # Extracted from a real Non-Employee Workforce account (MarleePD
        # Greene, 2026-10-01, same Word-doc-of-screenshots source as above)
        # — consistent with Pooja Vijay's NERM account shown earlier this
        # session (identical Company_Name/Vendor_Code/Location).
        "Source_Name": "Non-Employee Workforce",
        # Per user request (2026-10-08): leave Username unset for every
        # source, not just Workday/Ellucian — see AGENTS.md.
        "Username": None,
        "Email_Required": "True",
        "User_Type": None,
        "Employee_Level": None,
        "Employee_Type": "Non-Employee",
        "Country": "US",
        "City": None,
        "State": None,
        "Street_Address": None,
        "Postal_Code": None,
        "Company_Name": "Rush Virtual Center",
        "Organization": None,
        "Vendor_Code": "44488",
        "Location": "1620 W.Harrison St",
        "Location_Code": "60616",
        "Department_Name": "dermatology",
        "Department": "DERM",
        "Cost_Center": None,
        "Title": "system leadership",
        "Job_Code": "111195",
        "Job_Family": None,
        # Per the Rush design doc, Non-Employee Workforce identities get a
        # "valid manager populated from source data" (not a default) —
        # matches this real sample having an actual named manager rather
        # than default.manager, unlike ECHO/Ellucian above.
        #
        # Manager/one-up manager supplied by the user 2026-11-06
        # ("Non-Employee Workforce Details - Manager EmployeeID
        # 1933000635, Manager Username mparris1, OneUp Manager EmployeeID
        # 19234400"), in the same message that gave RUSH's. Same two
        # choices as copley for the fields the user did not name:
        # Manager_Name mirrors the username, OneUp_Manager_Network_ID
        # carries the one-up's digits. Note Manager_Employee_ID is 10
        # digits here, unlike the 6 of copley/rush - that is the user's
        # value as given, not a typo to normalize. Earlier values:
        #   2026-10-29  MaeveAA Yamamoto / 259921, one-up FionaAA Lambert
        #               / 253476 (network ID "FionaAA Lambert").
        #   2026-10-23  "default.manager" + all-NULL manager IDs; the
        #               one-up fields were already NULL before that.
        #   real sample Manager_Username "acopela3".
        "Manager_Name": "mparris1",
        "Primary_Position": "YES",
        "Relationship_Status": None,
        "Salary_Structure": None,
        "Manager_Username": "mparris1",
        "Manager_Employee_ID": "1933000635",
        "OneUp_Manager_Employee_ID": "19234400",
        "OneUp_Manager_Network_ID": "19234400",
        "Work_Phone_Number": "5712882223",
        "Work_Hours": None,
        "Do_Not_Rehire": "no",
        "Working_Remotely": None,
        "Manager_Hold": None,
        "Legal_Hold": "no",
    },
    "workday": {
        # Extracted from a real Rush Workday INSERT sample (2026-09-15), plus
        # a user-provided old-vs-new Workday field mapping clarification.
        # Refreshed against a second, fuller sample (2026-09-18) that had a
        # manager on file — the first sample's manager-related NULLs turned
        # out to be a gap in that specific record, not representative.
        # Unlike Copley, several identity-plumbing fields the scaffold
        # normally computes (Username, Work_Email, Provider_National_ID) are
        # NULL for this source in practice — those are overridden below too,
        # not just the structural ones, since structural_fields() merges on
        # top of the scaffold and can override any column.
        "Source_Name": "Rush Workday",
        "Username": None,
        "Work_Email": None,
        "Provider_National_ID": None,
        "Email_Required": "Yes",
        "User_Type": None,
        "Employee_Level": "RUSH_INDIVCONT",
        "Employee_Type": "EE_Standard",
        "Country": "US",
        "City": "Chicago",
        "State": "IL",
        "Street_Address": "1700 W. Van Buren St",
        "Postal_Code": "60612",
        "Company_Name": "Rush",
        "Organization": "10",
        "Vendor_Code": "EMP",
        "Location": "Chicago Triangle Office Building TOB",
        "Location_Code": "Chicago Triangle Office Building TOB",
        "Department_Name": "System Center Qlt Analytics",
        "Department": "10755",
        "Cost_Center": "10010942",
        "Title": "Clinical Data Abstractor Per Diem RUMC",
        "Job_Code": "03524",
        "Job_Family": "Risk Management",
        # Manager/one-up manager de-realified 2026-10-23 per user rule
        # ("Change Manager and Oneupmanager - Do not use real time users,
        # only use test users"): this template's values were copied from a
        # real reference row and named actual Rush employees, which a
        # synthetic test identity must not point at. Replaced with the same
        # shape ECHO/Ellucian already used - "default.manager" plus NULL
        # manager/one-up IDs - rather than another named person, per the
        # user's choice of the default.manager option. Real values kept
        # here only as a comment, for traceability back to the sample:
        #   Manager_Name "IsmaelPD p Fisher", Manager_Username "tsep",
        #   Manager_Employee_ID "19087701", OneUp_Manager_Employee_ID
        #   "20100001", OneUp_Manager_Network_ID "ntruckenbro2".
        "Manager_Name": "MaeveAA Yamamoto",
        "Primary_Position": "YES",
        # Sample value was the literal string "true", unlike Copley's
        # descriptive "ACTIVE REGULAR" — kept as-is per the real sample
        # rather than guessing a descriptive equivalent.
        "Relationship_Status": "true",
        "Manager_Username": "MaeveAA Yamamoto",
        "Manager_Employee_ID": "259921",
        "OneUp_Manager_Employee_ID": "253476",
        "OneUp_Manager_Network_ID": "FionaAA Lambert",
        "Work_Phone_Number": "1700005543",
        "Work_Hours": "Variable_time",
        # Per user decision (2026-09-18): the 2026-09-15 sample's NULL here
        # was a gap in that record, not confirmed system behavior — switched
        # to "True" per the fuller 2026-09-18 sample.
        "Do_Not_Rehire": "True",
        # Per user decision (2026-09-18): supersedes the 2026-09-15 decision
        # to default this to "False" — the fuller sample shows NULL, and the
        # user confirmed NULL is now correct. Legal_Hold stays NULL since its
        # new-Workday behavior is still genuinely unconfirmed.
        "Manager_Hold": None,
        "Legal_Hold": None,
    },
}


def structural_fields(source_key: str) -> dict:
    template = SOURCE_TEMPLATES.get(source_key)
    if template is None:
        raise NotImplementedError(
            f'No structural attribute template for source "{source_key}" yet. '
            f"Populated sources: {', '.join(sorted(SOURCE_TEMPLATES))}. Populate "
            "SOURCE_TEMPLATES[...] from a live reference row before generating "
            "this source. See AGENTS.md."
        )
    return template
