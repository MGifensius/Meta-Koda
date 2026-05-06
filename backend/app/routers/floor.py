"""Floor Operation — manual bill-input flow that replaces the old POS.

The model:
  Available → (booking arrives) → Reserved → (seated) → Occupied
                                                            ↓ Settle
  Available ← (cleaning timer) ←   Cleaning   ← (revenue logged)

Each settle inserts a row in `revenue_transactions` and flips the table
to `cleaning`. The 15-minute timer + auto-release is handled by the
existing triggers/scheduler from earlier migrations.
"""

from __future__ import annotations

from datetime import datetime, timedelta, timezone
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException

from app.db import get_db
from app.services.auth import current_user, CurrentUser, require_tenant
from app.services import loyalty as loyalty_svc

router = APIRouter()

CLEANING_MINUTES = 15


# ----------------------------------------------------------
# Tables (read)
# ----------------------------------------------------------
@router.get("/tables")
async def list_tables(user: CurrentUser = Depends(require_tenant)):
    """Floor plan view — every table for this tenant with current status."""
    db = get_db()
    rows = db.table("tables").select(
        "id, capacity, zone, status, current_booking_id, cleaning_until"
    ).eq("tenant_id", user.tenant_id).order("id").execute().data or []

    # Attach the booked customer summary (name + phone) for any table with
    # an active booking — saves the frontend an extra round-trip.
    booking_ids = [t["current_booking_id"] for t in rows if t.get("current_booking_id")]
    bk_by_id: dict = {}
    if booking_ids:
        bks = db.table("bookings").select(
            "id, customer_id, guest_name, party_size, customers(id, name, phone, points, tier, is_member)"
        ).in_("id", booking_ids).execute().data or []
        bk_by_id = {b["id"]: b for b in bks}
    for t in rows:
        bid = t.get("current_booking_id")
        t["booking"] = bk_by_id.get(bid) if bid else None
    return rows


# ----------------------------------------------------------
# Table management (settings — owner-only edits)
# ----------------------------------------------------------
@router.patch("/tables/{table_id}")
async def update_table(
    table_id: str,
    payload: dict,
    user: CurrentUser = Depends(require_tenant),
):
    """Update a table's capacity or zone label. Only `capacity` and `zone`
    are accepted; status / current_booking_id are managed by the floor
    operation flow, not by direct edits."""
    if user.role not in ("tenant_owner", "super_admin"):
        raise HTTPException(403, "Only owners can edit tables")
    allowed = {}
    if "capacity" in payload:
        try:
            cap = int(payload["capacity"])
        except (TypeError, ValueError):
            raise HTTPException(422, "capacity must be an integer")
        if cap < 1 or cap > 50:
            raise HTTPException(422, "capacity must be between 1 and 50")
        allowed["capacity"] = cap
    if "zone" in payload:
        zone = (payload["zone"] or "").strip()
        if not zone or len(zone) > 60:
            raise HTTPException(422, "zone must be 1–60 characters")
        allowed["zone"] = zone
    if not allowed:
        raise HTTPException(422, "Nothing to update — pass capacity or zone")

    db = get_db()
    res = db.table("tables").update(allowed).eq(
        "id", table_id
    ).eq("tenant_id", user.tenant_id).execute()
    if not res.data:
        raise HTTPException(404, f"Table {table_id} not found")
    return res.data[0]


@router.post("/tables", status_code=201)
async def create_table(
    payload: dict,
    user: CurrentUser = Depends(require_tenant),
):
    """Add a new table. `id` must be unique per tenant — typically a short
    code like `TO-7` or `IL-8`."""
    if user.role not in ("tenant_owner", "super_admin"):
        raise HTTPException(403, "Only owners can create tables")
    table_id = (payload.get("id") or "").strip()
    if not table_id or len(table_id) > 20:
        raise HTTPException(422, "id required (1–20 chars)")
    try:
        capacity = int(payload.get("capacity", 0))
    except (TypeError, ValueError):
        raise HTTPException(422, "capacity must be an integer")
    if capacity < 1 or capacity > 50:
        raise HTTPException(422, "capacity must be between 1 and 50")
    zone = (payload.get("zone") or "").strip() or "Main"

    db = get_db()
    existing = db.table("tables").select("id").eq(
        "tenant_id", user.tenant_id
    ).eq("id", table_id).execute().data
    if existing:
        raise HTTPException(409, f"Table {table_id} already exists")

    res = db.table("tables").insert({
        "id": table_id,
        "capacity": capacity,
        "zone": zone,
        "status": "available",
        "tenant_id": user.tenant_id,
    }).execute()
    return res.data[0]


