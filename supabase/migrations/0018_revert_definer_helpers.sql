-- 0018_revert_definer_helpers.sql
-- Reverts 0015's SECURITY INVOKER change on get_my_org_id and get_my_role.
--
-- Why: switching these RLS-helper functions to INVOKER broke the login flow.
-- The profiles SELECT policy uses `organization_id = public.get_my_org_id()`,
-- which under INVOKER returned NULL or empty in some auth contexts —
-- requireProfile() then bounces the user back to /login because it can't
-- read its own profile row.
--
-- These two functions:
--   - read auth.jwt() claims (no privileged access required in theory)
--   - are referenced by every tenant-scoped RLS policy
-- so they're effectively unfix-able by the SECURITY INVOKER route. The
-- Security Advisor will continue to flag them as "Signed-In Users Can
-- Execute SECURITY DEFINER Function" — these 2 warnings are accepted as
-- intentional and document the trade-off here.
--
-- Future cleanup: move these helpers into a non-public schema (e.g. `private`
-- or `extensions`). PostgREST doesn't expose non-public schemas via RPC, so
-- the lint goes away. Requires updating every RLS policy that references
-- them by name. Tracked as future work.
--
-- increment_koda_tokens stays as SECURITY INVOKER (from 0015) — that one's
-- only called from server actions, not RLS, and INVOKER is correct there.
-- handle_new_user keeps EXECUTE revoked from authenticated (from 0015) —
-- that's a trigger-only function, no impact on login.

alter function public.get_my_org_id() security definer;
alter function public.get_my_role()   security definer;
