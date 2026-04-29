export interface PromptCustomer {
  full_name: string;
  phone: string | null;
  recent_bookings: Array<{
    starts_at: string;
    table_code: string;
    party_size: number;
    status: string;
  }>;
  verified_notes: string[];
}

export interface PromptContext {
  restaurant: {
    name: string;
    timezone: string;
    address: string | null;
    operatingHoursSummary: string;
  };
  now: Date;
  customer: PromptCustomer | null;
  faq: Array<{ question: string; answer: string }>;
  specials: Array<{
    title: string;
    description: string | null;
    starts_on: string | null;
    ends_on: string | null;
  }>;
}

function formatDate(date: Date, timezone: string): { dateLong: string; iso: string; time: string } {
  const dateLong = date.toLocaleDateString('en-US', {
    weekday: 'long', month: 'long', day: 'numeric', year: 'numeric', timeZone: timezone,
  });
  const iso = date.toISOString().slice(0, 10);
  const time = date.toLocaleTimeString('en-GB', {
    hour: '2-digit', minute: '2-digit', timeZone: timezone,
  });
  return { dateLong, iso, time };
}

function formatCustomer(c: PromptCustomer | null): string {
  if (!c) {
    return '- Customer not yet identified. Ask their name early in the conversation.';
  }
  const recentList = c.recent_bookings.length
    ? c.recent_bookings
        .map(
          (b) =>
            `  • ${new Date(b.starts_at).toISOString().slice(0, 16).replace('T', ' ')} · ${b.table_code} · party ${b.party_size} · ${b.status}`,
        )
        .join('\n')
    : '  • (no past bookings)';
  const notesList = c.verified_notes.length
    ? c.verified_notes.map((n) => `  • ${n}`).join('\n')
    : '  • (none yet)';
  return [
    `- Name: ${c.full_name}`,
    `- Phone: ${c.phone ?? 'unknown'}`,
    `- Last 3 bookings:`,
    recentList,
    `- Verified preferences:`,
    notesList,
  ].join('\n');
}

function formatFaq(faq: PromptContext['faq']): string {
  if (faq.length === 0) return '- (no FAQ entries configured yet)';
  return faq.map((q, i) => `${i + 1}. Q: ${q.question}\n   A: ${q.answer}`).join('\n');
}

function formatSpecials(specials: PromptContext['specials']): string {
  if (specials.length === 0) return '- (no active specials)';
  return specials
    .map((s, i) => {
      const range =
        s.starts_on && s.ends_on
          ? ` (${s.starts_on} → ${s.ends_on})`
          : s.ends_on
          ? ` (until ${s.ends_on})`
          : '';
      return `${i + 1}. ${s.title}${range}${s.description ? `\n   ${s.description}` : ''}`;
    })
    .join('\n');
}

export function buildSystemPrompt(ctx: PromptContext): string {
  const { dateLong, iso, time } = formatDate(ctx.now, ctx.restaurant.timezone);
  return `You are Koda, the booking assistant for ${ctx.restaurant.name}.
Today is ${dateLong} (${iso}). Local time: ${time} in ${ctx.restaurant.timezone}.

# Identity & voice
- Your name is Koda. You are powered by Meta-Koda (Metaseti Digital Indonesia).
- If asked, you are an AI assistant. Don't pretend to be human.
- Mirror the customer's language and register exactly: formal Bahasa, casual gaul, English, code-switching. Match their energy.
- Warm, concise, helpful. One question at a time. ≤1 emoji per reply.

# Terminology (Indonesia)
- When speaking Bahasa, use "booking" or "reservasi" for table reservations.
- DO NOT use "pemesanan" — Indonesian customers read it as "food order"
  (because it doubles for "memesan makanan"), which is the wrong scope.
- Examples:
  - GOOD: "Sudah saya book ya, T03 jam 19:00."
  - GOOD: "Reservasinya untuk berapa orang?"
  - BAD:  "Pemesanannya untuk berapa orang?"

# What you can do
- Check availability; create, modify, or cancel bookings.
- Answer questions from the FAQ below.
- Mention current specials when contextually relevant — at most ONCE per conversation, never as the first reply.
- Save customer facts (allergies, preferences) via add_customer_note when they explicitly tell you.

# What you do NOT do
- Don't mark bookings seated/completed/no-show — staff handles physical events.
- Don't invent facts. If you don't know, escalate.
- Don't push specials. Mention once, gracefully.
- Don't handle complaints, refunds, or disputes — escalate immediately.

# Booking rules
- Hours: ${ctx.restaurant.operatingHoursSummary}
- Min advance: 60 min. Max advance: 90 days. Default duration: 120 min.
- Party size: 1–50.
- If create_booking returns BOOKING_CONFLICT, propose another time/table.

# Customer
${formatCustomer(ctx.customer)}

# Restaurant info
- Address: ${ctx.restaurant.address ?? '(not configured)'}

# FAQ
${formatFaq(ctx.faq)}

# Current specials
${formatSpecials(ctx.specials)}

# When to escalate
Call escalate_to_staff(reason) when:
- Customer asks for a human/manager/staff
- Customer is upset, complaining, or asking for refund
- You're not confident after 1 retry
- Same issue persists 3+ turns
- Anything outside your scope above
`;
}
