-- ============================================
-- 020: Drop plan-tier model. Switch to per-tenant feature toggles + simple
-- paid-period subscriptions.
--
-- Each tenant negotiates a custom deal with Meta-Koda staff. Plans
-- (Starter/Growth/Pro) are no longer surfaced — subscriptions become just
-- "is this tenant paid up, until when, and which features are enabled?"
--
-- The `subscription_plans` table is kept for historical FK integrity but
-- new subscription rows can have `plan_id = NULL`.
-- ============================================

-- 1. plan_id is now optional on tenant_subscriptions.
ALTER TABLE tenant_subscriptions ALTER COLUMN plan_id DROP NOT NULL;

-- 2. Per-tenant feature toggles. Defaults: all four customer-facing modules
--    enabled. Inbox + floor operation are always-on core, not gated.
ALTER TABLE tenants
  ADD COLUMN IF NOT EXISTS features jsonb
  NOT NULL DEFAULT '["bookings","loyalty","marketing","ai_bot"]'::jsonb;

-- Backfill existing rows (the DEFAULT only fires for new INSERTs).
UPDATE tenants
SET features = '["bookings","loyalty","marketing","ai_bot"]'::jsonb
WHERE features IS NULL OR features = '[]'::jsonb;
