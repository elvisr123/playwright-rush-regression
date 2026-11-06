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

// mssql parses a SQL `date` column (no time component) as a UTC-midnight JS
// Date. String(date) then formats it in the *local machine* timezone, which
// rolls UTC midnight back to the previous evening — e.g. a stored
// 1998-05-10 reads back as "Sat May 09 1998 19:00:00 GMT-0500 ...". The
// stored data is correct; only naive stringification is wrong. Format as a
// plain YYYY-MM-DD when the UTC time-of-day is exactly midnight (true for
// every date-only column in this schema), so it matches the same format
// generated identities use (identity-factory/user_payload.py's
// lifecycle_dates()) and compares correctly with a plain exact-string
// check. Falls back to full ISO for anything with a real time component.
function formatDbValue(value: unknown): string {
  if (value === null || value === undefined) return '';
  if (value instanceof Date) {
    const iso = value.toISOString();
    return iso.endsWith('T00:00:00.000Z') ? iso.slice(0, 10) : iso;
  }
  return String(value);
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
      normalized[key] = formatDbValue(value);
    }
    return normalized;
  } finally {
    await pool.close().catch(() => {});
  }
}

/**
 * Fetches every row from a STG_* staging table matching a Given_Name +
 * Family_Name pair, normalized to string values. Used as a pre-insert
 * duplicate check — generate_identity.py's own name-collision avoidance
 * (excel_store.used_first_last()) only checks the local Excel audit log,
 * which is per-machine (Mac vs VDI are separate git checkouts) and not
 * guaranteed to be in sync, so this is a real database-backed check on
 * top of it.
 */
export async function findRowsByName(
  table: string,
  givenName: string,
  familyName: string
): Promise<Record<string, string>[]> {
  if (!KNOWN_TABLES.has(table)) {
    throw new Error(`Refusing to query unrecognized table "${table}" — add it to KNOWN_TABLES in dbClient.ts once confirmed in SSMS.`);
  }

  const pool = new sql.ConnectionPool(config());
  try {
    await withTimeout(pool.connect(), HARD_TIMEOUT_MS, `Connecting to ${table}`);
    const result = await withTimeout(
      pool
        .request()
        .input('givenName', sql.VarChar, givenName)
        .input('familyName', sql.VarChar, familyName)
        .query(`SELECT * FROM dbo.${table} WHERE Given_Name = @givenName AND Family_Name = @familyName`),
      HARD_TIMEOUT_MS,
      `Querying ${table} by name`
    );

    return result.recordset.map((row) => {
      const normalized: Record<string, string> = {};
      for (const [key, value] of Object.entries(row)) {
        normalized[key] = formatDbValue(value);
      }
      return normalized;
    });
  } finally {
    await pool.close().catch(() => {});
  }
}

/**
 * Fetches every row from a STG_* staging table matching a User_ID, normalized
 * to string values. User_ID is only the last 6 digits of the generated
 * number (identity-factory/user_payload.py: `user_id = number[-6:]`), which
 * cycles through all 1,000,000 possible values roughly every 11.6 days — so
 * unlike Stage_Key (12 digits) or Correlation_Key (150-char hash), it is NOT
 * unique across this project's whole history, only within one generation
 * run. Confirmed live (2026-10-06): a new ECHO identity's User_ID collided
 * with an unrelated identity created weeks earlier, and SailPoint correlated
 * the new account onto that old identity (evidently via AccountName/User_ID
 * matching, not just Correlation_Key) — this check closes that gap.
 */
export async function findRowsByUserId(table: string, userId: string): Promise<Record<string, string>[]> {
  if (!KNOWN_TABLES.has(table)) {
    throw new Error(`Refusing to query unrecognized table "${table}" — add it to KNOWN_TABLES in dbClient.ts once confirmed in SSMS.`);
  }

  const pool = new sql.ConnectionPool(config());
  try {
    await withTimeout(pool.connect(), HARD_TIMEOUT_MS, `Connecting to ${table}`);
    const result = await withTimeout(
      pool.request().input('userId', sql.VarChar, userId).query(`SELECT * FROM dbo.${table} WHERE User_ID = @userId`),
      HARD_TIMEOUT_MS,
      `Querying ${table} by User_ID`
    );

    return result.recordset.map((row) => {
      const normalized: Record<string, string> = {};
      for (const [key, value] of Object.entries(row)) {
        normalized[key] = formatDbValue(value);
      }
      return normalized;
    });
  } finally {
    await pool.close().catch(() => {});
  }
}

