'use client';

import * as React from 'react';
import { Trophy } from 'lucide-react';
import { cn } from '@buranchi/ui';

interface LoyaltyStatusBadgeProps {
  tierName: string;
  tierIndex: number;
  pointsBalance: number;
  pointsLifetime: number;
  nextTierName: string | null;
  nextTierThreshold: number | null;
  className?: string;
}

const TIER_COLOR: Record<number, string> = {
  0: 'bg-row-divider text-muted',
  1: 'bg-accent-soft text-accent',
  2: 'bg-success-soft text-success',
  3: 'bg-fg text-white',
};

export function LoyaltyStatusBadge({
  tierName,
  tierIndex,
  pointsBalance,
  pointsLifetime,
  nextTierName,
  nextTierThreshold,
  className,
}: LoyaltyStatusBadgeProps) {
  const progress =
    nextTierThreshold && nextTierThreshold > pointsLifetime
      ? Math.min(100, Math.round((pointsLifetime / nextTierThreshold) * 100))
      : 100;
  const remaining =
    nextTierThreshold && nextTierThreshold > pointsLifetime ? nextTierThreshold - pointsLifetime : 0;

  return (
    <div className={cn('rounded-card bg-surface shadow-card p-card-pad space-y-3', className)}>
      <div className="flex items-center gap-3">
        <span
          className={cn(
            'inline-flex items-center gap-1.5 rounded-pill px-2.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide',
            TIER_COLOR[tierIndex] ?? TIER_COLOR[0],
          )}
        >
          <Trophy className="h-3 w-3" />
          {tierName}
        </span>
        <div className="text-[12px] text-muted">{pointsLifetime.toLocaleString()} lifetime</div>
      </div>
      <div>
        <p className="text-title text-fg font-bold leading-none">
          {pointsBalance.toLocaleString()}{' '}
          <span className="text-[12px] text-muted font-normal">pts</span>
        </p>
        {nextTierName && remaining > 0 ? (
          <p className="text-[11px] text-muted mt-1">
            {remaining.toLocaleString()} pts to {nextTierName}
          </p>
        ) : (
          <p className="text-[11px] text-muted mt-1">Top tier</p>
        )}
      </div>
      {nextTierName && remaining > 0 ? (
        <div className="h-1.5 rounded-pill bg-canvas overflow-hidden">
          <div className="h-full bg-accent" style={{ width: `${progress}%` }} />
        </div>
      ) : null}
    </div>
  );
}
