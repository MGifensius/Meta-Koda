export type EscalationCategory = 'human_handoff' | 'complaint';

export interface TriggerResult {
  matched: boolean;
  category?: EscalationCategory;
}

const HUMAN_HANDOFF_PATTERNS: readonly RegExp[] = [
  /\b(manager|human|real person|staff member|live agent|real human)\b/i,
  /\b(manusia|petugas|orang asli|customer service|cs)\b/i,
];

const COMPLAINT_PATTERNS: readonly RegExp[] = [
  /\b(complain|complaint|kompain)\b/i,
  /\b(refund|kembalikan uang|kembalikan pembayaran)\b/i,
  /\b(kecewa|tidak puas|tidak senang|sangat buruk|disgusting|disgusted)\b/i,
];

export function detectEscalationTrigger(message: string): TriggerResult {
  for (const re of COMPLAINT_PATTERNS) {
    if (re.test(message)) return { matched: true, category: 'complaint' };
  }
  for (const re of HUMAN_HANDOFF_PATTERNS) {
    if (re.test(message)) return { matched: true, category: 'human_handoff' };
  }
  return { matched: false };
}

const LOW_CONFIDENCE_PATTERNS: readonly RegExp[] = [
  /\bI'?m not sure\b/i,
  /\bI don'?t know\b/i,
  /\b(?:unable|cannot|can'?t)\s+(?:to\s+)?(?:determine|tell|figure out)\b/i,
  /\btidak yakin\b/i,
  /\bkurang tahu\b/i,
  /\bsaya kurang paham\b/i,
];

export function detectLowConfidence(reply: string): boolean {
  return LOW_CONFIDENCE_PATTERNS.some((re) => re.test(reply));
}

export function cannedHandoffReply(category: EscalationCategory, language: 'id' | 'en' = 'id'): string {
  if (language === 'en') {
    return category === 'complaint'
      ? "I'm sorry to hear that. Let me get a Buranchi staff member to help you right away. Please hold on 🙏"
      : "I'll connect you with a Buranchi staff member right away. Please hold on 🙏";
  }
  return category === 'complaint'
    ? 'Mohon maaf atas ketidaknyamanannya. Saya panggilkan staff Buranchi sekarang ya. Mohon tunggu sebentar 🙏'
    : 'Saya panggilkan staff Buranchi sekarang ya. Mohon tunggu sebentar 🙏';
}

const ID_TOKENS = /\b(saya|aku|kamu|mau|ingin|booking|table|jam|nama|kompain|refund|kecewa|gak|ga|sih|dong|ya|deh)\b/i;
export function detectLanguage(message: string): 'id' | 'en' {
  return ID_TOKENS.test(message) ? 'id' : 'en';
}
