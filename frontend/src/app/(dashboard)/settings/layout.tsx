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
    // Side nav anchored at top-0 of the dashboard's overflow-auto
    // scroll container. Visual style mirrors the main AppSidebar:
    // mono-label section header, same item padding + icon + text
    // sizing + active-state colors so it reads as a peer surface,
    // not a foreign tabs control.
    <div className="grid grid-cols-[200px_1fr] gap-6 items-start">
      <nav className="sticky top-0 self-start">
        <div className="px-2 pb-1 font-mono-label text-[9.5px] tracking-[0.06em] uppercase ink-4">
          Settings
        </div>
        <ul className="space-y-0.5">
          {SECTIONS.map((s) => {
            const Icon = s.icon;
            const active = isActive(s.href);
            return (
              <li key={s.href}>
                <Link
                  href={s.href}
                  className={`flex items-center gap-2 px-2 py-1.5 rounded-md text-[13px] transition-colors ${
                    active
                      ? "bg-sidebar-accent text-sidebar-accent-foreground font-medium"
                      : "text-foreground/80 hover:bg-sidebar-accent/60 hover:text-sidebar-accent-foreground"
                  }`}
                >
                  <Icon className="size-4" />
                  <span className="flex-1">{s.label}</span>
                </Link>
              </li>
            );
          })}
        </ul>
      </nav>

      <div className="min-w-0">{children}</div>
    </div>
  );
}
