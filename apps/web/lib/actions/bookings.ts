'use server';

import { revalidatePath } from 'next/cache';
import {
  BookingCreateSchema,
  BookingUpdateSchema,
  WalkInCreateSchema,
  TransitionBookingSchema,
  type BookingCreate,
  type BookingUpdate,
  type WalkInCreate,
  type TransitionBooking,
  canTransition,
  BOOKING_RULES,
  computeEndsAt,
  type BookingStatus,
  CustomerInputSchema,
  CompleteBookingInputSchema,
} from '@buranchi/shared';
import { requireRole } from '@/lib/auth/server';
import { createServerClient } from '@/lib/supabase/server';
import { ActionError } from '@/lib/auth/errors';
import { errorToResult, type ActionResult } from '@/lib/actions/result';

function translateConflictError(code: string | undefined, message: string): ActionError {
  if (code === '23P01' || /exclusion|conflicting/i.test(message)) {
    return new ActionError(
      'BOOKING_CONFLICT',
      'This table is already booked for the requested time. Pick another table or time.',
    );
  }
  return new ActionError(code ?? 'DB', message);
}

export async function createBookingAction(
  input: unknown,
): Promise<ActionResult<{ id: string }>> {
  try {
    const profile = await requireRole(['admin', 'front_desk']);
    const parsed = BookingCreateSchema.parse(input) as BookingCreate;
    const startsAt = new Date(parsed.starts_at);
    const endsAt = computeEndsAt(startsAt);

    const minStart = new Date(Date.now() + BOOKING_RULES.minAdvanceMinutes * 60_000);
    if (startsAt < minStart) {
      throw new ActionError(
        'TOO_SOON',
        `Bookings need at least ${BOOKING_RULES.minAdvanceMinutes} minutes advance notice.`,
      );
    }
    const maxStart = new Date(Date.now() + BOOKING_RULES.maxAdvanceDays * 24 * 60 * 60 * 1000);
    if (startsAt > maxStart) {
      throw new ActionError(
        'TOO_FAR',
        `Bookings cannot be more than ${BOOKING_RULES.maxAdvanceDays} days in advance.`,
      );
    }

    const supabase = await createServerClient();
    const { data, error } = await supabase
      .from('bookings')
      .insert({
        organization_id: profile.organization_id,
        customer_id: parsed.customer_id,
        table_id: parsed.table_id,
        starts_at: startsAt.toISOString(),
        ends_at: endsAt.toISOString(),
        party_size: parsed.party_size,
        source: 'manual',
        status: 'confirmed',
        special_request: parsed.special_request ?? null,
        internal_notes: parsed.internal_notes ?? null,
        created_by: profile.id,
      } as never)
      .select('id')
      .single();
    if (error) throw translateConflictError(error.code, error.message);
    revalidatePath('/bookings');
    revalidatePath('/floor');
    const inserted = data as { id: string } | null;
    return { ok: true, data: { id: inserted!.id } };
  } catch (err) {
    return errorToResult(err);
  }
}

export async function createWalkInAction(
  input: unknown,
): Promise<ActionResult<{ id: string }>> {
  try {
    const profile = await requireRole(['admin', 'front_desk']);
    const parsed = WalkInCreateSchema.parse(input) as WalkInCreate;
    const supabase = await createServerClient();

    let customerId = parsed.customer_id;
    if (!customerId) {
      const customerInput = CustomerInputSchema.parse({
        full_name: parsed.customer_full_name,
        phone: parsed.customer_phone,
      });
      const { data: cust, error: cErr } = await supabase
        .from('customers')
        .insert({
          organization_id: profile.organization_id,
          full_name: customerInput.full_name,
          phone: customerInput.phone ?? null,
          created_by: profile.id,
        } as never)
        .select('id')
        .single();
      if (cErr) throw new ActionError(cErr.code ?? 'DB', cErr.message);
      const insertedCustomer = cust as { id: string } | null;
      customerId = insertedCustomer!.id;
    }

    const startsAt = new Date();
    const endsAt = computeEndsAt(startsAt);
    const { data, error } = await supabase
      .from('bookings')
      .insert({
        organization_id: profile.organization_id,
        customer_id: customerId,
        table_id: parsed.table_id,
        starts_at: startsAt.toISOString(),
        ends_at: endsAt.toISOString(),
        party_size: parsed.party_size,
        source: 'walk_in',
        status: 'seated',
        seated_at: startsAt.toISOString(),
        special_request: parsed.special_request ?? null,
        created_by: profile.id,
      } as never)
      .select('id')
      .single();
    if (error) throw translateConflictError(error.code, error.message);
    revalidatePath('/bookings');
    revalidatePath('/floor');
    const inserted = data as { id: string } | null;
    return { ok: true, data: { id: inserted!.id } };
  } catch (err) {
    return errorToResult(err);
  }
}

