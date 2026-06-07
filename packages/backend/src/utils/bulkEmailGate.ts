/**
 * bulkEmailGate.ts — Shared kill switch for proactive bulk/lifecycle email jobs.
 *
 * These jobs send mass mail through the Gmail rail (emailService.emails.send in
 * lib/emailService.ts), which runs on the at-risk outreach Google Workspace
 * account. Flipping OUTREACH_ENABLED away from "true" (Railway env var) pauses
 * ALL gated bulk jobs without touching transactional/opt-in mail.
 *
 * Usage (guard at the very top of the cron callback, before any DB work or sends):
 *   import { bulkEmailEnabled } from '../utils/bulkEmailGate';
 *   if (!bulkEmailEnabled()) {
 *     console.log('[<jobName>] Skipped — bulk email disabled (OUTREACH_ENABLED!=true)');
 *     return;
 *   }
 */
export function bulkEmailEnabled(): boolean {
  return process.env.OUTREACH_ENABLED === 'true';
}
