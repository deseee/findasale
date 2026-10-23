/**
 * Email verification send helpers (2026-10-23).
 * - Verification links last 7 days (was 24 hours), on registration and on resend.
 * - A verification email that does not go out is reported to Sentry with the user id (never the address),
 *   instead of only a console line nobody reads.
 */
import * as Sentry from '@sentry/node';

export const EMAIL_VERIFICATION_TTL_MS = 7 * 24 * 60 * 60 * 1000;

export function reportVerificationSendFailure(path: 'register' | 'resend', userId: string, detail: unknown): void {
  const reason = detail instanceof Error ? detail.message : String(detail ?? 'unknown');
  console.error(`[emailVerification] ${path} send failed for user ${userId}: ${reason}`);
  try {
    if (detail instanceof Error) {
      Sentry.captureException(detail, { tags: { email_rail: 'resend', kind: 'verification_send_failed', path }, extra: { userId } });
    } else {
      Sentry.captureMessage(`Verification email not sent (${reason})`, {
        level: 'error',
        tags: { email_rail: 'resend', kind: 'verification_send_failed', path },
        extra: { userId, reason },
      });
    }
  } catch {
    /* Sentry must never break signup */
  }
}
