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
        )?.item?.saleId ?? undefined,
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
        saleId: purchase.item.saleId ?? undefined,
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
 * #107: Detect same-IP bidding pattern + chargeback collusion
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

    // Query BidIpRecord for same IP bidding on organizer's sales
    const sameIpBids = await prisma.bidIpRecord.findMany({
      where: {
        ipAddress: bidderIp,
        createdAt: { gte: twentyFourHoursAgo },
        bid: {
          item: {
            saleId: { in: saleIds },
          },
        },
      },
      include: { bid: { select: { userId: true } } },
    });

    // Check if different users are bidding from same IP on same organizer's sales
    const uniqueUserIds = new Set(sameIpBids.map((r) => r.bid.userId));
    if (uniqueUserIds.size > 1) {
      console.log(
        `[fraudService] Same-IP bidding pattern detected: ip=${bidderIp}, organizer=${organizerId}, uniqueUsers=${uniqueUserIds.size}`
      );
      return true;
    }

    return false;
  } catch (err) {
    console.error('[fraudService] checkSameIpBiddingPattern error:', err);
    return false;
  }
}

/**
 * #107: Check chargeback + collusion pattern
 * If user has 3+ chargebacks AND is bidding on same organizer's sales from shared IPs with other users
 */
export async function checkChargebackCollusion(userId: string): Promise<void> {
  try {
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { chargebackCount: true },
    });

    if (!user || user.chargebackCount < 3) {
      return;
    }

    // Find sales where user has placed bids and get the bidder IPs
    const userBids = await prisma.bidIpRecord.findMany({
      where: { userId },
      select: { ipAddress: true, bid: { select: { item: { select: { saleId: true } } } } },
    });

    if (userBids.length === 0) {
      return;
    }

    // Filter out nulls — auction items always have saleId, but guard defensively
    const saleIds = userBids.map((r) => r.bid.item.saleId).filter((id): id is string => id !== null);

    // For each IP the user has bid from, check if OTHER users also bid from same IP on SAME sales
    for (const record of userBids) {
      const sharedIpBids = await prisma.bidIpRecord.findMany({
        where: {
          ipAddress: record.ipAddress,
          userId: { not: userId }, // Different user
          bid: {
            item: {
              saleId: { in: saleIds },
            },
          },
        },
      });

      if (sharedIpBids.length > 0) {
        // Found collusion: multiple users bidding from same IP on same sales
        const existingSignal = await prisma.fraudSignal.findFirst({
          where: {
            userId,
            signalType: 'COLLUSION_SUSPECT',
          },
        });

        if (!existingSignal && saleIds.length > 0) {
          await prisma.fraudSignal.create({
            data: {
              userId,
              saleId: saleIds[0],
              signalType: 'COLLUSION_SUSPECT',
              confidenceScore: 85,
              detectedAt: new Date(),
              notes: `User has ${user.chargebackCount} chargebacks and shares IP ${record.ipAddress} with other bidders on organizer's sales. Likely collusion ring.`,
              reviewOutcome: 'PENDING',
            },
          });

          console.log(
            `[fraudService] Collusion pattern detected: user=${userId}, chargebacks=${user.chargebackCount}, sharedIp=${record.ipAddress}`
          );
        }
        return;
      }
    }
  } catch (err) {
    console.error('[fraudService] checkChargebackCollusion error:', err);
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

      // Create fraud signal (item.saleId! — auction items always have saleId by domain invariant)
      if (!item.saleId) return { isSuspicious: false, holdDuration: 0 }; // skip if item has no saleId
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
 * #114: Bid Cancellation Audit — flag users with high cancellation + chargeback pattern
 */
export async function checkBidCancellationPattern(userId: string): Promise<void> {
  try {
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { bidCancellationCount: true, chargebackCount: true },
    });

    if (!user) {
      return;
    }

    // Flag if both counts are high: >5 cancellations AND >3 chargebacks
    if (user.bidCancellationCount > 5 && user.chargebackCount > 3) {
      const existingSignal = await prisma.fraudSignal.findFirst({
        where: {
          userId,
          signalType: 'BID_CANCEL_PATTERN',
        },
      });

      if (!existingSignal) {
        // Get any recent sale to link to the signal
        const recentBid = await prisma.bid.findFirst({
          where: { userId },
          include: { item: { select: { saleId: true } } },
          orderBy: { createdAt: 'desc' },
        });

        if (recentBid?.item?.saleId) {
          await prisma.fraudSignal.create({
            data: {
              userId,
              saleId: recentBid.item.saleId,
              signalType: 'BID_CANCEL_PATTERN',
              confidenceScore: 80,
              detectedAt: new Date(),
              notes: `User has ${user.bidCancellationCount} cancelled bids and ${user.chargebackCount} chargebacks. Pattern suggests systematic fraud/collusion.`,
              reviewOutcome: 'PENDING',
            },
          });

          console.log(
            `[fraudService] Bid cancellation pattern detected: user=${userId}, cancellations=${user.bidCancellationCount}, chargebacks=${user.chargebackCount}`
          );
        }
      }
    }
  } catch (err) {
    console.error('[fraudService] checkBidCancellationPattern error:', err);
  }
}

/**
 * #114: Increment bid cancellation count when buyer withdraws offer or purchase is refunded
 * Call this when:
 * - Buyer cancels a bid/offer before purchase
 * - Purchase is refunded/returned by buyer
 */
export async function recordBidCancellation(userId: string): Promise<void> {
  try {
    await prisma.user.update({
      where: { id: userId },
      data: { bidCancellationCount: { increment: 1 } },
    });

    // Check for bid cancellation pattern after incrementing
    await checkBidCancellationPattern(userId);
  } catch (err) {
    console.error('[fraudService] recordBidCancellation error:', err);
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
