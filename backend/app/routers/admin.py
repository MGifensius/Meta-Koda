"""Super-admin (Meta-Koda staff) endpoints — cross-tenant operations.

Every endpoint here requires the `super_admin` role. Other roles get 403.
The `current_user` dependency already covers JWT validation; we then
re-check role on top.

Scope for PR 4: tenant onboarding + manual subscription management.
PR 5 adds the subscription-gate middleware that enforces these on the
tenant-side.
"""

from __future__ import annotations

import re
from datetime import datetime, timedelta, timezone
from typing import Optional

import httpx
from fastapi import APIRouter, Depends, HTTPException

from app.config import SUPABASE_URL, SUPABASE_KEY
from app.db import get_db
from app.services.auth import current_user, CurrentUser

router = APIRouter()


# ----------------------------------------------------------
# Role guard
# ----------------------------------------------------------
def super_admin_only(user: CurrentUser = Depends(current_user)) -> CurrentUser:
    if user.role != "super_admin":
        raise HTTPException(403, "Super-admin access required")
    return user


# ----------------------------------------------------------
# Plans
# ----------------------------------------------------------
@router.get("/plans")
async def list_plans(_: CurrentUser = Depends(super_admin_only)):
    db = get_db()
    return db.table("subscription_plans").select("*").eq(
        "is_active", True
    ).order("sort_order").execute().data or []


# ----------------------------------------------------------
# Tenants
# ----------------------------------------------------------
@router.get("/tenants")
async def list_tenants(_: CurrentUser = Depends(super_admin_only)):
    """All tenants with their active subscription period (latest expires_at)."""
    db = get_db()
    tenants = db.table("tenants").select("*").order(
        "created_at", desc=True
    ).execute().data or []
    # Attach active subscription per tenant.
    tids = [t["id"] for t in tenants]
    subs_by_tenant: dict[str, dict] = {}
    if tids:
        subs = db.table("tenant_subscriptions").select(
            "*, subscription_plans(slug, name)"
        ).in_("tenant_id", tids).order("expires_at", desc=True).execute().data or []
        for s in subs:
            tid = s["tenant_id"]
            if tid not in subs_by_tenant:  # first one per tenant = newest
                subs_by_tenant[tid] = s
    for t in tenants:
        t["active_subscription"] = subs_by_tenant.get(t["id"])
    return tenants


@router.post("/tenants", status_code=201)
async def create_tenant(
    payload: dict,
    actor: CurrentUser = Depends(super_admin_only),
):
    """Onboard a new tenant + create their first owner login.

    Body:
      business_name (str, required) — slug + tenant_code are auto-generated
      owner_email   (str, required) — used for Supabase Auth + users.email
      owner_password (str, required) — initial password (owner can change)
      owner_name    (str, optional)
      trial_days    (int, default 14)
    """
    business_name = (payload.get("business_name") or "").strip()
    owner_email = (payload.get("owner_email") or "").strip().lower()
    owner_password = payload.get("owner_password") or ""
    owner_name = (payload.get("owner_name") or "").strip()
    trial_days = int(payload.get("trial_days") or 7)

    if not business_name:
        raise HTTPException(400, "business_name is required")
    if not owner_email or not owner_password:
        raise HTTPException(400, "owner_email and owner_password are required")
    if len(owner_password) < 8:
        raise HTTPException(400, "owner_password must be at least 8 characters")

    db = get_db()

    # Auto-generate the next sequence number and identifiers.
    seq = _next_tenant_seq(db)
    tenant_code = f"MK-{seq:03d}-{business_name}"
    slug = _make_slug(business_name, seq)

    # Defensive: ensure neither collides (race / unusual business names).
    if db.table("tenants").select("id").eq("slug", slug).execute().data:
        raise HTTPException(409, f"Auto-generated slug '{slug}' already exists — retry")
    if db.table("tenants").select("id").eq("tenant_code", tenant_code).execute().data:
        raise HTTPException(409, f"Auto-generated code '{tenant_code}' already exists — retry")

    trial_ends = datetime.now(timezone.utc) + timedelta(days=trial_days)

    # 1. Create tenant
    tenant_row = db.table("tenants").insert({
        "business_name": business_name,
        "slug": slug,
        "tenant_code": tenant_code,
        "business_type": payload.get("business_type") or "restaurant",
        "email": owner_email,
        "phone": payload.get("phone"),
        "address": payload.get("address"),
        "status": "active",
        "subscription_status": "trial",
        "trial_ends_at": trial_ends.isoformat(),
    }).execute().data[0]
    tenant_id = tenant_row["id"]

    # 2. Create the auth user via Supabase Auth admin API.
    auth_user_id = await _create_supabase_auth_user(owner_email, owner_password)

    # 3. Provision the users row linking auth user to tenant.
    db.table("users").insert({
        "id": auth_user_id,
        "tenant_id": tenant_id,
        "role": "tenant_owner",
        "email": owner_email,
        "name": owner_name or business_name,
        "status": "active",
    }).execute()

    # 4. Seed a baseline restaurant_settings row for the new tenant so the
    #    bot has somewhere to read business-info defaults from.
    db.table("restaurant_settings").upsert({
        "id": slug,                         # legacy text PK, must be unique
        "name": business_name,
        "tenant_id": tenant_id,
    }, on_conflict="id").execute()

    return {
        "tenant": tenant_row,
        "owner_email": owner_email,
        "auth_user_id": auth_user_id,
    }


