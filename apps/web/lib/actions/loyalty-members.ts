'use server';

import { revalidatePath } from 'next/cache';
import { requireRole } from '@/lib/auth/server';
import { createServerClient } from '@/lib/supabase/server';
import { ActionError } from '@/lib/auth/errors';

export async function enrollMemberAction(customerId: string) {
  const profile = await requireRole(['admin', 'front_desk']);
  if (!customerId) throw new ActionError('NOT_FOUND', 'customer_id required');
  const supabase = await createServerClient();

  const { data: bronze } = await supabase
    .from('loyalty_tiers')
    .select('id')
    .eq('organization_id', profile.organization_id)
    .eq('tier_index', 0)
    .single();
  if (!bronze) throw new ActionError('NO_TIERS', 'Tiers not seeded for this org.');

  const { data, error } = await supabase
    .from('customers')
    .update({
      is_member: true,
      member_since: new Date().toISOString(),
      current_tier_id: (bronze as { id: string }).id,
    } as never)
    .eq('id', customerId)
    .eq('organization_id', profile.organization_id)
    .select('id');
  if (error) throw new ActionError(error.code ?? 'DB', error.message);
  if (!data || data.length === 0) throw new ActionError('NOT_UPDATED', 'Customer not found or RLS-blocked.');

  revalidatePath(`/customers/${customerId}`);
  return { ok: true as const };
}

export async function unenrollMemberAction(customerId: string) {
  const profile = await requireRole(['admin']);
  const supabase = await createServerClient();

  const { error } = await supabase
    .from('customers')
    .update({
      is_member: false,
      current_tier_id: null,
    } as never)
    .eq('id', customerId)
    .eq('organization_id', profile.organization_id);
  if (error) throw new ActionError(error.code ?? 'DB', error.message);

  revalidatePath(`/customers/${customerId}`);
  return { ok: true as const };
}
