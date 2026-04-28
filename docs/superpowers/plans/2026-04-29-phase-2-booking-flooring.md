# Phase 2 — Booking & Flooring Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the operational core that staff use every shift — admin-managed tables, a live floor view, the bookings list with full lifecycle, and walk-in capture — on the Phase 1 multi-tenant foundation.

**Architecture:** Two new database tables (`tables`, `bookings`) with a Postgres `EXCLUDE` constraint that makes overlapping bookings on the same table physically impossible. Three new pages (`/floor`, `/bookings`, `/settings/tables`) plus existing settings sub-page pattern. State machines are enforced in server actions; table status combines manual overrides with derived booking-driven states.

**Tech Stack:** Same as Phase 1 — Next.js 15 (App Router) + Turbopack, React 19, TypeScript 5 strict, Supabase (Postgres + RLS + Storage), pnpm 9 + Turborepo, Tailwind v4, Plus Jakarta Sans, RHF + Zod, TanStack Table, Lucide icons, Vitest, GitHub Actions CI.

**Spec:** [`docs/superpowers/specs/2026-04-29-phase-2-booking-flooring-design.md`](../specs/2026-04-29-phase-2-booking-flooring-design.md)

---

## File Structure

### Database

```
supabase/migrations/
├── 0009_phase2_enums_and_extension.sql       # btree_gist + 3 enums
└── 0010_phase2_tables_and_bookings.sql       # tables, bookings, indexes, RLS, EXCLUDE constraint, triggers

supabase/.dashboard-apply/
└── phase-2.sql                                # gitignored bundle for the corporate-network workflow

supabase/tests/
└── phase2-rls.test.ts                         # cross-tenant + role-gated + EXCLUDE constraint tests
```

### Shared package additions (`packages/shared/src/`)

```
enums/
├── booking-status.ts        # 'pending' | 'confirmed' | 'seated' | 'completed' | 'cancelled' | 'no_show'
├── booking-source.ts        # 'manual' | 'walk_in'
└── table-status.ts          # 'available' | 'reserved' | 'occupied' | 'cleaning' | 'unavailable'

schemas/
├── booking.ts               # BookingCreate, BookingUpdate, WalkInCreate
└── table.ts                 # TableCreate, TableUpdate

constants/
└── booking-rules.ts         # BOOKING_RULES const object

utils/
└── derive-table-status.ts   # deriveTableStatus(table, bookings) → TableStatus

types/database.ts            # regenerated from live schema
index.ts                     # re-exports
```

### Web app additions (`apps/web/`)

```
lib/actions/
├── tables.ts                # createTableAction, updateTableAction, setTableStatusAction, deleteTableAction, getAvailableTablesForSlot
└── bookings.ts              # createBookingAction, createWalkInAction, updateBookingAction, transitionBookingAction

components/
├── status-pill.tsx          # color-coded pill, used for both booking and table statuses
├── table-card.tsx           # /floor card with derived status + action buttons
├── table-form.tsx           # admin add/edit form on /settings/tables
├── customer-picker.tsx      # autocomplete + "+ Create new" inline
├── table-select.tsx         # dropdown calling getAvailableTablesForSlot
├── booking-form.tsx         # shared between create and edit
├── seat-walkin-popover.tsx  # inline form on /floor card
└── floor-auto-refresh.tsx   # 30s router.refresh() loop

lib/nav/items.ts             # MODIFY — graduate Bookings, add Floor

app/(app)/
├── floor/page.tsx
├── bookings/
│   ├── page.tsx
│   ├── new/page.tsx
│   └── [id]/page.tsx
└── settings/tables/
    ├── page.tsx
    └── tables-list.tsx      # client list component
```

---

## Tasks

### Task 1: Migration — Phase 2 enums + extension

**Files:**
- Create: `supabase/migrations/0009_phase2_enums_and_extension.sql`

- [ ] **Step 1: Write the migration**

```sql
-- 0009_phase2_enums_and_extension.sql

-- Required for tstzrange exclusion constraint that combines = with &&
create extension if not exists btree_gist;

create type public.table_status as enum (
  'available',
  'reserved',
  'occupied',
  'cleaning',
  'unavailable'
);

create type public.booking_source as enum (
  'manual',
  'walk_in'
);
-- Phase 3 adds 'whatsapp' via:
--   alter type public.booking_source add value 'whatsapp' before 'manual';

create type public.booking_status as enum (
  'pending',
  'confirmed',
  'seated',
  'completed',
  'cancelled',
  'no_show'
);
```

- [ ] **Step 2: Commit**

```bash
git add supabase/migrations/0009_phase2_enums_and_extension.sql
git commit -m "feat(db): add Phase 2 enums (booking_status, booking_source, table_status) and btree_gist"
```

---

### Task 2: Migration — tables + bookings tables, indexes, RLS, EXCLUDE constraint, triggers

**Files:**
- Create: `supabase/migrations/0010_phase2_tables_and_bookings.sql`

- [ ] **Step 1: Write the migration**

```sql
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
```

- [ ] **Step 2: Commit**

```bash
git add supabase/migrations/0010_phase2_tables_and_bookings.sql
git commit -m "feat(db): add tables and bookings with RLS + exclusion constraint"
```

---

### Task 3: Dashboard-apply bundle for Phase 2

**Files:**
- Create: `supabase/.dashboard-apply/phase-2.sql` (gitignored)

- [ ] **Step 1: Write the bundle file**

The directory is already in `.gitignore` (`supabase/.dashboard-apply/`). Create the file:

```sql
-- Buranchi Koda — Phase 2 dashboard apply bundle
-- Combines migrations 0009 + 0010 in one transaction with migration tracking.
-- Paste into Supabase Dashboard → SQL Editor → New query.

begin;

-- ============================================================================
-- 0009_phase2_enums_and_extension.sql
-- ============================================================================

create extension if not exists btree_gist;

create type public.table_status as enum (
  'available', 'reserved', 'occupied', 'cleaning', 'unavailable'
);

create type public.booking_source as enum (
  'manual', 'walk_in'
);

create type public.booking_status as enum (
  'pending', 'confirmed', 'seated', 'completed', 'cancelled', 'no_show'
);

-- ============================================================================
-- 0010_phase2_tables_and_bookings.sql
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

-- ============================================================================
-- Migration tracker (so future supabase db push sees these as already applied)
-- ============================================================================

insert into supabase_migrations.schema_migrations (version, name) values
  ('0009', 'phase2_enums_and_extension'),
  ('0010', 'phase2_tables_and_bookings')
on conflict (version) do nothing;

commit;
```

- [ ] **Step 2: Verify it's gitignored**

