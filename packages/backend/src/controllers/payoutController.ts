// V2: Instant payouts — balance, triggered payouts, and payout schedule management
// Feature #9: getEarningsBreakdown — item-level fee transparency
import { Response } from 'express';
import { getStripe } from '../utils/stripe';
import { AuthRequest } from '../middleware/auth';
import { prisma } from '../lib/prisma';
import { getPlatformFeeRate, resolveOrganizerFeeReport } from '../utils/feeCalculator';

/** Retrieve the organizer's Stripe Connect account ID, or null if not yet linked */
const getOrganizerStripeId = async (userId: string): Promise<string | null> => {
  const organizer = await prisma.organizer.findUnique({
    where: { userId },
    select: { stripeConnectId: true },
  });
  return organizer?.stripeConnectId ?? null;
};

/**
 * GET /api/stripe/balance
 * Returns the organizer's Stripe Connect available + pending balance in USD.
 */
export const getBalance = async (req: AuthRequest, res: Response) => {
  try {
    const hasOrganizerRole = req.user?.roles?.includes('ORGANIZER') || req.user?.role === 'ORGANIZER';
    if (!req.user || !hasOrganizerRole) {
      return res.status(403).json({ message: 'Organizer access required' });
    }

    const connectId = await getOrganizerStripeId(req.user.id);
    if (!connectId) {
      return res.status(400).json({ message: 'Stripe account not connected. Complete onboarding first.' });
    }

    const stripe = getStripe();
    const balance = await stripe.balance.retrieve({ stripeAccount: connectId });

    const usdAvailable = balance.available.find(b => b.currency === 'usd');
    const usdPending = balance.pending.find(b => b.currency === 'usd');

    res.json({
      available: (usdAvailable?.amount ?? 0) / 100,
      pending: (usdPending?.amount ?? 0) / 100,
    });
  } catch (error) {
    console.error('getBalance error:', error);
    res.status(500).json({ message: 'Failed to retrieve balance' });
  }
};

/**
 * GET /api/stripe/payout-schedule
 * Returns the organizer's current payout schedule setting.
 */
export const getPayoutSchedule = async (req: AuthRequest, res: Response) => {
  try {
    const hasOrganizerRole = req.user?.roles?.includes('ORGANIZER') || req.user?.role === 'ORGANIZER';
    if (!req.user || !hasOrganizerRole) {
      return res.status(403).json({ message: 'Organizer access required' });
    }

    const connectId = await getOrganizerStripeId(req.user.id);
    if (!connectId) {
      return res.status(400).json({ message: 'Stripe account not connected' });
    }

    const stripe = getStripe();
    const account = await stripe.accounts.retrieve(connectId);
    const schedule = account.settings?.payouts?.schedule;

    res.json({
      interval: schedule?.interval ?? 'daily',
      weeklyAnchor: (schedule as any)?.weekly_anchor ?? null,
      monthlyAnchor: (schedule as any)?.monthly_anchor ?? null,
    });
  } catch (error) {
    console.error('getPayoutSchedule error:', error);
    res.status(500).json({ message: 'Failed to retrieve payout schedule' });
  }
};

/**
 * PATCH /api/stripe/payout-schedule
 * Body: { interval: 'daily' | 'weekly' | 'monthly' | 'manual' }
 * Updates how often Stripe automatically sends funds to the organizer's bank.
 * 'manual' means no automatic payouts — organizer requests them via createPayout.
 */
export const updatePayoutSchedule = async (req: AuthRequest, res: Response) => {
  try {
    const hasOrganizerRole = req.user?.roles?.includes('ORGANIZER') || req.user?.role === 'ORGANIZER';
    if (!req.user || !hasOrganizerRole) {
      return res.status(403).json({ message: 'Organizer access required' });
    }

    const connectId = await getOrganizerStripeId(req.user.id);
    if (!connectId) {
      return res.status(400).json({ message: 'Stripe account not connected' });
    }

    const { interval } = req.body;
    const validIntervals = ['daily', 'weekly', 'monthly', 'manual'];
    if (!validIntervals.includes(interval)) {
      return res.status(400).json({ message: `interval must be one of: ${validIntervals.join(', ')}` });
    }

    const stripe = getStripe();
    const account = await stripe.accounts.update(connectId, {
      settings: {
        payouts: {
          schedule: { interval: interval as any },
        },
      },
    });

    const schedule = account.settings?.payouts?.schedule;
    res.json({
      interval: schedule?.interval,
      weeklyAnchor: (schedule as any)?.weekly_anchor ?? null,
    });
  } catch (error) {
    console.error('updatePayoutSchedule error:', error);
    res.status(500).json({ message: 'Failed to update payout schedule' });
  }
};

