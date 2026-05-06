import time
from contextlib import asynccontextmanager

from fastapi import FastAPI, Request, Depends
from fastapi.middleware.cors import CORSMiddleware

from app.routers import (
    customers, bookings, marketing, loyalty, pos, floor, chat,
    webhook, admin, demo_chat,
)
from app.services.scheduler import start_scheduler, shutdown_scheduler
from app.services.auth import current_user, CurrentUser


@asynccontextmanager
async def lifespan(app: FastAPI):
    start_scheduler()
    yield
    shutdown_scheduler()


app = FastAPI(
    title="Meta-Koda API",
    description="CRM Dashboard API — Customers, Bookings, Marketing, Loyalty, POS & AI Bot",
    version="1.0.0",
    lifespan=lifespan,
)

import os

# Comma-separated list of allowed frontend origins. In production set
# CORS_ORIGINS=https://your-app.vercel.app,https://meta-koda.com  etc.
_default_origins = "http://localhost:3000,http://127.0.0.1:3000"
_origins = [
    o.strip() for o in os.environ.get("CORS_ORIGINS", _default_origins).split(",")
    if o.strip()
]

app.add_middleware(
    CORSMiddleware,
    allow_origins=_origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


# Lightweight timing middleware so we can see request duration in the
# uvicorn log. Only logs slow requests (>200ms) plus every error so
# normal traffic doesn't drown out the signal. Toggle via env var.
PERF_LOG_THRESHOLD_MS = int(os.environ.get("PERF_LOG_THRESHOLD_MS", "200"))


@app.middleware("http")
async def _timing_middleware(request: Request, call_next):
    started = time.perf_counter()
    response = await call_next(request)
    elapsed_ms = (time.perf_counter() - started) * 1000
    response.headers["X-Response-Time-ms"] = f"{elapsed_ms:.0f}"
    if elapsed_ms >= PERF_LOG_THRESHOLD_MS or response.status_code >= 400:
        print(
            f"[perf] {response.status_code} {request.method} {request.url.path} "
            f"{elapsed_ms:.0f}ms"
        )
    return response

app.include_router(customers.router, prefix="/api/customers", tags=["Customers"])
app.include_router(bookings.router, prefix="/api/bookings", tags=["Bookings"])
app.include_router(marketing.router, prefix="/api/marketing", tags=["Marketing"])
app.include_router(loyalty.router, prefix="/api/loyalty", tags=["Loyalty"])
app.include_router(pos.router, prefix="/api/pos", tags=["POS (legacy)"])
app.include_router(floor.router, prefix="/api/floor", tags=["Floor Operation"])
app.include_router(chat.router, prefix="/api/chat", tags=["Chat"])
app.include_router(webhook.router, prefix="/api/webhook", tags=["Webhook"])
app.include_router(admin.router, prefix="/api/admin", tags=["Super Admin"])
app.include_router(demo_chat.router, prefix="/api/demo-chat", tags=["Demo Chat"])


@app.get("/api/health")
async def health():
    return {"status": "ok", "service": "meta-koda"}


@app.get("/api/settings")
async def get_settings(user: CurrentUser = Depends(current_user)):
    from app.db import get_db
    db = get_db()
    result = db.table("restaurant_settings").select("*").eq(
        "tenant_id", user.tenant_id
    ).limit(1).execute()
    if result.data:
        return result.data[0]
    return {}


@app.patch("/api/settings")
async def update_settings(request: Request, user: CurrentUser = Depends(current_user)):
    from app.db import get_db
    body = await request.json()
    db = get_db()
    # Strip identifying / scoping fields from the update payload — clients
    # shouldn't be able to rewrite tenant_id or the legacy id.
    body.pop("id", None)
    body.pop("restaurant_id", None)
    body.pop("tenant_id", None)
    result = db.table("restaurant_settings").update(body).eq(
        "tenant_id", user.tenant_id
    ).execute()
    if result.data:
        return result.data[0]
    return {"ok": True}


@app.get("/api/dashboard/stats")
async def dashboard_stats(user: CurrentUser = Depends(current_user)):
    """Dashboard KPIs and summary data, scoped to the requester's tenant.

    The eight queries below used to run sequentially — each Supabase
    round-trip is 50–200ms over the network, so the endpoint was
    taking 800–1500ms cold. Now they run in parallel via
    `asyncio.to_thread`+`asyncio.gather`, which drops total wall time
    to the slowest single query (typically 100–250ms).
    """
    import asyncio

    from app.db import get_db
    from datetime import datetime, timedelta

    db = get_db()
    tenant_id = user.tenant_id
    now = datetime.now()
    today = now.strftime("%Y-%m-%d")
    today_start = f"{today}T00:00:00"
    week_start = (now - timedelta(days=6)).strftime("%Y-%m-%d")

    def q_total_customers():
        return db.table("customers").select("id", count="exact").eq(
            "tenant_id", tenant_id
        ).execute()

    def q_rev_today():
        return db.table("revenue_transactions").select("amount").eq(
            "tenant_id", tenant_id
        ).gte("settled_at", today_start).execute()

    def q_bookings_today_count():
        return db.table("bookings").select("id", count="exact").eq(
            "tenant_id", tenant_id
        ).eq("date", today).execute()

    def q_all_settled():
        # Full-table scan for avg_order. Fine while volumes are small;
        # once revenue grows, swap to a SQL view that pre-aggregates
        # AVG(amount) per tenant.
        return db.table("revenue_transactions").select("amount").eq(
            "tenant_id", tenant_id
        ).execute()

    def q_top():
        return db.table("customers").select(
            "id, name, points, tier, total_visits, total_spent"
        ).eq("tenant_id", tenant_id).order(
            "points", desc=True
        ).limit(5).execute()

    def q_today_bookings():
        return db.table("bookings").select(
            "id, guest_name, time, party_size, table_id, status"
        ).eq("tenant_id", tenant_id).eq("date", today).order("time").execute()

    def q_recent_convs():
        return db.table("conversations").select(
            "id, last_message, last_message_time, unread_count, status, customers(name, phone)"
        ).eq("tenant_id", tenant_id).order(
            "last_message_time", desc=True
        ).limit(5).execute()

    def q_week_rows():
        return db.table("revenue_transactions").select(
            "amount, settled_at"
        ).eq("tenant_id", tenant_id).gte(
            "settled_at", week_start + "T00:00:00"
        ).execute()

    # Fire all 8 queries concurrently. Even though supabase-py is
    # blocking, asyncio.to_thread runs them on the threadpool so the
    # network waits overlap.
    started = time.perf_counter()
    (
        all_customers,
        rev_today_res,
        bookings_today,
        all_settled_res,
        top_res,
        today_bookings_res,
        recent_convs_res,
        week_rows_res,
    ) = await asyncio.gather(
        asyncio.to_thread(q_total_customers),
        asyncio.to_thread(q_rev_today),
        asyncio.to_thread(q_bookings_today_count),
        asyncio.to_thread(q_all_settled),
        asyncio.to_thread(q_top),
        asyncio.to_thread(q_today_bookings),
        asyncio.to_thread(q_recent_convs),
        asyncio.to_thread(q_week_rows),
    )
    elapsed_ms = (time.perf_counter() - started) * 1000
    print(f"[perf] dashboard_stats parallel-fan-out {elapsed_ms:.0f}ms (8 queries)")

    total_customers = all_customers.count or 0
    rev_today_rows = rev_today_res.data or []
    revenue_today = sum(r["amount"] for r in rev_today_rows)
    total_bookings_today = bookings_today.count or 0
    all_settled = all_settled_res.data or []
    avg_order = (
        int(sum(r["amount"] for r in all_settled) / len(all_settled))
        if all_settled
        else 0
    )
    top = top_res.data or []
    today_bookings = today_bookings_res.data or []
    recent_convs = recent_convs_res.data or []
    week_rows = week_rows_res.data or []

    day_totals = {}
    for i in range(7):
        d = (now - timedelta(days=6 - i)).strftime("%Y-%m-%d")
        day_totals[d] = 0

    for r in (week_rows or []):
        try:
            d = r["settled_at"][:10]
            if d in day_totals:
                day_totals[d] += r["amount"] or 0
        except Exception:
            pass

    day_names = ["Min", "Sen", "Sel", "Rab", "Kam", "Jum", "Sab"]
    day_names_full = ["Minggu", "Senin", "Selasa", "Rabu", "Kamis", "Jumat", "Sabtu"]
    revenue_week = []
    for date_str, total in day_totals.items():
        d_obj = datetime.strptime(date_str, "%Y-%m-%d")
        revenue_week.append({
            "date": date_str,
            "day": day_names[d_obj.weekday() if d_obj.weekday() < 6 else 6 if d_obj.weekday() == 6 else 0],
            "day_short": day_names[(d_obj.weekday() + 1) % 7],  # Monday=0 in py, but Sunday=0 in our list
            "day_full": day_names_full[(d_obj.weekday() + 1) % 7],
            "total": total,
        })

    revenue_week_total = sum(d["total"] for d in revenue_week)
    avg_weekly = revenue_week_total / 7 if revenue_week else 0

    return {
        "total_customers": total_customers,
        "revenue_today": revenue_today,
        "total_bookings_today": total_bookings_today,
        "avg_order_value": avg_order,
        "top_customers": top,
        "today_bookings": today_bookings,
        "recent_conversations": recent_convs,
        "revenue_week": revenue_week,
        "revenue_week_total": revenue_week_total,
        "revenue_week_avg": avg_weekly,
    }
