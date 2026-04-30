'use client';

import * as React from 'react';
import { Send, RotateCcw, Sparkles, Bot, MessageCircle, ArrowRight, Zap } from 'lucide-react';
import { Button, Card } from '@buranchi/ui';
import { CustomerPicker, type CustomerPickerValue } from './customer-picker';
import { KodaTranscript } from './koda-transcript';
import type { KodaMessageBubbleProps } from './koda-message-bubble';
import { startConversationAction, sendKodaMessageAction } from '@/lib/actions/koda';

interface KodaSimulatorChatProps {
  organizationId: string;
}

const SAMPLE_PROMPTS: Array<{ label: string; text: string; icon: 'book' | 'ask' | 'cancel' | 'walk' }> = [
  {
    label: 'New booking',
    text: 'Bisa booking buat 4 orang besok jam 7 malam?',
    icon: 'book',
  },
  {
    label: 'Ask FAQ',
    text: 'Menu vegetarian ada gak?',
    icon: 'ask',
  },
  {
    label: 'Cancel booking',
    text: 'Saya mau cancel booking saya yang Tuesday',
    icon: 'cancel',
  },
  {
    label: 'Test escalation',
    text: 'Saya kecewa, makanan kemarin asin banget',
    icon: 'walk',
  },
];

function PromptIcon({ kind }: { kind: 'book' | 'ask' | 'cancel' | 'walk' }) {
  if (kind === 'book') return <Zap className="h-3.5 w-3.5" />;
  if (kind === 'ask') return <MessageCircle className="h-3.5 w-3.5" />;
  if (kind === 'cancel') return <ArrowRight className="h-3.5 w-3.5" />;
  return <Sparkles className="h-3.5 w-3.5" />;
}

