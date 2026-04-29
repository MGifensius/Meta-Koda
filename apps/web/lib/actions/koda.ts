'use server';

import { revalidatePath } from 'next/cache';
import {
  SendKodaMessageSchema,
  StartConversationSchema,
  EscalateConversationSchema,
} from '@buranchi/shared';
import { requireRole } from '@/lib/auth/server';
import { createServerClient } from '@/lib/supabase/server';
import { ActionError } from '@/lib/auth/errors';
import { runTurn } from '@/lib/koda/engine';
import { getAvailableTablesForSlot } from '@/lib/actions/tables';
import { createBookingAction, transitionBookingAction, updateBookingAction } from '@/lib/actions/bookings';
import type { PromptContext } from '@/lib/koda/prompt';
import type { ToolContext, ToolHooks } from '@/lib/koda/tools';

const HISTORY_LIMIT = 10;
const DEFAULT_DAILY_CAP = 500;

export async function startConversationAction(input: unknown) {
  const profile = await requireRole(['admin', 'front_desk']);
  const parsed = StartConversationSchema.parse(input);
  const supabase = await createServerClient();

  const { data, error } = await supabase
    .from('koda_conversations')
    .insert({
      organization_id: profile.organization_id,
      customer_id: parsed.customer_id ?? null,
      channel: parsed.channel,
    } as never)
    .select('id')
    .single();
  if (error) throw new ActionError(error.code ?? 'DB', error.message);

  const inserted = data as { id: string } | null;
  revalidatePath('/koda');
  return { ok: true as const, conversation_id: inserted!.id };
}

