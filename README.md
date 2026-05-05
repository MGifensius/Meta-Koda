# Meta-Koda

Multi-tenant SaaS for Indonesian restaurants — bookings, floor operation
with manual bill input, loyalty ledger, marketing, and a WhatsApp AI bot.
Each tenant owns its own data, WhatsApp Business account, and loyalty
configuration.

## Stack

| Layer | Tech |
|---|---|
| Frontend | Next.js 16 (App Router) + Tailwind v4 + shadcn-style UI on base-ui |
| Backend | FastAPI (Python 3.13) + APScheduler |
| Database | Supabase (Postgres) — Row-Level Security on tenant data |
| Auth | Supabase Auth (ES256 JWT, JWKS-verified) |
| AI | OpenAI GPT-4o-mini for the WhatsApp bot, with tool calling |
| Messaging | WhatsApp Cloud API (per-tenant WABA, fallback to global env) |

## Repository layout

```
.
├── backend/            FastAPI app, scheduler, services
├── frontend/           Next.js dashboard (tenant + super-admin)
├── supabase/migrations/ Versioned SQL migrations (run in order)
└── .env.example        All required environment variables
```

## Local development

### 1. Prerequisites
- Node 20+, npm
- Python 3.13 (or 3.11+)
- Supabase project (free tier OK)

### 2. Configure
```bash
cp .env.example .env
# Fill in real values from your Supabase project + OpenAI etc.
```

### 3. Run database migrations
Open the Supabase SQL editor and apply each file in `supabase/migrations/`
in numeric order (`001_*.sql` → `030_*.sql`).

### 4. Start backend
```bash
cd backend
python -m venv .venv
.venv\Scripts\activate           # Windows
pip install -r requirements.txt
python -m uvicorn app.main:app --reload --port 8000
```

### 5. Start frontend
```bash
cd frontend
npm install
npm run dev
```

Open http://localhost:3000.

### 6. Verify
```bash
cd backend
.venv\Scripts\python.exe scripts\e2e_check.py
```

## Production deployment

The frontend is straightforward (Vercel free tier). The backend has a
long-running scheduler so it needs a PaaS that supports persistent
workers — **not Vercel serverless**.

### Frontend → Vercel (free)

1. Push this repo to GitHub.
2. Vercel → Add New Project → Import the GitHub repo.
3. **Root Directory**: `frontend`
4. **Framework Preset**: Next.js (auto-detected)
5. Environment Variables (Settings → Environment Variables):
   - `NEXT_PUBLIC_SUPABASE_URL`
   - `NEXT_PUBLIC_SUPABASE_ANON_KEY`
   - `NEXT_PUBLIC_API_URL` → e.g. `https://meta-koda-api.onrender.com/api`
6. Deploy. Vercel auto-redeploys on every push to `main`.

### Backend → Render (free) or Railway / Fly.io

Recommended: **Render free web service** (750 hrs/month, sleeps after
15 min idle — fine for demo, ~30s cold-start on first request).

1. Render dashboard → New → Web Service → connect your GitHub repo.
2. **Root Directory**: `backend`
3. **Build Command**: `pip install -r requirements.txt`
4. **Start Command**: `uvicorn app.main:app --host 0.0.0.0 --port $PORT`
5. **Plan**: Free
6. Environment variables (same names as `.env.example`):
   - `SUPABASE_URL`, `SUPABASE_SERVICE_KEY`, `SUPABASE_JWT_SECRET`
   - `OPENAI_API_KEY`
   - `WHATSAPP_TOKEN`, `WHATSAPP_PHONE_ID`, `WHATSAPP_VERIFY_TOKEN`
   - `CORS_ORIGINS` → your Vercel URL, e.g. `https://meta-koda.vercel.app`
   - `GOOGLE_FORM_URL`, `XENDIT_*` if used
7. Deploy. Note the assigned URL (e.g. `https://meta-koda-api.onrender.com`).
8. Set this URL as `NEXT_PUBLIC_API_URL` (with `/api` suffix) in Vercel.

### Webhook URL (when WhatsApp is connected)

Once the backend is on Render, your Meta webhook URL is:
```
https://<your-render-app>.onrender.com/api/webhook/whatsapp
```
Verify token: `meta-koda-verify` (or whatever you set in `WHATSAPP_VERIFY_TOKEN`).

## What's where

- **Tenant onboarding**: super_admin → `/admin` → Add Tenant
- **Floor / bill input**: tenant_owner → `/floor`
- **Loyalty config**: tenant_owner → `/settings → Loyalty`
- **Marketing drafts**: tenant_owner → `/marketing`
- **Inbox (live WA messages)**: tenant_owner → `/inbox`

## License

Proprietary. All rights reserved.
