'use client';

import * as React from 'react';
import { Pencil } from 'lucide-react';
import { Button, Input, Textarea, FormField } from '@buranchi/ui';
import { updateTierAction } from '@/lib/actions/loyalty-tiers';

export interface TierRow {
  id: string;
  tier_index: number;
  name: string;
  min_points_lifetime: number;
  perks_text: string | null;
}

export function LoyaltyTiersEditor({ rows }: { rows: TierRow[] }) {
  const [editingId, setEditingId] = React.useState<string | null>(null);
  const [pending, startTransition] = React.useTransition();
  const [error, setError] = React.useState<string | undefined>();

  function save(
    tierId: string,
    values: { name: string; min_points_lifetime: number; perks_text: string },
  ) {
    setError(undefined);
    startTransition(async () => {
      const res = await updateTierAction(tierId, {
        name: values.name,
        min_points_lifetime: values.min_points_lifetime,
        perks_text: values.perks_text || null,
      });
      if (!res.ok) {
        setError(res.message);
        return;
      }
      setEditingId(null);
    });
  }

  return (
    <div className="space-y-3">
      {error ? <p className="text-[12px] text-danger">{error}</p> : null}
      <div className="rounded-card bg-surface shadow-card overflow-hidden">
        <div className="px-4 grid grid-cols-[60px_1fr_140px_120px] py-3 text-label uppercase text-muted border-b border-border">
          <div>#</div>
          <div>Name</div>
          <div>Min lifetime</div>
          <div></div>
        </div>
        {rows.map((t) => (
          <div key={t.id} className="border-b border-row-divider last:border-b-0">
            {editingId === t.id ? (
              <TierForm
                initial={t}
                onCancel={() => setEditingId(null)}
                onSubmit={(v) => save(t.id, v)}
                pending={pending}
              />
            ) : (
              <div className="px-4 grid grid-cols-[60px_1fr_140px_120px] py-3 text-[12px] items-center">
                <div className="font-mono text-muted">{t.tier_index}</div>
                <div>
                  <p className="font-medium text-fg">{t.name}</p>
                  {t.perks_text ? (
                    <p className="text-[11px] text-muted truncate">{t.perks_text}</p>
                  ) : null}
                </div>
                <div className="text-fg">{t.min_points_lifetime.toLocaleString()}</div>
                <div className="flex justify-end">
                  <Button size="sm" variant="ghost" onClick={() => setEditingId(t.id)}>
                    <Pencil className="h-3.5 w-3.5" /> Edit
                  </Button>
                </div>
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

function TierForm({
  initial,
  onCancel,
  onSubmit,
  pending,
}: {
  initial: TierRow;
  onCancel: () => void;
  onSubmit: (v: { name: string; min_points_lifetime: number; perks_text: string }) => void;
  pending: boolean;
}) {
  const [name, setName] = React.useState(initial.name);
  const [threshold, setThreshold] = React.useState(initial.min_points_lifetime);
  const [perks, setPerks] = React.useState(initial.perks_text ?? '');
  const isTier0 = initial.tier_index === 0;

  return (
    <div className="px-4 py-3 bg-canvas space-y-3">
      <div className="grid grid-cols-2 gap-3">
        <FormField id="tier-name" label="Name" required>
          <Input id="tier-name" value={name} onChange={(e) => setName(e.target.value)} />
        </FormField>
        <FormField
          id="tier-thresh"
          label="Min lifetime points"
          {...(isTier0 ? { hint: 'Tier 0 must be 0' } : {})}
          required
        >
          <Input
            id="tier-thresh"
            type="number"
            min={0}
            disabled={isTier0}
            value={threshold}
            onChange={(e) => setThreshold(Number(e.target.value))}
          />
        </FormField>
      </div>
      <FormField id="tier-perks" label="Perks (free-text)">
        <Textarea
          id="tier-perks"
          value={perks}
          onChange={(e) => setPerks(e.target.value)}
          placeholder="Priority weekend booking. Complimentary chef's amuse."
        />
      </FormField>
      <div className="flex gap-2">
        <Button
          size="sm"
          disabled={pending || !name.trim()}
          onClick={() =>
            onSubmit({
              name: name.trim(),
              min_points_lifetime: threshold,
              perks_text: perks.trim(),
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
