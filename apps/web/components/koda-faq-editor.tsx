'use client';

import * as React from 'react';
import { Plus, Trash2, GripVertical, Pencil } from 'lucide-react';
import { Button, Input, Textarea, FormField } from '@buranchi/ui';
import { createFaqAction, updateFaqAction, deleteFaqAction } from '@/lib/actions/koda-faq';

export interface FaqEntry {
  id: string;
  question: string;
  answer: string;
  is_active: boolean;
  sort_order: number;
}

export function KodaFaqEditor({ entries }: { entries: FaqEntry[] }) {
  const [editingId, setEditingId] = React.useState<string | null>(null);
  const [adding, setAdding] = React.useState(false);
  const [pending, startTransition] = React.useTransition();
  const [error, setError] = React.useState<string | undefined>();

  function handleAdd(values: { question: string; answer: string }) {
    setError(undefined);
    startTransition(async () => {
      const res = await createFaqAction({
        ...values,
        is_active: true,
        sort_order: entries.length,
      });
      if (!res.ok) {
        setError(res.message);
        return;
      }
      setAdding(false);
    });
  }
  function handleUpdate(
    id: string,
    values: { question: string; answer: string; is_active: boolean },
  ) {
    setError(undefined);
    startTransition(async () => {
      const res = await updateFaqAction(id, values);
      if (!res.ok) {
        setError(res.message);
        return;
      }
      setEditingId(null);
    });
  }
  function handleDelete(id: string) {
    if (!confirm('Delete this FAQ entry?')) return;
    setError(undefined);
    startTransition(async () => {
      const res = await deleteFaqAction(id);
      if (!res.ok) setError(res.message);
    });
  }

  return (
    <div className="space-y-3">
      {error ? <p className="text-[12px] text-danger">{error}</p> : null}
      <div className="rounded-card bg-surface shadow-card overflow-hidden">
        {entries.map((e) => (
          <div key={e.id} className="border-b border-row-divider last:border-b-0">
            {editingId === e.id ? (
              <FaqRowForm
                initial={e}
                onCancel={() => setEditingId(null)}
                onSubmit={(v) => handleUpdate(e.id, v)}
                pending={pending}
              />
            ) : (
              <div className="px-4 py-3 flex items-start gap-3">
                <GripVertical className="h-4 w-4 text-border mt-0.5 shrink-0" />
                <div className="flex-1 min-w-0">
                  <p className="text-[12px] font-medium text-fg">{e.question}</p>
                  <p className="text-[11px] text-muted line-clamp-2 mt-0.5">{e.answer}</p>
                  {!e.is_active ? (
                    <p className="text-[10px] text-muted mt-1">(inactive)</p>
                  ) : null}
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
            No FAQ entries yet. Click "+ Add entry" to write Koda's first answer.
          </div>
        ) : null}
        {adding ? (
          <FaqRowForm onCancel={() => setAdding(false)} onSubmit={handleAdd} pending={pending} />
        ) : null}
      </div>
      {!adding ? (
        <Button size="sm" variant="outline" onClick={() => setAdding(true)}>
          <Plus className="h-3.5 w-3.5" /> Add entry
        </Button>
      ) : null}
    </div>
  );
}

function FaqRowForm({
  initial,
  onCancel,
  onSubmit,
  pending,
}: {
  initial?: FaqEntry;
  onCancel: () => void;
  onSubmit: (v: { question: string; answer: string; is_active: boolean }) => void;
  pending: boolean;
}) {
  const [question, setQuestion] = React.useState(initial?.question ?? '');
  const [answer, setAnswer] = React.useState(initial?.answer ?? '');
  const [isActive, setIsActive] = React.useState(initial?.is_active ?? true);

  return (
    <div className="px-4 py-3 bg-canvas space-y-3">
      <FormField id="faq-q" label="Question" required>
        <Input
          id="faq-q"
          value={question}
          onChange={(e) => setQuestion(e.target.value)}
          placeholder="e.g. Apakah ada menu vegetarian?"
        />
      </FormField>
      <FormField id="faq-a" label="Answer" required>
        <Textarea
          id="faq-a"
          value={answer}
          onChange={(e) => setAnswer(e.target.value)}
          placeholder="e.g. Ya, kami punya 5 menu vegetarian."
        />
      </FormField>
      <label className="inline-flex items-center gap-2 text-[12px] text-fg">
        <input type="checkbox" checked={isActive} onChange={(e) => setIsActive(e.target.checked)} />
        <span>Active (Koda uses this entry)</span>
      </label>
      <div className="flex gap-2">
        <Button
          size="sm"
          disabled={pending || !question.trim() || !answer.trim()}
          onClick={() =>
            onSubmit({ question: question.trim(), answer: answer.trim(), is_active: isActive })
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
