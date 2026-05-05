-- ============================================
-- 005: Tier is NULL for non-members
-- Only members get tiers (Bronze → Silver → Gold → Platinum)
-- Non-members can still visit and spend but don't earn points or have tiers
-- ============================================

-- Allow NULL tier
ALTER TABLE customers ALTER COLUMN tier DROP NOT NULL;
ALTER TABLE customers ALTER COLUMN tier SET DEFAULT NULL;
ALTER TABLE customers DROP CONSTRAINT IF EXISTS customers_tier_check;
ALTER TABLE customers ADD CONSTRAINT customers_tier_check
  CHECK (tier IS NULL OR tier IN ('Bronze', 'Silver', 'Gold', 'Platinum'));

-- Update tier trigger: only apply to members
CREATE OR REPLACE FUNCTION update_customer_tier()
RETURNS trigger AS $$
BEGIN
  -- Only update tier for members
  IF NEW.is_member = true THEN
    IF NEW.points >= 2500 THEN
      NEW.tier := 'Platinum';
    ELSIF NEW.points >= 1000 THEN
      NEW.tier := 'Gold';
    ELSIF NEW.points >= 300 THEN
      NEW.tier := 'Silver';
    ELSE
      NEW.tier := 'Bronze';
    END IF;
  ELSE
    -- Non-members have no tier and no points
    NEW.tier := NULL;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Also trigger on is_member change (when someone becomes a member)
DROP TRIGGER IF EXISTS trg_customer_tier ON customers;
CREATE TRIGGER trg_customer_tier
  BEFORE UPDATE OF points, is_member ON customers
  FOR EACH ROW EXECUTE FUNCTION update_customer_tier();
