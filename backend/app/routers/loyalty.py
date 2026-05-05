from fastapi import APIRouter, Depends, HTTPException
from app.db import get_db
from app.models.schemas import RewardCreate, RedeemRequest
from app.services.auth import current_user, CurrentUser, require_tenant
from app.services import loyalty as loyalty_svc

router = APIRouter()


# ----------------------------------------------------------
# Per-tenant loyalty settings
# ----------------------------------------------------------
@router.get("/settings")
async def get_loyalty_settings(user: CurrentUser = Depends(require_tenant)):
    db = get_db()
    return loyalty_svc._get_settings(db, user.tenant_id)


@router.patch("/settings")
async def update_loyalty_settings(
    payload: dict,
    user: CurrentUser = Depends(require_tenant),
):
    """Tenant-owner / super_admin tunes the earn rate + redemption value."""
    if user.role not in ("tenant_owner", "super_admin"):
        raise HTTPException(403, "Only tenant_owner or super_admin may edit loyalty settings")
    allowed = {
        "points_per_rupiah", "tier_multiplier_enabled",
        "signup_bonus", "redemption_value_idr", "is_active",
    }
    update = {k: v for k, v in payload.items() if k in allowed and v is not None}
    if not update:
        raise HTTPException(400, "No editable fields supplied")
    if "points_per_rupiah" in update and int(update["points_per_rupiah"]) <= 0:
        raise HTTPException(400, "points_per_rupiah must be positive")
    db = get_db()
    # Ensure a row exists (creates default if missing) before patching.
    loyalty_svc._get_settings(db, user.tenant_id)
    res = db.table("loyalty_settings").update(update).eq(
        "tenant_id", user.tenant_id
    ).execute()
    return res.data[0] if res.data else {}


# ----------------------------------------------------------
# Customer ledger views + manual adjustments
# ----------------------------------------------------------
@router.get("/customers/{customer_id}/ledger")
async def customer_ledger(
    customer_id: str,
    limit: int = 50,
    user: CurrentUser = Depends(require_tenant),
):
    db = get_db()
    rows = db.table("loyalty_ledger").select(
        "id, delta, reason, source_id, notes, balance_after, created_at, "
        "users(name, email)"
    ).eq("tenant_id", user.tenant_id).eq(
        "customer_id", customer_id
    ).order("created_at", desc=True).limit(min(limit, 200)).execute().data or []
    return rows


@router.post("/customers/{customer_id}/adjust")
async def manual_adjust(
    customer_id: str,
    payload: dict,
    user: CurrentUser = Depends(require_tenant),
):
    """Tenant-owner / super_admin manually credits or debits points."""
    if user.role not in ("tenant_owner", "super_admin"):
        raise HTTPException(403, "Only tenant_owner or super_admin may adjust points")
    try:
        delta = int(payload.get("delta") or 0)
    except (TypeError, ValueError):
        raise HTTPException(400, "delta must be an integer")
    notes = (payload.get("notes") or "").strip()
    db = get_db()
    return loyalty_svc.manual_adjust(
        db,
        tenant_id=user.tenant_id,
        customer_id=customer_id,
        delta=delta,
        notes=notes,
        actor_id=user.id,
    )


@router.get("/rewards")
async def list_rewards(user: CurrentUser = Depends(current_user)):
    db = get_db()
    return db.table("rewards").select("*").eq(
        "tenant_id", user.tenant_id
    ).order("points_cost").execute().data


@router.post("/rewards", status_code=201)
async def create_reward(
    payload: RewardCreate,
    user: CurrentUser = Depends(current_user),
):
    db = get_db()
    result = db.table("rewards").insert({
        "name": payload.name,
        "description": payload.description,
        "points_cost": payload.points_cost,
        "category": payload.category,
        "is_active": True,
        "tenant_id": user.tenant_id,
    }).execute()
    return result.data[0]


@router.patch("/rewards/{reward_id}/toggle")
async def toggle_reward(
    reward_id: str,
    user: CurrentUser = Depends(current_user),
):
    db = get_db()
    reward = db.table("rewards").select("is_active").eq(
        "id", reward_id
    ).eq("tenant_id", user.tenant_id).execute().data
    if not reward:
        raise HTTPException(404, "Reward not found")
    result = db.table("rewards").update({
        "is_active": not reward[0]["is_active"],
    }).eq("id", reward_id).execute()
    return result.data[0]


@router.post("/redeem")
async def redeem_reward(
    payload: RedeemRequest,
    user: CurrentUser = Depends(current_user),
):
    db = get_db()
    reward = db.table("rewards").select("*").eq(
        "id", payload.reward_id
    ).eq("tenant_id", user.tenant_id).execute().data
    if not reward:
        raise HTTPException(404, "Reward not found")
    if not reward[0]["is_active"]:
        raise HTTPException(400, "Reward is not active")

    # Log the redemption first so we have an id to attribute the ledger row to.
    redemption = db.table("redemptions").insert({
        "customer_id": payload.customer_id,
        "reward_id": payload.reward_id,
        "points_used": reward[0]["points_cost"],
        "tenant_id": user.tenant_id,
    }).execute().data
    redemption_id = redemption[0]["id"] if redemption else None

    # Ledger insert (trigger validates balance + updates customer.points).
    new_balance = loyalty_svc.redeem_points(
        db,
        tenant_id=user.tenant_id,
        customer_id=payload.customer_id,
        points_cost=reward[0]["points_cost"],
        source_id=redemption_id,
        actor_id=user.id,
        notes=f"Redeemed: {reward[0]['name']}",
    )

    return {
        "success": True,
        "remaining_points": new_balance,
        "reward": reward[0]["name"],
    }


@router.get("/leaderboard")
async def leaderboard(user: CurrentUser = Depends(current_user)):
    db = get_db()
    return db.table("customers").select(
        "id, name, points, tier"
    ).eq("tenant_id", user.tenant_id).order(
        "points", desc=True
    ).limit(20).execute().data