export async function sendKodaMessageAction(input: unknown) {
  const profile = await requireRole(['admin', 'front_desk']);
  const parsed = SendKodaMessageSchema.parse(input);
  const supabase = await createServerClient();

  const { data: convoData, error: cErr } = await supabase
    .from('koda_conversations')
    .select('id, organization_id, customer_id, channel, status, taken_over_by')
    .eq('id', parsed.conversation_id)
    .single();
  if (cErr || !convoData) throw new ActionError('NOT_FOUND', 'Conversation not found.');
  const convo = convoData as {
    id: string;
    organization_id: string;
    customer_id: string | null;
    channel: 'simulator' | 'whatsapp' | 'web';
    status: string;
    taken_over_by: string | null;
  };
  if (convo.organization_id !== profile.organization_id) {
    throw new ActionError('FORBIDDEN', 'Cross-tenant conversation access denied.');
  }

  // Daily cap check
  const todayStart = new Date();
  todayStart.setUTCHours(0, 0, 0, 0);
  const { count: msgCount } = await supabase
    .from('koda_messages')
    .select('id', { count: 'exact', head: true })
    .eq('role', 'user')
    .gte('created_at', todayStart.toISOString());
  if ((msgCount ?? 0) >= DEFAULT_DAILY_CAP) {
    await supabase.from('koda_messages').insert({
      conversation_id: convo.id, role: 'user', content: parsed.content,
    } as never);
    await supabase.from('koda_messages').insert({
      conversation_id: convo.id,
      role: 'system',
      content: `Daily AI cap of ${DEFAULT_DAILY_CAP} messages reached. Returned canned response.`,
    } as never);
    const cannedReply = "Today's AI quota reached. A staff member will reply shortly.";
    await supabase.from('koda_messages').insert({
      conversation_id: convo.id, role: 'assistant', content: cannedReply,
    } as never);
    revalidatePath(`/koda/${convo.id}`);
    return { ok: true as const, capped: true, assistantMessage: cannedReply };
  }

  await supabase.from('koda_messages').insert({
    conversation_id: convo.id, role: 'user', content: parsed.content,
  } as never);

  if (convo.taken_over_by) {
    revalidatePath(`/koda/${convo.id}`);
    return { ok: true as const, takenOver: true, assistantMessage: '' };
  }

  // Load history (last N messages, oldest first)
  const { data: historyRaw } = await supabase
    .from('koda_messages')
    .select('role, content, tool_calls, tool_name')
    .eq('conversation_id', convo.id)
    .order('created_at', { ascending: false })
    .limit(HISTORY_LIMIT);
  const history = ((historyRaw ?? []) as Array<{
    role: 'user' | 'assistant' | 'tool' | 'staff' | 'system';
    content: string;
    tool_calls: unknown;
    tool_name: string | null;
  }>).reverse();
  // Drop the just-inserted user message; runTurn appends it again.
  const trimmedHistory = history.slice(0, -1);

  // Build prompt context
  const { data: orgData } = await supabase
    .from('organizations')
    .select('name, timezone, address, operating_hours')
    .eq('id', convo.organization_id)
    .single();
  const org = orgData as { name: string; timezone: string; address: string | null; operating_hours: unknown } | null;

  let customerCtx: PromptContext['customer'] = null;
  if (convo.customer_id) {
    const { data: cRaw } = await supabase
      .from('customers')
      .select('full_name, phone')
      .eq('id', convo.customer_id)
      .single();
    const { data: bookingsRaw } = await supabase
      .from('bookings')
      .select('starts_at, party_size, status, table:tables!inner(code)')
      .eq('customer_id', convo.customer_id)
      .order('starts_at', { ascending: false })
      .limit(3);
    const { data: notesRaw } = await supabase
      .from('customer_notes')
      .select('note')
      .eq('customer_id', convo.customer_id)
      .not('verified_at', 'is', null)
      .limit(10);
    const c = cRaw as { full_name: string; phone: string | null } | null;
    if (c) {
      customerCtx = {
        full_name: c.full_name,
        phone: c.phone,
        recent_bookings: ((bookingsRaw ?? []) as Array<{
          starts_at: string;
          party_size: number;
          status: string;
          table: { code: string };
        }>).map((b) => ({
          starts_at: b.starts_at,
          table_code: b.table.code,
          party_size: b.party_size,
          status: b.status,
        })),
        verified_notes: ((notesRaw ?? []) as Array<{ note: string }>).map((n) => n.note),
      };
    }
  }

  const { data: faqRows } = await supabase
    .from('koda_faq')
    .select('question, answer')
    .eq('organization_id', convo.organization_id)
    .eq('is_active', true)
    .order('sort_order', { ascending: true });

  const todayIso = new Date().toISOString().slice(0, 10);
  const { data: specialRows } = await supabase
    .from('koda_specials')
    .select('title, description, starts_on, ends_on')
    .eq('organization_id', convo.organization_id)
    .eq('is_active', true);
  const activeSpecials = ((specialRows ?? []) as Array<{
    title: string;
    description: string | null;
    starts_on: string | null;
    ends_on: string | null;
  }>).filter((s) => (!s.starts_on || s.starts_on <= todayIso) && (!s.ends_on || s.ends_on >= todayIso));

  const promptCtx: PromptContext = {
    restaurant: {
      name: org?.name ?? 'the restaurant',
      timezone: org?.timezone ?? 'Asia/Jakarta',
      address: org?.address ?? null,
      operatingHoursSummary: summarizeHours(org?.operating_hours),
    },
    now: new Date(),
    customer: customerCtx,
    faq: ((faqRows ?? []) as Array<{ question: string; answer: string }>),
    specials: activeSpecials,
  };

  const hooks: ToolHooks = {
    checkAvailability: async (startsAt, partySize) => {
      const tables = await getAvailableTablesForSlot(startsAt, partySize);
      return { tables };
    },
    findCustomerBooking: async (customerId, dateHint) => {
      void dateHint;
      const { data } = await supabase
        .from('bookings')
        .select('id, starts_at, party_size, status, table:tables!inner(code)')
        .eq('customer_id', customerId)
        .in('status', ['confirmed', 'seated'])
        .order('starts_at', { ascending: true });
      return { bookings: data ?? [] };
    },
    createBooking: async (raw) => {
      const a = raw as Record<string, unknown>;
      let customerId = a.customer_id as string | undefined;
      if (!customerId && a.customer_full_name) {
        const { data: cust } = await supabase
          .from('customers')
          .insert({
            organization_id: convo.organization_id,
            full_name: a.customer_full_name,
            phone: a.customer_phone ?? null,
            created_by: profile.id,
          } as never)
          .select('id')
          .single();
        customerId = (cust as { id: string } | null)?.id;
      }
      if (!customerId) return { error: 'customer_required' };
      try {
        const result = await createBookingAction({
          customer_id: customerId,
          table_id: a.table_id,
          starts_at: a.starts_at,
          party_size: a.party_size,
          ...(a.special_request ? { special_request: a.special_request } : {}),
        });
        return result;
      } catch (e) {
        const code = e instanceof Error && 'code' in e ? (e as { code: string }).code : 'failed';
        const message = e instanceof Error ? e.message : 'failed';
        return { error: code, message };
      }
    },
    modifyBooking: async (id, raw) => {
      const a = raw as Record<string, unknown>;
      const update: Record<string, unknown> = {};
      if (a.starts_at) update.starts_at = a.starts_at;
      if (a.party_size) update.party_size = a.party_size;
      if (a.table_id) update.table_id = a.table_id;
      if (a.special_request !== undefined) update.special_request = a.special_request;
      try {
        await updateBookingAction(id, update);
        return { ok: true, booking_id: id };
      } catch (e) {
        return { error: 'failed', message: e instanceof Error ? e.message : 'failed' };
      }
    },
    cancelBooking: async (id, reason) => {
      try {
        await transitionBookingAction(id, { next: 'cancelled', ...(reason ? { reason } : {}) });
        return { ok: true, booking_id: id };
      } catch (e) {
        return { error: 'failed', message: e instanceof Error ? e.message : 'failed' };
      }
    },
    addCustomerNote: async (customerId, note, conversationId) => {
      const { data, error } = await supabase
        .from('customer_notes')
        .insert({
          organization_id: convo.organization_id,
          customer_id: customerId,
          note,
          source: 'koda',
          source_conversation_id: conversationId,
        } as never)
        .select('id')
        .single();
      if (error) return { error: 'failed', message: error.message };
      return { ok: true, note_id: (data as { id: string }).id };
    },
    escalate: async (conversationId, reason) => {
      await supabase
        .from('koda_conversations')
        .update({
          status: 'escalated',
          escalated_reason: reason,
          last_message_at: new Date().toISOString(),
        } as never)
        .eq('id', conversationId);
      return { ok: true };
    },
  };

  const toolCtx: ToolContext = {
    organization_id: convo.organization_id,
    customer_id: convo.customer_id,
    conversation_id: convo.id,
  };

  const result = await runTurn({
    conversationId: convo.id,
    userMessage: parsed.content,
    promptCtx,
    toolCtx,
    history: trimmedHistory.map((m) => ({ role: m.role, content: m.content })),
    hooks,
  });

  await supabase.from('koda_messages').insert({
    conversation_id: convo.id,
    role: 'assistant',
    content: result.assistantMessage,
    tool_calls: result.toolCalls.length ? result.toolCalls : null,
    input_tokens: result.inputTokens,
    output_tokens: result.outputTokens,
    model: 'gpt-4o-mini',
  } as never);

  await supabase
    .from('koda_conversations')
    .update({
      last_message_at: new Date().toISOString(),
      ...(result.escalated
        ? { status: 'escalated', escalated_reason: result.escalationReason ?? null }
        : {}),
    } as never)
    .eq('id', convo.id);

  // Increment cumulative token totals via RPC (created in migration 0011)
  try {
    await supabase.rpc('increment_koda_tokens', {
      convo_id: convo.id,
      in_tokens: result.inputTokens,
      out_tokens: result.outputTokens,
      tool_count: result.toolCalls.length,
    } as never);
  } catch {
    // RPC failures are non-fatal — token totals are best-effort.
  }

  revalidatePath(`/koda/${convo.id}`);
  revalidatePath('/koda');
  return { ok: true as const, assistantMessage: result.assistantMessage, escalated: result.escalated };
}

