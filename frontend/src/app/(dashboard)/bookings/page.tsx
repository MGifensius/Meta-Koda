"use client";

import { useState, useEffect, useCallback } from "react";
import {
  Search,
  Plus,
  CalendarDays,
  Clock,
  Users as UsersIcon,
  MapPin,
  Phone,
  Loader2,
} from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
  DialogFooter,
  DialogClose,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { formatDate, statusBadge, tableStatusColor } from "@/lib/format";
import { apiFetch } from "@/lib/api-client";
import { bookingTimeSlots, deriveOperatingHours } from "@/lib/hours";
import { readCache, writeCache } from "@/lib/cached-state";
import { useAuth } from "@/lib/role-context";

/* ── types ── */

interface Booking {
  id: number;
  customer_id: number | null;
  date: string;
  time: string;
  party_size: number;
  table_id: number | null;
  status: string;
  guest_name: string;
  customer_phone: string;
  notes: string | null;
  seating: string;
  confirmation_state?: "pending" | "sent" | "confirmed" | "declined";
  confirmation_sent_at?: string | null;
  reminder_sent_at?: string | null;
  customers?: { name: string } | null;
}

const CONFIRMATION_BADGE: Record<string, string> = {
  pending: "bg-stone-100 text-stone-600",
  sent: "bg-amber-50 text-amber-700",
  confirmed: "bg-emerald-50 text-emerald-700",
  declined: "bg-red-50 text-red-700",
};

const CONFIRMATION_LABEL: Record<string, string> = {
  pending: "Awaiting send",
  sent: "Sent · awaiting reply",
  confirmed: "Confirmed",
  declined: "Declined",
};

interface Table {
  id: number;
  capacity: number;
  zone: string;
  status: string;
}

interface Customer {
  id: number;
  name: string;
  phone: string;
}

/* ── page ── */

