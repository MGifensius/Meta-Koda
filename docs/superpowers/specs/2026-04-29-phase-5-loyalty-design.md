# Phase 5 — Loyalty Program Design Spec

**Status:** Approved (2026-04-29)
**Author:** Marchelino Gifensius (Metaseti Digital Indonesia)
**Phase:** 5 of 7 (per original Meta-Koda blueprint)
**Depends on:** Phase 1 (foundation), Phase 2 (booking lifecycle — `completed` is the trigger for points earning), Phase 4 (Koda — gains 2 new tools).
**Unblocks:** Phase 6 marketing blasts can target by tier; Phase 3 WhatsApp inherits Koda's loyalty tools at no extra cost.

---

## 1. Goal

Build a per-tenant loyalty program that:

1. **Members earn points on transaction value** captured at booking completion (manual bill entry; no POS integration in v1).
2. **Spend (redemption) is independent of tier progression** — lifetime points drive tier, current balance drives spend.
3. **Tenants tune the program** (tier names, thresholds, perks, reward catalog) without code changes.
4. **Koda surfaces it naturally** — answers *"Berapa poin saya?"*, *"Bisa pakai dessert gratis besok?"* and reserves redemptions against upcoming bookings.

Out of scope for v1: points expiration, annual tier reset, refer-a-friend, birthday auto-bonuses, POS integration, customer self-enrollment, per-reward usage caps, multi-currency.

---

## 2. Decisions log

Captured during brainstorming on 2026-04-29.

| # | Decision | Choice |
|---|---|---|
| 1 | Mechanism style | Points-per-transaction (not per-visit). Bills captured manually. |
| 2 | Membership model | Opt-in via staff toggle on `customers` (PDP-aligned, low friction at checkout) |
| 3 | Tier driver | Lifetime points earned (never decreases on redemption). Standard airline model. |
| 4 | Earn timing | At booking completion. Staff enters pre-discount bill in completion dialog. |
| 5 | Points basis | Pre-discount gross bill. Redeeming a reward doesn't reduce the earn base. |
| 6 | Tier configurability | 4 tiers fixed (schema), tenant-named, tenant-thresholded. |
| 7 | Reward types | free_item, percent_discount, rupiah_discount — single `rewards` table with `type` + `type_value`. |
| 8 | Tier promotions | (a) `min_tier_index` on rewards locks high-value items to higher tiers; (b) free-text `perks_text` per tier for soft, human-enforced perks. |
| 9 | Architecture | DB-driven with ledger tables (`loyalty_transactions`, `loyalty_redemptions`, `loyalty_adjustments`); denormalized `points_balance`/`points_lifetime`/`current_tier_id` on `customers` for fast reads. Atomic writes via Postgres function. |
| 10 | Default earn rate | 1 point per Rp 10,000 (~1% rebate). Configurable per tenant. |
| 11 | Default tier thresholds | Bronze 0 / Silver 500 / Gold 2,000 / Platinum 5,000 lifetime points. Configurable. |

---

## 3. Architecture

### 3.1 Components

```
apps/web/lib/loyalty/
├── tier.ts          deriveTier(lifetime, tiers[]) — pure function with TDD
├── tier.test.ts
├── earn.ts          computePointsForBill(bill_idr, earn_rate) — pure function
└── earn.test.ts

apps/web/lib/actions/
├── loyalty-members.ts    enrollMember, unenrollMember
├── loyalty-tiers.ts      updateTier (admin edits names/thresholds/perks; never inserts/deletes)
├── loyalty-rewards.ts    createReward, updateReward, deleteReward
├── loyalty-redeem.ts     redeemReward, voidRedemption, adjustPoints
└── bookings.ts           — modified: completeBookingAction wraps the existing transition
                            and fans into the loyalty RPC when applicable

apps/web/components/
├── loyalty-tiers-editor.tsx          4 fixed rows; admin edits content only
├── loyalty-rewards-editor.tsx        catalog CRUD with type-aware fields
├── loyalty-completion-section.tsx    booking completion dialog body for members
├── loyalty-status-badge.tsx          tier pill + balance + progress-to-next bar
├── loyalty-redemption-history.tsx    unified ledger view per customer
├── loyalty-member-toggle.tsx         enroll/unenroll switch on customer profile
└── loyalty-adjustment-dialog.tsx     admin manual ±points form

apps/web/app/(app)/
├── settings/loyalty/                 NEW (admin-only)
│   ├── page.tsx                      Identity + Program + Tiers + Rewards + Activity
│   ├── tiers-section.tsx             client component for the 4-row tier editor
│   ├── rewards-section.tsx           client component for catalog CRUD
│   └── program-section.tsx           Enable toggle + earn rate + program name
├── customers/[id]/page.tsx           — modified: adds Loyalty card when is_member
└── bookings/[id]/page.tsx            — modified: replaces simple Mark Completed
                                        button with LoyaltyCompletionSection when
                                        customer is_member && org loyalty_enabled
```

