'use client';

import * as React from 'react';
import { Plus, Pencil, Trash2 } from 'lucide-react';
import { Button, Input, Textarea, FormField } from '@buranchi/ui';
import { LOYALTY_REWARD_TYPE_LABELS, type LoyaltyRewardType } from '@buranchi/shared';
import {
  createRewardAction,
  updateRewardAction,
  deleteRewardAction,
} from '@/lib/actions/loyalty-rewards';

export interface RewardRow {
  id: string;
  name: string;
  description: string | null;
  type: LoyaltyRewardType;
  type_value: number;
  points_cost: number;
  min_tier_index: number;
  is_active: boolean;
  sort_order: number;
}

export interface TierOption {
  tier_index: number;
  name: string;
}

export function LoyaltyRewardsEditor({
  rows,
  tiers,
}: {
  rows: RewardRow[];
  tiers: TierOption[];
}) {
  const [adding, setAdding] = React.useState(false);
  const [editingId, setEditingId] = React.useState<string | null>(null);
  const [pending, startTransition] = React.useTransition();
  const [error, setError] = React.useState<string | undefined>();

  function add(values: Omit<RewardRow, 'id'>) {
    setError(undefined);
    startTransition(async () => {
      const res = await createRewardAction(values);
      if (!res.ok) {
        setError(res.message);
        return;
      }
      setAdding(false);
    });
  }

  function update(id: string, values: Partial<Omit<RewardRow, 'id'>>) {
    setError(undefined);
    startTransition(async () => {
      const res = await updateRewardAction(id, values);
      if (!res.ok) {
        setError(res.message);
        return;
      }
      setEditingId(null);
    });
  }

  function remove(id: string) {
    if (!confirm('Delete this reward? Past redemptions stay (snapshotted).')) return;
    setError(undefined);
    startTransition(async () => {
      const res = await deleteRewardAction(id);
      if (!res.ok) setError(res.message);
    });
  }

  return (
    <div className="space-y-3">
      {error ? <p className="text-[12px] text-danger">{error}</p> : null}
      <div className="rounded-card bg-surface shadow-card overflow-hidden">
        {rows.map((r) => (
          <div key={r.id} className="border-b border-row-divider last:border-b-0">
            {editingId === r.id ? (
              <RewardForm
                initial={r}
                tiers={tiers}
                onCancel={() => setEditingId(null)}
                onSubmit={(v) => update(r.id, v)}
                pending={pending}
              />
            ) : (
              <div className="px-4 py-3 flex items-start gap-3">
                <div className="flex-1 min-w-0">
                  <p className="text-[12px] font-medium text-fg">
                    {r.name} <span className="text-muted">· {r.points_cost} pts</span>
                  </p>
                  <p className="text-[11px] text-muted">
                    {LOYALTY_REWARD_TYPE_LABELS[r.type]}
                    {r.type === 'percent_discount' ? ` · ${r.type_value}%` : ''}
                    {r.type === 'rupiah_discount' ? ` · Rp ${r.type_value.toLocaleString()}` : ''}
                    {r.min_tier_index > 0
                      ? ` · ${tiers.find((t) => t.tier_index === r.min_tier_index)?.name ?? `Tier ${r.min_tier_index}`}+`
                      : ''}
                    {!r.is_active ? ' · inactive' : ''}
                  </p>
                  {r.description ? (
                    <p className="text-[11px] text-muted line-clamp-2">{r.description}</p>
                  ) : null}
                </div>
                <div className="flex gap-1 shrink-0">
                  <Button size="sm" variant="ghost" onClick={() => setEditingId(r.id)}>
                    <Pencil className="h-3.5 w-3.5" />
                  </Button>
                  <Button size="sm" variant="ghost" disabled={pending} onClick={() => remove(r.id)}>
                    <Trash2 className="h-3.5 w-3.5" />
                  </Button>
                </div>
              </div>
            )}
          </div>
        ))}
        {rows.length === 0 && !adding ? (
          <div className="px-4 py-8 text-center text-[12px] text-muted">No rewards yet.</div>
        ) : null}
        {adding ? (
          <RewardForm tiers={tiers} onCancel={() => setAdding(false)} onSubmit={add} pending={pending} />
        ) : null}
      </div>
      {!adding ? (
        <Button size="sm" variant="outline" onClick={() => setAdding(true)}>
          <Plus className="h-3.5 w-3.5" /> Add reward
        </Button>
      ) : null}
    </div>
  );
}

