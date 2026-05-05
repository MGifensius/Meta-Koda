from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException

from app.db import get_db
from app.models.schemas import BookingCreate, BookingUpdate
from app.services.auth import current_user, CurrentUser
from app.services import booking_messages as bm

router = APIRouter()


@router.get("/")
async def list_bookings(
    date: str = "",
    status: str = "",
    user: CurrentUser = Depends(current_user),
):
    db = get_db()
    query = db.table("bookings").select(
        "*, customers(name)"
    ).eq("tenant_id", user.tenant_id).order("date").order("time")
    if date:
        query = query.eq("date", date)
    if status:
        query = query.eq("status", status)
    result = query.execute()
    return result.data


@router.get("/{booking_id}")
async def get_booking(booking_id: str, user: CurrentUser = Depends(current_user)):
    db = get_db()
    result = db.table("bookings").select(
        "*, customers(name, phone)"
    ).eq("id", booking_id).eq("tenant_id", user.tenant_id).execute()
    if not result.data:
        raise HTTPException(404, "Booking not found")
    return result.data[0]


@router.post("/", status_code=201)
async def create_booking(
    payload: BookingCreate,
    user: CurrentUser = Depends(current_user),
):
    db = get_db()

    # Check 15-min cleaning buffer — reject if table is in cleaning state
    table = db.table("tables").select("status, cleaning_until").eq(
        "id", payload.table_id
    ).eq("tenant_id", user.tenant_id).execute().data
    if table and table[0]["status"] == "cleaning":
        raise HTTPException(
            409,
            f"Table {payload.table_id} is being cleaned. Available after turnover."
        )

    result = db.table("bookings").insert({
        "customer_id": payload.customer_id,
        "date": payload.date,
        "time": payload.time,
        "party_size": payload.party_size,
        "table_id": payload.table_id,
        "seating": payload.seating,
        "guest_name": payload.guest_name,
        "customer_phone": payload.customer_phone,
        "notes": payload.notes,
        "status": "reserved",
        "tenant_id": user.tenant_id,
        "channel": "dashboard",
    }).execute()
    # DB trigger flipped the table to 'reserved'. Revert to 'available'
    # if the booking is more than 3h away so walk-ins can use it.
    from app.services.reservation_policy import apply_booking_insert_policy
    apply_booking_insert_policy(
        db, result.data[0]["id"], payload.table_id, payload.date, payload.time
    )
    bm.log_event(
        db,
        tenant_id=user.tenant_id,
        booking_id=result.data[0]["id"],
        event_type="created",
        payload={"channel": "dashboard", "party_size": payload.party_size},
        actor_id=user.id,
    )
    return result.data[0]


@router.patch("/{booking_id}")
async def update_booking(
    booking_id: str,
    payload: BookingUpdate,
    user: CurrentUser = Depends(current_user),
):
    db = get_db()
    update_data = payload.model_dump(exclude_none=True)
    if not update_data:
        raise HTTPException(400, "No fields to update")
    result = db.table("bookings").update(update_data).eq(
        "id", booking_id
    ).eq("tenant_id", user.tenant_id).execute()
    if not result.data:
        raise HTTPException(404, "Booking not found")
    return result.data[0]


@router.post("/{booking_id}/checkin")
async def checkin_booking(
    booking_id: str,
    user: CurrentUser = Depends(current_user),
):
    db = get_db()
    booking = db.table("bookings").select("*").eq(
        "id", booking_id
    ).eq("tenant_id", user.tenant_id).execute().data
    if not booking:
        raise HTTPException(404, "Booking not found")
    if booking[0]["status"] != "reserved":
        raise HTTPException(400, "Booking must be in reserved status to check in")
    result = db.table("bookings").update({"status": "occupied"}).eq("id", booking_id).execute()
    # Table status updated by DB trigger
    return result.data[0]


@router.post("/{booking_id}/done")
async def done_booking(
    booking_id: str,
    user: CurrentUser = Depends(current_user),
):
    db = get_db()
    booking = db.table("bookings").select("*").eq(
        "id", booking_id
    ).eq("tenant_id", user.tenant_id).execute().data
    if not booking:
        raise HTTPException(404, "Booking not found")
    if booking[0]["status"] != "occupied":
        raise HTTPException(400, "Booking must be in occupied status to mark as done")
    result = db.table("bookings").update({"status": "done"}).eq("id", booking_id).execute()
    # Table goes to "cleaning" state via DB trigger (15-min buffer)
    return result.data[0]


@router.post("/{booking_id}/cancel")
async def cancel_booking(
    booking_id: str,
    user: CurrentUser = Depends(current_user),
):
    db = get_db()
    booking = db.table("bookings").select("*").eq(
        "id", booking_id
    ).eq("tenant_id", user.tenant_id).execute().data
    if not booking:
        raise HTTPException(404, "Booking not found")
    result = db.table("bookings").update({"status": "cancelled"}).eq("id", booking_id).execute()
    # Table freed by DB trigger
    return result.data[0]


