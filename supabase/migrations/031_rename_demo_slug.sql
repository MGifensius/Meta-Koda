-- ============================================
-- 031: Rename Kafé Cendana's slug from `mk-002-meta-koda-demo` to
--      `kafe-cendana` so the public chat URL matches its display name
--      and tenant_code (MK-001-Kafé Cendana).
--
-- The slug doubles as `restaurant_settings.id` (legacy text PK), so we
-- update both rows in lockstep. There are no FK references to
-- `restaurant_settings.id` from any other table — verified via grep.
--
-- New chat URL: https://meta-koda.vercel.app/chat/kafe-cendana
-- Old URL `/chat/mk-002-meta-koda-demo` will return 404 after this runs.
--
-- Idempotent — only renames if the old slug is still in place.
-- ============================================

DO $$
DECLARE
  demo_id uuid;
  old_slug text := 'mk-002-meta-koda-demo';
  new_slug text := 'kafe-cendana';
BEGIN
  SELECT id, slug INTO demo_id, old_slug
  FROM tenants
  WHERE business_name = 'Kafé Cendana'
  LIMIT 1;

  IF demo_id IS NULL THEN
    RAISE NOTICE 'Kafé Cendana tenant not found — skipping';
    RETURN;
  END IF;

  -- Already renamed? bail out.
  IF old_slug = new_slug THEN
    RAISE NOTICE 'Slug already %; skipping', new_slug;
    RETURN;
  END IF;

  -- 1. restaurant_settings.id rename (text PK, no FK refs to it)
  UPDATE restaurant_settings
  SET id = new_slug
  WHERE id = old_slug AND tenant_id = demo_id;

  -- 2. tenants.slug rename
  UPDATE tenants
  SET slug = new_slug
  WHERE id = demo_id;

  RAISE NOTICE 'Renamed Kafé Cendana slug: % → %', old_slug, new_slug;
END $$;
