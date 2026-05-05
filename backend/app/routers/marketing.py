from fastapi import APIRouter, Depends, HTTPException
from app.db import get_db
from app.models.schemas import CampaignCreate
from app.services.auth import current_user, CurrentUser
from app.services.whatsapp import send_bulk_message, send_template

router = APIRouter()


@router.get("/campaigns")
async def list_campaigns(
    status: str = "",
    user: CurrentUser = Depends(current_user),
):
    db = get_db()
    query = db.table("campaigns").select("*").eq(
        "tenant_id", user.tenant_id
    ).order("created_at", desc=True)
    if status:
        query = query.eq("status", status)
    return query.execute().data


@router.post("/campaigns", status_code=201)
async def create_campaign(
    payload: CampaignCreate,
    user: CurrentUser = Depends(current_user),
):
    db = get_db()
    audience_count = _get_audience_count(user.tenant_id, payload.audience)
    result = db.table("campaigns").insert({
        "name": payload.name,
        "message": payload.message,
        "audience": payload.audience,
        "target_audience": payload.target_audience,
        "audience_count": audience_count,
        "status": "scheduled" if payload.scheduled_at else "draft",
        "scheduled_at": payload.scheduled_at,
        "delivered": 0,
        "read": 0,
        "tenant_id": user.tenant_id,
        "template_name": payload.template_name,
        "template_language": payload.template_language,
        "template_params": payload.template_params,
    }).execute()
    return result.data[0]


@router.post("/campaigns/{campaign_id}/send")
async def send_campaign(
    campaign_id: str,
    user: CurrentUser = Depends(current_user),
):
    db = get_db()
    result = db.table("campaigns").select("*").eq(
        "id", campaign_id
    ).eq("tenant_id", user.tenant_id).execute()
    if not result.data:
        raise HTTPException(404, "Campaign not found")
    campaign = result.data[0]

    customers = _get_audience_customers(
        user.tenant_id, campaign.get("target_audience", "all")
    )

    template_name = campaign.get("template_name")
    template_language = campaign.get("template_language") or "en_US"
    template_params = campaign.get("template_params") or []

    delivered = 0
    for customer in customers:
        name = customer.get("name") or ""
        has_real_name = name and name != customer.get("phone") and not name.startswith("+")

        # Personalized plain-text body — used both as outbound text (when no
        # template) and as the Inbox log entry for the agent's record.
        if has_real_name:
            message = campaign["message"].replace("{name}", name)
        else:
            message = (
                campaign["message"].replace(" {name}", "").replace("{name}", "")
            )

        if template_name:
            fallback = name if has_real_name else "Kak"
            resolved_params = [
                fallback if p == "{{customer_name}}" else p
                for p in template_params
            ]
            success = await send_template(
                customer["phone"], template_name, template_language, resolved_params
            )
        else:
            success = await send_bulk_message(customer["phone"], message)

        if success:
            delivered += 1
            _log_outbound_message(db, user.tenant_id, customer.get("id"), message)

    db.table("campaigns").update({
        "status": "sent",
        "sent_at": "now()",
        "delivered": delivered,
    }).eq("id", campaign_id).execute()

    return {"delivered": delivered, "total": len(customers)}


def _get_audience_count(tenant_id: str, audience: str) -> int:
    db = get_db()
    base = db.table("customers").select("id", count="exact").eq(
        "tenant_id", tenant_id
    )
    if audience == "all":
        return base.execute().count or 0
    if audience == "member":
        return base.eq("is_member", True).execute().count or 0
    if audience == "non-member":
        return base.eq("is_member", False).execute().count or 0
    # Other audience filters (inactive-30d, birthday-*) get computed in PR 9.
    return 0


def _get_audience_customers(tenant_id: str, target_audience: str) -> list[dict]:
    db = get_db()
    base = db.table("customers").select("id, name, phone").eq(
        "tenant_id", tenant_id
    )
    if target_audience == "all":
        return base.execute().data
    if target_audience == "member":
        return base.eq("is_member", True).execute().data
    if target_audience == "non-member":
        return base.eq("is_member", False).execute().data
    return []


def _log_outbound_message(db, tenant_id: str, customer_id: str, body: str) -> None:
    """Persist an outbound marketing message to the Inbox so it shows up
    in the conversation timeline alongside bot/agent messages."""
    if not customer_id or not body:
        return
    try:
        existing = db.table("conversations").select(
            "id"
        ).eq("customer_id", customer_id).eq("tenant_id", tenant_id).execute()
        if existing.data:
            conv_id = existing.data[0]["id"]
            db.table("conversations").update({
                "last_message": body,
                "last_message_time": "now()",
            }).eq("id", conv_id).execute()
        else:
            conv_insert = db.table("conversations").insert({
                "customer_id": customer_id,
                "last_message": body,
                "last_message_time": "now()",
                "unread_count": 0,
                "status": "active",
                "tenant_id": tenant_id,
            }).execute()
            conv_id = conv_insert.data[0]["id"]

        db.table("messages").insert({
            "conversation_id": conv_id,
            "customer_id": customer_id,
            "content": body,
            "sender": "agent",
            "read": True,
            "tenant_id": tenant_id,
        }).execute()
    except Exception as e:
        print(f"[Marketing-log] FAIL: {type(e).__name__}: {e}", flush=True)
