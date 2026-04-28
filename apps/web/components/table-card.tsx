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
  const [pending, setPending] = React.useState(false);
  const [error, setError] = React.useState<string | undefined>();

  async function setStatus(next: 'available' | 'cleaning' | 'unavailable') {
    setError(undefined);
    setPending(true);
    try {
      await setTableStatusAction(table.id, next);
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed');
    } finally {
      setPending(false);
    }
  }

  async function transitionBooking(bookingId: string, next: 'seated' | 'completed') {
    setError(undefined);
    setPending(true);
    try {
      await transitionBookingAction(bookingId, { next });
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed');
    } finally {
      setPending(false);
    }
  }

  return (
    <div
      className={cn(
        'relative rounded-card bg-surface p-card-pad shadow-card flex flex-col gap-3',
        table.liveStatus === 'unavailable' && 'opacity-70',
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
        <TableStatusPill status={table.liveStatus} />
      </div>

      <div className="text-[12px] text-fg min-h-[40px]">
        <CardBody table={table} />
      </div>

      {canMutate ? (
        <div className="flex flex-wrap gap-1.5">
          {table.liveStatus === 'available' ? (
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
          {table.liveStatus === 'reserved' && table.primaryBooking ? (
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
          {table.liveStatus === 'occupied' && table.primaryBooking ? (
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
          {table.liveStatus === 'cleaning' ? (
            <Button size="sm" disabled={pending} onClick={() => setStatus('available')}>
              <Brush className="h-3 w-3" /> Mark available
            </Button>
          ) : null}
          {table.liveStatus === 'unavailable' ? (
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

function CardBody({ table }: { table: FloorTable }) {
  const b = table.primaryBooking;
  if (table.liveStatus === 'cleaning') return <p className="text-muted">Cleaning</p>;
  if (table.liveStatus === 'unavailable') return <p className="text-muted">Out of service</p>;
  if (b && table.liveStatus === 'occupied') {
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
  if (b && table.liveStatus === 'reserved') {
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
