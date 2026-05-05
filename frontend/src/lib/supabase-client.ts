import { createBrowserClient } from "@supabase/ssr";

// Browser-side Supabase client. Uses the public anon key — safe to ship to
// the browser. Server-side code uses the service_role key instead.
//
// Storage is intentionally `sessionStorage`, not the default `localStorage`:
//   • Closing the tab / window discards the session → next visit forces a
//     fresh login (no auto-restore from a previous account on a shared
//     machine).
//   • Within the active tab, refreshes still keep the user signed in,
//     because sessionStorage survives F5 — only tab close clears it.
//   • Each tab has its own session, so multiple staff on the same machine
//     can each sign in with different accounts without colliding.
export const supabase = createBrowserClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
  {
    auth: {
      storage: typeof window !== "undefined" ? window.sessionStorage : undefined,
      persistSession: true,
      autoRefreshToken: true,
      detectSessionInUrl: true,
    },
  },
);
