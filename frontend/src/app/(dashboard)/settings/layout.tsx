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
    <div className="space-y-4">
      <div>
        <h1 className="text-lg font-semibold">Settings</h1>
        <p className="text-[13px] text-muted-foreground">
          Atur profil restoran, meja, dan perilaku AI Bot.
        </p>
      </div>

      <div className="grid grid-cols-[200px_1fr] gap-6 items-start">
        {/* sticky top-4 pins the side nav inside the dashboard's scroll
            container so it stays visible while the right pane scrolls.
            self-start prevents the grid item from stretching to match
            the content's height (which would defeat sticky). */}
        <nav className="sticky top-4 self-start space-y-1">
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
    </div>
  );
}
