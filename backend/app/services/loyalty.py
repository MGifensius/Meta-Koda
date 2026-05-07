"""Loyalty service — every point change goes through `loyalty_ledger`.

Direct mutation of `customers.points` is forbidden after PR 8. Routers call
the helpers here, which insert a single ledger row; a DB trigger updates
the customer balance and stamps `balance_after` for the audit history.

All helpers expect a Supabase service-role client from `app.db.get_db()`
and the caller's tenant_id (already enforced upstream).
"""

from __future__ import annotations

from typing import Optional

from fastapi import HTTPException


TIER_MULTIPLIERS: dict[str, float] = {
    "Diamond": 2.0,
    "Gold": 1.5,
    "Silver": 1.25,
    "Bronze": 1.0,
}


def _get_settings(db, tenant_id: str) -> dict:
    """Fetch or lazily create per-tenant loyalty settings."""
    rows = db.table("loyalty_settings").select("*").eq(
        "tenant_id", tenant_id
    ).execute().data or []
    if rows:
        return rows[0]
    created = db.table("loyalty_settings").insert(
        {"tenant_id": tenant_id}
    ).execute().data
    return created[0] if created else {
        "points_per_rupiah": 10000,
        "tier_multiplier_enabled": True,
    }


def calc_points(amount: int, settings: dict, tier: Optional[str]) -> int:
    """Apply the tenant's earn rate + tier multiplier to a settle amount."""
    rate = max(1, int(settings.get("points_per_rupiah") or 10000))
    base = amount // rate
    if settings.get("tier_multiplier_enabled") and tier:
        base = int(base * TIER_MULTIPLIERS.get(tier, 1.0))
    return max(0, base)


def award_points_for_settle(
    db,
    *,
    tenant_id: str,
    customer_id: str,
    amount: int,
    source_tx_id: Optional[str],
    actor_id: Optional[str],
) -> int:
    """Insert an `earn_settle` ledger row. Returns points awarded.

    Points = floor(amount / settings.points_per_rupiah) × tier multiplier.
    Returns 0 (no ledger row written) when the calc rounds to 0 — keeps
    the audit trail clean of zero-delta noise.
    """
    if amount <= 0:
        return 0

    settings = _get_settings(db, tenant_id)
    cust = db.table("customers").select("tier, is_member").eq(
        "id", customer_id
    ).eq("tenant_id", tenant_id).execute().data
    if not cust:
        return 0
    # Non-members do not earn points at all. The base calc would still
    # award them the floor(amount / rate) without a tier bonus, but
    # product wants the loyalty program to be a member-only benefit.
    if not cust[0].get("is_member"):
        return 0
    tier = cust[0].get("tier")

    points = calc_points(amount, settings, tier)
    if points <= 0:
        return 0

    db.table("loyalty_ledger").insert({
        "tenant_id": tenant_id,
        "customer_id": customer_id,
        "delta": points,
        "reason": "earn_settle",
        "source_id": source_tx_id,
        "created_by": actor_id,
    }).execute()
    return points


def redeem_points(
    db,
    *,
    tenant_id: str,
    customer_id: str,
    points_cost: int,
    source_id: Optional[str],
    actor_id: Optional[str],
    notes: Optional[str] = None,
) -> int:
    """Deduct points for a reward redemption. Raises 400 when insufficient.
    Returns the new balance reported by the trigger."""
    if points_cost <= 0:
        raise HTTPException(400, "points_cost must be positive")

    cust = db.table("customers").select("points").eq(
        "id", customer_id
    ).eq("tenant_id", tenant_id).execute().data
    if not cust:
        raise HTTPException(404, "Customer not found")
    current = cust[0].get("points") or 0
    if current < points_cost:
        raise HTTPException(400, f"Insufficient points: have {current}, need {points_cost}")

    inserted = db.table("loyalty_ledger").insert({
        "tenant_id": tenant_id,
        "customer_id": customer_id,
        "delta": -points_cost,
        "reason": "redeem_reward",
        "source_id": source_id,
        "notes": notes,
        "created_by": actor_id,
    }).execute().data
    if inserted and inserted[0].get("balance_after") is not None:
        return int(inserted[0]["balance_after"])
    return current - points_cost


def manual_adjust(
    db,
    *,
    tenant_id: str,
    customer_id: str,
    delta: int,
    notes: str,
    actor_id: Optional[str],
) -> dict:
    """Super-admin / tenant_owner manually adjusts a customer's points.
    Negative delta deducts. Returns the inserted ledger row."""
    if delta == 0:
        raise HTTPException(400, "delta must be non-zero")
    if not notes or not notes.strip():
        raise HTTPException(400, "notes required for manual adjustments")

    inserted = db.table("loyalty_ledger").insert({
        "tenant_id": tenant_id,
        "customer_id": customer_id,
        "delta": delta,
        "reason": "manual_adjust",
        "notes": notes.strip(),
        "created_by": actor_id,
    }).execute().data
    return inserted[0] if inserted else {}


def grant_signup_bonus(
    db,
    *,
    tenant_id: str,
    customer_id: str,
    actor_id: Optional[str],
) -> int:
    """Award the configured signup bonus when a member is created. No-op
    when the bonus is 0."""
    settings = _get_settings(db, tenant_id)
    bonus = int(settings.get("signup_bonus") or 0)
    if bonus <= 0:
        return 0
    db.table("loyalty_ledger").insert({
        "tenant_id": tenant_id,
        "customer_id": customer_id,
        "delta": bonus,
        "reason": "signup_bonus",
        "created_by": actor_id,
    }).execute()
    return bonus
