"""Xendit QRIS integration.

If XENDIT_SECRET_KEY is blank, this module returns a stub payload so the
frontend QR flow can be exercised end-to-end without real keys. When a real
key is pasted into .env, calls switch to the live sandbox automatically.

Xendit QR Code API: POST https://api.xendit.co/qr_codes
Auth: HTTP Basic with secret_key as username, empty password.
"""

from __future__ import annotations

import base64
from typing import Optional

import httpx

from app.config import XENDIT_SECRET_KEY, XENDIT_CALLBACK_URL

XENDIT_BASE = "https://api.xendit.co"
STUB_QR_PREFIX = "STUB-QRIS"


def _auth_header() -> str:
    # Xendit HTTP Basic: secret_key:
    raw = f"{XENDIT_SECRET_KEY}:".encode("utf-8")
    return "Basic " + base64.b64encode(raw).decode("ascii")


def is_live() -> bool:
    return bool(XENDIT_SECRET_KEY.strip())


async def create_qris(
    external_id: str, amount: int, callback_url: Optional[str] = None
) -> dict:
    """Create a dynamic QRIS code for a given rupiah amount.

    Returns: {"xendit_qr_id", "qr_string", "status", "stub": bool}
    """
    # Stub mode — return a placeholder so the frontend can render a QR and
    # the cashier can simulate payment via the webhook endpoint directly.
    if not is_live():
        return {
            "xendit_qr_id": f"{STUB_QR_PREFIX}-{external_id}",
            "qr_string": f"{STUB_QR_PREFIX}|{external_id}|{amount}",
            "status": "ACTIVE",
            "stub": True,
        }

    cb = callback_url or XENDIT_CALLBACK_URL or ""
    payload = {
        "reference_id": external_id,
        "type": "DYNAMIC",
        "currency": "IDR",
        "amount": amount,
        "callback_url": cb,
    }
    headers = {
        "Authorization": _auth_header(),
        "Content-Type": "application/json",
        "api-version": "2022-07-31",
    }
    async with httpx.AsyncClient(timeout=15) as client:
        resp = await client.post(
            f"{XENDIT_BASE}/qr_codes", json=payload, headers=headers
        )
    if resp.status_code >= 400:
        raise RuntimeError(f"Xendit QRIS create failed {resp.status_code}: {resp.text[:300]}")
    data = resp.json()
    return {
        "xendit_qr_id": data.get("id"),
        "qr_string": data.get("qr_string"),
        "status": data.get("status", "ACTIVE"),
        "stub": False,
    }


async def get_qris_status(qr_id: str) -> dict:
    """Fetch the current status of a QR code from Xendit. Stubs return ACTIVE."""
    if not is_live() or qr_id.startswith(STUB_QR_PREFIX):
        return {"status": "ACTIVE", "stub": True}
    headers = {"Authorization": _auth_header(), "api-version": "2022-07-31"}
    async with httpx.AsyncClient(timeout=10) as client:
        resp = await client.get(f"{XENDIT_BASE}/qr_codes/{qr_id}", headers=headers)
    if resp.status_code >= 400:
        raise RuntimeError(f"Xendit QRIS fetch failed {resp.status_code}: {resp.text[:300]}")
    return resp.json()
