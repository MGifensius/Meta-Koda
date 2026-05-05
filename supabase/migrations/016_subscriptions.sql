-- ============================================
-- 016: Subscription plans + tenant subscriptions (manual billing)
-- Plans are static rows seeded here. Each tenant gets a row in
-- `tenant_subscriptions` every time their access is extended (super-admin
-- approves a bank transfer → insert a new period). The currently active
-- period is the one with the latest `expires_at`.
--
-- `tenants.subscription_status` is kept in sync via trigger so the rest of
-- the app can read it directly without joining for every check.
-- ============================================

-- ----------------------------------------------------------
-- subscription_plans
-- ----------------------------------------------------------
CREATE TABLE IF NOT EXISTS subscription_plans (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  slug text NOT NULL UNIQUE,
  name text NOT NULL,
  description text,
  price_monthly_idr integer NOT NULL DEFAULT 0,   -- rupiah
  price_yearly_idr integer NOT NULL DEFAULT 0,
  max_users integer,                              -- null = unlimited
  max_customers integer,                          -- null = unlimited
  max_whatsapp_numbers integer NOT NULL DEFAULT 1,
  features jsonb NOT NULL DEFAULT '[]'::jsonb,
  is_active boolean NOT NULL DEFAULT true,
  sort_order integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_subscription_plans_slug ON subscription_plans(slug);

DROP TRIGGER IF EXISTS trg_touch_subscription_plans ON subscription_plans;
CREATE TRIGGER trg_touch_subscription_plans
  BEFORE UPDATE ON subscription_plans
  FOR EACH ROW EXECUTE FUNCTION touch_updated_at();

-- Seed: three tiers. Adjust prices as you finalize pricing.
INSERT INTO subscription_plans
  (slug, name, description, price_monthly_idr, price_yearly_idr,
   max_users, max_customers, max_whatsapp_numbers, features, sort_order)
VALUES
  (
    'starter',
    'Starter',
    'Untuk restoran kecil yang baru mulai digitalisasi',
    500000,
    5000000,
    5, 1000, 1,
    '["inbox","bookings","floor_operation","customers","loyalty","marketing","reports"]'::jsonb,
    1
  ),
  (
    'growth',
    'Growth',
    'Untuk bisnis yang sedang berkembang dengan multi-staf',
    1500000,
    15000000,
    20, 10000, 2,
    '["inbox","bookings","floor_operation","customers","loyalty","marketing","reports","ai_concierge","template_management"]'::jsonb,
    2
  ),
  (
    'pro',
    'Pro',
    'Untuk multi-outlet / brand dengan kebutuhan lengkap',
    3000000,
    30000000,
    NULL, NULL, 5,
    '["inbox","bookings","floor_operation","customers","loyalty","marketing","reports","ai_concierge","template_management","waitlist","performance_analytics","priority_support"]'::jsonb,
    3
  )
ON CONFLICT (slug) DO NOTHING;

-- ----------------------------------------------------------
-- tenant_subscriptions  (history + active period)
-- ----------------------------------------------------------
CREATE TABLE IF NOT EXISTS tenant_subscriptions (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  plan_id uuid NOT NULL REFERENCES subscription_plans(id),
  status text NOT NULL DEFAULT 'active'
    CHECK (status IN ('trial', 'active', 'past_due', 'expired', 'cancelled')),
  billing_cycle text NOT NULL DEFAULT 'monthly'
    CHECK (billing_cycle IN ('monthly', 'yearly', 'manual')),
  started_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL,
  trial_ends_at timestamptz,
  cancelled_at timestamptz,
  notes text,
  created_by uuid REFERENCES users(id),  -- super_admin who approved
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_tenant_subscriptions_tenant   ON tenant_subscriptions(tenant_id);
CREATE INDEX IF NOT EXISTS idx_tenant_subscriptions_status   ON tenant_subscriptions(status);
CREATE INDEX IF NOT EXISTS idx_tenant_subscriptions_expires  ON tenant_subscriptions(expires_at);

DROP TRIGGER IF EXISTS trg_touch_tenant_subscriptions ON tenant_subscriptions;
CREATE TRIGGER trg_touch_tenant_subscriptions
  BEFORE UPDATE ON tenant_subscriptions
  FOR EACH ROW EXECUTE FUNCTION touch_updated_at();

-- ----------------------------------------------------------
-- Sync trigger: keep tenants.subscription_status in lock-step with the
-- newest subscription row. Status flips fire on INSERT (new period),
-- UPDATE (cancellation, manual edit), and DELETE (admin cleanup).
-- ----------------------------------------------------------
CREATE OR REPLACE FUNCTION sync_tenant_subscription_status()
RETURNS trigger AS $$
DECLARE
  target_tenant uuid;
  latest record;
BEGIN
  target_tenant := COALESCE(NEW.tenant_id, OLD.tenant_id);

  SELECT status, trial_ends_at, expires_at
  INTO latest
  FROM tenant_subscriptions
  WHERE tenant_id = target_tenant
  ORDER BY expires_at DESC
  LIMIT 1;

  IF latest IS NULL THEN
    UPDATE tenants
       SET subscription_status = 'expired',
           trial_ends_at = NULL
     WHERE id = target_tenant;
  ELSE
    UPDATE tenants
       SET subscription_status = latest.status,
           trial_ends_at = latest.trial_ends_at
     WHERE id = target_tenant;
  END IF;

  RETURN COALESCE(NEW, OLD);
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_sync_tenant_subscription ON tenant_subscriptions;
CREATE TRIGGER trg_sync_tenant_subscription
  AFTER INSERT OR UPDATE OR DELETE ON tenant_subscriptions
  FOR EACH ROW EXECUTE FUNCTION sync_tenant_subscription_status();

-- ----------------------------------------------------------
-- Helper: a SQL function the backend can call to find the active period.
-- Returns the row with the latest expires_at for a given tenant.
-- ----------------------------------------------------------
CREATE OR REPLACE FUNCTION get_active_subscription(t uuid)
RETURNS tenant_subscriptions
LANGUAGE sql STABLE AS $$
  SELECT * FROM tenant_subscriptions
   WHERE tenant_id = t
   ORDER BY expires_at DESC
   LIMIT 1;
$$;
