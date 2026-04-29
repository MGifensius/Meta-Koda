'use server';

import { revalidatePath } from 'next/cache';
import { z } from 'zod';
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

// Storage path within the avatars bucket — e.g. "<user_id>/avatar-123.png".
// Bucket is private; render via signed URL.
const AvatarPathSchema = z.string().trim().min(1).max(500).nullable();

export async function updateAvatarAction(avatarPath: string | null) {
  const profile = await requireProfile();
  const parsed = AvatarPathSchema.parse(avatarPath);

  const supabase = await createServerClient();
  const { error } = await supabase.from('profiles')
    .update({ avatar_url: parsed } as never)
    .eq('id', profile.id);
  if (error) throw new ActionError(error.code ?? 'DB', error.message);
  revalidatePath('/settings');
  return { ok: true };
}
