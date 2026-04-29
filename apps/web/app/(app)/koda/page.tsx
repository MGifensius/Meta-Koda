import Link from 'next/link';
import { Topbar, Button } from '@buranchi/ui';
import { Bot, MessageSquare, AlertCircle } from 'lucide-react';
import { requireRole } from '@/lib/auth/server';
import { createServerClient } from '@/lib/supabase/server';

interface ConvoRow {
  id: string;
  channel: string;
  status: string;
  escalated_reason: string | null;
  last_message_at: string;
  customer: { full_name: string } | null;
}

function statusPill(status: string) {
  const map: Record<string, { label: string; cls: string }> = {
    active: { label: 'Active', cls: 'bg-accent-soft text-accent' },
    escalated: { label: 'Escalated', cls: 'bg-danger-soft text-danger' },
    resolved: { label: 'Resolved', cls: 'bg-success-soft text-success' },
    closed: { label: 'Closed', cls: 'bg-row-divider text-muted' },
  };
  const m = map[status] ?? map.closed!;
  return (
    <span
      className={`inline-flex items-center rounded-pill px-2 py-0.5 text-[10px] font-semibold uppercase ${m.cls}`}
    >
      {m.label}
    </span>
  );
}

function formatTime(iso: string) {
  return new Date(iso).toLocaleString([], {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

export default async function KodaInboxPage() {
  await requireRole(['admin', 'front_desk']);
  const supabase = await createServerClient();
  const { data: rowsRaw } = await supabase
    .from('koda_conversations')
    .select(
      `id, channel, status, escalated_reason, last_message_at,
       customer:customers(full_name)`,
    )
    .order('last_message_at', { ascending: false })
    .limit(100);
  const rows = (rowsRaw ?? []) as unknown as ConvoRow[];

  const order: Record<string, number> = { escalated: 0, active: 1, resolved: 2, closed: 3 };
  rows.sort((a, b) => (order[a.status] ?? 99) - (order[b.status] ?? 99));

  return (
    <>
      <Topbar
        breadcrumb="Workspace"
        title="Koda"
        actions={
          <Button asChild>
            <Link href="/koda/simulator">+ Open simulator</Link>
          </Button>
        }
      />
      {rows.length === 0 ? (
        <div className="rounded-card bg-surface shadow-card py-12 text-center">
          <Bot className="h-8 w-8 text-muted mx-auto mb-2" />
          <p className="text-body-strong text-fg">No conversations yet</p>
          <p className="text-[12px] text-muted">
            Open the simulator to test Koda, or wait for WhatsApp inbound (Phase 3).
          </p>
        </div>
      ) : (
        <div className="rounded-card bg-surface shadow-card overflow-hidden">
          <div className="px-4 grid grid-cols-[1fr_140px_120px_140px] py-3 text-label uppercase text-muted border-b border-border">
            <div>Customer / preview</div>
            <div>Channel</div>
            <div>Status</div>
            <div>Last activity</div>
          </div>
          {rows.map((c) => (
            <Link
              key={c.id}
              href={`/koda/${c.id}`}
              className="px-4 grid grid-cols-[1fr_140px_120px_140px] py-3 border-b border-row-divider last:border-b-0 text-[12px] items-center hover:bg-canvas"
            >
              <div className="min-w-0">
                <p className="text-fg font-medium truncate">
                  {c.customer?.full_name ?? 'Anonymous diner'}
                </p>
                {c.escalated_reason ? (
                  <p className="text-[11px] text-danger truncate inline-flex items-center gap-1">
                    <AlertCircle className="h-3 w-3" /> {c.escalated_reason}
                  </p>
                ) : null}
              </div>
              <div className="text-muted capitalize inline-flex items-center gap-1.5">
                <MessageSquare className="h-3 w-3" /> {c.channel}
              </div>
              <div>{statusPill(c.status)}</div>
              <div className="text-muted">{formatTime(c.last_message_at)}</div>
            </Link>
          ))}
        </div>
      )}
    </>
  );
}
