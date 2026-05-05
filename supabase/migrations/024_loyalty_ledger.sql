-- ============================================
-- 024: Loyalty ledger + per-tenant settings.
--
-- Replaces the direct `customers.points` mutation pattern with an append-
-- only audit trail. Every point change (earn from settle, redemption,
-- manual adjustment, signup bonus) inserts a `loyalty_ledger` row; a
-- BEFORE INSERT trigger updates `customers.points` and stamps the
-- balance into `balance_after` so the frontend can render history without
-- a running-total query.
--
-- `loyalty_settings` is per-tenant — each tenant configures its own
-- earn rate + redemption value since deals are negotiated, not tiered.
-- ============================================

-- ----------------------------------------------------------
-- loyalty_settings
-- ----------------------------------------------------------
CREATE TABLE IF NOT EXISTS loyalty_settings (
  tenant_id uuid PRIMARY KEY REFERENCES tenants(id) ON DELETE CASCADE,
  points_per_rupiah integer NOT NULL DEFAULT 10000        -- 1 pt per Rp 10K
    CHECK (points_per_rupiah > 0),
  tier_multiplier_enabled boolean NOT NULL DEFAULT true,
  signup_bonus integer NOT NULL DEFAULT 0
    CHECK (signup_bonus >= 0),
  redemption_value_idr integer NOT NULL DEFAULT 1000      -- 1 pt = Rp 1.000
    CHECK (redemption_value_idr >= 0),
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

DROP TRIGGER IF EXISTS trg_touch_loyalty_settings ON loyalty_settings;
CREATE TRIGGER trg_touch_loyalty_settings
  BEFORE UPDATE ON loyalty_settings
  FOR EACH ROW EXECUTE FUNCTION touch_updated_at();

-- Backfill: every existing tenant gets default loyalty settings.
INSERT INTO loyalty_settings (tenant_id)
SELECT id FROM tenants
ON CONFLICT (tenant_id) DO NOTHING;


-- ----------------------------------------------------------
-- loyalty_ledger
-- ----------------------------------------------------------
CREATE TABLE IF NOT EXISTS loyalty_ledger (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  customer_id uuid NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
  delta integer NOT NULL,                                  -- signed: +N earn, -N redeem
  reason text NOT NULL CHECK (reason IN (
    'earn_settle', 'redeem_reward', 'manual_adjust',
    'signup_bonus', 'expire'
  )),
  source_id uuid,                                          -- revenue_transaction_id / redemption_id / etc.
  notes text,
  balance_after integer NOT NULL DEFAULT 0,                -- snapshot for fast UI
  created_by uuid REFERENCES users(id),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_loyalty_ledger_tenant_customer_created
  ON loyalty_ledger(tenant_id, customer_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_loyalty_ledger_source
  ON loyalty_ledger(source_id);


-- ----------------------------------------------------------
-- Sync trigger: ledger insert → customer.points update + balance snapshot
-- ----------------------------------------------------------
CREATE OR REPLACE FUNCTION apply_loyalty_ledger() RETURNS TRIGGER AS $$
DECLARE
  new_balance integer;
BEGIN
  UPDATE customers
  SET points = COALESCE(points, 0) + NEW.delta
  WHERE id = NEW.customer_id
  RETURNING points INTO new_balance;

  IF new_balance IS NULL THEN
    RAISE EXCEPTION 'loyalty_ledger: customer % not found', NEW.customer_id;
  END IF;
  IF new_balance < 0 THEN
    RAISE EXCEPTION 'loyalty_ledger: insufficient points (would become %)', new_balance;
  END IF;

  NEW.balance_after = new_balance;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_apply_loyalty_ledger ON loyalty_ledger;
CREATE TRIGGER trg_apply_loyalty_ledger
  BEFORE INSERT ON loyalty_ledger
  FOR EACH ROW EXECUTE FUNCTION apply_loyalty_ledger();
