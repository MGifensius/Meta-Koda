"use client";

import { useState, useEffect, useCallback } from "react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Loader2, Check } from "lucide-react";
import { apiFetch } from "@/lib/api-client";

type Settings = {
  name: string;
  tagline: string;
  opening_hours: string;
  last_order: string;
  days_open: string;
  location: string;
  phone: string;
  instagram: string;
  promo_text: string;
  welcome_message: string;
};

export default function SettingsPage() {
  const [tab, setTab] = useState("umum");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  // Settings from DB
  const [settings, setSettings] = useState<Settings>({
    name: "",
    tagline: "",
    opening_hours: "11:00 - 22:00",
    last_order: "21:30",
    days_open: "Setiap hari",
    location: "",
    phone: "",
    instagram: "",
    promo_text: "",
    welcome_message: "",
  });

  // Derived fields for UI
  const [openTime, setOpenTime] = useState("11:00");
  const [closeTime, setCloseTime] = useState("22:00");

  // WhatsApp settings (local for now)
  const [autoReply, setAutoReply] = useState(true);
  const [businessHoursOnly, setBusinessHoursOnly] = useState(false);
  const [offlineMessage, setOfflineMessage] = useState(
    "Terima kasih sudah menghubungi. Saat ini kami sedang tutup. Pesan Anda akan kami balas saat buka."
  );

  // Notification settings (local for now)
  const [emailNotif, setEmailNotif] = useState(true);
  const [bookingNotif, setBookingNotif] = useState(true);
  const [chatNotif, setChatNotif] = useState(true);
  const [campaignNotif, setCampaignNotif] = useState(false);
  const [dailyReport, setDailyReport] = useState(true);
  const [weeklyReport, setWeeklyReport] = useState(true);

  // Loyalty settings
  const [loyPointsPerRupiah, setLoyPointsPerRupiah] = useState("10000");
  const [loyTierMultiplier, setLoyTierMultiplier] = useState(true);
  const [loySignupBonus, setLoySignupBonus] = useState("0");
  const [loyRedemptionValue, setLoyRedemptionValue] = useState("1000");
  const [loyActive, setLoyActive] = useState(true);
  const [loySaving, setLoySaving] = useState(false);
  const [loySaved, setLoySaved] = useState(false);
  const [loyError, setLoyError] = useState("");

  const fetchSettings = useCallback(async () => {
    try {
      const [sRes, lRes] = await Promise.all([
        apiFetch("/settings"),
        apiFetch("/loyalty/settings"),
      ]);
      if (sRes.ok) {
        const data = await sRes.json();
        setSettings(data);
        const parts = (data.opening_hours || "11:00 - 22:00").split(" - ");
        setOpenTime(parts[0] || "11:00");
        setCloseTime(parts[1] || "22:00");
      }
      if (lRes.ok) {
        const l = await lRes.json();
        setLoyPointsPerRupiah(String(l.points_per_rupiah ?? 10000));
        setLoyTierMultiplier(!!l.tier_multiplier_enabled);
        setLoySignupBonus(String(l.signup_bonus ?? 0));
        setLoyRedemptionValue(String(l.redemption_value_idr ?? 1000));
        setLoyActive(l.is_active !== false);
      }
    } catch {
      // API not available
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchSettings();
  }, [fetchSettings]);

  const saveLoyalty = async () => {
    setLoySaving(true);
    setLoySaved(false);
    setLoyError("");
    const ppr = parseInt(loyPointsPerRupiah || "0", 10);
    if (ppr <= 0) {
      setLoyError("Earn rate must be a positive number.");
      setLoySaving(false);
      return;
    }
    try {
      const res = await apiFetch("/loyalty/settings", {
        method: "PATCH",
        body: JSON.stringify({
          points_per_rupiah: ppr,
          tier_multiplier_enabled: loyTierMultiplier,
          signup_bonus: parseInt(loySignupBonus || "0", 10),
          redemption_value_idr: parseInt(loyRedemptionValue || "0", 10),
          is_active: loyActive,
        }),
      });
      if (!res.ok) {
        const j = await res.json().catch(() => ({} as { detail?: string }));
        setLoyError(j.detail || `HTTP ${res.status}`);
        return;
      }
      setLoySaved(true);
      setTimeout(() => setLoySaved(false), 2500);
    } catch {
      setLoyError("Network error.");
    } finally {
      setLoySaving(false);
    }
  };

  const saveSettings = async () => {
    setSaving(true);
    setSaved(false);
    try {
      const payload = {
        ...settings,
        opening_hours: `${openTime} - ${closeTime}`,
      };
      const res = await apiFetch("/settings", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (res.ok) {
        setSaved(true);
        setTimeout(() => setSaved(false), 2000);
      }
    } catch {
      // error
    } finally {
      setSaving(false);
    }
  };

  const updateField = (field: keyof Settings, value: string) => {
    setSettings((prev) => ({ ...prev, [field]: value }));
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="size-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <h1 className="text-lg font-semibold">Settings</h1>

      <Tabs value={tab} onValueChange={(v) => setTab(v ?? "umum")}>
        <TabsList>
          <TabsTrigger value="umum">Umum</TabsTrigger>
          <TabsTrigger value="loyalty">Loyalty</TabsTrigger>
          <TabsTrigger value="whatsapp">WhatsApp</TabsTrigger>
          <TabsTrigger value="bot">AI Bot</TabsTrigger>
          <TabsTrigger value="notifikasi">Notifikasi</TabsTrigger>
        </TabsList>

        {/* Umum */}
        <TabsContent value="umum">
          <div className="space-y-4">
            <div className="border rounded-xl bg-card p-5 space-y-4">
              <h2 className="text-sm font-medium mb-3">Informasi Restoran</h2>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <Label>Nama Restoran</Label>
                  <Input
                    value={settings.name}
                    onChange={(e) => updateField("name", e.target.value)}
                  />
                </div>
                <div className="space-y-1.5">
                  <Label>Telepon</Label>
                  <Input
                    value={settings.phone}
                    onChange={(e) => updateField("phone", e.target.value)}
                  />
                </div>
                <div className="space-y-1.5">
                  <Label>Instagram</Label>
                  <Input
                    value={settings.instagram}
                    onChange={(e) => updateField("instagram", e.target.value)}
                    placeholder="@username"
                  />
                </div>
                <div className="space-y-1.5">
                  <Label>Tagline</Label>
                  <Input
                    value={settings.tagline}
                    onChange={(e) => updateField("tagline", e.target.value)}
                  />
                </div>
              </div>
              <div className="space-y-1.5">
                <Label>Alamat / Lokasi</Label>
                <Textarea
                  value={settings.location}
                  onChange={(e) => updateField("location", e.target.value)}
                  rows={2}
                />
              </div>
            </div>

            <div className="border rounded-xl bg-card p-5 space-y-4">
              <h2 className="text-sm font-medium mb-3">Jam Operasional</h2>
              <div className="grid grid-cols-3 gap-4">
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
                <div className="space-y-1.5">
                  <Label>Last Order</Label>
                  <Input
                    type="time"
                    value={settings.last_order}
                    onChange={(e) => updateField("last_order", e.target.value)}
                  />
                </div>
              </div>
              <div className="space-y-1.5">
                <Label>Hari Buka</Label>
                <Input
                  value={settings.days_open}
                  onChange={(e) => updateField("days_open", e.target.value)}
                  placeholder="Setiap hari / Senin - Sabtu"
                />
              </div>
            </div>

            <div className="border rounded-xl bg-card p-5 space-y-4">
              <h2 className="text-sm font-medium mb-3">Bot & Promo</h2>
              <div className="space-y-1.5">
                <Label>Welcome Message (pesan pertama bot)</Label>
                <Input
                  value={settings.welcome_message}
                  onChange={(e) => updateField("welcome_message", e.target.value)}
                  placeholder="Halo! Selamat datang di Buranchi 👋"
                />
              </div>
              <div className="space-y-1.5">
                <Label>Promo Text (ditampilkan saat customer tanya promo)</Label>
                <Textarea
                  value={settings.promo_text}
                  onChange={(e) => updateField("promo_text", e.target.value)}
                  rows={3}
                  placeholder="Weekend Special — Diskon 20%&#10;Birthday Month — Free dessert"
                />
              </div>
            </div>

            <div className="flex justify-end">
              <Button onClick={saveSettings} disabled={saving}>
                {saving ? (
                  <><Loader2 className="size-4 mr-1 animate-spin" /> Menyimpan...</>
                ) : saved ? (
                  <><Check className="size-4 mr-1" /> Tersimpan!</>
                ) : (
                  "Simpan Perubahan"
                )}
              </Button>
            </div>
          </div>
        </TabsContent>

        {/* WhatsApp */}
        <TabsContent value="loyalty">
          <div className="space-y-4">
            <div className="border rounded-xl bg-card p-5 space-y-4">
              <div>
                <h2 className="text-sm font-medium">Earning Rate</h2>
                <p className="text-[12px] text-muted-foreground">
                  How quickly customers earn points when settling a bill.
                </p>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <Label>Rupiah per point</Label>
                  <div className="relative">
                    <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground text-[13px]">
                      Rp
                    </span>
                    <Input
                      type="number"
                      min={1}
                      value={loyPointsPerRupiah}
                      onChange={(e) => setLoyPointsPerRupiah(e.target.value)}
                      className="pl-9"
                    />
                  </div>
                  <p className="text-[11px] text-muted-foreground mt-1">
                    Customer earns 1 point per Rp{" "}
                    {parseInt(loyPointsPerRupiah || "0", 10).toLocaleString("id-ID") || "—"}{" "}
                    spent.
                  </p>
                </div>

                <div>
                  <Label>Signup bonus (points)</Label>
                  <Input
                    type="number"
                    min={0}
                    value={loySignupBonus}
                    onChange={(e) => setLoySignupBonus(e.target.value)}
                  />
                  <p className="text-[11px] text-muted-foreground mt-1">
                    Awarded when staff registers a walk-in as a new member.
                  </p>
                </div>
              </div>

              <div className="flex items-center justify-between border-t pt-3">
                <div>
                  <p className="text-[13px] font-medium">Tier multipliers</p>
                  <p className="text-[12px] text-muted-foreground">
                    Bronze 1× · Silver 1.25× · Gold 1.5× · Diamond 2×
                  </p>
                </div>
                <Switch
                  checked={loyTierMultiplier}
                  onCheckedChange={setLoyTierMultiplier}
                />
              </div>
            </div>

            <div className="border rounded-xl bg-card p-5 space-y-4">
              <div>
                <h2 className="text-sm font-medium">Redemption</h2>
                <p className="text-[12px] text-muted-foreground">
                  Used to display the rupiah equivalent of a customer's points
                  balance.
                </p>
              </div>
              <div>
                <Label>Rupiah value per point</Label>
                <div className="relative max-w-xs">
                  <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground text-[13px]">
                    Rp
                  </span>
                  <Input
                    type="number"
                    min={0}
                    value={loyRedemptionValue}
                    onChange={(e) => setLoyRedemptionValue(e.target.value)}
                    className="pl-9"
                  />
                </div>
                <p className="text-[11px] text-muted-foreground mt-1">
                  1 point ≈ Rp{" "}
                  {parseInt(loyRedemptionValue || "0", 10).toLocaleString("id-ID") || "0"}
                </p>
              </div>
            </div>

            <div className="border rounded-xl bg-card p-5">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-[13px] font-medium">Loyalty program active</p>
                  <p className="text-[12px] text-muted-foreground">
                    When off, no points are awarded on settle and redemptions
                    are blocked. Existing balances are preserved.
                  </p>
                </div>
                <Switch checked={loyActive} onCheckedChange={setLoyActive} />
              </div>
            </div>

            {loyError && (
              <p className="text-[12px] text-red-600">{loyError}</p>
            )}

            <div className="flex justify-end items-center gap-2">
              {loySaved && (
                <span className="text-[12px] text-emerald-700 inline-flex items-center gap-1">
                  <Check className="size-3.5" /> Saved
                </span>
              )}
              <Button onClick={saveLoyalty} disabled={loySaving}>
                {loySaving && <Loader2 className="size-4 mr-1.5 animate-spin" />}
                Save Loyalty Settings
              </Button>
            </div>
          </div>
        </TabsContent>

        <TabsContent value="whatsapp">
          <div className="space-y-4">
            <div className="border rounded-xl bg-card p-5 space-y-4">
              <h2 className="text-sm font-medium mb-3">Pengaturan Pesan</h2>
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-[13px] font-medium">Auto Reply</p>
                    <p className="text-[13px] text-muted-foreground">
                      Balas pesan masuk secara otomatis via bot
                    </p>
                  </div>
                  <Switch checked={autoReply} onCheckedChange={setAutoReply} />
                </div>
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-[13px] font-medium">Business Hours Only</p>
                    <p className="text-[13px] text-muted-foreground">
                      Hanya aktifkan bot saat jam operasional
                    </p>
                  </div>
                  <Switch checked={businessHoursOnly} onCheckedChange={setBusinessHoursOnly} />
                </div>
              </div>
              <div className="space-y-1.5">
                <Label>Pesan Offline</Label>
                <Textarea
                  value={offlineMessage}
                  onChange={(e) => setOfflineMessage(e.target.value)}
                  rows={3}
                />
              </div>
            </div>
            <div className="flex justify-end">
              <Button>Simpan Perubahan</Button>
            </div>
          </div>
        </TabsContent>

        {/* AI Bot */}
        <TabsContent value="bot">
          <div className="space-y-4">
            <div className="border rounded-xl bg-card p-5 space-y-4">
              <div className="flex items-center justify-between">
                <div>
                  <h2 className="text-sm font-medium">Bot Status</h2>
                  <p className="text-[13px] text-muted-foreground">Bot akan otomatis merespon pesan masuk dari customer</p>
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-[11px] font-medium px-2 py-0.5 rounded text-green-700 bg-green-50">Aktif</span>
                  <Switch defaultChecked />
                </div>
              </div>
            </div>

            <div className="border rounded-xl bg-card p-5 space-y-4">
              <h2 className="text-sm font-medium">Personality</h2>
              <div className="space-y-1.5">
                <Label>Welcome Message</Label>
                <Input
                  value={settings.welcome_message}
                  onChange={(e) => updateField("welcome_message", e.target.value)}
                  placeholder="Halo! Selamat datang di Buranchi."
                />
                <p className="text-[11px] text-muted-foreground">Pesan pertama yang dikirim bot saat customer baru memulai percakapan</p>
              </div>
              <div className="space-y-1.5">
                <Label>Tagline / Persona</Label>
                <Textarea
                  value={settings.tagline}
                  onChange={(e) => updateField("tagline", e.target.value)}
                  rows={2}
                />
                <p className="text-[11px] text-muted-foreground">Instruksi kepribadian dan gaya bahasa bot. Bot menggunakan GPT-4o dan memahami Bahasa Indonesia + slang.</p>
              </div>
            </div>

            <div className="border rounded-xl bg-card p-5 space-y-3">
              <h2 className="text-sm font-medium mb-3">Kemampuan</h2>
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-[13px] font-medium">Auto Booking</p>
                  <p className="text-[13px] text-muted-foreground">Bot bisa membuat booking otomatis dari percakapan</p>
                </div>
                <Switch defaultChecked />
              </div>
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-[13px] font-medium">Auto Loyalty Check</p>
                  <p className="text-[13px] text-muted-foreground">Bot bisa cek dan informasikan poin loyalty customer</p>
                </div>
                <Switch defaultChecked />
              </div>
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-[13px] font-medium">Reminder Reservasi</p>
                  <p className="text-[13px] text-muted-foreground">Bot kirim reminder H-1 dan H-3 jam sebelum reservasi</p>
                </div>
                <Switch defaultChecked />
              </div>
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-[13px] font-medium">Feedback Request</p>
                  <p className="text-[13px] text-muted-foreground">Bot minta feedback 5 jam setelah reservasi selesai</p>
                </div>
                <Switch defaultChecked />
              </div>
            </div>

            <div className="border rounded-xl bg-card p-5 space-y-3">
              <h2 className="text-sm font-medium">Eskalasi</h2>
              <div className="space-y-1.5">
                <Label>Keyword Eskalasi ke Agent</Label>
                <Input defaultValue="komplain, manager, marah, refund" />
                <p className="text-[11px] text-muted-foreground">Jika pesan customer mengandung keyword ini, bot akan escalate ke agent manusia</p>
              </div>
            </div>

            <div className="flex justify-end">
              <Button onClick={saveSettings} disabled={saving}>
                {saving ? (
                  <><Loader2 className="size-4 mr-1 animate-spin" /> Menyimpan...</>
                ) : saved ? (
                  <><Check className="size-4 mr-1" /> Tersimpan!</>
                ) : (
                  "Simpan Perubahan"
                )}
              </Button>
            </div>
          </div>
        </TabsContent>

        {/* Notifikasi */}
        <TabsContent value="notifikasi">
          <div className="space-y-4">
            <div className="border rounded-xl bg-card p-5 space-y-4">
              <h2 className="text-sm font-medium mb-3">Notifikasi</h2>
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-[13px] font-medium">Email Notifications</p>
                    <p className="text-[13px] text-muted-foreground">Terima notifikasi via email</p>
                  </div>
                  <Switch checked={emailNotif} onCheckedChange={setEmailNotif} />
                </div>
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-[13px] font-medium">Booking Baru</p>
                    <p className="text-[13px] text-muted-foreground">Notifikasi saat ada booking baru masuk</p>
                  </div>
                  <Switch checked={bookingNotif} onCheckedChange={setBookingNotif} />
                </div>
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-[13px] font-medium">Chat Masuk</p>
                    <p className="text-[13px] text-muted-foreground">Notifikasi saat ada pesan baru dari customer</p>
                  </div>
                  <Switch checked={chatNotif} onCheckedChange={setChatNotif} />
                </div>
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-[13px] font-medium">Campaign Selesai</p>
                    <p className="text-[13px] text-muted-foreground">Notifikasi saat campaign selesai dikirim</p>
                  </div>
                  <Switch checked={campaignNotif} onCheckedChange={setCampaignNotif} />
                </div>
              </div>
            </div>

            <div className="border rounded-xl bg-card p-5 space-y-4">
              <h2 className="text-sm font-medium mb-3">Laporan</h2>
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-[13px] font-medium">Daily Report</p>
                    <p className="text-[13px] text-muted-foreground">Ringkasan harian via email setiap pagi</p>
                  </div>
                  <Switch checked={dailyReport} onCheckedChange={setDailyReport} />
                </div>
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-[13px] font-medium">Weekly Report</p>
                    <p className="text-[13px] text-muted-foreground">Ringkasan mingguan setiap Senin</p>
                  </div>
                  <Switch checked={weeklyReport} onCheckedChange={setWeeklyReport} />
                </div>
              </div>
            </div>

            <div className="flex justify-end">
              <Button>Simpan Perubahan</Button>
            </div>
          </div>
        </TabsContent>
      </Tabs>
    </div>
  );
}
