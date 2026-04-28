# Meta Business + WhatsApp Onboarding (Vendor Model)

**Audience:** Metaseti Digital Indonesia, selling Buranchi Koda as a subscription SaaS to restaurants.
**Goal:** Get WhatsApp Business Platform (Cloud API) access so Phase 3 messaging can ship.

---

## 1. Architectural decision — who owns what

**Metaseti owns:** the Meta App, the Solution Partner / Tech Provider relationship, the API integration, the conversational templates library used as defaults.

**Each customer (e.g. Buranchi) owns:** their own Meta Business Suite, their own WhatsApp Business Account (WABA), their own phone number, their own display name, and their own customer data on WhatsApp.

**Why this model:**
- **Brand & privacy** — WhatsApp shows the customer the Display Name of whoever is messaging them. If the WABA is under Metaseti, Buranchi diners see "Metaseti" sending booking confirmations, not "Buranchi". That's wrong for a CRM.
- **Data ownership** — When (not if) Buranchi changes vendor or cancels, they take their WABA + phone + customer chats with them. If you put the WABA under Metaseti, you create lock-in that *you* get blamed for, not credit for.
- **Quality & rate limits** — WhatsApp's quality rating, conversation tier, and per-template approvals are scoped per-WABA. If one tenant gets reported, you don't want it to wreck every other tenant's deliverability.
- **Billing** — Meta bills the WABA owner directly. Each restaurant pays their own conversation costs (or you front and bill back). Cleaner accounting.
- **This is how every WhatsApp SaaS does it** — Wati, MessageBird/Bird, 360dialog, Twilio's SaaS customers, Mekari Qontak. None of them have one big WABA with all customers under it.

---

## 2. Path choice — Direct vs. BSP

You have two paths to the WhatsApp Business Platform:

### Path A — Direct Cloud API (Metaseti as Tech Provider)
- You apply to Meta for the **WhatsApp Business Tech Provider** program.
- You implement Embedded Signup (OAuth flow) so customers can connect their WABA to your app in 5 minutes.
- You pay Meta per conversation, no markup.
- **Tradeoff:** App review takes weeks, Meta is strict about UI/UX, and you handle 100% of support escalations.

### Path B — Through a BSP (Business Solution Provider) — **recommended for Phase 3**
- You partner with a BSP that already has Tech Provider status. They give you a multi-tenant API.
- Each customer's WABA gets provisioned through the BSP, but ownership stays with the customer.
- You ship WhatsApp in days, not weeks.
- **Tradeoff:** ~10–25% markup on conversation pricing.

**Recommendation:** Start with Path B (a BSP). Once you have 10+ paying tenants, the markup justifies migrating to Path A. Migration path is supported — WABAs can move between Tech Providers.

### BSP shortlist (Indonesia-friendly, December 2025)

| BSP | Where based | Why pick | Watch out for |
|---|---|---|---|
| **360dialog** | Germany (global) | Cheap (no markup on Meta pricing, flat $49/mo channel), dev-friendly, direct REST API on top of Cloud API | Self-service onboarding leans technical |
| **Twilio** | US (global) | Mature SDKs, great docs, strong Indonesia support | Premium pricing (~25% markup) |
| **Mekari Qontak** | Indonesia | Local invoicing in IDR, Indonesian support, NIB-friendly onboarding | Their UI tries to bundle their own CRM — ignore it, just use the API |
| **Wati** | Singapore | Fast onboarding, Indonesian docs | Their UI also tries to be the CRM — same caveat |

For Phase 3 I'd lean **360dialog** if you want the cleanest API surface and **Mekari Qontak** if you want local IDR billing and human support in Bahasa.

---

## 3. Step-by-step: what Metaseti does (one-time)

These steps are done once for Metaseti, regardless of how many restaurants you onboard later.

### 3.1 Create Metaseti's Meta Business
1. Go to https://business.facebook.com → **Create account**.
2. Use a Metaseti email (e.g. `admin@metaseti.id`). Don't use a personal Facebook account email.
3. Fill in: Metaseti Digital Indonesia, your primary phone, your business website.
4. Confirm via email.

### 3.2 Verify Metaseti's business with Meta
This is the gate that unlocks everything else (sending messages at scale, taking ownership of WABAs, etc.).

1. In Business Manager → **Settings → Business Info → Security Center → Start verification**.
2. Upload Metaseti's incorporation documents:
   - **NIB (Nomor Induk Berusaha)** — primary, since Indonesia switched to OSS in 2021.
   - **Akta Pendirian** (deed of establishment) — sometimes requested.
   - **NPWP** — corporate tax number.
   - **SK Kemenkumham** — if you have it; not always required.
3. Verify a phone number that's listed in the documents (for callback verification).
4. **Timeline:** 2–10 business days. Common rejection cause: business name in form doesn't exactly match the NIB. Use the legal name verbatim, not "Metaseti" or any trade name.

### 3.3 Pick a BSP (Path B) and onboard
This is BSP-specific, but the shape is the same:

1. Sign up on the BSP's portal as Metaseti.
2. They'll ask for Metaseti's Business Manager ID — find it in Settings → Business Info.
3. They give you sandbox API credentials immediately (test with a sandbox phone number).
4. Read their multi-tenant docs — specifically how to provision a new tenant's WABA via API or via their portal.

