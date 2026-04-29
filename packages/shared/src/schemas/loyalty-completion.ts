import { z } from 'zod';

export const CompleteBookingInputSchema = z.object({
  bill_idr: z.number().int().min(0).optional(),
  reward_redemption_ids: z.array(z.string().uuid()).default([]),
});
export type CompleteBookingInput = z.infer<typeof CompleteBookingInputSchema>;
