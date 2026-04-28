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
  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? 'http://localhost:3000';
  if (!url || !serviceKey) {
    throw new Error('Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY');
  }

  const admin = createClient(url, serviceKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  const { data: org, error: orgErr } = await admin
    .from('organizations')
    .select('id, name')
    .eq('slug', 'buranchi')
    .single();
  if (orgErr || !org) {
    throw orgErr ?? new Error('Buranchi organization not found.');
  }

  // Check whether this email already has an auth user.
  const { data: list, error: listErr } = await admin.auth.admin.listUsers();
  if (listErr) throw listErr;
  const existing = list.users.find((u) => u.email?.toLowerCase() === email.toLowerCase());

  let action: 'invite' | 'recovery';
  let actionResult;

  if (existing) {
    action = 'recovery';
    console.log(`User ${email} already exists (id: ${existing.id}). Generating a recovery link.`);
    actionResult = await admin.auth.admin.generateLink({
      type: 'recovery',
      email,
    });
  } else {
    action = 'invite';
    console.log(`Inviting new admin: ${email}`);
    actionResult = await admin.auth.admin.generateLink({
      type: 'invite',
      email,
      options: {
        data: {
          organization_id: org.id,
          full_name: email.split('@')[0],
          role: 'admin',
        },
      },
    });
  }

  if (actionResult.error) throw actionResult.error;

  const props = actionResult.data?.properties;
  const tokenHash = props?.hashed_token;
  const type = props?.verification_type ?? action;
  if (!tokenHash) {
    throw new Error('No hashed_token returned from generateLink. Cannot construct direct URL.');
  }

  const directLink = `${appUrl}/api/auth/callback?token_hash=${tokenHash}&type=${type}&next=/accept-invite`;

  console.log('');
  console.log('───────────────────────────────────────────────────────────────');
  console.log(`  Action: ${action === 'invite' ? 'New admin invite' : 'Recovery (set new password)'}`);
  console.log(`  Email:  ${email}`);
  console.log('');
  console.log('  Open this link in your browser to set your password:');
  console.log('');
  console.log(`  ${directLink}`);
  console.log('───────────────────────────────────────────────────────────────');
  console.log('');
  console.log('(This link bypasses email entirely. It is single-use and expires in 24h.)');
}

main().catch((err) => {
  console.error('seed:admin failed:', err);
  process.exit(1);
});
