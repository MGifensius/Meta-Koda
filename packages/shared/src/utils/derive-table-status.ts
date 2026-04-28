import type { TableStatus } from '../enums/table-status.js';
import type { BookingStatus } from '../enums/booking-status.js';

export interface TableForDerive {
  id: string;
  status: TableStatus;
}

export interface BookingForDerive {
  table_id: string;
  status: BookingStatus;
  starts_at: string;
  ends_at: string;
}

const RESERVED_LOOKAHEAD_MINUTES = 60;

export function deriveTableStatus(
  table: TableForDerive,
  bookings: readonly BookingForDerive[],
  now: Date = new Date(),
): TableStatus {
  if (table.status === 'cleaning' || table.status === 'unavailable') {
    return table.status;
  }

  const tableBookings = bookings.filter((b) => b.table_id === table.id);

  const seatedNow = tableBookings.find((b) => b.status === 'seated');
  if (seatedNow) return 'occupied';

  const lookaheadCutoff = new Date(now.getTime() + RESERVED_LOOKAHEAD_MINUTES * 60_000);
  const reservedSoon = tableBookings.find((b) => {
    if (b.status !== 'confirmed') return false;
    const startsAt = new Date(b.starts_at);
    const endsAt = new Date(b.ends_at);
    return startsAt <= lookaheadCutoff && endsAt > now;
  });
  if (reservedSoon) return 'reserved';

  return 'available';
}
