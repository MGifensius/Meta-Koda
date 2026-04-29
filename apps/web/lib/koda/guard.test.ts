import { describe, expect, test } from 'vitest';
import { detectEscalationTrigger, detectLowConfidence } from './guard';

describe('detectEscalationTrigger (pre-turn)', () => {
  test('English: customer asks for manager', () => {
    expect(detectEscalationTrigger('I want to speak to the manager.')).toEqual({
      matched: true, category: 'human_handoff',
    });
  });

  test('English: customer asks for human', () => {
    expect(detectEscalationTrigger('Can I talk to a real human please?')).toEqual({
      matched: true, category: 'human_handoff',
    });
  });

  test('Bahasa: customer says kompain', () => {
    expect(detectEscalationTrigger('Saya mau kompain pelayanannya.')).toEqual({
      matched: true, category: 'complaint',
    });
  });

  test('Bahasa: customer says kecewa', () => {
    expect(detectEscalationTrigger('Saya kecewa banget sama makanannya.')).toEqual({
      matched: true, category: 'complaint',
    });
  });

  test('Refund request triggers complaint', () => {
    expect(detectEscalationTrigger('Saya mau refund')).toEqual({
      matched: true, category: 'complaint',
    });
  });

  test('Customer service mention', () => {
    expect(detectEscalationTrigger('Mau ngomong sama customer service dong')).toEqual({
      matched: true, category: 'human_handoff',
    });
  });

  test('No false positive on unrelated text', () => {
    expect(detectEscalationTrigger('What time do you open?').matched).toBe(false);
    expect(detectEscalationTrigger('Bisa booking buat 4 orang?').matched).toBe(false);
    expect(detectEscalationTrigger('I love your humanity-themed brunch').matched).toBe(false);
  });

  test('Case insensitive', () => {
    expect(detectEscalationTrigger('MANAGER').matched).toBe(true);
    expect(detectEscalationTrigger('refund').matched).toBe(true);
  });
});

describe('detectLowConfidence (post-turn)', () => {
  test('English low-confidence phrasing', () => {
    expect(detectLowConfidence("I'm not sure about that, sorry.")).toBe(true);
    expect(detectLowConfidence("I don't know how to help with this.")).toBe(true);
    expect(detectLowConfidence('Unable to determine which booking you mean.')).toBe(true);
  });

  test('Bahasa low-confidence phrasing', () => {
    expect(detectLowConfidence('Saya kurang tahu detailnya.')).toBe(true);
    expect(detectLowConfidence('Tidak yakin maksud Anda yang mana.')).toBe(true);
  });

  test('Confident replies do not trigger', () => {
    expect(detectLowConfidence('Sudah saya book ya, T03 jam 19:00.')).toBe(false);
    expect(detectLowConfidence('Of course! I checked and we have 3 tables open.')).toBe(false);
  });
});
