import sql from 'mssql';

// Non-throwing check for callers that need to decide whether to attempt a DB
// check at all (e.g. the main regression suite, which normally runs outside
// the VDI where these vars are never set — the DB cross-check should silently
// not run there rather than fail every scenario on a missing-config error).
export function isDbConfigured(): boolean {
  const { DB_SERVER, DB_DATABASE, DB_USERNAME, DB_PASSWORD } = process.env;
  return Boolean(DB_SERVER && DB_DATABASE && DB_USERNAME && DB_PASSWORD);
}

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
    // Bound both phases explicitly — a silently-dropped connection (e.g. a
    // firewall black-holing the port rather than rejecting it) can otherwise
    // hang well past what mssql's own defaults would suggest, which is
    // fatal when this runs mid-way through a long Playwright regression
    // case rather than as a standalone script.
    connectionTimeout: 10_000,
    requestTimeout: 10_000,
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
  'My_Rush_Jobs',
]);

// Hard upper bound on top of config()'s connectionTimeout/requestTimeout —
// a second line of defense in case a connection hangs in a way that
// bypasses mssql's own timeout handling (observed: a run that should take
// ~15s hanging indefinitely once called from inside a long Playwright test
// rather than a standalone script).
const HARD_TIMEOUT_MS = 20_000;

function withTimeout<T>(promise: Promise<T>, ms: number, label: string): Promise<T> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`${label} timed out after ${ms}ms`)), ms);
    promise.then(
      (value) => { clearTimeout(timer); resolve(value); },
      (err) => { clearTimeout(timer); reject(err); }
    );
  });
}

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
    await withTimeout(pool.connect(), HARD_TIMEOUT_MS, `Connecting to ${table}`);
    const result = await withTimeout(
      pool.request().input('stageKey', sql.VarChar, stageKey).query(`SELECT * FROM dbo.${table} WHERE Stage_Key = @stageKey`),
      HARD_TIMEOUT_MS,
      `Querying ${table}`
    );

    const row = result.recordset[0];
    if (!row) return undefined;

    const normalized: Record<string, string> = {};
    for (const [key, value] of Object.entries(row)) {
      normalized[key] = value === null || value === undefined ? '' : String(value);
    }
    return normalized;
  } finally {
    await pool.close().catch(() => {});
  }
}
