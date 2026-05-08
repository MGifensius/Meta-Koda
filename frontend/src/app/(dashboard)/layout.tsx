"use client";

import { useEffect } from "react";
import { SidebarProvider, SidebarInset, SidebarTrigger } from "@/components/ui/sidebar";
import { AppSidebar, ROLE_LABEL } from "@/components/dashboard/app-sidebar";
import { LoginScreen } from "@/components/dashboard/login";
import { usePathname, useRouter } from "next/navigation";
import { AuthProvider, useAuth } from "@/lib/role-context";
import { LogOut } from "lucide-react";

function LoadingScreen() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-background">
      <div className="text-center">
        <img src="/meta-koda-logo.png" alt="Meta-Koda" className="inline-block size-12 rounded-xl mb-4 animate-pulse" />
        <div className="flex items-center justify-center gap-1.5 mb-2">
          <div className="size-2 rounded-full bg-primary animate-bounce" style={{ animationDelay: "0ms" }} />
          <div className="size-2 rounded-full bg-primary animate-bounce" style={{ animationDelay: "150ms" }} />
          <div className="size-2 rounded-full bg-primary animate-bounce" style={{ animationDelay: "300ms" }} />
        </div>
        <p className="text-[13px] text-muted-foreground">Loading...</p>
      </div>
    </div>
  );
}

const t: Record<string, string> = {
  "/": "Dashboard", "/customers": "Customers", "/bookings": "Bookings",
  "/floor": "Floor", "/inbox": "Inbox", "/settings": "Settings",
  "/settings/tables": "Settings", "/settings/bot": "Settings",
  "/admin": "Super Admin",
};

const subcrumb: Record<string, string> = {
  "/": "Overview", "/customers": "Customers", "/bookings": "Reservations",
  "/floor": "Floor", "/inbox": "Conversations",
  "/settings": "General",
  "/settings/tables": "Meja",
  "/settings/bot": "AI Bot",
  "/admin": "Tenants & Subscriptions",
};

function DashboardInner({ children }: { children: React.ReactNode }) {
  const { isLoggedIn, isLoading, role, userName, tenantName, signOut } = useAuth();
  const p = usePathname();
  const router = useRouter();

  // Whether the current URL matches the role's allowed home. We use this
  // both to fire the redirect and to gate rendering — without the gate,
  // the layout briefly paints the previous role's UI before the redirect
  // commits, causing a one-frame flash on account switch.
  const needsRedirect =
    isLoggedIn &&
    (
      (role === "cashier" && !p.startsWith("/floor")) ||
      (role === "super_admin" && !p.startsWith("/admin")) ||
      (role !== "super_admin" && role !== "cashier" && p.startsWith("/admin"))
    );

  useEffect(() => {
    if (!needsRedirect) return;
    if (role === "cashier") router.replace("/floor");
    else if (role === "super_admin") router.replace("/admin");
    else router.replace("/");
  }, [needsRedirect, role, router]);

  const handleLogout = async () => {
    // signOut is now optimistic — local state flips immediately so the
    // navigation feels instant even on slow networks.
    await signOut();
    router.push("/");
  };

  if (isLoading) return <LoadingScreen />;
  if (!isLoggedIn) return <LoginScreen />;
  // Hold the loading screen during the role-mismatch redirect window so
  // we never paint the wrong-role layout.
  if (needsRedirect) return <LoadingScreen />;

  // Cashier: full-screen, no sidebar (PR 7 will rename to Floor Operation).
  // Super-admin: same shape, dedicated /admin console — no tenant sidebar
  // because they don't belong to any single tenant.
  if (role === "cashier" || role === "super_admin") {
    const title =
      role === "super_admin"
        ? "Meta-Koda Admin"
        : `Floor Operation${tenantName ? ` — ${tenantName}` : ""}`;
    return (
      <div className="min-h-screen flex flex-col bg-background">
        <header className="h-12 flex items-center justify-between px-5 border-b border-border bg-white">
          <div className="flex items-center gap-2">
            <img src="/meta-koda-logo.png" alt="Meta-Koda" className="size-6 rounded-md" />
            <span className="text-sm font-medium">{title}</span>
          </div>
          <div className="flex items-center gap-3">
            <span className="text-[12px] text-muted-foreground">{userName}</span>
            <button onClick={handleLogout} className="text-muted-foreground hover:text-foreground transition-colors">
              <LogOut className="size-4" />
            </button>
          </div>
        </header>
        <div className="flex-1 overflow-auto p-4">{children}</div>
      </div>
    );
  }

  // Tenant Owner / Admin / Marketing / Staff / Super Admin — sidebar layout
  return (
    <SidebarProvider>
      <AppSidebar />
      <SidebarInset>
        <header className="h-14 flex items-center gap-3 px-5 border-b border-border bg-background/85 backdrop-blur-sm backdrop-saturate-150 sticky top-0 z-10">
          <SidebarTrigger className="size-6 text-muted-foreground hover:text-foreground shrink-0" />
          {/* Breadcrumb */}
          <nav className="flex items-center gap-2 text-[13px] ink-3">
            <span>{tenantName || "Meta-Koda"}</span>
            <span className="ink-5">/</span>
            <span>{t[p] || "Meta-Koda"}</span>
            <span className="ink-5">/</span>
            <span className="text-foreground font-medium">{subcrumb[p] || t[p] || ""}</span>
          </nav>
          <div className="ml-auto flex items-center gap-2.5">
            {/* Live status */}
            <div className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-full bg-card border border-border">
              <div className="size-1.5 rounded-full bg-[oklch(0.62_0.13_155)] shadow-[0_0_0_3px_oklch(0.62_0.13_155/0.2)]" />
              <span className="text-[12px] font-medium ink-2">Live · {ROLE_LABEL[role] ?? role}</span>
            </div>
            <button onClick={handleLogout} className="text-muted-foreground hover:text-foreground transition-colors" title="Logout">
              <LogOut className="size-4" />
            </button>
          </div>
        </header>
        <div className="flex-1 overflow-auto px-6 py-5">{children}</div>
      </SidebarInset>
    </SidebarProvider>
  );
}

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  return (
    <AuthProvider>
      <DashboardInner>{children}</DashboardInner>
    </AuthProvider>
  );
}