export default function BookingsPage() {
  const { tenantId } = useAuth();
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [bookings, setBookings] = useState<Booking[]>([]);
  const [tables, setTables] = useState<Table[]>([]);
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [loading, setLoading] = useState(true);
  const [openingHours, setOpeningHours] = useState<string>("11:00 - 22:00");

  // Hydrate caches when auth finishes (tenantId is null on first render).
  useEffect(() => {
    if (!tenantId) return;
    const cB = readCache<Booking[]>(`bookings:${tenantId}`);
    const cT = readCache<Table[]>(`pos_tables:${tenantId}`);
    const cC = readCache<Customer[]>(`customers:${tenantId}`);
    if (cB && cB.length > 0) {
      setBookings(cB);
      setLoading(false);
    }
    if (cT && cT.length > 0) setTables(cT);
    if (cC && cC.length > 0) setCustomers(cC);
  }, [tenantId]);
  const hours = deriveOperatingHours(openingHours);
  const timeSlots = bookingTimeSlots(openingHours);

  /* ── form state ── */
  const [formOpen, setFormOpen] = useState(false);
  const [formBusy, setFormBusy] = useState(false);
  const [form, setForm] = useState({
    guest_name: "",
    customer_phone: "",
    customer_id: "",
    date: new Date().toISOString().split("T")[0],
    time: "19:00",
    party_size: 2,
    seating: "indoor",
    table_id: "",
    notes: "",
  });

  /* ── data fetching ── */

  const fetchAll = useCallback(async () => {
    try {
      const [bRes, tRes] = await Promise.all([
        apiFetch("/bookings/"),
        apiFetch("/pos/tables"),
      ]);
      const bData = await bRes.json();
      const tData = await tRes.json();
      setBookings(bData);
      setTables(tData);
      if (tenantId) {
        writeCache(`bookings:${tenantId}`, bData);
        writeCache(`pos_tables:${tenantId}`, tData);
      }
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  }, [tenantId]);

  const fetchCustomers = useCallback(async () => {
    try {
      const res = await apiFetch("/customers/");
      const data = await res.json();
      setCustomers(data);
      if (tenantId) writeCache(`customers:${tenantId}`, data);
    } catch (err) {
      console.error(err);
    }
  }, [tenantId]);

  useEffect(() => {
    // Gate on tenantId so the first fetch doesn't fire before the auth
    // token is cached (which would 401 and redirect to login).
    if (!tenantId) return;
    fetchAll();
    fetchCustomers();
    apiFetch("/settings")
      .then((r) => (r.ok ? r.json() : null))
      .then((s) => {
        if (s?.opening_hours) setOpeningHours(s.opening_hours);
      })
      .catch(() => undefined);
    // 3s polling — bookings is a live operational view, staff need new
    // reservations from the bot to land near-instantly during a service.
    const interval = setInterval(fetchAll, 3000);
    return () => clearInterval(interval);
  }, [tenantId, fetchAll, fetchCustomers]);

  /* ── actions ── */

  const doAction = async (
    bookingId: number,
    action:
      | "checkin"
      | "done"
      | "cancel"
      | "noshow"
      | "confirm"
      | "decline"
      | "resend-confirmation"
  ) => {
    try {
      await apiFetch(`/bookings/${bookingId}/${action}`, { method: "POST" });
      await fetchAll();
    } catch (err) {
      console.error(err);
    }
  };

  /* ── create booking ── */

  const createBooking = async () => {
    setFormBusy(true);
    try {
      await apiFetch("/bookings/", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          customer_id: form.customer_id ? Number(form.customer_id) : null,
          date: form.date,
          time: form.time,
          party_size: form.party_size,
          table_id: form.table_id ? Number(form.table_id) : null,
          guest_name: form.guest_name,
          customer_phone: form.customer_phone,
          notes: form.notes || null,
          seating: form.seating,
        }),
      });
      await fetchAll();
      setFormOpen(false);
      setForm({
        guest_name: "",
        customer_phone: "",
        customer_id: "",
        date: new Date().toISOString().split("T")[0],
        time: "19:00",
        party_size: 2,
        seating: "indoor",
        table_id: "",
        notes: "",
      });
    } catch (err) {
      console.error(err);
    } finally {
      setFormBusy(false);
    }
  };

  /* ── derived data ── */

  const TODAY = new Date().toISOString().split("T")[0];

  const guestName = (b: Booking) =>
    b.customers?.name || b.guest_name || "Walk-in";

  const filtered = bookings.filter((b) => {
    const name = guestName(b).toLowerCase();
    const matchSearch =
      name.includes(search.toLowerCase()) ||
      b.customer_phone.includes(search) ||
      String(b.table_id).toLowerCase().includes(search.toLowerCase());
    const matchStatus =
      statusFilter === "all" ? true : b.status === statusFilter;
    return matchSearch && matchStatus;
  });

  // Upcoming = today onwards. Past dates only show in the "Semua" tab.
  const upcomingBookings = filtered.filter((b) => b.date >= TODAY);

  // Group by date so the list reads as "Hari Ini → Besok → Lusa → ..."
  // with each day's bookings sorted by time. `asc=true` puts the
  // nearest date first (Mendatang); `false` puts most-recent first
  // (Semua, where past bookings flow downward).
  const groupByDate = (
    rows: Booking[],
    asc: boolean,
  ): { date: string; items: Booking[] }[] => {
    const map = new Map<string, Booking[]>();
    for (const b of rows) {
      const arr = map.get(b.date) ?? [];
      arr.push(b);
      map.set(b.date, arr);
    }
    for (const arr of map.values()) {
      arr.sort((a, b) => a.time.localeCompare(b.time));
    }
    return Array.from(map.entries())
      .sort(([a], [b]) => (asc ? a.localeCompare(b) : b.localeCompare(a)))
      .map(([date, items]) => ({ date, items }));
  };

  const dateLabel = (iso: string): string => {
    const tomorrowIso = new Date(Date.now() + 24 * 60 * 60 * 1000)
      .toISOString()
      .split("T")[0];
    if (iso === TODAY) return "Hari Ini";
    if (iso === tomorrowIso) return "Besok";
    return formatDate(iso);
  };

  const reservedCount = bookings.filter((b) => b.status === "reserved").length;
  const occupiedCount = bookings.filter((b) => b.status === "occupied").length;
  const todayCount = bookings.filter((b) => b.date === TODAY).length;

  const stats = [
    { value: String(bookings.length), label: "Total Booking" },
    { value: String(todayCount), label: "Hari Ini" },
    { value: String(reservedCount), label: "Reserved" },
    { value: String(occupiedCount), label: "Occupied" },
  ];

  /* ── BookingCard ── */

  function BookingCard({ booking }: { booking: Booking }) {
    return (
      <div className="border border-border rounded-xl bg-card p-4 space-y-2">
        <div className="flex items-center justify-between">
          <p className="text-[13px] font-medium">{guestName(booking)}</p>
          <div className="flex items-center gap-1.5">
            {booking.confirmation_state &&
              booking.status !== "done" &&
              booking.status !== "cancelled" &&
              booking.status !== "no_show" && (
                <span
                  className={`text-[10px] font-medium px-1.5 py-0.5 rounded ${
                    CONFIRMATION_BADGE[booking.confirmation_state] ?? ""
                  }`}
                  title={
                    booking.confirmation_sent_at
                      ? `Confirmation sent ${new Date(booking.confirmation_sent_at).toLocaleString()}`
                      : undefined
                  }
                >
                  {CONFIRMATION_LABEL[booking.confirmation_state] ?? booking.confirmation_state}
                </span>
              )}
            <span
              className={`text-[11px] font-medium px-2 py-0.5 rounded capitalize ${statusBadge(
                booking.status
              )}`}
            >
              {booking.status}
            </span>
          </div>
        </div>
        <div className="flex items-center gap-4 text-[13px] text-muted-foreground">
          <span className="flex items-center gap-1">
            <CalendarDays className="size-3.5" />
            {formatDate(booking.date)}
          </span>
          <span className="flex items-center gap-1">
            <Clock className="size-3.5" />
            {booking.time}
          </span>
          <span className="flex items-center gap-1">
            <UsersIcon className="size-3.5" />
            {booking.party_size}
          </span>
        </div>
        <div className="flex items-center gap-4 text-[13px] text-muted-foreground">
          <span>Meja {booking.table_id ?? "-"}</span>
          <span className="flex items-center gap-1 capitalize">
            <MapPin className="size-3.5" />
            {booking.seating}
          </span>
          <span className="flex items-center gap-1">
            <Phone className="size-3.5" />
            {booking.customer_phone}
          </span>
        </div>
        {booking.notes && (
          <p className="text-[12px] text-muted-foreground italic">
            {booking.notes}
          </p>
        )}
        {/* Action buttons */}
        <div className="flex items-center gap-2 pt-1">
          {booking.status === "reserved" && (
            <>
              <Button
                size="sm"
                className="text-[12px] h-7"
                onClick={() => doAction(booking.id, "checkin")}
              >
                Check In
              </Button>
              {booking.confirmation_state !== "confirmed" && (
                <Button
                  variant="outline"
                  size="sm"
                  className="text-[12px] h-7"
                  onClick={() => doAction(booking.id, "confirm")}
                  title="Mark as confirmed (replied YA on WhatsApp)"
                >
                  Confirmed
                </Button>
              )}
              <Button
                variant="outline"
                size="sm"
                className="text-[12px] h-7"
                onClick={() => doAction(booking.id, "resend-confirmation")}
              >
                Resend
              </Button>
              <Button
                variant="outline"
                size="sm"
                className="text-[12px] h-7"
                onClick={() => doAction(booking.id, "noshow")}
              >
                No Show
              </Button>
              <Button
                variant="outline"
                size="sm"
                className="text-[12px] h-7"
                onClick={() => doAction(booking.id, "cancel")}
              >
                Cancel
              </Button>
            </>
          )}
          {booking.status === "occupied" && (
            <Button
              size="sm"
              className="text-[12px] h-7"
              onClick={() => doAction(booking.id, "done")}
            >
              Done
            </Button>
          )}
        </div>
      </div>
    );
  }

  /* ── render ── */

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="size-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-lg font-semibold">Bookings</h1>
        <div className="flex items-center gap-2">
          <div className="relative">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 size-4 text-muted-foreground" />
            <Input
              placeholder="Cari booking..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-8 w-56"
            />
          </div>
          <Select
            value={statusFilter}
            onValueChange={(v) => setStatusFilter(v ?? "all")}
          >
            <SelectTrigger>
              <SelectValue placeholder="Status">
                {(v: string | null) =>
                  ({
                    all: "Semua Status",
                    reserved: "Reserved",
                    occupied: "Occupied",
                    done: "Done",
                    cancelled: "Cancelled",
                    no_show: "No Show",
                  }[v || ""] ?? v)
                }
              </SelectValue>
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Semua Status</SelectItem>
              <SelectItem value="reserved">Reserved</SelectItem>
              <SelectItem value="occupied">Occupied</SelectItem>
              <SelectItem value="done">Done</SelectItem>
              <SelectItem value="cancelled">Cancelled</SelectItem>
              <SelectItem value="no_show">No Show</SelectItem>
            </SelectContent>
          </Select>
          <Dialog open={formOpen} onOpenChange={setFormOpen}>
            <DialogTrigger render={<Button className="rounded-md h-9 px-3 gap-1.5 text-[13px]" />}>
              <Plus className="size-4" /> Booking Baru
            </DialogTrigger>
            <DialogContent className="sm:max-w-md">
              <DialogHeader>
                <DialogTitle>Buat Booking Baru</DialogTitle>
              </DialogHeader>
              <div className="space-y-3">
                <div className="space-y-1.5">
                  <Label>Customer (opsional)</Label>
                  <Select
                    value={form.customer_id}
                    onValueChange={(v) => {
                      const val = v ?? "";
                      setForm((f) => ({ ...f, customer_id: val }));
                      const cust = customers.find((c) => String(c.id) === val);
                      if (cust) {
                        setForm((f) => ({
                          ...f,
                          guest_name: cust.name,
                          customer_phone: cust.phone,
                        }));
                      }
                    }}
                  >
                    <SelectTrigger className="w-full">
                      <SelectValue placeholder="Pilih customer...">
                        {(v: string | null) =>
                          customers.find((c) => String(c.id) === v)?.name ?? v
                        }
                      </SelectValue>
                    </SelectTrigger>
                    <SelectContent>
                      {customers.map((c) => (
                        <SelectItem key={c.id} value={String(c.id)}>
                          {c.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1.5">
                  <Label>Nama Tamu</Label>
                  <Input
                    placeholder="Nama tamu"
                    value={form.guest_name}
                    onChange={(e) =>
                      setForm((f) => ({ ...f, guest_name: e.target.value }))
                    }
                  />
                </div>
                <div className="space-y-1.5">
                  <Label>Telepon</Label>
                  <Input
                    placeholder="+628..."
                    value={form.customer_phone}
                    onChange={(e) =>
                      setForm((f) => ({
                        ...f,
                        customer_phone: e.target.value,
                      }))
                    }
                  />
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1.5">
                    <Label>Tanggal</Label>
                    <Input
                      type="date"
                      value={form.date}
                      onChange={(e) =>
                        setForm((f) => ({ ...f, date: e.target.value }))
                      }
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label>Jam</Label>
                    <Select
                      value={form.time}
                      onValueChange={(v) =>
                        setForm((f) => ({ ...f, time: v ?? timeSlots[0] }))
                      }
                    >
                      <SelectTrigger className="w-full">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {timeSlots.map((t) => (
                          <SelectItem key={t} value={t}>
                            {t}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <p className="text-[10px] text-muted-foreground">
                      Buka {hours.hoursStr} · last order {hours.lastOrderStr} ·
                      reservasi terakhir {hours.lastBookingStr}
                    </p>
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1.5">
                    <Label>Jumlah Tamu</Label>
                    <Input
                      type="number"
                      value={form.party_size}
                      min={1}
                      onChange={(e) =>
                        setForm((f) => ({
                          ...f,
                          party_size: Number(e.target.value) || 1,
                        }))
                      }
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label>Seating</Label>
                    <Select
                      value={form.seating}
                      onValueChange={(v) =>
                        setForm((f) => ({ ...f, seating: v ?? "indoor" }))
                      }
                    >
                      <SelectTrigger className="w-full">
                        <SelectValue>
                          {(v: string | null) =>
                            ({ indoor: "Indoor", outdoor: "Outdoor" }[v || ""] ?? v)
                          }
                        </SelectValue>
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="indoor">Indoor</SelectItem>
                        <SelectItem value="outdoor">Outdoor</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>
                <div className="space-y-1.5">
                  <Label>Meja</Label>
                  <Select
                    value={form.table_id}
                    onValueChange={(v) =>
                      setForm((f) => ({ ...f, table_id: v ?? "" }))
                    }
                  >
                    <SelectTrigger className="w-full">
                      <SelectValue placeholder="Pilih meja...">
                        {(v: string | null) => {
                          const t = tables.find((x) => String(x.id) === v);
                          return t ? `Meja ${t.id} (${t.zone}, ${t.capacity} pax)` : v;
                        }}
                      </SelectValue>
                    </SelectTrigger>
                    <SelectContent>
                      {tables
                        .filter((t) => t.status === "available")
                        .map((t) => (
                          <SelectItem key={t.id} value={String(t.id)}>
                            Meja {t.id} ({t.zone}, {t.capacity} pax)
                          </SelectItem>
                        ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1.5">
                  <Label>Catatan</Label>
                  <Textarea
                    placeholder="Catatan tambahan..."
                    value={form.notes}
                    onChange={(e) =>
                      setForm((f) => ({ ...f, notes: e.target.value }))
                    }
                  />
                </div>
              </div>
              <DialogFooter>
                <Button onClick={createBooking} disabled={formBusy}>
                  {formBusy && <Loader2 className="size-4 mr-1 animate-spin" />}
                  Simpan
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </div>
      </div>

      <div className="grid grid-cols-4 gap-4">
        {stats.map((s) => (
          <div
            key={s.label}
            className="rounded-xl border border-border bg-card px-5 py-4"
          >
            <p className="text-2xl font-semibold tracking-tight">{s.value}</p>
            <p className="text-[13px] text-muted-foreground">{s.label}</p>
          </div>
        ))}
      </div>

      <div className="grid grid-cols-[1fr_280px] gap-4">
        {/* Left: booking tabs */}
        <Tabs defaultValue="upcoming">
          <TabsList>
            <TabsTrigger value="upcoming">
              Mendatang ({upcomingBookings.length})
            </TabsTrigger>
            <TabsTrigger value="all">Semua ({filtered.length})</TabsTrigger>
          </TabsList>

          <TabsContent value="upcoming">
            {upcomingBookings.length === 0 ? (
              <p className="text-[13px] text-muted-foreground py-6 text-center">
                Tidak ada booking mendatang.
              </p>
            ) : (
              <div className="space-y-5">
                {groupByDate(upcomingBookings, true).map((group) => (
                  <div key={group.date} className="space-y-2">
                    <div className="flex items-baseline gap-2">
                      <h3 className="text-[13px] font-semibold">
                        {dateLabel(group.date)}
                      </h3>
                      <span className="text-[11px] text-muted-foreground">
                        {group.items.length} booking
                      </span>
                    </div>
                    <div className="grid grid-cols-2 gap-3">
                      {group.items.map((b) => (
                        <BookingCard key={b.id} booking={b} />
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </TabsContent>

          <TabsContent value="all">
            {filtered.length === 0 ? (
              <p className="text-[13px] text-muted-foreground py-6 text-center">
                Tidak ada booking ditemukan.
              </p>
            ) : (
              <div className="space-y-5">
                {groupByDate(filtered, false).map((group) => (
                  <div key={group.date} className="space-y-2">
                    <div className="flex items-baseline gap-2">
                      <h3 className="text-[13px] font-semibold">
                        {dateLabel(group.date)}
                      </h3>
                      <span className="text-[11px] text-muted-foreground">
                        {group.items.length} booking
                      </span>
                    </div>
                    <div className="grid grid-cols-2 gap-3">
                      {group.items.map((b) => (
                        <BookingCard key={b.id} booking={b} />
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </TabsContent>
        </Tabs>

        {/* Right: Floor plan */}
        <div className="border border-border rounded-xl bg-card p-4 space-y-3 h-fit">
          <h2 className="text-sm font-medium">Floor Plan</h2>
          <div className="grid grid-cols-2 gap-2">
            {tables.map((t) => (
              <div
                key={t.id}
                className={`border rounded-lg px-3 py-2.5 text-center ${tableStatusColor(
                  t.status
                )}`}
              >
                <p className="text-[13px] font-medium">Meja {t.id}</p>
                <p className="text-[11px] capitalize">{t.status}</p>
                <p className="text-[10px]">{t.zone}</p>
              </div>
            ))}
          </div>
          <div className="flex flex-wrap items-center gap-3 text-[11px] text-muted-foreground">
            <span className="flex items-center gap-1">
              <span className="size-2.5 rounded-full bg-green-400" /> Available
            </span>
            <span className="flex items-center gap-1">
              <span className="size-2.5 rounded-full bg-blue-400" /> Reserved
            </span>
            <span className="flex items-center gap-1">
              <span className="size-2.5 rounded-full bg-amber-400" /> Occupied
            </span>
            <span className="flex items-center gap-1">
              <span className="size-2.5 rounded-full bg-violet-400" /> Cleaning
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}
