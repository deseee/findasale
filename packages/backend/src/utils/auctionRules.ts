/**
 * Auction close rules shared by BOTH closing paths.
 *
 * There are two, and only two, ways an auction closes:
 *   1. `jobs/auctionJob.ts` — the every-5-minutes cron. Closes lots whose `auctionEndTime` has
 *      passed. Creates the winner's PaymentIntent + a PENDING Purchase.
 *   2. `services/auctionService.closeAuction` — the organizer's manual "Close Auction" button
 *      (POST /api/items/:itemId/close-auction). Creates a Stripe Checkout Session and sends the
 *      winner its URL; the Purchase row is written by the `checkout.session.completed`
 *      AUCTION_WINNER webhook branch.
 *
 * WHY THIS FILE EXISTS (P1, money — fixed 2026-08-17): the cron enforced the organizer's
 * reserve price and the manual button did not. An organizer clicking their own "Close Auction"
 * button awarded the lot to the high bidder and charged them even when the high bid was BELOW
 * the reserve that organizer had set — the exact outcome a reserve price exists to prevent.
 * `jobs/auctionCloseCron.ts:8-16` had already declared auctionJob authoritative precisely
 * because it "handles reserve price checks", but nothing structurally stopped the two paths
 * from drifting, and they had.
 *
 * The rule now lives HERE, once. Neither path may re-implement it; both import
 * `evaluateAuctionReserve`. Any future change to what "reserve met" means changes both paths in
 * the same edit, which is the point.
 */

/** The only Item fields the reserve rule reads. */
export interface ReserveGatedItem {
  auctionReservePrice?: number | null;
}

export interface ReserveDecision {
  /** True when the lot may be awarded. */
  reserveMet: boolean;
  /** The reserve actually in force, or null when the lot has none. */
  reservePrice: number | null;
  /** The bid the decision was made against — 0 when there were no bids at all. */
  highestBidAmount: number;
  /** Ready-to-log one-liner, identical in both paths. */
  reason: string;
}

/**
 * Decide whether an auction lot may be awarded.
 *
 * Behaviour is preserved EXACTLY from the cron's original inline check
 * (`jobs/auctionJob.ts`: `!currentItem.auctionReservePrice || price >= currentItem.auctionReservePrice`),
 * including two things that are easy to "clean up" into a behaviour change:
 *
 *   · A reserve of null OR 0 means NO RESERVE. A $0 reserve is not a floor anybody can fail to
 *     meet, and the original falsy check treated it as absent — so does this.
 *   · No bids at all is evaluated as a bid of $0. A lot with a reserve and no bids therefore
 *     fails the reserve; a lot with NO reserve and no bids passes it (and both paths then take
 *     their own existing no-winner branch, because there is no bidder to award to).
 *
 * @param item              The lot, or just its `auctionReservePrice`.
 * @param highestBidAmount  The winning bid, or 0 when there are no bids.
 */
export const evaluateAuctionReserve = (
  item: ReserveGatedItem | null | undefined,
  highestBidAmount: number
): ReserveDecision => {
  const rawReserve = item?.auctionReservePrice;
  // Falsy-check preserved deliberately: null, undefined and 0 all mean "no reserve set".
  const hasReserve = !!rawReserve;
  const reservePrice = hasReserve ? Number(rawReserve) : null;
  const bid = Number.isFinite(highestBidAmount) ? highestBidAmount : 0;
  const reserveMet = !hasReserve || bid >= (reservePrice as number);

  return {
    reserveMet,
    reservePrice,
    highestBidAmount: bid,
    reason: reserveMet
      ? `Reserve met (highest bid $${bid.toFixed(2)}, reserve ${reservePrice == null ? 'none' : `$${reservePrice.toFixed(2)}`})`
      : `Reserve NOT met (highest bid $${bid.toFixed(2)}, reserve $${(reservePrice as number).toFixed(2)})`,
  };
};
