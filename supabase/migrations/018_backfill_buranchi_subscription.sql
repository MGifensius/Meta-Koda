-- ============================================
-- 018: Backfill subscription for the seed Buranchi tenant.
--
-- Migration 014 created Buranchi with `subscription_status='active'` as a
-- default so existing dev code kept working, but no row was ever inserted
-- into `tenant_subscriptions` — so the super-admin console correctly says
-- "No plan". This migration assigns Buranchi to the Pro plan for 1 year so
-- the demo is consistent. The sync trigger from 016 will keep
-- `tenants.subscription_status` aligned automatically.
--
-- Idempotent: only inserts if Buranchi has no existing subscription row.
-- ============================================

INSERT INTO tenant_subscriptions
  (tenant_id, plan_id, status, billing_cycle, started_at, expires_at, notes)
SELECT
  t.id,
  p.id,
  'active',
  'yearly',
  now(),
  now() + interval '1 year',
  'Backfilled by migration 018 — initial seed period'
FROM tenants t
CROSS JOIN subscription_plans p
WHERE t.id = '00000000-0000-0000-0000-000000000001'
  AND p.slug = 'pro'
  AND NOT EXISTS (
    SELECT 1 FROM tenant_subscriptions ts WHERE ts.tenant_id = t.id
  );
