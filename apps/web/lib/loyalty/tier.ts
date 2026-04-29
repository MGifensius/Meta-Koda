export interface Tier {
  id: string;
  tier_index: number;
  name: string;
  min_points_lifetime: number;
  perks_text: string | null;
}

/**
 * Returns the tier whose threshold is the highest one ≤ lifetime.
 * Tier 0 (threshold 0) always matches when no higher tier qualifies.
 */
export function deriveTier(lifetime: number, tiers: readonly Tier[]): Tier {
  return [...tiers]
    .sort((a, b) => b.tier_index - a.tier_index)
    .find((t) => lifetime >= t.min_points_lifetime)!;
}
