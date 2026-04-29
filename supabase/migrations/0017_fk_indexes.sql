-- 0017_fk_indexes.sql
-- Closes the "Unindexed foreign keys" Performance Advisor suggestions.
-- Each FK below points to profiles.id or koda_conversations.id and is used
-- by audit/tracking columns. Without an index, JOINs by these columns and
-- the cascade-resolution scan for parent UPDATE/DELETE both do sequential
-- scans.
--
-- All FKs here are nullable (audit columns are optional), so we use
-- partial indexes to skip the NULLs and keep the indexes compact.
--
-- The "Unused Index" suggestions in Info are deliberately NOT acted on —
-- they're false positives on a fresh database (pg_stat_user_indexes
-- accumulates over time). Re-evaluate after the app has run real traffic.

-- bookings.created_by → profiles.id
create index if not exists bookings_created_by_idx
  on public.bookings (created_by)
  where created_by is not null;

-- customer_notes.source_conversation_id → koda_conversations.id
create index if not exists customer_notes_source_conv_idx
  on public.customer_notes (source_conversation_id)
  where source_conversation_id is not null;

-- customer_notes.verified_by → profiles.id
create index if not exists customer_notes_verified_by_idx
  on public.customer_notes (verified_by)
  where verified_by is not null;

-- customer_notes.created_by → profiles.id
create index if not exists customer_notes_created_by_idx
  on public.customer_notes (created_by)
  where created_by is not null;

-- customers.created_by → profiles.id
create index if not exists customers_created_by_idx
  on public.customers (created_by)
  where created_by is not null;

-- koda_conversations.taken_over_by → profiles.id
create index if not exists koda_conversations_taken_over_idx
  on public.koda_conversations (taken_over_by)
  where taken_over_by is not null;

-- koda_messages.staff_id → profiles.id
create index if not exists koda_messages_staff_idx
  on public.koda_messages (staff_id)
  where staff_id is not null;
