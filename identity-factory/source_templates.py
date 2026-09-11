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
