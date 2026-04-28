import { z } from 'zod';
import { UserRoleSchema } from '../enums/role';

export const InviteUserSchema = z.object({
  email: z.string().email(),
  full_name: z.string().trim().min(1).max(120),
  role: UserRoleSchema,
});

export type InviteUser = z.infer<typeof InviteUserSchema>;
