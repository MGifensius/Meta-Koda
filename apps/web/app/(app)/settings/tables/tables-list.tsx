'use client';

import * as React from 'react';
import { Pencil, Trash2 } from 'lucide-react';
import { Button } from '@buranchi/ui';
import { TableStatusPill } from '@/components/status-pill';
import { TableForm } from '@/components/table-form';
import { deleteTableAction, updateTableAction } from '@/lib/actions/tables';
import type { TableStatus } from '@buranchi/shared';

export interface TableRow {
  id: string;
  code: string;
  capacity: number;
  floor_area: string | null;
  status: TableStatus;
  is_active: boolean;
}

export function TablesList({ rows }: { rows: TableRow[] }) {
  const [editingId, setEditingId] = React.useState<string | null>(null);
  const [error, setError] = React.useState<string | undefined>();
  const [pendingId, setPendingId] = React.useState<string | null>(null);

  async function handleDelete(id: string, code: string) {
    if (!confirm(`Delete table ${code}? Tables with bookings cannot be deleted.`)) return;
    setError(undefined);
    setPendingId(id);
    try {
      const res = await deleteTableAction(id);
      if (res.ok) return;
      setError(res.message);
      if (res.code === 'TABLE_HAS_BOOKINGS') {
        if (confirm('This table has historical bookings. Set inactive instead?')) {
          const upd = await updateTableAction(id, { is_active: false });
          if (!upd.ok) setError(upd.message);
        }
      }
    } finally {
      setPendingId(null);
    }
  }

  return (
    <div className="space-y-3">
      {error ? <p className="text-[12px] text-danger">{error}</p> : null}
      <div className="rounded-card bg-surface shadow-card overflow-hidden">
        <div className="px-4 grid grid-cols-[80px_80px_1fr_140px_80px_120px] py-3 text-label uppercase text-muted border-b border-border">
          <div>Code</div>
          <div>Capacity</div>
          <div>Floor area</div>
          <div>Status</div>
          <div>Active</div>
          <div></div>
        </div>
        {rows.map((t) => (
          <div key={t.id}>
            <div className="px-4 grid grid-cols-[80px_80px_1fr_140px_80px_120px] py-3 border-b border-row-divider last:border-b-0 text-[12px] items-center">
              <div className="font-mono text-fg">{t.code}</div>
              <div className="text-fg">{t.capacity}</div>
              <div className="text-muted">
                {t.floor_area ?? <span className="text-border">—</span>}
              </div>
              <div>
                <TableStatusPill status={t.status} />
              </div>
              <div className="text-muted">{t.is_active ? 'Yes' : 'No'}</div>
              <div className="flex justify-end gap-1">
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => setEditingId(editingId === t.id ? null : t.id)}
                >
                  <Pencil className="h-3.5 w-3.5" />
                  <span>{editingId === t.id ? 'Close' : 'Edit'}</span>
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  disabled={pendingId === t.id}
                  onClick={() => handleDelete(t.id, t.code)}
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </Button>
              </div>
            </div>
            {editingId === t.id ? (
              <div className="px-4 py-4 bg-canvas">
                <TableForm
                  id={t.id}
                  defaults={{
                    code: t.code,
                    capacity: t.capacity,
                    ...(t.floor_area ? { floor_area: t.floor_area } : {}),
                    is_active: t.is_active,
                  }}
                  onSuccess={() => setEditingId(null)}
                />
              </div>
            ) : null}
          </div>
        ))}
        {rows.length === 0 ? (
          <div className="px-4 py-8 text-center text-[12px] text-muted">
            No tables yet. Add your first table above.
          </div>
        ) : null}
      </div>
    </div>
  );
}
