/**
 * Cash / Venmo / Zelle POS Payment Controller
 *
 * Extracted from terminalController.ts (2026-09-09, Square-changeover split-out --
 * see claude_docs/feature-notes/square-changeover-remaining-work-scoping-2026-09-09.md
 * Section 3). Pure move, no logic change: this code never touched Stripe in the first
 * place ("Cash never touches Stripe — no Connect account required"), so it needed no
 * Square-vs-Stripe rework, only a home separate from the dead Stripe Terminal hardware
 * endpoints that remain in terminalController.ts.
 *
 * POST /api/stripe/terminal/cash-payment (route path unchanged, still mounted from
 * routes/stripe.ts) also serves the frontend's Venmo and Zelle POS buttons — all three
 * POST to this same route/handler.
 *
 * processCashSaleCore is also called directly by syncController.ts's offline-sync
 * replay path (#561 offline POS cash-checkout queuing).
 */
import { Response } from 'express';
import { randomUUID } from 'crypto';
import * as Sentry from '@sentry/node';
import { AuthRequest } from '../middleware/auth';
import { prisma } from '../lib/prisma';
import { snapshotForCommissionOnly } from '../utils/feeCalculator'; // S388: Tier-aware fee calculation
import { endEbayListingIfExists } from './ebayController'; // Feature #244 Phase 2: eBay direct push — withdraw on sale
import { markShopifyItemSold } from '../services/shopifyService';
import { withdrawDiscogsListingIfExists } from '../services/marketplace/discogsListingConnector';
import { withdrawReverbListingIfExists } from '../services/marketplace/reverbConnector'; // 2026-09-23: withdraw Reverb listing on SOLD, beside Discogs
import { notifyFacebookExportedItemSold } from '../services/facebookNudgeService';
import { sellItemUnits, InsufficientStockError } from '../services/itemStockService';
import { syncMarketplaceStock } from '../services/marketplaceStockSyncService'; // ADR-087 Phase 4: revise-on-partial eBay quantity sync
import { transactionalEmailService } from '../lib/transactionalEmailService';
import { recordSuspectedSignal } from '../services/checkoutGuard'; // S1072 Finding #4: cash path is offsite — log-only, never blocked
import { resolveOrganizerOrTeamMember, type ResolvedPosActor } from '../utils/posAuth'; // S1183 Fix 1: TEAM_MEMBER fallback for non-venue POS
import { resolveCashCommissionRate, cashCommissionOn, accrueCashFeeBalance } from '../services/cashFeeService'; // Shared cash-commission accrual (2026-08-17) — same mechanism reservationController's RECORD mode uses
import { resolvePosDiscount } from '../services/posDiscountService';

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
  // Test Transaction safety net (2026-08-29 incident, mirrors stripeController.ts's
  // "Safety net: test-mode checkout sessions must never deplete inventory" precedent):
  // echoed back so the caller (QA/Chrome pass, or the POS UI) can confirm server-side
  // that this sale did NOT actually deplete inventory or accrue real commission.
  isTestTransaction: boolean;
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
  // Test Transaction safety net (2026-08-29, added after a real QA pass through this exact
  // cash path permanently marked a real production item SOLD with no clean undo -- see the
  // "Safety net" comment above the Purchase-creation and stock-update blocks below). Mirrors
  // the existing stripeController.ts checkout.session.completed webhook precedent
  // ("Safety net: test-mode checkout sessions must never deplete inventory"). Optional and
  // additive-only: omitted or false is byte-for-byte the pre-existing real-sale behavior.
  isTestTransaction?: boolean;
}): Promise<CashSaleResult> {
  const { organizer, saleId, items, cashReceived, buyerEmail, clientTransactionId, discountType, discountValue, discountReasonNote, isTestTransaction } = params;

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
        // Reflect what was actually persisted on the replayed row(s), not the current
        // request's flag -- the DB row is the source of truth for a replay.
        isTestTransaction: existing[0]?.isTestTransaction ?? false,
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
        // Test Transaction safety net (2026-08-29 incident): every validation/pricing/
        // discount-clamp step above still ran for real, so the Purchase row genuinely
        // reflects what the server computed -- it's tagged isTestTransaction (existing
        // Purchase column, same convention stripeController.ts's test-checkout endpoints
        // already use) so it never depletes real inventory (see the stock-update skip
        // below) and, as a side effect, still satisfies checklistController.ts's
        // "hasTestTransaction" live_pos onboarding check for this sale.
        isTestTransaction: isTestTransaction === true,
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
  // Test Transaction safety net (2026-08-29 incident): mirrors stripeController.ts's
  // checkout.session.completed webhook precedent ("Safety net: test-mode checkout
  // sessions must never deplete inventory") — added after a real QA pass through this
  // exact cash path permanently marked a real production item SOLD with no clean undo
  // (root incident behind today's refundService.ts/adminController.ts/stripeController.ts/
  // reservationController.ts fixes). The Purchase row(s) above were still created for
  // real (tagged isTestTransaction) so the pricing/fee math is genuinely exercised — only
  // the irreversible stock decrement / SOLD flip / cross-channel (eBay/Shopify/FB)
  // withdraw-on-sale below is skipped for a test transaction.
  for (const item of chargedItems) {
    if (item.itemId && !isTestTransaction) {
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
        withdrawDiscogsListingIfExists(item.itemId).catch(err =>
          console.error('[Discogs] Failed to withdraw listing:', err)
        );
        withdrawReverbListingIfExists(item.itemId).catch(err =>
          console.error('[Reverb] Failed to withdraw listing:', err)
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
  //
  // totalPlatformFees is still computed for a test transaction (so the response's
  // `platformFee` genuinely reflects what the server calculated, letting QA verify the
  // fee/discount math) — but for isTestTransaction it is deliberately NEVER accrued to
  // Organizer.cashFeeBalance below. A fee-balance debt against the organizer's real payout
  // for a fake test sale would itself be a bug this safety net exists to prevent.
  const totalPlatformFees = chargedItems.reduce(
    (sum, item) => sum + cashCommissionOn(item.amount, feeRate),
    0
  );
  if (!isTestTransaction) {
    await accrueCashFeeBalance({ organizerId: organizer.id, commission: totalPlatformFees });
  }

  // Optionally send receipt email. Skipped for a test transaction — no real money moved and
  // no real item sold, so emailing a "Your receipt from FindA.Sale" confirmation to whatever
  // buyerEmail the tester typed in would misrepresent a completed purchase.
  let receiptSent = false;
  if (buyerEmail && !isTestTransaction) {
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
    isTestTransaction: isTestTransaction === true,
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
    const { items, cashReceived, buyerEmail, saleId, clientTransactionId, discountType, discountValue, discountReasonNote, isTestTransaction } = req.body as {
      items?: Array<{ itemId?: string; amount: number; label?: string }>;
      cashReceived?: number;
      buyerEmail?: string;
      saleId?: string;
      clientTransactionId?: string;
      discountType?: string;
      discountValue?: number;
      discountReasonNote?: string;
      // Test Transaction safety net (2026-08-29 incident) -- see processCashSaleCore's own
      // isTestTransaction doc comment. AUTHORIZATION: this flag only ever takes effect for the
      // organizer (or their TEAM_MEMBER) resolved by resolveOrganizerOrTeamMember above, AND
      // only after the `sale.organizerId !== organizer.id` ownership check below passes --
      // there is no separate code path or bypass; a client cannot use isTestTransaction to
      // reach a sale it doesn't already have full cash-sale rights to.
      isTestTransaction?: boolean;
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
      isTestTransaction,
    });

    // S1072 Finding #4: cash/offsite sales have no verifiable buyer account (Purchase.userId
    // is null for walk-in buyers), so identity-grade collusion cannot be checked or blocked
    // here. Record a low-confidence, non-blocking signal against the organizer for admin
    // review — this path must never reject a legitimate cash sale.
    // Test Transaction safety net (2026-08-29): skipped for a test transaction -- no real
    // money moved and no real buyer exists, so there is nothing here worth an admin's
    // self-dealing review; recording one anyway would just be false-positive noise.
    if (sale.organizer?.userId && !isTestTransaction) {
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
