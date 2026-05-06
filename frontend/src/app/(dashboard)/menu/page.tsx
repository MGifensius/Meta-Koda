"use client";

import { useState, useEffect, useCallback } from "react";
import { Plus, Pencil, Trash2, Search, UtensilsCrossed } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { formatCurrency } from "@/lib/format";
import { apiFetch } from "@/lib/api-client";
import { readCache, writeCache } from "@/lib/cached-state";
import { useAuth } from "@/lib/role-context";

type MenuItem = {
  id: string;
  name: string;
  category: string;
  price: number;
  description: string;
  is_available: boolean;
};

const CATEGORIES = ["Brunch", "Lite Bites", "Main", "Beverage", "Dessert"];

export default function MenuPage() {
  const { tenantId } = useAuth();
  const cachedItems =
    typeof window !== "undefined" && tenantId
      ? readCache<MenuItem[]>(`menu:${tenantId}`)
      : null;

  const [items, setItems] = useState<MenuItem[]>(cachedItems ?? []);
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(!cachedItems);

  const [formOpen, setFormOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [fName, setFName] = useState("");
  const [fCategory, setFCategory] = useState("Main");
  const [fPrice, setFPrice] = useState("");
  const [fDescription, setFDescription] = useState("");
  const [fAvailable, setFAvailable] = useState(true);

  const fetchMenu = useCallback(async () => {
    try {
      const res = await apiFetch("/pos/menu?include_unavailable=true");
      const data = await res.json();
      setItems(data);
      if (tenantId) writeCache(`menu:${tenantId}`, data);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  }, [tenantId]);

  useEffect(() => {
    fetchMenu();
  }, [fetchMenu]);

  const resetForm = () => {
    setEditingId(null);
    setFName("");
    setFCategory("Main");
    setFPrice("");
    setFDescription("");
    setFAvailable(true);
  };

  const openCreate = () => {
    resetForm();
    setFormOpen(true);
  };

  const openEdit = (item: MenuItem) => {
    setEditingId(item.id);
    setFName(item.name);
    setFCategory(item.category);
    setFPrice(String(item.price));
    setFDescription(item.description || "");
    setFAvailable(item.is_available);
    setFormOpen(true);
  };

  const save = async () => {
    const price = parseInt(fPrice, 10);
    if (!fName.trim() || !fCategory || !price || price <= 0) return;
    const body = {
      name: fName.trim(),
      category: fCategory,
      price,
      description: fDescription.trim(),
      is_available: fAvailable,
    };
    try {
      if (editingId) {
        await apiFetch(`/pos/menu/${editingId}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        });
      } else {
        await apiFetch("/pos/menu", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        });
      }
      await fetchMenu();
      setFormOpen(false);
      resetForm();
    } catch (err) {
      console.error(err);
    }
  };

  const toggleAvailable = async (item: MenuItem) => {
    try {
      await apiFetch(`/pos/menu/${item.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ is_available: !item.is_available }),
      });
      await fetchMenu();
    } catch (err) {
      console.error(err);
    }
  };

  const remove = async (item: MenuItem) => {
    if (!confirm(`Hapus "${item.name}"? Aksi ini tidak bisa dibatalkan.`)) return;
    try {
      await apiFetch(`/pos/menu/${item.id}`, { method: "DELETE" });
      await fetchMenu();
    } catch (err) {
      console.error(err);
    }
  };

  const filtered = items.filter(
    (i) =>
      i.name.toLowerCase().includes(search.toLowerCase()) ||
      i.category.toLowerCase().includes(search.toLowerCase())
  );

  const grouped = filtered.reduce<Record<string, MenuItem[]>>((acc, i) => {
    (acc[i.category] = acc[i.category] || []).push(i);
    return acc;
  }, {});

  const totalItems = items.length;
  const availableCount = items.filter((i) => i.is_available).length;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-lg font-semibold">Menu</h1>
          <p className="text-[12px] text-muted-foreground">
            {totalItems} item · {availableCount} tersedia
          </p>
        </div>
        <Button
          onClick={openCreate}
          className="rounded-md h-9 px-3 gap-1.5 text-[13px]"
        >
          <Plus className="size-4" /> Tambah Menu
        </Button>
        <Dialog
          open={formOpen}
          onOpenChange={(open) => {
            setFormOpen(open);
            if (!open) resetForm();
          }}
        >
          <DialogContent className="sm:max-w-md">
            <DialogHeader>
              <DialogTitle>
                {editingId ? "Edit Menu" : "Tambah Menu Baru"}
              </DialogTitle>
            </DialogHeader>
            <div className="space-y-3 py-2">
              <div>
                <Label>Nama</Label>
                <Input
                  value={fName}
                  onChange={(e) => setFName(e.target.value)}
                  placeholder="mis. Nasi Goreng Spesial"
                />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label>Kategori</Label>
                  <Select value={fCategory} onValueChange={(v) => setFCategory(v ?? "")}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {CATEGORIES.map((c) => (
                        <SelectItem key={c} value={c}>
                          {c}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label>Harga (Rp)</Label>
                  <Input
                    type="number"
                    value={fPrice}
                    onChange={(e) => setFPrice(e.target.value)}
                    placeholder="45000"
                  />
                </div>
              </div>
              <div>
                <Label>Deskripsi (opsional)</Label>
                <Textarea
                  value={fDescription}
                  onChange={(e) => setFDescription(e.target.value)}
                  placeholder="Deskripsi singkat untuk customer"
                  rows={2}
                />
              </div>
              <label className="flex items-center gap-2 text-[13px] cursor-pointer">
                <input
                  type="checkbox"
                  checked={fAvailable}
                  onChange={(e) => setFAvailable(e.target.checked)}
                  className="size-4"
                />
                Tersedia untuk dijual
              </label>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setFormOpen(false)}>
                Batal
              </Button>
              <Button onClick={save}>Simpan</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>

      {/* Search */}
      <div className="relative max-w-sm">
        <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 size-4 text-muted-foreground" />
        <Input
          placeholder="Cari menu..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="pl-8"
        />
      </div>

      {/* Items grouped by category */}
      {loading ? (
        <p className="text-[13px] text-muted-foreground py-8 text-center">Loading...</p>
      ) : Object.keys(grouped).length === 0 ? (
        <div className="border rounded-xl bg-card p-10 text-center">
          <UtensilsCrossed className="size-8 text-muted-foreground mx-auto mb-2" />
          <p className="text-[13px] text-muted-foreground">
            Belum ada menu. Klik "Tambah Menu" untuk mulai.
          </p>
        </div>
      ) : (
        <div className="space-y-4">
          {Object.entries(grouped).map(([category, catItems]) => (
            <div key={category} className="border rounded-xl bg-card overflow-hidden">
              <div className="px-4 py-2.5 border-b bg-secondary/50 flex items-center justify-between">
                <p className="text-[12px] font-mono-label uppercase tracking-wider ink-3">
                  {category}
                </p>
                <span className="text-[11px] text-muted-foreground">
                  {catItems.length} item
                </span>
              </div>
              <div className="divide-y divide-border">
                {catItems.map((item) => (
                  <div
                    key={item.id}
                    className="px-4 py-3 flex items-center gap-4 hover:bg-secondary/30 transition-colors"
                  >
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <p className="text-[13px] font-medium">{item.name}</p>
                        {!item.is_available && (
                          <span className="text-[10px] font-medium px-1.5 py-0.5 rounded bg-muted text-muted-foreground">
                            Tidak tersedia
                          </span>
                        )}
                      </div>
                      {item.description && (
                        <p className="text-[12px] text-muted-foreground truncate">
                          {item.description}
                        </p>
                      )}
                    </div>
                    <p className="text-[13px] font-mono-label ink-2 shrink-0">
                      {formatCurrency(item.price)}
                    </p>
                    <div className="flex items-center gap-1 shrink-0">
                      <button
                        type="button"
                        onClick={() => toggleAvailable(item)}
                        className={`text-[11px] font-medium px-2 py-1 rounded border transition-colors ${
                          item.is_available
                            ? "border-border hover:bg-secondary"
                            : "border-primary/30 bg-primary/10 text-primary hover:bg-primary/15"
                        }`}
                      >
                        {item.is_available ? "Sembunyikan" : "Aktifkan"}
                      </button>
                      <button
                        type="button"
                        onClick={() => openEdit(item)}
                        className="size-7 rounded-md border border-border hover:bg-secondary flex items-center justify-center text-muted-foreground hover:text-foreground transition-colors"
                        aria-label="Edit"
                      >
                        <Pencil className="size-3.5" />
                      </button>
                      <button
                        type="button"
                        onClick={() => remove(item)}
                        className="size-7 rounded-md border border-border hover:bg-destructive/10 hover:border-destructive/30 flex items-center justify-center text-muted-foreground hover:text-destructive transition-colors"
                        aria-label="Hapus"
                      >
                        <Trash2 className="size-3.5" />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
