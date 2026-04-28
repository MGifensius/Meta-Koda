'use client';

import * as React from 'react';
import Link from 'next/link';
import { useRouter, usePathname } from 'next/navigation';
import { Calendar, MessageSquare, User } from 'lucide-react';
import { BookingStatusPill } from '@/components/status-pill';
import {
  BOOKING_SOURCE_LABELS,
  type BookingStatus,
  type BookingSource,
} from '@buranchi/shared';

export interface BookingRow {
  id: string;
  starts_at: string;
  ends_at: string;
  party_size: number;
  source: BookingSource;
  status: BookingStatus;
  special_request: string | null;
  customer: { id: string; display_id: string; full_name: string };
  table: { id: string; code: string };
}

export function BookingsListClient({
  initialRows,
  initialFilters,
}: {
  initialRows: BookingRow[];
  initialFilters: { range: string; status: string; source: string };
}) {
  const router = useRouter();
  const pathname = usePathname();
  const [filters, setFilters] = React.useState(initialFilters);

  function updateFilter(key: keyof typeof filters, value: string) {
    const next = { ...filters, [key]: value };
    setFilters(next);
    const params = new URLSearchParams();
    if (next.range !== 'all') params.set('range', next.range);
    if (next.status !== 'all') params.set('status', next.status);
    if (next.source !== 'all') params.set('source', next.source);
    router.replace(`${pathname}${params.toString() ? `?${params.toString()}` : ''}`);
  }

  const filterClass =
    'h-[33px] rounded-input border border-border bg-surface px-2.5 text-[12px] text-fg appearance-none cursor-pointer';

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2">
        <select
          aria-label="Date range"
          className={filterClass}
          value={filters.range}
          onChange={(e) => updateFilter('range', e.target.value)}
        >
          <option value="today">Today</option>
          <option value="tomorrow">Tomorrow</option>
          <option value="week">This week</option>
          <option value="all">All</option>
        </select>
        <select
          aria-label="Status"
          className={filterClass}
          value={filters.status}
          onChange={(e) => updateFilter('status', e.target.value)}
        >
          <option value="all">All statuses</option>
          <option value="confirmed">Confirmed</option>
          <option value="seated">Seated</option>
          <option value="completed">Completed</option>
          <option value="cancelled">Cancelled</option>
          <option value="no_show">No-show</option>
        </select>
        <select
          aria-label="Source"
          className={filterClass}
          value={filters.source}
          onChange={(e) => updateFilter('source', e.target.value)}
        >
          <option value="all">All sources</option>
          <option value="manual">Manual</option>
          <option value="walk_in">Walk-in</option>
        </select>
      </div>

      {initialRows.length === 0 ? (
        <div className="rounded-card bg-surface shadow-card py-12 text-center">
          <Calendar className="h-8 w-8 text-muted mx-auto mb-2" />
          <p className="text-body-strong text-fg">No bookings match these filters</p>
          <p className="text-[12px] text-muted">
            Try widening the date range or clearing the status filter.
          </p>
        </div>
      ) : (
        <div className="rounded-card bg-surface shadow-card overflow-hidden">
          <div className="px-4 grid grid-cols-[180px_1fr_90px_70px_120px_100px] py-3 text-label uppercase text-muted border-b border-border">
            <div>Time</div>
            <div>Customer</div>
            <div>Table</div>
            <div>Party</div>
            <div>Status</div>
            <div>Source</div>
          </div>
          {initialRows.map((b) => (
            <Link
              key={b.id}
              href={`/bookings/${b.id}`}
              className="px-4 grid grid-cols-[180px_1fr_90px_70px_120px_100px] py-3 border-b border-row-divider last:border-b-0 text-[12px] items-center hover:bg-canvas"
            >
              <div className="text-fg">{formatStartsAt(b.starts_at)}</div>
              <div>
                <p className="font-medium text-fg">{b.customer.full_name}</p>
                {b.special_request ? (
                  <p className="text-[11px] text-muted truncate">{b.special_request}</p>
                ) : null}
              </div>
              <div className="font-mono text-muted">{b.table.code}</div>
              <div className="text-fg">{b.party_size}</div>
              <div>
                <BookingStatusPill status={b.status} />
              </div>
              <div className="inline-flex items-center gap-1.5 text-muted">
                {b.source === 'walk_in' ? (
                  <User className="h-3 w-3" />
                ) : (
                  <MessageSquare className="h-3 w-3" />
                )}
                <span>{BOOKING_SOURCE_LABELS[b.source]}</span>
              </div>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}

function formatStartsAt(iso: string): string {
  const d = new Date(iso);
  const now = new Date();
  const sameDay = d.toDateString() === now.toDateString();
  const tomorrow = new Date(now);
  tomorrow.setDate(now.getDate() + 1);
  const isTomorrow = d.toDateString() === tomorrow.toDateString();
  const time = d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  if (sameDay) return `Today ${time}`;
  if (isTomorrow) return `Tomorrow ${time}`;
  return (
    d.toLocaleDateString([], { weekday: 'short', month: 'short', day: 'numeric' }) +
    ' · ' +
    time
  );
}
