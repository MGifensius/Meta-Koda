"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Loader2, Plus, Trash2, Check, X, AlertCircle } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { apiFetch } from "@/lib/api-client";

type TableRow = {
  id: string;
  capacity: number;
  zone: string | null;
  status: "available" | "reserved" | "occupied" | "cleaning";
};

type DraftEdit = { capacity: string; zone: string };

export function TablesTab() {
  const [tables, setTables] = useState<TableRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  // Edit state — keyed by table id; when present, that row is in edit mode.
  const [edits, setEdits] = useState<Record<string, DraftEdit>>({});
  const [savingId, setSavingId] = useState<string | null>(null);

  // Add-new form
  const [newId, setNewId] = useState("");
  const [newCapacity, setNewCapacity] = useState("4");
  const [newZone, setNewZone] = useState("");
  const [adding, setAdding] = useState(false);

  const fetchAll = useCallback(async () => {
    try {
      const res = await apiFetch("/floor/tables");
      if (!res.ok) {
        setError(`Failed to load (${res.status})`);
        return;
      }
      setTables(await res.json());
      setError("");
    } catch {
      setError("Network error.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchAll();
  }, [fetchAll]);

  const grouped = useMemo(() => {
    const map: Record<string, TableRow[]> = {};
    for (const t of tables) {
      const z = t.zone || "Main";
      if (!map[z]) map[z] = [];
      map[z].push(t);
    }
    return map;
  }, [tables]);

  // Distinct zones used so the "Add" form's zone field can suggest existing
  // ones (helps avoid typo-driven duplicates).
  const knownZones = useMemo(
    () => Array.from(new Set(tables.map((t) => t.zone || "Main"))).sort(),
    [tables],
  );

  const startEdit = (t: TableRow) => {
    setEdits((e) => ({
      ...e,
      [t.id]: { capacity: String(t.capacity), zone: t.zone || "" },
    }));
  };

  const cancelEdit = (id: string) => {
    setEdits((e) => {
      const next = { ...e };
      delete next[id];
      return next;
    });
  };

  const saveEdit = async (t: TableRow) => {
    const draft = edits[t.id];
    if (!draft) return;
    const cap = parseInt(draft.capacity, 10);
    if (!Number.isFinite(cap) || cap < 1 || cap > 50) {
      setError("Capacity must be 1–50");
      return;
    }
    setSavingId(t.id);
    setError("");
    try {
      const res = await apiFetch(`/floor/tables/${encodeURIComponent(t.id)}`, {
        method: "PATCH",
        body: JSON.stringify({ capacity: cap, zone: draft.zone.trim() || t.zone }),
      });
      if (!res.ok) {
        const j = await res.json().catch(() => ({} as { detail?: string }));
        setError(j.detail || `HTTP ${res.status}`);
        return;
      }
      cancelEdit(t.id);
      await fetchAll();
    } catch {
      setError("Network error.");
    } finally {
      setSavingId(null);
    }
  };

  const addTable = async () => {
    if (!newId.trim()) {
      setError("Table id required");
      return;
    }
    const cap = parseInt(newCapacity, 10);
    if (!Number.isFinite(cap) || cap < 1 || cap > 50) {
      setError("Capacity must be 1–50");
      return;
    }
    setAdding(true);
    setError("");
    try {
      const res = await apiFetch("/floor/tables", {
        method: "POST",
        body: JSON.stringify({
          id: newId.trim(),
          capacity: cap,
          zone: newZone.trim() || "Main",
        }),
      });
      if (!res.ok) {
        const j = await res.json().catch(() => ({} as { detail?: string }));
        setError(j.detail || `HTTP ${res.status}`);
        return;
      }
      setNewId("");
      setNewCapacity("4");
      setNewZone("");
      await fetchAll();
    } catch {
      setError("Network error.");
    } finally {
      setAdding(false);
    }
  };

  const deleteTable = async (t: TableRow) => {
    if (
      !window.confirm(
        `Hapus meja ${t.id}? Aksi ini tidak bisa dibatalkan jika tidak ada booking aktif.`,
      )
    ) {
      return;
    }
    setSavingId(t.id);
    setError("");
    try {
      const res = await apiFetch(`/floor/tables/${encodeURIComponent(t.id)}`, {
        method: "DELETE",
      });
      if (!res.ok) {
        const j = await res.json().catch(() => ({} as { detail?: string }));
        setError(j.detail || `HTTP ${res.status}`);
        return;
      }
      await fetchAll();
    } catch {
      setError("Network error.");
    } finally {
      setSavingId(null);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12 text-muted-foreground">
        <Loader2 className="size-5 animate-spin mr-2" />
        Loading tables…
      </div>
    );
  }

  return (
    <div className="space-y-5">
      <div>
        <h3 className="text-sm font-semibold mb-1">Daftar Meja</h3>
        <p className="text-[12px] text-muted-foreground">
          Atur kapasitas dan area duduk untuk setiap meja. Aksi ini hanya bisa
          dilakukan oleh tenant owner.
        </p>
      </div>

      {error && (
        <div className="border border-red-200 bg-red-50 text-red-700 rounded-md px-3 py-2 text-[12px] flex items-center gap-2">
          <AlertCircle className="size-4" />
          {error}
        </div>
      )}

      {/* Add-new row */}
      <div className="border rounded-lg p-3 bg-secondary/20">
        <div className="text-[11px] font-mono-label uppercase tracking-wider ink-3 mb-2">
          Tambah meja baru
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-4 gap-2 items-end">
          <div className="space-y-1">
            <Label className="text-[11px]">Kode Meja</Label>
            <Input
              value={newId}
              onChange={(e) => setNewId(e.target.value)}
              placeholder="TO-7"
              maxLength={20}
            />
          </div>
          <div className="space-y-1">
            <Label className="text-[11px]">Kapasitas (pax)</Label>
            <Input
              type="number"
              min={1}
              max={50}
              value={newCapacity}
              onChange={(e) => setNewCapacity(e.target.value)}
            />
          </div>
          <div className="space-y-1">
            <Label className="text-[11px]">Area / Zona</Label>
            <Input
              value={newZone}
              onChange={(e) => setNewZone(e.target.value)}
              placeholder={knownZones[0] || "Main"}
              list="known-zones"
            />
            <datalist id="known-zones">
              {knownZones.map((z) => (
                <option key={z} value={z} />
              ))}
            </datalist>
          </div>
          <Button onClick={addTable} disabled={adding}>
            {adding ? (
              <Loader2 className="size-4 mr-1.5 animate-spin" />
            ) : (
              <Plus className="size-4 mr-1.5" />
            )}
            Tambah
          </Button>
        </div>
      </div>

      {/* Existing tables grouped by zone */}
      {Object.entries(grouped).length === 0 ? (
        <div className="border rounded-lg p-6 text-center text-muted-foreground text-sm">
          Belum ada meja. Tambahkan meja pertama lewat form di atas.
        </div>
      ) : (
        Object.entries(grouped).map(([zone, list]) => (
          <div key={zone} className="border rounded-lg">
            <div className="px-3 py-2 border-b bg-secondary/30 text-[11px] font-mono-label uppercase tracking-wider ink-3 flex items-center justify-between">
              <span>
                {zone}{" "}
                <span className="ml-2 normal-case tracking-normal text-muted-foreground">
                  {list.length} meja
                </span>
              </span>
            </div>
            <div className="divide-y">
              {list.map((t) => {
                const editing = edits[t.id];
                const busy = savingId === t.id;
                return (
                  <div
                    key={t.id}
                    className="flex items-center gap-3 px-3 py-2 text-[13px]"
                  >
                    <div className="font-semibold min-w-[64px]">{t.id}</div>
                    {editing ? (
                      <>
                        <Input
                          type="number"
                          min={1}
                          max={50}
                          className="w-24 h-8"
                          value={editing.capacity}
                          onChange={(e) =>
                            setEdits((s) => ({
                              ...s,
                              [t.id]: { ...editing, capacity: e.target.value },
                            }))
                          }
                        />
                        <span className="text-muted-foreground text-[11px]">pax</span>
                        <Input
                          className="flex-1 h-8"
                          value={editing.zone}
                          onChange={(e) =>
                            setEdits((s) => ({
                              ...s,
                              [t.id]: { ...editing, zone: e.target.value },
                            }))
                          }
                          placeholder="Area"
                        />
                        <Button
                          size="sm"
                          onClick={() => saveEdit(t)}
                          disabled={busy}
                        >
                          {busy ? (
                            <Loader2 className="size-3.5 animate-spin" />
                          ) : (
                            <Check className="size-3.5" />
                          )}
                        </Button>
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => cancelEdit(t.id)}
                          disabled={busy}
                        >
                          <X className="size-3.5" />
                        </Button>
                      </>
                    ) : (
                      <>
                        <span className="text-muted-foreground">
                          {t.capacity} pax
                        </span>
                        <span className="text-muted-foreground">·</span>
                        <span className="text-muted-foreground">{t.zone}</span>
                        <span
                          className={`ml-auto text-[10px] uppercase tracking-wider px-2 py-0.5 rounded-full ${
                            t.status === "available"
                              ? "bg-green-50 text-green-700"
                              : "bg-stone-100 text-stone-500"
                          }`}
                        >
                          {t.status}
                        </span>
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => startEdit(t)}
                          disabled={busy}
                        >
                          Edit
                        </Button>
                        <Button
                          size="sm"
                          variant="ghost"
                          className="text-red-600 hover:text-red-700 hover:bg-red-50"
                          onClick={() => deleteTable(t)}
                          disabled={busy}
                        >
                          {busy ? (
                            <Loader2 className="size-3.5 animate-spin" />
                          ) : (
                            <Trash2 className="size-3.5" />
                          )}
                        </Button>
                      </>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        ))
      )}
    </div>
  );
}
