'use client';

import * as React from 'react';
import { useRouter } from 'next/navigation';
import { Button, Input, FormField } from '@buranchi/ui';
import { updateOrganizationLoyaltyAction } from './program-actions';

export function LoyaltyProgramSection({
  enabled,
  programName,
  earnRate,
}: {
  enabled: boolean;
  programName: string;
  earnRate: number;
}) {
  const router = useRouter();
  const [isEnabled, setIsEnabled] = React.useState(enabled);
  const [name, setName] = React.useState(programName);
  const [rate, setRate] = React.useState(earnRate);
  const [pending, startTransition] = React.useTransition();
  const [error, setError] = React.useState<string | undefined>();

  function save() {
    setError(undefined);
    startTransition(async () => {
      const res = await updateOrganizationLoyaltyAction({
        loyalty_enabled: isEnabled,
        loyalty_program_name: name.trim(),
        loyalty_earn_rate_idr_per_point: rate,
      });
      if (!res.ok) {
        setError(res.message);
        return;
      }
      router.refresh();
    });
  }

  return (
    <div className="rounded-card bg-surface shadow-card p-card-pad space-y-3">
      <label className="inline-flex items-center gap-2 text-[12px] text-fg">
        <input
          type="checkbox"
          checked={isEnabled}
          onChange={(e) => setIsEnabled(e.target.checked)}
        />
        <span className="font-medium">Enable loyalty program</span>
      </label>
      <div className="grid grid-cols-2 gap-3">
        <FormField id="prog-name" label="Program name">
          <Input
            id="prog-name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Buranchi Rewards"
          />
        </FormField>
        <FormField
          id="earn-rate"
          label="Earn rate (Rp per point)"
          hint="e.g. 10,000 means 1 point per Rp 10,000 spent"
        >
          <Input
            id="earn-rate"
            type="number"
            min={1}
            value={rate}
            onChange={(e) => setRate(Number(e.target.value))}
          />
        </FormField>
      </div>
      {error ? <p className="text-[12px] text-danger">{error}</p> : null}
      <Button onClick={save} disabled={pending}>
        {pending ? 'Saving…' : 'Save program settings'}
      </Button>
    </div>
  );
}