@router.post("/{booking_id}/noshow")
async def noshow_booking(
    booking_id: str,
    user: CurrentUser = Depends(current_user),
):
    """Mark a reserved booking as no-show. Frees the table immediately."""
    db = get_db()
    booking = db.table("bookings").select("*").eq(
        "id", booking_id
    ).eq("tenant_id", user.tenant_id).execute().data
    if not booking:
        raise HTTPException(404, "Booking not found")
    if booking[0]["status"] != "reserved":
        raise HTTPException(400, "Only reserved bookings can be marked as no-show")
    result = db.table("bookings").update({"status": "no_show"}).eq("id", booking_id).execute()
    # Table freed by DB trigger
    return result.data[0]


# ----------------------------------------------------------
# Confirmation flow (PR 10)
# ----------------------------------------------------------
@router.post("/{booking_id}/resend-confirmation")
async def resend_confirmation(
    booking_id: str,
    user: CurrentUser = Depends(current_user),
):
    """Manually re-send the H-24 confirmation message. Resets confirmation
    state to 'sent' so the H-1 reminder still fires later."""
    db = get_db()
    rows = db.table("bookings").select(
        "*, customers(name, phone)"
    ).eq("id", booking_id).eq("tenant_id", user.tenant_id).execute().data
    if not rows:
        raise HTTPException(404, "Booking not found")
    booking = rows[0]
    if booking["status"] in ("cancelled", "no_show", "done"):
        raise HTTPException(400, "Cannot resend on a closed booking")

    sent = await bm.send_confirmation(db, booking, user.tenant_id)
    if not sent:
        raise HTTPException(400, "No phone number on this booking")

    db.table("bookings").update({
        "confirmation_state": "sent",
        "confirmation_sent_at": datetime.now(timezone.utc).isoformat(),
    }).eq("id", booking_id).execute()
    bm.log_event(
        db,
        tenant_id=user.tenant_id,
        booking_id=booking_id,
        event_type="manual_resend",
        actor_id=user.id,
    )
    return {"ok": True}


@router.post("/{booking_id}/confirm")
async def mark_confirmed(
    booking_id: str,
    payload: dict | None = None,
    user: CurrentUser = Depends(current_user),
):
    """Mark a booking as confirmed (the customer replied 'YA' on WhatsApp).

    Today this is called manually by staff; once webhook routing lands in
    PR 6, the inbound message classifier will call this directly.
    """
    db = get_db()
    rows = db.table("bookings").select("status").eq(
        "id", booking_id
    ).eq("tenant_id", user.tenant_id).execute().data
    if not rows:
        raise HTTPException(404, "Booking not found")
    if rows[0]["status"] in ("cancelled", "no_show", "done"):
        raise HTTPException(400, "Cannot confirm a closed booking")

    db.table("bookings").update({
        "confirmation_state": "confirmed",
    }).eq("id", booking_id).execute()
    bm.log_event(
        db,
        tenant_id=user.tenant_id,
        booking_id=booking_id,
        event_type="confirmed",
        payload=payload or {},
        actor_id=user.id,
    )
    return {"ok": True}


@router.post("/{booking_id}/decline")
async def mark_declined(
    booking_id: str,
    payload: dict | None = None,
    user: CurrentUser = Depends(current_user),
):
    """Customer declined — cancel the booking and free the table."""
    db = get_db()
    rows = db.table("bookings").select("status").eq(
        "id", booking_id
    ).eq("tenant_id", user.tenant_id).execute().data
    if not rows:
        raise HTTPException(404, "Booking not found")
    if rows[0]["status"] in ("cancelled", "no_show", "done"):
        return {"ok": True, "already_closed": True}

    now = datetime.now(timezone.utc).isoformat()
    db.table("bookings").update({
        "status": "cancelled",
        "confirmation_state": "declined",
        "cancelled_reason": "customer_declined",
        "cancelled_at": now,
    }).eq("id", booking_id).execute()
    bm.log_event(
        db,
        tenant_id=user.tenant_id,
        booking_id=booking_id,
        event_type="declined",
        payload=payload or {},
        actor_id=user.id,
    )
    return {"ok": True}


@router.get("/{booking_id}/events")
async def list_events(
    booking_id: str,
    user: CurrentUser = Depends(current_user),
):
    db = get_db()
    return db.table("booking_events").select(
        "id, event_type, payload, created_at, users(name, email)"
    ).eq("tenant_id", user.tenant_id).eq(
        "booking_id", booking_id
    ).order("created_at", desc=True).execute().data or []
