import { z } from 'zod';
import { toE164 } from '../utils/phone';

export const CustomerInputSchema = z.object({
  full_name: z.string().trim().min(1, 'Name is required').max(120, 'Name too long'),
  phone: z
    .string()
    .optional()
    .transform((v) => (v ? v : undefined))
    .transform((v, ctx) => {
      if (v === undefined) return undefined;
      try {
        return toE164(v);
      } catch (err) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: err instanceof Error ? err.message : 'invalid phone',
        });
        return z.NEVER;
      }
    }),
  email: z.string().email().optional().or(z.literal('').transform(() => undefined)),
  birth_date: z.string().date().optional().or(z.literal('').transform(() => undefined)),
  notes: z.string().max(2000).optional().or(z.literal('').transform(() => undefined)),
  tags: z.array(z.string().min(1).max(48)).default([]),
});

export type CustomerInput = z.infer<typeof CustomerInputSchema>;
