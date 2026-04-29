# Phase 4 — Koda (AI Agent) Design Spec

**Status:** Approved (2026-04-29)
**Author:** Marchelino Gifensius (Metaseti Digital Indonesia)
**Phase:** 4 of 7 (per original Buranchi Koda blueprint)
**Depends on:** Phase 1 (foundation), Phase 2 (booking + flooring) — both shipped.
**Unblocks:** Phase 3 WhatsApp adapter (channel-agnostic engine reused) and Phase 5/6 (loyalty tools, marketing outbound).

---

## 1. Goal

Build **Koda** — a customer-facing AI booking concierge — as a tenant-scoped, channel-agnostic agent that ships first into a dashboard simulator (testable while Meta verification is in progress for Phase 3), then plugs into WhatsApp via a thin channel adapter when Phase 3 completes.

Koda handles the three things 85–90% of inbound restaurant messages are about:
1. **Booking lifecycle** — create, modify, cancel.
2. **FAQ** — hours, address, parking, dress code, menu link, etc.
3. **Soft upsell** — at most once per conversation, mention a current special if contextually fitting.

Out of scope for v1: complaints/refunds (escalated immediately), seating/no-show (physical events handled by staff), outbound marketing (Phase 6).

---

## 2. Decisions log

These are the product/architectural choices made during brainstorming. They define v1.

| # | Decision | Choice |
|---|---|---|
| 1 | Primary user | Customer-facing booking concierge |
| 2 | First surface | Dashboard simulator now; WhatsApp later via Phase 3 channel adapter |
| 3 | Conversation scope | Bookings + FAQ + soft upsell |
| 4 | Agency | Autonomous with smart escalation (sentiment, keywords, low confidence, loop detection) |
| 5 | Persona | Named — **Koda** (Metaseti-branded, multi-tenant) |
| 6 | Action scope | Liberal — Koda creates, modifies, AND cancels bookings autonomously; can write customer notes via audit trail |
| 7 | Architecture | Single OpenAI call per turn with tool definitions (function-calling), GPT-4o-mini |

---

## 3. Architecture

### 3.1 Components

```
apps/web/lib/koda/
├── engine.ts        # runTurn(conversationId, userMessage) — main entry point
├── tools.ts         # executeTool(tool_call, ctx) — wraps Phase 1/2 server actions + reads
├── prompt.ts        # buildSystemPrompt(ctx) — assembles tenant + customer context
├── guard.ts         # pre-turn + post-turn escalation triggers
└── openai.ts        # OpenAI client wrapper (retry, cost tracking, streaming)

apps/web/lib/actions/
├── koda.ts          # sendMessage, takeOver, resolve, escalate
├── koda-faq.ts      # admin CRUD for FAQ entries
└── koda-specials.ts # admin CRUD for specials

apps/web/app/(app)/
├── koda/
│   ├── page.tsx                  # Inbox (active / escalated / resolved)
│   ├── [conversationId]/page.tsx # Transcript + take-over
│   └── simulator/page.tsx        # Staff role-play surface
├── settings/koda/
│   ├── page.tsx                  # Identity + FAQ + Specials + Limits + Activity
│   ├── faq-list.tsx              # CRUD + drag-reorder
│   └── specials-list.tsx         # CRUD + date pickers
└── customers/
    └── notes-review/page.tsx     # Unverified Koda-written notes inbox
```

### 3.2 Turn data flow

