'use client';

import * as React from 'react';
import { useRouter } from 'next/navigation';
import { Button, Input, FormField } from '@buranchi/ui';
import { computePointsForBill } from '@/lib/loyalty/earn';
import { completeBookingAction } from '@/lib/actions/bookings';
import type { LoyaltyRewardType } from '@buranchi/shared';

export interface PreApplied {
  id: string;
  reward_name: string;
  points_spent: number;
  created_at: string;
}

export interface AvailableReward {
  id: string;
  name: string;
  type: LoyaltyRewardType;
  type_value: number;
  points_cost: number;
  min_tier_index: number;
}

interface LoyaltyCompletionSectionProps {
  bookingId: string;
  customerName: string;
  tierName: string;
  customerTierIndex: number;
  pointsBalance: number;
  pointsLifetime: number;
  nextTierName: string | null;
  nextTierThreshold: number | null;
  earnRateIdrPerPoint: number;
  preApplied: PreApplied[];
  available: AvailableReward[];
}

export function LoyaltyCompletionSection({
  bookingId,
  customerName,
  tierName,
  customerTierIndex,
  pointsBalance,
  pointsLifetime,
  nextTierName,
  nextTierThreshold,
  earnRateIdrPerPoint,
  preApplied,
  available,
}: LoyaltyCompletionSectionProps) {
  const router = useRouter();
  const [billStr, setBillStr] = React.useState('');
  const [picked, setPicked] = React.useState<Set<string>>(new Set());
  const [pending, startTransition] = React.useTransition();
  const [error, setError] = React.useState<string | undefined>();

  const billIdr = Math.max(0, Math.floor(Number(billStr.replace(/[^0-9]/g, '')) || 0));
  const pickedTotal = Array.from(picked).reduce(
    (sum, id) => sum + (available.find((r) => r.id === id)?.points_cost ?? 0),
    0,
  );
  const earned = computePointsForBill(billIdr, earnRateIdrPerPoint);
  const projectedBalance = pointsBalance + earned - pickedTotal;
  const remainingForRedemption = pointsBalance;
  const remainingForNext = nextTierThreshold
    ? Math.max(0, nextTierThreshold - (pointsLifetime + earned))
    : 0;

  function toggle(id: string) {
    const next = new Set(picked);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    setPicked(next);
  }

  function isAffordable(r: AvailableReward) {
    if (customerTierIndex < r.min_tier_index) return false;
    return (
      r.points_cost +
        Array.from(picked)
          .filter((p) => p !== r.id)
          .reduce((s, p) => s + (available.find((x) => x.id === p)?.points_cost ?? 0), 0) <=
      remainingForRedemption
    );
  }

  function submit() {
    if (billIdr <= 0) {
      setError('Enter the bill total before reward discounts.');
      return;
    }
    setError(undefined);
    startTransition(async () => {
      try {
        await completeBookingAction(bookingId, {
          bill_idr: billIdr,
          reward_redemption_ids: Array.from(picked),
        });
        router.refresh();
      } catch (e) {
        setError(e instanceof Error ? e.message : 'Failed');
      }
    });
  }

  return (
    <div className="rounded-card bg-canvas border border-row-divider p-card-pad space-y-4">
      <div className="flex items-baseline gap-2 flex-wrap">
        <p className="text-body-strong text-fg">Complete booking — {customerName}</p>
        <p className="text-[12px] text-muted">
          {tierName} · {pointsBalance.toLocaleString()} pts
          {nextTierName && remainingForNext > 0
            ? ` · ${remainingForNext.toLocaleString()} to ${nextTierName}`
            : ''}
        </p>
      </div>

      {preApplied.length > 0 ? (
        <div className="text-[12px] space-y-1">
          <p className="text-[10px] uppercase tracking-[0.06em] text-muted font-semibold">
            Already redeemed via Koda on this booking
          </p>
          {preApplied.map((p) => (
            <p key={p.id} className="text-fg">
              ✓ {p.reward_name} (−{p.points_spent} pts)
            </p>
          ))}
        </div>
      ) : null}

      <FormField
        id="bill"
        label="Bill total before reward discounts (Rp)"
        required
        hint="What the food + drinks were worth, pre-discount"
      >
        <Input
          id="bill"
          value={billStr}
          onChange={(e) => setBillStr(e.target.value)}
          placeholder="250,000"
        />
      </FormField>

      {available.length > 0 ? (
        <div className="space-y-1.5">
          <p className="text-[10px] uppercase tracking-[0.06em] text-muted font-semibold">
            Redeem additional rewards
          </p>
          {available.map((r) => {
            const affordable = isAffordable(r);
            const tierLocked = customerTierIndex < r.min_tier_index;
            const checked = picked.has(r.id);
            return (
              <label
                key={r.id}
                className={`flex items-center gap-2 px-2 py-1.5 rounded-tile cursor-pointer ${
                  (!affordable && !checked) || tierLocked ? 'opacity-50' : 'hover:bg-surface'
                }`}
              >
                <input
                  type="checkbox"
                  disabled={(!affordable && !checked) || tierLocked}
                  checked={checked}
                  onChange={() => toggle(r.id)}
                />
                <span className="text-[12px] text-fg flex-1">{r.name}</span>
                <span className="text-[11px] text-muted font-mono">{r.points_cost} pts</span>
                {tierLocked ? <span className="text-[10px] text-danger">tier-locked</span> : null}
              </label>
            );
          })}
        </div>
      ) : null}

      <div className="text-[12px] text-fg pt-3 border-t border-row-divider">
        → Earns <strong className="text-success">+{earned}</strong> points · Net balance after this booking:{' '}
        <strong>{projectedBalance.toLocaleString()}</strong>
      </div>

      {error ? <p className="text-[12px] text-danger">{error}</p> : null}

      <div className="flex justify-end gap-2">
        <Button onClick={submit} disabled={pending}>
          {pending ? 'Completing…' : 'Confirm completion'}
        </Button>
      </div>
    </div>
  );
}
