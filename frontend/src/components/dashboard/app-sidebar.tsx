"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import {
  LayoutDashboard, Users, CalendarDays, LayoutGrid,
  MessageSquare, Megaphone, Gift, Settings, LogOut, UtensilsCrossed,
} from "lucide-react";
import {
  Sidebar, SidebarContent, SidebarGroup,
  SidebarGroupContent, SidebarGroupLabel, SidebarHeader, SidebarMenu,
  SidebarMenuButton, SidebarMenuItem, SidebarRail,
  SidebarFooter,
} from "@/components/ui/sidebar";
import { useAuth } from "@/lib/role-context";
import { apiFetch } from "@/lib/api-client";

const workspace = [
  { t: "Dashboard", h: "/", i: LayoutDashboard },
  { t: "Customers", h: "/customers", i: Users },
  { t: "Bookings", h: "/bookings", i: CalendarDays, badge: 0 },
  { t: "Menu", h: "/menu", i: UtensilsCrossed },
  { t: "Floor Operation", h: "/floor", i: LayoutGrid },
  { t: "Inbox", h: "/inbox", i: MessageSquare, badge: 0 },
];

const growth = [
  { t: "Marketing", h: "/marketing", i: Megaphone },
  { t: "Loyalty", h: "/loyalty", i: Gift },
];

// Friendly labels for the role chip in sidebar / breadcrumb.
export const ROLE_LABEL: Record<string, string> = {
  super_admin: "Super Admin",
  tenant_owner: "Owner",
  admin: "Admin",
  cashier: "Cashier",
  marketing: "Marketing",
  staff: "Staff",
};

const roleAccess: Record<string, string[]> = {
  // Meta-Koda staff. Tenant-scoped sidebar still applies when they
  // impersonate a tenant; their dedicated /admin console is separate.
  super_admin: [...workspace, ...growth].map((n) => n.t).concat(["Settings"]),
  // Tenant owner — full access inside their tenant.
  tenant_owner: [...workspace, ...growth].map((n) => n.t).concat(["Settings"]),
  // Admin — daily ops. No floor operation, no Menu CRUD, no Settings.
  admin: ["Dashboard", "Inbox", "Bookings", "Customers", "Marketing", "Loyalty"],
  // Cashier — Floor Operation only.
  cashier: ["Dashboard", "Floor Operation"],
  // Marketing — outreach + customers + loyalty.
  marketing: ["Dashboard", "Inbox", "Customers", "Marketing", "Loyalty"],
  // Staff — limited ops.
  staff: ["Dashboard", "Bookings", "Customers"],
};

