# Phase 5 — Loyalty Program Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the per-tenant loyalty program — opt-in membership, lifetime-points-driven 4-tier system, admin-configurable reward catalog, atomic booking-completion flow that earns + redeems in one transaction, and 2 new Koda tools (`get_loyalty_status`, `redeem_reward`).

**Architecture:** 5 new database tables (`loyalty_tiers`, `loyalty_rewards`, `loyalty_transactions`, `loyalty_redemptions`, `loyalty_adjustments`) + denormalized counters on `customers` (`is_member`, `points_balance`, `points_lifetime`, `current_tier_id`) + 3 config columns on `organizations`. Atomic writes via a Postgres function `complete_booking_with_loyalty(booking_id, bill_idr, redemption_ids[])`. Koda gains 2 tools and a per-customer Loyalty system-prompt block.

**Tech Stack:** Same as Phase 1–4 — Next.js 15 + Turbopack, React 19, TypeScript 5 strict, Supabase + RLS, pnpm 9 + Turborepo, Tailwind v4, RHF + Zod, Vitest, OpenAI SDK. No new dependencies.

**Spec:** [`docs/superpowers/specs/2026-04-29-phase-5-loyalty-design.md`](../specs/2026-04-29-phase-5-loyalty-design.md)

---

## File Structure

### Database

```
supabase/migrations/
├── 0020_phase5_loyalty_tables.sql        # enum + 5 tables + customer/org column adds + RLS + trigger + backfill
└── 0021_phase5_loyalty_rpc.sql           # complete_booking_with_loyalty function + grants

supabase/.dashboard-apply/
└── phase-5.sql                            # gitignored bundle: 0020 + 0021 + tracker inserts

supabase/tests/
├── phase5-rls.test.ts                     # cross-tenant + role-gated tests across 5 new tables
└── phase5-rpc.test.ts                     # RPC happy path, error paths, atomicity proof
```

### Shared package additions (`packages/shared/src/`)

```
enums/
└── loyalty-reward-type.ts                 # 'free_item' | 'percent_discount' | 'rupiah_discount'

schemas/
├── loyalty-tier.ts                        # TierUpdate
├── loyalty-reward.ts                      # RewardCreate, RewardUpdate
├── loyalty-redeem.ts                      # AdjustPoints, VoidRedemption
└── loyalty-completion.ts                  # CompleteBookingInput

types/database.ts                          # regenerated from live schema
index.ts                                   # re-exports
```

### Web app additions (`apps/web/`)

```
lib/loyalty/
├── tier.ts                                # deriveTier(lifetime, tiers[]) — pure helper
├── tier.test.ts
├── earn.ts                                # computePointsForBill(bill_idr, earn_rate)
└── earn.test.ts

lib/actions/
├── loyalty-members.ts                     # enrollMemberAction, unenrollMemberAction
├── loyalty-tiers.ts                       # updateTierAction (admin name/threshold/perks)
├── loyalty-rewards.ts                     # createReward, updateReward, deleteReward
├── loyalty-redeem.ts                      # redeemRewardAction, voidRedemptionAction, adjustPointsAction
└── bookings.ts                            # MODIFY: add completeBookingAction; extend cancel for refund

lib/koda/
├── tools.ts                               # MODIFY: add get_loyalty_status + redeem_reward
├── prompt.ts                              # MODIFY: add Loyalty block when applicable
└── tools.test.ts                          # extend with the 2 new tools

components/
├── loyalty-status-badge.tsx               # tier pill + balance + progress bar
├── loyalty-member-toggle.tsx              # enroll/unenroll switch
├── loyalty-redemption-history.tsx         # unified ledger view
├── loyalty-adjustment-dialog.tsx          # admin manual ±points
├── loyalty-tiers-editor.tsx               # 4 fixed tier rows admin editor
├── loyalty-rewards-editor.tsx             # catalog CRUD with type-aware fields
└── loyalty-completion-section.tsx         # booking completion form for members

app/(app)/
├── settings/loyalty/page.tsx              # NEW admin page (Identity / Program / Tiers / Rewards / Activity)
├── settings/page.tsx                      # MODIFY: add Loyalty program row
├── customers/[id]/page.tsx                # MODIFY: add loyalty card
└── bookings/[id]/page.tsx                 # MODIFY: render LoyaltyCompletionSection when applicable
```

---

## Tasks

### Task 1: Migration — Phase 5 schema (tables + enum + customer/org additions + RLS + trigger + Buranchi backfill)

**Files:**
- Create: `supabase/migrations/0020_phase5_loyalty_tables.sql`

- [ ] **Step 1: Write the migration**

```sql
-- 0020_phase5_loyalty_tables.sql

-- ============================================================================
-- Enum
-- ============================================================================

create type public.loyalty_reward_type as enum (
  'free_item',
  'percent_discount',
  'rupiah_discount'
);

-- ============================================================================
-- loyalty_tiers
-- ============================================================================

create table public.loyalty_tiers (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  tier_index int not null check (tier_index between 0 and 3),
  name text not null,
  min_points_lifetime int not null check (min_points_lifetime >= 0),
  perks_text text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index loyalty_tiers_org_index_unique
  on public.loyalty_tiers (organization_id, tier_index);

create trigger set_loyalty_tiers_updated_at
  before update on public.loyalty_tiers
  for each row execute function extensions.moddatetime(updated_at);

alter table public.loyalty_tiers enable row level security;

create policy "select loyalty_tiers in own org"
  on public.loyalty_tiers for select
  using (organization_id = private.get_my_org_id());

create policy "insert loyalty_tiers (admin or trigger)"
  on public.loyalty_tiers for insert
  with check (organization_id = private.get_my_org_id() and private.get_my_role() = 'admin');

create policy "update loyalty_tiers (admin only)"
  on public.loyalty_tiers for update
  using (organization_id = private.get_my_org_id() and private.get_my_role() = 'admin')
  with check (organization_id = private.get_my_org_id() and private.get_my_role() = 'admin');

create policy "delete loyalty_tiers (admin only)"
  on public.loyalty_tiers for delete
  using (organization_id = private.get_my_org_id() and private.get_my_role() = 'admin');

-- ============================================================================
-- loyalty_rewards
-- ============================================================================

create table public.loyalty_rewards (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  name text not null,
  description text,
  type public.loyalty_reward_type not null,
  type_value int not null default 0,
  points_cost int not null check (points_cost > 0),
  min_tier_index int not null default 0 check (min_tier_index between 0 and 3),
  is_active boolean not null default true,
  sort_order int not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index loyalty_rewards_org_active_idx
  on public.loyalty_rewards (organization_id, is_active, sort_order);

create trigger set_loyalty_rewards_updated_at
  before update on public.loyalty_rewards
  for each row execute function extensions.moddatetime(updated_at);

alter table public.loyalty_rewards enable row level security;

create policy "select loyalty_rewards in own org"
  on public.loyalty_rewards for select
  using (organization_id = private.get_my_org_id());

create policy "insert loyalty_rewards (admin only)"
  on public.loyalty_rewards for insert
  with check (organization_id = private.get_my_org_id() and private.get_my_role() = 'admin');

create policy "update loyalty_rewards (admin only)"
  on public.loyalty_rewards for update
  using (organization_id = private.get_my_org_id() and private.get_my_role() = 'admin')
  with check (organization_id = private.get_my_org_id() and private.get_my_role() = 'admin');

create policy "delete loyalty_rewards (admin only)"
  on public.loyalty_rewards for delete
  using (organization_id = private.get_my_org_id() and private.get_my_role() = 'admin');

-- ============================================================================
-- loyalty_transactions (earn ledger — append-only)
-- ============================================================================

create table public.loyalty_transactions (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  customer_id uuid not null references public.customers(id) on delete cascade,
  booking_id uuid references public.bookings(id) on delete set null,
  bill_idr int not null check (bill_idr >= 0),
  points_earned int not null check (points_earned >= 0),
  earn_rate_idr_per_point int not null,
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now()
);

create index loyalty_transactions_customer_idx
  on public.loyalty_transactions (customer_id, created_at desc);
create index loyalty_transactions_org_idx
  on public.loyalty_transactions (organization_id, created_at desc);
create index loyalty_transactions_booking_idx
  on public.loyalty_transactions (booking_id) where booking_id is not null;

alter table public.loyalty_transactions enable row level security;

create policy "select loyalty_transactions in own org"
  on public.loyalty_transactions for select
  using (organization_id = private.get_my_org_id());

create policy "insert loyalty_transactions (admin or front_desk)"
  on public.loyalty_transactions for insert
  with check (
    organization_id = private.get_my_org_id()
    and private.get_my_role() in ('admin', 'front_desk')
  );

-- No UPDATE policy (immutable). DELETE admin-only.
create policy "delete loyalty_transactions (admin only)"
  on public.loyalty_transactions for delete
  using (organization_id = private.get_my_org_id() and private.get_my_role() = 'admin');

-- ============================================================================
-- loyalty_redemptions (spend ledger — UPDATE only for status flip)
-- ============================================================================

create table public.loyalty_redemptions (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  customer_id uuid not null references public.customers(id) on delete cascade,
  reward_id uuid references public.loyalty_rewards(id) on delete set null,
  reward_name text not null,
  reward_type public.loyalty_reward_type not null,
  reward_type_value int not null default 0,
  points_spent int not null check (points_spent > 0),
  booking_id uuid references public.bookings(id) on delete set null,
  status text not null check (status in ('applied', 'voided')) default 'applied',
  voided_at timestamptz,
  voided_reason text,
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now()
);

create index loyalty_redemptions_customer_idx
  on public.loyalty_redemptions (customer_id, created_at desc);
create index loyalty_redemptions_booking_idx
  on public.loyalty_redemptions (booking_id) where booking_id is not null;
create index loyalty_redemptions_org_idx
  on public.loyalty_redemptions (organization_id, created_at desc);

alter table public.loyalty_redemptions enable row level security;

create policy "select loyalty_redemptions in own org"
  on public.loyalty_redemptions for select
  using (organization_id = private.get_my_org_id());

create policy "insert loyalty_redemptions (admin or front_desk)"
  on public.loyalty_redemptions for insert
  with check (
    organization_id = private.get_my_org_id()
    and private.get_my_role() in ('admin', 'front_desk')
  );

create policy "update loyalty_redemptions (admin or front_desk, void only)"
  on public.loyalty_redemptions for update
  using (
    organization_id = private.get_my_org_id()
    and private.get_my_role() in ('admin', 'front_desk')
  )
  with check (
    organization_id = private.get_my_org_id()
    and private.get_my_role() in ('admin', 'front_desk')
    and status = 'voided'
  );

create policy "delete loyalty_redemptions (admin only)"
  on public.loyalty_redemptions for delete
  using (organization_id = private.get_my_org_id() and private.get_my_role() = 'admin');

-- ============================================================================
-- loyalty_adjustments (manual admin gifts/deductions — append-only)
-- ============================================================================

create table public.loyalty_adjustments (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  customer_id uuid not null references public.customers(id) on delete cascade,
  delta_points int not null,
  reason text not null,
  affects_lifetime boolean not null default false,
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now()
);

create index loyalty_adjustments_customer_idx
  on public.loyalty_adjustments (customer_id, created_at desc);
create index loyalty_adjustments_org_idx
  on public.loyalty_adjustments (organization_id, created_at desc);

alter table public.loyalty_adjustments enable row level security;

create policy "select loyalty_adjustments in own org"
  on public.loyalty_adjustments for select
  using (organization_id = private.get_my_org_id());

create policy "insert loyalty_adjustments (admin only)"
  on public.loyalty_adjustments for insert
  with check (organization_id = private.get_my_org_id() and private.get_my_role() = 'admin');

create policy "delete loyalty_adjustments (admin only)"
  on public.loyalty_adjustments for delete
  using (organization_id = private.get_my_org_id() and private.get_my_role() = 'admin');

-- ============================================================================
-- customers + organizations column additions
-- ============================================================================

alter table public.customers
  add column is_member boolean not null default false,
  add column member_since timestamptz,
  add column points_balance int not null default 0 check (points_balance >= 0),
  add column points_lifetime int not null default 0 check (points_lifetime >= 0),
  add column current_tier_id uuid references public.loyalty_tiers(id) on delete set null;

alter table public.organizations
  add column loyalty_enabled boolean not null default false,
  add column loyalty_program_name text not null default 'Loyalty',
  add column loyalty_earn_rate_idr_per_point int not null default 10000
    check (loyalty_earn_rate_idr_per_point > 0);

-- ============================================================================
-- Auto-seed 4 default tiers when a new org is created
-- ============================================================================

create or replace function public.seed_default_loyalty_tiers() returns trigger
  language plpgsql security definer set search_path = public, pg_temp
as $$
begin
  insert into public.loyalty_tiers (organization_id, tier_index, name, min_points_lifetime)
  values
    (NEW.id, 0, 'Bronze',   0),
    (NEW.id, 1, 'Silver',   500),
    (NEW.id, 2, 'Gold',     2000),
    (NEW.id, 3, 'Platinum', 5000);
  return NEW;
end;
$$;

revoke all on function public.seed_default_loyalty_tiers() from public, anon, authenticated;

create trigger seed_loyalty_tiers_after_org_insert
  after insert on public.organizations
  for each row execute function public.seed_default_loyalty_tiers();

-- ============================================================================
-- Backfill 4 default tiers for existing orgs (Buranchi)
-- ============================================================================

insert into public.loyalty_tiers (organization_id, tier_index, name, min_points_lifetime)
select o.id, t.idx, t.name, t.threshold
from public.organizations o
cross join (values (0, 'Bronze', 0), (1, 'Silver', 500), (2, 'Gold', 2000), (3, 'Platinum', 5000))
  as t(idx, name, threshold)
where not exists (
  select 1 from public.loyalty_tiers lt
  where lt.organization_id = o.id and lt.tier_index = t.idx
);
```

- [ ] **Step 2: Commit**

```bash
git add supabase/migrations/0020_phase5_loyalty_tables.sql
git commit -m "feat(db): add Phase 5 loyalty tables, enum, columns, RLS, auto-seed trigger"
```

---

### Task 2: Migration — `complete_booking_with_loyalty` RPC

**Files:**
- Create: `supabase/migrations/0021_phase5_loyalty_rpc.sql`

- [ ] **Step 1: Write the RPC**

```sql
-- 0021_phase5_loyalty_rpc.sql

create or replace function public.complete_booking_with_loyalty(
  p_booking_id     uuid,
  p_bill_idr       int,
  p_redemption_ids uuid[]
) returns jsonb
  language plpgsql
  security invoker
  set search_path = public, pg_temp
as $$
declare
  v_booking         record;
  v_customer        record;
  v_org             record;
  v_points_earned   int;
  v_total_redeemed  int := 0;
  v_new_balance     int;
  v_new_lifetime    int;
  v_new_tier_id     uuid;
  v_reward          record;
  v_customer_tier_index int;
begin
  -- 1. Load booking, customer, org config under RLS
  select * into v_booking from public.bookings where id = p_booking_id;
  if not found then
    raise exception 'booking_not_found' using errcode = 'P0001';
  end if;
  if v_booking.status not in ('confirmed', 'seated') then
    raise exception 'booking_not_completable' using errcode = 'P0001';
  end if;

  select * into v_customer from public.customers where id = v_booking.customer_id;
  select * into v_org      from public.organizations where id = v_booking.organization_id;

  if not v_customer.is_member then
    raise exception 'customer_not_member' using errcode = 'P0001';
  end if;
  if not v_org.loyalty_enabled then
    raise exception 'loyalty_disabled' using errcode = 'P0001';
  end if;

  -- 2. Compute earn
  v_points_earned := floor(p_bill_idr::numeric / v_org.loyalty_earn_rate_idr_per_point);

  -- 3. Validate each requested redemption + sum cost
  select tier_index into v_customer_tier_index
    from public.loyalty_tiers where id = v_customer.current_tier_id;
  if v_customer_tier_index is null then v_customer_tier_index := 0; end if;

  for v_reward in
    select r.id, r.points_cost, r.min_tier_index, r.is_active, r.name, r.type, r.type_value
    from public.loyalty_rewards r
    where r.id = any(p_redemption_ids)
      and r.organization_id = v_booking.organization_id
  loop
    if not v_reward.is_active then
      raise exception 'reward_inactive: %', v_reward.name using errcode = 'P0001';
    end if;
    if v_customer_tier_index < v_reward.min_tier_index then
      raise exception 'reward_tier_locked: %', v_reward.name using errcode = 'P0001';
    end if;
    v_total_redeemed := v_total_redeemed + v_reward.points_cost;
  end loop;

  if v_total_redeemed > v_customer.points_balance then
    raise exception 'insufficient_balance' using errcode = 'P0001';
  end if;

  -- 4. Insert earn ledger row
  insert into public.loyalty_transactions
    (organization_id, customer_id, booking_id, bill_idr, points_earned,
     earn_rate_idr_per_point, created_by)
  values
    (v_booking.organization_id, v_customer.id, v_booking.id, p_bill_idr, v_points_earned,
     v_org.loyalty_earn_rate_idr_per_point, auth.uid());

  -- 5. Insert one redemption row per selected reward (snapshot reward fields)
  insert into public.loyalty_redemptions
    (organization_id, customer_id, reward_id, reward_name, reward_type, reward_type_value,
     points_spent, booking_id, status, created_by)
  select
    v_booking.organization_id, v_customer.id, r.id, r.name, r.type, r.type_value,
    r.points_cost, v_booking.id, 'applied', auth.uid()
  from public.loyalty_rewards r
  where r.id = any(p_redemption_ids);

  -- 6. Update customer counters + derived tier
  v_new_balance  := v_customer.points_balance  + v_points_earned - v_total_redeemed;
  v_new_lifetime := v_customer.points_lifetime + v_points_earned;
  select id into v_new_tier_id
    from public.loyalty_tiers
    where organization_id = v_booking.organization_id
      and min_points_lifetime <= v_new_lifetime
    order by tier_index desc limit 1;

  update public.customers
    set points_balance  = v_new_balance,
        points_lifetime = v_new_lifetime,
        current_tier_id = v_new_tier_id
    where id = v_customer.id;

  -- 7. Mark booking completed
  update public.bookings
    set status = 'completed', completed_at = now()
    where id = v_booking.id;

  return jsonb_build_object(
    'points_earned',   v_points_earned,
    'points_redeemed', v_total_redeemed,
    'new_balance',     v_new_balance,
    'new_lifetime',    v_new_lifetime,
    'new_tier_id',     v_new_tier_id
  );
end;
$$;

revoke all on function public.complete_booking_with_loyalty(uuid, int, uuid[]) from public, anon;
grant execute on function public.complete_booking_with_loyalty(uuid, int, uuid[]) to authenticated;
```

