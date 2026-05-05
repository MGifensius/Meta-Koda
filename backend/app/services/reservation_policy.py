"""
Reservation time policy.

A table only transitions to 'reserved' when the booking is within the
RESERVE_WINDOW_HOURS window (default 3h). Before that, the table remains
'available' so walk-in customers can use it.

The DB trigger `booking_insert_reserve` eagerly flips the table to 'reserved'
on INSERT; we undo that here for far-future bookings. A background scheduler
job then flips tables to 'reserved' as bookings enter the window.
"""

from datetime import datetime, timedelta

RESERVE_WINDOW_HOURS = 3


def _booking_datetime(date: str, time: str) -> datetime:
    # Accept HH:MM or HH:MM:SS
    if time.count(":") == 2:
        time = time[:5]
    return datetime.strptime(f"{date} {time}", "%Y-%m-%d %H:%M")


def apply_booking_insert_policy(db, booking_id: str, table_id: str,
                                 date: str, time: str) -> None:
    """After a booking is inserted, revert the table to 'available' if the
    booking is farther than RESERVE_WINDOW_HOURS in the future. The trigger
    already flipped it to 'reserved'; we undo that for far-off bookings.
    """
    if not table_id:
        return
    try:
        booking_dt = _booking_datetime(date, time)
    except ValueError:
        return
    hours_until = (booking_dt - datetime.now()).total_seconds() / 3600
    if hours_until <= RESERVE_WINDOW_HOURS:
        return
    # Far-future booking: table should stay available for walk-ins.
    # Only revert if it's currently reserved for THIS booking (don't clobber
    # a different imminent booking that claimed the same table).
    tbl = db.table("tables").select("status, current_booking_id").eq(
        "id", table_id
    ).single().execute()
    if not tbl.data:
        return
    if tbl.data.get("status") == "reserved" and tbl.data.get("current_booking_id") == booking_id:
        db.table("tables").update({
            "status": "available",
            "current_booking_id": None,
        }).eq("id", table_id).execute()


def reconcile_table_reservations(db) -> dict:
    """Sync table.status against bookings based on the 3-hour rule.

    - Imminent bookings (within the window) → their 'available' tables flip to 'reserved'.
    - Far-future bookings holding a 'reserved' table → table flips back to 'available'.
    - Tables 'occupied' or 'cleaning' are left alone (active service).

    Returns counts for logging.
    """
    now = datetime.now()
    cutoff = now + timedelta(hours=RESERVE_WINDOW_HOURS)
    today = now.strftime("%Y-%m-%d")
    cutoff_date = cutoff.strftime("%Y-%m-%d")

    reserved_count = 0
    released_count = 0

    # Pull all future reserved bookings from today + cutoff day.
    dates = [today] if today == cutoff_date else [today, cutoff_date]
    bookings = []
    for d in dates:
        rows = db.table("bookings").select(
            "id, table_id, date, time, status"
        ).eq("date", d).eq("status", "reserved").execute().data or []
        bookings.extend(rows)

    # Also any booking currently tied to a reserved table, even if on another date
    reserved_tables = db.table("tables").select(
        "id, status, current_booking_id"
    ).eq("status", "reserved").execute().data or []

    for t in reserved_tables:
        booking_id = t.get("current_booking_id")
        if not booking_id:
            continue
        # If the booking is not in our window-slice above, fetch it
        if not any(b["id"] == booking_id for b in bookings):
            b = db.table("bookings").select(
                "id, table_id, date, time, status"
            ).eq("id", booking_id).single().execute().data
            if b:
                bookings.append(b)

    # Deduplicate
    seen = set()
    deduped = []
    for b in bookings:
        if b["id"] in seen:
            continue
        seen.add(b["id"])
        deduped.append(b)
    bookings = deduped

    for b in bookings:
        if not b.get("table_id"):
            continue
        try:
            booking_dt = _booking_datetime(b["date"], b["time"])
        except ValueError:
            continue

        tbl = db.table("tables").select(
            "id, status, current_booking_id"
        ).eq("id", b["table_id"]).single().execute().data
        if not tbl:
            continue
        status = tbl.get("status")
        current_bid = tbl.get("current_booking_id")

        imminent = now <= booking_dt <= cutoff

        if imminent and status == "available":
            db.table("tables").update({
                "status": "reserved",
                "current_booking_id": b["id"],
            }).eq("id", b["table_id"]).execute()
            reserved_count += 1
        elif not imminent and status == "reserved" and current_bid == b["id"]:
            db.table("tables").update({
                "status": "available",
                "current_booking_id": None,
            }).eq("id", b["table_id"]).execute()
            released_count += 1

    return {"reserved": reserved_count, "released": released_count}
