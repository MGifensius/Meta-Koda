# Phase 4 — Koda AI Agent

Customer-facing booking concierge powered by GPT-4o-mini. Channel-agnostic engine that ships first as a dashboard simulator and bridges to WhatsApp later (when Phase 3 onboarding clears).

This document is the operational runbook for the shipped feature. The architectural spec lives at [`../superpowers/specs/2026-04-29-phase-4-koda-design.md`](../superpowers/specs/2026-04-29-phase-4-koda-design.md).

---

## What Koda does

Koda handles three things, in order of frequency:

1. **Bookings** — checks availability, creates, modifies, cancels (autonomously)
2. **FAQ** — answers questions verbatim from a knowledge base the admin curates
3. **Soft upsell** — at most once per conversation, mentions a current special if contextually relevant

Out of scope (escalates to staff): complaints, refunds, anything that isn't bookings/FAQ/upsell. Pre-turn keyword guard catches the obvious ones (`manager`, `kompain`, `kecewa`, `refund`, etc.).

## Setup before first use

1. **Add 5–10 FAQ entries** at `/settings/koda → FAQ section`. Without these, Koda escalates anything beyond pure booking flow. Examples:
   - Q: "Jam buka kapan?" → A: "Senin–Minggu, 10:00–22:00."
   - Q: "Ada menu vegetarian?" → A: "Ya, 5 menu vegetarian. Cek menu.buranchi.com"
   - Q: "Ada parkir?" → A: "Ya, gratis di basement B1."
   - Q: "Dress code?" → A: "Smart casual."
   - Q: "Bisa private dining?" → A: "Bisa untuk 8+ orang. Hubungi staff."

2. **Add 1–2 specials** at `/settings/koda → Specials section` (optional, enables the upsell layer):
   - Title: "Weekend Brunch 30% off"
   - Description: "Sat–Sun 10:00–14:00, all brunch menu."
   - Date range: optional (leave empty for always-on)

3. **Verify `OPENAI_API_KEY`** is set in `.env.local`. Without it, every conversation surface returns an error.

## Day-to-day usage

### Staff — testing Koda or warming up FAQ entries

1. Open `/koda/simulator`
2. Pick a customer in "Diner identity" (or stay anonymous to test cold-WhatsApp behavior)
3. Type as the diner. Koda's tool calls render inline so you see exactly what it did.

### Staff — handling escalated conversations

1. Open `/koda` (the inbox). Escalated rows are pinned to the top with red status pills.
2. Click a row → conversation transcript with customer side-panel + cost breakdown.
3. Click **Take over** → input becomes editable, your manual replies persist as `role='staff'`. Koda stops auto-responding for this conversation.
4. When done, **Hand back to Koda** (rare) or **Mark resolved**.

### Admin — reviewing AI-extracted customer notes

When a customer says something Koda thinks is worth remembering ("saya alergi kacang", "I prefer the patio"), Koda calls `add_customer_note` and the entry lands in `/customers/notes-review` flagged as "Koda · pending".

Review queue actions:
- **Verify** — flips `verified_at`, the note becomes part of the customer's verified preferences (and is included in Koda's prompt context for future conversations with this customer).
- **Edit** — fix a hallucination/typo before verifying.
- **Delete** — wrong fact entirely.

## Architecture quick reference

```
apps/web/lib/koda/
├── engine.ts        runTurn() — orchestrates a single conversation turn
├── tools.ts         7 tool definitions + executor with hooks
├── prompt.ts        buildSystemPrompt() — assembles tenant + customer context
├── guard.ts         pre-turn keyword detection + post-turn low-confidence
└── openai.ts        OpenAI client wrapper + model constants

apps/web/lib/actions/
├── koda.ts          sendKodaMessage, takeOver, resolve, escalate, etc.
├── koda-faq.ts      admin CRUD for FAQ
├── koda-specials.ts admin CRUD for specials
└── customer-notes.ts verify/edit/delete

apps/web/app/(app)/
├── koda/                       inbox, conversation detail, simulator
├── settings/koda/              FAQ + specials editor + activity stats
└── customers/notes-review/     pending Koda-written notes
```

**Per-turn flow:**
1. User message → persist to `koda_messages`
2. Pre-turn guard scans for trigger keywords. If matched → flip `koda_conversations.status='escalated'`, return canned reply, skip LLM.
3. Build context: system prompt (with tenant + customer + FAQ + specials inlined) + last 10 messages + 7 tool definitions
4. OpenAI call with `tools` + `tool_choice: 'auto'`
5. If LLM returns tool_calls, execute them, loop back (max 4 iterations)
6. Post-turn guard: low-confidence phrasing or `escalate_to_staff` tool → flip to escalated
7. Persist assistant message + token tally → revalidate `/koda` and conversation detail page

**Cost profile:** ~Rp 5 per turn, ~Rp 50 per 10-turn conversation (GPT-4o-mini at Q4 2025 pricing).

## Tools Koda has

