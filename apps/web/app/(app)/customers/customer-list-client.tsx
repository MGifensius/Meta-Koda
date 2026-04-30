'use client';

import * as React from 'react';
import { useRouter } from 'next/navigation';
import type { ColumnDef } from '@tanstack/react-table';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { Input, Badge, DataTable, Button } from '@buranchi/ui';
import { formatPhoneDisplay } from '@buranchi/shared';

export interface CustomerRow {
  id: string;
  display_id: string;
  full_name: string;
  phone: string | null;
  tags: string[];
  created_at: string;
  is_member: boolean;
  points_balance: number;
  tier_name: string | null;
  tier_index: number | null;
}

const TIER_COLOR: Record<number, string> = {
  0: 'bg-row-divider text-muted',
  1: 'bg-accent-soft text-accent',
  2: 'bg-success-soft text-success',
  3: 'bg-fg text-white',
};

const baseColumns: ColumnDef<CustomerRow>[] = [
  {
    header: 'ID',
    accessorKey: 'display_id',
    cell: ({ getValue }) => <span className="font-mono text-muted">{getValue<string>()}</span>,
  },
  {
    header: 'Name',
    accessorKey: 'full_name',
    cell: ({ getValue }) => <span className="font-medium text-fg">{getValue<string>()}</span>,
  },
  {
    header: 'Phone',
    accessorKey: 'phone',
    cell: ({ getValue }) => {
      const v = getValue<string | null>();
      return v ? <span>{formatPhoneDisplay(v)}</span> : <span className="text-border">—</span>;
    },
  },
  {
    header: 'Tags',
    accessorKey: 'tags',
    cell: ({ getValue }) => {
      const tags = getValue<string[]>() ?? [];
      return (
        <div className="flex flex-wrap gap-1">
          {tags.map((t) => (
            <Badge key={t}>{t}</Badge>
          ))}
        </div>
      );
    },
  },
  {
    header: 'Created',
    accessorKey: 'created_at',
    cell: ({ getValue }) => {
      const d = new Date(getValue<string>());
      return <span className="text-muted">{d.toLocaleDateString()}</span>;
    },
  },
];

const loyaltyColumns: ColumnDef<CustomerRow>[] = [
  {
    header: 'Tier',
    accessorKey: 'tier_name',
    cell: ({ row }) => {
      const r = row.original;
      if (!r.is_member || r.tier_name == null) {
        return <span className="text-border">—</span>;
      }
      const color = TIER_COLOR[r.tier_index ?? 0] ?? TIER_COLOR[0];
      return (
        <span
          className={`inline-flex items-center rounded-pill px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide ${color}`}
        >
          {r.tier_name}
        </span>
      );
    },
  },
  {
    header: 'Points',
    accessorKey: 'points_balance',
    cell: ({ row }) => {
      const r = row.original;
      if (!r.is_member) return <span className="text-border">—</span>;
      return <span className="font-mono text-fg">{r.points_balance.toLocaleString()}</span>;
    },
  },
];

export function CustomerListClient({
  initialRows,
  initialQuery,
  loyaltyEnabled,
  page,
  totalPages,
  totalCount,
  pageSize,
}: {
  initialRows: CustomerRow[];
  initialQuery: string;
  loyaltyEnabled: boolean;
  page: number;
  totalPages: number;
  totalCount: number;
  pageSize: number;
}) {
  const router = useRouter();
  const [q, setQ] = React.useState(initialQuery);

  // When the user types in the search box, debounce the URL replace and reset
  // back to page 1 — searching from page 5 of the unfiltered list shouldn't
  // land on page 5 of the filtered list.
  React.useEffect(() => {
    const handle = setTimeout(() => {
      const params = new URLSearchParams();
      if (q) params.set('q', q);
      const target = `/customers${params.toString() ? `?${params.toString()}` : ''}`;
      router.replace(target);
    }, 250);
    return () => clearTimeout(handle);
  }, [q, router]);

  function gotoPage(next: number) {
    const params = new URLSearchParams();
    if (q) params.set('q', q);
    if (next > 1) params.set('page', String(next));
    router.push(`/customers${params.toString() ? `?${params.toString()}` : ''}`);
  }

  const columns = React.useMemo(() => {
    if (!loyaltyEnabled) return baseColumns;
    // Insert Tier + Points after Phone (index 3).
    const next = [...baseColumns];
    next.splice(3, 0, ...loyaltyColumns);
    return next;
  }, [loyaltyEnabled]);

  const rangeStart = totalCount === 0 ? 0 : (page - 1) * pageSize + 1;
  const rangeEnd = Math.min(page * pageSize, totalCount);

  return (
    <div className="space-y-3">
      <Input placeholder="Search by name…" value={q} onChange={(e) => setQ(e.target.value)} />
      <DataTable
        columns={columns}
        data={initialRows}
        onRowClick={(row) => router.push(`/customers/${row.id}`)}
      />
      {totalCount > 0 ? (
        <div className="flex items-center justify-between text-[12px] text-muted">
          <span>
            {rangeStart}–{rangeEnd} of {totalCount.toLocaleString()}
          </span>
          <div className="flex items-center gap-2">
            <Button
              size="sm"
              variant="outline"
              disabled={page <= 1}
              onClick={() => gotoPage(page - 1)}
              aria-label="Previous page"
            >
              <ChevronLeft className="h-3.5 w-3.5" /> Prev
            </Button>
            <span className="text-fg">
              Page {page} of {totalPages}
            </span>
            <Button
              size="sm"
              variant="outline"
              disabled={page >= totalPages}
              onClick={() => gotoPage(page + 1)}
              aria-label="Next page"
            >
              Next <ChevronRight className="h-3.5 w-3.5" />
            </Button>
          </div>
        </div>
      ) : null}
    </div>
  );
}
