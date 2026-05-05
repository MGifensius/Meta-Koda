-- ============================================
-- 028: Meta Koda Demo lifetime subscription.
--
-- The showcase tenant should never expire — it's used for live demos and
-- internal testing. Insert a single open-ended subscription period with
-- expires_at = 2099-12-31 so the auth gate (which checks the latest
-- period's expiration) always lets it through.
--
-- Idempotent: only inserts if Meta Koda Demo has no existing subscription
-- row.
-- ============================================

INSERT INTO tenant_subscriptions
  (tenant_id, plan_id, status, billing_cycle, started_at, expires_at,
   trial_ends_at, notes)
SELECT
  t.id,
  NULL,
  'active',
  'manual',
  now(),
  '2099-12-31T23:59:59Z'::timestamptz,
  NULL,
  'Lifetime — Meta Koda showcase tenant'
FROM tenants t
WHERE t.tenant_code = 'MK-002-Meta Koda Demo'
  AND NOT EXISTS (
    SELECT 1 FROM tenant_subscriptions ts WHERE ts.tenant_id = t.id
  );

-- Also explicitly clear trial state on the tenant row (sync trigger above
-- would do it on INSERT but be defensive in case of replays).
UPDATE tenants
SET trial_ends_at = NULL,
    subscription_status = 'active'
WHERE tenant_code = 'MK-002-Meta Koda Demo';
