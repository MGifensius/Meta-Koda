-- 0002_organizations.sql

create table public.organizations (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique,
  name text not null,
  timezone text not null default 'Asia/Jakarta',
  logo_url text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create trigger set_organizations_updated_at
  before update on public.organizations
  for each row execute function extensions.moddatetime(updated_at);

insert into public.organizations (slug, name, timezone)
values ('buranchi', 'Buranchi', 'Asia/Jakarta');
