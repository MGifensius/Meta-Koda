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
