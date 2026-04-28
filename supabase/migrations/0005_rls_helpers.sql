-- 0005_rls_helpers.sql

create or replace function public.get_my_org_id()
returns uuid
language sql
security definer
stable
set search_path = public
as $$
  select organization_id from public.profiles where id = auth.uid();
$$;

create or replace function public.get_my_role()
returns public.user_role
language sql
security definer
stable
set search_path = public
as $$
  select role from public.profiles where id = auth.uid();
$$;

revoke all on function public.get_my_org_id() from public;
revoke all on function public.get_my_role() from public;
grant execute on function public.get_my_org_id() to authenticated;
grant execute on function public.get_my_role() to authenticated;
