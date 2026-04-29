'use server';

import { revalidatePath } from 'next/cache';
import { KodaFaqCreateSchema, KodaFaqUpdateSchema } from '@buranchi/shared';
import { requireRole } from '@/lib/auth/server';
import { createServerClient } from '@/lib/supabase/server';
import { ActionError } from '@/lib/auth/errors';

export async function createFaqAction(input: unknown) {
  const profile = await requireRole(['admin']);
  const parsed = KodaFaqCreateSchema.parse(input);
  const supabase = await createServerClient();
  const { error } = await supabase.from('koda_faq').insert({
    organization_id: profile.organization_id,
    question: parsed.question,
    answer: parsed.answer,
    is_active: parsed.is_active,
    sort_order: parsed.sort_order,
  } as never);
  if (error) throw new ActionError(error.code ?? 'DB', error.message);
  revalidatePath('/settings/koda');
}

export async function updateFaqAction(id: string, input: unknown) {
  await requireRole(['admin']);
  const parsed = KodaFaqUpdateSchema.parse(input);
  const supabase = await createServerClient();
  const { error } = await supabase.from('koda_faq').update(parsed as never).eq('id', id);
  if (error) throw new ActionError(error.code ?? 'DB', error.message);
  revalidatePath('/settings/koda');
}

export async function deleteFaqAction(id: string) {
  await requireRole(['admin']);
  const supabase = await createServerClient();
  const { error } = await supabase.from('koda_faq').delete().eq('id', id);
  if (error) throw new ActionError(error.code ?? 'DB', error.message);
  revalidatePath('/settings/koda');
}

export async function reorderFaqAction(orderedIds: string[]) {
  await requireRole(['admin']);
  const supabase = await createServerClient();
  for (let i = 0; i < orderedIds.length; i += 1) {
    await supabase.from('koda_faq').update({ sort_order: i } as never).eq('id', orderedIds[i]!);
  }
  revalidatePath('/settings/koda');
}
