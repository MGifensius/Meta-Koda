-- ============================================
-- 003: Cleaning state, 15-min buffer, multi-tenant prep,
--      omnichannel support, platform tracking
-- ============================================

-- ============================================
-- TABLE STATE MACHINE UPDATE
-- Available → Booked/Reserved → Occupied → Cleaning → Available
-- Add "cleaning" state to tables
-- ============================================
ALTER TABLE tables DROP CONSTRAINT IF EXISTS tables_status_check;
ALTER TABLE tables ADD CONSTRAINT tables_status_check
  CHECK (status IN ('available', 'reserved', 'occupied', 'cleaning'));

-- Update "done" → "available" for any existing rows
UPDATE tables SET status = 'available' WHERE status = 'done';

-- Add cleaning_until timestamp for auto-release
ALTER TABLE tables ADD COLUMN IF NOT EXISTS cleaning_until timestamptz;

-- Booking status: add no_show
ALTER TABLE bookings DROP CONSTRAINT IF EXISTS bookings_status_check;
ALTER TABLE bookings ADD CONSTRAINT bookings_status_check
  CHECK (status IN ('reserved', 'occupied', 'done', 'cancelled', 'no_show'));

-- Update trigger: when booking → done, table → cleaning for 15 min
CREATE OR REPLACE FUNCTION booking_status_change()
RETURNS trigger AS $$
BEGIN
  -- Reserved: mark table as reserved
  IF NEW.status = 'reserved' AND NEW.table_id IS NOT NULL THEN
    UPDATE tables SET status = 'reserved', current_booking_id = NEW.id WHERE id = NEW.table_id;
  END IF;

  -- Occupied: mark table as occupied
  IF NEW.status = 'occupied' AND OLD.status = 'reserved' AND NEW.table_id IS NOT NULL THEN
    UPDATE tables SET status = 'occupied' WHERE id = NEW.table_id;
  END IF;

  -- Done: table → cleaning (15-min buffer before available)
  IF NEW.status = 'done' AND OLD.status = 'occupied' AND NEW.table_id IS NOT NULL THEN
    UPDATE tables
    SET status = 'cleaning',
        current_booking_id = NULL,
        cleaning_until = now() + interval '15 minutes'
    WHERE id = NEW.table_id;
  END IF;

  -- Cancelled or No-Show: free the table immediately
  IF NEW.status IN ('cancelled', 'no_show') AND OLD.status != NEW.status AND NEW.table_id IS NOT NULL THEN
    UPDATE tables SET status = 'available', current_booking_id = NULL, cleaning_until = NULL WHERE id = NEW.table_id;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_booking_status ON bookings;
CREATE TRIGGER trg_booking_status
  AFTER UPDATE OF status ON bookings
  FOR EACH ROW EXECUTE FUNCTION booking_status_change();

-- Also handle booking INSERT (new reservation)
CREATE OR REPLACE FUNCTION booking_insert_reserve()
RETURNS trigger AS $$
BEGIN
  IF NEW.status = 'reserved' AND NEW.table_id IS NOT NULL THEN
    UPDATE tables SET status = 'reserved', current_booking_id = NEW.id WHERE id = NEW.table_id;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_booking_insert ON bookings;
CREATE TRIGGER trg_booking_insert
  AFTER INSERT ON bookings
  FOR EACH ROW EXECUTE FUNCTION booking_insert_reserve();

-- Update POS trigger: when order paid → cleaning instead of available
CREATE OR REPLACE FUNCTION set_table_available_on_pay()
RETURNS trigger AS $$
BEGIN
  IF NEW.status = 'paid' AND OLD.status != 'paid' AND NEW.table_id IS NOT NULL THEN
    UPDATE tables
    SET status = 'cleaning',
        current_booking_id = NULL,
        cleaning_until = now() + interval '15 minutes'
    WHERE id = NEW.table_id;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_order_free_table ON orders;
