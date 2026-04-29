'use client';

import * as React from 'react';
import { TrendingUp, TrendingDown, Settings } from 'lucide-react';
import type { LoyaltyRewardType } from '@buranchi/shared';

export interface HistoryRow {
  kind: 'earn' | 'redeem' | 'adjust';
  ts: string;
  points: number;
  label: string;
  meta?: { rewardType?: LoyaltyRewardType; reason?: string; status?: string; bookingId?: string };
}

export function LoyaltyRedemptionHistory({ rows }: { rows: HistoryRow[] }) {
  if (rows.length === 0) {
    return (
      <div className="rounded-card bg-surface shadow-card py-8 text-center">
        <p className="text-[12px] text-muted">No loyalty activity yet.</p>
      </div>
    );
  }
  return (
    <div className="rounded-card bg-surface shadow-card overflow-hidden">
      <div className="px-4 grid grid-cols-[28px_1fr_80px_140px] py-3 text-label uppercase text-muted border-b border-border">
        <div></div>
        <div>Detail</div>
        <div className="text-right">Points</div>
        <div>When</div>
      </div>
      {rows.map((r, i) => {
        const Icon = r.kind === 'earn' ? TrendingUp : r.kind === 'redeem' ? TrendingDown : Settings;
        const color =
          r.kind === 'earn' ? 'text-success' : r.kind === 'redeem' ? 'text-danger' : 'text-muted';
        const sign = r.kind === 'earn' ? '+' : r.kind === 'redeem' ? '−' : r.points >= 0 ? '+' : '−';
        const display = Math.abs(r.points).toLocaleString();
        const dateStr = new Date(r.ts).toLocaleDateString([], {
          month: 'short',
          day: 'numeric',
          hour: '2-digit',
          minute: '2-digit',
        });
        return (
          <div
            key={i}
            className="px-4 grid grid-cols-[28px_1fr_80px_140px] py-3 border-b border-row-divider last:border-b-0 text-[12px] items-center"
          >
            <Icon className={`h-3.5 w-3.5 ${color}`} />
            <div className="min-w-0">
              <p className="text-fg truncate">{r.label}</p>
              {r.meta?.reason ? <p className="text-[11px] text-muted truncate">{r.meta.reason}</p> : null}
              {r.meta?.status === 'voided' ? <p className="text-[11px] text-danger">voided</p> : null}
            </div>
            <div className={`text-right font-mono ${color}`}>
              {sign}
              {display}
            </div>
            <div className="text-muted">{dateStr}</div>
          </div>
        );
      })}
    </div>
  );
}
