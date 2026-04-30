'use server';

import { revalidatePath } from 'next/cache';
import {
  AdjustPointsSchema,
  VoidRedemptionSchema,
  RedeemRewardSchema,
} from '@buranchi/shared';
import { requireRole } from '@/lib/auth/server';
import { createServerClient } from '@/lib/supabase/server';
import { ActionError } from '@/lib/auth/errors';
import { deriveTier, type Tier } from '@/lib/loyalty/tier';
import { errorToResult, type ActionResult } from '@/lib/actions/result';

interface CustomerRow {
  id: string;
  organization_id: string;
  is_member: boolean;
  points_balance: number;
  points_lifetime: number;
  current_tier_id: string | null;
}

export async function redeemRewardAction(input: unknown): Promise<ActionResult<null>> {
  try {
  const profile = await requireRole(['admin', 'front_desk']);
  const parsed = RedeemRewardSchema.parse(input);
  const supabase = await createServerClient();

  const { data: bk } = await supabase
    .from('bookings')
    .select('id, organization_id, customer_id, status')
    .eq('id', parsed.booking_id)
    .single();
  if (!bk) throw new ActionError('NOT_FOUND', 'Booking not found.');
  if ((bk as { organization_id: string }).organization_id !== profile.organization_id) {
    throw new ActionError('FORBIDDEN', 'Cross-tenant booking access.');
  }
  if (!['confirmed', 'seated'].includes((bk as { status: string }).status)) {
    throw new ActionError('BAD_STATE', 'Booking must be confirmed or seated.');
  }

  const { data: customer } = await supabase
    .from('customers')
    .select('id, organization_id, is_member, points_balance, points_lifetime, current_tier_id')
    .eq('id', (bk as { customer_id: string }).customer_id)
    .single();
  const cust = customer as CustomerRow | null;
  if (!cust || !cust.is_member) throw new ActionError('NOT_MEMBER', 'Customer is not a member.');

  const { data: reward } = await supabase
    .from('loyalty_rewards')
    .select('id, organization_id, name, type, type_value, points_cost, min_tier_index, is_active')
    .eq('id', parsed.reward_id)
    .single();
  const rw = reward as
    | {
        organization_id: string;
        name: string;
        type: 'free_item' | 'percent_discount' | 'rupiah_discount';
        type_value: number;
        points_cost: number;
        min_tier_index: number;
        is_active: boolean;
      }
    | null;
  if (!rw) throw new ActionError('NOT_FOUND', 'Reward not found.');
  if (rw.organization_id !== profile.organization_id) throw new ActionError('FORBIDDEN', 'Cross-tenant reward.');
  if (!rw.is_active) throw new ActionError('REWARD_INACTIVE', 'Reward is inactive.');

  const { data: customerTier } = cust.current_tier_id
    ? await supabase.from('loyalty_tiers').select('tier_index').eq('id', cust.current_tier_id).single()
    : { data: null };
  const customerTierIndex = (customerTier as { tier_index: number } | null)?.tier_index ?? 0;
  if (customerTierIndex < rw.min_tier_index) {
    throw new ActionError('REWARD_TIER_LOCKED', `${rw.name} requires a higher tier.`);
  }

  if (rw.points_cost > cust.points_balance) {
    throw new ActionError('INSUFFICIENT_BALANCE', 'Not enough points.');
  }

  const { error: insErr } = await supabase.from('loyalty_redemptions').insert({
    organization_id: profile.organization_id,
    customer_id: cust.id,
    reward_id: parsed.reward_id,
    reward_name: rw.name,
    reward_type: rw.type,
    reward_type_value: rw.type_value,
    points_spent: rw.points_cost,
    booking_id: parsed.booking_id,
    status: 'applied',
    created_by: profile.id,
  } as never);
  if (insErr) throw new ActionError(insErr.code ?? 'DB', insErr.message);

  const { error: updErr } = await supabase
    .from('customers')
    .update({ points_balance: cust.points_balance - rw.points_cost } as never)
    .eq('id', cust.id);
  if (updErr) throw new ActionError(updErr.code ?? 'DB', updErr.message);

  revalidatePath(`/bookings/${parsed.booking_id}`);
  revalidatePath(`/customers/${cust.id}`);
  return { ok: true, data: null };
  } catch (err) {
    return errorToResult(err);
  }
}

