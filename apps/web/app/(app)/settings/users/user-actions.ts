'use server';

import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { UserRoleSchema } from '@buranchi/shared';
import { requireRole } from '@/lib/auth/server';
import { createServerClient, createServiceRoleClient } from '@/lib/supabase/server';
import { ActionError } from '@/lib/auth/errors';

const UpdateRoleSchema = z.object({ id: z.string().uuid(), role: UserRoleSchema });
const SetStatusSchema = z.object({ id: z.string().uuid(), status: z.enum(['active', 'suspended']) });

async function activeAdminCount(orgId: string): Promise<number> {
  const admin = createServiceRoleClient();
  const { count } = await admin.from('profiles')
    .select('id', { count: 'exact', head: true })
    .eq('organization_id', orgId).eq('role', 'admin').eq('status', 'active');
  return count ?? 0;
}

export async function updateUserRoleAction(input: unknown) {
  const me = await requireRole(['admin']);
  const { id, role } = UpdateRoleSchema.parse(input);
  const supabase = await createServerClient();
  const { data: targetRow } = await supabase.from('profiles')
    .select('id, role, status').eq('id', id).single();
  const target = targetRow as { id: string; role: string; status: string } | null;
  if (!target) throw new ActionError('NOT_FOUND', 'User not found.');

  const wouldRemoveAdmin = target.role === 'admin' && role !== 'admin';
  if (wouldRemoveAdmin) {
    const remaining = await activeAdminCount(me.organization_id);
    if (remaining <= 1) throw new ActionError('LAST_ADMIN', 'You cannot remove the last admin.');
  }

  const { error } = await supabase.from('profiles').update({ role } as never).eq('id', id);
  if (error) throw new ActionError(error.code ?? 'DB', error.message);
  revalidatePath('/settings/users');
}

export async function setUserStatusAction(input: unknown) {
  const me = await requireRole(['admin']);
  const { id, status } = SetStatusSchema.parse(input);
  if (id === me.id) throw new ActionError('SELF', 'You cannot suspend yourself.');

  const supabase = await createServerClient();
  const { data: targetRow } = await supabase.from('profiles')
    .select('role, status').eq('id', id).single();
  const target = targetRow as { role: string; status: string } | null;
  if (!target) throw new ActionError('NOT_FOUND', 'User not found.');

  if (status === 'suspended' && target.role === 'admin' && target.status === 'active') {
    const remaining = await activeAdminCount(me.organization_id);
    if (remaining <= 1) throw new ActionError('LAST_ADMIN', 'You cannot suspend the last admin.');
  }

  const { error } = await supabase.from('profiles').update({ status } as never).eq('id', id);
  if (error) throw new ActionError(error.code ?? 'DB', error.message);
  revalidatePath('/settings/users');
}
