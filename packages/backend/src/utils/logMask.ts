/**
 * logMask (2026-09-29): keep personal data out of application logs.
 *
 * Railway logs are retained and searchable by everyone with project access, so email addresses and
 * phone numbers must never be written in full. Use these for console.* calls and for any
 * user-facing response that would otherwise echo an address back.
 */

/** "jane.doe@example.com" -> "j***@example.com". Never throws. */
export function maskEmail(email: unknown): string {
  if (typeof email !== 'string') return 'unknown';
  const trimmed = email.trim();
  const at = trimmed.lastIndexOf('@');
  if (at < 1) return trimmed ? '***' : 'unknown';
  return `${trimmed[0]}***${trimmed.slice(at)}`;
}

/** "+12695550142" -> "***-0142" for display next to a person's own record (organizer views). */
export function maskPhoneDisplay(phone: unknown): string | null {
  if (typeof phone !== 'string') return null;
  const digits = phone.replace(/\D/g, '');
  return digits.length >= 4 ? `***-${digits.slice(-4)}` : null;
}

/** Replace anything that looks like a phone number inside free text (e.g. a Twilio error message). */
export function redactPhonesInText(text: unknown, maxLen = 300): string {
  return String(text ?? '')
    .replace(/\+?\d[\d\s().-]{7,}\d/g, (m) => `***${m.replace(/\D/g, '').slice(-4)}`)
    .slice(0, maxLen);
}
