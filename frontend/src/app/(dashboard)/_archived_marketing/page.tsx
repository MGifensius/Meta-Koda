"use client";

import { useState, useEffect, useCallback } from "react";
import {
  Plus,
  Send,
  Eye,
  Users as UsersIcon,
  Megaphone,
  Copy,
  ChevronDown,
  Info,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
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
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { formatDate, formatNumber, statusBadge } from "@/lib/format";
import { apiFetch } from "@/lib/api-client";
import { readCache, writeCache } from "@/lib/cached-state";
import { useAuth } from "@/lib/role-context";

type Campaign = {
  id: string;
  name: string;
  message: string;
  audience: string;
  target_audience: string;
  audience_count: number;
  status: string;
  scheduled_at: string | null;
  sent_at: string | null;
  delivered: number;
  read: number;
};

const audienceLabel: Record<string, string> = {
  all: "Semua",
  member: "Member",
  "non-member": "Non-Member",
};

export default function MarketingPage() {
  const { tenantId } = useAuth();
  const [tab, setTab] = useState("all");
  const [campaignList, setCampaignList] = useState<Campaign[]>([]);
  const [memberCount, setMemberCount] = useState(0);
  const [nonMemberCount, setNonMemberCount] = useState(0);

  useEffect(() => {
    if (!tenantId) return;
    const cached = readCache<Campaign[]>(`campaigns:${tenantId}`);
    if (cached && cached.length > 0) setCampaignList(cached);
  }, [tenantId]);
  const [formOpen, setFormOpen] = useState(false);
  const [formName, setFormName] = useState("");
  const [formMessage, setFormMessage] = useState("");
  const [formAudience, setFormAudience] = useState("all");
  const [formSchedule, setFormSchedule] = useState("");
  const [formTemplateName, setFormTemplateName] = useState("");
  const [formTemplateLanguage, setFormTemplateLanguage] = useState("id");
  const [formTemplateParams, setFormTemplateParams] = useState("");
  const [useTemplate, setUseTemplate] = useState(false);

  const fetchCampaigns = useCallback(async () => {
    try {
      const res = await apiFetch("/marketing/campaigns");
      const data = await res.json();
      setCampaignList(data);
      if (tenantId) writeCache(`campaigns:${tenantId}`, data);
    } catch (err) {
      console.error(err);
    }
  }, [tenantId]);

  const fetchCustomerCounts = useCallback(async () => {
    try {
      const res = await apiFetch("/customers/");
      const data: { is_member: boolean }[] = await res.json();
      setMemberCount(data.filter((c) => c.is_member).length);
      setNonMemberCount(data.filter((c) => !c.is_member).length);
    } catch (err) {
      console.error(err);
    }
  }, []);

  useEffect(() => {
    fetchCampaigns();
    fetchCustomerCounts();
  }, [fetchCampaigns, fetchCustomerCounts]);

  const createCampaign = async (status: "draft" | "sent") => {
    if (!formName.trim() || !formMessage.trim()) return;
    try {
      // Only send template fields when the advanced toggle is actually on,
      // so a half-filled-then-collapsed template doesn't sneak through.
      const templateName = useTemplate ? formTemplateName.trim() || null : null;
      const templateLanguage = useTemplate ? formTemplateLanguage : "id";
      const templateParams = useTemplate
        ? formTemplateParams.split(",").map((p) => p.trim()).filter(Boolean)
        : [];

      const createRes = await apiFetch("/marketing/campaigns", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: formName,
          message: formMessage,
          audience: formAudience,
          target_audience: formAudience,
          scheduled_at: formSchedule || null,
          template_name: templateName,
          template_language: templateLanguage,
          template_params: templateParams,
        }),
      });
      const created = await createRes.json();
      if (status === "sent" && created?.id) {
        await apiFetch(`/marketing/campaigns/${created.id}/send`, {
          method: "POST",
        });
      }
      await fetchCampaigns();
      setFormOpen(false);
      setFormName("");
      setFormMessage("");
      setFormAudience("all");
      setFormSchedule("");
      setFormTemplateName("");
      setFormTemplateLanguage("id");
      setFormTemplateParams("");
      setUseTemplate(false);
    } catch (err) {
      console.error(err);
    }
  };

  const sendExistingCampaign = async (id: string) => {
    try {
      const res = await apiFetch(`/marketing/campaigns/${id}/send`, {
        method: "POST",
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      await fetchCampaigns();
    } catch (err) {
      console.error(err);
    }
  };

  const duplicateCampaign = (c: Campaign) => {
    setFormName(`${c.name} (copy)`);
    setFormMessage(c.message);
    setFormAudience(c.target_audience || "all");
    setFormSchedule("");
    setFormTemplateName("");
    setFormTemplateLanguage("en_US");
    setFormTemplateParams("");
    setFormOpen(true);
  };

  const totalSent = campaignList.reduce((s, c) => s + c.delivered, 0);
  const totalRead = campaignList.reduce((s, c) => s + c.read, 0);
  const readRate = totalSent > 0 ? Math.round((totalRead / totalSent) * 100) : 0;

  const stats = [
    { value: String(campaignList.length), label: "Campaigns" },
    { value: formatNumber(totalSent), label: "Terkirim" },
    { value: `${readRate}%`, label: "Read Rate" },
    { value: `${memberCount} / ${nonMemberCount}`, label: "Member / Non" },
  ];

  const filteredCampaigns = tab === "all" ? campaignList : campaignList.filter((c) => c.status === tab);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-lg font-semibold">Marketing</h1>
        <Dialog open={formOpen} onOpenChange={setFormOpen}>
          <DialogTrigger render={<Button className="rounded-md h-9 px-3 gap-1.5 text-[13px]" />}>
            <Plus className="size-4" /> Buat Campaign
          </DialogTrigger>
          <DialogContent className="sm:max-w-md">
            <DialogHeader>
              <DialogTitle>Campaign Baru</DialogTitle>
            </DialogHeader>
            <div className="space-y-3">
              <div className="space-y-1.5">
                <Label>Nama Campaign</Label>
                <Input
                  placeholder="contoh: Promo Weekend 20%"
                  value={formName}
                  onChange={(e) => setFormName(e.target.value)}
                />
                <p className="text-[11px] text-muted-foreground">
                  Cuma buat referensi kamu — customer tidak melihat nama ini.
                </p>
              </div>

              <div className="space-y-1.5">
                <Label>Isi Pesan</Label>
                <Textarea
                  placeholder="Halo Kak {name}! Akhir pekan ini diskon 20% di restoran kami..."
                  rows={5}
                  value={formMessage}
                  onChange={(e) => setFormMessage(e.target.value)}
                />
                <div className="flex items-start gap-1.5 text-[11px] text-muted-foreground">
                  <Info className="size-3 mt-0.5 shrink-0" />
                  <span>
                    Tulis <code className="bg-secondary px-1 rounded">{"{name}"}</code> di tempat yang ingin diganti nama customer.
                  </span>
                </div>
                {formMessage.trim() && (
                  <div className="rounded-lg border bg-secondary/40 p-2.5 mt-2">
                    <p className="text-[10px] font-mono-label uppercase tracking-wider ink-4 mb-1">
                      Preview untuk "Kak Marchel"
                    </p>
                    <p className="text-[12px] whitespace-pre-line leading-snug">
                      {formMessage.replace(/\{name\}/g, "Marchel")}
                    </p>
                  </div>
                )}
              </div>

              <div className="space-y-1.5">
                <Label>Kirim ke siapa?</Label>
                <Select value={formAudience} onValueChange={(v) => setFormAudience(v ?? "all")}>
                  <SelectTrigger className="w-full">
                    <SelectValue>
                      {(v: string | null) =>
                        ({
                          all: "Semua customer",
                          member: "Hanya Member",
                          "non-member": "Hanya Non-Member",
                        }[v || ""] ?? v)
                      }
                    </SelectValue>
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">Semua customer</SelectItem>
                    <SelectItem value="member">Hanya Member</SelectItem>
                    <SelectItem value="non-member">Hanya Non-Member</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-1.5">
                <Label>Jadwal Kirim (opsional)</Label>
                <Input
                  type="datetime-local"
                  value={formSchedule}
                  onChange={(e) => setFormSchedule(e.target.value)}
                />
                <p className="text-[11px] text-muted-foreground">
                  Kosongkan kalau mau kirim sekarang atau simpan sebagai draft.
                </p>
              </div>

              {/* Advanced: WhatsApp template (hidden by default) */}
              <div className="pt-3 border-t">
                <button
                  type="button"
                  onClick={() => setUseTemplate((v) => !v)}
                  className="w-full flex items-center justify-between text-left group"
                >
                  <div>
                    <p className="text-[13px] font-medium">
                      Pakai Template WhatsApp Resmi
                    </p>
                    <p className="text-[11px] text-muted-foreground mt-0.5">
                      Untuk customer yang belum pernah chat. Perlu approval Meta dulu.
                    </p>
                  </div>
                  <ChevronDown
                    className={`size-4 text-muted-foreground transition-transform ${useTemplate ? "rotate-180" : ""}`}
                  />
                </button>

                {useTemplate && (
                  <div className="space-y-3 mt-3 pt-3 border-t border-dashed">
                    <div className="rounded-lg bg-amber-50 border border-amber-200 px-3 py-2 text-[11.5px] text-amber-900 leading-snug">
                      <strong>Kapan butuh ini?</strong> WhatsApp tidak mengizinkan blast
                      teks bebas ke customer yang belum pernah chat 24 jam terakhir. Kalau
                      itu kondisinya, pakai template resmi yang sudah di-approve Meta.
                      Kalau customer sudah pernah chat, biarkan kosong — pesan teks
                      biasa sudah cukup.
                    </div>
                    <div className="space-y-1.5">
                      <Label>Nama Template Meta</Label>
                      <Input
                        placeholder="contoh: weekend_promo"
                        value={formTemplateName}
                        onChange={(e) => setFormTemplateName(e.target.value)}
                      />
                      <p className="text-[11px] text-muted-foreground">
                        Sama persis dengan yang kamu daftarkan di Meta Business Manager.
                      </p>
                    </div>
                    <div className="space-y-1.5">
                      <Label>Bahasa Template</Label>
                      <Select
                        value={formTemplateLanguage}
                        onValueChange={(v) => setFormTemplateLanguage(v ?? "id")}
                      >
                        <SelectTrigger className="w-full">
                          <SelectValue>
                            {(v: string | null) =>
                              ({
                                id: "Bahasa Indonesia",
                                en: "English",
                                en_US: "English (US)",
                              }[v || ""] ?? v)
                            }
                          </SelectValue>
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="id">Bahasa Indonesia</SelectItem>
                          <SelectItem value="en">English</SelectItem>
                          <SelectItem value="en_US">English (US)</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-1.5">
                      <Label>Isian Variabel Template</Label>
                      <Input
                        placeholder="contoh: {{customer_name}}, 20%"
                        value={formTemplateParams}
                        onChange={(e) => setFormTemplateParams(e.target.value)}
                      />
                      <p className="text-[11px] text-muted-foreground leading-snug">
                        Pisahkan dengan koma sesuai urutan <code className="bg-secondary px-1 rounded">{"{{1}}, {{2}}, ..."}</code> di
                        template. Tulis <code className="bg-secondary px-1 rounded">{"{{customer_name}}"}</code> untuk
                        auto-ganti dengan nama customer.
                      </p>
                    </div>
                  </div>
                )}
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => createCampaign("draft")}>
                Simpan Draft
              </Button>
              <Button onClick={() => createCampaign("sent")}>Kirim Sekarang</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>

      <div className="grid grid-cols-4 gap-4">
        {stats.map((s) => (
          <div key={s.label} className="rounded-xl border bg-card px-5 py-4">
            <p className="text-2xl font-semibold tracking-tight">{s.value}</p>
            <p className="text-[13px] text-muted-foreground">{s.label}</p>
          </div>
        ))}
      </div>

      <Tabs value={tab} onValueChange={(v) => setTab(v ?? "all")}>
        <TabsList>
          <TabsTrigger value="all">Semua</TabsTrigger>
          <TabsTrigger value="sent">Terkirim</TabsTrigger>
          <TabsTrigger value="scheduled">Terjadwal</TabsTrigger>
          <TabsTrigger value="draft">Draft</TabsTrigger>
        </TabsList>

        <TabsContent value={tab}>
          <div className="space-y-3">
            {filteredCampaigns.map((c) => (
              <div key={c.id} className="border rounded-xl bg-card p-4 space-y-2">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Megaphone className="size-4 text-muted-foreground" />
                    <p className="text-[13px] font-medium">{c.name}</p>
                    <span className={`text-[11px] font-medium px-2 py-0.5 rounded capitalize ${
                      c.target_audience === "member" ? "text-purple-700 bg-purple-50"
                        : c.target_audience === "non-member" ? "text-orange-700 bg-orange-50"
                        : "text-gray-500 bg-gray-100"
                    }`}>
                      {audienceLabel[c.target_audience] ?? c.target_audience}
                    </span>
                  </div>
                  <span className={`text-[11px] font-medium px-2 py-0.5 rounded capitalize ${statusBadge(c.status)}`}>
                    {c.status}
                  </span>
                </div>
                <p className="text-[13px] text-muted-foreground line-clamp-2">{c.message}</p>
                <div className="flex items-center justify-between gap-3">
                  <div className="flex items-center gap-5 text-[13px] text-muted-foreground">
                    <span className="flex items-center gap-1">
                      <UsersIcon className="size-3.5" />
                      {formatNumber(c.audience_count)} audience
                    </span>
                    {c.delivered > 0 && (
                      <span className="flex items-center gap-1">
                        <Send className="size-3.5" />
                        {formatNumber(c.delivered)} terkirim
                      </span>
                    )}
                    {c.read > 0 && (
                      <span className="flex items-center gap-1">
                        <Eye className="size-3.5" />
                        {formatNumber(c.read)} dibaca
                      </span>
                    )}
                    {c.sent_at && <span>Dikirim {formatDate(c.sent_at)}</span>}
                    {c.scheduled_at && !c.sent_at && <span>Dijadwalkan {formatDate(c.scheduled_at)}</span>}
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    {(c.status === "draft" || c.status === "scheduled") && (
                      <Button
                        size="sm"
                        variant="default"
                        className="h-7 gap-1.5"
                        onClick={() => sendExistingCampaign(c.id)}
                      >
                        <Send className="size-3.5" />
                        Kirim Sekarang
                      </Button>
                    )}
                    {c.status === "sent" && (
                      <Button
                        size="sm"
                        variant="outline"
                        className="h-7 gap-1.5"
                        onClick={() => duplicateCampaign(c)}
                      >
                        <Copy className="size-3.5" />
                        Duplikat
                      </Button>
                    )}
                  </div>
                </div>
              </div>
            ))}
            {filteredCampaigns.length === 0 && (
              <p className="text-[13px] text-muted-foreground text-center py-8">Tidak ada campaign.</p>
            )}
          </div>
        </TabsContent>
      </Tabs>
    </div>
  );
}
