-- 0008_organization_address_hours.sql

alter table public.organizations
  add column if not exists address text,
  add column if not exists operating_hours text;
