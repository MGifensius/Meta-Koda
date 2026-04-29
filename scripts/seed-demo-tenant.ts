/**
 * Seeds a second tenant "Saji Bistro Jakarta" with realistic demo data,
 * separate from Buranchi. Idempotent-safe (refuses to run if slug=demo
 * already exists; delete it manually first to reseed).
 *
 * Usage: pnpm seed:demo
 */

import { randomBytes } from 'node:crypto';
import { config as loadEnv } from 'dotenv';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';

loadEnv({ path: '.env.local' });

// Random 16-char password generated per-run. Printed once at the end. If lost,
// reset via Supabase Auth dashboard or re-run after deleting the demo tenant.
const generatedPassword = randomBytes(12).toString('base64').replace(/[+/=]/g, 'x');

const DEMO = {
  slug: 'demo',
  name: 'Saji Bistro Jakarta',
  timezone: 'Asia/Jakarta',
  address: 'Jl. Senopati No. 88, Kebayoran Baru, Jakarta Selatan',
  operatingHours: 'Mon-Sun 10:00–22:00',
  loyaltyProgramName: 'Saji Rewards',
  earnRate: 10000,
  adminEmail: 'demo@metaseti.id',
  adminPassword: generatedPassword,
  adminFullName: 'Demo Admin',
};

interface TierRow {
  id: string;
  tier_index: number;
  name: string;
  min_points_lifetime: number;
}

function pickTier(lifetime: number, tiers: TierRow[]): TierRow {
  return tiers
    .slice()
    .sort((a, b) => b.tier_index - a.tier_index)
    .find((t) => lifetime >= t.min_points_lifetime)!;
}

function isoDaysFromNow(days: number, hour = 19, minute = 0): string {
  const d = new Date();
  d.setDate(d.getDate() + days);
  d.setHours(hour, minute, 0, 0);
  return d.toISOString();
}

function isoDaysAgoMinus(days: number, hour = 19, minute = 0): string {
  const d = new Date();
  d.setDate(d.getDate() - days);
  d.setHours(hour, minute, 0, 0);
  return d.toISOString();
}

function plusHours(iso: string, hours: number): string {
  const d = new Date(iso);
  d.setHours(d.getHours() + hours);
  return d.toISOString();
}

