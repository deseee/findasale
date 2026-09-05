// V2: Instant payouts — balance, triggered payouts, and payout schedule management
// Feature #9: getEarningsBreakdown — item-level fee transparency
import { Response } from 'express';
import { getStripe } from '../utils/stripe';
import { AuthRequest } from '../middleware/auth';
import { prisma } from '../lib/prisma';
import { getPlatformFeeRate, resolveOrganizerFeeReport } from '../utils/feeCalculator';
import { buyCheapestLabel, ShippingLabelPurchaseError } from '../services/shippingLabelService';

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
  // ADR-115 Phase 2: label-purchase result, present only once an organizer has bought a
  // real Shippo label for this purchase. Absent/undefined until then.
  shippingLabelUrl?: string | null;
  shippingTrackingNumber?: string | null;
  shippingCarrier?: string | null;
  shippingLabelPurchasedAt?: Date | null;
  // ADR-115 Phase 3 (Orders page, 2026-09-05): every purchase carries deliveryMethod
  // regardless of shipping status -- needed so the Orders page can group SHIP vs.
  // LOCAL_PICKUP purchases and compute a "needs action" count without a second query.
  // pickedUpAt is the LOCAL_PICKUP equivalent of shippingLabelPurchasedAt above.
  deliveryMethod?: string | null;
  pickedUpAt?: Date | null;
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

    // isTestTransaction exclusion (2026-08-29): test-transaction rows must never count as a real sale here
    const whereClause: {
      sale: { organizerId: string };
      status: string;
      isTestTransaction: boolean;
      saleId?: string;
    } = {
      sale: { organizerId: organizer.id },
      status: 'PAID',
      isTestTransaction: false,
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
              // ADR-115 Phase 2
              shippingLabelUrl: p.shippingLabelUrl,
              shippingTrackingNumber: p.shippingTrackingNumber,
              shippingCarrier: p.shippingCarrier,
              shippingLabelPurchasedAt: p.shippingLabelPurchasedAt,
            }
          : {}),
        // ADR-115 Phase 3: always present (unlike the shippingZip-gated block above) --
        // the Orders page needs deliveryMethod on every row, including LOCAL_PICKUP rows
        // that never had a shippingZip at all.
        deliveryMethod: p.deliveryMethod,
        pickedUpAt: p.pickedUpAt,
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

/**
 * POST /api/stripe/purchases/:id/buy-shipping-label
 * ADR-115 Phase 2 -- organizer buys a real Shippo carrier label for a native-checkout
 * ship-it purchase. Organizer-scoped exactly like getEarningsBreakdown/getRefundHistory
 * above (AuthRequest -> ORGANIZER role -> Organizer.findUnique -> sale.organizerId match) --
 * no new auth pattern invented here. 404 (not 403) on a cross-tenant purchase ID, same
 * "can't distinguish not-yours from doesn't-exist" posture as those two functions.
 */
