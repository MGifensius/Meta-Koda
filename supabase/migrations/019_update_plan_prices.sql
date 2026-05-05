-- ============================================
-- 019: Update plan pricing.
--
-- Starter is repriced to Rp 3.200.000/mo (Rp 32.000.000/yr) — the original
-- 016 seed values were placeholders. Adjust other tiers here when finalised.
-- ============================================

UPDATE subscription_plans
SET price_monthly_idr = 3200000,
    price_yearly_idr  = 32000000
WHERE slug = 'starter';