@router.get("/tenants/{tenant_id}")
async def get_tenant(
    tenant_id: str,
    _: CurrentUser = Depends(super_admin_only),
):
    """Detail view for a tenant: profile + active subscription + recent users."""
    db = get_db()
    rows = db.table("tenants").select("*").eq("id", tenant_id).execute().data
    if not rows:
        raise HTTPException(404, "Tenant not found")
    tenant = rows[0]

    sub = db.table("tenant_subscriptions").select(
        "*, subscription_plans(slug, name, price_monthly_idr)"
    ).eq("tenant_id", tenant_id).order("expires_at", desc=True).limit(1).execute().data
    tenant["active_subscription"] = sub[0] if sub else None

    # Lightweight users summary so super-admin can see who has access.
    users = db.table("users").select("id, email, name, role, status, created_at").eq(
        "tenant_id", tenant_id
    ).order("created_at").execute().data or []
    tenant["users"] = users
    return tenant


@router.patch("/tenants/{tenant_id}")
async def update_tenant(
    tenant_id: str,
    payload: dict,
    _: CurrentUser = Depends(super_admin_only),
):
    """Edit a tenant's profile fields and feature toggles. Subscription
    status / expires_at are NOT editable here — those flow through
    extend/cancel/reactivate + the sync trigger."""
    db = get_db()
    allowed = {
        "business_name", "business_type", "email", "phone", "address",
        "logo_url", "status", "features",
    }
    update = {k: v for k, v in payload.items() if k in allowed and v is not None}
    if not update:
        raise HTTPException(400, "No editable fields supplied")
    if "status" in update and update["status"] not in ("active", "inactive", "suspended"):
        raise HTTPException(400, "status must be active|inactive|suspended")
    if "features" in update:
        if not isinstance(update["features"], list):
            raise HTTPException(400, "features must be a list of feature slugs")
        valid = {"bookings", "loyalty", "marketing", "ai_bot"}
        bad = [f for f in update["features"] if f not in valid]
        if bad:
            raise HTTPException(400, f"Unknown feature(s): {bad}")
    result = db.table("tenants").update(update).eq("id", tenant_id).execute()
    if not result.data:
        raise HTTPException(404, "Tenant not found")
    return result.data[0]


def _first_of_next_month(d: datetime) -> datetime:
    """Snap a datetime forward to 00:00 of the next calendar month.
    If `d` is already exactly 00:00 on day 1, return as-is."""
    d = d.astimezone(timezone.utc)
    if d.day == 1 and d.hour == 0 and d.minute == 0 and d.second == 0:
        return d.replace(microsecond=0)
    if d.month == 12:
        return d.replace(
            year=d.year + 1, month=1, day=1,
            hour=0, minute=0, second=0, microsecond=0,
        )
    return d.replace(
        month=d.month + 1, day=1,
        hour=0, minute=0, second=0, microsecond=0,
    )


