'use server';

import { revalidatePath } from 'next/cache';
import {
  TableCreateSchema,
  TableUpdateSchema,
  type TableCreate,
  type TableUpdate,
  TableStatusSchema,
  type TableStatus,
  isManualTableStatus,
  computeEndsAt,
  BOOKING_RULES,
} from '@buranchi/shared';
import { requireRole } from '@/lib/auth/server';
import { createServerClient } from '@/lib/supabase/server';
import { ActionError } from '@/lib/auth/errors';

export async function createTableAction(input: unknown) {
  const profile = await requireRole(['admin']);
  const parsed = TableCreateSchema.parse(input) as TableCreate;
  const supabase = await createServerClient();
  const { data, error } = await supabase
    .from('tables')
    .insert({
      organization_id: profile.organization_id,
      code: parsed.code,
      capacity: parsed.capacity,
      floor_area: parsed.floor_area ?? null,
      is_active: parsed.is_active,
    } as never)
    .select('id')
    .single();
  if (error) {
    if (error.code === '23505' && error.message.toLowerCase().includes('code')) {
      throw new ActionError('CODE_TAKEN', 'A table with this code already exists.');
    }
    throw new ActionError(error.code ?? 'DB', error.message);
  }
  revalidatePath('/settings/tables');
  revalidatePath('/floor');
  const inserted = data as { id: string } | null;
  return { ok: true as const, id: inserted!.id };
}

export async function updateTableAction(id: string, input: unknown) {
  await requireRole(['admin']);
  const parsed = TableUpdateSchema.parse(input) as TableUpdate;
  const supabase = await createServerClient();
  const update: Record<string, unknown> = {};
  if (parsed.code !== undefined) update.code = parsed.code;
  if (parsed.capacity !== undefined) update.capacity = parsed.capacity;
  if (parsed.floor_area !== undefined) update.floor_area = parsed.floor_area ?? null;
  if (parsed.is_active !== undefined) update.is_active = parsed.is_active;
  const { error } = await supabase.from('tables').update(update as never).eq('id', id);
  if (error) {
    if (error.code === '23505') {
      throw new ActionError('CODE_TAKEN', 'A table with this code already exists.');
    }
    throw new ActionError(error.code ?? 'DB', error.message);
  }
  revalidatePath('/settings/tables');
  revalidatePath('/floor');
}

export async function setTableStatusAction(id: string, next: unknown) {
  await requireRole(['admin', 'front_desk']);
  const status = TableStatusSchema.parse(next) as TableStatus;
  if (!isManualTableStatus(status)) {
    throw new ActionError(
      'INVALID_TABLE_STATUS',
      'Only available, cleaning, and unavailable can be set manually.',
    );
  }
  const supabase = await createServerClient();
  const { error } = await supabase.from('tables').update({ status } as never).eq('id', id);
  if (error) throw new ActionError(error.code ?? 'DB', error.message);
  revalidatePath('/floor');
}

export async function deleteTableAction(id: string) {
  await requireRole(['admin']);
  const supabase = await createServerClient();
  const { error } = await supabase.from('tables').delete().eq('id', id);
  if (error) {
    if (error.code === '23503') {
      throw new ActionError(
        'TABLE_HAS_BOOKINGS',
        'Tables with bookings cannot be deleted. Set inactive instead.',
      );
    }
    throw new ActionError(error.code ?? 'DB', error.message);
  }
  revalidatePath('/settings/tables');
  revalidatePath('/floor');
}

export interface AvailableTable {
  id: string;
  code: string;
  capacity: number;
  floor_area: string | null;
}

export async function getAvailableTablesForSlot(
  startsAt: Date,
  partySize: number,
  excludeBookingId?: string,
): Promise<AvailableTable[]> {
  const profile = await requireRole(['admin', 'front_desk']);
  const endsAt = computeEndsAt(startsAt);
  const bufferedEndsAt = new Date(
    endsAt.getTime() + BOOKING_RULES.cleaningBufferMinutes * 60_000,
  );

  const supabase = await createServerClient();
  const { data: candidateTables, error: tErr } = await supabase
    .from('tables')
    .select('id, code, capacity, floor_area')
    .eq('organization_id', profile.organization_id)
    .eq('is_active', true)
    .gte('capacity', partySize)
    .order('capacity', { ascending: true })
    .order('code', { ascending: true });
  if (tErr) throw new ActionError(tErr.code ?? 'DB', tErr.message);
  const candidates = (candidateTables ?? []) as AvailableTable[];
  if (candidates.length === 0) return [];

  const candidateIds = candidates.map((t) => t.id);
  const { data: overlapping, error: bErr } = await supabase
    .from('bookings')
    .select('table_id, starts_at, ends_at, status, id')
    .in('table_id', candidateIds)
    .lt('starts_at', bufferedEndsAt.toISOString())
    .gt('ends_at', startsAt.toISOString())
    .not('status', 'in', '(cancelled,no_show,completed)');
  if (bErr) throw new ActionError(bErr.code ?? 'DB', bErr.message);

  const blockedTableIds = new Set(
    (overlapping ?? [])
      .filter((b) => !excludeBookingId || (b as { id: string }).id !== excludeBookingId)
      .map((b) => (b as { table_id: string }).table_id),
  );
  return candidates.filter((t) => !blockedTableIds.has(t.id));
}