@router.delete("/tables/{table_id}")
async def delete_table(
    table_id: str,
    user: CurrentUser = Depends(require_tenant),
):
    """Remove a table. Refuses if the table is currently occupied or has
    any future bookings — clean those up first."""
    if user.role not in ("tenant_owner", "super_admin"):
        raise HTTPException(403, "Only owners can delete tables")
    db = get_db()
    rows = db.table("tables").select("status").eq(
        "tenant_id", user.tenant_id
    ).eq("id", table_id).execute().data
    if not rows:
        raise HTTPException(404, f"Table {table_id} not found")
    if rows[0]["status"] == "occupied":
        raise HTTPException(
            409, f"Table {table_id} is occupied. Settle the bill before deleting.",
        )
    today = datetime.now(timezone.utc).date().isoformat()
    future = db.table("bookings").select("id").eq(
        "tenant_id", user.tenant_id
    ).eq("table_id", table_id).gte("date", today).in_(
        "status", ["reserved", "occupied"],
    ).limit(1).execute().data
    if future:
        raise HTTPException(
            409,
            f"Table {table_id} has upcoming bookings — cancel them first.",
        )
    db.table("tables").delete().eq("id", table_id).eq(
        "tenant_id", user.tenant_id
    ).execute()
    return {"ok": True}


# ----------------------------------------------------------
# Customer phone lookup (for the settle modal)
# ----------------------------------------------------------
@router.get("/customers/lookup")
async def lookup_customer_by_phone(
    phone: str = "",
    user: CurrentUser = Depends(require_tenant),
):
    """Find a customer by phone within the current tenant. Returns null when
    not found (200 with body, not 404) so the frontend can render a
    'register?' prompt without flagging a network error."""
    p = (phone or "").strip()
    if not p:
        return {"customer": None}
    db = get_db()
    rows = db.table("customers").select(
        "id, name, phone, points, tier, is_member"
    ).eq("tenant_id", user.tenant_id).eq("phone", p).limit(1).execute().data or []
    return {"customer": rows[0] if rows else None}


# ----------------------------------------------------------
# Status transitions
# ----------------------------------------------------------
@router.post("/tables/{table_id}/seat")
async def seat_table(
    table_id: str,
    payload: Optional[dict] = None,
    user: CurrentUser = Depends(require_tenant),
):
    """Walk-in: mark Available → Occupied. Used when a customer is seated
    without a prior booking."""
    db = get_db()
    rows = db.table("tables").select("status").eq(
        "tenant_id", user.tenant_id
    ).eq("id", table_id).execute().data
    if not rows:
        raise HTTPException(404, "Table not found")
    if rows[0]["status"] not in ("available", "reserved"):
        raise HTTPException(
            400,
            f"Cannot seat a table that is currently '{rows[0]['status']}'.",
        )
    db.table("tables").update({
        "status": "occupied",
    }).eq("id", table_id).eq("tenant_id", user.tenant_id).execute()
    return {"ok": True, "status": "occupied"}


