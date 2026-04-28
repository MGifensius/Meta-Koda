import { config as loadEnv } from 'dotenv';
import { createClient } from '@supabase/supabase-js';

loadEnv({ path: '.env.local' });

async function main() {
  const arg = process.argv.find((a) => a.startsWith('email='));
  const email = arg?.slice('email='.length);
  if (!email || !email.includes('@')) {
    console.error('Usage: pnpm seed:admin email=you@example.com');
    process.exit(1);
  }

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceKey) throw new Error('Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY');

  const admin = createClient(url, serviceKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  const { data: org, error: orgErr } = await admin
    .from('organizations').select('id, name').eq('slug', 'buranchi').single();
  if (orgErr || !org) throw orgErr ?? new Error('Buranchi organization not found. Run pnpm db:reset first.');

  const { data, error } = await admin.auth.admin.inviteUserByEmail(email, {
    data: {
      organization_id: org.id,
      full_name: email.split('@')[0],
      role: 'admin',
    },
    redirectTo: `${process.env.NEXT_PUBLIC_APP_URL ?? 'http://localhost:3000'}/api/auth/callback?next=/accept-invite`,
  });
  if (error) throw error;

  console.log(`Invite sent to ${email}.`);
  console.log(`User id: ${data.user?.id ?? '(no id returned)'}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