CREATE TRIGGER trg_order_free_table
  AFTER UPDATE OF status ON orders
  FOR EACH ROW EXECUTE FUNCTION set_table_available_on_pay();

-- Function to auto-release cleaning tables (called by scheduler)
CREATE OR REPLACE FUNCTION release_cleaning_tables()
RETURNS integer AS $$
DECLARE
  released integer;
BEGIN
  UPDATE tables
  SET status = 'available', cleaning_until = NULL
  WHERE status = 'cleaning' AND cleaning_until <= now();
  GET DIAGNOSTICS released = ROW_COUNT;
  RETURN released;
END;
$$ LANGUAGE plpgsql;

-- ============================================
-- MULTI-TENANT PREP
-- Add restaurant_id to all core tables
-- ============================================
ALTER TABLE customers ADD COLUMN IF NOT EXISTS restaurant_id text NOT NULL DEFAULT 'default';
ALTER TABLE tables ADD COLUMN IF NOT EXISTS restaurant_id text NOT NULL DEFAULT 'default';
ALTER TABLE bookings ADD COLUMN IF NOT EXISTS restaurant_id text NOT NULL DEFAULT 'default';
ALTER TABLE orders ADD COLUMN IF NOT EXISTS restaurant_id text NOT NULL DEFAULT 'default';
ALTER TABLE menu_items ADD COLUMN IF NOT EXISTS restaurant_id text NOT NULL DEFAULT 'default';
ALTER TABLE rewards ADD COLUMN IF NOT EXISTS restaurant_id text NOT NULL DEFAULT 'default';
ALTER TABLE campaigns ADD COLUMN IF NOT EXISTS restaurant_id text NOT NULL DEFAULT 'default';
ALTER TABLE conversations ADD COLUMN IF NOT EXISTS restaurant_id text NOT NULL DEFAULT 'default';
ALTER TABLE messages ADD COLUMN IF NOT EXISTS restaurant_id text NOT NULL DEFAULT 'default';
ALTER TABLE feedback_requests ADD COLUMN IF NOT EXISTS restaurant_id text NOT NULL DEFAULT 'default';

-- Indexes for multi-tenant queries
CREATE INDEX IF NOT EXISTS idx_customers_restaurant ON customers(restaurant_id);
CREATE INDEX IF NOT EXISTS idx_bookings_restaurant ON bookings(restaurant_id);
CREATE INDEX IF NOT EXISTS idx_orders_restaurant ON orders(restaurant_id);
CREATE INDEX IF NOT EXISTS idx_conversations_restaurant ON conversations(restaurant_id);

-- ============================================
-- OMNICHANNEL: Platform tracking
-- ============================================
ALTER TABLE customers ADD COLUMN IF NOT EXISTS ig_handle text;
ALTER TABLE customers ADD COLUMN IF NOT EXISTS tiktok_id text;

-- Track which platform a conversation came from
ALTER TABLE conversations ADD COLUMN IF NOT EXISTS platform text NOT NULL DEFAULT 'whatsapp'
  CHECK (platform IN ('whatsapp', 'instagram', 'tiktok', 'walk_in'));

-- Track which channel a booking was made from
ALTER TABLE bookings ADD COLUMN IF NOT EXISTS channel text NOT NULL DEFAULT 'whatsapp'
  CHECK (channel IN ('whatsapp', 'instagram', 'tiktok', 'walk_in', 'dashboard'));

-- ============================================
-- LOYALTY: Tier multiplier for points
-- ============================================
CREATE OR REPLACE FUNCTION calculate_points_earned(amount_idr bigint, tier text)
RETURNS integer AS $$
DECLARE
  base_points integer;
  multiplier numeric;
BEGIN
  base_points := (amount_idr / 10000)::integer;
  multiplier := CASE tier
    WHEN 'Platinum' THEN 2.0
    WHEN 'Gold' THEN 1.5
    WHEN 'Silver' THEN 1.2
    ELSE 1.0
  END;
  RETURN (base_points * multiplier)::integer;
END;
$$ LANGUAGE plpgsql;
