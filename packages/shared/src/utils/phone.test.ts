import { describe, expect, test } from 'vitest';
import { toE164, isValidE164 } from './phone.js';

describe('toE164', () => {
  test('keeps already-E.164 numbers unchanged', () => {
    expect(toE164('+6281234567890')).toBe('+6281234567890');
  });

  test('converts Indonesian local 0-prefix to E.164', () => {
    expect(toE164('081234567890')).toBe('+6281234567890');
  });

  test('strips spaces, dashes, parentheses', () => {
    expect(toE164('+62 812-3456 (7890)')).toBe('+6281234567890');
  });

  test('returns undefined for empty/whitespace input', () => {
    expect(toE164('')).toBeUndefined();
    expect(toE164('   ')).toBeUndefined();
    expect(toE164(undefined)).toBeUndefined();
  });

  test('throws on invalid number that cannot be parsed', () => {
    expect(() => toE164('abc')).toThrow(/invalid phone/i);
    expect(() => toE164('123')).toThrow(/invalid phone/i);
  });
});

describe('isValidE164', () => {
  test('returns true for valid E.164', () => {
    expect(isValidE164('+6281234567890')).toBe(true);
  });

  test('returns false for non-E.164 strings', () => {
    expect(isValidE164('081234567890')).toBe(false);
    expect(isValidE164('hello')).toBe(false);
    expect(isValidE164('')).toBe(false);
  });
});
