import { z } from 'zod';

export const BookingSourceSchema = z.enum(['manual', 'walk_in']);
export type BookingSource = z.infer<typeof BookingSourceSchema>;

export const BOOKING_SOURCE_LABELS: Record<BookingSource, string> = {
  manual: 'Manual',
  walk_in: 'Walk-in',
};