/**
 * Runs one generated INSERT statement against My_Rush_Jobs and returns the
 * number of rows affected.
 *
 * Why this exists alongside scripts/ssms-capture.ps1: the original creation
 * pipeline INSERTed by typing SQL into a live SSMS window via SendKeys,
 * because the point was to *screenshot* SSMS doing it for the Word report.
 * The 2026-11-06 batch request asked for sandbox-only screenshot evidence
 * ("Dont screenshot sql management"), which removes that reason — and with
 * it the reason to tolerate SendKeys for 16 rows, where each row is its own
 * multi-minute typing session that can be derailed by focus loss, a popup,
 * or the window being touched. This runs the identical generated SQL over
 * the same mssql connection the verification SELECTs already use.
 *
 * The statement is NOT parameterized: it comes from
 * identity-factory/local_table.py's to_insert_sql(), which emits its own
 * escaped literals (single quotes doubled) for a row this repo generated
 * itself. Nothing here is user- or network-supplied, so the shape checks
 * below are a guard against a malformed/unexpected statement rather than
 * against injection — they refuse anything that isn't exactly one INSERT
 * into the expected table.
 */
export async function runGeneratedInsert(table: string, insertSql: string): Promise<number> {
  if (!KNOWN_TABLES.has(table)) {
    throw new Error(`Refusing to write to unrecognized table "${table}" — add it to KNOWN_TABLES in dbClient.ts once confirmed in SSMS.`);
  }
  const trimmed = insertSql.trim();
  const expectedPrefix = `INSERT INTO [SOA].[dbo].[${table}]`;
  if (!trimmed.toUpperCase().startsWith(expectedPrefix.toUpperCase())) {
    throw new Error(
      `Refusing to run a statement that doesn't start with "${expectedPrefix}" — got: ${trimmed.slice(0, 120)}...`
    );
  }
  // One statement only. to_insert_sql() ends with a single ';' and puts its
  // column names in /* ... */ block comments, so any ';' before the final
  // character would mean the generator changed shape or something else was
  // concatenated on.
  const withoutTrailing = trimmed.endsWith(';') ? trimmed.slice(0, -1) : trimmed;
  if (withoutTrailing.includes(';')) {
    throw new Error('Refusing to run multiple statements in one call — expected exactly one INSERT.');
  }

  const pool = new sql.ConnectionPool(config());
  try {
    await withTimeout(pool.connect(), HARD_TIMEOUT_MS, `Connecting to ${table}`);
    const result = await withTimeout(
      pool.request().query(trimmed),
      HARD_TIMEOUT_MS,
      `INSERT into ${table}`
    );
    // mssql reports per-statement counts; one INSERT means one entry.
    const affected = result.rowsAffected?.reduce((a, b) => a + b, 0) ?? 0;
    return affected;
  } finally {
    await pool.close().catch(() => {});
  }
}

// SQL Server's permission-denied errors for a write. 229 is the usual
// "The INSERT permission was denied on object ..."; 262 is the
// "permission denied in database" variant. Used to tell a genuinely
// read-only account apart from a probe that failed for some other reason.
const PERMISSION_DENIED_ERROR_NUMBERS = new Set([229, 262]);

export type InsertProbeVerdict = 'granted' | 'denied' | 'inconclusive';

/**
 * Pre-flight for the batch creation run: tries to establish whether the
 * configured DB account can INSERT into the target table before any
 * identity is generated, so a read-only account is caught in seconds
 * rather than 15 rows into a 16-row batch.
 *
 * Proves write permission without leaving a row behind: the INSERT runs
 * inside a transaction that is always rolled back.
 *
 * Three-way on purpose. The probe is a Stage_Key-only INSERT, leaving every
 * other column to its own default — so if My_Rush_Jobs has (or later gains)
 * a NOT NULL column with no default, the probe fails on the schema while
 * the account's permissions are perfectly fine. Reporting that as 'denied'
 * would block the whole batch over nothing, so only a recognized
 * permission error (see above) is 'denied'; anything else is
 * 'inconclusive' and the caller should proceed — a real permission problem
 * then costs exactly one row's attempt instead of the batch.
 */
