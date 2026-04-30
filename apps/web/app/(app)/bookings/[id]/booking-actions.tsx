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
  const [, startTransition] = React.useTransition();
  const [error, setError] = React.useState<string | undefined>();
  const [optimisticStatus, setOptimisticStatus] = React.useOptimistic<BookingStatus>(status);
  const pending = optimisticStatus !== status;
  const liveStatus = optimisticStatus;

  function transition(next: 'seated' | 'completed' | 'cancelled' | 'no_show') {
    setError(undefined);
    let reason: string | undefined;
    if (next === 'cancelled') {
      const r = prompt('Cancellation reason (optional):') ?? undefined;
      reason = r ?? undefined;
    }
    startTransition(async () => {
      setOptimisticStatus(next);
      const input = reason ? { next, reason } : { next };
      const res = await transitionBookingAction(id, input);
      if (!res.ok) {
        setError(res.message);
        return;
      }
      router.refresh();
    });
  }

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap gap-2">
        {liveStatus === 'confirmed' ? (
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
        {liveStatus === 'seated' ? (
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
