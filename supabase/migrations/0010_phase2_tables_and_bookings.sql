-- 0010_phase2_tables_and_bookings.sql

-- ============================================================================
-- tables
-- ============================================================================

create table public.tables (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  code text not null,
  capacity int not null check (capacity >= 1 and capacity <= 50),
  floor_area text,
  status public.table_status not null default 'available',
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index tables_organization_id_idx on public.tables (organization_id);
create unique index tables_org_code_unique on public.tables (organization_id, code);

create trigger set_tables_updated_at
  before update on public.tables
  for each row execute function extensions.moddatetime(updated_at);

alter table public.tables enable row level security;

create policy "select tables in own org"
  on public.tables for select
  using (organization_id = public.get_my_org_id());

create policy "insert tables (admin only)"
  on public.tables for insert
  with check (
    organization_id = public.get_my_org_id()
    and public.get_my_role() = 'admin'
  );

create policy "update tables (admin or front_desk)"
  on public.tables for update
  using (
    organization_id = public.get_my_org_id()
    and public.get_my_role() in ('admin', 'front_desk')
  )
  with check (
    organization_id = public.get_my_org_id()
    and public.get_my_role() in ('admin', 'front_desk')
  );

create policy "delete tables (admin only)"
  on public.tables for delete
  using (
    organization_id = public.get_my_org_id()
    and public.get_my_role() = 'admin'
  );

-- ============================================================================
-- bookings
-- ============================================================================

create table public.bookings (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  customer_id uuid not null references public.customers(id) on delete restrict,
  table_id uuid not null references public.tables(id) on delete restrict,
  starts_at timestamptz not null,
  ends_at timestamptz not null,
  party_size int not null check (party_size >= 1 and party_size <= 50),
  source public.booking_source not null,
  status public.booking_status not null default 'confirmed',
  special_request text,
  internal_notes text,
  seated_at timestamptz,
  completed_at timestamptz,
  cancelled_at timestamptz,
  cancelled_reason text,
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint bookings_time_order_check check (ends_at > starts_at)
);

create index bookings_organization_id_idx on public.bookings (organization_id);
create index bookings_table_starts_idx on public.bookings (table_id, starts_at);
create index bookings_status_starts_idx on public.bookings (status, starts_at);
create index bookings_customer_id_idx on public.bookings (customer_id);

create trigger set_bookings_updated_at
  before update on public.bookings
  for each row execute function extensions.moddatetime(updated_at);

-- The conflict-prevention constraint: overlapping active bookings on the same
-- table are physically impossible.
alter table public.bookings
  add constraint bookings_no_overlap
  exclude using gist (
    table_id with =,
    tstzrange(starts_at, ends_at, '[)') with &&
  )
  where (status not in ('cancelled', 'no_show', 'completed'));

alter table public.bookings enable row level security;

create policy "select bookings in own org"
  on public.bookings for select
  using (organization_id = public.get_my_org_id());

create policy "insert bookings (admin or front_desk)"
  on public.bookings for insert
  with check (
    organization_id = public.get_my_org_id()
    and public.get_my_role() in ('admin', 'front_desk')
  );

create policy "update bookings (admin or front_desk)"
  on public.bookings for update
  using (
    organization_id = public.get_my_org_id()
    and public.get_my_role() in ('admin', 'front_desk')
  );

-- No DELETE policy on purpose. Bookings are immutable history; cancellation
-- is a status transition, not a delete.
