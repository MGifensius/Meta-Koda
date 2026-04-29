import OpenAI from 'openai';

const KEY = process.env.OPENAI_API_KEY;
if (!KEY && process.env.NODE_ENV !== 'test') {
  console.warn('OPENAI_API_KEY not set — Koda will fail at runtime.');
}

export const openai = new OpenAI({ apiKey: KEY ?? 'test-noop' });

export const KODA_MODEL = 'gpt-4o-mini';
export const KODA_TEMPERATURE = 0.4;
export const KODA_MAX_INPUT_TOKENS = 4000;
export const KODA_MAX_TOOL_ITERATIONS = 4;
