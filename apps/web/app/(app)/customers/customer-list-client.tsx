'use client';

import * as React from 'react';
import { useRouter } from 'next/navigation';
import type { ColumnDef } from '@tanstack/react-table';
import { Input, Badge, DataTable } from '@buranchi/ui';

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
      return v ? <span>{v}</span> : <span className="text-border">—</span>;
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
}: {
  initialRows: CustomerRow[];
  initialQuery: string;
  loyaltyEnabled: boolean;
}) {
  const router = useRouter();
  const [q, setQ] = React.useState(initialQuery);

  React.useEffect(() => {
    const handle = setTimeout(() => {
      const params = new URLSearchParams();
      if (q) params.set('q', q);
      router.replace(`/customers${params.toString() ? `?${params.toString()}` : ''}`);
    }, 250);
    return () => clearTimeout(handle);
  }, [q, router]);

  const columns = React.useMemo(() => {
    if (!loyaltyEnabled) return baseColumns;
    // Insert Tier + Points after Phone (index 3).
    const next = [...baseColumns];
    next.splice(3, 0, ...loyaltyColumns);
    return next;
  }, [loyaltyEnabled]);

  return (
    <div className="space-y-3">
      <Input placeholder="Search by name…" value={q} onChange={(e) => setQ(e.target.value)} />
      <DataTable
        columns={columns}
        data={initialRows}
        onRowClick={(row) => router.push(`/customers/${row.id}`)}
      />
    </div>
  );
}
