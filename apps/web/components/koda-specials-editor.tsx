'use client';

import * as React from 'react';
import { Plus, Trash2, Pencil } from 'lucide-react';
import { Button, Input, Textarea, FormField } from '@buranchi/ui';
import {
  createSpecialAction,
  updateSpecialAction,
  deleteSpecialAction,
} from '@/lib/actions/koda-specials';

export interface SpecialEntry {
  id: string;
  title: string;
  description: string | null;
  starts_on: string | null;
  ends_on: string | null;
  is_active: boolean;
}

export function KodaSpecialsEditor({ entries }: { entries: SpecialEntry[] }) {
  const [editingId, setEditingId] = React.useState<string | null>(null);
  const [adding, setAdding] = React.useState(false);
  const [pending, startTransition] = React.useTransition();
  const [error, setError] = React.useState<string | undefined>();

  function handleAdd(v: {
    title: string;
    description?: string;
    starts_on?: string;
    ends_on?: string;
  }) {
    setError(undefined);
    startTransition(async () => {
      try {
        await createSpecialAction({ ...v, is_active: true });
        setAdding(false);
      } catch (e) {
        setError(e instanceof Error ? e.message : 'Failed');
      }
    });
  }
  function handleUpdate(id: string, v: Partial<SpecialEntry>) {
    setError(undefined);
    startTransition(async () => {
      try {
        await updateSpecialAction(id, {
          ...(v.title !== undefined ? { title: v.title } : {}),
          ...(v.description !== undefined ? { description: v.description ?? undefined } : {}),
          ...(v.starts_on !== undefined ? { starts_on: v.starts_on ?? undefined } : {}),
          ...(v.ends_on !== undefined ? { ends_on: v.ends_on ?? undefined } : {}),
          ...(v.is_active !== undefined ? { is_active: v.is_active } : {}),
        });
        setEditingId(null);
      } catch (e) {
        setError(e instanceof Error ? e.message : 'Failed');
      }
    });
  }
  function handleDelete(id: string) {
    if (!confirm('Delete this special?')) return;
    setError(undefined);
    startTransition(async () => {
      try {
        await deleteSpecialAction(id);
      } catch (e) {
        setError(e instanceof Error ? e.message : 'Failed');
      }
    });
  }

  return (
    <div className="space-y-3">
      {error ? <p className="text-[12px] text-danger">{error}</p> : null}
      <div className="rounded-card bg-surface shadow-card overflow-hidden">
        {entries.map((e) => (
          <div key={e.id} className="border-b border-row-divider last:border-b-0">
            {editingId === e.id ? (
              <SpecialRowForm
                initial={e}
                onCancel={() => setEditingId(null)}
                onSubmit={(v) => handleUpdate(e.id, v)}
                pending={pending}
              />
            ) : (
              <div className="px-4 py-3 flex items-start gap-3">
                <div className="flex-1 min-w-0">
                  <p className="text-[12px] font-medium text-fg">{e.title}</p>
                  {e.description ? (
                    <p className="text-[11px] text-muted line-clamp-2 mt-0.5">{e.description}</p>
                  ) : null}
                  <p className="text-[10px] text-muted mt-1">
                    {e.starts_on || e.ends_on
                      ? `${e.starts_on ?? '∞'} → ${e.ends_on ?? '∞'}`
                      : 'always-on'}
                    {!e.is_active ? ' · inactive' : ''}
                  </p>
                </div>
                <div className="flex gap-1 shrink-0">
                  <Button size="sm" variant="ghost" onClick={() => setEditingId(e.id)}>
                    <Pencil className="h-3.5 w-3.5" />
                  </Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    disabled={pending}
                    onClick={() => handleDelete(e.id)}
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </Button>
                </div>
              </div>
            )}
          </div>
        ))}
        {entries.length === 0 && !adding ? (
          <div className="px-4 py-8 text-center text-[12px] text-muted">
            No specials configured. Add one to enable upsell.
          </div>
        ) : null}
        {adding ? (
          <SpecialRowForm onCancel={() => setAdding(false)} onSubmit={handleAdd} pending={pending} />
        ) : null}
      </div>
      {!adding ? (
        <Button size="sm" variant="outline" onClick={() => setAdding(true)}>
          <Plus className="h-3.5 w-3.5" /> Add special
        </Button>
      ) : null}
    </div>
  );
}

function SpecialRowForm({
  initial,
  onCancel,
  onSubmit,
  pending,
}: {
  initial?: SpecialEntry;
  onCancel: () => void;
  onSubmit: (v: {
    title: string;
    description?: string;
    starts_on?: string;
    ends_on?: string;
    is_active?: boolean;
  }) => void;
  pending: boolean;
}) {
  const [title, setTitle] = React.useState(initial?.title ?? '');
  const [description, setDescription] = React.useState(initial?.description ?? '');
  const [startsOn, setStartsOn] = React.useState(initial?.starts_on ?? '');
  const [endsOn, setEndsOn] = React.useState(initial?.ends_on ?? '');
  const [isActive, setIsActive] = React.useState(initial?.is_active ?? true);

  return (
    <div className="px-4 py-3 bg-canvas space-y-3">
      <FormField id="sp-title" label="Title" required>
        <Input
          id="sp-title"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="Weekend Brunch 30% off"
        />
      </FormField>
      <FormField id="sp-desc" label="Description">
        <Textarea
          id="sp-desc"
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          placeholder="Setiap Sabtu-Minggu jam 10-14, semua menu brunch diskon 30%."
        />
      </FormField>
      <div className="grid grid-cols-2 gap-3">
        <FormField id="sp-start" label="Starts on" hint="optional">
          <Input
            id="sp-start"
            type="date"
            value={startsOn}
            onChange={(e) => setStartsOn(e.target.value)}
          />
        </FormField>
        <FormField id="sp-end" label="Ends on" hint="optional">
          <Input id="sp-end" type="date" value={endsOn} onChange={(e) => setEndsOn(e.target.value)} />
        </FormField>
      </div>
      <label className="inline-flex items-center gap-2 text-[12px] text-fg">
        <input type="checkbox" checked={isActive} onChange={(e) => setIsActive(e.target.checked)} />
        <span>Active</span>
      </label>
      <div className="flex gap-2">
        <Button
          size="sm"
          disabled={pending || !title.trim()}
          onClick={() =>
            onSubmit({
              title: title.trim(),
              ...(description.trim() ? { description: description.trim() } : {}),
              ...(startsOn ? { starts_on: startsOn } : {}),
              ...(endsOn ? { ends_on: endsOn } : {}),
              is_active: isActive,
            })
          }
        >
          {pending ? 'Saving…' : 'Save'}
        </Button>
        <Button size="sm" variant="ghost" onClick={onCancel}>
          Cancel
        </Button>
      </div>
    </div>
  );
}
