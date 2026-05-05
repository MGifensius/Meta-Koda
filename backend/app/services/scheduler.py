"""
Scheduled tasks:
1. H-24 confirmation request (once, when ~24h to the booking).
2. H-1 hour reminder (once, when ~1h to the booking).
3. T+15min auto-cancel (no-show watcher).
4. Feedback requests (5 hours after reservation time).
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


async def send_h24_confirmations():
    """Pick up every reserved booking whose start is between 23 and 24 hours
    from now and that hasn't yet had a confirmation sent.

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
        if delta_hours < 22 or delta_hours > 26:
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


async def send_h1_reminders():
    """Send the final 'see you soon' ~1h before the booking. Idempotent via
    `reminder_sent_at`. Cancelled bookings are skipped."""
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
        if delta_minutes < 30 or delta_minutes > 90:
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
    """Send Google Form feedback link 5 hours after booking time.

    Logic:
    - Looks at all non-cancelled bookings whose booking time was ~5 hours ago.
    - Skips cancelled bookings entirely.
    - Skips bookings that already had a feedback request sent.
    - Sends a WhatsApp message with the Google Form link.
    """
    from app.config import GOOGLE_FORM_URL

    if not GOOGLE_FORM_URL:
        return

    db = get_db()
    now = datetime.now()
    today = now.strftime("%Y-%m-%d")

    # Also check yesterday's late bookings (e.g. 9pm booking → feedback at 2am)
    yesterday = (now - timedelta(days=1)).strftime("%Y-%m-%d")

    for check_date in [today, yesterday]:
        bookings = db.table("bookings").select(
            "*, customers(name, phone)"
        ).eq("date", check_date).neq(
            "status", "cancelled"
        ).execute().data

        for booking in bookings:
            # Calculate if 5 hours have passed since the booking time
            booking_datetime = datetime.strptime(
                f"{booking['date']} {booking['time']}", "%Y-%m-%d %H:%M"
            )
            hours_since = (now - booking_datetime).total_seconds() / 3600

            # Send between 5 and 6 hours after booking time (15-min check window)
            if hours_since < 5 or hours_since > 6:
                continue

            customer = booking.get("customers", {})
            if not customer or not customer.get("phone"):
                continue

            # Check if feedback already sent
            existing = db.table("feedback_requests").select("id").eq(
                "booking_id", booking["id"]
            ).execute()
            if existing.data:
                continue

            message = (
                f"Hai {customer['name']}! 😊\n\n"
                f"Makasih udah mampir ke Buranchi tadi!\n"
                f"Boleh minta waktunya sebentar buat kasih review?\n\n"
                f"👉 {GOOGLE_FORM_URL}\n\n"
                f"Feedback kamu sangat berarti buat kita 🙏"
            )
            await send_message(customer["phone"], message)

            # Mark as sent
            db.table("feedback_requests").insert({
                "booking_id": booking["id"],
                "customer_id": booking["customer_id"],
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
    # H-24 confirmation requests — every 30 min (window covers 22–26h ahead).
    scheduler.add_job(send_h24_confirmations, "interval", minutes=30, id="h24_confirm")
    # H-1 final reminder — every 15 min (window covers 30–90 min ahead).
    scheduler.add_job(send_h1_reminders, "interval", minutes=15, id="h1_reminder")
    # Auto-cancel no-shows — every 5 min (T+15 min threshold).
    scheduler.add_job(auto_cancel_no_shows, "interval", minutes=5, id="auto_cancel_no_show")
    # Run feedback checks every 15 minutes
    scheduler.add_job(send_feedback_requests, "interval", minutes=15, id="feedback")
    # Release cleaning tables every 1 minute
    scheduler.add_job(release_cleaning_tables, "interval", minutes=1, id="cleaning")
    # Reconcile reservation windows every 2 minutes (+ once on startup)
    scheduler.add_job(
        reconcile_reservations, "interval", minutes=2,
        id="reservation_reconcile", next_run_time=datetime.now(),
    )
    scheduler.start()
    print(
        "[Scheduler] Started — h24/30min, h1/15min, no_show/5min, "
        "feedback/15min, cleaning/1min, reservations/2min"
    )


def shutdown_scheduler():
    """Gracefully shut down the scheduler."""
    scheduler.shutdown()
    print("[Scheduler] Stopped")
