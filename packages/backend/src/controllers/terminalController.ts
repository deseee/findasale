/**
 * Stripe Terminal POS Controller
 *
 * Handles in-person card payments for organizers using Stripe Terminal.
 * All endpoints require organizer JWT + a configured stripeConnectId.
 *
 * Reader: BBPOS WisePOS E / S700 (WiFi, internet discovery mode)
 * Payment flow: connection-token → payment-intent → [SDK presents to reader] → capture
 */
import { Response } from 'express';
import { randomUUID } from 'crypto';
import * as Sentry from '@sentry/node';
import { getStripe } from '../utils/stripe';
import { AuthRequest } from '../middleware/auth';
import { prisma } from '../lib/prisma';
import { getPlatformFeeRate, snapshotForCommissionOnly } from '../utils/feeCalculator'; // S388: Tier-aware fee calculation
import { endEbayListingIfExists } from './ebayController'; // Feature #244 Phase 2: eBay direct push — withdraw on sale
import { markShopifyItemSold } from '../services/shopifyService';
import { notifyFacebookExportedItemSold } from '../services/facebookNudgeService';
import { sellItemUnits, InsufficientStockError } from '../services/itemStockService';
import { syncMarketplaceStock } from '../services/marketplaceStockSyncService'; // ADR-087 Phase 4: revise-on-partial eBay quantity sync
import { transactionalEmailService } from '../lib/transactionalEmailService';
import { recordSuspectedSignal } from '../services/checkoutGuard'; // S1072 Finding #4: cash path is offsite — log-only, never blocked
import { resolveOrganizerOrTeamMember, type ResolvedPosActor } from '../utils/posAuth'; // S1183 Fix 1: TEAM_MEMBER fallback for non-venue POS
import { getAccountStatus } from '../services/stripeConnectService'; // Direct-charges migration (2026-08-08): live capability preflight
import { resolveCashCommissionRate, cashCommissionOn, accrueCashFeeBalance } from '../services/cashFeeService'; // Shared cash-commission accrual (2026-08-17) — same mechanism reservationController's RECORD mode uses
import { resolvePosDiscount } from '../services/posDiscountService';

const stripe = () => getStripe();

// ─── Helpers ──────────────────────────────────────────────────────────────────

/**
 * Resolve the organizer record + stripeConnectId for the authed user.
 * Returns null (and writes 4xx response) if not eligible.
 * requireStripe (default true): set false for endpoints that don't need Stripe Connect (e.g. cash).
 */
// ─── Endpoints ────────────────────────────────────────────────────────────────

/**
 * Get-or-create the Stripe Terminal Location for a sale's physical address, caching the
 * result on Sale.stripeTerminalLocationId so repeat calls (every card swipe re-fetches a
 * ConnectionToken) don't create a new Location object each time.
 *
 * Stripe requires every Terminal reader to be registered to a Location before it can be
 * used (docs.stripe.com/terminal/fleet/locations-and-zones — "Before you can use a reader,
 * you must register it to a location"), and a ConnectionToken can optionally be scoped to
 * one Location so it only unlocks readers registered at that address ("If you provide a
 * Location, the ConnectionToken is only usable with smart readers assigned to that
 * Location"). Prior to this fix, no code path anywhere in the repo ever created a Terminal
 * Location object — an organizer's first real WisePOS E/S700/S710 reader would have had
 * nothing to register itself to via the API, and every ConnectionToken was unscoped (usable
 * with ALL readers on the connected account, which is functionally fine for a single-reader
 * organizer but loses the per-sale-address scoping Stripe's fleet model is built around, and
 * still leaves reader *registration* itself with no in-app path).
 *
 * Locations belong to the organizer's own connected account (direct-charge model — see
 * "Create a location for accounts using direct charges" in the Stripe docs above), matching
 * how every other Terminal call in this file is already scoped via `stripeAccount`.
 *
 * NOTE: this only creates the Location object. Registering a *physical reader* to it (either
 * via the Stripe Dashboard's registration-code flow, or a future in-app "add a reader" UI)
 * remains a separate, one-time hardware-setup step — out of scope for this pass (flagged,
 * not fixed; see the Terminal-readiness audit notes).
 */
async function getOrCreateTerminalLocationForSale(
  sale: {
    id: string;
    title: string;
    address: string;
    city: string;
    state: string;
    zip: string;
    stripeTerminalLocationId: string | null;
  },
  stripeConnectId: string
): Promise<string> {
  if (sale.stripeTerminalLocationId) {
    return sale.stripeTerminalLocationId;
  }

  const location = await stripe().terminal.locations.create(
    {
      display_name: (sale.title || 'FindA.Sale').slice(0, 1000),
      address: {
        line1: sale.address,
        city: sale.city,
        state: sale.state,
        postal_code: sale.zip,
        country: 'US',
      },
    },
    { stripeAccount: stripeConnectId }
  );

  await prisma.sale.update({
    where: { id: sale.id },
    data: { stripeTerminalLocationId: location.id },
  });

  return location.id;
}

/**
 * POST /api/stripe/terminal/connection-token
 * Body (optional): { saleId?: string }
 * Creates a Stripe Terminal connection token scoped to the organizer's
 * connected Stripe account. The frontend SDK uses this to discover readers.
 *
 * When saleId is provided (and belongs to the calling organizer), the token is
 * additionally scoped to that sale's Stripe Terminal Location — see
 * getOrCreateTerminalLocationForSale above. saleId is optional so any caller that
 * hasn't been updated to send it yet still gets a working (account-wide) token
 * instead of a hard failure.
 */
export const createConnectionToken = async (req: AuthRequest, res: Response) => {
  try {
    // Simulated mode: skip stripeConnectId requirement — create token on platform account.
    // Stripe allows this for simulated readers, enabling testing without a real Connect account.
    // Simulated readers auto-discover without real Location registration, so Location scoping
    // is deliberately skipped in this branch — it would be a no-op at best.
    const isSimulated = process.env.STRIPE_TERMINAL_SIMULATED === 'true';

    if (isSimulated) {
      const hasOrganizerRole = req.user?.roles?.includes('ORGANIZER') || req.user?.role === 'ORGANIZER';
      if (!req.user || !hasOrganizerRole) {
        return res.status(403).json({ message: 'Organizer access required' });
      }
      const token = await stripe().terminal.connectionTokens.create({});
      return res.json({ secret: token.secret });
    }

    const organizer = await resolveOrganizerOrTeamMember(req, res);
    if (!organizer) return;

    const { saleId } = req.body as { saleId?: string };
    let locationId: string | undefined;
    if (saleId) {
      const sale = await prisma.sale.findUnique({
        where: { id: saleId },
        select: {
          id: true,
          title: true,
          address: true,
          city: true,
          state: true,
          zip: true,
          organizerId: true,
          stripeTerminalLocationId: true,
        },
      });
      if (sale && sale.organizerId === organizer.id) {
        try {
          locationId = await getOrCreateTerminalLocationForSale(sale, organizer.stripeConnectId!);
        } catch (locErr) {
          // Never block token issuance on Location setup failing -- fall back to an
          // unscoped (account-wide) token, matching pre-existing behavior.
          console.error('[terminal] Failed to get/create Terminal Location for sale — issuing unscoped connection token instead:', locErr);
        }
      }
    }

    // Create connection token on the organizer's connected account
    const token = await stripe().terminal.connectionTokens.create(
      locationId ? { location: locationId } : {},
      { stripeAccount: organizer.stripeConnectId! }
    );

    res.json({ secret: token.secret });
  } catch (error) {
    console.error('[terminal] createConnectionToken error:', error);
    res.status(500).json({ message: 'Failed to create Terminal connection token' });
  }
};

