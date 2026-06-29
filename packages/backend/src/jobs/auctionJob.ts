import cron from 'node-cron';
import { getStripe } from '../utils/stripe';
import { cronGuard } from '../utils/cronGuard';
import { prisma } from '../lib/prisma';
import { awardXp, applyHuntPassMultiplier, XP_AWARDS, checkMonthlyXpCap } from '../services/xpService'; // Explorer's Guild XP awards
import { emailService } from '../lib/emailService';
import { suppressionService } from '../services/suppressionService';
import { createNotification } from '../services/notificationService';
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
      // P0 Race Fix: Wrap entire auction close logic in transaction with optimistic lock
      const result = await prisma.$transaction(async (tx) => {
        // 1. Atomic update with WHERE-clause guard: only process if not already closed
        const updated = await tx.item.updateMany({
          where: {
            id: item.id,
            status: 'AVAILABLE',
            auctionEndTime: { not: null, lt: new Date() }
          },
          data: { status: 'AUCTION_ENDED' } // Mark as processing
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

        const currentItem = await tx.item.findUnique({
          where: { id: item.id },
          include: { sale: { include: { organizer: { select: { stripeConnectId: true, userId: true } } } } }
        });

        if (!currentItem) return null;

        const price = highestBid?.amount ?? 0;

        // Pass 1: Reserve price check
        const reserveMet = !currentItem.auctionReservePrice || price >= currentItem.auctionReservePrice;
        if (!reserveMet) {
          // Update to AUCTION_ENDED without payment (reserve not met)
          await tx.item.update({
            where: { id: currentItem.id },
            data: { auctionClosed: true },
          });
          console.log(
            `Auction ended for item ${currentItem.id} (reserve not met). Highest bid: $${price.toFixed(2)}, Reserve: $${currentItem.auctionReservePrice?.toFixed(2) || 'N/A'}`
          );
          return { status: 'RESERVE_NOT_MET', item: currentItem };
        }

        // Reserve met: update item and prepare payment
        await tx.item.update({
          where: { id: currentItem.id },
          data: { currentBid: price, auctionClosed: true },
        });

        // QA: Fee rate now read from FeeStructure table at transaction time
        const feeStructure = await tx.feeStructure.findFirst({ where: { listingType: '*' } });
        const feePercent = feeStructure?.feeRate ?? 0.10; // Default to 10% if no FeeStructure row found

        let stripePaymentIntentId: string | null = null;

        if (currentItem.sale!.organizer.stripeConnectId && highestBid) {
          try {
            const feeAmount = Math.round(price * 100 * feePercent);
            const paymentIntent = await stripe().paymentIntents.create({
              amount: Math.round(price * 100),
              currency: 'usd',
              metadata: { itemId: currentItem.id, saleId: currentItem.sale!.id, userId: highestBid.userId },
              application_fee_amount: feeAmount,
              on_behalf_of: currentItem.sale!.organizer.stripeConnectId,
              transfer_data: { destination: currentItem.sale!.organizer.stripeConnectId },
            }, { idempotencyKey: `auction-pi-${currentItem.id}` });
            stripePaymentIntentId = paymentIntent.id;
          } catch (err) {
            console.error(`Stripe PaymentIntent creation failed for item ${currentItem.id}:`, err);
          }
        } else if (!currentItem.sale!.organizer.stripeConnectId) {
          console.warn(`Organizer for item ${currentItem.id} has no Stripe account — skipping payment intent`);
        }

        const platformFeeAmount = Math.round(price * 100 * feePercent) / 100;
        if (highestBid) {
          await tx.purchase.create({
            data: {
              userId: highestBid.userId,
              itemId: currentItem.id,
              saleId: currentItem.sale!.id,
              amount: price,
              platformFeeAmount,
              stripePaymentIntentId,
              // Only mark PAID when there's no Stripe (organizer not onboarded)
              status: stripePaymentIntentId ? 'PENDING' : 'PAID',
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
            await awardXp(result.highestBid.userId, 'AUCTION_WIN', xpToAward, { itemId: result.item.id, saleId: result.item.sale!.id });
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
                    <h2>Congratulations — you won the auction!</h2>
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
          'OPERATIONAL'
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
    }
  } catch (error) {
    console.error('Error in auction end job:', error);
  }
};


// Run every 5 minutes — checks for auctions that have passed their end time
cron.schedule('*/5 * * * *', cronGuard({ jobName: 'auctionJob' }, endAuctions));
