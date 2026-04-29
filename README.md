# Buranchi Koda

Multi-tenant restaurant operations platform — Buranchi (and future SaaS tenants).

**Shipped phases:**
- **Phase 1 — System Foundation:** multi-tenant Postgres + RLS, auth, customer database, settings, design system
- **Phase 2 — Booking & Flooring:** tables, bookings (state machine + EXCLUDE constraint), Floor live-ops view, list view, walk-ins
- **Phase 4 — Koda AI Agent:** customer-facing booking concierge (GPT-4o-mini) with simulator, FAQ + specials knowledge base, escalation guard, conversation inbox, customer-note audit trail

**Phase 3 (WhatsApp)** is blocked on Meta Business verification — see [`docs/phase-3/meta-business-onboarding.md`](docs/phase-3/meta-business-onboarding.md). The Koda engine is channel-agnostic so plumbing WhatsApp in later is a thin adapter.

**Phases 5–7** (Loyalty, Marketing, Launch) get their own spec + plan cycles.

## Tech stack

| Layer | Choice |
|---|---|
| Web app | Next.js 15 (App Router) on Vercel + Turbopack dev |
| Backend | Supabase (Postgres 15, Auth, RLS, Storage) |
| AI | OpenAI GPT-4o-mini via the `openai` SDK (function-calling) |
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
├── docs/
│   ├── superpowers/             Phase specs + plans
│   ├── phase-3/                 Meta Business + WhatsApp onboarding playbook
│   └── phase-4/                 Koda operational README
└── .github/workflows/ci.yml     Lint/typecheck/build (RLS tests gated)
```

## Quick start

Prerequisites: Node 20, pnpm 9, a Supabase project (free tier works), an OpenAI API key, access to Supabase's SQL editor.

```bash
# 1. Install
nvm use            # pick up Node 20 from .nvmrc
pnpm install

# 2. Configure env
cp .env.example .env.local
# Fill .env.local with your project's:
#   NEXT_PUBLIC_SUPABASE_URL, NEXT_PUBLIC_SUPABASE_ANON_KEY,
#   SUPABASE_SERVICE_ROLE_KEY, SUPABASE_ACCESS_TOKEN (PAT for `pnpm db:types`),
#   OPENAI_API_KEY (Phase 4),
#   NEXT_PUBLIC_APP_URL=http://localhost:3000

# 3. Apply schema (corporate-network-friendly path)
# Open https://supabase.com/dashboard/project/<your-ref>/sql/new and paste each
# bundle from supabase/.dashboard-apply/ in order. Bundles are wrapped in
# BEGIN/COMMIT and self-register in supabase_migrations.schema_migrations.
#
# Phase 1: cluster-2.sql · cluster-5d-storage.sql · cluster-5e-org.sql
# Phase 2: phase-2.sql
# Phase 4: phase-4.sql · security-hardening.sql · revoke-anon-definer.sql
#          storage-private-buckets.sql · consolidate-profiles-update.sql
#          fk-indexes.sql · revert-definer-helpers.sql
#
# Alternative on a friendly network: pnpm db:push (uses the CLI; needs port 5432
# open which corporate firewalls often block).

# 4. Generate database types from the live schema
pnpm db:types

# 5. Bootstrap the first admin (no email setup required)
pnpm seed:admin email=you@example.com
# Copy the printed direct link, open it in your browser, set a password.

