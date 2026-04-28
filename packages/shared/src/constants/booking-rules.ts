export const BOOKING_RULES = {
  defaultDurationMinutes: 120,
  cleaningBufferMinutes: 15,
  minAdvanceMinutes: 60,
  maxAdvanceDays: 90,
} as const;

export type BookingRules = typeof BOOKING_RULES;

export function computeEndsAt(startsAt: Date): Date {
  return new Date(startsAt.getTime() + BOOKING_RULES.defaultDurationMinutes * 60_000);
}
