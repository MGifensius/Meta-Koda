from fastapi import APIRouter, Depends, HTTPException
from app.db import get_db
from app.models.schemas import CustomerCreate, CustomerUpdate
from app.services.auth import current_user, CurrentUser

router = APIRouter()


@router.get("/")
async def list_customers(
    search: str = "",
    tier: str = "",
    user: CurrentUser = Depends(current_user),
):
    db = get_db()
    query = db.table("customers").select("*").eq(
        "tenant_id", user.tenant_id
    ).order("name")
    if search:
        query = query.or_(
            f"name.ilike.%{search}%,phone.ilike.%{search}%,email.ilike.%{search}%"
        )
    if tier:
        query = query.eq("tier", tier)
    result = query.execute()
    return result.data


@router.get("/{customer_id}")
async def get_customer(
    customer_id: str,
    user: CurrentUser = Depends(current_user),
):
    db = get_db()
    result = db.table("customers").select("*").eq(
        "id", customer_id
    ).eq("tenant_id", user.tenant_id).execute()
    if not result.data:
        raise HTTPException(404, "Customer not found")
    return result.data[0]


@router.post("/", status_code=201)
async def create_customer(
    payload: CustomerCreate,
    user: CurrentUser = Depends(current_user),
):
    db = get_db()
    result = db.table("customers").insert({
        "name": payload.name,
        "phone": payload.phone,
        "email": payload.email,
        "tags": payload.tags,
        "is_member": payload.is_member,
        "points": 0,
        "total_visits": 0,
        "total_spent": 0,
        "tier": "Bronze" if payload.is_member else None,
        "tenant_id": user.tenant_id,
    }).execute()
    return result.data[0]


@router.patch("/{customer_id}")
async def update_customer(
    customer_id: str,
    payload: CustomerUpdate,
    user: CurrentUser = Depends(current_user),
):
    db = get_db()
    update_data = payload.model_dump(exclude_none=True)
    if not update_data:
        raise HTTPException(400, "No fields to update")
    result = db.table("customers").update(update_data).eq(
        "id", customer_id
    ).eq("tenant_id", user.tenant_id).execute()
    if not result.data:
        raise HTTPException(404, "Customer not found")
    return result.data[0]


@router.patch("/{customer_id}/member")
async def toggle_member(
    customer_id: str,
    user: CurrentUser = Depends(current_user),
):
    db = get_db()
    customer = db.table("customers").select("is_member").eq(
        "id", customer_id
    ).eq("tenant_id", user.tenant_id).execute().data
    if not customer:
        raise HTTPException(404, "Customer not found")
    new_value = not customer[0].get("is_member", False)
    result = db.table("customers").update({"is_member": new_value}).eq(
        "id", customer_id
    ).execute()
    return result.data[0]


@router.delete("/{customer_id}", status_code=204)
async def delete_customer(
    customer_id: str,
    user: CurrentUser = Depends(current_user),
):
    """Delete a customer and all of their related data — conversations,
    messages, feedback, redemptions, orders, bookings — within the requester's
    tenant. Cross-tenant deletes are silently scoped out by the tenant_id
    filter on the customers row."""
    db = get_db()
    # Verify customer belongs to this tenant before nuking related rows.
    cust = db.table("customers").select("id").eq("id", customer_id).eq(
        "tenant_id", user.tenant_id
    ).execute().data
    if not cust:
        raise HTTPException(404, "Customer not found")

    convs = db.table("conversations").select("id").eq(
        "customer_id", customer_id
    ).eq("tenant_id", user.tenant_id).execute()
    if convs.data:
        for conv in convs.data:
            db.table("messages").delete().eq("conversation_id", conv["id"]).execute()
    db.table("conversations").delete().eq("customer_id", customer_id).execute()
    db.table("feedback_requests").delete().eq("customer_id", customer_id).execute()
    db.table("redemptions").delete().eq("customer_id", customer_id).execute()
    db.table("orders").delete().eq("customer_id", customer_id).execute()
    db.table("bookings").delete().eq("customer_id", customer_id).execute()
    db.table("customers").delete().eq("id", customer_id).execute()