| Tool | Returns | When Koda uses it |
|---|---|---|
| `check_availability(starts_at, party_size)` | List of free tables | Before creating a booking when no specific table requested |
| `find_customer_booking(date_hint?)` | Customer's upcoming/recent bookings | Modify or cancel intent |
| `create_booking(...)` | Booking ID + summary | Confirmed booking creation |
| `modify_booking(booking_id, ...)` | Updated booking | Time/party/table change |
| `cancel_booking(booking_id, reason?)` | Cancellation confirmation | After confirming with customer |
| `add_customer_note(note)` | Pending note ID | Customer explicitly stated a fact worth saving |
| `escalate_to_staff(reason)` | OK | Outside scope or low confidence |

FAQ + specials are NOT tools — they're inlined in the system prompt to save a roundtrip. Add Full-Text Search + a `search_faq` tool in v2 if a tenant grows past ~50 FAQ entries.

## Guardrails

| Layer | What it catches |
|---|---|
| **Pre-turn keyword guard** | `manager`, `human`, `kompain`, `complain`, `refund`, `kecewa`, etc. — auto-escalate without calling LLM |
| **Post-turn low-confidence** | "I'm not sure", "tidak yakin", "kurang tahu" — auto-escalate |
| **Loop detection** | Same write-tool with same args called twice → escalate |
| **Tool iteration cap** | 4 max per turn, then escalate |
| **Daily message cap** | Default 500/day per tenant (`DEFAULT_DAILY_CAP` in `koda.ts`); over → canned response, no LLM call |
| **Take-over lock** | When `taken_over_by` is set, Koda doesn't auto-respond regardless of new messages |

## Smoke-test checklist

Quick acceptance walkthrough for a new install or post-refactor sanity:

| # | Action | Expected |
|---|---|---|
| 1 | Add 5 FAQ entries + 1 special in `/settings/koda` | All saved, visible on settings page |
| 2 | `/koda/simulator` → pick existing customer → "Bisa booking buat 4 orang besok jam 7?" | Koda checks availability inline → confirms a table → creates booking → confirms with details |
| 3 | Same conversation → "Cancel booking saya yang tomorrow ya" | Koda finds booking → confirms → cancels → confirms |
| 4 | "Menu vegetarian ada gak?" | Verbatim FAQ answer, no hallucination |
| 5 | New conversation → "Saya kecewa makanan kemarin asin banget" | Pre-turn guard fires, conversation flips to `escalated`, canned handoff returned, no LLM call |
| 6 | Customer says "saya alergi kacang" mid-conversation | Koda calls `add_customer_note` → `/customers/notes-review` has the entry |
| 7 | `/koda` inbox | Escalated row pinned at top with red status pill |
| 8 | Click escalated → Take over → reply manually | Manual reply persists; if customer messages again, Koda stays silent |
| 9 | Conversation detail right sidebar | Shows token + Rp cost breakdown |
| 10 | `/settings/koda` Activity section | Today's message count incremented |

## Known issues + future work

- **Persona is fixed at "Koda".** Per-tenant persona override (e.g. let a tenant call their assistant "Mbak Ana") is deferred. Worth reconsidering if a paying tenant requests it.
- **2 SECURITY DEFINER warnings persist** on `get_my_org_id` / `get_my_role`. Cleanup is moving them into a non-public schema (`private` or similar) so PostgREST can't expose them via RPC. Requires updating every RLS policy that references them.
- **Phase 3 WhatsApp adapter not yet built** — gated on Meta Business verification (see `docs/phase-3/meta-business-onboarding.md`). Once unblocked, ~150 LOC channel adapter wires the existing engine to inbound WhatsApp.
- **No streaming in simulator UI.** Each turn is a non-streaming call. Adding `streamText` from Vercel AI SDK is straightforward but deferred until someone complains about latency.
- **No FTS on FAQ.** All active FAQ entries are inlined in the system prompt. Fine up to ~50 entries; above that, add `tsvector` + a `search_faq` tool.
- **Customer notes are global per-tenant.** Notes Koda extracts in conversation A appear in customer history across conversations. Acceptable for v1; if it becomes a privacy concern, scope by `source_conversation_id` access.
- **No A/B prompt testing or response variants.** Single deterministic prompt builder per turn.

## Related migrations

| Migration | What it does |
|---|---|
| `0011` | Phase 4 schema: 5 tables + RLS + token-tally RPC |
| `0012` | First security pass — search_path, extension schema, REVOKE FROM public |
| `0013` | REVOKE FROM anon (Supabase auto-grants to anon for PostgREST exposure) |
| `0014` | Made avatars + org-logos buckets private; switched to signed URLs |
| `0015` | Tried SECURITY INVOKER on RLS helpers (later partially reverted in 0018) |
| `0016` | Consolidated `profiles` UPDATE policies for performance |
| `0017` | Added 7 missing FK indexes for audit-trail columns |
| `0018` | Reverted SECURITY DEFINER on `get_my_org_id` / `get_my_role` (login broke under INVOKER) |