- [ ] **Step 2: Commit**

```bash
git add supabase/migrations/0021_phase5_loyalty_rpc.sql
git commit -m "feat(db): add complete_booking_with_loyalty RPC (atomic earn+redeem+complete)"
```

---

### Task 3: Dashboard-apply bundle for Phase 5

**Files:**
- Create: `supabase/.dashboard-apply/phase-5.sql` (gitignored)

- [ ] **Step 1: Generate the bundle**

```bash
{ echo "-- Meta-Koda — Phase 5 dashboard apply bundle"; \
  echo "-- Paste into Supabase Dashboard → SQL Editor → New query."; \
  echo ""; \
  echo "begin;"; \
  echo ""; \
  sed -n '3,$p' supabase/migrations/0020_phase5_loyalty_tables.sql; \
  echo ""; \
  sed -n '3,$p' supabase/migrations/0021_phase5_loyalty_rpc.sql; \
  echo ""; \
  echo "-- Migration tracker"; \
  echo "insert into supabase_migrations.schema_migrations (version, name) values"; \
  echo "  ('0020', 'phase5_loyalty_tables'),"; \
  echo "  ('0021', 'phase5_loyalty_rpc')"; \
  echo "on conflict (version) do nothing;"; \
  echo ""; \
  echo "commit;"; \
} > supabase/.dashboard-apply/phase-5.sql
```

- [ ] **Step 2: Verify gitignored**

```bash
git check-ignore supabase/.dashboard-apply/phase-5.sql
```
Expected: prints the path.

- [ ] **Step 3: User applies the bundle in Supabase dashboard**

User pastes the file into https://supabase.com/dashboard/project/zsbnsxwsnoulspzkfpvb/sql/new and clicks Run. Implementer asks user to do this and waits for confirmation before continuing.

Verification SQL the user runs after the bundle:

```sql
-- 5 tables exist with RLS
select tablename, rowsecurity from pg_tables
where schemaname='public'
  and tablename in (
    'loyalty_tiers','loyalty_rewards','loyalty_transactions',
    'loyalty_redemptions','loyalty_adjustments'
  )
order by tablename;
-- Expected: 5 rows, all rowsecurity=true

-- 5 columns added to customers
select column_name from information_schema.columns
where table_schema='public' and table_name='customers'
  and column_name in ('is_member','member_since','points_balance','points_lifetime','current_tier_id')
order by column_name;
-- Expected: 5 rows

-- 3 columns added to organizations
select column_name from information_schema.columns
where table_schema='public' and table_name='organizations'
  and column_name in ('loyalty_enabled','loyalty_program_name','loyalty_earn_rate_idr_per_point')
order by column_name;
-- Expected: 3 rows

-- Buranchi has 4 default tiers seeded
select tier_index, name, min_points_lifetime
from public.loyalty_tiers
where organization_id = (select id from public.organizations where slug='buranchi')
order by tier_index;
-- Expected: Bronze 0 / Silver 500 / Gold 2000 / Platinum 5000

-- RPC exists and authenticated can call it
select proname, prosecdef as is_definer
from pg_proc where proname='complete_booking_with_loyalty';
-- Expected: 1 row, is_definer = false (security invoker)

-- Migration tracker
select version, name from supabase_migrations.schema_migrations
where version in ('0020','0021') order by version;
-- Expected: 2 rows
```

**No commit on this task — files are gitignored.**

---

### Task 4: Phase 5 RLS integration tests

**Files:**
- Create: `supabase/tests/phase5-rls.test.ts`

- [ ] **Step 1: Write the failing tests**

```ts
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
  email: string, orgId: string, role: 'admin' | 'front_desk' | 'customer_service',
): Promise<{ id: string; client: SupabaseClient }> {
  const { data: created } = await admin.auth.admin.createUser({
    email, password: 'test-password-123', email_confirm: true,
    user_metadata: { organization_id: orgId, full_name: email.split('@')[0], role },
  });
  const userClient = createClient(SUPABASE_URL, ANON_KEY);
  await userClient.auth.signInWithPassword({ email, password: 'test-password-123' });
  return { id: created!.user!.id, client: userClient };
}

beforeAll(async () => {
  admin = createClient(SUPABASE_URL, SERVICE_KEY, { auth: { autoRefreshToken: false, persistSession: false } });
  const { data: b } = await admin.from('organizations').select('id').eq('slug', 'buranchi').single();
  buranchiOrgId = b!.id;
  const { data: o } = await admin.from('organizations')
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

  const { data: bc } = await admin.from('customers')
    .insert({ organization_id: buranchiOrgId, full_name: 'P5 Customer' } as never)
    .select('id').single();
  buranchiCustomerId = bc!.id;
  const { data: oc } = await admin.from('customers')
    .insert({ organization_id: otherOrgId, full_name: 'Other Customer' } as never)
    .select('id').single();
  otherCustomerId = oc!.id;

  const { data: bronze } = await admin.from('loyalty_tiers')
    .select('id').eq('organization_id', buranchiOrgId).eq('tier_index', 0).single();
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
    const { error: adminErr } = await buranchiAdminClient.from('loyalty_tiers')
      .update({ name: newName } as never)
      .eq('id', buranchiBronzeTierId);
    expect(adminErr).toBeNull();

    const fdName = 'FdRename-' + Date.now();
    await buranchiFrontDeskClient.from('loyalty_tiers')
      .update({ name: fdName } as never)
      .eq('id', buranchiBronzeTierId);
    const { data } = await admin.from('loyalty_tiers')
      .select('name').eq('id', buranchiBronzeTierId).single();
    expect(data?.name).toBe(newName); // FD update should have no-op'd
  });

  test('cross-tenant: admin in org A cannot see org B tiers', async () => {
    const { data } = await buranchiAdminClient.from('loyalty_tiers')
      .select('id').eq('organization_id', otherOrgId);
    expect(data).toHaveLength(0);
    void otherAdminClient;
  });
});

describe('Phase 5 RLS — loyalty_rewards', () => {
  test('admin can insert reward; front_desk cannot', async () => {
    const adminName = 'A-' + Date.now();
    const { error: adminErr } = await buranchiAdminClient.from('loyalty_rewards')
      .insert({
        organization_id: buranchiOrgId, name: adminName, type: 'free_item',
        points_cost: 100, min_tier_index: 0,
      } as never);
    expect(adminErr).toBeNull();

    const fdName = 'F-' + Date.now();
    await buranchiFrontDeskClient.from('loyalty_rewards')
      .insert({
        organization_id: buranchiOrgId, name: fdName, type: 'free_item',
        points_cost: 100, min_tier_index: 0,
      } as never);
    const { data } = await admin.from('loyalty_rewards').select('id').eq('name', fdName);
    expect(data).toHaveLength(0);
  });
});

describe('Phase 5 RLS — loyalty_transactions', () => {
  test('front_desk can insert; cross-tenant blocked', async () => {
    const { error: fdErr } = await buranchiFrontDeskClient.from('loyalty_transactions')
      .insert({
        organization_id: buranchiOrgId, customer_id: buranchiCustomerId,
        bill_idr: 100000, points_earned: 10, earn_rate_idr_per_point: 10000,
      } as never);
    expect(fdErr).toBeNull();

    // Cross-tenant insert attempt should be blocked
    const { error: xErr } = await buranchiFrontDeskClient.from('loyalty_transactions')
      .insert({
        organization_id: otherOrgId, customer_id: otherCustomerId,
        bill_idr: 100000, points_earned: 10, earn_rate_idr_per_point: 10000,
      } as never);
    void xErr;
    const { data: leak } = await admin.from('loyalty_transactions')
      .select('id').eq('customer_id', otherCustomerId);
    expect(leak ?? []).toHaveLength(0);
  });
});

describe('Phase 5 RLS — loyalty_redemptions', () => {
  test('front_desk can insert applied; can flip to voided; cannot flip back', async () => {
    const { data: red } = await buranchiFrontDeskClient.from('loyalty_redemptions')
      .insert({
        organization_id: buranchiOrgId, customer_id: buranchiCustomerId,
        reward_name: 'TestReward', reward_type: 'free_item', points_spent: 50,
        status: 'applied',
      } as never).select('id').single();
    expect(red?.id).toBeDefined();

    const { error: voidErr } = await buranchiFrontDeskClient.from('loyalty_redemptions')
      .update({ status: 'voided', voided_at: new Date().toISOString(), voided_reason: 'test' } as never)
      .eq('id', red!.id);
    expect(voidErr).toBeNull();

    // Flipping back to 'applied' should be blocked by WITH CHECK
    await buranchiFrontDeskClient.from('loyalty_redemptions')
      .update({ status: 'applied' } as never)
      .eq('id', red!.id);
    const { data: still } = await admin.from('loyalty_redemptions')
      .select('status').eq('id', red!.id).single();
    expect(still?.status).toBe('voided');
  });
});

describe('Phase 5 RLS — loyalty_adjustments', () => {
  test('admin can insert; front_desk cannot', async () => {
    const reasonAdmin = 'admin-adj-' + Date.now();
    const { error: adminErr } = await buranchiAdminClient.from('loyalty_adjustments')
      .insert({
        organization_id: buranchiOrgId, customer_id: buranchiCustomerId,
        delta_points: 50, reason: reasonAdmin,
      } as never);
    expect(adminErr).toBeNull();

    const reasonFd = 'fd-adj-' + Date.now();
    await buranchiFrontDeskClient.from('loyalty_adjustments')
      .insert({
        organization_id: buranchiOrgId, customer_id: buranchiCustomerId,
        delta_points: 50, reason: reasonFd,
      } as never);
    const { data } = await admin.from('loyalty_adjustments').select('id').eq('reason', reasonFd);
    expect(data).toHaveLength(0);
    void buranchiCsClient;
  });
});
```

- [ ] **Step 2: Run tests**

```bash
pnpm db:test
```

Expected: all Phase 1+2+4+5 RLS tests pass.

- [ ] **Step 3: Commit**

```bash
git add supabase/tests/phase5-rls.test.ts
git commit -m "test(db): add Phase 5 RLS integration tests for the 5 loyalty tables"
```

---

### Task 5: RPC integration tests for `complete_booking_with_loyalty`

**Files:**
- Create: `supabase/tests/phase5-rpc.test.ts`

- [ ] **Step 1: Write the failing tests**

```ts
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

beforeAll(async () => {
  admin = createClient(SUPABASE_URL, SERVICE_KEY, { auth: { autoRefreshToken: false, persistSession: false } });
  const { data: b } = await admin.from('organizations').select('id').eq('slug', 'buranchi').single();
  orgId = b!.id;

  // Enable loyalty for the org
  await admin.from('organizations').update({ loyalty_enabled: true } as never).eq('id', orgId);

  const ts = Date.now();
  const { data: created } = await admin.auth.admin.createUser({
    email: `p5-rpc-${ts}@test.local`, password: 'test-password-123', email_confirm: true,
    user_metadata: { organization_id: orgId, full_name: 'RPC tester', role: 'admin' },
  });
  adminUserId = created!.user!.id;
  adminClient = createClient(SUPABASE_URL, ANON_KEY);
  await adminClient.auth.signInWithPassword({ email: `p5-rpc-${ts}@test.local`, password: 'test-password-123' });

  const { data: gold } = await admin.from('loyalty_tiers')
    .select('id').eq('organization_id', orgId).eq('tier_index', 2).single();
  goldTierId = gold!.id;

  const { data: cust } = await admin.from('customers').insert({
    organization_id: orgId, full_name: 'RPC member', is_member: true,
    member_since: new Date().toISOString(), points_balance: 1000, points_lifetime: 1000,
    current_tier_id: goldTierId,
  } as never).select('id').single();
  customerId = cust!.id;

  const { data: tbl } = await admin.from('tables').insert({
    organization_id: orgId, code: 'P5RPC' + ts, capacity: 4,
  } as never).select('id').single();
  tableId = tbl!.id;

  const startsAt = new Date(Date.now() + 60 * 60 * 1000).toISOString();
  const endsAt = new Date(Date.now() + 3 * 60 * 60 * 1000).toISOString();
  const { data: bk } = await admin.from('bookings').insert({
    organization_id: orgId, customer_id: customerId, table_id: tableId,
    starts_at: startsAt, ends_at: endsAt, party_size: 2,
    source: 'manual', status: 'confirmed', created_by: adminUserId,
  } as never).select('id').single();
  bookingId = bk!.id;

  const { data: r1 } = await admin.from('loyalty_rewards').insert({
    organization_id: orgId, name: 'RPC Free Dessert', type: 'free_item',
    points_cost: 200, min_tier_index: 0, is_active: true,
  } as never).select('id').single();
  dessertRewardId = r1!.id;

  const { data: r2 } = await admin.from('loyalty_rewards').insert({
    organization_id: orgId, name: 'RPC Gold-only', type: 'free_item',
    points_cost: 100, min_tier_index: 3, is_active: true, // Platinum-only
  } as never).select('id').single();
  goldOnlyRewardId = r2!.id;
});

afterAll(async () => {
  await admin.from('loyalty_redemptions').delete().eq('booking_id', bookingId);
  await admin.from('loyalty_transactions').delete().eq('booking_id', bookingId);
  await admin.from('bookings').delete().eq('id', bookingId);
  await admin.from('tables').delete().eq('id', tableId);
  await admin.from('loyalty_rewards').delete().eq('id', dessertRewardId);
  await admin.from('loyalty_rewards').delete().eq('id', goldOnlyRewardId);
  await admin.from('customers').delete().eq('id', customerId);
  await admin.auth.admin.deleteUser(adminUserId);
  await admin.from('organizations').update({ loyalty_enabled: false } as never).eq('id', orgId);
});

describe('complete_booking_with_loyalty RPC', () => {
  test('happy path: earn + 1 redemption + tier check', async () => {
    const { data, error } = await adminClient.rpc('complete_booking_with_loyalty', {
      p_booking_id: bookingId,
      p_bill_idr: 250000,                // = 25 points at 10000 idr/pt
      p_redemption_ids: [dessertRewardId],
    } as never);
    expect(error).toBeNull();
    const result = data as { points_earned: number; points_redeemed: number; new_balance: number; new_lifetime: number };
    expect(result.points_earned).toBe(25);
    expect(result.points_redeemed).toBe(200);
    expect(result.new_balance).toBe(1000 + 25 - 200); // 825
    expect(result.new_lifetime).toBe(1025);

    const { data: b } = await admin.from('bookings').select('status').eq('id', bookingId).single();
    expect(b?.status).toBe('completed');

    const { data: cust } = await admin.from('customers')
      .select('points_balance, points_lifetime').eq('id', customerId).single();
    expect(cust?.points_balance).toBe(825);
    expect(cust?.points_lifetime).toBe(1025);
  });

  test('insufficient_balance raises and rolls back atomically', async () => {
    // Reset booking to confirmed for the test
    await admin.from('bookings').update({ status: 'confirmed', completed_at: null } as never).eq('id', bookingId);
    const balanceBefore = 825;

    const { error } = await adminClient.rpc('complete_booking_with_loyalty', {
      p_booking_id: bookingId,
      p_bill_idr: 100000,
      p_redemption_ids: [dessertRewardId, dessertRewardId, dessertRewardId, dessertRewardId, dessertRewardId], // 5×200=1000 > 825
    } as never);
    expect(error).toBeTruthy();
    expect(error?.message).toMatch(/insufficient_balance/);

    // Verify no partial writes
    const { data: b } = await admin.from('bookings').select('status').eq('id', bookingId).single();
    expect(b?.status).toBe('confirmed'); // not completed
    const { data: cust } = await admin.from('customers')
      .select('points_balance').eq('id', customerId).single();
    expect(cust?.points_balance).toBe(balanceBefore); // unchanged
  });

  test('reward_tier_locked when tier insufficient', async () => {
    await admin.from('bookings').update({ status: 'confirmed', completed_at: null } as never).eq('id', bookingId);
    const { error } = await adminClient.rpc('complete_booking_with_loyalty', {
      p_booking_id: bookingId,
      p_bill_idr: 100000,
      p_redemption_ids: [goldOnlyRewardId], // requires Platinum (idx 3); customer is Gold (idx 2)
    } as never);
    expect(error?.message).toMatch(/reward_tier_locked/);
  });

  test('customer_not_member when is_member false', async () => {
    await admin.from('bookings').update({ status: 'confirmed', completed_at: null } as never).eq('id', bookingId);
    await admin.from('customers').update({ is_member: false } as never).eq('id', customerId);
    const { error } = await adminClient.rpc('complete_booking_with_loyalty', {
      p_booking_id: bookingId, p_bill_idr: 100000, p_redemption_ids: [],
    } as never);
    expect(error?.message).toMatch(/customer_not_member/);
    await admin.from('customers').update({ is_member: true } as never).eq('id', customerId); // restore
  });

  test('booking_not_completable when status is cancelled', async () => {
    await admin.from('bookings').update({ status: 'cancelled' } as never).eq('id', bookingId);
    const { error } = await adminClient.rpc('complete_booking_with_loyalty', {
      p_booking_id: bookingId, p_bill_idr: 100000, p_redemption_ids: [],
    } as never);
    expect(error?.message).toMatch(/booking_not_completable/);
  });
});
```

