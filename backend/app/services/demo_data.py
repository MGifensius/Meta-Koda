"""Demo refresh service — reset + reseed Kafé Cendana via API.

Same logic as `scripts/reset_demo.py` and `scripts/seed_realistic_demo.py`,
exposed as plain functions so a Super-Admin Console button can trigger
the cleanup without dropping into a terminal.
"""

from __future__ import annotations

import random
from datetime import datetime, timedelta, timezone
from typing import Any

DEMO_TENANT_NAME = "Buranchi"

SEED_CUSTOMERS = [
    {"phone": "6281234500001", "name": "Anindya Saraswati", "email": "anindya@example.id",
     "points": 3120, "total_visits": 48, "total_spent": 5840000, "tier": "Diamond",
     "is_member": True, "tags": ["vip", "reservation"]},
    {"phone": "6281234500002", "name": "Reza Pradana", "email": "reza@example.id",
     "points": 1280, "total_visits": 22, "total_spent": 2150000, "tier": "Gold",
     "is_member": True, "tags": ["regular"]},
    {"phone": "6281234500003", "name": "Maya Hartono", "email": "maya@example.id",
     "points": 540, "total_visits": 11, "total_spent": 890000, "tier": "Silver",
     "is_member": True, "tags": ["weekend"]},
    {"phone": "6281234500004", "name": "Ilham Mahendra", "email": None,
     "points": 180, "total_visits": 4, "total_spent": 320000, "tier": "Bronze",
     "is_member": True, "tags": ["new"]},
    {"phone": "6281234500005", "name": "Putri Wijaya", "email": "putri@example.id",
     "points": 720, "total_visits": 14, "total_spent": 1240000, "tier": "Silver",
     "is_member": True, "tags": ["family"]},
]

CUSTOMER_WEIGHTS = [
    ("6281234500001", 30), ("6281234500002", 25), ("6281234500003", 18),
    ("6281234500005", 17), ("6281234500004", 5), (None, 5),
]
PAYMENT_METHODS = [("cash", 35), ("qris", 40), ("card", 15), ("transfer", 10)]


def _weighted_choice(pairs: list[tuple]) -> Any:
    total = sum(w for _, w in pairs)
    r = random.uniform(0, total)
    upto = 0
    for value, w in pairs:
        if upto + w >= r:
            return value
        upto += w
    return pairs[-1][0]


