"use client";

import { useState, useEffect, useCallback } from "react";
import { Gift, Crown, Coins } from "lucide-react";
import { Switch } from "@/components/ui/switch";
import { formatNumber, tierBadge } from "@/lib/format";
import { apiFetch } from "@/lib/api-client";

type Reward = {
  id: string;
  name: string;
  description: string;
  points_cost: number;
  category: string;
  is_active: boolean;
};

type Customer = {
  id: string;
  points: number;
  is_member: boolean;
};

export default function LoyaltyPage() {
  const [rewardList, setRewardList] = useState<Reward[]>([]);
  const [customers, setCustomers] = useState<Customer[]>([]);

  const fetchRewards = useCallback(async () => {
    try {
      const res = await apiFetch("/loyalty/rewards");
      const data = await res.json();
      setRewardList(data);
    } catch (err) {
      console.error(err);
    }
  }, []);

  const fetchCustomers = useCallback(async () => {
    try {
      const res = await apiFetch("/customers/");
      const data = await res.json();
      setCustomers(data);
    } catch (err) {
      console.error(err);
    }
  }, []);

  useEffect(() => {
    fetchRewards();
    fetchCustomers();
  }, [fetchRewards, fetchCustomers]);

  const members = customers.filter((c) => c.is_member);
  const totalPoints = members.reduce((s, c) => s + c.points, 0);
  const activeRewards = rewardList.filter((r) => r.is_active).length;
  const avgPoints = members.length > 0 ? Math.round(totalPoints / members.length) : 0;

  const stats = [
    { value: formatNumber(members.length), label: "Total Member" },
    { value: formatNumber(totalPoints), label: "Total Points" },
    { value: String(activeRewards), label: "Active Rewards" },
    { value: formatNumber(avgPoints), label: "Avg Points" },
  ];

  const tiers = [
    { name: "Bronze", minSpend: "Rp 0", maxSpend: "299 pts", multiplier: "1x", perks: "Akumulasi poin dasar" },
    { name: "Silver", minSpend: "300 pts", maxSpend: "999 pts", multiplier: "1.2x", perks: "Bonus poin 20%, birthday reward" },
    { name: "Gold", minSpend: "1.000 pts", maxSpend: "2.499 pts", multiplier: "1.5x", perks: "Bonus poin 50%, priority booking" },
    { name: "Diamond", minSpend: "2.500 pts", maxSpend: "Unlimited", multiplier: "2x", perks: "Double poin, exclusive access" },
  ];

  const pointsRules = [
    { id: "pr1", label: "Poin per Rp 10.000 transaksi", description: "Member mendapat 1 poin per Rp 10.000 pembelian", enabled: true },
    { id: "pr2", label: "Bonus birthday month", description: "2x poin selama bulan ulang tahun", enabled: true },
    { id: "pr3", label: "Referral bonus", description: "50 poin untuk setiap referral yang berhasil", enabled: true },
    { id: "pr4", label: "First visit bonus", description: "25 poin bonus untuk kunjungan pertama", enabled: false },
  ];

  const [rules, setRules] = useState(pointsRules);

  const toggleReward = async (id: string) => {
    try {
      await apiFetch(`/loyalty/rewards/${id}/toggle`, { method: "PATCH" });
      await fetchRewards();
    } catch (err) {
      console.error(err);
    }
  };

  const toggleRule = (id: string) => {
    setRules((prev) => prev.map((r) => (r.id === id ? { ...r, enabled: !r.enabled } : r)));
  };

  const categoryLabel: Record<string, string> = { discount: "Diskon", freebie: "Gratis", experience: "Experience" };

  return (
    <div className="space-y-6">
      <h1 className="text-lg font-semibold">Loyalty Program</h1>

      <div className="grid grid-cols-4 gap-4">
        {stats.map((s) => (
          <div key={s.label} className="rounded-xl border bg-card px-5 py-4">
            <p className="text-2xl font-semibold tracking-tight">{s.value}</p>
            <p className="text-[13px] text-muted-foreground">{s.label}</p>
          </div>
        ))}
      </div>

      <div>
        <h2 className="text-sm font-medium mb-3">Tier System</h2>
        <div className="grid grid-cols-4 gap-3">
          {tiers.map((t) => (
            <div key={t.name} className="border rounded-xl bg-card p-4 space-y-2">
              <div className="flex items-center gap-2">
                <Crown className="size-4 text-muted-foreground" />
                <span className={`text-[11px] font-medium px-2 py-0.5 rounded capitalize ${tierBadge(t.name)}`}>
                  {t.name}
                </span>
              </div>
              <div className="text-[13px] space-y-1">
                <p><span className="text-muted-foreground">Points:</span> {t.minSpend} - {t.maxSpend}</p>
                <p><span className="text-muted-foreground">Multiplier:</span> <span className="font-medium">{t.multiplier}</span></p>
                <p className="text-muted-foreground">{t.perks}</p>
              </div>
            </div>
          ))}
        </div>
      </div>

      <div>
        <h2 className="text-sm font-medium mb-3">Rewards Catalog</h2>
        <div className="grid grid-cols-3 gap-3">
          {rewardList.map((r) => (
            <div key={r.id} className="border rounded-xl bg-card p-4 space-y-2">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Gift className="size-4 text-muted-foreground" />
                  <p className="text-[13px] font-medium">{r.name}</p>
                </div>
                <Switch checked={r.is_active} onCheckedChange={() => toggleReward(r.id)} size="sm" />
              </div>
              <p className="text-[13px] text-muted-foreground">{r.description}</p>
              <div className="flex items-center justify-between text-[13px]">
                <span className="flex items-center gap-1">
                  <Coins className="size-3.5 text-amber-500" />
                  <span className="font-medium">{formatNumber(r.points_cost)} pts</span>
                </span>
                <span className="text-[11px] font-medium px-2 py-0.5 rounded capitalize bg-muted text-muted-foreground">
                  {categoryLabel[r.category] ?? r.category}
                </span>
              </div>
            </div>
          ))}
          {rewardList.length === 0 && (
            <p className="col-span-3 text-[13px] text-muted-foreground text-center py-8">Belum ada reward.</p>
          )}
        </div>
      </div>

      <div>
        <h2 className="text-sm font-medium mb-3">Points Rules</h2>
        <div className="border rounded-xl bg-card divide-y">
          {rules.map((rule) => (
            <div key={rule.id} className="flex items-center justify-between px-4 py-3">
              <div>
                <p className="text-[13px] font-medium">{rule.label}</p>
                <p className="text-[13px] text-muted-foreground">{rule.description}</p>
              </div>
              <Switch checked={rule.enabled} onCheckedChange={() => toggleRule(rule.id)} size="sm" />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
