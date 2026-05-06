"""Booking-related WhatsApp message builders + send helpers.

All templates pull the tenant's display name from `restaurant_settings.name`
(falling back to `tenants.business_name`) so a single message function can
serve every tenant. PR 6 will plug per-tenant WABA credentials into the
underlying send path; for now everything funnels through the global
`whatsapp.send_message`, which dry-runs to console when credentials aren't
configured.
"""

from __future__ import annotations

from typing import Optional

from app.db import get_db
from app.services.whatsapp import send_message


def _tenant_name(db, tenant_id: str) -> str:
    """Best-effort display name for the tenant — used in message templates."""
    rows = db.table("restaurant_settings").select("name").eq(
        "tenant_id", tenant_id
    ).limit(1).execute().data
    if rows and rows[0].get("name"):
        return rows[0]["name"]
    rows = db.table("tenants").select("business_name").eq(
        "id", tenant_id
    ).limit(1).execute().data
    return (rows[0].get("business_name") if rows else None) or "Restoran"


def _greet_name(booking: dict) -> str:
    cust = booking.get("customers") or {}
    return cust.get("name") or booking.get("guest_name") or "Kak"


def _phone(booking: dict) -> Optional[str]:
    cust = booking.get("customers") or {}
    return cust.get("phone") or booking.get("customer_phone")


def build_confirmation(booking: dict, tenant_name: str) -> str:
    """H-24 confirmation request. Customer is asked to reply Y/N."""
    name = _greet_name(booking)
    return (
        f"Halo {name}! 👋\n\n"
        f"Ini konfirmasi reservasi kamu di *{tenant_name}*:\n"
        f"📅 {booking['date']} · ⏰ {booking['time']}\n"
        f"👥 {booking.get('party_size') or '—'} orang"
        + (f" · 🪑 Meja {booking['table_id']}" if booking.get("table_id") else "")
        + "\n\n"
        f"Mohon balas:\n"
        f"  *YA* — kalau jadi datang\n"
        f"  *BATAL* — kalau perlu dibatalkan\n\n"
        f"Terima kasih! 🙏"
    )


def build_reminder(booking: dict, tenant_name: str) -> str:
    """H-30m final ping. Customer is asked to confirm attendance —
    response handler will release the table on a 'no' or hold it on 'ya'."""
    name = _greet_name(booking)
    table_line = (
        f"Meja {booking['table_id']} udah disiapin buat kamu 🍽️\n\n"
        if booking.get("table_id")
        else ""
    )
    return (
        f"Hai {name}! ⏰\n\n"
        f"Reservasi kamu di *{tenant_name}* tinggal 30 menit lagi nih, "
        f"jam {booking['time']}.\n"
        + table_line
        + "Mohon balas:\n"
        + "  *YA* — kalau jadi datang\n"
        + "  *BATAL* — kalau ga jadi datang\n\n"
        + "Kalau ga ada balasan, mejanya akan kami release otomatis 15 menit "
        + "setelah jam reservasi. Terima kasih 🙏"
    )


def build_cancelled_no_show(booking: dict, tenant_name: str) -> str:
    """T+15min auto-cancel notification."""
    name = _greet_name(booking)
    return (
        f"Hai {name},\n\n"
        f"Reservasi kamu di *{tenant_name}* jam {booking['time']} otomatis "
        f"dibatalkan karena belum hadir setelah 15 menit dari waktu reservasi.\n\n"
        f"Kalau masih ingin datang, silakan booking ulang ya. 🙏"
    )


async def send_confirmation(db, booking: dict, tenant_id: str) -> bool:
    phone = _phone(booking)
    if not phone:
        return False
    text = build_confirmation(booking, _tenant_name(db, tenant_id))
    return await send_message(phone, text, tenant_id=tenant_id)


async def send_reminder(db, booking: dict, tenant_id: str) -> bool:
    phone = _phone(booking)
    if not phone:
        return False
    text = build_reminder(booking, _tenant_name(db, tenant_id))
    return await send_message(phone, text, tenant_id=tenant_id)


async def send_cancelled_no_show(db, booking: dict, tenant_id: str) -> bool:
    phone = _phone(booking)
    if not phone:
        return False
    text = build_cancelled_no_show(booking, _tenant_name(db, tenant_id))
    return await send_message(phone, text, tenant_id=tenant_id)


# ----------------------------------------------------------
# Audit log helper
# ----------------------------------------------------------
def log_event(
    db,
    *,
    tenant_id: str,
    booking_id: str,
    event_type: str,
    payload: Optional[dict] = None,
    actor_id: Optional[str] = None,
) -> None:
    """Insert a row into `booking_events`. Best-effort: failures are swallowed
    so a logging error never blocks the actual booking transition."""
    try:
        db.table("booking_events").insert({
            "tenant_id": tenant_id,
            "booking_id": booking_id,
            "event_type": event_type,
            "payload": payload or {},
            "actor_id": actor_id,
        }).execute()
    except Exception as e:
        print(f"[booking_events] log failed: {e}", flush=True)
