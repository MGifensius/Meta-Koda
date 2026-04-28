# Phase 1 — System Foundation: Design Spec

**Project:** Buranchi Digital Booking, WhatsApp, Marketing & Loyalty System
**Phase:** 1 of 7 — System Foundation
**Date:** 2026-04-28
**Status:** Approved (pending user review of this written spec)

---

## 1. Scope

This phase establishes the spine on which Phases 2–7 will plug in. Out of scope for Phase 1 are bookings, tables, walk-ins, WhatsApp, AI Agent, loyalty, and marketing — each of those gets its own design spec when its phase begins.

### In Scope

- Monorepo project skeleton (Next.js + Supabase + shared packages)
- Postgres schema + RLS for `organizations`, `profiles`, `customers`
- Supabase Auth (email + password, admin-invite-only)
- Profile auto-creation trigger from `auth.users` metadata
- Role-based authorization helpers (`requireProfile`, `requireRole`)
- Admin dashboard shell (sidebar, topbar, profile menu)
- Authenticated routes: `/dashboard`, `/customers`, `/settings`
- Customer CRUD pages (list, detail, create, edit)
- User management pages (admin only): users list, invite flow
- Organization profile page (admin only)
- Design system tokens + UI primitive package
- CI pipeline: lint, typecheck, test, migration dry-run

### Out of Scope (Future Phases)

- Phase 2 — Booking/Flooring (`tables`, `bookings`, walk-in flow)
- Phase 3 — WhatsApp inbox + webhook
- Phase 4 — AI Agent + intent routing + handover
- Phase 5 — Loyalty (points, tiers, rewards, transactions)
- Phase 6 — Marketing blast (templates, campaigns, recipients)
- Phase 7 — End-to-end testing & launch
- SaaS sign-up flow, billing, organization switcher UI (deferred until SaaS pivot is real)

---

## 2. Architecture Overview

### Stack

- **Frontend + Backend:** Next.js 15 (App Router) on Vercel
- **Database & Auth:** Supabase (Postgres, RLS, Auth, Realtime, Storage, Edge Functions)
- **Language:** TypeScript 5 (strict)
- **Package Manager:** pnpm 9
- **Build Orchestration:** Turborepo
- **Styling:** Tailwind CSS v4
- **Component Primitives:** shadcn/ui (copied into `packages/ui`, customized)
- **Forms:** React Hook Form + Zod
- **Tables:** TanStack Table
- **Icons:** Lucide React
- **Font:** Plus Jakarta Sans (variable, self-hosted via `next/font`)
- **Test:** Vitest (unit), Playwright (E2E in Phase 7)
- **CI:** GitHub Actions

### Why this stack (the short version)

The original blueprint recommended NestJS, but with Supabase + Vercel chosen, NestJS would re-implement what Supabase already provides (auth, realtime, RLS, storage). A single Next.js App Router app is native to Vercel, deploys in one click, and uses Supabase as its data plane. NestJS-style modular structure (controllers → services → repositories) maps cleanly onto Next.js route handlers + server actions + Supabase queries — same separation of concerns, fewer moving parts, lower cost.

### Multi-Tenancy Strategy

The system is **single-tenant in practice (Buranchi only) but multi-tenant in shape**: every table that holds business data has an `organization_id` column, every RLS policy is scoped by it, and Buranchi is seeded as the first row in `organizations`. This means future SaaS expansion is additive (add sign-up UI, billing, org switcher) rather than a destructive migration of live customer data.

Self-serve sign-up, billing, and an organization switcher UI are explicitly **out of scope** for Phase 1.

---

## 3. Repository Layout