/**
 * POST /api/stripe/payout
 * Body: { amount: number (dollars), method?: 'standard' | 'instant' }
 * Triggers an on-demand payout from the organizer's Stripe Connect balance to their bank.
 * Automatically deducts any accumulated cash platform fees before the Stripe call.
 * 'instant' requires an eligible debit card external account; falls back gracefully if unsupported.
 */
export const createPayout = async (req: AuthRequest, res: Response) => {
  try {
    const hasOrganizerRole = req.user?.roles?.includes('ORGANIZER') || req.user?.role === 'ORGANIZER';
    if (!req.user || !hasOrganizerRole) {
      return res.status(403).json({ message: 'Organizer access required' });
    }

    const connectId = await getOrganizerStripeId(req.user.id);
    if (!connectId) {
      return res.status(400).json({ message: 'Stripe account not connected' });
    }

    const { amount, method = 'standard' } = req.body;
    if (typeof amount !== 'number' || amount <= 0) {
      return res.status(400).json({ message: 'amount must be a positive number (in dollars)' });
    }
    if (!['standard', 'instant'].includes(method)) {
      return res.status(400).json({ message: "method must be 'standard' or 'instant'" });
    }

    // Fetch organizer's accumulated cash fee balance
    const organizer = await prisma.organizer.findUnique({
      where: { userId: req.user.id },
      select: { cashFeeBalance: true, cashFeeBalanceUpdatedAt: true },
    });

    if (!organizer) {
      return res.status(404).json({ message: 'Organizer not found' });
    }

    // Check 30-day guardrail: advisory warning if balance > 0 and > 30 days old
    let guardrailWarning: string | null = null;
    if (organizer.cashFeeBalance > 0 && organizer.cashFeeBalanceUpdatedAt) {
      const daysSinceUpdate = (Date.now() - organizer.cashFeeBalanceUpdatedAt.getTime()) / (1000 * 60 * 60 * 24);
      if (daysSinceUpdate > 30) {
        guardrailWarning = `Your cash fee balance of $${organizer.cashFeeBalance.toFixed(2)} has been pending for ${Math.floor(daysSinceUpdate)} days.`;
      }
    }

    // Deduct cash fee balance from requested payout amount
    const payoutAmountAfterFees = amount - organizer.cashFeeBalance;

    if (payoutAmountAfterFees < 0.50) {
      // Payout would be below Stripe minimum after deducting fees
      return res.status(400).json({
        message: `Cash fees ($${organizer.cashFeeBalance.toFixed(2)}) exceed payout amount. Available balance after deduction: $${Math.max(0, payoutAmountAfterFees).toFixed(2)}.`,
        cashFeeDeduction: organizer.cashFeeBalance,
        originalAmount: amount,
      });
    }

    const stripe = getStripe();
    const payout = await stripe.payouts.create(
      {
        amount: Math.round(payoutAmountAfterFees * 100), // convert dollars → cents (net amount only)
        currency: 'usd',
        method: method as 'standard' | 'instant',
        statement_descriptor: 'FindA.Sale Payout',
      },
      { stripeAccount: connectId }
    );

    // After successful payout, reset the cash fee balance
    await prisma.organizer.update({
      where: { userId: req.user.id },
      data: {
        cashFeeBalance: 0,
        cashFeeBalanceUpdatedAt: new Date(),
      },
    });

    res.json({
      id: payout.id,
      amount: payout.amount / 100,
      method: payout.method,
      status: payout.status,
      // arrival_date is a Unix timestamp; convert to ISO for the frontend
      arrivalDate: payout.arrival_date
        ? new Date(payout.arrival_date * 1000).toISOString()
        : null,
      ...(guardrailWarning && { guardrailWarning }),
      cashFeeDeducted: organizer.cashFeeBalance,
    });
  } catch (error: any) {
    // Stripe specific codes for instant payout eligibility failures
    const instantUnsupported = [
      'instant_payouts_unsupported',
      'instant_payouts_limit_exceeded',
      'instant_payouts_currency_disabled',
    ];
    if (instantUnsupported.includes(error?.code)) {
      return res.status(400).json({
        message: 'Instant payouts are not available for this account. Try a standard payout instead.',
        code: error.code,
      });
    }
    // Insufficient balance
    if (error?.code === 'balance_insufficient') {
      return res.status(400).json({ message: 'Insufficient balance for this payout amount.', code: error.code });
    }
    console.error('createPayout error:', error);
    res.status(500).json({ message: 'Failed to create payout' });
  }
};

// ── Earnings Breakdown (Feature #9: Payout Transparency Dashboard) ────────────

const STRIPE_RATE = 0.029;
const STRIPE_FIXED = 0.30;

