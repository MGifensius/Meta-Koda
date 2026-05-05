from fastapi import APIRouter, Depends, HTTPException
from app.db import get_db
from app.models.schemas import OrderCreate
from app.services.auth import current_user, CurrentUser

router = APIRouter()

POINT_VALUE = 1000  # 1 point = Rp 1.000 discount
EARN_RATE = 10000   # 1 point per Rp 10.000

# Tier multipliers for loyalty points
TIER_MULTIPLIER = {
    "Diamond": 2.0,
    "Gold": 1.5,
    "Silver": 1.2,
    "Bronze": 1.0,
}


# ============================================
# MENU
# ============================================

@router.get("/menu")
async def list_menu(
    include_unavailable: bool = False,
    user: CurrentUser = Depends(current_user),
):
    """List menu items. By default only available items are returned so POS
    and bot stay clean; owner Menu page passes include_unavailable=true."""
    db = get_db()
    query = db.table("menu_items").select("*").eq(
        "tenant_id", user.tenant_id
    ).order("category").order("name")
    if not include_unavailable:
        query = query.eq("is_available", True)
    return query.execute().data


@router.post("/menu", status_code=201)
async def create_menu_item(
    payload: dict,
    user: CurrentUser = Depends(current_user),
):
    db = get_db()
    name = (payload.get("name") or "").strip()
    category = (payload.get("category") or "").strip()
    try:
        price = int(payload.get("price") or 0)
    except (TypeError, ValueError):
        raise HTTPException(400, "price must be an integer")
    if not name or not category or price <= 0:
        raise HTTPException(400, "name, category, and positive price are required")
    row = {
        "name": name,
        "category": category,
        "price": price,
        "description": (payload.get("description") or "").strip(),
        "is_available": bool(payload.get("is_available", True)),
        "tenant_id": user.tenant_id,
    }
    result = db.table("menu_items").insert(row).execute()
    return result.data[0]


@router.patch("/menu/{item_id}")
async def update_menu_item(
    item_id: str,
    payload: dict,
    user: CurrentUser = Depends(current_user),
):
    db = get_db()
    allowed = {"name", "category", "price", "description", "is_available"}
    update = {k: v for k, v in payload.items() if k in allowed and v is not None}
    if "price" in update:
        try:
            update["price"] = int(update["price"])
        except (TypeError, ValueError):
            raise HTTPException(400, "price must be an integer")
        if update["price"] <= 0:
            raise HTTPException(400, "price must be positive")
    if not update:
        raise HTTPException(400, "No fields to update")
    result = db.table("menu_items").update(update).eq(
        "id", item_id
    ).eq("tenant_id", user.tenant_id).execute()
    if not result.data:
        raise HTTPException(404, "Menu item not found")
    return result.data[0]


@router.delete("/menu/{item_id}", status_code=204)
async def delete_menu_item(
    item_id: str,
    user: CurrentUser = Depends(current_user),
):
    db = get_db()
    db.table("menu_items").delete().eq(
        "id", item_id
    ).eq("tenant_id", user.tenant_id).execute()
    return None


# ============================================
# ORDERS
# ============================================

@router.get("/orders")
async def list_orders(
    status: str = "",
    user: CurrentUser = Depends(current_user),
):
    db = get_db()
    query = db.table("orders").select(
        "*, customers(name)"
    ).eq("tenant_id", user.tenant_id).order("created_at", desc=True)
    if status:
        query = query.eq("status", status)
    return query.execute().data


