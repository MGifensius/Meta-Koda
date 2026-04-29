import { z } from 'zod';

export const KodaSpecialCreateSchema = z
  .object({
    title: z.string().trim().min(1).max(120),
    description: z.string().trim().max(1000).optional(),
    starts_on: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
    ends_on: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
    is_active: z.boolean().default(true),
  })
  .refine(
    (data) => !data.starts_on || !data.ends_on || data.ends_on >= data.starts_on,
    { message: 'ends_on must be on or after starts_on.' },
  );
export type KodaSpecialCreate = z.infer<typeof KodaSpecialCreateSchema>;

export const KodaSpecialUpdateSchema = z.object({
  title: z.string().trim().min(1).max(120).optional(),
  description: z.string().trim().max(1000).optional(),
  starts_on: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  ends_on: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  is_active: z.boolean().optional(),
});
export type KodaSpecialUpdate = z.infer<typeof KodaSpecialUpdateSchema>;