```
buranchi-koda/
├── apps/
│   └── web/                          # Next.js 15 App Router (Vercel target)
│       ├── app/
│       │   ├── (auth)/               # public: /login, /accept-invite, /forgot-password
│       │   ├── (app)/                # authenticated, sidebar shell
│       │   │   ├── dashboard/
│       │   │   ├── customers/
│       │   │   └── settings/
│       │   ├── api/auth/callback/    # Supabase OAuth callback (invite link)
│       │   ├── layout.tsx
│       │   ├── page.tsx              # redirects /dashboard or /login
│       │   └── middleware.ts         # refreshes Supabase session
│       ├── components/               # app-specific composites
│       ├── lib/
│       │   ├── supabase/             # server & browser clients
│       │   ├── actions/              # server actions
│       │   └── auth/                 # requireProfile / requireRole helpers
│       └── package.json
│
├── supabase/
│   ├── migrations/                   # versioned SQL
│   │   ├── 0001_extensions_enums.sql
│   │   ├── 0002_organizations.sql
│   │   ├── 0003_profiles.sql
│   │   ├── 0004_customers.sql
│   │   ├── 0005_rls_helpers.sql
│   │   ├── 0006_rls_policies.sql
│   │   └── 0007_triggers.sql
│   ├── seed.sql                      # creates Buranchi org + first admin only
│   ├── functions/                    # edge functions (used Phase 3+)
│   └── config.toml
│
├── packages/
│   ├── shared/                       # types, Zod schemas, enums, helpers
│   │   └── src/
│   │       ├── schemas/              # Zod: customer, profile, organization
│   │       ├── types/                # Database types (generated from Supabase)
│   │       └── enums/                # role, profile_status, etc.
│   ├── ui/                           # design-system primitives
│   │   ├── components/               # Button, Input, Card, Sidebar, StatCard...
│   │   └── tokens.ts                 # color, spacing, radii, typography
│   └── config/                       # eslint-config, tsconfig, tailwind-preset
│
├── .github/workflows/                # CI: lint → typecheck → test → migration dry-run
├── pnpm-workspace.yaml
├── turbo.json
├── package.json
└── README.md
```

**Vercel deployment:** root directory is `apps/web`. Vercel pulls in the workspace packages via pnpm. `supabase/` is deployed on a separate pipeline (Supabase CLI in CI). Future apps (`apps/mobile`, `apps/admin`) drop in as siblings without disrupting the web app.

---

## 4. Database Schema

### Enums

```sql
create type user_role as enum ('admin', 'front_desk', 'customer_service');
create type profile_status as enum ('active', 'suspended');
```

> **Marketing role intentionally merged into `customer_service`.** In small-tenant operations the same person handles inbound CS and outbound marketing. Adding `marketing` back later is a non-destructive enum extension.

### Table: `organizations`

| Column | Type | Notes |
|---|---|---|
| `id` | `uuid` PK | default `gen_random_uuid()` |
| `slug` | `text` UNIQUE NOT NULL | URL-safe (e.g. `buranchi`) |
| `name` | `text` NOT NULL | Display name |
| `timezone` | `text` NOT NULL | default `'Asia/Jakarta'` |
| `logo_url` | `text` | nullable, Supabase Storage URL |
| `created_at` | `timestamptz` NOT NULL | default `now()` |
| `updated_at` | `timestamptz` NOT NULL | maintained by `moddatetime` trigger |

Buranchi is seeded as the first row by `supabase/seed.sql`.

### Table: `profiles`

Internal user records, 1:1 with `auth.users`.

| Column | Type | Notes |
|---|---|---|
| `id` | `uuid` PK / FK → `auth.users.id` | cascade on delete |
| `organization_id` | `uuid` FK → `organizations.id` | NOT NULL, cascade on delete |
| `email` | `text` | mirrored from auth.users |
| `full_name` | `text` NOT NULL | display name |
| `role` | `user_role` NOT NULL | |
| `status` | `profile_status` NOT NULL | default `'active'` |
| `avatar_url` | `text` | nullable |
| `last_seen_at` | `timestamptz` | updated on session refresh |
| `created_at` / `updated_at` | `timestamptz` | auto-managed |

### Table: `customers`

Per-organization customer database. Phone is nullable (walk-ins may refuse to provide one).

| Column | Type | Notes |
|---|---|---|
| `id` | `uuid` PK | internal id |
| `display_id` | `text` NOT NULL | format `CUS-A4F7K2` (Crockford base32). UNIQUE per org. Generated by trigger. |
| `organization_id` | `uuid` FK → `organizations.id` | NOT NULL, cascade on delete |
| `full_name` | `text` NOT NULL | |
| `phone` | `text` | nullable. Stored as E.164 (e.g. `+6281234567890`). UNIQUE per org where not null (partial index). Normalized in app layer via `libphonenumber-js` Zod transform. |
| `email` | `text` | nullable |
| `birth_date` | `date` | nullable, used by Phase 6 birthday campaigns |
| `notes` | `text` | free-text staff notes |
| `tags` | `text[]` | default `'{}'` |
| `created_by` | `uuid` FK → `profiles.id` | audit trail; set null on profile delete |
| `created_at` / `updated_at` | `timestamptz` | auto-managed |

