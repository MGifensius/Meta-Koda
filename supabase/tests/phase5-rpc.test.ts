import { afterAll, beforeAll, describe, expect, test } from 'vitest';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import 'dotenv/config';

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!;

let admin: SupabaseClient;
let orgId: string;
let adminUserId: string;
let adminClient: SupabaseClient;
let customerId: string;
let tableId: string;
let bookingId: string;
let goldTierId: string;
let dessertRewardId: string;
let goldOnlyRewardId: string;
let expensiveRewardId: string;

beforeAll(async () => {
  admin = createClient(SUPABASE_URL, SERVICE_KEY, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
  const { data: b } = await admin
    .from('organizations').select('id').eq('slug', 'buranchi').single();
  orgId = b!.id;

  await admin.from('organizations').update({ loyalty_enabled: true } as never).eq('id', orgId);

  const ts = Date.now();
  const { data: created } = await admin.auth.admin.createUser({
    email: `p5-rpc-${ts}@test.local`,
    password: 'test-password-123',
    email_confirm: true,
    user_metadata: { organization_id: orgId, full_name: 'RPC tester', role: 'admin' },
  });
  adminUserId = created!.user!.id;
  adminClient = createClient(SUPABASE_URL, ANON_KEY);
  await adminClient.auth.signInWithPassword({
    email: `p5-rpc-${ts}@test.local`,
    password: 'test-password-123',
  });

  const { data: gold } = await admin
    .from('loyalty_tiers')
    .select('id')
    .eq('organization_id', orgId)
    .eq('tier_index', 2)
    .single();
  goldTierId = gold!.id;

  const { data: cust } = await admin
    .from('customers')
    .insert({
      organization_id: orgId,
      full_name: 'RPC member',
      is_member: true,
      member_since: new Date().toISOString(),
      points_balance: 1000,
      points_lifetime: 1000,
      current_tier_id: goldTierId,
    } as never)
    .select('id')
    .single();
  customerId = cust!.id;

  const { data: tbl } = await admin
    .from('tables')
    .insert({ organization_id: orgId, code: 'P5RPC' + ts, capacity: 4 } as never)
    .select('id')
    .single();
  tableId = tbl!.id;

  const startsAt = new Date(Date.now() + 60 * 60 * 1000).toISOString();
  const endsAt = new Date(Date.now() + 3 * 60 * 60 * 1000).toISOString();
  const { data: bk } = await admin
    .from('bookings')
    .insert({
      organization_id: orgId,
      customer_id: customerId,
      table_id: tableId,
      starts_at: startsAt,
      ends_at: endsAt,
      party_size: 2,
      source: 'manual',
      status: 'confirmed',
      created_by: adminUserId,
    } as never)
    .select('id')
    .single();
  bookingId = bk!.id;

  const { data: r1 } = await admin
    .from('loyalty_rewards')
    .insert({
      organization_id: orgId,
      name: 'RPC Free Dessert',
      type: 'free_item',
      points_cost: 200,
      min_tier_index: 0,
      is_active: true,
    } as never)
    .select('id')
    .single();
  dessertRewardId = r1!.id;

  const { data: r2 } = await admin
    .from('loyalty_rewards')
    .insert({
      organization_id: orgId,
      name: 'RPC Platinum-only',
      type: 'free_item',
      points_cost: 100,
      min_tier_index: 3,
      is_active: true,
    } as never)
    .select('id')
    .single();
  goldOnlyRewardId = r2!.id;

  const { data: r3 } = await admin
    .from('loyalty_rewards')
    .insert({
      organization_id: orgId,
      name: 'RPC Expensive',
      type: 'free_item',
      points_cost: 10000,
      min_tier_index: 0,
      is_active: true,
    } as never)
    .select('id')
    .single();
  expensiveRewardId = r3!.id;
});

afterAll(async () => {
  await admin.from('loyalty_redemptions').delete().eq('booking_id', bookingId);
  await admin.from('loyalty_transactions').delete().eq('booking_id', bookingId);
  await admin.from('bookings').delete().eq('id', bookingId);
  await admin.from('tables').delete().eq('id', tableId);
  await admin.from('loyalty_rewards').delete().eq('id', dessertRewardId);
  await admin.from('loyalty_rewards').delete().eq('id', goldOnlyRewardId);
  await admin.from('loyalty_rewards').delete().eq('id', expensiveRewardId);
  await admin.from('customers').delete().eq('id', customerId);
  await admin.auth.admin.deleteUser(adminUserId);
  await admin.from('organizations').update({ loyalty_enabled: false } as never).eq('id', orgId);
});

describe('complete_booking_with_loyalty RPC', () => {
  test('happy path: earn + 1 redemption + tier compute', async () => {
    const { data, error } = await adminClient.rpc('complete_booking_with_loyalty', {
      p_booking_id: bookingId,
      p_bill_idr: 250000,
      p_redemption_ids: [dessertRewardId],
    } as never);
    expect(error).toBeNull();
    const result = data as {
      points_earned: number;
      points_redeemed: number;
      new_balance: number;
      new_lifetime: number;
    };
    expect(result.points_earned).toBe(25);
    expect(result.points_redeemed).toBe(200);
    expect(result.new_balance).toBe(1000 + 25 - 200);
    expect(result.new_lifetime).toBe(1025);

    const { data: bk } = await admin.from('bookings').select('status').eq('id', bookingId).single();
    expect(bk?.status).toBe('completed');

    const { data: cu } = await admin
      .from('customers')
      .select('points_balance, points_lifetime')
      .eq('id', customerId)
      .single();
    expect(cu?.points_balance).toBe(825);
    expect(cu?.points_lifetime).toBe(1025);
  });

  test('insufficient_balance raises and rolls back atomically', async () => {
    await admin
      .from('bookings')
      .update({ status: 'confirmed', completed_at: null } as never)
      .eq('id', bookingId);
    const balanceBefore = 825;

    const { error } = await adminClient.rpc('complete_booking_with_loyalty', {
      p_booking_id: bookingId,
      p_bill_idr: 100000,
      p_redemption_ids: [expensiveRewardId], // 10,000 pts > 825 balance
    } as never);
    expect(error).toBeTruthy();
    expect(error?.message).toMatch(/insufficient_balance/);

    const { data: bk } = await admin.from('bookings').select('status').eq('id', bookingId).single();
    expect(bk?.status).toBe('confirmed');
    const { data: cu } = await admin
      .from('customers')
      .select('points_balance')
      .eq('id', customerId)
      .single();
    expect(cu?.points_balance).toBe(balanceBefore);
  });

  test('reward_tier_locked when tier insufficient', async () => {
    await admin
      .from('bookings')
      .update({ status: 'confirmed', completed_at: null } as never)
      .eq('id', bookingId);
    const { error } = await adminClient.rpc('complete_booking_with_loyalty', {
      p_booking_id: bookingId,
      p_bill_idr: 100000,
      p_redemption_ids: [goldOnlyRewardId],
    } as never);
    expect(error?.message).toMatch(/reward_tier_locked/);
  });

  test('customer_not_member when is_member false', async () => {
    await admin
      .from('bookings')
      .update({ status: 'confirmed', completed_at: null } as never)
      .eq('id', bookingId);
    await admin.from('customers').update({ is_member: false } as never).eq('id', customerId);
    const { error } = await adminClient.rpc('complete_booking_with_loyalty', {
      p_booking_id: bookingId,
      p_bill_idr: 100000,
      p_redemption_ids: [],
    } as never);
    expect(error?.message).toMatch(/customer_not_member/);
    await admin.from('customers').update({ is_member: true } as never).eq('id', customerId);
  });

  test('booking_not_completable when status is cancelled', async () => {
    await admin.from('bookings').update({ status: 'cancelled' } as never).eq('id', bookingId);
    const { error } = await adminClient.rpc('complete_booking_with_loyalty', {
      p_booking_id: bookingId,
      p_bill_idr: 100000,
      p_redemption_ids: [],
    } as never);
    expect(error?.message).toMatch(/booking_not_completable/);
  });
});
