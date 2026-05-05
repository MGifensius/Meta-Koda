"use client";

import { useCallback, useEffect, useState } from "react";
import {
  Plus,
  Calendar,
  AlertCircle,
  ShieldCheck,
  Loader2,
  Mail,
  Phone,
  Hash,
  X,
  RefreshCw,
  MessageCircle,
  CheckCircle2,
  Trash2,
} from "lucide-react";
import { useAuth } from "@/lib/role-context";
import { apiFetch } from "@/lib/api-client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

type ActiveSubscription = {
  id: string;
  status: string;
  billing_cycle: string;
  started_at: string;
  expires_at: string;
  notes: string | null;
};

type Tenant = {
  id: string;
  business_name: string;
  business_type: string;
  slug: string;
  tenant_code: string;
  email: string | null;
  phone: string | null;
  address: string | null;
  status: string;
  subscription_status: string;
  trial_ends_at: string | null;
  created_at: string;
  active_subscription: ActiveSubscription | null;
};

const DURATION_PRESETS: { label: string; months: number }[] = [
  { label: "1 month", months: 1 },
  { label: "3 months", months: 3 },
  { label: "6 months", months: 6 },
  { label: "1 year", months: 12 },
  { label: "2 years", months: 24 },
];

function nextFirstOfMonth(now: Date): Date {
  if (now.getUTCDate() === 1 && now.getUTCHours() === 0) return now;
  return new Date(
    Date.UTC(
      now.getUTCMonth() === 11 ? now.getUTCFullYear() + 1 : now.getUTCFullYear(),
      (now.getUTCMonth() + 1) % 12,
      1,
    ),
  );
}

function addMonths(d: Date, n: number): Date {
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + n, 1));
}

const STATUS_BADGE: Record<string, string> = {
  active: "bg-emerald-100 text-emerald-800",
  trial: "bg-sky-100 text-sky-800",
  past_due: "bg-amber-100 text-amber-800",
  expired: "bg-red-100 text-red-800",
  cancelled: "bg-stone-200 text-stone-700",
};

