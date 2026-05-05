-- ============================================
-- 025: Booking confirmation flow.
--
-- Tracks the WhatsApp acknowledgement loop independently of operational
-- status. `bookings.status` remains the floor-side state machine
-- (reserved → occupied → done). `confirmation_state` is the messaging-side
-- handshake (pending → sent → confirmed | declined).
--
-- The `booking_events` audit table records every state change with the
-- actor (user OR scheduler), so the booking detail drawer can render a
-- timeline and post-mortems are possible.
-- ============================================

ALTER TABLE bookings
  ADD COLUMN IF NOT EXISTS confirmation_state text NOT NULL DEFAULT 'pending'
    CHECK (confirmation_state IN ('pending','sent','confirmed','declined')),
  ADD COLUMN IF NOT EXISTS confirmation_sent_at timestamptz,
  ADD COLUMN IF NOT EXISTS reminder_sent_at timestamptz,
  ADD COLUMN IF NOT EXISTS cancelled_reason text,
  ADD COLUMN IF NOT EXISTS cancelled_at timestamptz;

CREATE INDEX IF NOT EXISTS idx_bookings_confirmation_state
  ON bookings(tenant_id, confirmation_state);


-- ----------------------------------------------------------
-- booking_events — audit trail
-- ----------------------------------------------------------
CREATE TABLE IF NOT EXISTS booking_events (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  booking_id uuid NOT NULL REFERENCES bookings(id) ON DELETE CASCADE,
  event_type text NOT NULL CHECK (event_type IN (
    'created',
    'confirmation_sent',
    'confirmed',
    'declined',
    'reminder_sent',
    'seated',
    'settled',
    'cancelled',
    'no_show_auto',
    'manual_resend',
    'note'
  )),
  payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  actor_id uuid REFERENCES users(id),                -- null = scheduler
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_booking_events_tenant_booking_created
  ON booking_events(tenant_id, booking_id, created_at DESC);