```bash
git check-ignore supabase/.dashboard-apply/phase-2.sql
```
Expected: prints the path (means it's ignored).

- [ ] **Step 3: User applies the bundle in Supabase dashboard**

The user pastes this file into https://supabase.com/dashboard/project/zsbnsxwsnoulspzkfpvb/sql/new and clicks Run. **The implementer asks the user to do this and waits for confirmation before continuing.**

Verification SQL the user runs after the bundle:

```sql
-- 1. Tables exist with RLS enabled
select tablename, rowsecurity
from pg_tables
where schemaname = 'public' and tablename in ('tables', 'bookings')
order by tablename;
-- Expected: 2 rows, both rowsecurity=true

-- 2. Enums exist
select typname from pg_type
where typname in ('table_status', 'booking_source', 'booking_status')
order by typname;
-- Expected: 3 rows

-- 3. Exclusion constraint exists
select conname, contype from pg_constraint where conname = 'bookings_no_overlap';
-- Expected: 1 row, contype='x'

-- 4. Migration tracker
select version, name from supabase_migrations.schema_migrations
where version in ('0009', '0010')
order by version;
-- Expected: 2 rows
```

User pastes this verification block too and confirms output. **No commit on this task — files are gitignored.**

---

### Task 4: Phase 2 RLS integration tests

**Files:**
- Create: `supabase/tests/phase2-rls.test.ts`

- [ ] **Step 1: Write the failing tests**

```ts
import { afterAll, beforeAll, describe, expect, test } from 'vitest';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';

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

async function makeUser(email: string, organizationId: string, role: 'admin' | 'front_desk' | 'customer_service'): Promise<{ id: string; client: SupabaseClient }> {
  const { data: created, error: createErr } = await admin.auth.admin.createUser({
    email,
    password: 'test-password-123',
    email_confirm: true,
    user_metadata: { organization_id: organizationId, full_name: email.split('@')[0], role },
  });
  if (createErr || !created.user) throw createErr ?? new Error('user not created');
  const userClient = createClient(SUPABASE_URL, ANON_KEY);
  const { error: signInErr } = await userClient.auth.signInWithPassword({ email, password: 'test-password-123' });
  if (signInErr) throw signInErr;
  return { id: created.user.id, client: userClient };
}

beforeAll(async () => {
  admin = createClient(SUPABASE_URL, SERVICE_KEY, { auth: { autoRefreshToken: false, persistSession: false } });

  const { data: buranchi } = await admin.from('organizations').select('id').eq('slug', 'buranchi').single();
  buranchiOrgId = buranchi!.id;

  const { data: other } = await admin
    .from('organizations').insert({ slug: 'phase2-test-' + Date.now(), name: 'Phase 2 Test Org' })
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

  const { data: bc } = await admin.from('customers').insert({ organization_id: buranchiOrgId, full_name: 'Buranchi Test Customer' }).select('id').single();
  buranchiCustomerId = bc!.id;
  const { data: oc } = await admin.from('customers').insert({ organization_id: otherOrgId, full_name: 'Other Test Customer' }).select('id').single();
  otherCustomerId = oc!.id;

  const { data: bt } = await admin.from('tables').insert({ organization_id: buranchiOrgId, code: 'BT' + ts, capacity: 4 }).select('id').single();
  buranchiTableId = bt!.id;
  const { data: ot } = await admin.from('tables').insert({ organization_id: otherOrgId, code: 'OT' + ts, capacity: 4 }).select('id').single();
  otherTableId = ot!.id;
});

afterAll(async () => {
  await admin.from('bookings').delete().eq('organization_id', buranchiOrgId).eq('special_request', '__test__');
  await admin.from('bookings').delete().eq('organization_id', otherOrgId);
  await admin.from('tables').delete().eq('id', buranchiTableId).catch(() => {});
  await admin.from('tables').delete().eq('id', otherTableId).catch(() => {});
  await admin.from('customers').delete().eq('id', buranchiCustomerId).catch(() => {});
  await admin.from('customers').delete().eq('id', otherCustomerId).catch(() => {});
  await admin.auth.admin.deleteUser(buranchiAdminId).catch(() => {});
  await admin.auth.admin.deleteUser(buranchiFrontDeskId).catch(() => {});
  await admin.auth.admin.deleteUser(buranchiCustomerServiceId).catch(() => {});
  await admin.auth.admin.deleteUser(otherAdminId).catch(() => {});
  await admin.from('organizations').delete().eq('id', otherOrgId).catch(() => {});
});

describe('Phase 2 RLS — tables', () => {
  test('admin can insert a table; front_desk cannot', async () => {
    const code1 = 'A' + Date.now();
    const { error: adminErr } = await buranchiAdminClient.from('tables').insert({
      organization_id: buranchiOrgId, code: code1, capacity: 2,
    });
    expect(adminErr).toBeNull();

    const code2 = 'F' + Date.now();
    const { error: fdErr } = await buranchiFrontDeskClient.from('tables').insert({
      organization_id: buranchiOrgId, code: code2, capacity: 2,
    });
    // RLS denial returns null data + error or zero rows — verify by counting:
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
    }).select('id').single();
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
    });
    const { data: row } = await admin.from('bookings').select('id').eq('special_request', '__cs_attempt__');
    expect(row).toHaveLength(0);
  });

  test('exclusion constraint blocks overlapping active bookings on same table', async () => {
    const startsAt = new Date(Date.now() + 72 * 60 * 60 * 1000).toISOString();
    const endsAt = new Date(Date.parse(startsAt) + 2 * 60 * 60 * 1000).toISOString();
    // First booking — ok
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
    });
    expect(firstErr).toBeNull();
    // Overlapping booking on the same table — must be rejected
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
    });
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
    }).select('id').single();
    expect(cancelledBooking?.id).toBeDefined();

    // Overlapping confirmed booking against the cancelled one — must succeed
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
    });
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
    }).select('id').single();
    const { data: visible } = await buranchiAdminClient.from('bookings').select('id').eq('id', otherBooking!.id);
    expect(visible).toHaveLength(0);
  });
});
```

- [ ] **Step 2: Run the tests**

```bash
pnpm db:test
```

Expected: all 7 tests pass (3 from Phase 1 RLS + 6 new Phase 2 tests). If the user hasn't applied the dashboard bundle yet, this fails — coordinate with them.

- [ ] **Step 3: Commit**

```bash
git add supabase/tests/phase2-rls.test.ts
git commit -m "test(db): add Phase 2 RLS + exclusion constraint integration tests"
```

---

### Task 5: Shared package — enums

**Files:**
- Create: `packages/shared/src/enums/booking-status.ts`
- Create: `packages/shared/src/enums/booking-source.ts`
- Create: `packages/shared/src/enums/table-status.ts`
- Modify: `packages/shared/src/index.ts`

- [ ] **Step 1: Create `booking-status.ts`**

```ts
import { z } from 'zod';

export const BookingStatusSchema = z.enum([
  'pending',
  'confirmed',
  'seated',
  'completed',
  'cancelled',
  'no_show',
]);
export type BookingStatus = z.infer<typeof BookingStatusSchema>;

export const BOOKING_STATUS_LABELS: Record<BookingStatus, string> = {
  pending: 'Pending',
  confirmed: 'Confirmed',
  seated: 'Seated',
  completed: 'Completed',
  cancelled: 'Cancelled',
  no_show: 'No-show',
};

/**
 * Allowed transitions for the booking state machine.
 * Used by transitionBookingAction to validate moves.
 */
export const BOOKING_TRANSITIONS: Record<BookingStatus, readonly BookingStatus[]> = {
  pending:   ['confirmed', 'cancelled'],
  confirmed: ['seated', 'cancelled', 'no_show'],
  seated:    ['completed', 'cancelled'],
  completed: [],
  cancelled: [],
  no_show:   [],
};

export function canTransition(from: BookingStatus, to: BookingStatus): boolean {
  return BOOKING_TRANSITIONS[from].includes(to);
}
```

- [ ] **Step 2: Create `booking-source.ts`**

```ts
import { z } from 'zod';

export const BookingSourceSchema = z.enum(['manual', 'walk_in']);
export type BookingSource = z.infer<typeof BookingSourceSchema>;

export const BOOKING_SOURCE_LABELS: Record<BookingSource, string> = {
  manual: 'Manual',
  walk_in: 'Walk-in',
};
```

- [ ] **Step 3: Create `table-status.ts`**

```ts
import { z } from 'zod';

export const TableStatusSchema = z.enum([
  'available',
  'reserved',
  'occupied',
  'cleaning',
  'unavailable',
]);
export type TableStatus = z.infer<typeof TableStatusSchema>;

export const TABLE_STATUS_LABELS: Record<TableStatus, string> = {
  available: 'Available',
  reserved: 'Reserved',
  occupied: 'Occupied',
  cleaning: 'Cleaning',
  unavailable: 'Unavailable',
};

/**
 * Manual statuses that staff can set directly via setTableStatusAction.
 * Reserved and occupied are derived from bookings, not set manually.
 */
export const MANUAL_TABLE_STATUSES: readonly TableStatus[] = [
  'available',
  'cleaning',
  'unavailable',
];

export function isManualTableStatus(s: TableStatus): boolean {
  return (MANUAL_TABLE_STATUSES as readonly string[]).includes(s);
}
```

- [ ] **Step 4: Update `packages/shared/src/index.ts` to re-export**

Append these lines:

```ts
export * from './enums/booking-status.js';
export * from './enums/booking-source.js';
export * from './enums/table-status.js';
```

- [ ] **Step 5: Verify typecheck**

```bash
pnpm --filter @buranchi/shared typecheck
```
Expected: pass.

- [ ] **Step 6: Commit**

```bash
git add packages/shared/src/enums/booking-status.ts packages/shared/src/enums/booking-source.ts packages/shared/src/enums/table-status.ts packages/shared/src/index.ts
git commit -m "feat(shared): add Phase 2 enums (booking-status, booking-source, table-status)"
```

---

### Task 6: Shared package — booking rules constants

**Files:**
- Create: `packages/shared/src/constants/booking-rules.ts`
- Modify: `packages/shared/src/index.ts`

- [ ] **Step 1: Create the constants file**

```ts
/**
 * Hardcoded operational rules for Phase 2 bookings.
 * Per-organization configurable rules are deferred to a future polish iteration.
 */
export const BOOKING_RULES = {
  /** Default booking duration in minutes (manual reservations + walk-ins). */
  defaultDurationMinutes: 120,
  /** Required cleaning buffer between bookings on the same table. */
  cleaningBufferMinutes: 15,
  /** Earliest a manual reservation can start, relative to now. */
  minAdvanceMinutes: 60,
  /** Furthest in the future a reservation can be made, relative to now. */
  maxAdvanceDays: 90,
} as const;

export type BookingRules = typeof BOOKING_RULES;

/** Compute ends_at from a starts_at using the default duration. */
export function computeEndsAt(startsAt: Date): Date {
  return new Date(startsAt.getTime() + BOOKING_RULES.defaultDurationMinutes * 60_000);
}
```

- [ ] **Step 2: Update `packages/shared/src/index.ts`**

Append:

```ts
export * from './constants/booking-rules.js';
```

- [ ] **Step 3: Verify typecheck**

```bash
pnpm --filter @buranchi/shared typecheck
```

- [ ] **Step 4: Commit**

```bash
git add packages/shared/src/constants/booking-rules.ts packages/shared/src/index.ts
git commit -m "feat(shared): add BOOKING_RULES constants and computeEndsAt helper"
```

---

### Task 7: Shared package — Zod schemas (TDD)

**Files:**
- Create: `packages/shared/src/schemas/booking.ts`
- Create: `packages/shared/src/schemas/table.ts`
- Create: `packages/shared/src/schemas/booking.test.ts`
- Create: `packages/shared/src/schemas/table.test.ts`
- Modify: `packages/shared/src/index.ts`

- [ ] **Step 1: Write the failing booking schema test**

`packages/shared/src/schemas/booking.test.ts`:

```ts
import { describe, expect, test } from 'vitest';
import { BookingCreateSchema, BookingUpdateSchema, WalkInCreateSchema } from './booking.js';

describe('BookingCreateSchema', () => {
  const valid = {
    customer_id: '00000000-0000-0000-0000-000000000001',
    table_id:    '00000000-0000-0000-0000-000000000002',
    starts_at:   '2026-12-01T19:00:00Z',
    party_size:  4,
  };

  test('accepts a valid minimal booking', () => {
    const r = BookingCreateSchema.safeParse(valid);
    expect(r.success).toBe(true);
  });

  test('rejects party_size < 1', () => {
    const r = BookingCreateSchema.safeParse({ ...valid, party_size: 0 });
    expect(r.success).toBe(false);
  });

  test('rejects party_size > 50', () => {
    const r = BookingCreateSchema.safeParse({ ...valid, party_size: 51 });
    expect(r.success).toBe(false);
  });

  test('rejects bad UUIDs', () => {
    const r = BookingCreateSchema.safeParse({ ...valid, customer_id: 'not-a-uuid' });
    expect(r.success).toBe(false);
  });

  test('rejects bad datetime', () => {
    const r = BookingCreateSchema.safeParse({ ...valid, starts_at: 'not-a-date' });
    expect(r.success).toBe(false);
  });

  test('special_request and internal_notes are optional, max length enforced', () => {
    const ok = BookingCreateSchema.safeParse({ ...valid, special_request: 'A'.repeat(500), internal_notes: 'B'.repeat(2000) });
    expect(ok.success).toBe(true);
    const tooLongSr = BookingCreateSchema.safeParse({ ...valid, special_request: 'A'.repeat(501) });
    expect(tooLongSr.success).toBe(false);
    const tooLongIn = BookingCreateSchema.safeParse({ ...valid, internal_notes: 'B'.repeat(2001) });
    expect(tooLongIn.success).toBe(false);
  });
});

describe('BookingUpdateSchema', () => {
  test('all fields optional', () => {
    expect(BookingUpdateSchema.safeParse({}).success).toBe(true);
    expect(BookingUpdateSchema.safeParse({ party_size: 3 }).success).toBe(true);
  });
});

describe('WalkInCreateSchema', () => {
  const base = {
    table_id:   '00000000-0000-0000-0000-000000000002',
    party_size: 2,
  };

  test('accepts existing customer_id', () => {
    const r = WalkInCreateSchema.safeParse({ ...base, customer_id: '00000000-0000-0000-0000-000000000001' });
    expect(r.success).toBe(true);
  });

  test('accepts new-customer fields', () => {
    const r = WalkInCreateSchema.safeParse({ ...base, customer_full_name: 'Ana' });
    expect(r.success).toBe(true);
  });

  test('rejects when neither id nor name is provided', () => {
    const r = WalkInCreateSchema.safeParse(base);
    expect(r.success).toBe(false);
  });
});
```

- [ ] **Step 2: Run to verify failure**

```bash
pnpm --filter @buranchi/shared test
```
Expected: fails — `Cannot resolve './booking.js'` or similar.

- [ ] **Step 3: Implement `booking.ts`**

```ts
import { z } from 'zod';

export const BookingCreateSchema = z.object({
  customer_id: z.string().uuid(),
  table_id: z.string().uuid(),
  starts_at: z.string().datetime(),
  party_size: z.number().int().min(1).max(50),
  special_request: z.string().max(500).optional(),
  internal_notes: z.string().max(2000).optional(),
});

export type BookingCreate = z.infer<typeof BookingCreateSchema>;

export const BookingUpdateSchema = BookingCreateSchema.partial();
export type BookingUpdate = z.infer<typeof BookingUpdateSchema>;

export const WalkInCreateSchema = z.object({
  customer_id: z.string().uuid().optional(),
  customer_full_name: z.string().trim().min(1).max(120).optional(),
  customer_phone: z.string().optional(),
  table_id: z.string().uuid(),
  party_size: z.number().int().min(1).max(50),
  special_request: z.string().max(500).optional(),
}).refine(
  (data) => Boolean(data.customer_id) || Boolean(data.customer_full_name),
  { message: 'Either customer_id or customer_full_name is required.' },
);

export type WalkInCreate = z.infer<typeof WalkInCreateSchema>;

export const TransitionBookingSchema = z.object({
  next: z.enum(['seated', 'completed', 'cancelled', 'no_show']),
  reason: z.string().max(500).optional(),
});

export type TransitionBooking = z.infer<typeof TransitionBookingSchema>;
```

- [ ] **Step 4: Write the failing table schema test**

`packages/shared/src/schemas/table.test.ts`:

```ts
import { describe, expect, test } from 'vitest';
import { TableCreateSchema, TableUpdateSchema } from './table.js';

describe('TableCreateSchema', () => {
  test('accepts a valid table', () => {
    const r = TableCreateSchema.safeParse({ code: 'T01', capacity: 4 });
    expect(r.success).toBe(true);
    if (r.success) expect(r.data.is_active).toBe(true);
  });

  test('trims code', () => {
    const r = TableCreateSchema.safeParse({ code: '  T02  ', capacity: 2 });
    expect(r.success).toBe(true);
    if (r.success) expect(r.data.code).toBe('T02');
  });

  test('rejects empty code', () => {
    expect(TableCreateSchema.safeParse({ code: '', capacity: 4 }).success).toBe(false);
  });

  test('rejects capacity < 1 or > 50', () => {
    expect(TableCreateSchema.safeParse({ code: 'T1', capacity: 0 }).success).toBe(false);
    expect(TableCreateSchema.safeParse({ code: 'T1', capacity: 51 }).success).toBe(false);
  });

  test('floor_area is optional, max length enforced', () => {
    expect(TableCreateSchema.safeParse({ code: 'T1', capacity: 4, floor_area: 'Patio' }).success).toBe(true);
    expect(TableCreateSchema.safeParse({ code: 'T1', capacity: 4, floor_area: 'A'.repeat(65) }).success).toBe(false);
  });
});

describe('TableUpdateSchema', () => {
  test('all fields optional', () => {
    expect(TableUpdateSchema.safeParse({}).success).toBe(true);
    expect(TableUpdateSchema.safeParse({ is_active: false }).success).toBe(true);
  });
});
```

- [ ] **Step 5: Implement `table.ts`**

```ts
import { z } from 'zod';

export const TableCreateSchema = z.object({
  code: z.string().trim().min(1).max(16),
  capacity: z.number().int().min(1).max(50),
  floor_area: z.string().max(64).optional().or(z.literal('').transform(() => undefined)),
  is_active: z.boolean().default(true),
});

export type TableCreate = z.infer<typeof TableCreateSchema>;

export const TableUpdateSchema = TableCreateSchema.partial();
export type TableUpdate = z.infer<typeof TableUpdateSchema>;
```

- [ ] **Step 6: Update `packages/shared/src/index.ts`**

Append:

```ts
export * from './schemas/booking.js';
export * from './schemas/table.js';
```

- [ ] **Step 7: Run all tests**

```bash
pnpm --filter @buranchi/shared test
```
Expected: 13/13 prior tests + new tests all pass.

- [ ] **Step 8: Commit**

```bash
git add packages/shared/src/schemas/booking.ts packages/shared/src/schemas/booking.test.ts packages/shared/src/schemas/table.ts packages/shared/src/schemas/table.test.ts packages/shared/src/index.ts
git commit -m "feat(shared): add Phase 2 Zod schemas (Booking, WalkIn, Table) with TDD"
```

---

### Task 8: Shared package — `deriveTableStatus` utility (TDD)

**Files:**
- Create: `packages/shared/src/utils/derive-table-status.ts`
- Create: `packages/shared/src/utils/derive-table-status.test.ts`
- Modify: `packages/shared/src/index.ts`

- [ ] **Step 1: Write the failing test**

```ts
import { describe, expect, test } from 'vitest';
import { deriveTableStatus, type TableForDerive, type BookingForDerive } from './derive-table-status.js';

const NOW = new Date('2026-12-01T18:00:00Z');

const tableId = '00000000-0000-0000-0000-000000000001';
const baseTable: TableForDerive = { id: tableId, status: 'available' };

const seated: BookingForDerive = {
  table_id: tableId, status: 'seated',
  starts_at: '2026-12-01T17:00:00Z', ends_at: '2026-12-01T19:00:00Z',
};

const confirmedNear: BookingForDerive = {
  table_id: tableId, status: 'confirmed',
  starts_at: '2026-12-01T18:30:00Z', ends_at: '2026-12-01T20:30:00Z',
};

const confirmedFar: BookingForDerive = {
  table_id: tableId, status: 'confirmed',
  starts_at: '2026-12-01T22:00:00Z', ends_at: '2026-12-02T00:00:00Z',
};

describe('deriveTableStatus', () => {
  test('manual cleaning override wins', () => {
    expect(deriveTableStatus({ ...baseTable, status: 'cleaning' }, [seated], NOW)).toBe('cleaning');
  });

  test('manual unavailable override wins', () => {
    expect(deriveTableStatus({ ...baseTable, status: 'unavailable' }, [seated], NOW)).toBe('unavailable');
  });

  test('seated booking → occupied', () => {
    expect(deriveTableStatus(baseTable, [seated], NOW)).toBe('occupied');
  });

  test('confirmed booking starting within 60 minutes → reserved', () => {
    expect(deriveTableStatus(baseTable, [confirmedNear], NOW)).toBe('reserved');
  });

  test('confirmed booking starting later → still available', () => {
    expect(deriveTableStatus(baseTable, [confirmedFar], NOW)).toBe('available');
  });

  test('no relevant bookings → available', () => {
    expect(deriveTableStatus(baseTable, [], NOW)).toBe('available');
  });

  test('seated takes precedence over reserved', () => {
    expect(deriveTableStatus(baseTable, [seated, confirmedNear], NOW)).toBe('occupied');
  });

  test('booking on different table is ignored', () => {
    const other = { ...seated, table_id: '00000000-0000-0000-0000-000000000099' };
    expect(deriveTableStatus(baseTable, [other], NOW)).toBe('available');
  });
});
```

- [ ] **Step 2: Run to fail**

```bash
pnpm --filter @buranchi/shared test
```

- [ ] **Step 3: Implement**

`packages/shared/src/utils/derive-table-status.ts`:

```ts
import type { TableStatus } from '../enums/table-status.js';
import type { BookingStatus } from '../enums/booking-status.js';

export interface TableForDerive {
  id: string;
  status: TableStatus;
}

export interface BookingForDerive {
  table_id: string;
  status: BookingStatus;
  starts_at: string;
  ends_at: string;
}

const RESERVED_LOOKAHEAD_MINUTES = 60;

/**
 * Derives the live status of a table.
 *
 * Rules:
 * 1. If table.status is a manual override (cleaning, unavailable) → return as-is.
 * 2. If any booking on this table is currently seated → 'occupied'.
 * 3. If any confirmed booking starts within RESERVED_LOOKAHEAD_MINUTES from now → 'reserved'.
 * 4. Otherwise → 'available'.
 */
export function deriveTableStatus(
  table: TableForDerive,
  bookings: readonly BookingForDerive[],
  now: Date = new Date(),
): TableStatus {
  if (table.status === 'cleaning' || table.status === 'unavailable') {
    return table.status;
  }

  const tableBookings = bookings.filter((b) => b.table_id === table.id);

  const seatedNow = tableBookings.find((b) => b.status === 'seated');
  if (seatedNow) return 'occupied';

  const lookaheadCutoff = new Date(now.getTime() + RESERVED_LOOKAHEAD_MINUTES * 60_000);
  const reservedSoon = tableBookings.find((b) => {
    if (b.status !== 'confirmed') return false;
    const startsAt = new Date(b.starts_at);
    const endsAt = new Date(b.ends_at);
    return startsAt <= lookaheadCutoff && endsAt > now;
  });
  if (reservedSoon) return 'reserved';

  return 'available';
}
```

- [ ] **Step 4: Update index**

Append to `packages/shared/src/index.ts`:

```ts
export * from './utils/derive-table-status.js';
```

- [ ] **Step 5: Run tests**

```bash
pnpm --filter @buranchi/shared test
```
Expected: all derive-table-status tests pass.

- [ ] **Step 6: Commit**

```bash
git add packages/shared/src/utils/derive-table-status.ts packages/shared/src/utils/derive-table-status.test.ts packages/shared/src/index.ts
git commit -m "feat(shared): add deriveTableStatus pure helper with TDD"
```

---

### Task 9: Regenerate database types

**Files:**
- Modify: `packages/shared/src/types/database.ts`

- [ ] **Step 1: Run the type generator**

```bash
pnpm db:types
```

This calls `supabase gen types typescript --project-id zsbnsxwsnoulspzkfpvb --schema public` and writes to `packages/shared/src/types/database.ts`. The new tables (`tables`, `bookings`) and enums (`table_status`, `booking_source`, `booking_status`) appear in the output.

- [ ] **Step 2: Verify the new tables are in the output**

```bash
grep -c "bookings:" packages/shared/src/types/database.ts
grep -c "tables:" packages/shared/src/types/database.ts
```
Both should be > 0.

- [ ] **Step 3: Verify typecheck**

```bash
pnpm --filter @buranchi/shared typecheck
pnpm --filter @buranchi/web typecheck
```
Both should pass.

- [ ] **Step 4: Commit**

```bash
git add packages/shared/src/types/database.ts
git commit -m "chore(shared): regenerate Database types with Phase 2 tables"
```

---

### Task 10: Server actions — `tables.ts`

**Files:**
- Create: `apps/web/lib/actions/tables.ts`

- [ ] **Step 1: Write the file**

```ts
'use server';

import { revalidatePath } from 'next/cache';
import {
  TableCreateSchema, TableUpdateSchema,
  type TableCreate, type TableUpdate,
  TableStatusSchema, type TableStatus, isManualTableStatus,
  computeEndsAt, BOOKING_RULES,
} from '@buranchi/shared';
import { requireRole } from '@/lib/auth/server';
import { createServerClient } from '@/lib/supabase/server';
import { ActionError } from '@/lib/auth/errors';

export async function createTableAction(input: unknown) {
  const profile = await requireRole(['admin']);
  const parsed = TableCreateSchema.parse(input) as TableCreate;
  const supabase = await createServerClient();
  const { data, error } = await supabase.from('tables').insert({
    organization_id: profile.organization_id,
    code: parsed.code,
    capacity: parsed.capacity,
    floor_area: parsed.floor_area ?? null,
    is_active: parsed.is_active,
  } as never).select('id').single();
  if (error) {
    if (error.code === '23505' && error.message.toLowerCase().includes('code')) {
      throw new ActionError('CODE_TAKEN', 'A table with this code already exists.');
    }
    throw new ActionError(error.code ?? 'DB', error.message);
  }
  revalidatePath('/settings/tables');
  revalidatePath('/floor');
  return { ok: true, id: data!.id };
}

export async function updateTableAction(id: string, input: unknown) {
  await requireRole(['admin']);
  const parsed = TableUpdateSchema.parse(input) as TableUpdate;
  const supabase = await createServerClient();
  const update: Record<string, unknown> = {};
  if (parsed.code !== undefined) update.code = parsed.code;
  if (parsed.capacity !== undefined) update.capacity = parsed.capacity;
  if (parsed.floor_area !== undefined) update.floor_area = parsed.floor_area ?? null;
  if (parsed.is_active !== undefined) update.is_active = parsed.is_active;
  const { error } = await supabase.from('tables').update(update as never).eq('id', id);
  if (error) {
    if (error.code === '23505') throw new ActionError('CODE_TAKEN', 'A table with this code already exists.');
    throw new ActionError(error.code ?? 'DB', error.message);
  }
  revalidatePath('/settings/tables');
  revalidatePath('/floor');
}

export async function setTableStatusAction(id: string, next: unknown) {
  await requireRole(['admin', 'front_desk']);
  const status = TableStatusSchema.parse(next) as TableStatus;
  if (!isManualTableStatus(status)) {
    throw new ActionError('INVALID_TABLE_STATUS', 'Only available, cleaning, and unavailable can be set manually.');
  }
  const supabase = await createServerClient();
  const { error } = await supabase.from('tables').update({ status } as never).eq('id', id);
  if (error) throw new ActionError(error.code ?? 'DB', error.message);
  revalidatePath('/floor');
}

export async function deleteTableAction(id: string) {
  await requireRole(['admin']);
  const supabase = await createServerClient();
  const { error } = await supabase.from('tables').delete().eq('id', id);
  if (error) {
    if (error.code === '23503') {
      throw new ActionError('TABLE_HAS_BOOKINGS', 'Tables with bookings cannot be deleted. Set inactive instead.');
    }
    throw new ActionError(error.code ?? 'DB', error.message);
  }
  revalidatePath('/settings/tables');
  revalidatePath('/floor');
}

export interface AvailableTable {
  id: string;
  code: string;
  capacity: number;
  floor_area: string | null;
}

/**
 * Lists active tables that can hold the requested party size and don't have
 * an overlapping active booking in the requested window.
 *
 * Window includes the cleaning buffer at the end automatically (callers pass
 * starts_at + duration; we widen the comparison range by BOOKING_RULES.cleaningBufferMinutes).
 */
export async function getAvailableTablesForSlot(
  startsAt: Date,
  partySize: number,
  excludeBookingId?: string,
): Promise<AvailableTable[]> {
  const profile = await requireRole(['admin', 'front_desk']);
  const endsAt = computeEndsAt(startsAt);
  const bufferedEndsAt = new Date(endsAt.getTime() + BOOKING_RULES.cleaningBufferMinutes * 60_000);

  const supabase = await createServerClient();
  // Fetch all is_active tables in this org with capacity >= partySize.
  const { data: candidateTables, error: tErr } = await supabase
    .from('tables')
    .select('id, code, capacity, floor_area')
    .eq('organization_id', profile.organization_id)
    .eq('is_active', true)
    .gte('capacity', partySize)
    .order('capacity', { ascending: true })
    .order('code', { ascending: true });
  if (tErr) throw new ActionError(tErr.code ?? 'DB', tErr.message);
  const candidates = (candidateTables ?? []) as AvailableTable[];
  if (candidates.length === 0) return [];

  // Fetch active bookings overlapping the buffered window.
  const candidateIds = candidates.map((t) => t.id);
  const { data: overlapping, error: bErr } = await supabase
    .from('bookings')
    .select('table_id, starts_at, ends_at, status, id')
    .in('table_id', candidateIds)
    .lt('starts_at', bufferedEndsAt.toISOString())
    .gt('ends_at', startsAt.toISOString())
    .not('status', 'in', '(cancelled,no_show,completed)');
  if (bErr) throw new ActionError(bErr.code ?? 'DB', bErr.message);

  const blockedTableIds = new Set(
    (overlapping ?? [])
      .filter((b) => !excludeBookingId || (b as { id: string }).id !== excludeBookingId)
      .map((b) => (b as { table_id: string }).table_id),
  );
  return candidates.filter((t) => !blockedTableIds.has(t.id));
}
```

- [ ] **Step 2: Verify typecheck**

```bash
pnpm --filter @buranchi/web typecheck
```

- [ ] **Step 3: Commit**

```bash
git add apps/web/lib/actions/tables.ts
git commit -m "feat(web): add tables server actions and getAvailableTablesForSlot"
```

---

### Task 11: Server actions — `bookings.ts`

**Files:**
- Create: `apps/web/lib/actions/bookings.ts`

- [ ] **Step 1: Write the file**

```ts
'use server';

import { revalidatePath } from 'next/cache';
import {
  BookingCreateSchema, BookingUpdateSchema, WalkInCreateSchema, TransitionBookingSchema,
  type BookingCreate, type BookingUpdate, type WalkInCreate, type TransitionBooking,
  canTransition, BOOKING_RULES, computeEndsAt,
  type BookingStatus, CustomerInputSchema,
} from '@buranchi/shared';
import { requireRole } from '@/lib/auth/server';
import { createServerClient } from '@/lib/supabase/server';
import { ActionError } from '@/lib/auth/errors';

function translateConflictError(code: string | undefined, message: string): ActionError {
  if (code === '23P01' || /exclusion|conflicting/i.test(message)) {
    return new ActionError('BOOKING_CONFLICT', 'This table is already booked for the requested time. Pick another table or time.');
  }
  return new ActionError(code ?? 'DB', message);
}

export async function createBookingAction(input: unknown) {
  const profile = await requireRole(['admin', 'front_desk']);
  const parsed = BookingCreateSchema.parse(input) as BookingCreate;
  const startsAt = new Date(parsed.starts_at);
  const endsAt = computeEndsAt(startsAt);

  // Sanity: respect min advance.
  const minStart = new Date(Date.now() + BOOKING_RULES.minAdvanceMinutes * 60_000);
  if (startsAt < minStart) {
    throw new ActionError('TOO_SOON', `Bookings need at least ${BOOKING_RULES.minAdvanceMinutes} minutes advance notice.`);
  }
  // Sanity: respect max advance.
  const maxStart = new Date(Date.now() + BOOKING_RULES.maxAdvanceDays * 24 * 60 * 60 * 1000);
  if (startsAt > maxStart) {
    throw new ActionError('TOO_FAR', `Bookings cannot be more than ${BOOKING_RULES.maxAdvanceDays} days in advance.`);
  }

  const supabase = await createServerClient();
  const { data, error } = await supabase.from('bookings').insert({
    organization_id: profile.organization_id,
    customer_id: parsed.customer_id,
    table_id: parsed.table_id,
    starts_at: startsAt.toISOString(),
    ends_at: endsAt.toISOString(),
    party_size: parsed.party_size,
    source: 'manual',
    status: 'confirmed',
    special_request: parsed.special_request ?? null,
    internal_notes: parsed.internal_notes ?? null,
    created_by: profile.id,
  } as never).select('id').single();
  if (error) throw translateConflictError(error.code, error.message);
  revalidatePath('/bookings');
  revalidatePath('/floor');
  return { ok: true, id: data!.id };
}

export async function createWalkInAction(input: unknown) {
  const profile = await requireRole(['admin', 'front_desk']);
  const parsed = WalkInCreateSchema.parse(input) as WalkInCreate;
  const supabase = await createServerClient();

  // 1. Resolve customer (existing or create new).
  let customerId = parsed.customer_id;
  if (!customerId) {
    const customerInput = CustomerInputSchema.parse({
      full_name: parsed.customer_full_name,
      phone: parsed.customer_phone,
    });
    const { data: cust, error: cErr } = await supabase.from('customers').insert({
      organization_id: profile.organization_id,
      full_name: customerInput.full_name,
      phone: customerInput.phone ?? null,
      created_by: profile.id,
    } as never).select('id').single();
    if (cErr) throw new ActionError(cErr.code ?? 'DB', cErr.message);
    customerId = cust!.id;
  }

  // 2. Create the walk-in booking.
  const startsAt = new Date();
  const endsAt = computeEndsAt(startsAt);
  const { data, error } = await supabase.from('bookings').insert({
    organization_id: profile.organization_id,
    customer_id: customerId,
    table_id: parsed.table_id,
    starts_at: startsAt.toISOString(),
    ends_at: endsAt.toISOString(),
    party_size: parsed.party_size,
    source: 'walk_in',
    status: 'seated',
    seated_at: startsAt.toISOString(),
    special_request: parsed.special_request ?? null,
    created_by: profile.id,
  } as never).select('id').single();
  if (error) throw translateConflictError(error.code, error.message);
  revalidatePath('/bookings');
  revalidatePath('/floor');
  return { ok: true, id: data!.id };
}

export async function updateBookingAction(id: string, input: unknown) {
  await requireRole(['admin', 'front_desk']);
  const parsed = BookingUpdateSchema.parse(input) as BookingUpdate;
  const supabase = await createServerClient();

  // Fetch current row to validate state.
  const { data: current } = await supabase.from('bookings')
    .select('status, starts_at, ends_at, table_id')
    .eq('id', id).single();
  const cur = current as { status: BookingStatus; starts_at: string; ends_at: string; table_id: string } | null;
  if (!cur) throw new ActionError('NOT_FOUND', 'Booking not found.');
  if (cur.status === 'completed' || cur.status === 'cancelled' || cur.status === 'no_show') {
    throw new ActionError('IMMUTABLE', 'Completed, cancelled, and no-show bookings cannot be edited.');
  }

  const update: Record<string, unknown> = {};
  let nextStartsAt: Date | undefined;
  if (parsed.starts_at !== undefined) {
    nextStartsAt = new Date(parsed.starts_at);
    update.starts_at = nextStartsAt.toISOString();
    update.ends_at = computeEndsAt(nextStartsAt).toISOString();
  }
  if (parsed.party_size !== undefined) update.party_size = parsed.party_size;
  if (parsed.special_request !== undefined) update.special_request = parsed.special_request ?? null;
  if (parsed.internal_notes !== undefined) update.internal_notes = parsed.internal_notes ?? null;
  if (parsed.table_id !== undefined) {
    if (cur.status === 'seated') {
      throw new ActionError('TABLE_LOCKED', 'Cannot reassign table for a seated booking.');
    }
    update.table_id = parsed.table_id;
  }
  if (parsed.customer_id !== undefined) update.customer_id = parsed.customer_id;

  const { error } = await supabase.from('bookings').update(update as never).eq('id', id);
  if (error) throw translateConflictError(error.code, error.message);
  revalidatePath('/bookings');
  revalidatePath(`/bookings/${id}`);
  revalidatePath('/floor');
}

export async function transitionBookingAction(id: string, input: unknown) {
  await requireRole(['admin', 'front_desk']);
  const parsed = TransitionBookingSchema.parse(input) as TransitionBooking;
  const supabase = await createServerClient();

  const { data: current } = await supabase.from('bookings').select('status').eq('id', id).single();
  const cur = current as { status: BookingStatus } | null;
  if (!cur) throw new ActionError('NOT_FOUND', 'Booking not found.');
  if (!canTransition(cur.status, parsed.next)) {
    throw new ActionError('INVALID_TRANSITION', `Cannot transition from ${cur.status} to ${parsed.next}.`);
  }

  const update: Record<string, unknown> = { status: parsed.next };
  const nowIso = new Date().toISOString();
  if (parsed.next === 'seated') update.seated_at = nowIso;
  if (parsed.next === 'completed') update.completed_at = nowIso;
  if (parsed.next === 'cancelled') {
    update.cancelled_at = nowIso;
    if (parsed.reason !== undefined) update.cancelled_reason = parsed.reason;
  }

  const { error } = await supabase.from('bookings').update(update as never).eq('id', id);
  if (error) throw new ActionError(error.code ?? 'DB', error.message);
  revalidatePath('/bookings');
  revalidatePath(`/bookings/${id}`);
  revalidatePath('/floor');
}
```

- [ ] **Step 2: Verify typecheck**

```bash
pnpm --filter @buranchi/web typecheck
```

- [ ] **Step 3: Commit**

```bash
git add apps/web/lib/actions/bookings.ts
git commit -m "feat(web): add bookings server actions (create, walk-in, update, transition)"
```

---

### Task 12: Component — `StatusPill`

**Files:**
- Create: `apps/web/components/status-pill.tsx`

- [ ] **Step 1: Write the component**

```tsx
import * as React from 'react';
import { cn } from '@buranchi/ui';
import {
  type BookingStatus, BOOKING_STATUS_LABELS,
  type TableStatus, TABLE_STATUS_LABELS,
} from '@buranchi/shared';

const BOOKING_TONE: Record<BookingStatus, string> = {
  pending:   'bg-row-divider text-muted',
  confirmed: 'bg-accent-soft text-accent',
  seated:    'bg-success-soft text-success',
  completed: 'bg-row-divider text-muted',
  cancelled: 'bg-danger-soft text-danger',
  no_show:   'bg-danger-soft text-danger',
};

const TABLE_TONE: Record<TableStatus, string> = {
  available:   'bg-success-soft text-success',
  reserved:    'bg-accent-soft text-accent',
  occupied:    'bg-fg text-white',
  cleaning:    'bg-row-divider text-muted',
  unavailable: 'bg-danger-soft text-danger',
};

const BASE = 'inline-flex items-center rounded-pill px-2.5 py-0.5 text-[10px] font-semibold tracking-wide uppercase';

export function BookingStatusPill({ status, className }: { status: BookingStatus; className?: string }) {
  return <span className={cn(BASE, BOOKING_TONE[status], className)}>{BOOKING_STATUS_LABELS[status]}</span>;
}

export function TableStatusPill({ status, className }: { status: TableStatus; className?: string }) {
  return <span className={cn(BASE, TABLE_TONE[status], className)}>{TABLE_STATUS_LABELS[status]}</span>;
}
```

- [ ] **Step 2: Commit**

```bash
git add apps/web/components/status-pill.tsx
git commit -m "feat(web): add StatusPill (BookingStatusPill, TableStatusPill)"
```

---

### Task 13: Component — `TableForm`

**Files:**
- Create: `apps/web/components/table-form.tsx`

- [ ] **Step 1: Write the component**

```tsx
'use client';

import * as React from 'react';
import { FormProvider, useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { Button, Input, FormField } from '@buranchi/ui';
import { TableCreateSchema, type TableCreate } from '@buranchi/shared';
import { createTableAction, updateTableAction } from '@/lib/actions/tables';

interface TableFormProps {
  /** When provided, the form is in edit mode. */
  id?: string;
  defaults?: Partial<TableCreate>;
  onSuccess?: () => void;
}

export function TableForm({ id, defaults, onSuccess }: TableFormProps) {
  const [pending, startTransition] = React.useTransition();
  const [error, setError] = React.useState<string | undefined>();
  const [saved, setSaved] = React.useState(false);

  React.useEffect(() => {
    if (!saved) return;
    const t = setTimeout(() => setSaved(false), 1500);
    return () => clearTimeout(t);
  }, [saved]);

  const form = useForm<TableCreate>({
    resolver: zodResolver(TableCreateSchema),
    defaultValues: {
      code: defaults?.code ?? '',
      capacity: defaults?.capacity ?? 2,
      ...(defaults?.floor_area ? { floor_area: defaults.floor_area } : {}),
      is_active: defaults?.is_active ?? true,
    },
  });

  const onSubmit = form.handleSubmit((values) => {
    setError(undefined);
    setSaved(false);
    startTransition(async () => {
      try {
        if (id) {
          await updateTableAction(id, values);
        } else {
          await createTableAction(values);
        }
        setSaved(true);
        if (!id) form.reset({ code: '', capacity: 2, is_active: true });
        onSuccess?.();
      } catch (e) {
        setError(e instanceof Error ? e.message : 'Failed');
      }
    });
  });

  return (
    <FormProvider {...form}>
      <form onSubmit={onSubmit} className="space-y-4 max-w-md">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <FormField id="code" label="Code" required hint="e.g. T01, P-04"
            {...(form.formState.errors.code?.message ? { error: form.formState.errors.code.message } : {})}
          >
            <Input id="code" {...form.register('code')} />
          </FormField>
          <FormField id="capacity" label="Capacity" required
            {...(form.formState.errors.capacity?.message ? { error: form.formState.errors.capacity.message } : {})}
          >
            <Input
              id="capacity"
              type="number"
              min={1}
              max={50}
              {...form.register('capacity', { valueAsNumber: true })}
            />
          </FormField>
        </div>
        <FormField id="floor_area" label="Floor area" hint="e.g. Indoor, Patio, Bar"
          {...(form.formState.errors.floor_area?.message ? { error: form.formState.errors.floor_area.message } : {})}
        >
          <Input id="floor_area" {...form.register('floor_area')} placeholder="optional" />
        </FormField>
        <label className="inline-flex items-center gap-2 text-[12px] text-fg">
          <input type="checkbox" {...form.register('is_active')} />
          <span>Active (shown on Floor view)</span>
        </label>
        {error ? <p className="text-[12px] text-danger">{error}</p> : null}
        <div className="flex items-center gap-3">
          <Button type="submit" disabled={pending}>{pending ? 'Saving…' : id ? 'Save changes' : 'Add table'}</Button>
          <span
            className={`text-[12px] text-success transition-opacity duration-300 ${saved ? 'opacity-100' : 'opacity-0'}`}
            aria-live="polite"
          >
            Saved
          </span>
        </div>
      </form>
    </FormProvider>
  );
}
```

- [ ] **Step 2: Verify typecheck**

```bash
pnpm --filter @buranchi/web typecheck
```

- [ ] **Step 3: Commit**

```bash
git add apps/web/components/table-form.tsx
git commit -m "feat(web): add TableForm (admin create/edit)"
```

---

### Task 14: Page — `/settings/tables`

**Files:**
- Create: `apps/web/app/(app)/settings/tables/page.tsx`
- Create: `apps/web/app/(app)/settings/tables/tables-list.tsx`

- [ ] **Step 1: Write the client list component**

`apps/web/app/(app)/settings/tables/tables-list.tsx`:

```tsx
'use client';

import * as React from 'react';
import Link from 'next/link';
import { Pencil, Trash2 } from 'lucide-react';
import { Button } from '@buranchi/ui';
import { TableStatusPill } from '@/components/status-pill';
import { TableForm } from '@/components/table-form';
import { deleteTableAction, updateTableAction } from '@/lib/actions/tables';
import type { TableStatus } from '@buranchi/shared';

export interface TableRow {
  id: string;
  code: string;
  capacity: number;
  floor_area: string | null;
  status: TableStatus;
  is_active: boolean;
}

export function TablesList({ rows }: { rows: TableRow[] }) {
  const [editingId, setEditingId] = React.useState<string | null>(null);
  const [error, setError] = React.useState<string | undefined>();
  const [pendingId, setPendingId] = React.useState<string | null>(null);

  async function handleDelete(id: string, code: string) {
    if (!confirm(`Delete table ${code}? Tables with bookings cannot be deleted.`)) return;
    setError(undefined);
    setPendingId(id);
    try {
      await deleteTableAction(id);
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'Failed';
      setError(msg);
      if (msg.includes('TABLE_HAS_BOOKINGS')) {
        if (confirm('This table has historical bookings. Set inactive instead?')) {
          await updateTableAction(id, { is_active: false });
        }
      }
    } finally {
      setPendingId(null);
    }
  }

  return (
    <div className="space-y-3">
      {error ? <p className="text-[12px] text-danger">{error}</p> : null}
      <div className="rounded-card bg-surface shadow-card overflow-hidden">
        <div className="px-4 grid grid-cols-[80px_80px_1fr_140px_80px_120px] py-3 text-label uppercase text-muted border-b border-border">
          <div>Code</div><div>Capacity</div><div>Floor area</div><div>Status</div><div>Active</div><div></div>
        </div>
        {rows.map((t) => (
          <div key={t.id}>
            <div className="px-4 grid grid-cols-[80px_80px_1fr_140px_80px_120px] py-3 border-b border-row-divider last:border-b-0 text-[12px] items-center">
              <div className="font-mono text-fg">{t.code}</div>
              <div className="text-fg">{t.capacity}</div>
              <div className="text-muted">{t.floor_area ?? <span className="text-border">—</span>}</div>
              <div><TableStatusPill status={t.status} /></div>
              <div className="text-muted">{t.is_active ? 'Yes' : 'No'}</div>
              <div className="flex justify-end gap-1">
                <Button size="sm" variant="ghost" onClick={() => setEditingId(editingId === t.id ? null : t.id)}>
                  <Pencil className="h-3.5 w-3.5" />
                  <span>{editingId === t.id ? 'Close' : 'Edit'}</span>
                </Button>
                <Button size="sm" variant="ghost" disabled={pendingId === t.id} onClick={() => handleDelete(t.id, t.code)}>
                  <Trash2 className="h-3.5 w-3.5" />
                </Button>
              </div>
            </div>
            {editingId === t.id ? (
              <div className="px-4 py-4 bg-canvas">
                <TableForm
                  id={t.id}
                  defaults={{
                    code: t.code,
                    capacity: t.capacity,
                    floor_area: t.floor_area ?? undefined,
                    is_active: t.is_active,
                  }}
                  onSuccess={() => setEditingId(null)}
                />
              </div>
            ) : null}
          </div>
        ))}
        {rows.length === 0 ? (
          <div className="px-4 py-8 text-center text-[12px] text-muted">
            No tables yet. Click "+ Add table" above to set up your floor.
          </div>
        ) : null}
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Write the page**

`apps/web/app/(app)/settings/tables/page.tsx`:

```tsx
import Link from 'next/link';
import { Topbar, Card } from '@buranchi/ui';
import { requireRole } from '@/lib/auth/server';
import { createServerClient } from '@/lib/supabase/server';
import { TableForm } from '@/components/table-form';
import { TablesList, type TableRow } from './tables-list';

export default async function TablesAdminPage() {
  const profile = await requireRole(['admin']);
  const supabase = await createServerClient();
  const { data } = await supabase.from('tables')
    .select('id, code, capacity, floor_area, status, is_active')
    .eq('organization_id', profile.organization_id)
    .order('code', { ascending: true });
  const rows = (data ?? []) as TableRow[];

  return (
    <>
      <Topbar
        breadcrumb={
          <>
            <Link href="/settings" className="hover:underline">Settings</Link> / Tables
          </>
        }
        title="Tables"
        backHref="/settings"
      />
      <div className="space-y-6 max-w-3xl">
        <section>
          <h2 className="text-[10px] uppercase tracking-[0.08em] text-muted font-semibold mb-3">Add new table</h2>
          <Card>
            <TableForm />
          </Card>
        </section>
        <section>
          <h2 className="text-[10px] uppercase tracking-[0.08em] text-muted font-semibold mb-3">Existing tables</h2>
          <TablesList rows={rows} />
        </section>
      </div>
    </>
  );
}
```

- [ ] **Step 3: Verify typecheck and smoke test**

```bash
pnpm --filter @buranchi/web typecheck
pnpm --filter @buranchi/web dev
```

In the browser, log in as admin → `/settings/tables`. Add 5 tables (e.g. T01–T05 with various capacities and areas). Edit one. Try to delete one (should succeed if no bookings yet).

- [ ] **Step 4: Commit**

```bash
git add 'apps/web/app/(app)/settings/tables/'
git commit -m "feat(web): add /settings/tables admin CRUD page"
```

---

### Task 15: Component — `CustomerPicker`

**Files:**
- Create: `apps/web/components/customer-picker.tsx`

- [ ] **Step 1: Write the component**

```tsx
'use client';

import * as React from 'react';
import { Search, UserPlus, ChevronDown } from 'lucide-react';
import { cn } from '@buranchi/ui';
import { createClient } from '@/lib/supabase/browser';

export interface CustomerPickerValue {
  /** Existing customer (preferred). */
  customer_id?: string;
  /** New customer fields (used for inline create). */
  customer_full_name?: string;
  customer_phone?: string;
}

interface CustomerPickerProps {
  value: CustomerPickerValue;
  onChange: (next: CustomerPickerValue) => void;
  organizationId: string;
}

interface CustomerSuggestion {
  id: string;
  display_id: string;
  full_name: string;
  phone: string | null;
}

const inputClass =
  'h-[33px] w-full rounded-input border border-border bg-surface px-3 text-[12px] text-fg placeholder:text-muted focus:outline-none focus:ring-2 focus:ring-accent focus:border-accent';

export function CustomerPicker({ value, onChange, organizationId }: CustomerPickerProps) {
  const [mode, setMode] = React.useState<'search' | 'new'>(value.customer_full_name ? 'new' : 'search');
  const [query, setQuery] = React.useState('');
  const [suggestions, setSuggestions] = React.useState<CustomerSuggestion[]>([]);
  const [pickedLabel, setPickedLabel] = React.useState<string | null>(null);
  const [open, setOpen] = React.useState(false);
  const containerRef = React.useRef<HTMLDivElement>(null);

  React.useEffect(() => {
    if (!open) return;
    function onDoc(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener('mousedown', onDoc);
    return () => document.removeEventListener('mousedown', onDoc);
  }, [open]);

  React.useEffect(() => {
    if (mode !== 'search' || query.trim().length === 0) {
      setSuggestions([]);
      return;
    }
    const supabase = createClient();
    const handle = setTimeout(async () => {
      const { data } = await supabase
        .from('customers')
        .select('id, display_id, full_name, phone')
        .eq('organization_id', organizationId)
        .ilike('full_name', `%${query.trim()}%`)
        .limit(8);
      setSuggestions((data ?? []) as CustomerSuggestion[]);
    }, 200);
    return () => clearTimeout(handle);
  }, [query, mode, organizationId]);

  function selectExisting(c: CustomerSuggestion) {
    onChange({ customer_id: c.id });
    setPickedLabel(`${c.display_id} · ${c.full_name}${c.phone ? ' · ' + c.phone : ''}`);
    setOpen(false);
    setQuery('');
  }

  function clearPick() {
    onChange({});
    setPickedLabel(null);
  }

  if (mode === 'new') {
    return (
      <div className="space-y-2">
        <input
          aria-label="Customer name"
          className={inputClass}
          placeholder="New customer name"
          value={value.customer_full_name ?? ''}
          onChange={(e) => onChange({ ...value, customer_full_name: e.target.value })}
        />
        <input
          aria-label="Customer phone (optional)"
          className={inputClass}
          placeholder="Phone (optional)"
          value={value.customer_phone ?? ''}
          onChange={(e) => onChange({ ...value, customer_phone: e.target.value })}
        />
        <button
          type="button"
          className="text-[11px] text-accent hover:underline inline-flex items-center gap-1"
          onClick={() => { onChange({}); setMode('search'); }}
        >
          <Search className="h-3 w-3" /> Pick existing customer instead
        </button>
      </div>
    );
  }

  if (pickedLabel) {
    return (
      <div className="flex items-center gap-2">
        <div className={cn(inputClass, 'inline-flex items-center')}>{pickedLabel}</div>
        <button type="button" className="text-[11px] text-accent hover:underline" onClick={clearPick}>Change</button>
      </div>
    );
  }

  return (
    <div ref={containerRef} className="relative">
      <input
        aria-label="Search customers"
        className={inputClass}
        placeholder="Search by name…"
        value={query}
        onChange={(e) => { setQuery(e.target.value); setOpen(true); }}
        onFocus={() => setOpen(true)}
      />
      {open && (suggestions.length > 0 || query.trim().length > 0) ? (
        <div className="absolute top-full left-0 right-0 mt-1 z-20 rounded-card bg-surface shadow-popover border border-border overflow-hidden">
          {suggestions.map((c) => (
            <button
              key={c.id}
              type="button"
              className="w-full text-left px-3 py-2 hover:bg-canvas border-b border-row-divider last:border-b-0"
              onClick={() => selectExisting(c)}
            >
              <p className="text-[12px] text-fg font-medium">{c.full_name}</p>
              <p className="text-[11px] text-muted font-mono">{c.display_id}{c.phone ? ` · ${c.phone}` : ''}</p>
            </button>
          ))}
          <button
            type="button"
            className="w-full text-left px-3 py-2 hover:bg-canvas inline-flex items-center gap-2 text-[12px] text-accent"
            onClick={() => { setOpen(false); setMode('new'); }}
          >
            <UserPlus className="h-3.5 w-3.5" /> Create new customer
          </button>
        </div>
      ) : null}
    </div>
  );
}
```

- [ ] **Step 2: Verify typecheck**

```bash
pnpm --filter @buranchi/web typecheck
```

- [ ] **Step 3: Commit**

```bash
git add apps/web/components/customer-picker.tsx
git commit -m "feat(web): add CustomerPicker (search + create-new inline)"
```

---

### Task 16: Component — `TableSelect`

**Files:**
- Create: `apps/web/components/table-select.tsx`

- [ ] **Step 1: Write the component**

```tsx
'use client';

import * as React from 'react';
import { ChevronDown } from 'lucide-react';
import { getAvailableTablesForSlot, type AvailableTable } from '@/lib/actions/tables';

const selectClass =
  'h-[33px] w-full rounded-input border border-border bg-surface pl-2.5 pr-7 text-[12px] text-fg appearance-none cursor-pointer focus:outline-none focus:ring-2 focus:ring-accent focus:border-accent';

interface TableSelectProps {
  value: string;
  onChange: (next: string) => void;
  startsAt: Date | null;
  partySize: number;
  excludeBookingId?: string;
}

export function TableSelect({ value, onChange, startsAt, partySize, excludeBookingId }: TableSelectProps) {
  const [tables, setTables] = React.useState<AvailableTable[]>([]);
  const [loading, setLoading] = React.useState(false);

  React.useEffect(() => {
    if (!startsAt || !partySize) {
      setTables([]);
      return;
    }
    setLoading(true);
    getAvailableTablesForSlot(startsAt, partySize, excludeBookingId)
      .then((rows) => setTables(rows))
      .finally(() => setLoading(false));
  }, [startsAt?.toISOString(), partySize, excludeBookingId]);

  if (!startsAt || !partySize) {
    return <p className="text-[12px] text-muted">Pick a date, time, and party size first.</p>;
  }

  if (loading) return <p className="text-[12px] text-muted">Looking for free tables…</p>;
  if (tables.length === 0) {
    return <p className="text-[12px] text-danger">No tables fit the party size and time. Try a different time.</p>;
  }

  return (
    <div className="relative">
      <select
        aria-label="Table"
        className={selectClass}
        value={value}
        onChange={(e) => onChange(e.target.value)}
      >
        <option value="">Select a table…</option>
        {tables.map((t) => (
          <option key={t.id} value={t.id}>
            {t.code} · seats {t.capacity}{t.floor_area ? ` · ${t.floor_area}` : ''}
          </option>
        ))}
      </select>
      <ChevronDown className="pointer-events-none absolute right-2 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted" />
    </div>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add apps/web/components/table-select.tsx
git commit -m "feat(web): add TableSelect (calls getAvailableTablesForSlot)"
```

---

### Task 17: Component — `BookingForm`

**Files:**
- Create: `apps/web/components/booking-form.tsx`

- [ ] **Step 1: Write the component**

```tsx
'use client';

import * as React from 'react';
import { useRouter } from 'next/navigation';
import { Button, Input, Textarea, FormField } from '@buranchi/ui';
import { CustomerPicker, type CustomerPickerValue } from './customer-picker';
import { TableSelect } from './table-select';
import { createBookingAction, updateBookingAction } from '@/lib/actions/bookings';

interface BookingFormProps {
  /** When provided, the form is in edit mode. */
  id?: string;
  organizationId: string;
  defaults?: {
    customer_id?: string;
    customer_label?: string;
    table_id?: string;
    starts_at_local?: string; // YYYY-MM-DDTHH:mm
    party_size?: number;
    special_request?: string;
    internal_notes?: string;
  };
}

function localDatetimeToIso(local: string): string {
  // local is 'YYYY-MM-DDTHH:mm' from <input type="datetime-local">
  // Treat as user's local timezone. new Date() applies local offset.
  return new Date(local).toISOString();
}

export function BookingForm({ id, organizationId, defaults }: BookingFormProps) {
  const router = useRouter();
  const [pending, startTransition] = React.useTransition();
  const [error, setError] = React.useState<string | undefined>();

  const [customer, setCustomer] = React.useState<CustomerPickerValue>(
    defaults?.customer_id ? { customer_id: defaults.customer_id } : {},
  );
  const [startsAtLocal, setStartsAtLocal] = React.useState(defaults?.starts_at_local ?? '');
  const [partySize, setPartySize] = React.useState(defaults?.party_size ?? 2);
  const [tableId, setTableId] = React.useState(defaults?.table_id ?? '');
  const [specialRequest, setSpecialRequest] = React.useState(defaults?.special_request ?? '');
  const [internalNotes, setInternalNotes] = React.useState(defaults?.internal_notes ?? '');

  const startsAt = startsAtLocal ? new Date(startsAtLocal) : null;

  function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(undefined);
    if (!customer.customer_id) {
      setError('Pick or create a customer first.');
      return;
    }
    if (!startsAt) {
      setError('Pick a date and time.');
      return;
    }
    if (!tableId) {
      setError('Pick a table.');
      return;
    }
    const input = {
      customer_id: customer.customer_id,
      table_id: tableId,
      starts_at: localDatetimeToIso(startsAtLocal),
      party_size: partySize,
      ...(specialRequest ? { special_request: specialRequest } : {}),
      ...(internalNotes ? { internal_notes: internalNotes } : {}),
    };
    startTransition(async () => {
      try {
        if (id) {
          await updateBookingAction(id, input);
          router.push(`/bookings/${id}`);
        } else {
          const res = await createBookingAction(input);
          router.push(`/bookings/${res.id}`);
        }
      } catch (e) {
        setError(e instanceof Error ? e.message : 'Failed');
      }
    });
  }

  return (
    <form onSubmit={onSubmit} className="space-y-4 max-w-xl">
      <FormField id="customer" label="Customer" required>
        <CustomerPicker value={customer} onChange={setCustomer} organizationId={organizationId} />
      </FormField>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <FormField id="starts_at" label="Date & time" required>
          <Input
            id="starts_at"
            type="datetime-local"
            value={startsAtLocal}
            onChange={(e) => setStartsAtLocal(e.target.value)}
          />
        </FormField>
        <FormField id="party_size" label="Party size" required>
          <Input
            id="party_size"
            type="number"
            min={1}
            max={50}
            value={partySize}
            onChange={(e) => setPartySize(Number(e.target.value))}
          />
        </FormField>
      </div>
      <FormField id="table_id" label="Table" required>
        <TableSelect
          value={tableId}
          onChange={setTableId}
          startsAt={startsAt}
          partySize={partySize}
          {...(id ? { excludeBookingId: id } : {})}
        />
      </FormField>
      <FormField id="special_request" label="Special request" hint="Allergies, anniversary, etc.">
        <Textarea
          id="special_request"
          value={specialRequest}
          onChange={(e) => setSpecialRequest(e.target.value)}
        />
      </FormField>
      <FormField id="internal_notes" label="Internal notes" hint="Staff-only">
        <Textarea
          id="internal_notes"
          value={internalNotes}
          onChange={(e) => setInternalNotes(e.target.value)}
        />
      </FormField>
      {error ? <p className="text-[12px] text-danger">{error}</p> : null}
      <div className="flex gap-2">
        <Button type="submit" disabled={pending}>{pending ? 'Saving…' : id ? 'Save changes' : 'Create booking'}</Button>
        <Button type="button" variant="outline" onClick={() => history.back()}>Cancel</Button>
      </div>
    </form>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add apps/web/components/booking-form.tsx
git commit -m "feat(web): add BookingForm (shared between create + edit)"
```

---

### Task 18: Page — `/bookings/new`

**Files:**
- Create: `apps/web/app/(app)/bookings/new/page.tsx`

- [ ] **Step 1: Write the page**

```tsx
import { Topbar } from '@buranchi/ui';
import { requireRole } from '@/lib/auth/server';
import { BookingForm } from '@/components/booking-form';

export default async function NewBookingPage() {
  const profile = await requireRole(['admin', 'front_desk']);
  return (
    <>
      <Topbar breadcrumb="Workspace / Bookings" title="New booking" backHref="/bookings" />
      <BookingForm organizationId={profile.organization_id} />
    </>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add 'apps/web/app/(app)/bookings/new/page.tsx'
git commit -m "feat(web): add /bookings/new page"
```

---

### Task 19: Page — `/bookings` (list)

**Files:**
- Create: `apps/web/app/(app)/bookings/page.tsx`
- Create: `apps/web/app/(app)/bookings/bookings-list-client.tsx`

- [ ] **Step 1: Write the client list**

`apps/web/app/(app)/bookings/bookings-list-client.tsx`:

```tsx
'use client';

import * as React from 'react';
import Link from 'next/link';
import { useRouter, usePathname } from 'next/navigation';
import { Calendar, MessageSquare, User } from 'lucide-react';
import { BookingStatusPill } from '@/components/status-pill';
import { BOOKING_SOURCE_LABELS, type BookingStatus, type BookingSource } from '@buranchi/shared';

export interface BookingRow {
  id: string;
  starts_at: string;
  ends_at: string;
  party_size: number;
  source: BookingSource;
  status: BookingStatus;
  special_request: string | null;
  customer: { id: string; display_id: string; full_name: string };
  table: { id: string; code: string };
}

export function BookingsListClient({
  initialRows,
  initialFilters,
}: {
  initialRows: BookingRow[];
  initialFilters: { range: string; status: string; source: string };
}) {
  const router = useRouter();
  const pathname = usePathname();
  const [filters, setFilters] = React.useState(initialFilters);

  function updateFilter(key: keyof typeof filters, value: string) {
    const next = { ...filters, [key]: value };
    setFilters(next);
    const params = new URLSearchParams();
    if (next.range !== 'all') params.set('range', next.range);
    if (next.status !== 'all') params.set('status', next.status);
    if (next.source !== 'all') params.set('source', next.source);
    router.replace(`${pathname}${params.toString() ? `?${params.toString()}` : ''}`);
  }

  const filterClass = 'h-[33px] rounded-input border border-border bg-surface px-2.5 text-[12px] text-fg appearance-none cursor-pointer';

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2">
        <select aria-label="Date range" className={filterClass} value={filters.range} onChange={(e) => updateFilter('range', e.target.value)}>
          <option value="today">Today</option>
          <option value="tomorrow">Tomorrow</option>
          <option value="week">This week</option>
          <option value="all">All</option>
        </select>
        <select aria-label="Status" className={filterClass} value={filters.status} onChange={(e) => updateFilter('status', e.target.value)}>
          <option value="all">All statuses</option>
          <option value="confirmed">Confirmed</option>
          <option value="seated">Seated</option>
          <option value="completed">Completed</option>
          <option value="cancelled">Cancelled</option>
          <option value="no_show">No-show</option>
        </select>
        <select aria-label="Source" className={filterClass} value={filters.source} onChange={(e) => updateFilter('source', e.target.value)}>
          <option value="all">All sources</option>
          <option value="manual">Manual</option>
          <option value="walk_in">Walk-in</option>
        </select>
      </div>

      {initialRows.length === 0 ? (
        <div className="rounded-card bg-surface shadow-card py-12 text-center">
          <Calendar className="h-8 w-8 text-muted mx-auto mb-2" />
          <p className="text-body-strong text-fg">No bookings match these filters</p>
          <p className="text-[12px] text-muted">Try widening the date range or clearing the status filter.</p>
        </div>
      ) : (
        <div className="rounded-card bg-surface shadow-card overflow-hidden">
          <div className="px-4 grid grid-cols-[180px_1fr_90px_70px_120px_100px] py-3 text-label uppercase text-muted border-b border-border">
            <div>Time</div><div>Customer</div><div>Table</div><div>Party</div><div>Status</div><div>Source</div>
          </div>
          {initialRows.map((b) => (
            <Link
              key={b.id}
              href={`/bookings/${b.id}`}
              className="px-4 grid grid-cols-[180px_1fr_90px_70px_120px_100px] py-3 border-b border-row-divider last:border-b-0 text-[12px] items-center hover:bg-canvas"
            >
              <div className="text-fg">{formatStartsAt(b.starts_at)}</div>
              <div>
                <p className="font-medium text-fg">{b.customer.full_name}</p>
                {b.special_request ? <p className="text-[11px] text-muted truncate">{b.special_request}</p> : null}
              </div>
              <div className="font-mono text-muted">{b.table.code}</div>
              <div className="text-fg">{b.party_size}</div>
              <div><BookingStatusPill status={b.status} /></div>
              <div className="inline-flex items-center gap-1.5 text-muted">
                {b.source === 'walk_in' ? <User className="h-3 w-3" /> : <MessageSquare className="h-3 w-3" />}
                <span>{BOOKING_SOURCE_LABELS[b.source]}</span>
              </div>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}

function formatStartsAt(iso: string): string {
  const d = new Date(iso);
  const now = new Date();
  const sameDay = d.toDateString() === now.toDateString();
  const tomorrow = new Date(now); tomorrow.setDate(now.getDate() + 1);
  const isTomorrow = d.toDateString() === tomorrow.toDateString();
  const time = d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  if (sameDay) return `Today ${time}`;
  if (isTomorrow) return `Tomorrow ${time}`;
  return d.toLocaleDateString([], { weekday: 'short', month: 'short', day: 'numeric' }) + ' · ' + time;
}
```

- [ ] **Step 2: Write the page (server)**

`apps/web/app/(app)/bookings/page.tsx`:

```tsx
import Link from 'next/link';
import { Topbar, Button } from '@buranchi/ui';
import { requireProfile } from '@/lib/auth/server';
import { createServerClient } from '@/lib/supabase/server';
import { BookingsListClient, type BookingRow } from './bookings-list-client';
import type { BookingSource, BookingStatus } from '@buranchi/shared';

interface Props {
  searchParams: Promise<{ range?: string; status?: string; source?: string }>;
}

function rangeToWindow(range: string): { from?: Date; to?: Date } {
  const now = new Date();
  const startOfDay = new Date(now); startOfDay.setHours(0, 0, 0, 0);
  if (range === 'today') {
    const end = new Date(startOfDay); end.setDate(end.getDate() + 1);
    return { from: startOfDay, to: end };
  }
  if (range === 'tomorrow') {
    const start = new Date(startOfDay); start.setDate(start.getDate() + 1);
    const end = new Date(start); end.setDate(end.getDate() + 1);
    return { from: start, to: end };
  }
  if (range === 'week') {
    const end = new Date(startOfDay); end.setDate(end.getDate() + 7);
    return { from: startOfDay, to: end };
  }
  return {};
}

export default async function BookingsPage({ searchParams }: Props) {
  await requireProfile();
  const params = await searchParams;
  const range = params.range ?? 'today';
  const statusFilter = params.status ?? 'all';
  const sourceFilter = params.source ?? 'all';

  const supabase = await createServerClient();
  let query = supabase
    .from('bookings')
    .select(`
      id, starts_at, ends_at, party_size, source, status, special_request,
      customer:customers!inner(id, display_id, full_name),
      table:tables!inner(id, code)
    `)
    .order('starts_at', { ascending: true })
    .limit(200);

  const { from, to } = rangeToWindow(range);
  if (from) query = query.gte('starts_at', from.toISOString());
  if (to) query = query.lt('starts_at', to.toISOString());
  if (statusFilter !== 'all') query = query.eq('status', statusFilter as BookingStatus);
  if (sourceFilter !== 'all') query = query.eq('source', sourceFilter as BookingSource);

  const { data, error } = await query;
  if (error) throw error;
  const rows = (data ?? []) as unknown as BookingRow[];

  return (
    <>
      <Topbar
        breadcrumb="Workspace / Bookings"
        title="Bookings"
        actions={
          <Button asChild>
            <Link href="/bookings/new">+ New booking</Link>
          </Button>
        }
      />
      <BookingsListClient initialRows={rows} initialFilters={{ range, status: statusFilter, source: sourceFilter }} />
    </>
  );
}
```

- [ ] **Step 3: Commit**

```bash
git add 'apps/web/app/(app)/bookings/page.tsx' 'apps/web/app/(app)/bookings/bookings-list-client.tsx'
git commit -m "feat(web): add /bookings list page with filters"
```

---

### Task 20: Page — `/bookings/[id]` (detail/edit)

**Files:**
- Create: `apps/web/app/(app)/bookings/[id]/page.tsx`
- Create: `apps/web/app/(app)/bookings/[id]/booking-actions.tsx`

- [ ] **Step 1: Client actions component**

`apps/web/app/(app)/bookings/[id]/booking-actions.tsx`:

```tsx
'use client';

import * as React from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@buranchi/ui';
import { transitionBookingAction } from '@/lib/actions/bookings';
import type { BookingStatus } from '@buranchi/shared';

export function BookingActions({ id, status }: { id: string; status: BookingStatus }) {
  const router = useRouter();
  const [pending, startTransition] = React.useTransition();
  const [error, setError] = React.useState<string | undefined>();

  function transition(next: 'seated' | 'completed' | 'cancelled' | 'no_show') {
    setError(undefined);
    let reason: string | undefined;
    if (next === 'cancelled') {
      const r = prompt('Cancellation reason (optional):') ?? undefined;
      reason = r ?? undefined;
    }
    startTransition(async () => {
      try {
        const input = reason ? { next, reason } : { next };
        await transitionBookingAction(id, input);
        router.refresh();
      } catch (e) {
        setError(e instanceof Error ? e.message : 'Failed');
      }
    });
  }

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap gap-2">
        {status === 'confirmed' ? (
          <>
            <Button disabled={pending} onClick={() => transition('seated')}>Mark seated</Button>
            <Button variant="outline" disabled={pending} onClick={() => transition('cancelled')}>Cancel</Button>
            <Button variant="outline" disabled={pending} onClick={() => transition('no_show')}>Mark no-show</Button>
          </>
        ) : null}
        {status === 'seated' ? (
          <>
            <Button disabled={pending} onClick={() => transition('completed')}>Mark completed</Button>
            <Button variant="outline" disabled={pending} onClick={() => transition('cancelled')}>Cancel</Button>
          </>
        ) : null}
      </div>
      {error ? <p className="text-[12px] text-danger">{error}</p> : null}
    </div>
  );
}
```

- [ ] **Step 2: The page**

`apps/web/app/(app)/bookings/[id]/page.tsx`:

```tsx
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { Topbar, Card } from '@buranchi/ui';
import { requireProfile } from '@/lib/auth/server';
import { createServerClient } from '@/lib/supabase/server';
import { BookingStatusPill } from '@/components/status-pill';
import { BookingForm } from '@/components/booking-form';
import { BookingActions } from './booking-actions';
import type { BookingStatus, BookingSource } from '@buranchi/shared';

interface BookingDetail {
  id: string;
  starts_at: string;
  ends_at: string;
  party_size: number;
  source: BookingSource;
  status: BookingStatus;
  special_request: string | null;
  internal_notes: string | null;
  cancelled_reason: string | null;
  customer: { id: string; display_id: string; full_name: string };
  table: { id: string; code: string };
}

function isoToDatetimeLocal(iso: string): string {
  const d = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export default async function BookingDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const profile = await requireProfile();
  const { id } = await params;
  const supabase = await createServerClient();
  const { data } = await supabase.from('bookings')
    .select(`
      id, starts_at, ends_at, party_size, source, status,
      special_request, internal_notes, cancelled_reason,
      customer:customers!inner(id, display_id, full_name),
      table:tables!inner(id, code)
    `)
    .eq('id', id)
    .single();
  const b = data as unknown as BookingDetail | null;
  if (!b) notFound();

  const canMutate = profile.role === 'admin' || profile.role === 'front_desk';
  const canEdit = canMutate && (b.status === 'confirmed' || b.status === 'seated');

  return (
    <>
      <Topbar
        breadcrumb={
          <>
            <Link href="/bookings" className="hover:underline">Bookings</Link> / {b.customer.display_id}
          </>
        }
        title={b.customer.full_name}
        backHref="/bookings"
      />
      <div className="space-y-4 max-w-2xl">
        <Card className="space-y-3">
          <div className="flex items-center gap-2">
            <BookingStatusPill status={b.status} />
            <span className="text-[12px] text-muted">{new Date(b.starts_at).toLocaleString()} — {new Date(b.ends_at).toLocaleString()}</span>
          </div>
          <Row label="Customer" value={<Link href={`/customers/${b.customer.id}`} className="text-accent hover:underline">{b.customer.display_id} · {b.customer.full_name}</Link>} />
          <Row label="Table" value={<span className="font-mono">{b.table.code}</span>} />
          <Row label="Party size" value={b.party_size} />
          <Row label="Source" value={b.source === 'walk_in' ? 'Walk-in' : 'Manual'} />
          <Row label="Special request" value={b.special_request ?? <span className="text-border">—</span>} />
          <Row label="Internal notes" value={b.internal_notes ?? <span className="text-border">—</span>} />
          {b.cancelled_reason ? <Row label="Cancelled reason" value={b.cancelled_reason} /> : null}
        </Card>

        {canMutate ? (
          <Card>
            <h2 className="text-[10px] uppercase tracking-[0.08em] text-muted font-semibold mb-3">Actions</h2>
            <BookingActions id={b.id} status={b.status} />
          </Card>
        ) : null}

        {canEdit ? (
          <Card>
            <h2 className="text-[10px] uppercase tracking-[0.08em] text-muted font-semibold mb-3">Edit details</h2>
            <BookingForm
              id={b.id}
              organizationId={profile.organization_id}
              defaults={{
                customer_id: b.customer.id,
                customer_label: b.customer.full_name,
                table_id: b.table.id,
                starts_at_local: isoToDatetimeLocal(b.starts_at),
                party_size: b.party_size,
                special_request: b.special_request ?? '',
                internal_notes: b.internal_notes ?? '',
              }}
            />
          </Card>
        ) : null}
      </div>
    </>
  );
}

function Row({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="grid grid-cols-[140px_1fr] gap-3 text-[12px]">
      <span className="text-muted">{label}</span>
      <span className="text-fg">{value}</span>
    </div>
  );
}
```

- [ ] **Step 3: Commit**

```bash
git add 'apps/web/app/(app)/bookings/[id]/'
git commit -m "feat(web): add /bookings/[id] detail page with status transitions and edit"
```

---

### Task 21: Component — `SeatWalkInPopover`

**Files:**
- Create: `apps/web/components/seat-walkin-popover.tsx`

- [ ] **Step 1: Write the component**

```tsx
'use client';

import * as React from 'react';
import { useRouter } from 'next/navigation';
import { Button, FormField } from '@buranchi/ui';
import { CustomerPicker, type CustomerPickerValue } from './customer-picker';
import { createWalkInAction } from '@/lib/actions/bookings';

interface SeatWalkInPopoverProps {
  tableId: string;
  organizationId: string;
  open: boolean;
  onClose: () => void;
}

const inputClass =
  'h-[33px] w-full rounded-input border border-border bg-surface px-3 text-[12px] text-fg focus:outline-none focus:ring-2 focus:ring-accent focus:border-accent';

export function SeatWalkInPopover({ tableId, organizationId, open, onClose }: SeatWalkInPopoverProps) {
  const router = useRouter();
  const [customer, setCustomer] = React.useState<CustomerPickerValue>({});
  const [partySize, setPartySize] = React.useState(2);
  const [specialRequest, setSpecialRequest] = React.useState('');
  const [pending, startTransition] = React.useTransition();
  const [error, setError] = React.useState<string | undefined>();

  React.useEffect(() => {
    if (open) {
      setCustomer({});
      setPartySize(2);
      setSpecialRequest('');
      setError(undefined);
    }
  }, [open]);

  if (!open) return null;

  function submit() {
    setError(undefined);
    if (!customer.customer_id && !customer.customer_full_name) {
      setError('Pick or create a customer first.');
      return;
    }
    const input = {
      ...(customer.customer_id ? { customer_id: customer.customer_id } : {}),
      ...(customer.customer_full_name ? { customer_full_name: customer.customer_full_name } : {}),
      ...(customer.customer_phone ? { customer_phone: customer.customer_phone } : {}),
      table_id: tableId,
      party_size: partySize,
      ...(specialRequest ? { special_request: specialRequest } : {}),
    };
    startTransition(async () => {
      try {
        await createWalkInAction(input);
        onClose();
        router.refresh();
      } catch (e) {
        setError(e instanceof Error ? e.message : 'Failed');
      }
    });
  }

  return (
    <div className="absolute top-full right-0 mt-1 z-20 w-[300px] rounded-card border border-border bg-surface shadow-popover p-4">
      <p className="text-[10px] uppercase tracking-[0.08em] text-muted font-semibold mb-3">Seat walk-in</p>
      <div className="space-y-3">
        <FormField id="walkin-customer" label="Customer" required>
          <CustomerPicker value={customer} onChange={setCustomer} organizationId={organizationId} />
        </FormField>
        <FormField id="walkin-party" label="Party size" required>
          <input
            id="walkin-party"
            type="number"
            min={1}
            max={50}
            value={partySize}
            onChange={(e) => setPartySize(Number(e.target.value))}
            className={inputClass}
          />
        </FormField>
        <FormField id="walkin-special" label="Special request">
          <input
            id="walkin-special"
            type="text"
            value={specialRequest}
            onChange={(e) => setSpecialRequest(e.target.value)}
            placeholder="optional"
            className={inputClass}
          />
        </FormField>
        {error ? <p className="text-[12px] text-danger">{error}</p> : null}
        <div className="flex gap-2">
          <Button type="button" disabled={pending} onClick={submit}>{pending ? 'Seating…' : 'Seat'}</Button>
          <Button type="button" variant="outline" disabled={pending} onClick={onClose}>Cancel</Button>
        </div>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add apps/web/components/seat-walkin-popover.tsx
git commit -m "feat(web): add SeatWalkInPopover (inline form on /floor card)"
```

---

### Task 22: Component — `TableCard` and `FloorAutoRefresh`

**Files:**
- Create: `apps/web/components/table-card.tsx`
- Create: `apps/web/components/floor-auto-refresh.tsx`

- [ ] **Step 1: Write `floor-auto-refresh.tsx`**

```tsx
'use client';

import * as React from 'react';
import { useRouter } from 'next/navigation';

const INTERVAL_MS = 30_000;

export function FloorAutoRefresh() {
  const router = useRouter();
  React.useEffect(() => {
    const handle = setInterval(() => router.refresh(), INTERVAL_MS);
    return () => clearInterval(handle);
  }, [router]);
  return null;
}
```

- [ ] **Step 2: Write `table-card.tsx`**

```tsx
'use client';

import * as React from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Users, ArrowRight, Brush, Wrench, UserPlus } from 'lucide-react';
import { Button, cn } from '@buranchi/ui';
import { TableStatusPill } from './status-pill';
import { SeatWalkInPopover } from './seat-walkin-popover';
import { setTableStatusAction } from '@/lib/actions/tables';
import { transitionBookingAction } from '@/lib/actions/bookings';
import type { TableStatus, BookingStatus } from '@buranchi/shared';

export interface FloorBooking {
  id: string;
  starts_at: string;
  ends_at: string;
  party_size: number;
  status: BookingStatus;
  customer_full_name: string;
}

export interface FloorTable {
  id: string;
  code: string;
  capacity: number;
  floor_area: string | null;
  /** Derived live status */
  liveStatus: TableStatus;
  /** Most relevant booking for this card (seated, or next confirmed) */
  primaryBooking: FloorBooking | null;
}

export function TableCard({ table, organizationId, canMutate }: { table: FloorTable; organizationId: string; canMutate: boolean }) {
  const router = useRouter();
  const [walkInOpen, setWalkInOpen] = React.useState(false);
  const [pending, setPending] = React.useState(false);
  const [error, setError] = React.useState<string | undefined>();

  async function setStatus(next: 'available' | 'cleaning' | 'unavailable') {
    setError(undefined); setPending(true);
    try { await setTableStatusAction(table.id, next); router.refresh(); }
    catch (e) { setError(e instanceof Error ? e.message : 'Failed'); }
    finally { setPending(false); }
  }

  async function transitionBooking(bookingId: string, next: 'seated' | 'completed') {
    setError(undefined); setPending(true);
    try { await transitionBookingAction(bookingId, { next }); router.refresh(); }
    catch (e) { setError(e instanceof Error ? e.message : 'Failed'); }
    finally { setPending(false); }
  }

  return (
    <div className={cn(
      'relative rounded-card bg-surface p-card-pad shadow-card flex flex-col gap-3',
      table.liveStatus === 'unavailable' && 'opacity-70',
    )}>
      <div className="flex items-start justify-between">
        <div>
          <p className="text-title text-fg font-bold leading-none">{table.code}</p>
          <p className="text-[12px] text-muted mt-1 inline-flex items-center gap-1.5">
            <Users className="h-3 w-3" /> Seats {table.capacity}
            {table.floor_area ? <> · {table.floor_area}</> : null}
          </p>
        </div>
        <TableStatusPill status={table.liveStatus} />
      </div>

      <div className="text-[12px] text-fg min-h-[40px]">
        <CardBody table={table} />
      </div>

      {canMutate ? (
        <div className="flex flex-wrap gap-1.5">
          {table.liveStatus === 'available' ? (
            <>
              <Button size="sm" onClick={() => setWalkInOpen(true)}>
                <UserPlus className="h-3 w-3" /> Seat walk-in
              </Button>
              <Button size="sm" variant="ghost" disabled={pending} onClick={() => setStatus('unavailable')}>
                <Wrench className="h-3 w-3" /> Mark unavailable
              </Button>
            </>
          ) : null}
          {table.liveStatus === 'reserved' && table.primaryBooking ? (
            <>
              <Button size="sm" disabled={pending} onClick={() => transitionBooking(table.primaryBooking!.id, 'seated')}>Mark seated</Button>
              <Button asChild size="sm" variant="ghost">
                <Link href={`/bookings/${table.primaryBooking.id}`}><ArrowRight className="h-3 w-3" /> View</Link>
              </Button>
            </>
          ) : null}
          {table.liveStatus === 'occupied' && table.primaryBooking ? (
            <>
              <Button size="sm" disabled={pending} onClick={() => transitionBooking(table.primaryBooking!.id, 'completed')}>Mark completed</Button>
              <Button asChild size="sm" variant="ghost">
                <Link href={`/bookings/${table.primaryBooking.id}`}><ArrowRight className="h-3 w-3" /> View</Link>
              </Button>
            </>
          ) : null}
          {table.liveStatus === 'cleaning' ? (
            <Button size="sm" disabled={pending} onClick={() => setStatus('available')}>
              <Brush className="h-3 w-3" /> Mark available
            </Button>
          ) : null}
          {table.liveStatus === 'unavailable' ? (
            <Button size="sm" disabled={pending} onClick={() => setStatus('available')}>Mark available</Button>
          ) : null}
        </div>
      ) : null}
      {error ? <p className="text-[11px] text-danger">{error}</p> : null}

      <SeatWalkInPopover
        tableId={table.id}
        organizationId={organizationId}
        open={walkInOpen}
        onClose={() => setWalkInOpen(false)}
      />
    </div>
  );
}

function CardBody({ table }: { table: FloorTable }) {
  const b = table.primaryBooking;
  if (table.liveStatus === 'cleaning') return <p className="text-muted">Cleaning</p>;
  if (table.liveStatus === 'unavailable') return <p className="text-muted">Out of service</p>;
  if (b && table.liveStatus === 'occupied') {
    return (
      <p>
        <span className="font-medium">{b.customer_full_name}</span> · party of {b.party_size}
        <br />
        <span className="text-muted text-[11px]">until {new Date(b.ends_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
      </p>
    );
  }
  if (b && table.liveStatus === 'reserved') {
    return (
      <p>
        <span className="text-muted">Reserved · {new Date(b.starts_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
        <br />
        <span className="font-medium">{b.customer_full_name}</span> · party of {b.party_size}
      </p>
    );
  }
  return <p className="text-muted">Free now</p>;
}
```

- [ ] **Step 3: Commit**

```bash
git add apps/web/components/table-card.tsx apps/web/components/floor-auto-refresh.tsx
git commit -m "feat(web): add TableCard and FloorAutoRefresh"
```

---

### Task 23: Page — `/floor`

**Files:**
- Create: `apps/web/app/(app)/floor/page.tsx`

- [ ] **Step 1: Write the page**

```tsx
import { Topbar } from '@buranchi/ui';
import { requireProfile } from '@/lib/auth/server';
import { createServerClient } from '@/lib/supabase/server';
import { TableCard, type FloorTable, type FloorBooking } from '@/components/table-card';
import { FloorAutoRefresh } from '@/components/floor-auto-refresh';
import { deriveTableStatus } from '@buranchi/shared';
import type { TableStatus, BookingStatus } from '@buranchi/shared';

interface RawTable {
  id: string;
  code: string;
  capacity: number;
  floor_area: string | null;
  status: TableStatus;
}

interface RawBooking {
  id: string;
  table_id: string;
  starts_at: string;
  ends_at: string;
  party_size: number;
  status: BookingStatus;
  customer: { full_name: string };
}

export default async function FloorPage() {
  const profile = await requireProfile();
  const supabase = await createServerClient();

  const { data: rawTables } = await supabase
    .from('tables')
    .select('id, code, capacity, floor_area, status')
    .eq('organization_id', profile.organization_id)
    .eq('is_active', true)
    .order('code', { ascending: true });
  const tables = (rawTables ?? []) as RawTable[];

  // Fetch bookings that could affect "now" view: seated, OR confirmed within next 6 hours.
  const now = new Date();
  const sixHoursFromNow = new Date(now.getTime() + 6 * 60 * 60 * 1000);
  const { data: rawBookings } = await supabase
    .from('bookings')
    .select(`
      id, table_id, starts_at, ends_at, party_size, status,
      customer:customers!inner(full_name)
    `)
    .eq('organization_id', profile.organization_id)
    .in('status', ['seated', 'confirmed'])
    .lt('starts_at', sixHoursFromNow.toISOString())
    .gt('ends_at', now.toISOString());
  const bookings = (rawBookings ?? []) as unknown as RawBooking[];

  const canMutate = profile.role === 'admin' || profile.role === 'front_desk';

  const cards: FloorTable[] = tables.map((t) => {
    const tableBookings = bookings
      .filter((b) => b.table_id === t.id)
      .map((b) => ({
        table_id: b.table_id,
        status: b.status,
        starts_at: b.starts_at,
        ends_at: b.ends_at,
      }));
    const liveStatus = deriveTableStatus({ id: t.id, status: t.status }, tableBookings, now);

    let primary: FloorBooking | null = null;
    if (liveStatus === 'occupied') {
      const seated = bookings.find((b) => b.table_id === t.id && b.status === 'seated');
      if (seated) {
        primary = {
          id: seated.id,
          starts_at: seated.starts_at,
          ends_at: seated.ends_at,
          party_size: seated.party_size,
          status: seated.status,
          customer_full_name: seated.customer.full_name,
        };
      }
    } else if (liveStatus === 'reserved') {
      const reserved = bookings
        .filter((b) => b.table_id === t.id && b.status === 'confirmed')
        .sort((a, b) => a.starts_at.localeCompare(b.starts_at))[0];
      if (reserved) {
        primary = {
          id: reserved.id,
          starts_at: reserved.starts_at,
          ends_at: reserved.ends_at,
          party_size: reserved.party_size,
          status: reserved.status,
          customer_full_name: reserved.customer.full_name,
        };
      }
    } else if (liveStatus === 'available') {
      // Show next upcoming confirmed booking if any (for context, not as a status driver)
      const next = bookings
        .filter((b) => b.table_id === t.id && b.status === 'confirmed')
        .sort((a, b) => a.starts_at.localeCompare(b.starts_at))[0];
      if (next) {
        primary = {
          id: next.id,
          starts_at: next.starts_at,
          ends_at: next.ends_at,
          party_size: next.party_size,
          status: next.status,
          customer_full_name: next.customer.full_name,
        };
      }
    }

    return {
      id: t.id,
      code: t.code,
      capacity: t.capacity,
      floor_area: t.floor_area,
      liveStatus,
      primaryBooking: primary,
    };
  });

  return (
    <>
      <Topbar breadcrumb="Workspace" title="Floor" />
      <FloorAutoRefresh />
      {cards.length === 0 ? (
        <div className="rounded-card bg-surface shadow-card py-12 text-center">
          <p className="text-body-strong text-fg">No tables yet</p>
          <p className="text-[12px] text-muted mt-1">Admins can add tables under Settings → Tables.</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-row-gap">
          {cards.map((t) => (
            <TableCard key={t.id} table={t} organizationId={profile.organization_id} canMutate={canMutate} />
          ))}
        </div>
      )}
    </>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add 'apps/web/app/(app)/floor/page.tsx'
git commit -m "feat(web): add /floor live operations view"
```

---

### Task 24: Sidebar update — graduate Bookings, add Floor

**Files:**
- Modify: `apps/web/lib/nav/items.ts`

- [ ] **Step 1: Edit the file**

Open the file. Current shape:

```ts
import { LayoutGrid, Users, Calendar, MessageCircle, Star, Megaphone, Settings } from 'lucide-react';
// ... groups follow
```

Replace the whole `NAV_GROUPS` constant with:

```ts
import { LayoutGrid, Map, Users, Calendar, MessageCircle, Star, Megaphone, Settings } from 'lucide-react';
import type { ComponentType, SVGProps } from 'react';
import type { UserRole } from '@buranchi/shared';

export interface NavItem {
  label: string;
  href: string;
  icon: ComponentType<SVGProps<SVGSVGElement>>;
  comingSoon?: boolean;
  adminOnly?: boolean;
}

export const NAV_GROUPS: { label: string; items: NavItem[] }[] = [
  {
    label: 'Workspace',
    items: [
      { label: 'Dashboard', href: '/dashboard', icon: LayoutGrid },
      { label: 'Floor',     href: '/floor',     icon: Map },
      { label: 'Customers', href: '/customers', icon: Users },
      { label: 'Bookings',  href: '/bookings',  icon: Calendar },
    ],
  },
  {
    label: 'Coming Soon',
    items: [
      { label: 'WhatsApp',  href: '#', icon: MessageCircle, comingSoon: true },
      { label: 'Loyalty',   href: '#', icon: Star,          comingSoon: true },
      { label: 'Marketing', href: '#', icon: Megaphone,     comingSoon: true },
    ],
  },
  {
    label: 'Settings',
    items: [
      { label: 'Settings', href: '/settings', icon: Settings },
    ],
  },
];

export function visibleNavGroups(role: UserRole) {
  void role;
  return NAV_GROUPS;
}
```

(The change: `Map` icon is added to imports; `Floor` item joins Workspace group; `Bookings` joins Workspace group instead of Coming Soon; Coming Soon group reduces to 3 items.)

- [ ] **Step 2: Verify typecheck**

```bash
pnpm --filter @buranchi/web typecheck
```

- [ ] **Step 3: Commit**

```bash
git add apps/web/lib/nav/items.ts
git commit -m "feat(web): graduate Bookings to active sidebar; add Floor"
```

---

### Task 25: End-to-end smoke verification

**No new files.** This is a manual verification + final commit checkpoint.

- [ ] **Step 1: Restart dev server with clean cache**

```bash
cd "c:/Users/10105960/Desktop/buranchi-koda/apps/web"
rm -rf .next
cd ..
pnpm --filter @buranchi/web dev
```

- [ ] **Step 2: As an admin, walk through these flows**

1. `/settings/tables` — add 5 tables (T01 cap 2 Indoor, T02 cap 2 Indoor, T03 cap 4 Indoor, T04 cap 6 Patio, T05 cap 8 Patio).
2. `/floor` — see all 5 cards with status `Available`. Filter by area = Patio → only 2 cards.
3. Click `+ Seat walk-in` on T01 → form opens → enter `John Smith` (new customer, no phone), party 2 → Seat. T01 flips to `Occupied`.
4. `/bookings/new` — pick existing customer "Andini" (created in Phase 1), date/time tomorrow 19:00, party 4. Pick T03. Save. Redirects to `/bookings/[id]` showing `Confirmed`.
5. Try to create another booking on T03 at the same time → table not in dropdown.
6. `/bookings` → see two rows. Filter `Today` → see only the walk-in.
7. On the walk-in detail → click `Mark completed`. Status pill changes to `Completed`. Floor card flips to `Available` after a `router.refresh()`.
8. As admin in `/settings/tables`, try to delete T01 → should error `TABLE_HAS_BOOKINGS` and offer "Set inactive" path.

- [ ] **Step 3: Sign out, sign in as a `customer_service` user** (create one via `/settings/users/invite`)

1. `/floor` → renders, no action buttons (read-only).
2. `/bookings` → renders, no `+ New booking` button.
3. Try `/bookings/new` directly in URL → should `requireRole(['admin', 'front_desk'])` redirect/throw.

- [ ] **Step 4: Run integration tests**

```bash
pnpm db:test
```
All 11+ tests should pass (Phase 1 RLS + Phase 2 RLS + EXCLUDE constraint).

- [ ] **Step 5: Run full typecheck and build**

```bash
pnpm typecheck
pnpm build
```
Both should be green.

- [ ] **Step 6: Final commit (if smoke testing surfaced any small fixes)**

If the smoke test surfaced bugs, fix them, then commit individually. Otherwise no commit needed.

```bash
git status   # should be clean
```

---

## Self-Review

### Spec coverage

- [x] §1 Scope — Tasks 1–24 cover the in-scope items; out-of-scope items remain deferred.
- [x] §2 Permission Matrix — enforced in actions (Tasks 10, 11) and at RLS level (Task 2).
- [x] §3 Database Schema — Tasks 1, 2 deliver migrations + dashboard bundle.
- [x] §4 State Machines — `canTransition` in shared (Task 5), enforced in `transitionBookingAction` (Task 11), table status derivation in `deriveTableStatus` (Task 8).
- [x] §5 Routes — Tasks 14, 18, 19, 20, 23 build the four pages; sidebar updated in Task 24.
- [x] §6 Server Actions — Task 10 (tables), Task 11 (bookings), with `getAvailableTablesForSlot` in Task 10.
- [x] §7 Available-tables query — Task 10.
- [x] §8 Shared Package additions — Tasks 5, 6, 7, 8.
- [x] §9 Components — Tasks 12 (StatusPill), 13 (TableForm), 15 (CustomerPicker), 16 (TableSelect), 17 (BookingForm), 21 (SeatWalkInPopover), 22 (TableCard + FloorAutoRefresh).
- [x] §10 Migrations — Tasks 1, 2, 3.
- [x] §11 Acceptance Criteria — Task 25 smoke verifies items 1–8; Task 4 covers items 5 (EXCLUDE) and 9 (RLS) via integration tests.

### Placeholder scan

- No "TBD", "TODO", "implement later" patterns.
- All code blocks contain real implementations.
- No "similar to Task N" — code is repeated where needed.

### Type consistency

- `BookingStatus`, `BookingSource`, `TableStatus` defined once in shared; consumed everywhere with the same names.
- `FloorTable` and `FloorBooking` interfaces defined in `table-card.tsx`, used by `/floor` page (Task 23).
- `BookingRow` defined in `bookings-list-client.tsx`, used by `/bookings` page (Task 19).
- `TableRow` defined in `tables-list.tsx`, used by `/settings/tables` page (Task 14).
- `getAvailableTablesForSlot(startsAt: Date, partySize: number, excludeBookingId?: string): Promise<AvailableTable[]>` — same signature in Tasks 10 (definition), 16 (consumer).
- `transitionBookingAction(id, { next, reason? })` — same call shape in Tasks 11 (definition), 20 + 22 (consumers).

No issues found.

---

## Execution Handoff

Plan complete and saved to `docs/superpowers/plans/2026-04-29-phase-2-booking-flooring.md`. Two execution options:

**1. Subagent-Driven (recommended)** — I dispatch a fresh subagent per task, review between tasks, fast iteration

**2. Inline Execution** — Execute tasks in this session using executing-plans, batch execution with checkpoints

Which approach?