export async function takeOverAction(conversationId: string) {
  const profile = await requireRole(['admin', 'front_desk']);
  const supabase = await createServerClient();
  const { error } = await supabase
    .from('koda_conversations')
    .update({ taken_over_by: profile.id, taken_over_at: new Date().toISOString() } as never)
    .eq('id', conversationId);
  if (error) throw new ActionError(error.code ?? 'DB', error.message);
  await supabase.from('koda_messages').insert({
    conversation_id: conversationId,
    role: 'system',
    content: `${profile.full_name} took over the conversation.`,
  } as never);
  revalidatePath(`/koda/${conversationId}`);
}

export async function handBackToKodaAction(conversationId: string) {
  const profile = await requireRole(['admin', 'front_desk']);
  const supabase = await createServerClient();
  await supabase
    .from('koda_conversations')
    .update({ taken_over_by: null, taken_over_at: null } as never)
    .eq('id', conversationId);
  await supabase.from('koda_messages').insert({
    conversation_id: conversationId,
    role: 'system',
    content: `${profile.full_name} handed the conversation back to Koda.`,
  } as never);
  revalidatePath(`/koda/${conversationId}`);
}

export async function sendStaffReplyAction(conversationId: string, content: string) {
  const profile = await requireRole(['admin', 'front_desk']);
  if (!content.trim()) throw new ActionError('EMPTY', 'Reply cannot be empty.');
  const supabase = await createServerClient();
  await supabase.from('koda_messages').insert({
    conversation_id: conversationId,
    role: 'staff',
    content,
    staff_id: profile.id,
  } as never);
  await supabase
    .from('koda_conversations')
    .update({ last_message_at: new Date().toISOString() } as never)
    .eq('id', conversationId);
  revalidatePath(`/koda/${conversationId}`);
}

export async function resolveConversationAction(conversationId: string) {
  await requireRole(['admin', 'front_desk']);
  const supabase = await createServerClient();
  await supabase
    .from('koda_conversations')
    .update({ status: 'resolved' } as never)
    .eq('id', conversationId);
  revalidatePath(`/koda/${conversationId}`);
  revalidatePath('/koda');
}

export async function escalateConversationAction(input: unknown) {
  await requireRole(['admin', 'front_desk']);
  const parsed = EscalateConversationSchema.parse(input);
  const supabase = await createServerClient();
  await supabase
    .from('koda_conversations')
    .update({ status: 'escalated', escalated_reason: parsed.reason ?? null } as never)
    .eq('id', parsed.conversation_id);
  revalidatePath(`/koda/${parsed.conversation_id}`);
  revalidatePath('/koda');
}

function summarizeHours(operating_hours: unknown): string {
  if (!operating_hours || typeof operating_hours !== 'object') return 'Hours not configured';
  const oh = operating_hours as Record<string, { open: string; close: string; closed?: boolean }>;
  const days = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'];
  return days
    .map((d) => {
      const r = oh[d];
      if (!r || r.closed) return `${d}: closed`;
      return `${d}: ${r.open}–${r.close}`;
    })
    .join(', ');
}
