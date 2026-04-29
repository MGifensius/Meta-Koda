-- 0012_security_hardening.sql
-- Addresses Supabase Security Advisor warnings (2026-04-29):
--
--  1. function_search_path_mutable — set explicit search_path on every
--     SECURITY DEFINER function and the customer-id helpers, defending against
--     schema-spoofing attacks.
--  2. extension_in_public — move btree_gist and pg_trgm into the dedicated
--     extensions schema (Supabase convention).
--  3. public_can_execute_security_definer_function — revoke EXECUTE from
--     PUBLIC and grant only to authenticated.
--  4. (Phase 4 multi-tenant bug) increment_koda_tokens did not check the
--     calling user's org, so any authenticated user could mutate token
--     counters on conversations in other tenants. Adds the org predicate.
--
-- Out of scope (intentionally accepted): storage bucket public-listing on
-- avatars and org-logos — these are public-by-design for browser rendering.

-- ============================================================================
-- 1. Move extensions out of public into the extensions schema
-- ============================================================================

create schema if not exists extensions;
grant usage on schema extensions to public;

do $mig$
begin
  if exists (
    select 1 from pg_extension e join pg_namespace n on e.extnamespace = n.oid
    where e.extname = 'btree_gist' and n.nspname = 'public'
  ) then
    alter extension btree_gist set schema extensions;
  end if;

  if exists (
    select 1 from pg_extension e join pg_namespace n on e.extnamespace = n.oid
    where e.extname = 'pg_trgm' and n.nspname = 'public'
  ) then
    alter extension pg_trgm set schema extensions;
  end if;
end
$mig$;

-- ============================================================================
-- 2. Lock down search_path on SECURITY DEFINER + critical functions
-- ============================================================================

alter function public.get_my_org_id()              set search_path = public, pg_temp;
alter function public.get_my_role()                set search_path = public, pg_temp;
alter function public.handle_new_user()            set search_path = public, pg_temp;
alter function public.generate_crockford_id()      set search_path = public, pg_temp;
alter function public.set_customer_display_id()    set search_path = public, pg_temp;

-- ============================================================================
-- 3. Patch increment_koda_tokens — add tenant check + lock search_path
-- ============================================================================

create or replace function public.increment_koda_tokens(
  convo_id uuid,
  in_tokens int,
  out_tokens int,
  tool_count int
) returns void
  language sql
  security definer
  set search_path = public, pg_temp
as $$
  update public.koda_conversations
  set total_input_tokens = total_input_tokens + in_tokens,
      total_output_tokens = total_output_tokens + out_tokens,
      total_tool_calls = total_tool_calls + tool_count
  where id = convo_id
    and organization_id = public.get_my_org_id();
$$;

-- ============================================================================
-- 4. Revoke EXECUTE on SECURITY DEFINER functions from PUBLIC
-- ============================================================================
-- Trigger functions like handle_new_user are invoked by the trigger machinery
-- regardless of grants, so revoking PUBLIC there is safe.

-- Use REVOKE ALL with canonical type names (integer, not int) — Postgres
-- function-signature matching for REVOKE is finicky around type aliases.
revoke all on function public.get_my_org_id()                                          from public;
revoke all on function public.get_my_role()                                            from public;
revoke all on function public.handle_new_user()                                        from public;
revoke all on function public.increment_koda_tokens(uuid, integer, integer, integer)   from public;

grant execute on function public.get_my_org_id()                                       to authenticated;
grant execute on function public.get_my_role()                                         to authenticated;
grant execute on function public.increment_koda_tokens(uuid, integer, integer, integer) to authenticated;
