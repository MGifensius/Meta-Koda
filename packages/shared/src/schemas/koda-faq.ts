import { z } from 'zod';

export const KodaFaqCreateSchema = z.object({
  question: z.string().trim().min(1).max(500),
  answer: z.string().trim().min(1).max(2000),
  is_active: z.boolean().default(true),
  sort_order: z.number().int().min(0).default(0),
});
export type KodaFaqCreate = z.infer<typeof KodaFaqCreateSchema>;

export const KodaFaqUpdateSchema = KodaFaqCreateSchema.partial();
export type KodaFaqUpdate = z.infer<typeof KodaFaqUpdateSchema>;
