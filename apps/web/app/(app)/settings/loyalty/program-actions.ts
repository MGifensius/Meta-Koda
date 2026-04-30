'use server';

import { z } from 'zod';
import { revalidatePath } from 'next/cache';
import { requireRole } from '@/lib/auth/server';
import { createServerClient } from '@/lib/supabase/server';
import { ActionError } from '@/lib/auth/errors';
import { errorToResult, type ActionResult } from '@/lib/actions/result';

const Schema = z.object({
  loyalty_enabled: z.boolean(),
  loyalty_program_name: z.string().trim().min(1).max(60),
  loyalty_earn_rate_idr_per_point: z.number().int().positive(),
});

export async function updateOrganizationLoyaltyAction(
  input: unknown,
): Promise<ActionResult<null>> {
  try {
    const profile = await requireRole(['admin']);
    const parsed = Schema.parse(input);
    const supabase = await createServerClient();
    const { error } = await supabase
      .from('organizations')
      .update(parsed as never)
      .eq('id', profile.organization_id);
    if (error) throw new ActionError(error.code ?? 'DB', error.message);
    revalidatePath('/settings/loyalty');
    return { ok: true, data: null };
  } catch (err) {
    return errorToResult(err);
  }
}
