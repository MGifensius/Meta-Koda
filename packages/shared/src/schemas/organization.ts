import { z } from 'zod';

export const OrganizationUpdateSchema = z.object({
  name: z.string().trim().min(1).max(120),
  timezone: z.string().min(1).max(64),
  logo_url: z.string().url().optional().or(z.literal('').transform(() => undefined)),
});

export type OrganizationUpdate = z.infer<typeof OrganizationUpdateSchema>;
