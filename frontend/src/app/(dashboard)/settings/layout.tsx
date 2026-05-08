"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Settings as SettingsIcon, LayoutGrid, Bot } from "lucide-react";

// V1 settings nav. Each entry is its own URL — clicking opens a real
// new page (back/forward in the browser works, deep links work,
// page-level cache hydration kicks in per route). We dropped the
// horizontal Tabs because the user wanted side-menu navigation.
const SECTIONS = [
  { href: "/settings", label: "General", icon: SettingsIcon },
  { href: "/settings/tables", label: "Meja", icon: LayoutGrid },
  { href: "/settings/bot", label: "AI Bot", icon: Bot },
];

export default function SettingsLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const path = usePathname();
  const isActive = (href: string) =>
    href === "/settings" ? path === "/settings" : path.startsWith(href);

  return (
    // Two-column grid that anchors directly to the dashboard's scroll
    // container (no wrapping space-y / title block above), so the nav
    // can sticky-pin to top-0 immediately. items-start + self-start
    // keeps the nav at its natural height; bg-background + the negative
    // top margin make the sticky nav visually cover the scroll
    // container's top padding when it pins.
    <div className="grid grid-cols-[200px_1fr] gap-6 items-start">
      <nav className="sticky top-0 self-start z-10 space-y-1 -mt-5 pt-5 pb-3 bg-background">
        <div className="px-3 pb-3 mb-1 border-b border-border/60">
          <h1 className="text-[15px] font-semibold leading-tight">Settings</h1>
          <p className="text-[11px] text-muted-foreground mt-0.5">
            Restoran &amp; bot
          </p>
        </div>
        {SECTIONS.map((s) => {
          const Icon = s.icon;
          const active = isActive(s.href);
          return (
            <Link
              key={s.href}
              href={s.href}
              className={`flex items-center gap-2 px-3 py-2 rounded-md text-[13px] transition-colors ${
                active
                  ? "bg-muted font-medium text-foreground"
                  : "text-muted-foreground hover:bg-muted/50 hover:text-foreground"
              }`}
            >
              <Icon className="size-4" />
              <span>{s.label}</span>
            </Link>
          );
        })}
      </nav>

      <div className="min-w-0">{children}</div>
    </div>
  );
}
