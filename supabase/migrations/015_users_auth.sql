-- ============================================
-- 015: Users table linked to Supabase Auth
-- One row per real human (or service principal). The `id` matches the
-- `auth.users.id` 1:1 — Supabase manages credentials, this table holds
-- the tenant + role mapping our app cares about.
-- ============================================

-- The legacy users table from migration 002 was never populated. Drop it
-- before we redefine the schema.
DROP TABLE IF EXISTS users CASCADE;

CREATE TABLE users (
  id uuid PRIMARY KEY,                     -- = auth.users.id
  tenant_id uuid REFERENCES tenants(id) ON DELETE CASCADE,
  role text NOT NULL
    CHECK (role IN (
      'super_admin',     -- Meta-Koda staff (cross-tenant access)
      'tenant_owner',    -- Owns one tenant, full access inside it
      'admin',           -- Admin (Inbox, Booking, Marketing, Loyalty, etc.)
      'cashier',         -- Floor Operation only
      'marketing',       -- Inbox, Customers, Marketing, Loyalty
      'staff'            -- Limited daily ops
    )),
  email text NOT NULL,
  name text,
  phone text,
  status text NOT NULL DEFAULT 'active'
    CHECK (status IN ('active', 'inactive')),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  -- super_admin is cross-tenant: tenant_id MUST be NULL.
  -- everyone else MUST belong to a tenant.
  CONSTRAINT users_tenant_role_consistency CHECK (
    (role = 'super_admin' AND tenant_id IS NULL) OR
    (role <> 'super_admin' AND tenant_id IS NOT NULL)
  )
);

CREATE INDEX idx_users_tenant ON users(tenant_id);
CREATE INDEX idx_users_email  ON users(email);

-- Generic touch_updated_at — reusable across any table that has updated_at.
-- Replaces the table-specific touch_tenants_updated_at from migration 014.
CREATE OR REPLACE FUNCTION touch_updated_at()
RETURNS trigger AS $$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_touch_users ON users;
CREATE TRIGGER trg_touch_users
  BEFORE UPDATE ON users
  FOR EACH ROW EXECUTE FUNCTION touch_updated_at();

-- Re-point the existing tenants trigger at the generic function.
DROP TRIGGER IF EXISTS trg_touch_tenants ON tenants;
CREATE TRIGGER trg_touch_tenants
  BEFORE UPDATE ON tenants
  FOR EACH ROW EXECUTE FUNCTION touch_updated_at();

-- ----------------------------------------------------------
-- RLS: each authenticated user can read their own profile row.
-- The browser AuthProvider hits this query right after sign-in to learn
-- its tenant_id and role; without this policy it gets back an empty
-- result and we sign the user out as "not provisioned."
-- The service_role bypasses RLS automatically, so the backend is unaffected.
-- ----------------------------------------------------------
ALTER TABLE users ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS users_self_read ON users;
CREATE POLICY users_self_read
  ON users FOR SELECT
  TO authenticated
  USING (auth.uid() = id);
