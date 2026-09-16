/** Canonical lifecycle folders/files. On-screen SailPoint values may differ — set `expectedValues` per spec. */
export const LIFECYCLE_STATES = [
  'futurehire',
  'prehire',
  'active',
  'termed',
  'inactive',
  'rehire',
  // Creation-pipeline-only state (identity-factory/user_payload.py) — same
  // date/status logic as 'active', but Primary_Position is "NO" instead of
  // "YES". No tests/sources/*/processing.spec.ts exists yet; this isn't a
  // validated SailPoint-side lifecycle state, just a generator input.
  'processing',
] as const;

export type LifecycleState = (typeof LIFECYCLE_STATES)[number];

export function lifecycleLabel(lifecycle: LifecycleState): string {
  return lifecycle.charAt(0).toUpperCase() + lifecycle.slice(1);
}
