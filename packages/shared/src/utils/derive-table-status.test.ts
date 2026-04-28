import { describe, expect, test } from 'vitest';
import {
  deriveTableStatus,
  type TableForDerive,
  type BookingForDerive,
} from './derive-table-status';

const NOW = new Date('2026-12-01T18:00:00Z');

const tableId = '00000000-0000-0000-0000-000000000001';
const baseTable: TableForDerive = { id: tableId, status: 'available' };

const seated: BookingForDerive = {
  table_id: tableId,
  status: 'seated',
  starts_at: '2026-12-01T17:00:00Z',
  ends_at: '2026-12-01T19:00:00Z',
};

const confirmedNear: BookingForDerive = {
  table_id: tableId,
  status: 'confirmed',
  starts_at: '2026-12-01T18:30:00Z',
  ends_at: '2026-12-01T20:30:00Z',
};

const confirmedFar: BookingForDerive = {
  table_id: tableId,
  status: 'confirmed',
  starts_at: '2026-12-01T22:00:00Z',
  ends_at: '2026-12-02T00:00:00Z',
};

describe('deriveTableStatus', () => {
  test('manual cleaning override wins', () => {
    expect(deriveTableStatus({ ...baseTable, status: 'cleaning' }, [seated], NOW)).toBe('cleaning');
  });

  test('manual unavailable override wins', () => {
    expect(deriveTableStatus({ ...baseTable, status: 'unavailable' }, [seated], NOW)).toBe('unavailable');
  });

  test('seated booking → occupied', () => {
    expect(deriveTableStatus(baseTable, [seated], NOW)).toBe('occupied');
  });

  test('confirmed booking starting within 60 minutes → reserved', () => {
    expect(deriveTableStatus(baseTable, [confirmedNear], NOW)).toBe('reserved');
  });

  test('confirmed booking starting later → still available', () => {
    expect(deriveTableStatus(baseTable, [confirmedFar], NOW)).toBe('available');
  });

  test('no relevant bookings → available', () => {
    expect(deriveTableStatus(baseTable, [], NOW)).toBe('available');
  });

  test('seated takes precedence over reserved', () => {
    expect(deriveTableStatus(baseTable, [seated, confirmedNear], NOW)).toBe('occupied');
  });

  test('booking on different table is ignored', () => {
    const other = { ...seated, table_id: '00000000-0000-0000-0000-000000000099' };
    expect(deriveTableStatus(baseTable, [other], NOW)).toBe('available');
  });
});