export function AppSidebar() {
  const p = usePathname();
  const router = useRouter();
  const { role, userName, tenantName, signOut } = useAuth();
  const active = (h: string) => (h === "/" ? p === "/" : p.startsWith(h));
  const allowed = useMemo(() => roleAccess[role] ?? [], [role]);

  const wsItems = workspace.filter((n) => allowed.includes(n.t));
  const growthItems = growth.filter((n) => allowed.includes(n.t));

  // Poll total unread across all conversations for the Inbox badge.
  const [unreadInbox, setUnreadInbox] = useState(0);
  useEffect(() => {
    if (!allowed.includes("Inbox")) return;
    let cancelled = false;
    const fetchUnread = async () => {
      try {
        const res = await apiFetch("/chat/conversations");
        if (!res.ok) return;
        const data: { unread_count?: number }[] = await res.json();
        if (cancelled) return;
        const total = data.reduce((s, c) => s + (c.unread_count || 0), 0);
        setUnreadInbox(total);
      } catch {
        /* silent */
      }
    };
    fetchUnread();
    const t = setInterval(fetchUnread, 5000);
    return () => {
      cancelled = true;
      clearInterval(t);
    };
  }, [allowed]);

  const badgeFor = (itemTitle: string): number => {
    if (itemTitle === "Inbox") return unreadInbox;
    return 0;
  };

  return (
    <Sidebar collapsible="icon">
      <SidebarHeader className="px-3 py-4 border-b border-sidebar-border">
        <Link href="/" className="flex items-center gap-2.5">
          <img src="/meta-koda-logo.png" alt="Meta-Koda" className="size-9 rounded-[10px] shrink-0" />
          <div className="flex flex-col overflow-hidden group-data-[collapsible=icon]:hidden">
            <span className="text-[15px] font-semibold text-foreground whitespace-nowrap leading-tight font-serif-display">
              Meta-Koda
            </span>
            <span className="text-[10px] uppercase tracking-wider font-mono-label whitespace-nowrap leading-tight ink-4 mt-0.5">
              {tenantName ? tenantName.toUpperCase() : "META-KODA"}
            </span>
          </div>
        </Link>
      </SidebarHeader>
      <SidebarContent className="px-2 pt-3 group-data-[collapsible=icon]:px-1.5">
        <SidebarGroup>
          <SidebarGroupLabel className="font-mono-label text-[9.5px] tracking-[0.06em] uppercase ink-4 px-2 pb-1">Workspace</SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              {wsItems.map((n) => {
                const badge = badgeFor(n.t);
                return (
                  <SidebarMenuItem key={n.t}>
                    <SidebarMenuButton render={<Link href={n.h} />} isActive={active(n.h)} tooltip={n.t}>
                      <n.i className="size-4" />
                      <span className="text-[13px] flex-1">{n.t}</span>
                      {badge > 0 && (
                        <span className="ml-auto text-[10px] font-medium bg-primary text-primary-foreground rounded-full px-1.5 py-0.5 min-w-4.5 text-center leading-tight group-data-[collapsible=icon]:hidden">
                          {badge > 99 ? "99+" : badge}
                        </span>
                      )}
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                );
              })}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>

        {growthItems.length > 0 && (
          <SidebarGroup className="mt-2">
            <SidebarGroupLabel className="font-mono-label text-[9.5px] tracking-[0.06em] uppercase ink-4 px-2 pb-1">Growth</SidebarGroupLabel>
            <SidebarGroupContent>
              <SidebarMenu>
                {growthItems.map((n) => (
                  <SidebarMenuItem key={n.t}>
                    <SidebarMenuButton render={<Link href={n.h} />} isActive={active(n.h)} tooltip={n.t}>
                      <n.i className="size-4" />
                      <span className="text-[13px]">{n.t}</span>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                ))}
              </SidebarMenu>
            </SidebarGroupContent>
          </SidebarGroup>
        )}
      </SidebarContent>

      <SidebarFooter className="px-3 py-3 border-t border-sidebar-border">
        <div className="flex items-center gap-2.5 group-data-[collapsible=icon]:hidden">
          <div className="size-8 rounded-full bg-[linear-gradient(135deg,#2A2520,#4a4038)] flex items-center justify-center text-white text-[12px] font-medium shrink-0">
            {userName?.charAt(0).toUpperCase() || "U"}
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-[13px] font-medium truncate">{userName || "User"}</p>
            <p className="text-[10px] font-mono-label uppercase tracking-wider ink-4 truncate">
              {ROLE_LABEL[role] ?? role}
            </p>
          </div>
          <div className="flex items-center gap-1">
            <button
              onClick={() => router.push("/settings")}
              className="size-7 rounded-md border border-border hover:bg-secondary flex items-center justify-center ink-3 hover:text-foreground transition-colors"
              aria-label="Settings"
            >
              <Settings className="size-3.5" />
            </button>
            <button
              onClick={async () => { await signOut(); router.push("/"); }}
              className="size-7 rounded-md border border-border hover:bg-secondary flex items-center justify-center ink-3 hover:text-foreground transition-colors"
              aria-label="Logout"
            >
              <LogOut className="size-3.5" />
            </button>
          </div>
        </div>
      </SidebarFooter>
      <SidebarRail />
    </Sidebar>
  );
}
