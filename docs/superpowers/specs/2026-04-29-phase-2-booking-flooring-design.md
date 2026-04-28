# Phase 2 — Booking & Flooring: Design Spec

**Project:** Buranchi Digital Booking, WhatsApp, Marketing & Loyalty System
**Phase:** 2 of 7 — Booking & Flooring
**Date:** 2026-04-29
**Status:** Approved (pending user review of this written spec)
**Depends on:** Phase 1 (System Foundation) — `organizations`, `profiles`, `customers` tables, RLS helpers, design system, settings shell.

---

## 1. Scope

This phase delivers the operational core that staff use every shift: a live floor view, the bookings list, walk-in capture, and admin table configuration. WhatsApp inbound bookings (Phase 3) and AI-assisted booking flows (Phase 4) plug into this same data model later.

### In scope

- New `tables` table — admin-managed inventory of physical tables (code, capacity, area, status, active flag)
- New `bookings` table — reservations and walk-ins, full lifecycle (`confirmed → seated → completed`, with `cancelled` / `no_show` branches)
- `/floor` page — live card grid of `is_active` tables with status, current/next booking, and quick actions including "Seat walk-in"
- `/bookings` page — list of bookings filterable by date / status / source, with create + edit + cancel flows
- `/bookings/new` — create reservation form
- `/bookings/[id]` — detail view with edit + status transitions
- `/settings/tables` — admin CRUD for the table inventory
- Conflict prevention via Postgres `EXCLUDE` constraint on `(table_id, tstzrange(starts_at, ends_at))`
- Hardcoded booking rules in `@buranchi/shared`:
  - Default booking duration: 2 hours
  - Cleaning buffer: 15 minutes
  - Min advance notice: 1 hour
  - Max advance booking: 90 days
- Sidebar update: `Floor` and `Bookings` join the active Workspace group; `Bookings` graduates from "Coming Soon"

### Out of scope (deferred to later phases or polish iterations)

- WhatsApp inbound bookings (Phase 3 — adds `source='whatsapp'`)
- AI agent booking conversations (Phase 4)
- Customer-facing self-service booking page (would need public route + captcha)
- 2D drag-drop floor map UI
- Calendar / timeline view of bookings
- Recurring bookings, multi-day events, table merging for parties exceeding max table capacity
- Per-table override of duration / buffer rules
- Real-time updates via Supabase subscriptions (Phase 2 uses 30s polling)
- Cron jobs for auto-no-show after 30min and auto-complete at `ends_at` (Phase 7 — Vercel cron)
- Per-organization configurable rules surface (would require Settings → Bookings page)

---

## 2. Permission Matrix

| Capability | `admin` | `front_desk` | `customer_service` |
|---|:---:|:---:|:---:|
| View `/floor` | ✓ | ✓ | ✓ |
| Set table status manually (`cleaning` / `unavailable` / `available`) | ✓ | ✓ | — |
| Add / edit / delete tables (`/settings/tables`) | ✓ | — | — |
| View `/bookings` | ✓ | ✓ | ✓ |
| Create booking (manual reservation) | ✓ | ✓ | — |
| Create walk-in from `/floor` | ✓ | ✓ | — |
| Edit booking | ✓ | ✓ | — |
| Transition booking status (`seated` / `completed` / `cancelled` / `no_show`) | ✓ | ✓ | — |

`customer_service` is read-only on bookings — they answer customer questions but don't run the floor. They get full mutation rights in Phase 3 when WhatsApp ops becomes their domain.

---

## 3. Database Schema

### Enums

```sql
create type table_status as enum (
  'available', 'reserved', 'occupied', 'cleaning', 'unavailable'
);

create type booking_source as enum ('manual', 'walk_in');
-- Phase 3 adds 'whatsapp' via non-destructive enum extension.

create type booking_status as enum (
  'pending', 'confirmed', 'seated', 'completed', 'cancelled', 'no_show'
);
-- 'pending' is reserved for Phase 3 (WhatsApp bookings awaiting staff approval).
-- Phase 2 manual creates land at 'confirmed', walk-ins land at 'seated'.
```

