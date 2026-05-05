"""Seed realistic demo data for Kafé Cendana.

Run AFTER `reset_demo.py` to fill the dashboard with believable numbers:
  - 25-35 settled bills across the past 7 days (today included)
  - 4 bookings for today (mix of reserved / occupied / done)
  - 3 sample conversations with the bot (showing inbox content)
  - All amounts use real Kafé Cendana menu prices (Rp 25k-95k items)
  - Distributed across the 5 seed customers (Anindya gets the most as
    a Diamond-tier regular, Ilham the least as a Bronze newcomer)

Run:
  cd backend
  .venv\\Scripts\\python.exe scripts\\seed_realistic_demo.py

Idempotent — checks if ≥10 revenue rows already exist and bails out.
"""

from __future__ import annotations

import os
import random
import sys
from datetime import datetime, timedelta, timezone

sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "..")))
from app.db import get_db  # noqa: E402

DEMO_TENANT_NAME = "Kafé Cendana"

# Distribution weights — Diamond (Anindya) eats here often, Bronze (Ilham) just started.
CUSTOMER_WEIGHTS = [
    ("6281234500001", 30),  # Anindya - Diamond
    ("6281234500002", 25),  # Reza - Gold
    ("6281234500003", 18),  # Maya - Silver
    ("6281234500005", 17),  # Putri - Silver
    ("6281234500004",  5),  # Ilham - Bronze
    (None,             5),  # walk-in (no customer attribution)
]

PAYMENT_METHODS = [("cash", 35), ("qris", 40), ("card", 15), ("transfer", 10)]
COVER_RANGE = (1, 6)


def weighted_choice(pairs: list[tuple]) -> object:
    total = sum(w for _, w in pairs)
    r = random.uniform(0, total)
    upto = 0
    for value, w in pairs:
        if upto + w >= r:
            return value
        upto += w
    return pairs[-1][0]


