"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Loader2,
  Receipt,
  Users as UsersIcon,
  Wallet,
  CheckCircle2,
  Sparkles,
  AlertCircle,
  UserCheck,
  UserPlus,
  Phone,
  Star,
} from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { apiFetch } from "@/lib/api-client";
import { formatCurrency, tableStatusColor } from "@/lib/format";
import { readCache, writeCache } from "@/lib/cached-state";
import { useAuth } from "@/lib/role-context";

type TableStatus = "available" | "reserved" | "occupied" | "cleaning";

type CustomerSummary = {
  id: string;
  name: string;
  phone: string;
  points: number;
  tier: string | null;
  is_member: boolean;
};

type Booking = {
  id: string;
  customer_id: string | null;
  guest_name: string | null;
  party_size: number | null;
  customers: CustomerSummary | null;
};

type RestaurantTable = {
  id: string | number;
  capacity: number;
  zone: string | null;
  status: TableStatus;
  current_booking_id: string | null;
  cleaning_until: string | null;
  booking: Booking | null;
};

type TodaySummary = {
  transaction_count: number;
  revenue_total: number;
  revenue_by_method: Record<string, number>;
  cover_count: number;
  avg_check: number;
};

const PAYMENT_METHODS: { slug: string; label: string }[] = [
  { slug: "cash", label: "Cash" },
  { slug: "qris", label: "QRIS" },
  { slug: "card", label: "Card" },
  { slug: "transfer", label: "Transfer" },
  { slug: "other", label: "Other" },
];

function formatNumberWithDots(n: string): string {
  // Indonesian-style thousand separators (1.234.567).
  const digits = n.replace(/\D/g, "");
  if (!digits) return "";
  return digits.replace(/\B(?=(\d{3})+(?!\d))/g, ".");
}

function parseAmount(s: string): number {
  return parseInt(s.replace(/\D/g, "") || "0", 10);
}

