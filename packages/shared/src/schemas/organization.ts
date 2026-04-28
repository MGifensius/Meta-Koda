import { z } from 'zod';

export const OrganizationUpdateSchema = z.object({
  name: z.string().trim().min(1).max(120),
  timezone: z.string().min(1).max(64),
  address: z.string().max(500).optional().or(z.literal('').transform(() => undefined)),
  operating_hours: z.string().max(500).optional().or(z.literal('').transform(() => undefined)),
  logo_url: z.string().url().optional().or(z.literal('').transform(() => undefined)),
});

export type OrganizationUpdate = z.infer<typeof OrganizationUpdateSchema>;
