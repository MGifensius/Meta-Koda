import { describe, expect, test, vi } from 'vitest';
import { KODA_TOOL_DEFINITIONS, executeTool, type ToolContext } from './tools';

describe('KODA_TOOL_DEFINITIONS', () => {
  test('defines exactly 7 tools with the required names', () => {
    const names = KODA_TOOL_DEFINITIONS.map((t) => t.function.name).sort();
    expect(names).toEqual([
      'add_customer_note',
      'cancel_booking',
      'check_availability',
      'create_booking',
      'escalate_to_staff',
      'find_customer_booking',
      'modify_booking',
    ]);
  });

  test('every tool has an OpenAI-compatible schema', () => {
    for (const t of KODA_TOOL_DEFINITIONS) {
      expect(t.type).toBe('function');
      expect(t.function.description).toBeTruthy();
      expect(t.function.parameters).toBeDefined();
      expect((t.function.parameters as { type: string }).type).toBe('object');
    }
  });
});

describe('executeTool', () => {
  const ctx: ToolContext = {
    organization_id: 'org-1',
    customer_id: 'cust-1',
    conversation_id: 'conv-1',
  };

  test('rejects unknown tool name', async () => {
    const result = await executeTool({ name: 'nope', arguments: '{}' }, ctx);
    expect(result.error).toMatch(/unknown tool/i);
  });

  test('rejects malformed JSON arguments', async () => {
    const result = await executeTool({ name: 'check_availability', arguments: 'not-json' }, ctx);
    expect(result.error).toMatch(/invalid arguments/i);
  });

  test('escalate_to_staff returns success with reason', async () => {
    const escalateMock = vi.fn().mockResolvedValue({ ok: true });
    const result = await executeTool(
      { name: 'escalate_to_staff', arguments: JSON.stringify({ reason: 'Customer angry' }) },
      ctx,
      { escalate: escalateMock },
    );
    expect(result.error).toBeUndefined();
    expect(escalateMock).toHaveBeenCalledWith('conv-1', 'Customer angry');
  });

  test('add_customer_note errors when customer_id missing', async () => {
    const result = await executeTool(
      { name: 'add_customer_note', arguments: JSON.stringify({ note: 'Allergic to peanuts' }) },
      { ...ctx, customer_id: null },
    );
    expect(JSON.parse(result.content)).toEqual({ error: 'no_customer' });
  });

  test('create_booking errors when both customer_id and customer_full_name missing', async () => {
    const result = await executeTool(
      {
        name: 'create_booking',
        arguments: JSON.stringify({ table_id: 't-1', starts_at: '2026-04-30T19:00:00Z', party_size: 4 }),
      },
      ctx,
    );
    const parsed = JSON.parse(result.content) as { error: string };
    expect(parsed.error).toBe('customer_required');
  });
});
