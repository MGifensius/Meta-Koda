-- ============================================
-- 021: Reset the seed Buranchi tenant to a 7-day trial.
--
-- Migration 018 backfilled Buranchi with a 1-year Pro subscription so the
-- demo had something to display. Since the model has since shifted to
-- "7-day trial → super_admin extends manually after payment", Buranchi is
-- now restored to that same starting state — matching what a real new
-- tenant would experience.
-- ============================================

-- Drop any prior subscription periods so the trigger doesn't keep
-- subscription_status='active' from a stale row.
DELETE FROM tenant_subscriptions
WHERE tenant_id = '00000000-0000-0000-0000-000000000001';

UPDATE tenants
SET subscription_status = 'trial',
    trial_ends_at = now() + interval '7 days'
WHERE id = '00000000-0000-0000-0000-000000000001';
