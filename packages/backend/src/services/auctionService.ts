import { prisma } from '../index';
import { getStripe } from '../utils/stripe';
import { createNotification } from './notificationService';
import { sellItemUnits, InsufficientStockError } from './itemStockService';
import { syncMarketplaceStock } from './marketplaceStockSyncService'; // ADR-087 Phase 4: revise-on-partial eBay quantity sync
import { shouldUseDirectCharge } from './stripeConnectService'; // Direct-charges migration (2026-08-08): staged-rollout routing decision
import { calculateApplicationFee, formatBuyerPremiumRate, getPlatformFeeRate, resolveBuyerPremiumRate, SubscriptionTier } from '../utils/feeCalculator';
import { evaluateAuctionReserve } from '../utils/auctionRules'; // Shared reserve rule — identical to jobs/auctionJob.ts

/** What actually happened, so POST /api/items/:itemId/close-auction can tell the organizer. */
export type CloseAuctionOutcome =
  | 'SOLD'              // winner awarded, checkout session created (or attempted)
  | 'NO_BIDS'           // closed with no bidders
  | 'RESERVE_NOT_MET'   // bids existed but none reached the organizer's reserve — no sale
  | 'ALREADY_CLOSED'    // lost the atomic claim, or was already closed
  | 'NOT_FOUND'
  | 'NOT_AN_AUCTION'
  | 'ERROR';

export interface CloseAuctionResult {
  outcome: CloseAuctionOutcome;
  /** Highest bid seen, or null when there were none. */
  highestBidAmount?: number | null;
  /** The reserve in force, when one applied. */
  reservePrice?: number | null;
}

/**
 * Close an auction and handle winner checkout flow.
 *
 * Logic:
 * 1. Find highest bid for the item
 * 2. If no bids: mark closed, notify organizer
 * 3. RESERVE PRICE GATE — if the high bid is below the organizer's reserve, the lot is NOT
 *    awarded (see below)
 * 4. If a qualifying winner exists:
 *    - Decrement the shared stock pool (flips the item to SOLD when exhausted)
 *    - Create a Stripe checkout session (amount = bid + the sale's buyer premium)
 *    - Notify winner and organizer
 *
 * ── RESERVE PRICE (P1 money bug, fixed 2026-08-17) ───────────────────────────────────────
 * This function is reachable from the organizer's manual "Close Auction" button
 * (POST /api/items/:itemId/close-auction -> itemController.closeAuctionEndpoint). It had NO
 * reserve check, while `jobs/auctionJob.ts` — the cron that closes the very same lots when
 * their end time passes — has always had one. An organizer who set a $500 reserve and clicked
 * their own Close Auction button while the high bid stood at $120 sold the lot at $120 and the
 * bidder's card was charged. The reserve price is the single promise a reserve auction makes to
 * the seller and this path broke it.
 *
 * The rule now lives in `utils/auctionRules.evaluateAuctionReserve`, imported by BOTH paths, so
 * they cannot drift again. When the reserve is not met this function does exactly what the cron
 * does — and nothing more, which is deliberate: mark the auction closed, create no Purchase, no
 * Stripe object and no charge, award no XP, touch no stock, and send no winner notification.
 * (The cron's reserve-unmet branch carries a `TODO Phase 2: organizer dashboard UI to
 * approve/relist`; that gap is shared, not newly introduced here.) The one addition is the
 * returned `CloseAuctionResult` — the cron has no caller to report to, this path does, and an
 * organizer who clicks a button is owed an answer rather than a silent "closed successfully"
 * that hides the fact their reserve saved them.
 *
 * ── OTHER DIFFERENCES FROM THE CRON (intentional, documented, NOT consolidated) ───────────
 * These two paths still differ, on purpose — the manual button is an organizer ending bidding
 * early, the cron is time expiry:
 *   · Payment vehicle: this path creates a Stripe **Checkout Session** and sends the winner its
 *     URL; the cron creates a **PaymentIntent** + PENDING Purchase paid from /shopper/purchases.
 *   · Purchase row: written here by the `checkout.session.completed` AUCTION_WINNER webhook
 *     branch (stripeController), written inline by the cron.
 *   · Stock: this path calls `sellItemUnits` (pool decrement, eBay revise-qty sync, SOLD on
 *     exhaustion); the cron leaves the item at AUCTION_ENDED and updates `currentBid`.
 *   · XP: the cron awards AUCTION_WIN XP; this path does not. **Known gap, flagged not fixed** —
 *     a winner of a manually-closed auction gets no XP. Fixing it belongs with a decision about
 *     whether early closes should earn the same reward, not inside a reserve-price fix.
 *   · End time: the cron only ever closes lots past `auctionEndTime`; this path closes on
 *     demand, which is the whole point of the button.
 *   · Tie-breaking is `ORDER BY amount DESC` in both, with no secondary key — equal top bids
 *     resolve arbitrarily. Same in both paths; pre-existing.
 */