```
Customer message arrives (simulator typing OR whatsapp webhook adapter)
    ↓
1. Persist user message → koda_messages (role='user')
    ↓
2. Pre-turn guard scans for trigger keywords (manager, human, kompain, refund...)
   → if triggered: flip status to 'escalated', return canned reply, skip LLM
    ↓
3. Build context:
     - System prompt (Koda identity + tenant info + customer history + booking rules + FAQ + specials)
     - Last ~10 messages (older summarized into a single bullet block when token cap approached)
     - 7 tool definitions (see §5)
    ↓
4. OpenAI chat-completion call (gpt-4o-mini, temperature 0.4, max 4K input tokens)
    ↓
5. If response has tool_calls:
     - Execute each tool via executeTool() — wraps existing server actions
     - Append tool result rows → koda_messages (role='tool')
     - Loop back to OpenAI with tool results
   - Max 4 tool-call iterations per turn (loop guard)
   Else: take the natural text reply
    ↓
6. Post-turn guard:
     - Low-confidence phrasing detection → flip to escalated
     - LLM called escalate_to_staff → already there, persist reason
     - Same write-tool with same args twice → escalate
    ↓
7. Persist assistant message → koda_messages (role='assistant', tool_calls in jsonb,
   token counts captured for cost reporting)
    ↓
8. revalidatePath('/koda') and `/koda/[conversationId]` so live inbox updates
    ↓
9. Return reply to channel adapter → render in simulator / send via WhatsApp BSP
```

### 3.3 Channel adapters

The engine is channel-agnostic. Adapters are thin shims:

- **`simulator`** (v1) — staff types in the dashboard panel, response renders inline with streaming.
- **`whatsapp`** (Phase 3) — webhook receives → maps WABA phone to `customers.phone` (creates customer if not found) → upserts open `koda_conversations` row → calls `runTurn()` → sends reply back via BSP.
- **`web`** (deferred to Phase 6) — public widget on Buranchi's marketing site.

### 3.4 Cost & latency profile (GPT-4o-mini, Indonesia)

- Per turn: ~800–1,200 input tokens, ~200–500 output tokens
- Per turn cost: **~$0.0003 ≈ Rp 5**
- Per 10-turn conversation: **~Rp 50**
- Latency p50: ~700ms (streaming makes it feel instant)
- A 50-conversation/day restaurant: **Rp 2,500/day = Rp 75,000/month** in OpenAI fees. Effectively rounding error vs. subscription pricing.

---

## 4. Database schema

Five new tables, all `organization_id`-scoped, all RLS-enabled following Phase 1/2 patterns.

### 4.1 `koda_conversations`

```sql
create table public.koda_conversations (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  customer_id uuid references public.customers(id) on delete set null,
  channel text not null check (channel in ('simulator', 'whatsapp', 'web')),
  status text not null check (status in ('active', 'escalated', 'resolved', 'closed')) default 'active',
  escalated_reason text,
  taken_over_by uuid references public.profiles(id) on delete set null,
  taken_over_at timestamptz,
  last_message_at timestamptz not null default now(),
  total_input_tokens int not null default 0,
  total_output_tokens int not null default 0,
  total_tool_calls int not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index koda_conversations_org_idx on public.koda_conversations (organization_id);
create index koda_conversations_status_idx on public.koda_conversations (organization_id, status, last_message_at desc);
create index koda_conversations_customer_idx on public.koda_conversations (customer_id);
```

**Why `customer_id` is nullable:** simulator allows "anonymous diner" mode; WhatsApp messages from unknown phone numbers start anonymous until Koda asks for the customer's name.

**Why denormalize token counts:** fast cost reporting per conversation without aggregating millions of `koda_messages` rows.

### 4.2 `koda_messages`

```sql
create table public.koda_messages (
  id uuid primary key default gen_random_uuid(),
  conversation_id uuid not null references public.koda_conversations(id) on delete cascade,
  role text not null check (role in ('user', 'assistant', 'tool', 'system', 'staff')),
  content text not null,
  tool_calls jsonb,
  tool_name text,
  staff_id uuid references public.profiles(id) on delete set null,
  input_tokens int,
  output_tokens int,
  model text,
  created_at timestamptz not null default now()
);

create index koda_messages_conversation_idx on public.koda_messages (conversation_id, created_at);
```

**Roles explained:**
- `user` — customer's incoming message
- `assistant` — Koda's reply (`tool_calls` jsonb captures which tools it invoked)
- `tool` — result row produced by a tool execution (`tool_name` set)
- `system` — canned system events (auto-escalation messages, take-over notifications)
- `staff` — manual reply by a human after take-over (`staff_id` set)

