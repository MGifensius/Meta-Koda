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
