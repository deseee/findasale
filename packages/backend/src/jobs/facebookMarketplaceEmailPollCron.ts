/**
 * facebookMarketplaceEmailPollCron.ts — ADR-131: schedules the Facebook Marketplace
 * order-confirmation-email IMAP poll (facebookMarketplaceEmailPollService.ts).
 *
 * Runs every 20 minutes (within the ADR's recommended 15-30 min range -- this is not
 * time-critical the way a double-sell race is, and email delivery itself has latency).
 *
 * Gated by FACEBOOK_SOLD_EMAIL_POLL_ENABLED, same opt-in env-flag idiom already used
 * elsewhere in this codebase for background jobs that should ship dark by default
 * (e.g. SCRAPER_ENABLED in jobs/scraperCron.ts, METRO_SYNC_ENABLED in
 * jobs/metroSyncCron.ts) -- must be exactly 'true' to schedule the cron at all. This lets
 * the job ship to production disabled and be turned on with a single Railway env var
 * flip once FACEBOOK_SOLD_IMAP_USER / FACEBOOK_SOLD_IMAP_APP_PASSWORD are confirmed
 * working, with no redeploy needed to flip it back off later.
 */

import cron from 'node-cron';
import { cronGuard } from '../utils/cronGuard';
import { pollFacebookMarketplaceSoldEmails } from '../services/facebookMarketplaceEmailPollService';

/**
 * Registers the poll cron if FACEBOOK_SOLD_EMAIL_POLL_ENABLED === 'true'. Called once at
 * server startup via src/index.ts. Safe to call unconditionally -- it is itself the gate.
 */
export function startFacebookMarketplaceEmailPollCron(): void {
  if (process.env.FACEBOOK_SOLD_EMAIL_POLL_ENABLED !== 'true') {
    console.log(
      '[facebookMarketplaceEmailPollCron] FACEBOOK_SOLD_EMAIL_POLL_ENABLED not "true" -- skipping registration.'
    );
    return;
  }

  cron.schedule(
    '*/20 * * * *',
    cronGuard({ jobName: 'facebookMarketplaceEmailPollCron' }, async () => {
      const result = await pollFacebookMarketplaceSoldEmails();
      if (result.errors.length > 0) {
        console.warn('[facebookMarketplaceEmailPollCron] Completed with errors:', result.errors.slice(0, 5));
      }
    })
  );

  console.log('[facebookMarketplaceEmailPollCron] Registered -- runs every 20 minutes.');
}
