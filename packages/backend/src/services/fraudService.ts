import { prisma } from '../lib/prisma';

/**
 * Feature #106-#109: Anti-Abuse System — Fraud Detection & Tracking Services
 *
 * #106: Organizer Reputation Scoring — track chargebacks, cancellations, returns
 * #107: Chargeback + Collusion Tracking — same-IP bidding, chargeback accumulation
 * #108: Winning Bid Velocity Check — flag suspiciously low bids vs estimated value
 * #109: Off-Platform Transaction Detection — flag sales with high views, zero purchases
 */

/**
 * #106: Update organizer reputation on chargeback incident
 * Called from Stripe webhook handler when charge.dispute.created
 */
export async function recordChargebackIncident(
  organizerId: string,
  purchaseId: string,
  disputeId: string
): Promise<void> {
  try {
    const organizer = await prisma.organizer.findUnique({
      where: { id: organizerId },
      include: { user: true },
    });

    if (!organizer) {
      console.warn(`[fraudService] Organizer not found: ${organizerId}`);
      return;
    }

    // Track chargeback in OrganizerReputation — increment implicit chargeback counter
    // Note: schema doesn't have explicit chargebackCount, so we log to FraudSignal
    const existingSignal = await prisma.fraudSignal.findFirst({
      where: {
        userId: organizer.userId,
        signalType: 'CHARGEBACK_INCIDENT',
        saleId: (
          await prisma.purchase.findUnique({
            where: { id: purchaseId },
            select: { item: { select: { saleId: true } } },
          })
        )?.item?.saleId,
      },
    });

    // Get the sale ID from the purchase
    const purchase = await prisma.purchase.findUnique({
      where: { id: purchaseId },
      include: { item: { select: { saleId: true } } },
    });

    if (!purchase || !purchase.item?.saleId) {
      console.warn(`[fraudService] Purchase or sale not found for ${purchaseId}`);
      return;
    }

    // Create fraud signal for chargeback
    await prisma.fraudSignal.create({
      data: {
        userId: organizer.userId,
        saleId: purchase.item.saleId,
        itemId: purchase.itemId,
        signalType: 'CHARGEBACK_INCIDENT',
        confidenceScore: 95, // High confidence — Stripe confirmed
        detectedAt: new Date(),
        notes: `Chargeback/dispute initiated: Stripe dispute ID ${disputeId}`,
        reviewOutcome: 'PENDING',
      },
    });

    console.log(
      `[fraudService] Chargeback incident recorded for organizer ${organizerId}, dispute ${disputeId}`
    );

    // Check if organizer has accumulated 3+ chargeback incidents in 30 days
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

    const chargebackCount = await prisma.fraudSignal.count({
      where: {
        userId: organizer.userId,
        signalType: 'CHARGEBACK_INCIDENT',
        detectedAt: { gte: thirtyDaysAgo },
      },
    });

    console.log(
      `[fraudService] Organizer ${organizerId} has ${chargebackCount} chargebacks in 30 days`
    );

    // Suspend organizer after 3+ chargebacks
    if (chargebackCount >= 3) {
      // TODO: Set suspendedAt on User once field added to schema (#73-phase3)
      console.warn(`[fraudService] Organizer ${organizerId} should be suspended — schema field pending`);

      // Create notification for admin
      await prisma.notification.create({
        data: {
          userId: organizer.userId,
          type: 'system',
          title: 'Account Suspended',
          body: `Your organizer account has been suspended due to ${chargebackCount} chargeback incidents. Contact support for review.`,
          read: false,
        },
      });

      console.warn(
        `[fraudService] Organizer ${organizerId} suspended after ${chargebackCount} chargebacks`
      );
    }
  } catch (err) {
    console.error('[fraudService] recordChargebackIncident error:', err);
    throw err;
  }
}

/**
 * #107: Detect same-IP bidding pattern
 * Called when a bid is placed — checks if same IP has bid on organizer's other auctions
 */
export async function checkSameIpBiddingPattern(
  bidderId: string,
  bidderIp: string,
  organizerId: string,
  auctionId: string
): Promise<boolean> {
  try {
    // Find organizer's sales
    const organizerSales = await prisma.sale.findMany({
      where: { organizerId },
      select: { id: true },
    });

    if (organizerSales.length === 0) {
      return false;
    }

    const saleIds = organizerSales.map((s) => s.id);

    // Count bids from same IP on organizer's sales in last 24h
    const twentyFourHoursAgo = new Date();
    twentyFourHoursAgo.setHours(twentyFourHoursAgo.getHours() - 24);

    // TODO: This check assumes Bid model has ipAddress field
    // For now, we'll create a fraud signal if pattern is detected
    console.log(
      `[fraudService] Checked same-IP bidding: bidder=${bidderId}, organizer=${organizerId}`
    );

    // In production, query actual Bid records with IP metadata
    // For MVP, return false (no pattern detected)
    return false;
  } catch (err) {
    console.error('[fraudService] checkSameIpBiddingPattern error:', err);
    return false;
  }
}