### 4.3 `koda_faq`

```sql
create table public.koda_faq (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  question text not null,
  answer text not null,
  is_active boolean not null default true,
  sort_order int not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index koda_faq_org_idx on public.koda_faq (organization_id, is_active, sort_order);
```

### 4.4 `koda_specials`

```sql
create table public.koda_specials (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  title text not null,
  description text,
  starts_on date,
  ends_on date,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint koda_specials_dates_check check (ends_on is null or starts_on is null or ends_on >= starts_on)
);

create index koda_specials_org_active_idx on public.koda_specials (organization_id, is_active);
```

`starts_on`/`ends_on` nullable: an "always-on" special (e.g. "vegetarian menu available daily") sets both to null. A scheduled brunch special sets both.

### 4.5 `customer_notes`

```sql
create table public.customer_notes (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  customer_id uuid not null references public.customers(id) on delete cascade,
  note text not null,
  source text not null check (source in ('koda', 'staff')),
  source_conversation_id uuid references public.koda_conversations(id) on delete set null,
  verified_by uuid references public.profiles(id) on delete set null,
  verified_at timestamptz,
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now()
);

create index customer_notes_customer_idx on public.customer_notes (customer_id, created_at desc);
create index customer_notes_unverified_idx on public.customer_notes (organization_id, verified_at)
  where source = 'koda' and verified_at is null;
```

**Generic, not Koda-specific.** Staff-written notes (manual additions on customer profile) also live here; the `source` enum distinguishes them. UI shows a unified timeline on the customer profile, with AI-written unverified notes flagged.

### 4.6 RLS policies (all 5 tables)

Mirror Phase 1/2 patterns — every table:

```sql
alter table public.<table> enable row level security;

-- SELECT: anyone in same org
create policy "<table> select in own org"
  on public.<table> for select
  using (organization_id = public.get_my_org_id());
```

Per-table writes:

| Table | INSERT/UPDATE | DELETE |
|---|---|---|
| `koda_conversations` | admin or front_desk | admin |
| `koda_messages` | admin or front_desk | admin |
| `koda_faq` | admin only | admin only |
| `koda_specials` | admin only | admin only |
| `customer_notes` | admin or front_desk (UPDATE used for `verified_by` flip) | admin |

**Phase 3 service-role usage:** the WhatsApp webhook handler uses a service-role Supabase client (bypasses RLS) since there's no logged-in user session. This is acceptable because the handler validates BSP HMAC signatures before any DB write. The simulator path runs under the staff's authenticated session and respects RLS normally.

### 4.7 Migration files

- `0011_phase4_koda_tables.sql` — all 5 tables, indexes, triggers (`set_updated_at`), RLS policies
- `supabase/.dashboard-apply/phase-4.sql` — gitignored bundle for the corporate-network workflow

---

## 5. Tool surface

Seven tools. Names and signatures stable for Phase 5/6 extension.

### 5.1 Read tools

```ts
// 1. check_availability
{
  name: 'check_availability',
  description: 'Get the list of currently free tables that fit a party size for a given start time. Use before create_booking when no specific table has been requested.',
  parameters: {
    starts_at: { type: 'string', format: 'date-time', description: 'ISO 8601 UTC' },
    party_size: { type: 'integer', minimum: 1, maximum: 50 },
  },
}
// Wraps: Phase 2 getAvailableTablesForSlot
// Returns: { tables: [{ id, code, capacity, floor_area }] }

// 2. find_customer_booking
{
  name: 'find_customer_booking',
  description: 'Look up the current customer\'s upcoming or recent bookings. Use when customer wants to modify or cancel an existing booking and you need to find which one.',
  parameters: {
    date_hint: { type: 'string', description: 'Optional: a date or relative phrase the customer mentioned (e.g. "Tuesday", "tomorrow", "next week"). Leave empty to get all upcoming + last 7 days.' },
  },
}
// Returns: { bookings: [{ id, starts_at, party_size, table_code, status }] }
```

