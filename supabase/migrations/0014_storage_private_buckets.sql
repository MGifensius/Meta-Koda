-- 0014_storage_private_buckets.sql
-- Closes the "Public Bucket Allows Listing" Security Advisor warnings on
-- storage.avatars and storage.org-logos by:
--
--  1. Marking the buckets non-public (storage.buckets.public = false).
--  2. Dropping any existing broad SELECT policy that allowed listing.
--  3. Replacing them with authenticated-only SELECT policies (anon can no
--     longer enumerate filenames or fetch files via the public CDN URL).
--
-- Trade-off: avatar and logo URLs must now be served via signed URLs.
-- Existing avatar_url and logo_url values were Supabase public URLs which
-- no longer resolve, so we NULL them out and require re-upload through
-- the new flow (which stores the storage path in the DB).
--
-- Semantic change documented in column comments below.

-- ============================================================================
-- 1. Mark buckets non-public
-- ============================================================================

update storage.buckets set public = false where id in ('avatars', 'org-logos');

-- ============================================================================
-- 2. Drop any existing SELECT policies on storage.objects scoped to these buckets
-- ============================================================================

do $drop_policies$
declare r record;
begin
  for r in
    select polname
    from pg_policy
    where polrelid = 'storage.objects'::regclass
      and polcmd = 'r'
      and (
        pg_get_expr(polqual, polrelid) like '%avatars%'
        or pg_get_expr(polqual, polrelid) like '%org-logos%'
      )
  loop
    execute format('drop policy %I on storage.objects', r.polname);
  end loop;
end
$drop_policies$;

-- ============================================================================
-- 3. Add authenticated-only SELECT policies
-- ============================================================================

create policy "Authenticated read avatars"
  on storage.objects for select
  to authenticated
  using (bucket_id = 'avatars');

create policy "Authenticated read org-logos"
  on storage.objects for select
  to authenticated
  using (bucket_id = 'org-logos');

-- ============================================================================
-- 4. NULL out stale public-URL values on profiles + organizations
-- ============================================================================
-- Before: avatar_url / logo_url stored Supabase public URLs which no longer
-- resolve now that buckets are private.
-- After: these columns store the storage PATH within the bucket
-- (e.g. '<user_id>/avatar-123.png'). Render code generates signed URLs at
-- request time.

update public.profiles set avatar_url = null where avatar_url is not null;
update public.organizations set logo_url = null where logo_url is not null;

comment on column public.profiles.avatar_url is
  'Storage path within the avatars bucket (e.g. "<user_id>/avatar-123.png"). Render via signed URL — the bucket is private.';
comment on column public.organizations.logo_url is
  'Storage path within the org-logos bucket. Render via signed URL — the bucket is private.';
