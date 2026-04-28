-- 0003_profiles.sql

create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  organization_id uuid not null references public.organizations(id) on delete cascade,
  email text,
  full_name text not null,
  role public.user_role not null,
  status public.profile_status not null default 'active',
  avatar_url text,
  last_seen_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index profiles_organization_id_idx on public.profiles (organization_id);

create trigger set_profiles_updated_at
  before update on public.profiles
  for each row execute function extensions.moddatetime(updated_at);
