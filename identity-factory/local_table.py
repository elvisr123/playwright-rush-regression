"""Local stand-in for [SOA].[dbo].[My_Rush_Jobs]. SQLite on this laptop, not VDI SQL."""

from __future__ import annotations

import sqlite3
from pathlib import Path

from user_payload import MY_RUSH_JOBS_COLUMNS

DATA_DIR = Path(__file__).resolve().parent / "data"
DB_PATH = DATA_DIR / "My_Rush_Jobs.sqlite"
LATEST_SQL_PATH = DATA_DIR / "latest_insert.sql"


def _connect() -> sqlite3.Connection:
    DATA_DIR.mkdir(parents=True, exist_ok=True)
    conn = sqlite3.connect(DB_PATH)
    rest = ", ".join(f'"{c}" TEXT' for c in MY_RUSH_JOBS_COLUMNS[1:])
    conn.execute(
        f'CREATE TABLE IF NOT EXISTS My_Rush_Jobs ("{MY_RUSH_JOBS_COLUMNS[0]}" TEXT PRIMARY KEY, {rest})'
    )
    return conn


def save_row(row: dict) -> Path:
    values = [row.get(c) for c in MY_RUSH_JOBS_COLUMNS]
    placeholders = ", ".join("?" for _ in MY_RUSH_JOBS_COLUMNS)
    col_sql = ", ".join(f'"{c}"' for c in MY_RUSH_JOBS_COLUMNS)
    conn = _connect()
    try:
        conn.execute(
            f"INSERT OR REPLACE INTO My_Rush_Jobs ({col_sql}) VALUES ({placeholders})",
            values,
        )
        conn.commit()
    finally:
        conn.close()
    LATEST_SQL_PATH.write_text(to_insert_sql(row), encoding="utf-8")
    return DB_PATH


def to_insert_sql(row: dict) -> str:
    def lit(value) -> str:
        if value is None:
            return "NULL"
        return "'" + str(value).replace("'", "''") + "'"

    col_lines = ",\n          ".join(f"[{c}]" for c in MY_RUSH_JOBS_COLUMNS)
    val_lines = ",\n      ".join(f"{lit(row.get(c))} -- {c}" for c in MY_RUSH_JOBS_COLUMNS)
    return (
        "INSERT INTO [SOA].[dbo].[My_Rush_Jobs]\n"
        f"          ({col_lines})\n"
        "    VALUES\n"
        f"      ({val_lines});\n"
    )


def format_row_table(row: dict) -> str:
    lines = [f"{'Column':<32}  Value", "-" * 72]
    for col in MY_RUSH_JOBS_COLUMNS:
        value = row.get(col)
        shown = "NULL" if value is None else str(value)
        lines.append(f"{col:<32}  {shown}")
    return "\n".join(lines)