export async function closeAuction(itemId: string): Promise<CloseAuctionResult> {
  try {
    const item = await prisma.item.findUnique({
      where: { id: itemId },
      include: {
        // stripeConnectId + subscriptionTier added 2026-08-17: this session was created with
        // NO Connect routing and NO application fee — see the block below.
        sale: { include: { organizer: { select: { id: true, userId: true, stripeCustomerId: true, stripeConnectId: true, subscriptionTier: true } } } },
        bids: { orderBy: { amount: 'desc' }, take: 1, include: { user: { select: { id: true, email: true, name: true } } } }
      }
    });

    if (!item) {
      console.warn(`[auction] Item ${itemId} not found`);
      return { outcome: 'NOT_FOUND' };
    }

    if (item.auctionClosed) {
      console.warn(`[auction] Item ${itemId} already closed`);
      return { outcome: 'ALREADY_CLOSED' };
    }

    // Verify it's an auction
    if (item.listingType !== 'AUCTION') {
      console.warn(`[auction] Item ${itemId} is not an AUCTION, skipping close`);
      return { outcome: 'NOT_AN_AUCTION' };
    }

    // P2 idempotency fix (fix-and-reverify batch): the `if (item.auctionClosed)` check
    // above is a plain check-then-act read -- two concurrent closeAuction() calls for the
    // same item (e.g. an organizer double-tapping "Close Auction" on the manual endpoint,
    // POST /:itemId/close-auction in itemController.ts) could both pass it and each create
    // a Stripe Checkout Session + winner notification for the same auction. Closed with an
    // atomic conditional updateMany claim (auctionClosed: false -> true), same idiom as
    // auctionJob.ts's cron-side `tx.item.updateMany({ where: { status: 'AVAILABLE' }, data:
    // { status: 'AUCTION_ENDED' } })` guard. Only the caller that wins this claim proceeds;
    // the two later unconditional `auctionClosed: true` writes further down (no-bids branch
    // and winner branch) are removed since this claim already performs that write.
    const claim = await prisma.item.updateMany({
      where: { id: itemId, auctionClosed: false },
      data: { auctionClosed: true },
    });
    if (claim.count === 0) {
      console.warn(`[auction] Item ${itemId} already closed (lost race to a concurrent close)`);
      return { outcome: 'ALREADY_CLOSED' };
    }

    const highestBid = item.bids[0];
    const organizerId = item.sale!.organizer.userId;

    if (!highestBid) {
      // No bids — claim above already set auctionClosed: true; just notify organizer.
      await createNotification(
        organizerId,
        'AUCTION_CLOSED',
        `Auction closed with no bids`,
        `The auction for "${item.title}" ended with no bids.`,
        // item.saleId! — auction items always have saleId by domain invariant
        `/organizer/sales/${item.saleId!}`,
        'OPERATIONAL'
      );

      console.log(`[auction] Item ${itemId} closed with no bids`);
      return { outcome: 'NO_BIDS', highestBidAmount: null };
    }

    // ── RESERVE PRICE GATE ────────────────────────────────────────────────────────────────
    // Identical rule to jobs/auctionJob.ts — both call utils/auctionRules.evaluateAuctionReserve
    // (see this function's header for why). When the reserve is not met the lot is NOT awarded:
    // the atomic claim above has already set auctionClosed, and we additionally set the item to
    // AUCTION_ENDED so bidding is visibly over, which is the state the cron's own claim leaves a
    // reserve-unmet lot in. No Purchase, no Stripe object, no charge, no stock decrement, no
    // winner notification — exactly the cron's reserve-unmet branch.
    const reserve = evaluateAuctionReserve(item, highestBid.amount);
    if (!reserve.reserveMet) {
      await prisma.item.update({
        where: { id: itemId },
        data: { status: 'AUCTION_ENDED' },
      }).catch((err) =>
        console.error(`[auction] Failed to set AUCTION_ENDED on reserve-unmet item ${itemId}:`, err)
      );

      // The cron has no caller and so notifies nobody here. This path was invoked by an
      // organizer pressing a button, and the endpoint surfaces the outcome from the returned
      // result — an in-app notification would double up on that response, so the state change
      // is kept byte-for-byte identical to the cron's and the reporting is left to the caller.
      console.log(`[auction] Item ${itemId} closed WITHOUT a sale. ${reserve.reason}`);
      return {
        outcome: 'RESERVE_NOT_MET',
        highestBidAmount: highestBid.amount,
        reservePrice: reserve.reservePrice,
      };
    }

    // Winner found and the reserve is satisfied — create checkout and notify
    const winnerId = highestBid.user.id;
    const winnerEmail = highestBid.user.email;
    const winnerName = highestBid.user.name;
    const bidAmount = highestBid.amount;

    // TWO SEPARATE FEES (Patrick ruling, 2026-08-17 — see utils/feeCalculator.ts header).
    // The winner pays the hammer price plus the sale's buyer premium (5% by default, or the
    // organizer's configured Sale.buyersPremiumPct); the ORGANIZER separately pays
    // their tier commission on the hammer price. Stripe's application_fee_amount is the sum.
    // WHAT WAS BROKEN HERE (fixed 2026-08-17): this Checkout Session was created with NO
    // application_fee_amount and NO Connect routing at all — the whole charge landed in the
    // PLATFORM account, the organizer received nothing automatically, and FindA.Sale booked $0
    // in fees. Both are now set, matching jobs/auctionJob.ts and
    // controllers/stripeController.ts exactly.
    // Sale.coversFee: the organizer absorbs the premium, so the winner is charged the bid only
    // while the platform still collects premium + commission.
    // #363 (2026-08-17): the premium rate is the organizer's configured `Sale.buyersPremiumPct`,
    // not a hardcoded 5%. `item.sale` is fetched with a full `include` above so every Sale scalar
    // is present. resolveBuyerPremiumRate treats 0 as zero premium (not "unset") and falls back
    // to the 5% default only when the column is null.
    const hammerPriceCents = Math.round(bidAmount * 100);
    const commissionRate = getPlatformFeeRate(
      item.sale!.organizer.subscriptionTier as SubscriptionTier
    );
    const buyerPremiumRate = resolveBuyerPremiumRate(item.sale);
    const auctionFees = calculateApplicationFee(
      hammerPriceCents,
      commissionRate,
      true,
      buyerPremiumRate
    );
    const organizerCoversPremium = item.sale!.coversFee === true;
    const buyerPremium = organizerCoversPremium ? 0 : auctionFees.buyerPremiumCents / 100;
    const amountInCents = hammerPriceCents + (organizerCoversPremium ? 0 : auctionFees.buyerPremiumCents);

    const stripeConnectId = item.sale!.organizer.stripeConnectId;
    const shouldUseConnect = !!stripeConnectId && !stripeConnectId.startsWith('acct_test_');
    const useDirect = shouldUseConnect
      ? await shouldUseDirectCharge(item.sale!.organizerId, stripeConnectId!)
      : false;

    // Create Stripe checkout session
    let checkoutUrl: string | null = null;
    try {
      // P2 idempotency fix: the claim above guarantees only one closeAuction() call
      // reaches this point per item, so this key is defense-in-depth against a
      // network-level retry of the same logical request creating a second session.
      const session = await getStripe().checkout.sessions.create(
        {
          payment_method_types: ['card'],
          mode: 'payment',
          customer_email: winnerEmail,
          line_items: [
            {
              price_data: {
                currency: 'usd',
                product_data: {
                  name: `Auction Winner Payment - ${item.title}`,
                  // The rate here is what the buyer's card is actually run for. It used to be
                  // the literal string "5%" while the charge honoured nothing but 5% — now both
                  // come from the same resolved rate, so a 15% sale reads "15%".
                  description: organizerCoversPremium
                    ? `Winning bid: $${bidAmount.toFixed(2)}`
                    : `Winning bid: $${bidAmount.toFixed(2)} + ${formatBuyerPremiumRate(auctionFees.buyerPremiumRate)} buyer premium ($${buyerPremium.toFixed(2)})`
                },
                unit_amount: amountInCents
              },
              quantity: 1
            }
          ],
          success_url: `${process.env.FRONTEND_URL || 'https://finda.sale'}/purchase/success?sessionId={CHECKOUT_SESSION_ID}`,
          // item.saleId! — auction items always have saleId by domain invariant
          cancel_url: `${process.env.FRONTEND_URL || 'https://finda.sale'}/sales/${item.saleId!}`,
          // payment_intent_data carries the platform's cut. Destination-charge shape mirrors
          // stripeController.createPaymentIntent; a Direct charge lives on the connected
          // account, so it drops on_behalf_of/transfer_data and is routed by the
          // { stripeAccount } request option below.
          ...(shouldUseConnect
            ? {
                payment_intent_data: useDirect
                  ? { application_fee_amount: auctionFees.applicationFeeCents }
                  : {
                      application_fee_amount: auctionFees.applicationFeeCents,
                      on_behalf_of: stripeConnectId!,
                      transfer_data: { destination: stripeConnectId! },
                    },
              }
            : {}),
          metadata: {
            itemId: item.id,
            winnerId: winnerId,
            saleId: item.saleId!,
            type: 'AUCTION_WINNER',
            // Read back by the checkout.session.completed AUCTION_WINNER branch in
            // controllers/stripeController.ts, which creates the PAID Purchase row. Without
            // these the webhook cannot record the sale and it is stranded.
            platformFeeAmount: String(auctionFees.applicationFeeCents / 100),
            chargeType: useDirect ? 'DIRECT' : 'DESTINATION',
            ...(useDirect ? { stripeAccountId: stripeConnectId! } : {}),
          }
        },
        {
          idempotencyKey: `auction-close-${item.id}`,
          ...(useDirect ? { stripeAccount: stripeConnectId! } : {}),
        }
      );

      checkoutUrl = session.url;
    } catch (stripeErr) {
      console.error(`[auction] Stripe checkout creation failed for item ${itemId}:`, stripeErr);
      // Continue anyway — notify winner of failure
    }

    // ADR-087 D3: route through the shared stock pool instead of a raw status
    // write, so a FindA.Sale-native auction win shares one consistent count with
    // every other sale channel (POS/Stripe/eBay/etc). sellItemUnits() flips
    // Item.status to SOLD itself once the pool is exhausted (matching today's
    // single-unit auction behavior exactly). auctionClosed is now made idempotent
    // by the atomic claim (auctionClosed: false -> true) above -- NOT merely by the
    // `if (item.auctionClosed)` read-then-act check at the top of this function,
    // which on its own was NOT sufficient under real concurrency (that was the P2
    // finding fixed this batch; this comment previously overstated the guarantee).
    // No additional ledger is needed here for this flag specifically -- unlike the
    // eBay paths, which reconcile a re-deliverable external order and need the
    // EbaySoldEvent ledger.
    // NOTE: this call site has no existing endEbayListingIfExists (P3
    // withdraw-on-sellout) hook wired up at all -- a pre-existing gap
    // confirmed by the ADR-087 Phase 4 architect review, out of scope for
    // this pass (flagged, not silently fixed here). The P4 revise-on-partial
    // hook below is still added per the hacker/architect review's explicit
    // inclusion of this call site.
    try {
      const { fullySoldOut, remainingStock } = await sellItemUnits(itemId, 1);
      if (!fullySoldOut) {
        syncMarketplaceStock(itemId, { fullySoldOut: false, remainingStock }).catch(err =>
          console.error('[eBay ReviseQty] sync failed for item', itemId, err)
        );
      }
    } catch (stockErr) {
      if (stockErr instanceof InsufficientStockError) {
        // Pool already exhausted (e.g. sold on another channel first). Log
        // loudly but continue -- the winner still owes payment per the auction
        // result, and there's nothing safe to write to the pool here.
        console.error(`[auction] Stock pool already exhausted for item ${itemId} at auction close:`, stockErr.message);
      } else {
        throw stockErr;
      }
    }

    // auctionClosed already set true by the atomic claim above -- no further write needed.

    // Notify winner
    const checkoutCta = checkoutUrl ? `Complete your purchase: ${checkoutUrl}` : 'Contact the organizer to complete payment.';
    await createNotification(
      winnerId,
      'AUCTION_WON',
      `You won "${item.title}"!`,
      `Congratulations! You won the auction with a bid of $${bidAmount.toFixed(2)}. ${checkoutCta}`,
      // item.saleId! — auction items always have saleId by domain invariant
      checkoutUrl || `/sales/${item.saleId!}`,
      'OPERATIONAL',
      // S1195 (2026-08-08, notification-gap dispatch): AUCTION_WON is time-critical --
      // email so the winner sees it even if they don't have the app open.
      true,
      `You won "${item.title}"!`
    );

    // Notify organizer
    await createNotification(
      organizerId,
      'AUCTION_CLOSED',
      `Auction closed: "${item.title}" sold`,
      `Winner: ${winnerName} (${winnerEmail}) - Final bid: $${bidAmount.toFixed(2)}. Payment link sent.`,
      `/organizer/sales/${item.saleId!}`,
      'OPERATIONAL'
    );

    console.log(`[auction] Item ${itemId} closed successfully. Winner: ${winnerId}, Bid: $${bidAmount.toFixed(2)}`);
    return {
      outcome: 'SOLD',
      highestBidAmount: bidAmount,
      reservePrice: reserve.reservePrice,
    };
  } catch (error) {
    console.error(`[auction] Error closing auction for item ${itemId}:`, error);
    // Graceful degradation — log but don't throw. Preserved from the original: the caller gets
    // an ERROR outcome instead of an exception, so a partially-completed close (e.g. Stripe up,
    // notification down) never 500s an organizer who has in fact closed their auction.
    return { outcome: 'ERROR' };
  }
}
