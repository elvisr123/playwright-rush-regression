/** Canonical lifecycle folders/files. On-screen SailPoint values may differ — set `expectedValues` per spec. */
export const LIFECYCLE_STATES = [
  'futurehire',
  'prehire',
  'active',
  'termed',
  'inactive',
  'rehire',
] as const;

export type LifecycleState = (typeof LIFECYCLE_STATES)[number];

export function lifecycleLabel(lifecycle: LifecycleState): string {
  return lifecycle.charAt(0).toUpperCase() + lifecycle.slice(1);
}