def _add_months(d: datetime, n: int) -> datetime:
    """Calendar-aware month addition. End-of-month edge cases don't matter
    here because we only call this on already-snapped first-of-month dates."""
    month0 = d.month - 1 + n
    year = d.year + month0 // 12
    month = month0 % 12 + 1
    return d.replace(year=year, month=month)


@router.post("/tenants/{tenant_id}/extend")
async def extend_tenant(
    tenant_id: str,
    payload: dict,
    actor: CurrentUser = Depends(super_admin_only),
):
    """Add a new paid subscription period for a tenant.

    Billing aligns to calendar months — every period starts at 00:00 on
    day 1 of a month and runs for N whole months. If a previous period
    is still active in the future, the new period chains directly off
    its `expires_at` (no gap, no overlap). Otherwise it starts at first
    of next month.

    Body:
      months (int, default 1) — number of full calendar months
      days   (int, optional)  — legacy fallback; only used when `months` is absent
      notes  (str, optional)
    """
    months = payload.get("months")
    days = payload.get("days")
    notes = (payload.get("notes") or "").strip() or None

    db = get_db()
    if not db.table("tenants").select("id").eq("id", tenant_id).execute().data:
        raise HTTPException(404, "Tenant not found")

    now = datetime.now(timezone.utc)

    if months is not None:
        try:
            months_n = int(months)
        except (TypeError, ValueError):
            raise HTTPException(400, "months must be an integer")
        if months_n <= 0:
            raise HTTPException(400, "months must be positive")

        # Chain from existing future period if present, else first-of-next-month.
        latest = db.table("tenant_subscriptions").select("expires_at").eq(
            "tenant_id", tenant_id
        ).order("expires_at", desc=True).limit(1).execute().data
        chain_from = None
        if latest and latest[0].get("expires_at"):
            chain_from = datetime.fromisoformat(
                latest[0]["expires_at"].replace("Z", "+00:00")
            )
        if chain_from and chain_from > now:
            started = chain_from
        else:
            started = _first_of_next_month(now)
        expires = _add_months(started, months_n)
        billing_cycle = "monthly"
    else:
        # Legacy days-based path (kept so the old call signature still works).
        days_n = int(days or 30)
        if days_n <= 0:
            raise HTTPException(400, "days must be positive")
        started = now
        expires = now + timedelta(days=days_n)
        billing_cycle = "manual"

    sub = db.table("tenant_subscriptions").insert({
        "tenant_id": tenant_id,
        "plan_id": None,
        "status": "active",
        "billing_cycle": billing_cycle,
        "started_at": started.isoformat(),
        "expires_at": expires.isoformat(),
        "trial_ends_at": None,
        "notes": notes,
        "created_by": actor.id,
    }).execute().data[0]
    # Trigger automatically syncs tenants.subscription_status='active'.
    return sub


@router.post("/tenants/{tenant_id}/reactivate")
async def reactivate_tenant(
    tenant_id: str,
    payload: dict,
    actor: CurrentUser = Depends(super_admin_only),
):
    """Re-enable access for a previously cancelled/expired tenant. Defaults
    to a 1-month period aligned to first of next month."""
    months = int(payload.get("months") or 1)
    return await extend_tenant(
        tenant_id,
        {"months": months, "notes": payload.get("notes") or "Reactivated"},
        actor,
    )


@router.post("/tenants/{tenant_id}/cancel")
async def cancel_tenant(
    tenant_id: str,
    payload: dict,
    actor: CurrentUser = Depends(super_admin_only),
):
    """Cancel the tenant's active subscription. Tenant access enters
    grace mode (read-only) per the rules in PR 5."""
    db = get_db()
    notes = (payload.get("notes") or "").strip() or None
    # Find the latest period and flag it cancelled.
    latest = db.table("tenant_subscriptions").select("id").eq(
        "tenant_id", tenant_id
    ).order("expires_at", desc=True).limit(1).execute().data
    if not latest:
        # No active subscription — just reflect cancelled directly on tenants.
        db.table("tenants").update({
            "subscription_status": "cancelled",
        }).eq("id", tenant_id).execute()
        return {"ok": True, "had_subscription": False}
    db.table("tenant_subscriptions").update({
        "status": "cancelled",
        "cancelled_at": datetime.now(timezone.utc).isoformat(),
        "notes": notes,
    }).eq("id", latest[0]["id"]).execute()
    return {"ok": True, "had_subscription": True}


