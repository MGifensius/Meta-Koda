-- 0013_revoke_anon_definer.sql
-- Follow-up to 0012: also revoke EXECUTE from the anon API role on every
-- SECURITY DEFINER function in the public schema.
--
-- Background: Supabase auto-grants EXECUTE to both `anon` and `authenticated`
-- on functions in the `public` schema so PostgREST can expose them via
-- /rest/v1/rpc. Migration 0012 only revoked the PUBLIC pseudo-role grant,
-- which left the explicit `anon` grant in place. The Security Advisor's
-- `public_can_execute_security_definer_function` lint specifically checks
-- the anon role.
--
-- The `authenticated` grants stay because RLS policies and server actions
-- legitimately call these functions in the authenticated user's context:
--   - get_my_org_id / get_my_role: read by RLS policies on every tenant table
--   - increment_koda_tokens: called by sendKodaMessageAction post-turn
--
-- Re-applies 0012's search_path and extension changes idempotently in case
-- 0012 partially failed.

-- ============================================================================
-- 1. Re-apply search_path (idempotent — overwrites prior config)
-- ============================================================================

alter function public.get_my_org_id()              set search_path = public, pg_temp;
alter function public.get_my_role()                set search_path = public, pg_temp;
alter function public.handle_new_user()            set search_path = public, pg_temp;
alter function public.generate_crockford_id()      set search_path = public, pg_temp;
alter function public.set_customer_display_id()    set search_path = public, pg_temp;

-- ============================================================================
-- 2. Re-move extensions out of public (idempotent)
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
-- 3. Revoke EXECUTE from anon on every SECURITY DEFINER function in public
-- ============================================================================

revoke all on function public.get_my_org_id()                                          from anon;
revoke all on function public.get_my_role()                                            from anon;
revoke all on function public.handle_new_user()                                        from anon;
revoke all on function public.increment_koda_tokens(uuid, integer, integer, integer)   from anon;
