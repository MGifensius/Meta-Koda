'use server';

import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { OrganizationUpdateSchema } from '@buranchi/shared';
import { requireRole } from '@/lib/auth/server';
import { createServerClient } from '@/lib/supabase/server';
import { ActionError } from '@/lib/auth/errors';
import { errorToResult, type ActionResult } from '@/lib/actions/result';

export async function updateOrganizationAction(input: unknown): Promise<ActionResult<null>> {
  try {
    const profile = await requireRole(['admin']);
    const parsed = OrganizationUpdateSchema.parse(input);
    const supabase = await createServerClient();
    // logo_url is intentionally NOT updated here — it's owned by
    // updateOrgLogoAction. Including it would clobber the path the upload flow
    // just stored.
    const { error } = await supabase
      .from('organizations')
      .update({
        name: parsed.name,
        timezone: parsed.timezone,
        address: parsed.address ?? null,
        operating_hours: parsed.operating_hours ?? null,
      } as never)
      .eq('id', profile.organization_id);
    if (error) throw new ActionError(error.code ?? 'DB', error.message);
    revalidatePath('/settings/organization');
    return { ok: true, data: null };
  } catch (err) {
    return errorToResult(err);
  }
}

// Storage path within the org-logos bucket — e.g. "<org_id>/logo-123.png".
// Bucket is private; render via signed URL.
const LogoPathSchema = z.string().trim().min(1).max(500).nullable();

export async function updateOrgLogoAction(logoPath: string | null): Promise<ActionResult<null>> {
  try {
    const profile = await requireRole(['admin']);
    const parsed = LogoPathSchema.parse(logoPath);
    const supabase = await createServerClient();
    const { error } = await supabase
      .from('organizations')
      .update({ logo_url: parsed } as never)
      .eq('id', profile.organization_id);
    if (error) throw new ActionError(error.code ?? 'DB', error.message);
    revalidatePath('/settings/organization');
    return { ok: true, data: null };
  } catch (err) {
    return errorToResult(err);
  }
}
