'use server';

import { revalidatePath } from 'next/cache';
import { KodaSpecialCreateSchema, KodaSpecialUpdateSchema } from '@buranchi/shared';
import { requireRole } from '@/lib/auth/server';
import { createServerClient } from '@/lib/supabase/server';
import { ActionError } from '@/lib/auth/errors';
import { errorToResult, type ActionResult } from '@/lib/actions/result';

export async function createSpecialAction(input: unknown): Promise<ActionResult<null>> {
  try {
    const profile = await requireRole(['admin']);
    const parsed = KodaSpecialCreateSchema.parse(input);
    const supabase = await createServerClient();
    const { error } = await supabase.from('koda_specials').insert({
      organization_id: profile.organization_id,
      title: parsed.title,
      description: parsed.description ?? null,
      starts_on: parsed.starts_on ?? null,
      ends_on: parsed.ends_on ?? null,
      is_active: parsed.is_active,
    } as never);
    if (error) throw new ActionError(error.code ?? 'DB', error.message);
    revalidatePath('/settings/koda');
    return { ok: true, data: null };
  } catch (err) {
    return errorToResult(err);
  }
}

export async function updateSpecialAction(
  id: string,
  input: unknown,
): Promise<ActionResult<null>> {
  try {
    await requireRole(['admin']);
    const parsed = KodaSpecialUpdateSchema.parse(input);
    const supabase = await createServerClient();
    const { error } = await supabase
      .from('koda_specials')
      .update({
        ...(parsed.title !== undefined ? { title: parsed.title } : {}),
        ...(parsed.description !== undefined ? { description: parsed.description ?? null } : {}),
        ...(parsed.starts_on !== undefined ? { starts_on: parsed.starts_on ?? null } : {}),
        ...(parsed.ends_on !== undefined ? { ends_on: parsed.ends_on ?? null } : {}),
        ...(parsed.is_active !== undefined ? { is_active: parsed.is_active } : {}),
      } as never)
      .eq('id', id);
    if (error) throw new ActionError(error.code ?? 'DB', error.message);
    revalidatePath('/settings/koda');
    return { ok: true, data: null };
  } catch (err) {
    return errorToResult(err);
  }
}

export async function deleteSpecialAction(id: string): Promise<ActionResult<null>> {
  try {
    await requireRole(['admin']);
    const supabase = await createServerClient();
    const { error } = await supabase.from('koda_specials').delete().eq('id', id);
    if (error) throw new ActionError(error.code ?? 'DB', error.message);
    revalidatePath('/settings/koda');
    return { ok: true, data: null };
  } catch (err) {
    return errorToResult(err);
  }
}
