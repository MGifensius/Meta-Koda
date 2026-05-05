export function formatCurrency(amount: number): string {
  return new Intl.NumberFormat("id-ID", {
    style: "currency", currency: "IDR",
    minimumFractionDigits: 0, maximumFractionDigits: 0,
  }).format(amount);
}

export function formatNumber(n: number): string {
  return new Intl.NumberFormat("id-ID").format(n);
}

export function formatDate(dateStr: string): string {
  return new Date(dateStr).toLocaleDateString("id-ID", { day: "numeric", month: "short", year: "numeric" });
}

export function formatRelativeTime(dateStr: string): string {
  const now = new Date();
  const date = new Date(dateStr);
  const m = Math.floor((now.getTime() - date.getTime()) / 60000);
  if (m < 1) return "Baru saja";
  if (m < 60) return `${m}m`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h`;
  return `${Math.floor(h / 24)}d`;
}

export function tierBadge(tier: string | null) {
  if (!tier) return "text-stone-400 bg-stone-100";
  const m: Record<string, string> = {
    Diamond: "text-sky-600 bg-sky-50",
    Gold: "text-amber-600 bg-amber-50",
    Silver: "text-gray-500 bg-gray-100",
    Bronze: "text-orange-600 bg-orange-50",
  };
  return m[tier] || "text-stone-400 bg-stone-100";
}

export function statusBadge(status: string) {
  const m: Record<string, string> = {
    available: "text-green-700 bg-green-50",
    reserved: "text-blue-700 bg-blue-50",
    occupied: "text-amber-700 bg-amber-50",
    cleaning: "text-violet-700 bg-violet-50",
    done: "text-gray-600 bg-gray-100",
    cancelled: "text-red-700 bg-red-50",
    no_show: "text-red-700 bg-red-50",
    confirmed: "text-green-700 bg-green-50",
    pending: "text-amber-700 bg-amber-50",
    completed: "text-blue-700 bg-blue-50",
    open: "text-amber-700 bg-amber-50",
    paid: "text-green-700 bg-green-50",
    draft: "text-gray-500 bg-gray-100",
    scheduled: "text-blue-700 bg-blue-50",
    sent: "text-green-700 bg-green-50",
    failed: "text-red-700 bg-red-50",
  };
  return m[status] || "text-gray-500 bg-gray-100";
}

export function tableStatusColor(status: string) {
  const m: Record<string, string> = {
    available: "border-green-200 bg-green-50 text-green-700",
    reserved: "border-blue-200 bg-blue-50 text-blue-700",
    occupied: "border-amber-200 bg-amber-50 text-amber-700",
    cleaning: "border-violet-200 bg-violet-50 text-violet-700",
    done: "border-gray-200 bg-gray-50 text-gray-500",
  };
  return m[status] || "border-gray-200 bg-gray-50 text-gray-500";
}