### Required extension

```sql
create extension if not exists btree_gist;
-- Needed for the bookings_no_overlap EXCLUDE constraint (combines = with &&).
```

### Table: `tables`

| Column | Type | Constraints / Notes |
|---|---|---|
| `id` | uuid PK | `default gen_random_uuid()` |
| `organization_id` | uuid FK → organizations | NOT NULL, ON DELETE CASCADE |
| `code` | text | NOT NULL. UNIQUE per org. |
| `capacity` | int | NOT NULL. CHECK `capacity >= 1`. |
| `floor_area` | text | nullable. Free-text label. |
| `status` | table_status | NOT NULL. DEFAULT `'available'`. |
| `is_active` | boolean | NOT NULL. DEFAULT `true`. |
| `created_at` / `updated_at` | timestamptz | auto-managed via `moddatetime` |

Indexes:
- `(organization_id)`
- UNIQUE `(organization_id, code)`

### Table: `bookings`

| Column | Type | Constraints / Notes |
|---|---|---|
| `id` | uuid PK | `default gen_random_uuid()` |
| `organization_id` | uuid FK → organizations | NOT NULL, ON DELETE CASCADE |
| `customer_id` | uuid FK → customers | NOT NULL, ON DELETE RESTRICT (preserve booking history) |
| `table_id` | uuid FK → tables | NOT NULL, ON DELETE RESTRICT |
| `starts_at` | timestamptz | NOT NULL |
| `ends_at` | timestamptz | NOT NULL. Application sets `starts_at + 2h` at insert. CHECK `ends_at > starts_at`. |
| `party_size` | int | NOT NULL. CHECK `party_size >= 1`. |
| `source` | booking_source | NOT NULL |
| `status` | booking_status | NOT NULL. Default `'confirmed'`. |
| `special_request` | text | nullable |
| `internal_notes` | text | nullable, staff-only |
| `seated_at` | timestamptz | set when status → `seated` |
| `completed_at` | timestamptz | set when status → `completed` |
| `cancelled_at` | timestamptz | set when status → `cancelled` |
| `cancelled_reason` | text | nullable |
| `created_by` | uuid FK → profiles | ON DELETE SET NULL |
| `created_at` / `updated_at` | timestamptz | auto-managed |

Indexes:
- `(organization_id)`
- `(table_id, starts_at)`
- `(status, starts_at)` — for "upcoming" filters
- `(customer_id)` — for customer detail "their bookings" lookup

### Conflict prevention constraint

```sql
alter table bookings
  add constraint bookings_no_overlap
  exclude using gist (
    table_id with =,
    tstzrange(starts_at, ends_at, '[)') with &&
  )
  where (status not in ('cancelled', 'no_show', 'completed'));
```

Active overlapping bookings on the same table are physically rejected by the database. Terminated bookings (cancelled / no-show / completed) are exempt so a finished booking from earlier doesn't block a new one on the same table.

### RLS

All tables use the existing Phase 1 helpers:

```sql
-- tables
alter table tables enable row level security;

create policy "select tables in own org"
  on tables for select
  using (organization_id = public.get_my_org_id());

create policy "insert tables (admin only)"
  on tables for insert
  with check (
    organization_id = public.get_my_org_id()
    and public.get_my_role() = 'admin'
  );

create policy "update tables (admin or front_desk)"
  on tables for update
  using (
    organization_id = public.get_my_org_id()
    and public.get_my_role() in ('admin', 'front_desk')
  )
  with check (
    organization_id = public.get_my_org_id()
    and public.get_my_role() in ('admin', 'front_desk')
  );
-- RLS allows admin + front_desk to write. App-level guards in setTableStatusAction
-- further restrict front_desk to status-field updates only; updateTableAction
-- (code/capacity/area) is admin-only via requireRole.

create policy "delete tables (admin only)"
  on tables for delete
  using (
    organization_id = public.get_my_org_id()
    and public.get_my_role() = 'admin'
  );

-- bookings
alter table bookings enable row level security;

create policy "select bookings in own org"
  on bookings for select
  using (organization_id = public.get_my_org_id());

create policy "insert bookings (admin or front_desk)"
  on bookings for insert
  with check (
    organization_id = public.get_my_org_id()
    and public.get_my_role() in ('admin', 'front_desk')
  );

create policy "update bookings (admin or front_desk)"
  on bookings for update
  using (
    organization_id = public.get_my_org_id()
    and public.get_my_role() in ('admin', 'front_desk')
  );

-- No DELETE policy: bookings are immutable history. Cancellation = status update.
```