- [ ] **Step 2: Run tests**

```bash
pnpm db:test
```

Expected: 5 RPC tests pass + Phase 5 RLS tests + earlier phases.

- [ ] **Step 3: Commit**

```bash
git add supabase/tests/phase5-rpc.test.ts
git commit -m "test(db): add Phase 5 RPC tests proving atomicity + error paths"
```

---

### Task 6: Shared package — loyalty enums + Zod schemas

**Files:**
- Create: `packages/shared/src/enums/loyalty-reward-type.ts`
- Create: `packages/shared/src/schemas/loyalty-tier.ts`
- Create: `packages/shared/src/schemas/loyalty-reward.ts`
- Create: `packages/shared/src/schemas/loyalty-redeem.ts`
- Create: `packages/shared/src/schemas/loyalty-completion.ts`
- Modify: `packages/shared/src/index.ts`

- [ ] **Step 1: Write enum file**

`packages/shared/src/enums/loyalty-reward-type.ts`:

```ts
import { z } from 'zod';

export const LoyaltyRewardTypeSchema = z.enum([
  'free_item',
  'percent_discount',
  'rupiah_discount',
]);
export type LoyaltyRewardType = z.infer<typeof LoyaltyRewardTypeSchema>;

export const LOYALTY_REWARD_TYPE_LABELS: Record<LoyaltyRewardType, string> = {
  free_item: 'Free item',
  percent_discount: '% discount',
  rupiah_discount: 'Rp discount',
};
```

- [ ] **Step 2: Write `loyalty-tier.ts`**

```ts
import { z } from 'zod';

export const TierUpdateSchema = z.object({
  name: z.string().trim().min(1).max(40).optional(),
  min_points_lifetime: z.number().int().min(0).optional(),
  perks_text: z.string().trim().max(1000).nullable().optional(),
});
export type TierUpdate = z.infer<typeof TierUpdateSchema>;
```

- [ ] **Step 3: Write `loyalty-reward.ts`**

```ts
import { z } from 'zod';
import { LoyaltyRewardTypeSchema } from '../enums/loyalty-reward-type';

const baseReward = z.object({
  name: z.string().trim().min(1).max(120),
  description: z.string().trim().max(1000).optional(),
  type: LoyaltyRewardTypeSchema,
  type_value: z.number().int().min(0).default(0),
  points_cost: z.number().int().positive(),
  min_tier_index: z.number().int().min(0).max(3).default(0),
  is_active: z.boolean().default(true),
  sort_order: z.number().int().min(0).default(0),
});

export const RewardCreateSchema = baseReward.refine(
  (r) => {
    if (r.type === 'percent_discount') return r.type_value >= 1 && r.type_value <= 100;
    if (r.type === 'rupiah_discount') return r.type_value > 0;
    return true; // free_item: type_value is unused
  },
  { message: 'type_value must match the type (1–100 for percent, >0 for rupiah).' },
);
export type RewardCreate = z.infer<typeof RewardCreateSchema>;

export const RewardUpdateSchema = baseReward.partial();
export type RewardUpdate = z.infer<typeof RewardUpdateSchema>;
```

- [ ] **Step 4: Write `loyalty-redeem.ts`**

```ts
import { z } from 'zod';

export const AdjustPointsSchema = z.object({
  customer_id: z.string().uuid(),
  delta_points: z.number().int().refine((n) => n !== 0, { message: 'delta cannot be zero' }),
  reason: z.string().trim().min(1).max(500),
  affects_lifetime: z.boolean().default(false),
});
export type AdjustPoints = z.infer<typeof AdjustPointsSchema>;

export const VoidRedemptionSchema = z.object({
  redemption_id: z.string().uuid(),
  reason: z.string().trim().min(1).max(500),
});
export type VoidRedemption = z.infer<typeof VoidRedemptionSchema>;

export const RedeemRewardSchema = z.object({
  reward_id: z.string().uuid(),
  booking_id: z.string().uuid(),
});
export type RedeemReward = z.infer<typeof RedeemRewardSchema>;
```

- [ ] **Step 5: Write `loyalty-completion.ts`**

```ts
import { z } from 'zod';

export const CompleteBookingInputSchema = z.object({
  bill_idr: z.number().int().min(0).optional(),
  reward_redemption_ids: z.array(z.string().uuid()).default([]),
});
export type CompleteBookingInput = z.infer<typeof CompleteBookingInputSchema>;
```

- [ ] **Step 6: Update `packages/shared/src/index.ts`**

Add to the existing list of re-exports:

```ts
export * from './enums/loyalty-reward-type';
export * from './schemas/loyalty-tier';
export * from './schemas/loyalty-reward';
export * from './schemas/loyalty-redeem';
export * from './schemas/loyalty-completion';
```

- [ ] **Step 7: Verify typecheck**

```bash
pnpm --filter @buranchi/shared typecheck
```

- [ ] **Step 8: Commit**

```bash
git add packages/shared/src/enums/loyalty-reward-type.ts \
        packages/shared/src/schemas/loyalty-tier.ts \
        packages/shared/src/schemas/loyalty-reward.ts \
        packages/shared/src/schemas/loyalty-redeem.ts \
        packages/shared/src/schemas/loyalty-completion.ts \
        packages/shared/src/index.ts
git commit -m "feat(shared): add Phase 5 loyalty enums and Zod schemas"
```

---

### Task 7: Regenerate database types

**Files:**
- Modify: `packages/shared/src/types/database.ts`

- [ ] **Step 1: Run the type generator**

```bash
SUPABASE_ACCESS_TOKEN=<token from .env.local> pnpm db:types
```

- [ ] **Step 2: Verify the new tables + columns appear**

```bash
grep -c "loyalty_tiers" packages/shared/src/types/database.ts
grep -c "loyalty_rewards" packages/shared/src/types/database.ts
grep -c "loyalty_transactions" packages/shared/src/types/database.ts
grep -c "loyalty_redemptions" packages/shared/src/types/database.ts
grep -c "loyalty_adjustments" packages/shared/src/types/database.ts
grep -c "complete_booking_with_loyalty" packages/shared/src/types/database.ts
```
All should be > 0.

- [ ] **Step 3: Verify typecheck**

```bash
pnpm --filter @buranchi/shared typecheck
pnpm --filter @buranchi/web typecheck
```
Both should pass.

- [ ] **Step 4: Commit**

```bash
git add packages/shared/src/types/database.ts
git commit -m "chore(shared): regenerate Database types with Phase 5 tables and RPC"
```

---

### Task 8: `lib/loyalty/tier.ts` — `deriveTier` helper with TDD

**Files:**
- Create: `apps/web/lib/loyalty/tier.test.ts`
- Create: `apps/web/lib/loyalty/tier.ts`

- [ ] **Step 1: Write the failing test**

```ts
// apps/web/lib/loyalty/tier.test.ts
import { describe, expect, test } from 'vitest';
import { deriveTier, type Tier } from './tier';

const TIERS: Tier[] = [
  { id: 't0', tier_index: 0, name: 'Bronze',   min_points_lifetime: 0,    perks_text: null },
  { id: 't1', tier_index: 1, name: 'Silver',   min_points_lifetime: 500,  perks_text: null },
  { id: 't2', tier_index: 2, name: 'Gold',     min_points_lifetime: 2000, perks_text: null },
  { id: 't3', tier_index: 3, name: 'Platinum', min_points_lifetime: 5000, perks_text: null },
];

describe('deriveTier', () => {
  test('zero lifetime → Bronze', () => {
    expect(deriveTier(0, TIERS).tier_index).toBe(0);
  });

  test('threshold − 1 → previous tier', () => {
    expect(deriveTier(499, TIERS).tier_index).toBe(0);
    expect(deriveTier(1999, TIERS).tier_index).toBe(1);
    expect(deriveTier(4999, TIERS).tier_index).toBe(2);
  });

  test('exact threshold → that tier', () => {
    expect(deriveTier(500, TIERS).tier_index).toBe(1);
    expect(deriveTier(2000, TIERS).tier_index).toBe(2);
    expect(deriveTier(5000, TIERS).tier_index).toBe(3);
  });

  test('above max → top tier', () => {
    expect(deriveTier(99999999, TIERS).tier_index).toBe(3);
  });

  test('order-independent (input array order does not matter)', () => {
    const shuffled = [...TIERS].reverse();
    expect(deriveTier(750, shuffled).tier_index).toBe(1);
  });

  test('renamed tiers still work (no name dependency)', () => {
    const renamed: Tier[] = TIERS.map((t) => ({ ...t, name: `Custom-${t.tier_index}` }));
    expect(deriveTier(2500, renamed).name).toBe('Custom-2');
  });
});
```

- [ ] **Step 2: Run to verify failure**

```bash
pnpm --filter @buranchi/web test apps/web/lib/loyalty/tier.test.ts
```
Expected: cannot resolve `./tier`.

- [ ] **Step 3: Implement `tier.ts`**

```ts
// apps/web/lib/loyalty/tier.ts

export interface Tier {
  id: string;
  tier_index: number;
  name: string;
  min_points_lifetime: number;
  perks_text: string | null;
}

/**
 * Returns the tier whose threshold is the highest one ≤ lifetime.
 * Tier 0 (threshold 0) always matches when no higher tier qualifies.
 */
export function deriveTier(lifetime: number, tiers: readonly Tier[]): Tier {
  return [...tiers]
    .sort((a, b) => b.tier_index - a.tier_index)
    .find((t) => lifetime >= t.min_points_lifetime)!;
}
```

- [ ] **Step 4: Run tests**

```bash
pnpm --filter @buranchi/web test apps/web/lib/loyalty/tier.test.ts
```
Expected: 6/6 pass.

- [ ] **Step 5: Commit**

```bash
git add apps/web/lib/loyalty/tier.ts apps/web/lib/loyalty/tier.test.ts
git commit -m "feat(loyalty): add deriveTier pure helper with TDD"
```

---

### Task 9: `lib/loyalty/earn.ts` — `computePointsForBill` with TDD

**Files:**
- Create: `apps/web/lib/loyalty/earn.test.ts`
- Create: `apps/web/lib/loyalty/earn.ts`

- [ ] **Step 1: Write the failing test**

```ts
// apps/web/lib/loyalty/earn.test.ts
import { describe, expect, test } from 'vitest';
import { computePointsForBill } from './earn';

describe('computePointsForBill', () => {
  test('zero bill → 0', () => {
    expect(computePointsForBill(0, 10000)).toBe(0);
  });

  test('bill < earn rate → 0 (rounds down)', () => {
    expect(computePointsForBill(5000, 10000)).toBe(0);
    expect(computePointsForBill(9999, 10000)).toBe(0);
  });

  test('exact earn rate → 1', () => {
    expect(computePointsForBill(10000, 10000)).toBe(1);
  });

  test('large bill → integer division', () => {
    expect(computePointsForBill(250000, 10000)).toBe(25);
    expect(computePointsForBill(7500000, 10000)).toBe(750);
  });

  test('different earn rates', () => {
    expect(computePointsForBill(50000, 5000)).toBe(10);
    expect(computePointsForBill(100000, 1000)).toBe(100);
  });

  test('negative bill → 0 (defensive)', () => {
    expect(computePointsForBill(-1, 10000)).toBe(0);
  });

  test('non-positive earn rate → 0 (defensive)', () => {
    expect(computePointsForBill(100000, 0)).toBe(0);
    expect(computePointsForBill(100000, -1)).toBe(0);
  });
});
```

- [ ] **Step 2: Run to fail**

- [ ] **Step 3: Implement `earn.ts`**

```ts
// apps/web/lib/loyalty/earn.ts

export function computePointsForBill(billIdr: number, earnRateIdrPerPoint: number): number {
  if (billIdr < 0 || earnRateIdrPerPoint <= 0) return 0;
  return Math.floor(billIdr / earnRateIdrPerPoint);
}
```

- [ ] **Step 4: Run tests**

```bash
pnpm --filter @buranchi/web test apps/web/lib/loyalty/earn.test.ts
```
Expected: 7/7 pass.

- [ ] **Step 5: Commit**

```bash
git add apps/web/lib/loyalty/earn.ts apps/web/lib/loyalty/earn.test.ts
git commit -m "feat(loyalty): add computePointsForBill pure helper with TDD"
```

---

### Task 10: Server actions — `loyalty-members.ts`

**Files:**
- Create: `apps/web/lib/actions/loyalty-members.ts`

- [ ] **Step 1: Write the file**

```ts
// apps/web/lib/actions/loyalty-members.ts
'use server';

import { revalidatePath } from 'next/cache';
import { requireRole } from '@/lib/auth/server';
import { createServerClient } from '@/lib/supabase/server';
import { ActionError } from '@/lib/auth/errors';

export async function enrollMemberAction(customerId: string) {
  const profile = await requireRole(['admin', 'front_desk']);
  if (!customerId) throw new ActionError('NOT_FOUND', 'customer_id required');
  const supabase = await createServerClient();

  // Find tier_index 0 for this org
  const { data: bronze } = await supabase
    .from('loyalty_tiers')
    .select('id')
    .eq('organization_id', profile.organization_id)
    .eq('tier_index', 0)
    .single();
  if (!bronze) throw new ActionError('NO_TIERS', 'Tiers not seeded for this org.');

  const { data, error } = await supabase
    .from('customers')
    .update({
      is_member: true,
      member_since: new Date().toISOString(),
      current_tier_id: (bronze as { id: string }).id,
    } as never)
    .eq('id', customerId)
    .eq('organization_id', profile.organization_id)
    .select('id');
  if (error) throw new ActionError(error.code ?? 'DB', error.message);
  if (!data || data.length === 0) throw new ActionError('NOT_UPDATED', 'Customer not found or RLS-blocked.');

  revalidatePath(`/customers/${customerId}`);
  return { ok: true as const };
}

export async function unenrollMemberAction(customerId: string) {
  const profile = await requireRole(['admin']);
  const supabase = await createServerClient();

  const { error } = await supabase
    .from('customers')
    .update({
      is_member: false,
      current_tier_id: null,
      // Intentionally NOT clearing points_balance / points_lifetime —
      // re-enrolling restores the member at their existing tier.
    } as never)
    .eq('id', customerId)
    .eq('organization_id', profile.organization_id);
  if (error) throw new ActionError(error.code ?? 'DB', error.message);

  revalidatePath(`/customers/${customerId}`);
  return { ok: true as const };
}
```

- [ ] **Step 2: Typecheck and commit**

```bash
pnpm --filter @buranchi/web typecheck
git add apps/web/lib/actions/loyalty-members.ts
git commit -m "feat(loyalty): add enroll/unenroll member actions"
```

