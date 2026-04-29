import type { ChatCompletionTool, ChatCompletionMessageToolCall } from 'openai/resources/chat/completions';
import { z } from 'zod';

// ============================================================================
// Tool definitions (sent to OpenAI)
// ============================================================================

export const KODA_TOOL_DEFINITIONS: ChatCompletionTool[] = [
  {
    type: 'function',
    function: {
      name: 'check_availability',
      description:
        'Get the list of currently free tables that fit a party size for a given start time. Use before create_booking when no specific table has been requested.',
      parameters: {
        type: 'object',
        properties: {
          starts_at: { type: 'string', description: 'ISO 8601 UTC datetime (e.g. 2026-04-30T19:00:00Z).' },
          party_size: { type: 'integer', minimum: 1, maximum: 50 },
        },
        required: ['starts_at', 'party_size'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'find_customer_booking',
      description:
        "Look up the current customer's upcoming or recent bookings. Use when customer wants to modify or cancel an existing booking and you need to find which one.",
      parameters: {
        type: 'object',
        properties: {
          date_hint: {
            type: 'string',
            description:
              'Optional: a date or relative phrase (e.g. "Tuesday", "tomorrow", "next week"). Empty = all upcoming + last 7 days.',
          },
        },
        required: [],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'create_booking',
      description:
        'Create a confirmed booking. Either customer_id (existing) OR customer_full_name (new customer) is required.',
      parameters: {
        type: 'object',
        properties: {
          customer_id: { type: 'string' },
          customer_full_name: { type: 'string' },
          customer_phone: { type: 'string' },
          table_id: { type: 'string' },
          starts_at: { type: 'string' },
          party_size: { type: 'integer', minimum: 1, maximum: 50 },
          special_request: { type: 'string' },
        },
        required: ['table_id', 'starts_at', 'party_size'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'modify_booking',
      description:
        'Update an existing booking. Cannot edit completed/cancelled/no-show bookings. Cannot reassign table for seated bookings.',
      parameters: {
        type: 'object',
        properties: {
          booking_id: { type: 'string' },
          starts_at: { type: 'string' },
          party_size: { type: 'integer', minimum: 1, maximum: 50 },
          table_id: { type: 'string' },
          special_request: { type: 'string' },
        },
        required: ['booking_id'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'cancel_booking',
      description: 'Cancel a booking with optional reason. Confirm with the customer before calling.',
      parameters: {
        type: 'object',
        properties: {
          booking_id: { type: 'string' },
          reason: { type: 'string' },
        },
        required: ['booking_id'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'add_customer_note',
      description:
        'Save a fact about the customer that staff would want to remember. Use ONLY when the customer explicitly tells you something they want remembered (allergies, dietary preferences, occasions, accessibility needs).',
      parameters: {
        type: 'object',
        properties: {
          note: { type: 'string', description: 'Concise, factual. Max 500 chars.' },
        },
        required: ['note'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'escalate_to_staff',
      description:
        'Hand off this conversation to a human staff member. Use when: customer asks for a human/manager; customer is upset, complaining, or asking for refund; you are not confident; same issue persists 3+ turns.',
      parameters: {
        type: 'object',
        properties: {
          reason: { type: 'string', description: 'Why you are escalating, in 1 sentence.' },
        },
        required: ['reason'],
      },
    },
  },
];

// ============================================================================
// Executor
// ============================================================================

export interface ToolContext {
  organization_id: string;
  customer_id: string | null;
  conversation_id: string;
}

export interface ToolResult {
  tool_call_id: string;
  content: string;
  error?: string;
}

export interface ToolHooks {
  checkAvailability?: (startsAt: Date, partySize: number) => Promise<unknown>;
  findCustomerBooking?: (customerId: string, dateHint?: string) => Promise<unknown>;
  createBooking?: (input: unknown) => Promise<unknown>;
  modifyBooking?: (id: string, input: unknown) => Promise<unknown>;
  cancelBooking?: (id: string, reason?: string) => Promise<unknown>;
  addCustomerNote?: (customerId: string, note: string, conversationId: string) => Promise<unknown>;
  escalate?: (conversationId: string, reason: string) => Promise<unknown>;
}

const ParamsByTool = {
  check_availability: z.object({ starts_at: z.string(), party_size: z.number() }),
  find_customer_booking: z.object({ date_hint: z.string().optional() }),
  create_booking: z.object({
    customer_id: z.string().optional(),
    customer_full_name: z.string().optional(),
    customer_phone: z.string().optional(),
    table_id: z.string(),
    starts_at: z.string(),
    party_size: z.number(),
    special_request: z.string().optional(),
  }),
  modify_booking: z.object({
    booking_id: z.string(),
    starts_at: z.string().optional(),
    party_size: z.number().optional(),
    table_id: z.string().optional(),
    special_request: z.string().optional(),
  }),
  cancel_booking: z.object({ booking_id: z.string(), reason: z.string().optional() }),
  add_customer_note: z.object({ note: z.string().max(500) }),
  escalate_to_staff: z.object({ reason: z.string() }),
} as const;

type ToolName = keyof typeof ParamsByTool;

function isKnownTool(name: string): name is ToolName {
  return name in ParamsByTool;
}

export async function executeTool(
  toolCall: { name: string; arguments: string; tool_call_id?: string }
    | (ChatCompletionMessageToolCall['function'] & { tool_call_id?: string }),
  ctx: ToolContext,
  hooks: ToolHooks = {},
): Promise<ToolResult> {
  const tcId = (toolCall as { tool_call_id?: string }).tool_call_id ?? '';

  if (!isKnownTool(toolCall.name)) {
    return {
      tool_call_id: tcId,
      content: JSON.stringify({ error: 'unknown_tool', name: toolCall.name }),
      error: `unknown tool: ${toolCall.name}`,
    };
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(toolCall.arguments);
  } catch {
    return {
      tool_call_id: tcId,
      content: JSON.stringify({ error: 'invalid_arguments' }),
      error: 'invalid arguments JSON',
    };
  }

  const schema = ParamsByTool[toolCall.name];
  const validation = schema.safeParse(parsed);
  if (!validation.success) {
    return {
      tool_call_id: tcId,
      content: JSON.stringify({ error: 'validation_failed', details: validation.error.flatten() }),
      error: 'validation failed',
    };
  }
  const args = validation.data;

  try {
    switch (toolCall.name) {
      case 'check_availability': {
        const a = args as z.infer<typeof ParamsByTool.check_availability>;
        const result = hooks.checkAvailability
          ? await hooks.checkAvailability(new Date(a.starts_at), a.party_size)
          : { tables: [] };
        return { tool_call_id: tcId, content: JSON.stringify(result) };
      }
      case 'find_customer_booking': {
        const a = args as z.infer<typeof ParamsByTool.find_customer_booking>;
        if (!ctx.customer_id) {
          return {
            tool_call_id: tcId,
            content: JSON.stringify({
              error: 'no_customer',
              message: 'Customer is not yet identified. Ask their name first.',
            }),
          };
        }
        const result = hooks.findCustomerBooking
          ? await hooks.findCustomerBooking(ctx.customer_id, a.date_hint)
          : { bookings: [] };
        return { tool_call_id: tcId, content: JSON.stringify(result) };
      }
      case 'create_booking': {
        const a = args as z.infer<typeof ParamsByTool.create_booking>;
        if (!a.customer_id && !a.customer_full_name) {
          return {
            tool_call_id: tcId,
            content: JSON.stringify({
              error: 'customer_required',
              message: 'Provide customer_id (existing) or customer_full_name (new).',
            }),
          };
        }
        const result = hooks.createBooking ? await hooks.createBooking(a) : { error: 'not_implemented' };
        return { tool_call_id: tcId, content: JSON.stringify(result) };
      }
      case 'modify_booking': {
        const a = args as z.infer<typeof ParamsByTool.modify_booking>;
        const result = hooks.modifyBooking
          ? await hooks.modifyBooking(a.booking_id, a)
          : { error: 'not_implemented' };
        return { tool_call_id: tcId, content: JSON.stringify(result) };
      }
      case 'cancel_booking': {
        const a = args as z.infer<typeof ParamsByTool.cancel_booking>;
        const result = hooks.cancelBooking
          ? await hooks.cancelBooking(a.booking_id, a.reason)
          : { error: 'not_implemented' };
        return { tool_call_id: tcId, content: JSON.stringify(result) };
      }
      case 'add_customer_note': {
        const a = args as z.infer<typeof ParamsByTool.add_customer_note>;
        if (!ctx.customer_id) {
          return { tool_call_id: tcId, content: JSON.stringify({ error: 'no_customer' }) };
        }
        const result = hooks.addCustomerNote
          ? await hooks.addCustomerNote(ctx.customer_id, a.note, ctx.conversation_id)
          : { ok: true };
        return { tool_call_id: tcId, content: JSON.stringify(result) };
      }
      case 'escalate_to_staff': {
        const a = args as z.infer<typeof ParamsByTool.escalate_to_staff>;
        const result = hooks.escalate ? await hooks.escalate(ctx.conversation_id, a.reason) : { ok: true };
        return { tool_call_id: tcId, content: JSON.stringify(result) };
      }
    }
  } catch (e) {
    const message = e instanceof Error ? e.message : 'unknown error';
    return {
      tool_call_id: tcId,
      content: JSON.stringify({ error: 'execution_failed', message }),
      error: message,
    };
  }
  return { tool_call_id: tcId, content: JSON.stringify({ error: 'unhandled' }), error: 'unhandled' };
}