### 3.4 Build the embedded signup flow (Phase 3 development work)
This is what we build in code: a "Connect WhatsApp" button in `/settings/whatsapp` that:
1. Pops a Meta OAuth dialog asking the restaurant owner to connect their WABA.
2. On success, your backend stores the WABA ID + phone number + access token (per-tenant).
3. Sends a sandbox test message back to confirm.

(Detailed implementation is the Phase 3 spec/plan.)

---

## 4. Step-by-step: what Buranchi (and each future tenant) does

Coach the restaurant operator through these. Build a setup wizard inside `/settings/whatsapp` so they don't have to flip between tabs.

### 4.1 Buranchi creates their own Meta Business
1. https://business.facebook.com → Create account, using a Buranchi email (e.g. `owner@buranchi.com`).
2. Same steps as Metaseti's, with Buranchi's NIB / NPWP.
3. Verify their business — same 2–10 day wait.

### 4.2 Pick a phone number for WhatsApp
Two options:
- **Use a fresh number** never registered with WhatsApp (cleanest).
- **Migrate an existing WhatsApp Business number** — the regular WhatsApp Business app account gets *deleted* on migration, and customers' chat history doesn't transfer. Confirm with Buranchi if their existing number is OK to migrate.

The number must be able to receive an SMS or voice call for the OTP, on a phone that Buranchi controls.

### 4.3 Provision the WABA
1. In Buranchi's Business Manager → **WhatsApp Manager → Create account**.
2. Add the phone number from 4.2.
3. Enter Display Name — what customers see when they receive a message:
   - Must be related to the business (Meta enforces this — "Buranchi", "Buranchi Koda", "Buranchi Booking" all OK; "Hot Reservations" not OK).
   - Display Name approval takes 1–3 business days.
4. Pick category: "Restaurant" or "Food & Beverage".

### 4.4 Connect Buranchi's WABA to Metaseti's app
This is the moment the Phase 3 product magic happens. Buranchi clicks "Connect WhatsApp" in `/settings/whatsapp` → Meta OAuth dialog → picks their WABA → grants Metaseti access. Done.

Behind the scenes, Metaseti's backend now has a System User access token for Buranchi's WABA and can send/receive on behalf of Buranchi.

### 4.5 Initial conversation tier
Every fresh WABA starts at **250 unique conversations / 24h**. Tier graduates automatically:
- 250 → 1,000 (after a few days of normal traffic + good quality rating).
- 1,000 → 10,000 (after weeks).
- 10,000 → unlimited.

Quality rating drops if customers report messages as spam. Rate is per-WABA, so every tenant manages their own.

---

## 5. Indonesian regulatory notes

- **PSE (Penyelenggara Sistem Elektronik) registration** — Buranchi Koda as a SaaS is technically a PSE Privat. Once you're past 1 active customer, register with Kominfo. Simple online form.
- **PDP Law (UU PDP 27/2022)** — Personal Data Protection. Effective October 2024. Customer data on WhatsApp falls under this. Have a `Privacy Policy` page on your marketing site that covers WhatsApp data flows. Required language: Bahasa Indonesia version exists.
- **No OTT messaging block** — Indonesia has no equivalent to India's TRAI restrictions on WhatsApp marketing. You're fine.

---

## 6. Pricing reality check (Q4 2025 published rates, IDR ≈ 16,000/USD)

Per-conversation pricing on the WhatsApp Business Platform, Indonesia:

| Conversation type | Meta rate (USD) | Approx IDR | When charged |
|---|---|---|---|
| **Utility** (booking confirmations, reminders) | $0.0095 | ~Rp 152 | When the business sends a template in this category |
| **Authentication** (OTP) | $0.0263 | ~Rp 421 | Only useful if you add 2FA to Buranchi |
| **Marketing** (promo blasts) | $0.0379 | ~Rp 606 | Phase 6 territory |
| **Service** (free-form replies within 24h of customer message) | Free | — | Customer initiates the conversation |

For Buranchi: a typical day is ~50 booking confirmations + reminders × Rp 152 = **~Rp 7,600/day** in Meta fees. Trivial. Your subscription pricing dwarfs this.

BSP markup adds 10–25% on top depending on which BSP. 360dialog has zero markup with their flat-fee model.

---

## 7. What to do this week

1. **Today / tomorrow:** Start Metaseti's Meta Business verification (3.1 + 3.2). The 2–10 day wait is the critical path.
2. **In parallel:** Pick a BSP. I'd say sign up with both 360dialog (sandbox) and Mekari Qontak (sales call) and decide based on which docs feel cleaner and which sales rep is more responsive.
3. **Don't yet:** Don't ask Buranchi to start their Meta verification yet. Wait until your verification is done so you can hand them a working "connect" flow rather than asking them to wait twice.
4. **Phase 4 (AI Agent) can start now in parallel** — it doesn't need WhatsApp to be live. It builds against in-app chat first; we'll bridge to WhatsApp in Phase 3+.

---

## 8. When Phase 3 technical work starts

The brainstorm/spec/plan flow will produce:
- `/settings/whatsapp` admin page — connect WABA, view status, message templates
- Webhook receiver (Cloud API → our backend) for inbound messages
- Outbound send action (server action wrapping BSP API)
- Booking confirmation hook — auto-send WhatsApp template when a booking is confirmed
- Reminder hook — scheduled job sends reminder 2h before booking
- Inbound auto-reply hook (Phase 4 AI agent picks up here)

These are the visible Phase 3 deliverables. Implementation gates on Metaseti's Meta verification being approved + BSP credentials in hand.
