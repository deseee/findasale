import cron from 'node-cron';
import { cronGuard } from '../utils/cronGuard';
import { sendPostSaleRecaps } from '../services/postSaleRecapEmailService';
import {
  sendOrganizerTestimonialAsks,
  sendShopperReviewAsks,
} from '../services/reviewRequestEmailService';
import { sendOrganizerWinBacks } from '../services/winBackEmailService';
import { sendAbandonedSignupNudges } from '../services/abandonedSignupEmailService';

/**
 * Outward Email Automations cron — daily at 10:00 UTC.
 *
 * Runs the event-triggered outward emails in one pass:
 *   1. Organizer post-sale recap (sales ENDED in the last ~36h)
 *   2. Organizer testimonial-ask (sales ENDED ~2 days ago with >=1 sold item)
 *   3. Shopper review-ask (PAID purchases ~1 day old)
 *   4. Lapsed-organizer win-back (most recent sale ENDED >=45d ago, no active sale)
 *   5. Abandoned-signup 1h nudge (organizer registered 1–24h ago, never published)
 *
 * Each sub-task is independently idempotent + throttled at the service layer
 * (Sale/Purchase stamps + the generic EmailAutomationLog), so a missed run or
 * overlapping window never double-sends.
 */
export function scheduleOutwardEmailAutomationsCron(): void {
  cron.schedule(
    '0 10 * * *',
    cronGuard({ jobName: 'outwardEmailAutomationsJob' }, async () => {
      console.log('[outwardEmailAutomations] Starting daily run...');
      await sendPostSaleRecaps();
      await sendOrganizerTestimonialAsks();
      await sendShopperReviewAsks();
      await sendOrganizerWinBacks();
      await sendAbandonedSignupNudges();
      console.log('[outwardEmailAutomations] Completed.');
    })
  );
  console.log('[outwardEmailAutomations] Registered daily cron (10:00 UTC)');
}
