-- 0019_move_rls_helpers_to_private.sql
-- Moves the RLS helper functions out of the public schema into a dedicated
-- `private` schema. This clears the last 2 Security Advisor warnings
-- ("Signed-In Users Can Execute SECURITY DEFINER Function") because:
--
--   1. PostgREST only exposes functions in the schemas listed in its
--      `db_schema` setting (defaults to `public`). Functions in `private`
--      are not callable via /rest/v1/rpc.
--   2. The Security Advisor's lint description explicitly recommends "move
--      it out of your exposed API schema" — that's exactly this.
--
-- The functions stay SECURITY DEFINER (still required to read auth.jwt()
-- claims regardless of caller role), but they're invisible to the API.
-- Existing RLS policies continue to work because policies store function
-- references by OID, not by qualified name. ALTER FUNCTION SET SCHEMA
-- keeps the OID identical, so the 33+ policies on tenant tables don't need
-- updating.

-- ============================================================================
-- 1. Create the private schema
-- ============================================================================

create schema if not exists private;

-- authenticated needs USAGE on the schema to call functions inside it during
-- RLS policy evaluation. (PostgREST still won't expose them as RPC because
-- `private` isn't in the API schema list.)
grant usage on schema private to authenticated;

-- ============================================================================
-- 2. Move the functions
-- ============================================================================

alter function public.get_my_org_id() set schema private;
alter function public.get_my_role()   set schema private;

-- ============================================================================
-- 3. Re-affirm EXECUTE grants
-- ============================================================================
-- ALTER FUNCTION SET SCHEMA preserves grants in theory, but explicit
-- re-affirmation makes the intent obvious and is idempotent.

revoke all on function private.get_my_org_id() from public;
revoke all on function private.get_my_org_id() from anon;
revoke all on function private.get_my_role()   from public;
revoke all on function private.get_my_role()   from anon;

grant execute on function private.get_my_org_id() to authenticated;
grant execute on function private.get_my_role()   to authenticated;
