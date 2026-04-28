'use client';

import * as React from 'react';
import {
  flexRender,
  getCoreRowModel,
  useReactTable,
  type ColumnDef,
} from '@tanstack/react-table';
import { cn } from '../lib/cn';

export interface DataTableProps<TData> {
  columns: ColumnDef<TData, unknown>[];
  data: TData[];
  emptyState?: React.ReactNode;
  className?: string;
  onRowClick?: (row: TData) => void;
}

export function DataTable<TData>({ columns, data, emptyState, className, onRowClick }: DataTableProps<TData>) {
  const table = useReactTable({ data, columns, getCoreRowModel: getCoreRowModel() });

  return (
    <div className={cn('rounded-card bg-surface shadow-card', className)}>
      <div className="px-4">
        <div className="grid border-b border-border" style={{ gridTemplateColumns: `repeat(${columns.length}, minmax(0, 1fr))` }}>
          {table.getHeaderGroups().map((hg) =>
            hg.headers.map((h) => (
              <div key={h.id} className="text-label uppercase text-muted py-3">
                {flexRender(h.column.columnDef.header, h.getContext())}
              </div>
            )),
          )}
        </div>
        {data.length === 0 ? (
          <div className="py-10 text-center">{emptyState}</div>
        ) : (
          table.getRowModel().rows.map((row) => (
            <div
              key={row.id}
              onClick={onRowClick ? () => onRowClick(row.original) : undefined}
              className={cn('grid border-b border-row-divider last:border-b-0 py-3 text-[12px] items-center', onRowClick && 'hover:bg-canvas cursor-pointer')}
              style={{ gridTemplateColumns: `repeat(${columns.length}, minmax(0, 1fr))` }}
            >
              {row.getVisibleCells().map((cell) => (
                <div key={cell.id}>{flexRender(cell.column.columnDef.cell, cell.getContext())}</div>
              ))}
            </div>
          ))
        )}
      </div>
    </div>
  );
}