function RewardForm({
  initial,
  tiers,
  onCancel,
  onSubmit,
  pending,
}: {
  initial?: RewardRow;
  tiers: TierOption[];
  onCancel: () => void;
  onSubmit: (v: Omit<RewardRow, 'id'>) => void;
  pending: boolean;
}) {
  const [name, setName] = React.useState(initial?.name ?? '');
  const [description, setDescription] = React.useState(initial?.description ?? '');
  const [type, setType] = React.useState<LoyaltyRewardType>(initial?.type ?? 'free_item');
  const [typeValue, setTypeValue] = React.useState(initial?.type_value ?? 0);
  const [pointsCost, setPointsCost] = React.useState(initial?.points_cost ?? 100);
  const [minTier, setMinTier] = React.useState(initial?.min_tier_index ?? 0);
  const [isActive, setIsActive] = React.useState(initial?.is_active ?? true);

  return (
    <div className="px-4 py-3 bg-canvas space-y-3">
      <div className="grid grid-cols-2 gap-3">
        <FormField id="rw-name" label="Name" required>
          <Input
            id="rw-name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Free dessert"
          />
        </FormField>
        <FormField id="rw-cost" label="Points cost" required>
          <Input
            id="rw-cost"
            type="number"
            min={1}
            value={pointsCost}
            onChange={(e) => setPointsCost(Number(e.target.value))}
          />
        </FormField>
      </div>
      <FormField id="rw-desc" label="Description">
        <Textarea
          id="rw-desc"
          value={description}
          onChange={(e) => setDescription(e.target.value)}
        />
      </FormField>
      <div className="grid grid-cols-3 gap-3">
        <FormField id="rw-type" label="Type" required>
          <select
            id="rw-type"
            value={type}
            onChange={(e) => setType(e.target.value as LoyaltyRewardType)}
            className="h-[33px] w-full rounded-input border border-border bg-surface px-2.5 text-[12px] text-fg"
          >
            <option value="free_item">Free item</option>
            <option value="percent_discount">% discount</option>
            <option value="rupiah_discount">Rp discount</option>
          </select>
        </FormField>
        <FormField
          id="rw-value"
          label={
            type === 'percent_discount'
              ? 'Percent (1–100)'
              : type === 'rupiah_discount'
                ? 'Rupiah amount'
                : 'Value (unused)'
          }
          {...(type === 'free_item' ? { hint: 'Ignored for free_item' } : {})}
        >
          <Input
            id="rw-value"
            type="number"
            min={0}
            disabled={type === 'free_item'}
            value={typeValue}
            onChange={(e) => setTypeValue(Number(e.target.value))}
          />
        </FormField>
        <FormField id="rw-tier" label="Min tier">
          <select
            id="rw-tier"
            value={minTier}
            onChange={(e) => setMinTier(Number(e.target.value))}
            className="h-[33px] w-full rounded-input border border-border bg-surface px-2.5 text-[12px] text-fg"
          >
            {tiers
              .slice()
              .sort((a, b) => a.tier_index - b.tier_index)
              .map((t) => (
                <option key={t.tier_index} value={t.tier_index}>
                  {t.name} (idx {t.tier_index})
                </option>
              ))}
          </select>
        </FormField>
      </div>
      <label className="inline-flex items-center gap-2 text-[12px] text-fg">
        <input
          type="checkbox"
          checked={isActive}
          onChange={(e) => setIsActive(e.target.checked)}
        />
        <span>Active</span>
      </label>
      <div className="flex gap-2">
        <Button
          size="sm"
          disabled={pending || !name.trim() || pointsCost <= 0}
          onClick={() =>
            onSubmit({
              name: name.trim(),
              description: description.trim() || null,
              type,
              type_value: typeValue,
              points_cost: pointsCost,
              min_tier_index: minTier,
              is_active: isActive,
              sort_order: initial?.sort_order ?? 0,
            })
          }
        >
          {pending ? 'Saving…' : 'Save'}
        </Button>
        <Button size="sm" variant="ghost" onClick={onCancel}>
          Cancel
        </Button>
      </div>
    </div>
  );
}
