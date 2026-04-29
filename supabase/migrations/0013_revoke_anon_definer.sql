-- 0013_revoke_anon_definer.sql
-- Follow-up to 0012. Re-applies search_path + extension moves + anon revokes
-- using DO-block iteration so it's signature-agnostic and idempotent.
--
-- Why this is structured as DO blocks instead of straight ALTERs:
--   ALTER FUNCTION foo() requires the EXACT signature, and Supabase managed
--   Postgres' alias handling for `int` vs `integer` etc. is finicky. When
--   migration 0012 used straight ALTERs, several of them silently no-op'd
--   because the signature didn't match perfectly. Iterating over pg_proc and
--   using oid::regprocedure sidesteps that entirely.
--
-- The `authenticated` grants stay — RLS policies and server actions
-- legitimately call these functions in the authenticated user's context:
--   - get_my_org_id / get_my_role: read by RLS policies on every tenant table
--   - increment_koda_tokens: called by sendKodaMessageAction post-turn
-- These will continue to surface as "Signed-In Users Can Execute SECURITY
-- DEFINER" warnings in the Security Advisor, which we accept.

-- ============================================================================
-- 1. Force search_path on every public function we own (idempotent)
-- ============================================================================

do $fix_search_path$
declare r record;
begin
  for r in
    select oid from pg_proc
    where pronamespace = 'public'::regnamespace
      and proname in (
        'get_my_org_id',
        'get_my_role',
        'handle_new_user',
        'generate_crockford_id',
        'set_customer_display_id',
        'increment_koda_tokens'
      )
  loop
    execute format('alter function %s set search_path = public, pg_temp', r.oid::regprocedure);
  end loop;
end
$fix_search_path$;

-- ============================================================================
-- 2. Move extensions out of public into the extensions schema (idempotent)
-- ============================================================================

create schema if not exists extensions;
grant usage on schema extensions to public;

do $move_extensions$
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
$move_extensions$;

-- ============================================================================
-- 3. Revoke EXECUTE from anon on every SECURITY DEFINER function in public
-- ============================================================================
-- Supabase auto-grants EXECUTE to anon and authenticated for functions in
-- the public schema (PostgREST API exposure). Migration 0012's
-- "revoke from public" only revoked the PUBLIC pseudo-role grant, leaving
-- the explicit anon grant in place. The Security Advisor's
-- public_can_execute_security_definer_function lint specifically checks
-- the anon role.

do $revoke_anon$
declare r record;
begin
  for r in
    select oid from pg_proc
    where pronamespace = 'public'::regnamespace
      and prosecdef = true
  loop
    execute format('revoke all on function %s from anon', r.oid::regprocedure);
  end loop;
end
$revoke_anon$;
