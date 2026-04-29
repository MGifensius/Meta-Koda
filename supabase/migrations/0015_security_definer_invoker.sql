-- 0015_security_definer_invoker.sql
-- Closes the "Signed-In Users Can Execute SECURITY DEFINER Function" warnings
-- by either flipping safe-to-flip functions to SECURITY INVOKER or revoking
-- EXECUTE entirely (for triggers).
--
-- Per-function rationale:
--
--   get_my_org_id(), get_my_role()
--     Just read auth.jwt() claims. SECURITY DEFINER was unnecessary.
--     Switching to INVOKER does NOT change behaviour — auth.jwt() reads
--     session-level GUCs that work for any role.
--
--   increment_koda_tokens(...)
--     Updates koda_conversations. With SECURITY INVOKER, the UPDATE runs as
--     the authenticated user and is naturally bounded by the existing
--     UPDATE RLS policy on koda_conversations (admin/front_desk in same org).
--     The function's WHERE clause already includes organization_id =
--     get_my_org_id() defense-in-depth.
--
--   handle_new_user()
--     Trigger that runs when auth.users gets a new row. SECURITY DEFINER is
--     needed because it inserts into public.profiles before the new user has
--     any role granting INSERT access. But the trigger fires automatically —
--     no role needs EXECUTE on the function for the trigger to fire. Revoke
--     ALL from public, anon, authenticated so it can't be called as RPC.

-- ============================================================================
-- 1. Flip read-only helpers to SECURITY INVOKER
-- ============================================================================

alter function public.get_my_org_id() security invoker;
alter function public.get_my_role()   security invoker;

-- ============================================================================
-- 2. Flip increment_koda_tokens to SECURITY INVOKER
-- ============================================================================
-- Re-create with the new modifier. CREATE OR REPLACE FUNCTION preserves
-- existing privileges (we explicitly re-grant after).

create or replace function public.increment_koda_tokens(
  convo_id uuid,
  in_tokens int,
  out_tokens int,
  tool_count int
) returns void
  language sql
  security invoker
  set search_path = public, pg_temp
as $$
  update public.koda_conversations
  set total_input_tokens = total_input_tokens + in_tokens,
      total_output_tokens = total_output_tokens + out_tokens,
      total_tool_calls = total_tool_calls + tool_count
  where id = convo_id
    and organization_id = public.get_my_org_id();
$$;

-- Re-grant authenticated; CREATE OR REPLACE may have reset implicit grants.
revoke all on function public.increment_koda_tokens(uuid, integer, integer, integer) from public;
revoke all on function public.increment_koda_tokens(uuid, integer, integer, integer) from anon;
grant execute on function public.increment_koda_tokens(uuid, integer, integer, integer) to authenticated;

-- ============================================================================
-- 3. Lock down handle_new_user — revoke EXECUTE; trigger firing is unaffected
-- ============================================================================

revoke all on function public.handle_new_user() from public;
revoke all on function public.handle_new_user() from anon;
revoke all on function public.handle_new_user() from authenticated;