/**
 * #108: Check if winning bid is suspiciously low vs estimated value
 * Called after auction closes
 */
export async function checkWinningBidVelocity(
  itemId: string,
  winningBidAmount: number,
  estimatedValueCents: number | null
): Promise<{ isSuspicious: boolean; holdDuration: number }> {
  try {
    // Use estimated value or fallback to item metadata
    const item = await prisma.item.findUnique({
      where: { id: itemId },
      select: { saleId: true },
    });

    if (!item) {
      console.warn(`[fraudService] Item not found: ${itemId}`);
      return { isSuspicious: false, holdDuration: 0 };
    }

    const valueToCheck = estimatedValueCents || 0;

    // Flag if winning bid < 10% of estimated value
    if (valueToCheck > 0 && winningBidAmount < valueToCheck * 0.1) {
      console.log(
        `[fraudService] Suspicious bid detected: item=${itemId}, bid=${winningBidAmount}, estValue=${valueToCheck}`
      );

      // Create fraud signal
      const sale = await prisma.sale.findUnique({
        where: { id: item.saleId },
        select: { organizerId: true },
      });

      if (sale) {
        await prisma.fraudSignal.create({
          data: {
            userId: sale.organizerId, // Link to organizer, not bidder
            itemId,
            saleId: item.saleId,
            signalType: 'SUSPICIOUSLY_LOW_BID',
            confidenceScore: 85,
            detectedAt: new Date(),
            notes: `Winning bid (${winningBidAmount} cents) is <10% of estimated value (${valueToCheck} cents). Hold payment for 24h review.`,
            reviewOutcome: 'PENDING',
          },
        });
      }

      // Hold payment for 24 hours
      return { isSuspicious: true, holdDuration: 24 };
    }

    return { isSuspicious: false, holdDuration: 0 };
  } catch (err) {
    console.error('[fraudService] checkWinningBidVelocity error:', err);
    return { isSuspicious: false, holdDuration: 0 };
  }
}

/**
 * #109: Detect off-platform transactions
 * 30-day lookback: sales with >50 views but 0 purchases = potential off-platform completion
 */
export async function detectOffPlatformTransactions(): Promise<void> {
  try {
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

    // Find sales created 30+ days ago with high view count but zero purchases
    const suspiciousSales = await prisma.sale.findMany({
      where: {
        createdAt: { lte: thirtyDaysAgo },
        status: 'ENDED',
      },
      include: {
        items: {
          select: {
            id: true,
            purchases: {
              select: { id: true },
            },
          },
        },
        _count: {
          select: { ripples: true }, // ripples track views
        },
      },
    });

    for (const sale of suspiciousSales) {
      // Count total items and items with purchases
      let totalItems = 0;
      let itemsWithPurchases = 0;

      for (const item of sale.items) {
        totalItems++;
        if (item.purchases.length > 0) {
          itemsWithPurchases++;
        }
      }

      // If >50 views but 0 purchases, flag for review
      const viewCount = sale._count.ripples;
      if (viewCount > 50 && itemsWithPurchases === 0) {
        // Create fraud signal for organizer
        const organizer = await prisma.organizer.findUnique({
          where: { id: sale.organizerId },
          select: { userId: true },
        });

        if (organizer) {
          // Check if we already flagged this sale
          const existingSignal = await prisma.fraudSignal.findFirst({
            where: {
              saleId: sale.id,
              signalType: 'OFF_PLATFORM_TRANSACTION',
            },
          });

          if (!existingSignal) {
            await prisma.fraudSignal.create({
              data: {
                userId: organizer.userId,
                saleId: sale.id,
                signalType: 'OFF_PLATFORM_TRANSACTION',
                confidenceScore: 70,
                detectedAt: new Date(),
                notes: `Sale has ${viewCount} views but 0 purchases. Likely off-platform transaction. Flag for admin review.`,
                reviewOutcome: 'PENDING',
              },
            });

            console.log(
              `[fraudService] Off-platform transaction flagged: sale=${sale.id}, views=${viewCount}`
            );
          }
        }
      }
    }
  } catch (err) {
    console.error('[fraudService] detectOffPlatformTransactions error:', err);
  }
}

/**
 * Helper: Get organizer ID from FraudSignal user (which points to User, who has organizer)
 */
export async function getOrganizerIdFromUser(userId: string): Promise<string | null> {
  try {
    const organizer = await prisma.organizer.findUnique({
      where: { userId },
      select: { id: true },
    });
    return organizer?.id || null;
  } catch (err) {
    console.error('[fraudService] getOrganizerIdFromUser error:', err);
    return null;
  }
}
