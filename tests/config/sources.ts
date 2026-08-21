/** Exact SailPoint source names (Admin → Sources). Folder names under tests/sources/ map here. */
export const SOURCES = {
  rush: 'RUSH Lawson',
  copley: 'Copley Lawson',
  echo: 'ECHO Credentialed Providers',
  ellucian: 'Ellucian Students',
  nerm: 'Non-Employee Workforce',
} as const;

export type SourceKey = keyof typeof SOURCES;

/**
 * Maps a SailPoint source name to its SQL Server staging table (SOA database
 * on RUTWV-IGADB01.rushtst.com) for database-based attribute verification.
 * Only sources confirmed to have a matching STG_* table in SSMS are listed —
 * Non-Employee Workforce has no confirmed match yet (no STG_NonEmployee-style
 * table observed), so it's intentionally left out: DB verification is
 * skipped for that source rather than guessed.
 */
export const SOURCE_TO_STG_TABLE: Partial<Record<string, string>> = {
  'Copley Lawson': 'STG_Copley_Lawson',
  'RUSH Lawson': 'STG_Rush_Lawson',
  'ECHO Credentialed Providers': 'STG_Echo',
  'Ellucian Students': 'STG_Ellucian',
};
