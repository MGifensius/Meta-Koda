-- ============================================
-- 002: Business Flow Updates
-- Member system, table status cycle, roles,
-- table-based POS orders
-- ============================================

-- Add member flag to customers
ALTER TABLE customers ADD COLUMN IF NOT EXISTS is_member boolean NOT NULL DEFAULT false;

-- Update table statuses: available → reserved → occupied → done
ALTER TABLE tables ADD COLUMN IF NOT EXISTS status text NOT NULL DEFAULT 'available'
  CHECK (status IN ('available', 'reserved', 'occupied', 'done'));
ALTER TABLE tables ADD COLUMN IF NOT EXISTS current_booking_id uuid REFERENCES bookings(id);

-- Update booking statuses to match flow
-- available → reserved → occupied → done/cancelled
ALTER TABLE bookings DROP CONSTRAINT IF EXISTS bookings_status_check;
ALTER TABLE bookings ADD CONSTRAINT bookings_status_check
  CHECK (status IN ('reserved', 'occupied', 'done', 'cancelled'));

-- Update existing data
UPDATE bookings SET status = 'reserved' WHERE status = 'pending';
UPDATE bookings SET status = 'reserved' WHERE status = 'confirmed';

-- Add seating preference to bookings
ALTER TABLE bookings ADD COLUMN IF NOT EXISTS seating text DEFAULT 'indoor'
  CHECK (seating IN ('indoor', 'outdoor'));
ALTER TABLE bookings ADD COLUMN IF NOT EXISTS guest_name text;

-- ============================================
-- ROLES
-- ============================================
CREATE TABLE IF NOT EXISTS roles (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  name text NOT NULL UNIQUE CHECK (name IN ('owner', 'receptionist', 'cashier')),
  description text
);

INSERT INTO roles (name, description) VALUES
  ('owner', 'Full access to all modules'),
  ('receptionist', 'Inbox & Booking only'),
  ('cashier', 'POS only')
ON CONFLICT (name) DO NOTHING;

CREATE TABLE IF NOT EXISTS users (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  email text UNIQUE NOT NULL,
  name text NOT NULL,
  role_id uuid NOT NULL REFERENCES roles(id),
  is_active boolean DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- ============================================
-- TABLE-BASED ORDERS (POS redesign)
-- Orders are now linked to a table, not just a customer
-- ============================================
ALTER TABLE orders ADD COLUMN IF NOT EXISTS table_id text REFERENCES tables(id);

-- When order is created for a table, set table to occupied
CREATE OR REPLACE FUNCTION set_table_occupied()
RETURNS trigger AS $$
BEGIN
  IF NEW.table_id IS NOT NULL AND NEW.status = 'open' THEN
    UPDATE tables SET status = 'occupied' WHERE id = NEW.table_id;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_order_occupy_table ON orders;
CREATE TRIGGER trg_order_occupy_table
  AFTER INSERT ON orders
  FOR EACH ROW EXECUTE FUNCTION set_table_occupied();

-- When order is paid, set table back to available
CREATE OR REPLACE FUNCTION set_table_available_on_pay()
RETURNS trigger AS $$
BEGIN
  IF NEW.status = 'paid' AND OLD.status != 'paid' AND NEW.table_id IS NOT NULL THEN
    UPDATE tables SET status = 'available', current_booking_id = NULL WHERE id = NEW.table_id;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_order_free_table ON orders;
CREATE TRIGGER trg_order_free_table
  AFTER UPDATE OF status ON orders
  FOR EACH ROW EXECUTE FUNCTION set_table_available_on_pay();

-- Booking flow triggers
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
  -- Done or Cancelled: free the table
  IF NEW.status IN ('done', 'cancelled') AND OLD.status != NEW.status AND NEW.table_id IS NOT NULL THEN
    UPDATE tables SET status = 'available', current_booking_id = NULL WHERE id = NEW.table_id;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_booking_status ON bookings;
CREATE TRIGGER trg_booking_status
  AFTER UPDATE OF status ON bookings
  FOR EACH ROW EXECUTE FUNCTION booking_status_change();

-- Update campaign table for member targeting
ALTER TABLE campaigns ADD COLUMN IF NOT EXISTS target_audience text DEFAULT 'all'
  CHECK (target_audience IN ('all', 'member', 'non-member'));
