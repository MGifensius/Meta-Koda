-- ============================================
-- 014: Multi-tenant foundation
-- Adds the `tenants` table and a `tenant_id` column on every tenant-owned
-- table, then backfills existing rows (which all currently belong to
-- "Buranchi" via the legacy `restaurant_id = 'default'` marker) to a single
-- newly-created tenant row. The legacy `restaurant_id` columns stay in
-- place during the strangler-fig refactor and will be dropped later
-- (PR 12) once every code path reads from `tenant_id`.
-- ============================================

-- ----------------------------------------------------------
-- 1. Tenants table
-- ----------------------------------------------------------
CREATE TABLE IF NOT EXISTS tenants (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  business_name text NOT NULL,
  business_type text NOT NULL DEFAULT 'restaurant',
  slug text NOT NULL UNIQUE,
  email text,
  phone text,
  address text,
  logo_url text,
  status text NOT NULL DEFAULT 'active'
    CHECK (status IN ('active', 'inactive', 'suspended')),
  -- subscription_status mirrors the live subscription state. PR 4 will
  -- introduce a richer `tenant_subscriptions` table and keep this column
  -- in sync via trigger; for now it's the source of truth.
  subscription_status text NOT NULL DEFAULT 'trial'
    CHECK (subscription_status IN ('trial', 'active', 'past_due', 'expired', 'cancelled')),
  trial_ends_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_tenants_slug ON tenants(slug);
CREATE INDEX IF NOT EXISTS idx_tenants_status ON tenants(subscription_status);

-- ----------------------------------------------------------
-- 2. Seed Buranchi as the first tenant.
-- A deterministic UUID lets backend code reference it without a lookup
-- during the rest of the strangler refactor.
-- ----------------------------------------------------------
INSERT INTO tenants (
  id, business_name, business_type, slug,
  status, subscription_status, trial_ends_at
) VALUES (
  '00000000-0000-0000-0000-000000000001',
  'Buranchi',
  'restaurant',
  'buranchi',
  'active',
  'active',                            -- existing customer, skip trial
  now() + interval '365 days'           -- effectively always-on for now
) ON CONFLICT (slug) DO NOTHING;

-- ----------------------------------------------------------
-- 3. Add nullable tenant_id to every tenant-owned table.
-- Nullable for now so the backfill below can populate it cleanly.
-- ----------------------------------------------------------
ALTER TABLE customers           ADD COLUMN IF NOT EXISTS tenant_id uuid REFERENCES tenants(id) ON DELETE CASCADE;
ALTER TABLE tables              ADD COLUMN IF NOT EXISTS tenant_id uuid REFERENCES tenants(id) ON DELETE CASCADE;
ALTER TABLE bookings            ADD COLUMN IF NOT EXISTS tenant_id uuid REFERENCES tenants(id) ON DELETE CASCADE;
ALTER TABLE orders              ADD COLUMN IF NOT EXISTS tenant_id uuid REFERENCES tenants(id) ON DELETE CASCADE;
ALTER TABLE menu_items          ADD COLUMN IF NOT EXISTS tenant_id uuid REFERENCES tenants(id) ON DELETE CASCADE;
ALTER TABLE rewards             ADD COLUMN IF NOT EXISTS tenant_id uuid REFERENCES tenants(id) ON DELETE CASCADE;
ALTER TABLE redemptions         ADD COLUMN IF NOT EXISTS tenant_id uuid REFERENCES tenants(id) ON DELETE CASCADE;
ALTER TABLE campaigns           ADD COLUMN IF NOT EXISTS tenant_id uuid REFERENCES tenants(id) ON DELETE CASCADE;
ALTER TABLE conversations       ADD COLUMN IF NOT EXISTS tenant_id uuid REFERENCES tenants(id) ON DELETE CASCADE;
ALTER TABLE messages            ADD COLUMN IF NOT EXISTS tenant_id uuid REFERENCES tenants(id) ON DELETE CASCADE;
ALTER TABLE feedback_requests   ADD COLUMN IF NOT EXISTS tenant_id uuid REFERENCES tenants(id) ON DELETE CASCADE;
ALTER TABLE restaurant_settings ADD COLUMN IF NOT EXISTS tenant_id uuid REFERENCES tenants(id) ON DELETE CASCADE;
ALTER TABLE payment_requests    ADD COLUMN IF NOT EXISTS tenant_id uuid REFERENCES tenants(id) ON DELETE CASCADE;

-- ----------------------------------------------------------
-- 4. Backfill: every existing row belongs to Buranchi.
-- Using "tenant_id IS NULL" instead of "restaurant_id = 'default'" so this
-- migration is idempotent — re-running it is safe.
-- ----------------------------------------------------------
DO $$
DECLARE
  buranchi_id constant uuid := '00000000-0000-0000-0000-000000000001';
BEGIN
  UPDATE customers           SET tenant_id = buranchi_id WHERE tenant_id IS NULL;
  UPDATE tables              SET tenant_id = buranchi_id WHERE tenant_id IS NULL;
  UPDATE bookings            SET tenant_id = buranchi_id WHERE tenant_id IS NULL;
  UPDATE orders              SET tenant_id = buranchi_id WHERE tenant_id IS NULL;
  UPDATE menu_items          SET tenant_id = buranchi_id WHERE tenant_id IS NULL;
  UPDATE rewards             SET tenant_id = buranchi_id WHERE tenant_id IS NULL;
  UPDATE redemptions         SET tenant_id = buranchi_id WHERE tenant_id IS NULL;
  UPDATE campaigns           SET tenant_id = buranchi_id WHERE tenant_id IS NULL;
  UPDATE conversations       SET tenant_id = buranchi_id WHERE tenant_id IS NULL;
  UPDATE messages            SET tenant_id = buranchi_id WHERE tenant_id IS NULL;
  UPDATE feedback_requests   SET tenant_id = buranchi_id WHERE tenant_id IS NULL;
  UPDATE restaurant_settings SET tenant_id = buranchi_id WHERE tenant_id IS NULL;
  UPDATE payment_requests    SET tenant_id = buranchi_id WHERE tenant_id IS NULL;
END $$;

-- ----------------------------------------------------------
-- 5. Default tenant_id to Buranchi.
-- Until PR 3 teaches the backend to pass tenant_id explicitly, INSERTs
-- coming from the legacy code path will land on Buranchi via this default.
-- The default will be removed in PR 12 when the strangler refactor finishes.
-- ----------------------------------------------------------
ALTER TABLE customers           ALTER COLUMN tenant_id SET DEFAULT '00000000-0000-0000-0000-000000000001';
ALTER TABLE tables              ALTER COLUMN tenant_id SET DEFAULT '00000000-0000-0000-0000-000000000001';
ALTER TABLE bookings            ALTER COLUMN tenant_id SET DEFAULT '00000000-0000-0000-0000-000000000001';
ALTER TABLE orders              ALTER COLUMN tenant_id SET DEFAULT '00000000-0000-0000-0000-000000000001';
ALTER TABLE menu_items          ALTER COLUMN tenant_id SET DEFAULT '00000000-0000-0000-0000-000000000001';
ALTER TABLE rewards             ALTER COLUMN tenant_id SET DEFAULT '00000000-0000-0000-0000-000000000001';
ALTER TABLE redemptions         ALTER COLUMN tenant_id SET DEFAULT '00000000-0000-0000-0000-000000000001';
ALTER TABLE campaigns           ALTER COLUMN tenant_id SET DEFAULT '00000000-0000-0000-0000-000000000001';
ALTER TABLE conversations       ALTER COLUMN tenant_id SET DEFAULT '00000000-0000-0000-0000-000000000001';
ALTER TABLE messages            ALTER COLUMN tenant_id SET DEFAULT '00000000-0000-0000-0000-000000000001';
ALTER TABLE feedback_requests   ALTER COLUMN tenant_id SET DEFAULT '00000000-0000-0000-0000-000000000001';
ALTER TABLE restaurant_settings ALTER COLUMN tenant_id SET DEFAULT '00000000-0000-0000-0000-000000000001';
ALTER TABLE payment_requests    ALTER COLUMN tenant_id SET DEFAULT '00000000-0000-0000-0000-000000000001';

-- Lock tenant_id to NOT NULL now that backfill + default are in place.
ALTER TABLE customers           ALTER COLUMN tenant_id SET NOT NULL;
ALTER TABLE tables              ALTER COLUMN tenant_id SET NOT NULL;
ALTER TABLE bookings            ALTER COLUMN tenant_id SET NOT NULL;
ALTER TABLE orders              ALTER COLUMN tenant_id SET NOT NULL;
ALTER TABLE menu_items          ALTER COLUMN tenant_id SET NOT NULL;
ALTER TABLE rewards             ALTER COLUMN tenant_id SET NOT NULL;
ALTER TABLE redemptions         ALTER COLUMN tenant_id SET NOT NULL;
ALTER TABLE campaigns           ALTER COLUMN tenant_id SET NOT NULL;
ALTER TABLE conversations       ALTER COLUMN tenant_id SET NOT NULL;
ALTER TABLE messages            ALTER COLUMN tenant_id SET NOT NULL;
ALTER TABLE feedback_requests   ALTER COLUMN tenant_id SET NOT NULL;
ALTER TABLE restaurant_settings ALTER COLUMN tenant_id SET NOT NULL;
ALTER TABLE payment_requests    ALTER COLUMN tenant_id SET NOT NULL;

-- ----------------------------------------------------------
-- 6. Indexes — every tenant-scoped query starts with a tenant_id filter,
-- so every tenant-owned table benefits from a btree on tenant_id.
-- ----------------------------------------------------------
CREATE INDEX IF NOT EXISTS idx_customers_tenant           ON customers(tenant_id);
CREATE INDEX IF NOT EXISTS idx_tables_tenant              ON tables(tenant_id);
CREATE INDEX IF NOT EXISTS idx_bookings_tenant            ON bookings(tenant_id);
CREATE INDEX IF NOT EXISTS idx_orders_tenant              ON orders(tenant_id);
CREATE INDEX IF NOT EXISTS idx_menu_items_tenant          ON menu_items(tenant_id);
CREATE INDEX IF NOT EXISTS idx_rewards_tenant             ON rewards(tenant_id);
CREATE INDEX IF NOT EXISTS idx_redemptions_tenant         ON redemptions(tenant_id);
CREATE INDEX IF NOT EXISTS idx_campaigns_tenant           ON campaigns(tenant_id);
CREATE INDEX IF NOT EXISTS idx_conversations_tenant       ON conversations(tenant_id);
CREATE INDEX IF NOT EXISTS idx_messages_tenant            ON messages(tenant_id);
CREATE INDEX IF NOT EXISTS idx_feedback_requests_tenant   ON feedback_requests(tenant_id);
CREATE INDEX IF NOT EXISTS idx_payment_requests_tenant    ON payment_requests(tenant_id);

-- ----------------------------------------------------------
-- 7. updated_at autotouch on tenants — useful once super-admin starts
-- editing them.
-- ----------------------------------------------------------
CREATE OR REPLACE FUNCTION touch_tenants_updated_at()
RETURNS trigger AS $$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_touch_tenants ON tenants;
CREATE TRIGGER trg_touch_tenants
  BEFORE UPDATE ON tenants
  FOR EACH ROW EXECUTE FUNCTION touch_tenants_updated_at();
