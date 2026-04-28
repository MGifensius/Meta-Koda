'use server';

import { revalidatePath } from 'next/cache';
import { OrganizationUpdateSchema } from '@buranchi/shared';
import { requireRole } from '@/lib/auth/server';
import { createServerClient } from '@/lib/supabase/server';
import { ActionError } from '@/lib/auth/errors';

export async function updateOrganizationAction(input: unknown) {
  const profile = await requireRole(['admin']);
  const parsed = OrganizationUpdateSchema.parse(input);
  const supabase = await createServerClient();
  const { error } = await supabase.from('organizations').update({
    name: parsed.name,
    timezone: parsed.timezone,
    logo_url: parsed.logo_url ?? null,
  } as never).eq('id', profile.organization_id);
  if (error) throw new ActionError(error.code ?? 'DB', error.message);
  revalidatePath('/settings/organization');
  return { ok: true };
}