# ----------------------------------------------------------
# WhatsApp accounts (per tenant)
# ----------------------------------------------------------
@router.get("/tenants/{tenant_id}/whatsapp")
async def list_whatsapp_accounts(
    tenant_id: str,
    _: CurrentUser = Depends(super_admin_only),
):
    db = get_db()
    return db.table("whatsapp_accounts").select(
        "id, phone_number_id, waba_id, display_phone, business_name, "
        "is_active, status, status_reason, last_verified_at, created_at"
    ).eq("tenant_id", tenant_id).order(
        "created_at", desc=True
    ).execute().data or []


@router.post("/tenants/{tenant_id}/whatsapp", status_code=201)
async def add_whatsapp_account(
    tenant_id: str,
    payload: dict,
    _: CurrentUser = Depends(super_admin_only),
):
    """Register a WABA for this tenant. Verifies the credentials against
    Meta's Graph API before storing."""
    from app.services.whatsapp_routing import verify_account

    phone_number_id = (payload.get("phone_number_id") or "").strip()
    access_token = (payload.get("access_token") or "").strip()
    waba_id = (payload.get("waba_id") or "").strip() or None
    if not phone_number_id or not access_token:
        raise HTTPException(400, "phone_number_id and access_token are required")

    db = get_db()

    # Refuse if this phone_number_id is already in use by another tenant.
    existing = db.table("whatsapp_accounts").select("id, tenant_id").eq(
        "phone_number_id", phone_number_id
    ).execute().data or []
    if existing and existing[0]["tenant_id"] != tenant_id:
        raise HTTPException(
            409,
            f"phone_number_id {phone_number_id} is already linked to a different tenant",
        )

    verification = await verify_account(access_token, phone_number_id)
    status = "connected" if verification.get("ok") else "error"
    status_reason = None if verification.get("ok") else verification.get("error")
    last_verified_at = (
        datetime.now(timezone.utc).isoformat() if verification.get("ok") else None
    )

    row = {
        "tenant_id": tenant_id,
        "phone_number_id": phone_number_id,
        "waba_id": waba_id,
        "access_token": access_token,
        "display_phone": verification.get("display_phone"),
        "business_name": verification.get("business_name"),
        "is_active": True,
        "status": status,
        "status_reason": status_reason,
        "last_verified_at": last_verified_at,
    }
    if existing:
        # Same tenant + same phone_number_id → update in place.
        result = db.table("whatsapp_accounts").update(row).eq(
            "id", existing[0]["id"]
        ).execute()
    else:
        result = db.table("whatsapp_accounts").insert(row).execute()
    if not result.data:
        raise HTTPException(500, "Failed to save WhatsApp account")
    saved = result.data[0]
    saved.pop("access_token", None)
    return saved


@router.post("/whatsapp/{account_id}/verify")
async def verify_whatsapp_account(
    account_id: str,
    _: CurrentUser = Depends(super_admin_only),
):
    """Re-run the credential check against Meta and update status."""
    from app.services.whatsapp_routing import verify_account

    db = get_db()
    rows = db.table("whatsapp_accounts").select(
        "id, phone_number_id, access_token"
    ).eq("id", account_id).execute().data
    if not rows:
        raise HTTPException(404, "Account not found")
    a = rows[0]

    v = await verify_account(a["access_token"], a["phone_number_id"])
    update = {
        "status": "connected" if v.get("ok") else "error",
        "status_reason": None if v.get("ok") else v.get("error"),
        "last_verified_at": (
            datetime.now(timezone.utc).isoformat() if v.get("ok") else None
        ),
    }
    if v.get("ok"):
        update["display_phone"] = v.get("display_phone")
        update["business_name"] = v.get("business_name")
    db.table("whatsapp_accounts").update(update).eq("id", account_id).execute()
    return {"ok": v.get("ok"), **update}