/**
 * POST /api/stripe/terminal/payment-intent
 * Body: { items: [{itemId?: string, amount: number, label?: string}], buyerEmail?: string, saleId?: string, clientTransactionId?: string }
 *
 * Creates a Stripe PaymentIntent for a multi-item terminal payment (cart).
 * Uses capture_method: 'manual' (Terminal requires explicit capture after card swipe).
 * Applies same 10% platform fee as online purchases.
 * In simulated mode: PI created on platform account (no Connect account required).
 *
 * clientTransactionId (double-tap / retry idempotency fix): optional client-generated UUID,
 * one per checkout attempt (same cart). On retry with the same value, an existing reusable
 * PaymentIntent + Purchase set is returned instead of creating a duplicate -- see the
 * idempotency guard below, which mirrors processCashSaleCore's clientTransactionId replay
 * check for the cash path.
 */
export const createTerminalPaymentIntent = async (req: AuthRequest, res: Response) => {
  try {
    const isSimulated = process.env.STRIPE_TERMINAL_SIMULATED === 'true';
    const organizer = await resolveOrganizerOrTeamMember(req, res, { requireStripe: !isSimulated });
    if (!organizer) return;

    const { items, buyerEmail, saleId: bodySaleId, cashAmountCents, clientTransactionId, discountType, discountValue, discountReasonNote } = req.body as {
      items?: Array<{ itemId?: string; amount: number; label?: string }>;
      buyerEmail?: string;
      saleId?: string;  // required when cart contains only misc items (no itemId)
      cashAmountCents?: number;  // optional: amount of cash received for split payments
      // #561-pattern idempotency guard for the CARD path (mirrors the existing
      // processCashSaleCore clientTransactionId dedup below): the frontend generates one
      // UUID per checkout "attempt" (same cart) and resends it on retry/double-tap.
      clientTransactionId?: string;
      // POS Cashier Discount Permission (2026-08-28) -- see posDiscountService.ts
      discountType?: string;
      discountValue?: number;
      discountReasonNote?: string;
    };

    // Validate items array
    if (!items || !Array.isArray(items) || items.length === 0) {
      return res.status(400).json({ message: 'items array is required and must be non-empty' });
    }

    if (!items.every(i => typeof i.amount === 'number' && i.amount > 0)) {
      return res.status(400).json({ message: 'Each item must have a positive amount' });
    }

    // Idempotency guard (double-tap / network-retry): if this exact card-payment attempt
    // was already submitted (same clientTransactionId), don't create a second Stripe
    // PaymentIntent or a second set of PENDING Purchase rows -- mirrors processCashSaleCore's
    // replay check. Runs before item-availability validation for the same reason as the cash
    // path: a genuine retry should reuse the already-created PaymentIntent rather than
    // re-validating item state that may have legitimately moved on (e.g. marked SOLD by this
    // same in-flight payment's own capture).
    if (clientTransactionId) {
      // SECURITY FIX 2026-08-05 (adversarial pass, fix-and-reverify): this lookup was not
      // scoped to the calling organizer -- clientTransactionId is a client-generated UUID
      // (practically unguessable) so this was a low-likelihood but real cross-tenant IDOR:
      // an unscoped match would return ANOTHER organizer's Purchase and hand back that
      // PaymentIntent's client_secret below. Scoped via the Purchase->Sale relation so a
      // match can only ever belong to a sale this organizer owns.
      const existingForToken = await prisma.purchase.findMany({
        where: { clientTransactionId, source: 'POS', sale: { organizerId: organizer.id } },
      });
      // Card-path rows only -- a cash-path Purchase uses a `cash_...` placeholder
      // stripePaymentIntentId, never a real Stripe PI id, so exclude those defensively
      // (tokens are generated per-flow on the frontend and should never actually collide).
      const existingCardPurchases = existingForToken.filter(
        p => p.stripePaymentIntentId && !p.stripePaymentIntentId.startsWith('cash_')
      );

      if (existingCardPurchases.length > 0) {
        const existingPiId = existingCardPurchases[0].stripePaymentIntentId!;
        try {
          const existingPi = isSimulated
            ? await stripe().paymentIntents.retrieve(existingPiId)
            : await stripe().paymentIntents.retrieve(existingPiId, { stripeAccount: organizer.stripeConnectId! });

          const reusableStatuses = ['requires_payment_method', 'requires_confirmation', 'requires_action', 'requires_capture'];
          if (reusableStatuses.includes(existingPi.status)) {
            // Still awaiting card presentation/capture -- hand the SAME PI back so the reader
            // continues the original attempt instead of starting a duplicate one.
            return res.json({
              paymentIntentId: existingPi.id,
              clientSecret: existingPi.client_secret,
              purchaseIds: existingCardPurchases.map(p => p.id),
              totalAmount: existingCardPurchases.reduce((sum, p) => sum + p.amount, 0),
              platformFee: existingCardPurchases.reduce((sum, p) => sum + (p.platformFeeAmount ?? 0), 0),
            });
          }
          if (existingPi.status === 'succeeded') {
            // Already captured by a prior attempt whose response the client never saw --
            // never re-charge. Report success so the frontend shows the confirmation instead
            // of retrying the card flow.
            return res.json({
              paymentIntentId: existingPi.id,
              clientSecret: existingPi.client_secret,
              purchaseIds: existingCardPurchases.map(p => p.id),
              totalAmount: existingCardPurchases.reduce((sum, p) => sum + p.amount, 0),
              platformFee: existingCardPurchases.reduce((sum, p) => sum + (p.platformFeeAmount ?? 0), 0),
              alreadyCaptured: true,
            });
          }
          // Any other terminal state (canceled, etc.) -- the old attempt is dead and cannot be
          // reused. Fall through and create a fresh PaymentIntent + Purchase set below. The
          // frontend only resends a clientTransactionId this old on an intentional retry after
          // it itself reset the token (see pos.tsx handleCancel), so this path is defensive.
        } catch (retrieveErr) {
          console.warn('[terminal] Failed to retrieve existing PaymentIntent for clientTransactionId replay -- creating new:', retrieveErr);
        }
      }
    }

    // Fetch and validate all items with itemId
    const itemIds = items.filter(i => i.itemId).map(i => i.itemId!);

    // Reject duplicate itemIds — each physical item can only be charged once per transaction
    if (itemIds.length !== new Set(itemIds).size) {
      return res.status(400).json({ message: 'Duplicate items in cart. Each item can only be charged once per transaction.' });
    }

    let dbItems: Record<string, any> = {};
    if (itemIds.length > 0) {
      const fetched = await prisma.item.findMany({
        where: { id: { in: itemIds } },
        select: {
          id: true,
          title: true,
          status: true,
          draftStatus: true,
          price: true, // POS Cashier Discount Permission (2026-08-28): authoritative catalog price for discount validation
          sale: { select: { id: true, organizerId: true } },
        },
      });
      dbItems = Object.fromEntries(fetched.map(item => [item.id, item]));

      // Verify all items exist, belong to organizer, and are AVAILABLE
      for (const itemId of itemIds) {
        if (!dbItems[itemId]) {
          return res.status(404).json({ message: `Item not found` });
        }
        const item = dbItems[itemId];
        if (item.sale!.organizerId !== organizer.id) {
          return res.status(403).json({ message: `"${item.title}" does not belong to your sale` });
        }
        if (item.status !== 'AVAILABLE') {
          return res.status(400).json({ message: `"${item.title}" is sold or unavailable` });
        }
        if (item.draftStatus !== null && item.draftStatus !== 'PUBLISHED') {
          return res.status(400).json({ message: `"${item.title}" is pending review and cannot be sold yet` });
        }
      }
    }

    // POS Cashier Discount Permission (2026-08-28): resolve + validate any requested
    // discount BEFORE computing totals/fees/Stripe amount. No-op when no discount was
    // sent -- chargedItems === items unchanged, zero behavior change to the pre-existing
    // flow in that case.
    const catalogSubtotalCents = Math.round(
      items.reduce((sum, i) => sum + (i.itemId && dbItems[i.itemId]?.price ? dbItems[i.itemId].price : 0), 0) * 100
    );
    const discountResolution = await resolvePosDiscount({
      actor: organizer,
      input: { discountType, discountValue, discountReasonNote },
      catalogSubtotalCents,
    });
    if (!discountResolution.ok) {
      return res.status(discountResolution.status).json({ message: discountResolution.message });
    }

    // Apply the authorized discount proportionally across catalog items only (misc items,
    // i.e. no itemId, are untouched -- they were never part of catalogSubtotalCents).
    // itemAmountCentsBeforeDiscount is tracked per row so the actual applied cents can be
    // stored on each Purchase row below without floating-point drift accumulating.
    const discountRatio = discountResolution.discountAmountCents > 0 && catalogSubtotalCents > 0
      ? discountResolution.discountAmountCents / catalogSubtotalCents
      : 0;
    const chargedItems = items.map((i) => {
      if (discountRatio === 0 || !i.itemId) return { ...i, itemAmountCentsBeforeDiscount: Math.round(i.amount * 100), rowDiscountCents: 0 };
      const beforeCents = Math.round(i.amount * 100);
      const afterCents = Math.round(beforeCents * (1 - discountRatio));
      return { ...i, amount: afterCents / 100, itemAmountCentsBeforeDiscount: beforeCents, rowDiscountCents: beforeCents - afterCents };
    });

    // Calculate total amount in cents
    const totalAmountCents = Math.round(chargedItems.reduce((sum, i) => sum + i.amount, 0) * 100);

    // Calculate card amount: if split payment (cashAmountCents provided and less than total), use remaining
    const cardAmountCents = cashAmountCents != null && cashAmountCents > 0 && cashAmountCents < totalAmountCents
      ? totalAmountCents - cashAmountCents
      : totalAmountCents;

    // Fee: tier-derived rate, apply referral discount if active. Platform fee is calculated on
    // the card portion only (not on cash).
    // Tier-derived rate wins over a wildcard FeeStructure row (fee-precedence fix, 2026-08-22) --
    // see utils/feeCalculator.ts getPlatformFeeRate and services/cashFeeService.ts (this
    // controller's cash path got the identical fix).
    const baseFeeRate = getPlatformFeeRate(organizer.subscriptionTier as any);
    const hasReferralDiscount =
      organizer.referralDiscountExpiry != null && organizer.referralDiscountExpiry > new Date();
    const feeRate = hasReferralDiscount ? 0 : baseFeeRate;
    const platformFeeAmount = Math.round(cardAmountCents * feeRate);

    // Determine sale ID: derive from first item with itemId, or fall back to bodySaleId (misc-only carts)
    let saleId = '';
    for (const item of items) {
      if (item.itemId && dbItems[item.itemId]) {
        saleId = dbItems[item.itemId].sale!.id;
        break;
      }
    }
    if (!saleId) {
      // Misc-only cart — require explicit saleId in body
      if (!bodySaleId) {
        return res.status(400).json({ message: 'saleId is required when cart contains only misc items' });
      }
      // Verify the provided saleId belongs to this organizer
      const sale = await prisma.sale.findUnique({ where: { id: bodySaleId }, select: { organizerId: true } });
      if (!sale || sale.organizerId !== organizer.id) {
        return res.status(403).json({ message: 'Sale does not belong to your account' });
      }
      saleId = bodySaleId;
    }

    // Direct-charges migration (2026-08-08): live capability preflight. resolveOrganizerOrTeamMember
    // only confirms organizer.stripeConnectId is non-null (a cached DB presence check) --
    // never that Stripe currently reports the account as charge-capable (a DB-cache vs
    // live-Stripe discrepancy was confirmed for at least one real organizer this session).
    // Never authorize a real charge against an account Stripe itself doesn't currently
    // report as charge-capable. Simulated mode never touches a real connected account, so
    // it is exempt.
    if (!isSimulated) {
      try {
        const liveStatus = await getAccountStatus(organizer.stripeConnectId!);
        if (!liveStatus.chargesEnabled) {
          return res.status(400).json({ message: "This organizer's Stripe account cannot currently accept charges. Please check Stripe onboarding status." });
        }
      } catch (statusErr) {
        console.error('[terminal] getAccountStatus preflight failed:', statusErr);
        return res.status(502).json({ message: "Could not verify the organizer's payment account status. Please try again." });
      }
    }

    // Create terminal PaymentIntent — platform account in simulated mode, connected account in production
    const piParams = {
      amount: cardAmountCents,
      currency: 'usd',
      payment_method_types: ['card_present'], // Terminal-only: physical card reader
      capture_method: 'manual' as const,      // Terminal requires explicit capture
      ...(!isSimulated ? { application_fee_amount: platformFeeAmount } : {}),
      metadata: {
        items: JSON.stringify(chargedItems),
        saleId,
        source: 'POS',
        ...(buyerEmail ? { buyerEmail } : {}),
        ...(cashAmountCents != null && cashAmountCents > 0 && cashAmountCents < totalAmountCents ? {
          isSplitPayment: 'true',
          cashAmountCents: cashAmountCents.toString(),
          cardAmountCents: cardAmountCents.toString(),
        } : {}),
      },
    };
    // Stripe idempotencyKey (defense-in-depth alongside the DB-level check above): if a
    // duplicate request somehow reaches this line with the same clientTransactionId, Stripe
    // itself returns the SAME PaymentIntent instead of minting a second one.
    const stripeCreateOptions: { stripeAccount?: string; idempotencyKey?: string } = {};
    if (!isSimulated) stripeCreateOptions.stripeAccount = organizer.stripeConnectId!;
    if (clientTransactionId) stripeCreateOptions.idempotencyKey = clientTransactionId;
    const paymentIntent = await stripe().paymentIntents.create(
      piParams,
      Object.keys(stripeCreateOptions).length > 0 ? stripeCreateOptions : undefined
    );

    // Create PENDING Purchase records for each cart item
    const purchaseIds: string[] = [];
    for (const item of chargedItems) {
      const itemAmount = item.amount;
      const itemAmountCents = Math.round(itemAmount * 100);
      const itemPlatformFeeAmount = item.itemId ? Math.round(itemAmountCents * feeRate) : 0;

      const purchase = await prisma.purchase.create({
        data: {
          itemId: item.itemId ?? null,
          saleId,
          amount: itemAmount,
          platformFeeAmount: itemPlatformFeeAmount / 100,
          // POS Cashier Discount Permission (2026-08-28): per-row share of the cart-level
          // discount, and the metadata explaining it -- null/0 on every row when no
          // discount was applied (discountResolution.discountAmountCents === 0).
          discountType: item.rowDiscountCents > 0 ? discountResolution.discountType : null,
          discountValueRaw: item.rowDiscountCents > 0 ? discountResolution.discountValueRaw : null,
          discountAmountCents: item.rowDiscountCents > 0 ? item.rowDiscountCents : null,
          discountReasonNote: item.rowDiscountCents > 0 ? discountResolution.discountReasonNote : null,
          discountAppliedByUserId: item.rowDiscountCents > 0 ? organizer.actingUserId : null,
          // FEE SNAPSHOT (2026-08-17): commission-only — Terminal is card-present POS, never an
          // auction lot, so the premium fields record a hard 0 ("no premium was charged" is a
          // fact worth recording, not an unknown). Pinning the rate here stops an organizer's
          // later tier change from restating this transaction's fee in their earnings report.
          ...snapshotForCommissionOnly(itemPlatformFeeAmount / 100, feeRate),
          stripePaymentIntentId: paymentIntent.id,
          status: 'PENDING',
          source: 'POS',
          ...(clientTransactionId ? { clientTransactionId } : {}),
          ...(buyerEmail ? { buyerEmail } : {}),
          // findasale-hacker fix (2026-08-09, Direct-charges adversarial pass): the
          // PaymentIntent above was created with { stripeAccount: organizer.stripeConnectId }
          // whenever !isSimulated (see stripeCreateOptions above) -- a genuine Direct charge
          // on the organizer's own connected account, unconditionally, independent of the
          // Direct-charges migration's allowlist (Terminal card-present payments have always
          // worked this way). Leaving chargeType at its schema default ('DESTINATION') would
          // mislabel every real Terminal Purchase row, breaking refundService.ts's refund-call
          // routing (it would omit { stripeAccount }, calling refunds.create against a
          // PaymentIntent that only exists on the connected account -- refund fails outright).
          // Simulated mode never touches a real connected account (no stripeAccount option was
          // passed to paymentIntents.create above), so DESTINATION is the correct label there.
          chargeType: isSimulated ? 'DESTINATION' : 'DIRECT',
          ...(!isSimulated ? { stripeAccountId: organizer.stripeConnectId! } : {}),
        },
      });
      purchaseIds.push(purchase.id);
    }

    res.json({
      paymentIntentId: paymentIntent.id,
      clientSecret: paymentIntent.client_secret,
      purchaseIds,
      totalAmount: cardAmountCents / 100,
      platformFee: platformFeeAmount / 100,
    });
  } catch (error) {
    console.error('[terminal] createTerminalPaymentIntent error:', error);
    res.status(500).json({ message: 'Failed to create Terminal payment intent' });
  }
};

