"use client";

import { useEffect, useState } from "react";
import { Loader2, Check } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { useRestaurantSettings } from "@/lib/use-restaurant-settings";

// /settings index — restaurant identity + operating hours + welcome
// + promo. Every other section (Tables, Bot) lives in its own
// sub-route under (dashboard)/settings/.
export default function SettingsGeneralPage() {
  const { settings, update, save, loading, saving, saved } =
    useRestaurantSettings();

  // Mirror the parsed open/close times locally so the inputs stay
  // controlled. Re-derive whenever the loaded opening_hours changes.
  const [openTime, setOpenTime] = useState("11:00");
  const [closeTime, setCloseTime] = useState("22:00");
  useEffect(() => {
    const parts = (settings.opening_hours || "11:00 - 22:00").split(" - ");
    if (parts[0]) setOpenTime(parts[0]);
    if (parts[1]) setCloseTime(parts[1]);
  }, [settings.opening_hours]);

  const handleSave = () =>
    save({ opening_hours: `${openTime} - ${closeTime}` });

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="size-5 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="border rounded-xl bg-card p-5 space-y-4">
        <h2 className="text-sm font-medium">Informasi Restoran</h2>
        <div className="grid grid-cols-2 gap-4">
          <div className="space-y-1.5">
            <Label>Nama Restoran</Label>
            <Input
              value={settings.name}
              onChange={(e) => update("name", e.target.value)}
            />
          </div>
          <div className="space-y-1.5">
            <Label>Telepon</Label>
            <Input
              value={settings.phone}
              onChange={(e) => update("phone", e.target.value)}
            />
          </div>
          <div className="space-y-1.5">
            <Label>Instagram</Label>
            <Input
              value={settings.instagram}
              onChange={(e) => update("instagram", e.target.value)}
              placeholder="@username"
            />
          </div>
          <div className="space-y-1.5">
            <Label>Tagline</Label>
            <Input
              value={settings.tagline}
              onChange={(e) => update("tagline", e.target.value)}
            />
          </div>
        </div>
        <div className="space-y-1.5">
          <Label>Alamat / Lokasi</Label>
          <Textarea
            value={settings.location}
            onChange={(e) => update("location", e.target.value)}
            rows={2}
          />
        </div>
      </div>

      <div className="border rounded-xl bg-card p-5 space-y-4">
        <div>
          <h2 className="text-sm font-medium">Jam Operasional</h2>
          <p className="text-[12px] text-muted-foreground">
            Last order otomatis = jam tutup − 30 menit. Reservasi terakhir =
            jam tutup − 1 jam.
          </p>
        </div>
        <div className="grid grid-cols-2 gap-4">
          <div className="space-y-1.5">
            <Label>Jam Buka</Label>
            <Input
              type="time"
              value={openTime}
              onChange={(e) => setOpenTime(e.target.value)}
            />
          </div>
          <div className="space-y-1.5">
            <Label>Jam Tutup</Label>
            <Input
              type="time"
              value={closeTime}
              onChange={(e) => setCloseTime(e.target.value)}
            />
          </div>
        </div>
        <div className="space-y-1.5">
          <Label>Hari Buka</Label>
          <Input
            value={settings.days_open}
            onChange={(e) => update("days_open", e.target.value)}
            placeholder="Setiap hari / Senin - Sabtu"
          />
        </div>
      </div>

      <div className="border rounded-xl bg-card p-5 space-y-4">
        <h2 className="text-sm font-medium">Promo</h2>
        <div className="space-y-1.5">
          <Label>Promo Text (ditampilkan saat customer tanya promo)</Label>
          <Textarea
            value={settings.promo_text}
            onChange={(e) => update("promo_text", e.target.value)}
            rows={3}
            placeholder={"Weekend Special — Diskon 20%\nBirthday Month — Free dessert"}
          />
        </div>
      </div>

      <div className="flex justify-end">
        <Button onClick={handleSave} disabled={saving}>
          {saving ? (
            <>
              <Loader2 className="size-4 mr-1 animate-spin" /> Menyimpan…
            </>
          ) : saved ? (
            <>
              <Check className="size-4 mr-1" /> Tersimpan!
            </>
          ) : (
            "Simpan Perubahan"
          )}
        </Button>
      </div>
    </div>
  );
}