### 5.2 Write tools (booking lifecycle)

```ts
// 3. create_booking
{
  name: 'create_booking',
  description: 'Create a confirmed booking. Either customer_id (existing) OR customer_full_name (new customer) is required. If new customer, customer_phone is recommended.',
  parameters: {
    customer_id: { type: 'string', format: 'uuid', description: 'Use when the customer is already known.' },
    customer_full_name: { type: 'string', description: 'Use when creating a new customer record.' },
    customer_phone: { type: 'string', description: 'Optional, attaches to new customer.' },
    table_id: { type: 'string', format: 'uuid', description: 'Required. Get from check_availability.' },
    starts_at: { type: 'string', format: 'date-time' },
    party_size: { type: 'integer', minimum: 1, maximum: 50 },
    special_request: { type: 'string', description: 'Allergies, anniversary, window seat, etc.' },
  },
}
// Wraps: Phase 2 createBookingAction (or createWalkInAction shape for new-customer flow)
// Returns: { booking_id, confirmation_summary } OR { error: 'BOOKING_CONFLICT', message }

// 4. modify_booking
{
  name: 'modify_booking',
  description: 'Update an existing booking. Cannot reassign table for seated bookings. Cannot edit completed/cancelled/no-show bookings.',
  parameters: {
    booking_id: { type: 'string', format: 'uuid' },
    starts_at: { type: 'string', format: 'date-time' },
    party_size: { type: 'integer', minimum: 1, maximum: 50 },
    table_id: { type: 'string', format: 'uuid' },
    special_request: { type: 'string' },
  },
}
// Wraps: Phase 2 updateBookingAction
// Returns: { booking_id, updated_summary } OR { error: 'IMMUTABLE' | 'TABLE_LOCKED' | 'BOOKING_CONFLICT', message }

// 5. cancel_booking
{
  name: 'cancel_booking',
  description: 'Cancel a booking with optional reason. Confirm with the customer before calling.',
  parameters: {
    booking_id: { type: 'string', format: 'uuid' },
    reason: { type: 'string', description: 'Customer-stated reason — paste verbatim.' },
  },
}
// Wraps: Phase 2 transitionBookingAction({ next: 'cancelled', reason })
// Returns: { booking_id, cancelled_at } OR { error, message }
```

### 5.3 Customer note tool

```ts
// 6. add_customer_note
{
  name: 'add_customer_note',
  description: 'Save a fact about the customer that staff would want to remember. Use ONLY when the customer explicitly tells you something they want remembered (allergies, dietary preferences, occasions, accessibility needs). The note is unverified until staff approves it.',
  parameters: {
    note: { type: 'string', maxLength: 500, description: 'Concise, factual. Example: "Allergic to peanuts and shellfish".' },
  },
}
// Wraps: new addCustomerNoteAction → inserts customer_notes with source='koda', source_conversation_id=ctx.conversation_id
// Returns: { note_id }
```

### 5.4 Control flow tool

```ts
// 7. escalate_to_staff
{
  name: 'escalate_to_staff',
  description: 'Hand off this conversation to a human staff member. Use when: customer asks for a human/manager; customer is upset, complaining, or asking for refund; you are not confident; same issue persists 3+ turns; anything outside your defined scope.',
  parameters: {
    reason: { type: 'string', description: 'Why you are escalating, in 1 sentence.' },
  },
}
// Wraps: new escalateConversationAction
// Returns: { escalated: true }
```

### 5.5 Tools deliberately NOT created (baked into system prompt instead)

- **FAQ entries** — for typical 5–30 entries per restaurant, including all active rows in the system prompt is cheaper and lower latency than a tool roundtrip. Add FTS + `search_faq` tool in v2 if a tenant has 200+ entries.
- **Specials** — same reasoning. Active specials inlined in system prompt.
- **Customer history** — when the conversation has a known `customer_id`, the system prompt already includes their last 3 bookings + verified notes. No need for a tool.
- **Operating hours / address / dress code / cuisine type** — also in the system prompt from `organizations` row.