export interface EarningsBreakdownItem {
  purchaseId: string;
  itemId: string | null;
  itemTitle: string;
  itemCategory: string | null;
  saleId: string | null;
  saleTitle: string;
  saleDate: Date | null;
  purchaseDate: Date;
  salePrice: number;
  platformFee: number;
  stripeFee: number;
  netPayout: number;
  // ADR-110 Decision Flag 3: buyer's ship-to address for a native-checkout physical
  // shipment (only ever present on the requesting organizer's OWN sale -- whereClause
  // above already scopes every row in `purchases` to `sale.organizerId === organizer.id`).
  // Absent (undefined) for every purchase that didn't request shipping.
  shippingAddressLine1?: string | null;
  shippingAddressLine2?: string | null;
  shippingCity?: string | null;
  shippingState?: string | null;
  shippingZip?: string | null;
}

/**
 * GET /api/stripe/earnings?saleId=<optional>
 *
 * Returns an item-level payout breakdown for the organizer's PAID purchases,
 * showing gross sale price, platform fee, estimated Stripe fee, and net payout.
 * Also includes accumulated cash platform fees from POS sales.
 *
 * Stripe fee is estimated at 2.9% + $0.30. Actual fees may vary slightly.
 * Platform fee is tier-aware: 10% for SIMPLE, 8% for PRO/TEAMS (S388).
 */
export const getEarningsBreakdown = async (req: AuthRequest, res: Response) => {
  try {
    const hasOrganizerRole = req.user?.roles?.includes('ORGANIZER') || req.user?.role === 'ORGANIZER';
    if (!req.user || !hasOrganizerRole) {
      return res.status(403).json({ message: 'Organizer access required' });
    }

    const organizer = await prisma.organizer.findUnique({
      where: { userId: req.user.id },
    });
    if (!organizer) {
      return res.status(404).json({ message: 'Organizer not found' });
    }

    const { saleId } = req.query;

    const whereClause: {
      sale: { organizerId: string };
      status: string;
      saleId?: string;
    } = {
      sale: { organizerId: organizer.id },
      status: 'PAID',
    };
    if (saleId && typeof saleId === 'string') {
      whereClause.saleId = saleId;
    }

    const purchases = await prisma.purchase.findMany({
      where: whereClause,
      include: {
        // listingType + auctionStartPrice let resolveOrganizerFeeReport recognise an auction
        // and strip the buyer's 5% premium back out of Purchase.amount; sale.coversFee tells it
        // whether the organizer absorbed that premium instead of the buyer.
        item: { select: { id: true, title: true, category: true, listingType: true, auctionStartPrice: true } },
        sale: { select: { id: true, title: true, startDate: true, coversFee: true } },
      },
      orderBy: { createdAt: 'desc' },
      take: 100,
    });

    const items: EarningsBreakdownItem[] = purchases.map((p) => {
      const tierRate = getPlatformFeeRate(organizer.subscriptionTier as any);
      // TWO SEPARATE FEES (Patrick ruling, 2026-08-17 — see utils/feeCalculator.ts header).
      // The organizer's fee line is their COMMISSION ONLY: 10%/8% of the hammer or list price,
      // on auctions exactly as on any other sale. The auction buyer's 5% premium came out of
      // the WINNER's pocket, so it is stripped out of both the reported sale price and the fee.
      // A $200 win at SIMPLE reports $200.00 gross / $20.00 fee, and gross − fee − Stripe is
      // exactly what lands. (Reversal: an earlier pass the same day reported the stored
      // Purchase.platformFeeAmount here, which now holds the COMBINED premium + commission.)
      // `p` is a full Purchase row, so the fee-snapshot columns (buyerPremiumAmount /
      // commissionAmount / organizerAbsorbedPremium) come along without a select change.
      // resolveOrganizerFeeReport prefers them when present: a row charged while this organizer
      // was on SIMPLE keeps reporting its 10% fee after they upgrade to PRO, instead of being
      // silently restated at 8%. Pre-snapshot rows fall back to the recompute below.
      const { grossSalePrice: salePrice, platformFee } = resolveOrganizerFeeReport(p, tierRate);
      // Stripe's cut is charged on what the card was actually run for — the premium-inclusive
      // total — not on the reported hammer price.
      const stripeFee = parseFloat((p.amount * STRIPE_RATE + STRIPE_FIXED).toFixed(2));
      const netPayout = parseFloat((salePrice - platformFee - stripeFee).toFixed(2));

      return {
        purchaseId: p.id,
        itemId: p.item?.id ?? null,
        itemTitle: p.item?.title ?? 'Unknown item',
        itemCategory: (p.item as any)?.category ?? null,
        saleId: p.sale?.id ?? null,
        saleTitle: p.sale?.title ?? 'Unknown sale',
        saleDate: p.sale?.startDate ?? null,
        purchaseDate: p.createdAt,
        salePrice: parseFloat(salePrice.toFixed(2)),
        platformFee,
        stripeFee,
        netPayout,
        // ADR-110 Decision Flag 3: `p` is a full Purchase row (no `select` on the base
        // model above, same "comes along for free" pattern the fee-snapshot columns
        // already rely on in the comment above) -- only present when this purchase
        // actually requested native-checkout shipping.
        ...(p.shippingZip
          ? {
              shippingAddressLine1: p.shippingAddressLine1,
              shippingAddressLine2: p.shippingAddressLine2,
              shippingCity: p.shippingCity,
              shippingState: p.shippingState,
              shippingZip: p.shippingZip,
            }
          : {}),
      };
    });

    const totals = items.reduce(
      (acc, item) => {
        acc.grossRevenue += item.salePrice;
        acc.totalPlatformFees += item.platformFee;
        acc.totalStripeFees += item.stripeFee;
        acc.totalNetPayout += item.netPayout;
        return acc;
      },
      { grossRevenue: 0, totalPlatformFees: 0, totalStripeFees: 0, totalNetPayout: 0 }
    );

    res.json({
      items,
      totals: {
        grossRevenue: parseFloat(totals.grossRevenue.toFixed(2)),
        totalPlatformFees: parseFloat(totals.totalPlatformFees.toFixed(2)),
        totalStripeFees: parseFloat(totals.totalStripeFees.toFixed(2)),
        totalNetPayout: parseFloat(totals.totalNetPayout.toFixed(2)),
      },
      count: items.length,
      note: 'Stripe fee estimated at 2.9% + $0.30. Platform fee is 10% for SIMPLE, 8% for PRO/TEAMS, on every sale including auctions. On an auction the winning bidder also pays a separate buyer premium on top of their bid — 5% by default, or whatever rate you set on that sale. It comes out of their pocket, not yours, so it is not included in the sale price or fees shown here.',
      // Cash POS: accumulated fees awaiting payout deduction
      cashFeeBalance: organizer.cashFeeBalance,
      cashFeeBalanceUpdatedAt: organizer.cashFeeBalanceUpdatedAt,
    });
  } catch (error) {
    console.error('getEarningsBreakdown error:', error);
    res.status(500).json({ message: 'Failed to retrieve earnings breakdown' });
  }
};

