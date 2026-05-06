"""
Scheduled tasks:
1. H-12 confirmation request (once, when ~12h to the booking).
2. H-30m reminder + attendance confirmation (once, when ~30m to the booking).
3. T+15min auto-cancel (no-show watcher).
4. Feedback request (30 min after the bill is settled).
5. Cleaning timer release + reservation reconciliation (existing).

All booking jobs are idempotent — they re-check `confirmation_sent_at` /
`reminder_sent_at` / status on every tick so re-running the same window
doesn't double-send.
"""

from datetime import datetime, timedelta, timezone
from apscheduler.schedulers.asyncio import AsyncIOScheduler
from app.db import get_db
from app.services.whatsapp import send_message
from app.services import booking_messages as bm

scheduler = AsyncIOScheduler()


def _now_utc() -> datetime:
    return datetime.now(timezone.utc)


async def send_h12_confirmations():
    """Pick up every reserved booking whose start is ~12 hours from now
    and hasn't yet had a confirmation sent. Window is 11–13h to give the
    15-min scheduler tick room to catch every booking exactly once.

    Multi-tenant safe — query is global, message templates resolve the
    tenant name internally.
    """
    db = get_db()
    now = _now_utc()
    today = now.strftime("%Y-%m-%d")
    tomorrow = (now + timedelta(days=1)).strftime("%Y-%m-%d")

    rows = db.table("bookings").select(
        "id, tenant_id, date, time, table_id, party_size, customer_phone,"
        "confirmation_state, confirmation_sent_at, customers(name, phone)"
    ).in_("date", [today, tomorrow]).eq(
        "status", "reserved"
    ).is_("confirmation_sent_at", "null").execute().data or []

    for b in rows:
        try:
            booking_dt = datetime.fromisoformat(
                f"{b['date']}T{b['time']}:00+00:00"
            )
        except (ValueError, TypeError):
            continue
        delta_hours = (booking_dt - now).total_seconds() / 3600
        if delta_hours < 11 or delta_hours > 13:
            continue

        sent = await bm.send_confirmation(db, b, b["tenant_id"])
        if not sent:
            continue
        db.table("bookings").update({
            "confirmation_state": "sent",
            "confirmation_sent_at": now.isoformat(),
        }).eq("id", b["id"]).execute()
        bm.log_event(
            db,
            tenant_id=b["tenant_id"],
            booking_id=b["id"],
            event_type="confirmation_sent",
            payload={"hours_ahead": round(delta_hours, 1)},
        )


async def send_h30m_reminders():
    """Send the 30-minute attendance check before the booking. The message
    asks the customer to confirm with YA / BATAL — replies are processed
    by the bot's normal confirmation flow on the conversation. Idempotent
    via `reminder_sent_at`. Cancelled bookings are skipped.

    Window is 25–35 min so the 5-min scheduler tick catches each booking
    exactly once.
    """
    db = get_db()
    now = _now_utc()
    today = now.strftime("%Y-%m-%d")

    rows = db.table("bookings").select(
        "id, tenant_id, date, time, table_id, party_size, customer_phone,status, "
        "reminder_sent_at, customers(name, phone)"
    ).eq("date", today).in_(
        "status", ["reserved", "occupied"]
    ).is_("reminder_sent_at", "null").execute().data or []

    for b in rows:
        try:
            booking_dt = datetime.fromisoformat(
                f"{b['date']}T{b['time']}:00+00:00"
            )
        except (ValueError, TypeError):
            continue
        delta_minutes = (booking_dt - now).total_seconds() / 60
        if delta_minutes < 25 or delta_minutes > 35:
            continue

        sent = await bm.send_reminder(db, b, b["tenant_id"])
        if not sent:
            continue
        db.table("bookings").update({
            "reminder_sent_at": now.isoformat(),
        }).eq("id", b["id"]).execute()
        bm.log_event(
            db,
            tenant_id=b["tenant_id"],
            booking_id=b["id"],
            event_type="reminder_sent",
            payload={"minutes_ahead": round(delta_minutes, 1)},
        )


async def auto_cancel_no_shows():
    """Auto-cancel bookings 15 minutes past their start that are still
    `reserved`. Sends a courtesy WA to the customer and frees the table."""
    db = get_db()
    now = _now_utc()
    today = now.strftime("%Y-%m-%d")

    rows = db.table("bookings").select(
        "id, tenant_id, date, time, table_id, customer_phone, status, customers(name, phone)"
    ).eq("date", today).eq("status", "reserved").execute().data or []

    for b in rows:
        try:
            booking_dt = datetime.fromisoformat(
                f"{b['date']}T{b['time']}:00+00:00"
            )
        except (ValueError, TypeError):
            continue
        late_minutes = (now - booking_dt).total_seconds() / 60
        if late_minutes < 15:
            continue

        # Flip booking to no_show + send WA
        await bm.send_cancelled_no_show(db, b, b["tenant_id"])
        db.table("bookings").update({
            "status": "no_show",
            "cancelled_reason": "no_show_auto",
            "cancelled_at": now.isoformat(),
        }).eq("id", b["id"]).execute()
        # Free the table if it was holding one
        if b.get("table_id"):
            db.table("tables").update({
                "status": "available",
                "current_booking_id": None,
            }).eq("id", b["table_id"]).eq(
                "tenant_id", b["tenant_id"]
            ).execute()
        bm.log_event(
            db,
            tenant_id=b["tenant_id"],
            booking_id=b["id"],
            event_type="no_show_auto",
            payload={"late_minutes": round(late_minutes, 1)},
        )


