'use server';

import { redirect } from 'next/navigation';
import { z } from 'zod';
import { createServerClient } from '@/lib/supabase/server';

const AcceptInviteSchema = z.object({
  password: z.string().min(8, 'Password must be at least 8 characters'),
  password_confirm: z.string(),
}).refine((d) => d.password === d.password_confirm, {
  message: 'Passwords do not match',
  path: ['password_confirm'],
});

export async function acceptInviteAction(_prev: { error?: string } | undefined, formData: FormData) {
  const parsed = AcceptInviteSchema.safeParse({
    password: formData.get('password'),
    password_confirm: formData.get('password_confirm'),
  });
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? 'Invalid input' };

  const supabase = await createServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: 'Invite link expired. Ask your admin to re-send.' };

  const { error } = await supabase.auth.updateUser({ password: parsed.data.password });
  if (error) return { error: error.message };

  redirect('/dashboard');
}
