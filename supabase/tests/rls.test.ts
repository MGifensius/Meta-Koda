import { afterAll, beforeAll, describe, expect, test } from 'vitest';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import 'dotenv/config';

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!;

let admin: SupabaseClient;
let buranchiOrgId: string;
let otherOrgId: string;
let buranchiUserId: string;
let otherUserId: string;
let buranchiClient: SupabaseClient;
let otherClient: SupabaseClient;

async function makeUser(
  email: string,
  organizationId: string,
  role: 'admin' | 'front_desk' | 'customer_service',
): Promise<{ id: string; client: SupabaseClient }> {
  const { data: created, error: createErr } = await admin.auth.admin.createUser({
    email,
    password: 'test-password-123',
    email_confirm: true,
    user_metadata: {
      organization_id: organizationId,
      full_name: email.split('@')[0],
      role,
    },
  });
  if (createErr || !created.user) throw createErr ?? new Error('user not created');

  const userClient = createClient(SUPABASE_URL, ANON_KEY);
  const { error: signInErr } = await userClient.auth.signInWithPassword({
    email,
    password: 'test-password-123',
  });
  if (signInErr) throw signInErr;

  return { id: created.user.id, client: userClient };
}

beforeAll(async () => {
  admin = createClient(SUPABASE_URL, SERVICE_KEY, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  // buranchi org already exists from seed
  const { data: buranchi } = await admin
    .from('organizations').select('id').eq('slug', 'buranchi').single();
  buranchiOrgId = buranchi!.id;

  // create a second org for cross-tenant tests
  const { data: other } = await admin
    .from('organizations').insert({ slug: 'rls-test-' + Date.now(), name: 'RLS Test Org' })
    .select('id').single();
  otherOrgId = other!.id;

  const buranchiUser = await makeUser(`buranchi-rlstest-${Date.now()}@test.local`, buranchiOrgId, 'admin');
  buranchiUserId = buranchiUser.id;
  buranchiClient = buranchiUser.client;

  const otherUser = await makeUser(`other-rlstest-${Date.now()}@test.local`, otherOrgId, 'admin');
  otherUserId = otherUser.id;
  otherClient = otherUser.client;
});

afterAll(async () => {
  await admin.auth.admin.deleteUser(buranchiUserId).catch(() => {});
  await admin.auth.admin.deleteUser(otherUserId).catch(() => {});
  await admin.from('organizations').delete().eq('id', otherOrgId);
});

describe('RLS isolation', () => {
  test('user sees only their own organization', async () => {
    const { data, error } = await buranchiClient.from('organizations').select('id, slug');
    expect(error).toBeNull();
    expect(data).toHaveLength(1);
    expect(data![0]!.slug).toBe('buranchi');
  });

  test('user cannot see other org customers', async () => {
    const { data: created } = await admin.from('customers').insert({
      organization_id: otherOrgId, full_name: 'Other Org Cust',
    }).select('id').single();

    const { data: visible } = await buranchiClient.from('customers').select('id');
    expect(visible).not.toContainEqual(expect.objectContaining({ id: created!.id }));

    await admin.from('customers').delete().eq('id', created!.id);
  });

  test('two orgs can have customers with the same phone', async () => {
    const { error: e1 } = await buranchiClient.from('customers').insert({
      organization_id: buranchiOrgId, full_name: 'A', phone: '+6281200000001',
    });
    const { error: e2 } = await otherClient.from('customers').insert({
      organization_id: otherOrgId, full_name: 'B', phone: '+6281200000001',
    });
    expect(e1).toBeNull();
    expect(e2).toBeNull();

    await admin.from('customers').delete().eq('phone', '+6281200000001');
  });

  test('non-admin cannot delete a customer', async () => {
    const { id: frontDeskId, client: frontDesk } = await makeUser(
      `fd-rlstest-${Date.now()}@test.local`, buranchiOrgId, 'front_desk',
    );
    try {
      const { data: c } = await frontDesk.from('customers').insert({
        organization_id: buranchiOrgId, full_name: 'To Delete',
      }).select('id').single();

      const { error } = await frontDesk.from('customers').delete().eq('id', c!.id);
      void error; // RLS denial returns no error but zero affected rows; verify row still present
      const { data: still } = await admin.from('customers').select('id').eq('id', c!.id);
      expect(still).toHaveLength(1);

      await admin.from('customers').delete().eq('id', c!.id);
    } finally {
      await admin.auth.admin.deleteUser(frontDeskId).catch(() => {});
    }
  });
});
