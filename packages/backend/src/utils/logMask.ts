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

/** Replace anything that looks like an email address inside free text. */
export function redactEmailsInText(text: unknown, maxLen = 300): string {
  return String(text ?? '')
    .replace(/[^\s@<>",;:()[\]\\]+@[^\s@<>",;:()[\]\\]+\.[^\s@<>",;:()[\]\\]+/g, (m) => maskEmail(m))
    .slice(0, maxLen);
}

/** Replace anything that looks like a phone number inside free text (e.g. a Twilio error message). */
export function redactPhonesInText(text: unknown, maxLen = 300): string {
  return String(text ?? '')
    .replace(/\+?\d[\d\s().-]{7,}\d/g, (m) => `***${m.replace(/\D/g, '').slice(-4)}`)
    .slice(0, maxLen);
}

/**
 * Log-safe description of a caught error (2026-09-30). Never pass a raw error object or err.message to a log
 * call on a path that handles phone numbers or emails: Prisma and Twilio messages can embed the query arguments
 * or the recipient ("Invalid `prisma.saleSubscriber.updateMany()` invocation ... phone: "+1269..."").
 * Returns `code=<err.code or name> <message with phones and emails masked, one line, capped>`. Never throws.
 */
export function safeErrorForLog(err: unknown, maxLen = 200): string {
  try {
    const e = err as { code?: unknown; status?: unknown; name?: unknown; message?: unknown } | null | undefined;
    const code = e?.code ?? e?.status ?? e?.name ?? 'unknown';
    const raw = typeof err === 'string' ? err : e?.message ?? '';
    const oneLine = String(raw).replace(/\s+/g, ' ').trim();
    return `code=${String(code).slice(0, 40)} ${redactEmailsInText(redactPhonesInText(oneLine, 2000), 2000).slice(0, maxLen)}`.trim();
  } catch {
    return 'code=unknown';
  }
}