export async function canInsert(
  table: string,
  probeStageKey: string
): Promise<{ verdict: InsertProbeVerdict; detail: string }> {
  if (!KNOWN_TABLES.has(table)) {
    throw new Error(`Refusing to write to unrecognized table "${table}" — add it to KNOWN_TABLES in dbClient.ts once confirmed in SSMS.`);
  }
  const pool = new sql.ConnectionPool(config());
  try {
    await withTimeout(pool.connect(), HARD_TIMEOUT_MS, `Connecting to ${table}`);
    const tx = new sql.Transaction(pool);
    await withTimeout(tx.begin(), HARD_TIMEOUT_MS, 'Beginning probe transaction');
    try {
      await withTimeout(
        new sql.Request(tx)
          .input('stageKey', sql.VarChar, probeStageKey)
          .query(`INSERT INTO dbo.${table} (Stage_Key) VALUES (@stageKey)`),
        HARD_TIMEOUT_MS,
        `Probe INSERT into ${table}`
      );
      return { verdict: 'granted', detail: 'INSERT permission confirmed (probe row rolled back).' };
    } finally {
      // Always roll back — on success to discard the probe row, on failure
      // to close out the transaction cleanly.
      await tx.rollback().catch(() => {});
    }
  } catch (err) {
    const number = (err as { number?: number }).number;
    const message = (err as Error).message;
    if (number !== undefined && PERMISSION_DENIED_ERROR_NUMBERS.has(number)) {
      return { verdict: 'denied', detail: `SQL Server error ${number}: ${message}` };
    }
    return {
      verdict: 'inconclusive',
      detail: `probe did not complete${number !== undefined ? ` (SQL Server error ${number})` : ''}: ${message}`,
    };
  } finally {
    await pool.close().catch(() => {});
  }
}

// Columns updateRowFields is allowed to write. Deliberately only the five
// manager columns: the one repair this pipeline needs is re-pointing an
// already-created identity's manager after a template change, and a
// narrow allowlist means a typo'd field name is a thrown error rather than
// a silent write to the wrong column. Widen it only with a real reason.
const UPDATABLE_COLUMNS = new Set([
  'Manager_Name',
  'Manager_Username',
  'Manager_Employee_ID',
  'OneUp_Manager_Employee_ID',
  'OneUp_Manager_Network_ID',
]);

/**
 * Updates specific columns on exactly one staging row, matched by Stage_Key.
 *
 * Values are bound as parameters; column names are checked against
 * UPDATABLE_COLUMNS above before being interpolated, so neither side of the
 * assignment can carry arbitrary SQL.
 *
 * Throws unless exactly one row was affected. 0 means the Stage_Key isn't
 * there (wrong key, wrong environment, or the row was never INSERTed) and
 * >1 should be impossible for a Stage_Key — either way the caller is
 * operating on a different table than it thinks, which is worth stopping
 * for rather than reporting as success.
 */
export async function updateRowFields(
  table: string,
  stageKey: string,
  fields: Record<string, string | null>
): Promise<number> {
  if (!KNOWN_TABLES.has(table)) {
    throw new Error(`Refusing to write to unrecognized table "${table}" — add it to KNOWN_TABLES in dbClient.ts once confirmed in SSMS.`);
  }
  const names = Object.keys(fields);
  if (names.length === 0) throw new Error('updateRowFields called with no fields.');
  const bad = names.filter((n) => !UPDATABLE_COLUMNS.has(n));
  if (bad.length > 0) {
    throw new Error(
      `Refusing to update column(s) not in UPDATABLE_COLUMNS: ${bad.join(', ')}. ` +
        `Allowed: ${[...UPDATABLE_COLUMNS].join(', ')}.`
    );
  }

  const pool = new sql.ConnectionPool(config());
  try {
    await withTimeout(pool.connect(), HARD_TIMEOUT_MS, `Connecting to ${table}`);
    const request = pool.request().input('stageKey', sql.VarChar, stageKey);
    const assignments = names.map((name, i) => {
      const param = `v${i}`;
      const value = fields[name];
      request.input(param, sql.VarChar, value === null ? null : String(value));
      return `[${name}] = @${param}`;
    });
    const result = await withTimeout(
      request.query(`UPDATE dbo.${table} SET ${assignments.join(', ')} WHERE Stage_Key = @stageKey`),
      HARD_TIMEOUT_MS,
      `UPDATE ${table}`
    );
    const affected = result.rowsAffected?.reduce((a, b) => a + b, 0) ?? 0;
    if (affected !== 1) {
      throw new Error(
        `Expected to update exactly 1 row for Stage_Key "${stageKey}" in ${table}, but ${affected} were affected.`
      );
    }
    return affected;
  } finally {
    await pool.close().catch(() => {});
  }
}
