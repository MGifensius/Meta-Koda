import { z } from 'zod';
import { LoyaltyRewardTypeSchema } from '../enums/loyalty-reward-type';

const baseReward = z.object({
  name: z.string().trim().min(1).max(120),
  description: z.string().trim().max(1000).optional(),
  type: LoyaltyRewardTypeSchema,
  type_value: z.number().int().min(0).default(0),
  points_cost: z.number().int().positive(),
  min_tier_index: z.number().int().min(0).max(3).default(0),
  is_active: z.boolean().default(true),
  sort_order: z.number().int().min(0).default(0),
});

export const RewardCreateSchema = baseReward.refine(
  (r) => {
    if (r.type === 'percent_discount') return r.type_value >= 1 && r.type_value <= 100;
    if (r.type === 'rupiah_discount') return r.type_value > 0;
    return true;
  },
  { message: 'type_value must match the type (1–100 for percent, >0 for rupiah).' },
);
export type RewardCreate = z.infer<typeof RewardCreateSchema>;

export const RewardUpdateSchema = baseReward.partial();
export type RewardUpdate = z.infer<typeof RewardUpdateSchema>;
