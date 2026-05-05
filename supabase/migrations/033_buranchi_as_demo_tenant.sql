-- ============================================
-- 033: Switch the demo tenant from Kafé Cendana to Buranchi.
--
-- The client wants Buranchi as the showcase tenant. We:
--   1. Migrate Kafé Cendana's seed customers + marketing campaigns over
--      to Buranchi so the demo loyalty examples + draft messages survive.
--   2. Delete Kafé Cendana entirely (cascade removes its tables, menu,
--      rewards, restaurant_settings, whatsapp_accounts, etc.).
--   3. Promote Buranchi to MK-001 with a lifetime subscription so it
--      never expires for demos.
--   4. Replace Buranchi's 8 placeholder tables with the real floor plan:
--        - Teras Otella: 6 × 4-pax
--        - Poolside: 8 × 2-pax around the pool + 3 × 6-pax segitiga
--        - Indoor Otella: 7 × 10-pax long + 5 × 8-pax round
--      → 29 tables total
-- ============================================

DO $$
DECLARE
  buranchi_tid uuid := '00000000-0000-0000-0000-000000000001';
  cendana_tid uuid;
BEGIN
  SELECT id INTO cendana_tid
  FROM tenants WHERE business_name = 'Kafé Cendana' LIMIT 1;

  -- ----------------------------------------------------------
  -- 1. Migrate seed customers + campaigns from Cendana → Buranchi
  -- ----------------------------------------------------------
  IF cendana_tid IS NOT NULL THEN
    -- Customers: only migrate ones whose phone isn't already taken on
    -- Buranchi (per-tenant unique constraint from migration 027).
    UPDATE customers
    SET tenant_id = buranchi_tid
    WHERE tenant_id = cendana_tid
      AND phone NOT IN (
        SELECT phone FROM customers WHERE tenant_id = buranchi_tid
      );

    -- Campaigns — Buranchi has 0, just move them.
    UPDATE campaigns
    SET tenant_id = buranchi_tid
    WHERE tenant_id = cendana_tid;

    -- Anything still referencing cendana (a leftover dup customer, etc.)
    -- gets cleaned up by the tenant DELETE cascade below.
    DELETE FROM tenants WHERE id = cendana_tid;
  END IF;

  -- ----------------------------------------------------------
  -- 2. Promote Buranchi to MK-001 + lifetime
  -- ----------------------------------------------------------
  UPDATE tenants
  SET tenant_code = 'MK-001-Buranchi',
      subscription_status = 'active',
      trial_ends_at = NULL
  WHERE id = buranchi_tid;

  -- Wipe existing subscription periods + insert one lifetime row.
  DELETE FROM tenant_subscriptions WHERE tenant_id = buranchi_tid;
  INSERT INTO tenant_subscriptions
    (tenant_id, plan_id, status, billing_cycle, started_at, expires_at,
     trial_ends_at, notes)
  VALUES
    (buranchi_tid, NULL, 'active', 'manual', now(),
     '2099-12-31T23:59:59Z'::timestamptz, NULL,
     'Lifetime — Buranchi as showcase demo tenant');

  -- ----------------------------------------------------------
  -- 3. Replace Buranchi tables with the real floor plan
  --    Bookings have FK to tables (no CASCADE) so wipe them first.
  --    revenue_transactions.table_id is ON DELETE SET NULL — safe.
  -- ----------------------------------------------------------
  DELETE FROM booking_events WHERE tenant_id = buranchi_tid;
  DELETE FROM bookings WHERE tenant_id = buranchi_tid;
  DELETE FROM tables WHERE tenant_id = buranchi_tid;

  INSERT INTO tables (id, capacity, zone, status, tenant_id) VALUES
    -- Teras Otella — 6 tables × 4 pax
    ('TO-1',  4, 'Teras Otella',  'available', buranchi_tid),
    ('TO-2',  4, 'Teras Otella',  'available', buranchi_tid),
    ('TO-3',  4, 'Teras Otella',  'available', buranchi_tid),
    ('TO-4',  4, 'Teras Otella',  'available', buranchi_tid),
    ('TO-5',  4, 'Teras Otella',  'available', buranchi_tid),
    ('TO-6',  4, 'Teras Otella',  'available', buranchi_tid),

    -- Poolside — 8 small (2 pax) around the pool perimeter
    ('PS-1',  2, 'Poolside',      'available', buranchi_tid),
    ('PS-2',  2, 'Poolside',      'available', buranchi_tid),
    ('PS-3',  2, 'Poolside',      'available', buranchi_tid),
    ('PS-4',  2, 'Poolside',      'available', buranchi_tid),
    ('PS-5',  2, 'Poolside',      'available', buranchi_tid),
    ('PS-6',  2, 'Poolside',      'available', buranchi_tid),
    ('PS-7',  2, 'Poolside',      'available', buranchi_tid),
    ('PS-8',  2, 'Poolside',      'available', buranchi_tid),
    -- Poolside — 3 large (6 pax) "Meja Segitiga"
    ('PL-1',  6, 'Poolside',      'available', buranchi_tid),
    ('PL-2',  6, 'Poolside',      'available', buranchi_tid),
    ('PL-3',  6, 'Poolside',      'available', buranchi_tid),

    -- Indoor Otella — 7 long tables × 10 pax
    ('IL-1', 10, 'Indoor Otella', 'available', buranchi_tid),
    ('IL-2', 10, 'Indoor Otella', 'available', buranchi_tid),
    ('IL-3', 10, 'Indoor Otella', 'available', buranchi_tid),
    ('IL-4', 10, 'Indoor Otella', 'available', buranchi_tid),
    ('IL-5', 10, 'Indoor Otella', 'available', buranchi_tid),
    ('IL-6', 10, 'Indoor Otella', 'available', buranchi_tid),
    ('IL-7', 10, 'Indoor Otella', 'available', buranchi_tid),
    -- Indoor Otella — 5 round tables × 8 pax
    ('IR-1',  8, 'Indoor Otella', 'available', buranchi_tid),
    ('IR-2',  8, 'Indoor Otella', 'available', buranchi_tid),
    ('IR-3',  8, 'Indoor Otella', 'available', buranchi_tid),
    ('IR-4',  8, 'Indoor Otella', 'available', buranchi_tid),
    ('IR-5',  8, 'Indoor Otella', 'available', buranchi_tid);

  RAISE NOTICE 'Buranchi promoted to MK-001 demo tenant with 29-table real floor plan';
END $$;
