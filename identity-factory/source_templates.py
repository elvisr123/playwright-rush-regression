"""Per-source structural fields for a My_Rush_Jobs row.

These describe the SOURCE / workplace (department, manager, location, job
code, address, ...) — constant for every identity generated on that source —
as opposed to the identity-specific fields (name, dates, generated IDs) built
by user_payload.build_my_rush_jobs_row's scaffold.

Only "copley" is populated today, extracted byte-for-byte from the original
(pre-refactor) build_my_rush_jobs_row, which hardcoded these values directly.

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
        "Manager_Name": "REES, SHERRY A.",
        "Primary_Position": "YES",
        "Relationship_Status": "ACTIVE REGULAR",
        "Manager_Username": "99314",
        "Manager_Employee_ID": "99314",
        "OneUp_Manager_Employee_ID": "107641",
        "OneUp_Manager_Network_ID": "107641",
        "Work_Phone_Number": "1678777754",
        "Work_Hours": "8hours",
    },
    # "rush": Phase 3 — populate from a live reference row (RL-98100122712TESTCL000PD)
    # "echo": Phase 3 — populate from a live reference row (EC-9512021TESTCL902ER)
    # "ellucian": Phase 3 — no known reference Stage_Key exists yet; needs a
    #             fresh SELECT TOP 5 * FROM My_Rush_Jobs WHERE Source_Name =
    #             'Ellucian Students' on the VDI first.
    # "nerm": Phase 3 — populate from a live reference row (NE-19825552TEST000PDPPL)
    "workday": {
        # Extracted from a real Rush Workday INSERT sample (2026-09-15), plus
        # a user-provided old-vs-new Workday field mapping clarification.
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
        "Job_Family": None,
        # Sample row had no manager on file — worth confirming this is
        # representative rather than a gap in that specific record.
        "Manager_Name": None,
        "Primary_Position": "YES",
        # Sample value was the literal string "true", unlike Copley's
        # descriptive "ACTIVE REGULAR" — kept as-is per the real sample
        # rather than guessing a descriptive equivalent.
        "Relationship_Status": "true",
        "Manager_Username": None,
        "Manager_Employee_ID": "140281",
        "OneUp_Manager_Employee_ID": "980927",
        "OneUp_Manager_Network_ID": None,
        "Work_Phone_Number": None,
        "Work_Hours": "Variable_time",
        # Confirmed (not incidental): new Workday never returns a value here.
        "Do_Not_Rehire": None,
        # Per user decision (2026-09-15): keep the old-Workday convention —
        # Manager_Hold defaults to the string "False"; Legal_Hold stays NULL
        # since its new-Workday behavior is still genuinely unconfirmed.
        "Manager_Hold": "False",
        "Legal_Hold": None,
    },
}


def structural_fields(source_key: str) -> dict:
    template = SOURCE_TEMPLATES.get(source_key)
    if template is None:
        raise NotImplementedError(
            f'No structural attribute template for source "{source_key}" yet. '
            "Only Copley Lawson is filled in — populate SOURCE_TEMPLATES[...] "
            "from a live reference row before generating this source. See AGENTS.md."
        )
    return template
