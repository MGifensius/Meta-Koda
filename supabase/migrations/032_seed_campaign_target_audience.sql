-- ============================================
-- 032: Set `target_audience` on Kafé Cendana's seed campaigns.
--
-- Migration 030 inserted campaigns with descriptive `audience` labels
-- ("new_members", "birthday_month", etc.) but didn't set the structured
-- `target_audience` field (constrained to 'all' | 'member' | 'non-member').
-- That meant every seed campaign defaulted to 'all' and the marketing
-- send wouldn't actually filter members vs non-members.
--
-- Map each seed campaign to the correct target_audience so the user can
-- test member vs non-member targeting end-to-end.
-- ============================================

DO $$
DECLARE
  demo_id uuid;
BEGIN
  SELECT id INTO demo_id FROM tenants WHERE business_name = 'Kafé Cendana' LIMIT 1;
  IF demo_id IS NULL THEN
    RAISE NOTICE 'Kafé Cendana not found — skipping';
    RETURN;
  END IF;

  -- Welcome New Member -> non-member (push toward signup)
  UPDATE campaigns
  SET target_audience = 'non-member'
  WHERE tenant_id = demo_id AND name = 'Welcome New Member';

  -- Birthday Treat, Re-engagement, Weekend Brunch -> member only
  UPDATE campaigns
  SET target_audience = 'member'
  WHERE tenant_id = demo_id AND name IN (
    'Birthday Treat', 'Re-engagement · 30 hari', 'Weekend Brunch Special'
  );

  -- Menu Baru — broad announcement to everyone
  UPDATE campaigns
  SET target_audience = 'all'
  WHERE tenant_id = demo_id AND name = 'Menu Baru — Mie Aceh';

  RAISE NOTICE 'Seed campaign target_audience updated for Kafé Cendana';
END $$;