/**
 * POST /api/stripe/terminal/capture
 * Body: { paymentIntentId: string }
 *
 * Captures a terminal PaymentIntent after the card has been presented to the reader.
 * Marks all purchases for this PI as PAID and their items as SOLD.
 * The Stripe webhook (payment_intent.succeeded) also fires — the webhook handler
 * handles idempotency via ProcessedWebhookEvent.
 */
export const captureTerminalPaymentIntent = async (req: AuthRequest, res: Response) => {
  try {
    const isSimulated = process.env.STRIPE_TERMINAL_SIMULATED === 'true';
    const organizer = await resolveOrganizerOrTeamMember(req, res, { requireStripe: !isSimulated });
    if (!organizer) return;

    const { paymentIntentId } = req.body as { paymentIntentId?: string };

    if (!paymentIntentId) {
      return res.status(400).json({ message: 'paymentIntentId is required' });
    }

    // Find all purchases for this PaymentIntent
    const purchases = await prisma.purchase.findMany({
      where: { stripePaymentIntentId: paymentIntentId },
      include: {
        item: {
          select: {
            id: true,
            status: true,
            title: true,
            sale: { select: { organizerId: true } },
          },
        },
      },
    });

    if (!purchases.length) {
      return res.status(404).json({ message: 'No purchases found for this payment intent' });
    }

    // Verify ownership — use first purchase with an item, or fall back to saleId check (misc-only carts)
    const ownerPurchase = purchases.find(p => p.item);
    if (ownerPurchase) {
      if (ownerPurchase.item!.sale!.organizerId !== organizer.id) {
        return res.status(403).json({ message: 'You do not have permission to capture this payment' });
      }
    } else {
      // All misc items — verify via saleId on purchase record
      const firstSaleId = purchases[0]?.saleId;
      if (firstSaleId) {
        const sale = await prisma.sale.findUnique({ where: { id: firstSaleId }, select: { organizerId: true } });
        if (!sale || sale.organizerId !== organizer.id) {
          return res.status(403).json({ message: 'You do not have permission to capture this payment' });
        }
      }
    }

    // If all purchases are already PAID, return idempotent success
    if (purchases.every(p => p.status === 'PAID')) {
      return res.json({ purchaseIds: purchases.map(p => p.id), status: 'PAID', receiptSent: false });
    }

    // Concurrent guard: check if any item with itemId is already SOLD
    for (const p of purchases) {
      if (!p.itemId) continue;
      const current = await prisma.item.findUnique({
        where: { id: p.itemId },
        select: { status: true },
      });
      if (current?.status === 'SOLD' && p.status !== 'PAID') {
        // Item was sold by another concurrent transaction — cancel this PI and fail all purchases
        try {
          if (isSimulated) {
            await stripe().paymentIntents.cancel(paymentIntentId);
          } else {
            await stripe().paymentIntents.cancel(paymentIntentId, {}, { stripeAccount: organizer.stripeConnectId! });
          }
        } catch (e) {
          console.warn('[terminal] Failed to cancel PI during concurrent guard:', e);
        }

        await prisma.purchase.updateMany({
          where: { stripePaymentIntentId: paymentIntentId },
          data: { status: 'FAILED' },
        });

        return res.status(409).json({
          message: 'An item in the cart was sold by another transaction',
        });
      }
    }

    // Capture the payment — platform account in simulated mode, connected account in production
    let capturedPaymentIntent;
    if (isSimulated) {
      capturedPaymentIntent = await stripe().paymentIntents.capture(paymentIntentId);
    } else {
      capturedPaymentIntent = await stripe().paymentIntents.capture(paymentIntentId, {}, { stripeAccount: organizer.stripeConnectId! });
    }

    // Mark all purchases PAID
    await prisma.purchase.updateMany({
      where: { stripePaymentIntentId: paymentIntentId },
      data: { status: 'PAID' },
    });

    // Split cash+terminal-card commission accrual (P2 fix, sibling to posPaymentController.
    // confirmPaymentRequest's split-cash fix, 2026-08-22): createTerminalPaymentIntent's
    // split-tender path (cashAmountCents in the body) only ever charged Stripe's
    // application_fee_amount on the CARD portion -- the cash portion the organizer pockets
    // in person was never charged any commission at all, on any code path, ever. Resolved
    // through the SAME shared, tier-aware resolver services/cashFeeService.ts's other
    // callers use (processCashSaleCore's pure-cash path in this same file,
    // posPaymentController's split-tender path) -- not a new or duplicated calculation.
    // Read from the CAPTURED PaymentIntent's own metadata (set at creation time in
    // createTerminalPaymentIntent, never trust a client-supplied value) and resolve the
    // rate now, at capture time, rather than at creation time -- matching every other
    // cash-commission call site, so a referral discount or tier change between creation
    // and capture applies the same way it would to any other cash sale.
    //
    // Wrapped so a failure here can never turn an already-successful card capture into an
    // error response to the cashier -- same defensive shape as confirmPaymentRequest's cash
    // leg and the P0 stock-update fixes elsewhere in this file.
    if (capturedPaymentIntent?.metadata?.isSplitPayment === 'true' && capturedPaymentIntent.metadata?.cashAmountCents) {
      const splitCashAmountCents = parseInt(capturedPaymentIntent.metadata.cashAmountCents, 10);
      if (Number.isFinite(splitCashAmountCents) && splitCashAmountCents > 0) {
        try {
          const cashFeeRate = await resolveCashCommissionRate({
            subscriptionTier: organizer.subscriptionTier,
            referralDiscountExpiry: organizer.referralDiscountExpiry,
          });
          const cashCommission = cashCommissionOn(splitCashAmountCents / 100, cashFeeRate);
          await accrueCashFeeBalance({ organizerId: organizer.id, commission: cashCommission });
        } catch (err: any) {
          console.error('[terminal] Failed to accrue cash-half commission for split Terminal payment:', err);
          try {
            Sentry.captureException(err instanceof Error ? err : new Error(String(err)), {
              tags: { area: 'terminal-capture-split-cash-commission' },
              extra: {
                paymentIntentId,
                organizerId: organizer.id,
                cashAmountCents: splitCashAmountCents,
              },
            });
          } catch {
            // Sentry may not be initialized -- silently continue
          }
        }
      }
    }

    // Mark items SOLD -- ADR-085 Track B Phase 1 Step 4: atomic, race-safe stock decrement
    // replaces the old unconditional status update.
    //
    // P0 fix (2026-08-08, Terminal readiness audit): payment is ALREADY captured (see
    // paymentIntents.capture above) and every Purchase row for this PaymentIntent is
    // ALREADY marked PAID (see the updateMany immediately above this loop) by the time
    // this per-item stock update runs. The old code `throw stockErr` on any failure here
    // (oversold race, or any other DB error), which propagated to the outer catch and
    // returned a 500 "Failed to capture Terminal payment" -- telling the cashier the
    // payment FAILED when the card had already been charged (see pos.tsx handleCharge's
    // catch, which shows exactly that message to the cashier). Worse: a retry from that
    // false-failure state hits the "every purchase already PAID" idempotent short-circuit
    // above and returns success immediately WITHOUT ever completing the missed stock
    // update for the item(s) after the one that failed -- money captured, item never
    // marked SOLD, silently and permanently. This is the exact "money-captured-but-
    // item-not-recorded" gap flagged by the 2026-08-07 audit sweep for this file. Mirrors
    // the identical P0 already fixed in stripeController.ts's POS-payment-request webhook
    // fulfillment (search "P0 fix (2026-08-07)" in that file) -- same failure class, same
    // fix shape: alert to Sentry so it is never silently lost, keep processing the rest of
    // the cart, and never turn an already-successful payment into a false failure response.
    for (const p of purchases) {
      if (p.itemId) {
        try {
          // NOTE: this call site has no existing endEbayListingIfExists (P3
          // withdraw-on-sellout) hook wired up at all -- a pre-existing gap,
          // out of scope for this ADR-087 Phase 4 pass (flagged, not fixed).
          // The P4 revise-on-partial hook below is still added per the
          // hacker/architect review's explicit inclusion of all 12 checkout
          // call sites.
          const { fullySoldOut, remainingStock } = await sellItemUnits(p.itemId, 1);
          if (!fullySoldOut) {
            syncMarketplaceStock(p.itemId, { fullySoldOut: false, remainingStock }).catch(err =>
              console.error('[eBay ReviseQty] sync failed for item', p.itemId, err)
            );
          }
        } catch (stockErr: any) {
          console.error(
            `[terminal] Post-capture stock update FAILED for item ${p.itemId} -- payment already captured, Purchase already marked PAID, item was NOT marked SOLD:`,
            stockErr
          );
          try {
            Sentry.captureException(stockErr instanceof Error ? stockErr : new Error(String(stockErr)), {
              tags: { area: 'terminal-capture-post-payment-stock-update' },
              extra: {
                paymentIntentId,
                itemId: p.itemId,
                purchaseId: p.id,
                organizerId: organizer.id,
                insufficientStock: stockErr instanceof InsufficientStockError,
              },
            });
          } catch {
            // Sentry may not be initialized -- silently continue
          }
          // Do NOT rethrow -- see the P0 fix note above. The payment already succeeded;
          // rethrowing here would falsely tell the cashier it didn't.
        }
      }
    }

    // Send receipt to buyer if email was provided
    let receiptSent = false;
    const buyerEmail = purchases[0]?.buyerEmail;
    if (buyerEmail) {
      try {
        const { buildEmail } = await import('../services/emailTemplateService');
        
        const fromEmail = process.env.GMAIL_FROM_EMAIL || process.env.SES_FROM_EMAIL || 'find@outreach.finda.sale';

        // Build receipt with all items
        const itemsList = purchases
          .map(p => `<li>${p.item?.title ?? 'Misc item'}: $${p.amount.toFixed(2)}</li>`)
          .join('');
        const totalAmount = purchases.reduce((sum, p) => sum + p.amount, 0);

        const html = buildEmail({
          preheader: `Receipt for your purchase`,
          headline: 'Your receipt from FindA.Sale 🎉',
          body: `<p>Thank you for your purchase!</p><ul>${itemsList}</ul><p><strong>Total: $${totalAmount.toFixed(2)}</strong></p><p>Payment processed securely via Stripe.</p>`,
          ctaText: 'Visit FindA.Sale',
          ctaUrl: process.env.FRONTEND_URL || 'https://finda.sale',
          accentColor: '#10b981',
        });
        await transactionalEmailService.emails.send({
          from: fromEmail,
          to: buyerEmail,
          subject: `Receipt: Your in-person purchase`,
          html,
        });
        receiptSent = true;
      } catch (emailErr) {
        console.warn('[terminal] Failed to send POS receipt email:', emailErr);
      }
    }

    // S1072 Finding #4 follow-up: captureTerminalPaymentIntent (card-terminal /
    // tap-to-pay) has the same walk-in-buyer gap as cashPayment above -- Purchase.userId
    // is never set for POS captures (see createTerminalPaymentIntent's purchase.create
    // call, which only sets itemId/saleId/amount/buyerEmail -- never userId), so there
    // is no verifiable buyer account to hard-block against here either (unlike
    // posPaymentController.ts's createPaymentRequest, which always has a real
    // shopperUserId and uses assertCheckoutAllowed() as a hard block instead). Record
    // the same low-confidence, non-blocking signal against the organizer for admin
    // review -- fire-and-forget so a signal-recording failure never affects the
    // already-captured payment or the response sent to the cashier.
    const signalSaleId = purchases[0]?.saleId;
    if (signalSaleId) {
      prisma.organizer
        .findUnique({ where: { id: organizer.id }, select: { userId: true } })
        .then(organizerRecord => {
          if (organizerRecord?.userId) {
            recordSuspectedSignal({
              prisma,
              userId: organizerRecord.userId,
              saleId: signalSaleId,
              signalType: 'SELF_DEALING',
              notes: '[captureTerminalPaymentIntent] Card-terminal (tap-to-pay) sale captured with no verifiable buyer account -- walk-in customer, offsite/unpreventable, logged for review only.',
            }).catch(err => console.warn('[terminal] recordSuspectedSignal failed (non-fatal):', err));
          }
        })
        .catch(err => console.warn('[terminal] Failed to resolve organizer userId for recordSuspectedSignal (non-fatal):', err));
    }

    res.json({ purchaseIds: purchases.map(p => p.id), status: 'PAID', receiptSent });
  } catch (error) {
    console.error('[terminal] captureTerminalPaymentIntent error:', error);
    res.status(500).json({ message: 'Failed to capture Terminal payment' });
  }
};