@router.post("/orders", status_code=201)
async def create_order(
    payload: OrderCreate,
    user: CurrentUser = Depends(current_user),
):
    db = get_db()

    subtotal = sum(item.price * item.qty for item in payload.items)
    discount = payload.points_used * POINT_VALUE
    total = max(0, subtotal - discount)

    # Tier multiplier + points spent. PR 8 will replace this direct mutation
    # with a loyalty_point_transactions ledger insert.
    multiplier = 1.0
    if payload.customer_id:
        customer = db.table("customers").select("points, tier").eq(
            "id", payload.customer_id
        ).eq("tenant_id", user.tenant_id).execute().data
        if customer:
            multiplier = TIER_MULTIPLIER.get(customer[0]["tier"], 1.0)
            if payload.points_used > 0:
                if customer[0]["points"] < payload.points_used:
                    raise HTTPException(400, "Insufficient points")
                db.table("customers").update({
                    "points": customer[0]["points"] - payload.points_used,
                }).eq("id", payload.customer_id).execute()

    points_earned = int((total // EARN_RATE) * multiplier)

    # Session detection: if this table already has open orders, we're an
    # add-on ticket — inherit the existing session_id and bump sequence.
    session_id = None
    sequence = 1
    if payload.table_id:
        existing = db.table("orders").select(
            "id, session_id, sequence"
        ).eq("tenant_id", user.tenant_id).eq(
            "table_id", payload.table_id
        ).eq("status", "open").order("sequence", desc=True).execute().data or []
        if existing:
            session_id = existing[0].get("session_id") or existing[0]["id"]
            sequence = (existing[0].get("sequence") or 1) + 1

    order_data = {
        "customer_id": payload.customer_id,
        "table_id": payload.table_id,
        "items": [item.model_dump() for item in payload.items],
        "subtotal": subtotal,
        "discount": discount,
        "points_used": payload.points_used,
        "total": total,
        "points_earned": points_earned,
        "status": "open",
        "tenant_id": user.tenant_id,
        "session_id": session_id,
        "sequence": sequence,
    }
    result = db.table("orders").insert(order_data).execute()
    new_id = result.data[0]["id"]

    if session_id is None:
        db.table("orders").update({"session_id": new_id}).eq("id", new_id).execute()
        result.data[0]["session_id"] = new_id

    if payload.customer_id and points_earned > 0:
        db.rpc("increment_points", {
            "cid": payload.customer_id,
            "amount": points_earned,
        }).execute()

    if payload.customer_id:
        db.rpc("increment_visit", {
            "cid": payload.customer_id,
            "spent": total,
        }).execute()

    return result.data[0]


@router.post("/orders/{order_id}/pay")
async def pay_order(
    order_id: str,
    method: str = "cash",
    user: CurrentUser = Depends(current_user),
):
    db = get_db()
    order = db.table("orders").select("*").eq("id", order_id).eq(
        "tenant_id", user.tenant_id
    ).execute().data
    if not order:
        raise HTTPException(404, "Order not found")
    result = db.table("orders").update({
        "status": "paid",
        "payment_method": method,
    }).eq("id", order_id).execute()
    return result.data[0]


@router.get("/orders/open")
async def list_open_orders(
    table_id: str = "",
    user: CurrentUser = Depends(current_user),
):
    """Return all open (unpaid, not cancelled) orders. Filter by table_id to
    show what a walk-in table currently owes before payment."""
    db = get_db()
    query = db.table("orders").select(
        "id, table_id, items, subtotal, discount, points_used, total, "
        "points_earned, status, kitchen_status, created_at, customer_id, "
        "customers(name)"
    ).eq("tenant_id", user.tenant_id).eq("status", "open").order("created_at")
    if table_id:
        query = query.eq("table_id", table_id)
    return query.execute().data or []


@router.post("/tables/{table_id}/pay")
async def pay_table(
    table_id: str,
    payload: dict,
    user: CurrentUser = Depends(current_user),
):
    """Pay every open order attached to a table in one shot (non-Xendit path)."""
    db = get_db()
    method = (payload.get("method") or "cash").strip()
    open_orders = db.table("orders").select("id").eq(
        "tenant_id", user.tenant_id
    ).eq("table_id", table_id).eq("status", "open").execute().data or []
    if not open_orders:
        raise HTTPException(404, "No open orders on this table")
    paid_ids = []
    for row in open_orders:
        db.table("orders").update({
            "status": "paid",
            "payment_method": method,
        }).eq("id", row["id"]).execute()
        paid_ids.append(row["id"])
    return {"paid_order_ids": paid_ids, "count": len(paid_ids)}


# ============================================
# XENDIT QRIS
# ============================================

import uuid as _uuid
from app.services.xendit import (
    create_qris as xendit_create_qris,
    is_live as xendit_is_live,
)


@router.post("/tables/{table_id}/qris")
async def create_table_qris(
    table_id: str,
    user: CurrentUser = Depends(current_user),
):
    """Create a QRIS payment request that covers every open order on this
    table. Returns the qr_string for the frontend to render + a payment_id
    the frontend polls while waiting for the customer to scan."""
    db = get_db()
    open_orders = db.table("orders").select("id, total").eq(
        "tenant_id", user.tenant_id
    ).eq("table_id", table_id).eq("status", "open").execute().data or []
    if not open_orders:
        raise HTTPException(404, "No open orders on this table")

    amount = sum(o.get("total") or 0 for o in open_orders)
    if amount <= 0:
        raise HTTPException(400, "Table total is zero; nothing to pay")

    external_id = f"table-{table_id}-{_uuid.uuid4().hex[:10]}"
    qr = await xendit_create_qris(external_id=external_id, amount=amount)

    row = {
        "table_id": table_id,
        "external_id": external_id,
        "xendit_qr_id": qr["xendit_qr_id"],
        "qr_string": qr["qr_string"],
        "amount": amount,
        "method": "qris",
        "status": "pending",
        "order_ids": [o["id"] for o in open_orders],
        "tenant_id": user.tenant_id,
    }
    created = db.table("payment_requests").insert(row).execute()
    payment_id = created.data[0]["id"]

    return {
        "payment_id": payment_id,
        "qr_string": qr["qr_string"],
        "amount": amount,
        "stub": qr.get("stub", False),
        "live": xendit_is_live(),
    }


@router.get("/payments/{payment_id}")
async def get_payment_request(
    payment_id: str,
    user: CurrentUser = Depends(current_user),
):
    db = get_db()
    rows = db.table("payment_requests").select("*").eq(
        "id", payment_id
    ).eq("tenant_id", user.tenant_id).execute().data or []
    if not rows:
        raise HTTPException(404, "Payment request not found")
    return rows[0]


@router.post("/payments/{payment_id}/simulate-paid")
async def simulate_payment_paid(
    payment_id: str,
    user: CurrentUser = Depends(current_user),
):
    """Dev helper: when Xendit keys aren't set, the cashier can click a
    'simulate scan' button to mark this payment as succeeded.
    Rejected in live mode to avoid bypassing real payments."""
    if xendit_is_live():
        raise HTTPException(
            403, "Simulation disabled when Xendit is configured with real keys"
        )
    # Verify ownership before flipping state.
    db = get_db()
    pr = db.table("payment_requests").select("id").eq(
        "id", payment_id
    ).eq("tenant_id", user.tenant_id).execute().data
    if not pr:
        raise HTTPException(404, "Payment request not found")
    _mark_payment_succeeded(payment_id)
    return {"ok": True, "payment_id": payment_id}


def _mark_payment_succeeded(payment_id: str) -> None:
    """Mark a payment_request succeeded and pay its linked orders.
    Shared by the simulate endpoint + Xendit webhook (which is unauthenticated
    but identifies the request via reference_id, so no user context here)."""
    db = get_db()
    rows = db.table("payment_requests").select("*").eq(
        "id", payment_id
    ).execute().data or []
    if not rows:
        raise HTTPException(404, "Payment request not found")
    pr = rows[0]
    if pr["status"] == "succeeded":
        return  # idempotent

    db.table("payment_requests").update({
        "status": "succeeded",
        "paid_at": "now()",
    }).eq("id", payment_id).execute()

    for order_id in pr.get("order_ids") or []:
        db.table("orders").update({
            "status": "paid",
            "payment_method": "qris",
        }).eq("id", order_id).execute()


# ============================================
# TABLES
# ============================================

@router.get("/tables")
async def list_tables(user: CurrentUser = Depends(current_user)):
    db = get_db()
    return db.table("tables").select("*").eq(
        "tenant_id", user.tenant_id
    ).order("id").execute().data


# ============================================
# KITCHEN PIPELINE (deprecated by PR 7 — POS rebuild kills the kitchen)
# ============================================

KITCHEN_STATES = ("received", "preparing", "done", "served")


@router.get("/kitchen/orders")
async def kitchen_orders(user: CurrentUser = Depends(current_user)):
    db = get_db()
    rows = db.table("orders").select(
        "id, table_id, items, kitchen_status, status, created_at, "
        "prep_started_at, prep_done_at, total, session_id, sequence, "
        "customers(name)"
    ).eq("tenant_id", user.tenant_id).in_(
        "kitchen_status", ["received", "preparing", "done"]
    ).neq("status", "cancelled").order("created_at").execute().data or []
    return rows


@router.get("/kitchen/stats")
async def kitchen_stats(user: CurrentUser = Depends(current_user)):
    """Kitchen performance stats for today (initial vs add-on tickets)."""
    from datetime import datetime, timezone

    db = get_db()
    now = datetime.now(timezone.utc)
    today = now.strftime("%Y-%m-%d")
    rows = db.table("orders").select(
        "id, created_at, prep_started_at, prep_done_at, sequence, kitchen_status"
    ).eq("tenant_id", user.tenant_id).gte(
        "created_at", f"{today}T00:00:00"
    ).execute().data or []

    def _secs(start: str | None, end: str | None) -> int | None:
        if not start or not end:
            return None
        try:
            s = datetime.fromisoformat(start.replace("Z", "+00:00"))
            e = datetime.fromisoformat(end.replace("Z", "+00:00"))
            return max(0, int((e - s).total_seconds()))
        except (ValueError, TypeError):
            return None

    TARGET_INITIAL = 15 * 60
    TARGET_ADDON = 8 * 60

    initial_prep: list[int] = []
    addon_prep: list[int] = []
    initial_hit = addon_hit = 0
    done_or_served = 0

    for r in rows:
        if r.get("kitchen_status") not in ("done", "served"):
            continue
        prep = _secs(r.get("prep_started_at"), r.get("prep_done_at"))
        if prep is None:
            continue
        done_or_served += 1
        is_addon = (r.get("sequence") or 1) > 1
        if is_addon:
            addon_prep.append(prep)
            if prep <= TARGET_ADDON:
                addon_hit += 1
        else:
            initial_prep.append(prep)
            if prep <= TARGET_INITIAL:
                initial_hit += 1

    def _avg(xs: list[int]) -> int:
        return int(sum(xs) / len(xs)) if xs else 0

    return {
        "date": today,
        "completed_today": done_or_served,
        "avg_prep_initial_seconds": _avg(initial_prep),
        "avg_prep_addon_seconds": _avg(addon_prep),
        "target_initial_seconds": TARGET_INITIAL,
        "target_addon_seconds": TARGET_ADDON,
        "on_target_initial_count": initial_hit,
        "on_target_addon_count": addon_hit,
        "initial_count": len(initial_prep),
        "addon_count": len(addon_prep),
    }


@router.patch("/orders/{order_id}/kitchen")
async def advance_kitchen_status(
    order_id: str,
    payload: dict,
    user: CurrentUser = Depends(current_user),
):
    next_status = (payload.get("kitchen_status") or "").strip()
    if next_status not in KITCHEN_STATES:
        raise HTTPException(400, f"kitchen_status must be one of {KITCHEN_STATES}")
    db = get_db()
    update: dict = {"kitchen_status": next_status}
    if next_status == "preparing":
        update["prep_started_at"] = "now()"
    elif next_status == "done":
        update["prep_done_at"] = "now()"
    result = db.table("orders").update(update).eq(
        "id", order_id
    ).eq("tenant_id", user.tenant_id).execute()
    if not result.data:
        raise HTTPException(404, "Order not found")
    return result.data[0]
