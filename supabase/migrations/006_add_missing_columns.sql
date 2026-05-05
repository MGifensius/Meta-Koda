-- Add customer_phone to bookings if missing
ALTER TABLE bookings ADD COLUMN IF NOT EXISTS customer_phone text;
