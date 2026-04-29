'use client';

import * as React from 'react';
import { Send, RotateCcw } from 'lucide-react';
import { Button, Input, FormField } from '@buranchi/ui';
import { CustomerPicker, type CustomerPickerValue } from './customer-picker';
import { KodaTranscript } from './koda-transcript';
import type { KodaMessageBubbleProps } from './koda-message-bubble';
import { startConversationAction, sendKodaMessageAction } from '@/lib/actions/koda';

interface KodaSimulatorChatProps {
  organizationId: string;
}

export function KodaSimulatorChat({ organizationId }: KodaSimulatorChatProps) {
  const [conversationId, setConversationId] = React.useState<string | null>(null);
  const [customer, setCustomer] = React.useState<CustomerPickerValue>({});
  const [messages, setMessages] = React.useState<KodaMessageBubbleProps[]>([]);
  const [draft, setDraft] = React.useState('');
  const [pending, startTransition] = React.useTransition();
  const [error, setError] = React.useState<string | undefined>();

  async function ensureConversation(): Promise<string> {
    if (conversationId) return conversationId;
    const res = await startConversationAction({
      ...(customer.customer_id ? { customer_id: customer.customer_id } : {}),
      channel: 'simulator',
    });
    setConversationId(res.conversation_id);
    return res.conversation_id;
  }

  function reset() {
    setConversationId(null);
    setMessages([]);
    setDraft('');
    setError(undefined);
  }

  function send() {
    if (!draft.trim() || pending) return;
    setError(undefined);
    const userText = draft;
    setDraft('');
    setMessages((prev) => [
      ...prev,
      { role: 'user', content: userText, created_at: new Date().toISOString() },
    ]);
    startTransition(async () => {
      try {
        const cid = await ensureConversation();
        const res = await sendKodaMessageAction({ conversation_id: cid, content: userText });
        if (res.assistantMessage) {
          setMessages((prev) => [
            ...prev,
            { role: 'assistant', content: res.assistantMessage, created_at: new Date().toISOString() },
          ]);
        }
      } catch (e) {
        setError(e instanceof Error ? e.message : 'Failed');
      }
    });
  }

  return (
    <div className="grid grid-cols-1 lg:grid-cols-[280px_1fr] gap-4 h-[calc(100vh-220px)]">
      <aside className="space-y-4">
        <FormField id="sim-customer" label="Diner identity" hint="Pick an existing customer or stay anonymous">
          <CustomerPicker value={customer} onChange={setCustomer} organizationId={organizationId} />
        </FormField>
        <Button type="button" variant="outline" size="sm" onClick={reset} disabled={!conversationId}>
          <RotateCcw className="h-3.5 w-3.5" /> Reset conversation
        </Button>
        <p className="text-[11px] text-muted">
          Tool calls render inline so you can see exactly what Koda did each turn.
        </p>
      </aside>
      <section className="rounded-card bg-canvas border border-row-divider flex flex-col overflow-hidden">
        <div className="flex-1 overflow-y-auto p-4">
          <KodaTranscript
            messages={messages}
            emptyHint="Type a customer message below to begin."
          />
        </div>
        <div className="border-t border-row-divider bg-surface p-3 flex gap-2">
          <Input
            placeholder="Pretend you're the diner — type their message"
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                send();
              }
            }}
            disabled={pending}
          />
          <Button type="button" onClick={send} disabled={pending || !draft.trim()}>
            {pending ? '…' : <Send className="h-3.5 w-3.5" />}
          </Button>
        </div>
        {error ? <p className="px-3 pb-2 text-[11px] text-danger">{error}</p> : null}
      </section>
    </div>
  );
}