@router.delete("/whatsapp/{account_id}")
async def remove_whatsapp_account(
    account_id: str,
    _: CurrentUser = Depends(super_admin_only),
):
    db = get_db()
    res = db.table("whatsapp_accounts").delete().eq("id", account_id).execute()
    if not res.data:
        raise HTTPException(404, "Account not found")
    return {"ok": True}


@router.post("/demo/refresh")
async def refresh_demo_tenant_endpoint(
    _: CurrentUser = Depends(super_admin_only),
):
    """Wipe + reseed the demo showcase tenant (Buranchi) in one shot.

    Used between demo sessions so dashboard, inbox, floor, and revenue
    metrics stay believable for the next viewer. The target tenant is
    hardcoded in `app.services.demo_data.DEMO_TENANT_NAME` ("Buranchi")
    — won't touch any paying tenant.
    """
    from app.services.demo_data import refresh_demo_tenant
    db = get_db()
    result = refresh_demo_tenant(db)
    if not result.get("ok"):
        raise HTTPException(500, result.get("error") or "refresh failed")
    return result


@router.get("/tenants/{tenant_id}/subscriptions")
async def tenant_subscription_history(
    tenant_id: str,
    _: CurrentUser = Depends(super_admin_only),
):
    db = get_db()
    return db.table("tenant_subscriptions").select(
        "*, subscription_plans(slug, name)"
    ).eq("tenant_id", tenant_id).order("started_at", desc=True).execute().data or []


# ----------------------------------------------------------
# Helpers
# ----------------------------------------------------------
def _next_tenant_seq(db) -> int:
    """Return the next sequence number for tenant_code (1-indexed).

    We extract the highest existing `MK-{n}-...` prefix rather than counting
    rows, so deleted tenants don't shift later codes and re-using the same
    code never collides with history.
    """
    rows = db.table("tenants").select("tenant_code").execute().data or []
    highest = 0
    for r in rows:
        code = r.get("tenant_code") or ""
        m = re.match(r"^MK-(\d+)-", code)
        if m:
            n = int(m.group(1))
            if n > highest:
                highest = n
    return highest + 1


def _make_slug(business_name: str, seq: int) -> str:
    """URL-safe slug derived from MK code + business name. Lowercase only,
    a-z0-9- — keeps existing slug invariants for `restaurant_settings.id`.
    """
    base = re.sub(r"[^a-z0-9]+", "-", business_name.lower()).strip("-")
    if not base:
        base = "tenant"
    return f"mk-{seq:03d}-{base}"


async def _create_supabase_auth_user(email: str, password: str) -> str:
    """Create an auth.users row via Supabase Auth admin API. Returns the
    new user id. Used during tenant onboarding."""
    if not SUPABASE_URL or not SUPABASE_KEY:
        raise HTTPException(500, "Supabase URL or service key not configured")
    async with httpx.AsyncClient(timeout=15) as client:
        resp = await client.post(
            f"{SUPABASE_URL.rstrip('/')}/auth/v1/admin/users",
            headers={
                "apikey": SUPABASE_KEY,
                "Authorization": f"Bearer {SUPABASE_KEY}",
                "Content-Type": "application/json",
            },
            json={
                "email": email,
                "password": password,
                "email_confirm": True,  # skip email verification
            },
        )
    if resp.status_code >= 400:
        # Surface Supabase's error message (e.g. "User already registered").
        try:
            err = resp.json()
            msg = err.get("msg") or err.get("error_description") or err.get("error") or resp.text
        except Exception:
            msg = resp.text
        raise HTTPException(resp.status_code, f"Supabase Auth error: {msg}")
    data = resp.json()
    user_id = (data.get("user") or {}).get("id") or data.get("id")
    if not user_id:
        raise HTTPException(500, f"Supabase Auth returned no user id: {data}")
    return user_id
