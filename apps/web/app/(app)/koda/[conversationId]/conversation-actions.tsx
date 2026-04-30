'use client';

import * as React from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@buranchi/ui';
import {
  takeOverAction,
  handBackToKodaAction,
  sendStaffReplyAction,
  resolveConversationAction,
} from '@/lib/actions/koda';

interface ConversationActionsProps {
  conversationId: string;
  takenOverByMe: boolean;
  takenOverByOther: boolean;
  status: string;
}

export function ConversationActions({
  conversationId,
  takenOverByMe,
  takenOverByOther,
  status,
}: ConversationActionsProps) {
  const router = useRouter();
  const [pending, startTransition] = React.useTransition();
  const [reply, setReply] = React.useState('');
  const [error, setError] = React.useState<string | undefined>();

  function takeOver() {
    setError(undefined);
    startTransition(async () => {
      const res = await takeOverAction(conversationId);
      if (!res.ok) {
        setError(res.message);
        return;
      }
      router.refresh();
    });
  }
  function handBack() {
    setError(undefined);
    startTransition(async () => {
      const res = await handBackToKodaAction(conversationId);
      if (!res.ok) {
        setError(res.message);
        return;
      }
      router.refresh();
    });
  }
  function resolve() {
    setError(undefined);
    startTransition(async () => {
      const res = await resolveConversationAction(conversationId);
      if (!res.ok) {
        setError(res.message);
        return;
      }
      router.refresh();
    });
  }
  function sendReply() {
    if (!reply.trim()) return;
    setError(undefined);
    const text = reply;
    setReply('');
    startTransition(async () => {
      const res = await sendStaffReplyAction(conversationId, text);
      if (!res.ok) {
        setError(res.message);
        return;
      }
      router.refresh();
    });
  }

  return (
    <div className="border-t border-row-divider bg-surface p-3 space-y-2">
      <div className="flex items-center gap-2 flex-wrap">
        {!takenOverByMe && !takenOverByOther ? (
          <Button size="sm" onClick={takeOver} disabled={pending}>
            Take over
          </Button>
        ) : null}
        {takenOverByMe ? (
          <Button size="sm" variant="outline" onClick={handBack} disabled={pending}>
            Hand back to Koda
          </Button>
        ) : null}
        {takenOverByOther ? (
          <span className="text-[11px] text-muted">
            Another staff member is handling this conversation.
          </span>
        ) : null}
        {status !== 'resolved' && status !== 'closed' ? (
          <Button size="sm" variant="ghost" onClick={resolve} disabled={pending}>
            Mark resolved
          </Button>
        ) : null}
      </div>

      {takenOverByMe ? (
        <div className="flex gap-2">
          <input
            className="h-[33px] w-full rounded-input border border-border bg-surface px-3 text-[12px] text-fg"
            placeholder="Type a manual reply…"
            value={reply}
            onChange={(e) => setReply(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') sendReply();
            }}
          />
          <Button type="button" size="sm" onClick={sendReply} disabled={pending || !reply.trim()}>
            Send
          </Button>
        </div>
      ) : !takenOverByOther ? (
        <p className="text-[11px] text-muted">
          Koda is handling this conversation. Take over to reply manually.
        </p>
      ) : null}

      {error ? <p className="text-[11px] text-danger">{error}</p> : null}
    </div>
  );
}
