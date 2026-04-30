'use client';

import * as React from 'react';
import Link from 'next/link';
import { Check, Pencil, Trash2 } from 'lucide-react';
import { Button } from '@buranchi/ui';
import { verifyNoteAction, updateNoteAction, deleteNoteAction } from '@/lib/actions/customer-notes';

export interface PendingNote {
  id: string;
  customer_id: string;
  customer_name: string;
  note: string;
  source_conversation_id: string | null;
  created_at: string;
}

export function CustomerNotesReviewList({ notes }: { notes: PendingNote[] }) {
  const [editingId, setEditingId] = React.useState<string | null>(null);
  const [draft, setDraft] = React.useState('');
  const [pending, startTransition] = React.useTransition();
  const [error, setError] = React.useState<string | undefined>();
  // Optimistically hide rows that have been verified/deleted; reconcile when
  // the server-rendered list comes back via revalidatePath.
  const [optimisticHiddenIds, hideId] = React.useOptimistic<Set<string>, string>(
    new Set<string>(),
    (prev, id) => new Set(prev).add(id),
  );
  const visibleNotes = notes.filter((n) => !optimisticHiddenIds.has(n.id));

  function verify(id: string) {
    setError(undefined);
    startTransition(async () => {
      hideId(id);
      const res = await verifyNoteAction(id);
      if (!res.ok) setError(res.message);
    });
  }
  function saveEdit(id: string) {
    setError(undefined);
    startTransition(async () => {
      hideId(id);
      const res = await updateNoteAction(id, { note: draft });
      if (!res.ok) {
        setError(res.message);
        return;
      }
      setEditingId(null);
      setDraft('');
    });
  }
  function remove(id: string) {
    if (!confirm('Delete this note?')) return;
    setError(undefined);
    startTransition(async () => {
      hideId(id);
      const res = await deleteNoteAction(id);
      if (!res.ok) setError(res.message);
    });
  }

  if (visibleNotes.length === 0) {
    return (
      <div className="rounded-card bg-surface shadow-card py-12 text-center">
        <p className="text-body-strong text-fg">All caught up</p>
        <p className="text-[12px] text-muted mt-1">No customer notes are awaiting review.</p>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {error ? <p className="text-[12px] text-danger">{error}</p> : null}
      <div className="rounded-card bg-surface shadow-card overflow-hidden">
        {visibleNotes.map((n) => (
          <div
            key={n.id}
            className="border-b border-row-divider last:border-b-0 px-4 py-3 flex items-start gap-3"
          >
            <div className="flex-1 min-w-0">
              <Link
                href={`/customers/${n.customer_id}`}
                className="text-accent hover:underline text-[12px] font-medium"
              >
                {n.customer_name}
              </Link>
              {editingId === n.id ? (
                <input
                  className="mt-1 h-[33px] w-full rounded-input border border-border bg-surface px-3 text-[12px] text-fg"
                  value={draft}
                  onChange={(e) => setDraft(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') saveEdit(n.id);
                  }}
                />
              ) : (
                <p className="text-[12px] text-fg mt-0.5">{n.note}</p>
              )}
              <p className="text-[10px] text-muted mt-1 inline-flex items-center gap-2">
                <span className="rounded-pill bg-accent-soft text-accent px-1.5 py-0.5 font-semibold uppercase tracking-wide">
                  Koda · pending
                </span>
                <span>{new Date(n.created_at).toLocaleString()}</span>
                {n.source_conversation_id ? (
                  <Link
                    href={`/koda/${n.source_conversation_id}`}
                    className="text-accent hover:underline"
                  >
                    View conversation →
                  </Link>
                ) : null}
              </p>
            </div>
            <div className="flex gap-1 shrink-0">
              {editingId === n.id ? (
                <>
                  <Button size="sm" disabled={pending} onClick={() => saveEdit(n.id)}>
                    Save
                  </Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => {
                      setEditingId(null);
                      setDraft('');
                    }}
                  >
                    Cancel
                  </Button>
                </>
              ) : (
                <>
                  <Button size="sm" disabled={pending} onClick={() => verify(n.id)}>
                    <Check className="h-3.5 w-3.5" /> Verify
                  </Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => {
                      setEditingId(n.id);
                      setDraft(n.note);
                    }}
                  >
                    <Pencil className="h-3.5 w-3.5" />
                  </Button>
                  <Button size="sm" variant="ghost" disabled={pending} onClick={() => remove(n.id)}>
                    <Trash2 className="h-3.5 w-3.5" />
                  </Button>
                </>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
