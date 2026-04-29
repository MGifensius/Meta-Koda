import { z } from 'zod';

export const TierUpdateSchema = z.object({
  name: z.string().trim().min(1).max(40).optional(),
  min_points_lifetime: z.number().int().min(0).optional(),
  perks_text: z.string().trim().max(1000).nullable().optional(),
});
export type TierUpdate = z.infer<typeof TierUpdateSchema>;