---

### Task 11: Server actions — `loyalty-tiers.ts`

**Files:**
- Create: `apps/web/lib/actions/loyalty-tiers.ts`

- [ ] **Step 1: Write the file**

```ts
// apps/web/lib/actions/loyalty-tiers.ts
'use server';

import { revalidatePath } from 'next/cache';
import { TierUpdateSchema } from '@buranchi/shared';
import { requireRole } from '@/lib/auth/server';
import { createServerClient } from '@/lib/supabase/server';
import { ActionError } from '@/lib/auth/errors';

export async function updateTierAction(tierId: string, input: unknown) {
  const profile = await requireRole(['admin']);
  const parsed = TierUpdateSchema.parse(input);
  const supabase = await createServerClient();

  // Load existing 4 tiers to enforce monotonic thresholds + tier-0 rule
  const { data: tiers } = await supabase
    .from('loyalty_tiers')
    .select('id, tier_index, min_points_lifetime')
    .eq('organization_id', profile.organization_id)
    .order('tier_index', { ascending: true });
  const rows = (tiers ?? []) as Array<{ id: string; tier_index: number; min_points_lifetime: number }>;
  const target = rows.find((t) => t.id === tierId);
  if (!target) throw new ActionError('NOT_FOUND', 'Tier not in this org.');

  // If admin is changing min_points_lifetime, validate:
  //  - tier_index 0 must stay at 0
  //  - thresholds must remain strictly increasing
  if (parsed.min_points_lifetime !== undefined) {
    if (target.tier_index === 0 && parsed.min_points_lifetime !== 0) {
      throw new ActionError('INVALID_TIER_0', 'Tier 0 threshold must be 0.');
    }
    const projected = rows.map((r) =>
      r.id === tierId ? { ...r, min_points_lifetime: parsed.min_points_lifetime! } : r,
    );
    for (let i = 1; i < projected.length; i += 1) {
      if (projected[i]!.min_points_lifetime <= projected[i - 1]!.min_points_lifetime) {
        throw new ActionError('NON_MONOTONIC', 'Thresholds must be strictly increasing across tiers.');
      }
    }
  }

  const update: Record<string, unknown> = {};
  if (parsed.name !== undefined) update.name = parsed.name;
  if (parsed.min_points_lifetime !== undefined) update.min_points_lifetime = parsed.min_points_lifetime;
  if (parsed.perks_text !== undefined) update.perks_text = parsed.perks_text ?? null;

  const { error } = await supabase
    .from('loyalty_tiers')
    .update(update as never)
    .eq('id', tierId);
  if (error) throw new ActionError(error.code ?? 'DB', error.message);

  revalidatePath('/settings/loyalty');
  return { ok: true as const };
}
```

- [ ] **Step 2: Typecheck and commit**

```bash
pnpm --filter @buranchi/web typecheck
git add apps/web/lib/actions/loyalty-tiers.ts
git commit -m "feat(loyalty): add updateTier action with monotonic-threshold enforcement"
```

---

### Task 12: Server actions — `loyalty-rewards.ts`

**Files:**
- Create: `apps/web/lib/actions/loyalty-rewards.ts`

- [ ] **Step 1: Write the file**

```ts
// apps/web/lib/actions/loyalty-rewards.ts
'use server';

import { revalidatePath } from 'next/cache';
import { RewardCreateSchema, RewardUpdateSchema } from '@buranchi/shared';
import { requireRole } from '@/lib/auth/server';
import { createServerClient } from '@/lib/supabase/server';
import { ActionError } from '@/lib/auth/errors';

export async function createRewardAction(input: unknown) {
  const profile = await requireRole(['admin']);
  const parsed = RewardCreateSchema.parse(input);
  const supabase = await createServerClient();
  const { error } = await supabase.from('loyalty_rewards').insert({
    organization_id: profile.organization_id,
    name: parsed.name,
    description: parsed.description ?? null,
    type: parsed.type,
    type_value: parsed.type_value,
    points_cost: parsed.points_cost,
    min_tier_index: parsed.min_tier_index,
    is_active: parsed.is_active,
    sort_order: parsed.sort_order,
  } as never);
  if (error) throw new ActionError(error.code ?? 'DB', error.message);
  revalidatePath('/settings/loyalty');
}

export async function updateRewardAction(id: string, input: unknown) {
  await requireRole(['admin']);
  const parsed = RewardUpdateSchema.parse(input);
  const supabase = await createServerClient();
  const update: Record<string, unknown> = {};
  if (parsed.name !== undefined) update.name = parsed.name;
  if (parsed.description !== undefined) update.description = parsed.description ?? null;
  if (parsed.type !== undefined) update.type = parsed.type;
  if (parsed.type_value !== undefined) update.type_value = parsed.type_value;
  if (parsed.points_cost !== undefined) update.points_cost = parsed.points_cost;
  if (parsed.min_tier_index !== undefined) update.min_tier_index = parsed.min_tier_index;
  if (parsed.is_active !== undefined) update.is_active = parsed.is_active;
  if (parsed.sort_order !== undefined) update.sort_order = parsed.sort_order;

  const { error } = await supabase.from('loyalty_rewards').update(update as never).eq('id', id);
  if (error) throw new ActionError(error.code ?? 'DB', error.message);
  revalidatePath('/settings/loyalty');
}

export async function deleteRewardAction(id: string) {
  await requireRole(['admin']);
  const supabase = await createServerClient();
  const { error } = await supabase.from('loyalty_rewards').delete().eq('id', id);
  if (error) throw new ActionError(error.code ?? 'DB', error.message);
  revalidatePath('/settings/loyalty');
}
```

- [ ] **Step 2: Typecheck and commit**

```bash
pnpm --filter @buranchi/web typecheck
git add apps/web/lib/actions/loyalty-rewards.ts
git commit -m "feat(loyalty): add reward catalog CRUD actions"
```

---

### Task 13: Server actions — `loyalty-redeem.ts`

**Files:**
- Create: `apps/web/lib/actions/loyalty-redeem.ts`

- [ ] **Step 1: Write the file**

```ts
// apps/web/lib/actions/loyalty-redeem.ts
'use server';

import { revalidatePath } from 'next/cache';
import {
  AdjustPointsSchema, VoidRedemptionSchema, RedeemRewardSchema, deriveTier,
} from '@buranchi/shared';
import { requireRole } from '@/lib/auth/server';
import { createServerClient } from '@/lib/supabase/server';
import { ActionError } from '@/lib/auth/errors';

interface CustomerRow {
  id: string; organization_id: string; is_member: boolean;
  points_balance: number; points_lifetime: number; current_tier_id: string | null;
}

export async function redeemRewardAction(input: unknown) {
  const profile = await requireRole(['admin', 'front_desk']);
  const parsed = RedeemRewardSchema.parse(input);
  const supabase = await createServerClient();

  // Load booking + customer + reward
  const { data: bk } = await supabase
    .from('bookings')
    .select('id, organization_id, customer_id, status')
    .eq('id', parsed.booking_id).single();
  if (!bk) throw new ActionError('NOT_FOUND', 'Booking not found.');
  if ((bk as { organization_id: string }).organization_id !== profile.organization_id) {
    throw new ActionError('FORBIDDEN', 'Cross-tenant booking access.');
  }
  if (!['confirmed', 'seated'].includes((bk as { status: string }).status)) {
    throw new ActionError('BAD_STATE', 'Booking must be confirmed or seated.');
  }

  const { data: customer } = await supabase
    .from('customers')
    .select('id, organization_id, is_member, points_balance, points_lifetime, current_tier_id')
    .eq('id', (bk as { customer_id: string }).customer_id).single();
  const cust = customer as CustomerRow | null;
  if (!cust || !cust.is_member) throw new ActionError('NOT_MEMBER', 'Customer is not a member.');

  const { data: reward } = await supabase
    .from('loyalty_rewards')
    .select('id, organization_id, name, type, type_value, points_cost, min_tier_index, is_active')
    .eq('id', parsed.reward_id).single();
  const rw = reward as {
    organization_id: string; name: string; type: 'free_item' | 'percent_discount' | 'rupiah_discount';
    type_value: number; points_cost: number; min_tier_index: number; is_active: boolean;
  } | null;
  if (!rw) throw new ActionError('NOT_FOUND', 'Reward not found.');
  if (rw.organization_id !== profile.organization_id) throw new ActionError('FORBIDDEN', 'Cross-tenant reward.');
  if (!rw.is_active) throw new ActionError('REWARD_INACTIVE', 'Reward is inactive.');

  // Tier check
  const { data: customerTier } = cust.current_tier_id
    ? await supabase.from('loyalty_tiers').select('tier_index').eq('id', cust.current_tier_id).single()
    : { data: null };
  const customerTierIndex = (customerTier as { tier_index: number } | null)?.tier_index ?? 0;
  if (customerTierIndex < rw.min_tier_index) {
    throw new ActionError('REWARD_TIER_LOCKED', `${rw.name} requires a higher tier.`);
  }

  if (rw.points_cost > cust.points_balance) {
    throw new ActionError('INSUFFICIENT_BALANCE', 'Not enough points.');
  }

  // Insert redemption + decrement balance (sequenced; not full RPC since not at completion)
  const { error: insErr } = await supabase.from('loyalty_redemptions').insert({
    organization_id: profile.organization_id,
    customer_id: cust.id,
    reward_id: parsed.reward_id,
    reward_name: rw.name,
    reward_type: rw.type,
    reward_type_value: rw.type_value,
    points_spent: rw.points_cost,
    booking_id: parsed.booking_id,
    status: 'applied',
    created_by: profile.id,
  } as never);
  if (insErr) throw new ActionError(insErr.code ?? 'DB', insErr.message);

  const { error: updErr } = await supabase
    .from('customers')
    .update({ points_balance: cust.points_balance - rw.points_cost } as never)
    .eq('id', cust.id);
  if (updErr) throw new ActionError(updErr.code ?? 'DB', updErr.message);

  revalidatePath(`/bookings/${parsed.booking_id}`);
  revalidatePath(`/customers/${cust.id}`);
  return { ok: true as const };
}

export async function voidRedemptionAction(input: unknown) {
  const profile = await requireRole(['admin', 'front_desk']);
  const parsed = VoidRedemptionSchema.parse(input);
  const supabase = await createServerClient();

  const { data: red } = await supabase
    .from('loyalty_redemptions')
    .select('id, organization_id, customer_id, points_spent, status')
    .eq('id', parsed.redemption_id).single();
  const r = red as {
    id: string; organization_id: string; customer_id: string; points_spent: number; status: string;
  } | null;
  if (!r) throw new ActionError('NOT_FOUND', 'Redemption not found.');
  if (r.organization_id !== profile.organization_id) throw new ActionError('FORBIDDEN', 'Cross-tenant.');
  if (r.status !== 'applied') throw new ActionError('BAD_STATE', 'Only applied redemptions can be voided.');

  const { error: voidErr } = await supabase
    .from('loyalty_redemptions')
    .update({
      status: 'voided',
      voided_at: new Date().toISOString(),
      voided_reason: parsed.reason,
    } as never)
    .eq('id', r.id);
  if (voidErr) throw new ActionError(voidErr.code ?? 'DB', voidErr.message);

  // Refund points to balance (lifetime untouched)
  const { data: cust } = await supabase
    .from('customers').select('points_balance').eq('id', r.customer_id).single();
  await supabase.from('customers')
    .update({ points_balance: ((cust as { points_balance: number }).points_balance ?? 0) + r.points_spent } as never)
    .eq('id', r.customer_id);

  revalidatePath(`/customers/${r.customer_id}`);
  return { ok: true as const };
}

export async function adjustPointsAction(input: unknown) {
  const profile = await requireRole(['admin']);
  const parsed = AdjustPointsSchema.parse(input);
  const supabase = await createServerClient();

  const { data: cust } = await supabase
    .from('customers')
    .select('id, organization_id, points_balance, points_lifetime, current_tier_id')
    .eq('id', parsed.customer_id).single();
  const c = cust as CustomerRow | null;
  if (!c || c.organization_id !== profile.organization_id) {
    throw new ActionError('NOT_FOUND', 'Customer not in this org.');
  }
  const newBalance = c.points_balance + parsed.delta_points;
  if (newBalance < 0) throw new ActionError('NEGATIVE_BALANCE', 'Resulting balance cannot be negative.');

  // Insert adjustment row
  const { error: insErr } = await supabase.from('loyalty_adjustments').insert({
    organization_id: profile.organization_id,
    customer_id: c.id,
    delta_points: parsed.delta_points,
    reason: parsed.reason,
    affects_lifetime: parsed.affects_lifetime,
    created_by: profile.id,
  } as never);
  if (insErr) throw new ActionError(insErr.code ?? 'DB', insErr.message);

  // Update customer counters
  let newLifetime = c.points_lifetime;
  let newTierId = c.current_tier_id;
  if (parsed.affects_lifetime) {
    newLifetime = Math.max(0, c.points_lifetime + parsed.delta_points);
    const { data: tiers } = await supabase
      .from('loyalty_tiers')
      .select('id, tier_index, name, min_points_lifetime, perks_text')
      .eq('organization_id', profile.organization_id);
    if (tiers && tiers.length > 0) {
      newTierId = deriveTier(newLifetime, tiers as never).id;
    }
  }

  const { error: updErr } = await supabase
    .from('customers')
    .update({
      points_balance: newBalance,
      points_lifetime: newLifetime,
      current_tier_id: newTierId,
    } as never)
    .eq('id', c.id);
  if (updErr) throw new ActionError(updErr.code ?? 'DB', updErr.message);

  revalidatePath(`/customers/${c.id}`);
  return { ok: true as const };
}
```

- [ ] **Step 2: Typecheck and commit**

```bash
pnpm --filter @buranchi/web typecheck
git add apps/web/lib/actions/loyalty-redeem.ts
git commit -m "feat(loyalty): add redeem/void/adjust actions with tenant + tier checks"
```

---

### Task 14: Modify `lib/actions/bookings.ts` — add `completeBookingAction`

**Files:**
- Modify: `apps/web/lib/actions/bookings.ts`

- [ ] **Step 1: Add the new action at the bottom of the file**

Append after the existing actions:

```ts
import { CompleteBookingInputSchema } from '@buranchi/shared';

interface CompletionContext {
  customer_id: string;
  is_member: boolean;
  loyalty_enabled: boolean;
}

export async function completeBookingAction(bookingId: string, input: unknown) {
  await requireRole(['admin', 'front_desk']);
  const parsed = CompleteBookingInputSchema.parse(input);
  const supabase = await createServerClient();

  // Read enough to decide: loyalty path or simple path?
  const { data } = await supabase
    .from('bookings')
    .select(`
      id, organization_id, customer_id,
      customer:customers!inner(is_member),
      org:organizations!inner(loyalty_enabled)
    `)
    .eq('id', bookingId)
    .single();
  const ctx = data as unknown as {
    id: string;
    customer_id: string;
    customer: { is_member: boolean };
    org: { loyalty_enabled: boolean };
  } | null;
  if (!ctx) throw new ActionError('NOT_FOUND', 'Booking not found.');

  const useLoyalty =
    parsed.bill_idr !== undefined &&
    ctx.customer.is_member === true &&
    ctx.org.loyalty_enabled === true;

  if (!useLoyalty) {
    return transitionBookingAction(bookingId, { next: 'completed' });
  }

  // Loyalty path — single atomic RPC
  const { data: result, error } = await supabase.rpc('complete_booking_with_loyalty', {
    p_booking_id: bookingId,
    p_bill_idr: parsed.bill_idr!,
    p_redemption_ids: parsed.reward_redemption_ids,
  } as never);
  if (error) {
    const msg = error.message ?? 'failed';
    throw new ActionError(error.code ?? 'RPC_ERROR', msg);
  }
  revalidatePath(`/bookings/${bookingId}`);
  revalidatePath('/bookings');
  revalidatePath(`/customers/${ctx.customer_id}`);
  return result;
}
```

- [ ] **Step 2: Typecheck and commit**

```bash
pnpm --filter @buranchi/web typecheck
git add apps/web/lib/actions/bookings.ts
git commit -m "feat(loyalty): add completeBookingAction wrapper that branches into RPC"
```

---

### Task 15: Modify `lib/actions/bookings.ts` — refund redemptions on cancel

**Files:**
- Modify: `apps/web/lib/actions/bookings.ts`

- [ ] **Step 1: Update `transitionBookingAction` to fire refund when cancelling**

Find the existing `transitionBookingAction` function. Locate the place where it sets `next === 'cancelled'`. Before the booking row update, add the redemption refund:

