'use server';

import { revalidatePath } from 'next/cache';
import { TierUpdateSchema } from '@buranchi/shared';
import { requireRole } from '@/lib/auth/server';
import { createServerClient } from '@/lib/supabase/server';
import { ActionError } from '@/lib/auth/errors';

export async function updateTierAction(tierId: string, input: unknown) {
  const profile = await requireRole(['admin']);
  const parsed = TierUpdateSchema.parse(input);
  const supabase = await createServerClient();

  const { data: tiers } = await supabase
    .from('loyalty_tiers')
    .select('id, tier_index, min_points_lifetime')
    .eq('organization_id', profile.organization_id)
    .order('tier_index', { ascending: true });
  const rows = (tiers ?? []) as Array<{ id: string; tier_index: number; min_points_lifetime: number }>;
  const target = rows.find((t) => t.id === tierId);
  if (!target) throw new ActionError('NOT_FOUND', 'Tier not in this org.');

  if (parsed.min_points_lifetime !== undefined) {
    if (target.tier_index === 0 && parsed.min_points_lifetime !== 0) {
      throw new ActionError('INVALID_TIER_0', 'Tier 0 threshold must be 0.');
    }
    const projected = rows.map((r) =>
      r.id === tierId ? { ...r, min_points_lifetime: parsed.min_points_lifetime! } : r,
    );
    for (let i = 1; i < projected.length; i += 1) {
      if (projected[i]!.min_points_lifetime <= projected[i - 1]!.min_points_lifetime) {
        throw new ActionError('NON_MONOTONIC', 'Thresholds must be strictly increasing across tiers.');
      }
    }
  }

  const update: Record<string, unknown> = {};
  if (parsed.name !== undefined) update.name = parsed.name;
  if (parsed.min_points_lifetime !== undefined) update.min_points_lifetime = parsed.min_points_lifetime;
  if (parsed.perks_text !== undefined) update.perks_text = parsed.perks_text ?? null;

  const { error } = await supabase
    .from('loyalty_tiers')
    .update(update as never)
    .eq('id', tierId);
  if (error) throw new ActionError(error.code ?? 'DB', error.message);

  revalidatePath('/settings/loyalty');
  return { ok: true as const };
}