def realistic_amount() -> int:
    """A typical bill — 1-3 mains + 1-2 drinks + maybe a dessert.
    Returns a rupiah amount in 1000s."""
    mains_avg = random.choice([55000, 62000, 65000, 75000, 85000, 95000])
    n_mains = random.choices([1, 2, 3], weights=[20, 50, 30])[0]
    drinks_avg = random.choice([25000, 32000, 38000, 42000])
    n_drinks = random.choices([0, 1, 2], weights=[10, 60, 30])[0]
    dessert = random.choices([0, 38000, 45000], weights=[55, 25, 20])[0]
    subtotal = mains_avg * n_mains + drinks_avg * n_drinks + dessert
    # Round to nearest 5000 — restaurants don't typically bill odd amounts
    return ((subtotal + 2500) // 5000) * 5000


def main() -> None:
    db = get_db()

    t = db.table("tenants").select("id").eq(
        "business_name", DEMO_TENANT_NAME
    ).execute().data
    if not t:
        print(f"[!] Tenant '{DEMO_TENANT_NAME}' not found")
        sys.exit(1)
    tid = t[0]["id"]

    existing_rev = db.table("revenue_transactions").select(
        "id", count="exact"
    ).eq("tenant_id", tid).execute()
    if (existing_rev.count or 0) >= 10:
        print(
            f"[skip] Already {existing_rev.count} revenue_transactions — "
            f"refusing to over-seed. Run reset_demo.py first if you want a clean slate."
        )
        return

    # Map seed phones to customer ids + tier (for tier-multiplier loyalty calc)
    customers = {
        c["phone"]: {"id": c["id"], "tier": c["tier"], "name": c["name"]}
        for c in db.table("customers").select(
            "id, phone, tier, name"
        ).eq("tenant_id", tid).execute().data
    }

    table_ids = [
        t["id"] for t in db.table("tables").select(
            "id"
        ).eq("tenant_id", tid).execute().data
    ]
    if not table_ids:
        print("[!] No tables seeded — run migration 030 first")
        sys.exit(1)

    # Get a tenant_owner user to attribute the settle to (settled_by)
    owner = db.table("users").select("id").eq(
        "tenant_id", tid
    ).eq("role", "tenant_owner").limit(1).execute().data
    actor_id = owner[0]["id"] if owner else None

    now = datetime.now(timezone.utc)
    revenue_count = 0
    points_total = 0

    # Seed across past 7 days (day 0 = today, 6 = a week ago)
    for days_ago in range(7):
        # More transactions on weekends (today + 6 days back varies by weekday)
        day_dt = now - timedelta(days=days_ago)
        is_weekend = day_dt.weekday() in (5, 6)  # Sat, Sun
        n_transactions = random.randint(
            (5 if is_weekend else 3),
            (8 if is_weekend else 6),
        )

        for _ in range(n_transactions):
            phone = weighted_choice(CUSTOMER_WEIGHTS)
            amount = realistic_amount()
            payment = weighted_choice(PAYMENT_METHODS)
            covers = random.randint(*COVER_RANGE)
            # Random hour within operating hours (10:00 - 22:30)
            hour = random.randint(11, 22)
            minute = random.choice([0, 15, 30, 45])
            settled_at = day_dt.replace(
                hour=hour, minute=minute, second=random.randint(0, 59),
                microsecond=0,
            )
            cust = customers.get(phone) if phone else None

            # Compute points like the floor.settle service would
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
                "amount": amount,
                "payment_method": payment,
                "cover_count": covers,
                "points_awarded": points_awarded,
                "settled_by": actor_id,
                "settled_at": settled_at.isoformat(),
            }).execute().data[0]
            revenue_count += 1

            if cust and points_awarded > 0:
                db.table("loyalty_ledger").insert({
                    "tenant_id": tid,
                    "customer_id": cust["id"],
                    "delta": points_awarded,
                    "reason": "earn_settle",
                    "source_id": tx["id"],
                    "created_by": actor_id,
                    "created_at": settled_at.isoformat(),
                }).execute()
                points_total += points_awarded

    print(f"[ok] Inserted {revenue_count} revenue transactions across 7 days")
    print(f"     Total loyalty points awarded: {points_total}")

    # ---- Today's bookings (4 across the day) ----
    print("\n[ok] Seeding today's bookings...")
    today = now.date().isoformat()
    booking_specs = [
        # phone, time, party_size, table, status, seating, notes
        ("6281234500001", "12:00", 2, "K1", "done",     "Indoor",   None),
        ("6281234500002", "19:00", 4, "T1", "occupied", "Outdoor",  "Anniversary"),
        ("6281234500003", "20:00", 3, "K3", "reserved", "Indoor",   "Window seat preferred"),
        ("6281234500005", "21:00", 5, "P1", "reserved", "Private",  "Birthday celebration"),
    ]
    bookings_inserted = 0
    for phone, time_str, pax, table_id, status, seating, notes in booking_specs:
        cust = customers.get(phone)
        if not cust:
            continue
        # Check this booking doesn't already exist
        existing = db.table("bookings").select("id").eq(
            "tenant_id", tid
        ).eq("date", today).eq("time", time_str).eq(
            "customer_id", cust["id"]
        ).execute().data
        if existing:
            continue
        db.table("bookings").insert({
            "tenant_id": tid,
            "customer_id": cust["id"],
            "date": today,
            "time": time_str,
            "party_size": pax,
            "table_id": table_id,
            "guest_name": cust["name"],
            "customer_phone": phone,
            "seating": seating.lower(),
            "notes": notes,
            "status": status,
            "channel": "whatsapp",
            "confirmation_state": "confirmed" if status != "reserved" else "sent",
            "confirmation_sent_at": now.isoformat(),
        }).execute()
        bookings_inserted += 1
    print(f"     Inserted {bookings_inserted} bookings for today")

    # ---- Sample conversations for inbox ----
    print("\n[ok] Seeding sample conversations...")
    convos = [
        # phone, last_message, unread_count
        (
            "6281234500001",
            "Sip kak, sampai ketemu nanti malam ya 😊",
            0,
        ),
        (
            "6281234500003",
            "Mau tanya menu Mie Aceh masih ada gak ya?",
            1,
        ),
        (
            "6281234500005",
            "Aku reservasi untuk anniversary nih 🎂",
            0,
        ),
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
            "tenant_id": tid,
            "customer_id": cust["id"],
            "last_message": last_msg,
            "last_message_time": "now()",
            "unread_count": unread,
            "status": "bot",
        }).execute().data[0]
        # A couple of historical messages for realism
        msgs = [
            (
                "Halo, mau cek ada meja kosong ga ya buat malem ini?",
                "customer",
            ),
            (
                f"Halo Kak {cust['name']}! Aku Koda dari Kafé Cendana 🌿 Bisa Kak, "
                "untuk berapa orang ya?",
                "bot",
            ),
            (last_msg, "customer" if unread > 0 else "bot"),
        ]
        for content, sender in msgs:
            db.table("messages").insert({
                "tenant_id": tid,
                "conversation_id": conv["id"],
                "customer_id": cust["id"],
                "content": content,
                "sender": sender,
                "read": sender != "customer" or unread == 0,
            }).execute()
        conv_count += 1
    print(f"     Inserted {conv_count} sample conversations")

    print("\n" + "=" * 50)
    print(f"Realistic seed complete for {DEMO_TENANT_NAME}.")
    print("Refresh /dashboard — you'll see live revenue, bookings, and chats.")
    print("=" * 50)


if __name__ == "__main__":
    main()
