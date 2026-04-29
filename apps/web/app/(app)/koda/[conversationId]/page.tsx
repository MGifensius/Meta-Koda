import Link from 'next/link';
import { notFound } from 'next/navigation';
import { Topbar, Card } from '@buranchi/ui';
import { requireRole } from '@/lib/auth/server';
import { createServerClient } from '@/lib/supabase/server';
import { KodaTranscript } from '@/components/koda-transcript';
import type { KodaMessageBubbleProps } from '@/components/koda-message-bubble';
import { ConversationActions } from './conversation-actions';

interface ConvoRow {
  id: string;
  organization_id: string;
  customer_id: string | null;
  channel: string;
  status: string;
  escalated_reason: string | null;
  taken_over_by: string | null;
  taken_over_at: string | null;
  total_input_tokens: number;
  total_output_tokens: number;
  total_tool_calls: number;
  customer: { id: string; full_name: string; phone: string | null } | null;
}

interface MsgRow {
  role: KodaMessageBubbleProps['role'];
  content: string;
  tool_calls: KodaMessageBubbleProps['tool_calls'];
  tool_name: string | null;
  staff_id: string | null;
  staff: { full_name: string } | null;
  created_at: string;
}

function rupiah(usd: number): string {
  return `Rp ${Math.round(usd * 16000).toLocaleString('id-ID')}`;
}

export default async function KodaConversationPage({
  params,
}: {
  params: Promise<{ conversationId: string }>;
}) {
  const profile = await requireRole(['admin', 'front_desk']);
  const { conversationId } = await params;
  const supabase = await createServerClient();
  const { data: convoRaw } = await supabase
    .from('koda_conversations')
    .select(
      `id, organization_id, customer_id, channel, status, escalated_reason,
       taken_over_by, taken_over_at, total_input_tokens, total_output_tokens, total_tool_calls,
       customer:customers(id, full_name, phone)`,
    )
    .eq('id', conversationId)
    .single();
  const convo = convoRaw as unknown as ConvoRow | null;
  if (!convo) notFound();

  const { data: msgsRaw } = await supabase
    .from('koda_messages')
    .select(
      `role, content, tool_calls, tool_name, staff_id, created_at, staff:profiles(full_name)`,
    )
    .eq('conversation_id', conversationId)
    .order('created_at', { ascending: true });
  const msgs = (msgsRaw ?? []) as unknown as MsgRow[];
  const bubbles: KodaMessageBubbleProps[] = msgs.map((m) => ({
    role: m.role,
    content: m.content,
    tool_calls: m.tool_calls ?? null,
    tool_name: m.tool_name,
    staff_name: m.staff?.full_name ?? null,
    created_at: m.created_at,
  }));

  const inputUsd = (convo.total_input_tokens / 1_000_000) * 0.15;
  const outputUsd = (convo.total_output_tokens / 1_000_000) * 0.6;
  const totalUsd = inputUsd + outputUsd;

  const takenOverByMe = convo.taken_over_by === profile.id;
  const takenOverByOther = !!convo.taken_over_by && convo.taken_over_by !== profile.id;

  return (
    <>
      <Topbar
        breadcrumb={
          <>
            <Link href="/koda" className="hover:underline">
              Koda
            </Link>{' '}
            / {convo.id.slice(0, 8)}
          </>
        }
        title={convo.customer ? convo.customer.full_name : 'Anonymous diner'}
        backHref="/koda"
      />
      <div className="grid grid-cols-1 lg:grid-cols-[1fr_280px] gap-4 max-w-5xl">
        <div className="rounded-card bg-canvas border border-row-divider flex flex-col overflow-hidden h-[calc(100vh-220px)]">
          <div className="flex-1 overflow-y-auto p-4">
            <KodaTranscript messages={bubbles} />
          </div>
          <ConversationActions
            conversationId={convo.id}
            takenOverByMe={takenOverByMe}
            takenOverByOther={takenOverByOther}
            status={convo.status}
          />
        </div>
        <aside className="space-y-3">
          {convo.status === 'escalated' ? (
            <Card className="border-danger/30 bg-danger-soft">
              <p className="text-[10px] uppercase tracking-[0.06em] text-danger font-semibold">
                Escalated
              </p>
              <p className="text-[12px] text-fg mt-1">
                {convo.escalated_reason ?? 'No reason recorded.'}
              </p>
            </Card>
          ) : null}
          <Card>
            <h3 className="text-[10px] uppercase tracking-[0.06em] text-muted font-semibold mb-2">
              Channel
            </h3>
            <p className="text-[12px] text-fg capitalize">{convo.channel}</p>
          </Card>
          {convo.customer ? (
            <Card>
              <h3 className="text-[10px] uppercase tracking-[0.06em] text-muted font-semibold mb-2">
                Customer
              </h3>
              <p className="text-[12px] text-fg">{convo.customer.full_name}</p>
              <p className="text-[11px] text-muted">{convo.customer.phone ?? '—'}</p>
              <Link
                href={`/customers/${convo.customer.id}`}
                className="text-[11px] text-accent hover:underline mt-2 inline-block"
              >
                View customer profile →
              </Link>
            </Card>
          ) : null}
          <Card>
            <h3 className="text-[10px] uppercase tracking-[0.06em] text-muted font-semibold mb-2">
              Cost
            </h3>
            <div className="text-[12px] text-fg space-y-1">
              <p>Input: {convo.total_input_tokens.toLocaleString()} tokens</p>
              <p>Output: {convo.total_output_tokens.toLocaleString()} tokens</p>
              <p>Tool calls: {convo.total_tool_calls}</p>
              <p className="font-semibold pt-1 border-t border-row-divider">{rupiah(totalUsd)}</p>
            </div>
          </Card>
        </aside>
      </div>
    </>
  );
}
