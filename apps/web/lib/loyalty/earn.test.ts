import { describe, expect, test } from 'vitest';
import { computePointsForBill } from './earn';

describe('computePointsForBill', () => {
  test('zero bill → 0', () => {
    expect(computePointsForBill(0, 10000)).toBe(0);
  });

  test('bill < earn rate → 0 (rounds down)', () => {
    expect(computePointsForBill(5000, 10000)).toBe(0);
    expect(computePointsForBill(9999, 10000)).toBe(0);
  });

  test('exact earn rate → 1', () => {
    expect(computePointsForBill(10000, 10000)).toBe(1);
  });

  test('large bill → integer division', () => {
    expect(computePointsForBill(250000, 10000)).toBe(25);
    expect(computePointsForBill(7500000, 10000)).toBe(750);
  });

  test('different earn rates', () => {
    expect(computePointsForBill(50000, 5000)).toBe(10);
    expect(computePointsForBill(100000, 1000)).toBe(100);
  });

  test('negative bill → 0 (defensive)', () => {
    expect(computePointsForBill(-1, 10000)).toBe(0);
  });

  test('non-positive earn rate → 0 (defensive)', () => {
    expect(computePointsForBill(100000, 0)).toBe(0);
    expect(computePointsForBill(100000, -1)).toBe(0);
  });
});
