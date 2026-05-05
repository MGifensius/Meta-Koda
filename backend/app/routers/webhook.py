"""
Omnichannel webhook endpoints for WhatsApp, Instagram, and TikTok.

Each platform normalizes the incoming message into a common format:
  - phone/sender_id: Platform-specific sender identifier
  - text: Message content
  - platform: "whatsapp" | "instagram" | "tiktok"

Then delegates to handle_incoming_message for unified processing.
"""

from fastapi import APIRouter, Request, HTTPException, Form, Query, Header
from app.config import WHATSAPP_VERIFY_TOKEN, XENDIT_WEBHOOK_TOKEN
from app.services.bot import handle_incoming_message
from typing import Optional

router = APIRouter()

_processed_message_ids: set[str] = set()


# ============================================
# WHATSAPP BUSINESS API
# ============================================

@router.get("/whatsapp")
async def verify_whatsapp(
    mode: str = Query("", alias="hub.mode"),
    token: str = Query("", alias="hub.verify_token"),
    challenge: str = Query("", alias="hub.challenge"),
):
    """WhatsApp webhook verification (GET)."""
    if mode == "subscribe" and token == WHATSAPP_VERIFY_TOKEN:
        from fastapi.responses import PlainTextResponse
        return PlainTextResponse(challenge)
    raise HTTPException(403, "Verification failed")


@router.post("/whatsapp")
async def receive_whatsapp(request: Request):
    """Receive incoming WhatsApp messages.

    Multi-tenant routing: each Meta payload carries
    `value.metadata.phone_number_id` which uniquely identifies the receiving
    WABA. We look it up in `whatsapp_accounts` to resolve the tenant before
    handing off to the bot.
    """
    import asyncio
    from app.services.whatsapp_routing import get_tenant_id_for_phone_number_id
    from app.db import get_db

    body = await request.json()

    try:
        entry = body.get("entry", [{}])[0]
        changes = entry.get("changes", [{}])[0]
        value = changes.get("value", {})
        metadata = value.get("metadata", {}) or {}
        phone_number_id = metadata.get("phone_number_id") or ""
        messages = value.get("messages", [])

        # Resolve tenant once per webhook hit.
        tenant_id = (
            get_tenant_id_for_phone_number_id(get_db(), phone_number_id)
            if phone_number_id
            else None
        )

        for msg in messages:
            msg_id = msg.get("id", "")
            if msg_id and msg_id in _processed_message_ids:
                continue
            if msg_id:
                _processed_message_ids.add(msg_id)
                if len(_processed_message_ids) > 1000:
                    _processed_message_ids.clear()
                    _processed_message_ids.add(msg_id)

            if msg.get("type") == "text":
                phone = msg["from"]
                text = msg["text"]["body"]
                asyncio.create_task(
                    handle_incoming_message(
                        phone, text, platform="whatsapp", tenant_id=tenant_id
                    )
                )

    except (IndexError, KeyError):
        pass

    return {"status": "ok"}


# ============================================
# TWILIO WHATSAPP SANDBOX (free testing)
# ============================================

@router.post("/twilio")
async def receive_twilio(
    From: Optional[str] = Form(None),
    Body: Optional[str] = Form(None),
):
    """Receive incoming WhatsApp messages via Twilio Sandbox.

    Process asynchronously — respond to Twilio immediately,
    then send bot reply via background task to avoid Twilio timeout.
    """
    if not From or not Body:
        from fastapi.responses import Response
        return Response(
            content='<?xml version="1.0" encoding="UTF-8"?><Response></Response>',
            media_type="application/xml",
        )

    phone = From.replace("whatsapp:", "")

    import asyncio
    asyncio.create_task(_process_twilio_message(phone, Body, From))

    from fastapi.responses import Response
    return Response(
        content='<?xml version="1.0" encoding="UTF-8"?><Response></Response>',
        media_type="application/xml",
    )


async def _process_twilio_message(phone: str, body: str, twilio_from: str):
    """Process message in background and send reply via Twilio REST API."""
    import os
    import httpx

    def safe_log(msg):
        try:
            print(msg)
        except UnicodeEncodeError:
            print(msg.encode("ascii", "replace").decode("ascii"))

    try:
        safe_log(f"[Twilio] Processing message from {phone}: {body[:50]}...")
        reply = await handle_incoming_message(phone, body, platform="whatsapp")

        if not reply:
            safe_log(f"[Twilio] No reply generated")
            return

        safe_log(f"[Twilio] Reply ready ({len(reply)} chars): {reply[:80]}...")

        # Send reply via Twilio REST API
        account_sid = os.getenv("TWILIO_ACCOUNT_SID", "")
        auth_token = os.getenv("TWILIO_AUTH_TOKEN", "")
        twilio_number = os.getenv("TWILIO_WHATSAPP_NUMBER", "whatsapp:+14155238886")

        if account_sid and auth_token:
            async with httpx.AsyncClient(timeout=15) as client:
                resp = await client.post(
                    f"https://api.twilio.com/2010-04-01/Accounts/{account_sid}/Messages.json",
                    auth=(account_sid, auth_token),
                    data={
                        "To": twilio_from,
                        "From": twilio_number,
                        "Body": reply,
                    },
                )
                if resp.status_code == 201:
                    safe_log(f"[Twilio] Message sent successfully")
                else:
                    safe_log(f"[Twilio] Send failed {resp.status_code}: {resp.text[:200]}")
        else:
            safe_log(f"[Twilio] No credentials configured")
    except Exception as e:
        safe_log(f"[Twilio] Background task error: {e}")


