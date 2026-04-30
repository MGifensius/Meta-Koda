'use client';

import * as React from 'react';
import { useRouter } from 'next/navigation';
import { Sparkles } from 'lucide-react';
import { Button, Card } from '@buranchi/ui';
import { enrollMemberAction, unenrollMemberAction } from '@/lib/actions/loyalty-members';

interface LoyaltyMemberToggleProps {
  customerId: string;
  customerName: string;
  isMember: boolean;
  programName: string;
}

export function LoyaltyMemberToggle({
  customerId,
  customerName,
  isMember,
  programName,
}: LoyaltyMemberToggleProps) {
  const router = useRouter();
  const [pending, startTransition] = React.useTransition();
  const [error, setError] = React.useState<string | undefined>();

  function enroll() {
    setError(undefined);
    startTransition(async () => {
      const res = await enrollMemberAction(customerId);
      if (!res.ok) {
        setError(res.message);
        return;
      }
      router.refresh();
    });
  }

  function unenroll() {
    if (
      !confirm(
        `Remove ${customerName} from ${programName}? Their points stay; tier resets to none.`,
      )
    ) {
      return;
    }
    setError(undefined);
    startTransition(async () => {
      const res = await unenrollMemberAction(customerId);
      if (!res.ok) {
        setError(res.message);
        return;
      }
      router.refresh();
    });
  }

  if (!isMember) {
    return (
      <Card className="flex items-center gap-3">
        <div className="h-9 w-9 rounded-pill bg-canvas flex items-center justify-center text-muted">
          <Sparkles className="h-4 w-4" />
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-[12px] text-fg">
            {customerName} is not a member of {programName}
          </p>
          <p className="text-[11px] text-muted">Enroll to start earning points on bookings.</p>
        </div>
        <Button size="sm" onClick={enroll} disabled={pending}>
          {pending ? 'Enrolling…' : 'Enroll'}
        </Button>
        {error ? <p className="text-[11px] text-danger">{error}</p> : null}
      </Card>
    );
  }

  return (
    <div className="flex justify-end">
      <Button size="sm" variant="ghost" onClick={unenroll} disabled={pending}>
        Remove from {programName}
      </Button>
    </div>
  );
}
