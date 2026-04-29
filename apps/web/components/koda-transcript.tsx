'use client';

import * as React from 'react';
import { KodaMessageBubble, type KodaMessageBubbleProps } from './koda-message-bubble';

export interface KodaTranscriptProps {
  messages: KodaMessageBubbleProps[];
  emptyHint?: string;
}

export function KodaTranscript({ messages, emptyHint }: KodaTranscriptProps) {
  const endRef = React.useRef<HTMLDivElement>(null);
  React.useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' });
  }, [messages.length]);

  if (messages.length === 0) {
    return (
      <div className="text-center text-[12px] text-muted py-12">
        {emptyHint ?? 'Send a message to start the conversation.'}
      </div>
    );
  }

  return (
    <div className="space-y-1">
      {messages.map((m, i) => (
        <KodaMessageBubble key={i} {...m} />
      ))}
      <div ref={endRef} />
    </div>
  );
}
