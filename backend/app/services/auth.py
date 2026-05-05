"""Backend auth — validates the Supabase JWT and resolves tenant + role.

Every (non-webhook) endpoint takes `current_user: CurrentUser = Depends(current_user)`.
The dependency:
  1. Reads `Authorization: Bearer <jwt>` from the request
  2. Verifies the JWT against `SUPABASE_JWT_SECRET` (HS256)
  3. Looks up the matching `users` row via the service-role client
  4. Returns a `CurrentUser` dataclass

`require_role(*allowed)` is a thin wrapper that 403s if the user's role
isn't in the allow-list. `super_admin` always passes — Meta-Koda staff can
do anything.
"""

from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime, timezone
from typing import Optional

from fastapi import Depends, Header, HTTPException
from jwt import decode as jwt_decode, InvalidTokenError, PyJWKClient

from app.config import SUPABASE_JWT_SECRET, SUPABASE_URL
from app.db import get_db


# JWKS client — Supabase signs JWTs with ES256 (asymmetric) and rotates keys.
# We fetch the public keys from /auth/v1/.well-known/jwks.json and let pyjwt
# pick the right one for each token via the `kid` header. PyJWKClient caches
# the JWKS internally so this is a one-time fetch per process.
_jwks_client: PyJWKClient | None = None


def _get_jwks_client() -> PyJWKClient | None:
    global _jwks_client
    if _jwks_client is None and SUPABASE_URL:
        url = f"{SUPABASE_URL.rstrip('/')}/auth/v1/.well-known/jwks.json"
        _jwks_client = PyJWKClient(url, cache_keys=True, lifespan=3600)
    return _jwks_client


@dataclass
class CurrentUser:
    id: str               # auth.users.id (uuid)
    tenant_id: Optional[str]  # null for super_admin only
    role: str             # super_admin | tenant_owner | admin | cashier | marketing | staff
    email: str
    features: list[str]   # tenant feature toggles; empty for super_admin


def _decode_jwt(token: str) -> dict:
    """Verify + decode a Supabase JWT.

    Order of attempts:
      1. ES256 via JWKS — what fresh Supabase projects use. PyJWKClient
         picks the right public key based on the token's `kid` header.
      2. HS256 via legacy SUPABASE_JWT_SECRET — kept as a fallback for older
         projects that haven't migrated to asymmetric keys.
    """
    last_err: Exception | None = None

    # 1. Try asymmetric (ES256 / RS256) via JWKS
    jwks = _get_jwks_client()
    if jwks is not None:
        try:
            signing_key = jwks.get_signing_key_from_jwt(token).key
            return jwt_decode(
                token,
                signing_key,
                algorithms=["ES256", "RS256"],
                audience="authenticated",
            )
        except InvalidTokenError as e:
            last_err = e
        except Exception as e:
            # JWKS fetch / network error — fall through to HS256 attempt.
            last_err = e
            print(f"[auth] JWKS verify failed: {type(e).__name__}: {e}", flush=True)

    # 2. Fall back to legacy HS256
    if SUPABASE_JWT_SECRET:
        try:
            return jwt_decode(
                token,
                SUPABASE_JWT_SECRET,
                algorithms=["HS256"],
                audience="authenticated",
            )
        except InvalidTokenError as e:
            last_err = e

    print(
        f"[auth] JWT decode failed (all algs): "
        f"{type(last_err).__name__ if last_err else 'unknown'}: {last_err}",
        flush=True,
    )
    raise HTTPException(401, f"Invalid token: {last_err}")