export async function voidRedemptionAction(input: unknown): Promise<ActionResult<null>> {
  try {
  const profile = await requireRole(['admin', 'front_desk']);
  const parsed = VoidRedemptionSchema.parse(input);
  const supabase = await createServerClient();

  const { data: red } = await supabase
    .from('loyalty_redemptions')
    .select('id, organization_id, customer_id, points_spent, status')
    .eq('id', parsed.redemption_id)
    .single();
  const r = red as
    | { id: string; organization_id: string; customer_id: string; points_spent: number; status: string }
    | null;
  if (!r) throw new ActionError('NOT_FOUND', 'Redemption not found.');
  if (r.organization_id !== profile.organization_id) throw new ActionError('FORBIDDEN', 'Cross-tenant.');
  if (r.status !== 'applied') throw new ActionError('BAD_STATE', 'Only applied redemptions can be voided.');

  const { error: voidErr } = await supabase
    .from('loyalty_redemptions')
    .update({
      status: 'voided',
      voided_at: new Date().toISOString(),
      voided_reason: parsed.reason,
    } as never)
    .eq('id', r.id);
  if (voidErr) throw new ActionError(voidErr.code ?? 'DB', voidErr.message);

  const { data: cust } = await supabase
    .from('customers')
    .select('points_balance')
    .eq('id', r.customer_id)
    .single();
  await supabase
    .from('customers')
    .update({
      points_balance: ((cust as { points_balance: number } | null)?.points_balance ?? 0) + r.points_spent,
    } as never)
    .eq('id', r.customer_id);

  revalidatePath(`/customers/${r.customer_id}`);
  return { ok: true, data: null };
  } catch (err) {
    return errorToResult(err);
  }
}

export async function adjustPointsAction(input: unknown): Promise<ActionResult<null>> {
  try {
  const profile = await requireRole(['admin']);
  const parsed = AdjustPointsSchema.parse(input);
  const supabase = await createServerClient();

  const { data: cust } = await supabase
    .from('customers')
    .select('id, organization_id, points_balance, points_lifetime, current_tier_id')
    .eq('id', parsed.customer_id)
    .single();
  const c = cust as CustomerRow | null;
  if (!c || c.organization_id !== profile.organization_id) {
    throw new ActionError('NOT_FOUND', 'Customer not in this org.');
  }
  const newBalance = c.points_balance + parsed.delta_points;
  if (newBalance < 0) throw new ActionError('NEGATIVE_BALANCE', 'Resulting balance cannot be negative.');

  const { error: insErr } = await supabase.from('loyalty_adjustments').insert({
    organization_id: profile.organization_id,
    customer_id: c.id,
    delta_points: parsed.delta_points,
    reason: parsed.reason,
    affects_lifetime: parsed.affects_lifetime,
    created_by: profile.id,
  } as never);
  if (insErr) throw new ActionError(insErr.code ?? 'DB', insErr.message);

  let newLifetime = c.points_lifetime;
  let newTierId = c.current_tier_id;
  if (parsed.affects_lifetime) {
    newLifetime = Math.max(0, c.points_lifetime + parsed.delta_points);
    const { data: tiers } = await supabase
      .from('loyalty_tiers')
      .select('id, tier_index, name, min_points_lifetime, perks_text')
      .eq('organization_id', profile.organization_id);
    if (tiers && tiers.length > 0) {
      newTierId = deriveTier(newLifetime, tiers as unknown as Tier[]).id;
    }
  }

  const { error: updErr } = await supabase
    .from('customers')
    .update({
      points_balance: newBalance,
      points_lifetime: newLifetime,
      current_tier_id: newTierId,
    } as never)
    .eq('id', c.id);
  if (updErr) throw new ActionError(updErr.code ?? 'DB', updErr.message);

  revalidatePath(`/customers/${c.id}`);
  return { ok: true, data: null };
  } catch (err) {
    return errorToResult(err);
  }
}
