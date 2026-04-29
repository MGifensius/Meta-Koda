import { describe, expect, test, vi } from 'vitest';
import { runTurn } from './engine';
import type { PromptContext } from './prompt';
import type { ToolContext } from './tools';

const promptCtx: PromptContext = {
  restaurant: { name: 'Buranchi', timezone: 'Asia/Jakarta', address: 'Jl. X', operatingHoursSummary: '10–22' },
  now: new Date('2026-04-29T12:00:00+07:00'),
  customer: null,
  faq: [],
  specials: [],
};

const toolCtx: ToolContext = {
  organization_id: 'org-1',
  customer_id: null,
  conversation_id: 'conv-1',
};

interface MockClient {
  chat: {
    completions: {
      create: ReturnType<typeof vi.fn>;
    };
  };
}

function makeMockClient(
  scripts: Array<{
    content: string;
    tool_calls?: Array<{ id: string; type: 'function'; function: { name: string; arguments: string } }>;
    usage?: { prompt_tokens: number; completion_tokens: number };
  }>,
): MockClient {
  let i = 0;
  return {
    chat: {
      completions: {
        create: vi.fn(async () => {
          const s = scripts[i] ?? scripts[scripts.length - 1]!;
          i += 1;
          return {
            choices: [
              {
                message: {
                  role: 'assistant',
                  content: s.content,
                  tool_calls: s.tool_calls ?? null,
                },
              },
            ],
            usage: s.usage ?? { prompt_tokens: 100, completion_tokens: 50 },
          };
        }),
      },
    },
  };
}

describe('runTurn', () => {
  test('pre-turn guard skips LLM when complaint detected', async () => {
    const mockClient = makeMockClient([{ content: 'should-not-be-called' }]);
    const result = await runTurn({
      conversationId: 'conv-1',
      userMessage: 'Saya kecewa banget sama makanannya',
      promptCtx,
      toolCtx,
      history: [],
      hooks: {},
      client: mockClient as never,
    });
    expect(result.preTurnSkippedLLM).toBe(true);
    expect(result.escalated).toBe(true);
    expect(result.escalationReason).toMatch(/complaint/);
    expect(result.assistantMessage).toMatch(/staff Buranchi/i);
    expect(mockClient.chat.completions.create).not.toHaveBeenCalled();
  });

  test('simple text reply without tools', async () => {
    const mockClient = makeMockClient([{ content: 'Halo! Saya Koda. Mau booking?' }]);
    const result = await runTurn({
      conversationId: 'conv-1',
      userMessage: 'Halo',
      promptCtx,
      toolCtx,
      history: [],
      hooks: {},
      client: mockClient as never,
    });
    expect(result.preTurnSkippedLLM).toBe(false);
    expect(result.assistantMessage).toBe('Halo! Saya Koda. Mau booking?');
    expect(result.toolCalls).toHaveLength(0);
    expect(result.escalated).toBe(false);
    expect(result.inputTokens).toBe(100);
    expect(result.outputTokens).toBe(50);
  });

  test('tool-call loop: check_availability then create_booking', async () => {
    const mockClient = makeMockClient([
      {
        content: '',
        tool_calls: [
          {
            id: 'tc1',
            type: 'function',
            function: {
              name: 'check_availability',
              arguments: JSON.stringify({ starts_at: '2026-04-30T19:00:00Z', party_size: 4 }),
            },
          },
        ],
      },
      {
        content: '',
        tool_calls: [
          {
            id: 'tc2',
            type: 'function',
            function: {
              name: 'create_booking',
              arguments: JSON.stringify({
                customer_full_name: 'Andi',
                table_id: 't-1',
                starts_at: '2026-04-30T19:00:00Z',
                party_size: 4,
              }),
            },
          },
        ],
      },
      { content: 'Sudah saya book ya, T01 jam 19:00 untuk 4 orang. 🌸' },
    ]);

    const checkAvailability = vi.fn().mockResolvedValue({
      tables: [{ id: 't-1', code: 'T01', capacity: 4, floor_area: 'Indoor' }],
    });
    const createBooking = vi.fn().mockResolvedValue({ booking_id: 'b-1', summary: 'T01 19:00 party 4' });

    const result = await runTurn({
      conversationId: 'conv-1',
      userMessage: 'Booking 4 orang besok jam 7 ya',
      promptCtx,
      toolCtx,
      history: [],
      hooks: { checkAvailability, createBooking },
      client: mockClient as never,
    });

    expect(result.toolCalls).toHaveLength(2);
    expect(result.toolCalls[0]!.name).toBe('check_availability');
    expect(result.toolCalls[1]!.name).toBe('create_booking');
    expect(result.assistantMessage).toContain('T01');
    expect(checkAvailability).toHaveBeenCalled();
    expect(createBooking).toHaveBeenCalled();
  });

  test('escalate_to_staff tool flips escalated flag', async () => {
    const mockClient = makeMockClient([
      {
        content: '',
        tool_calls: [
          {
            id: 'tc1',
            type: 'function',
            function: {
              name: 'escalate_to_staff',
              arguments: JSON.stringify({ reason: 'Customer needs human help' }),
            },
          },
        ],
      },
      { content: 'Saya panggilkan staff sekarang.' },
    ]);
    const escalate = vi.fn().mockResolvedValue({ ok: true });
    const result = await runTurn({
      conversationId: 'conv-1',
      userMessage: 'Bisa tolong saya?',
      promptCtx,
      toolCtx,
      history: [],
      hooks: { escalate },
      client: mockClient as never,
    });
    expect(result.escalated).toBe(true);
    expect(result.escalationReason).toBe('tool:escalate_to_staff');
    expect(escalate).toHaveBeenCalledWith('conv-1', 'Customer needs human help');
  });

  test('post-turn low-confidence escalates', async () => {
    const mockClient = makeMockClient([{ content: "I'm not sure how to help with that." }]);
    const result = await runTurn({
      conversationId: 'conv-1',
      userMessage: 'random',
      promptCtx,
      toolCtx,
      history: [],
      hooks: {},
      client: mockClient as never,
    });
    expect(result.escalated).toBe(true);
    expect(result.escalationReason).toBe('post-turn:low_confidence');
  });
});
