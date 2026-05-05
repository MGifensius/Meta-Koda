"""Multi-tenant WhatsApp routing.

Resolves the right per-tenant WABA credentials at call time so a single
backend can serve many tenants. Two directions:

  Outbound:  given tenant_id  →  returns the active `whatsapp_accounts`
             row for that tenant (or None).
  Inbound:   given phone_number_id from Meta's webhook payload  →
             returns the owning tenant_id.

Falls back to the legacy global env vars (`WHATSAPP_TOKEN` /
`WHATSAPP_PHONE_ID` from app.config) when no per-tenant row exists, so
development and single-tenant setups keep working unchanged.
"""

from __future__ import annotations

from typing import Optional

import httpx

from app.config import WHATSAPP_PHONE_ID, WHATSAPP_TOKEN
from app.db import get_db


def get_active_account(db, tenant_id: str) -> Optional[dict]:
    """Newest active WABA account for a tenant, or None."""
    rows = db.table("whatsapp_accounts").select("*").eq(
        "tenant_id", tenant_id
    ).eq("is_active", True).order(
        "created_at", desc=True
    ).limit(1).execute().data or []
    return rows[0] if rows else None


def get_tenant_id_for_phone_number_id(
    db, phone_number_id: str
) -> Optional[str]:
    """Reverse-lookup for inbound webhooks. Falls back to None — caller
    decides whether to drop the message or route it to the default tenant."""
    if not phone_number_id:
        return None
    rows = db.table("whatsapp_accounts").select("tenant_id").eq(
        "phone_number_id", phone_number_id
    ).limit(1).execute().data or []
    return rows[0]["tenant_id"] if rows else None


def _safe(s: str) -> str:
    return s.encode("ascii", "replace").decode("ascii")


async def send_via_account(account: dict, phone: str, text: str) -> bool:
    """Send a text message using the per-tenant WABA credentials."""
    url = f"https://graph.facebook.com/v19.0/{account['phone_number_id']}/messages"
    async with httpx.AsyncClient(timeout=15) as client:
        try:
            resp = await client.post(
                url,
                headers={
                    "Authorization": f"Bearer {account['access_token']}",
                    "Content-Type": "application/json",
                },
                json={
                    "messaging_product": "whatsapp",
                    "to": phone,
                    "type": "text",
                    "text": {"body": text},
                },
            )
        except Exception as e:
            print(
                f"[WA-TENANT-EXC tenant={account.get('tenant_id')}] -> {phone}: "
                f"{_safe(str(e))}",
                flush=True,
            )
            return False
    if 200 <= resp.status_code < 300:
        print(
            f"[WA-TENANT-OK tenant={account.get('tenant_id')}] -> {phone}: "
            f"{_safe(text[:60])}",
            flush=True,
        )
        return True
    print(
        f"[WA-TENANT-FAIL {resp.status_code} tenant={account.get('tenant_id')}]"
        f" -> {phone}: {_safe(resp.text[:300])}",
        flush=True,
    )
    return False


async def verify_account(access_token: str, phone_number_id: str) -> dict:
    """Hit Meta's Graph API to confirm the credentials work. Returns
    {ok, status_code, business_name, display_phone, error}."""
    url = f"https://graph.facebook.com/v19.0/{phone_number_id}"
    async with httpx.AsyncClient(timeout=10) as client:
        try:
            resp = await client.get(
                url,
                headers={"Authorization": f"Bearer {access_token}"},
                params={"fields": "verified_name,display_phone_number"},
            )
        except Exception as e:
            return {"ok": False, "error": _safe(str(e))}
    if 200 <= resp.status_code < 300:
        d = resp.json()
        return {
            "ok": True,
            "status_code": resp.status_code,
            "business_name": d.get("verified_name"),
            "display_phone": d.get("display_phone_number"),
        }
    return {
        "ok": False,
        "status_code": resp.status_code,
        "error": _safe(resp.text[:300]),
    }


def has_tenant_account(tenant_id: Optional[str]) -> bool:
    """Cheap precondition check for the global send fallback path."""
    if not tenant_id:
        return False
    return get_active_account(get_db(), tenant_id) is not None


def has_global_credentials() -> bool:
    return bool(WHATSAPP_TOKEN and WHATSAPP_PHONE_ID)