No new top-level route. Loyalty surfaces inside surfaces staff already work in (settings, customer profile, booking detail) plus Koda. Sidebar gets no new entry.

### 3.2 Booking-completion data flow (the meaningful loop)

```
Staff opens /bookings/[id]
    ↓
1. Server reads: booking + customer + org config + active rewards
   + redemptions already applied to this booking (e.g. via Koda earlier).
    ↓
2. Branch:
   - If !customer.is_member OR !org.loyalty_enabled:
       Render existing simple "Mark completed" button.
       Click → transitionBookingAction({ next: 'completed' }).
   - Else:
       Render LoyaltyCompletionSection inline:
         · Member badge (tier + balance + progress)
         · Read-only "Already redeemed via Koda on this booking" list
         · "Bill total before reward discounts" Rp input (required)
         · "Redeem additional rewards" multi-select (filtered by tier + balance)
         · Live preview: "→ Earns +X · Net balance after: Y"
       Confirm button → completeBookingAction(booking_id, input)
    ↓
3. completeBookingAction (when loyalty path):
     a. Calls RPC public.complete_booking_with_loyalty(booking_id, bill_idr, redemption_ids[])
     b. RPC runs in ONE transaction:
        - validates booking state (confirmed | seated)
        - validates customer is member, org loyalty_enabled
        - validates each redemption (active, tier-allowed, balance sufficient)
        - inserts loyalty_transactions row (with snapshot earn rate)
        - inserts one loyalty_redemptions row per picked reward (with snapshot fields)
        - updates customers: balance += earned − redeemed; lifetime += earned;
          current_tier_id = derived from new lifetime
        - updates booking: status='completed', completed_at=now()
     c. Returns { points_earned, points_redeemed, new_balance, new_lifetime, new_tier_id }
    ↓
4. revalidatePath: /bookings, /bookings/[id], /customers/[id], /settings/loyalty
```

### 3.3 Pre-completion redemption (Koda path)

```
Customer asks Koda: "Saya mau pakai voucher dessert gratis besok"
    ↓
1. Koda calls get_loyalty_status() — sees customer is Gold, has 1,847 pts,
   "Free Dessert" reward exists at 200 pts and customer's tier qualifies.
    ↓
2. Koda confirms: "Booking besok jam 7? Boleh saya reserve dessert gratisnya?"
    ↓
3. Customer says yes → Koda calls redeem_reward(reward_id, booking_id_of_tomorrow)
    ↓
4. redeemRewardAction (server-side):
     - Validates booking is confirmed/seated and belongs to this customer
     - Validates reward eligibility (active, tier OK, balance OK)
     - Inserts loyalty_redemptions row: status='applied', booking_id=tomorrow's
     - Updates customers.points_balance -= reward.points_cost (NOT lifetime)
    ↓
5. When staff completes the booking tomorrow, the LoyaltyCompletionSection
   shows the dessert as a read-only "already redeemed" line; staff just
   enters the bill and confirms — no double-deduct.
```

### 3.4 Cancellation → automatic refund

When a booking with applied redemptions transitions to `cancelled`, all `loyalty_redemptions` on that booking flip from `applied` to `voided` (with `voided_reason = 'booking_cancelled'`) and `customers.points_balance` is refunded. Lifetime is unaffected. Implemented by extending the existing `transitionBookingAction({ next: 'cancelled' })` path — small addition since the action already knows the booking_id.

### 3.5 Multi-tenancy

Every new table carries `organization_id` + standard RLS:
- **SELECT**: anyone in org
- **INSERT/UPDATE/DELETE**: admin or front_desk for ledger tables; admin only for config (tiers, rewards, adjustments)

The atomic completion RPC runs as `SECURITY INVOKER`, so all underlying RLS policies validate org membership on every touched table. No SECURITY DEFINER footgun.

