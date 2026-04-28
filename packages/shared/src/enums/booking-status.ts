import { z } from 'zod';

export const BookingStatusSchema = z.enum([
  'pending',
  'confirmed',
  'seated',
  'completed',
  'cancelled',
  'no_show',
]);
export type BookingStatus = z.infer<typeof BookingStatusSchema>;

export const BOOKING_STATUS_LABELS: Record<BookingStatus, string> = {
  pending: 'Pending',
  confirmed: 'Confirmed',
  seated: 'Seated',
  completed: 'Completed',
  cancelled: 'Cancelled',
  no_show: 'No-show',
};

export const BOOKING_TRANSITIONS: Record<BookingStatus, readonly BookingStatus[]> = {
  pending: ['confirmed', 'cancelled'],
  confirmed: ['seated', 'cancelled', 'no_show'],
  seated: ['completed', 'cancelled'],
  completed: [],
  cancelled: [],
  no_show: [],
};

export function canTransition(from: BookingStatus, to: BookingStatus): boolean {
  return BOOKING_TRANSITIONS[from].includes(to);
}
