-- Allow more seating types to match table zones
ALTER TABLE bookings DROP CONSTRAINT IF EXISTS bookings_seating_check;
ALTER TABLE bookings ADD CONSTRAINT bookings_seating_check
  CHECK (seating IN ('indoor', 'outdoor', 'window', 'private'));
