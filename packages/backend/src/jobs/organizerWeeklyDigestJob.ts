// Organizer Weekly Digest Job
// Runs every Monday at 9 AM — sends organizers a digest of their performance
// (item sales, revenue, new followers, top categories)
//
// INCIDENT (May 18 2026): this cron mass-sent 5,000+ "0 items sold" digests to
// scraped directory organizers, blowing Google Workspace's 2,000/day limit and
// getting outreach@finda.sale sending-clamped. The job is now:
//   1. Gated by ORGANIZER_DIGEST_ENABLED=true (Railway env var, default OFF) —
//      same pattern as OUTREACH_ENABLED. The gate also exists inside
//      sendOrganizerWeeklyDigest() (defense-in-depth for direct/internal calls).
//   2. Recipient-filtered to claimed, password-bearing, email-verified organizers
//      only (see organizerAnalyticsService.sendOrganizerWeeklyDigest).
//   3. Fused at 300 recipients — aborts without sending if the list exceeds it.

import cron from 'node-cron';
import { sendOrganizerWeeklyDigest } from '../services/organizerAnalyticsService';
import { cronGuard } from '../utils/cronGuard';
import { bulkEmailEnabled } from '../utils/bulkEmailGate';

if (process.env.ORGANIZER_DIGEST_ENABLED !== 'true') {
  console.log('[OrganizerDigest] ORGANIZER_DIGEST_ENABLED is not set to true — skipping cron registration');
} else {
  cron.schedule('0 9 * * 1', cronGuard({ jobName: 'organizerWeeklyDigestJob' }, async () => {
    if (!bulkEmailEnabled()) { console.log('[organizerWeeklyDigestJob] Skipped — bulk email disabled (OUTREACH_ENABLED!=true)'); return; }
    console.log('📧 Running organizer weekly digest job...');
    await sendOrganizerWeeklyDigest();
  }));
}