---

## 6. System prompt template

Built per turn from tenant + customer context. Token estimate: 800–1,200 input tokens.

```
You are Koda, the booking assistant for {restaurant_name}.
Today is {date_long} ({iso}). Local time: {time} in {timezone}.

# Identity & voice
- Your name is Koda. You are powered by Buranchi Koda (Metaseti Digital Indonesia).
- If asked, you are an AI assistant. Don't pretend to be human.
- Mirror the customer's language and register exactly: formal Bahasa, casual gaul,
  English, code-switching. Match their energy.
- Warm, concise, helpful. One question at a time. ≤1 emoji per reply.

# What you can do
- Check availability; create, modify, or cancel bookings.
- Answer questions from the FAQ below.
- Mention current specials when contextually relevant — at most ONCE per
  conversation, never as the first reply.
- Save customer facts (allergies, preferences) via add_customer_note when they
  explicitly tell you.

# What you do NOT do
- Don't mark bookings seated/completed/no-show — staff handles physical events.
- Don't invent facts. If you don't know, escalate.
- Don't push specials. Mention once, gracefully.
- Don't handle complaints, refunds, or disputes — escalate immediately.

# Booking rules
- Hours: {operating_hours_summary}
- Min advance: 60 min. Max advance: 90 days. Default duration: 120 min.
- Party size: 1–50.
- If create_booking returns BOOKING_CONFLICT, propose another time/table.

# Customer
{when known: Name, Phone, Last 3 bookings summary, Verified notes}
{when unknown: "Customer not yet identified. Ask their name early in the conversation."}

# Restaurant info
- Address: {address}

# FAQ
{numbered list of active koda_faq entries — Q + A}

# Current specials
{numbered list of active koda_specials — title, description, dates}

# When to escalate
Call escalate_to_staff(reason) when:
- Customer asks for a human/manager/staff
- Customer is upset, complaining, or asking for refund
- You're not confident after 1 retry
- Same issue persists 3+ turns
- Anything outside your scope above
```

---

## 7. Guardrails

### 7.1 Pre-turn guard

Runs before the LLM call. Skips the LLM entirely (cost saving) when matching a hard-trigger.

**Trigger keywords** (case-insensitive, multi-language regex):
- English: `\b(manager|human|real person|staff member|live agent)\b`
- Bahasa: `\b(manusia|petugas|orang asli|customer service|cs)\b`
- Complaint terms: `\b(complain|kompain|kecewa|complaint|refund|kembalikan uang|tidak puas|disgusted)\b`

**Action when matched:**
1. Insert system message → `koda_messages` (role='system', content='Auto-escalation triggered: {pattern}')
2. Update conversation: `status='escalated', escalated_reason='Trigger matched: {category}'`
3. Return canned reply in the customer's last detected language:
   - Bahasa default: *"Saya panggilkan staff Buranchi sekarang ya. Mohon tunggu sebentar 🙏"*
   - English fallback: *"I'll connect you with a Buranchi staff member right away. Please hold on 🙏"*
4. revalidatePath('/koda')

### 7.2 Post-turn guard

Runs on the LLM response after each turn.

- **Low-confidence phrases** (regex on assistant content): `\b(I'?m not sure|I don'?t know|tidak yakin|kurang tahu|saya kurang paham|cannot determine|unable to)\b` → flip status to `escalated`
- **Explicit escalation:** LLM called `escalate_to_staff` → already in `escalated`, persist the reason
- **Loop detection:** same write tool with same args called twice within a turn → escalate (loop bug or model confusion)

### 7.3 Cost & abuse guards

