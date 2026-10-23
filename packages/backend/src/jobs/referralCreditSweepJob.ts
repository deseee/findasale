import cron from 'node-cron';
import { cronGuard } from '../utils/cronGuard';
import { sweepReferralCredit } from '../services/affiliateService';
import { ORGANIZER_REFERRAL_CREDIT } from '../config/affiliateConfig';

/**
 * Organizer referral credit sweep (roadmap #661, 2026-10-23).
 *
 * The guarantee behind the referral credit: every Purchase creation path (Square checkout and webhooks, hold invoices,
 * POS card / payment links / cash, vendor booth carts, reservations, auctions, bounties, bulk packs, legacy Stripe) ends
 * up here, whether or not it fired the immediate hook, and so does every refund, partial refund, dispute and chargeback.
 * processPurchaseForReferralCredit is idempotent, so overlapping windows are harmless.
 *
 *  - every 30 minutes (:13 and :43): purchases touched in the last 48 hours;
 *  - daily 04:23 UTC: the whole earning window plus 30 days (late refunds), which also backfills referrals that existed
 *    before this shipped.
 *
 * Credit is not usable for HOLD_DAYS after the purchase, so this latency never delays a renewal.
 */
const HOUR_MS = 60 * 60 * 1000;
const DAY_MS = 24 * HOUR_MS;

export function scheduleReferralCreditSweepJob() {
  cron.schedule('13,43 * * * *', cronGuard({ jobName: 'referralCreditSweepJob' }, async () => {
    const out = await sweepReferralCredit({ since: new Date(Date.now() - 48 * HOUR_MS) });
    if (out.processed > 0) console.log(`[referralCreditSweepJob] processed=${out.processed} earned=${out.earned} adjusted=${out.adjusted}`);
  }));
  cron.schedule('23 4 * * *', cronGuard({ jobName: 'referralCreditFullSweepJob' }, async () => {
    const out = await sweepReferralCredit({ since: new Date(Date.now() - (ORGANIZER_REFERRAL_CREDIT.EARNING_WINDOW_DAYS + 30) * DAY_MS) });
    console.log(`[referralCreditFullSweepJob] processed=${out.processed} earned=${out.earned} adjusted=${out.adjusted}`);
  }));
}
