/**
 * gmailForwardingAutoConfirmCron.ts — schedules the Gmail forwarding-confirmation
 * auto-confirm IMAP poll (gmailForwardingAutoConfirmService.ts).
 *
 * Runs every 15 minutes. This job polls the same outreach@finda.sale mailbox as
 * facebookMarketplaceEmailPollCron.ts (every 20 minutes) but on its own independent
 * schedule/IMAP session -- see gmailForwardingAutoConfirmService.ts's file header for
 * why the two poll loops were kept separate rather than merged into one pass.
 *
 * Gated by GMAIL_FORWARDING_AUTOCONFIRM_ENABLED, same opt-in env-flag idiom as
 * FACEBOOK_SOLD_EMAIL_POLL_ENABLED in the sibling facebookMarketplaceEmailPollCron.ts
 * (and SCRAPER_ENABLED/METRO_SYNC_ENABLED elsewhere) -- must be exactly 'true' to
 * schedule the cron at all. Ships disabled by default so this can be reviewed/turned on
 * with a single Railway env var flip once FACEBOOK_SOLD_IMAP_USER /
 * FACEBOOK_SOLD_IMAP_APP_PASSWORD are confirmed working and the real Gmail
 * forwarding-confirmation sender/subject format has been verified against a live sample
 * (see gmailForwardingAutoConfirmService.ts's TODO on that).
 */

import cron from 'node-cron';
import { cronGuard } from '../utils/cronGuard';
import { pollGmailForwardingConfirmations } from '../services/gmailForwardingAutoConfirmService';

/**
 * Registers the poll cron if GMAIL_FORWARDING_AUTOCONFIRM_ENABLED === 'true'. Called once
 * at server startup via src/index.ts. Safe to call unconditionally -- it is itself the
 * gate.
 */
export function startGmailForwardingAutoConfirmCron(): void {
  if (process.env.GMAIL_FORWARDING_AUTOCONFIRM_ENABLED !== 'true') {
    console.log(
      '[gmailForwardingAutoConfirmCron] GMAIL_FORWARDING_AUTOCONFIRM_ENABLED not "true" -- skipping registration.'
    );
    return;
  }

  cron.schedule(
    '*/15 * * * *',
    cronGuard({ jobName: 'gmailForwardingAutoConfirmCron' }, async () => {
      const result = await pollGmailForwardingConfirmations();
      if (result.errors.length > 0) {
        console.warn('[gmailForwardingAutoConfirmCron] Completed with errors:', result.errors.slice(0, 5));
      }
    })
  );

  console.log('[gmailForwardingAutoConfirmCron] Registered -- runs every 15 minutes.');
}
