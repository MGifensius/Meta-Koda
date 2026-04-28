'use server';

import { revalidatePath } from 'next/cache';
import { InviteUserSchema } from '@buranchi/shared';
import { requireRole } from '@/lib/auth/server';
import { createServiceRoleClient } from '@/lib/supabase/server';
import { ActionError } from '@/lib/auth/errors';

export interface InviteResult {
  ok: true;
  email: string;
  link: string;
  action: 'invite' | 'recovery';
}

export async function inviteUserAction(input: unknown): Promise<InviteResult> {
  const me = await requireRole(['admin']);
  const parsed = InviteUserSchema.parse(input);
  const admin = createServiceRoleClient();

  const { data: list, error: listErr } = await admin.auth.admin.listUsers();
  if (listErr) throw new ActionError('LIST', listErr.message);
  const existing = list.users.find((u) => u.email?.toLowerCase() === parsed.email.toLowerCase());

  let action: 'invite' | 'recovery';
  let result;

  if (existing) {
    action = 'recovery';
    result = await admin.auth.admin.generateLink({
      type: 'recovery',
      email: parsed.email,
    });
  } else {
    action = 'invite';
    result = await admin.auth.admin.generateLink({
      type: 'invite',
      email: parsed.email,
      options: {
        data: {
          organization_id: me.organization_id,
          full_name: parsed.full_name,
          role: parsed.role,
        },
      },
    });
  }

  if (result.error) throw new ActionError(result.error.code ?? 'INVITE', result.error.message);
  const tokenHash = result.data?.properties?.hashed_token;
  const type = result.data?.properties?.verification_type ?? action;
  if (!tokenHash) throw new ActionError('NO_TOKEN', 'No hashed_token returned from generateLink.');

  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? 'http://localhost:3000';
  const link = `${appUrl}/api/auth/callback?token_hash=${tokenHash}&type=${type}&next=/accept-invite`;

  revalidatePath('/settings/users');
  return { ok: true, email: parsed.email, link, action };
}