def _realistic_amount() -> int:
    mains = random.choice([55000, 62000, 65000, 75000, 85000, 95000])
    n_mains = random.choices([1, 2, 3], weights=[20, 50, 30])[0]
    drinks = random.choice([25000, 32000, 38000, 42000])
    n_drinks = random.choices([0, 1, 2], weights=[10, 60, 30])[0]
    dessert = random.choices([0, 38000, 45000], weights=[55, 25, 20])[0]
    subtotal = mains * n_mains + drinks * n_drinks + dessert
    return ((subtotal + 2500) // 5000) * 5000


def _find_demo_tenant(db) -> dict | None:
    rows = db.table("tenants").select("id, business_name").eq(
        "business_name", DEMO_TENANT_NAME
    ).execute().data
    return rows[0] if rows else None


def reset_kafe_cendana(db) -> dict:
    """Wipe test data + restore seed customers + reset table state."""
    t = _find_demo_tenant(db)
    if not t:
        return {"ok": False, "error": f"Tenant '{DEMO_TENANT_NAME}' not found"}
    tid = t["id"]
    counts: dict[str, int] = {}

    msgs = db.table("messages").select(
        "id, conversations!inner(tenant_id)"
    ).eq("conversations.tenant_id", tid).execute().data or []
    if msgs:
        ids = [m["id"] for m in msgs]
        for chunk in range(0, len(ids), 100):
            db.table("messages").delete().in_("id", ids[chunk:chunk + 100]).execute()
    counts["messages"] = len(msgs)

    res = db.table("conversations").delete().eq("tenant_id", tid).execute()
    counts["conversations"] = len(res.data) if res.data else 0
    res = db.table("booking_events").delete().eq("tenant_id", tid).execute()
    counts["booking_events"] = len(res.data) if res.data else 0
    res = db.table("revenue_transactions").delete().eq("tenant_id", tid).execute()
    counts["revenue_transactions"] = len(res.data) if res.data else 0
    res = db.table("loyalty_ledger").delete().eq("tenant_id", tid).execute()
    counts["loyalty_ledger"] = len(res.data) if res.data else 0
    res = db.table("bookings").delete().eq("tenant_id", tid).execute()
    counts["bookings"] = len(res.data) if res.data else 0

    seed_phones = [c["phone"] for c in SEED_CUSTOMERS]
    all_customers = db.table("customers").select(
        "id, phone"
    ).eq("tenant_id", tid).execute().data
    test_ids = [c["id"] for c in all_customers if c["phone"] not in seed_phones]
    if test_ids:
        for chunk in range(0, len(test_ids), 100):
            db.table("customers").delete().in_("id", test_ids[chunk:chunk + 100]).execute()
    counts["test_customers"] = len(test_ids)

    for sc in SEED_CUSTOMERS:
        existing = db.table("customers").select("id").eq(
            "tenant_id", tid
        ).eq("phone", sc["phone"]).execute().data
        payload = {
            "name": sc["name"], "phone": sc["phone"], "email": sc["email"],
            "points": sc["points"], "total_visits": sc["total_visits"],
            "total_spent": sc["total_spent"], "tier": sc["tier"],
            "is_member": sc["is_member"], "tags": sc["tags"],
            "last_visit": None,
        }
        if existing:
            db.table("customers").update(payload).eq("id", existing[0]["id"]).execute()
        else:
            db.table("customers").insert({"tenant_id": tid, **payload}).execute()

    db.table("tables").update({
        "status": "available",
        "current_booking_id": None,
        "cleaning_until": None,
    }).eq("tenant_id", tid).execute()

    return {"ok": True, "tenant_id": tid, **counts}


def seed_kafe_cendana(db) -> dict:
    """Fill with realistic 7-day revenue + today's bookings + sample chats."""
    t = _find_demo_tenant(db)
    if not t:
        return {"ok": False, "error": f"Tenant '{DEMO_TENANT_NAME}' not found"}
    tid = t["id"]

    customers = {
        c["phone"]: {"id": c["id"], "tier": c["tier"], "name": c["name"]}
        for c in db.table("customers").select(
            "id, phone, tier, name"
        ).eq("tenant_id", tid).execute().data
    }
    table_ids = [
        x["id"] for x in db.table("tables").select(
            "id"
        ).eq("tenant_id", tid).execute().data
    ]
    owner = db.table("users").select("id").eq(
        "tenant_id", tid
    ).eq("role", "tenant_owner").limit(1).execute().data
    actor_id = owner[0]["id"] if owner else None

    now = datetime.now(timezone.utc)
    revenue_count = 0
    points_total = 0

    for days_ago in range(7):
        day_dt = now - timedelta(days=days_ago)
        is_weekend = day_dt.weekday() in (5, 6)
        n = random.randint((5 if is_weekend else 3), (8 if is_weekend else 6))
        for _ in range(n):
            phone = _weighted_choice(CUSTOMER_WEIGHTS)
            amount = _realistic_amount()
            payment = _weighted_choice(PAYMENT_METHODS)
            covers = random.randint(1, 6)
            settled_at = day_dt.replace(
                hour=random.randint(11, 22),
                minute=random.choice([0, 15, 30, 45]),
                second=random.randint(0, 59),
                microsecond=0,
            )
            cust = customers.get(phone) if phone else None
            points_awarded = 0
            if cust:
                base = amount // 10000
                multiplier = {"Diamond": 2.0, "Gold": 1.5, "Silver": 1.25}.get(
                    cust["tier"], 1.0,
                )
                points_awarded = int(base * multiplier)
            tx = db.table("revenue_transactions").insert({
                "tenant_id": tid,
                "table_id": random.choice(table_ids),
                "customer_id": cust["id"] if cust else None,
                "amount": amount, "payment_method": payment,
                "cover_count": covers, "points_awarded": points_awarded,
                "settled_by": actor_id,
                "settled_at": settled_at.isoformat(),
            }).execute().data[0]
            revenue_count += 1
            if cust and points_awarded > 0:
                db.table("loyalty_ledger").insert({
                    "tenant_id": tid, "customer_id": cust["id"],
                    "delta": points_awarded, "reason": "earn_settle",
                    "source_id": tx["id"], "created_by": actor_id,
                    "created_at": settled_at.isoformat(),
                }).execute()
                points_total += points_awarded

    today = now.date().isoformat()
    # Real Buranchi tables: TO-* (Teras Otella, outdoor 4-pax), PS-* (Poolside
    # small, outdoor 2-pax), PL-* (Poolside large segitiga, outdoor 6-pax),
    # IL-* (Indoor Otella long, indoor 10-pax), IR-* (Indoor Otella round,
    # indoor 8-pax). The actual zone label comes from tables.zone via
    # table_id — `seating` here is just the indoor/outdoor preference,
    # constrained by bookings_seating_check from migration 008.
    booking_specs = [
        ("6281234500001", "12:00", 2, "PS-1", "done",     "outdoor", "Poolside spot"),
        ("6281234500002", "19:00", 4, "TO-2", "occupied", "outdoor", "Teras Otella - Anniversary"),
        ("6281234500003", "20:00", 6, "PL-1", "reserved", "outdoor", "Poolside meja segitiga preferred"),
        ("6281234500005", "21:00", 8, "IR-1", "reserved", "indoor",  "Indoor Otella - Birthday celebration"),
    ]
    bookings_inserted = 0
    for phone, t_str, pax, tbl, status, seating, notes in booking_specs:
        cust = customers.get(phone)
        if not cust:
            continue
        existing = db.table("bookings").select("id").eq(
            "tenant_id", tid
        ).eq("date", today).eq("time", t_str).eq(
            "customer_id", cust["id"]
        ).execute().data
        if existing:
            continue
        db.table("bookings").insert({
            "tenant_id": tid, "customer_id": cust["id"], "date": today,
            "time": t_str, "party_size": pax, "table_id": tbl,
            "guest_name": cust["name"], "customer_phone": phone,
            "seating": seating, "notes": notes, "status": status,
            "channel": "whatsapp",
            "confirmation_state": "confirmed" if status != "reserved" else "sent",
            "confirmation_sent_at": now.isoformat(),
        }).execute()
        bookings_inserted += 1

    convos = [
        ("6281234500001", "Sip kak, sampai ketemu nanti malam ya 😊", 0),
        ("6281234500003", "Mau tanya menu Mie Aceh masih ada gak ya?", 1),
        ("6281234500005", "Aku reservasi untuk anniversary nih 🎂", 0),
    ]
    conv_count = 0
    for phone, last_msg, unread in convos:
        cust = customers.get(phone)
        if not cust:
            continue
        existing = db.table("conversations").select("id").eq(
            "tenant_id", tid
        ).eq("customer_id", cust["id"]).execute().data
        if existing:
            continue
        conv = db.table("conversations").insert({
            "tenant_id": tid, "customer_id": cust["id"],
            "last_message": last_msg, "last_message_time": "now()",
            "unread_count": unread, "status": "bot",
        }).execute().data[0]
        msgs = [
            ("Halo, mau cek ada meja kosong ga ya buat malem ini?", "customer"),
            (f"Halo Kak {cust['name']}! Aku Koda dari Buranchi 🌿 Bisa Kak, untuk berapa orang ya?", "bot"),
            (last_msg, "customer" if unread > 0 else "bot"),
        ]
        for content, sender in msgs:
            db.table("messages").insert({
                "tenant_id": tid, "conversation_id": conv["id"],
                "customer_id": cust["id"], "content": content,
                "sender": sender, "read": sender != "customer" or unread == 0,
            }).execute()
        conv_count += 1

    return {
        "ok": True,
        "revenue_transactions": revenue_count,
        "loyalty_points_awarded": points_total,
        "bookings": bookings_inserted,
        "conversations": conv_count,
    }


def refresh_kafe_cendana(db) -> dict:
    """Reset + reseed in one call. Returns combined counts."""
    reset = reset_kafe_cendana(db)
    if not reset.get("ok"):
        return {"ok": False, "error": reset.get("error")}
    seed = seed_kafe_cendana(db)
    if not seed.get("ok"):
        return {"ok": False, "error": seed.get("error")}
    return {"ok": True, "reset": reset, "seed": seed}
