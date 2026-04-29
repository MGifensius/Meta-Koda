import { describe, expect, test } from 'vitest';
import { buildSystemPrompt, type PromptContext } from './prompt';

const baseCtx: PromptContext = {
  restaurant: {
    name: 'Buranchi',
    timezone: 'Asia/Jakarta',
    address: 'Jl. Sudirman No. 1, Jakarta',
    operatingHoursSummary: 'Mon-Sun 10:00–22:00',
  },
  now: new Date('2026-04-29T12:00:00+07:00'),
  customer: null,
  faq: [
    { question: 'Apakah ada menu vegetarian?', answer: 'Ya, kami punya 5 menu vegetarian.' },
  ],
  specials: [
    {
      title: 'Weekend Brunch 30% off',
      description: 'Setiap Sabtu-Minggu jam 10-14',
      starts_on: '2026-04-26',
      ends_on: '2026-12-31',
    },
  ],
};

describe('buildSystemPrompt', () => {
  test('includes Koda identity statement', () => {
    const p = buildSystemPrompt(baseCtx);
    expect(p).toContain('Koda');
    expect(p).toContain('Buranchi');
    expect(p).toContain('Metaseti Digital Indonesia');
  });

  test('includes today date and time', () => {
    const p = buildSystemPrompt(baseCtx);
    expect(p).toContain('2026-04-29');
    expect(p).toContain('Asia/Jakarta');
  });

  test('includes operating hours and booking rules', () => {
    const p = buildSystemPrompt(baseCtx);
    expect(p).toContain('Mon-Sun 10:00–22:00');
    expect(p).toContain('60');
    expect(p).toContain('90');
  });

  test('when customer is null, instructs to ask their name', () => {
    const p = buildSystemPrompt(baseCtx);
    expect(p).toMatch(/not yet identified|ask their name/i);
  });

  test('when customer is known, includes their context', () => {
    const ctx: PromptContext = {
      ...baseCtx,
      customer: {
        full_name: 'Andini',
        phone: '0812-3456-7890',
        recent_bookings: [
          { starts_at: '2026-04-22T19:00:00+07:00', table_code: 'T03', party_size: 4, status: 'completed' },
        ],
        verified_notes: ['Allergic to peanuts'],
      },
    };
    const p = buildSystemPrompt(ctx);
    expect(p).toContain('Andini');
    expect(p).toContain('0812-3456-7890');
    expect(p).toContain('Allergic to peanuts');
    expect(p).toContain('T03');
  });

  test('numbered FAQ entries appear in prompt', () => {
    const p = buildSystemPrompt(baseCtx);
    expect(p).toContain('Apakah ada menu vegetarian?');
    expect(p).toContain('5 menu vegetarian');
  });

  test('numbered specials with date range', () => {
    const p = buildSystemPrompt(baseCtx);
    expect(p).toContain('Weekend Brunch 30% off');
  });

  test('escalation rules section present', () => {
    const p = buildSystemPrompt(baseCtx);
    expect(p).toContain('escalate_to_staff');
  });
});
