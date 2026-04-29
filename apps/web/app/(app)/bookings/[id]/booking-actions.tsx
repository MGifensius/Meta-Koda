'use client';

import * as React from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@buranchi/ui';
import { transitionBookingAction } from '@/lib/actions/bookings';
import type { BookingStatus } from '@buranchi/shared';

export function BookingActions({
  id,
  status,
  hideComplete = false,
}: {
  id: string;
  status: BookingStatus;
  hideComplete?: boolean;
}) {
  const router = useRouter();
  const [pending, startTransition] = React.useTransition();
  const [error, setError] = React.useState<string | undefined>();

  function transition(next: 'seated' | 'completed' | 'cancelled' | 'no_show') {
    setError(undefined);
    let reason: string | undefined;
    if (next === 'cancelled') {
      const r = prompt('Cancellation reason (optional):') ?? undefined;
      reason = r ?? undefined;
    }
    startTransition(async () => {
      try {
        const input = reason ? { next, reason } : { next };
        await transitionBookingAction(id, input);
        router.refresh();
      } catch (e) {
        setError(e instanceof Error ? e.message : 'Failed');
      }
    });
  }

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap gap-2">
        {status === 'confirmed' ? (
          <>
            <Button disabled={pending} onClick={() => transition('seated')}>
              Mark seated
            </Button>
            <Button variant="outline" disabled={pending} onClick={() => transition('cancelled')}>
              Cancel
            </Button>
            <Button variant="outline" disabled={pending} onClick={() => transition('no_show')}>
              Mark no-show
            </Button>
          </>
        ) : null}
        {status === 'seated' ? (
          <>
            {!hideComplete ? (
              <Button disabled={pending} onClick={() => transition('completed')}>
                Mark completed
              </Button>
            ) : null}
            <Button variant="outline" disabled={pending} onClick={() => transition('cancelled')}>
              Cancel
            </Button>
          </>
        ) : null}
      </div>
      {error ? <p className="text-[12px] text-danger">{error}</p> : null}
    </div>
  );
}
