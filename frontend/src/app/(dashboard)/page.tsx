"use client";

import { useState, useEffect } from "react";
import { formatCurrency, formatNumber, statusBadge } from "@/lib/format";
import Link from "next/link";
import {
  Users, TrendingUp, CalendarDays, ShoppingCart, Zap,
  MessageSquare, Plus, UtensilsCrossed, Megaphone, UserPlus,
} from "lucide-react";
import { useAuth } from "@/lib/role-context";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { apiFetch } from "@/lib/api-client";

type Stats = {
  total_customers: number;
  revenue_today: number;
  total_bookings_today: number;
  avg_order_value: number;
  top_customers: { id: string; name: string; points: number; tier: string | null; total_visits: number; total_spent: number }[];
  today_bookings: { id: string; guest_name: string; time: string; party_size: number; table_id: string; status: string }[];
  recent_conversations: { id: string; last_message: string; last_message_time: string; unread_count: number; status: string; customers: { name: string; phone: string } }[];
  revenue_week: { date: string; day_short: string; day_full: string; total: number }[];
  revenue_week_total: number;
  revenue_week_avg: number;
};

function getGreeting() {
  const h = new Date().getHours();
  if (h < 11) return "Selamat pagi";
  if (h < 15) return "Selamat siang";
  if (h < 18) return "Selamat sore";
  return "Selamat malam";
}

function formatDate() {
  const days = ["Minggu", "Senin", "Selasa", "Rabu", "Kamis", "Jumat", "Sabtu"];
  const months = ["Januari", "Februari", "Maret", "April", "Mei", "Juni", "Juli", "Agustus", "September", "Oktober", "November", "Desember"];
  const d = new Date();
  return `${days[d.getDay()]}, ${d.getDate()} ${months[d.getMonth()]} ${d.getFullYear()}`;
}

function tierBadgeClass(tier: string | null) {
  if (!tier) return "ink-4 bg-stone-100";
  const m: Record<string, string> = {
    Diamond: "text-[oklch(0.45_0.12_230)] bg-[oklch(0.95_0.04_230)]",
    Gold: "text-[oklch(0.45_0.12_75)] bg-[oklch(0.95_0.05_75)]",
    Silver: "ink-3 bg-secondary",
    Bronze: "text-[oklch(0.38_0.10_42)] bg-[oklch(0.95_0.03_42)]",
  };
  return m[tier] || "ink-4 bg-stone-100";
}

// Stale-while-revalidate cache. The dashboard re-renders on every page
// visit; without this the first paint is empty zeros until the network
// round-trip completes. Caching the last successful stats payload per
// tenant means the UI lights up instantly with last-known-good data,
// and the silent background refetch updates it once the server replies.
const STATS_CACHE_KEY = (tid: string) => `dashboard_stats:${tid}`;

function readCachedStats(tenantId: string | null | undefined): Stats | null {
  if (!tenantId || typeof window === "undefined") return null;
  try {
    const raw = localStorage.getItem(STATS_CACHE_KEY(tenantId));
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    return parsed?.data ?? null;
  } catch {
    return null;
  }
}

function writeCachedStats(tenantId: string, data: Stats) {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(
      STATS_CACHE_KEY(tenantId),
      JSON.stringify({ data, ts: Date.now() }),
    );
  } catch {
    // Quota exceeded or storage disabled — silent fail, we just miss
    // the next-visit speedup.
  }
}