- **Daily message cap per tenant.** Default 500/day, configurable in `/settings/koda`. Counter is `count(*) from koda_messages where role='user' and created_at >= today_start_in_tenant_tz` — checked before each turn. When exceeded: simulator + WhatsApp adapter return canned response *"Today's AI quota reached. A staff member will reply shortly."* — no LLM call.
- **Tool-call iteration cap:** 4 max per turn. Hitting it auto-escalates.
- **Per-conversation user-message rate:** 30/min max (basic spam protection).
- **Per-tenant new-conversation rate:** 50/min max (DDoS protection — most relevant once Phase 3 WhatsApp is live).
- **Token cap:** 4,000 input tokens. When the assembled prompt exceeds, older messages get summarized into a single bullet block in the system prompt before the call.

### 7.4 Take-over semantics

When staff clicks "Take over" on a conversation:
1. Update: `taken_over_by = current_user_id`, `taken_over_at = now()`
2. Insert system message: `role='system', content='Marchelino took over the conversation'`
3. Subsequent customer messages: engine checks `taken_over_by IS NOT NULL` → does NOT call LLM, just persists the user message and lets staff reply manually
4. Staff replies persist as `role='staff', staff_id=<>, content=<text>`

To return to Koda autonomy: staff explicitly clicks "Hand back to Koda" — clears `taken_over_by`/`taken_over_at` and inserts another system message. Rare path; staff usually resolves and closes.

---

## 8. Routes & UI

### 8.1 New routes

