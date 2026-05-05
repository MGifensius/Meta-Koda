-- ============================================
-- 017: Tenant display code (e.g. MK-001-Buranchi)
--
-- The existing `slug` column stays as the internal URL-safe identifier
-- (lowercase a-z0-9-) and is also used as the legacy `restaurant_settings.id`
-- text PK. We add `tenant_code` as the human-readable identifier shown in
-- the super-admin console. Format: `MK-{seq:03d}-{business_name}` — preserves
-- the business name's casing and spaces for display.
-- ============================================

ALTER TABLE tenants ADD COLUMN IF NOT EXISTS tenant_code text;

-- Backfill existing tenants by created_at order.
WITH numbered AS (
  SELECT
    id,
    business_name,
    ROW_NUMBER() OVER (ORDER BY created_at, id) AS seq
  FROM tenants
  WHERE tenant_code IS NULL
)
UPDATE tenants t
SET tenant_code = 'MK-' || lpad(numbered.seq::text, 3, '0') || '-' || numbered.business_name
FROM numbered
WHERE t.id = numbered.id;

-- Now enforce.
ALTER TABLE tenants ALTER COLUMN tenant_code SET NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS tenants_tenant_code_idx ON tenants (tenant_code);
