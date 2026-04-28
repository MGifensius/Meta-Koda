import { z } from 'zod';
import { UserRoleSchema } from '../enums/role';

export const ProfileSelfUpdateSchema = z.object({
  full_name: z.string().trim().min(1).max(120),
  avatar_url: z.string().url().optional().or(z.literal('').transform(() => undefined)),
});

export type ProfileSelfUpdate = z.infer<typeof ProfileSelfUpdateSchema>;

export const ProfileAdminUpdateSchema = z.object({
  full_name: z.string().trim().min(1).max(120),
  role: UserRoleSchema,
  status: z.enum(['active', 'suspended']),
});

export type ProfileAdminUpdate = z.infer<typeof ProfileAdminUpdateSchema>;