/**
 * POST /api/stripe/terminal/cancel
 * Body: { paymentIntentId: string }
 *
 * Cancels an in-progress terminal PaymentIntent (e.g. buyer walks away).
 * Marks all purchases FAILED and returns items to AVAILABLE.
 */
export const cancelTerminalPaymentIntent = async (req: AuthRequest, res: Response) => {
  try {
    const isSimulated = process.env.STRIPE_TERMINAL_SIMULATED === 'true';
    const organizer = await resolveOrganizerOrTeamMember(req, res, { requireStripe: !isSimulated });
    if (!organizer) return;

    const { paymentIntentId } = req.body as { paymentIntentId?: string };

    if (!paymentIntentId) {
      return res.status(400).json({ message: 'paymentIntentId is required' });
    }

    const purchases = await prisma.purchase.findMany({
      where: { stripePaymentIntentId: paymentIntentId },
    });

    if (!purchases.length) {
      return res.status(404).json({ message: 'No purchases found for this payment intent' });
    }

    if (purchases.some(p => p.status === 'PAID')) {
      return res.status(400).json({ message: 'Cannot cancel a completed payment. Use refund instead.' });
    }

    // Cancel the PaymentIntent — platform account in simulated mode, connected account in production
    if (isSimulated) {
      await stripe().paymentIntents.cancel(paymentIntentId);
    } else {
      await stripe().paymentIntents.cancel(paymentIntentId, {}, { stripeAccount: organizer.stripeConnectId! });
    }

    // Mark all purchases FAILED
    await prisma.purchase.updateMany({
      where: { stripePaymentIntentId: paymentIntentId },
      data: { status: 'FAILED' },
    });

    // Restore items to AVAILABLE
    for (const p of purchases) {
      if (p.itemId) {
        await prisma.item.update({
          where: { id: p.itemId },
          data: { status: 'AVAILABLE' },
        });
      }
    }

    res.json({ status: 'CANCELLED' });
  } catch (error) {
    console.error('[terminal] cancelTerminalPaymentIntent error:', error);
    res.status(500).json({ message: 'Failed to cancel Terminal payment' });
  }
};

