/**
 * bulkEmailGate.ts — Shared kill switch for proactive bulk/lifecycle email jobs.
 *
 * These jobs send mass mail (increasingly via the Resend rail,
 * transactionalEmailService.emails.send in lib/transactionalEmailService.ts, as
 * jobs migrate off Gmail per the 2026-09-05 ADR — see
 * claude_docs/feature-notes/outreach-transactional-email-identity-separation-adr-2026-09-05.md).
 * Flipping BULK_EMAIL_ENABLED away from "true" (Railway env var) pauses ALL
 * gated opt-in bulk jobs WITHOUT touching cold outreach (outreachEmailsCron.ts,
 * gated separately by its own OUTREACH_ENABLED check) or other transactional mail.
 *
 * BULK_EMAIL_ENABLED was split out from the old shared OUTREACH_ENABLED flag
 * (2026-10-13) so that pausing cold outreach never silently pauses the weekly
 * digest and the other opt-in jobs below, and vice versa.
 *
 * Usage (guard at the very top of the cron callback, before any DB work or sends):
 *   import { bulkEmailEnabled } from '../utils/bulkEmailGate';
 *   if (!bulkEmailEnabled()) {
 *     console.log('[<jobName>] Skipped — bulk email disabled (BULK_EMAIL_ENABLED!=true)');
 *     return;
 *   }
 */
export function bulkEmailEnabled(): boolean {
  return process.env.BULK_EMAIL_ENABLED === 'true';
}
