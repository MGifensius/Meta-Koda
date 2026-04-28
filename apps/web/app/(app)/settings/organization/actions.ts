'use server';

import { revalidatePath } from 'next/cache';
import { z } from 'zod';
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
    address: parsed.address ?? null,
    operating_hours: parsed.operating_hours ?? null,
    logo_url: parsed.logo_url ?? null,
  } as never).eq('id', profile.organization_id);
  if (error) throw new ActionError(error.code ?? 'DB', error.message);
  revalidatePath('/settings/organization');
  return { ok: true };
}

const LogoUrlSchema = z.string().url().nullable();

export async function updateOrgLogoAction(logoUrl: string | null) {
  const profile = await requireRole(['admin']);
  const parsed = LogoUrlSchema.parse(logoUrl);
  const supabase = await createServerClient();
  const { error } = await supabase.from('organizations')
    .update({ logo_url: parsed } as never)
    .eq('id', profile.organization_id);
  if (error) throw new ActionError(error.code ?? 'DB', error.message);
  revalidatePath('/settings/organization');
  return { ok: true };
}
