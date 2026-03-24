import cron from 'node-cron';
import { getStripe } from '../utils/stripe';
import { Resend } from 'resend';
import { prisma } from '../lib/prisma';
import { awardXp, XP_AWARDS } from '../services/xpService'; // Explorer's Guild XP awards
const stripe = () => getStripe();

let _resend: any = null;
const getResendClient = () => {
  if (!_resend && process.env.RESEND_API_KEY) {
    try { _resend = new Resend(process.env.RESEND_API_KEY); } catch { _resend = null; }
  }
  return _resend;
};

export const endAuctions = async () => {
  try {
    console.log('Running auction end job...');

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
            organizer: { select: { stripeConnectId: true } }
          }
        },
      },
    });

    console.log(`Found ${endedAuctions.length} auctions to process`);

    for (const item of endedAuctions) {
      const highestBid = await prisma.bid.findFirst({
        where: { itemId: item.id },
        orderBy: { amount: 'desc' },
        include: { user: { select: { email: true } } },
      });

      if (highestBid) {
        const price = highestBid.amount; // Bid.amount is Float \u2192 always number

        // Mark as AUCTION_ENDED \u2014 switches to SOLD only once Stripe webhook confirms payment
        await prisma.item.update({
          where: { id: item.id },
          data: { status: 'AUCTION_ENDED', currentBid: price },
        });

        // QA: Fee rate now read from FeeStructure table at transaction time
        const feeStructure = await prisma.feeStructure.findFirst({ where: { listingType: '*' } });
        const feePercent = feeStructure?.feeRate ?? 0.10; // Default to 10% if no FeeStructure row found

        let stripePaymentIntentId: string | null = null;

        if (item.sale.organizer.stripeConnectId) {
          try {
            const feeAmount = Math.round(price * 100 * feePercent);
            const paymentIntent = await stripe().paymentIntents.create({
              amount: Math.round(price * 100),
              currency: 'usd',
              metadata: { itemId: item.id, saleId: item.sale.id, userId: highestBid.userId },
              application_fee_amount: feeAmount,
              on_behalf_of: item.sale.organizer.stripeConnectId,
              transfer_data: { destination: item.sale.organizer.stripeConnectId },
            });
            stripePaymentIntentId = paymentIntent.id;
          } catch (err) {
            console.error(`Stripe PaymentIntent creation failed for item ${item.id}:`, err);
          }
        } else {
          console.warn(`Organizer for item ${item.id} has no Stripe account \u2014 skipping payment intent`);
        }

        const platformFeeAmount = Math.round(price * 100 * feePercent) / 100;
        await prisma.purchase.create({
          data: {
            userId: highestBid.userId,
            itemId: item.id,
            saleId: item.sale.id,
            amount: price,
            platformFeeAmount,
            stripePaymentIntentId,
            // Only mark PAID when there's no Stripe (organizer not onboarded)
            status: stripePaymentIntentId ? 'PENDING' : 'PAID',
          },
        });

        // Award XP to shopper for winning auction (base + value bonus)
        const valueBonus = Math.min(
          Math.floor((price / 100) * XP_AWARDS.AUCTION_VALUE_BONUS_PER_100),
          XP_AWARDS.AUCTION_MAX_BONUS
        );
        const totalXp = XP_AWARDS.AUCTION_WIN + valueBonus;
        awardXp(highestBid.userId, 'AUCTION_WIN', totalXp, { itemId: item.id, saleId: item.sale.id }).catch(err =>
          console.error('[XP] Failed to award XP for auction win:', err)
        );

        // Email the winner with a payment link
        if (stripePaymentIntentId && highestBid.user?.email) {
          const resend = getResendClient();
          if (resend) {
            const fromEmail = process.env.RESEND_FROM_EMAIL || 'receipts@finda.sale';
            const payUrl = `${process.env.FRONTEND_URL || 'https://finda.sale'}/shopper/purchases`;
            try {
              await resend.emails.send({
                from: fromEmail,
                to: highestBid.user.email,
                subject: `You won: ${item.title}`,
                html: `
                  <div style="font-family:sans-serif;max-width:600px;margin:0 auto">
                    <h2>Congratulations \u2014 you won the auction!</h2>
                    <p>Your winning bid of <strong>$${price.toFixed(2)}</strong> was accepted for <strong>${item.title}</strong>.</p>
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

        console.log(
          `Auction ended for item ${item.id}. Winner: user ${highestBid.userId}, $${price}. ` +
          `Payment: ${stripePaymentIntentId ? 'PENDING (intent created)' : 'PAID (no Stripe account)'}`
        );
      } else {
        await prisma.item.update({
          where: { id: item.id },
          data: { status: 'AUCTION_ENDED' },
        });
        console.log(`Auction ended for item ${item.id} with no bids`);
      }
    }
  } catch (error) {
    console.error('Error in auction end job:', error);
  }
};


// Run every 5 minutes \u2014 checks for auctions that have passed their end time
cron.schedule('*/5 * * * *', endAuctions);
