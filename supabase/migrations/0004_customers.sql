-- 0004_customers.sql

create table public.customers (
  id uuid primary key default gen_random_uuid(),
  display_id text not null,
  organization_id uuid not null references public.organizations(id) on delete cascade,
  full_name text not null,
  phone text,
  email text,
  birth_date date,
  notes text,
  tags text[] not null default '{}',
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index customers_organization_id_idx
  on public.customers (organization_id);

create unique index customers_display_id_unique
  on public.customers (organization_id, display_id);

create unique index customers_phone_unique
  on public.customers (organization_id, phone)
  where phone is not null;

create index customers_full_name_trgm
  on public.customers using gin (full_name gin_trgm_ops);

create trigger set_customers_updated_at
  before update on public.customers
  for each row execute function extensions.moddatetime(updated_at);

create or replace function public.generate_crockford_id(prefix text, length int)
returns text
language plpgsql
as $$
declare
  alphabet text := '0123456789ABCDEFGHJKMNPQRSTVWXYZ';
  result text := '';
  i int;
  pos int;
begin
  for i in 1..length loop
    pos := 1 + floor(random() * 32)::int;
    result := result || substr(alphabet, pos, 1);
  end loop;
  return prefix || '-' || result;
end;
$$;

create or replace function public.set_customer_display_id()
returns trigger
language plpgsql
as $$
declare
  candidate text;
  attempts int := 0;
begin
  if NEW.display_id is not null and NEW.display_id <> '' then
    return NEW;
  end if;
  loop
    candidate := public.generate_crockford_id('CUS', 6);
    exit when not exists (
      select 1 from public.customers
       where organization_id = NEW.organization_id
         and display_id = candidate
    );
    attempts := attempts + 1;
    if attempts > 5 then
      raise exception 'failed to generate unique customer display_id after 5 attempts';
    end if;
  end loop;
  NEW.display_id := candidate;
  return NEW;
end;
$$;

create trigger customers_set_display_id
  before insert on public.customers
  for each row execute function public.set_customer_display_id();
