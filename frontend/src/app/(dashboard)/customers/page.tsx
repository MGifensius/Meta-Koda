"use client";

import { useState, useEffect, useCallback } from "react";
import { Search, Plus, Phone, Mail, Star, Tag, Trash2 } from "lucide-react";
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
import { Switch } from "@/components/ui/switch";
import {
  formatCurrency,
  formatNumber,
  formatDate,
  tierBadge,
} from "@/lib/format";
import { apiFetch } from "@/lib/api-client";
import { readCache, writeCache } from "@/lib/cached-state";
import { useAuth } from "@/lib/role-context";

type Customer = {
  id: string;
  name: string;
  phone: string;
  email: string | null;
  points: number;
  total_visits: number;
  total_spent: number;
  tier: string;
  is_member: boolean;
  joined_at: string;
  last_visit: string | null;
  tags: string[];
};

export default function CustomersPage() {
  const { tenantId } = useAuth();
  const cachedCustomers =
    typeof window !== "undefined" && tenantId
      ? readCache<Customer[]>(`customers:${tenantId}`)
      : null;

  const [customers, setCustomers] = useState<Customer[]>(cachedCustomers ?? []);
  const [search, setSearch] = useState("");
  const [selectedCustomer, setSelectedCustomer] = useState<Customer | null>(null);
  const [showAddDialog, setShowAddDialog] = useState(false);
  const [newName, setNewName] = useState("");
  const [newPhone, setNewPhone] = useState("");
  const [newEmail, setNewEmail] = useState("");

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
    fetchCustomers();
  }, [fetchCustomers]);

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
          email: newEmail || null,
          tags: [],
          is_member: false,
        }),
      });
      await fetchCustomers();
      setNewName("");
      setNewPhone("");
      setNewEmail("");
      setShowAddDialog(false);
    } catch (err) {
      console.error(err);
    }
  };

  const toggleMember = async (customerId: string) => {
    try {
      await apiFetch(`/customers/${customerId}/member`, { method: "PATCH" });
      await fetchCustomers();
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

  const memberCount = customers.filter((c) => c.is_member).length;
  const diamondCount = customers.filter((c) => c.tier === "Diamond").length;
  const avgSpend =
    customers.length > 0
      ? customers.reduce((s, c) => s + c.total_spent, 0) / customers.length
      : 0;

  const stats = [
    { value: formatNumber(customers.length), label: "Total Customer" },
    { value: formatNumber(memberCount), label: "Members" },
    { value: formatNumber(diamondCount), label: "Diamond" },
    { value: formatCurrency(avgSpend), label: "Avg Spend" },
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
                <div className="space-y-1.5">
                  <Label>Email</Label>
                  <Input placeholder="email@contoh.com" value={newEmail} onChange={(e) => setNewEmail(e.target.value)} />
                </div>
              </div>
              <DialogFooter>
                <Button onClick={addCustomer}>Simpan</Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </div>
      </div>

      <div className="grid grid-cols-4 gap-4">
        {stats.map((s) => (
          <div key={s.label} className="rounded-xl border bg-card px-5 py-4">
            <p className="text-2xl font-semibold tracking-tight">{s.value}</p>
            <p className="text-[13px] text-muted-foreground">{s.label}</p>
          </div>
        ))}
      </div>

      <div className="grid grid-cols-[1fr_360px] gap-4">
        <div className="border rounded-xl bg-card">
          <table className="w-full">
            <thead>
              <tr className="border-b">
                <th className="text-left text-[12px] text-muted-foreground font-medium px-4 py-2.5">Nama</th>
                <th className="text-left text-[12px] text-muted-foreground font-medium px-4 py-2.5">Telepon</th>
                <th className="text-left text-[12px] text-muted-foreground font-medium px-4 py-2.5">Tier</th>
                <th className="text-center text-[12px] text-muted-foreground font-medium px-4 py-2.5">Member</th>
                <th className="text-right text-[12px] text-muted-foreground font-medium px-4 py-2.5">Points</th>
                <th className="text-right text-[12px] text-muted-foreground font-medium px-4 py-2.5">Total Spent</th>
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
                  <td className="px-4 py-2.5">
                    <span className={`text-[11px] font-medium px-2 py-0.5 rounded capitalize ${tierBadge(c.tier)}`}>
                      {c.tier}
                    </span>
                  </td>
                  <td className="px-4 py-2.5 text-center">
                    {c.is_member ? (
                      <span className="text-[11px] font-medium px-2 py-0.5 rounded text-green-700 bg-green-50">Yes</span>
                    ) : (
                      <span className="text-[11px] font-medium px-2 py-0.5 rounded text-gray-500 bg-gray-100">No</span>
                    )}
                  </td>
                  <td className="px-4 py-2.5 text-right">{formatNumber(c.points)}</td>
                  <td className="px-4 py-2.5 text-right">{formatCurrency(c.total_spent)}</td>
                </tr>
              ))}
              {filtered.length === 0 && (
                <tr>
                  <td colSpan={6} className="px-4 py-8 text-center text-[13px] text-muted-foreground">
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
                <h2 className="text-sm font-medium mb-1">{selectedCustomer.name}</h2>
                <div className="flex items-center gap-2">
                  <span className={`text-[11px] font-medium px-2 py-0.5 rounded capitalize ${tierBadge(selectedCustomer.tier)}`}>
                    {selectedCustomer.tier}
                  </span>
                  {selectedCustomer.is_member && (
                    <span className="text-[11px] font-medium px-2 py-0.5 rounded text-green-700 bg-green-50">Member</span>
                  )}
                </div>
              </div>

              <div className="space-y-2 text-[13px]">
                <div className="flex items-center gap-2 text-muted-foreground">
                  <Phone className="size-3.5" />
                  {selectedCustomer.phone}
                </div>
                {selectedCustomer.email && (
                  <div className="flex items-center gap-2 text-muted-foreground">
                    <Mail className="size-3.5" />
                    {selectedCustomer.email}
                  </div>
                )}
              </div>

              <div className="flex items-center justify-between border rounded-lg px-3 py-2.5">
                <div>
                  <p className="text-[13px] font-medium">Status Member</p>
                  <p className="text-[11px] text-muted-foreground">
                    {selectedCustomer.is_member ? "Terdaftar sebagai member" : "Bukan member"}
                  </p>
                </div>
                <Switch
                  checked={selectedCustomer.is_member}
                  onCheckedChange={() => toggleMember(selectedCustomer.id)}
                />
              </div>

              <div className="grid grid-cols-2 gap-3 text-[13px]">
                <div>
                  <p className="text-muted-foreground">Points</p>
                  <p className="font-medium">{formatNumber(selectedCustomer.points)}</p>
                </div>
                <div>
                  <p className="text-muted-foreground">Total Visits</p>
                  <p className="font-medium">{selectedCustomer.total_visits}</p>
                </div>
                <div>
                  <p className="text-muted-foreground">Total Spent</p>
                  <p className="font-medium">{formatCurrency(selectedCustomer.total_spent)}</p>
                </div>
                <div>
                  <p className="text-muted-foreground">Joined</p>
                  <p className="font-medium">{formatDate(selectedCustomer.joined_at)}</p>
                </div>
              </div>

              {selectedCustomer.last_visit && (
                <div>
                  <p className="text-[13px] text-muted-foreground mb-1">Last Visit</p>
                  <p className="text-[13px] font-medium">{formatDate(selectedCustomer.last_visit)}</p>
                </div>
              )}

              <div>
                <p className="text-[13px] text-muted-foreground mb-1.5">Tags</p>
                <div className="flex flex-wrap gap-1.5">
                  {selectedCustomer.tags.map((tag) => (
                    <span
                      key={tag}
                      className="text-[11px] font-medium px-2 py-0.5 rounded bg-muted text-muted-foreground capitalize flex items-center gap-1"
                    >
                      <Tag className="size-3" />
                      {tag}
                    </span>
                  ))}
                  {selectedCustomer.tags.length === 0 && (
                    <span className="text-[11px] text-muted-foreground">Tidak ada tag</span>
                  )}
                </div>
              </div>

              <div className="flex items-center gap-2 text-[13px]">
                <Star className="size-3.5 text-amber-500" />
                <span className="text-muted-foreground">{selectedCustomer.total_visits} kunjungan</span>
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
