import { describe, expect, test } from 'vitest';
import { BookingCreateSchema, BookingUpdateSchema, WalkInCreateSchema } from './booking';

describe('BookingCreateSchema', () => {
  const valid = {
    customer_id: '00000000-0000-0000-0000-000000000001',
    table_id: '00000000-0000-0000-0000-000000000002',
    starts_at: '2026-12-01T19:00:00Z',
    party_size: 4,
  };

  test('accepts a valid minimal booking', () => {
    const r = BookingCreateSchema.safeParse(valid);
    expect(r.success).toBe(true);
  });

  test('rejects party_size < 1', () => {
    const r = BookingCreateSchema.safeParse({ ...valid, party_size: 0 });
    expect(r.success).toBe(false);
  });

  test('rejects party_size > 50', () => {
    const r = BookingCreateSchema.safeParse({ ...valid, party_size: 51 });
    expect(r.success).toBe(false);
  });

  test('rejects bad UUIDs', () => {
    const r = BookingCreateSchema.safeParse({ ...valid, customer_id: 'not-a-uuid' });
    expect(r.success).toBe(false);
  });

  test('rejects bad datetime', () => {
    const r = BookingCreateSchema.safeParse({ ...valid, starts_at: 'not-a-date' });
    expect(r.success).toBe(false);
  });

  test('special_request and internal_notes are optional, max length enforced', () => {
    const ok = BookingCreateSchema.safeParse({
      ...valid,
      special_request: 'A'.repeat(500),
      internal_notes: 'B'.repeat(2000),
    });
    expect(ok.success).toBe(true);

    const tooLongSr = BookingCreateSchema.safeParse({ ...valid, special_request: 'A'.repeat(501) });
    expect(tooLongSr.success).toBe(false);

    const tooLongIn = BookingCreateSchema.safeParse({ ...valid, internal_notes: 'B'.repeat(2001) });
    expect(tooLongIn.success).toBe(false);
  });
});

describe('BookingUpdateSchema', () => {
  test('all fields optional', () => {
    expect(BookingUpdateSchema.safeParse({}).success).toBe(true);
    expect(BookingUpdateSchema.safeParse({ party_size: 3 }).success).toBe(true);
  });
});

describe('WalkInCreateSchema', () => {
  const base = {
    table_id: '00000000-0000-0000-0000-000000000002',
    party_size: 2,
  };

  test('accepts existing customer_id', () => {
    const r = WalkInCreateSchema.safeParse({
      ...base,
      customer_id: '00000000-0000-0000-0000-000000000001',
    });
    expect(r.success).toBe(true);
  });

  test('accepts new-customer fields', () => {
    const r = WalkInCreateSchema.safeParse({ ...base, customer_full_name: 'Ana' });
    expect(r.success).toBe(true);
  });

  test('rejects when neither id nor name is provided', () => {
    const r = WalkInCreateSchema.safeParse(base);
    expect(r.success).toBe(false);
  });
});
