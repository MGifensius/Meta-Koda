from fastapi import APIRouter, Depends, HTTPException
from app.db import get_db
from app.models.schemas import ChatMessageCreate
from app.services.auth import current_user, CurrentUser

router = APIRouter()


@router.get("/conversations")
async def list_conversations(user: CurrentUser = Depends(current_user)):
    db = get_db()
    return db.table("conversations").select(
        "*, customers(name, phone)"
    ).eq("tenant_id", user.tenant_id).order(
        "last_message_time", desc=True
    ).execute().data


@router.get("/conversations/{conversation_id}/messages")
async def get_messages(
    conversation_id: str,
    user: CurrentUser = Depends(current_user),
):
    db = get_db()
    # Verify conversation belongs to this tenant before returning messages.
    conv = db.table("conversations").select("id").eq(
        "id", conversation_id
    ).eq("tenant_id", user.tenant_id).execute().data
    if not conv:
        raise HTTPException(404, "Conversation not found")
    return db.table("messages").select("*").eq(
        "conversation_id", conversation_id
    ).order("timestamp").execute().data


@router.post("/messages", status_code=201)
async def send_message(
    payload: ChatMessageCreate,
    user: CurrentUser = Depends(current_user),
):
    db = get_db()

    # Tenant-scoped conversation lookup.
    conv = db.table("conversations").select("customer_id").eq(
        "id", payload.conversation_id
    ).eq("tenant_id", user.tenant_id).execute().data
    if not conv:
        raise HTTPException(404, "Conversation not found")
    customer_id = conv[0]["customer_id"]

    # Save message
    result = db.table("messages").insert({
        "conversation_id": payload.conversation_id,
        "customer_id": customer_id,
        "content": payload.content,
        "sender": payload.sender,
        "read": True,
        "tenant_id": user.tenant_id,
    }).execute()

    # Update conversation
    db.table("conversations").update({
        "last_message": payload.content,
        "last_message_time": "now()",
        "status": "active" if payload.sender == "agent" else "bot",
    }).eq("id", payload.conversation_id).execute()

    # If agent message, also send via WhatsApp.
    if payload.sender == "agent":
        from app.services.whatsapp import send_message as wa_send
        customer = db.table("customers").select("phone").eq(
            "id", customer_id
        ).execute().data
        if customer:
            await wa_send(customer[0]["phone"], payload.content)

    return result.data[0]


@router.post("/conversations/{conversation_id}/read")
async def mark_read(
    conversation_id: str,
    user: CurrentUser = Depends(current_user),
):
    db = get_db()
    # Verify conversation belongs to this tenant.
    conv = db.table("conversations").select("id").eq(
        "id", conversation_id
    ).eq("tenant_id", user.tenant_id).execute().data
    if not conv:
        raise HTTPException(404, "Conversation not found")
    db.table("messages").update({"read": True}).eq(
        "conversation_id", conversation_id
    ).eq("read", False).execute()
    db.table("conversations").update({"unread_count": 0}).eq(
        "id", conversation_id
    ).execute()
    return {"ok": True}
