"""Public chat widget endpoint — for demo testing without WhatsApp wired up.

Frontend hits `/api/demo-chat/{tenant_slug}/message` with a phone + text. The
backend routes through the same `handle_incoming_message` flow that the
WhatsApp webhook uses (so the conversation lands in the tenant's `/inbox`,
the bot generates a tenant-scoped reply, loyalty/booking tools are
available), but skips the WhatsApp send — the reply is returned in the
HTTP response for the chat widget to render.

No auth required: this is intentionally a public endpoint so testers can
hit it without provisioning user accounts. Tenant scoping is enforced via
the slug in the URL.
"""

from __future__ import annotations

from fastapi import APIRouter, HTTPException

from app.db import get_db
from app.services import bot

router = APIRouter()


@router.get("/{tenant_slug}")
async def get_tenant_info(tenant_slug: str):
    """Public — return tenant display info so the chat widget can render
    the right brand name + welcome message before the first message."""
    db = get_db()
    rows = db.table("tenants").select(
        "id, business_name, slug"
    ).eq("slug", tenant_slug).limit(1).execute().data
    if not rows:
        raise HTTPException(404, "Tenant not found")
    tenant = rows[0]

    settings = db.table("restaurant_settings").select(
        "name, tagline, welcome_message, opening_hours"
    ).eq("tenant_id", tenant["id"]).limit(1).execute().data
    s = settings[0] if settings else {}

    return {
        "tenant_id": tenant["id"],
        "business_name": s.get("name") or tenant["business_name"],
        "tagline": s.get("tagline") or "",
        "welcome_message": s.get("welcome_message") or "Halo! Ada yang bisa dibantu?",
        "opening_hours": s.get("opening_hours") or "",
    }


@router.post("/{tenant_slug}/message")
async def post_message(tenant_slug: str, payload: dict):
    """Process a message from the public chat widget.

    Body:
      phone (str, required) — used as the customer's unique ID within tenant
      text  (str, required) — the message body
      name  (str, optional) — populated on first message to set customer name
    """
    db = get_db()
    rows = db.table("tenants").select("id").eq(
        "slug", tenant_slug
    ).limit(1).execute().data
    if not rows:
        raise HTTPException(404, "Tenant not found")
    tenant_id = rows[0]["id"]

    phone = (payload.get("phone") or "").strip()
    text = (payload.get("text") or "").strip()
    name = (payload.get("name") or "").strip()
    if not phone or not text:
        raise HTTPException(400, "phone and text required")

    # Pre-create or update the customer with the supplied name BEFORE
    # `handle_incoming_message` runs. The bot's flow inserts a placeholder
    # `name = phone` when no row exists, then would only update once the
    # customer types their name in chat. That's awkward for the demo
    # widget where we already have the name from the entry form — set it
    # eagerly so the very first bot reply can address them properly.
    if name:
        existing = db.table("customers").select("id, name").eq(
            "tenant_id", tenant_id
        ).eq("phone", phone).limit(1).execute().data
        if existing:
            cur_name = existing[0].get("name") or ""
            if not cur_name or cur_name == phone or cur_name.startswith("+"):
                db.table("customers").update({"name": name}).eq(
                    "id", existing[0]["id"]
                ).execute()
        else:
            db.table("customers").insert({
                "tenant_id": tenant_id,
                "phone": phone,
                "name": name,
                "points": 0,
                "total_visits": 0,
                "total_spent": 0,
                "is_member": False,
                "tags": ["demo"],
            }).execute()

    # platform="demo" → bot will NOT call the WhatsApp send pipeline.
    # The reply is returned in this HTTP response instead.
    reply = await bot.handle_incoming_message(
        phone=phone, text=text, platform="demo", tenant_id=tenant_id,
    )
    return {"reply": reply}
