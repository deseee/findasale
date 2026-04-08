/**
 * DEPRECATED — Merged into auctionJob.ts (S388+)
 *
 * This cron was a duplicate of auctionJob.ts, both firing every 5 minutes on expired auctions.
 * The duplicate caused double-processing: bids recorded twice, emails sent twice, etc.
 *
 * Merge decision (S388):
 * - auctionJob.ts is authoritative: handles reserve price checks, Stripe payment intents,
 *   XP awards (with Hunt Pass multiplier), Resend emails, Purchase record creation,
 *   and has Phase 2 TODO for approve/relist UI
 * - auctionCloseCron.ts was outdated: only called closeAuction() which created checkouts
 *   and notifications but missed payment intents and XP
 * - auctionJob.ts is kept; this file stubbed; import removed from index.ts
 *
 * If you need auction closing logic, use auctionJob.ts.
 * DO NOT restore this file unless auctionJob.ts is disabled.
 */

// Stub function for reference — do not use
export function scheduleAuctionCloseCron(): void {
  console.warn(
    '[auction-cron] DEPRECATED: auctionCloseCron is no longer used. ' +
    'Auction closing handled by auctionJob.ts every 5 minutes.'
  );
}
