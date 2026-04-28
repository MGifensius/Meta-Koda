import { z } from 'zod';

export const BookingCreateSchema = z.object({
  customer_id: z.string().uuid(),
  table_id: z.string().uuid(),
  starts_at: z.string().datetime(),
  party_size: z.number().int().min(1).max(50),
  special_request: z.string().max(500).optional(),
  internal_notes: z.string().max(2000).optional(),
});

export type BookingCreate = z.infer<typeof BookingCreateSchema>;

export const BookingUpdateSchema = BookingCreateSchema.partial();
export type BookingUpdate = z.infer<typeof BookingUpdateSchema>;

export const WalkInCreateSchema = z
  .object({
    customer_id: z.string().uuid().optional(),
    customer_full_name: z.string().trim().min(1).max(120).optional(),
    customer_phone: z.string().optional(),
    table_id: z.string().uuid(),
    party_size: z.number().int().min(1).max(50),
    special_request: z.string().max(500).optional(),
  })
  .refine(
    (data) => Boolean(data.customer_id) || Boolean(data.customer_full_name),
    { message: 'Either customer_id or customer_full_name is required.' },
  );

export type WalkInCreate = z.infer<typeof WalkInCreateSchema>;

export const TransitionBookingSchema = z.object({
  next: z.enum(['seated', 'completed', 'cancelled', 'no_show']),
  reason: z.string().max(500).optional(),
});

export type TransitionBooking = z.infer<typeof TransitionBookingSchema>;
