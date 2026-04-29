import { afterAll, beforeAll, describe, expect, test } from 'vitest';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import 'dotenv/config';

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!;

let admin: SupabaseClient;
let buranchiOrgId: string;
let otherOrgId: string;
let buranchiAdminId: string;
let buranchiFrontDeskId: string;
let buranchiCsId: string;
let otherAdminId: string;
let buranchiAdminClient: SupabaseClient;
let buranchiFrontDeskClient: SupabaseClient;
let buranchiCsClient: SupabaseClient;
let otherAdminClient: SupabaseClient;
let buranchiCustomerId: string;
let otherCustomerId: string;
let buranchiConvoId: string;

async function makeUser(
  email: string,
  orgId: string,
  role: 'admin' | 'front_desk' | 'customer_service',
): Promise<{ id: string; client: SupabaseClient }> {
  const { data: created, error: createErr } = await admin.auth.admin.createUser({
    email,
    password: 'test-password-123',
    email_confirm: true,
    user_metadata: { organization_id: orgId, full_name: email.split('@')[0], role },
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
  const { data: b } = await admin
    .from('organizations').select('id').eq('slug', 'buranchi').single();
  buranchiOrgId = b!.id;
  const { data: o } = await admin
    .from('organizations')
    .insert({ slug: 'phase4-test-' + Date.now(), name: 'Phase 4 Test Org' } as never)
    .select('id').single();
  otherOrgId = o!.id;

  const ts = Date.now();
  const a = await makeUser(`p4-admin-${ts}@test.local`, buranchiOrgId, 'admin');
  buranchiAdminId = a.id; buranchiAdminClient = a.client;
  const f = await makeUser(`p4-fd-${ts}@test.local`, buranchiOrgId, 'front_desk');
  buranchiFrontDeskId = f.id; buranchiFrontDeskClient = f.client;
  const c = await makeUser(`p4-cs-${ts}@test.local`, buranchiOrgId, 'customer_service');
  buranchiCsId = c.id; buranchiCsClient = c.client;
  const oa = await makeUser(`p4-other-${ts}@test.local`, otherOrgId, 'admin');
  otherAdminId = oa.id; otherAdminClient = oa.client;

  const { data: bc } = await admin
    .from('customers')
    .insert({ organization_id: buranchiOrgId, full_name: 'P4 Customer' } as never)
    .select('id').single();
  buranchiCustomerId = bc!.id;
  const { data: oc } = await admin
    .from('customers')
    .insert({ organization_id: otherOrgId, full_name: 'Other Customer' } as never)
    .select('id').single();
  otherCustomerId = oc!.id;

  const { data: convo } = await admin
    .from('koda_conversations')
    .insert({ organization_id: buranchiOrgId, customer_id: buranchiCustomerId, channel: 'simulator' } as never)
    .select('id').single();
  buranchiConvoId = convo!.id;
});

afterAll(async () => {
  await admin.from('customer_notes').delete().eq('organization_id', buranchiOrgId);
  await admin.from('customer_notes').delete().eq('organization_id', otherOrgId);
  await admin.from('koda_messages').delete().eq('conversation_id', buranchiConvoId);
  await admin.from('koda_conversations').delete().eq('organization_id', buranchiOrgId);
  await admin.from('koda_conversations').delete().eq('organization_id', otherOrgId);
  await admin.from('koda_faq').delete().eq('organization_id', buranchiOrgId);
  await admin.from('koda_faq').delete().eq('organization_id', otherOrgId);
  await admin.from('koda_specials').delete().eq('organization_id', buranchiOrgId);
  await admin.from('koda_specials').delete().eq('organization_id', otherOrgId);
  await admin.from('customers').delete().eq('id', buranchiCustomerId);
  await admin.from('customers').delete().eq('id', otherCustomerId);
  await admin.auth.admin.deleteUser(buranchiAdminId);
  await admin.auth.admin.deleteUser(buranchiFrontDeskId);
  await admin.auth.admin.deleteUser(buranchiCsId);
  await admin.auth.admin.deleteUser(otherAdminId);
  await admin.from('organizations').delete().eq('id', otherOrgId);
});

describe('Phase 4 RLS — koda_faq', () => {
  test('admin can insert FAQ; front_desk cannot', async () => {
    const adminQ = 'AD-Q-' + Date.now();
    const { error: adminErr } = await buranchiAdminClient.from('koda_faq')
      .insert({ organization_id: buranchiOrgId, question: adminQ, answer: 'A1' } as never);
    expect(adminErr).toBeNull();

    const fdQ = 'FD-Q-' + Date.now();
    await buranchiFrontDeskClient.from('koda_faq')
      .insert({ organization_id: buranchiOrgId, question: fdQ, answer: 'A' } as never);
    const { data } = await admin.from('koda_faq').select('id').eq('question', fdQ);
    expect(data).toHaveLength(0);
  });

  test('cross-tenant: admin in org A cannot read org B FAQ', async () => {
    await admin.from('koda_faq')
      .insert({ organization_id: otherOrgId, question: 'OtherQ', answer: 'OtherA' } as never);
    const { data } = await buranchiAdminClient.from('koda_faq').select('id').eq('question', 'OtherQ');
    expect(data).toHaveLength(0);
    void otherAdminClient;
  });
});

describe('Phase 4 RLS — koda_conversations + koda_messages', () => {
  test('front_desk can insert a conversation and messages', async () => {
    const { data: convo, error: cErr } = await buranchiFrontDeskClient.from('koda_conversations')
      .insert({ organization_id: buranchiOrgId, channel: 'simulator', customer_id: buranchiCustomerId } as never)
      .select('id').single();
    expect(cErr).toBeNull();
    expect(convo?.id).toBeDefined();

    const { error: mErr } = await buranchiFrontDeskClient.from('koda_messages')
      .insert({ conversation_id: convo!.id, role: 'user', content: 'hello' } as never);
    expect(mErr).toBeNull();
  });

  test('customer_service cannot insert a conversation', async () => {
    const sentinel = 'cs-attempt-' + Date.now();
    await buranchiCsClient.from('koda_conversations')
      .insert({ organization_id: buranchiOrgId, channel: 'simulator', escalated_reason: sentinel } as never);
    const { data } = await admin.from('koda_conversations')
      .select('id').eq('escalated_reason', sentinel);
    expect(data).toHaveLength(0);
  });

  test('cross-tenant: org A user cannot see org B koda_messages', async () => {
    const { data: otherConvo } = await admin.from('koda_conversations')
      .insert({ organization_id: otherOrgId, channel: 'simulator' } as never).select('id').single();
    await admin.from('koda_messages')
      .insert({ conversation_id: otherConvo!.id, role: 'user', content: 'cross-tenant' } as never);
    const { data: visible } = await buranchiAdminClient.from('koda_messages')
      .select('id').eq('conversation_id', otherConvo!.id);
    expect(visible).toHaveLength(0);
  });
});

describe('Phase 4 RLS — customer_notes', () => {
  test('front_desk can insert a customer note', async () => {
    const { error } = await buranchiFrontDeskClient.from('customer_notes')
      .insert({
        organization_id: buranchiOrgId, customer_id: buranchiCustomerId,
        note: 'Allergic to peanuts', source: 'staff', created_by: buranchiFrontDeskId,
      } as never);
    expect(error).toBeNull();
  });

  test('cross-tenant: org A user cannot read org B notes', async () => {
    await admin.from('customer_notes')
      .insert({ organization_id: otherOrgId, customer_id: otherCustomerId, note: 'cross', source: 'staff' } as never);
    const { data } = await buranchiAdminClient.from('customer_notes')
      .select('id').eq('organization_id', otherOrgId);
    expect(data).toHaveLength(0);
  });
});