| Route | Roles | Purpose |
|---|---|---|
| `/koda` | admin, front_desk | Inbox: 3-column or sectioned (Active · Escalated · Resolved) list with row preview, escalated pinned to top |
| `/koda/[conversationId]` | admin, front_desk | Full transcript with collapsible tool-call cards, customer side-panel, take-over button, cost panel |
| `/koda/simulator` | admin, front_desk | Staff role-plays as a diner: customer picker (or "Anonymous"), streaming chat, tool calls visible inline |
| `/settings/koda` | admin only | 5 sections: Identity (read-only), FAQ list, Specials list, Limits (daily-cap input), Activity (today's stats) |
| `/customers/notes-review` | admin, front_desk | Inbox of unverified Koda-written notes — Verify / Edit / Delete actions |

### 8.2 Sidebar nav update

Workspace group becomes:
```
Dashboard · Floor · Customers · Bookings · Koda
```

`Koda` uses the `Sparkles` lucide icon.

### 8.3 `/settings` index update

Insert a new admin-only row between "Tables" and "Manage team":
```
Organization profile · Tables · Koda AI assistant · Manage team
```

### 8.4 Conversation detail UX

```
┌──────────────────────────────────────────────────────────────────┐
│ ← back   Andini · WhatsApp · #{short_id}     [ Take over ]       │
├──────────────────────────────────────────────────────────────────┤
│ Customer card                          ┃  Cost                    │
│   Andini · 0812-...                    ┃   Input: 4,210 tokens   │
│   3 bookings, last 2026-04-22          ┃   Output: 760 tokens    │
│   ⚠️ Pending note: "Allergic peanut"   ┃   Spent: Rp 12          │
├──────────────────────────────────────────────────────────────────┤
│ 18:42  [Customer] Bisa booking buat 4 orang besok jam 7?         │
│ 18:42  [Koda]     Halo Andini! Saya cek dulu ya...               │
│ 18:42  [Tool]     check_availability → 3 tables free  [expand]   │
│ 18:42  [Koda]     Ada T03 indoor atau T04 patio. Pilih yang mana?│
│ 18:43  [Customer] T04                                             │
│ 18:43  [Koda]     OK! Saya book T04 ya.                           │
│ 18:43  [Tool]     create_booking → b_4f7c9...   [expand]          │
│ 18:43  [Koda]     Sudah, T04 jam 19:00 untuk 4 orang. 🌸          │
├──────────────────────────────────────────────────────────────────┤
│ [ Type a message — Koda is handling this conversation ]          │
└──────────────────────────────────────────────────────────────────┘
```

When `taken_over_by` is set, the input becomes editable and any text sent persists as `role='staff'`, with Koda paused.

### 8.5 Settings/Koda layout

5 sections within `/settings/koda`:

1. **Identity** (read-only): "Koda — your AI assistant. Powered by Buranchi Koda."
2. **FAQ**: list with drag handle, inline edit, soft-delete via `is_active` toggle
3. **Specials**: list with title, description, date range, active toggle
4. **Limits**: single number input "Daily message cap: 500" + helper "Today: 47 / 500 used (resets 00:00 {timezone})"
5. **Activity**: 3 stat cards
   - Today's conversations: 12
   - Escalation rate (7d): 14%
   - Today's spend: Rp 312

---

## 9. Acceptance criteria

The 10 things that must work before v1 ships:

1. Admin opens `/settings/koda` → adds 5 FAQ entries + 2 specials → sets daily cap to 500.
2. Simulator with customer "Andini" → "Bisa booking buat 4 orang besok jam 7 malam?" → Koda greets, calls `check_availability`, asks table preference, calls `create_booking`, confirms with booking detail. Full flow under 10 seconds.
3. Same conversation: "Cancel booking saya yang Tuesday ya" → Koda calls `find_customer_booking`, confirms which one, calls `cancel_booking`, confirms cancellation.
4. Simulator: "Menu vegetarian ada gak?" → Koda answers verbatim from a FAQ entry, no hallucination.
5. Simulator: "Saya kecewa, makanan kemarin asin banget" → pre-turn guard fires on `kecewa`, conversation flips to `escalated`, returns canned handoff. Conversation appears in `/koda` inbox under Escalated.
6. Simulator: customer says "saya alergi kacang" → Koda calls `add_customer_note('Allergic to peanuts')` → row appears in `/customers/notes-review` with "Pending verification" badge.
7. Inbox `/koda` shows the escalated conversation pinned at top with red status pill; auto-refresh every 30s like the floor view.
8. Staff opens conversation → clicks "Take over" → input becomes editable → sends manual reply → if customer messages again, Koda does NOT respond (engine checks `taken_over_by`).
9. Conversation detail shows token + Rp cost panel; total per turn ≈ Rp 5.
10. Daily-cap enforcement: cap set to 5 → 6th user message returns canned response without an LLM call. Counter visible in `/settings/koda` Activity.

---

## 10. Phase bridge

### 10.1 Phase 3 (WhatsApp Integration)

Adds a `whatsapp` channel adapter (~150 LOC). Engine, tools, prompts unchanged.

```
WhatsApp BSP webhook → POST /api/koda/whatsapp/webhook
    ↓ verify HMAC signature
    ↓ extract: tenant_phone (= WABA number), customer_phone, message text
    ↓ resolve organization_id from tenant_phone (new `whatsapp_phones` table in Phase 3)
    ↓ upsert customer by (organization_id, phone)
    ↓ upsert open koda_conversations row (channel='whatsapp')
    ↓ engine.runTurn(conversation_id, customer_message)
    ↓ POST reply to BSP send-message endpoint
```

Simulator remains as a perpetual debug tool, useful for staff to test new FAQ entries without calling their own WhatsApp.

### 10.2 Phase 5 (Loyalty)

Koda gains 2 new tools without engine changes:
- `get_loyalty_points(customer_id)` — read points balance
- `redeem_promo(customer_id, promo_code)` — apply a redemption

System prompt grows by ~200 tokens with a loyalty rules section.

### 10.3 Phase 6 (Marketing blast)

Koda flips to outbound mode for follow-ups:
- New tool `send_template_message(template_id, customer_ids[], variables)`
- Different entry point — scheduled job, not webhook
- Same engine, same audit trail in `koda_conversations`

---

## 11. Testing

### 11.1 Unit tests

- Each tool (`tools.ts`): Zod arg validation, mocked Supabase, success path, error path (BOOKING_CONFLICT, IMMUTABLE, etc.)
- Pre-turn guard: each trigger keyword in EN + ID, false-positive cases ("the manager wants pizza" must NOT trigger)
- Post-turn guard: low-confidence phrases, loop detection
- System-prompt builder: token-cap summarization, customer known/unknown branches

### 11.2 Engine integration tests

- Mocked OpenAI client returning deterministic tool-call sequences. Example: "given user message X, return assistant tool_call check_availability(args Y); after tool result, return tool_call create_booking(args Z)" → verify both tools execute, conversation_id token counts increment, final message persisted correctly.
- Take-over semantics: after `taken_over_by` set, runTurn does not call LLM
- Daily-cap path: at cap, runTurn returns canned response without LLM call

### 11.3 Live OpenAI tests

Small set of scripted conversations against real GPT-4o-mini, gated behind `KODA_LIVE_TESTS=1`. Run nightly in CI, not on every PR. Catches model drift (e.g., GPT-4o-mini behavior change after an OpenAI rollout).

Sample scripts:
- "Bisa booking buat 4 orang besok jam 7?" → expect `check_availability` then `create_booking` tool calls
- "What time do you close?" → expect text reply citing FAQ, no tool calls
- "I want to speak to a manager" → expect pre-turn guard escalation, NO LLM call at all (verified by mock counter)

### 11.4 RLS integration tests

5 tests in `supabase/tests/phase4-rls.test.ts`:
- Cross-tenant isolation on each of the 5 new tables
- Front-desk vs admin write permissions on `koda_faq` (front_desk should be denied)
- Service-role bypass works for `koda_messages` insert (simulates Phase 3 webhook path)

---

## 12. Out of scope for v1

Tracked here so we don't accidentally pull them in:

- **Voice / phone calls** — text only.
- **Multi-language detection beyond Bahasa/English** — code-switching within those two only.
- **Image/file handling** — no menu photo recognition, no receipt parsing.
- **Cross-restaurant context** — Koda for tenant A doesn't see tenant B data even via the same diner who eats at both. This is an RLS guarantee.
- **Memory beyond `customer_notes`** — no persistent "Koda remembers this conversation forever" feature. Each new conversation starts fresh except for verified customer notes + last 3 bookings.
- **Custom personas per tenant** — Koda is Metaseti's brand. Tenants can't rename Koda to "Mbak Ana" in v1. (Add per-tenant persona override in v2 if a paying tenant demands it.)
- **A/B testing or response variants** — single deterministic prompt per turn.
- **Outbound triggers** — Koda doesn't proactively message customers in v1 (Phase 6).
- **Knowledge base from documents (RAG)** — admin-edited text only.
- **Voice tone analysis / sentiment scoring** — keyword-based escalation only.
- **Payment processing** — booking deposits, prepaid menus, etc. (Phase 6+ if ever.)

---

## 13. Migrations & dashboard apply

Following Phase 1/2 pattern (corporate network blocks port 5432):

- `supabase/migrations/0011_phase4_koda_tables.sql` — committed
- `supabase/.dashboard-apply/phase-4.sql` — gitignored bundle, user pastes into dashboard SQL editor and runs once before code that depends on these tables runs

Verification block (user pastes after the bundle):

```sql
select tablename, rowsecurity from pg_tables
where schemaname = 'public'
  and tablename in ('koda_conversations','koda_messages','koda_faq','koda_specials','customer_notes')
order by tablename;
-- Expected: 5 rows, all rowsecurity=true

select count(*) from pg_policies where schemaname='public' and tablename like 'koda_%' or tablename='customer_notes';
-- Expected: ≥ 15 (3 policies × 5 tables minimum)

select version, name from supabase_migrations.schema_migrations where version='0011';
-- Expected: 1 row
```

---

## 14. References

- Architecture decisions log: §2 above
- Brainstorm transcript: chat history 2026-04-29
- Phase 2 spec (booking lifecycle Koda's tools wrap): `docs/superpowers/specs/2026-04-29-phase-2-booking-flooring-design.md`
- Phase 3 onboarding playbook (channel adapter target): `docs/phase-3/meta-business-onboarding.md`
- Memory: AI provider (`memory/ai_provider.md`), WhatsApp architecture (`memory/whatsapp_api_status.md`)
