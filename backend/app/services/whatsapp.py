from typing import Optional

import httpx
from app.config import WHATSAPP_TOKEN, WHATSAPP_PHONE_ID

WA_API_URL = f"https://graph.facebook.com/v19.0/{WHATSAPP_PHONE_ID}/messages"


def _safe(s: str) -> str:
    return s.encode("ascii", "replace").decode("ascii")


async def send_message(
    phone: str,
    text: str,
    tenant_id: Optional[str] = None,
) -> bool:
    """Send a single WhatsApp message.

    Routing order:
      1. If `tenant_id` is given AND that tenant has an active
         `whatsapp_accounts` row, send via their per-tenant credentials.
      2. Otherwise fall back to the global env-var credentials
         (`WHATSAPP_TOKEN` / `WHATSAPP_PHONE_ID`) — useful for development
         and single-tenant setups.
      3. If neither is configured, dry-run to console + return True.
    """
    print(f"[WA-SEND-START tenant={tenant_id}] -> {phone}", flush=True)

    if tenant_id:
        from app.services.whatsapp_routing import get_active_account, send_via_account
        from app.db import get_db
        account = get_active_account(get_db(), tenant_id)
        if account:
            return await send_via_account(account, phone, text)

    if not WHATSAPP_TOKEN or not WHATSAPP_PHONE_ID:
        print(f"[WA-DRY] -> {phone}: {_safe(text[:80])}", flush=True)
        return True

    async with httpx.AsyncClient(timeout=15) as client:
        try:
            resp = await client.post(
                WA_API_URL,
                headers={
                    "Authorization": f"Bearer {WHATSAPP_TOKEN}",
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
            print(f"[WA-SEND-EXC] -> {phone}: {_safe(str(e))}", flush=True)
            return False
        if resp.status_code == 200:
            print(f"[WA-SEND-OK] -> {phone}: {_safe(text[:60])}", flush=True)
            return True
        print(f"[WA-SEND-FAIL {resp.status_code}] -> {phone}: {_safe(resp.text[:300])}", flush=True)
        return False


async def send_bulk_message(phone: str, text: str) -> bool:
    """Send a marketing/bulk message (same API, separate for tracking)."""
    return await send_message(phone, text)


async def send_template(
    phone: str,
    template_name: str,
    language: str = "en_US",
    body_params: list[str] | None = None,
) -> bool:
    """Send a Meta-approved WhatsApp template message (cold outbound)."""
    print(f"[WA-TEMPLATE-START] -> {phone} tpl={template_name} lang={language}", flush=True)
    if not WHATSAPP_TOKEN or not WHATSAPP_PHONE_ID:
        print(f"[WA-DRY-TEMPLATE] -> {phone}: {template_name}", flush=True)
        return True

    components = []
    if body_params:
        components.append({
            "type": "body",
            "parameters": [{"type": "text", "text": str(p)} for p in body_params],
        })

    payload = {
        "messaging_product": "whatsapp",
        "to": phone,
        "type": "template",
        "template": {
            "name": template_name,
            "language": {"code": language},
        },
    }
    if components:
        payload["template"]["components"] = components

    async with httpx.AsyncClient(timeout=15) as client:
        try:
            resp = await client.post(
                WA_API_URL,
                headers={
                    "Authorization": f"Bearer {WHATSAPP_TOKEN}",
                    "Content-Type": "application/json",
                },
                json=payload,
            )
        except Exception as e:
            print(f"[WA-TEMPLATE-EXC] -> {phone}: {_safe(str(e))}", flush=True)
            return False
        if resp.status_code == 200:
            print(f"[WA-TEMPLATE-OK] -> {phone}: {template_name}", flush=True)
            return True
        print(f"[WA-TEMPLATE-FAIL {resp.status_code}] -> {phone}: {_safe(resp.text[:300])}", flush=True)
        return False
