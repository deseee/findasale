/**
 * bulkLotHoldEmailWiring (ADR-136 Addendum D, roadmap #659): binds bulkLotHoldEmailService.ts to the shared Prisma client, the
 * Resend transactional rail (lib/transactionalEmailService.ts), the recipient gate (suppressionService.isHardSuppressed, which
 * includes the rule that the finda.sale zone is never emailed) and Sentry. No logic lives here.
 *
 * The two hooks start the send and return at once, so the page that placed or released a hold never waits for an email. The
 * send never rejects (sendHoldEmail catches everything), so there is nothing to await and nothing to leak.
 */
import * as Sentry from '@sentry/node';
import { prisma } from '../../lib/prisma';
import { transactionalEmailService } from '../../lib/transactionalEmailService';
import { suppressionService } from '../suppressionService';
import { HoldEmailDeps, canEmailHold, sendHoldEmail } from './bulkLotHoldEmailService';

export function liveHoldEmailDeps(): HoldEmailDeps {
  return {
    db: prisma as unknown as HoldEmailDeps['db'],
    env: process.env,
    frontendUrl: process.env.FRONTEND_URL || 'https://finda.sale',
    send: (msg) => transactionalEmailService.emails.send(msg),
    isBlocked: (email) => suppressionService.isHardSuppressed(email),
    railConfigured: () => !!process.env.RESEND_API_KEY,
    onError: (err, ctx) => {
      Sentry.captureException(err, { tags: { email_rail: 'resend', kind: 'bulk_hold_email_failed', hold_email: ctx.kind }, extra: { holdId: ctx.holdId } });
    },
  };
}

/** HoldDeps.onPlaced: the confirmation. */
export function onBulkHoldPlaced(hold: any): void {
  void sendHoldEmail(liveHoldEmailDeps(), 'CONFIRMATION', hold);
}

/** HoldDeps.onEnded: the "hold ended" notice. */
export function onBulkHoldEnded(hold: any, how: 'EXPIRED' | 'RELEASED'): void {
  void sendHoldEmail(liveHoldEmailDeps(), how === 'EXPIRED' ? 'ENDED_EXPIRED' : 'ENDED_RELEASED', hold);
}

/** sweepHoldReminders deps. */
export const liveReminderDeps = {
  canEmail: (hold: any) => canEmailHold(liveHoldEmailDeps(), hold),
  sendReminder: (hold: any) => sendHoldEmail(liveHoldEmailDeps(), 'REMINDER', hold),
};