@router.post("/tables/{table_id}/settle")
async def settle_table(
    table_id: str,
    payload: dict,
    user: CurrentUser = Depends(require_tenant),
):
    """Customer is leaving — log the manually-entered bill total, flip the
    table to `cleaning`, set the 15-minute cleaning timer, and (optionally)
    attribute the revenue + loyalty points to a customer.

    Customer attribution priority:
      1. If the table has `current_booking_id`, pull its customer.
      2. Else if `customer_phone` is provided, look it up.
         a) Match → award points to that customer.
         b) No match + `register_new=true` → create a new customer (Bronze
            tier, member=true) using `customer_name` + phone.
         c) No match + `register_new=false` → settle without customer link.
      3. Else → walk-in non-member, settle with no points.

    Body:
      amount         (int, required)  — total bill in IDR (no decimals)
      payment_method (str, default 'cash')
      cover_count    (int, optional)
      notes          (str, optional)
      customer_phone (str, optional)  — for walk-ins
      customer_name  (str, optional)  — only used when register_new=true
      register_new   (bool, default false)
    """
    try:
        amount = int(payload.get("amount") or 0)
    except (TypeError, ValueError):
        raise HTTPException(400, "amount must be an integer")
    if amount < 0:
        raise HTTPException(400, "amount must be non-negative")
    payment_method = (payload.get("payment_method") or "cash").strip().lower()
    if payment_method not in ("cash", "qris", "card", "transfer", "other"):
        raise HTTPException(400, "invalid payment_method")
    cover_count = payload.get("cover_count")
    notes = (payload.get("notes") or "").strip() or None
    cust_phone = (payload.get("customer_phone") or "").strip() or None
    cust_name = (payload.get("customer_name") or "").strip() or None
    register_new = bool(payload.get("register_new"))

    db = get_db()
    trows = db.table("tables").select("status, current_booking_id").eq(
        "tenant_id", user.tenant_id
    ).eq("id", table_id).execute().data
    if not trows:
        raise HTTPException(404, "Table not found")
    table = trows[0]
    if table["status"] != "occupied":
        raise HTTPException(
            400,
            f"Only occupied tables can be settled; this one is '{table['status']}'.",
        )

    # ---------- Resolve customer ----------
    customer_id: Optional[str] = None
    booking_id: Optional[str] = table.get("current_booking_id")
    if booking_id:
        bk = db.table("bookings").select("customer_id").eq(
            "id", booking_id
        ).execute().data
        if bk and bk[0].get("customer_id"):
            customer_id = bk[0]["customer_id"]
    elif cust_phone:
        existing = db.table("customers").select("id").eq(
            "tenant_id", user.tenant_id
        ).eq("phone", cust_phone).limit(1).execute().data
        if existing:
            customer_id = existing[0]["id"]
        elif register_new:
            if not cust_name:
                raise HTTPException(
                    400,
                    "customer_name is required when registering a new member.",
                )
            new_cust = db.table("customers").insert({
                "tenant_id": user.tenant_id,
                "name": cust_name,
                "phone": cust_phone,
                "is_member": True,
                "points": 0,
                "total_visits": 0,
                "total_spent": 0,
                "tier": "Bronze",
            }).execute().data
            customer_id = new_cust[0]["id"] if new_cust else None
            # New member → award the configured signup bonus (0 by default).
            if customer_id:
                loyalty_svc.grant_signup_bonus(
                    db,
                    tenant_id=user.tenant_id,
                    customer_id=customer_id,
                    actor_id=user.id,
                )

    # ---------- Update visit metrics (separate from points) ----------
    if customer_id:
        cust = db.table("customers").select(
            "total_visits, total_spent"
        ).eq("id", customer_id).execute().data
        if cust:
            c = cust[0]
            db.table("customers").update({
                "total_visits": (c.get("total_visits") or 0) + 1,
                "total_spent": (c.get("total_spent") or 0) + amount,
                "last_visit": datetime.now(timezone.utc).isoformat(),
            }).eq("id", customer_id).execute()

    # ---------- Log revenue (points filled in below after the ledger row) ----------
    tx = db.table("revenue_transactions").insert({
        "tenant_id": user.tenant_id,
        "table_id": table_id,
        "customer_id": customer_id,
        "booking_id": booking_id,
        "amount": amount,
        "payment_method": payment_method,
        "cover_count": cover_count,
        "notes": notes,
        "points_awarded": 0,
        "settled_by": user.id,
    }).execute().data[0]

    # ---------- Award loyalty via the ledger (single source of truth) ----------
    points_awarded = 0
    if customer_id:
        points_awarded = loyalty_svc.award_points_for_settle(
            db,
            tenant_id=user.tenant_id,
            customer_id=customer_id,
            amount=amount,
            source_tx_id=tx["id"],
            actor_id=user.id,
        )
        if points_awarded > 0:
            db.table("revenue_transactions").update({
                "points_awarded": points_awarded,
            }).eq("id", tx["id"]).execute()
            tx["points_awarded"] = points_awarded

    # ---------- Flip table → cleaning ----------
    cleaning_until = datetime.now(timezone.utc) + timedelta(minutes=CLEANING_MINUTES)
    db.table("tables").update({
        "status": "cleaning",
        "cleaning_until": cleaning_until.isoformat(),
        "current_booking_id": None,
    }).eq("id", table_id).eq("tenant_id", user.tenant_id).execute()

    # If the table came from a booking, mark the booking done so it stops
    # showing as active in the bookings view.
    if booking_id:
        db.table("bookings").update({"status": "done"}).eq(
            "id", booking_id
        ).eq("tenant_id", user.tenant_id).execute()

    # Refresh customer for the response so the toast can show updated points.
    customer_summary = None
    if customer_id:
        cs = db.table("customers").select(
            "id, name, phone, points, tier, is_member"
        ).eq("id", customer_id).execute().data
        if cs:
            customer_summary = cs[0]

    return {
        "ok": True,
        "transaction": tx,
        "customer": customer_summary,
        "points_awarded": points_awarded,
        "cleaning_until": cleaning_until.isoformat(),
    }


