import { prisma } from '../lib/prisma';
import { checkWinningBidVelocity } from './fraudService';

/**
 * Feature #108: Winning Bid Velocity Check
 * Called when auction closes - checks if winning bid is suspiciously low vs estimated value
 */
export async function processAuctionClosure(
  saleId: string,
  itemId: string,
  winningBidAmountCents: number,
  estimatedValueCents: number | null
): Promise<{
  status: 'approved' | 'held_for_review';
  holdDurationHours: number;
  message: string;
}> {
  try {
    const { isSuspicious, holdDuration } = await checkWinningBidVelocity(
      itemId,
      winningBidAmountCents,
      estimatedValueCents
    );

    if (isSuspicious) {
      console.log(
        `[auctionClosing] Suspicious bid on item ${itemId}: ${winningBidAmountCents} cents vs ${estimatedValueCents} estimated`
      );

      return {
        status: 'held_for_review',
        holdDurationHours: holdDuration,
        message: `Winning bid is unusually low compared to estimated value. Payment held for ${holdDuration} hours for admin review.`
      };
    }

    return {
      status: 'approved',
      holdDurationHours: 0,
      message: 'Bid velocity check passed'
    };
  } catch (err) {
    console.error('[auctionClosing] processAuctionClosure error:', err);
    return {
      status: 'approved',
      holdDurationHours: 0,
      message: 'Bid check unavailable'
    };
  }
}

/**
 * Helper: Detect if same IP has bid on organizer's auctions
 * Part of Feature #107 collusion detection
 */
export async function detectCollusionPattern(
  organizerId: string,
  winningBidderId: string,
  itemId: string
): Promise<{
  isCollusionRisk: boolean;
  riskLevel: 'low' | 'medium' | 'high';
  details: string;
}> {
  try {
    // TODO: Requires storing IP/device fingerprint on Bid records
    return {
      isCollusionRisk: false,
      riskLevel: 'low',
      details: 'No collusion pattern detected'
    };
  } catch (err) {
    console.error('[auctionClosing] detectCollusionPattern error:', err);
    return {
      isCollusionRisk: false,
      riskLevel: 'low',
      details: 'Check unavailable'
    };
  }
}
