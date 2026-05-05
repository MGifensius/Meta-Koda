-- ============================================
-- 011: Kitchen order pipeline
-- Adds kitchen_status + timing columns to orders so the kitchen
-- screen can track Received → Preparing → Done → Served and
-- measure prep performance.
-- ============================================

ALTER TABLE orders
  ADD COLUMN IF NOT EXISTS kitchen_status text NOT NULL DEFAULT 'received',
  ADD COLUMN IF NOT EXISTS prep_started_at timestamptz,
  ADD COLUMN IF NOT EXISTS prep_done_at timestamptz;

ALTER TABLE orders DROP CONSTRAINT IF EXISTS orders_kitchen_status_check;
ALTER TABLE orders ADD CONSTRAINT orders_kitchen_status_check
  CHECK (kitchen_status IN ('received', 'preparing', 'done', 'served'));

CREATE INDEX IF NOT EXISTS idx_orders_kitchen_status ON orders(kitchen_status);

-- Back-fill: any existing non-cancelled, non-paid orders are treated as received
UPDATE orders SET kitchen_status = 'received'
  WHERE kitchen_status IS NULL;