### Indexes

```sql
create index on customers (organization_id);
create unique index on customers (organization_id, display_id);
create unique index on customers (organization_id, phone) where phone is not null;
create index on customers using gin (full_name gin_trgm_ops);  -- for search
create index on profiles (organization_id);
```

### Triggers

- `set_updated_at` on each table (`moddatetime` extension)
- `generate_customer_display_id` BEFORE INSERT — generates Crockford base32 random, retries until uniqueness within org satisfied (typical retries = 0)
- `handle_new_user` AFTER INSERT on `auth.users` — creates the corresponding `profiles` row using `raw_user_meta_data.{organization_id, full_name, role}`

---

## 5. Row Level Security

### Helper Functions (SECURITY DEFINER)

These bypass RLS to avoid recursion when reading from `profiles` inside a `profiles` policy.

```sql
create or replace function public.get_my_org_id() returns uuid
language sql security definer stable as $$
  select organization_id from public.profiles where id = auth.uid();
$$;

create or replace function public.get_my_role() returns user_role
language sql security definer stable as $$
  select role from public.profiles where id = auth.uid();
$$;
```

### Policy Pattern

Every table is enabled for RLS. Policies follow this shape:

- **SELECT**: `organization_id = public.get_my_org_id()`
- **INSERT**: `with check (organization_id = public.get_my_org_id())`
- **UPDATE**: `using (organization_id = public.get_my_org_id())`
- **DELETE** (admin-only resources): adds `and public.get_my_role() = 'admin'`

### Per-Table Policies

**`organizations`**

- SELECT: row's own `id = public.get_my_org_id()`
- UPDATE: `id = public.get_my_org_id() and public.get_my_role() = 'admin'`
- INSERT/DELETE: blocked at RLS (only admin via service-role can mutate; not exposed in app)

**`profiles`**

- SELECT: `organization_id = public.get_my_org_id()`
- INSERT: handled by trigger from `auth.users` — RLS policy denies direct client INSERTs
- UPDATE (self): `id = auth.uid()` (allows editing own name, avatar)
- UPDATE (admin in org): `organization_id = public.get_my_org_id() and public.get_my_role() = 'admin'`
- DELETE: blocked at RLS (admin uses suspension via `status` column instead)

**`customers`**

- SELECT/INSERT/UPDATE: `organization_id = public.get_my_org_id()`
- DELETE: `organization_id = public.get_my_org_id() and public.get_my_role() = 'admin'`

---

## 6. Authentication

### Login Flow

1. User visits `/login`
2. Submits email + password (RHF + Zod validation)
3. Server action calls `supabase.auth.signInWithPassword({ email, password })`
4. Supabase sets `sb-access-token` and `sb-refresh-token` cookies
5. `middleware.ts` refreshes the session on every subsequent request (`@supabase/ssr`)
6. The `(app)` layout calls `requireProfile()`, which:
   - Fetches `auth.users` for current session, redirects `/login` if null
   - Joins on `profiles` row, redirects `/login?error=suspended` if status ≠ active
   - Returns the typed profile to descendants via React Server Component context
7. Authenticated user lands on `/dashboard`

### Invite Flow (Admin Onboards New Staff)

1. Admin visits `/settings/users` → clicks "Invite member"
2. Form: `email`, `full_name`, `role` (RHF + Zod)
3. Server action `inviteUser(input)`:
   - Calls `requireRole(['admin'])`
   - Calls `supabase.auth.admin.inviteUserByEmail(email, { data: { organization_id, full_name, role } })` (the metadata is stashed in `auth.users.raw_user_meta_data`)
4. Supabase emails a magic link → `https://<host>/api/auth/callback?…&next=/accept-invite`
5. Invitee clicks the link, lands on `/accept-invite`
6. Page asks them to set a password → `supabase.auth.updateUser({ password })`
7. Trigger `on_auth_user_created` fires AFTER INSERT on `auth.users`, creating the `profiles` row from `raw_user_meta_data`
8. Redirect → `/dashboard`

