-- 0001_extensions_enums.sql

-- Extensions
create extension if not exists "pgcrypto";
create extension if not exists "moddatetime" schema extensions;
create extension if not exists "pg_trgm";

-- Enums
create type public.user_role as enum (
  'admin',
  'front_desk',
  'customer_service'
);

create type public.profile_status as enum (
  'active',
  'suspended'
);