---

## 4. State Machines

### Booking lifecycle

```
        manual create  ──→ confirmed ──→ seated ──→ completed
                              │            │
                              │            └──→ cancelled (rare)
                              │
                              ├──→ cancelled (by staff, with reason)
                              └──→ no_show   (manual; auto via Phase 7 cron later)

        walk-in create ──→ seated ──→ completed
                              └──→ cancelled (rare)
```

The `pending` status is reserved for Phase 3 WhatsApp bookings awaiting approval. Not used in Phase 2.

Transitions are enforced in `transitionBookingAction(id, next, reason?)`:

```ts
const ALLOWED: Record<BookingStatus, BookingStatus[]> = {
  pending:   ['confirmed', 'cancelled'],          // Phase 3+
  confirmed: ['seated', 'cancelled', 'no_show'],
  seated:    ['completed', 'cancelled'],
  completed: [],
  cancelled: [],
  no_show:   [],
};
```

When a transition runs, the action sets the corresponding timestamp (`seated_at`, `completed_at`, `cancelled_at`) and records `cancelled_reason` if provided.

### Table status — manual override + booking-derived

`tables.status` stores manual overrides. The live status shown on `/floor` is derived at read time:

```ts
function deriveTableStatus(table: TableRow, bookings: BookingRow[]): TableStatus {
  // 1. Manual overrides win
  if (table.status === 'cleaning' || table.status === 'unavailable') {
    return table.status;
  }

  // 2. Booking-driven derivation
  const now = new Date();
  const seatedNow = bookings.find(
    (b) => b.table_id === table.id && b.status === 'seated'
  );
  if (seatedNow) return 'occupied';

  const reservedSoon = bookings.find(
    (b) =>
      b.table_id === table.id &&
      b.status === 'confirmed' &&
      b.starts_at <= addMinutes(now, 60) &&
      b.ends_at > now
  );
  if (reservedSoon) return 'reserved';

  return 'available';
}
```

Manual transitions (via `setTableStatusAction`):

```
available  ↔  cleaning
available  ↔  unavailable
cleaning   →  available
unavailable→  available
```

Staff cannot manually set `reserved` or `occupied` — those are derived. Attempting to do so returns `INVALID_TABLE_STATUS`.

---

## 5. Routes & Page Structure

### `/floor` (`apps/web/app/(app)/floor/page.tsx`)

Server-rendered. Data fetch: all `is_active=true` tables for the org + all bookings with status in (`confirmed`, `seated`) and `ends_at >= now`. Renders the card grid.

Topbar: title "Floor", filter dropdowns (area, status). Filters write to query string; page re-renders on change.

Card grid: 3-4 columns desktop, 2 mobile. Each card uses a derived live status for its color/copy.

Quick actions inline on the card:
- `available` → `+ Seat walk-in` (primary), `Mark unavailable` (ghost)
- `reserved` → `Mark seated`, `View booking`
- `occupied` → `Mark completed`, `View booking`
- `cleaning` → `Mark available`
- `unavailable` → `Mark available`

`<SeatWalkInPopover>` opens inline on the card when "Seat walk-in" is clicked. Form fields: customer (picker with create-new fallback), party size, optional notes. Submit creates customer if new + creates walk-in booking + dismisses popover. Card re-renders via `router.refresh()`.

