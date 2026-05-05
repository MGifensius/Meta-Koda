import { createBrowserClient } from "@supabase/ssr";

// Browser-side Supabase client. Uses the public anon key — safe to ship to
// the browser. Server-side code (none in PR 2; PR 3 will add it on the
// backend) uses the service_role key instead.
export const supabase = createBrowserClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
);
