"""End-to-end verification of the non-WhatsApp flows.

Signs in as demo@metaseti.com (Kafé Cendana tenant_owner), exercises the
critical paths through the real backend, then signs in as super_admin and
hits the admin endpoints. Reports PASS/FAIL per flow.

Run: .venv\\Scripts\\python.exe scripts\\e2e_check.py
"""

from __future__ import annotations

import asyncio
import os
import sys
from typing import Any

import httpx

# Ensure backend/ is on path
sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "..")))
from app.config import SUPABASE_URL, SUPABASE_KEY  # service-role for direct DB checks
from app.db import get_db  # noqa: E402

# Read anon key from env (frontend uses it for sign-in)
import dotenv  # type: ignore
dotenv.load_dotenv(os.path.join(os.path.dirname(__file__), "..", ".env"))

# We'll use service-role for direct DB queries, anon key isn't loaded here
# but we can use SUPABASE_KEY (service role) for the auth admin /token endpoint
# Actually for password sign-in we need anon key. Let's use SUPABASE_KEY since
# it works for all paths via the auth REST API.

API = "http://127.0.0.1:8000/api"
PASS = "[OK]"
FAIL = "[FAIL]"


async def sign_in(email: str, password: str) -> str | None:
    """Sign in via Supabase Auth REST. Returns JWT or None."""
    if not SUPABASE_URL:
        return None
    async with httpx.AsyncClient(timeout=10) as client:
        r = await client.post(
            f"{SUPABASE_URL.rstrip('/')}/auth/v1/token?grant_type=password",
            headers={"apikey": SUPABASE_KEY or "", "Content-Type": "application/json"},
            json={"email": email, "password": password},
        )
    if r.status_code == 200:
        return r.json().get("access_token")
    print(f"    sign-in failed for {email}: {r.status_code} {r.text[:200]}")
    return None


async def call(token: str, method: str, path: str, json: dict | None = None) -> tuple[int, Any]:
    async with httpx.AsyncClient(timeout=15) as client:
        r = await client.request(
            method,
            f"{API}{path}",
            headers={"Authorization": f"Bearer {token}"},
            json=json,
        )
    try:
        body = r.json()
    except Exception:
        body = r.text
    return r.status_code, body


def check(label: str, ok: bool, detail: str = "") -> None:
    mark = PASS if ok else FAIL
    print(f"  {mark} {label}" + (f" — {detail}" if detail else ""))


