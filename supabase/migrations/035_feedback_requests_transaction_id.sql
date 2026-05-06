-- ============================================
-- 035: Feedback now anchors on the settle, not the booking.
--
-- Old flow: send the Google Form link 5h after the booking time and
-- record `booking_id` so we don't double-send.
--
-- New flow (per product): send 30 min after the bill is settled — works
-- for walk-ins (no booking row) and accommodates customers who arrived
-- late or stayed long. The dedupe key is now the revenue transaction.
--
-- Changes:
--   1. Add `transaction_id uuid` referencing revenue_transactions(id).
--   2. Make `booking_id` nullable so walk-ins can be tracked.
--   3. Index transaction_id for fast existence checks in the scheduler.
-- ============================================

ALTER TABLE feedback_requests
  ADD COLUMN IF NOT EXISTS transaction_id uuid
    REFERENCES revenue_transactions(id) ON DELETE SET NULL;

ALTER TABLE feedback_requests
  ALTER COLUMN booking_id DROP NOT NULL;

CREATE INDEX IF NOT EXISTS idx_feedback_requests_transaction
  ON feedback_requests(transaction_id);
