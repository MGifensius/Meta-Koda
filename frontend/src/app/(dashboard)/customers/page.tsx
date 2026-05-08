"use client";

import { useState, useEffect, useCallback } from "react";
import { Search, Plus, Phone, Trash2 } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
  DialogFooter,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { formatNumber, formatDate } from "@/lib/format";
import { apiFetch } from "@/lib/api-client";
import { readCache, writeCache } from "@/lib/cached-state";
import { useAuth } from "@/lib/role-context";

// Customers V1 surface — name, phone, visit count, last visit. Tier /
// points / total_spent / membership are still tracked server-side
// (loyalty stays plumbed into the floor settle path) but aren't shown
// in the UI for the launch scope.
type Customer = {
  id: string;
  name: string;
  phone: string;
  total_visits: number;
  last_visit: string | null;
};

export default function CustomersPage() {
  const { tenantId } = useAuth();
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [search, setSearch] = useState("");
  const [selectedCustomer, setSelectedCustomer] = useState<Customer | null>(null);
  const [showAddDialog, setShowAddDialog] = useState(false);
  const [newName, setNewName] = useState("");
  const [newPhone, setNewPhone] = useState("");

  // Hydrate from cache when auth finishes (tenantId arrives a tick
  // after first render — initial-state hydration would miss it).
  useEffect(() => {
    if (!tenantId) return;
    const cached = readCache<Customer[]>(`customers:${tenantId}`);
    if (cached && cached.length > 0) setCustomers(cached);
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
    if (!tenantId) return;
    fetchCustomers();
  }, [tenantId, fetchCustomers]);

  // Auto-select first customer if none selected
  useEffect(() => {
    if (!selectedCustomer && customers.length > 0) {
      setSelectedCustomer(customers[0]);
    }
  }, [customers, selectedCustomer]);

  const addCustomer = async () => {
    if (!newName.trim() || !newPhone.trim()) return;
    try {
      await apiFetch("/customers/", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: newName,
          phone: newPhone,
          tags: [],
          is_member: false,
        }),
      });
      await fetchCustomers();
      setNewName("");
      setNewPhone("");
      setShowAddDialog(false);
    } catch (err) {
      console.error(err);
    }
  };

  const deleteCustomer = async (customerId: string) => {
    if (!confirm("Hapus customer ini? Data tidak bisa dikembalikan.")) return;
    try {
      await apiFetch(`/customers/${customerId}`, { method: "DELETE" });
      if (selectedCustomer?.id === customerId) setSelectedCustomer(null);
      await fetchCustomers();
    } catch (err) {
      console.error(err);
    }
  };

  const filtered = customers.filter(
    (c) =>
      c.name.toLowerCase().includes(search.toLowerCase()) ||
      c.phone.includes(search)
  );

  const totalVisits = customers.reduce(
    (s, c) => s + (c.total_visits || 0),
    0,
  );
  const repeatCount = customers.filter((c) => (c.total_visits || 0) >= 2).length;

  const stats = [
    { value: formatNumber(customers.length), label: "Total Customer" },
    { value: formatNumber(totalVisits), label: "Total Kunjungan" },
    { value: formatNumber(repeatCount), label: "Repeat Customer" },
  ];

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-lg font-semibold">Customers</h1>
        <div className="flex items-center gap-2">
          <div className="relative">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 size-4 text-muted-foreground" />
            <Input
              placeholder="Cari nama atau telepon..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-8 w-64"
            />
          </div>
          <Dialog open={showAddDialog} onOpenChange={setShowAddDialog}>
            <DialogTrigger render={<Button className="rounded-md h-9 px-3 gap-1.5 text-[13px]" />}>
              <Plus className="size-4" /> Tambah Customer
            </DialogTrigger>
            <DialogContent className="sm:max-w-md">
              <DialogHeader>
                <DialogTitle>Tambah Customer Baru</DialogTitle>
              </DialogHeader>
              <div className="space-y-3">
                <div className="space-y-1.5">
                  <Label>Nama</Label>
                  <Input placeholder="Nama lengkap" value={newName} onChange={(e) => setNewName(e.target.value)} />
                </div>
                <div className="space-y-1.5">
                  <Label>Telepon</Label>
                  <Input placeholder="+628..." value={newPhone} onChange={(e) => setNewPhone(e.target.value)} />
                </div>
              </div>
              <DialogFooter>
                <Button onClick={addCustomer} disabled={!newName.trim() || !newPhone.trim()}>
                  Simpan
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </div>
      </div>

      <div className="grid grid-cols-3 gap-4">
        {stats.map((s) => (
          <div key={s.label} className="rounded-xl border bg-card px-5 py-4">
            <p className="text-2xl font-semibold tracking-tight">{s.value}</p>
            <p className="text-[13px] text-muted-foreground">{s.label}</p>
          </div>
        ))}
      </div>

      <div className="grid grid-cols-[1fr_320px] gap-4">
        <div className="border rounded-xl bg-card">
          <table className="w-full">
            <thead>
              <tr className="border-b">
                <th className="text-left text-[12px] text-muted-foreground font-medium px-4 py-2.5">Nama</th>
                <th className="text-left text-[12px] text-muted-foreground font-medium px-4 py-2.5">Telepon</th>
                <th className="text-right text-[12px] text-muted-foreground font-medium px-4 py-2.5">Kunjungan</th>
                <th className="text-right text-[12px] text-muted-foreground font-medium px-4 py-2.5">Last Visit</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((c) => (
                <tr
                  key={c.id}
                  className={`border-b last:border-0 hover:bg-muted/50 cursor-pointer text-[13px] transition-colors ${
                    selectedCustomer?.id === c.id ? "bg-muted/50" : ""
                  }`}
                  onClick={() => setSelectedCustomer(c)}
                >
                  <td className="px-4 py-2.5 font-medium">{c.name}</td>
                  <td className="px-4 py-2.5 text-muted-foreground">{c.phone}</td>
                  <td className="px-4 py-2.5 text-right">{formatNumber(c.total_visits || 0)}</td>
                  <td className="px-4 py-2.5 text-right text-muted-foreground">
                    {c.last_visit ? formatDate(c.last_visit) : "—"}
                  </td>
                </tr>
              ))}
              {filtered.length === 0 && (
                <tr>
                  <td colSpan={4} className="px-4 py-8 text-center text-[13px] text-muted-foreground">
                    Tidak ada customer ditemukan.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        <div className="border rounded-xl bg-card p-5">
          {selectedCustomer ? (
            <div className="space-y-5">
              <div>
                <h2 className="text-sm font-medium">{selectedCustomer.name}</h2>
                <p className="text-[12px] text-muted-foreground inline-flex items-center gap-1.5 mt-0.5">
                  <Phone className="size-3.5" />
                  {selectedCustomer.phone}
                </p>
              </div>

              <div className="grid grid-cols-2 gap-3 text-[13px]">
                <div>
                  <p className="text-muted-foreground">Total Kunjungan</p>
                  <p className="font-medium">{selectedCustomer.total_visits || 0}</p>
                </div>
                <div>
                  <p className="text-muted-foreground">Last Visit</p>
                  <p className="font-medium">
                    {selectedCustomer.last_visit
                      ? formatDate(selectedCustomer.last_visit)
                      : "—"}
                  </p>
                </div>
              </div>

              <div className="pt-2 border-t">
                <Button
                  variant="outline"
                  size="sm"
                  className="w-full text-red-600 hover:text-red-700 hover:bg-red-50"
                  onClick={() => deleteCustomer(selectedCustomer.id)}
                >
                  <Trash2 className="size-3.5 mr-1" /> Hapus Customer
                </Button>
              </div>
            </div>
          ) : (
            <p className="text-[13px] text-muted-foreground text-center py-8">
              Pilih customer untuk melihat detail.
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