export const buyShippingLabel = async (req: AuthRequest, res: Response) => {
  try {
    const hasOrganizerRole = req.user?.roles?.includes('ORGANIZER') || req.user?.role === 'ORGANIZER';
    if (!req.user || !hasOrganizerRole) {
      return res.status(403).json({ message: 'Organizer access required' });
    }

    const organizer = await prisma.organizer.findUnique({
      where: { userId: req.user.id },
      include: { user: { select: { email: true, phone: true } } },
    });
    if (!organizer) {
      return res.status(404).json({ message: 'Organizer not found' });
    }

    const { id } = req.params;
    const purchase = await prisma.purchase.findUnique({
      where: { id },
      include: {
        sale: { select: { organizerId: true, address: true, city: true, state: true, zip: true } },
        item: {
          select: {
            packageWeightOz: true,
            aiPackageWeightOz: true,
            packageLengthIn: true,
            packageWidthIn: true,
            packageHeightIn: true,
          },
        },
      },
    });

    if (!purchase || !purchase.sale || purchase.sale.organizerId !== organizer.id) {
      return res.status(404).json({ message: 'Purchase not found' });
    }
    if (purchase.deliveryMethod !== 'SHIP') {
      return res.status(400).json({ message: 'This purchase was not a ship-it order' });
    }
    if (purchase.status !== 'PAID') {
      return res.status(400).json({ message: 'This purchase has not been paid' });
    }
    if (purchase.shippingLabelPurchasedAt) {
      return res.status(409).json({ message: 'A shipping label has already been purchased for this order' });
    }
    if (!purchase.shippingAddressLine1 || !purchase.shippingCity || !purchase.shippingState || !purchase.shippingZip) {
      return res.status(400).json({ message: 'This order is missing a full shipping address' });
    }

    // SECURITY FIX (findasale-hacker pass, 2026-09-05): the read-then-later-write check above
    // is TOCTOU-unsafe on its own -- two concurrent requests (double-click, a client retry, or
    // a deliberate replay) could both pass the shippingLabelPurchasedAt-is-null read before
    // either one writes, buying two real labels (two real charges once a live token is ever
    // used). Atomically claim the row at the database level before calling Shippo: this
    // updateMany re-verifies EVERY guard (ownership via organizerId, deliveryMethod, status,
    // not-already-claimed) in one WHERE clause, so only one concurrent request can ever flip
    // its `count` from 0 to 1. All other requests get a real 409, not a partial write.
    const claim = await prisma.purchase.updateMany({
      where: {
        id,
        sale: { organizerId: organizer.id },
        deliveryMethod: 'SHIP',
        status: 'PAID',
        shippingLabelPurchasedAt: null,
      },
      data: { shippingLabelPurchasedAt: new Date() }, // provisional claim -- overwritten with the real timestamp on success, reset to null on failure below
    });
    if (claim.count === 0) {
      return res.status(409).json({ message: 'A shipping label has already been purchased for this order' });
    }

    // ADR-115 assumption, flagged (not a silent guess): no package data on file for this item
    // -- fall back to a documented 1lb / 10x8x4in default rather than crashing or calling
    // Shippo with a 0-weight parcel. Real items almost always have packageWeightOz set
    // (AI-estimated at intake) -- this only fires for a manually-priced item with shipping
    // enabled but no package details ever entered.
    const weightOz = purchase.item?.packageWeightOz ?? purchase.item?.aiPackageWeightOz ?? 16;
    const lengthIn = purchase.item?.packageLengthIn != null ? Number(purchase.item.packageLengthIn) : 10;
    const widthIn = purchase.item?.packageWidthIn != null ? Number(purchase.item.packageWidthIn) : 8;
    const heightIn = purchase.item?.packageHeightIn != null ? Number(purchase.item.packageHeightIn) : 4;

    // Sender contact decision (flagged in handoff): Organizer.phone falls back to the linked
    // User.phone, then to shippingLabelService's own platform-fallback phone/email if both are
    // null -- Shippo/USPS hard-requires a phone+email on file to issue a label at all (live
    // finding this session), so "no contact info" cannot mean "can't ship."
    const addressFrom = {
      name: organizer.businessName,
      street1: purchase.sale.address,
      city: purchase.sale.city,
      state: purchase.sale.state,
      zip: purchase.sale.zip,
      country: 'US',
      phone: organizer.phone || organizer.user.phone || null,
      email: organizer.user.email || null,
    };
    // Recipient phone decision (flagged in handoff): no buyer phone field exists anywhere in
    // the current checkout data model (confirmed via grep) -- left null here, which means
    // shippingLabelService's platform-fallback phone is used for the "to" contact. Real
    // consequence: any carrier SMS delivery notification tied to that phone number goes to
    // FindA.Sale's line, not the buyer's. Acceptable for Phase 2 (label/tracking mechanics
    // work correctly regardless), but a real buyer-phone field would be a clean follow-up.
    const addressTo = {
      name: purchase.guestName || 'FindA.Sale buyer',
      // Non-null assertions safe here -- the guard immediately above already returned a 400
      // if any of these four were null, matching this file's/stripeController's own established
      // convention of asserting after an explicit null-check rather than relying on control-flow
      // narrowing to survive the `await buyCheapestLabel(...)` call further down.
      street1: purchase.shippingAddressLine1!,
      street2: purchase.shippingAddressLine2 || undefined,
      city: purchase.shippingCity!,
      state: purchase.shippingState!,
      zip: purchase.shippingZip!,
      country: purchase.shippingCountry || 'US',
      phone: null,
      email: purchase.buyerEmail || null,
    };

    let result: Awaited<ReturnType<typeof buyCheapestLabel>>;
    try {
      result = await buyCheapestLabel(addressFrom, addressTo, { lengthIn, widthIn, heightIn, weightOz });
    } catch (err) {
      // Release the atomic claim above -- a failed Shippo call must not permanently lock the
      // order out of a legitimate retry (the claim's whole point is blocking a CONCURRENT
      // second buyer, not blocking a genuinely failed attempt from being retried).
      await prisma.purchase.update({ where: { id }, data: { shippingLabelPurchasedAt: null } }).catch((resetErr) => {
        console.error('buyShippingLabel: failed to release claim after Shippo error', { purchaseId: id, resetErr });
      });

      if (err instanceof ShippingLabelPurchaseError) {
        console.error('buyShippingLabel: Shippo rejected the purchase', {
          purchaseId: id,
          messages: err.shippoMessages,
        });
        return res.status(502).json({
          message: 'Shippo could not issue a label for this order',
          shippoMessages: err.shippoMessages,
        });
      }
      throw err;
    }

    const updated = await prisma.purchase.update({
      where: { id },
      data: {
        shippingLabelUrl: result.label.labelUrl,
        shippingTrackingNumber: result.label.trackingNumber,
        shippingCarrier: result.label.carrier,
        shippingLabelCostCents: result.label.costCents,
        shippingLabelPurchasedAt: new Date(),
      },
    });

    // Reconciliation (ADR-115 Section 3.3): there is no stored "amount charged for shipping"
    // column on Purchase -- the fee was baked into Purchase.amount at charge time via
    // repriceNativeShippingForDestination and never persisted separately (confirmed via grep).
    // Rather than invent a new field to solve this speculatively, the real label cost is
    // logged here for Patrick's own margin visibility; a byte-exact "charged vs. real cost"
    // delta is a clean, separate follow-up (would need repriceNativeShippingForDestination
    // re-run with the same historical inputs, which drift over time as item price/weight
    // change) rather than something to guess at now.
    console.log('buyShippingLabel: label purchased', {
      purchaseId: id,
      carrier: result.label.carrier,
      labelCostCents: result.label.costCents,
      ratesConsidered: result.rates.length,
    });

    res.json({
      shippingLabelUrl: updated.shippingLabelUrl,
      shippingTrackingNumber: updated.shippingTrackingNumber,
      shippingCarrier: updated.shippingCarrier,
      shippingLabelCostCents: updated.shippingLabelCostCents,
      shippingLabelPurchasedAt: updated.shippingLabelPurchasedAt,
    });
  } catch (error) {
    console.error('buyShippingLabel error:', error);
    res.status(500).json({ message: 'Failed to purchase shipping label' });
  }
};

