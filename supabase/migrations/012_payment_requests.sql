-- ============================================
-- 012: Xendit QRIS payment requests
-- A payment request represents one "pay this table" attempt — it covers
-- every open order on that table at the moment the cashier hits Pay.
-- We keep it separate from the orders table so we can retry (new QR) or
-- fall back to cash without polluting the order history.
-- ============================================

CREATE TABLE IF NOT EXISTS payment_requests (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  table_id text REFERENCES tables(id),
  external_id text NOT NULL UNIQUE,       -- the id we give Xendit
  xendit_qr_id text,                      -- Xendit's QR resource id
  qr_string text,                         -- qr string to render as a QR code
  amount integer NOT NULL,                -- rupiah total at request time
  method text NOT NULL DEFAULT 'qris'
    CHECK (method IN ('cash', 'debit', 'qris', 'transfer')),
  status text NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'succeeded', 'failed', 'expired', 'cancelled')),
  order_ids uuid[] NOT NULL DEFAULT '{}', -- orders this request will pay
  created_at timestamptz NOT NULL DEFAULT now(),
  paid_at timestamptz,
  restaurant_id text NOT NULL DEFAULT 'default'
);

CREATE INDEX IF NOT EXISTS idx_payment_requests_table
  ON payment_requests(table_id);
CREATE INDEX IF NOT EXISTS idx_payment_requests_status
  ON payment_requests(status);
CREATE INDEX IF NOT EXISTS idx_payment_requests_external_id
  ON payment_requests(external_id);