@router.post("/tables/{table_id}/clean")
async def clean_table(
    table_id: str,
    user: CurrentUser = Depends(require_tenant),
):
    """Skip the cleaning timer — flip Cleaning → Available immediately."""
    db = get_db()
    rows = db.table("tables").select("status").eq(
        "tenant_id", user.tenant_id
    ).eq("id", table_id).execute().data
    if not rows:
        raise HTTPException(404, "Table not found")
    if rows[0]["status"] != "cleaning":
        raise HTTPException(
            400,
            f"Only cleaning tables can be reset; this one is '{rows[0]['status']}'.",
        )
    db.table("tables").update({
        "status": "available",
        "cleaning_until": None,
    }).eq("id", table_id).eq("tenant_id", user.tenant_id).execute()
    return {"ok": True, "status": "available"}


# ----------------------------------------------------------
# Revenue summaries
# ----------------------------------------------------------
@router.get("/today")
async def today_summary(user: CurrentUser = Depends(require_tenant)):
    """Today's revenue + transaction count, for the floor page header."""
    db = get_db()
    start = datetime.now(timezone.utc).replace(hour=0, minute=0, second=0, microsecond=0)
    rows = db.table("revenue_transactions").select(
        "amount, payment_method, cover_count"
    ).eq("tenant_id", user.tenant_id).gte(
        "settled_at", start.isoformat()
    ).execute().data or []

    total = sum(r["amount"] for r in rows)
    by_method: dict[str, int] = {}
    for r in rows:
        m = r.get("payment_method") or "other"
        by_method[m] = by_method.get(m, 0) + (r["amount"] or 0)
    covers = sum((r.get("cover_count") or 0) for r in rows)

    return {
        "transaction_count": len(rows),
        "revenue_total": total,
        "revenue_by_method": by_method,
        "cover_count": covers,
        "avg_check": (total // len(rows)) if rows else 0,
    }


@router.get("/transactions")
async def list_transactions(
    limit: int = 50,
    user: CurrentUser = Depends(require_tenant),
):
    """Recent settled bills — for an audit drawer or transaction list."""
    db = get_db()
    return db.table("revenue_transactions").select(
        "id, table_id, amount, payment_method, cover_count, notes, settled_at, "
        "users(name, email)"
    ).eq("tenant_id", user.tenant_id).order(
        "settled_at", desc=True
    ).limit(min(limit, 200)).execute().data or []