async def main() -> None:
    print("=" * 70)
    print("META-KODA END-TO-END CHECK")
    print("=" * 70)
    db = get_db()

    # ----------------------------------------------------------
    # 1. Direct DB sanity (migrations applied?)
    # ----------------------------------------------------------
    print("\n[1] Database state (direct service-role queries)")

    tenants = db.table("tenants").select("id, business_name, tenant_code, subscription_status").execute().data
    check("tenants table populated", len(tenants) >= 2, f"{len(tenants)} tenants")
    for t in tenants:
        print(f"      • {t['tenant_code']} — {t['subscription_status']}")

    demo = next((t for t in tenants if t["business_name"] == "Kafé Cendana"), None)
    buranchi = next((t for t in tenants if t["business_name"] == "Buranchi"), None)
    check("Kafé Cendana exists", demo is not None)
    check("Buranchi exists", buranchi is not None)
    if not demo:
        print("    Migration 030 not applied — abort.")
        return

    demo_tid = demo["id"]
    menu = db.table("menu_items").select("id", count="exact").eq("tenant_id", demo_tid).execute()
    tables = db.table("tables").select("id", count="exact").eq("tenant_id", demo_tid).execute()
    rewards = db.table("rewards").select("id", count="exact").eq("tenant_id", demo_tid).execute()
    customers = db.table("customers").select("id, name, points, tier", count="exact").eq("tenant_id", demo_tid).execute()
    campaigns = db.table("campaigns").select("id, name, status", count="exact").eq("tenant_id", demo_tid).execute()
    loy = db.table("loyalty_settings").select("*").eq("tenant_id", demo_tid).execute().data

    check("Kafé Cendana menu items >= 12", (menu.count or 0) >= 12, f"{menu.count} items")
    check("Kafé Cendana tables >= 10", (tables.count or 0) >= 10, f"{tables.count} tables")
    check("Kafé Cendana rewards >= 6", (rewards.count or 0) >= 6, f"{rewards.count} rewards")
    check("Kafé Cendana demo customers >= 5", (customers.count or 0) >= 5, f"{customers.count} customers")
    check("Kafé Cendana marketing drafts >= 5", (campaigns.count or 0) >= 5, f"{campaigns.count} campaigns")
    check("Kafé Cendana loyalty_settings exists", len(loy) > 0)

    # ----------------------------------------------------------
    # 2. Tenant-side flows (demo@metaseti.com)
    # ----------------------------------------------------------
    print("\n[2] Tenant flows — demo@metaseti.com")
    demo_pw = os.environ.get("DEMO_PASSWORD") or "Metaseti$123"
    tok = await sign_in("demo@metaseti.com", demo_pw)
    check("sign-in succeeded", tok is not None)
    if not tok:
        return

    s, body = await call(tok, "GET", "/health")
    check("health reachable with JWT", s == 200)

    s, body = await call(tok, "GET", "/dashboard/stats")
    check("/dashboard/stats", s == 200, f"revenue_today={body.get('revenue_today') if isinstance(body, dict) else '?'}")

    s, tables_resp = await call(tok, "GET", "/floor/tables")
    check("/floor/tables", s == 200, f"{len(tables_resp) if isinstance(tables_resp, list) else '?'} tables")

    s, today = await call(tok, "GET", "/floor/today")
    check("/floor/today summary", s == 200)

    s, body = await call(tok, "GET", "/customers/")
    cust_count = len(body) if isinstance(body, list) else 0
    check("/customers/ list", s == 200, f"{cust_count} customers")

    s, body = await call(tok, "GET", "/loyalty/settings")
    check("/loyalty/settings reachable", s == 200, f"rate=1pt/Rp{body.get('points_per_rupiah') if isinstance(body, dict) else '?'}")

    s, body = await call(tok, "GET", "/loyalty/rewards")
    rwd = len(body) if isinstance(body, list) else 0
    check("/loyalty/rewards", s == 200, f"{rwd} rewards")

    # ----------------------------------------------------------
    # 3. Bill settle (the headline flow)
    # ----------------------------------------------------------
    print("\n[3] Floor Operation — bill settle end-to-end")

    # Find an available table
    avail = next((t for t in (tables_resp or []) if t.get("status") == "available"), None)
    if not avail:
        check("found an available table", False, "no Available tables — skip settle test")
    else:
        tbl_id = avail["id"]
        # Seat
        s, body = await call(tok, "POST", f"/floor/tables/{tbl_id}/seat")
        check(f"seat T{tbl_id}", s == 200, f"status={body.get('status') if isinstance(body, dict) else '?'}")

        # Settle with Anindya's phone (Diamond, 3120pt baseline)
        anindya_before = db.table("customers").select("points, total_visits, total_spent").eq(
            "tenant_id", demo_tid
        ).eq("phone", "6281234500001").execute().data
        before_points = anindya_before[0]["points"] if anindya_before else 0

        s, body = await call(tok, "POST", f"/floor/tables/{tbl_id}/settle", json={
            "amount": 250000,
            "payment_method": "cash",
            "customer_phone": "6281234500001",
        })
        if s == 200 and isinstance(body, dict):
            check("settle bill Rp 250.000", True, f"+{body.get('points_awarded')} pts")
            # Diamond = 2x multiplier; 250000/10000 = 25; *2 = 50
            check("Diamond multiplier applied (2x -> 50pt)", body.get("points_awarded") == 50)
            check("table flipped to cleaning", "cleaning_until" in body)
        else:
            check("settle bill", False, f"HTTP {s}: {body}")

        # Verify ledger row + customer balance via DB
        ledger = db.table("loyalty_ledger").select("delta, reason, balance_after").eq(
            "tenant_id", demo_tid
        ).order("created_at", desc=True).limit(1).execute().data
        if ledger:
            row = ledger[0]
            check("ledger row inserted",
                  row["reason"] == "earn_settle" and row["delta"] > 0,
                  f"+{row['delta']} pts, balance_after={row['balance_after']}")

        anindya_after = db.table("customers").select("points, total_visits, total_spent").eq(
            "tenant_id", demo_tid
        ).eq("phone", "6281234500001").execute().data
        if anindya_after:
            after = anindya_after[0]
            check("customer.points incremented",
                  after["points"] > before_points,
                  f"{before_points} -> {after['points']}")

        # revenue_transactions logged
        rev = db.table("revenue_transactions").select("amount, points_awarded, payment_method").eq(
            "tenant_id", demo_tid
        ).order("settled_at", desc=True).limit(1).execute().data
        if rev:
            r = rev[0]
            check("revenue_transactions row written",
                  r["amount"] == 250000 and r["payment_method"] == "cash",
                  f"Rp {r['amount']}, +{r['points_awarded']}pt")

    # ----------------------------------------------------------
    # 4. Subscription enforcement check
    # ----------------------------------------------------------
    print("\n[4] Subscription gate")
    # Try as a tenant whose sub is not active — we'll use Buranchi briefly
    # (don't actually flip it; just check the gate logic is in current_user)
    # Instead, verify the gate by inspecting the latest period for Kafé Cendana
    sub = db.table("tenant_subscriptions").select("expires_at, status").eq(
        "tenant_id", demo_tid
    ).order("expires_at", desc=True).limit(1).execute().data
    if sub:
        check("Kafé Cendana subscription period present",
              sub[0]["status"] == "active",
              f"expires {sub[0]['expires_at'][:10]}")

    # ----------------------------------------------------------
    # 5. Super admin flows
    # ----------------------------------------------------------
    print("\n[5] Super admin — admin console endpoints")
    admin_email = os.environ.get("SUPERADMIN_EMAIL", "")
    admin_password = os.environ.get("SUPERADMIN_PASSWORD", "")
    if not admin_email or not admin_password:
        check("super_admin creds in env", False,
              "set SUPERADMIN_EMAIL + SUPERADMIN_PASSWORD to test admin endpoints")
    else:
        sa_tok = await sign_in(admin_email, admin_password)
        check("super_admin sign-in", sa_tok is not None)
        if sa_tok:
            s, body = await call(sa_tok, "GET", "/admin/tenants")
            check("/admin/tenants", s == 200,
                  f"{len(body) if isinstance(body, list) else '?'} tenants")

            s, body = await call(sa_tok, "GET", f"/admin/tenants/{demo_tid}")
            check("/admin/tenants/{id} detail", s == 200)

            s, body = await call(sa_tok, "GET", f"/admin/tenants/{demo_tid}/whatsapp")
            check("/admin/tenants/{id}/whatsapp", s == 200,
                  f"{len(body) if isinstance(body, list) else '?'} WABA accounts")

    print("\n" + "=" * 70)
    print("Done. Re-run after any fix to validate.")


if __name__ == "__main__":
    asyncio.run(main())