---

## 4. Database schema

### 4.1 New enum

```sql
create type public.loyalty_reward_type as enum (
  'free_item',
  'percent_discount',
  'rupiah_discount'
);
```

### 4.2 `loyalty_tiers`

```sql
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
```

Schema enforces exactly 4 tiers per tenant via the unique constraint on `(organization_id, tier_index)` combined with the `tier_index between 0 and 3` check. Tier 0 is the entry tier (defaults to "Bronze", threshold 0).

### 4.3 `loyalty_rewards`

```sql
create table public.loyalty_rewards (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  name text not null,
  description text,
  type public.loyalty_reward_type not null,
  type_value int not null default 0,    -- % for percent, IDR for rupiah, 0 for free_item
  points_cost int not null check (points_cost > 0),
  min_tier_index int not null default 0 check (min_tier_index between 0 and 3),
  is_active boolean not null default true,
  sort_order int not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index loyalty_rewards_org_active_idx
  on public.loyalty_rewards (organization_id, is_active, sort_order);
```

`type_value` is a unified int interpreted by `type`:
- `free_item` → 0 (ignored; the `name` carries the meaning, e.g. "Free dessert")
- `percent_discount` → percent (0–100)
- `rupiah_discount` → IDR amount

### 4.4 `loyalty_transactions` (earn ledger)

```sql
create table public.loyalty_transactions (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  customer_id uuid not null references public.customers(id) on delete cascade,
  booking_id uuid references public.bookings(id) on delete set null,
  bill_idr int not null check (bill_idr >= 0),
  points_earned int not null check (points_earned >= 0),
  earn_rate_idr_per_point int not null,         -- snapshot at earn time
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now()
);
create index loyalty_transactions_customer_idx
  on public.loyalty_transactions (customer_id, created_at desc);
create index loyalty_transactions_org_idx
  on public.loyalty_transactions (organization_id, created_at desc);
create index loyalty_transactions_booking_idx
  on public.loyalty_transactions (booking_id) where booking_id is not null;
```

Append-only. `earn_rate_idr_per_point` snapshotted so historical rows stay legible if admin changes the rate later. No UPDATE policy; rows can only be DELETEd by admin (for hard data deletes — extremely rare).

### 4.5 `loyalty_redemptions` (spend ledger)

```sql
create table public.loyalty_redemptions (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  customer_id uuid not null references public.customers(id) on delete cascade,
  reward_id uuid references public.loyalty_rewards(id) on delete set null,
  -- Snapshot of reward at redemption time (legible after catalog changes)
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
```

UPDATE allowed only for the `applied → voided` flip (status, voided_at, voided_reason). Enforced via policy WITH CHECK; tightening covered in §4.8.

### 4.6 `loyalty_adjustments` (manual admin gifts/deductions)

```sql
create table public.loyalty_adjustments (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  customer_id uuid not null references public.customers(id) on delete cascade,
  delta_points int not null,            -- positive = gift, negative = deduct
  reason text not null,
  affects_lifetime boolean not null default false,
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now()
);
create index loyalty_adjustments_customer_idx
  on public.loyalty_adjustments (customer_id, created_at desc);
create index loyalty_adjustments_org_idx
  on public.loyalty_adjustments (organization_id, created_at desc);
```

`affects_lifetime` defaults false: a gift shouldn't artificially bump tier. Admin can flip true for promotional bonuses where they explicitly want tier progress.

### 4.7 `customers` and `organizations` additions

```sql
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
```

`points_balance` and `points_lifetime` are denormalized for fast reads (customer profile, Koda system prompt, booking-completion preview). Writes only flow through the RPC + dedicated server actions, which keep these in sync with the ledgers.

### 4.8 RLS

| Table | SELECT | INSERT | UPDATE | DELETE |
|---|---|---|---|---|
| `loyalty_tiers` | anyone in org | admin only | admin only | admin only |
| `loyalty_rewards` | anyone in org | admin only | admin only | admin only |
| `loyalty_transactions` | anyone in org | admin/front_desk | none (immutable) | admin only |
| `loyalty_redemptions` | anyone in org | admin/front_desk | admin/front_desk (applied→voided only — enforced in WITH CHECK) | admin only |
| `loyalty_adjustments` | anyone in org | admin only | none (immutable) | admin only |

### 4.9 Default tier auto-seed