async def current_user(
    authorization: Optional[str] = Header(None, alias="Authorization"),
) -> CurrentUser:
    """Resolve the current authenticated user from the bearer token."""
    if not authorization or not authorization.lower().startswith("bearer "):
        raise HTTPException(401, "Missing Bearer token")
    token = authorization.split(" ", 1)[1].strip()
    claims = _decode_jwt(token)
    user_id = claims.get("sub")
    if not user_id:
        raise HTTPException(401, "Token missing sub claim")

    db = get_db()
    rows = db.table("users").select(
        "id, tenant_id, role, email, status"
    ).eq("id", user_id).execute().data or []
    if not rows:
        raise HTTPException(403, "User authenticated but not provisioned in users table")
    u = rows[0]
    if u.get("status") == "inactive":
        raise HTTPException(403, "User account is inactive")

    # Subscription gate — super_admin bypasses; everyone else is hard-blocked
    # when:
    #   • subscription_status is expired/cancelled, OR
    #   • status is `trial` and trial_ends_at has elapsed, OR
    #   • status is `active` but the latest paid period's `expires_at` has
    #     already lapsed (no auto-flipper runs daily yet, so this is the
    #     authoritative check).
    # 402 (Payment Required) is the conventional code; the frontend
    # redirects to /expired.
    features: list[str] = []
    if u["role"] != "super_admin" and u["tenant_id"]:
        trows = db.table("tenants").select(
            "subscription_status, features, trial_ends_at, business_name"
        ).eq("id", u["tenant_id"]).execute().data or []
        if not trows:
            raise HTTPException(403, "Tenant not found")
        tenant = trows[0]
        sub_status = tenant.get("subscription_status")
        now = datetime.now(timezone.utc)
        if sub_status in ("expired", "cancelled"):
            raise HTTPException(
                402,
                f"subscription_{sub_status}: contact Meta-Koda to reactivate.",
            )
        if sub_status == "trial":
            trial_ends = tenant.get("trial_ends_at")
            if trial_ends:
                ends = datetime.fromisoformat(trial_ends.replace("Z", "+00:00"))
                if ends < now:
                    raise HTTPException(
                        402,
                        "trial_expired: contact Meta-Koda to subscribe.",
                    )
        if sub_status == "active":
            sub = db.table("tenant_subscriptions").select(
                "expires_at"
            ).eq("tenant_id", u["tenant_id"]).order(
                "expires_at", desc=True
            ).limit(1).execute().data
            if sub and sub[0].get("expires_at"):
                expires = datetime.fromisoformat(
                    sub[0]["expires_at"].replace("Z", "+00:00")
                )
                if expires < now:
                    raise HTTPException(
                        402,
                        "subscription_lapsed: payment period ended — contact Meta-Koda to renew.",
                    )
        features = tenant.get("features") or []

    return CurrentUser(
        id=u["id"],
        tenant_id=u["tenant_id"],
        role=u["role"],
        email=u.get("email") or claims.get("email", ""),
        features=features,
    )


def require_role(*allowed_roles: str):
    """FastAPI dependency factory: 403 unless the user's role is in the
    allow-list. `super_admin` is always allowed — Meta-Koda staff bypass."""
    async def _enforce(user: CurrentUser = Depends(current_user)) -> CurrentUser:
        if user.role == "super_admin":
            return user
        if user.role not in allowed_roles:
            raise HTTPException(
                403, f"Role '{user.role}' not allowed for this action"
            )
        return user
    return _enforce


def require_feature(feature: str):
    """FastAPI dependency factory: 403 if the tenant's feature toggle is off.
    super_admin always passes. Use on routers whose entire functionality is
    feature-gated (e.g. marketing blasts, AI bot config)."""
    async def _enforce(user: CurrentUser = Depends(current_user)) -> CurrentUser:
        if user.role == "super_admin":
            return user
        if feature not in (user.features or []):
            raise HTTPException(
                403,
                f"feature_disabled: '{feature}' is not enabled for this tenant.",
            )
        return user
    return _enforce


def require_tenant(user: CurrentUser = Depends(current_user)) -> CurrentUser:
    """Dependency for tenant-scoped endpoints. Rejects super_admin (which has
    tenant_id = NULL) with a clear 400 instead of letting the query crash on
    `tenant_id = "None"` later. Super-admin should use /api/admin/* endpoints."""
    if not user.tenant_id:
        raise HTTPException(
            400,
            "This endpoint requires tenant context. Super-admin must use /api/admin/* "
            "or impersonate a tenant first.",
        )
    return user
