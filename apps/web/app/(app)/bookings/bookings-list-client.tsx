'use client';

import * as React from 'react';
import Link from 'next/link';
import { useRouter, usePathname } from 'next/navigation';
import {
  Calendar,
  ChevronDown,
  CircleCheck,
  Filter,
  MessageSquare,
  Tag,
  User,
} from 'lucide-react';
import { cn } from '@buranchi/ui';
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

  const rangeOptions: { value: string; label: string }[] = [
    { value: 'today', label: 'Today' },
    { value: 'tomorrow', label: 'Tomorrow' },
    { value: 'week', label: 'This week' },
    { value: 'all', label: 'All time' },
  ];

  const statusActive = filters.status !== 'all';
  const sourceActive = filters.source !== 'all';

  return (
    <div className="space-y-3">
      <div className="rounded-card bg-surface shadow-card px-3 py-2.5 flex flex-wrap items-center gap-2">
        <span className="inline-flex items-center gap-1.5 text-[10px] uppercase tracking-[0.08em] text-muted font-semibold pr-2 pl-1">
          <Filter className="h-3 w-3" />
          Filters
        </span>

        <div className="inline-flex items-center gap-1 rounded-pill bg-canvas p-0.5" role="group" aria-label="Date range">
          {rangeOptions.map((opt) => {
            const active = filters.range === opt.value;
            return (
              <button
                key={opt.value}
                type="button"
                onClick={() => updateFilter('range', opt.value)}
                className={cn(
                  'inline-flex items-center gap-1.5 rounded-pill px-2.5 h-7 text-[11px] font-medium transition-colors',
                  active
                    ? 'bg-surface text-fg shadow-card'
                    : 'text-muted hover:text-fg',
                )}
              >
                {opt.value === 'today' || opt.value === 'tomorrow' ? (
                  <Calendar className="h-3 w-3" />
                ) : null}
                {opt.label}
              </button>
            );
          })}
        </div>

        <FilterSelect
          icon={<CircleCheck className="h-3 w-3" />}
          label="Status"
          value={filters.status}
          active={statusActive}
          onChange={(v) => updateFilter('status', v)}
          options={[
            { value: 'all', label: 'All statuses' },
            { value: 'confirmed', label: 'Confirmed' },
            { value: 'seated', label: 'Seated' },
            { value: 'completed', label: 'Completed' },
            { value: 'cancelled', label: 'Cancelled' },
            { value: 'no_show', label: 'No-show' },
          ]}
        />
        <FilterSelect
          icon={<Tag className="h-3 w-3" />}
          label="Source"
          value={filters.source}
          active={sourceActive}
          onChange={(v) => updateFilter('source', v)}
          options={[
            { value: 'all', label: 'All sources' },
            { value: 'manual', label: 'Manual' },
            { value: 'walk_in', label: 'Walk-in' },
          ]}
        />

        {(filters.range !== 'today' || statusActive || sourceActive) ? (
          <button
            type="button"
            onClick={() => {
              setFilters({ range: 'today', status: 'all', source: 'all' });
              router.replace(pathname);
            }}
            className="ml-auto inline-flex items-center text-[11px] text-muted hover:text-fg transition-colors px-2 h-7"
          >
            Reset
          </button>
        ) : null}
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

interface FilterSelectProps {
  icon: React.ReactNode;
  label: string;
  value: string;
  active: boolean;
  onChange: (value: string) => void;
  options: { value: string; label: string }[];
}

function FilterSelect({ icon, label, value, active, onChange, options }: FilterSelectProps) {
  const current = options.find((o) => o.value === value);
  return (
    <label
      className={cn(
        'relative inline-flex items-center gap-1.5 h-7 rounded-pill border px-2.5 text-[11px] font-medium cursor-pointer transition-colors',
        active
          ? 'border-accent/30 bg-accent-soft text-accent'
          : 'border-row-divider bg-canvas text-fg hover:border-border',
      )}
    >
      <span className={active ? 'text-accent' : 'text-muted'}>{icon}</span>
      <span className={active ? 'text-accent' : 'text-muted'}>{label}:</span>
      <span className="font-semibold">{current?.label ?? '—'}</span>
      <ChevronDown className={cn('h-3 w-3', active ? 'text-accent' : 'text-muted')} />
      <select
        aria-label={label}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="absolute inset-0 opacity-0 cursor-pointer"
      >
        {options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
    </label>
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