export default function FloorOperationPage() {
  const { tenantId } = useAuth();
  const [tables, setTables] = useState<RestaurantTable[]>([]);
  const [today, setToday] = useState<TodaySummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  // Hydrate from cache once auth resolves and tenantId is known. On
  // first render tenantId is still null (auth bootstrap is async), so
  // initial-state hydration would always miss. useEffect fires the tick
  // tenantId arrives, before the network fetch resolves.
  useEffect(() => {
    if (!tenantId) return;
    const cT = readCache<RestaurantTable[]>(`floor_tables:${tenantId}`);
    const cS = readCache<TodaySummary>(`floor_today:${tenantId}`);
    if (cT && cT.length > 0) {
      setTables(cT);
      setLoading(false);
    }
    if (cS) setToday(cS);
  }, [tenantId]);

  const [actionTable, setActionTable] = useState<RestaurantTable | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [actionError, setActionError] = useState("");

  // Settle form
  const [billInput, setBillInput] = useState("");
  const [billMethod, setBillMethod] = useState("cash");
  const [billCovers, setBillCovers] = useState("");
  const [billNotes, setBillNotes] = useState("");

  // Customer linking
  const [billPhone, setBillPhone] = useState("");
  const [billNewName, setBillNewName] = useState("");
  const [phoneMatch, setPhoneMatch] = useState<CustomerSummary | null>(null);
  const [lookupLoading, setLookupLoading] = useState(false);
  const [toast, setToast] = useState<string | null>(null);

  const fetchAll = useCallback(async () => {
    try {
      const [tRes, sRes] = await Promise.all([
        apiFetch("/floor/tables"),
        apiFetch("/floor/today"),
      ]);
      if (!tRes.ok) {
        setError(`Failed to load tables (${tRes.status})`);
        return;
      }
      const tablesData = await tRes.json();
      setTables(tablesData);
      if (tenantId) writeCache(`floor_tables:${tenantId}`, tablesData);
      if (sRes.ok) {
        const todayData = await sRes.json();
        setToday(todayData);
        if (tenantId) writeCache(`floor_today:${tenantId}`, todayData);
      }
      setError("");
    } catch {
      setError("Network error.");
    } finally {
      setLoading(false);
    }
  }, [tenantId]);

  useEffect(() => {
    // Gate on tenantId — same reason as inbox/bookings: avoid the
    // first-fetch 401 race during the auth bootstrap window.
    if (!tenantId) return;
    fetchAll();
    // 3s polling — floor is the live ops surface (cashier watching
    // table state during service). Slower polling makes table flips
    // (booking → seated → settle → cleaning) feel laggy.
    const id = setInterval(fetchAll, 3000);
    return () => clearInterval(id);
  }, [tenantId, fetchAll]);

  const grouped = useMemo(() => {
    const zones: Record<string, RestaurantTable[]> = {};
    for (const t of tables) {
      const z = t.zone || "Main";
      if (!zones[z]) zones[z] = [];
      zones[z].push(t);
    }
    return zones;
  }, [tables]);

  const openTable = (t: RestaurantTable) => {
    setActionTable(t);
    setActionError("");
    setBillInput("");
    setBillMethod("cash");
    setBillCovers("");
    setBillNotes("");
    setBillPhone("");
    setBillNewName("");
    setPhoneMatch(null);
  };

  // Live phone lookup (debounced 350ms) for the settle modal — only for
  // walk-ins (no booking). Booked tables already know the customer.
  useEffect(() => {
    if (!actionTable || actionTable.status !== "occupied") return;
    if (actionTable.booking?.customers) return;
    if (billPhone.trim().length < 4) {
      setPhoneMatch(null);
      return;
    }
    setLookupLoading(true);
    const handle = setTimeout(async () => {
      try {
        const res = await apiFetch(
          `/floor/customers/lookup?phone=${encodeURIComponent(billPhone.trim())}`,
        );
        if (!res.ok) {
          setPhoneMatch(null);
          return;
        }
        const j = await res.json();
        setPhoneMatch(j.customer ?? null);
        // Existing member found → clear any half-typed new-customer name
        // so we don't accidentally try to register on settle.
        if (j.customer) setBillNewName("");
      } catch {
        setPhoneMatch(null);
      } finally {
        setLookupLoading(false);
      }
    }, 350);
    return () => clearTimeout(handle);
  }, [billPhone, actionTable]);

  const closeAction = () => {
    if (submitting) return;
    setActionTable(null);
  };

  const callAction = async (path: string, body?: object) => {
    if (!actionTable) return;
    setSubmitting(true);
    setActionError("");
    try {
      const res = await apiFetch(`/floor/tables/${actionTable.id}${path}`, {
        method: "POST",
        body: body ? JSON.stringify(body) : undefined,
      });
      if (!res.ok) {
        const j = await res.json().catch(() => ({} as { detail?: string }));
        setActionError(j.detail || `HTTP ${res.status}`);
        return;
      }
      await fetchAll();
      setActionTable(null);
    } catch {
      setActionError("Network error.");
    } finally {
      setSubmitting(false);
    }
  };

  const submitSettle = async () => {
    if (!actionTable) return;
    const amount = parseAmount(billInput);
    if (amount <= 0) {
      setActionError("Enter the bill total.");
      return;
    }
    // Phone is the customer's unique ID — required for walk-ins. Booked
    // tables already have it from the customer record on the booking.
    const isWalkIn = !actionTable.booking?.customers;
    if (isWalkIn && billPhone.trim().length < 4) {
      setActionError(
        "Customer phone is required. Ask the customer for their number — it's used for member lookup and points.",
      );
      return;
    }
    // Phone unmatched + no name → block. The UI surfaces a "siapa namanya?"
    // input the moment phoneMatch goes null with a phone of length ≥4.
    const wantsRegister =
      isWalkIn && billPhone.trim().length >= 4 && !phoneMatch;
    if (wantsRegister && !billNewName.trim()) {
      setActionError(
        "Customer baru — isi nama dulu ya sebelum settle (nomor belum terdaftar).",
      );
      return;
    }
    setSubmitting(true);
    setActionError("");
    try {
      const res = await apiFetch(`/floor/tables/${actionTable.id}/settle`, {
        method: "POST",
        body: JSON.stringify({
          amount,
          payment_method: billMethod,
          cover_count: billCovers ? parseInt(billCovers, 10) : null,
          notes: billNotes.trim() || null,
          customer_phone: billPhone.trim() || null,
          // Auto-register when the phone wasn't found AND the cashier
          // typed a name — no manual checkbox.
          customer_name: wantsRegister ? billNewName.trim() : null,
          register_new: wantsRegister,
        }),
      });
      if (!res.ok) {
        const j = await res.json().catch(() => ({} as { detail?: string }));
        setActionError(j.detail || `HTTP ${res.status}`);
        return;
      }
      const j = await res.json();
      const cust = j.customer as CustomerSummary | null;
      if (cust && j.points_awarded > 0) {
        setToast(
          `+${j.points_awarded} pts → ${cust.name} (now ${cust.points})`,
        );
      } else {
        setToast("Bill settled");
      }
      setTimeout(() => setToast(null), 3500);
      await fetchAll();
      setActionTable(null);
    } catch {
      setActionError("Network error.");
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20 text-muted-foreground">
        <Loader2 className="size-5 animate-spin mr-2" /> Loading floor…
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Header + summary */}
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div>
          <h1 className="text-lg font-semibold">Floor Operation</h1>
          <p className="text-[12px] text-muted-foreground">
            Click an occupied table to enter the total bill and settle.
          </p>
        </div>
        {today && (
          <div className="flex items-stretch gap-2">
            <SummaryStat
              label="Today's revenue"
              value={formatCurrency(today.revenue_total)}
              icon={<Wallet className="size-4" />}
            />
            <SummaryStat
              label="Bills settled"
              value={String(today.transaction_count)}
              icon={<Receipt className="size-4" />}
            />
            <SummaryStat
              label="Avg check"
              value={today.transaction_count ? formatCurrency(today.avg_check) : "—"}
              icon={<UsersIcon className="size-4" />}
            />
          </div>
        )}
      </div>

      {error && (
        <div className="border border-red-200 bg-red-50 text-red-700 rounded-md px-3 py-2 text-[13px] flex items-center gap-2">
          <AlertCircle className="size-4" /> {error}
        </div>
      )}

      {/* Floor plan grouped by zone — clean grid; configurable in Settings → Tables. */}
      {Object.entries(grouped).length === 0 ? (
        <div className="border rounded-xl bg-card p-8 text-center text-muted-foreground">
          No tables configured yet. Add some in Settings → Tables.
        </div>
      ) : (
        Object.entries(grouped).map(([zone, list]) => (
          <div key={zone} className="border rounded-xl bg-card p-4">
            <div className="text-[11px] font-mono-label uppercase tracking-wider ink-3 mb-3">
              {zone}{" "}
              <span className="ml-2 normal-case tracking-normal text-muted-foreground">
                {list.length} {list.length === 1 ? "meja" : "meja"}
              </span>
            </div>
            <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-6 lg:grid-cols-8 gap-2.5">
              {list.map((t) => (
                <button
                  key={t.id}
                  type="button"
                  onClick={() => openTable(t)}
                  className={`text-left border-2 rounded-lg px-2.5 py-2 transition-all hover:shadow-sm ${tableStatusColor(t.status)}`}
                >
                  <div className="text-[15px] font-semibold leading-tight">
                    {t.id}
                  </div>
                  <div className="mt-0.5 text-[11px] opacity-80">
                    {t.capacity} pax
                  </div>
                </button>
              ))}
            </div>
          </div>
        ))
      )}

      {/* Floating success toast */}
      {toast && (
        <div className="fixed bottom-6 right-6 z-50 border border-emerald-300 bg-emerald-50 text-emerald-900 rounded-md shadow-lg px-4 py-2.5 text-[13px] inline-flex items-center gap-2">
          <CheckCircle2 className="size-4 text-emerald-700" />
          {toast}
        </div>
      )}

      {/* Action dialog — content depends on table.status */}
      <Dialog open={!!actionTable} onOpenChange={(o) => !o && closeAction()}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              Table T{actionTable?.id}
              {actionTable && (
                <span
                  className={`text-[11px] font-medium px-2 py-0.5 rounded-full border ${tableStatusColor(actionTable.status)}`}
                >
                  {actionTable.status}
                </span>
              )}
            </DialogTitle>
          </DialogHeader>

          {actionTable?.status === "occupied" && (
            <div className="space-y-3">
              <div>
                <Label>Total Bill</Label>
                <div className="relative">
                  <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground text-[13px]">
                    Rp
                  </span>
                  <Input
                    inputMode="numeric"
                    value={formatNumberWithDots(billInput)}
                    onChange={(e) => setBillInput(e.target.value)}
                    placeholder="0"
                    className="pl-9 text-lg font-medium"
                    autoFocus
                  />
                </div>
              </div>
              <div>
                <Label className="mb-1.5 block">Payment Method</Label>
                <div className="flex flex-wrap gap-1.5">
                  {PAYMENT_METHODS.map((p) => (
                    <button
                      key={p.slug}
                      type="button"
                      onClick={() => setBillMethod(p.slug)}
                      className={`px-3 py-1.5 rounded-full border text-[12px] transition-colors ${
                        billMethod === p.slug
                          ? "bg-primary text-primary-foreground border-primary"
                          : "bg-secondary/40 border-border hover:bg-secondary/70"
                      }`}
                    >
                      {p.label}
                    </button>
                  ))}
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label>Diners (optional)</Label>
                  <Input
                    type="number"
                    min={1}
                    value={billCovers}
                    onChange={(e) => setBillCovers(e.target.value)}
                    placeholder={String(actionTable.capacity)}
                  />
                </div>
                <div>
                  <Label>Notes (optional)</Label>
                  <Input
                    value={billNotes}
                    onChange={(e) => setBillNotes(e.target.value)}
                    placeholder="—"
                  />
                </div>
              </div>

              {/* Customer / loyalty section */}
              {actionTable.booking?.customers ? (
                <div className="border rounded-md bg-emerald-50/60 border-emerald-200 px-3 py-2">
                  <div className="flex items-center gap-2 text-[12px]">
                    <UserCheck className="size-4 text-emerald-700" />
                    <span className="font-medium">
                      {actionTable.booking.customers.name}
                    </span>
                    <span className="text-muted-foreground">
                      · {actionTable.booking.customers.phone}
                    </span>
                  </div>
                  <div className="mt-1 flex items-center gap-3 text-[11px] text-muted-foreground">
                    <span className="inline-flex items-center gap-1">
                      <Star className="size-3" />
                      {actionTable.booking.customers.points} pts ·{" "}
                      {actionTable.booking.customers.tier ?? "Non-member"}
                    </span>
                    {parseAmount(billInput) > 0 && (
                      <span className="text-emerald-700 font-medium">
                        +{Math.floor(parseAmount(billInput) / 10000)} pts on settle
                      </span>
                    )}
                  </div>
                </div>
              ) : (
                <div className="border rounded-md bg-secondary/30 px-3 py-2 space-y-2">
                  <Label className="flex items-center gap-1.5 text-[12px]">
                    <Phone className="size-3.5" />
                    Customer phone <span className="text-red-600">*</span>
                  </Label>
                  <Input
                    inputMode="tel"
                    value={billPhone}
                    onChange={(e) => setBillPhone(e.target.value)}
                    placeholder="08xxxxxxxxxx"
                    required
                    autoFocus={false}
                  />
                  <p className="text-[11px] text-muted-foreground">
                    Phone is the customer's unique ID across the platform.
                    Required for walk-ins — used to look up members or attach
                    points.
                  </p>
                  {lookupLoading && (
                    <p className="text-[11px] text-muted-foreground inline-flex items-center gap-1">
                      <Loader2 className="size-3 animate-spin" /> Looking up…
                    </p>
                  )}
                  {!lookupLoading && phoneMatch && (
                    <div className="flex items-center justify-between text-[12px]">
                      <span className="inline-flex items-center gap-1.5 text-emerald-700">
                        <UserCheck className="size-3.5" />
                        <span className="font-medium">{phoneMatch.name}</span>
                        <span className="text-muted-foreground">
                          · {phoneMatch.points} pts · {phoneMatch.tier ?? "—"}
                        </span>
                      </span>
                      {parseAmount(billInput) > 0 && (
                        <span className="text-emerald-700 font-medium">
                          +{Math.floor(parseAmount(billInput) / 10000)} pts
                        </span>
                      )}
                    </div>
                  )}
                  {!lookupLoading &&
                    !phoneMatch &&
                    billPhone.trim().length >= 4 && (
                      <div className="space-y-1.5">
                        <Label className="flex items-center gap-1.5 text-[12px]">
                          <UserPlus className="size-3.5 text-muted-foreground" />
                          Customer baru — siapa namanya?
                        </Label>
                        <Input
                          value={billNewName}
                          onChange={(e) => setBillNewName(e.target.value)}
                          placeholder="Nama lengkap"
                        />
                        <p className="text-[11px] text-muted-foreground">
                          Nomor belum terdaftar — kami daftarkan otomatis sebagai
                          member baru begitu nama diisi.
                        </p>
                      </div>
                    )}
                </div>
              )}
            </div>
          )}

          {actionTable?.status === "available" && (
            <p className="text-[13px] text-muted-foreground">
              This table is free. Seat a walk-in customer to start a session.
            </p>
          )}

          {actionTable?.status === "reserved" && (
            <p className="text-[13px] text-muted-foreground">
              This table has an upcoming booking. Mark as Occupied when the
              guests arrive.
            </p>
          )}

          {actionTable?.status === "cleaning" && (
            <p className="text-[13px] text-muted-foreground">
              Cleaning in progress. The table auto-releases when the timer
              elapses, or you can mark it available now.
            </p>
          )}

          {actionError && (
            <p className="text-[12px] text-red-600 flex items-start gap-1.5">
              <AlertCircle className="size-3.5 mt-0.5 shrink-0" />
              <span>{actionError}</span>
            </p>
          )}

          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={closeAction} disabled={submitting}>
              Close
            </Button>

            {actionTable?.status === "available" && (
              <Button onClick={() => callAction("/seat")} disabled={submitting}>
                {submitting && <Loader2 className="size-4 mr-1.5 animate-spin" />}
                Seat Walk-in
              </Button>
            )}
            {actionTable?.status === "reserved" && (
              <Button onClick={() => callAction("/seat")} disabled={submitting}>
                {submitting && <Loader2 className="size-4 mr-1.5 animate-spin" />}
                Seat Customer
              </Button>
            )}
            {actionTable?.status === "occupied" &&
              (() => {
                const isWalkIn = !actionTable.booking?.customers;
                const phoneOk = !isWalkIn || billPhone.trim().length >= 4;
                const amountOk = parseAmount(billInput) > 0;
                // Phone unmatched + no name yet → can't submit; the
                // backend will reject anyway and we'd lose the bill.
                const wantsRegister =
                  isWalkIn && billPhone.trim().length >= 4 && !phoneMatch;
                const nameOk = !wantsRegister || !!billNewName.trim();
                const canSubmit = phoneOk && amountOk && nameOk && !submitting;
                return (
                  <Button onClick={submitSettle} disabled={!canSubmit}>
                    {submitting && (
                      <Loader2 className="size-4 mr-1.5 animate-spin" />
                    )}
                    <CheckCircle2 className="size-4 mr-1" />
                    Settle Bill
                  </Button>
                );
              })()}
            {actionTable?.status === "cleaning" && (
              <Button onClick={() => callAction("/clean")} disabled={submitting}>
                {submitting && <Loader2 className="size-4 mr-1.5 animate-spin" />}
                <Sparkles className="size-4 mr-1" />
                Mark Available
              </Button>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function SummaryStat({
  label,
  value,
  icon,
}: {
  label: string;
  value: string;
  icon: React.ReactNode;
}) {
  return (
    <div className="border rounded-lg bg-card px-3 py-2 min-w-32">
      <div className="flex items-center gap-1.5 text-[10px] font-mono-label uppercase tracking-wider ink-3">
        {icon}
        <span>{label}</span>
      </div>
      <div className="text-[15px] font-semibold mt-0.5">{value}</div>
    </div>
  );
}
