'use client';

import * as React from 'react';
import { useRouter } from 'next/navigation';
import { Button, Input, Textarea, FormField } from '@buranchi/ui';
import { adjustPointsAction } from '@/lib/actions/loyalty-redeem';

interface LoyaltyAdjustmentDialogProps {
  customerId: string;
  open: boolean;
  onClose: () => void;
}

export function LoyaltyAdjustmentDialog({ customerId, open, onClose }: LoyaltyAdjustmentDialogProps) {
  const router = useRouter();
  const [delta, setDelta] = React.useState(0);
  const [reason, setReason] = React.useState('');
  const [affectsLifetime, setAffectsLifetime] = React.useState(false);
  const [pending, startTransition] = React.useTransition();
  const [error, setError] = React.useState<string | undefined>();

  React.useEffect(() => {
    if (open) {
      setDelta(0);
      setReason('');
      setAffectsLifetime(false);
      setError(undefined);
    }
  }, [open]);

  function submit() {
    if (delta === 0 || !reason.trim()) {
      setError('Delta must be non-zero and reason is required.');
      return;
    }
    setError(undefined);
    startTransition(async () => {
      try {
        await adjustPointsAction({
          customer_id: customerId,
          delta_points: delta,
          reason: reason.trim(),
          affects_lifetime: affectsLifetime,
        });
        onClose();
        router.refresh();
      } catch (e) {
        setError(e instanceof Error ? e.message : 'Failed');
      }
    });
  }

  if (!open) return null;
  return (
    <div className="fixed inset-0 z-30 bg-fg/40 flex items-center justify-center p-4" onClick={onClose}>
      <div
        className="rounded-card bg-surface shadow-popover p-5 w-[420px]"
        onClick={(e) => e.stopPropagation()}
      >
        <h2 className="text-body-strong text-fg mb-3">Adjust points</h2>
        <div className="space-y-3">
          <FormField id="adj-delta" label="Delta points" hint="Positive to gift, negative to deduct" required>
            <Input
              id="adj-delta"
              type="number"
              value={delta}
              onChange={(e) => setDelta(Number(e.target.value))}
            />
          </FormField>
          <FormField id="adj-reason" label="Reason" required>
            <Textarea
              id="adj-reason"
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="VIP welcome / refund / complaint resolution"
            />
          </FormField>
          <label className="inline-flex items-center gap-2 text-[12px] text-fg">
            <input
              type="checkbox"
              checked={affectsLifetime}
              onChange={(e) => setAffectsLifetime(e.target.checked)}
            />
            <span>Also affects lifetime points (changes tier)</span>
          </label>
          {error ? <p className="text-[12px] text-danger">{error}</p> : null}
          <div className="flex gap-2 justify-end">
            <Button variant="ghost" onClick={onClose} disabled={pending}>
              Cancel
            </Button>
            <Button onClick={submit} disabled={pending}>
              {pending ? 'Saving…' : 'Save'}
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
