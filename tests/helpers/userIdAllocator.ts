import { findUserIdsWithPrefix } from './dbClient';
import { readUserIdTiers } from './generatorClient';

/** User_ID is always exactly this many digits (identity-factory USER_ID_LENGTH). */
const USER_ID_LENGTH = 6;

export interface AllocatedUserId {
  userId: string;
  /** The prefix tier it came from, e.g. '0001' / '001' / '01' / '1' for rush. */
  tier: string;
  /** How many IDs in that tier were already taken before this pick. */
  usedInTier: number;
  tierSize: number;
}

let cachedTiers: Record<string, string[]> | undefined;

function tiersFor(sourceKey: string): string[] {
  cachedTiers ??= readUserIdTiers();
  const tiers = cachedTiers[sourceKey];
  if (!tiers?.length) throw new Error(`No User_ID prefix tiers for source "${sourceKey}".`);
  return tiers;
}

/**
 * Picks a free User_ID for each source from the live My_Rush_Jobs table,
 * moving to the next prefix tier only when the current one is full
 * (user request 2026-11-13: rush 0001xx -> 001xxx -> 01xxxx -> 1xxxxx, and the
 * same leading-zero-dropping rule for every source; the tiers themselves
 * come from identity-factory/user_payload.py's user_id_prefix_tiers(), so
 * the rule lives in one place).
 *
 * Within a tier the pick is random rather than lowest-free, so two
 * teammates creating identities at the same time are unlikely to grab the
 * same ID. The specs still run their findRowsByUserId duplicate check
 * afterwards as a safety net for exactly that race.
 *
 * `exclude` holds IDs already handed out but not yet INSERTed (e.g. earlier
 * attempts in the same run) so they are not picked twice.
 */
export async function allocateUserIds(
  table: string,
  sourceKeys: string[],
  exclude: Set<string> = new Set(),
  /** Injectable for offline tests; defaults to the live-table query. */
  lookup: (table: string, prefix: string) => Promise<Set<string>> = findUserIdsWithPrefix
): Promise<Record<string, AllocatedUserId>> {
  const picks: Record<string, AllocatedUserId> = {};
  for (const sourceKey of sourceKeys) {
    const tiers = tiersFor(sourceKey);
    let picked: AllocatedUserId | undefined;
    for (const tier of tiers) {
      const tailLength = USER_ID_LENGTH - tier.length;
      const tierSize = 10 ** tailLength;
      const used = await lookup(table, tier);
      const taken = (id: string) => used.has(id) || exclude.has(id);
      const free: string[] = [];
      for (let n = 0; n < tierSize; n++) {
        const id = tier + String(n).padStart(tailLength, '0');
        if (!taken(id)) free.push(id);
      }
      if (free.length === 0) {
        console.log(`  User_ID tier ${tier}${'x'.repeat(tailLength)} for ${sourceKey} is full (${tierSize}) — moving to the next tier.`);
        continue;
      }
      const userId = free[Math.floor(Math.random() * free.length)];
      picked = { userId, tier, usedInTier: tierSize - free.length, tierSize };
      break;
    }
    if (!picked) {
      throw new Error(
        `Every User_ID tier for ${sourceKey} is full (${tiers.map((t) => t + 'x'.repeat(USER_ID_LENGTH - t.length)).join(', ')}).`
      );
    }
    picks[sourceKey] = picked;
    exclude.add(picked.userId);
  }
  return picks;
}

/** { rush: '001234', ... } — the shape GenerateOptions.userIds takes. */
export function userIdMap(picks: Record<string, AllocatedUserId>): Record<string, string> {
  return Object.fromEntries(Object.entries(picks).map(([k, v]) => [k, v.userId]));
}

export function describeUserIdPicks(picks: Record<string, AllocatedUserId>): string {
  return Object.entries(picks)
    .map(([k, v]) => `${k} ${v.userId} (tier ${v.tier}, ${v.usedInTier}/${v.tierSize} already used)`)
    .join('; ');
}

/**
 * True when userId is 6 digits inside one of the source's tiers. Mirrors
 * user_payload.validate_user_id(): a value's tier is its leading zeros plus
 * the first non-zero digit ('000112' -> '0001', '012345' -> '01').
 */
export function isInSourceTiers(sourceKey: string, userId: string): boolean {
  if (!/^\d{6}$/.test(userId)) return false;
  const tier = userId.slice(0, userId.length - userId.replace(/^0+/, '').length + 1);
  return tiersFor(sourceKey).includes(tier);
}
