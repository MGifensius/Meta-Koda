import { z } from 'zod';

export const LoyaltyRewardTypeSchema = z.enum([
  'free_item',
  'percent_discount',
  'rupiah_discount',
]);
export type LoyaltyRewardType = z.infer<typeof LoyaltyRewardTypeSchema>;

export const LOYALTY_REWARD_TYPE_LABELS: Record<LoyaltyRewardType, string> = {
  free_item: 'Free item',
  percent_discount: '% discount',
  rupiah_discount: 'Rp discount',
};
