import cron from 'node-cron';
import { getStripe } from '../utils/stripe';
import { cronGuard } from '../utils/cronGuard';
import { prisma } from '../lib/prisma';
import { awardXp, applyHuntPassMultiplier, XP_AWARDS, checkMonthlyXpCap } from '../services/xpService'; // Explorer's Guild XP awards
import { emailService } from '../lib/emailService';
import { suppressionService } from '../services/suppressionService';
import { createNotification } from '../services/notificationService';
import { shouldUseDirectCharge } from '../services/stripeConnectService'; // Direct-charges migration (2026-08-08): staged-rollout routing decision
import { calculateApplicationFee, getPlatformFeeRate, snapshotFromBreakdown, SubscriptionTier } from '../utils/feeCalculator';
import { evaluateAuctionReserve } from '../utils/auctionRules'; // Shared with services/auctionService.closeAuction — see that file's header
const stripe = () => getStripe();


export const endAuctions = async () => {
  try {
    console.log('Running auction end job...');

    // UTC: auctionEndTime is stored as UTC in DB — comparisons use new Date() (current UTC time)
    const endedAuctions = await prisma.item.findMany({
      where: {
        AND: [
          { auctionEndTime: { not: null } },
          { auctionEndTime: { lt: new Date() } },
          { status: 'AVAILABLE' },
          // P0 cross-path race fix (see claim WHERE below): excludes items already
          // claimed by auctionService.ts's closeAuction() (organizer manual
          // "Close Auction" button, POST /:itemId/close-auction) that haven't
          // flipped `status` away from AVAILABLE yet (e.g. partial stock, no
          // sellout). Without this, a stale AVAILABLE+auctionClosed:true item
          // would be re-selected here every 5 minutes.
          { auctionClosed: false },
        ],
      },
      include: {
        sale: {
          select: {
            id: true,
            organizer: { select: { stripeConnectId: true, userId: true } }
          }
        },
      },
    });

    console.log(`Found ${endedAuctions.length} auctions to process`);

    for (const item of endedAuctions) {
      try {
      // P0 Race Fix: Wrap entire auction close logic in transaction with optimistic lock
      const result = await prisma.$transaction(async (tx) => {
        // 1. Atomic update with WHERE-clause guard: only process if not already closed
        // P0 cross-path race fix: auctionService.ts's closeAuction() (manual
        // organizer close, POST /:itemId/close-auction) uses `auctionClosed`
        // as its own atomic claim field, independent of `status`. Before this
        // fix, this job's claim only checked/wrote `status`, so a manual close
        // and this cron tick could both win their respective claims on the
        // same item (different guard columns don't mutually exclude), causing
        // double payment collection (Stripe PaymentIntent here + Stripe
        // Checkout Session in closeAuction()) and duplicate winner
        // notifications. `auctionClosed` is now the single shared mutex field
        // both paths check AND write atomically, so whichever claim commits
        // first blocks the other regardless of which field it inspects.
        const updated = await tx.item.updateMany({
          where: {
            id: item.id,
            status: 'AVAILABLE',
            auctionClosed: false,
            auctionEndTime: { not: null, lt: new Date() }
          },
          data: { status: 'AUCTION_ENDED', auctionClosed: true } // Mark as processing
        });

        if (updated.count === 0) {
          console.log(`[endAuctions] Item ${item.id} already processed by another job, skipping`);
          return null;
        }

        // 2. Fetch highest bid and item details within transaction
        const highestBid = await tx.bid.findFirst({
          where: { itemId: item.id },
          orderBy: { amount: 'desc' },
          include: { user: { select: { email: true } } },
        });

        // subscriptionTier + coversFee added 2026-08-17: the fee model needs the organizer's
        // tier (PRO/TEAMS pay 8%, not the flat 10% this job used to assume) and whether the
        // sale absorbs the buyer's premium.
        const currentItem = await tx.item.findUnique({
          where: { id: item.id },
          include: {
            sale: {
              include: {
                organizer: { select: { stripeConnectId: true, userId: true, subscriptionTier: true } },
              },
            },
          },
        });

        if (!currentItem) return null;

        const price = highestBid?.amount ?? 0;

        // Pass 1: Reserve price check.
        // The rule moved to utils/auctionRules.evaluateAuctionReserve (2026-08-17) so the
        // organizer's manual "Close Auction" button (services/auctionService.closeAuction)
        // enforces the IDENTICAL rule — it previously enforced none at all and could award a
        // lot below its own reserve. Behaviour here is unchanged: a null or 0 reserve means no
        // reserve, and no bids evaluates as a $0 bid.
        const reserve = evaluateAuctionReserve(currentItem, price);
        if (!reserve.reserveMet) {
          // Update to AUCTION_ENDED without payment (reserve not met)
          await tx.item.update({
            where: { id: currentItem.id },
            data: { auctionClosed: true },
          });
          console.log(`Auction ended for item ${currentItem.id}. ${reserve.reason}`);
          return { status: 'RESERVE_NOT_MET', item: currentItem };
        }

        // Reserve met: update item and prepare payment
        await tx.item.update({
          where: { id: currentItem.id },
          data: { currentBid: price, auctionClosed: true },
        });

        // QA: Fee rate now read from FeeStructure table at transaction time.
        // Fallback corrected 2026-08-17: was a flat 0.10, which billed PRO and TEAMS organizers
        // the SIMPLE rate. Now matches stripeController.createPaymentIntent exactly.
        const feeStructure = await tx.feeStructure.findFirst({ where: { listingType: '*' } });
        const feePercent =
          feeStructure?.feeRate ??
          getPlatformFeeRate(currentItem.sale!.organizer.subscriptionTier as SubscriptionTier);

        // TWO SEPARATE FEES (Patrick ruling, 2026-08-17 — see utils/feeCalculator.ts header).
        // This job is the LIVE auction-winner charge path: the cron closes the auction, creates
        // the winner's PaymentIntent and a PENDING Purchase, and the winner pays it via
        // GET /api/stripe/pending-payment/:purchaseId. It was charging the hammer price with NO
        // buyer premium and taking only the commission as application_fee_amount — so on a $200
        // win the winner paid $200 (against the $210 that AUCTION_WIN_SPEC.md, CheckoutModal and
        // the checkout consent text all promise) and the platform collected $20 instead of $30.
        // Both are corrected here, and the arithmetic now matches
        // stripeController.createPaymentIntent's auction branch exactly.
        // Sale.coversFee: the organizer absorbs the premium, so the winner is charged the bid
        // only while the platform still collects premium + commission.
        // PREMIUM LOCKED TO THE PLATFORM RATE (2026-08-17, Patrick ruling — reverses the #363
        // pass earlier the same day). The premium is FindA.Sale's revenue, so it is not an
        // organizer setting; `calculateApplicationFee` reads the platform constant itself and
        // takes no rate parameter. `Sale.coversFee` still works and is honoured below.
        const hammerPriceCents = Math.round(price * 100);
        const organizerCoversPremium = currentItem.sale!.coversFee === true;
        const auctionFees = calculateApplicationFee(hammerPriceCents, feePercent, true);
        const buyerChargeCents = organizerCoversPremium
          ? hammerPriceCents
          : hammerPriceCents + auctionFees.buyerPremiumCents;

        let stripePaymentIntentId: string | null = null;
        // Direct-charges migration (2026-08-08): persisted, authoritative charge shape --
        // set once here at charge-creation time, defaults to DESTINATION (no route taken /
        // organizer not onboarded), never inferred after the fact.
        let purchaseChargeType: string = 'DESTINATION';
        let purchaseStripeAccountId: string | null = null;

        if (currentItem.sale!.organizer.stripeConnectId && highestBid) {
          try {
            const feeAmount = auctionFees.applicationFeeCents;
            const stripeConnectId = currentItem.sale!.organizer.stripeConnectId;
            const useDirect = await shouldUseDirectCharge(currentItem.sale!.organizerId, stripeConnectId);
            const paymentIntent = await stripe().paymentIntents.create(
              useDirect
                ? {
                    amount: buyerChargeCents,
                    currency: 'usd',
                    metadata: { itemId: currentItem.id, saleId: currentItem.sale!.id, userId: highestBid.userId },
                    application_fee_amount: feeAmount,
                  }
                : {
                    amount: buyerChargeCents,
                    currency: 'usd',
                    metadata: { itemId: currentItem.id, saleId: currentItem.sale!.id, userId: highestBid.userId },
                    application_fee_amount: feeAmount,
                    on_behalf_of: stripeConnectId,
                    transfer_data: { destination: stripeConnectId },
                  },
              { idempotencyKey: `auction-pi-${currentItem.id}`, ...(useDirect ? { stripeAccount: stripeConnectId } : {}) }
            );
            stripePaymentIntentId = paymentIntent.id;
            purchaseChargeType = useDirect ? 'DIRECT' : 'DESTINATION';
            purchaseStripeAccountId = useDirect ? stripeConnectId : null;
          } catch (err) {
            console.error(`Stripe PaymentIntent creation failed for item ${currentItem.id}:`, err);
          }
        } else if (!currentItem.sale!.organizer.stripeConnectId) {
          console.warn(`Organizer for item ${currentItem.id} has no Stripe account — skipping payment intent`);
        }

        // Purchase.amount is what the buyer was CHARGED (premium included, matching
        // stripeController's auction branch); platformFeeAmount is the real Stripe
        // application_fee_amount (premium + commission). Organizer-facing surfaces strip the
        // premium back out via utils/feeCalculator.resolveOrganizerFeeReport — they must never
        // read platformFeeAmount directly.
        const platformFeeAmount = auctionFees.applicationFeeCents / 100;
        if (highestBid) {
          await tx.purchase.create({
            data: {
              userId: highestBid.userId,
              itemId: currentItem.id,
              saleId: currentItem.sale!.id,
              amount: buyerChargeCents / 100,
              platformFeeAmount,
              // FEE SNAPSHOT (2026-08-17): the premium/commission split of that
              // application_fee_amount, pinned at charge time so organizer earnings reporting
              // never has to re-derive this lot's fee from whatever the rates and the
              // organizer's subscription tier happen to be when the report is run.
              ...snapshotFromBreakdown(auctionFees, feePercent, organizerCoversPremium),
              stripePaymentIntentId,
              // Only mark PAID when there's no Stripe (organizer not onboarded)
              status: stripePaymentIntentId ? 'PENDING' : 'PAID',
              chargeType: purchaseChargeType,
              ...(purchaseStripeAccountId ? { stripeAccountId: purchaseStripeAccountId } : {}),
            },
          });
        }

        return { status: 'SUCCESS', item: currentItem, highestBid, stripePaymentIntentId, price };
      });

      // All transaction-critical operations complete. Now handle post-transaction side effects.
      if (!result) continue; // Another process already handled this item

      if (result.status === 'RESERVE_NOT_MET') {
        // TODO Phase 2: organizer dashboard UI to approve/relist
        continue;
      }

      // Award XP to shopper for winning auction — flat 20 XP, no value multiplier (D-XP-009)
      if (result.highestBid) {
        const baseXp = XP_AWARDS.AUCTION_WIN;
        // Apply Hunt Pass 1.5x multiplier if active
        const totalXp = await applyHuntPassMultiplier(result.highestBid.userId, baseXp);

        // Check monthly cap for AUCTION awards
        try {
          const monthlyRemaining = await checkMonthlyXpCap(result.highestBid.userId, 'AUCTION');
          if (monthlyRemaining > 0) {
            const xpToAward = Math.min(totalXp, monthlyRemaining);
            await awardXp(result.highestBid.userId, 'AUCTION_WIN', xpToAward, { itemId: result.item.id, saleId: result.item.sale!.id, preMultipliedHuntPassXp: true });
          }
        } catch (err) {
          console.error('[XP] Failed to award XP for auction win:', err);
        }

        // Email the winner with a payment link
        if (result.stripePaymentIntentId && result.highestBid.user?.email) {
          if (await suppressionService.isHardSuppressed(result.highestBid.user.email)) {
            console.log(`[auctionJob] Skipping hard-suppressed winner: ${result.highestBid.user.email}`);
          } else {
            const fromEmail = process.env.GMAIL_FROM_EMAIL || process.env.SES_FROM_EMAIL || 'find@outreach.finda.sale';
            const payUrl = `${process.env.FRONTEND_URL || 'https://finda.sale'}/shopper/purchases`;
            try {
              await emailService.emails.send({
                from: fromEmail,
                to: result.highestBid.user.email,
                subject: `You won: ${result.item.title}`,
                html: `
                  <div style="font-family:sans-serif;max-width:600px;margin:0 auto">
                    <h2>Congratulations, you won the auction!</h2>
                    <p>Your winning bid of <strong>$${result.price.toFixed(2)}</strong> was accepted for <strong>${result.item.title}</strong>.</p>
                    <p>Please complete your payment within 48 hours to secure the item.</p>
                    <a href="${payUrl}" style="display:inline-block;background:#2563eb;color:#fff;padding:12px 24px;border-radius:6px;text-decoration:none;font-weight:bold;margin-top:16px">
                      Complete Payment
                    </a>
                    <p style="margin-top:24px;color:#666;font-size:13px">
                      If you have questions, contact the sale organizer directly.
                    </p>
                  </div>
                `,
              });
            } catch (emailErr) {
              console.error('Failed to send auction winner email:', emailErr);
            }
          }
        }
      }

      // In-app notifications: winner + organizer (ported from auctionAutoCloseCron)
      if (result.highestBid) {
        await createNotification(
          result.highestBid.userId,
          'AUCTION_WON',
          'Auction Won!',
          `Congratulations! You won the auction for ${result.item.title} with a bid of $${result.price.toFixed(2)}`,
          `/items/${result.item.id}`,
          'OPERATIONAL',
          // S1195 (2026-08-08, notification-gap dispatch): AUCTION_WON is time-critical --
          // the winner has a payment window to complete checkout in, so an in-app-only
          // notification (easy to miss) was a real gap. Note: this call site already
          // separately emails a payment-link message above (lines ~180-210) when a Stripe
          // PaymentIntent exists; this second, plainer "you won" email still adds value when
          // no PaymentIntent was created (no-Stripe-account path) and as a redundant channel.
          true,
          `You won the auction for ${result.item.title}!`
        ).catch(err => console.warn('[auctionJob] Failed to create winner notification:', err));
      }

      if (result.item.sale?.organizer?.userId) {
        await createNotification(
          result.item.sale.organizer.userId,
          'AUCTION_CLOSED',
          'Auction Closed',
          `Your auction for ${result.item.title} has ended. Final bid: $${result.price?.toFixed(2) ?? '0.00'}`,
          `/items/${result.item.id}`,
          'OPERATIONAL'
        ).catch(err => console.warn('[auctionJob] Failed to create organizer notification:', err));
      }

      console.log(
        `Auction ended for item ${result.item.id}. Winner: user ${result.highestBid?.userId || 'none'}, $${result.price}. ` +
        `Payment: ${result.stripePaymentIntentId ? 'PENDING (intent created)' : 'PAID (no Stripe account)'}`
      );
      } catch (itemError) {
        // Per-item isolation: one broken auction (e.g. a $transaction failure on a
        // single row) must not silently swallow the failure the way the outer catch
        // used to — log it per-item and move on to the next auction in the batch.
        console.error(`[auctionJob] Failed to process auction for item ${item.id}:`, itemError);
      }
    }
  } catch (error) {
    console.error('Error in auction end job:', error);
    throw error;
  }
};


// Run every 5 minutes — checks for auctions that have passed their end time
cron.schedule('*/5 * * * *', cronGuard({ jobName: 'auctionJob' }, endAuctions));
