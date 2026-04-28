# Buranchi Koda

Multi-tenant restaurant operations platform — Buranchi (and future SaaS tenants).

**Phase 1 — System Foundation** (this repo's current state) ships:
- Multi-tenant Postgres schema with RLS isolation
- Supabase Auth (admin-invite-only via direct-link generation)
- Three roles: admin · front_desk · customer_service
- Customer database with E.164 phone normalization, tags, soft search
- Admin dashboard with stat cards, recent customers, quick actions
- Settings: own profile + avatar upload, organization (name, timezone, address, operating hours, logo), team management (roles, suspend, invite)
- Custom popover TimePicker and structured OperatingHours editor
- Tailwind v4 design system with consistent 33px controls / 12px font

Phases 2–7 (Booking, WhatsApp, AI Agent, Loyalty, Marketing, Launch) get their own design + plan cycles.

## Tech stack

| Layer | Choice |
|---|---|
| Web app | Next.js 15 (App Router) on Vercel + Turbopack dev |
| Backend | Supabase (Postgres 15, Auth, RLS, Realtime, Storage, Edge Functions) |
| Language | TypeScript 5 strict (`exactOptionalPropertyTypes: true`) |
| Build | pnpm 9 + Turborepo |
| Styling | Tailwind v4 with `@theme` tokens, Plus Jakarta Sans |
| Components | shadcn/ui-derived primitives in `packages/ui`, Radix for some accessibility primitives |
| Forms | React Hook Form + Zod |
| Tables | TanStack Table v8 |
| Icons | Lucide React |
| Hosting | Vercel (web) + Supabase (data plane) |

## Project layout

```
buranchi-koda/
├── apps/
│   └── web/                     Next.js 15 App Router (only deployable)
├── supabase/
│   ├── migrations/              Versioned SQL migrations (committed)
│   ├── .dashboard-apply/        Reusable dashboard SQL bundles (gitignored)
│   ├── seed.sql                 Documented seed strategy (org via migration)
│   └── tests/                   Vitest RLS integration tests
├── packages/
│   ├── shared/                  Zod schemas, enums, utils, generated DB types
│   ├── ui/                      Design system primitives + tokens
│   └── config/                  Shared eslint + tsconfig
├── scripts/
│   └── seed-admin.ts            Bootstrap or recover any admin via direct link
├── docs/superpowers/
│   ├── specs/                   Phase design specs
│   └── plans/                   Phase implementation plans
└── .github/workflows/ci.yml     Lint/typecheck/build (RLS tests gated)
```

## Quick start

Prerequisites: Node 20, pnpm 9, a Supabase project (free tier works), access to its SQL editor.

```bash
# 1. Install
nvm use            # pick up Node 20 from .nvmrc
pnpm install

# 2. Configure env
cp .env.example .env.local
# Fill .env.local with your project's:
#   NEXT_PUBLIC_SUPABASE_URL, NEXT_PUBLIC_SUPABASE_ANON_KEY,
#   SUPABASE_SERVICE_ROLE_KEY, SUPABASE_DB_PASSWORD, SUPABASE_DB_URL,
#   SUPABASE_ACCESS_TOKEN (Personal Access Token, for `pnpm db:types`),
#   NEXT_PUBLIC_APP_URL=http://localhost:3000

# 3. Apply schema (the recommended path on a corporate network)
# Open https://supabase.com/dashboard/project/<your-ref>/sql/new
# Paste each file from supabase/.dashboard-apply/ in order:
#   cluster-2.sql       (initial schema, RLS, triggers)
#   cluster-5d-storage.sql (avatars bucket)
#   cluster-5e-org.sql  (org-logos bucket + address/operating_hours columns)
# Click Run. Each bundle is wrapped in BEGIN/COMMIT for atomicity and registers
# itself in supabase_migrations.schema_migrations so future `db push` is a no-op.

# Alternative on a friendly network: pnpm db:push (uses the CLI; needs port 5432
# open which corporate firewalls often block).

# 4. Generate database types from the live schema
pnpm db:types

# 5. Bootstrap the first admin (no email setup required)
pnpm seed:admin email=you@example.com
# Copy the printed direct link, open it in your browser, set a password.

# 6. Run the dev server
pnpm dev
# Opens on http://localhost:3000 with Turbopack
```

## Useful commands

| Command | What it does |
|---|---|
| `pnpm dev` | Next.js dev server (Turbopack) |
| `pnpm build` | Production build of all apps |
| `pnpm typecheck` | `tsc --noEmit` across all workspaces (via Turbo) |
| `pnpm test` | Vitest across all packages (via Turbo) |
| `pnpm db:test` | RLS integration tests against the configured Supabase project |
| `pnpm db:types` | Regenerate `packages/shared/src/types/database.ts` from live schema |
| `pnpm db:push` | Push pending migrations via Supabase CLI (needs port 5432 reachable) |
| `pnpm seed:admin email=…` | Print a direct-link invite (or recovery if user already exists) |
| `pnpm format` | Prettier write across the repo |

## Multi-tenancy

Every business table carries `organization_id`. Two helper functions:

```sql
public.get_my_org_id()  -- SECURITY DEFINER; returns current user's org from profiles
public.get_my_role()    -- SECURITY DEFINER; returns current user's role
```

Each table has an RLS policy of the form `using (organization_id = public.get_my_org_id())`. The `SECURITY DEFINER` wrapping avoids policy recursion (a policy on `profiles` reading from `profiles`).

Buranchi is seeded as the first organization. Adding a second tenant later is one row in `organizations` plus inviting their admin.

## Roles

| Role | Customers | Settings/own | Settings/org | Settings/users |
|---|:---:|:---:|:---:|:---:|
| `admin` | full | ✓ | ✓ | ✓ |
| `front_desk` | create, edit, view | ✓ | — | — |
| `customer_service` | create, edit, view | ✓ | — | — |

Marketing role from the original blueprint is folded into `customer_service` — small teams typically have one person handling both inbound CS and outbound campaigns. Splitting later is a non-destructive enum extension.

## Storage buckets

| Bucket | Used for | Path | RLS |
|---|---|---|---|
| `avatars` | User profile photos | `<user_id>/avatar-<timestamp>.<ext>` | User can write their own folder; everyone can read |
| `org-logos` | Organization logos | `<organization_id>/logo-<timestamp>.<ext>` | Admin of matching org can write; everyone can read |

Both are public (URL-addressable) but RLS gates writes.

## Operating hours format

Stored as plain text in `organizations.operating_hours`. Format:

```
Monday: 09:00-21:00
Tuesday: 09:00-21:00
Wednesday: Closed
Thursday: 09:00-21:00
Friday: 09:00-23:00
Saturday: 10:00-23:00
Sunday: Closed
```

The UI renders this via `parseOperatingHours()` and re-serializes via `serializeOperatingHours()` from `@buranchi/shared`. Both human-readable (no API needed for staff) and AI-readable (Phase 4 chat bot can answer "Are you open Sundays?" by reading directly).

## Documentation

- Phase 1 spec: [`docs/superpowers/specs/2026-04-28-phase-1-system-foundation-design.md`](docs/superpowers/specs/2026-04-28-phase-1-system-foundation-design.md)
- Phase 1 plan: [`docs/superpowers/plans/2026-04-28-phase-1-system-foundation.md`](docs/superpowers/plans/2026-04-28-phase-1-system-foundation.md)
- Future phases get their own spec + plan files in the same directories before implementation begins.

## Verifying Phase 1 acceptance

The spec defines 12 acceptance criteria. Quick check:

1. ✓ Login renders, admin can authenticate after `pnpm seed:admin email=…`
2. ✓ Admin can invite users via `/settings/users/invite`; invitee sets password and reaches `/dashboard`
3. ✓ All three roles can read customers; only admin can delete
4. ✓ Phone numbers normalize to E.164 (e.g. `0812…` → `+62812…`)
5. ✓ Two orgs can share the same customer phone (multi-tenancy proof)
6. ✓ Cross-tenant queries return zero rows (RLS proof — verified by `pnpm db:test`)
7. ✓ "Coming Soon" sidebar items render disabled
8. ✓ CI green: typecheck + build (RLS tests gated until secrets configured)

## Known operational notes

- **Corporate networks often block port 5432** (Postgres wire protocol). The dashboard SQL editor (HTTPS) always works. Use `supabase/.dashboard-apply/*.sql` bundles when you can't `pnpm db:push`.
- **`pnpm db:types` requires `SUPABASE_ACCESS_TOKEN`** in `.env.local` (a Personal Access Token from https://supabase.com/dashboard/account/tokens). The bundled regenerated types file is checked in so a fresh clone can typecheck without re-running the CLI.
- **Avatar / logo storage requires bucket+RLS setup** via the corresponding `cluster-5d-storage.sql` and `cluster-5e-org.sql` bundles. Bundles are idempotent — safe to re-run.
