'use server';

import { revalidatePath } from 'next/cache';
import { RewardCreateSchema, RewardUpdateSchema } from '@buranchi/shared';
import { requireRole } from '@/lib/auth/server';
import { createServerClient } from '@/lib/supabase/server';
import { ActionError } from '@/lib/auth/errors';

export async function createRewardAction(input: unknown) {
  const profile = await requireRole(['admin']);
  const parsed = RewardCreateSchema.parse(input);
  const supabase = await createServerClient();
  const { error } = await supabase.from('loyalty_rewards').insert({
    organization_id: profile.organization_id,
    name: parsed.name,
    description: parsed.description ?? null,
    type: parsed.type,
    type_value: parsed.type_value,
    points_cost: parsed.points_cost,
    min_tier_index: parsed.min_tier_index,
    is_active: parsed.is_active,
    sort_order: parsed.sort_order,
  } as never);
  if (error) throw new ActionError(error.code ?? 'DB', error.message);
  revalidatePath('/settings/loyalty');
}

export async function updateRewardAction(id: string, input: unknown) {
  await requireRole(['admin']);
  const parsed = RewardUpdateSchema.parse(input);
  const supabase = await createServerClient();
  const update: Record<string, unknown> = {};
  if (parsed.name !== undefined) update.name = parsed.name;
  if (parsed.description !== undefined) update.description = parsed.description ?? null;
  if (parsed.type !== undefined) update.type = parsed.type;
  if (parsed.type_value !== undefined) update.type_value = parsed.type_value;
  if (parsed.points_cost !== undefined) update.points_cost = parsed.points_cost;
  if (parsed.min_tier_index !== undefined) update.min_tier_index = parsed.min_tier_index;
  if (parsed.is_active !== undefined) update.is_active = parsed.is_active;
  if (parsed.sort_order !== undefined) update.sort_order = parsed.sort_order;

  const { error } = await supabase.from('loyalty_rewards').update(update as never).eq('id', id);
  if (error) throw new ActionError(error.code ?? 'DB', error.message);
  revalidatePath('/settings/loyalty');
}

export async function deleteRewardAction(id: string) {
  await requireRole(['admin']);
  const supabase = await createServerClient();
  const { error } = await supabase.from('loyalty_rewards').delete().eq('id', id);
  if (error) throw new ActionError(error.code ?? 'DB', error.message);
  revalidatePath('/settings/loyalty');
}