function fmtDate(iso: string | null): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString("en-US", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

function fmtStatus(s: string): string {
  if (!s) return "—";
  return s
    .split("_")
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(" ");
}


function daysFromNow(iso: string | null): number | null {
  if (!iso) return null;
  const ms = new Date(iso).getTime() - Date.now();
  return Math.ceil(ms / (24 * 3600 * 1000));
}

export default function SuperAdminPage() {
  const { role, isLoading: authLoading } = useAuth();
  const [tenants, setTenants] = useState<Tenant[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  // Create-tenant dialog
  const [createOpen, setCreateOpen] = useState(false);
  const [creating, setCreating] = useState(false);
  const [cBusinessName, setCBusinessName] = useState("");
  const [cOwnerEmail, setCOwnerEmail] = useState("");
  const [cOwnerPassword, setCOwnerPassword] = useState("");
  const [cOwnerName, setCOwnerName] = useState("");
  const [createError, setCreateError] = useState("");
  const [createSuccess, setCreateSuccess] = useState("");

  // Detail dialog
  const [detailOpen, setDetailOpen] = useState(false);
  const [detailTenant, setDetailTenant] = useState<Tenant | null>(null);
  const [detailSaving, setDetailSaving] = useState(false);
  const [detailError, setDetailError] = useState("");
  const [dBusinessName, setDBusinessName] = useState("");
  const [dEmail, setDEmail] = useState("");
  const [dPhone, setDPhone] = useState("");

  // WhatsApp accounts for the open tenant
  type WAAccount = {
    id: string;
    phone_number_id: string;
    waba_id: string | null;
    display_phone: string | null;
    business_name: string | null;
    is_active: boolean;
    status: "pending" | "connected" | "disconnected" | "error";
    status_reason: string | null;
    last_verified_at: string | null;
  };
  const [waAccounts, setWaAccounts] = useState<WAAccount[]>([]);
  const [waLoading, setWaLoading] = useState(false);
  const [waSaving, setWaSaving] = useState(false);
  const [waError, setWaError] = useState("");
  const [waPhoneNumberId, setWaPhoneNumberId] = useState("");
  const [waAccessToken, setWaAccessToken] = useState("");
  const [waWabaId, setWaWabaId] = useState("");

  // Extend dialog
  const [extendOpen, setExtendOpen] = useState(false);
  const [extendTarget, setExtendTarget] = useState<Tenant | null>(null);
  const [extending, setExtending] = useState(false);
  const [eMonths, setEMonths] = useState("1");
  const [eNotes, setENotes] = useState("");
  const [extendError, setExtendError] = useState("");

  const fetchAll = useCallback(async () => {
    try {
      const tRes = await apiFetch("/admin/tenants");
      if (!tRes.ok) {
        if (tRes.status === 403) {
          setError("Access denied — only super_admin can open this page.");
        } else {
          setError(`Failed to load (${tRes.status})`);
        }
        return;
      }
      setTenants(await tRes.json());
      setError("");
    } catch (err) {
      console.error(err);
      setError("Network error.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!authLoading && role === "super_admin") {
      fetchAll();
    } else if (!authLoading) {
      setLoading(false);
      setError("This page is for super_admin only.");
    }
  }, [authLoading, role, fetchAll]);

  const resetCreateForm = () => {
    setCBusinessName("");
    setCOwnerEmail("");
    setCOwnerPassword("");
    setCOwnerName("");
    setCreateError("");
    setCreateSuccess("");
  };

  const submitCreate = async () => {
    setCreateError("");
    setCreateSuccess("");
    if (
      !cBusinessName.trim() ||
      !cOwnerEmail.trim() ||
      cOwnerPassword.length < 8
    ) {
      setCreateError("Business name, owner email, and password (8+ chars) are required.");
      return;
    }
    setCreating(true);
    try {
      const res = await apiFetch("/admin/tenants", {
        method: "POST",
        body: JSON.stringify({
          business_name: cBusinessName.trim(),
          owner_email: cOwnerEmail.trim().toLowerCase(),
          owner_password: cOwnerPassword,
          owner_name: cOwnerName.trim() || undefined,
        }),
      });
      if (!res.ok) {
        const j = await res.json().catch(() => ({} as { detail?: string }));
        setCreateError(j.detail || `HTTP ${res.status}`);
        return;
      }
      setCreateSuccess(
        `Tenant "${cBusinessName}" created. Owner login: ${cOwnerEmail}`,
      );
      await fetchAll();
    } catch (err) {
      console.error(err);
      setCreateError("Network error.");
    } finally {
      setCreating(false);
    }
  };

  const openDetail = (t: Tenant) => {
    setDetailTenant(t);
    setDBusinessName(t.business_name);
    setDEmail(t.email ?? "");
    setDPhone(t.phone ?? "");
    setDetailError("");
    setDetailOpen(true);
    fetchWaAccounts(t.id);
  };

  const fetchWaAccounts = async (tenantId: string) => {
    setWaLoading(true);
    setWaError("");
    try {
      const res = await apiFetch(`/admin/tenants/${tenantId}/whatsapp`);
      if (!res.ok) {
        setWaError(`Failed to load WhatsApp accounts (${res.status})`);
        return;
      }
      setWaAccounts(await res.json());
    } catch {
      setWaError("Network error.");
    } finally {
      setWaLoading(false);
    }
  };

  const submitWaAdd = async () => {
    if (!detailTenant) return;
    if (!waPhoneNumberId.trim() || !waAccessToken.trim()) {
      setWaError("Phone Number ID and Access Token are required.");
      return;
    }
    setWaSaving(true);
    setWaError("");
    try {
      const res = await apiFetch(
        `/admin/tenants/${detailTenant.id}/whatsapp`,
        {
          method: "POST",
          body: JSON.stringify({
            phone_number_id: waPhoneNumberId.trim(),
            access_token: waAccessToken.trim(),
            waba_id: waWabaId.trim() || undefined,
          }),
        },
      );
      if (!res.ok) {
        const j = await res.json().catch(() => ({} as { detail?: string }));
        setWaError(j.detail || `HTTP ${res.status}`);
        return;
      }
      setWaPhoneNumberId("");
      setWaAccessToken("");
      setWaWabaId("");
      await fetchWaAccounts(detailTenant.id);
    } catch {
      setWaError("Network error.");
    } finally {
      setWaSaving(false);
    }
  };

  const verifyWaAccount = async (id: string) => {
    if (!detailTenant) return;
    try {
      await apiFetch(`/admin/whatsapp/${id}/verify`, { method: "POST" });
      await fetchWaAccounts(detailTenant.id);
    } catch (err) {
      console.error(err);
    }
  };

  const deleteWaAccount = async (id: string) => {
    if (!detailTenant) return;
    if (!confirm("Remove this WhatsApp account?")) return;
    try {
      await apiFetch(`/admin/whatsapp/${id}`, { method: "DELETE" });
      await fetchWaAccounts(detailTenant.id);
    } catch (err) {
      console.error(err);
    }
  };

  const submitDetailSave = async () => {
    if (!detailTenant) return;
    setDetailError("");
    setDetailSaving(true);
    try {
      const res = await apiFetch(`/admin/tenants/${detailTenant.id}`, {
        method: "PATCH",
        body: JSON.stringify({
          business_name: dBusinessName.trim(),
          email: dEmail.trim() || null,
          phone: dPhone.trim() || null,
        }),
      });
      if (!res.ok) {
        const j = await res.json().catch(() => ({} as { detail?: string }));
        setDetailError(j.detail || `HTTP ${res.status}`);
        return;
      }
      await fetchAll();
      setDetailOpen(false);
    } catch (err) {
      console.error(err);
      setDetailError("Network error.");
    } finally {
      setDetailSaving(false);
    }
  };

  const openExtendFromDetail = () => {
    if (!detailTenant) return;
    setExtendTarget(detailTenant);
    setEMonths("1");
    setENotes("");
    setExtendError("");
    setDetailOpen(false);
    setExtendOpen(true);
  };

  const openExtend = (t: Tenant) => {
    setExtendTarget(t);
    setEMonths("1");
    setENotes("");
    setExtendError("");
    setExtendOpen(true);
  };

  const submitExtend = async () => {
    if (!extendTarget) return;
    setExtendError("");
    setExtending(true);
    try {
      const res = await apiFetch(`/admin/tenants/${extendTarget.id}/extend`, {
        method: "POST",
        body: JSON.stringify({
          months: parseInt(eMonths) || 1,
          notes: eNotes.trim() || undefined,
        }),
      });
      if (!res.ok) {
        const j = await res.json().catch(() => ({} as { detail?: string }));
        setExtendError(j.detail || `HTTP ${res.status}`);
        return;
      }
      await fetchAll();
      setExtendOpen(false);
    } catch (err) {
      console.error(err);
      setExtendError("Network error.");
    } finally {
      setExtending(false);
    }
  };

  const reactivateTenant = async () => {
    if (!detailTenant) return;
    if (!confirm(`Reactivate ${detailTenant.business_name} for 30 days?`)) return;
    try {
      const res = await apiFetch(
        `/admin/tenants/${detailTenant.id}/reactivate`,
        { method: "POST", body: JSON.stringify({ days: 30 }) },
      );
      if (!res.ok) {
        const j = await res.json().catch(() => ({} as { detail?: string }));
        setDetailError(j.detail || `HTTP ${res.status}`);
        return;
      }
      await fetchAll();
      setDetailOpen(false);
    } catch (err) {
      console.error(err);
      setDetailError("Network error.");
    }
  };

  const cancelTenant = async () => {
    if (!detailTenant) return;
    if (
      !confirm(
        `Cancel ${detailTenant.business_name}'s subscription? Tenant users will be locked out immediately.`,
      )
    ) {
      return;
    }
    try {
      const res = await apiFetch(`/admin/tenants/${detailTenant.id}/cancel`, {
        method: "POST",
        body: JSON.stringify({ notes: "Cancelled via admin console" }),
      });
      if (!res.ok) {
        const j = await res.json().catch(() => ({} as { detail?: string }));
        setDetailError(j.detail || `HTTP ${res.status}`);
        return;
      }
      await fetchAll();
      setDetailOpen(false);
    } catch (err) {
      console.error(err);
      setDetailError("Network error.");
    }
  };

  if (authLoading || loading) {
    return (
      <div className="flex items-center justify-center py-20 text-muted-foreground">
        <Loader2 className="size-5 animate-spin mr-2" /> Loading…
      </div>
    );
  }

  if (error) {
    return (
      <div className="border rounded-xl bg-card p-8 text-center">
        <AlertCircle className="size-8 text-red-600 mx-auto mb-2" />
        <p className="text-[14px] font-medium">{error}</p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <div className="flex items-center gap-2">
            <ShieldCheck className="size-5 text-primary" />
            <h1 className="text-lg font-semibold">Super Admin Console</h1>
          </div>
          <p className="text-[12px] text-muted-foreground mt-0.5">
            {tenants.length} tenant{tenants.length === 1 ? "" : "s"} registered
          </p>
        </div>
        <Button
          onClick={() => {
            resetCreateForm();
            setCreateOpen(true);
          }}
          className="rounded-md h-9 px-3 gap-1.5 text-[13px]"
        >
          <Plus className="size-4" /> Add Tenant
        </Button>
      </div>

      {/* Tenant table */}
      <div className="border rounded-xl bg-card overflow-hidden">
        <table className="w-full text-[13px]">
          <thead className="bg-secondary/50 text-[11px] font-mono-label uppercase tracking-wider ink-3">
            <tr>
              <th className="text-left px-4 py-2.5">Tenant</th>
              <th className="text-left px-4 py-2.5">Status</th>
              <th className="text-left px-4 py-2.5">Expires</th>
              <th className="text-right px-4 py-2.5">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {tenants.length === 0 ? (
              <tr>
                <td colSpan={4} className="text-center py-12 text-muted-foreground">
                  No tenants yet. Click "Add Tenant" to create the first one.
                </td>
              </tr>
            ) : (
              tenants.map((t) => {
                const expires =
                  t.active_subscription?.expires_at ?? t.trial_ends_at;
                const days = daysFromNow(expires);
                const expiringSoon =
                  days !== null && days <= 7 && days >= 0;
                return (
                  <tr
                    key={t.id}
                    className="hover:bg-secondary/30 transition-colors cursor-pointer"
                    onClick={() => openDetail(t)}
                  >
                    <td className="px-4 py-3">
                      <div className="font-medium">{t.business_name}</div>
                      <div className="text-[11px] text-muted-foreground font-mono-label">
                        {t.tenant_code} · {t.email || "no email"}
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      <span
                        className={`inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-medium ${
                          STATUS_BADGE[t.subscription_status] ?? "bg-stone-100"
                        }`}
                      >
                        {fmtStatus(t.subscription_status)}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-1.5">
                        <Calendar className="size-3.5 text-muted-foreground" />
                        <span>{fmtDate(expires)}</span>
                      </div>
                      {days !== null && (
                        <div
                          className={`text-[11px] ${
                            days < 0
                              ? "text-red-600"
                              : expiringSoon
                              ? "text-amber-600"
                              : "text-muted-foreground"
                          }`}
                        >
                          {days < 0 ? `${-days} days overdue` : `${days} days left`}
                        </div>
                      )}
                    </td>
                    <td className="px-4 py-3 text-right">
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={(e) => {
                          e.stopPropagation();
                          openExtend(t);
                        }}
                        className="h-7 rounded-md text-[12px]"
                      >
                        {t.subscription_status === "active" ||
                        t.subscription_status === "trial"
                          ? "Extend"
                          : "Reactivate"}
                      </Button>
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>

      {/* Detail / Edit dialog */}
      <Dialog open={detailOpen} onOpenChange={setDetailOpen}>
        <DialogContent className="sm:max-w-lg max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              {detailTenant?.business_name ?? "Tenant"}
              {detailTenant && (
                <span
                  className={`text-[11px] font-medium px-2 py-0.5 rounded-full ${
                    STATUS_BADGE[detailTenant.subscription_status] ?? "bg-stone-100"
                  }`}
                >
                  {fmtStatus(detailTenant.subscription_status)}
                </span>
              )}
            </DialogTitle>
          </DialogHeader>

          {detailTenant ? (
            <div className="space-y-3">
              <div>
                <Label>Business Name</Label>
                <Input
                  value={dBusinessName}
                  onChange={(e) => setDBusinessName(e.target.value)}
                />
              </div>
              <div>
                <Label className="flex items-center gap-1.5">
                  <Hash className="size-3.5" /> Restaurant ID
                </Label>
                <Input
                  value={detailTenant.tenant_code}
                  readOnly
                  className="font-mono-label bg-secondary/40"
                />
                <p className="text-[11px] text-muted-foreground mt-1">
                  Auto-generated permanent identifier. Cannot be changed.
                </p>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label className="flex items-center gap-1.5">
                    <Mail className="size-3.5" /> Email
                  </Label>
                  <Input
                    type="email"
                    value={dEmail}
                    onChange={(e) => setDEmail(e.target.value)}
                  />
                </div>
                <div>
                  <Label className="flex items-center gap-1.5">
                    <Phone className="size-3.5" /> Phone Number
                  </Label>
                  <Input
                    value={dPhone}
                    onChange={(e) => setDPhone(e.target.value)}
                  />
                </div>
              </div>

              {/* Subscription summary */}
              <div className="border rounded-md bg-secondary/30 px-3 py-2 text-[12px]">
                <div className="flex items-center justify-between">
                  <span className="font-mono-label uppercase tracking-wider text-[10px] ink-3">
                    Subscription
                  </span>
                  <span
                    className={`inline-flex px-1.5 py-0.5 rounded text-[10px] font-medium ${
                      STATUS_BADGE[detailTenant.subscription_status] ?? "bg-stone-100"
                    }`}
                  >
                    {fmtStatus(detailTenant.subscription_status)}
                  </span>
                </div>
                <div className="mt-1.5 flex items-center justify-between text-muted-foreground">
                  <span>
                    {detailTenant.subscription_status === "expired" ||
                    detailTenant.subscription_status === "cancelled"
                      ? "Tenant is locked out"
                      : "Access valid until"}
                  </span>
                  <span className="text-foreground">
                    {fmtDate(
                      detailTenant.active_subscription?.expires_at ??
                        detailTenant.trial_ends_at,
                    )}
                  </span>
                </div>
              </div>

              {/* WhatsApp accounts */}
              <div className="border rounded-md bg-secondary/20 px-3 py-2.5 space-y-2">
                <div className="flex items-center justify-between">
                  <span className="font-mono-label uppercase tracking-wider text-[10px] ink-3 inline-flex items-center gap-1.5">
                    <MessageCircle className="size-3.5" />
                    WhatsApp Account
                  </span>
                  {waLoading && <Loader2 className="size-3.5 animate-spin text-muted-foreground" />}
                </div>
                {waAccounts.length === 0 && !waLoading ? (
                  <p className="text-[11px] text-muted-foreground italic">
                    No WABA connected. Add one below.
                  </p>
                ) : (
                  <div className="space-y-1.5">
                    {waAccounts.map((a) => (
                      <div
                        key={a.id}
                        className="flex items-center justify-between gap-2 text-[12px] border bg-card rounded px-2.5 py-1.5"
                      >
                        <div className="min-w-0">
                          <div className="font-medium truncate">
                            {a.display_phone || a.phone_number_id}
                          </div>
                          <div className="text-[10px] text-muted-foreground truncate">
                            {a.business_name || "—"} ·{" "}
                            <span
                              className={
                                a.status === "connected"
                                  ? "text-emerald-700"
                                  : a.status === "error"
                                  ? "text-red-600"
                                  : "text-muted-foreground"
                              }
                            >
                              {a.status}
                            </span>
                          </div>
                          {a.status_reason && (
                            <div className="text-[10px] text-red-600 truncate">
                              {a.status_reason}
                            </div>
                          )}
                        </div>
                        <div className="flex items-center gap-1 shrink-0">
                          <button
                            type="button"
                            onClick={() => verifyWaAccount(a.id)}
                            className="size-6 rounded hover:bg-secondary inline-flex items-center justify-center text-muted-foreground hover:text-foreground"
                            title="Verify with Meta"
                          >
                            <RefreshCw className="size-3.5" />
                          </button>
                          <button
                            type="button"
                            onClick={() => deleteWaAccount(a.id)}
                            className="size-6 rounded hover:bg-red-50 inline-flex items-center justify-center text-muted-foreground hover:text-red-600"
                            title="Remove"
                          >
                            <Trash2 className="size-3.5" />
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}

                <div className="border-t pt-2 space-y-1.5">
                  <div className="text-[10px] font-mono-label uppercase tracking-wider ink-3">
                    Add WABA
                  </div>
                  <Input
                    placeholder="phone_number_id (Meta)"
                    value={waPhoneNumberId}
                    onChange={(e) => setWaPhoneNumberId(e.target.value)}
                    className="text-[12px] h-8"
                  />
                  <Input
                    placeholder="access_token"
                    value={waAccessToken}
                    onChange={(e) => setWaAccessToken(e.target.value)}
                    className="text-[12px] h-8 font-mono"
                  />
                  <Input
                    placeholder="waba_id (optional)"
                    value={waWabaId}
                    onChange={(e) => setWaWabaId(e.target.value)}
                    className="text-[12px] h-8"
                  />
                  {waError && (
                    <p className="text-[11px] text-red-600 inline-flex items-start gap-1">
                      <AlertCircle className="size-3 mt-0.5 shrink-0" />
                      {waError}
                    </p>
                  )}
                  <Button
                    onClick={submitWaAdd}
                    disabled={waSaving}
                    size="sm"
                    className="w-full h-8 text-[12px]"
                  >
                    {waSaving ? (
                      <Loader2 className="size-3.5 mr-1 animate-spin" />
                    ) : (
                      <CheckCircle2 className="size-3.5 mr-1" />
                    )}
                    Verify & Save
                  </Button>
                </div>
              </div>

              {detailError && (
                <p className="text-[12px] text-red-600 flex items-start gap-1.5">
                  <AlertCircle className="size-3.5 mt-0.5 shrink-0" />
                  <span>{detailError}</span>
                </p>
              )}
            </div>
          ) : null}

          <DialogFooter className="gap-2 flex-wrap">
            {detailTenant &&
              (detailTenant.subscription_status === "expired" ||
                detailTenant.subscription_status === "cancelled") && (
                <Button
                  variant="outline"
                  onClick={reactivateTenant}
                  className="text-emerald-700 hover:text-emerald-800"
                >
                  <RefreshCw className="size-4 mr-1" /> Reactivate
                </Button>
              )}
            {detailTenant?.subscription_status === "active" && (
              <Button
                variant="outline"
                onClick={cancelTenant}
                className="text-red-600 hover:text-red-700"
              >
                <X className="size-4 mr-1" /> Deactivate
              </Button>
            )}
            <Button variant="outline" onClick={openExtendFromDetail}>
              <Calendar className="size-4 mr-1" /> Extend
            </Button>
            <Button onClick={submitDetailSave} disabled={detailSaving}>
              {detailSaving && <Loader2 className="size-4 mr-1.5 animate-spin" />}
              Save
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Create tenant dialog */}
      <Dialog
        open={createOpen}
        onOpenChange={(open) => {
          setCreateOpen(open);
          if (!open) resetCreateForm();
        }}
      >
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Add New Tenant</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div>
              <Label>Business Name</Label>
              <Input
                value={cBusinessName}
                onChange={(e) => setCBusinessName(e.target.value)}
                placeholder="e.g. Kopi ABC"
              />
              <p className="text-[11px] text-muted-foreground mt-1">
                Restaurant ID will be auto-generated as MK-{String(tenants.length + 1).padStart(3, "0")}-{cBusinessName || "..."}
              </p>
            </div>
            <div>
              <Label>Owner Email</Label>
              <Input
                type="email"
                value={cOwnerEmail}
                onChange={(e) => setCOwnerEmail(e.target.value)}
                placeholder="owner@kopi-abc.id"
              />
              <p className="text-[11px] text-muted-foreground mt-1">
                New tenants get a 7-day trial. After that, extend manually once they pay.
              </p>
            </div>
            <div>
              <Label>Owner Password (initial)</Label>
              <Input
                type="text"
                value={cOwnerPassword}
                onChange={(e) => setCOwnerPassword(e.target.value)}
                placeholder="min. 8 characters"
              />
              <p className="text-[11px] text-muted-foreground mt-1">
                Owner can change after first login.
              </p>
            </div>
            <div>
              <Label>Owner Name (optional)</Label>
              <Input
                value={cOwnerName}
                onChange={(e) => setCOwnerName(e.target.value)}
                placeholder="Mr. Budi"
              />
            </div>
            {createError && (
              <p className="text-[12px] text-red-600 flex items-start gap-1.5">
                <AlertCircle className="size-3.5 mt-0.5 shrink-0" />
                <span>{createError}</span>
              </p>
            )}
            {createSuccess && (
              <p className="text-[12px] text-emerald-700 bg-emerald-50 border border-emerald-200 rounded p-2">
                {createSuccess}
              </p>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setCreateOpen(false)}>
              Close
            </Button>
            <Button onClick={submitCreate} disabled={creating}>
              {creating && <Loader2 className="size-4 mr-1.5 animate-spin" />}
              Create Tenant
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Extend dialog */}
      <Dialog open={extendOpen} onOpenChange={setExtendOpen}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>
              Extend {extendTarget?.business_name ?? ""}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div>
              <Label>Duration</Label>
              <div className="flex items-center gap-2">
                <Input
                  type="number"
                  min={1}
                  max={120}
                  value={eMonths}
                  onChange={(e) => setEMonths(e.target.value)}
                  className="w-24"
                />
                <span className="text-[13px] text-muted-foreground">months</span>
              </div>
              <div className="flex flex-wrap gap-1.5 mt-2">
                {DURATION_PRESETS.map((p) => (
                  <button
                    key={p.months}
                    type="button"
                    onClick={() => setEMonths(String(p.months))}
                    className={`px-2.5 py-1 rounded-full border text-[12px] transition-colors ${
                      eMonths === String(p.months)
                        ? "bg-primary/10 border-primary/50 text-foreground"
                        : "bg-secondary/40 border-border text-muted-foreground hover:bg-secondary/70"
                    }`}
                  >
                    {p.label}
                  </button>
                ))}
              </div>
              {(() => {
                const months = Math.max(1, parseInt(eMonths) || 1);
                // Chain from current expires_at if it's in the future, else
                // first of next month — mirrors the backend logic so the
                // preview matches what actually happens on submit.
                const now = new Date();
                const currentExpiresIso =
                  extendTarget?.active_subscription?.expires_at ?? null;
                const currentExpires = currentExpiresIso
                  ? new Date(currentExpiresIso)
                  : null;
                const startBase =
                  currentExpires && currentExpires > now
                    ? currentExpires
                    : nextFirstOfMonth(now);
                const endDate = addMonths(startBase, months);
                const fmt = (d: Date) =>
                  d.toLocaleDateString("en-US", {
                    day: "numeric",
                    month: "short",
                    year: "numeric",
                  });
                return (
                  <p className="text-[11px] text-muted-foreground mt-1.5">
                    Active from <span className="font-medium">{fmt(startBase)}</span>{" "}
                    to <span className="font-medium">{fmt(endDate)}</span>
                  </p>
                );
              })()}
            </div>
            <div>
              <Label>Notes (optional)</Label>
              <Input
                value={eNotes}
                onChange={(e) => setENotes(e.target.value)}
                placeholder="e.g. BCA transfer ref #abc123"
              />
            </div>
            {extendError && (
              <p className="text-[12px] text-red-600 flex items-start gap-1.5">
                <AlertCircle className="size-3.5 mt-0.5 shrink-0" />
                <span>{extendError}</span>
              </p>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setExtendOpen(false)}>
              Cancel
            </Button>
            <Button onClick={submitExtend} disabled={extending}>
              {extending && <Loader2 className="size-4 mr-1.5 animate-spin" />}
              Confirm
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
