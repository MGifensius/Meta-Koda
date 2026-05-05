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
    """Dashboard KPIs and summary data, scoped to the requester's tenant."""
    from app.db import get_db
    from datetime import datetime, timedelta

    db = get_db()
    tenant_id = user.tenant_id
    now = datetime.now()
    today = now.strftime("%Y-%m-%d")

    # Customer counts
    all_customers = db.table("customers").select("id", count="exact").eq(
        "tenant_id", tenant_id
    ).execute()
    total_customers = all_customers.count or 0

    # Today's revenue — bill-input flow logs to revenue_transactions
    today_start = f"{today}T00:00:00"
    rev_today_rows = db.table("revenue_transactions").select("amount").eq(
        "tenant_id", tenant_id
    ).gte("settled_at", today_start).execute().data
    revenue_today = sum(r["amount"] for r in rev_today_rows) if rev_today_rows else 0

    # Today's bookings
    bookings_today = db.table("bookings").select("id", count="exact").eq(
        "tenant_id", tenant_id
    ).eq("date", today).execute()
    total_bookings_today = bookings_today.count or 0

    # Average check — across all settled transactions
    all_settled = db.table("revenue_transactions").select("amount").eq(
        "tenant_id", tenant_id
    ).execute().data
    avg_order = (
        int(sum(r["amount"] for r in all_settled) / len(all_settled))
        if all_settled
        else 0
    )

    # Top customers
    top = db.table("customers").select(
        "id, name, points, tier, total_visits, total_spent"
    ).eq("tenant_id", tenant_id).order("points", desc=True).limit(5).execute().data

    # Today's bookings list
    today_bookings = db.table("bookings").select(
        "id, guest_name, time, party_size, table_id, status"
    ).eq("tenant_id", tenant_id).eq("date", today).order("time").execute().data

    # Recent conversations
    recent_convs = db.table("conversations").select(
        "id, last_message, last_message_time, unread_count, status, customers(name, phone)"
    ).eq("tenant_id", tenant_id).order(
        "last_message_time", desc=True
    ).limit(5).execute().data

    # Revenue last 7 days — group settled transactions by day
    week_start = (now - timedelta(days=6)).strftime("%Y-%m-%d")
    week_rows = db.table("revenue_transactions").select(
        "amount, settled_at"
    ).eq("tenant_id", tenant_id).gte(
        "settled_at", week_start + "T00:00:00"
    ).execute().data

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
