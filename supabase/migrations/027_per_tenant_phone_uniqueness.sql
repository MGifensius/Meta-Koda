-- ============================================
-- 027: Phone is the customer's unique ID — but only within a tenant.
--
-- Migration 001 made `customers.phone` globally unique. With multi-tenant
-- now real, that's wrong: a single phone may legitimately exist across
-- many tenants (the same customer eats at multiple restaurants on the
-- platform, each maintaining its own loyalty profile).
--
-- Drop the global constraint and replace it with `(tenant_id, phone)`
-- uniqueness, which matches the lookup pattern every router already uses
-- (`.eq("tenant_id", X).eq("phone", Y)`).
-- ============================================

-- Drop the auto-generated global unique constraint from migration 001.
ALTER TABLE customers DROP CONSTRAINT IF EXISTS customers_phone_key;

-- Per-tenant uniqueness.
CREATE UNIQUE INDEX IF NOT EXISTS customers_tenant_phone_unique_idx
  ON customers (tenant_id, phone);
