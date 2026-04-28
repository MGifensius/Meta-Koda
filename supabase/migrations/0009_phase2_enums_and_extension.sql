-- 0009_phase2_enums_and_extension.sql

-- Required for tstzrange exclusion constraint that combines = with &&
create extension if not exists btree_gist;

create type public.table_status as enum (
  'available',
  'reserved',
  'occupied',
  'cleaning',
  'unavailable'
);

create type public.booking_source as enum (
  'manual',
  'walk_in'
);
-- Phase 3 adds 'whatsapp' via:
--   alter type public.booking_source add value 'whatsapp' before 'manual';

create type public.booking_status as enum (
  'pending',
  'confirmed',
  'seated',
  'completed',
  'cancelled',
  'no_show'
);
