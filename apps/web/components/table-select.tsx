'use client';

import * as React from 'react';
import { ChevronDown } from 'lucide-react';
import { getAvailableTablesForSlot, type AvailableTable } from '@/lib/actions/tables';

const selectClass =
  'h-[33px] w-full rounded-input border border-border bg-surface pl-2.5 pr-7 text-[12px] text-fg appearance-none cursor-pointer focus:outline-none focus:ring-2 focus:ring-accent focus:border-accent';

interface TableSelectProps {
  value: string;
  onChange: (next: string) => void;
  startsAt: Date | null;
  partySize: number;
  excludeBookingId?: string;
}

export function TableSelect({
  value,
  onChange,
  startsAt,
  partySize,
  excludeBookingId,
}: TableSelectProps) {
  const [tables, setTables] = React.useState<AvailableTable[]>([]);
  const [loading, setLoading] = React.useState(false);
  const startsAtKey = startsAt?.toISOString() ?? '';

  React.useEffect(() => {
    if (!startsAt || !partySize) {
      setTables([]);
      return;
    }
    setLoading(true);
    getAvailableTablesForSlot(startsAt, partySize, excludeBookingId)
      .then((rows) => setTables(rows))
      .finally(() => setLoading(false));
  }, [startsAtKey, partySize, excludeBookingId]);

  if (!startsAt || !partySize) {
    return <p className="text-[12px] text-muted">Pick a date, time, and party size first.</p>;
  }

  if (loading) return <p className="text-[12px] text-muted">Looking for free tables…</p>;
  if (tables.length === 0) {
    return (
      <p className="text-[12px] text-danger">
        No tables fit the party size and time. Try a different time.
      </p>
    );
  }

  return (
    <div className="relative">
      <select
        aria-label="Table"
        className={selectClass}
        value={value}
        onChange={(e) => onChange(e.target.value)}
      >
        <option value="">Select a table…</option>
        {tables.map((t) => (
          <option key={t.id} value={t.id}>
            {t.code} · seats {t.capacity}
            {t.floor_area ? ` · ${t.floor_area}` : ''}
          </option>
        ))}
      </select>
      <ChevronDown className="pointer-events-none absolute right-2 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted" />
    </div>
  );
}
