import { prisma } from '../index';
import { stripe } from '../lib/stripe';
import { createNotification } from './notificationService';

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
        sale: { include: { organizer: { select: { userId: true, stripeCustomerId: true } } } },
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

    const highestBid = item.bids[0];
    const organizerId = item.sale.organizer.userId;

    if (!highestBid) {
      // No bids — just mark closed and notify organizer
      await prisma.item.update({
        where: { id: itemId },
        data: { auctionClosed: true }
      });

      await createNotification(
        organizerId,
        'AUCTION_CLOSED',
        `Auction closed with no bids`,
        `The auction for "${item.title}" ended with no bids.`,
        `/organizer/sales/${item.saleId}`,
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

    // 5% buyer premium
    const buyerPremium = bidAmount * 0.05;
    const totalAmount = bidAmount + buyerPremium;
    const amountInCents = Math.round(totalAmount * 100);

    // Create Stripe checkout session
    let checkoutUrl: string | null = null;
    try {
      const session = await stripe().checkout.sessions.create({
        payment_method_types: ['card'],
        mode: 'payment',
        customer_email: winnerEmail,
        line_items: [
          {
            price_data: {
              currency: 'usd',
              product_data: {
                name: `Auction Winner Payment - ${item.title}`,
                description: `Winning bid: $${bidAmount.toFixed(2)} + 5% buyer premium`
              },
              unit_amount: amountInCents
            },
            quantity: 1
          }
        ],
        success_url: `${process.env.FRONTEND_URL || 'https://finda.sale'}/purchase/success?sessionId={CHECKOUT_SESSION_ID}`,
        cancel_url: `${process.env.FRONTEND_URL || 'https://finda.sale'}/sales/${item.saleId}`,
        metadata: {
          itemId: item.id,
          winnerId: winnerId,
          saleId: item.saleId,
          type: 'AUCTION_WINNER'
        }
      });

      checkoutUrl = session.url;
    } catch (stripeErr) {
      console.error(`[auction] Stripe checkout creation failed for item ${itemId}:`, stripeErr);
      // Continue anyway — notify winner of failure
    }

    // Mark item as SOLD and auctionClosed
    await prisma.item.update({
      where: { id: itemId },
      data: {
        auctionClosed: true,
        status: 'SOLD'
      }
    });

    // Notify winner
    const checkoutCta = checkoutUrl ? `Complete your purchase: ${checkoutUrl}` : 'Contact the organizer to complete payment.';
    await createNotification(
      winnerId,
      'AUCTION_WON',
      `You won "${item.title}"!`,
      `Congratulations! You won the auction with a bid of $${bidAmount.toFixed(2)}. ${checkoutCta}`,
      checkoutUrl || `/sales/${item.saleId}`,
      'OPERATIONAL'
    );

    // Notify organizer
    await createNotification(
      organizerId,
      'AUCTION_CLOSED',
      `Auction closed: "${item.title}" sold`,
      `Winner: ${winnerName} (${winnerEmail}) - Final bid: $${bidAmount.toFixed(2)}. Payment link sent.`,
      `/organizer/sales/${item.saleId}`,
      'OPERATIONAL'
    );

    console.log(`[auction] Item ${itemId} closed successfully. Winner: ${winnerId}, Bid: $${bidAmount.toFixed(2)}`);
  } catch (error) {
    console.error(`[auction] Error closing auction for item ${itemId}:`, error);
    // Graceful degradation — log but don't throw
  }
}