```ts
// Inside transitionBookingAction, after parsed.next === 'cancelled' detected
// and before the bookings update statement, add:

if (parsed.next === 'cancelled') {
  const { data: applied } = await supabase
    .from('loyalty_redemptions')
    .select('id, customer_id, points_spent')
    .eq('booking_id', id)
    .eq('status', 'applied');
  const rows = (applied ?? []) as Array<{ id: string; customer_id: string; points_spent: number }>;
  for (const r of rows) {
    await supabase.from('loyalty_redemptions').update({
      status: 'voided',
      voided_at: new Date().toISOString(),
      voided_reason: 'booking_cancelled',
    } as never).eq('id', r.id);

    const { data: c } = await supabase.from('customers')
      .select('points_balance').eq('id', r.customer_id).single();
    await supabase.from('customers')
      .update({
        points_balance: ((c as { points_balance: number }).points_balance ?? 0) + r.points_spent,
      } as never)
      .eq('id', r.customer_id);
  }
}
```

- [ ] **Step 2: Typecheck and commit**

```bash
pnpm --filter @buranchi/web typecheck
git add apps/web/lib/actions/bookings.ts
git commit -m "feat(loyalty): refund applied redemptions when a booking is cancelled"
```

---

### Task 16: Component — `LoyaltyStatusBadge`

**Files:**
- Create: `apps/web/components/loyalty-status-badge.tsx`

- [ ] **Step 1: Write the component**

```tsx
'use client';

import * as React from 'react';
import { Trophy } from 'lucide-react';
import { cn } from '@buranchi/ui';

interface LoyaltyStatusBadgeProps {
  tierName: string;
  tierIndex: number;
  pointsBalance: number;
  pointsLifetime: number;
  nextTierName: string | null;
  nextTierThreshold: number | null;
  className?: string;
}

const TIER_COLOR: Record<number, string> = {
  0: 'bg-row-divider text-muted',
  1: 'bg-accent-soft text-accent',
  2: 'bg-success-soft text-success',
  3: 'bg-fg text-white',
};

export function LoyaltyStatusBadge({
  tierName, tierIndex, pointsBalance, pointsLifetime,
  nextTierName, nextTierThreshold, className,
}: LoyaltyStatusBadgeProps) {
  const progress = nextTierThreshold && nextTierThreshold > pointsLifetime
    ? Math.min(100, Math.round((pointsLifetime / nextTierThreshold) * 100))
    : 100;
  const remaining = nextTierThreshold && nextTierThreshold > pointsLifetime
    ? nextTierThreshold - pointsLifetime
    : 0;

  return (
    <div className={cn('rounded-card bg-surface shadow-card p-card-pad space-y-3', className)}>
      <div className="flex items-center gap-3">
        <span className={cn('inline-flex items-center gap-1.5 rounded-pill px-2.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide', TIER_COLOR[tierIndex] ?? TIER_COLOR[0])}>
          <Trophy className="h-3 w-3" />
          {tierName}
        </span>
        <div className="text-[12px] text-muted">
          {pointsLifetime.toLocaleString()} lifetime
        </div>
      </div>
      <div>
        <p className="text-title text-fg font-bold leading-none">
          {pointsBalance.toLocaleString()} <span className="text-[12px] text-muted font-normal">pts</span>
        </p>
        {nextTierName && remaining > 0 ? (
          <p className="text-[11px] text-muted mt-1">
            {remaining.toLocaleString()} pts to {nextTierName}
          </p>
        ) : (
          <p className="text-[11px] text-muted mt-1">Top tier</p>
        )}
      </div>
      {nextTierName && remaining > 0 ? (
        <div className="h-1.5 rounded-pill bg-canvas overflow-hidden">
          <div className="h-full bg-accent" style={{ width: `${progress}%` }} />
        </div>
      ) : null}
    </div>
  );
}
```

- [ ] **Step 2: Typecheck and commit**

```bash
pnpm --filter @buranchi/web typecheck
git add apps/web/components/loyalty-status-badge.tsx
git commit -m "feat(loyalty): add LoyaltyStatusBadge component"
```

---

### Task 17: Component — `LoyaltyMemberToggle`

**Files:**
- Create: `apps/web/components/loyalty-member-toggle.tsx`

- [ ] **Step 1: Write the component**

```tsx
'use client';

import * as React from 'react';
import { useRouter } from 'next/navigation';
import { Sparkles } from 'lucide-react';
import { Button, Card } from '@buranchi/ui';
import { enrollMemberAction, unenrollMemberAction } from '@/lib/actions/loyalty-members';

interface LoyaltyMemberToggleProps {
  customerId: string;
  customerName: string;
  isMember: boolean;
  programName: string;
}

export function LoyaltyMemberToggle({
  customerId, customerName, isMember, programName,
}: LoyaltyMemberToggleProps) {
  const router = useRouter();
  const [pending, startTransition] = React.useTransition();
  const [error, setError] = React.useState<string | undefined>();

  function enroll() {
    setError(undefined);
    startTransition(async () => {
      try { await enrollMemberAction(customerId); router.refresh(); }
      catch (e) { setError(e instanceof Error ? e.message : 'Failed'); }
    });
  }
  function unenroll() {
    if (!confirm(`Remove ${customerName} from ${programName}? Their points stay; tier resets to none.`)) return;
    setError(undefined);
    startTransition(async () => {
      try { await unenrollMemberAction(customerId); router.refresh(); }
      catch (e) { setError(e instanceof Error ? e.message : 'Failed'); }
    });
  }

  if (!isMember) {
    return (
      <Card className="flex items-center gap-3">
        <div className="h-9 w-9 rounded-pill bg-canvas flex items-center justify-center text-muted">
          <Sparkles className="h-4 w-4" />
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-[12px] text-fg">{customerName} is not a member of {programName}</p>
          <p className="text-[11px] text-muted">Enroll to start earning points on bookings.</p>
        </div>
        <Button size="sm" onClick={enroll} disabled={pending}>
          {pending ? 'Enrolling…' : 'Enroll'}
        </Button>
        {error ? <p className="text-[11px] text-danger">{error}</p> : null}
      </Card>
    );
  }

  return (
    <div className="flex justify-end">
      <Button size="sm" variant="ghost" onClick={unenroll} disabled={pending}>
        Remove from {programName}
      </Button>
    </div>
  );
}
```

- [ ] **Step 2: Typecheck and commit**

```bash
pnpm --filter @buranchi/web typecheck
git add apps/web/components/loyalty-member-toggle.tsx
git commit -m "feat(loyalty): add LoyaltyMemberToggle component"
```

---

### Task 18: Component — `LoyaltyRedemptionHistory`

**Files:**
- Create: `apps/web/components/loyalty-redemption-history.tsx`

- [ ] **Step 1: Write the component**

```tsx
'use client';

import * as React from 'react';
import { TrendingUp, TrendingDown, Settings } from 'lucide-react';
import type { LoyaltyRewardType } from '@buranchi/shared';

export interface HistoryRow {
  kind: 'earn' | 'redeem' | 'adjust';
  ts: string;                                       // ISO
  points: number;                                   // positive earn, positive redeem (will display as negative)
  label: string;                                    // human description
  meta?: { rewardType?: LoyaltyRewardType; reason?: string; status?: string; bookingId?: string };
}

export function LoyaltyRedemptionHistory({ rows }: { rows: HistoryRow[] }) {
  if (rows.length === 0) {
    return (
      <div className="rounded-card bg-surface shadow-card py-8 text-center">
        <p className="text-[12px] text-muted">No loyalty activity yet.</p>
      </div>
    );
  }
  return (
    <div className="rounded-card bg-surface shadow-card overflow-hidden">
      <div className="px-4 grid grid-cols-[28px_1fr_80px_140px] py-3 text-label uppercase text-muted border-b border-border">
        <div></div>
        <div>Detail</div>
        <div className="text-right">Points</div>
        <div>When</div>
      </div>
      {rows.map((r, i) => {
        const Icon = r.kind === 'earn' ? TrendingUp : r.kind === 'redeem' ? TrendingDown : Settings;
        const color = r.kind === 'earn' ? 'text-success' : r.kind === 'redeem' ? 'text-danger' : 'text-muted';
        const sign = r.kind === 'earn' ? '+' : r.kind === 'redeem' ? '−' : (r.points >= 0 ? '+' : '−');
        const display = Math.abs(r.points).toLocaleString();
        const dateStr = new Date(r.ts).toLocaleDateString([], { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
        return (
          <div key={i} className="px-4 grid grid-cols-[28px_1fr_80px_140px] py-3 border-b border-row-divider last:border-b-0 text-[12px] items-center">
            <Icon className={`h-3.5 w-3.5 ${color}`} />
            <div className="min-w-0">
              <p className="text-fg truncate">{r.label}</p>
              {r.meta?.reason ? <p className="text-[11px] text-muted truncate">{r.meta.reason}</p> : null}
              {r.meta?.status === 'voided' ? <p className="text-[11px] text-danger">voided</p> : null}
            </div>
            <div className={`text-right font-mono ${color}`}>{sign}{display}</div>
            <div className="text-muted">{dateStr}</div>
          </div>
        );
      })}
    </div>
  );
}
```

- [ ] **Step 2: Typecheck and commit**

```bash
pnpm --filter @buranchi/web typecheck
git add apps/web/components/loyalty-redemption-history.tsx
git commit -m "feat(loyalty): add LoyaltyRedemptionHistory component"
```

---

### Task 19: Component — `LoyaltyAdjustmentDialog`

**Files:**
- Create: `apps/web/components/loyalty-adjustment-dialog.tsx`

- [ ] **Step 1: Write the component**

```tsx
'use client';

import * as React from 'react';
import { useRouter } from 'next/navigation';
import { Button, Input, Textarea, FormField } from '@buranchi/ui';
import { adjustPointsAction } from '@/lib/actions/loyalty-redeem';

interface LoyaltyAdjustmentDialogProps {
  customerId: string;
  open: boolean;
  onClose: () => void;
}

export function LoyaltyAdjustmentDialog({ customerId, open, onClose }: LoyaltyAdjustmentDialogProps) {
  const router = useRouter();
  const [delta, setDelta] = React.useState(0);
  const [reason, setReason] = React.useState('');
  const [affectsLifetime, setAffectsLifetime] = React.useState(false);
  const [pending, startTransition] = React.useTransition();
  const [error, setError] = React.useState<string | undefined>();

  React.useEffect(() => {
    if (open) { setDelta(0); setReason(''); setAffectsLifetime(false); setError(undefined); }
  }, [open]);

  function submit() {
    if (delta === 0 || !reason.trim()) {
      setError('Delta must be non-zero and reason is required.');
      return;
    }
    setError(undefined);
    startTransition(async () => {
      try {
        await adjustPointsAction({
          customer_id: customerId, delta_points: delta, reason: reason.trim(), affects_lifetime: affectsLifetime,
        });
        onClose();
        router.refresh();
      } catch (e) {
        setError(e instanceof Error ? e.message : 'Failed');
      }
    });
  }

  if (!open) return null;
  return (
    <div className="fixed inset-0 z-30 bg-fg/40 flex items-center justify-center p-4" onClick={onClose}>
      <div className="rounded-card bg-surface shadow-popover p-5 w-[420px]" onClick={(e) => e.stopPropagation()}>
        <h2 className="text-body-strong text-fg mb-3">Adjust points</h2>
        <div className="space-y-3">
          <FormField id="adj-delta" label="Delta points" hint="Positive to gift, negative to deduct" required>
            <Input id="adj-delta" type="number" value={delta} onChange={(e) => setDelta(Number(e.target.value))} />
          </FormField>
          <FormField id="adj-reason" label="Reason" required>
            <Textarea id="adj-reason" value={reason} onChange={(e) => setReason(e.target.value)} placeholder="VIP welcome / refund / complaint resolution" />
          </FormField>
          <label className="inline-flex items-center gap-2 text-[12px] text-fg">
            <input type="checkbox" checked={affectsLifetime} onChange={(e) => setAffectsLifetime(e.target.checked)} />
            <span>Also affects lifetime points (changes tier)</span>
          </label>
          {error ? <p className="text-[12px] text-danger">{error}</p> : null}
          <div className="flex gap-2 justify-end">
            <Button variant="ghost" onClick={onClose} disabled={pending}>Cancel</Button>
            <Button onClick={submit} disabled={pending}>{pending ? 'Saving…' : 'Save'}</Button>
          </div>
        </div>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Typecheck and commit**

```bash
pnpm --filter @buranchi/web typecheck
git add apps/web/components/loyalty-adjustment-dialog.tsx
git commit -m "feat(loyalty): add LoyaltyAdjustmentDialog component"
```

---

### Task 20: Component — `LoyaltyTiersEditor`

**Files:**
- Create: `apps/web/components/loyalty-tiers-editor.tsx`

- [ ] **Step 1: Write the component**

```tsx
'use client';

import * as React from 'react';
import { Pencil } from 'lucide-react';
import { Button, Input, Textarea, FormField } from '@buranchi/ui';
import { updateTierAction } from '@/lib/actions/loyalty-tiers';

export interface TierRow {
  id: string;
  tier_index: number;
  name: string;
  min_points_lifetime: number;
  perks_text: string | null;
}

