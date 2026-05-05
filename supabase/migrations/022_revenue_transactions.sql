-- ============================================
-- 022: Revenue transactions — bill-input flow.
--
-- Replaces the order/menu-based revenue path of the old POS. Each row is
-- a single bill: super-admin or tenant staff types the total when the
-- customer finishes, picks a payment method, the table goes to `cleaning`,
-- and revenue is logged here for daily/weekly/monthly reports.
-- ============================================

CREATE TABLE IF NOT EXISTS revenue_transactions (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  table_id text REFERENCES tables(id) ON DELETE SET NULL,
  amount integer NOT NULL CHECK (amount >= 0),     -- IDR rupiah, no decimals
  payment_method text NOT NULL DEFAULT 'cash'
    CHECK (payment_method IN ('cash', 'qris', 'card', 'transfer', 'other')),
  cover_count integer,                              -- # diners (nullable; for AOV)
  notes text,
  settled_by uuid REFERENCES users(id),             -- whoever clicked Settle
  settled_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_revenue_transactions_tenant_settled
  ON revenue_transactions(tenant_id, settled_at DESC);
CREATE INDEX IF NOT EXISTS idx_revenue_transactions_tenant_table
  ON revenue_transactions(tenant_id, table_id);
