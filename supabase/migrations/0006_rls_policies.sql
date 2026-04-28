-- 0006_rls_policies.sql

alter table public.organizations enable row level security;

create policy "select own organization"
  on public.organizations for select
  using (id = public.get_my_org_id());

create policy "admin can update own organization"
  on public.organizations for update
  using (id = public.get_my_org_id() and public.get_my_role() = 'admin')
  with check (id = public.get_my_org_id() and public.get_my_role() = 'admin');

alter table public.profiles enable row level security;

create policy "select profiles in same org"
  on public.profiles for select
  using (organization_id = public.get_my_org_id());

create policy "user can update own profile"
  on public.profiles for update
  using (id = auth.uid())
  with check (id = auth.uid());

create policy "admin can update profiles in their org"
  on public.profiles for update
  using (organization_id = public.get_my_org_id() and public.get_my_role() = 'admin')
  with check (organization_id = public.get_my_org_id() and public.get_my_role() = 'admin');

alter table public.customers enable row level security;

create policy "select customers in same org"
  on public.customers for select
  using (organization_id = public.get_my_org_id());

create policy "insert customers into own org"
  on public.customers for insert
  with check (
    organization_id = public.get_my_org_id()
    and public.get_my_role() in ('admin', 'front_desk', 'customer_service')
  );

create policy "update customers in own org"
  on public.customers for update
  using (organization_id = public.get_my_org_id())
  with check (organization_id = public.get_my_org_id());

create policy "admin can delete customers"
  on public.customers for delete
  using (
    organization_id = public.get_my_org_id()
    and public.get_my_role() = 'admin'
  );
