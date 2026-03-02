import { PrismaClient } from '@prisma/client';
import { getStripe } from '../utils/stripe';
import { Resend } from 'resend';

const prisma = new PrismaClient();
const stripe = getStripe();

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
        const price =
          typeof highestBid.amount === 'number'
            ? highestBid.amount
            : parseFloat(highestBid.amount.toString());

        // Mark as AUCTION_ENDED — switches to SOLD only once Stripe webhook confirms payment
        await prisma.item.update({
          where: { id: item.id },
          data: { status: 'AUCTION_ENDED', currentBid: price },
        });

        let stripePaymentIntentId: string | null = null;

        if (item.sale.organizer.stripeConnectId) {
          try {
            const feeAmount = Math.round(price * 100 * 0.07);
            const paymentIntent = await stripe.paymentIntents.create({
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
          console.warn(`Organizer for item ${item.id} has no Stripe account — skipping payment intent`);
        }

        const platformFeeAmount = Math.round(price * 100 * 0.07) / 100;
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

        // Email the winner with a payment link
        if (stripePaymentIntentId && highestBid.user?.email) {
          const resend = getResendClient();
          if (resend) {
            const fromEmail = process.env.RESEND_FROM_EMAIL || 'receipts@salescout.app';
            const payUrl = `${process.env.FRONTEND_URL || 'https://salescout.app'}/shopper/purchases`;
            try {
              await resend.emails.send({
                from: fromEmail,
                to: highestBid.user.email,
                subject: `You won: ${item.title}`,
                html: `
                  <div style="font-family:sans-serif;max-width:600px;margin:0 auto">
                    <h2>Congratulations — you won the auction!</h2>
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
