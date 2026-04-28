import { z } from 'zod';

export const UserRoleSchema = z.enum(['admin', 'front_desk', 'customer_service']);
export type UserRole = z.infer<typeof UserRoleSchema>;

export const USER_ROLES: readonly UserRole[] = ['admin', 'front_desk', 'customer_service'];

export const ROLE_LABELS: Record<UserRole, string> = {
  admin: 'Admin',
  front_desk: 'Front Desk',
  customer_service: 'Customer Service',
};
