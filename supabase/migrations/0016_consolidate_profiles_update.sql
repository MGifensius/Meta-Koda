-- 0016_consolidate_profiles_update.sql
-- Closes the Performance Advisor warnings on public.profiles:
--
--   1. "Auth RLS Initialization Plan" — direct auth.uid() in a policy gets
--      re-evaluated for every row. Wrap in (select auth.uid()) so Postgres
--      hoists the call out of the row-by-row loop.
--
--   2. "Multiple Permissive Policies" — profiles had two PERMISSIVE policies
--      for UPDATE (user-can-update-own and admin-can-update-org-members).
--      Postgres has to evaluate BOTH on every row and OR the result.
--      Consolidating into one policy with an OR'd predicate is faster.
--
-- Behaviour is identical: a user can update their own row, an admin can
-- update any row in their org. Other tables already have a single policy
-- per (table, command), so no changes needed there.

drop policy if exists "user can update own profile"           on public.profiles;
drop policy if exists "admin can update profiles in their org" on public.profiles;

create policy "update profiles (self or admin in own org)"
  on public.profiles for update
  using (
    id = (select auth.uid())
    or (
      organization_id = public.get_my_org_id()
      and public.get_my_role() = 'admin'
    )
  )
  with check (
    id = (select auth.uid())
    or (
      organization_id = public.get_my_org_id()
      and public.get_my_role() = 'admin'
    )
  );
