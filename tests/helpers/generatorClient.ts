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
  /**
   * Override Start_Date/Original_Start_Date (YYYY-MM-DD) instead of the
   * lifecycle's computed default (e.g. "active" normally uses yesterday).
   * End_Date/Status/IIQDisabled still come from `lifecycle` as usual.
   */
  startDate?: string;
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
/**
 * Finds a working Python 3 interpreter. Tries `python` first, then the
 * Windows `py -3` launcher — on some VDI images `python` is only the
 * Microsoft Store shim (prints "Python was not found" and exits non-zero)
 * while a real install is still reachable via `py`. Returns the command plus
 * any prefix args to pass before the script path.
 */
function resolvePython(): string[] {
  const candidates = [['python'], ['py', '-3']];
  for (const [cmd, ...prefix] of candidates) {
    try {
      const out = execFileSync(cmd, [...prefix, '--version'], { encoding: 'utf8', timeout: 15_000, stdio: 'pipe' });
      if (/^Python 3\./.test(out.trim())) return [cmd, ...prefix];
    } catch {
      // not installed, or the Store shim — try the next candidate
    }
  }
  throw new Error(
    'Could not find Python 3 — tried `python` and `py -3`. On some VDI images, "python" with no real ' +
      'install falls through to a Microsoft Store shim that errors instead of running. Install a real ' +
      'Python 3 and confirm `python --version` or `py --version` works before re-running this test.'
  );
}

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
  if (opts.startDate) args.push('--start-date', opts.startDate);

  const [pythonCmd, ...pythonPrefixArgs] = resolvePython();
  const stdout = execFileSync(pythonCmd, [...pythonPrefixArgs, ...args], { encoding: 'utf8', timeout: 60_000 });

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
