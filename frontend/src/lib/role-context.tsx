"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from "react";
import type { Session } from "@supabase/supabase-js";
import { supabase } from "./supabase-client";
import type { UserRole } from "./mock-data";

type AuthState = {
  isLoggedIn: boolean;
  isLoading: boolean;
  session: Session | null;
  role: UserRole;
  userName: string;
  email: string;
  tenantId: string | null;
  tenantName: string;
  signIn: (
    email: string,
    password: string,
  ) => Promise<{ ok: boolean; error?: string }>;
  signOut: () => Promise<void>;
};

const AuthContext = createContext<AuthState>({
  isLoggedIn: false,
  isLoading: true,
  session: null,
  role: "staff",
  userName: "",
  email: "",
  tenantId: null,
  tenantName: "",
  signIn: async () => ({ ok: false, error: "AuthProvider not mounted" }),
  signOut: async () => {},
});

type Profile = {
  role: UserRole;
  name: string | null;
  tenant_id: string | null;
  tenant_name: string | null;
  email: string;
};

// Hard ceiling on auth bootstrap. If Supabase or the network is having
// a bad day, never trap the user on the splash forever — drop them to
// the login page after this elapses and let them retry. 8s is generous
// enough to ride out an HF cold-start, short enough that "stuck" feels
// like a temporary blip not a broken site.
const AUTH_BOOTSTRAP_TIMEOUT_MS = 8000;

// Accepts any thenable so we can wrap Supabase's PostgrestBuilder
// (which is awaitable but not strictly a Promise) without casts.
function withTimeout<T>(p: PromiseLike<T>, ms: number, label: string): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const t = setTimeout(
      () => reject(new Error(`[auth] ${label} timed out after ${ms}ms`)),
      ms,
    );
    p.then(
      (v) => {
        clearTimeout(t);
        resolve(v);
      },
      (e) => {
        clearTimeout(t);
        reject(e);
      },
    );
  });
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  const loadProfile = useCallback(async (userId: string, fallbackEmail: string) => {
    // Look up our internal users row (tenant + role) by auth user id, and
    // join the tenant's display name so the layout can render the right
    // brand without an extra request. The `tenants_self_read` RLS policy
    // (migration 030) lets the authenticated user read only their own
    // tenant row.
    const { data, error } = await withTimeout(
      supabase
        .from("users")
        .select("role, name, tenant_id, email, tenants(business_name)")
        .eq("id", userId)
        .maybeSingle(),
      AUTH_BOOTSTRAP_TIMEOUT_MS,
      "loadProfile",
    );
    if (error || !data) {
      // User authenticated successfully but isn't provisioned in `users` —
      // sign them out so they see the login screen instead of a half-app.
      console.warn(
        "[auth] user not provisioned in users table; signing out",
        error,
      );
      await supabase.auth.signOut();
      setProfile(null);
      return;
    }
    const tenantBlob = (data as { tenants?: { business_name?: string } | null }).tenants;
    setProfile({
      role: data.role as UserRole,
      name: data.name,
      tenant_id: data.tenant_id,
      tenant_name: tenantBlob?.business_name ?? null,
      email: data.email || fallbackEmail,
    });
  }, []);

  useEffect(() => {
    let cancelled = false;
    // Track whether we've already loaded a profile so subsequent auth events
    // (esp. TOKEN_REFRESHED on tab refocus) don't flash the loading screen.
    let hasProfile = false;

    (async () => {
      try {
        // getSession reads from localStorage first and only hits the
        // network for token refresh, but it CAN hang if the server is
        // cold or the connection is flaky. Cap it.
        const { data } = await withTimeout(
          supabase.auth.getSession(),
          AUTH_BOOTSTRAP_TIMEOUT_MS,
          "getSession",
        );
        if (cancelled) return;
        const sess = data.session;
        setSession(sess);
        if (sess) {
          await loadProfile(sess.user.id, sess.user.email ?? "");
          hasProfile = true;
        }
      } catch (err) {
        // Anything explodes during bootstrap — log and treat the user
        // as logged-out so they hit the login page instead of an
        // infinite splash. They can retry from there.
        console.error("[auth] bootstrap failed:", err);
        if (!cancelled) {
          setSession(null);
          setProfile(null);
        }
      } finally {
        if (!cancelled) setIsLoading(false);
      }
    })();

    const { data: sub } = supabase.auth.onAuthStateChange(async (event, sess) => {
      setSession(sess);

      // User signed out (or session lost) — show login.
      if (event === "SIGNED_OUT" || !sess) {
        setProfile(null);
        hasProfile = false;
        setIsLoading(false);
        return;
      }

      // Background token refresh (fires when the tab regains focus). Same
      // user, same role, same tenant — no UI work needed.
      if (event === "TOKEN_REFRESHED") return;

      // INITIAL_SESSION fires once when the listener is set up alongside
      // the explicit `getSession()` block above. Skip it to avoid a
      // duplicate `loadProfile` round-trip on every page load.
      if (event === "INITIAL_SESSION") {
        hasProfile = !!sess;
        return;
      }

      // Genuine sign-in / user update: refresh profile.
      // Only flip to loading-screen mode when we don't already have a
      // profile in memory; otherwise reload silently in the background.
      if (!hasProfile) setIsLoading(true);
      try {
        await loadProfile(sess.user.id, sess.user.email ?? "");
        hasProfile = true;
      } catch (err) {
        console.error("[auth] profile reload failed:", err);
        setProfile(null);
      } finally {
        setIsLoading(false);
      }
    });

    return () => {
      cancelled = true;
      sub.subscription.unsubscribe();
    };
  }, [loadProfile]);

  const signIn = useCallback(
    async (email: string, password: string) => {
      const { error } = await supabase.auth.signInWithPassword({ email, password });
      if (error) return { ok: false, error: error.message };
      return { ok: true };
    },
    [],
  );

  const signOut = useCallback(async () => {
    // Optimistic — flip to logged-out state immediately so the UI doesn't
    // freeze waiting on Supabase's network round-trip. The auth-state
    // listener will reconcile when SIGNED_OUT actually fires.
    setProfile(null);
    setSession(null);
    try {
      await supabase.auth.signOut();
    } catch (err) {
      console.warn("[auth] signOut failed (state already cleared):", err);
    }
  }, []);

  return (
    <AuthContext.Provider
      value={{
        isLoggedIn: !!session && !!profile,
        isLoading,
        session,
        role: profile?.role ?? "staff",
        userName: profile?.name ?? profile?.email ?? "",
        email: profile?.email ?? session?.user?.email ?? "",
        tenantId: profile?.tenant_id ?? null,
        tenantName: profile?.tenant_name ?? "",
        signIn,
        signOut,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  return useContext(AuthContext);
}
