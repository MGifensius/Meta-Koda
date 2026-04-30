import { parsePhoneNumberWithError, isValidPhoneNumber } from 'libphonenumber-js';

const DEFAULT_COUNTRY = 'ID';

/**
 * Normalize phone input to E.164. Returns undefined for empty input.
 * Throws if the input is non-empty but cannot be parsed as a phone number.
 */
export function toE164(input: string | undefined | null): string | undefined {
  if (input === undefined || input === null) return undefined;
  const trimmed = input.trim();
  if (trimmed === '') return undefined;
  try {
    const parsed = parsePhoneNumberWithError(trimmed, DEFAULT_COUNTRY);
    if (!parsed.isValid()) {
      throw new Error(`invalid phone number: ${input}`);
    }
    return parsed.number;
  } catch (err) {
    if (err instanceof Error && err.message.startsWith('invalid phone')) throw err;
    throw new Error(`invalid phone number: ${input}`);
  }
}

export function isValidE164(value: string): boolean {
  if (!value || !value.startsWith('+')) return false;
  return isValidPhoneNumber(value);
}

/**
 * Format a stored phone number for human display: `(countryCode) nationalNumber`,
 * e.g. `+6281211000001` → `(62) 81211000001`.
 *
 * Accepts E.164 ideally; falls back to ID-as-default parsing for legacy data
 * stored with dashes/spaces. Returns empty string for null/undefined. If
 * parsing fails entirely, returns the input verbatim so the user still sees
 * something rather than a blank cell.
 */
export function formatPhoneDisplay(value: string | null | undefined): string {
  if (!value) return '';
  const trimmed = value.trim();
  if (trimmed === '') return '';
  try {
    const parsed = parsePhoneNumberWithError(trimmed, DEFAULT_COUNTRY);
    if (!parsed.isValid()) return trimmed;
    return `(${parsed.countryCallingCode}) ${parsed.nationalNumber}`;
  } catch {
    return trimmed;
  }
}
