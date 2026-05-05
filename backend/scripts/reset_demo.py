"""Reset Kafé Cendana tenant ke state demo segar.

Hapus semua test data (conversations, messages, bookings, revenue, ledger,
tables status) tapi PERTAHANKAN seed data:
  - 12 menu items
  - 10 tables (status reset ke 'available')
  - 8 rewards
  - 5 demo customers (Anindya, Reza, Maya, Ilham, Putri) dengan points
    direset ke nilai migration 030
  - 5 marketing campaigns (drafts)
  - Subscription Kafé Cendana (lifetime sampai 2099)
  - WhatsApp account configuration

Run:
  cd backend
  .venv\\Scripts\\python.exe scripts\\reset_demo.py
"""

from __future__ import annotations

import os
import sys

# Ensure backend/ is on path
sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "..")))

from app.db import get_db  # noqa: E402

DEMO_TENANT_NAME = "Kafé Cendana"

# Seed customers' canonical state from migration 030 — restored after reset.
SEED_CUSTOMERS = [
    {
        "phone": "6281234500001",
        "name": "Anindya Saraswati",
        "email": "anindya@example.id",
        "points": 3120,
        "total_visits": 48,
        "total_spent": 5840000,
        "tier": "Diamond",
        "is_member": True,
        "tags": ["vip", "reservation"],
    },
    {
        "phone": "6281234500002",
        "name": "Reza Pradana",
        "email": "reza@example.id",
        "points": 1280,
        "total_visits": 22,
        "total_spent": 2150000,
        "tier": "Gold",
        "is_member": True,
        "tags": ["regular"],
    },
    {
        "phone": "6281234500003",
        "name": "Maya Hartono",
        "email": "maya@example.id",
        "points": 540,
        "total_visits": 11,
        "total_spent": 890000,
        "tier": "Silver",
        "is_member": True,
        "tags": ["weekend"],
    },
    {
        "phone": "6281234500004",
        "name": "Ilham Mahendra",
        "email": None,
        "points": 180,
        "total_visits": 4,
        "total_spent": 320000,
        "tier": "Bronze",
        "is_member": True,
        "tags": ["new"],
    },
    {
        "phone": "6281234500005",
        "name": "Putri Wijaya",
        "email": "putri@example.id",
        "points": 720,
        "total_visits": 14,
        "total_spent": 1240000,
        "tier": "Silver",
        "is_member": True,
        "tags": ["family"],
    },
]


def main() -> None:
    db = get_db()

    # 1. Find tenant
    tenants = db.table("tenants").select("id, business_name").eq(
        "business_name", DEMO_TENANT_NAME
    ).execute().data
    if not tenants:
        print(f"[!] Tenant '{DEMO_TENANT_NAME}' not found. Aborting.")
        sys.exit(1)
    tid = tenants[0]["id"]
    print(f"[ok] Resetting tenant: {DEMO_TENANT_NAME} ({tid})")

    # 2. Delete child tables in dependency order to avoid FK violations.
    #
    # messages.customer_id has no CASCADE, so we must delete messages
    # before customers.
    print("\n[1/7] Deleting messages...")
    msgs = db.table("messages").select("id, conversations!inner(tenant_id)").eq(
        "conversations.tenant_id", tid
    ).execute().data
    if msgs:
        ids = [m["id"] for m in msgs]
        for chunk_start in range(0, len(ids), 100):
            chunk = ids[chunk_start: chunk_start + 100]
            db.table("messages").delete().in_("id", chunk).execute()
        print(f"      deleted {len(ids)} messages")
    else:
        print("      none")

    print("\n[2/7] Deleting conversations...")
    res = db.table("conversations").delete().eq("tenant_id", tid).execute()
    print(f"      deleted {len(res.data) if res.data else 0} conversations")

    print("\n[3/7] Deleting booking_events...")
    res = db.table("booking_events").delete().eq("tenant_id", tid).execute()
    print(f"      deleted {len(res.data) if res.data else 0} events")

    print("\n[4/7] Deleting revenue_transactions...")
    res = db.table("revenue_transactions").delete().eq("tenant_id", tid).execute()
    print(f"      deleted {len(res.data) if res.data else 0} transactions")

    print("\n[5/7] Deleting loyalty_ledger entries...")
    res = db.table("loyalty_ledger").delete().eq("tenant_id", tid).execute()
    print(f"      deleted {len(res.data) if res.data else 0} ledger rows")

    print("\n[6/7] Deleting bookings...")
    res = db.table("bookings").delete().eq("tenant_id", tid).execute()
    print(f"      deleted {len(res.data) if res.data else 0} bookings")

    # 7. Delete non-seed customers, restore seed customers' state.
    print("\n[7/7] Resetting customers...")
    seed_phones = [c["phone"] for c in SEED_CUSTOMERS]
    all_customers = db.table("customers").select("id, phone, name").eq(
        "tenant_id", tid
    ).execute().data
    test_customer_ids = [
        c["id"] for c in all_customers if c["phone"] not in seed_phones
    ]
    if test_customer_ids:
        for chunk_start in range(0, len(test_customer_ids), 100):
            chunk = test_customer_ids[chunk_start: chunk_start + 100]
            db.table("customers").delete().in_("id", chunk).execute()
        print(f"      deleted {len(test_customer_ids)} test customers")
    else:
        print("      no test customers to delete")

    # Restore seed customers' canonical state.
    for sc in SEED_CUSTOMERS:
        existing = db.table("customers").select("id").eq(
            "tenant_id", tid
        ).eq("phone", sc["phone"]).execute().data
        payload = {
            "tenant_id": tid,
            "name": sc["name"],
            "phone": sc["phone"],
            "email": sc["email"],
            "points": sc["points"],
            "total_visits": sc["total_visits"],
            "total_spent": sc["total_spent"],
            "tier": sc["tier"],
            "is_member": sc["is_member"],
            "tags": sc["tags"],
            "last_visit": None,
        }
        if existing:
            # Drop tenant_id from update (immutable identity field)
            update_payload = {k: v for k, v in payload.items() if k != "tenant_id"}
            db.table("customers").update(update_payload).eq(
                "id", existing[0]["id"]
            ).execute()
        else:
            db.table("customers").insert(payload).execute()
    print(f"      reset {len(SEED_CUSTOMERS)} seed customers to canonical state")

    # 8. Reset all tables to 'available'
    print("\n[bonus] Resetting tables to 'available'...")
    db.table("tables").update({
        "status": "available",
        "current_booking_id": None,
        "cleaning_until": None,
    }).eq("tenant_id", tid).execute()
    tables_count = db.table("tables").select(
        "id", count="exact"
    ).eq("tenant_id", tid).execute().count or 0
    print(f"        reset {tables_count} tables to 'available'")

    print("\n" + "=" * 50)
    print(f"Demo reset complete for {DEMO_TENANT_NAME}.")
    print("Ready for next testing session.")
    print("=" * 50)


if __name__ == "__main__":
    main()