### Server-Side Auth Helpers

```ts
// apps/web/lib/auth/server.ts

export async function requireProfile() {
  const supabase = await createServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect('/login');

  const { data: profile } = await supabase
    .from('profiles').select('*').eq('id', user.id).single();

  if (!profile || profile.status !== 'active') {
    await supabase.auth.signOut();
    redirect('/login?error=suspended');
  }
  return profile;
}

export async function requireRole(roles: UserRole[]) {
  const profile = await requireProfile();
  if (!roles.includes(profile.role)) throw new ForbiddenError('role');
  return profile;
}
```

Two-layer authorization: **RLS at the database** is the safety net (works even if app code is bypassed); **`requireRole()` at the action layer** gives clean error responses without round-tripping to the DB only to fail.

---

## 7. Role Permission Matrix (Phase 1)

| Capability | `admin` | `front_desk` | `customer_service` |
|---|:---:|:---:|:---:|
| **Dashboard** | | | |
| View dashboard | ✓ | ✓ | ✓ |
| **Customers** | | | |
| View customers (list, detail) | ✓ | ✓ | ✓ |
| Create customer | ✓ | ✓ | ✓ |
| Edit customer | ✓ | ✓ | ✓ |
| Delete customer | ✓ | — | — |
| **User Management** | | | |
| View team / users list | ✓ | — | — |
| Invite new user | ✓ | — | — |
| Suspend / reactivate user | ✓ | — | — |
| Change user role | ✓ | — | — |
| **Organization** | | | |
| Edit org profile (name, logo) | ✓ | — | — |
| **Self** | | | |
| Edit own profile (name, avatar, password) | ✓ | ✓ | ✓ |

---

## 8. Frontend Structure

### Route Tree

```
apps/web/app/
├── (auth)/                          # public, no sidebar
│   ├── login/page.tsx
│   ├── accept-invite/page.tsx
│   ├── forgot-password/page.tsx
│   └── layout.tsx                   # centered card with logo
│
├── (app)/                           # authenticated, sidebar shell
│   ├── dashboard/page.tsx           # 6 stat cards (Phase 1: only Total Customers + New This Week populated; rest are placeholders)
│   ├── customers/
│   │   ├── page.tsx                 # list — search, tag filter, sort, paginate
│   │   ├── new/page.tsx             # create form
│   │   └── [id]/
│   │       ├── page.tsx             # detail
│   │       └── edit/page.tsx        # edit
│   ├── settings/
│   │   ├── page.tsx                 # own profile — anyone
│   │   ├── organization/page.tsx    # admin only
│   │   └── users/
│   │       ├── page.tsx             # admin only — users list, invite button
│   │       └── invite/page.tsx      # admin only — invite form
│   └── layout.tsx                   # sidebar + topbar; calls requireProfile()
│
├── api/auth/callback/route.ts       # Supabase callback for invite/magic links
├── layout.tsx                       # root: html, body, font, providers
├── page.tsx                         # redirects /dashboard or /login
└── middleware.ts                    # refresh Supabase session
```

### Sidebar Layout

The `(app)` layout is a 200px left sidebar + main content area. Sidebar items are grouped:

- **Workspace** — Dashboard, Customers (active items)
- **Coming Soon** — Bookings, WhatsApp, Loyalty, Marketing (greyed, disabled, listed for visual completeness)
- **Settings** — Settings (own profile + admin pages if applicable)

Sidebar foot shows the current user's avatar + name + role + organization name.

### Server Action Pattern

Reads happen in server components via the Supabase server client. Writes go through server actions:

```ts
// packages/shared/src/schemas/customer.ts
export const CustomerInputSchema = z.object({
  full_name: z.string().min(1).max(120),
  phone: z.string().optional().transform(toE164),
  email: z.string().email().optional(),
  birth_date: z.string().date().optional(),
  notes: z.string().max(2000).optional(),
  tags: z.array(z.string()).default([]),
});

// apps/web/lib/actions/customers.ts
'use server';
export async function createCustomer(input: CustomerInput) {
  const profile = await requireRole(['admin', 'front_desk', 'customer_service']);
  const parsed = CustomerInputSchema.parse(input);

  const supabase = await createServerClient();
  const { data, error } = await supabase
    .from('customers')
    .insert({ ...parsed, organization_id: profile.organization_id, created_by: profile.id })
    .select().single();

  if (error) throw new ActionError(error);
  revalidatePath('/customers');
  return data;
}
```

