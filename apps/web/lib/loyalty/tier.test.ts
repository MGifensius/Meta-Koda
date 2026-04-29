import { describe, expect, test } from 'vitest';
import { deriveTier, type Tier } from './tier';

const TIERS: Tier[] = [
  { id: 't0', tier_index: 0, name: 'Bronze',   min_points_lifetime: 0,    perks_text: null },
  { id: 't1', tier_index: 1, name: 'Silver',   min_points_lifetime: 500,  perks_text: null },
  { id: 't2', tier_index: 2, name: 'Gold',     min_points_lifetime: 2000, perks_text: null },
  { id: 't3', tier_index: 3, name: 'Platinum', min_points_lifetime: 5000, perks_text: null },
];

describe('deriveTier', () => {
  test('zero lifetime → Bronze', () => {
    expect(deriveTier(0, TIERS).tier_index).toBe(0);
  });

  test('threshold − 1 → previous tier', () => {
    expect(deriveTier(499, TIERS).tier_index).toBe(0);
    expect(deriveTier(1999, TIERS).tier_index).toBe(1);
    expect(deriveTier(4999, TIERS).tier_index).toBe(2);
  });

  test('exact threshold → that tier', () => {
    expect(deriveTier(500, TIERS).tier_index).toBe(1);
    expect(deriveTier(2000, TIERS).tier_index).toBe(2);
    expect(deriveTier(5000, TIERS).tier_index).toBe(3);
  });

  test('above max → top tier', () => {
    expect(deriveTier(99999999, TIERS).tier_index).toBe(3);
  });

  test('order-independent (input array order does not matter)', () => {
    const shuffled = [...TIERS].reverse();
    expect(deriveTier(750, shuffled).tier_index).toBe(1);
  });

  test('renamed tiers still work (no name dependency)', () => {
    const renamed: Tier[] = TIERS.map((t) => ({ ...t, name: `Custom-${t.tier_index}` }));
    expect(deriveTier(2500, renamed).name).toBe('Custom-2');
  });
});