Auto-refresh: a small client wrapper component calls `router.refresh()` every 30 seconds. Realtime subscriptions deferred.

### `/bookings` (`apps/web/app/(app)/bookings/page.tsx`)

Server-rendered list with filters via search params:
- `range`: `today` | `tomorrow` | `week` | `all` | `custom`
- `from` / `to`: ISO dates if `range='custom'`
- `status`: `all` | one of the statuses
- `source`: `all` | `manual` | `walk_in`

DataTable columns:
- Time (e.g. "Today 19:00" or "Wed 30 Apr · 19:00")
- Customer (display_id + name, click → `/customers/[id]`)
- Table (code)
- Party
- Status (StatusPill)
- Source (small icon + label)
- Special request (truncated to ~30 chars)

Click row → `/bookings/[id]`.

Topbar action: `+ New booking` → `/bookings/new`.

### `/bookings/new` (`apps/web/app/(app)/bookings/new/page.tsx`)

Form fields:
- **Customer**: `<CustomerPicker>` — autocomplete by name/phone, with "+ Create new customer" inline (slim form: name, phone optional)
- **Date** + **Time**: HTML date input + the existing `<TimePicker>`
- **Party size**: number input, min 1
- **Table**: `<TableSelect>` — calls `getAvailableTablesForSlot(starts_at, ends_at, party_size)` server function; only shows tables that fit and are free
- **Special request**: textarea
- **Internal notes**: textarea (collapsed by default; expand to add)

Submit → `createBookingAction({...})`. On success redirect to `/bookings/[id]`. On `BOOKING_CONFLICT` show inline error with conflicting booking link.

### `/bookings/[id]` (`apps/web/app/(app)/bookings/[id]/page.tsx`)

Topbar: back to `/bookings`, breadcrumb, title = customer name + status pill.

Layout:
- Card 1 — Booking details (read-only by default): customer (linked), table, datetime range, party, source, special request, internal notes, created by, created at
- Card 2 — Status actions row:
  - `confirmed` → `Mark seated`, `Cancel`, `Mark no-show`
  - `seated` → `Mark completed`, `Cancel`
  - `completed` / `cancelled` / `no_show` → status pill only, read-only
