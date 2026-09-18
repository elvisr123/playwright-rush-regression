import { execFileSync } from 'child_process';
import * as path from 'path';
import { LifecycleState } from '../config/lifecycles';

export interface GeneratedRow {
  sourceKey: string;
  sourceName: string;
  stageKey: string;
  insertSql: string;
  row: Record<string, string | null>;
}

export interface GeneratedIdentity {
  lifecycle: LifecycleState;
  firstName: string;
  lastName: string;
  rows: GeneratedRow[];
}

export interface GenerateOptions {
  first?: string;
  last?: string;
  /** Also write the handoff JSON here (in addition to stdout). */
  out?: string;
  /**
   * Reuse this 7-digit number (from an existing Stage_Key, e.g. "5763119"
   * from WD-955763119ER) instead of allocating a new one — use this to add
   * another source to an identity that already exists elsewhere, so the
   * new row correlates with it. Requires first/last to match that identity.
   */
  number?: string;
  /**
   * Reuse this exact Birth_Date (YYYY-MM-DD) instead of a random one — pair
   * with `number` so a new source's row matches an existing identity's
   * Birth_Date exactly.
   */
  birthDate?: string;
  /**
   * Reuse this exact Correlation_Key instead of the default (derived from
   * `number`) — required when adding a source to an identity created
   * before that default existed, so the new row's Correlation_Key matches
   * what's already stored for that identity's other source(s). Paste the
   * exact value from the existing account/identity in the SailPoint UI.
   */
  correlationKey?: string;
}

/**
 * Shells out to identity-factory/generate_identity.py to build a synthetic
 * My_Rush_Jobs identity (or one row per source, for a multi-source identity
 * sharing one name/DOB/etc.) — no SailPoint API calls, no SQL connection,
 * pure local generation. Same execFileSync-a-sibling-process pattern this
 * repo already uses for scripts/ssms-capture.ps1.
 *
 * Only the printed JSON is read from stdout; the script's own progress
 * lines go to stderr and are not captured here.
 */
export function runGenerator(
  sources: string[],
  lifecycle: LifecycleState,
  opts: GenerateOptions = {}
): GeneratedIdentity {
  const script = path.resolve('identity-factory', 'generate_identity.py');
  const args = [script, '--sources', ...sources, '--lifecycle', lifecycle];
  if (opts.first) args.push('--first', opts.first);
  if (opts.last) args.push('--last', opts.last);
  if (opts.out) args.push('--out', opts.out);
  if (opts.number) args.push('--number', opts.number);
  if (opts.birthDate) args.push('--birth-date', opts.birthDate);
  if (opts.correlationKey) args.push('--correlation-key', opts.correlationKey);

  let stdout: string;
  try {
    stdout = execFileSync('python', args, { encoding: 'utf8', timeout: 60_000 });
  } catch (err) {
    const cause = err as NodeJS.ErrnoException;
    if (cause.code === 'ENOENT') {
      throw new Error(
        'Could not run "python" — is Python 3 installed and on PATH? On some VDI images, "python" with no ' +
          'real install falls through to a Microsoft Store shim that errors instead of running. Install a ' +
          'real Python 3 and confirm `python --version` works before re-running this test.'
      );
    }
    throw err;
  }

  // The script writes only the JSON payload to stdout (everything else goes
  // to stderr) — but take the last non-empty line defensively, in case
  // something else in the environment writes a stray line to stdout first.
  const lines = stdout
    .split('\n')
    .map((l) => l.trim())
    .filter(Boolean);
  const jsonLine = lines[lines.length - 1];
  if (!jsonLine) {
    throw new Error('generate_identity.py produced no output.');
  }
  return JSON.parse(jsonLine) as GeneratedIdentity;
}
