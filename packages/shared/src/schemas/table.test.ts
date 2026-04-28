import { describe, expect, test } from 'vitest';
import { TableCreateSchema, TableUpdateSchema } from './table';

describe('TableCreateSchema', () => {
  test('accepts a valid table', () => {
    const r = TableCreateSchema.safeParse({ code: 'T01', capacity: 4 });
    expect(r.success).toBe(true);
    if (r.success) expect(r.data.is_active).toBe(true);
  });

  test('trims code', () => {
    const r = TableCreateSchema.safeParse({ code: '  T02  ', capacity: 2 });
    expect(r.success).toBe(true);
    if (r.success) expect(r.data.code).toBe('T02');
  });

  test('rejects empty code', () => {
    expect(TableCreateSchema.safeParse({ code: '', capacity: 4 }).success).toBe(false);
  });

  test('rejects capacity < 1 or > 50', () => {
    expect(TableCreateSchema.safeParse({ code: 'T1', capacity: 0 }).success).toBe(false);
    expect(TableCreateSchema.safeParse({ code: 'T1', capacity: 51 }).success).toBe(false);
  });

  test('floor_area is optional, max length enforced', () => {
    expect(TableCreateSchema.safeParse({ code: 'T1', capacity: 4, floor_area: 'Patio' }).success).toBe(true);
    expect(TableCreateSchema.safeParse({ code: 'T1', capacity: 4, floor_area: 'A'.repeat(65) }).success).toBe(false);
  });
});

describe('TableUpdateSchema', () => {
  test('all fields optional', () => {
    expect(TableUpdateSchema.safeParse({}).success).toBe(true);
    expect(TableUpdateSchema.safeParse({ is_active: false }).success).toBe(true);
  });
});