# 6. Run the dev server
pnpm dev
```

## Useful commands

| Command | What it does |
|---|---|
| `pnpm dev` | Next.js dev server (Turbopack) |
| `pnpm build` | Production build |
| `pnpm typecheck` | `tsc --noEmit` across all workspaces (via Turbo) |
| `pnpm test` | Vitest across all packages (via Turbo) |
| `pnpm db:test` | RLS integration tests against the configured Supabase project |
| `pnpm db:types` | Regenerate `packages/shared/src/types/database.ts` |
| `pnpm db:push` | Push pending migrations via Supabase CLI (needs port 5432) |
| `pnpm seed:admin email=…` | Print a direct-link invite (or recovery if user exists) |
| `pnpm format` | Prettier write across the repo |

## Multi-tenancy

Every business table carries `organization_id`. Two helper functions sit at the foundation of RLS:

```sql
public.get_my_org_id()  -- SECURITY DEFINER; returns current user's org from JWT
public.get_my_role()    -- SECURITY DEFINER; returns current user's role
```

Every table has an RLS policy of the form `using (organization_id = public.get_my_org_id())`. `SECURITY DEFINER` is required so the function can read auth claims regardless of the caller's role; this surfaces as 2 accepted Security Advisor warnings ("Signed-In Users Can Execute SECURITY DEFINER") which we document as intentional in migration 0018. A future cleanup is moving these helpers into a non-public schema (e.g. `private`) which would clear the lint and require updating every RLS policy that references them by name.

Buranchi is seeded as the first organization. Adding a second tenant later is one row in `organizations` plus inviting their admin.

## Roles

| Role | Customers | Bookings | Floor | Tables (admin CRUD) | Koda inbox/simulator | Settings/org | Settings/users |
|---|:---:|:---:|:---:|:---:|:---:|:---:|:---:|
| `admin` | full | full | full + manual status | full | full | ✓ | ✓ |
| `front_desk` | create/edit/view | full | full + manual status | view-only | full | — | — |
| `customer_service` | create/edit/view | view-only | view-only | — | — | — | — |

## Storage buckets

| Bucket | Used for | Path | Access |
|---|---|---|---|
| `avatars` | User profile photos | `<user_id>/avatar-<ts>.<ext>` | Private bucket; signed URLs only. Authenticated users can read. |
| `org-logos` | Organization logos | `<organization_id>/logo-<ts>.<ext>` | Private bucket; signed URLs only. Authenticated users can read. |

Both buckets switched from public to private in migration 0014. The `profiles.avatar_url` and `organizations.logo_url` columns now store the storage **path** (not URL); the page renderers convert path → signed URL on every render via `supabase.storage.from('<bucket>').createSignedUrl(path, 3600)`.

## Documentation

- **Phase 1 spec:** [`docs/superpowers/specs/2026-04-28-phase-1-system-foundation-design.md`](docs/superpowers/specs/2026-04-28-phase-1-system-foundation-design.md)
- **Phase 1 plan:** [`docs/superpowers/plans/2026-04-28-phase-1-system-foundation.md`](docs/superpowers/plans/2026-04-28-phase-1-system-foundation.md)
- **Phase 2 spec:** [`docs/superpowers/specs/2026-04-29-phase-2-booking-flooring-design.md`](docs/superpowers/specs/2026-04-29-phase-2-booking-flooring-design.md)
- **Phase 2 plan:** [`docs/superpowers/plans/2026-04-29-phase-2-booking-flooring.md`](docs/superpowers/plans/2026-04-29-phase-2-booking-flooring.md)
- **Phase 3 onboarding playbook:** [`docs/phase-3/meta-business-onboarding.md`](docs/phase-3/meta-business-onboarding.md)
- **Phase 4 spec:** [`docs/superpowers/specs/2026-04-29-phase-4-koda-design.md`](docs/superpowers/specs/2026-04-29-phase-4-koda-design.md)
- **Phase 4 plan:** [`docs/superpowers/plans/2026-04-29-phase-4-koda.md`](docs/superpowers/plans/2026-04-29-phase-4-koda.md)
- **Phase 4 operational README:** [`docs/phase-4/README.md`](docs/phase-4/README.md)

## Operational notes

- **Corporate networks often block port 5432.** The dashboard SQL editor (HTTPS) always works. Use `supabase/.dashboard-apply/*.sql` bundles when you can't `pnpm db:push`.
- **`pnpm db:types` requires `SUPABASE_ACCESS_TOKEN`** in `.env.local` (a Personal Access Token from https://supabase.com/dashboard/account/tokens). The bundled regenerated types file is checked in so a fresh clone can typecheck without re-running the CLI.
- **Storage migrations are stateful.** When 0014 made avatars/logos private, existing public-URL rows in `profiles.avatar_url` and `organizations.logo_url` were nulled out (the URLs no longer resolve). Users re-upload after migration; the new flow stores paths instead.
- **Postgres `REVOKE` quirks.** Use `revoke all` with canonical type names (`integer` not `int`) for function privileges; type aliases silently no-op in some Supabase contexts. See migration 0013 for the pattern.
- **Function `search_path` and ALTER.** When `ALTER FUNCTION ... SET search_path` doesn't stick because of signature-matching quirks, use `oid::regprocedure` with a DO-block iteration instead. See migration 0013 § 1.

## Accepted advisor trade-offs

The Supabase Security Advisor flags a small set of warnings that we explicitly accept rather than chase. Each is documented at the migration that left it in place:

| Warning | Reason |
|---|---|
| 2× **Signed-In Users Can Execute SECURITY DEFINER Function** (`get_my_org_id`, `get_my_role`) | RLS-foundational; called by every tenant policy. Cleanup path: move to a non-public schema. |
| 1× **Leaked Password Protection Disabled** | HaveIBeenPwned integration is a Pro-plan feature on Supabase. Free-tier compensates with min length + character requirements. |

Performance Advisor "Unused Index" entries on a fresh install are false positives that resolve themselves once real query traffic accumulates.