- Card 3 — Edit form (collapsed by default; click "Edit details" to expand):
  - Same fields as create. Table dropdown read-only if `seated` or beyond (would force a re-derive of the table's live status).
  - Save → `updateBookingAction(id, {...})`

`Cancel` opens a confirm dialog with optional reason field, then calls `transitionBookingAction(id, 'cancelled', reason)`.

### `/settings/tables` (`apps/web/app/(app)/settings/tables/page.tsx`)

Admin-only (`requireRole(['admin'])`).

Topbar: back to `/settings`, action `+ Add table`.

DataTable: Code · Capacity · Area · Status · Active · Edit / Delete.

Row click or "Edit" → opens `<TableForm>` in inline edit mode (or modal). Form: code (validated unique), capacity (min 1), floor_area (free text), is_active toggle.

Delete: `deleteTableAction(id)`. If FK references exist (any historical bookings on this table), action returns `TABLE_HAS_BOOKINGS` error → UI suggests "Set inactive instead" with a one-click apply button.

### Sidebar update

Edit `apps/web/lib/nav/items.ts`:

```ts
{
  label: 'Workspace',
  items: [
    { label: 'Dashboard', href: '/dashboard', icon: LayoutGrid },
    { label: 'Floor',     href: '/floor',     icon: Map },          // new
    { label: 'Customers', href: '/customers', icon: Users },
    { label: 'Bookings',  href: '/bookings',  icon: Calendar },     // graduated
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
```

---

## 6. Server Actions

In `apps/web/lib/actions/bookings.ts`:

| Action | Inputs | Effect |
|---|---|---|
| `createBookingAction(input)` | `BookingCreateSchema` (customer_id, table_id, starts_at, party_size, special_request?, internal_notes?) | Validates Zod. Computes `ends_at = starts_at + 2h`. Inserts with `status='confirmed'`, `source='manual'`. Catches Postgres exclusion constraint violation, throws `ActionError('BOOKING_CONFLICT')` with conflict info. |
| `createWalkInAction(input)` | `WalkInCreateSchema` (customer_id OR new customer fields, table_id, party_size, special_request?) | Creates customer if new (re-uses `createCustomerAction`). Inserts booking with `status='seated'`, `source='walk_in'`, `starts_at=now()`, `ends_at=now()+2h`, `seated_at=now()`. |
| `updateBookingAction(id, input)` | `BookingUpdateSchema` (table_id?, starts_at?, party_size?, special_request?, internal_notes?) | Allowed only when status is `confirmed` or `seated`. Re-validates conflict if table_id or starts_at changes. Recomputes `ends_at` if `starts_at` changes. |
| `transitionBookingAction(id, next, reason?)` | `next: BookingStatus`, `reason?: string` | Validates the transition is allowed. Sets the corresponding timestamp. Records `cancelled_reason` if provided. |

In `apps/web/lib/actions/tables.ts`:

| Action | Inputs | Effect |
|---|---|---|
| `createTableAction(input)` | `TableCreateSchema` | Admin-only via `requireRole(['admin'])`. UNIQUE(org_id, code) at DB. |
| `updateTableAction(id, input)` | `TableUpdateSchema` | Admin-only. |
| `setTableStatusAction(id, next)` | `next: 'available' \| 'cleaning' \| 'unavailable'` | Admin or front_desk. Rejects derived states (`reserved`, `occupied`). |
| `deleteTableAction(id)` | — | Admin-only. Catches FK violation → returns `TABLE_HAS_BOOKINGS`. |

Server function (not an action — read-only, called from server components):

| Function | Inputs | Returns |
|---|---|---|
| `getAvailableTablesForSlot(starts_at, ends_at, party_size)` | timestamps + count | Tables with `is_active=true`, `capacity >= party_size`, no active bookings overlapping the time range. SQL via the available-tables query in §7. |

---

## 7. Available-tables query

```sql
select t.id, t.code, t.capacity, t.floor_area
from public.tables t
where t.organization_id = public.get_my_org_id()
  and t.is_active = true
  and t.capacity >= $1::int           -- party_size
  and not exists (
    select 1 from public.bookings b
    where b.table_id = t.id
      and b.status not in ('cancelled', 'no_show', 'completed')
      and tstzrange(b.starts_at, b.ends_at, '[)')
            && tstzrange($2::timestamptz, $3::timestamptz, '[)')
  )
order by t.capacity asc, t.code asc;
```

---

## 8. Shared Package Additions (`@buranchi/shared`)

```ts
// enums
export const BookingStatusSchema = z.enum([
  'pending', 'confirmed', 'seated', 'completed', 'cancelled', 'no_show',
]);
export type BookingStatus = z.infer<typeof BookingStatusSchema>;

export const BookingSourceSchema = z.enum(['manual', 'walk_in']);
// Phase 3 extends this enum non-destructively to add 'whatsapp'.

export const TableStatusSchema = z.enum([
  'available', 'reserved', 'occupied', 'cleaning', 'unavailable',
]);

// Booking rules
export const BOOKING_RULES = {
  defaultDurationMinutes: 120,
  cleaningBufferMinutes: 15,
  minAdvanceMinutes: 60,
  maxAdvanceDays: 90,
} as const;

// Schemas
export const BookingCreateSchema = z.object({
  customer_id: z.string().uuid(),
  table_id: z.string().uuid(),
  starts_at: z.string().datetime(),
  party_size: z.number().int().min(1).max(50),
  special_request: z.string().max(500).optional(),
  internal_notes: z.string().max(2000).optional(),
});

export const BookingUpdateSchema = BookingCreateSchema.partial();

export const WalkInCreateSchema = z.object({
  // Either an existing customer id...
  customer_id: z.string().uuid().optional(),
  // ...or new customer details (validated as a discriminated form on the client)
  customer_full_name: z.string().min(1).max(120).optional(),
  customer_phone: z.string().optional(),
  table_id: z.string().uuid(),
  party_size: z.number().int().min(1).max(50),
  special_request: z.string().max(500).optional(),
});

export const TableCreateSchema = z.object({
  code: z.string().trim().min(1).max(16),
  capacity: z.number().int().min(1).max(50),
  floor_area: z.string().max(64).optional(),
  is_active: z.boolean().default(true),
});

export const TableUpdateSchema = TableCreateSchema.partial();
```

---

## 9. Components to Build

| Path | Purpose |
|---|---|
| `apps/web/components/status-pill.tsx` | Color-coded pill (success / accent / amber / muted / danger) for both booking and table statuses |
| `apps/web/components/table-card.tsx` | The card on `/floor` with derived status, body copy by status, action buttons |
| `apps/web/components/table-form.tsx` | Create/edit form on `/settings/tables` |
| `apps/web/components/customer-picker.tsx` | Autocomplete by name/phone with "+ Create new" inline form |
| `apps/web/components/table-select.tsx` | Dropdown that calls `getAvailableTablesForSlot()` and shows free tables |
| `apps/web/components/booking-form.tsx` | Reused on `/bookings/new` and inside the edit drawer on `/bookings/[id]` |
| `apps/web/components/seat-walkin-popover.tsx` | Inline popover from the floor card |
| `apps/web/components/floor-auto-refresh.tsx` | Tiny client component that calls `router.refresh()` every 30s |

---

## 10. Migrations

Two new migration files (numbered to continue Phase 1's series):

```
supabase/migrations/0009_phase2_enums_and_extension.sql
supabase/migrations/0010_phase2_tables_and_bookings.sql
```

Plus a dashboard-apply bundle for the corporate-network workflow:

```
supabase/.dashboard-apply/phase-2.sql           (gitignored)
```

The bundle wraps both migrations + `INSERT INTO supabase_migrations.schema_migrations` markers in a single `BEGIN/COMMIT`.

---

## 11. Acceptance Criteria

Phase 2 is complete when:

1. Admin can create at least 5 tables on `/settings/tables` with different codes, capacities, and floor areas.
2. `/floor` shows all active tables in a card grid; each card displays correct live status (computed) and the right quick-action buttons for that status.
3. From `/floor`, clicking "Seat walk-in" on an Available table opens the popover, accepting either an existing customer or new customer details, and creating a booking with `status='seated'`, `source='walk_in'`. The card refreshes to show "Occupied".
4. From `/bookings/new`, an admin or front_desk can create a confirmed booking. Tables that conflict with the chosen time window do not appear in the table dropdown.
5. The Postgres `bookings_no_overlap` constraint blocks any direct insert that would create overlapping active bookings on the same table — verified via `pnpm db:test` integration test.
6. Booking transitions follow the state machine: `confirmed → seated`, `seated → completed`, `confirmed → cancelled`, `confirmed → no_show`, `seated → cancelled`. Invalid transitions (e.g. `completed → confirmed`) return `INVALID_TRANSITION`.
7. `customer_service` users can view `/floor` and `/bookings` but cannot click any mutation action — buttons are absent or disabled.
8. Sidebar shows `Floor` and `Bookings` as active workspace items; "Coming Soon" group reduces to 3 items.
9. Cross-org RLS isolation holds: a user from org A cannot see org B's tables or bookings — verified via `pnpm db:test`.
10. Typecheck, lint, and CI build all pass on the resulting branch.

---

## 12. Phase Bridge

The next document is the implementation plan, produced by the `writing-plans` skill, which decomposes this design into ordered tasks with file-level granularity, testable milestones, and review checkpoints.
