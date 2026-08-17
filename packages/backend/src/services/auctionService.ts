import { prisma } from '../index';
import { getStripe } from '../utils/stripe';
import { createNotification } from './notificationService';
import { sellItemUnits, InsufficientStockError } from './itemStockService';
import { syncMarketplaceStock } from './marketplaceStockSyncService'; // ADR-087 Phase 4: revise-on-partial eBay quantity sync
import { shouldUseDirectCharge } from './stripeConnectService'; // Direct-charges migration (2026-08-08): staged-rollout routing decision
import { calculateApplicationFee, getPlatformFeeRate, SubscriptionTier } from '../utils/feeCalculator';

/**
 * Close an auction and handle winner checkout flow.
 *
 * Logic:
 * 1. Find highest bid for the item
 * 2. If no bids: mark closed, notify organizer
 * 3. If winner exists:
 *    - Mark item as SOLD and auctionClosed
 *    - Create Stripe checkout session (amount = bid + 5% buyer premium)
 *    - Notify winner and organizer
 */
export async function closeAuction(itemId: string): Promise<void> {
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
      return;
    }

    if (item.auctionClosed) {
      console.warn(`[auction] Item ${itemId} already closed`);
      return;
    }

    // Verify it's an auction
    if (item.listingType !== 'AUCTION') {
      console.warn(`[auction] Item ${itemId} is not an AUCTION, skipping close`);
      return;
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
      return;
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
      return;
    }

    // Winner found — create checkout and notify
    const winnerId = highestBid.user.id;
    const winnerEmail = highestBid.user.email;
    const winnerName = highestBid.user.name;
    const bidAmount = highestBid.amount;

    // TWO SEPARATE FEES (Patrick ruling, 2026-08-17 — see utils/feeCalculator.ts header).
    // The winner pays the hammer price plus a 5% buyer premium; the ORGANIZER separately pays
    // their tier commission on the hammer price. Stripe's application_fee_amount is the sum.
    // WHAT WAS BROKEN HERE (fixed 2026-08-17): this Checkout Session was created with NO
    // application_fee_amount and NO Connect routing at all — the whole charge landed in the
    // PLATFORM account, the organizer received nothing automatically, and FindA.Sale booked $0
    // in fees. Both are now set, matching jobs/auctionJob.ts and
    // controllers/stripeController.ts exactly.
    // Sale.coversFee: the organizer absorbs the premium, so the winner is charged the bid only
    // while the platform still collects premium + commission.
    const hammerPriceCents = Math.round(bidAmount * 100);
    const commissionRate = getPlatformFeeRate(
      item.sale!.organizer.subscriptionTier as SubscriptionTier
    );
    const auctionFees = calculateApplicationFee(hammerPriceCents, commissionRate, true);
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
                  description: organizerCoversPremium
                    ? `Winning bid: $${bidAmount.toFixed(2)}`
                    : `Winning bid: $${bidAmount.toFixed(2)} + 5% buyer premium ($${buyerPremium.toFixed(2)})`
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
  } catch (error) {
    console.error(`[auction] Error closing auction for item ${itemId}:`, error);
    // Graceful degradation — log but don't throw
  }
}
