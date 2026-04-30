'use client';

import * as React from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Users, ArrowRight, Brush, Wrench, UserPlus } from 'lucide-react';
import { Button, cn } from '@buranchi/ui';
import { TableStatusPill } from './status-pill';
import { SeatWalkInPopover } from './seat-walkin-popover';
import { setTableStatusAction } from '@/lib/actions/tables';
import { transitionBookingAction } from '@/lib/actions/bookings';
import type { TableStatus, BookingStatus } from '@buranchi/shared';

export interface FloorBooking {
  id: string;
  starts_at: string;
  ends_at: string;
  party_size: number;
  status: BookingStatus;
  customer_full_name: string;
}

export interface FloorTable {
  id: string;
  code: string;
  capacity: number;
  floor_area: string | null;
  liveStatus: TableStatus;
  primaryBooking: FloorBooking | null;
}

export function TableCard({
  table,
  organizationId,
  canMutate,
}: {
  table: FloorTable;
  organizationId: string;
  canMutate: boolean;
}) {
  const router = useRouter();
  const [walkInOpen, setWalkInOpen] = React.useState(false);
  const [, startTransition] = React.useTransition();
  const [error, setError] = React.useState<string | undefined>();
  // useOptimistic snaps the pill to the new status immediately; when the server
  // action resolves and revalidatePath('/floor') re-renders the parent, the
  // optimistic value reconciles with the server-provided prop.
  const [optimisticStatus, setOptimisticStatus] = React.useOptimistic<TableStatus>(table.liveStatus);
  const liveStatus = optimisticStatus;
  const pending = optimisticStatus !== table.liveStatus;

  function setStatus(next: 'available' | 'cleaning' | 'unavailable') {
    setError(undefined);
    startTransition(async () => {
      setOptimisticStatus(next);
      const res = await setTableStatusAction(table.id, next);
      if (!res.ok) {
        setError(res.message);
        return;
      }
      router.refresh();
    });
  }

  function transitionBooking(bookingId: string, next: 'seated' | 'completed') {
    setError(undefined);
    startTransition(async () => {
      // For booking transitions, predict the table-status change so the pill
      // flips instantly: confirmed→seated makes the table 'occupied', and
      // seated→completed frees it (we optimistically show 'available' — the
      // server may reconcile to 'reserved' if another booking is upcoming).
      if (next === 'seated') setOptimisticStatus('occupied');
      if (next === 'completed') setOptimisticStatus('available');
      const res = await transitionBookingAction(bookingId, { next });
      if (!res.ok) {
        setError(res.message);
        return;
      }
      router.refresh();
    });
  }

  return (
    <div
      className={cn(
        'relative rounded-card bg-surface p-card-pad shadow-card flex flex-col gap-3',
        liveStatus === 'unavailable' && 'opacity-70',
      )}
    >
      <div className="flex items-start justify-between">
        <div>
          <p className="text-title text-fg font-bold leading-none">{table.code}</p>
          <p className="text-[12px] text-muted mt-1 inline-flex items-center gap-1.5">
            <Users className="h-3 w-3" /> Seats {table.capacity}
            {table.floor_area ? <> · {table.floor_area}</> : null}
          </p>
        </div>
        <TableStatusPill status={liveStatus} />
      </div>

      <div className="text-[12px] text-fg min-h-[40px]">
        <CardBody table={table} liveStatus={liveStatus} />
      </div>

      {canMutate ? (
        <div className="flex flex-wrap gap-1.5">
          {liveStatus === 'available' ? (
            <>
              <Button size="sm" onClick={() => setWalkInOpen(true)}>
                <UserPlus className="h-3 w-3" /> Seat walk-in
              </Button>
              <Button
                size="sm"
                variant="ghost"
                disabled={pending}
                onClick={() => setStatus('unavailable')}
              >
                <Wrench className="h-3 w-3" /> Mark unavailable
              </Button>
            </>
          ) : null}
          {liveStatus === 'reserved' && table.primaryBooking ? (
            <>
              <Button
                size="sm"
                disabled={pending}
                onClick={() => transitionBooking(table.primaryBooking!.id, 'seated')}
              >
                Mark seated
              </Button>
              <Button asChild size="sm" variant="ghost">
                <Link href={`/bookings/${table.primaryBooking.id}`}>
                  <ArrowRight className="h-3 w-3" /> View
                </Link>
              </Button>
            </>
          ) : null}
          {liveStatus === 'occupied' && table.primaryBooking ? (
            <>
              <Button
                size="sm"
                disabled={pending}
                onClick={() => transitionBooking(table.primaryBooking!.id, 'completed')}
              >
                Mark completed
              </Button>
              <Button asChild size="sm" variant="ghost">
                <Link href={`/bookings/${table.primaryBooking.id}`}>
                  <ArrowRight className="h-3 w-3" /> View
                </Link>
              </Button>
            </>
          ) : null}
          {liveStatus === 'cleaning' ? (
            <Button size="sm" disabled={pending} onClick={() => setStatus('available')}>
              <Brush className="h-3 w-3" /> Mark available
            </Button>
          ) : null}
          {liveStatus === 'unavailable' ? (
            <Button size="sm" disabled={pending} onClick={() => setStatus('available')}>
              Mark available
            </Button>
          ) : null}
        </div>
      ) : null}
      {error ? <p className="text-[11px] text-danger">{error}</p> : null}

      <SeatWalkInPopover
        tableId={table.id}
        organizationId={organizationId}
        open={walkInOpen}
        onClose={() => setWalkInOpen(false)}
      />
    </div>
  );
}

function CardBody({ table, liveStatus }: { table: FloorTable; liveStatus: TableStatus }) {
  const b = table.primaryBooking;
  if (liveStatus === 'cleaning') return <p className="text-muted">Cleaning</p>;
  if (liveStatus === 'unavailable') return <p className="text-muted">Out of service</p>;
  if (b && liveStatus === 'occupied') {
    return (
      <p>
        <span className="font-medium">{b.customer_full_name}</span> · party of {b.party_size}
        <br />
        <span className="text-muted text-[11px]">
          until{' '}
          {new Date(b.ends_at).toLocaleTimeString([], {
            hour: '2-digit',
            minute: '2-digit',
          })}
        </span>
      </p>
    );
  }
  if (b && liveStatus === 'reserved') {
    return (
      <p>
        <span className="text-muted">
          Reserved ·{' '}
          {new Date(b.starts_at).toLocaleTimeString([], {
            hour: '2-digit',
            minute: '2-digit',
          })}
        </span>
        <br />
        <span className="font-medium">{b.customer_full_name}</span> · party of {b.party_size}
      </p>
    );
  }
  return <p className="text-muted">Free now</p>;
}