/**
 * #561 offline POS cash-checkout queuing: typed error carrying HTTP status + retryability +
 * a stable code so callers (live route vs. offline-sync replay) can react without string-matching.
 */
export class CashSaleError extends Error {
  status: number;
  retryable: boolean;
  code: 'VALIDATION' | 'DUPLICATE_ITEMS' | 'ITEM_NOT_FOUND' | 'ITEM_UNAVAILABLE' | 'DRAFT_PENDING';
  constructor(message: string, status: number, retryable: boolean, code: CashSaleError['code']) {
    super(message);
    this.status = status;
    this.retryable = retryable;
    this.code = code;
  }
}

export interface CashSaleResult {
  purchaseIds: string[];
  totalAmount: number;
  platformFee: number;
  cashReceived: number;
  change: number;
  receiptSent: boolean;
  cashFeeBalance: number;
  cashFeeBalanceUpdatedAt: Date | null;
  replay: boolean; // true = this was an idempotent replay of an already-synced clientTransactionId
}

/**
 * Shared cash-sale core, used by both the live POST /api/stripe/terminal/cash-payment route
 * and the offline-sync replay path (syncController.ts handleCheckoutCash). Sale ownership is
 * verified by the caller before this runs (both callers already do that check their own way).
 *
 * Idempotency (#561 ADR-offline-pos-queue-2026-07-03.md): when clientTransactionId is provided
 * and Purchase rows already exist for it, this is a replay of an already-synced offline entry —
 * return the existing rows instead of creating new ones or re-touching item status.
 */
