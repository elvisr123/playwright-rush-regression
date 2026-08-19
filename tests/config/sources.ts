/** Exact SailPoint source names (Admin → Sources). Folder names under tests/sources/ map here. */
export const SOURCES = {
  rush: 'RUSH Lawson',
  copley: 'Copley Lawson',
  echo: 'ECHO Credentialed Providers',
  ellucian: 'Ellucian Students',
  nerm: 'Non-Employee Workforce',
} as const;

export type SourceKey = keyof typeof SOURCES;
