import { ExpectedValueCheck } from '../config/testcases';

// Shared by both the UI-based checks in run_regression_case.ts (values scraped
// from a screenshot) and the DB-based checks in tests/sql/ (a row fetched via
// dbClient.ts) — either caller shapes its source data as Record<field, string[]>
// and gets identical exact/contains match semantics and PASS/FAIL/NOT FOUND
// formatting.

export type CheckOutcome = { result: 'PASS' | 'FAIL'; actual: string[] };

// Evaluates a single expected-value check against one set of captured values.
// Returns undefined if the field wasn't found at all (the caller tries another
// source, or reports NOT FOUND if none has it).
export function evaluateCheck(check: ExpectedValueCheck, values: Record<string, string[]> | void): CheckOutcome | undefined {
  const occurrences = values?.[check.field];
  if (!occurrences || occurrences.length === 0) return undefined;
  const matchType = check.matchType ?? 'exact';
  const matched = occurrences.some((actual) => {
    const a = actual.trim().toLowerCase();
    const e = check.expected.trim().toLowerCase();
    return matchType === 'contains' ? a.includes(e) : a === e;
  });
  return { result: matched ? 'PASS' : 'FAIL', actual: occurrences };
}

export function formatCheckResult(check: ExpectedValueCheck, outcome: CheckOutcome | undefined): string {
  if (!outcome) {
    return `NOT FOUND — ${check.field}: expected "${check.expected}", but this field wasn't matched in the captured values`;
  }
  if (outcome.result === 'PASS') {
    return `PASS — ${check.field}: "${outcome.actual[0]}"`;
  }
  const matchType = check.matchType ?? 'exact';
  return `FAIL — ${check.field}: expected ${matchType === 'contains' ? 'to contain ' : ''}"${check.expected}", found "${outcome.actual.join('" / "')}"`;
}