Forms in client components use `useForm({ resolver: zodResolver(CustomerInputSchema) })`, calling the action on submit.

Errors thrown server-side surface via `error.tsx` route boundaries or inline form errors. Loading states use `loading.tsx` skeleton routes per page.

---

## 9. Design System

### Tokens

Single source of truth at `packages/ui/tokens.ts`, imported by Tailwind preset.

**Color**

| Token | Value | Usage |
|---|---|---|
| `canvas` | `#f3f3f7` | App background |
| `surface` | `#ffffff` | Cards, panels |
| `fg` | `#0a0a0a` | Primary text |
| `muted` | `#737373` | Secondary text, qualifiers |
| `accent` | `#2563eb` | Active states, primary actions |
| `accent-soft` | `#dbeafe` | Soft highlight backgrounds |
| `success` | `#16a34a` | Positive trends, success states |
| `success-soft` | `#dcfce7` | |
| `danger` | `#dc2626` | Negative trends, destructive actions |
| `danger-soft` | `#fee2e2` | |
| `border` | `#e5e5e5` | Dividers, hairline borders |
| `row-divider` | `#f5f5f5` | Table row separators |

**Typography** — Plus Jakarta Sans (variable, self-hosted via `next/font`)

| Token | Size / Weight / Tracking |
|---|---|
| `display` | 28px / 500 / -0.02em |
| `title` | 18px / 600 |
| `body` | 13px / 400 |
| `body-strong` | 13px / 500 |
| `label` | 11px / 500 muted, uppercase 0.06em tracking |
| `mono` | ui-monospace 12px (for IDs and codes) |

**Radius**

| Token | Value | Usage |
|---|---|---|
| `card` | 14px | Cards, surfaces |
| `pill` | 999px | Buttons, badges, status pills |
| `input` | 8px | Form fields |
| `tile` | 10px | Icon tiles |

**Spacing**

| Token | Value | Usage |
|---|---|---|
| `card-pad` | 20px | Card inner padding |
| `row-gap` | 14px | Grid row gap |
| `section-gap` | 24px | Section vertical rhythm |

**Elevation**

- Card: `0 1px 2px rgba(15,23,42,0.04)` (barely-there)
- Popover/dropdown: `0 8px 24px rgba(15,23,42,0.08)`
- Rows and nav items: no shadow

### Component Vocabulary (`packages/ui/components/`)

Built on shadcn/ui primitives, themed to tokens above.

- `Button` — variants: primary (black), accent (blue), outline, ghost; sizes: sm, md, lg
- `IconButton` — circular pill, icon-only
- `Input`, `Textarea`, `Select`, `Combobox`, `DatePicker`, `TagsInput`
- `Card`, `Section` (with optional title + actions slot)
- `Sidebar`, `SidebarSection`, `SidebarItem`
- `Topbar`, `Breadcrumb`
- `StatCard` (trend variant with up/down icon tile, category variant with neutral icon tile)
- `DataTable` (TanStack Table wrapper with built-in search, sort, paginate, empty state)
- `Badge` (neutral, accent, success, danger variants)
- `Avatar`
- `Dialog`, `Sheet`, `Popover`, `DropdownMenu`, `Toast`
- `EmptyState`, `Skeleton`, `Spinner`
- `FormField` (label + control + error wrapper)

### Stat Card Specification

**Trend variant** (Row 1 — values that change over time)

- 14px radius, white surface, 20px padding, hairline shadow
- Title (13px / 500 fg) + qualifier (`/ All time` 13px / 400 muted)
- Display number (28px / 500 / -0.02em)
- Delta indicator: 14×14 rounded-square chip with arrow icon (up/down). Background `success-soft` or `danger-soft`. Followed by colored percentage and grey context (e.g. "last week").
- Right side: 40×40 icon tile with hairline border. Icon color = `success` (up) or `danger` (down). Icon = Lucide `TrendingUp` / `TrendingDown`.

**Category variant** (Row 2 — current-state metrics)