export async function processCashSaleCore(params: {
  // referralDiscountExpiry is optional: `resolveOrganizerOrTeamMember` (the live route's
  // resolver) already selects it, so the live cash path now honours an active referral
  // discount exactly as the card path above does. A caller that does not select it (the
  // offline-sync replay) simply gets no discount applied — the pre-existing behaviour.
  // POS Cashier Discount Permission fix (2026-08-28, findasale-hacker P0): the extra fields
  // below (actorKind/actingUserId/etc.) are what resolvePosDiscount needs to permission-check
  // a TEAM_MEMBER, mirroring the card path. They're optional here (rather than requiring the
  // full ResolvedPosActor) because syncController.ts's offline-replay caller only has
  // { id, subscriptionTier } -- that caller's resolvePosDiscount call always hits the no-op
  // branch (it never sends discountType/discountValue... see the residual gap noted at that
  // call site: an offline TEAM_MEMBER's discount cap is not enforced on replay, only on live
  // checkout) so the missing fields are never dereferenced for it at runtime.
  organizer: {
    id: string;
    subscriptionTier: string | null;
    referralDiscountExpiry?: Date | null;
    ownerUserId?: string;
    stripeConnectId?: string | null;
    actorKind?: 'ORGANIZER' | 'TEAM_MEMBER';
    actingUserId?: string;
    workspaceId?: string;
    workspaceRole?: import('@prisma/client').WorkspaceRole;
  };
  saleId: string;
  items: Array<{ itemId?: string; amount: number; label?: string }>;
  cashReceived: number;
  buyerEmail?: string;
  clientTransactionId?: string;
  // POS Cashier Discount Permission fix (2026-08-28): previously accepted by
  // createTerminalPaymentIntent only — cashPayment silently dropped these, so a discount
  // shown to the cashier (client-side clamp only) never reached the server and was never
  // applied to the persisted Purchase.amount. See DiscountRequestInput in posDiscountService.ts.
  discountType?: string | null;
  discountValue?: number | null;
  discountReasonNote?: string | null;
}): Promise<CashSaleResult> {
  const { organizer, saleId, items, cashReceived, buyerEmail, clientTransactionId, discountType, discountValue, discountReasonNote } = params;

  if (!items || !Array.isArray(items) || items.length === 0) {
    throw new CashSaleError('items array is required and must be non-empty', 400, false, 'VALIDATION');
  }
  if (!items.every(i => typeof i.amount === 'number' && i.amount > 0)) {
    throw new CashSaleError('Each item must have a positive amount', 400, false, 'VALIDATION');
  }
  if (typeof cashReceived !== 'number' || cashReceived < 0) {
    throw new CashSaleError('cashReceived must be a non-negative number', 400, false, 'VALIDATION');
  }

  // POS Cashier Discount Permission fix (2026-08-28): the "cashReceived < totalAmount"
  // sufficiency check moved below (after discount resolution) so it validates against the
  // DISCOUNTED total, not the full catalog total -- a cashier legitimately collecting exact
  // change on a discounted sale was previously rejected here with "Insufficient cash
  // received" because this ran before any discount was applied.

  // Idempotent replay check — must run BEFORE any item-availability check, since a genuine
  // replay of an already-synced sale should never re-validate item state (the item may have
  // legitimately moved on since the original sync).
  if (clientTransactionId) {
    // SECURITY FIX 2026-08-05 (adversarial pass, fix-and-reverify -- same class of gap just
    // fixed in createTerminalPaymentIntent's card path above, this is the cash-path sibling
    // that was the original precedent for the pattern): scope to this organizer's own sales
    // so a clientTransactionId collision/guess can't surface another organizer's Purchase rows.
    const existing = await prisma.purchase.findMany({ where: { clientTransactionId, sale: { organizerId: organizer.id } } });
    if (existing.length > 0) {
      const existingTotal = existing.reduce((sum, p) => sum + p.amount, 0);
      const existingFee = existing.reduce((sum, p) => sum + (p.platformFeeAmount ?? 0), 0);
      const updatedOrganizer = await prisma.organizer.findUnique({
        where: { id: organizer.id },
        select: { cashFeeBalance: true, cashFeeBalanceUpdatedAt: true },
      });
      return {
        purchaseIds: existing.map(p => p.id),
        totalAmount: existingTotal,
        platformFee: existingFee,
        cashReceived,
        change: cashReceived - existingTotal,
        receiptSent: false, // not re-sent on replay
        cashFeeBalance: updatedOrganizer?.cashFeeBalance ?? 0,
        cashFeeBalanceUpdatedAt: updatedOrganizer?.cashFeeBalanceUpdatedAt ?? null,
        replay: true,
      };
    }
  }

  // Fetch and validate all items with itemId
  const itemIds = items.filter(i => i.itemId).map(i => i.itemId!);

  // Reject duplicate itemIds — each physical item can only be charged once per transaction
  if (itemIds.length !== new Set(itemIds).size) {
    throw new CashSaleError('Duplicate items in cart. Each item can only be charged once per transaction.', 400, false, 'DUPLICATE_ITEMS');
  }

  let dbItems: Record<string, any> = {};
  if (itemIds.length > 0) {
    const fetched = await prisma.item.findMany({
      where: { id: { in: itemIds }, saleId },
      // POS Cashier Discount Permission fix (2026-08-28): price is now selected so
      // catalogSubtotalCents (below) can be computed the same way the card path does --
      // this cash path previously had no way to validate a discount against catalog price.
      select: { id: true, title: true, status: true, draftStatus: true, price: true },
    });
    dbItems = Object.fromEntries(fetched.map(item => [item.id, item]));

    for (const itemId of itemIds) {
      if (!dbItems[itemId]) {
        throw new CashSaleError('Item not found in this sale', 404, false, 'ITEM_NOT_FOUND');
      }
      if (dbItems[itemId].status !== 'AVAILABLE') {
        // #561 double-sell conflict: for an offline replay this is the case the ADR calls out —
        // do NOT silently drop the queued sale. The caller (handleCheckoutCash) surfaces this
        // code so the frontend can flag "needs reconciliation" instead of retrying forever.
        throw new CashSaleError(`"${dbItems[itemId].title}" is sold or unavailable`, 400, false, 'ITEM_UNAVAILABLE');
      }
      if (dbItems[itemId].draftStatus !== null && dbItems[itemId].draftStatus !== 'PUBLISHED') {
        throw new CashSaleError(`"${dbItems[itemId].title}" is pending review and cannot be sold yet`, 400, false, 'DRAFT_PENDING');
      }
    }
  }

  // POS Cashier Discount Permission fix (2026-08-28, findasale-hacker P0): resolve + validate
  // any requested discount server-side BEFORE computing totals/fees, mirroring
  // createTerminalPaymentIntent's card-path handling above (see resolvePosDiscount doc comment
  // -- it already claimed to cover "the cash flow" but was never actually wired in here; that
  // gap meant the staff discount cap was unenforceable and the discount never reached
  // Purchase.amount for Cash/Venmo/Zelle). No-op when no discount was sent.
  const catalogSubtotalCents = Math.round(
    items.reduce((sum, i) => sum + (i.itemId && dbItems[i.itemId]?.price ? dbItems[i.itemId].price : 0), 0) * 100
  );
  // Cast: organizer here is the permissive shape (see the param type comment above) --
  // the live cashPayment route always supplies a genuine full ResolvedPosActor at runtime,
  // and the no-op branch (no discount requested) never dereferences the extra fields, so
  // this is safe for both callers.
  const discountResolution = await resolvePosDiscount({
    actor: organizer as ResolvedPosActor,
    input: { discountType, discountValue, discountReasonNote },
    catalogSubtotalCents,
  });
  if (!discountResolution.ok) {
    throw new CashSaleError(discountResolution.message, discountResolution.status, false, 'VALIDATION');
  }

  // Apply the authorized discount proportionally across catalog items only (misc items, i.e.
  // no itemId, are untouched), identical logic to the card path's chargedItems computation.
  const discountRatio = discountResolution.discountAmountCents > 0 && catalogSubtotalCents > 0
    ? discountResolution.discountAmountCents / catalogSubtotalCents
    : 0;
  const chargedItems = items.map((i) => {
    if (discountRatio === 0 || !i.itemId) return { ...i, rowDiscountCents: 0 };
    const beforeCents = Math.round(i.amount * 100);
    const afterCents = Math.round(beforeCents * (1 - discountRatio));
    return { ...i, amount: afterCents / 100, rowDiscountCents: beforeCents - afterCents };
  });

  // Recomputed AFTER discount resolution -- see the removed early check above. This is the
  // authoritative, server-computed total (never the client's own display total).
  const totalAmount = chargedItems.reduce((sum, i) => sum + i.amount, 0);
  if (cashReceived < totalAmount) {
    throw new CashSaleError('Insufficient cash received', 400, false, 'VALIDATION');
  }

  // Fee: same rate as the card flow. The cash organizer collects the full amount in person, so
  // platformFeeAmount is recorded for accounting and the commission is accrued to
  // Organizer.cashFeeBalance below for collection out of their next payout.
  //
  // Resolution moved into services/cashFeeService.ts (2026-08-17) so this path and
  // reservationController's RECORD settlement mode — the other cash path, which until today
  // accrued nothing at all — read the rate the same way and cannot drift. Behaviour here is
  // unchanged apart from now honouring an active referral discount, which the card path in
  // this same controller already did.
  const feeRate = await resolveCashCommissionRate(organizer);

  // Create Purchase records immediately with status PAID
  const purchaseIds: string[] = [];
  for (const item of chargedItems) {
    // Use a UUID placeholder for cash sales (stripePaymentIntentId is @unique — cannot be null)
    const cashPIId = `cash_${randomUUID()}`;
    const itemPlatformFeeAmount = cashCommissionOn(item.amount, feeRate);

    const purchase = await prisma.purchase.create({
      data: {
        itemId: item.itemId ?? null,
        saleId,
        amount: item.amount,
        platformFeeAmount: itemPlatformFeeAmount,
        // FEE SNAPSHOT (2026-08-17): commission-only, same reasoning as the card flow above.
        ...snapshotForCommissionOnly(itemPlatformFeeAmount, feeRate),
        // POS Cashier Discount Permission fix (2026-08-28): per-row share of the cart-level
        // discount, null/0 on every row when no discount was applied -- same convention the
        // card path uses.
        discountType: item.rowDiscountCents > 0 ? discountResolution.discountType : null,
        discountValueRaw: item.rowDiscountCents > 0 ? discountResolution.discountValueRaw : null,
        discountAmountCents: item.rowDiscountCents > 0 ? item.rowDiscountCents : null,
        discountReasonNote: item.rowDiscountCents > 0 ? discountResolution.discountReasonNote : null,
        discountAppliedByUserId: item.rowDiscountCents > 0 ? organizer.actingUserId : null,
        stripePaymentIntentId: cashPIId,
        status: 'PAID',
        source: 'POS',
        ...(clientTransactionId ? { clientTransactionId } : {}),
        ...(buyerEmail ? { buyerEmail } : {}),
      },
    });
    purchaseIds.push(purchase.id);
  }

  // Mark items SOLD -- ADR-085 Track B Phase 1 Step 4: atomic, race-safe stock decrement
  // replaces the old unconditional status update. Downstream cross-channel-removal hooks
  // only fire once the item is actually fully sold out, not on every partial sale.
  // P0 fix (2026-08-08, Terminal readiness audit): every Purchase row for this cart was
  // ALREADY created above with status PAID, and cash was physically already collected by
  // the organizer -- both are irreversible facts by the time this loop runs. The old code
  // `throw stockErr` on any single item's stock-update failure aborted the ENTIRE loop
  // (leaving every item after the failed one un-processed, no SOLD status, no cross-channel
  // sync) and propagated to cashPayment's catch, which returned a 500 telling the organizer
  // the cash sale failed -- when it had already been recorded and the cash already taken.
  // Same failure class as captureTerminalPaymentIntent's card-path fix above: alert to
  // Sentry, keep processing the rest of the cart, never let a partial failure masquerade as
  // a total one.
  for (const item of chargedItems) {
    if (item.itemId) {
      let fullySoldOut: boolean;
      let remainingStock: number;
      try {
        ({ fullySoldOut, remainingStock } = await sellItemUnits(item.itemId, 1));
      } catch (stockErr: any) {
        console.error(
          `[terminal] Post-payment stock update FAILED for cash-sale item ${item.itemId} -- Purchase already created as PAID, cash already collected, item was NOT marked SOLD:`,
          stockErr
        );
        try {
          Sentry.captureException(stockErr instanceof Error ? stockErr : new Error(String(stockErr)), {
            tags: { area: 'terminal-cash-sale-post-payment-stock-update' },
            extra: {
              saleId,
              itemId: item.itemId,
              organizerId: organizer.id,
              insufficientStock: stockErr instanceof InsufficientStockError,
            },
          });
        } catch {
          // Sentry may not be initialized -- silently continue
        }
        // Do NOT rethrow -- see the P0 fix note above. Skip this item's downstream
        // marketplace sync (its stock state is unresolved) but keep processing the rest
        // of the cart's items instead of aborting the whole cash sale.
        continue;
      }

      if (fullySoldOut) {
        // Fire-and-forget: end eBay listing if item was pushed there
        endEbayListingIfExists(item.itemId).catch(err =>
          console.error('[eBay] Failed to withdraw offer:', err)
        );
        markShopifyItemSold(item.itemId).catch(err =>
          console.error('[Shopify] Failed to mark item sold:', err)
        );
        notifyFacebookExportedItemSold(item.itemId).catch(err =>
          console.warn(`[FB Nudge] failed for item ${item.itemId}:`, err.message)
        );
      } else {
        // ADR-087 Phase 4: partial sale — revise eBay listing quantity if linked.
        syncMarketplaceStock(item.itemId, { fullySoldOut: false, remainingStock }).catch(err =>
          console.error('[eBay ReviseQty] sync failed for item', item.itemId, err)
        );
      }
    }
  }

  // Accumulate the commission on this cash sale to the organizer's cash-fee balance, which
  // payoutController nets out of their next Stripe payout. Shared with RECORD-mode settlement
  // via services/cashFeeService.ts — one implementation, two callers.
  const totalPlatformFees = chargedItems.reduce(
    (sum, item) => sum + cashCommissionOn(item.amount, feeRate),
    0
  );
  await accrueCashFeeBalance({ organizerId: organizer.id, commission: totalPlatformFees });

  // Optionally send receipt email
  let receiptSent = false;
  if (buyerEmail) {
    try {
      const { buildEmail } = await import('../services/emailTemplateService');

      const fromEmail = process.env.GMAIL_FROM_EMAIL || process.env.SES_FROM_EMAIL || 'find@outreach.finda.sale';

      const itemsList = chargedItems
        .map(i => `<li>${i.label ?? 'Item'}: $${i.amount.toFixed(2)}</li>`)
        .join('');
      const change = (cashReceived - totalAmount).toFixed(2);

      const html = buildEmail({
        preheader: `Receipt for your purchase`,
        headline: 'Your receipt from FindA.Sale 🎉',
        body: `<p>Thank you for your purchase!</p><ul>${itemsList}</ul><p><strong>Total: $${totalAmount.toFixed(2)}</strong></p><p>Cash received: $${cashReceived.toFixed(2)}</p><p>Change: $${change}</p>`,
        ctaText: 'Visit FindA.Sale',
        ctaUrl: process.env.FRONTEND_URL || 'https://finda.sale',
        accentColor: '#10b981',
      });

      await transactionalEmailService.emails.send({
        from: fromEmail,
        to: buyerEmail,
        subject: `Receipt: Your in-person purchase`,
        html,
      });
      receiptSent = true;
    } catch (emailErr) {
      console.warn('[terminal] Failed to send cash sale receipt email:', emailErr);
    }
  }

  const change = cashReceived - totalAmount;

  // Fetch updated organizer balance to return in response
  const updatedOrganizer = await prisma.organizer.findUnique({
    where: { id: organizer.id },
    select: { cashFeeBalance: true, cashFeeBalanceUpdatedAt: true },
  });

  return {
    purchaseIds,
    totalAmount,
    platformFee: totalPlatformFees,
    cashReceived,
    change,
    receiptSent,
    cashFeeBalance: updatedOrganizer?.cashFeeBalance ?? 0,
    cashFeeBalanceUpdatedAt: updatedOrganizer?.cashFeeBalanceUpdatedAt ?? null,
    replay: false,
  };
}

