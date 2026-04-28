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
}

const columns: ColumnDef<CustomerRow>[] = [
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
          {tags.map((t) => <Badge key={t}>{t}</Badge>)}
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

export function CustomerListClient({ initialRows, initialQuery }: { initialRows: CustomerRow[]; initialQuery: string }) {
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

  return (
    <div className="space-y-3">
      <Input placeholder="Search by name…" value={q} onChange={(e) => setQ(e.target.value)} />
      <DataTable columns={columns} data={initialRows} onRowClick={(row) => router.push(`/customers/${row.id}`)} />
    </div>
  );
}