# ============================================
# INSTAGRAM DIRECT MESSAGING (via Meta Graph API)
# ============================================

@router.get("/instagram")
async def verify_instagram(
    hub_mode: str = "",
    hub_verify_token: str = "",
    hub_challenge: str = "",
):
    """Instagram webhook verification (same Meta pattern as WhatsApp)."""
    if hub_mode == "subscribe" and hub_verify_token == WHATSAPP_VERIFY_TOKEN:
        return int(hub_challenge)
    raise HTTPException(403, "Verification failed")


@router.post("/instagram")
async def receive_instagram(request: Request):
    """Receive incoming Instagram Direct messages.

    Instagram DM webhooks follow the Meta Messaging API format:
    {
      "entry": [{
        "messaging": [{
          "sender": {"id": "IG_USER_ID"},
          "message": {"text": "..."}
        }]
      }]
    }
    """
    body = await request.json()

    try:
        entry = body.get("entry", [{}])[0]
        messaging_events = entry.get("messaging", [])

        for event in messaging_events:
            message = event.get("message", {})
            if "text" in message:
                sender_id = event["sender"]["id"]
                text = message["text"]
                # Use IG user ID as phone placeholder — will be enriched later
                await handle_incoming_message(
                    sender_id, text, platform="instagram"
                )

    except (IndexError, KeyError):
        pass

    return {"status": "ok"}


# ============================================
# TIKTOK BUSINESS MESSAGING
# ============================================

@router.post("/tiktok")
async def receive_tiktok(request: Request):
    """Receive incoming TikTok Business messages.

    TikTok Business Messaging webhook format:
    {
      "event": "receive_message",
      "content": {
        "open_id": "TIKTOK_USER_ID",
        "text": "..."
      }
    }
    """
    body = await request.json()

    try:
        event = body.get("event", "")
        if event == "receive_message":
            content = body.get("content", {})
            sender_id = content.get("open_id", "")
            text = content.get("text", "")
            if sender_id and text:
                await handle_incoming_message(
                    sender_id, text, platform="tiktok"
                )

    except (KeyError, TypeError):
        pass

    return {"status": "ok"}


# ============================================
# XENDIT QRIS CALLBACK
# ============================================

@router.post("/xendit")
async def xendit_callback(
    request: Request,
    x_callback_token: Optional[str] = Header(None, alias="x-callback-token"),
):
    """Xendit QRIS payment callback.

    Security: Xendit sends an `x-callback-token` header; we require it to
    match XENDIT_WEBHOOK_TOKEN from .env. If the token is unset in .env we
    allow unauthenticated calls (dev mode) so the simulate-paid flow works.
    """
    if XENDIT_WEBHOOK_TOKEN and x_callback_token != XENDIT_WEBHOOK_TOKEN:
        raise HTTPException(401, "Invalid callback token")

    body = await request.json()
    # Xendit QR payment event has status 'SUCCEEDED' and reference_id matching
    # the external_id we stored when creating the QR.
    status = (body.get("status") or "").upper()
    reference_id = body.get("reference_id") or body.get("external_id") or ""
    qr_id = body.get("qr_code_id") or body.get("id") or ""

    if not reference_id and not qr_id:
        return {"status": "ignored", "reason": "no reference or qr id"}

    from app.db import get_db
    db = get_db()

    query = db.table("payment_requests").select("id, status")
    if reference_id:
        query = query.eq("external_id", reference_id)
    elif qr_id:
        query = query.eq("xendit_qr_id", qr_id)
    rows = query.execute().data or []
    if not rows:
        return {"status": "ignored", "reason": "payment_request not found"}

    pr = rows[0]
    if status in ("SUCCEEDED", "COMPLETED", "PAID"):
        from app.routers.pos import _mark_payment_succeeded
        try:
            _mark_payment_succeeded(pr["id"])
        except Exception as e:
            print(f"[Xendit] Failed to finalize payment {pr['id']}: {e}")
    elif status in ("FAILED", "EXPIRED", "CANCELLED"):
        db.table("payment_requests").update({"status": status.lower()}).eq(
            "id", pr["id"]
        ).execute()

    return {"status": "ok"}
