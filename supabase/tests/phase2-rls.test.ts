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
let buranchiCustomerServiceId: string;
let otherAdminId: string;
let buranchiAdminClient: SupabaseClient;
let buranchiFrontDeskClient: SupabaseClient;
let buranchiCustomerServiceClient: SupabaseClient;
let otherAdminClient: SupabaseClient;
let buranchiCustomerId: string;
let otherCustomerId: string;
let buranchiTableId: string;
let otherTableId: string;

async function makeUser(
  email: string,
  organizationId: string,
  role: 'admin' | 'front_desk' | 'customer_service',
): Promise<{ id: string; client: SupabaseClient }> {
  const { data: created, error: createErr } = await admin.auth.admin.createUser({
    email,
    password: 'test-password-123',
    email_confirm: true,
    user_metadata: { organization_id: organizationId, full_name: email.split('@')[0], role },
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

  const { data: buranchi } = await admin
    .from('organizations').select('id').eq('slug', 'buranchi').single();
  buranchiOrgId = buranchi!.id;

  const { data: other } = await admin
    .from('organizations')
    .insert({ slug: 'phase2-test-' + Date.now(), name: 'Phase 2 Test Org' } as never)
    .select('id').single();
  otherOrgId = other!.id;

  const ts = Date.now();
  const a = await makeUser(`buranchi-admin-${ts}@test.local`, buranchiOrgId, 'admin');
  buranchiAdminId = a.id; buranchiAdminClient = a.client;
  const f = await makeUser(`buranchi-fd-${ts}@test.local`, buranchiOrgId, 'front_desk');
  buranchiFrontDeskId = f.id; buranchiFrontDeskClient = f.client;
  const c = await makeUser(`buranchi-cs-${ts}@test.local`, buranchiOrgId, 'customer_service');
  buranchiCustomerServiceId = c.id; buranchiCustomerServiceClient = c.client;
  const o = await makeUser(`other-admin-${ts}@test.local`, otherOrgId, 'admin');
  otherAdminId = o.id; otherAdminClient = o.client;

  const { data: bc } = await admin
    .from('customers')
    .insert({ organization_id: buranchiOrgId, full_name: 'Buranchi Test Customer' } as never)
    .select('id').single();
  buranchiCustomerId = bc!.id;
  const { data: oc } = await admin
    .from('customers')
    .insert({ organization_id: otherOrgId, full_name: 'Other Test Customer' } as never)
    .select('id').single();
  otherCustomerId = oc!.id;

  const { data: bt } = await admin
    .from('tables')
    .insert({ organization_id: buranchiOrgId, code: 'BT' + ts, capacity: 4 } as never)
    .select('id').single();
  buranchiTableId = bt!.id;
  const { data: ot } = await admin
    .from('tables')
    .insert({ organization_id: otherOrgId, code: 'OT' + ts, capacity: 4 } as never)
    .select('id').single();
  otherTableId = ot!.id;
});

afterAll(async () => {
  await admin.from('bookings').delete().eq('organization_id', buranchiOrgId).eq('special_request', '__test__');
  await admin.from('bookings').delete().eq('organization_id', otherOrgId);
  await admin.from('tables').delete().eq('id', buranchiTableId);
  await admin.from('tables').delete().eq('id', otherTableId);
  await admin.from('customers').delete().eq('id', buranchiCustomerId);
  await admin.from('customers').delete().eq('id', otherCustomerId);
  await admin.auth.admin.deleteUser(buranchiAdminId);
  await admin.auth.admin.deleteUser(buranchiFrontDeskId);
  await admin.auth.admin.deleteUser(buranchiCustomerServiceId);
  await admin.auth.admin.deleteUser(otherAdminId);
  await admin.from('organizations').delete().eq('id', otherOrgId);
});

describe('Phase 2 RLS — tables', () => {
  test('admin can insert a table; front_desk cannot', async () => {
    const code1 = 'A' + Date.now();
    const { error: adminErr } = await buranchiAdminClient.from('tables').insert({
      organization_id: buranchiOrgId, code: code1, capacity: 2,
    } as never);
    expect(adminErr).toBeNull();

    const code2 = 'F' + Date.now();
    const { error: fdErr } = await buranchiFrontDeskClient.from('tables').insert({
      organization_id: buranchiOrgId, code: code2, capacity: 2,
    } as never);
    const { data: row } = await admin.from('tables').select('id').eq('code', code2);
    expect(row).toHaveLength(0);
    void fdErr;

    await admin.from('tables').delete().eq('code', code1);
  });

  test('cross-tenant: org A user cannot see org B tables', async () => {
    const { data: visible } = await buranchiAdminClient.from('tables').select('id').eq('id', otherTableId);
    expect(visible).toHaveLength(0);
  });
});

describe('Phase 2 RLS — bookings', () => {
  test('front_desk can create a booking', async () => {
    const startsAt = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();
    const endsAt = new Date(Date.parse(startsAt) + 2 * 60 * 60 * 1000).toISOString();
    const { data, error } = await buranchiFrontDeskClient.from('bookings').insert({
      organization_id: buranchiOrgId,
      customer_id: buranchiCustomerId,
      table_id: buranchiTableId,
      starts_at: startsAt,
      ends_at: endsAt,
      party_size: 2,
      source: 'manual',
      status: 'confirmed',
      special_request: '__test__',
    } as never).select('id').single();
    expect(error).toBeNull();
    expect(data?.id).toBeDefined();
  });

  test('customer_service cannot create a booking', async () => {
    const startsAt = new Date(Date.now() + 48 * 60 * 60 * 1000).toISOString();
    const endsAt = new Date(Date.parse(startsAt) + 2 * 60 * 60 * 1000).toISOString();
    await buranchiCustomerServiceClient.from('bookings').insert({
      organization_id: buranchiOrgId,
      customer_id: buranchiCustomerId,
      table_id: buranchiTableId,
      starts_at: startsAt,
      ends_at: endsAt,
      party_size: 2,
      source: 'manual',
      special_request: '__cs_attempt__',
    } as never);
    const { data: row } = await admin.from('bookings').select('id').eq('special_request', '__cs_attempt__');
    expect(row).toHaveLength(0);
  });

  test('exclusion constraint blocks overlapping active bookings on same table', async () => {
    const startsAt = new Date(Date.now() + 72 * 60 * 60 * 1000).toISOString();
    const endsAt = new Date(Date.parse(startsAt) + 2 * 60 * 60 * 1000).toISOString();
    const { error: firstErr } = await admin.from('bookings').insert({
      organization_id: buranchiOrgId,
      customer_id: buranchiCustomerId,
      table_id: buranchiTableId,
      starts_at: startsAt,
      ends_at: endsAt,
      party_size: 2,
      source: 'manual',
      status: 'confirmed',
      special_request: '__test__',
    } as never);
    expect(firstErr).toBeNull();

    const { error: secondErr } = await admin.from('bookings').insert({
      organization_id: buranchiOrgId,
      customer_id: buranchiCustomerId,
      table_id: buranchiTableId,
      starts_at: startsAt,
      ends_at: endsAt,
      party_size: 2,
      source: 'manual',
      status: 'confirmed',
      special_request: '__test__',
    } as never);
    expect(secondErr).toBeTruthy();
    expect(secondErr?.message ?? '').toMatch(/conflicting|exclusion|overlap/i);
  });

  test('exclusion constraint allows overlapping if one is cancelled', async () => {
    const startsAt = new Date(Date.now() + 96 * 60 * 60 * 1000).toISOString();
    const endsAt = new Date(Date.parse(startsAt) + 2 * 60 * 60 * 1000).toISOString();
    const { data: cancelledBooking } = await admin.from('bookings').insert({
      organization_id: buranchiOrgId,
      customer_id: buranchiCustomerId,
      table_id: buranchiTableId,
      starts_at: startsAt,
      ends_at: endsAt,
      party_size: 2,
      source: 'manual',
      status: 'cancelled',
      cancelled_at: new Date().toISOString(),
      cancelled_reason: 'test',
      special_request: '__test__',
    } as never).select('id').single();
    expect(cancelledBooking?.id).toBeDefined();

    const { error: confirmedErr } = await admin.from('bookings').insert({
      organization_id: buranchiOrgId,
      customer_id: buranchiCustomerId,
      table_id: buranchiTableId,
      starts_at: startsAt,
      ends_at: endsAt,
      party_size: 2,
      source: 'manual',
      status: 'confirmed',
      special_request: '__test__',
    } as never);
    expect(confirmedErr).toBeNull();
  });

  test('cross-tenant: org A user cannot see org B bookings', async () => {
    const startsAt = new Date(Date.now() + 120 * 60 * 60 * 1000).toISOString();
    const endsAt = new Date(Date.parse(startsAt) + 2 * 60 * 60 * 1000).toISOString();
    const { data: otherBooking } = await admin.from('bookings').insert({
      organization_id: otherOrgId,
      customer_id: otherCustomerId,
      table_id: otherTableId,
      starts_at: startsAt,
      ends_at: endsAt,
      party_size: 2,
      source: 'manual',
      status: 'confirmed',
    } as never).select('id').single();
    const { data: visible } = await buranchiAdminClient.from('bookings').select('id').eq('id', otherBooking!.id);
    expect(visible).toHaveLength(0);
    void otherAdminClient; // referenced for symmetry, deletion handled by afterAll
  });
});