- Same card chrome
- No delta arrow icon — just optional inline context text (e.g. "3 of 18 occupied")
- Right side: 40×40 icon tile with hairline border. Icon color = `fg` (neutral). Icon = contextual Lucide icon (`MessageCircle`, `Star`, `LayoutGrid`).

### "Coming Soon" Sidebar Items

Bookings, WhatsApp, Loyalty, Marketing render in the sidebar with `color: #cbd5e1`, no hover state, non-clickable. Removes the visual "incompleteness" of an app with only two real nav items.

---

## 10. Initial Data

`supabase/seed.sql` creates **only**:

- One organization row: `{ slug: 'buranchi', name: 'Buranchi', timezone: 'Asia/Jakarta' }`

The first admin is **not** created by `seed.sql`. Instead, a one-shot bootstrap script (`pnpm seed:admin email=<email>`) calls `supabase.auth.admin.inviteUserByEmail()` with the Buranchi `organization_id` + `role='admin'` in metadata. The invitee receives the standard invite email and sets their password through the same `/accept-invite` flow used for any other staff member. The `handle_new_user` trigger creates the `profiles` row.

Rationale: this way the first admin uses production-grade invite + password-setting paths (no dev-mode shortcuts that need to be undone for production). The bootstrap script reads `SUPABASE_SERVICE_ROLE_KEY` from `.env.local` and is documented in `README.md`.

No seeded customers. The customer database starts empty.

---

## 11. CI / Quality Gates

GitHub Actions on every PR:

1. `pnpm install --frozen-lockfile`
2. `pnpm lint` (ESLint)
3. `pnpm typecheck` (TypeScript)
4. `pnpm test` (Vitest unit tests)
5. `supabase db lint` + dry-run of new migrations against ephemeral Postgres

Vercel preview deploys on PRs (linked to a Supabase preview branch where possible). Production deploy on merge to `main`.

---

## 12. Acceptance Criteria

Phase 1 is complete when:

1. A clean clone, after `pnpm install` + `pnpm db:reset` + `pnpm seed:admin email=<dev>` + `pnpm dev`, presents a working `/login` page.
2. The bootstrapped admin receives the invite email, sets a password, and reaches `/dashboard`.
3. That admin can invite a new user via `/settings/users/invite`; the invitee receives an email, sets a password, and lands on the dashboard with the right role.
4. All three roles can view `/dashboard` and `/customers`.
5. `front_desk` and `customer_service` can create and edit customers but cannot delete them; only `admin` can delete.
6. Only `admin` can view `/settings/users` and `/settings/organization`.
7. Phone numbers entered in any format (`0812…`, `+62 812…`, `812…`) are stored as canonical E.164 (`+62812…`).
8. Two customers in the *same* organization cannot share a non-null phone; a customer with the *same* phone in a *different* organization is allowed (multi-tenancy proof).
9. Bypassing the app and querying Supabase as another organization's user returns zero rows for `customers` / `profiles` / `organizations` of the first org (RLS proof).
10. The "Coming Soon" sidebar items render disabled and don't navigate.
11. CI passes on green: lint, typecheck, test, migration dry-run.
12. The dashboard renders with placeholder cards (count of customers, new-this-week count). Other cards show real but trivial values where the data exists.

---

## 13. In-Scope Edge Cases

- **Last-admin protection** — the `updateUserRole` and `suspendUser` server actions refuse if the action would leave the organization with zero active admins. Returned as a typed `ActionError('LAST_ADMIN')` so the form can render a friendly message.
- **Self-suspension** — admin cannot suspend their own profile.
- **Phone country default** — Phase 1 assumes Indonesia (`+62`) for normalization fallback when the user enters a number without country code. SaaS expansion will require a per-organization `default_country_code` column on `organizations` (out of scope here).

## 14. Deferred to Later Phases

- **Subdomain vs path-based tenant routing** (e.g. `buranchi.app.com` vs `app.com/buranchi`). Defer until SaaS sign-up is being designed; both are migrations from the current path-based shape.
- **Customer GDPR export / delete** — dedicated privacy-features pass. RLS already prevents cross-tenant exposure.
- **Audit log of admin actions** — useful but not Phase 1 critical.

---

## 15. Phase Bridge

The next document is the implementation plan, produced by the `writing-plans` skill, which decomposes this design into ordered tasks with file-level granularity, testable milestones, and review checkpoints.
