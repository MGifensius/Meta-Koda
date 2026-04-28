'use server';

import { revalidatePath } from 'next/cache';
import { ProfileSelfUpdateSchema } from '@buranchi/shared';
import { requireProfile } from '@/lib/auth/server';
import { createServerClient } from '@/lib/supabase/server';
import { ActionError } from '@/lib/auth/errors';

export async function updateOwnProfileAction(input: unknown) {
  const profile = await requireProfile();
  const parsed = ProfileSelfUpdateSchema.parse(input);

  const supabase = await createServerClient();
  const { error } = await supabase.from('profiles')
    .update({
      full_name: parsed.full_name,
      avatar_url: parsed.avatar_url ?? null,
    } as never)
    .eq('id', profile.id);
  if (error) throw new ActionError(error.code ?? 'DB', error.message);
  revalidatePath('/settings');
  return { ok: true };
}
