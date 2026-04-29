'use client';

import * as React from 'react';
import { Bot, User, Wrench, MessageCircle } from 'lucide-react';
import { cn } from '@buranchi/ui';

export interface KodaMessageBubbleProps {
  role: 'user' | 'assistant' | 'tool' | 'staff' | 'system';
  content: string;
  tool_calls?: Array<{ name: string; arguments: string; result: string }> | null;
  tool_name?: string | null;
  staff_name?: string | null;
  created_at: string;
}

function ToolCallCard({ name, args, result }: { name: string; args: string; result: string }) {
  const [open, setOpen] = React.useState(false);
  return (
    <div className="rounded-tile border border-row-divider bg-canvas px-3 py-2 my-1.5 text-[11px]">
      <button
        type="button"
        className="inline-flex items-center gap-1.5 text-muted hover:text-fg"
        onClick={() => setOpen((v) => !v)}
      >
        <Wrench className="h-3 w-3" /> Koda used <span className="font-mono text-fg">{name}</span>{' '}
        {open ? '▾' : '▸'}
      </button>
      {open ? (
        <div className="mt-2 space-y-1">
          <pre className="whitespace-pre-wrap break-all text-[10px] text-muted">args: {args}</pre>
          <pre className="whitespace-pre-wrap break-all text-[10px] text-muted">result: {result}</pre>
        </div>
      ) : null}
    </div>
  );
}

export function KodaMessageBubble({
  role,
  content,
  tool_calls,
  staff_name,
  created_at,
}: KodaMessageBubbleProps) {
  const time = new Date(created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

  if (role === 'system') {
    return (
      <div className="text-center text-[11px] text-muted my-2 inline-flex items-center gap-1.5 mx-auto">
        <MessageCircle className="h-3 w-3" />
        <span>{content}</span>
      </div>
    );
  }

  if (role === 'tool') {
    return null;
  }

  const isUser = role === 'user';
  const isStaff = role === 'staff';

  return (
    <div className={cn('flex gap-2 my-2', isUser ? 'flex-row-reverse' : 'flex-row')}>
      <div
        className={cn(
          'h-7 w-7 rounded-pill flex items-center justify-center shrink-0',
          isUser ? 'bg-canvas text-muted' : isStaff ? 'bg-accent-soft text-accent' : 'bg-fg text-white',
        )}
      >
        {isUser || isStaff ? <User className="h-3.5 w-3.5" /> : <Bot className="h-3.5 w-3.5" />}
      </div>
      <div className={cn('flex flex-col max-w-[75%]', isUser ? 'items-end' : 'items-start')}>
        <div className="text-[10px] uppercase tracking-[0.06em] text-muted mb-0.5">
          {isUser ? 'Customer' : isStaff ? `Staff: ${staff_name ?? '—'}` : 'Koda'} · {time}
        </div>
        <div
          className={cn(
            'rounded-card px-3 py-2 text-[12px] whitespace-pre-wrap',
            isUser
              ? 'bg-accent text-white'
              : isStaff
              ? 'bg-accent-soft text-fg'
              : 'bg-surface text-fg shadow-card',
          )}
        >
          {content || <span className="text-muted italic">(no text)</span>}
        </div>
        {tool_calls && tool_calls.length > 0 ? (
          <div className="w-full mt-1">
            {tool_calls.map((tc, i) => (
              <ToolCallCard key={i} name={tc.name} args={tc.arguments} result={tc.result} />
            ))}
          </div>
        ) : null}
      </div>
    </div>
  );
}