/**
 * POST /api/stripe/terminal/cash-payment
 * Body: { items: [{itemId?: string, amount: number, label?: string}], cashReceived: number, buyerEmail?: string, saleId: string, clientTransactionId?: string }
 *
 * Records a cash sale immediately without Stripe processing.
 * Creates Purchase records with status PAID and marks items SOLD.
 * Accumulates 10% platform fees into organizer.cashFeeBalance for later payout deduction.
 * platformFeeAmount tracks fee for accounting; collection is handled outside Stripe.
 *
 * clientTransactionId (#561): optional idempotency key. The offline-sync replay path
 * (syncController.ts) always sends one; live in-person swipes may omit it.
 */
export const cashPayment = async (req: AuthRequest, res: Response) => {
  try {
    // Cash never touches Stripe — no Connect account required
    const organizer = await resolveOrganizerOrTeamMember(req, res, { requireStripe: false });
    if (!organizer) return;

    // POS Cashier Discount Permission fix (2026-08-28, findasale-hacker P0): discountType/
    // discountValue/discountReasonNote were previously silently dropped here -- the card path
    // (createTerminalPaymentIntent) already accepted and enforced them, this cash path (which
    // also serves the frontend's Venmo/Zelle buttons, both of which POST to this same route)
    // never did, so the staff discount cap was unenforceable for those 3 payment methods and
    // the discount never reached the persisted Purchase.amount.
    const { items, cashReceived, buyerEmail, saleId, clientTransactionId, discountType, discountValue, discountReasonNote } = req.body as {
      items?: Array<{ itemId?: string; amount: number; label?: string }>;
      cashReceived?: number;
      buyerEmail?: string;
      saleId?: string;
      clientTransactionId?: string;
      discountType?: string;
      discountValue?: number;
      discountReasonNote?: string;
    };

    if (!saleId) {
      return res.status(400).json({ message: 'saleId is required' });
    }

    // Verify sale belongs to organizer
    const sale = await prisma.sale.findUnique({
      where: { id: saleId },
      select: { organizerId: true, organizer: { select: { userId: true } } },
    });

    if (!sale || sale.organizerId !== organizer.id) {
      return res.status(403).json({ message: 'Sale does not belong to your account' });
    }

    const result = await processCashSaleCore({
      organizer,
      saleId,
      items: items ?? [],
      cashReceived: cashReceived ?? 0,
      buyerEmail,
      clientTransactionId,
      discountType,
      discountValue,
      discountReasonNote,
    });

    // S1072 Finding #4: cash/offsite sales have no verifiable buyer account (Purchase.userId
    // is null for walk-in buyers), so identity-grade collusion cannot be checked or blocked
    // here. Record a low-confidence, non-blocking signal against the organizer for admin
    // review — this path must never reject a legitimate cash sale.
    if (sale.organizer?.userId) {
      recordSuspectedSignal({
        prisma,
        userId: sale.organizer.userId,
        saleId,
        signalType: 'SELF_DEALING',
        notes: '[cashPayment] Cash sale recorded with no verifiable buyer account: offsite/unpreventable, logged for review only.',
      }).catch(err => console.warn('[terminal] recordSuspectedSignal failed (non-fatal):', err));
    }

    res.json(result);
  } catch (error: any) {
    if (error instanceof CashSaleError) {
      return res.status(error.status).json({ message: error.message });
    }
    console.error('[terminal] cashPayment error:', error);
    res.status(500).json({ message: 'Failed to record cash sale' });
  }
};
