import * as React from 'react';
import { cn } from '@buranchi/ui';
import {
  type BookingStatus,
  BOOKING_STATUS_LABELS,
  type TableStatus,
  TABLE_STATUS_LABELS,
} from '@buranchi/shared';

const BOOKING_TONE: Record<BookingStatus, string> = {
  pending: 'bg-row-divider text-muted',
  confirmed: 'bg-accent-soft text-accent',
  seated: 'bg-success-soft text-success',
  completed: 'bg-row-divider text-muted',
  cancelled: 'bg-danger-soft text-danger',
  no_show: 'bg-danger-soft text-danger',
};

const TABLE_TONE: Record<TableStatus, string> = {
  available: 'bg-success-soft text-success',
  reserved: 'bg-accent-soft text-accent',
  occupied: 'bg-fg text-white',
  cleaning: 'bg-row-divider text-muted',
  unavailable: 'bg-danger-soft text-danger',
};

const BASE =
  'inline-flex items-center rounded-pill px-2.5 py-0.5 text-[10px] font-semibold tracking-wide uppercase';

export function BookingStatusPill({
  status,
  className,
}: {
  status: BookingStatus;
  className?: string;
}) {
  return (
    <span className={cn(BASE, BOOKING_TONE[status], className)}>
      {BOOKING_STATUS_LABELS[status]}
    </span>
  );
}

export function TableStatusPill({
  status,
  className,
}: {
  status: TableStatus;
  className?: string;
}) {
  return (
    <span className={cn(BASE, TABLE_TONE[status], className)}>
      {TABLE_STATUS_LABELS[status]}
    </span>
  );
}
