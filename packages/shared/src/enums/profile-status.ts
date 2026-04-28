import { z } from 'zod';

export const ProfileStatusSchema = z.enum(['active', 'suspended']);
export type ProfileStatus = z.infer<typeof ProfileStatusSchema>;