export function KodaSimulatorChat({ organizationId }: KodaSimulatorChatProps) {
  const [conversationId, setConversationId] = React.useState<string | null>(null);
  const [customer, setCustomer] = React.useState<CustomerPickerValue>({});
  const [messages, setMessages] = React.useState<KodaMessageBubbleProps[]>([]);
  const [draft, setDraft] = React.useState('');
  const [pending, startTransition] = React.useTransition();
  const [error, setError] = React.useState<string | undefined>();
  const inputRef = React.useRef<HTMLTextAreaElement>(null);

  async function ensureConversation(): Promise<string> {
    if (conversationId) return conversationId;
    const res = await startConversationAction({
      ...(customer.customer_id ? { customer_id: customer.customer_id } : {}),
      channel: 'simulator',
    });
    if (!res.ok) throw new Error(res.message);
    setConversationId(res.data.conversation_id);
    return res.data.conversation_id;
  }

  function reset() {
    setConversationId(null);
    setMessages([]);
    setDraft('');
    setError(undefined);
  }

  function send(textOverride?: string) {
    const text = (textOverride ?? draft).trim();
    if (!text || pending) return;
    setError(undefined);
    setDraft('');
    setMessages((prev) => [
      ...prev,
      { role: 'user', content: text, created_at: new Date().toISOString() },
    ]);
    startTransition(async () => {
      try {
        const cid = await ensureConversation();
        const res = await sendKodaMessageAction({ conversation_id: cid, content: text });
        if (!res.ok) {
          setError(res.message);
          return;
        }
        if (res.data.assistantMessage) {
          setMessages((prev) => [
            ...prev,
            {
              role: 'assistant',
              content: res.data.assistantMessage,
              created_at: new Date().toISOString(),
            },
          ]);
        }
      } catch (e) {
        setError(e instanceof Error ? e.message : 'Failed');
      }
    });
  }

  function pickPrompt(text: string) {
    setDraft(text);
    inputRef.current?.focus();
  }

  return (
    <div className="grid grid-cols-1 lg:grid-cols-[300px_1fr] gap-5 h-[calc(100vh-180px)]">
      {/* Sidebar */}
      <aside className="space-y-3">
        <Card>
          <div className="flex items-start gap-3 mb-3">
            <div className="h-9 w-9 rounded-pill bg-fg text-white flex items-center justify-center shrink-0">
              <Bot className="h-4 w-4" />
            </div>
            <div className="min-w-0">
              <p className="text-body-strong text-fg leading-tight">Koda</p>
              <p className="text-[11px] text-muted leading-tight mt-0.5">GPT-4o-mini · Simulator</p>
            </div>
          </div>
          <p className="text-[11px] text-muted leading-relaxed">
            Type as if you were a diner. Tool calls render inline so you can see exactly what Koda
            did each turn.
          </p>
        </Card>

        <Card>
          <p className="text-[10px] uppercase tracking-[0.06em] text-muted font-semibold mb-2">
            Diner identity
          </p>
          <CustomerPicker value={customer} onChange={setCustomer} organizationId={organizationId} />
          <p className="text-[10px] text-muted mt-2 leading-snug">
            Pick an existing customer to give Koda their booking history, or stay anonymous to test
            cold WhatsApp inbound.
          </p>
        </Card>

        {conversationId ? (
          <Button type="button" variant="outline" size="sm" onClick={reset}>
            <RotateCcw className="h-3.5 w-3.5" /> Reset conversation
          </Button>
        ) : null}
      </aside>

      {/* Main chat */}
      <section className="rounded-card bg-surface border border-row-divider shadow-card flex flex-col overflow-hidden">
        <div className="flex-1 overflow-y-auto">
          {messages.length === 0 ? (
            <EmptyState onPick={pickPrompt} />
          ) : (
            <div className="p-4">
              <KodaTranscript messages={messages} />
              {pending ? (
                <div className="flex items-center gap-2 ml-9 my-2 text-[11px] text-muted">
                  <span className="inline-flex items-center gap-1">
                    <span className="h-1.5 w-1.5 rounded-pill bg-muted animate-pulse" />
                    <span className="h-1.5 w-1.5 rounded-pill bg-muted animate-pulse [animation-delay:200ms]" />
                    <span className="h-1.5 w-1.5 rounded-pill bg-muted animate-pulse [animation-delay:400ms]" />
                  </span>
                  Koda is thinking…
                </div>
              ) : null}
            </div>
          )}
        </div>

        <div className="border-t border-row-divider bg-canvas/40 p-3">
          <div className="flex gap-2 items-end rounded-card bg-surface border border-border focus-within:border-accent focus-within:ring-2 focus-within:ring-accent transition-colors px-3 py-2">
            <textarea
              ref={inputRef}
              rows={1}
              placeholder="Type a customer message…"
              value={draft}
              onChange={(e) => {
                setDraft(e.target.value);
                const el = e.currentTarget;
                el.style.height = 'auto';
                el.style.height = `${Math.min(el.scrollHeight, 120)}px`;
              }}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.shiftKey) {
                  e.preventDefault();
                  send();
                }
              }}
              disabled={pending}
              className="flex-1 bg-transparent text-[13px] text-fg placeholder:text-muted resize-none outline-none leading-snug py-1.5"
            />
            <Button type="button" onClick={() => send()} disabled={pending || !draft.trim()} size="sm">
              <Send className="h-3.5 w-3.5" /> Send
            </Button>
          </div>
          <p className="text-[10px] text-muted mt-1.5 px-1">
            Press <kbd className="px-1 py-0.5 rounded bg-row-divider text-fg font-mono text-[10px]">Enter</kbd> to send,{' '}
            <kbd className="px-1 py-0.5 rounded bg-row-divider text-fg font-mono text-[10px]">Shift</kbd>+
            <kbd className="px-1 py-0.5 rounded bg-row-divider text-fg font-mono text-[10px]">Enter</kbd> for new line
          </p>
          {error ? <p className="text-[11px] text-danger mt-1.5 px-1">{error}</p> : null}
        </div>
      </section>
    </div>
  );
}

function EmptyState({ onPick }: { onPick: (text: string) => void }) {
  return (
    <div className="h-full flex flex-col items-center justify-center px-6 py-10 text-center">
      <div className="h-14 w-14 rounded-pill bg-fg text-white flex items-center justify-center mb-4">
        <Sparkles className="h-6 w-6" />
      </div>
      <h2 className="text-title text-fg font-bold mb-1">Hi, I'm Koda</h2>
      <p className="text-[12px] text-muted max-w-md mb-6">
        Your AI booking assistant. I can check availability, create or cancel bookings, answer FAQs,
        and remember customer preferences. Try one of these to start:
      </p>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 w-full max-w-lg">
        {SAMPLE_PROMPTS.map((p) => (
          <button
            key={p.label}
            type="button"
            onClick={() => onPick(p.text)}
            className="text-left rounded-card border border-row-divider bg-surface px-3 py-2.5 hover:border-accent hover:bg-accent-soft/30 transition-colors group"
          >
            <span className="inline-flex items-center gap-1.5 text-[10px] uppercase tracking-[0.06em] text-muted font-semibold mb-1 group-hover:text-accent">
              <PromptIcon kind={p.icon} />
              {p.label}
            </span>
            <p className="text-[12px] text-fg leading-snug">{p.text}</p>
          </button>
        ))}
      </div>
    </div>
  );
}