async function main() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceKey) {
    throw new Error('Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in .env.local');
  }

  const admin: SupabaseClient = createClient(url, serviceKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  // ---- 1. Refuse if demo already exists ------------------------------------
  const { data: existing } = await admin
    .from('organizations')
    .select('id, name')
    .eq('slug', DEMO.slug)
    .maybeSingle();
  if (existing) {
    console.error('');
    console.error(`Demo tenant already exists (id: ${existing.id}, name: ${existing.name}).`);
    console.error('To reseed, delete it first via SQL:');
    console.error(`  DELETE FROM organizations WHERE slug = '${DEMO.slug}';`);
    console.error('Cascading FKs will clean up tables, customers, bookings, loyalty data.');
    console.error('You will also need to delete the auth user separately:');
    console.error(`  Auth → Users → find ${DEMO.adminEmail} → Delete`);
    process.exit(1);
  }

  console.log(`Creating "${DEMO.name}" (slug=${DEMO.slug})…`);

  // ---- 2. Insert organization (auto-seeds 4 loyalty tiers via trigger) -----
  const { data: orgInsert, error: orgErr } = await admin
    .from('organizations')
    .insert({
      slug: DEMO.slug,
      name: DEMO.name,
      timezone: DEMO.timezone,
      address: DEMO.address,
      operating_hours: DEMO.operatingHours,
      loyalty_enabled: true,
      loyalty_program_name: DEMO.loyaltyProgramName,
      loyalty_earn_rate_idr_per_point: DEMO.earnRate,
    } as never)
    .select('id')
    .single();
  if (orgErr || !orgInsert) throw orgErr ?? new Error('Failed to insert organization');
  const orgId = (orgInsert as { id: string }).id;
  console.log(`  org id = ${orgId}`);

  // ---- 3. Look up the 4 auto-seeded tiers ----------------------------------
  const { data: tierRows } = await admin
    .from('loyalty_tiers')
    .select('id, tier_index, name, min_points_lifetime')
    .eq('organization_id', orgId)
    .order('tier_index', { ascending: true });
  const tiers = (tierRows ?? []) as TierRow[];
  if (tiers.length !== 4) {
    throw new Error(`Expected 4 auto-seeded tiers, got ${tiers.length}`);
  }
  console.log(`  4 tiers seeded: ${tiers.map((t) => t.name).join(' / ')}`);

  // ---- 4. Create admin auth user ------------------------------------------
  const { data: created, error: userErr } = await admin.auth.admin.createUser({
    email: DEMO.adminEmail,
    password: DEMO.adminPassword,
    email_confirm: true,
    user_metadata: {
      organization_id: orgId,
      full_name: DEMO.adminFullName,
      role: 'admin',
    },
  });
  if (userErr || !created?.user) throw userErr ?? new Error('Failed to create admin user');
  const adminUserId = created.user.id;
  console.log(`  admin user id = ${adminUserId}`);

  // ---- 5. Tables ----------------------------------------------------------
  const tableSpecs = [
    { code: 'T01', capacity: 2, floor_area: 'Window' },
    { code: 'T02', capacity: 2, floor_area: 'Window' },
    { code: 'T03', capacity: 4, floor_area: 'Main' },
    { code: 'T04', capacity: 4, floor_area: 'Main' },
    { code: 'T05', capacity: 4, floor_area: 'Main' },
    { code: 'T06', capacity: 6, floor_area: 'Main' },
    { code: 'T07', capacity: 6, floor_area: 'Garden' },
    { code: 'T08', capacity: 8, floor_area: 'Garden' },
    { code: 'B01', capacity: 4, floor_area: 'Bar' },
    { code: 'P01', capacity: 10, floor_area: 'Private' },
  ];
  const { data: tablesInserted, error: tblErr } = await admin
    .from('tables')
    .insert(
      tableSpecs.map((t) => ({
        organization_id: orgId,
        code: t.code,
        capacity: t.capacity,
        floor_area: t.floor_area,
      })) as never,
    )
    .select('id, code');
  if (tblErr) throw tblErr;
  const tables = (tablesInserted ?? []) as Array<{ id: string; code: string }>;
  console.log(`  ${tables.length} tables`);

  // ---- 6. Customers (25, with 10 members at varied tiers) ------------------
  type CustomerSpec = {
    full_name: string;
    phone: string;
    email?: string;
    tags?: string[];
    notes?: string;
    member?: { lifetime: number; balance: number };
  };
  const customerSpecs: CustomerSpec[] = [
    // Non-members (15)
    { full_name: 'Andini Wulandari', phone: '0812-1100-0001' },
    { full_name: 'Budi Santoso', phone: '0812-1100-0002', tags: ['vip'] },
    { full_name: 'Citra Lestari', phone: '0812-1100-0003' },
    { full_name: 'Dimas Pratama', phone: '0812-1100-0004' },
    { full_name: 'Eka Setiawan', phone: '0812-1100-0005' },
    { full_name: 'Fitri Handayani', phone: '0812-1100-0006', tags: ['vegan'] },
    { full_name: 'Galang Nugraha', phone: '0812-1100-0007' },
    { full_name: 'Hana Maharani', phone: '0812-1100-0008' },
    { full_name: 'Ilham Wibowo', phone: '0812-1100-0009' },
    { full_name: 'Jasmine Kusuma', phone: '0812-1100-0010' },
    { full_name: 'Kevin Halim', phone: '0812-1100-0011' },
    { full_name: 'Larasati Putri', phone: '0812-1100-0012' },
    { full_name: 'Made Wirawan', phone: '0812-1100-0013' },
    { full_name: 'Nadya Salim', phone: '0812-1100-0014' },
    { full_name: 'Oki Hartanto', phone: '0812-1100-0015' },
    // Bronze (3)
    {
      full_name: 'Putri Cahaya',
      phone: '0812-1100-0016',
      member: { lifetime: 120, balance: 120 },
    },
    {
      full_name: 'Rangga Yudistira',
      phone: '0812-1100-0017',
      member: { lifetime: 280, balance: 280 },
    },
    {
      full_name: 'Siti Rahmadani',
      phone: '0812-1100-0018',
      member: { lifetime: 460, balance: 360 },
    },
    // Silver (3)
    {
      full_name: 'Tegar Pranata',
      phone: '0812-1100-0019',
      member: { lifetime: 720, balance: 720 },
    },
    {
      full_name: 'Umi Kalsum',
      phone: '0812-1100-0020',
      tags: ['regular'],
      member: { lifetime: 1200, balance: 1000 },
    },
    {
      full_name: 'Vino Setiabudi',
      phone: '0812-1100-0021',
      member: { lifetime: 1850, balance: 1650 },
    },
    // Gold (3)
    {
      full_name: 'Wulan Anjani',
      phone: '0812-1100-0022',
      tags: ['vip', 'birthday-march'],
      member: { lifetime: 2400, balance: 2200 },
    },
    {
      full_name: 'Xenia Hartono',
      phone: '0812-1100-0023',
      member: { lifetime: 3600, balance: 3400 },
    },
    {
      full_name: 'Yusuf Ramadhan',
      phone: '0812-1100-0024',
      notes: 'Allergic to peanuts.',
      member: { lifetime: 4800, balance: 4500 },
    },
    // Platinum (1)
    {
      full_name: 'Zulfa Aisyah',
      phone: '0812-1100-0025',
      tags: ['vip', 'whale'],
      notes: 'Prefers Garden seating; champagne on arrival.',
      member: { lifetime: 5400, balance: 4900 },
    },
  ];

  const customerRows = await Promise.all(
    customerSpecs.map(async (c) => {
      const memberFields = c.member
        ? {
            is_member: true,
            member_since: new Date(Date.now() - 90 * 24 * 60 * 60 * 1000).toISOString(),
            points_lifetime: c.member.lifetime,
            points_balance: c.member.balance,
            current_tier_id: pickTier(c.member.lifetime, tiers).id,
          }
        : {};
      const { data, error } = await admin
        .from('customers')
        .insert({
          organization_id: orgId,
          full_name: c.full_name,
          phone: c.phone,
          ...(c.email ? { email: c.email } : {}),
          ...(c.tags ? { tags: c.tags } : {}),
          ...(c.notes ? { notes: c.notes } : {}),
          ...memberFields,
          created_by: adminUserId,
        } as never)
        .select('id, full_name')
        .single();
      if (error) throw error;
      return data as { id: string; full_name: string };
    }),
  );
  console.log(`  ${customerRows.length} customers (${customerSpecs.filter((c) => c.member).length} members)`);

  // ---- 7. Rewards ---------------------------------------------------------
  const rewardSpecs = [
    {
      name: 'Free coffee',
      description: 'Any espresso-based drink, on the house.',
      type: 'free_item' as const,
      type_value: 0,
      points_cost: 100,
      min_tier_index: 0,
      sort_order: 1,
    },
    {
      name: 'Free dessert',
      description: 'Choose any dessert from the menu.',
      type: 'free_item' as const,
      type_value: 0,
      points_cost: 200,
      min_tier_index: 0,
      sort_order: 2,
    },
    {
      name: '10% off the bill',
      description: 'Discount applied to the food + drink subtotal.',
      type: 'percent_discount' as const,
      type_value: 10,
      points_cost: 500,
      min_tier_index: 0,
      sort_order: 3,
    },
    {
      name: 'Complimentary champagne (Gold+)',
      description: 'A glass of house champagne, members Gold and above.',
      type: 'free_item' as const,
      type_value: 0,
      points_cost: 800,
      min_tier_index: 2,
      sort_order: 4,
    },
    {
      name: 'Rp 100,000 off (Platinum)',
      description: 'Flat Rupiah discount for Platinum members.',
      type: 'rupiah_discount' as const,
      type_value: 100000,
      points_cost: 1500,
      min_tier_index: 3,
      sort_order: 5,
    },
  ];
  const { data: rewardsInserted, error: rwErr } = await admin
    .from('loyalty_rewards')
    .insert(
      rewardSpecs.map((r) => ({
        organization_id: orgId,
        ...r,
      })) as never,
    )
    .select('id, name, type, type_value, points_cost');
  if (rwErr) throw rwErr;
  const rewards = (rewardsInserted ?? []) as Array<{
    id: string;
    name: string;
    type: 'free_item' | 'percent_discount' | 'rupiah_discount';
    type_value: number;
    points_cost: number;
  }>;
  console.log(`  ${rewards.length} rewards`);

  // ---- 8. Bookings -------------------------------------------------------
  // 8 past completed (last 30 days), 7 upcoming confirmed (next 7 days)
  const allCustomers = customerRows;
  const tableByCode = (code: string) => tables.find((t) => t.code === code)!;

  const completedBookingSpecs: Array<{
    customerIdx: number;
    table: string;
    daysAgo: number;
    party: number;
    bill: number;
  }> = [
    { customerIdx: 0, table: 'T03', daysAgo: 28, party: 4, bill: 280000 },
    { customerIdx: 5, table: 'T01', daysAgo: 24, party: 2, bill: 150000 },
    { customerIdx: 16, table: 'T04', daysAgo: 18, party: 3, bill: 220000 }, // Rangga (Bronze)
    { customerIdx: 19, table: 'T06', daysAgo: 14, party: 5, bill: 460000 }, // Umi (Silver)
    { customerIdx: 22, table: 'T07', daysAgo: 11, party: 6, bill: 850000 }, // Xenia (Gold)
    { customerIdx: 24, table: 'P01', daysAgo: 9, party: 8, bill: 1850000 }, // Zulfa (Platinum)
    { customerIdx: 12, table: 'T05', daysAgo: 6, party: 4, bill: 320000 },
    { customerIdx: 18, table: 'T02', daysAgo: 3, party: 2, bill: 180000 }, // Tegar (Silver)
  ];

  const upcomingBookingSpecs: Array<{
    customerIdx: number;
    table: string;
    daysAhead: number;
    party: number;
  }> = [
    { customerIdx: 1, table: 'T03', daysAhead: 1, party: 4 }, // Budi
    { customerIdx: 22, table: 'T07', daysAhead: 2, party: 6 }, // Xenia (Gold)
    { customerIdx: 4, table: 'T01', daysAhead: 3, party: 2 },
    { customerIdx: 24, table: 'P01', daysAhead: 4, party: 10 }, // Zulfa (Platinum)
    { customerIdx: 8, table: 'T05', daysAhead: 5, party: 3 },
    { customerIdx: 19, table: 'B01', daysAhead: 6, party: 4 }, // Umi (Silver)
    { customerIdx: 14, table: 'T08', daysAhead: 7, party: 7 },
  ];

  const completedBookings: Array<{ id: string; customerIdx: number; bill: number }> = [];
  for (const b of completedBookingSpecs) {
    const startsAt = isoDaysAgoMinus(b.daysAgo);
    const endsAt = plusHours(startsAt, 2);
    const cust = allCustomers[b.customerIdx]!;
    const { data, error } = await admin
      .from('bookings')
      .insert({
        organization_id: orgId,
        customer_id: cust.id,
        table_id: tableByCode(b.table).id,
        starts_at: startsAt,
        ends_at: endsAt,
        party_size: b.party,
        source: 'manual',
        status: 'completed',
        completed_at: endsAt,
        created_by: adminUserId,
      } as never)
      .select('id')
      .single();
    if (error) throw error;
    completedBookings.push({
      id: (data as { id: string }).id,
      customerIdx: b.customerIdx,
      bill: b.bill,
    });
  }

  for (const b of upcomingBookingSpecs) {
    const startsAt = isoDaysFromNow(b.daysAhead);
    const endsAt = plusHours(startsAt, 2);
    const cust = allCustomers[b.customerIdx]!;
    const { error } = await admin.from('bookings').insert({
      organization_id: orgId,
      customer_id: cust.id,
      table_id: tableByCode(b.table).id,
      starts_at: startsAt,
      ends_at: endsAt,
      party_size: b.party,
      source: 'manual',
      status: 'confirmed',
      created_by: adminUserId,
    } as never);
    if (error) throw error;
  }
  console.log(
    `  ${completedBookings.length} completed + ${upcomingBookingSpecs.length} upcoming bookings`,
  );

  // ---- 9. Loyalty transactions for member completed bookings -------------
  const memberCompletions = completedBookings.filter((b) => customerSpecs[b.customerIdx]?.member);
  for (const b of memberCompletions) {
    const cust = allCustomers[b.customerIdx]!;
    const earned = Math.floor(b.bill / DEMO.earnRate);
    const { error } = await admin.from('loyalty_transactions').insert({
      organization_id: orgId,
      customer_id: cust.id,
      booking_id: b.id,
      bill_idr: b.bill,
      points_earned: earned,
      earn_rate_idr_per_point: DEMO.earnRate,
      created_by: adminUserId,
    } as never);
    if (error) throw error;
  }

  // A couple of representative redemptions on Xenia (Gold) and Umi (Silver)
  const xeniaCompletion = memberCompletions.find((b) => b.customerIdx === 22);
  const umiCompletion = memberCompletions.find((b) => b.customerIdx === 19);
  const dessert = rewards.find((r) => r.name === 'Free dessert')!;
  const tenPctOff = rewards.find((r) => r.name === '10% off the bill')!;
  if (xeniaCompletion) {
    const { error } = await admin.from('loyalty_redemptions').insert({
      organization_id: orgId,
      customer_id: allCustomers[22]!.id,
      reward_id: dessert.id,
      reward_name: dessert.name,
      reward_type: dessert.type,
      reward_type_value: dessert.type_value,
      points_spent: dessert.points_cost,
      booking_id: xeniaCompletion.id,
      status: 'applied',
      created_by: adminUserId,
    } as never);
    if (error) throw error;
  }
  if (umiCompletion) {
    const { error } = await admin.from('loyalty_redemptions').insert({
      organization_id: orgId,
      customer_id: allCustomers[19]!.id,
      reward_id: tenPctOff.id,
      reward_name: tenPctOff.name,
      reward_type: tenPctOff.type,
      reward_type_value: tenPctOff.type_value,
      points_spent: tenPctOff.points_cost,
      booking_id: umiCompletion.id,
      status: 'applied',
      created_by: adminUserId,
    } as never);
    if (error) throw error;
  }
  console.log(
    `  ${memberCompletions.length} loyalty earn rows + 2 redemption rows`,
  );

  // ---- 10. Koda FAQ + specials ------------------------------------------
  const faqs = [
    { question: 'Jam buka kapan saja?', answer: 'Setiap hari, jam 10:00 sampai 22:00.', sort_order: 1 },
    {
      question: 'Apakah ada menu vegetarian?',
      answer: 'Ada — kami punya 6 menu vegetarian, termasuk pasta dan salad.',
      sort_order: 2,
    },
    {
      question: 'Bisa parkir di mana?',
      answer: 'Parkir gratis di basement, akses dari Jl. Senopati.',
      sort_order: 3,
    },
    {
      question: 'Bagaimana kebijakan pembatalan?',
      answer: 'Booking bisa dibatalkan tanpa biaya hingga 2 jam sebelum waktu reservasi.',
      sort_order: 4,
    },
    {
      question: 'Apakah ramah anak?',
      answer: 'Ya — kami menyediakan kursi tinggi dan menu anak-anak.',
      sort_order: 5,
    },
  ];
  await admin.from('koda_faq').insert(
    faqs.map((f) => ({ organization_id: orgId, ...f, is_active: true })) as never,
  );

  const today = new Date().toISOString().slice(0, 10);
  const inThirtyDays = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
  await admin.from('koda_specials').insert([
    {
      organization_id: orgId,
      title: 'Weekend brunch — 30% off',
      description: 'Setiap Sabtu-Minggu jam 10:00–14:00.',
      starts_on: today,
      ends_on: inThirtyDays,
      is_active: true,
    },
    {
      organization_id: orgId,
      title: 'Wine Wednesday',
      description: 'Diskon 25% untuk semua wine setiap Rabu malam jam 18:00–22:00.',
      starts_on: today,
      ends_on: inThirtyDays,
      is_active: true,
    },
  ] as never);
  console.log(`  ${faqs.length} FAQ + 2 specials`);

  // ---- Done --------------------------------------------------------------
  console.log('');
  console.log('───────────────────────────────────────────────────────────────');
  console.log(`  Demo tenant ready: ${DEMO.name}`);
  console.log('');
  console.log('  Sign in at /login with:');
  console.log(`    Email:    ${DEMO.adminEmail}`);
  console.log(`    Password: ${DEMO.adminPassword}`);
  console.log('');
  console.log('  Switch back to Buranchi by signing out and signing in as');
  console.log('  the original Buranchi admin.');
  console.log('───────────────────────────────────────────────────────────────');
}

main().catch((err) => {
  console.error('seed:demo failed:', err);
  process.exit(1);
});
