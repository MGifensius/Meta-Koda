-- ============================================
-- 013: Order sessions (parent-child tickets) + kitchen KPIs
-- A "session" = every order placed on a table between an Available→Occupied
-- transition and the corresponding Pay. The first order in a session is the
-- parent (sequence=1, displayed as "-A"); every tambah order is a child
-- (sequence=2..N, displayed as "-B", "-C", ...).
--
-- Why: the kitchen needs to know "this is an add-on — the guest is already
-- eating, get it out fast." The biller needs to total them together.
-- ============================================

ALTER TABLE orders
  ADD COLUMN IF NOT EXISTS session_id uuid,
  ADD COLUMN IF NOT EXISTS sequence integer NOT NULL DEFAULT 1;

CREATE INDEX IF NOT EXISTS idx_orders_session ON orders(session_id);

-- Back-fill: any existing open orders without a session are treated as
-- their own session (sequence stays at 1, session_id = own id).
UPDATE orders SET session_id = id WHERE session_id IS NULL;
