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
let buranchiBronzeTierId: string;

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
    .insert({ slug: 'phase5-test-' + Date.now(), name: 'Phase 5 Test Org' } as never)
    .select('id').single();
  otherOrgId = o!.id;

  const ts = Date.now();
  const a = await makeUser(`p5-admin-${ts}@test.local`, buranchiOrgId, 'admin');
  buranchiAdminId = a.id; buranchiAdminClient = a.client;
  const f = await makeUser(`p5-fd-${ts}@test.local`, buranchiOrgId, 'front_desk');
  buranchiFrontDeskId = f.id; buranchiFrontDeskClient = f.client;
  const c = await makeUser(`p5-cs-${ts}@test.local`, buranchiOrgId, 'customer_service');
  buranchiCsId = c.id; buranchiCsClient = c.client;
  const oa = await makeUser(`p5-other-${ts}@test.local`, otherOrgId, 'admin');
  otherAdminId = oa.id; otherAdminClient = oa.client;

  const { data: bc } = await admin
    .from('customers')
    .insert({ organization_id: buranchiOrgId, full_name: 'P5 Customer' } as never)
    .select('id').single();
  buranchiCustomerId = bc!.id;
  const { data: oc } = await admin
    .from('customers')
    .insert({ organization_id: otherOrgId, full_name: 'Other Customer' } as never)
    .select('id').single();
  otherCustomerId = oc!.id;

  const { data: bronze } = await admin
    .from('loyalty_tiers')
    .select('id')
    .eq('organization_id', buranchiOrgId)
    .eq('tier_index', 0)
    .single();
  buranchiBronzeTierId = bronze!.id;
});

afterAll(async () => {
  await admin.from('loyalty_adjustments').delete().eq('organization_id', buranchiOrgId);
  await admin.from('loyalty_redemptions').delete().eq('organization_id', buranchiOrgId);
  await admin.from('loyalty_transactions').delete().eq('organization_id', buranchiOrgId);
  await admin.from('loyalty_rewards').delete().eq('organization_id', buranchiOrgId);
  await admin.from('loyalty_rewards').delete().eq('organization_id', otherOrgId);
  await admin.from('customers').delete().eq('id', buranchiCustomerId);
  await admin.from('customers').delete().eq('id', otherCustomerId);
  await admin.auth.admin.deleteUser(buranchiAdminId);
  await admin.auth.admin.deleteUser(buranchiFrontDeskId);
  await admin.auth.admin.deleteUser(buranchiCsId);
  await admin.auth.admin.deleteUser(otherAdminId);
  await admin.from('organizations').delete().eq('id', otherOrgId);
});

describe('Phase 5 RLS — loyalty_tiers', () => {
  test('admin can update tier name; front_desk cannot', async () => {
    const newName = 'AdminRename-' + Date.now();
    const { error: adminErr } = await buranchiAdminClient
      .from('loyalty_tiers')
      .update({ name: newName } as never)
      .eq('id', buranchiBronzeTierId);
    expect(adminErr).toBeNull();

    const fdName = 'FdRename-' + Date.now();
    await buranchiFrontDeskClient
      .from('loyalty_tiers')
      .update({ name: fdName } as never)
      .eq('id', buranchiBronzeTierId);
    const { data } = await admin
      .from('loyalty_tiers')
      .select('name')
      .eq('id', buranchiBronzeTierId)
      .single();
    expect(data?.name).toBe(newName);
  });

  test('cross-tenant: admin in org A cannot see org B tiers', async () => {
    const { data } = await buranchiAdminClient
      .from('loyalty_tiers')
      .select('id')
      .eq('organization_id', otherOrgId);
    expect(data).toHaveLength(0);
    void otherAdminClient;
  });
});

describe('Phase 5 RLS — loyalty_rewards', () => {
  test('admin can insert reward; front_desk cannot', async () => {
    const adminName = 'A-' + Date.now();
    const { error: adminErr } = await buranchiAdminClient.from('loyalty_rewards').insert({
      organization_id: buranchiOrgId,
      name: adminName,
      type: 'free_item',
      points_cost: 100,
      min_tier_index: 0,
    } as never);
    expect(adminErr).toBeNull();

    const fdName = 'F-' + Date.now();
    await buranchiFrontDeskClient.from('loyalty_rewards').insert({
      organization_id: buranchiOrgId,
      name: fdName,
      type: 'free_item',
      points_cost: 100,
      min_tier_index: 0,
    } as never);
    const { data } = await admin.from('loyalty_rewards').select('id').eq('name', fdName);
    expect(data).toHaveLength(0);
  });
});

describe('Phase 5 RLS — loyalty_transactions', () => {
  test('front_desk can insert; cross-tenant blocked', async () => {
    const { error: fdErr } = await buranchiFrontDeskClient.from('loyalty_transactions').insert({
      organization_id: buranchiOrgId,
      customer_id: buranchiCustomerId,
      bill_idr: 100000,
      points_earned: 10,
      earn_rate_idr_per_point: 10000,
    } as never);
    expect(fdErr).toBeNull();

    const { error: xErr } = await buranchiFrontDeskClient.from('loyalty_transactions').insert({
      organization_id: otherOrgId,
      customer_id: otherCustomerId,
      bill_idr: 100000,
      points_earned: 10,
      earn_rate_idr_per_point: 10000,
    } as never);
    void xErr;
    const { data: leak } = await admin
      .from('loyalty_transactions')
      .select('id')
      .eq('customer_id', otherCustomerId);
    expect(leak ?? []).toHaveLength(0);
  });
});

describe('Phase 5 RLS — loyalty_redemptions', () => {
  test('front_desk can insert applied; can flip to voided; cannot flip back', async () => {
    const { data: red } = await buranchiFrontDeskClient
      .from('loyalty_redemptions')
      .insert({
        organization_id: buranchiOrgId,
        customer_id: buranchiCustomerId,
        reward_name: 'TestReward',
        reward_type: 'free_item',
        points_spent: 50,
        status: 'applied',
      } as never)
      .select('id')
      .single();
    expect(red?.id).toBeDefined();

    const { error: voidErr } = await buranchiFrontDeskClient
      .from('loyalty_redemptions')
      .update({
        status: 'voided',
        voided_at: new Date().toISOString(),
        voided_reason: 'test',
      } as never)
      .eq('id', red!.id);
    expect(voidErr).toBeNull();

    await buranchiFrontDeskClient
      .from('loyalty_redemptions')
      .update({ status: 'applied' } as never)
      .eq('id', red!.id);
    const { data: still } = await admin
      .from('loyalty_redemptions')
      .select('status')
      .eq('id', red!.id)
      .single();
    expect(still?.status).toBe('voided');
  });
});

describe('Phase 5 RLS — loyalty_adjustments', () => {
  test('admin can insert; front_desk cannot', async () => {
    const reasonAdmin = 'admin-adj-' + Date.now();
    const { error: adminErr } = await buranchiAdminClient.from('loyalty_adjustments').insert({
      organization_id: buranchiOrgId,
      customer_id: buranchiCustomerId,
      delta_points: 50,
      reason: reasonAdmin,
    } as never);
    expect(adminErr).toBeNull();

    const reasonFd = 'fd-adj-' + Date.now();
    await buranchiFrontDeskClient.from('loyalty_adjustments').insert({
      organization_id: buranchiOrgId,
      customer_id: buranchiCustomerId,
      delta_points: 50,
      reason: reasonFd,
    } as never);
    const { data } = await admin.from('loyalty_adjustments').select('id').eq('reason', reasonFd);
    expect(data).toHaveLength(0);
    void buranchiCsClient;
  });
});
