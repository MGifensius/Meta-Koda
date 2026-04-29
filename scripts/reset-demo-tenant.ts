/**
 * Wipes the demo tenant created by `pnpm seed:demo`. Use this before reseeding.
 * Removes:
 *   - organization with slug='demo' (cascades tables, customers, bookings,
 *     loyalty tiers/rewards/transactions/redemptions, koda data, etc.)
 *   - auth user `demo@metaseti.id`
 *
 * Buranchi and other tenants are untouched.
 *
 * Usage: pnpm reset:demo
 */

import { config as loadEnv } from 'dotenv';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';

loadEnv({ path: '.env.local' });

const SLUG = 'demo';
const EMAIL = 'demo@metaseti.id';

async function main() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceKey) {
    throw new Error('Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in .env.local');
  }

  const admin: SupabaseClient = createClient(url, serviceKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  // Delete org (FKs cascade to tables, customers, bookings, loyalty, koda).
  const { data: org } = await admin
    .from('organizations')
    .select('id, name')
    .eq('slug', SLUG)
    .maybeSingle();
  if (org) {
    const orgRow = org as { id: string; name: string };
    const { error } = await admin.from('organizations').delete().eq('id', orgRow.id);
    if (error) throw error;
    console.log(`Deleted org "${orgRow.name}" (${orgRow.id})`);
  } else {
    console.log(`No org with slug='${SLUG}' found.`);
  }

  // Delete the auth user separately — auth.users is not cascaded by
  // organizations FKs.
  const { data: list, error: listErr } = await admin.auth.admin.listUsers();
  if (listErr) throw listErr;
  const user = list.users.find((u) => u.email?.toLowerCase() === EMAIL.toLowerCase());
  if (user) {
    const { error } = await admin.auth.admin.deleteUser(user.id);
    if (error) throw error;
    console.log(`Deleted auth user ${EMAIL}`);
  } else {
    console.log(`No auth user with email='${EMAIL}' found.`);
  }

  console.log('');
  console.log('Reset complete. Run `pnpm seed:demo` to seed a fresh demo tenant.');
}

main().catch((err) => {
  console.error('reset:demo failed:', err);
  process.exitCode = 1;
});
