import type { ChatCompletionMessageParam, ChatCompletion, ChatCompletionCreateParamsNonStreaming } from 'openai/resources/chat/completions';
import { openai, KODA_MODEL, KODA_TEMPERATURE, KODA_MAX_TOOL_ITERATIONS } from './openai';
import { KODA_TOOL_DEFINITIONS, executeTool, type ToolContext, type ToolHooks } from './tools';
import { detectEscalationTrigger, detectLowConfidence, cannedHandoffReply, detectLanguage } from './guard';
import { buildSystemPrompt, type PromptContext } from './prompt';

export interface KodaClient {
  chat: {
    completions: {
      create: (params: ChatCompletionCreateParamsNonStreaming) => Promise<ChatCompletion>;
    };
  };
}

export interface RunTurnInput {
  conversationId: string;
  userMessage: string;
  promptCtx: PromptContext;
  toolCtx: ToolContext;
  history: Array<{
    role: 'user' | 'assistant' | 'tool' | 'staff' | 'system';
    content: string;
    tool_calls?: unknown;
    tool_call_id?: string;
    tool_name?: string;
  }>;
  hooks: ToolHooks;
  client?: KodaClient;
}

export interface RunTurnResult {
  assistantMessage: string;
  toolCalls: Array<{ name: string; arguments: string; result: string }>;
  inputTokens: number;
  outputTokens: number;
  escalated: boolean;
  escalationReason?: string;
  preTurnSkippedLLM: boolean;
}

function historyToOpenAiMessages(history: RunTurnInput['history']): ChatCompletionMessageParam[] {
  const out: ChatCompletionMessageParam[] = [];
  for (const m of history) {
    if (m.role === 'system') continue;
    if (m.role === 'staff') {
      out.push({ role: 'assistant', content: m.content });
    } else if (m.role === 'tool') {
      out.push({ role: 'tool', content: m.content, tool_call_id: m.tool_call_id ?? 'unknown' });
    } else {
      out.push({ role: m.role as 'user' | 'assistant', content: m.content });
    }
  }
  return out;
}

export async function runTurn(input: RunTurnInput): Promise<RunTurnResult> {
  const client: KodaClient = input.client ?? (openai as unknown as KodaClient);

  const trigger = detectEscalationTrigger(input.userMessage);
  if (trigger.matched) {
    const lang = detectLanguage(input.userMessage);
    const cannedReply = cannedHandoffReply(trigger.category!, lang);
    return {
      assistantMessage: cannedReply,
      toolCalls: [],
      inputTokens: 0,
      outputTokens: 0,
      escalated: true,
      escalationReason: `pre-turn:${trigger.category}`,
      preTurnSkippedLLM: true,
    };
  }

  const systemPrompt = buildSystemPrompt(input.promptCtx);
  const messages: ChatCompletionMessageParam[] = [
    { role: 'system', content: systemPrompt },
    ...historyToOpenAiMessages(input.history),
    { role: 'user', content: input.userMessage },
  ];

  const toolCallsLog: RunTurnResult['toolCalls'] = [];
  let totalInput = 0;
  let totalOutput = 0;
  let assistantText = '';
  let iter = 0;

  while (iter < KODA_MAX_TOOL_ITERATIONS) {
    iter += 1;
    const completion: ChatCompletion = await client.chat.completions.create({
      model: KODA_MODEL,
      temperature: KODA_TEMPERATURE,
      messages,
      tools: KODA_TOOL_DEFINITIONS,
      tool_choice: 'auto',
    });

    totalInput += completion.usage?.prompt_tokens ?? 0;
    totalOutput += completion.usage?.completion_tokens ?? 0;

    const choice = completion.choices[0];
    if (!choice) break;
    const msg = choice.message;
    assistantText = msg.content ?? '';

    if (msg.tool_calls && msg.tool_calls.length > 0) {
      messages.push({ role: 'assistant', content: assistantText, tool_calls: msg.tool_calls });
      for (const tc of msg.tool_calls) {
        if (tc.type !== 'function') continue;
        const fn = (tc as { function: { name: string; arguments: string } }).function;
        const result = await executeTool(
          { name: fn.name, arguments: fn.arguments, tool_call_id: tc.id },
          input.toolCtx,
          input.hooks,
        );
        toolCallsLog.push({
          name: fn.name,
          arguments: fn.arguments,
          result: result.content,
        });
        messages.push({ role: 'tool', content: result.content, tool_call_id: tc.id });
      }
      continue;
    }

    break;
  }

  const lowConfidence = detectLowConfidence(assistantText);
  const escalatedByTool = toolCallsLog.some((tc) => tc.name === 'escalate_to_staff');
  const hitIterCap = iter >= KODA_MAX_TOOL_ITERATIONS && toolCallsLog.length > 0
    && toolCallsLog[toolCallsLog.length - 1]!.name !== 'escalate_to_staff';
  const escalated = lowConfidence || escalatedByTool || hitIterCap;
  const escalationReason = escalatedByTool
    ? 'tool:escalate_to_staff'
    : lowConfidence
    ? 'post-turn:low_confidence'
    : hitIterCap
    ? 'post-turn:tool_iteration_cap'
    : undefined;

  return {
    assistantMessage: assistantText || 'I will check on that and get back to you.',
    toolCalls: toolCallsLog,
    inputTokens: totalInput,
    outputTokens: totalOutput,
    escalated,
    ...(escalationReason ? { escalationReason } : {}),
    preTurnSkippedLLM: false,
  };
}
