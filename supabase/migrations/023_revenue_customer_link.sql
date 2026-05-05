-- ============================================
-- 023: Link revenue transactions to customers + bookings.
--
-- Settling a bill can attribute revenue to a specific customer either via:
--   a) the table's `current_booking_id` (booked customer), or
--   b) a phone number typed at settle time (walk-in member).
--
-- `points_awarded` records how many loyalty points were added by this
-- transaction so the loyalty ledger (PR 8) can replay the history without
-- re-deriving from a magic formula that may change.
-- ============================================

ALTER TABLE revenue_transactions
  ADD COLUMN IF NOT EXISTS customer_id uuid REFERENCES customers(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS booking_id  uuid REFERENCES bookings(id)  ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS points_awarded integer NOT NULL DEFAULT 0;

CREATE INDEX IF NOT EXISTS idx_revenue_transactions_tenant_customer
  ON revenue_transactions(tenant_id, customer_id);
CREATE INDEX IF NOT EXISTS idx_revenue_transactions_tenant_booking
  ON revenue_transactions(tenant_id, booking_id);
