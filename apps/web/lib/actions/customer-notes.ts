'use server';

import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { requireRole } from '@/lib/auth/server';
import { createServerClient } from '@/lib/supabase/server';
import { ActionError } from '@/lib/auth/errors';
import { errorToResult, type ActionResult } from '@/lib/actions/result';

const UpdateNoteSchema = z.object({ note: z.string().trim().min(1).max(500) });

export async function verifyNoteAction(id: string): Promise<ActionResult<null>> {
  try {
    const profile = await requireRole(['admin', 'front_desk']);
    const supabase = await createServerClient();
    const { error } = await supabase
      .from('customer_notes')
      .update({ verified_by: profile.id, verified_at: new Date().toISOString() } as never)
      .eq('id', id);
    if (error) throw new ActionError(error.code ?? 'DB', error.message);
    revalidatePath('/customers/notes-review');
    return { ok: true, data: null };
  } catch (err) {
    return errorToResult(err);
  }
}

export async function updateNoteAction(
  id: string,
  input: unknown,
): Promise<ActionResult<null>> {
  try {
    const profile = await requireRole(['admin', 'front_desk']);
    const parsed = UpdateNoteSchema.parse(input);
    const supabase = await createServerClient();
    const { error } = await supabase
      .from('customer_notes')
      .update({
        note: parsed.note,
        verified_by: profile.id,
        verified_at: new Date().toISOString(),
      } as never)
      .eq('id', id);
    if (error) throw new ActionError(error.code ?? 'DB', error.message);
    revalidatePath('/customers/notes-review');
    return { ok: true, data: null };
  } catch (err) {
    return errorToResult(err);
  }
}

export async function deleteNoteAction(id: string): Promise<ActionResult<null>> {
  try {
    await requireRole(['admin']);
    const supabase = await createServerClient();
    const { error } = await supabase.from('customer_notes').delete().eq('id', id);
    if (error) throw new ActionError(error.code ?? 'DB', error.message);
    revalidatePath('/customers/notes-review');
    return { ok: true, data: null };
  } catch (err) {
    return errorToResult(err);
  }
}

export async function createStaffNoteAction(
  customerId: string,
  input: unknown,
): Promise<ActionResult<null>> {
  try {
    const profile = await requireRole(['admin', 'front_desk']);
    const parsed = UpdateNoteSchema.parse(input);
    const supabase = await createServerClient();
    const { error } = await supabase.from('customer_notes').insert({
      organization_id: profile.organization_id,
      customer_id: customerId,
      note: parsed.note,
      source: 'staff',
      created_by: profile.id,
      verified_by: profile.id,
      verified_at: new Date().toISOString(),
    } as never);
    if (error) throw new ActionError(error.code ?? 'DB', error.message);
    revalidatePath(`/customers/${customerId}`);
    return { ok: true, data: null };
  } catch (err) {
    return errorToResult(err);
  }
}
