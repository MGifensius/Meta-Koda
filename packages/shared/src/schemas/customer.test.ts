import { describe, expect, test } from 'vitest';
import { CustomerInputSchema } from './customer';

describe('CustomerInputSchema', () => {
  test('accepts minimal valid input', () => {
    const result = CustomerInputSchema.safeParse({ full_name: 'Andini' });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.full_name).toBe('Andini');
      expect(result.data.tags).toEqual([]);
    }
  });

  test('normalizes phone to E.164', () => {
    const result = CustomerInputSchema.safeParse({
      full_name: 'Reza',
      phone: '081234567890',
    });
    expect(result.success).toBe(true);
    if (result.success) expect(result.data.phone).toBe('+6281234567890');
  });

  test('rejects empty full_name', () => {
    const result = CustomerInputSchema.safeParse({ full_name: '' });
    expect(result.success).toBe(false);
  });

  test('rejects full_name longer than 120 chars', () => {
    const result = CustomerInputSchema.safeParse({ full_name: 'a'.repeat(121) });
    expect(result.success).toBe(false);
  });

  test('rejects invalid email', () => {
    const result = CustomerInputSchema.safeParse({ full_name: 'X', email: 'not-email' });
    expect(result.success).toBe(false);
  });

  test('treats empty phone string as undefined', () => {
    const result = CustomerInputSchema.safeParse({ full_name: 'X', phone: '' });
    expect(result.success).toBe(true);
    if (result.success) expect(result.data.phone).toBeUndefined();
  });
});
