-- ============================================
-- 034: Drop the bookings.seating CHECK constraint.
--
-- Background: migration 008 hardcoded seating to ('indoor', 'outdoor',
-- 'window', 'private'). That made sense when zones were a fixed enum,
-- but zones are now per-tenant — Buranchi has "Teras Otella", "Poolside",
-- "Indoor Otella"; Kafé Cendana had different ones; future tenants will
-- have whatever their floor plan dictates.
--
-- The seating field is just a free-form preference label set when the
-- bot/receptionist takes a booking. Validation belongs at the application
-- layer (against the tenant's tables.zone list), not as a global CHECK.
-- ============================================

ALTER TABLE bookings DROP CONSTRAINT IF EXISTS bookings_seating_check;