export async function updateBookingAction(
  id: string,
  input: unknown,
): Promise<ActionResult<null>> {
  try {
    await requireRole(['admin', 'front_desk']);
    const parsed = BookingUpdateSchema.parse(input) as BookingUpdate;
    const supabase = await createServerClient();

    const { data: current } = await supabase
      .from('bookings')
      .select('status, starts_at, ends_at, table_id')
      .eq('id', id)
      .single();
    const cur = current as
      | { status: BookingStatus; starts_at: string; ends_at: string; table_id: string }
      | null;
    if (!cur) throw new ActionError('NOT_FOUND', 'Booking not found.');
    if (cur.status === 'completed' || cur.status === 'cancelled' || cur.status === 'no_show') {
      throw new ActionError(
        'IMMUTABLE',
        'Completed, cancelled, and no-show bookings cannot be edited.',
      );
    }

    const update: Record<string, unknown> = {};
    if (parsed.starts_at !== undefined) {
      const nextStartsAt = new Date(parsed.starts_at);
      update.starts_at = nextStartsAt.toISOString();
      update.ends_at = computeEndsAt(nextStartsAt).toISOString();
    }
    if (parsed.party_size !== undefined) update.party_size = parsed.party_size;
    if (parsed.special_request !== undefined) update.special_request = parsed.special_request ?? null;
    if (parsed.internal_notes !== undefined) update.internal_notes = parsed.internal_notes ?? null;
    if (parsed.table_id !== undefined) {
      if (cur.status === 'seated') {
        throw new ActionError('TABLE_LOCKED', 'Cannot reassign table for a seated booking.');
      }
      update.table_id = parsed.table_id;
    }
    if (parsed.customer_id !== undefined) update.customer_id = parsed.customer_id;

    const { error } = await supabase.from('bookings').update(update as never).eq('id', id);
    if (error) throw translateConflictError(error.code, error.message);
    revalidatePath('/bookings');
    revalidatePath(`/bookings/${id}`);
    revalidatePath('/floor');
    return { ok: true, data: null };
  } catch (err) {
    return errorToResult(err);
  }
}

export async function transitionBookingAction(
  id: string,
  input: unknown,
): Promise<ActionResult<null>> {
  try {
    await requireRole(['admin', 'front_desk']);
    const parsed = TransitionBookingSchema.parse(input) as TransitionBooking;
    const supabase = await createServerClient();

    const { data: current } = await supabase.from('bookings').select('status').eq('id', id).single();
    const cur = current as { status: BookingStatus } | null;
    if (!cur) throw new ActionError('NOT_FOUND', 'Booking not found.');
    if (!canTransition(cur.status, parsed.next)) {
      throw new ActionError(
        'INVALID_TRANSITION',
        `Cannot transition from ${cur.status} to ${parsed.next}.`,
      );
    }

    const update: Record<string, unknown> = { status: parsed.next };
    const nowIso = new Date().toISOString();
    if (parsed.next === 'seated') update.seated_at = nowIso;
    if (parsed.next === 'completed') update.completed_at = nowIso;
    if (parsed.next === 'cancelled') {
      update.cancelled_at = nowIso;
      if (parsed.reason !== undefined) update.cancelled_reason = parsed.reason;

      const { data: applied } = await supabase
        .from('loyalty_redemptions')
        .select('id, customer_id, points_spent')
        .eq('booking_id', id)
        .eq('status', 'applied');
      const rows = (applied ?? []) as Array<{ id: string; customer_id: string; points_spent: number }>;
      for (const r of rows) {
        await supabase
          .from('loyalty_redemptions')
          .update({
            status: 'voided',
            voided_at: nowIso,
            voided_reason: 'booking_cancelled',
          } as never)
          .eq('id', r.id);

        const { data: c } = await supabase
          .from('customers')
          .select('points_balance')
          .eq('id', r.customer_id)
          .single();
        await supabase
          .from('customers')
          .update({
            points_balance:
              ((c as { points_balance: number } | null)?.points_balance ?? 0) + r.points_spent,
          } as never)
          .eq('id', r.customer_id);
      }
    }

    const { error } = await supabase.from('bookings').update(update as never).eq('id', id);
    if (error) throw new ActionError(error.code ?? 'DB', error.message);
    revalidatePath('/bookings');
    revalidatePath(`/bookings/${id}`);
    revalidatePath('/floor');
    return { ok: true, data: null };
  } catch (err) {
    return errorToResult(err);
  }
}

export async function completeBookingAction(
  bookingId: string,
  input: unknown,
): Promise<ActionResult<null>> {
  try {
    await requireRole(['admin', 'front_desk']);
    const parsed = CompleteBookingInputSchema.parse(input);
    const supabase = await createServerClient();

    const { data } = await supabase
      .from('bookings')
      .select(
        `
        id, organization_id, customer_id,
        customer:customers!inner(is_member),
        org:organizations!inner(loyalty_enabled)
      `,
      )
      .eq('id', bookingId)
      .single();
    const ctx = data as unknown as
      | {
          id: string;
          customer_id: string;
          customer: { is_member: boolean };
          org: { loyalty_enabled: boolean };
        }
      | null;
    if (!ctx) throw new ActionError('NOT_FOUND', 'Booking not found.');

    const useLoyalty =
      parsed.bill_idr !== undefined &&
      ctx.customer.is_member === true &&
      ctx.org.loyalty_enabled === true;

    if (!useLoyalty) {
      const inner = await transitionBookingAction(bookingId, { next: 'completed' });
      if (!inner.ok) throw new ActionError(inner.code, inner.message);
      return { ok: true, data: null };
    }

    const { error } = await supabase.rpc('complete_booking_with_loyalty', {
      p_booking_id: bookingId,
      p_bill_idr: parsed.bill_idr!,
      p_redemption_ids: parsed.reward_redemption_ids,
    } as never);
    if (error) {
      const msg = error.message ?? 'failed';
      throw new ActionError(error.code ?? 'RPC_ERROR', msg);
    }
    revalidatePath(`/bookings/${bookingId}`);
    revalidatePath('/bookings');
    revalidatePath(`/customers/${ctx.customer_id}`);
    return { ok: true, data: null };
  } catch (err) {
    return errorToResult(err);
  }
}
