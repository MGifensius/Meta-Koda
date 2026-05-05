-- ============================================
-- 029: Renumber tenants so Meta Koda Demo is MK-001, Buranchi is MK-002.
--
-- The demo tenant is the public showcase and should hold the canonical
-- "MK-001" code. Real paying tenants start from MK-002 onwards. This
-- migration only touches the human-readable `tenant_code` — every other
-- identifier (UUID id, slug, restaurant_settings.id) is unchanged, so
-- existing FKs and URLs keep working.
--
-- The unique index on tenant_code forces a 3-step swap via a temp value
-- so we never have two rows colliding on MK-001 mid-migration.
-- ============================================

-- 1. Park Buranchi at a temporary code.
UPDATE tenants
SET tenant_code = 'MK-TMP-Buranchi'
WHERE business_name = 'Buranchi';

-- 2. Promote Meta Koda Demo to MK-001.
UPDATE tenants
SET tenant_code = 'MK-001-Meta Koda Demo'
WHERE business_name = 'Meta Koda Demo';

-- 3. Move Buranchi into MK-002.
UPDATE tenants
SET tenant_code = 'MK-002-Buranchi'
WHERE business_name = 'Buranchi';