export interface RefundHistoryItem {
  purchaseId: string;
  itemTitle: string;
  saleTitle: string;
  originalAmount: number;
  refundedAmount: number | null;
  refundedAt: Date | null;
  refundInitiatedBy: string | null;
}

/**
 * GET /api/stripe/refunds
 *
 * Refund History (2026-07-29): organizer-facing record of refunds against their own sales.
 * getEarningsBreakdown above hardcodes `status: 'PAID'`, so a refunded purchase (Purchase.
 * status flips PAID -> REFUNDED in refundService.ts's executeVerifiedRefund) silently
 * disappears from that table with zero trace anywhere else in the product — this endpoint is
 * that trace. Same organizer-role-check + ownership pattern as getEarningsBreakdown.
 */
export const getRefundHistory = async (req: AuthRequest, res: Response) => {
  try {
    const hasOrganizerRole = req.user?.roles?.includes('ORGANIZER') || req.user?.role === 'ORGANIZER';
    if (!req.user || !hasOrganizerRole) {
      return res.status(403).json({ message: 'Organizer access required' });
    }

    const organizer = await prisma.organizer.findUnique({
      where: { userId: req.user.id },
    });
    if (!organizer) {
      return res.status(404).json({ message: 'Organizer not found' });
    }

    const purchases = await prisma.purchase.findMany({
      where: {
        sale: { organizerId: organizer.id },
        status: 'REFUNDED',
      },
      include: {
        item: { select: { title: true } },
        sale: { select: { title: true } },
      },
      // nulls: 'last' (Prisma 5, no preview flag needed) — any REFUNDED purchase that
      // predates this migration has refundedAt = NULL (never backfilled) and must not sort
      // ahead of every genuinely-dated refund under a naive desc sort.
      orderBy: { refundedAt: { sort: 'desc', nulls: 'last' } },
      take: 100,
    });

    const items: RefundHistoryItem[] = purchases.map((p) => ({
      purchaseId: p.id,
      itemTitle: p.item?.title ?? 'Unknown item',
      saleTitle: p.sale?.title ?? 'Unknown sale',
      originalAmount: p.amount,
      refundedAmount: p.refundedAmount,
      refundedAt: p.refundedAt,
      refundInitiatedBy: p.refundInitiatedBy,
    }));

    res.json({
      items,
      count: items.length,
    });
  } catch (error) {
    console.error('getRefundHistory error:', error);
    res.status(500).json({ message: 'Failed to retrieve refund history' });
  }
};