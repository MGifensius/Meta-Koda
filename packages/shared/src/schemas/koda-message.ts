import { z } from 'zod';

export const SendKodaMessageSchema = z.object({
  conversation_id: z.string().uuid(),
  content: z.string().trim().min(1).max(4000),
});
export type SendKodaMessage = z.infer<typeof SendKodaMessageSchema>;

export const StartConversationSchema = z.object({
  customer_id: z.string().uuid().optional(),
  channel: z.enum(['simulator', 'whatsapp', 'web']),
});
export type StartConversation = z.infer<typeof StartConversationSchema>;

export const EscalateConversationSchema = z.object({
  conversation_id: z.string().uuid(),
  reason: z.string().trim().max(500).optional(),
});
export type EscalateConversation = z.infer<typeof EscalateConversationSchema>;

export const KodaConversationStatusSchema = z.enum(['active', 'escalated', 'resolved', 'closed']);
export type KodaConversationStatus = z.infer<typeof KodaConversationStatusSchema>;