export default function Page() {
  const [stats, setStats] = useState<Stats | null>(null);
  const { userName, role, tenantId, tenantName, isLoading } = useAuth();

  // Hydrate from cache as soon as we know the tenant. Synchronous —
  // happens before the network call resolves so the cards render with
  // real numbers on first paint instead of zeros.
  useEffect(() => {
    if (!tenantId) return;
    const cached = readCachedStats(tenantId);
    if (cached) setStats(cached);
  }, [tenantId]);

  const fetchStats = async () => {
    if (!tenantId) return;
    try {
      const res = await apiFetch("/dashboard/stats");
      if (!res.ok) return;
      const data = await res.json();
      setStats(data);
      writeCachedStats(tenantId, data);
    } catch (err) {
      console.error(err);
    }
  };

  // Skip fetching on the home dashboard for users that don't belong to a
  // tenant (super_admin redirects to /admin) or while auth is still hydrating.
  // Without this guard, the dashboard renders for a frame before the layout's
  // redirect lands and triggers a noisy "Failed to fetch" in the console.
  useEffect(() => {
    if (isLoading) return;
    if (!tenantId || role === "super_admin" || role === "cashier") return;
    fetchStats();
    // 5s polling — dashboard tiles refresh fast enough that a fresh
    // booking from the bot or a settle on the floor reflects almost
    // immediately, but not so often that we hammer the API.
    const interval = setInterval(fetchStats, 5000);
    return () => clearInterval(interval);
    // fetchStats closes over tenantId/role; deps cover the actual triggers.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isLoading, tenantId, role]);

  const kpis = [
    {
      label: "Customers Aktif",
      value: formatNumber(stats?.total_customers ?? 0),
      unit: "",
      icon: Users,
    },
    {
      label: "Revenue Hari Ini",
      value: "Rp " + formatNumber(Math.round((stats?.revenue_today ?? 0) / 1000)),
      unit: "k",
      icon: TrendingUp,
    },
    {
      label: "Bookings Hari Ini",
      value: String(stats?.total_bookings_today ?? 0),
      unit: "",
      icon: CalendarDays,
    },
    {
      label: "Avg Order",
      value: "Rp " + formatNumber(Math.round((stats?.avg_order_value ?? 0) / 1000)),
      unit: "k",
      icon: ShoppingCart,
    },
  ];

  const todayBookings = stats?.today_bookings ?? [];
  const topCustomers = stats?.top_customers ?? [];
  const recentChats = stats?.recent_conversations ?? [];

  // Revenue week calculations (from DB, in millions for display)
  const revenueWeek = (stats?.revenue_week ?? []).map((d) => ({
    ...d,
    vM: d.total / 1_000_000,
  }));
  const maxV = Math.max(...revenueWeek.map((c) => c.vM), 0.001);
  const totalRevenueM = (stats?.revenue_week_total ?? 0) / 1_000_000;
  const avgRevenueM = (stats?.revenue_week_avg ?? 0) / 1_000_000;

  return (
    <div className="space-y-5">
      {/* Greeting header */}
      <div className="flex items-start justify-between gap-4 mb-1">
        <div>
          <h1 className="font-serif-display text-[26px] font-medium tracking-tight leading-tight">
            {getGreeting()}, {userName || "Owner"}
          </h1>
          <div className="flex items-center gap-2 mt-1.5 text-[13px] ink-3">
            <span>{formatDate()}</span>
            <span className="ink-5">·</span>
            <span>{tenantName || "Workspace"}</span>
            {todayBookings.length > 0 && (
              <>
                <span className="inline-flex items-center gap-1.5 ml-1">
                  <span className="size-1.5 rounded-full bg-[oklch(0.62_0.13_155)]" />
                  <span className="text-[oklch(0.62_0.13_155)] font-medium">{todayBookings.length} booking siap hari ini.</span>
                </span>
              </>
            )}
          </div>
        </div>
        <div className="flex items-center gap-2">
          <DropdownMenu>
            <DropdownMenuTrigger
              render={
                <Button className="rounded-md h-9 px-3 gap-1.5 text-[13px]" />
              }
            >
              <Zap className="size-4" /> Quick Action
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-52">
              <DropdownMenuItem render={<Link href="/bookings" />}>
                <CalendarDays className="size-4" /> Tambah Booking
              </DropdownMenuItem>
              <DropdownMenuItem render={<Link href="/customers" />}>
                <UserPlus className="size-4" /> Tambah Customer
              </DropdownMenuItem>
              <DropdownMenuItem render={<Link href="/menu" />}>
                <UtensilsCrossed className="size-4" /> Kelola Menu
              </DropdownMenuItem>
              <DropdownMenuItem render={<Link href="/marketing" />}>
                <Megaphone className="size-4" /> Buat Campaign
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-4 gap-2.5">
        {kpis.map((s) => (
          <div key={s.label} className="bg-card border border-border rounded-lg px-4 py-3.5 transition-colors hover:border-[#A39890]">
            <div className="flex items-center justify-between mb-2">
              <span className="kpi-label">{s.label}</span>
              <div className="size-5.5 rounded-md bg-secondary flex items-center justify-center ink-3">
                <s.icon className="size-3.5" />
              </div>
            </div>
            <p className="kpi-value">
              {s.value}
              {s.unit && <span className="text-[13px] ink-4 font-normal ml-0.5 font-mono-label">{s.unit}</span>}
            </p>
          </div>
        ))}
      </div>

      {/* Revenue Hero */}
      <div className="bg-card border border-border rounded-lg overflow-hidden">
        <div className="px-4.5 pt-4 pb-2 border-b border-border flex items-end justify-between gap-3">
          <div>
            <p className="kpi-label">Revenue · 7 Hari Terakhir</p>
            <p className="font-serif-display text-[32px] font-medium tracking-tight leading-none mt-1.5">
              Rp {totalRevenueM.toFixed(1)}<span className="text-[16px] ink-4 font-normal ml-0.5">M</span>
            </p>
            <div className="flex items-center gap-2 font-mono-label text-[11px] ink-4 mt-1.5">
              <span>avg Rp {avgRevenueM.toFixed(2)}M per hari</span>
            </div>
          </div>
          <span className="font-mono-label text-[10px] uppercase tracking-wider ink-4">
            7 hari
          </span>
        </div>

        {/* Chart + breakdown */}
        <div className="grid grid-cols-[1fr_280px] gap-0">
          {/* Bar chart */}
          <div className="p-5 border-r border-border">
            <div className="grid grid-cols-7 gap-3 items-end h-45">
              {revenueWeek.map((c) => {
                const isPeak = c.vM === maxV && c.vM > 0;
                const heightPct = maxV > 0 ? (c.vM / maxV) * 100 : 0;
                return (
                  <div key={c.date} className="flex flex-col items-center gap-1.5 relative">
                    <span className="font-mono-label text-[10px] ink-4 tabular-nums">{c.vM > 0 ? `${c.vM.toFixed(1)}M` : "—"}</span>
                    <div className="w-full relative" style={{ height: `${heightPct * 1.4}px`, minHeight: c.vM > 0 ? "4px" : "0" }}>
                      {isPeak && (
                        <span className="absolute -top-5 left-1/2 -translate-x-1/2 font-mono-label text-[9px] px-1.5 py-0.5 rounded bg-primary text-primary-foreground tracking-wider">PEAK</span>
                      )}
                      <div className={`w-full rounded-t-md h-full ${isPeak ? "bg-primary" : "bg-primary/20"}`} />
                    </div>
                  </div>
                );
              })}
            </div>
            <div className="grid grid-cols-7 gap-3 mt-2 text-center">
              {revenueWeek.map((c) => (
                <span key={c.date} className="font-mono-label text-[10px] tracking-wider uppercase ink-4">{c.day_short}</span>
              ))}
            </div>
          </div>

          {/* Breakdown harian */}
          <div className="p-5">
            <p className="kpi-label mb-3">Breakdown Harian</p>
            <div className="space-y-2.5">
              {revenueWeek.map((c) => {
                const pct = maxV > 0 ? (c.vM / maxV) * 100 : 0;
                const isPeak = c.vM === maxV && c.vM > 0;
                return (
                  <div key={c.date} className="flex items-center gap-2">
                    <span className="text-[12px] w-14 shrink-0 ink-2">{c.day_full}</span>
                    <div className="flex-1 h-1.5 bg-secondary rounded-full overflow-hidden">
                      <div
                        className={`h-full rounded-full ${isPeak ? "bg-[oklch(0.65_0.14_42)]" : "bg-[#D4CABC]"}`}
                        style={{ width: `${pct}%` }}
                      />
                    </div>
                    <span className={`text-[11.5px] font-mono-label tabular-nums w-16 text-right ${isPeak ? "text-[oklch(0.65_0.14_42)] font-medium" : "ink-3"}`}>
                      {c.vM > 0 ? `Rp ${c.vM.toFixed(2)}M` : "—"}
                    </span>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      </div>

      {/* Top Customers + Recent Chats */}
      <div className="grid grid-cols-2 gap-4">
        <div className="bg-card border border-border rounded-lg">
          <div className="px-3.5 py-2.5 flex items-center justify-between border-b border-border">
            <h2 className="text-[14px] font-medium">Top Customers</h2>
            <Link href="/customers" className="text-[12.5px] font-medium text-[oklch(0.38_0.10_42)] hover:text-[oklch(0.65_0.14_42)] transition-colors">
              Lihat Semua →
            </Link>
          </div>
          <div className="p-2">
            {topCustomers.map((c, i) => (
              <div key={c.id} className="flex items-center gap-3 rounded-md px-2.5 py-2 hover:bg-secondary transition-colors">
                <span className="font-mono-label text-[11px] ink-4 w-4">{i + 1}</span>
                <div className="size-8 rounded-full bg-[linear-gradient(135deg,#2A2520,#4a4038)] flex items-center justify-center text-white text-[11px] font-medium shrink-0">
                  {c.name.split(" ").map((s) => s[0]).slice(0, 2).join("").toUpperCase()}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-[13px] font-medium truncate">{c.name}</p>
                  <p className="text-[11px] ink-4 font-mono-label">{formatNumber(c.total_visits)} visits</p>
                </div>
                <span className={`text-[11px] font-medium px-2 py-0.5 rounded-full ${tierBadgeClass(c.tier)}`}>
                  {c.tier || "—"}
                </span>
                <span className="text-[12px] font-mono-label tabular-nums ink-2 w-16 text-right">{formatNumber(c.points)} pts</span>
              </div>
            ))}
            {topCustomers.length === 0 && (
              <p className="text-[12.5px] ink-4 text-center py-8">Belum ada data customer</p>
            )}
          </div>
        </div>

        <div className="bg-card border border-border rounded-lg">
          <div className="px-3.5 py-2.5 flex items-center justify-between border-b border-border">
            <div className="flex items-center gap-2">
              <h2 className="text-[14px] font-medium">Recent Chats</h2>
              {recentChats.filter((c) => c.unread_count > 0).length > 0 && (
                <span className="inline-flex items-center gap-1 text-[11.5px] ink-4">
                  <span className="size-1.5 rounded-full bg-[oklch(0.65_0.14_42)]" />
                  {recentChats.filter((c) => c.unread_count > 0).length} belum dibalas
                </span>
              )}
            </div>
            <Link href="/inbox" className="text-[12.5px] font-medium text-[oklch(0.38_0.10_42)] hover:text-[oklch(0.65_0.14_42)] transition-colors">
              Inbox →
            </Link>
          </div>
          <div className="p-2">
            {recentChats.map((c) => (
              <div key={c.id} className="flex items-center gap-3 rounded-md px-2.5 py-2 hover:bg-secondary transition-colors">
                <div className="size-8 rounded-full bg-[oklch(0.94_0.04_155)] flex items-center justify-center text-[oklch(0.45_0.12_155)] shrink-0">
                  <MessageSquare className="size-4" />
                </div>
                <div className="min-w-0 flex-1">
                  <p className="text-[13px] font-medium truncate">{c.customers?.name || c.customers?.phone}</p>
                  <p className="text-[12px] ink-3 truncate">{c.last_message}</p>
                </div>
                <div className="flex items-center gap-1.5">
                  <span className="text-[11px] ink-4 font-mono-label">2m</span>
                  {c.unread_count > 0 && <span className="size-1.5 rounded-full bg-[oklch(0.65_0.14_42)]" />}
                </div>
              </div>
            ))}
            {recentChats.length === 0 && (
              <p className="text-[12.5px] ink-4 text-center py-8">Belum ada percakapan</p>
            )}
          </div>
        </div>
      </div>

      {/* Today's Bookings */}
      <div className="bg-card border border-border rounded-lg overflow-hidden">
        <div className="px-3.5 py-2.5 flex items-center justify-between border-b border-border">
          <div>
            <h2 className="text-[14px] font-medium">Booking Hari Ini</h2>
            <p className="text-[12px] ink-4 mt-0.5">{todayBookings.length} reservasi</p>
          </div>
          <Link href="/bookings" className="text-[12.5px] font-medium text-[oklch(0.38_0.10_42)] hover:text-[oklch(0.65_0.14_42)] transition-colors">
            Lihat Semua →
          </Link>
        </div>
        <table className="w-full text-[13.5px]">
          <thead>
            <tr className="bg-background">
              <th className="text-left px-3 py-1.5 font-mono-label text-[10px] tracking-wider uppercase ink-4 font-medium border-b border-border">Customer</th>
              <th className="text-left px-3 py-1.5 font-mono-label text-[10px] tracking-wider uppercase ink-4 font-medium border-b border-border">Waktu</th>
              <th className="text-left px-3 py-1.5 font-mono-label text-[10px] tracking-wider uppercase ink-4 font-medium border-b border-border">Meja</th>
              <th className="text-right px-3 py-1.5 font-mono-label text-[10px] tracking-wider uppercase ink-4 font-medium border-b border-border">Status</th>
            </tr>
          </thead>
          <tbody>
            {todayBookings.map((b) => (
              <tr key={b.id} className="border-b border-border last:border-0 hover:bg-background transition-colors">
                <td className="px-3 py-2.5 font-medium">{b.guest_name}</td>
                <td className="px-3 py-2.5 ink-2 font-mono-label tabular-nums">{b.time} · {b.party_size} pax</td>
                <td className="px-3 py-2.5 ink-2">{b.table_id}</td>
                <td className="px-3 py-2.5 text-right">
                  <span className={`inline-block text-[11.5px] font-medium px-2 py-0.5 rounded-full capitalize ${statusBadge(b.status)}`}>
                    {b.status}
                  </span>
                </td>
              </tr>
            ))}
            {todayBookings.length === 0 && (
              <tr>
                <td colSpan={4} className="text-center py-8 ink-4 text-[12.5px]">
                  Tidak ada booking hari ini
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

