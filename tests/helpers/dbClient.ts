import sql from 'mssql';

function config(): sql.config {
  const { DB_SERVER, DB_DATABASE, DB_USERNAME, DB_PASSWORD } = process.env;
  if (!DB_SERVER || !DB_DATABASE || !DB_USERNAME || !DB_PASSWORD) {
    throw new Error(
      'Missing DB_SERVER / DB_DATABASE / DB_USERNAME / DB_PASSWORD in .env — required for database verification.'
    );
  }
  return {
    server: DB_SERVER,
    database: DB_DATABASE,
    user: DB_USERNAME,
    password: DB_PASSWORD,
    options: { encrypt: true, trustServerCertificate: true },
  };
}

// STG_* tables confirmed present in SSMS (Object Explorer, SOA database on
// RUTWV-IGADB01.rushtst.com). The table name is interpolated into the query
// below, so this allowlist also guards against injecting an arbitrary table
// name — only names added here after being confirmed in SSMS can be queried.
const KNOWN_TABLES = new Set([
  'STG_Copley_Lawson',
  'STG_Rush_Lawson',
  'STG_Echo',
  'STG_Ellucian',
  'STG_Rush_Workday',
  'STG_Rise',
]);

/**
 * Fetches one row from a STG_* staging table by Stage_Key, normalized to
 * string values. Returns undefined if no row matched. Opens and closes its
 * own connection per call — call volume per regression run is low enough
 * (a handful of lookups per scenario) that pooling isn't worth the added
 * lifecycle management across parallel Playwright workers.
 */
export async function getStagingRow(table: string, stageKey: string): Promise<Record<string, string> | undefined> {
  if (!KNOWN_TABLES.has(table)) {
    throw new Error(`Refusing to query unrecognized table "${table}" — add it to KNOWN_TABLES in dbClient.ts once confirmed in SSMS.`);
  }

  const pool = new sql.ConnectionPool(config());
  try {
    await pool.connect();
    const result = await pool
      .request()
      .input('stageKey', sql.VarChar, stageKey)
      .query(`SELECT * FROM dbo.${table} WHERE Stage_Key = @stageKey`);

    const row = result.recordset[0];
    if (!row) return undefined;

    const normalized: Record<string, string> = {};
    for (const [key, value] of Object.entries(row)) {
      normalized[key] = value === null || value === undefined ? '' : String(value);
    }
    return normalized;
  } finally {
    await pool.close();
  }
}