async def send_feedback_requests():
    """Send a feedback request 30 minutes after the bill is settled.

    Anchors on `revenue_transactions.settled_at` (the floor "settle"
    flow) instead of the booking time, because the customer might have
    arrived late or stayed long — 30 minutes after THEY were done is
    the right moment, regardless of the original booking time. Walk-ins
    are also covered as long as their phone was captured at settle.

    Window is 30–60 min after settle to give the 15-min scheduler tick
    room. Idempotent via the `feedback_requests` table.
    """
    from app.config import GOOGLE_FORM_URL

    if not GOOGLE_FORM_URL:
        return

    db = get_db()
    now = datetime.now(timezone.utc)
    upper = (now - timedelta(minutes=30)).isoformat()
    lower = (now - timedelta(minutes=60)).isoformat()

    # Find every settle in the 30–60 min window where we have a customer
    # to message. revenue_transactions.customer_id is set when the floor
    # operation either matched a member by phone or registered a new one.
    txns = db.table("revenue_transactions").select(
        "id, tenant_id, customer_id, settled_at, "
        "customers(name, phone)"
    ).gte("settled_at", lower).lte(
        "settled_at", upper,
    ).not_.is_("customer_id", "null").execute().data or []

    if not txns:
        return

    # Bulk-look-up which transactions already had feedback sent so we
    # only message each customer once per settle, even on re-runs.
    tx_ids = [t["id"] for t in txns]
    sent_rows = db.table("feedback_requests").select(
        "transaction_id"
    ).in_("transaction_id", tx_ids).execute().data or []
    already_sent = {r["transaction_id"] for r in sent_rows if r.get("transaction_id")}

    for tx in txns:
        if tx["id"] in already_sent:
            continue
        customer = tx.get("customers") or {}
        phone = customer.get("phone")
        if not phone:
            continue
        name = customer.get("name") or "Kak"

        # Tenant-aware message — pull the display name once per tenant
        # rather than once per row.
        tenant_name = bm._tenant_name(db, tx["tenant_id"])
        message = (
            f"Hai {name}! 😊\n\n"
            f"Makasih sudah mampir ke {tenant_name} tadi!\n"
            f"Gimana pengalamannya? Boleh kasih feedback singkat di sini ya:\n\n"
            f"👉 {GOOGLE_FORM_URL}\n\n"
            f"Setiap masukan benar-benar kami perhatiin 🙏"
        )
        await send_message(phone, message, tenant_id=tx["tenant_id"])

        db.table("feedback_requests").insert({
            "tenant_id": tx["tenant_id"],
            "customer_id": tx["customer_id"],
            "transaction_id": tx["id"],
        }).execute()


async def release_cleaning_tables():
    """Auto-release tables that have finished their 15-min cleaning window."""
    db = get_db()
    try:
        result = db.rpc("release_cleaning_tables").execute()
        released = result.data if result.data else 0
        if released:
            print(f"[Scheduler] Released {released} table(s) from cleaning")
    except Exception:
        # Fallback: direct update if RPC not available
        from datetime import datetime as dt
        db.table("tables").update({
            "status": "available",
            "cleaning_until": None,
        }).eq("status", "cleaning").lte(
            "cleaning_until", dt.now().isoformat()
        ).execute()


async def reconcile_reservations():
    """Flip tables between 'available' and 'reserved' based on the 3-hour
    booking window. Far-future bookings don't hold tables; walk-ins can
    take any currently available table."""
    from app.services.reservation_policy import reconcile_table_reservations
    db = get_db()
    try:
        result = reconcile_table_reservations(db)
        if result["reserved"] or result["released"]:
            print(
                f"[Scheduler] Reservations reconciled: "
                f"+{result['reserved']} reserved, -{result['released']} released"
            )
    except Exception as e:
        print(f"[Scheduler] reconcile_reservations error: {e}")


def start_scheduler():
    """Start the background scheduler."""
    # H-12 confirmation request — every 15 min (window 11–13h ahead).
    scheduler.add_job(send_h12_confirmations, "interval", minutes=15, id="h12_confirm")
    # H-30m attendance check — every 5 min (window 25–35 min ahead).
    scheduler.add_job(send_h30m_reminders, "interval", minutes=5, id="h30m_reminder")
    # Auto-cancel no-shows — every 5 min (T+15 min threshold).
    scheduler.add_job(auto_cancel_no_shows, "interval", minutes=5, id="auto_cancel_no_show")
    # Feedback request — every 5 min (window 30–60 min after settle).
    scheduler.add_job(send_feedback_requests, "interval", minutes=5, id="feedback")
    # Release cleaning tables every 1 minute
    scheduler.add_job(release_cleaning_tables, "interval", minutes=1, id="cleaning")
    # Reconcile reservation windows every 2 minutes (+ once on startup)
    scheduler.add_job(
        reconcile_reservations, "interval", minutes=2,
        id="reservation_reconcile", next_run_time=datetime.now(),
    )
    scheduler.start()
    print(
        "[Scheduler] Started — h12/15min, h30m/5min, no_show/5min, "
        "feedback/5min, cleaning/1min, reservations/2min"
    )


def shutdown_scheduler():
    """Gracefully shut down the scheduler."""
    scheduler.shutdown()
    print("[Scheduler] Stopped")
