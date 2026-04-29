import { z } from 'zod';

export const AdjustPointsSchema = z.object({
  customer_id: z.string().uuid(),
  delta_points: z.number().int().refine((n) => n !== 0, { message: 'delta cannot be zero' }),
  reason: z.string().trim().min(1).max(500),
  affects_lifetime: z.boolean().default(false),
});
export type AdjustPoints = z.infer<typeof AdjustPointsSchema>;

export const VoidRedemptionSchema = z.object({
  redemption_id: z.string().uuid(),
  reason: z.string().trim().min(1).max(500),
});
export type VoidRedemption = z.infer<typeof VoidRedemptionSchema>;

export const RedeemRewardSchema = z.object({
  reward_id: z.string().uuid(),
  booking_id: z.string().uuid(),
});
export type RedeemReward = z.infer<typeof RedeemRewardSchema>;
