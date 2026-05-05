-- ============================================
-- 010: Rename tier Platinum → Diamond, add 'admin' + 'kitchen' roles
-- ============================================

-- 1. Tier rename: Platinum → Diamond
ALTER TABLE customers DROP CONSTRAINT IF EXISTS customers_tier_check;
UPDATE customers SET tier = 'Diamond' WHERE tier = 'Platinum';
ALTER TABLE customers ADD CONSTRAINT customers_tier_check
  CHECK (tier IS NULL OR tier IN ('Bronze', 'Silver', 'Gold', 'Diamond'));

-- Update tier-assignment trigger to use Diamond
CREATE OR REPLACE FUNCTION update_customer_tier()
RETURNS trigger AS $$
BEGIN
  IF NEW.is_member = true THEN
    IF NEW.points >= 2500 THEN
      NEW.tier := 'Diamond';
    ELSIF NEW.points >= 1000 THEN
      NEW.tier := 'Gold';
    ELSIF NEW.points >= 300 THEN
      NEW.tier := 'Silver';
    ELSE
      NEW.tier := 'Bronze';
    END IF;
  ELSE
    NEW.tier := NULL;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_customer_tier ON customers;
CREATE TRIGGER trg_customer_tier
  BEFORE UPDATE OF points, is_member ON customers
  FOR EACH ROW EXECUTE FUNCTION update_customer_tier();

-- Update points-earned multiplier function to use Diamond
CREATE OR REPLACE FUNCTION calculate_points_earned(amount_idr bigint, tier text)
RETURNS integer AS $$
BEGIN
  RETURN FLOOR((amount_idr / 1000.0) * CASE tier
    WHEN 'Diamond' THEN 2.0
    WHEN 'Gold' THEN 1.5
    WHEN 'Silver' THEN 1.25
    ELSE 1.0
  END);
END;
$$ LANGUAGE plpgsql;

-- 2. Roles: expand allowed set to include 'admin' and 'kitchen'
-- (Old set: owner, receptionist, cashier)
ALTER TABLE roles DROP CONSTRAINT IF EXISTS roles_name_check;
ALTER TABLE roles ADD CONSTRAINT roles_name_check
  CHECK (name IN ('owner', 'admin', 'receptionist', 'cashier', 'kitchen'));

-- Migrate any existing 'receptionist' rows to 'admin'
UPDATE roles SET name = 'admin', description = 'Admin — Inbox, Booking, Marketing, Loyalty'
  WHERE name = 'receptionist';

-- Seed any missing roles (idempotent)
INSERT INTO roles (name, description) VALUES
  ('admin', 'Admin — Inbox, Booking, Marketing, Loyalty'),
  ('kitchen', 'Kitchen — Order tracker with timers')
ON CONFLICT (name) DO NOTHING;