export function LoyaltyTiersEditor({ rows }: { rows: TierRow[] }) {
  const [editingId, setEditingId] = React.useState<string | null>(null);
  const [pending, startTransition] = React.useTransition();
  const [error, setError] = React.useState<string | undefined>();

  function save(tierId: string, values: { name: string; min_points_lifetime: number; perks_text: string }) {
    setError(undefined);
    startTransition(async () => {
      try {
        await updateTierAction(tierId, {
          name: values.name,
          min_points_lifetime: values.min_points_lifetime,
          perks_text: values.perks_text || null,
        });
        setEditingId(null);
      } catch (e) {
        setError(e instanceof Error ? e.message : 'Failed');
      }
    });
  }

  return (
    <div className="space-y-3">
      {error ? <p className="text-[12px] text-danger">{error}</p> : null}
      <div className="rounded-card bg-surface shadow-card overflow-hidden">
        <div className="px-4 grid grid-cols-[60px_1fr_140px_120px] py-3 text-label uppercase text-muted border-b border-border">
          <div>#</div><div>Name</div><div>Min lifetime</div><div></div>
        </div>
        {rows.map((t) => (
          <div key={t.id} className="border-b border-row-divider last:border-b-0">
            {editingId === t.id ? (
              <TierForm initial={t} onCancel={() => setEditingId(null)} onSubmit={(v) => save(t.id, v)} pending={pending} />
            ) : (
              <div className="px-4 grid grid-cols-[60px_1fr_140px_120px] py-3 text-[12px] items-center">
                <div className="font-mono text-muted">{t.tier_index}</div>
                <div>
                  <p className="font-medium text-fg">{t.name}</p>
                  {t.perks_text ? <p className="text-[11px] text-muted truncate">{t.perks_text}</p> : null}
                </div>
                <div className="text-fg">{t.min_points_lifetime.toLocaleString()}</div>
                <div className="flex justify-end">
                  <Button size="sm" variant="ghost" onClick={() => setEditingId(t.id)}>
                    <Pencil className="h-3.5 w-3.5" /> Edit
                  </Button>
                </div>
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

function TierForm({
  initial, onCancel, onSubmit, pending,
}: {
  initial: TierRow;
  onCancel: () => void;
  onSubmit: (v: { name: string; min_points_lifetime: number; perks_text: string }) => void;
  pending: boolean;
}) {
  const [name, setName] = React.useState(initial.name);
  const [threshold, setThreshold] = React.useState(initial.min_points_lifetime);
  const [perks, setPerks] = React.useState(initial.perks_text ?? '');
  const isTier0 = initial.tier_index === 0;

  return (
    <div className="px-4 py-3 bg-canvas space-y-3">
      <div className="grid grid-cols-2 gap-3">
        <FormField id="tier-name" label="Name" required>
          <Input id="tier-name" value={name} onChange={(e) => setName(e.target.value)} />
        </FormField>
        <FormField id="tier-thresh" label="Min lifetime points" hint={isTier0 ? 'Tier 0 must be 0' : undefined} required>
          <Input id="tier-thresh" type="number" min={0} disabled={isTier0} value={threshold} onChange={(e) => setThreshold(Number(e.target.value))} />
        </FormField>
      </div>
      <FormField id="tier-perks" label="Perks (free-text)">
        <Textarea id="tier-perks" value={perks} onChange={(e) => setPerks(e.target.value)} placeholder="Priority weekend booking. Complimentary chef's amuse." />
      </FormField>
      <div className="flex gap-2">
        <Button size="sm" disabled={pending || !name.trim()} onClick={() => onSubmit({ name: name.trim(), min_points_lifetime: threshold, perks_text: perks.trim() })}>
          {pending ? 'Saving…' : 'Save'}
        </Button>
        <Button size="sm" variant="ghost" onClick={onCancel}>Cancel</Button>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Typecheck and commit**

```bash
pnpm --filter @buranchi/web typecheck
git add apps/web/components/loyalty-tiers-editor.tsx
git commit -m "feat(loyalty): add LoyaltyTiersEditor (4 fixed-row tier admin editor)"
```

---

### Task 21: Component — `LoyaltyRewardsEditor`

**Files:**
- Create: `apps/web/components/loyalty-rewards-editor.tsx`

- [ ] **Step 1: Write the component**

```tsx
'use client';

import * as React from 'react';
import { Plus, Pencil, Trash2 } from 'lucide-react';
import { Button, Input, Textarea, FormField } from '@buranchi/ui';
import { LOYALTY_REWARD_TYPE_LABELS, type LoyaltyRewardType } from '@buranchi/shared';
import { createRewardAction, updateRewardAction, deleteRewardAction } from '@/lib/actions/loyalty-rewards';

export interface RewardRow {
  id: string;
  name: string;
  description: string | null;
  type: LoyaltyRewardType;
  type_value: number;
  points_cost: number;
  min_tier_index: number;
  is_active: boolean;
  sort_order: number;
}

export interface TierOption {
  tier_index: number;
  name: string;
}

export function LoyaltyRewardsEditor({
  rows, tiers,
}: {
  rows: RewardRow[];
  tiers: TierOption[];
}) {
  const [adding, setAdding] = React.useState(false);
  const [editingId, setEditingId] = React.useState<string | null>(null);
  const [pending, startTransition] = React.useTransition();
  const [error, setError] = React.useState<string | undefined>();

  function add(values: Omit<RewardRow, 'id'>) {
    setError(undefined);
    startTransition(async () => {
      try { await createRewardAction(values); setAdding(false); }
      catch (e) { setError(e instanceof Error ? e.message : 'Failed'); }
    });
  }
  function update(id: string, values: Partial<Omit<RewardRow, 'id'>>) {
    setError(undefined);
    startTransition(async () => {
      try { await updateRewardAction(id, values); setEditingId(null); }
      catch (e) { setError(e instanceof Error ? e.message : 'Failed'); }
    });
  }
  function remove(id: string) {
    if (!confirm('Delete this reward? Past redemptions stay (snapshotted).')) return;
    setError(undefined);
    startTransition(async () => {
      try { await deleteRewardAction(id); }
      catch (e) { setError(e instanceof Error ? e.message : 'Failed'); }
    });
  }

  return (
    <div className="space-y-3">
      {error ? <p className="text-[12px] text-danger">{error}</p> : null}
      <div className="rounded-card bg-surface shadow-card overflow-hidden">
        {rows.map((r) => (
          <div key={r.id} className="border-b border-row-divider last:border-b-0">
            {editingId === r.id ? (
              <RewardForm initial={r} tiers={tiers} onCancel={() => setEditingId(null)}
                          onSubmit={(v) => update(r.id, v)} pending={pending} />
            ) : (
              <div className="px-4 py-3 flex items-start gap-3">
                <div className="flex-1 min-w-0">
                  <p className="text-[12px] font-medium text-fg">
                    {r.name} <span className="text-muted">· {r.points_cost} pts</span>
                  </p>
                  <p className="text-[11px] text-muted">
                    {LOYALTY_REWARD_TYPE_LABELS[r.type]}
                    {r.type === 'percent_discount' ? ` · ${r.type_value}%` : ''}
                    {r.type === 'rupiah_discount' ? ` · Rp ${r.type_value.toLocaleString()}` : ''}
                    {r.min_tier_index > 0 ? ` · ${tiers.find((t) => t.tier_index === r.min_tier_index)?.name ?? `Tier ${r.min_tier_index}`}+` : ''}
                    {!r.is_active ? ' · inactive' : ''}
                  </p>
                  {r.description ? <p className="text-[11px] text-muted line-clamp-2">{r.description}</p> : null}
                </div>
                <div className="flex gap-1 shrink-0">
                  <Button size="sm" variant="ghost" onClick={() => setEditingId(r.id)}>
                    <Pencil className="h-3.5 w-3.5" />
                  </Button>
                  <Button size="sm" variant="ghost" disabled={pending} onClick={() => remove(r.id)}>
                    <Trash2 className="h-3.5 w-3.5" />
                  </Button>
                </div>
              </div>
            )}
          </div>
        ))}
        {rows.length === 0 && !adding ? (
          <div className="px-4 py-8 text-center text-[12px] text-muted">No rewards yet.</div>
        ) : null}
        {adding ? (
          <RewardForm tiers={tiers} onCancel={() => setAdding(false)} onSubmit={add} pending={pending} />
        ) : null}
      </div>
      {!adding ? (
        <Button size="sm" variant="outline" onClick={() => setAdding(true)}>
          <Plus className="h-3.5 w-3.5" /> Add reward
        </Button>
      ) : null}
    </div>
  );
}

function RewardForm({
  initial, tiers, onCancel, onSubmit, pending,
}: {
  initial?: RewardRow;
  tiers: TierOption[];
  onCancel: () => void;
  onSubmit: (v: Omit<RewardRow, 'id'>) => void;
  pending: boolean;
}) {
  const [name, setName] = React.useState(initial?.name ?? '');
  const [description, setDescription] = React.useState(initial?.description ?? '');
  const [type, setType] = React.useState<LoyaltyRewardType>(initial?.type ?? 'free_item');
  const [typeValue, setTypeValue] = React.useState(initial?.type_value ?? 0);
  const [pointsCost, setPointsCost] = React.useState(initial?.points_cost ?? 100);
  const [minTier, setMinTier] = React.useState(initial?.min_tier_index ?? 0);
  const [isActive, setIsActive] = React.useState(initial?.is_active ?? true);

  return (
    <div className="px-4 py-3 bg-canvas space-y-3">
      <div className="grid grid-cols-2 gap-3">
        <FormField id="rw-name" label="Name" required>
          <Input id="rw-name" value={name} onChange={(e) => setName(e.target.value)} placeholder="Free dessert" />
        </FormField>
        <FormField id="rw-cost" label="Points cost" required>
          <Input id="rw-cost" type="number" min={1} value={pointsCost} onChange={(e) => setPointsCost(Number(e.target.value))} />
        </FormField>
      </div>
      <FormField id="rw-desc" label="Description">
        <Textarea id="rw-desc" value={description} onChange={(e) => setDescription(e.target.value)} />
      </FormField>
      <div className="grid grid-cols-3 gap-3">
        <FormField id="rw-type" label="Type" required>
          <select id="rw-type" value={type} onChange={(e) => setType(e.target.value as LoyaltyRewardType)}
                  className="h-[33px] w-full rounded-input border border-border bg-surface px-2.5 text-[12px] text-fg">
            <option value="free_item">Free item</option>
            <option value="percent_discount">% discount</option>
            <option value="rupiah_discount">Rp discount</option>
          </select>
        </FormField>
        <FormField id="rw-value"
                   label={type === 'percent_discount' ? 'Percent (1–100)' : type === 'rupiah_discount' ? 'Rupiah amount' : 'Value (unused)'}
                   hint={type === 'free_item' ? 'Ignored for free_item' : undefined}>
          <Input id="rw-value" type="number" min={0} disabled={type === 'free_item'}
                 value={typeValue} onChange={(e) => setTypeValue(Number(e.target.value))} />
        </FormField>
        <FormField id="rw-tier" label="Min tier">
          <select id="rw-tier" value={minTier} onChange={(e) => setMinTier(Number(e.target.value))}
                  className="h-[33px] w-full rounded-input border border-border bg-surface px-2.5 text-[12px] text-fg">
            {tiers.sort((a, b) => a.tier_index - b.tier_index).map((t) => (
              <option key={t.tier_index} value={t.tier_index}>{t.name} (idx {t.tier_index})</option>
            ))}
          </select>
        </FormField>
      </div>
      <label className="inline-flex items-center gap-2 text-[12px] text-fg">
        <input type="checkbox" checked={isActive} onChange={(e) => setIsActive(e.target.checked)} />
        <span>Active</span>
      </label>
      <div className="flex gap-2">
        <Button size="sm" disabled={pending || !name.trim() || pointsCost <= 0}
                onClick={() => onSubmit({
                  name: name.trim(), description: description.trim() || null, type,
                  type_value: typeValue, points_cost: pointsCost, min_tier_index: minTier,
                  is_active: isActive, sort_order: initial?.sort_order ?? 0,
                })}>
          {pending ? 'Saving…' : 'Save'}
        </Button>
        <Button size="sm" variant="ghost" onClick={onCancel}>Cancel</Button>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Typecheck and commit**

```bash
pnpm --filter @buranchi/web typecheck
git add apps/web/components/loyalty-rewards-editor.tsx
git commit -m "feat(loyalty): add LoyaltyRewardsEditor catalog CRUD with type-aware fields"
```

---

### Task 22: Component — `LoyaltyCompletionSection`

**Files:**
- Create: `apps/web/components/loyalty-completion-section.tsx`

- [ ] **Step 1: Write the component**

```tsx
'use client';

import * as React from 'react';
import { useRouter } from 'next/navigation';
import { Button, Input, FormField } from '@buranchi/ui';
import { computePointsForBill } from '@/lib/loyalty/earn';
import { completeBookingAction } from '@/lib/actions/bookings';
import type { LoyaltyRewardType } from '@buranchi/shared';

export interface PreApplied {
  id: string;
  reward_name: string;
  points_spent: number;
  created_at: string;
}

export interface AvailableReward {
  id: string;
  name: string;
  type: LoyaltyRewardType;
  type_value: number;
  points_cost: number;
  min_tier_index: number;
}

interface LoyaltyCompletionSectionProps {
  bookingId: string;
  customerName: string;
  tierName: string;
  customerTierIndex: number;
  pointsBalance: number;
  pointsLifetime: number;
  nextTierName: string | null;
  nextTierThreshold: number | null;
  earnRateIdrPerPoint: number;
  preApplied: PreApplied[];
  available: AvailableReward[];
}

export function LoyaltyCompletionSection({
  bookingId, customerName, tierName, customerTierIndex,
  pointsBalance, pointsLifetime, nextTierName, nextTierThreshold,
  earnRateIdrPerPoint, preApplied, available,
}: LoyaltyCompletionSectionProps) {
  const router = useRouter();
  const [billStr, setBillStr] = React.useState('');
  const [picked, setPicked] = React.useState<Set<string>>(new Set());
  const [pending, startTransition] = React.useTransition();
  const [error, setError] = React.useState<string | undefined>();

  const billIdr = Math.max(0, Math.floor(Number(billStr.replace(/[^0-9]/g, '')) || 0));
  const pickedTotal = Array.from(picked).reduce(
    (sum, id) => sum + (available.find((r) => r.id === id)?.points_cost ?? 0), 0,
  );
  const earned = computePointsForBill(billIdr, earnRateIdrPerPoint);
  const projectedBalance = pointsBalance + earned - pickedTotal;
  const remainingForRedemption = pointsBalance; // pre-applied already deducted
  const remainingForNext = nextTierThreshold ? Math.max(0, nextTierThreshold - (pointsLifetime + earned)) : 0;

  function toggle(id: string) {
    const next = new Set(picked);
    if (next.has(id)) next.delete(id); else next.add(id);
    setPicked(next);
  }

  function isAffordable(r: AvailableReward) {
    if (customerTierIndex < r.min_tier_index) return false;
    return r.points_cost + (Array.from(picked).filter((p) => p !== r.id)
      .reduce((s, p) => s + (available.find((x) => x.id === p)?.points_cost ?? 0), 0)
    ) <= remainingForRedemption;
  }

  function submit() {
    if (billIdr <= 0) { setError('Enter the bill total before reward discounts.'); return; }
    setError(undefined);
    startTransition(async () => {
      try {
        await completeBookingAction(bookingId, {
          bill_idr: billIdr,
          reward_redemption_ids: Array.from(picked),
        });
        router.refresh();
      } catch (e) {
        setError(e instanceof Error ? e.message : 'Failed');
      }
    });
  }

  return (
    <div className="rounded-card bg-canvas border border-row-divider p-card-pad space-y-4">
      <div className="flex items-baseline gap-2 flex-wrap">
        <p className="text-body-strong text-fg">Complete booking — {customerName}</p>
        <p className="text-[12px] text-muted">
          {tierName} · {pointsBalance.toLocaleString()} pts
          {nextTierName && remainingForNext > 0 ? ` · ${remainingForNext.toLocaleString()} to ${nextTierName}` : ''}
        </p>
      </div>

      {preApplied.length > 0 ? (
        <div className="text-[12px] space-y-1">
          <p className="text-[10px] uppercase tracking-[0.06em] text-muted font-semibold">
            Already redeemed via Koda on this booking
          </p>
          {preApplied.map((p) => (
            <p key={p.id} className="text-fg">
              ✓ {p.reward_name} (−{p.points_spent} pts)
            </p>
          ))}
        </div>
      ) : null}

      <FormField id="bill" label="Bill total before reward discounts (Rp)" required hint="What the food + drinks were worth, pre-discount">
        <Input id="bill" value={billStr} onChange={(e) => setBillStr(e.target.value)} placeholder="250,000" />
      </FormField>

      {available.length > 0 ? (
        <div className="space-y-1.5">
          <p className="text-[10px] uppercase tracking-[0.06em] text-muted font-semibold">Redeem additional rewards</p>
          {available.map((r) => {
            const affordable = isAffordable(r);
            const tierLocked = customerTierIndex < r.min_tier_index;
            const checked = picked.has(r.id);
            return (
              <label key={r.id} className={`flex items-center gap-2 px-2 py-1.5 rounded-tile cursor-pointer ${(!affordable && !checked) || tierLocked ? 'opacity-50' : 'hover:bg-surface'}`}>
                <input type="checkbox" disabled={(!affordable && !checked) || tierLocked} checked={checked} onChange={() => toggle(r.id)} />
                <span className="text-[12px] text-fg flex-1">{r.name}</span>
                <span className="text-[11px] text-muted font-mono">{r.points_cost} pts</span>
                {tierLocked ? <span className="text-[10px] text-danger">tier-locked</span> : null}
              </label>
            );
          })}
        </div>
      ) : null}

      <div className="text-[12px] text-fg pt-3 border-t border-row-divider">
        → Earns <strong className="text-success">+{earned}</strong> points · Net balance after this booking: <strong>{projectedBalance.toLocaleString()}</strong>
      </div>

      {error ? <p className="text-[12px] text-danger">{error}</p> : null}

      <div className="flex justify-end gap-2">
        <Button onClick={submit} disabled={pending}>{pending ? 'Completing…' : 'Confirm completion'}</Button>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Typecheck and commit**

```bash
pnpm --filter @buranchi/web typecheck
git add apps/web/components/loyalty-completion-section.tsx
git commit -m "feat(loyalty): add LoyaltyCompletionSection booking completion form"
```

---

### Task 23: Page — `/settings/loyalty`

**Files:**
- Create: `apps/web/app/(app)/settings/loyalty/page.tsx`
- Create: `apps/web/app/(app)/settings/loyalty/program-section.tsx`

- [ ] **Step 1: Write the program-section client component**

```tsx
// apps/web/app/(app)/settings/loyalty/program-section.tsx
'use client';

import * as React from 'react';
import { useRouter } from 'next/navigation';
import { Button, Input, FormField } from '@buranchi/ui';
import { updateOrganizationLoyaltyAction } from './program-actions';

export function LoyaltyProgramSection({
  enabled, programName, earnRate,
}: {
  enabled: boolean;
  programName: string;
  earnRate: number;
}) {
  const router = useRouter();
  const [isEnabled, setIsEnabled] = React.useState(enabled);
  const [name, setName] = React.useState(programName);
  const [rate, setRate] = React.useState(earnRate);
  const [pending, startTransition] = React.useTransition();
  const [error, setError] = React.useState<string | undefined>();

  function save() {
    setError(undefined);
    startTransition(async () => {
      try {
        await updateOrganizationLoyaltyAction({
          loyalty_enabled: isEnabled,
          loyalty_program_name: name.trim(),
          loyalty_earn_rate_idr_per_point: rate,
        });
        router.refresh();
      } catch (e) {
        setError(e instanceof Error ? e.message : 'Failed');
      }
    });
  }

  return (
    <div className="rounded-card bg-surface shadow-card p-card-pad space-y-3">
      <label className="inline-flex items-center gap-2 text-[12px] text-fg">
        <input type="checkbox" checked={isEnabled} onChange={(e) => setIsEnabled(e.target.checked)} />
        <span className="font-medium">Enable loyalty program</span>
      </label>
      <div className="grid grid-cols-2 gap-3">
        <FormField id="prog-name" label="Program name">
          <Input id="prog-name" value={name} onChange={(e) => setName(e.target.value)} placeholder="Buranchi Rewards" />
        </FormField>
        <FormField id="earn-rate" label="Earn rate (Rp per point)" hint="e.g. 10,000 means 1 point per Rp 10,000 spent">
          <Input id="earn-rate" type="number" min={1} value={rate} onChange={(e) => setRate(Number(e.target.value))} />
        </FormField>
      </div>
      {error ? <p className="text-[12px] text-danger">{error}</p> : null}
      <Button onClick={save} disabled={pending}>{pending ? 'Saving…' : 'Save program settings'}</Button>
    </div>
  );
}
```

- [ ] **Step 2: Write `program-actions.ts`** (separate server-action file colocated with the page)

`apps/web/app/(app)/settings/loyalty/program-actions.ts`:

```ts
'use server';

import { z } from 'zod';
import { revalidatePath } from 'next/cache';
import { requireRole } from '@/lib/auth/server';
import { createServerClient } from '@/lib/supabase/server';
import { ActionError } from '@/lib/auth/errors';

const Schema = z.object({
  loyalty_enabled: z.boolean(),
  loyalty_program_name: z.string().trim().min(1).max(60),
  loyalty_earn_rate_idr_per_point: z.number().int().positive(),
});

export async function updateOrganizationLoyaltyAction(input: unknown) {
  const profile = await requireRole(['admin']);
  const parsed = Schema.parse(input);
  const supabase = await createServerClient();
  const { error } = await supabase.from('organizations').update(parsed as never).eq('id', profile.organization_id);
  if (error) throw new ActionError(error.code ?? 'DB', error.message);
  revalidatePath('/settings/loyalty');
}
```

- [ ] **Step 3: Write the page**

`apps/web/app/(app)/settings/loyalty/page.tsx`:

```tsx
import Link from 'next/link';
import { Topbar, Card } from '@buranchi/ui';
import { requireRole } from '@/lib/auth/server';
import { createServerClient } from '@/lib/supabase/server';
import { LoyaltyProgramSection } from './program-section';
import { LoyaltyTiersEditor, type TierRow } from '@/components/loyalty-tiers-editor';
import { LoyaltyRewardsEditor, type RewardRow, type TierOption } from '@/components/loyalty-rewards-editor';

export default async function LoyaltySettingsPage() {
  const profile = await requireRole(['admin']);
  const supabase = await createServerClient();

  const { data: orgRow } = await supabase
    .from('organizations')
    .select('name, loyalty_enabled, loyalty_program_name, loyalty_earn_rate_idr_per_point')
    .eq('id', profile.organization_id)
    .single();
  const org = orgRow as {
    name: string; loyalty_enabled: boolean; loyalty_program_name: string;
    loyalty_earn_rate_idr_per_point: number;
  } | null;

  const { data: tierRows } = await supabase
    .from('loyalty_tiers')
    .select('id, tier_index, name, min_points_lifetime, perks_text')
    .eq('organization_id', profile.organization_id)
    .order('tier_index', { ascending: true });
  const tiers = (tierRows ?? []) as TierRow[];
  const tierOptions: TierOption[] = tiers.map((t) => ({ tier_index: t.tier_index, name: t.name }));

  const { data: rewardRows } = await supabase
    .from('loyalty_rewards')
    .select('id, name, description, type, type_value, points_cost, min_tier_index, is_active, sort_order')
    .eq('organization_id', profile.organization_id)
    .order('sort_order', { ascending: true });
  const rewards = (rewardRows ?? []) as RewardRow[];

  // Activity stats
  const today = new Date(); today.setUTCHours(0, 0, 0, 0);
  const sevenAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
  const { count: members } = await supabase
    .from('customers').select('id', { count: 'exact', head: true })
    .eq('organization_id', profile.organization_id).eq('is_member', true);
  const { data: earn7 } = await supabase
    .from('loyalty_transactions').select('points_earned')
    .eq('organization_id', profile.organization_id).gte('created_at', sevenAgo.toISOString());
  const { data: redeem7 } = await supabase
    .from('loyalty_redemptions').select('points_spent')
    .eq('organization_id', profile.organization_id).eq('status', 'applied').gte('created_at', sevenAgo.toISOString());
  const earned7 = ((earn7 ?? []) as Array<{ points_earned: number }>).reduce((s, x) => s + x.points_earned, 0);
  const redeemed7 = ((redeem7 ?? []) as Array<{ points_spent: number }>).reduce((s, x) => s + x.points_spent, 0);

  return (
    <>
      <Topbar
        breadcrumb={<><Link href="/settings" className="hover:underline">Settings</Link> / Loyalty</>}
        title="Loyalty program"
        backHref="/settings"
      />
      <div className="space-y-6 max-w-3xl">
        <section>
          <h2 className="text-[10px] uppercase tracking-[0.08em] text-muted font-semibold mb-3">Identity</h2>
          <Card>
            <p className="text-[12px] text-fg">
              Loyalty for <span className="font-semibold">{org?.name ?? 'this restaurant'}</span> · Powered by Meta-Koda
            </p>
            <p className="text-[11px] text-muted mt-2">
              4-tier structure is fixed; tier names, thresholds, and rewards are tenant-configurable.
            </p>
          </Card>
        </section>

        <section>
          <h2 className="text-[10px] uppercase tracking-[0.08em] text-muted font-semibold mb-3">Program</h2>
          <LoyaltyProgramSection
            enabled={org?.loyalty_enabled ?? false}
            programName={org?.loyalty_program_name ?? 'Loyalty'}
            earnRate={org?.loyalty_earn_rate_idr_per_point ?? 10000}
          />
        </section>

        <section>
          <h2 className="text-[10px] uppercase tracking-[0.08em] text-muted font-semibold mb-3">Tiers</h2>
          <p className="text-[11px] text-muted mb-3">
            4 tiers ordered by `tier_index`. Threshold of tier 0 is fixed at 0; the rest must be strictly increasing.
          </p>
          <LoyaltyTiersEditor rows={tiers} />
        </section>

        <section>
          <h2 className="text-[10px] uppercase tracking-[0.08em] text-muted font-semibold mb-3">Rewards</h2>
          <p className="text-[11px] text-muted mb-3">
            Three reward types: free item, percent discount, fixed Rupiah discount. Optional minimum tier per reward.
          </p>
          <LoyaltyRewardsEditor rows={rewards} tiers={tierOptions} />
        </section>

        <section>
          <h2 className="text-[10px] uppercase tracking-[0.08em] text-muted font-semibold mb-3">Activity</h2>
          <div className="grid grid-cols-3 gap-3">
            <Card>
              <p className="text-[10px] uppercase tracking-[0.06em] text-muted font-semibold">Members (all time)</p>
              <p className="text-title text-fg font-bold mt-1">{members ?? 0}</p>
            </Card>
            <Card>
              <p className="text-[10px] uppercase tracking-[0.06em] text-muted font-semibold">Points earned (7d)</p>
              <p className="text-title text-fg font-bold mt-1">{earned7.toLocaleString()}</p>
            </Card>
            <Card>
              <p className="text-[10px] uppercase tracking-[0.06em] text-muted font-semibold">Points redeemed (7d)</p>
              <p className="text-title text-fg font-bold mt-1">{redeemed7.toLocaleString()}</p>
            </Card>
          </div>
        </section>
      </div>
    </>
  );
}
```

- [ ] **Step 4: Typecheck and commit**

```bash
pnpm --filter @buranchi/web typecheck
git add 'apps/web/app/(app)/settings/loyalty/'
git commit -m "feat(loyalty): add /settings/loyalty admin page"
```

---

### Task 24: Modify `/customers/[id]` — add Loyalty card

**Files:**
- Modify: `apps/web/app/(app)/customers/[id]/page.tsx`

- [ ] **Step 1: Add the loyalty card section**

In the customer detail page, before the bookings/history sections, add:

```tsx
// At the top of the page handler, after loading the customer:
const { data: orgRow } = await supabase
  .from('organizations')
  .select('loyalty_enabled, loyalty_program_name')
  .eq('id', profile.organization_id).single();
const org = orgRow as { loyalty_enabled: boolean; loyalty_program_name: string } | null;

let tierName = 'None';
let tierIndex = 0;
let nextTierName: string | null = null;
let nextTierThreshold: number | null = null;
if (customer.is_member && customer.current_tier_id) {
  const { data: tiers } = await supabase
    .from('loyalty_tiers')
    .select('id, tier_index, name, min_points_lifetime')
    .eq('organization_id', profile.organization_id)
    .order('tier_index', { ascending: true });
  const all = (tiers ?? []) as Array<{ id: string; tier_index: number; name: string; min_points_lifetime: number }>;
  const cur = all.find((t) => t.id === customer.current_tier_id);
  if (cur) {
    tierName = cur.name;
    tierIndex = cur.tier_index;
    const next = all.find((t) => t.tier_index === cur.tier_index + 1);
    if (next) { nextTierName = next.name; nextTierThreshold = next.min_points_lifetime; }
  }
}
```

Then in the JSX (above the booking history section):

```tsx
{org?.loyalty_enabled && customer.is_member ? (
  <Card>
    <LoyaltyStatusBadge
      tierName={tierName}
      tierIndex={tierIndex}
      pointsBalance={customer.points_balance}
      pointsLifetime={customer.points_lifetime}
      nextTierName={nextTierName}
      nextTierThreshold={nextTierThreshold}
    />
    <div className="mt-3 flex justify-end">
      <LoyaltyMemberToggle
        customerId={customer.id}
        customerName={customer.full_name}
        isMember={true}
        programName={org.loyalty_program_name}
      />
    </div>
  </Card>
) : org?.loyalty_enabled && !customer.is_member ? (
  <LoyaltyMemberToggle
    customerId={customer.id}
    customerName={customer.full_name}
    isMember={false}
    programName={org.loyalty_program_name}
  />
) : null}
```

Add the imports at the top of the file:

```tsx
import { LoyaltyStatusBadge } from '@/components/loyalty-status-badge';
import { LoyaltyMemberToggle } from '@/components/loyalty-member-toggle';
```

Make sure the `customer` selection includes the new loyalty columns:

```tsx
.select('id, full_name, phone, ..., is_member, member_since, points_balance, points_lifetime, current_tier_id')
```

- [ ] **Step 2: Typecheck and commit**

```bash
pnpm --filter @buranchi/web typecheck
git add 'apps/web/app/(app)/customers/[id]/page.tsx'
git commit -m "feat(loyalty): add Loyalty card to customer profile when member or org enables it"
```

---

### Task 25: Modify `/bookings/[id]` — render `LoyaltyCompletionSection`

**Files:**
- Modify: `apps/web/app/(app)/bookings/[id]/page.tsx`

- [ ] **Step 1: Wire LoyaltyCompletionSection into the booking detail page**

Add data loading for the loyalty completion path when the booking is in `confirmed` or `seated` status, customer is a member, and org loyalty is enabled.

After existing booking + customer load, add:

```tsx
import { LoyaltyCompletionSection, type AvailableReward, type PreApplied } from '@/components/loyalty-completion-section';
import { ConversationActions } from './booking-actions'; // existing component

// inside the page server component, after loading booking + customer:
let showLoyaltyCompletion = false;
let preApplied: PreApplied[] = [];
let availableRewards: AvailableReward[] = [];
let earnRate = 10000;
let tierName = 'Bronze';
let tierIndex = 0;
let nextTierName: string | null = null;
let nextTierThreshold: number | null = null;

if (
  ['confirmed', 'seated'].includes(booking.status)
  && customer.is_member
) {
  const { data: orgRow } = await supabase
    .from('organizations')
    .select('loyalty_enabled, loyalty_earn_rate_idr_per_point')
    .eq('id', profile.organization_id).single();
  const orgInfo = orgRow as { loyalty_enabled: boolean; loyalty_earn_rate_idr_per_point: number } | null;
  if (orgInfo?.loyalty_enabled) {
    showLoyaltyCompletion = true;
    earnRate = orgInfo.loyalty_earn_rate_idr_per_point;

    const { data: applied } = await supabase
      .from('loyalty_redemptions')
      .select('id, reward_name, points_spent, created_at')
      .eq('booking_id', booking.id).eq('status', 'applied');
    preApplied = ((applied ?? []) as Array<{ id: string; reward_name: string; points_spent: number; created_at: string }>);

    const { data: rewards } = await supabase
      .from('loyalty_rewards')
      .select('id, name, type, type_value, points_cost, min_tier_index, is_active')
      .eq('organization_id', profile.organization_id).eq('is_active', true)
      .order('sort_order', { ascending: true });
    availableRewards = ((rewards ?? []) as Array<{
      id: string; name: string; type: 'free_item'|'percent_discount'|'rupiah_discount';
      type_value: number; points_cost: number; min_tier_index: number;
    }>).filter((r) => !preApplied.some((p) => p.reward_name === r.name)); // hide already-redeemed-by-name

    const { data: tiers } = await supabase
      .from('loyalty_tiers')
      .select('id, tier_index, name, min_points_lifetime')
      .eq('organization_id', profile.organization_id)
      .order('tier_index', { ascending: true });
    const all = (tiers ?? []) as Array<{ id: string; tier_index: number; name: string; min_points_lifetime: number }>;
    const cur = all.find((t) => t.id === customer.current_tier_id);
    if (cur) {
      tierName = cur.name;
      tierIndex = cur.tier_index;
      const next = all.find((t) => t.tier_index === cur.tier_index + 1);
      if (next) { nextTierName = next.name; nextTierThreshold = next.min_points_lifetime; }
    }
  }
}
```

In the JSX, replace the existing `Mark completed` button block with:

```tsx
{showLoyaltyCompletion ? (
  <LoyaltyCompletionSection
    bookingId={booking.id}
    customerName={customer.full_name}
    tierName={tierName}
    customerTierIndex={tierIndex}
    pointsBalance={customer.points_balance}
    pointsLifetime={customer.points_lifetime}
    nextTierName={nextTierName}
    nextTierThreshold={nextTierThreshold}
    earnRateIdrPerPoint={earnRate}
    preApplied={preApplied}
    available={availableRewards}
  />
) : (
  <ConversationActions
    bookingId={booking.id}
    status={booking.status as 'confirmed' | 'seated' | 'completed' | 'cancelled' | 'no_show'}
  />
)}
```

(If the existing component is named differently, keep its existing wiring intact and just gate the loyalty completion in front of the simple confirmation path.)

- [ ] **Step 2: Typecheck and commit**

```bash
pnpm --filter @buranchi/web typecheck
git add 'apps/web/app/(app)/bookings/[id]/page.tsx'
git commit -m "feat(loyalty): render LoyaltyCompletionSection on booking detail when member"
```

---

### Task 26: Settings index — add Loyalty row

**Files:**
- Modify: `apps/web/app/(app)/settings/page.tsx`

- [ ] **Step 1: Add the row + import**

Add `Trophy` to imports (or any suitable icon) and a new SettingsLinkRow between Tables and Koda AI assistant:

```tsx
import { Building2, Users, Grid3x3, Trophy, Sparkles, ChevronRight } from 'lucide-react';

// ... inside the admin section:
<SettingsLinkRow
  href="/settings/loyalty"
  icon={<Trophy className="h-4 w-4" />}
  title="Loyalty program"
  description="Configure tiers, rewards, earn rate, and member activity"
/>
```

Update the `href` union type:

```tsx
href: '/settings/organization' | '/settings/users' | '/settings/tables' | '/settings/koda' | '/settings/loyalty';
```

- [ ] **Step 2: Typecheck and commit**

```bash
pnpm --filter @buranchi/web typecheck
git add 'apps/web/app/(app)/settings/page.tsx'
git commit -m "feat(loyalty): add Loyalty program row to /settings index"
```

---

### Task 27: Koda — add 2 new tools

**Files:**
- Modify: `apps/web/lib/koda/tools.ts`
- Modify: `apps/web/lib/koda/tools.test.ts`

- [ ] **Step 1: Add tool definitions to `KODA_TOOL_DEFINITIONS` array**

Append two new entries to the array in `tools.ts`:

```ts
{
  type: 'function',
  function: {
    name: 'get_loyalty_status',
    description: "Get the current customer's loyalty status: membership, tier, balance, lifetime, eligible rewards, and tier perks. Use when the customer asks about their points/tier/rewards.",
    parameters: { type: 'object', properties: {}, required: [] },
  },
},
{
  type: 'function',
  function: {
    name: 'redeem_reward',
    description: 'Reserve a reward for the customer at one of their upcoming bookings. Deducts points immediately and attaches the redemption to the booking. Confirm the reward and the specific booking with the customer before calling.',
    parameters: {
      type: 'object',
      properties: {
        reward_id:  { type: 'string' },
        booking_id: { type: 'string' },
      },
      required: ['reward_id', 'booking_id'],
    },
  },
},
```

- [ ] **Step 2: Add Zod schemas to `ParamsByTool`**

In `tools.ts`:

```ts
const ParamsByTool = {
  // ... existing entries
  get_loyalty_status: z.object({}),
  redeem_reward: z.object({ reward_id: z.string(), booking_id: z.string() }),
} as const;
```

- [ ] **Step 3: Add hooks**

Extend the `ToolHooks` interface:

```ts
export interface ToolHooks {
  // ... existing
  getLoyaltyStatus?: (customerId: string) => Promise<unknown>;
  redeemReward?: (rewardId: string, bookingId: string) => Promise<unknown>;
}
```

Add cases in the executor switch:

```ts
case 'get_loyalty_status': {
  if (!ctx.customer_id) {
    return { tool_call_id: tcId, content: JSON.stringify({ error: 'no_customer' }) };
  }
  const result = hooks.getLoyaltyStatus
    ? await hooks.getLoyaltyStatus(ctx.customer_id)
    : { error: 'not_implemented' };
  return { tool_call_id: tcId, content: JSON.stringify(result) };
}
case 'redeem_reward': {
  const a = args as z.infer<typeof ParamsByTool.redeem_reward>;
  const result = hooks.redeemReward
    ? await hooks.redeemReward(a.reward_id, a.booking_id)
    : { error: 'not_implemented' };
  return { tool_call_id: tcId, content: JSON.stringify(result) };
}
```

- [ ] **Step 4: Update test expectations**

In `apps/web/lib/koda/tools.test.ts`, update the count + names check:

```ts
test('defines exactly 9 tools with the required names', () => {
  const names = KODA_TOOL_DEFINITIONS.map((t) => t.function.name).sort();
  expect(names).toEqual([
    'add_customer_note',
    'cancel_booking',
    'check_availability',
    'create_booking',
    'escalate_to_staff',
    'find_customer_booking',
    'get_loyalty_status',
    'modify_booking',
    'redeem_reward',
  ]);
});
```

Add a test for redeem_reward execution:

```ts
test('redeem_reward forwards args to hook', async () => {
  const redeemMock = vi.fn().mockResolvedValue({ ok: true });
  const result = await executeTool(
    { name: 'redeem_reward', arguments: JSON.stringify({ reward_id: 'r1', booking_id: 'b1' }) },
    { organization_id: 'org-1', customer_id: 'cust-1', conversation_id: 'conv-1' },
    { redeemReward: redeemMock },
  );
  expect(result.error).toBeUndefined();
  expect(redeemMock).toHaveBeenCalledWith('r1', 'b1');
});
```

- [ ] **Step 5: Run tests**

```bash
pnpm --filter @buranchi/web test apps/web/lib/koda/tools.test.ts
```

- [ ] **Step 6: Commit**

```bash
git add apps/web/lib/koda/tools.ts apps/web/lib/koda/tools.test.ts
git commit -m "feat(koda): add get_loyalty_status and redeem_reward tools"
```

---

### Task 28: Koda — extend system prompt with Loyalty block

**Files:**
- Modify: `apps/web/lib/koda/prompt.ts`
- Modify: `apps/web/lib/koda/prompt.test.ts`

- [ ] **Step 1: Extend `PromptContext` and the prompt body**

In `prompt.ts`, extend the interface:

```ts
export interface PromptLoyalty {
  tier_name: string;
  points_balance: number;
  points_lifetime: number;
  next_tier_name: string | null;
  to_next: number | null;
  perks_text: string | null;
  available_rewards: Array<{
    id: string;
    name: string;
    points_cost: number;
    type: 'free_item' | 'percent_discount' | 'rupiah_discount';
    type_value: number;
  }>;
}

export interface PromptContext {
  // ... existing fields
  loyalty: PromptLoyalty | null;     // null when not a member or org disabled
  programName: string;               // org's loyalty_program_name (used in prompt)
}
```

Extend `buildSystemPrompt` to inject the block:

```ts
function formatLoyalty(l: PromptLoyalty | null, programName: string): string {
  if (!l) {
    return `# Loyalty\n- This customer is not enrolled in ${programName}. Don't bring up loyalty unless they ask.`;
  }
  const rewardsList = l.available_rewards.length
    ? l.available_rewards.slice().sort((a, b) => a.points_cost - b.points_cost).map((r) => {
        const typeBit = r.type === 'percent_discount' ? `${r.type_value}% off` :
                        r.type === 'rupiah_discount' ? `Rp ${r.type_value.toLocaleString()} off` : 'free item';
        return `  · ${r.name} — ${r.points_cost} pts · ${typeBit}`;
      }).join('\n')
    : '  · (none available right now)';
  const toNext = l.next_tier_name && l.to_next != null ? ` · ${l.to_next} pts to ${l.next_tier_name}` : '';
  return `# Loyalty (this customer)
- Status: ${l.tier_name} member · ${l.points_balance} pts${toNext}
- Eligible rewards now (cheapest first):
${rewardsList}
- Tier perks: ${l.perks_text ?? '(none configured)'}
- DO NOT push redemptions; only mention if customer asks or it's clearly contextually helpful.`;
}
```

In the prompt-template literal, append after the existing # Current specials section:

```ts
${formatLoyalty(ctx.loyalty, ctx.programName)}
```

- [ ] **Step 2: Add tests**

Add to `prompt.test.ts`:

```ts
test('loyalty block appears for members with status + rewards', () => {
  const ctx: PromptContext = {
    ...baseCtx,
    programName: 'Buranchi Rewards',
    loyalty: {
      tier_name: 'Gold',
      points_balance: 1847,
      points_lifetime: 2140,
      next_tier_name: 'Platinum',
      to_next: 153,
      perks_text: 'Priority weekend booking',
      available_rewards: [
        { id: 'r1', name: 'Free dessert', points_cost: 200, type: 'free_item', type_value: 0 },
      ],
    },
  };
  const p = buildSystemPrompt(ctx);
  expect(p).toContain('Gold member');
  expect(p).toContain('1847');
  expect(p).toContain('153 pts to Platinum');
  expect(p).toContain('Free dessert — 200 pts');
  expect(p).toContain('Priority weekend booking');
});

test('non-member sees the do-not-bring-up note', () => {
  const ctx: PromptContext = { ...baseCtx, programName: 'Buranchi Rewards', loyalty: null };
  const p = buildSystemPrompt(ctx);
  expect(p).toMatch(/not enrolled in Buranchi Rewards/);
  expect(p).toMatch(/Don't bring up loyalty/);
});
```

(`baseCtx` already exists in the file from Phase 4; extend it with `programName: 'Buranchi'` and `loyalty: null` defaults to keep older tests green.)

- [ ] **Step 3: Run tests**

```bash
pnpm --filter @buranchi/web test apps/web/lib/koda/prompt.test.ts
```

- [ ] **Step 4: Commit**

```bash
git add apps/web/lib/koda/prompt.ts apps/web/lib/koda/prompt.test.ts
git commit -m "feat(koda): extend system prompt with per-customer Loyalty block"
```

---

### Task 29: Koda — wire loyalty hooks in `sendKodaMessageAction`

**Files:**
- Modify: `apps/web/lib/actions/koda.ts`

- [ ] **Step 1: Load loyalty data into `promptCtx`**

After the existing customer-context loading block, add:

```ts
let loyaltyCtx: PromptContext['loyalty'] = null;
if (org?.loyalty_enabled && convo.customer_id && customerCtx) {
  const { data: cust } = await supabase
    .from('customers')
    .select('points_balance, points_lifetime, current_tier_id, is_member')
    .eq('id', convo.customer_id).single();
  const c = cust as { points_balance: number; points_lifetime: number; current_tier_id: string | null; is_member: boolean } | null;
  if (c?.is_member && c.current_tier_id) {
    const { data: tiers } = await supabase
      .from('loyalty_tiers')
      .select('id, tier_index, name, min_points_lifetime, perks_text')
      .eq('organization_id', convo.organization_id)
      .order('tier_index', { ascending: true });
    const all = (tiers ?? []) as Array<{ id: string; tier_index: number; name: string; min_points_lifetime: number; perks_text: string | null }>;
    const curT = all.find((t) => t.id === c.current_tier_id);
    const nextT = curT ? all.find((t) => t.tier_index === curT.tier_index + 1) : null;

    const { data: rewards } = await supabase
      .from('loyalty_rewards')
      .select('id, name, type, type_value, points_cost, min_tier_index')
      .eq('organization_id', convo.organization_id).eq('is_active', true)
      .order('sort_order', { ascending: true });
    const eligible = ((rewards ?? []) as Array<{
      id: string; name: string; type: 'free_item' | 'percent_discount' | 'rupiah_discount';
      type_value: number; points_cost: number; min_tier_index: number;
    }>).filter((r) =>
      r.points_cost <= c.points_balance && (curT?.tier_index ?? 0) >= r.min_tier_index,
    );

    if (curT) {
      loyaltyCtx = {
        tier_name: curT.name,
        points_balance: c.points_balance,
        points_lifetime: c.points_lifetime,
        next_tier_name: nextT?.name ?? null,
        to_next: nextT ? Math.max(0, nextT.min_points_lifetime - c.points_lifetime) : null,
        perks_text: curT.perks_text,
        available_rewards: eligible.map(({ id, name, type, type_value, points_cost }) => ({
          id, name, type, type_value, points_cost,
        })),
      };
    }
  }
}
```

Update the `promptCtx` literal:

```ts
const promptCtx: PromptContext = {
  // ... existing fields
  loyalty: loyaltyCtx,
  programName: (org as { loyalty_program_name?: string } | null)?.loyalty_program_name ?? 'Loyalty',
};
```

Make sure the `organizations` select earlier in the action includes `loyalty_enabled, loyalty_program_name`:

```ts
.select('name, timezone, address, operating_hours, loyalty_enabled, loyalty_program_name')
```

- [ ] **Step 2: Add the 2 new hooks to `hooks` object**

```ts
const hooks: ToolHooks = {
  // ... existing
  getLoyaltyStatus: async (customerId) => {
    void customerId;
    return loyaltyCtx ?? { error: 'not_member' };
  },
  redeemReward: async (rewardId, bookingId) => {
    try {
      await import('@/lib/actions/loyalty-redeem').then((m) =>
        m.redeemRewardAction({ reward_id: rewardId, booking_id: bookingId }),
      );
      return { ok: true, reward_id: rewardId, booking_id: bookingId };
    } catch (e) {
      return { error: e instanceof Error ? e.message : 'failed' };
    }
  },
};
```

- [ ] **Step 3: Typecheck and commit**

```bash
pnpm --filter @buranchi/web typecheck
git add apps/web/lib/actions/koda.ts
git commit -m "feat(koda): wire loyalty hooks (status + redeem) into sendKodaMessageAction"
```

---

### Task 30: Engine integration test — loyalty flow

**Files:**
- Modify: `apps/web/lib/koda/engine.test.ts`

- [ ] **Step 1: Add a test exercising both new tools**

```ts
test('loyalty: get_loyalty_status then redeem_reward', async () => {
  const mockClient = makeMockClient([
    {
      content: '',
      tool_calls: [{
        id: 'tc1', type: 'function',
        function: { name: 'get_loyalty_status', arguments: '{}' },
      }],
    },
    {
      content: '',
      tool_calls: [{
        id: 'tc2', type: 'function',
        function: {
          name: 'redeem_reward',
          arguments: JSON.stringify({ reward_id: 'r1', booking_id: 'b1' }),
        },
      }],
    },
    { content: 'Sudah saya reservasi voucher dessert gratisnya untuk besok.' },
  ]);

  const getLoyaltyStatus = vi.fn().mockResolvedValue({
    tier_name: 'Gold', points_balance: 1500, points_lifetime: 2000,
    available_rewards: [{ id: 'r1', name: 'Free dessert', points_cost: 200, type: 'free_item', type_value: 0 }],
  });
  const redeemReward = vi.fn().mockResolvedValue({ ok: true });

  const result = await runTurn({
    conversationId: 'conv-1',
    userMessage: 'Saya mau pakai dessert gratis besok',
    promptCtx,
    toolCtx: { ...toolCtx, customer_id: 'cust-1' },
    history: [],
    hooks: { getLoyaltyStatus, redeemReward },
    client: mockClient as never,
  });

  expect(getLoyaltyStatus).toHaveBeenCalled();
  expect(redeemReward).toHaveBeenCalledWith('r1', 'b1');
  expect(result.assistantMessage).toContain('voucher dessert');
});
```

- [ ] **Step 2: Run tests**

```bash
pnpm --filter @buranchi/web test apps/web/lib/koda/engine.test.ts
```

- [ ] **Step 3: Commit**

```bash
git add apps/web/lib/koda/engine.test.ts
git commit -m "test(koda): integration test for loyalty status + redeem flow"
```

---

### Task 31: End-to-end smoke verification

**No new files.** This is the manual verification checkpoint covering the 10 acceptance criteria from the spec.

- [ ] **Step 1: Restart dev server with clean cache**

```bash
rm -rf apps/web/.next
pnpm --filter @buranchi/web dev
```

- [ ] **Step 2: Walk through the acceptance criteria as admin**

1. `/settings/loyalty` → toggle Enable ON → 4 tiers visible (Bronze 0 / Silver 500 / Gold 2000 / Platinum 5000) → rename Silver to "Mid-tier", change threshold to 750 → Save. Reload — values persist.
2. Add 3 rewards in catalog: "Free dessert" 200 free_item; "10% off" 500 percent_discount=10; "Rp 100k off" 1500 rupiah_discount=100000.
3. `/customers/<andini-id>` → toggle Enroll → card flips to *Bronze · 0 pts · 500 to Mid-tier*.
4. Complete a booking for Andini, bill = Rp 250,000, no redemptions → balance=25, lifetime=25, tier still Bronze.
5. Complete another booking, bill = Rp 7,500,000 → balance=775, lifetime=775, tier promotes to Mid-tier.
6. Complete a booking with "Free dessert" picked → redemption row added, balance −200.
7. Try to redeem more rewards than balance allows → UI shows clear error; no DB rows changed.
8. Try to redeem a reward where `min_tier_index` > customer tier → UI shows tier-locked error.
9. Cancel a booking that had applied redemptions → redemptions flip to voided, balance refunded.
10. `/koda/simulator` for Andini (Mid-tier, 775 pts) → "Berapa poin saya?" → status reply. Then "Saya mau pakai dessert gratis besok ya" → confirms which booking → redeem_reward fires → balance drops by 200.

- [ ] **Step 3: As `customer_service` role, verify access denied paths**

Sign in as a customer_service user. Try:
- `/settings/loyalty` → forbidden via `requireRole(['admin'])`
- Direct call to `enrollMemberAction` from a debug RPC client → permission denied

- [ ] **Step 4: Run integration + unit tests**

```bash
pnpm db:test                                    # Phases 1+2+4+5 RLS + RPC
pnpm --filter @buranchi/web test                # tier, earn, prompt, tools, engine
pnpm --filter @buranchi/shared test             # shared schemas
```

- [ ] **Step 5: Full typecheck + build**

```bash
pnpm typecheck
pnpm build
```

Both should be green.

- [ ] **Step 6: Final commit (only if smoke surfaced fixes)**

```bash
git status   # should be clean
```

---

## Self-Review

### Spec coverage

- [x] §3 Architecture — Tasks 5–9, 14–22 build it.
- [x] §4 Database — Tasks 1, 2, 3 deliver migrations + bundle.
- [x] §5 RPC — Task 2.
- [x] §6 Server actions — Tasks 10, 11, 12, 13, 14, 15.
- [x] §7 Koda integration — Tasks 27, 28, 29.
- [x] §8 Routes & UI — Task 23 (settings page), 24 (customer page), 25 (booking page), 26 (settings index).
- [x] §9 Acceptance criteria — Task 31 smoke covers items 1–10.
- [x] §10 Phase bridge — preserved by the channel-agnostic Koda tool design (Tasks 27–29).
- [x] §11 Testing — unit (8, 9), engine (30), RLS (4), RPC (5), live OpenAI (gated, mentioned in plan).

### Placeholder scan

- No "TBD", "TODO", "implement later" patterns.
- All code blocks contain real implementations.
- All command/expected-output pairs concrete.

### Type consistency

- `Tier`, `RewardCreate`, `LoyaltyRewardType` defined in shared and consumed identically in app code.
- `complete_booking_with_loyalty(uuid, int, uuid[])` signature appears identically in Tasks 2, 7 (regen verification), 14 (RPC call).
- `enrollMemberAction(customerId)` / `redeemRewardAction({ reward_id, booking_id })` signatures match between definition (Tasks 10, 13) and consumers (Tasks 17, 27, 29).
- `LoyaltyStatusBadge` props typed in Task 16 are passed identically from the customer page (Task 24).
- `HistoryRow` interface in Task 18 is independent of any consumer in this plan; reserved for v2 customer-redemption-history page.

No issues found.

---

## Execution Handoff

**Plan complete and saved to `docs/superpowers/plans/2026-04-29-phase-5-loyalty.md`. Two execution options:**

**1. Subagent-Driven (recommended)** — fresh subagent per task, two-stage review, fast iteration.

**2. Inline Execution** — run tasks in this session with checkpoints for review.

**Which approach?**
