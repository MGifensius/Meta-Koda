import { supabase } from "./supabase-client";

// All paths are relative to this base. Pages call `apiFetch("/customers/")`,
// not `apiFetch("http://localhost:8000/api/customers/")`.
//
// `NEXT_PUBLIC_API_URL` is read at build time by Next.js. In Vercel, set it
// to the deployed backend URL (e.g. `https://api.meta-koda.com/api`).
// Falls back to localhost for local dev.
const API_BASE =
  process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000/api";

// Module-level token cache. Updated whenever Supabase fires an auth state
// change. Reading the token this way avoids `getSession()` which can hang
// or briefly return null right after sign-in / token refresh.
let cachedAccessToken: string | null = null;

if (typeof window !== "undefined") {
  // Pre-populate from any session already in storage on first load.
  void supabase.auth.getSession().then(({ data }) => {
    cachedAccessToken = data.session?.access_token ?? cachedAccessToken;
  });
  supabase.auth.onAuthStateChange((_event, session) => {
    cachedAccessToken = session?.access_token ?? null;
  });
}

function authHeaders(): Record<string, string> {
  return cachedAccessToken
    ? { Authorization: `Bearer ${cachedAccessToken}` }
    : {};
}

/**
 * Fetch wrapper that attaches the current Supabase session's JWT to every
 * request. Pass paths starting with `/` — e.g. `apiFetch("/customers/")`.
 *
 * The backend rejects unauthenticated calls with 401 (after PR 3), so every
 * page-level data fetch should go through this helper instead of the raw
 * `fetch` global.
 */
// 25-second hard stop. Backed by AbortController so a hung backend never
// freezes a button forever — caller sees a thrown AbortError instead of
// an indefinite spinner.
const DEFAULT_TIMEOUT_MS = 25_000;

// Module-level flag so concurrent 401s (very common on a multi-fetch
// page like /admin) only fire one signOut + redirect.
let redirectingFor401 = false;

export async function apiFetch(
  path: string,
  init?: RequestInit,
): Promise<Response> {
  const headers = new Headers(init?.headers);
  for (const [k, v] of Object.entries(authHeaders())) {
    headers.set(k, v);
  }
  // Default Content-Type for JSON bodies; callers can override.
  if (
    !headers.has("Content-Type") &&
    init?.body &&
    typeof init.body === "string"
  ) {
    headers.set("Content-Type", "application/json");
  }
  // Compose with caller's signal if any.
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), DEFAULT_TIMEOUT_MS);
  const callerSignal = init?.signal;
  if (callerSignal) {
    if (callerSignal.aborted) controller.abort();
    else callerSignal.addEventListener("abort", () => controller.abort(), { once: true });
  }
  let res: Response;
  try {
    res = await fetch(`${API_BASE}${path}`, {
      ...init,
      headers,
      signal: controller.signal,
    });
  } finally {
    clearTimeout(timer);
  }

  // Subscription gate: backend returns 402 (Payment Required) when the
  // tenant's subscription is expired or cancelled. Redirect once — guard
  // against loops by checking the current path.
  if (
    res.status === 402 &&
    typeof window !== "undefined" &&
    window.location.pathname !== "/expired"
  ) {
    window.location.replace("/expired");
  }
  // 401 = JWT expired/invalid OR no Bearer header sent. Hard-redirect to
  // the root login screen so the user can re-sign-in. Skip when we're
  // already on the login page to avoid a redirect loop, and skip when a
  // redirect has already been triggered by a parallel 401 (multiple in-
  // flight requests can all 401 at once on a page like /admin).
  if (
    res.status === 401 &&
    typeof window !== "undefined" &&
    window.location.pathname !== "/" &&
    !redirectingFor401
  ) {
    redirectingFor401 = true;
    // Fire signOut in the background — never await it. If it hangs (which
    // it can during a stuck refresh), we still want to navigate. The
    // hard `location.href` change kills the page anyway.
    supabase.auth.signOut().catch(() => {});
    window.location.href = "/";
  }
  return res;
}
