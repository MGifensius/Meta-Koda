import { z } from 'zod';

export const TableCreateSchema = z.object({
  code: z.string().trim().min(1).max(16),
  capacity: z.number().int().min(1).max(50),
  floor_area: z.string().max(64).optional().or(z.literal('').transform(() => undefined)),
  is_active: z.boolean().default(true),
});

export type TableCreate = z.infer<typeof TableCreateSchema>;

export const TableUpdateSchema = TableCreateSchema.partial();
export type TableUpdate = z.infer<typeof TableUpdateSchema>;