/**
 * POST /api/stripe/purchases/:id/mark-picked-up
 * ADR-115 Phase 3 (Orders page, 2026-09-05) -- organizer confirms a
 * deliveryMethod='LOCAL_PICKUP' purchase was physically handed to the buyer. Exact same
 * organizer-ownership pattern as buyShippingLabel/getEarningsBreakdown/getRefundHistory
 * above -- no new auth pattern invented. Same atomic-claim idempotency shape as
 * buyShippingLabel's updateMany (belt-and-suspenders here too, even though there is no
 * external API call to race against -- a double-click or client retry must still not be
 * able to reset pickedUpAt after the fact via two near-simultaneous requests).
 */
export const markPickedUp = async (req: AuthRequest, res: Response) => {
  try {
    const hasOrganizerRole = req.user?.roles?.includes('ORGANIZER') || req.user?.role === 'ORGANIZER';
    if (!req.user || !hasOrganizerRole) {
      return res.status(403).json({ message: 'Organizer access required' });
    }

    const organizer = await prisma.organizer.findUnique({ where: { userId: req.user.id } });
    if (!organizer) {
      return res.status(404).json({ message: 'Organizer not found' });
    }

    const { id } = req.params;
    const purchase = await prisma.purchase.findUnique({
      where: { id },
      include: { sale: { select: { organizerId: true } } },
    });
    if (!purchase || !purchase.sale || purchase.sale.organizerId !== organizer.id) {
      return res.status(404).json({ message: 'Purchase not found' });
    }
    if (purchase.deliveryMethod !== 'LOCAL_PICKUP') {
      return res.status(400).json({ message: 'This purchase was not a local-pickup order' });
    }
    if (purchase.status !== 'PAID') {
      return res.status(400).json({ message: 'This purchase has not been paid' });
    }

    const claim = await prisma.purchase.updateMany({
      where: {
        id,
        sale: { organizerId: organizer.id },
        deliveryMethod: 'LOCAL_PICKUP',
        status: 'PAID',
        pickedUpAt: null,
      },
      data: { pickedUpAt: new Date() },
    });
    if (claim.count === 0) {
      return res.status(409).json({ message: 'This order was already marked picked up' });
    }

    const updated = await prisma.purchase.findUnique({ where: { id }, select: { pickedUpAt: true } });
    res.json({ pickedUpAt: updated?.pickedUpAt ?? null });
  } catch (error) {
    console.error('markPickedUp error:', error);
    res.status(500).json({ message: 'Failed to mark this order picked up' });
  }
};