```sql
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

create trigger seed_loyalty_tiers_after_org_insert
  after insert on public.organizations
  for each row execute function public.seed_default_loyalty_tiers();

-- Backfill for existing orgs (Buranchi):
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

Seed happens once at org creation. Admin can rename/re-threshold later via `/settings/loyalty`. Trigger uses SECURITY DEFINER so it can write to `loyalty_tiers` even when the inserting role wouldn't otherwise have INSERT permission — since the trigger always owns the insert, this is safe.

### 4.10 Migration files

- `0020_phase5_loyalty_tables.sql` — enum + 5 tables + customer/org column additions + auto-seed trigger + RLS policies
- `0021_phase5_loyalty_rpc.sql` — `complete_booking_with_loyalty` PL/pgSQL function + grants
- `supabase/.dashboard-apply/phase-5.sql` — gitignored bundle for the corporate-network apply workflow

---

## 5. RPC: `complete_booking_with_loyalty`

The atomic write path. Server-side TypeScript validates input shape, then this RPC does all the database work in one transaction.

```sql
create or replace function public.complete_booking_with_loyalty(
  p_booking_id     uuid,
  p_bill_idr       int,
  p_redemption_ids uuid[]   -- reward IDs to redeem at this booking
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
  v_points_earned := floor(p_bill_idr / v_org.loyalty_earn_rate_idr_per_point);

  -- 3. Validate each requested redemption + sum cost
  for v_reward in
    select r.id, r.points_cost, r.min_tier_index, r.is_active, r.name, r.type, r.type_value
    from public.loyalty_rewards r
    where r.id = any(p_redemption_ids)
      and r.organization_id = v_booking.organization_id
  loop
    if not v_reward.is_active then
      raise exception 'reward_inactive: %', v_reward.name using errcode = 'P0001';
    end if;
    if (select tier_index from public.loyalty_tiers where id = v_customer.current_tier_id)
       < v_reward.min_tier_index then
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

Errors raised use `errcode = 'P0001'` (raise_exception) with message strings the server action translates to `ActionError` codes (`BOOKING_NOT_FOUND`, `INSUFFICIENT_BALANCE`, `REWARD_TIER_LOCKED`, etc.).

---

## 6. Server actions

### 6.1 `apps/web/lib/actions/loyalty-members.ts`

```ts
export async function enrollMemberAction(customerId: string)
  // requireRole(['admin', 'front_desk'])
  // sets is_member=true, member_since=now(), current_tier_id = tier_index 0 of org
  // revalidate /customers/[id]

export async function unenrollMemberAction(customerId: string)
  // requireRole(['admin'])
  // sets is_member=false, current_tier_id=null
  // KEEPS points_balance and points_lifetime intact (re-enroll restores tier from lifetime)
```

### 6.2 `apps/web/lib/actions/loyalty-tiers.ts`

```ts
const UpdateTierSchema = z.object({
  name: z.string().trim().min(1).max(40).optional(),
  min_points_lifetime: z.number().int().min(0).optional(),
  perks_text: z.string().trim().max(1000).optional().nullable(),
});

export async function updateTierAction(tierId: string, input: unknown)
  // requireRole(['admin'])
  // validates: tier_index 0 must keep min_points_lifetime = 0 (constraint)
  // validates: thresholds within an org are strictly increasing (read all 4, sort, check)
  // never INSERTs or DELETEs — there are always exactly 4 rows per org
  // revalidate /settings/loyalty
```

### 6.3 `apps/web/lib/actions/loyalty-rewards.ts`

Standard admin CRUD: `createRewardAction`, `updateRewardAction`, `deleteRewardAction`. Schemas validate `type_value` makes sense for `type` (e.g., percent_discount value must be 0–100; rupiah_discount value must be > 0).

### 6.4 `apps/web/lib/actions/loyalty-redeem.ts`

```ts
export async function redeemRewardAction(rewardId: string, bookingId: string)
  // Used by: Koda's redeem_reward tool, AND staff "Redeem now" button on customer profile
  // requireRole(['admin', 'front_desk'])
  // Loads booking → validates customer matches, status is confirmed|seated
  // Loads reward → validates active, tier-allowed, cost ≤ balance
  // Inserts loyalty_redemptions row (status='applied', booking_id set)
  // Updates customer: points_balance -= cost (lifetime unchanged)
  // revalidate /bookings/[id], /customers/[id]

export async function voidRedemptionAction(redemptionId: string, reason: string)
  // requireRole(['admin', 'front_desk'])
  // Loads redemption → must be status='applied'
  // Updates redemption: status='voided', voided_at=now(), voided_reason
  // Updates customer: points_balance += redemption.points_spent
  // Audit-friendly: row stays, just flagged

export async function adjustPointsAction(
  customerId: string,
  deltaPoints: number,
  reason: string,
  affectsLifetime: boolean = false,
)
  // requireRole(['admin'])
  // Inserts loyalty_adjustments row
  // Updates customer: points_balance += delta; if affectsLifetime, points_lifetime += delta (and recompute tier)
  // Validates: balance won't go negative
  // revalidate /customers/[id]
```

### 6.5 Modified `apps/web/lib/actions/bookings.ts`

A new `completeBookingAction(bookingId, input)` wraps the existing `transitionBookingAction` for the `next='completed'` case. The Phase 2 action signature stays the same for non-completion transitions; this is only invoked when the UI is moving a booking to completed.

```ts
const CompleteBookingSchema = z.object({
  bill_idr: z.number().int().min(0).optional(),
  reward_redemption_ids: z.array(z.string().uuid()).optional().default([]),
});

export async function completeBookingAction(bookingId: string, input: unknown) {
  await requireRole(['admin', 'front_desk']);
  const parsed = CompleteBookingSchema.parse(input);
  const supabase = await createServerClient();

  // Load enough to decide: is this a loyalty path?
  const { data } = await supabase
    .from('bookings')
    .select('id, organization_id, customer_id, status, customer:customers(is_member), org:organizations(loyalty_enabled)')
    .eq('id', bookingId).single();

  const useLoyalty =
    parsed.bill_idr !== undefined &&
    data?.customer.is_member === true &&
    data?.org.loyalty_enabled === true;

  if (!useLoyalty) {
    // Fall through to existing behavior — Phase 2 action handles the state machine
    return transitionBookingAction(bookingId, { next: 'completed' });
  }

  // Loyalty path — single atomic RPC
  const { data: result, error } = await supabase.rpc('complete_booking_with_loyalty', {
    p_booking_id: bookingId,
    p_bill_idr: parsed.bill_idr!,
    p_redemption_ids: parsed.reward_redemption_ids,
  } as never);
  if (error) throw mapRpcError(error);

  revalidatePath(`/bookings/${bookingId}`);
  revalidatePath('/bookings');
  revalidatePath(`/customers/${data!.customer_id}`);
  return result;
}
```

### 6.6 Cancel-with-redemption-refund path

Modify `transitionBookingAction({ next: 'cancelled' })` to also void any `loyalty_redemptions` on the booking and refund points. Implementation: a small extension that runs before the booking status update, fires a `loyalty-redeem.voidRedemptionAction` for each `applied` redemption attached to this booking, with `reason='booking_cancelled'`.

---

## 7. Koda integration

Two new tools added to `apps/web/lib/koda/tools.ts`:

```ts
{
  name: 'get_loyalty_status',
  description: "Get the current customer's loyalty status: membership, tier, balance, lifetime, eligible rewards (filtered to currently-redeemable), and tier perks. Use when the customer asks about their points/tier/rewards.",
  parameters: { type: 'object', properties: {}, required: [] },
}

{
  name: 'redeem_reward',
  description: 'Reserve a reward for the customer at one of their upcoming bookings. Deducts points immediately and attaches the redemption to the booking. Confirm the reward and the specific booking with the customer before calling. Only call when the customer explicitly asks.',
  parameters: {
    type: 'object',
    properties: {
      reward_id:  { type: 'string' },
      booking_id: { type: 'string' },
    },
    required: ['reward_id', 'booking_id'],
  },
}
```

Both wrap the corresponding server actions via the engine's `hooks` interface (`getLoyaltyStatus`, `redeemReward`).

### System prompt addition

When `customer.is_member && org.loyalty_enabled`, append a Loyalty block to the system prompt:

```
# Loyalty (this customer)
- Status: {tier_name} member · {balance} pts · {to_next} pts to {next_tier_name}
- Rewards eligible right now (cheapest first):
  · {reward_name} — {points_cost} pts · {type_summary}
  · ...
- Tier perks: {perks_text or "(none configured)"}
- DO NOT push redemptions; only mention if customer asks or if it would be
  contextually helpful to acknowledge their tier (e.g. they say "I'm a regular here").
```

When loyalty is disabled or customer is not a member, the section reads simply:
*"This customer is not enrolled in {program_name}. Don't bring up loyalty unless they ask."*

Token budget impact: ~150 input tokens when the block is present (well under our existing 4K cap).

---

## 8. Routes & UI

### 8.1 New route: `/settings/loyalty`

Admin-only. 5 sections:

1. **Identity** (read-only): *"Loyalty for {org_name} · Powered by Meta-Koda"*.
2. **Program**: Enable toggle · Program name (e.g. "Buranchi Rewards") · Earn rate (Rp per point, default 10,000).
3. **Tiers**: 4 rows pre-seeded, edit-only. Each row: tier index (read-only), name, min_points_lifetime (validated: increasing), perks_text textarea.
4. **Rewards**: catalog CRUD. Type-aware row form (free_item shows just name+cost; percent_discount adds % field; rupiah_discount adds Rp field). Min-tier dropdown populated from tier rows.
5. **Activity**: 3 stat cards — *Members today/week/all-time*, *Points earned (7d)*, *Points redeemed (7d)* — and a small "Top rewards by redemption count (30d)" list.

### 8.2 Modified `/customers/[id]`

Above existing booking history section, render a **Loyalty card** when `is_member && loyalty_enabled`:

```
┌────────────────────────────────────────────────────────────────┐
│  Loyalty                                                         │
│                                                                  │
│ Tier: Gold · Member since Mar 12, 2026                          │
│                                                                  │
│ 1,847 points · 153 to Platinum                                  │
│ ▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓░░  92%                                       │
│                                                                  │
│ Lifetime earned: 2,140                                           │
│                                                                  │
│ Tier perks: Priority weekend booking. Complimentary amuse.       │
│                                                                  │
│ [ Manual adjustment ]   [ View ledger ]                          │
└────────────────────────────────────────────────────────────────┘
```

When `!is_member`: smaller card with *"{Name} is not a member of {Program Name}"* + an "Enroll" button. One click triggers `enrollMemberAction`.

### 8.3 Modified `/bookings/[id]`

When the staff is about to mark this booking completed AND the customer is a member AND loyalty is enabled, the existing simple Mark-Completed button is replaced by the `LoyaltyCompletionSection`:

```
┌─ Complete booking ──────────────────────────────────────────────┐
│ Andini · Gold · 1,847 pts · 153 to Platinum                     │
│                                                                  │
│ Already redeemed via Koda on this booking (read-only):          │
│   ✓ Free dessert (−200 pts, redeemed yesterday by Koda)          │
│                                                                  │
│ Bill total before any reward discounts (Rp) *                    │
│ [           250,000          ]                                   │
│                                                                  │
│ Redeem additional rewards (optional):                            │
│   ○ 10% off bill         500 pts                                 │
│   ○ Rp 50,000 off       1,000 pts                                │
│   ◌ Free wine bottle    1,500 pts  (insufficient balance)        │
│                                                                  │
│ → Earns +25 points · Net balance after this booking: 1,672      │
│                                                                  │
│ [ Cancel ]                              [ Confirm completion ]   │
└────────────────────────────────────────────────────────────────┘
```

The "→ Earns ... Net balance" line updates client-side from the bill input + currently-selected redemption checkboxes, so staff see the result before confirming.

### 8.4 Settings index update

`/settings` admin section gains one row between Tables and Koda AI assistant:

```
Organization profile · Tables · Loyalty program · Koda AI assistant · Manage team
```

### 8.5 Sidebar

No new top-level sidebar item. Loyalty is configured under Settings, surfaces inline in customer + booking + Koda contexts.

---

## 9. Acceptance criteria

10 things that must work before v1 ships:

1. Admin opens `/settings/loyalty` → toggles **Enable loyalty** ON → 4 default tiers (Bronze/Silver/Gold/Platinum at 0/500/2000/5000) appear pre-seeded → admin renames Silver to "Mid-tier" and changes threshold to 750 → Save persists; customer profiles re-render with the new tier name.
2. Admin adds 3 rewards: "Free dessert" 200 pts free_item; "10% off bill" 500 pts percent_discount=10; "Rp 100k off" 1,500 pts rupiah_discount=100000. All visible in catalog; admin can mark inactive/active.
3. Admin opens `/customers/[id]` for "Andini" → toggles **Member** ON → card flips to *Bronze · 0 points · 500 to Mid-tier* → `is_member=true`, `member_since=now()`, `current_tier_id=Bronze` in DB.
4. Staff completes a booking for Andini, enters bill = **Rp 250,000**, no redemptions selected → booking transitions confirmed→completed, `points_earned=25`, `points_balance=25`, `points_lifetime=25`, tier stays Bronze.
5. Staff completes a second booking with bill = **Rp 7,500,000** → `points_earned=750` → balance=775, lifetime=775, **tier promotes to Mid-tier** → customer card reflects the new tier.
6. Staff completes a booking and selects "Free dessert" → redemption row inserted, `points_balance -= 200`, `points_lifetime` unchanged.
7. Insufficient-balance redemption attempt → RPC raises `insufficient_balance` → UI shows clear error; no DB rows changed (transaction atomicity).
8. Tier-locked redemption attempt (Bronze member tries Gold-tier reward) → RPC raises `reward_tier_locked: <name>` → UI shows error.
9. `transitionBookingAction({next: 'cancelled'})` on a booking with applied redemptions → all redemptions on that booking flip to `voided`, points refunded to balance, audit trail intact (lifetime unaffected).
10. Koda simulator: customer = Andini (Mid-tier, 775 points) → ask *"Berapa poin saya?"* → Koda calls `get_loyalty_status`, replies with status. Then *"Saya mau pakai dessert gratis besok ya"* → Koda confirms which booking → Koda calls `redeem_reward(reward_id, booking_id)` → redemption row appears on tomorrow's booking with `status='applied'`, balance immediately deducted.

---

## 10. Phase bridge

- **Phase 3 (WhatsApp)** — Koda's `get_loyalty_status` and `redeem_reward` tools work identically over WhatsApp. No engine change; the channel adapter brings them along for free.
- **Phase 6 (Marketing Blast)** — campaign builder gains a "Tier filter" (Bronze+, Silver+, Gold+, Platinum) by reading `customers.current_tier_id`. The schema supports it natively.
- **Phase 5 v2** (deferred): points expiration policy, annual tier reset, refer-a-friend, birthday/anniversary auto-bonuses, tier-targeted promotion templates beyond `perks_text`, POS integration, customer self-service enrollment via Koda.

---

## 11. Testing

### 11.1 Unit (`apps/web/lib/loyalty/`)

- `tier.test.ts` — `deriveTier` cases:
  - 0 lifetime → tier 0 (Bronze)
  - threshold − 1 → previous tier
  - threshold exact match → that tier
  - threshold + 1 → that tier
  - lifetime above max threshold → top tier
  - works with renamed tiers (no name dependency)
- `earn.test.ts` — `computePointsForBill`:
  - 0 bill → 0
  - bill < earn rate → 0 (rounds down)
  - bill = exactly earn rate → 1
  - large bill → correct integer division
  - negative bill → 0 (defensive)
  - earn_rate ≤ 0 → 0 (defensive)

### 11.2 Engine integration (mocked OpenAI)

`apps/web/lib/koda/engine.test.ts` gains:
- Customer asks for status → mocked OpenAI returns `get_loyalty_status` tool call → engine resolves via hook → final reply contains tier + balance.
- Customer asks for redemption → mocked sequence: `get_loyalty_status` → confirmation reply → `redeem_reward` → final reply confirming reservation.

### 11.3 RPC tests (`supabase/tests/phase5-loyalty-rpc.test.ts`)

- Happy path: member + valid bill + valid redemptions → all 4 row mutations land in one transaction; returns expected JSON.
- `customer_not_member` raised when member flag false.
- `loyalty_disabled` raised when org flag false.
- `insufficient_balance` raised when redemption total > balance — verifies NO partial writes (transaction atomicity).
- `reward_tier_locked` raised when min_tier_index > customer's tier.
- `booking_not_completable` raised when booking status is not in (confirmed, seated).
- Cross-tenant call: org A admin tries to complete org B's booking → RLS prevents the SELECT in step 1 → `booking_not_found`.

### 11.4 RLS tests (`supabase/tests/phase5-rls.test.ts`)

5 new tables × cross-tenant + role-gated:
- `loyalty_tiers`: front_desk cannot UPDATE (admin only); cross-tenant SELECT returns 0 rows.
- `loyalty_rewards`: same as tiers.
- `loyalty_transactions`: front_desk CAN insert; UPDATE policy is absent (rows immutable except by superuser).
- `loyalty_redemptions`: front_desk can INSERT and can UPDATE for `applied → voided` flip; cross-tenant blocked.
- `loyalty_adjustments`: only admin can INSERT; rows immutable after.

### 11.5 Live OpenAI tests (gated)

Add to the existing nightly-only set:
- "Berapa poin saya?" against a member fixture → assert reply contains tier name and balance.
- "Bisa pakai dessert gratis besok?" against a member with sufficient points + an upcoming booking → assert `redeem_reward` tool was called with the right reward_id and booking_id.

---

## 12. Out of scope for v1

Tracked here so we don't pull them in:

- **Points expiration / annual reset** — points live forever in v1.
- **Refer-a-friend / referral bonuses.**
- **Birthday/anniversary auto-bonuses** — admin can use manual adjustment.
- **Per-reward usage caps** — *"Free dessert can only be redeemed 3 times per year"*.
- **Tier-targeted promotion templates** beyond the per-tier `perks_text` field.
- **POS integration** — manual bill entry only; tenant types it during completion.
- **Customer self-service enrollment** — staff toggle only. Koda self-enroll is Phase 3 polish.
- **Multi-currency / non-IDR.**
- **Cross-tenant loyalty** — a Buranchi member is NOT a member at restaurant 2; every tenant has its own program.
- **Offline / queued earn** — if the bill amount needs editing later, admin uses `adjustPointsAction` rather than re-completing the booking.
- **Catalog versioning** — when admin changes a reward, the snapshot on existing redemptions persists, but there's no formal "v1 / v2" of a reward.
- **Proactive Koda reminders** — sending the customer a 1-day-before reminder and a 30-minutes-before confirmation (with 15-minute window before auto-release) is a separate **Phase 4.5 — Koda Proactive Layer** that introduces a scheduler, outbound messaging templates (Meta-approved on the WhatsApp side, blocking on Phase 3), and a `confirmation_pending` booking sub-state with timeout-based auto-cancellation. Tracked separately so Phase 5 stays focused on points/tier mechanics.

---

## 13. Migrations & dashboard apply

Following the corporate-network workflow established in Phases 1–4:

- `supabase/migrations/0020_phase5_loyalty_tables.sql` — committed
- `supabase/migrations/0021_phase5_loyalty_rpc.sql` — committed
- `supabase/.dashboard-apply/phase-5.sql` — gitignored bundle for paste-into-SQL-editor

Verification block after apply:

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

-- Customers table has 5 new columns
select column_name from information_schema.columns
where table_schema='public' and table_name='customers'
  and column_name in ('is_member','member_since','points_balance','points_lifetime','current_tier_id');
-- Expected: 5 rows

-- Organizations has 3 loyalty config columns
select column_name from information_schema.columns
where table_schema='public' and table_name='organizations'
  and column_name in ('loyalty_enabled','loyalty_program_name','loyalty_earn_rate_idr_per_point');
-- Expected: 3 rows

-- Buranchi has 4 default tiers seeded
select tier_index, name, min_points_lifetime
from public.loyalty_tiers
where organization_id = (select id from public.organizations where slug='buranchi')
order by tier_index;
-- Expected: 4 rows: Bronze 0 / Silver 500 / Gold 2000 / Platinum 5000

-- RPC exists and authenticated can call it
select proname from pg_proc where proname='complete_booking_with_loyalty';
-- Expected: 1 row

-- Migration tracker
select version, name from supabase_migrations.schema_migrations
where version in ('0020','0021') order by version;
-- Expected: 2 rows
```

---

## 14. References

- **Decisions log:** §2 above (captures the 11 product/architectural choices made during brainstorming).
- **Brainstorm transcript:** chat history 2026-04-29.
- **Phase 2 spec** (booking lifecycle the loyalty path hooks into): `docs/superpowers/specs/2026-04-29-phase-2-booking-flooring-design.md`
- **Phase 4 spec** (Koda — gains 2 new tools): `docs/superpowers/specs/2026-04-29-phase-4-koda-design.md`
- **Phase 4 README** (operational runbook for Koda — will gain a loyalty tools section after Phase 5): `docs/phase-4/README.md`
- **Memory:** product naming (`memory/product_naming.md`) — reminds future agents that Meta-Koda is the product; Buranchi is one tenant.
