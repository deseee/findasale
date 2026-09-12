import { Response } from 'express';
import { randomUUID } from 'crypto';
import { AuthRequest } from '../middleware/auth';
import { BoothAuthRequest } from '../middleware/requireBoothAuth';
import { prisma } from '../lib/prisma';
import { getStripe } from '../utils/stripe';
import { assertBoothCartCheckoutAllowed, CheckoutGuardError } from '../services/checkoutGuard';
import { endEbayListingIfExists } from './ebayController';
import { markShopifyItemSold } from '../services/shopifyService';
import { notifyFacebookExportedItemSold } from '../services/facebookNudgeService';
import { sellItemUnits, InsufficientStockError } from '../services/itemStockService';
import { syncMarketplaceStock } from '../services/marketplaceStockSyncService'; // ADR-087 Phase 4: revise-on-partial eBay quantity sync
import { generateReceipt, sendBoothCartReceiptEmail } from '../services/receiptService';
import { getPlatformFeeRate } from '../utils/feeCalculator'; // ADR-090 Phase 2: platform's normal cut formula
import { notifyVendorOfBoothSale } from '../services/vendorBoothSaleNotificationService'; // per-vendor "your item sold" notification
import { getOrCreateHouseBooth } from '../services/houseBoothService'; // Fix 2 (2026-08-01): hub owner's own items sell through a synthetic booth
import { releasePendingCartHold } from '../services/vendorBoothCartLifecycleService'; // extracted cart-release-and-fail core, shared with the abandonment sweep job
import { Decimal } from '@prisma/client/runtime/library';
import { isPayoutFlaggedForReview } from '../services/connectAccountGuard'; // S1198 (2026-09-06): bank-fingerprint collusion hold, VendorBooth wiring
import {
  resolveVendorBoothSquareAccessToken,
  SquareBoothOnboardingIncompleteError,
  createSquareSharedCardForCart,
  authorizeSquareBoothCartLeg,
  cancelSquareBoothCartLeg,
  getSquareBoothCartLegStatus,
  completeSquareBoothCartLeg,
} from '../services/squareVendorBoothCartService'; // vendor-booth-cart-checkout dispatch (2026-09-07) -- Square-side sibling, see that file's header comment for the researched design

const stripe = () => getStripe();

// ADR-090 §6 (2026-07-20, Patrick "defaults based on industry standards"): server-enforced
// ceiling on VendorBooth.revenueSharePercent. Also enforced at write-time in
// vendorBoothController.ts (createVendorBooth/updateVendorBooth) -- clamped again here,
// defense-in-depth, so a stale/bypassed value can never inflate a real charge.
const REVENUE_SHARE_CAP_PERCENT = 30;

/**
 * P1 cart-IDOR fix (findasale-hacker fix-and-reverify pass, 2026-07-28). Every cart
 * endpoint in this file resolves its cart with `findFirst({ id: cartTransactionId, hubId })`,
 * which proves only that the cart belongs to the SAME HUB the caller authenticated
 * against -- never that the caller is the cashier who opened it.
 * requireBoothTokenOrTeamMember() hands a BOOTH-type session to ANY CONFIRMED booth on
 * the hub, so before this check a competitor vendor's booth token could add a leg to,
 * capture, or cancel another booth's live cart -- and /cancel releases that cart's
 * RESERVED items back to AVAILABLE, i.e. a one-request basket drop mid-checkout.
 *
 * Rule: a TEAM_MEMBER session is the hub owner's own workspace staff (the middleware
 * resolves it through SaleHub -> Organizer -> OrganizerWorkspace -> WorkspaceMember ->
 * TeamMember) and may operate any cart on its hub -- that is the existing register model,
 * and the only live cashier UI (pages/organizer/hubs/[hubId]/cart.tsx) is TEAM_MEMBER-only,
 * so this changes nothing for it. A BOOTH session may only touch a cart it opened itself
 * (BoothCartTransaction.cashierBoothId, written at startBoothCart).
 */
function callerOwnsCart(
  boothAuth: NonNullable<BoothAuthRequest['boothAuth']>,
  cart: { cashierBoothId: string | null }
): boolean {
  // 2026-07-28 P0: HUB_OWNER is the market's own owner, resolved in
  // requireBoothAuth.ts by comparing req.user.organizerProfile.id === SaleHub.organizerId.
  // They own every cart on their own hub for the same reason their staff do, and strictly
  // more so. Without this line the owner would pass the middleware and then be rejected
  // with "This cart belongs to another cashier" on add-items, checkout and capture,
  // because this function's fallback requires a cashierBoothId match a HUB_OWNER session
  // does not have. Their carts store null in BOTH cashier columns (startBoothCart below),
  // so the booth-token branch could never match one.
  if (boothAuth.type === 'TEAM_MEMBER' || boothAuth.type === 'HUB_OWNER') return true;
  return !!boothAuth.vendorBoothId && boothAuth.vendorBoothId === cart.cashierBoothId;
}

// 403 (not 404) matches this file's existing guard-rejection convention
// (CheckoutGuardError -> 403) and requireBoothAuth.ts's own 403s for a valid-but-
// unauthorized session. The message carries no detail about the other cashier.
const CART_NOT_YOURS_ERROR = 'This cart belongs to another cashier';

/**
 * ADR-090 Phase 2: compute one booth-cart leg's application_fee_amount (the
 * platform's normal cut, using the SAME tier-based formula terminalController.ts
 * already uses for POS/Terminal charges, plus the hub owner's revenue-share cut on
 * top, clamped to REVENUE_SHARE_CAP_PERCENT) and, when a revenue share is actually
 * owed, verify the hub owner can receive it. When revenueSharePercent is 0 this is a
 * no-op pass-through (booth-fee-only or no split at all) -- never blocks checkout for
 * a booth with no revenue-share agreement, even if the hub owner has no Stripe account.
 *
 * Returns `{ blocked: true, reason }` when a revenue share is owed but the hub owner
 * is not connected + onboarded on a Standard account -- callers MUST 400 rather than
 * silently dropping the hub owner's cut (ADR-090 §6 decision, mirrors the existing
 * booth-not-onboarded block already in this file).
 */
async function computeLegFeeSplit(params: {
  amountCents: number;
  revenueSharePercent: number;
  // ADR-123 §3.2: which processor this leg charges on, so the readiness gate below
  // checks the RIGHT onboarding status. Defaults to 'STRIPE' so every call site that
  // predates this ADR (and never set this) keeps its exact existing behavior unchanged.
  processor?: 'STRIPE' | 'SQUARE';
  hubOwnerOrganizer: {
    subscriptionTier: string | null;
    stripeConnectId: string | null;
    stripeOnboarded: boolean;
    stripeAccountType: string | null;
    // ADR-123 §3.2: only read when processor === 'SQUARE'. Optional (not required on
    // every caller's select) so pre-ADR-123 call sites that only ever charge Stripe
    // don't need a schema-unrelated field just to satisfy this type.
    squareOnboarded?: boolean;
    squareLocationId?: string | null;
  } | null;
  // CASH ONLY (2026-07-31). A cash leg never touches Stripe at all -- not the booth's
  // own connected account (no PaymentIntent is ever created for it) and not the hub
  // owner's (no application_fee_amount is ever taken, and transferHubOwnerShareForLeg
  // is never called for a CASH leg -- see captureBoothCartCash). So neither party's
  // Stripe onboarding status can legitimately block a cash sale the way it blocks the
  // TERMINAL/QR rails' real charges. This flag skips ONLY the hubOwnerReady gate below
  // -- the platformFeeCents/hubOwnerShareCents math itself is unchanged and still runs,
  // because the hub owner is still OWED that share; it is just collected from the booth
  // by the organizer directly (outside Stripe) instead of Transferred automatically.
  skipReadinessGate?: boolean;
}): Promise<
  | { blocked: false; applicationFeeAmountCents: number; hubOwnerShareCents: number }
  | { blocked: true; reason: string }
> {
  const { amountCents, revenueSharePercent, hubOwnerOrganizer, skipReadinessGate, processor } = params;
  // as any: mirrors the existing cast terminalController.ts already uses at this
  // exact call site (Prisma's generated SubscriptionTier enum vs. feeCalculator.ts's
  // plain string-literal-union SubscriptionTier type are structurally distinct types).
  const platformFeeCents = Math.round(
    amountCents * getPlatformFeeRate((hubOwnerOrganizer?.subscriptionTier as any) ?? null)
  );

  const clampedRevenueSharePercent = Math.min(Math.max(revenueSharePercent || 0, 0), REVENUE_SHARE_CAP_PERCENT);
  if (clampedRevenueSharePercent <= 0) {
    return { blocked: false, applicationFeeAmountCents: platformFeeCents, hubOwnerShareCents: 0 };
  }

  if (!skipReadinessGate) {
    // ADR-123 §3.2: symmetric SQUARE branch, mirrors the Stripe gate exactly (same
    // function, new branch) -- a hub owner who has never completed Square onboarding
    // cannot have a Square-rail sale with a revenue-share cut happen in their hub at all,
    // exactly the same guarantee the Stripe path already gives.
    //
    // KNOWN GAP, flagged not silently assumed away (ADR-123 §5 item 1 / §9): squareOnboarded
    // is a single cached boolean with no per-scope tracking column. A hub owner who
    // completed Square onboarding BEFORE the PAYMENTS_WRITE_ADDITIONAL_RECIPIENTS scope was
    // added (squareConnectService.ts SQUARE_OAUTH_SCOPES) will still read squareOnboarded ===
    // true here even though their existing OAuth grant does NOT include that scope --
    // Square would reject the allocation at authorize time (see resolveSquareAppFeeParams /
    // ADR-123 §3.3's "fail the whole leg" behavior for what happens then), not this gate.
    // The ADR does not specify a way to distinguish pre- vs post-scope onboarding from
    // existing schema alone; this is flagged here and in this dispatch's Handoff Contract
    // rather than guessed at.
    const hubOwnerReady =
      processor === 'SQUARE'
        ? !!hubOwnerOrganizer && !!hubOwnerOrganizer.squareOnboarded && !!hubOwnerOrganizer.squareLocationId
        : !!hubOwnerOrganizer &&
          hubOwnerOrganizer.stripeAccountType === 'standard' &&
          hubOwnerOrganizer.stripeOnboarded &&
          !!hubOwnerOrganizer.stripeConnectId;

    if (!hubOwnerReady) {
      return {
        blocked: true,
        reason:
          processor === 'SQUARE'
            ? "This hub's owner has not completed Square onboarding yet. Checkout is unavailable for booths with a revenue-share agreement until they do."
            : "This hub's owner has not completed Stripe onboarding yet. Checkout is unavailable for booths with a revenue-share agreement until they do.",
      };
    }
  }

  const hubOwnerShareCents = Math.round(amountCents * (clampedRevenueSharePercent / 100));
  return {
    blocked: false,
    applicationFeeAmountCents: platformFeeCents + hubOwnerShareCents,
    hubOwnerShareCents,
  };
}

/**
 * ADR-090 Phase 2: fire the platform -> hub-owner Transfer for one captured leg's
 * revenue-share slice. Atomic claim-before-Stripe-call (updateMany WHERE
 * stripeTransferId IS NULL) + a stable idempotencyKey, mirroring
 * stripeController.ts's createRefund claim pattern (PAID -> REFUNDING -> REFUNDED) —
 * deliberately NOT the consignorSettlementController.ts pattern, which is a plain
 * check-then-act read with no idempotencyKey at all (confirmed gap, ADR-090 §2).
 * 'CLAIMING' is the same in-flight sentinel value already used elsewhere in this
 * codebase (Organizer.pendingStripeMigrationAccountId) — refund-reversal logic must
 * check stripeTransferId is a real id (!== 'CLAIMING') before attempting a reversal.
 * Safe to call multiple times: no-ops once hubOwnerShareAmount is unset/zero or a
 * transfer already exists.
 */
export async function transferHubOwnerShareForLeg(legId: string): Promise<void> {
  const leg = await prisma.boothCartLeg.findUnique({
    where: { id: legId },
    include: { vendorBooth: { include: { hub: { include: { organizer: true } } } } },
  });
  if (!leg || !leg.hubOwnerShareAmount || Number(leg.hubOwnerShareAmount) <= 0) return;
  if (leg.stripeTransferId) return; // already transferred (or a claim is already in flight)
  // Defense-in-depth (hacker review, S1179 cash-rail dispatch): a CASH leg never had a
  // real Stripe charge behind it, so a Transfer here would pay the hub owner real platform
  // money for a sale that generated none. Currently the only caller is captureBoothCart's
  // real-money finalize loop, but this guard makes it impossible by construction rather
  // than merely true-by-convention if a future caller (reconciliation script, new feature)
  // ever passes a cash leg's id here.
  if (leg.rail === 'CASH') return;
  // ADR-123 (2026-09-07, hub-owner-share settlement dispatch) SUPERSEDES the note this
  // comment used to carry: as of this dispatch, a NEW SQUARE leg's hub-owner share is
  // settled REAL-TIME via app_fee_allocations at authorize time (see
  // authorizeBoothCartSquareLegs -> authorizeSquareBoothCartLeg's resolveSquareAppFeeParams
  // in squareVendorBoothCartService.ts, and BoothCartLeg.hubOwnerShareSettledAt, set the
  // moment that allocation succeeds). This function is called post-CAPTURE, so for any
  // newly-authorized SQUARE leg it is now UNREACHABLE with real work to do -- the guard
  // below still exists (Square genuinely has no merchant-to-merchant Transfer primitive, so
  // a `stripe().transfers.create` call must never be reachable for a SQUARE leg) but only
  // matters for ADR-123 §3.3's narrow, bounded fallback bucket: a leg captured BEFORE this
  // ADR shipped (hubOwnerShareAmount set, hubOwnerShareSettledAt null, no allocation was
  // ever made) or the rare case where an authorize-time allocation failed and the whole leg
  // authorization was correctly failed instead of silently downgrading to a booth-only
  // charge. Those bounded cases are resolved manually via the HubOwnerShareManualPayout
  // flow (vendorBoothSettlementController.ts's recordHubOwnerShareManualPayout), reconciled
  // via the query documented on BoothCartLeg.hubOwnerShareSettledAt in schema.prisma -- NOT
  // by a recurring cron/sweep (ADR-123 §3.3 explicitly rejects a periodic sweep).
  if (leg.processor === 'SQUARE') {
    console.log(
      `[transferHubOwnerShareForLeg] Leg ${legId} is a SQUARE leg with hubOwnerShareAmount=${leg.hubOwnerShareAmount} -- ` +
        'no live Transfer attempted (Square has no merchant-to-merchant Transfer primitive). If this leg ' +
        'predates ADR-123 or its authorize-time allocation failed, it falls into the bounded manual-payout ' +
        'reconciliation bucket (ADR-123 §3.3/§4) rather than being auto-settled here.'
    );
    return;
  }

  const hubOwnerOrganizer = leg.vendorBooth.hub.organizer;
  if (!hubOwnerOrganizer.stripeConnectId) {
    console.error(
      `[transferHubOwnerShareForLeg] Leg ${legId} has hubOwnerShareAmount but hub owner organizer ${hubOwnerOrganizer.id} has no stripeConnectId — cannot transfer. This should be unreachable (checkout already blocks this case) — flagging for manual reconciliation.`
    );
    return;
  }

  const claim = await prisma.boothCartLeg.updateMany({
    where: { id: leg.id, stripeTransferId: null },
    data: { stripeTransferId: 'CLAIMING' },
  });
  if (claim.count !== 1) return; // lost the race — another call already claimed/completed this transfer

  const amountCents = Math.round(Number(leg.hubOwnerShareAmount) * 100);
  try {
    const transfer = await stripe().transfers.create(
      {
        amount: amountCents,
        currency: 'usd',
        destination: hubOwnerOrganizer.stripeConnectId,
        description: `Hub owner revenue share — booth cart leg ${leg.id}`,
        metadata: {
          source: 'booth_cart_leg_hub_owner_share',
          vendorBoothId: leg.vendorBoothId,
          cartTransactionId: leg.cartTransactionId,
          legId: leg.id,
        },
      },
      { idempotencyKey: `hub-owner-transfer-${leg.id}` }
    );
    await prisma.boothCartLeg.update({
      where: { id: leg.id },
      data: { stripeTransferId: transfer.id, hubOwnerTransferFailedAt: null, hubOwnerTransferError: null },
    });
  } catch (err) {
    // Release the claim so a future retry (e.g. a manual reconciliation re-run) isn't
    // permanently blocked by the sentinel, AND durably record the failure in the same
    // write. Before this, a failed Transfer left zero trace in the database -- an unpaid
    // hub owner discoverable only by grepping logs. Now:
    //   SELECT * FROM "BoothCartLeg"
    //   WHERE "hubOwnerTransferFailedAt" IS NOT NULL AND "stripeTransferId" IS NULL;
    await prisma.boothCartLeg
      .updateMany({
        where: { id: leg.id, stripeTransferId: 'CLAIMING' },
        data: {
          stripeTransferId: null,
          hubOwnerTransferFailedAt: new Date(),
          hubOwnerTransferError: String((err as any)?.message ?? err).slice(0, 500),
        },
      })
      .catch((revertErr) =>
        console.error(`[transferHubOwnerShareForLeg] Failed to release claim after Stripe error for leg ${legId}:`, revertErr)
      );
    console.error(`[transferHubOwnerShareForLeg] Stripe transfer failed for leg ${legId}:`, err);
    throw err;
  }

  // P1 race close (2026-07-28): a refund may have landed while stripeTransferId still held
  // 'CLAIMING' -- in that window the refund path could not reverse anything, so it recorded
  // the obligation in hubOwnerReversalOwedCents instead. Now that a REAL tr_... id exists,
  // drain it. Non-fatal: the Transfer itself already succeeded and must not be unwound here;
  // the owed watermark stays on the row so a later refund or reconciliation run settles it.
  await settleHubOwnerReversalForLeg(leg.id).catch((settleErr) =>
    console.error(
      `[transferHubOwnerShareForLeg] Transfer succeeded but post-transfer reversal settlement failed for leg ${legId} — hubOwnerReversalOwedCents remains outstanding:`,
      settleErr
    )
  );
}

/**
 * P1 refund/transfer race fix (2026-07-28). Drain the outstanding hub-owner Transfer
 * reversal recorded on a leg (hubOwnerReversalOwedCents minus hubOwnerReversalDoneCents).
 *
 * Called from BOTH sides of the race: stripeController.createRefund (after it increments
 * the owed watermark) and transferHubOwnerShareForLeg (right after the real Transfer id
 * lands). Whichever finishes second is the one that actually moves money, so no ordering
 * of (capture, claim, transfer, refund) can leave the hub owner holding platform funds.
 *
 * Guarantees:
 *  - NEVER reverses a Transfer that does not exist: the Stripe call is gated on
 *    stripeTransferId being a real `tr_` id, which the 'CLAIMING' sentinel and null both
 *    fail. The existing guard is preserved, not weakened.
 *  - NEVER reverses twice: hubOwnerReversalDoneCents is advanced by a conditional
 *    updateMany keyed to the exact value observed (compare-and-swap -- the same idiom as
 *    the stripeTransferId IS NULL -> 'CLAIMING' claim above and the Purchase
 *    PAID -> REFUNDING claim in stripeController.ts). Exactly one concurrent caller wins;
 *    the losers see count 0 and return. The reversal amount is additionally clamped to the
 *    leg's total hub-owner share, and Stripe independently refuses reversals exceeding the
 *    Transfer amount.
 *  - Idempotency key is derived from the resulting cumulative watermark, so a retry of the
 *    same outstanding delta collapses to one reversal on Stripe's side.
 */
export async function settleHubOwnerReversalForLeg(legId: string): Promise<void> {
  const leg = await prisma.boothCartLeg.findUnique({
    where: { id: legId },
    select: {
      id: true,
      stripeTransferId: true,
      hubOwnerShareAmount: true,
      hubOwnerReversalOwedCents: true,
      hubOwnerReversalDoneCents: true,
    },
  });
  if (!leg) return;

  // Phantom-reversal guard. null = never transferred; 'CLAIMING' = transfer in flight.
  // Neither is a reversible Stripe object. The owed watermark simply stays on the row.
  if (!leg.stripeTransferId || !leg.stripeTransferId.startsWith('tr_')) return;

  const owedCents = leg.hubOwnerReversalOwedCents ?? 0;
  const doneCents = leg.hubOwnerReversalDoneCents ?? 0;
  const shareCents = Math.round(Number(leg.hubOwnerShareAmount ?? 0) * 100);
  // Can never reverse more than was actually transferred.
  const outstandingCents = Math.min(owedCents, shareCents) - doneCents;
  if (outstandingCents <= 0) return;

  const nextDoneCents = doneCents + outstandingCents;
  const claim = await prisma.boothCartLeg.updateMany({
    where: { id: leg.id, hubOwnerReversalDoneCents: leg.hubOwnerReversalDoneCents },
    data: { hubOwnerReversalDoneCents: nextDoneCents },
  });
  if (claim.count !== 1) return; // lost the race — another settler owns this delta

  try {
    await stripe().transfers.createReversal(
      leg.stripeTransferId,
      { amount: outstandingCents },
      { idempotencyKey: `hub-owner-reversal-${leg.id}-${nextDoneCents}` }
    );
  } catch (err) {
    // Roll the watermark back so the obligation stays outstanding and retryable rather
    // than being silently marked settled. Mirrors the claim-release above and the
    // REFUNDING -> PAID revert in stripeController.createRefund.
    await prisma.boothCartLeg
      .updateMany({
        where: { id: leg.id, hubOwnerReversalDoneCents: nextDoneCents },
        data: { hubOwnerReversalDoneCents: leg.hubOwnerReversalDoneCents },
      })
      .catch((revertErr) =>
        console.error(`[settleHubOwnerReversalForLeg] Failed to roll back reversal watermark for leg ${legId}:`, revertErr)
      );
    console.error(`[settleHubOwnerReversalForLeg] Stripe reversal failed for leg ${legId}:`, err);
    throw err;
  }
}

/**
 * Vendor Booth Payments — Roaming Multi-Booth Cart (2026-07-07)
 * ADR-015 (base cart mechanic, clones posPaymentController.confirmPaymentRequest's
 * Stripe pattern) + ADR-016 (distributed vendor payouts happen at settlement time,
 * not at charge time — the cart charge itself is unchanged: one PaymentIntent on
 * the organizer's stripeConnectId) + ADR-017 (assertBoothCartCheckoutAllowed guard,
 * server-side PaymentIntent re-verification before creating completion rows).
 *
 * Decision log 2026-07-07: add-items REJECTS both non-CONFIRMED booths AND
 * unclaimed (userId IS NULL) booths — the cheapest fix for the wash-trade blind
 * spot an unclaimed booth otherwise represents.
 */

/**
 * POST /api/organizer/hubs/:hubId/cart/start
 * Cashier (TeamMember JWT or X-Booth-Token) opens a BoothCartTransaction.
 * requireBoothTokenOrTeamMember() must run before this and populate req.boothAuth.
 */
export const startBoothCart = async (req: BoothAuthRequest, res: Response) => {
  try {
    const { hubId } = req.params;
    if (!req.boothAuth) return res.status(401).json({ error: 'Booth/team authentication required' });

    const hub = await prisma.saleHub.findUnique({ where: { id: hubId }, select: { id: true, isActive: true } });
    if (!hub) return res.status(404).json({ error: 'Hub not found' });
    // FIX (2026-08-31, live-confirmed gap): a closed market's register could still open a
    // brand-new cart with no warning at all. Block at the earliest possible point.
    if (!hub.isActive) {
      return res.status(403).json({ error: 'This market has been closed and can no longer accept payments.' });
    }

    // Refresh-during-sale fix (2026-08-01, live bug): a page refresh mid-sale used to
    // always create a brand-new PENDING cart, orphaning the previous one -- its RESERVED
    // items never got released (no cashier session left to /cancel it), so they vanished
    // from the visible cart AND from search (which only shows AVAILABLE items) forever.
    // Find-or-reuse this identity's existing PENDING cart on this hub before creating a
    // new one. 200 (not 201) signals "reused" to callers that care to distinguish.
    const identityWhere =
      req.boothAuth.type === 'TEAM_MEMBER' ? { cashierTeamMemberId: req.boothAuth.teamMemberId, cashierBoothId: null } :
      req.boothAuth.type === 'BOOTH' ? { cashierBoothId: req.boothAuth.vendorBoothId, cashierTeamMemberId: null } :
      { cashierTeamMemberId: null, cashierBoothId: null }; // HUB_OWNER

    const existing = await prisma.boothCartTransaction.findFirst({
      where: { hubId, status: 'PENDING', ...identityWhere },
      orderBy: { createdAt: 'desc' },
    });
    if (existing) return res.status(200).json(existing);

    const cart = await prisma.boothCartTransaction.create({
      data: {
        hubId,
        // A HUB_OWNER cart stores null in BOTH columns. That is deliberate and it is a
        // legal row: schema.prisma:5641-5644 makes both FKs optional. The owner has no
        // TeamMember row to reference and is not a vendor, so writing either id would be
        // false. The owner is still a protected party in the fraud guard -- it derives
        // the hub organizer's User from hubId alone (checkoutGuard.ts:456-459), not from
        // cashierTeamMemberId.
        cashierTeamMemberId: req.boothAuth.type === 'TEAM_MEMBER' ? req.boothAuth.teamMemberId : null,
        cashierBoothId: req.boothAuth.type === 'BOOTH' ? req.boothAuth.vendorBoothId : null,
        status: 'PENDING',
        boothsRepresented: [],
      },
    });

    return res.status(201).json(cart);
  } catch (error) {
    console.error('[startBoothCart] Error:', error);
    return res.status(500).json({ error: 'Failed to start cart' });
  }
};

/**
 * POST /api/organizer/hubs/:hubId/cart/:cartTransactionId/items
 * Add item(s) to the cart. Server resolves each item's booth membership DYNAMICALLY
 * (2026-07-24 rework, Patrick's decision -- see claude_docs/feature-notes for the
 * contract): an Item no longer needs a pre-set vendorBoothId tag. Instead, the
 * item's owner (Item.organizerId -- denormalized, stays populated even for
 * saleId-null "persistent inventory" items, unlike going through Sale.organizerId)
 * is resolved to their User, and we check whether that User holds a CONFIRMED
 * VendorBooth at THIS hub. Under Patrick's mall-only-earns-a-cut-through-its-own-POS
 * model, this is the one and only place that decision gets enforced -- a vendor's
 * item sold any other way (their own Terminal/online checkout, eBay, Facebook)
 * never reaches this function, so the mall correctly gets no cut on it.
 *
 * Item.vendorBoothId is still WRITTEN here (as part of the RESERVED update below)
 * so every downstream consumer (resolveBoothLegItems, the cancel path) keeps
 * working completely unchanged -- it's now a derived, reservation-scoped value
 * instead of something a vendor/organizer pre-sets, not a dead field.
 *
 * Rejects items whose status !== 'AVAILABLE', OR whose owner has no CONFIRMED
 * VendorBooth at this hub at all (covers: not a vendor here, booth at a different
 * hub, booth not yet CONFIRMED, booth unclaimed -- VendorBooth.userId IS NULL rows
 * can never match this query since we search FOR a specific non-null userId, so
 * the 2026-07-07 "unclaimed booths hard-blocked" invariant holds for free with no
 * separate check needed). All reasons collapse to the same generic strings as
 * before so no distinct signal is ever leaked to the caller.
 * Body: { itemIds: string[] }
 */
export const addBoothCartItems = async (req: BoothAuthRequest, res: Response) => {
  try {
    const { hubId, cartTransactionId } = req.params;
    const { itemIds } = req.body as { itemIds?: string[] };
    if (!req.boothAuth) return res.status(401).json({ error: 'Booth/team authentication required' });
    if (!Array.isArray(itemIds) || itemIds.length === 0) {
      return res.status(400).json({ error: 'itemIds is required and must be a non-empty array' });
    }

    // Fix 2 (2026-08-01): the hub's own organizerId, so an item belonging to the hub
    // OWNER (not a claimed vendor) can be recognized below and lazily routed to the
    // synthetic house booth instead of being rejected as "not a vendor here."
    const hub = await prisma.saleHub.findUnique({ where: { id: hubId }, select: { organizerId: true, isActive: true } });
    if (!hub) return res.status(404).json({ error: 'Hub not found' });
    // FIX (2026-08-31, live-confirmed gap): if the market is closed mid-session (cart was
    // started before close, items added after), block the add rather than let the cart grow.
    if (!hub.isActive) {
      return res.status(403).json({ error: 'This market has been closed and can no longer accept payments.' });
    }

    const cart = await prisma.boothCartTransaction.findFirst({ where: { id: cartTransactionId, hubId } });
    if (!cart) return res.status(404).json({ error: 'Cart not found' });
    if (!callerOwnsCart(req.boothAuth, cart)) return res.status(403).json({ error: CART_NOT_YOURS_ERROR });
    if (cart.status !== 'PENDING') {
      return res.status(409).json({ error: `Cart is not open for edits (status: ${cart.status})` });
    }

    const items = await prisma.item.findMany({
      where: { id: { in: itemIds } },
      select: {
        id: true, title: true, price: true, status: true, organizerId: true, boothEligible: true,
      },
    });

    if (items.length !== itemIds.length) {
      return res.status(400).json({ error: 'One or more items not found' });
    }

    // Batch-resolve owner (Item.organizerId -> Organizer.userId) then batch-check
    // for a CONFIRMED VendorBooth at this hub per resolved userId. Two small
    // queries regardless of batch size, not N+1.
    const distinctOrganizerIds = Array.from(
      new Set(items.map((i) => i.organizerId).filter((id): id is string => !!id))
    );
    const organizers = distinctOrganizerIds.length
      ? await prisma.organizer.findMany({ where: { id: { in: distinctOrganizerIds } }, select: { id: true, userId: true } })
      : [];
    const organizerIdToUserId = new Map(organizers.map((o) => [o.id, o.userId]));

    const candidateUserIds = Array.from(new Set(organizers.map((o) => o.userId)));
    const confirmedBooths = candidateUserIds.length
      ? await prisma.vendorBooth.findMany({
          where: { hubId, status: 'CONFIRMED', userId: { in: candidateUserIds } },
          select: { id: true, userId: true },
        })
      : [];
    const userIdToBooth = new Map(confirmedBooths.map((b) => [b.userId as string, b]));

    const rejected: Array<{ itemId: string; reason: string }> = [];
    const accepted: Array<{ id: string; title: string; price: number | null; vendorBoothId: string }> = [];

    // Fix 2 (2026-08-01): lazily resolved at most once per request, only if actually
    // needed (an item owned by the hub itself with no pre-existing CONFIRMED booth
    // match). `undefined` = not yet attempted; `null` = attempted and unavailable
    // (hub/organizer missing) -- distinct from "not attempted" so we never retry.
    let houseBooth: { id: string; userId: string; stripeAccountId: string | null } | null | undefined;

    for (const item of items) {
      if (item.status !== 'AVAILABLE') {
        rejected.push({ itemId: item.id, reason: 'ITEM_NOT_AVAILABLE' });
        continue;
      }
      const ownerUserId = item.organizerId ? organizerIdToUserId.get(item.organizerId) : undefined;
      let booth = ownerUserId ? userIdToBooth.get(ownerUserId) : undefined;
      if (!booth && item.organizerId && item.organizerId === hub.organizerId) {
        if (houseBooth === undefined) {
          houseBooth = await getOrCreateHouseBooth(hubId);
        }
        if (houseBooth) booth = { id: houseBooth.id, userId: houseBooth.userId };
      }
      if (!booth) {
        rejected.push({ itemId: item.id, reason: 'ITEM_NOT_AVAILABLE' });
        continue;
      }
      accepted.push({ id: item.id, title: item.title, price: item.price, vendorBoothId: booth.id });
    }

    if (accepted.length === 0) {
      return res.status(409).json({ error: 'No items could be added to the cart', rejected });
    }

    const newBoothIds = Array.from(new Set(accepted.map((i) => i.vendorBoothId)));
    const mergedBoothsRepresented = Array.from(new Set([...cart.boothsRepresented, ...newBoothIds]));

    const newTotal = accepted.reduce((sum, i) => sum + (i.price || 0), 0) + Number(cart.totalAmount);

    const updated = await prisma.boothCartTransaction.update({
      where: { id: cart.id },
      data: {
        boothsRepresented: mergedBoothsRepresented,
        totalAmount: newTotal,
      },
    });

    // Reserve items against this cart so a second concurrent cart can't also grab
    // them, AND persist BOTH the resolved vendorBoothId and this cart's own id.
    // boothCartTransactionId (P0 fix, 2026-07-28) is what makes a reservation
    // cart-scoped: resolveBoothLegItems and the cancel path below now key off it, so a
    // second cart on the same hub can never sum or release this cart's items.
    // Grouped by resolved booth since one addBoothCartItems call can legitimately
    // span multiple different vendors' items in one shared cart.
    const acceptedByBooth = new Map<string, string[]>();
    for (const i of accepted) {
      const list = acceptedByBooth.get(i.vendorBoothId) ?? [];
      list.push(i.id);
      acceptedByBooth.set(i.vendorBoothId, list);
    }
    await Promise.all(
      Array.from(acceptedByBooth.entries()).map(([boothId, ids]) =>
        prisma.item.updateMany({
          where: { id: { in: ids } },
          data: { status: 'RESERVED', vendorBoothId: boothId, boothCartTransactionId: cart.id },
        })
      )
    );

    return res.status(200).json({
      cart: updated,
      accepted: accepted.map((i) => ({ itemId: i.id, title: i.title, price: i.price })),
      rejected,
    });
  } catch (error) {
    console.error('[addBoothCartItems] Error:', error);
    return res.status(500).json({ error: 'Failed to add items to cart' });
  }
};

/**
 * DELETE /api/organizer/hubs/:hubId/cart/:cartTransactionId/items/:itemId
 * Releases one RESERVED item back to AVAILABLE and removes it from this cart.
 * Only allowed while the cart is still PENDING (mirrors addBoothCartItems's own
 * status guard) -- once checkout has started (IN_PROGRESS or later), a leg may
 * already reference this item's booth, so removal is not safe/supported here.
 * Mirrors addBoothCartItems's reservation write exactly (status, vendorBoothId,
 * boothCartTransactionId -- confirmed those are the only three fields that write
 * sets) so the release is fully symmetric with the reservation.
 */
export const removeBoothCartItem = async (req: BoothAuthRequest, res: Response) => {
  try {
    const { hubId, cartTransactionId, itemId } = req.params;
    if (!req.boothAuth) return res.status(401).json({ error: 'Booth/team authentication required' });

    const cart = await prisma.boothCartTransaction.findFirst({ where: { id: cartTransactionId, hubId } });
    if (!cart) return res.status(404).json({ error: 'Cart not found' });
    if (!callerOwnsCart(req.boothAuth, cart)) return res.status(403).json({ error: CART_NOT_YOURS_ERROR });
    if (cart.status !== 'PENDING') {
      return res.status(409).json({ error: `Cart is not open for edits (status: ${cart.status})` });
    }

    const item = await prisma.item.findFirst({
      where: { id: itemId, status: 'RESERVED', boothCartTransactionId: cart.id },
      select: { id: true, price: true, vendorBoothId: true },
    });
    if (!item) return res.status(404).json({ error: 'Item is not reserved in this cart' });

    // P1 TOCTOU/lost-update fix (findasale-hacker adversarial pass, 2026-08-01).
    // Three races closed here, all requiring only the ALREADY-authorized cart owner
    // (no cross-tenant IDOR -- callerOwnsCart above already proved that), so this is
    // hardening against racing-yourself / double-fire, not a new attacker surface:
    //
    // 1) Money correctness (item release vs. checkout start): the PENDING checks
    //    above are plain reads. Without a re-check at write time, a concurrent
    //    authorizeBoothCart*Leg call could flip this cart PENDING -> IN_PROGRESS
    //    (beginCartCheckout) and read this item as still RESERVED into a leg's
    //    amountCents, while THIS request's release still lands, unreserving the item
    //    (and freeing it for resale) even though the shopper's card is about to be
    //    authorized/captured for it. Guarding the final cart write with the SAME
    //    conditional-updateMany CAS idiom beginCartCheckout/captureBoothCart already
    //    use (`status: 'PENDING'` in the WHERE, count checked after) -- and reverting
    //    the item release if the CAS loses -- closes the common case: once
    //    beginCartCheckout's flip has landed, this request's own final write fails
    //    and the item is put back to RESERVED before this handler returns, so any
    //    authorize call that reads it afterward sees it correctly still reserved.
    //
    // 2) Double-removal (two racing calls for the SAME item): item release is now a
    //    conditional updateMany keyed on `status: 'RESERVED'` (not a plain update by
    //    id), so a second racer that already lost the initial findFirst-style read
    //    still can't double-decrement the cart if it somehow reaches this point --
    //    it gets count 0 and a 409, matching this file's existing claim-key idiom
    //    (e.g. authorizeBoothCartTerminalLeg's BoothCartLeg claim).
    //
    // 3) Lost update on cart.boothsRepresented/totalAmount (two racing calls for
    //    DIFFERENT items in the same cart): the old code diffed against a `cart`
    //    snapshot read at the TOP of the request, so the second call to commit could
    //    silently overwrite the first call's change with a stale value. totalAmount
    //    now uses Prisma's atomic `decrement` (a single `SET total = total - x` at
    //    the DB layer, safe under any interleaving) instead of a precomputed value.
    //    boothsRepresented is now re-derived from a LIVE query of this cart's
    //    currently-RESERVED items (same live-query style this function already used
    //    for `stillHasBoothItems` below), not filtered off the stale snapshot, so a
    //    concurrent sibling call's change is never clobbered.
    const releaseClaim = await prisma.item.updateMany({
      where: { id: item.id, status: 'RESERVED', boothCartTransactionId: cart.id },
      data: { status: 'AVAILABLE', vendorBoothId: null, boothCartTransactionId: null },
    });
    if (releaseClaim.count !== 1) {
      return res.status(409).json({ error: 'Item is not reserved in this cart (concurrent request)' });
    }

    const remainingBooths = await prisma.item.findMany({
      where: { boothCartTransactionId: cart.id, status: 'RESERVED' },
      select: { vendorBoothId: true },
      distinct: ['vendorBoothId'],
    });
    const newBoothsRepresented = remainingBooths
      .map((b) => b.vendorBoothId)
      .filter((id): id is string => !!id);

    const cas = await prisma.boothCartTransaction.updateMany({
      where: { id: cart.id, status: 'PENDING' },
      data: { boothsRepresented: newBoothsRepresented, totalAmount: { decrement: item.price || 0 } },
    });
    if (cas.count !== 1) {
      // Lost the race to a concurrent checkout-start (beginCartCheckout already
      // flipped this cart to IN_PROGRESS). Revert the release above so the item
      // stays correctly RESERVED/attributed to its booth for whatever leg is now
      // being authorized against it, exactly as if this request had arrived a
      // moment earlier and simply hit the (still real, still enforced) PENDING
      // check at the top of this handler.
      await prisma.item.updateMany({
        where: { id: item.id, status: 'AVAILABLE', boothCartTransactionId: null },
        data: { status: 'RESERVED', vendorBoothId: item.vendorBoothId, boothCartTransactionId: cart.id },
      });
      const freshCart = await prisma.boothCartTransaction.findFirst({ where: { id: cart.id } });
      return res.status(409).json({ error: `Cart is not open for edits (status: ${freshCart?.status ?? 'unknown'})` });
    }

    let updated = await prisma.boothCartTransaction.findFirstOrThrow({ where: { id: cart.id } });
    if (Number(updated.totalAmount) < 0) {
      // Defense-in-depth floor: decrement is atomic and correct under concurrency,
      // but can only floor at 0 as a follow-up write, not inline -- guards against
      // totalAmount ever going negative if it was already inconsistent with the
      // live RESERVED-items sum for any other reason.
      updated = await prisma.boothCartTransaction.update({ where: { id: cart.id }, data: { totalAmount: 0 } });
    }

    return res.status(200).json({ removed: true, cart: updated });
  } catch (error) {
    console.error('[removeBoothCartItem] Error:', error);
    return res.status(500).json({ error: 'Failed to remove item from cart' });
  }
};

/**
 * ADR-020 (2026-07-07, Patrick-approved same session): Standard-account migration.
 * Replaces the old single-PaymentIntent-per-cart model (`chargeBoothCart` /
 * `confirmBoothCart`, one Direct charge on the ORGANIZER's stripeConnectId, vendor
 * payouts settled later via Transfer) with a sequential per-booth model — one
 * PaymentIntent PER VENDOR BOOTH, each a Direct charge on THAT booth's own Standard
 * account (`stripeAccountId`). Terminal rail: authorize-all (one physical tap per
 * booth, `capture_method: 'manual'`), then capture-all together. QR/in-app rail:
 * one shared PaymentMethod (via a platform SetupIntent) cloned into each booth's
 * account and confirmed off_session, also `capture_method: 'manual'` so it can
 * converge on the SAME capture-all endpoint as the Terminal rail. Any leg that
 * can't be resolved cancels the whole cart (free, since nothing is captured until
 * every leg has authorized) — v1 behavior is whole-cart-cancel-and-restart, NOT
 * partial-capture/split-transaction (explicitly rejected by Patrick's sign-off).
 *
 * Cart-lock (checkoutGuard timing gap flagged in ADR-020): `assertBoothCartCheckoutAllowed`
 * runs exactly ONCE per cart, at the first leg's authorize call, inside
 * `beginCartCheckout` below. That same call atomically flips
 * `BoothCartTransaction.status` PENDING -> IN_PROGRESS via a conditional
 * `updateMany` (only matches a row still PENDING, so a race can't double-run the
 * guard or double-lock). `addBoothCartItems` above already rejects any cart whose
 * status isn't PENDING — so this status flip IS the cart lock; no separate schema
 * field was needed for it. `boothsRepresented` therefore can't change out from
 * under the guard's evaluation once charging starts.
 */

const isTerminalSimulated = () => process.env.STRIPE_TERMINAL_SIMULATED === 'true';

/**
 * The RESERVED items of ONE vendor booth that belong to THIS cart, and nothing else.
 *
 * P0 fix (findasale-hacker fix-and-reverify pass, 2026-07-28): this function took
 * `cartTransactionId` and never used it -- the query was `{ status: 'RESERVED',
 * vendorBoothId }`, i.e. EVERY item that booth had reserved anywhere on the hub. Two
 * concurrent carts holding items of the same booth therefore each summed BOTH carts'
 * items: cart-2 could charge its shopper for cart-1's goods and inflate the platform
 * fee and the hub owner's revenue-share cut along with it. The ambiguity the old
 * comment described is now closed by the explicit Item.boothCartTransactionId link
 * written at add-items time, so this filter is exact rather than best-effort.
 *
 * Callers: leg amounts (both rails), the cashier's booth summary, and the capture
 * finalize loop -- all of which must see the same, cart-exact set.
 */
async function resolveBoothLegItems(cartTransactionId: string, boothsRepresented: string[], vendorBoothId: string) {
  if (!boothsRepresented.includes(vendorBoothId)) return [];
  return prisma.item.findMany({
    where: { status: 'RESERVED', vendorBoothId, boothCartTransactionId: cartTransactionId },
    select: { id: true, price: true, title: true, vendorBoothId: true },
  });
}

/**
 * Runs the checkout guard exactly once per cart (on the FIRST leg, whichever rail),
 * and atomically locks the cart (PENDING -> IN_PROGRESS) so `addBoothCartItems`
 * rejects further edits from this point on. Idempotent for subsequent legs of the
 * same cart: if the cart is already IN_PROGRESS, this is a no-op (guard already ran).
 * Throws CheckoutGuardError (caller must 403) or a plain Error for cart-state issues.
 */
async function beginCartCheckout(params: {
  cart: { id: string; hubId: string; status: string; boothsRepresented: string[] };
  hubId: string;
  cashierTeamMemberId?: string | null;
  cashierBoothId?: string | null;
  context: string;
}): Promise<void> {
  const { cart, hubId, cashierTeamMemberId, cashierBoothId, context } = params;

  if (cart.status === 'IN_PROGRESS') return; // guard already ran for an earlier leg in this cart

  if (cart.status !== 'PENDING') {
    throw new Error(`CART_NOT_CHARGEABLE:${cart.status}`);
  }

  // FIX (2026-08-31, S-EXT-CRAIGSLIST-QA session, live-confirmed gap): SaleHub.isActive was
  // never checked anywhere in this file -- a closed market's register could still authorize
  // and capture real charges. This is the single choke point for all three payment rails
  // (terminal + QR both call this directly; cash capture calls it too, see
  // captureBoothCartCash below), so one check here closes the gap for all of them at the
  // authorize step. captureBoothCart (the separate post-authorize capture step for the
  // terminal/QR rails) has its own direct check for the narrower authorize->capture window --
  // see its own isActive check below.
  const hubForActiveCheck = await prisma.saleHub.findUnique({ where: { id: hubId }, select: { isActive: true } });
  if (!hubForActiveCheck || !hubForActiveCheck.isActive) {
    throw new CheckoutGuardError('This market has been closed and can no longer accept payments.');
  }

  await assertBoothCartCheckoutAllowed({
    // No buyer id is passed, deliberately -- see the note on the same call inside
    // captureBoothCart. A booth cart has no authenticated shopper identity, and the
    // cashier's assertion about who the shopper is was never evidence of anything.
    hubId,
    cartTransactionId: cart.id,
    boothsRepresented: cart.boothsRepresented,
    cashierTeamMemberId,
    cashierBoothId,
    prisma,
    context,
  });

  // Conditional update — only matches a row still PENDING. A second concurrent
  // call (e.g. two legs racing in) either gets count 1 (it wins the lock, but the
  // guard above already ran redundantly for both — acceptable, guard is read-only
  // and idempotent) or count 0 (someone else already locked it — treat as success,
  // not an error, since the net effect — locked + guard passed — is the same).
  await prisma.boothCartTransaction.updateMany({
    where: { id: cart.id, status: 'PENDING' },
    data: { status: 'IN_PROGRESS' },
  });
}

/**
 * GET /api/organizer/hubs/:hubId/cart/:cartTransactionId/booth-summary
 * Per-booth subtotal breakdown for the cashier's sequential tap UI ("tap for
 * Booth A — $23.00", "tap for Booth B — $41.00", ...) and for the QR rail's
 * per-leg amount resolution. Also reports each booth's onboarding readiness
 * (stripeAccountType === 'standard' && stripeOnboarded) so the frontend can
 * surface a clear error before the cashier starts tapping.
 */
export const getBoothCartSummary = async (req: BoothAuthRequest, res: Response) => {
  try {
    const { hubId, cartTransactionId } = req.params;
    if (!req.boothAuth) return res.status(401).json({ error: 'Booth/team authentication required' });

    const cart = await prisma.boothCartTransaction.findFirst({ where: { id: cartTransactionId, hubId } });
    if (!cart) return res.status(404).json({ error: 'Cart not found' });
    if (!callerOwnsCart(req.boothAuth, cart)) return res.status(403).json({ error: CART_NOT_YOURS_ERROR });

    const booths = await prisma.vendorBooth.findMany({
      where: { id: { in: cart.boothsRepresented } },
      select: { id: true, vendorName: true, boothNumber: true, stripeAccountId: true, stripeAccountType: true, stripeOnboarded: true },
    });

    const legs = await prisma.boothCartLeg.findMany({ where: { cartTransactionId: cart.id } });
    const legsByBooth = new Map(legs.map((l) => [l.vendorBoothId, l]));

    const summary = await Promise.all(
      booths.map(async (booth) => {
        const items = await resolveBoothLegItems(cart.id, cart.boothsRepresented, booth.id);
        const subtotalCents = Math.round(items.reduce((sum, i) => sum + (i.price || 0), 0) * 100);
        const leg = legsByBooth.get(booth.id);
        return {
          vendorBoothId: booth.id,
          vendorName: booth.vendorName,
          boothNumber: booth.boothNumber,
          subtotalCents,
          itemCount: items.length,
          readyForStandardCharge: booth.stripeAccountType === 'standard' && booth.stripeOnboarded && !!booth.stripeAccountId,
          leg: leg ? { legId: leg.id, status: leg.status, rail: leg.rail } : null,
        };
      })
    );

    return res.status(200).json({ cartStatus: cart.status, booths: summary });
  } catch (error) {
    console.error('[getBoothCartSummary] Error:', error);
    return res.status(500).json({ error: 'Failed to load cart summary' });
  }
};

/**
 * GET /api/organizer/hubs/:hubId/cart/:cartTransactionId
 * Itemized cart contents (2026-08-01, refresh-during-sale fix companion) -- lets the
 * frontend hydrate its local `cart` UI state from the server's source of truth
 * (Item rows RESERVED against this cart) on every mount, instead of trusting an
 * in-memory array that a page refresh wipes. Paired with startBoothCart's new
 * find-or-reuse behavior: after a refresh, the reused PENDING cart's items are
 * fetched here and repopulated into the visible cart.
 */
export const getBoothCartContents = async (req: BoothAuthRequest, res: Response) => {
  try {
    const { hubId, cartTransactionId } = req.params;
    if (!req.boothAuth) return res.status(401).json({ error: 'Booth/team authentication required' });
    const cart = await prisma.boothCartTransaction.findFirst({ where: { id: cartTransactionId, hubId } });
    if (!cart) return res.status(404).json({ error: 'Cart not found' });
    if (!callerOwnsCart(req.boothAuth, cart)) return res.status(403).json({ error: CART_NOT_YOURS_ERROR });

    const items = await prisma.item.findMany({
      where: { status: 'RESERVED', boothCartTransactionId: cart.id },
      select: { id: true, title: true, price: true, vendorBoothId: true, photoUrls: true },
    });
    const booths = cart.boothsRepresented.length
      ? await prisma.vendorBooth.findMany({ where: { id: { in: cart.boothsRepresented } }, select: { id: true, vendorName: true, boothNumber: true } })
      : [];
    const boothById = new Map(booths.map((b) => [b.id, b]));

    return res.status(200).json({
      cart: { id: cart.id, hubId: cart.hubId, status: cart.status, totalAmount: cart.totalAmount.toString() },
      items: items.map((i) => ({
        itemId: i.id, title: i.title, price: i.price, photoUrl: i.photoUrls?.[0] ?? null,
        vendorBoothId: i.vendorBoothId,
        vendorName: i.vendorBoothId ? boothById.get(i.vendorBoothId)?.vendorName ?? null : null,
        boothNumber: i.vendorBoothId ? boothById.get(i.vendorBoothId)?.boothNumber ?? null : null,
      })),
    });
  } catch (error) {
    console.error('[getBoothCartContents] Error:', error);
    return res.status(500).json({ error: 'Failed to load cart contents' });
  }
};

/**
 * POST /api/organizer/hubs/:hubId/cart/:cartTransactionId/terminal/connection-token
 * Body: { vendorBoothId }
 * Booth-scoped Terminal connection token — the physical reader needs a fresh token
 * scoped to EACH booth's own connected account before that booth's leg can be
 * tapped (mirrors terminalController.createConnectionToken, but per-booth instead
 * of per-organizer).
 */
export const createBoothCartTerminalConnectionToken = async (req: BoothAuthRequest, res: Response) => {
  try {
    const { hubId, cartTransactionId } = req.params;
    const { vendorBoothId } = req.body as { vendorBoothId?: string };
    if (!req.boothAuth) return res.status(401).json({ error: 'Booth/team authentication required' });
    if (!vendorBoothId) return res.status(400).json({ error: 'vendorBoothId is required' });

    const cart = await prisma.boothCartTransaction.findFirst({ where: { id: cartTransactionId, hubId } });
    if (!cart) return res.status(404).json({ error: 'Cart not found' });
    if (!callerOwnsCart(req.boothAuth, cart)) return res.status(403).json({ error: CART_NOT_YOURS_ERROR });
    if (!cart.boothsRepresented.includes(vendorBoothId)) {
      return res.status(400).json({ error: 'Booth is not represented in this cart' });
    }

    // Stripe removal (2026-09-12): Stripe's platform account is permanently closed --
    // this Terminal-hardware connection-token flow has no live path left at all
    // (simulated mode included, since simulated PaymentIntents still go through the
    // same closed platform account). There is no Square Terminal integration anywhere
    // in this codebase (confirmed via repo-wide grep), so unlike the checkout flows
    // this sweep converted, there is no drop-in replacement to route to -- blocked
    // outright rather than left to fail unpredictably against a dead account. The
    // booth-lookup + connection-token-create code that used to follow here has been
    // deleted outright, not left as unreachable code.
    return res.status(503).json({
      error: 'Card-reader checkout is temporarily unavailable. Please use QR/in-app checkout or cash instead.',
      code: 'TERMINAL_UNAVAILABLE',
    });
  } catch (error) {
    console.error('[createBoothCartTerminalConnectionToken] Error:', error);
    return res.status(500).json({ error: 'Failed to create Terminal connection token' });
  }
};

/**
 * POST /api/organizer/hubs/:hubId/cart/:cartTransactionId/terminal/authorize
 * Body: { vendorBoothId }
 * ADR-020 step 3: creates a `card_present`, `capture_method: 'manual'`
 * PaymentIntent scoped to THIS booth's own `stripeAccountId` for THIS booth's
 * subtotal. The cashier taps the physical card against the reader for the
 * returned clientSecret next (client-side `collectPaymentMethod` +
 * `processPayment`, same SDK calls `pages/organizer/pos.tsx` already uses).
 * Runs the checkout guard + cart lock on the FIRST leg only (see beginCartCheckout).
 */
export const authorizeBoothCartTerminalLeg = async (req: BoothAuthRequest, res: Response) => {
  try {
    const { hubId, cartTransactionId } = req.params;
    const { vendorBoothId } = req.body as { vendorBoothId?: string };
    if (!req.boothAuth) return res.status(401).json({ error: 'Booth/team authentication required' });
    if (!vendorBoothId) return res.status(400).json({ error: 'vendorBoothId is required' });

    const cart = await prisma.boothCartTransaction.findFirst({ where: { id: cartTransactionId, hubId } });
    if (!cart) return res.status(404).json({ error: 'Cart not found' });
    if (!callerOwnsCart(req.boothAuth, cart)) return res.status(403).json({ error: CART_NOT_YOURS_ERROR });
    if (!cart.boothsRepresented.includes(vendorBoothId)) {
      return res.status(400).json({ error: 'Booth is not represented in this cart' });
    }

    const existingLeg = await prisma.boothCartLeg.findFirst({
      where: { cartTransactionId: cart.id, vendorBoothId, status: { in: ['PENDING', 'REQUIRES_CAPTURE', 'CAPTURED'] } },
    });
    if (existingLeg) {
      return res.status(409).json({ error: 'This booth already has an active leg on this cart', legId: existingLeg.id, status: existingLeg.status });
    }

    // Stripe removal (2026-09-12): Stripe's platform account is permanently closed, and
    // there is no Square Terminal integration anywhere in this codebase (confirmed via
    // repo-wide grep) -- this whole rail (card-present hardware reader, one PaymentIntent
    // per booth on that booth's own Connect account) has no live path left, simulated
    // mode included. Blocked BEFORE beginCartCheckout (the cart-lock side effect the
    // original body ran next) so a doomed Terminal attempt never locks the cart out of
    // the still-working Square/cash rails. The ~150 lines of now-fully-dead per-booth
    // fraud-hold check, live Stripe capability preflight, and PaymentIntent-create logic
    // that used to follow here have been deleted outright, not left as unreachable code --
    // see createBoothCartTerminalConnectionToken above for the fuller rationale.
    return res.status(503).json({
      error: 'Card-reader checkout is temporarily unavailable. Please use QR/in-app checkout or cash instead.',
      code: 'TERMINAL_UNAVAILABLE',
    });
  } catch (error) {
    console.error('[authorizeBoothCartTerminalLeg] Error:', error);
    return res.status(500).json({ error: 'Failed to authorize booth leg' });
  }
};

/**
 * POST /api/organizer/hubs/:hubId/cart/:cartTransactionId/qr/setup-intent
 * Body: none.
 * ADR-020 QR/in-app rail, step 1: collect the shopper's card ONCE via a SetupIntent
 * on the PLATFORM account (not any single booth's account — this PaymentMethod
 * gets cloned to each booth next). Runs the checkout guard + cart lock on this
 * first call, same as the Terminal rail's authorize endpoint.
 */
export const createBoothCartQrSetupIntent = async (req: BoothAuthRequest, res: Response) => {
  try {
    const { hubId, cartTransactionId } = req.params;
    if (!req.boothAuth) return res.status(401).json({ error: 'Booth/team authentication required' });

    const cart = await prisma.boothCartTransaction.findFirst({ where: { id: cartTransactionId, hubId } });
    if (!cart) return res.status(404).json({ error: 'Cart not found' });
    if (!callerOwnsCart(req.boothAuth, cart)) return res.status(403).json({ error: CART_NOT_YOURS_ERROR });

    try {
      await beginCartCheckout({
        cart,
        hubId,
        cashierTeamMemberId: req.boothAuth.type === 'TEAM_MEMBER' ? req.boothAuth.teamMemberId : null,
        cashierBoothId: req.boothAuth.type === 'BOOTH' ? req.boothAuth.vendorBoothId : null,
        context: 'boothCartQrSetupIntent',
      });
    } catch (guardError: any) {
      if (guardError instanceof CheckoutGuardError) {
        return res.status(403).json({ error: guardError.message });
      }
      if (typeof guardError?.message === 'string' && guardError.message.startsWith('CART_NOT_CHARGEABLE:')) {
        return res.status(409).json({ error: `Cart cannot be charged (status: ${guardError.message.split(':')[1]})` });
      }
      throw guardError;
    }

    // Stripe removal (2026-09-12): this used to create an ad hoc platform-level Stripe
    // Customer + SetupIntent for the walk-in shopper's phone page to confirm via
    // Stripe.js. Stripe's platform account is permanently closed, so this can never
    // succeed for a new cart again. Square QR (postBoothCartSquareToken /
    // getBoothCartSquareTokenStatus / authorizeBoothCartSquareLegs, below) is the live
    // replacement rail -- it has no server-hosted session object to hand back here, so
    // there is no drop-in Square equivalent for this specific two-step
    // setup-intent-then-authorize shape; the whole rail is blocked, not adapted.
    return res.status(503).json({
      error: 'QR/in-app card checkout via this rail is temporarily unavailable. Please use the Square QR checkout instead.',
      code: 'STRIPE_QR_UNAVAILABLE',
    });
  } catch (error) {
    console.error('[createBoothCartQrSetupIntent] Error:', error);
    return res.status(500).json({ error: 'Failed to start QR/in-app checkout' });
  }
};

/**
 * POST /api/organizer/hubs/:hubId/cart/:cartTransactionId/qr/authorize
 * Body: { setupIntentId }
 * ADR-020 QR/in-app rail, step 2: after the shopper confirms the SetupIntent on
 * their own phone (Stripe.js `confirmCardSetup`), clone the resulting
 * PaymentMethod to EACH represented booth's Standard account
 * (docs.stripe.com/connect/direct-charges-multiple-accounts) and confirm one
 * `capture_method: 'manual'`, `off_session: true` PaymentIntent per booth — no
 * further shopper interaction. Converges on the same `captureBoothCart` endpoint
 * the Terminal rail uses once every leg has authorized. Partial-failure handling
 * mirrors the Terminal flow: if any leg fails to confirm, every already-authorized
 * (uncaptured) leg from this call is cancelled (free) and the whole cart fails —
 * same v1 whole-cart-cancel-and-restart policy as the Terminal rail, not
 * partial-capture/split-transaction.
 */
export const authorizeBoothCartQrLegs = async (req: BoothAuthRequest, res: Response) => {
  try {
    const { hubId, cartTransactionId } = req.params;
    const { setupIntentId } = req.body as { setupIntentId?: string };
    if (!req.boothAuth) return res.status(401).json({ error: 'Booth/team authentication required' });
    if (!setupIntentId) return res.status(400).json({ error: 'setupIntentId is required' });

    const cart = await prisma.boothCartTransaction.findFirst({ where: { id: cartTransactionId, hubId } });
    if (!cart) return res.status(404).json({ error: 'Cart not found' });
    if (!callerOwnsCart(req.boothAuth, cart)) return res.status(403).json({ error: CART_NOT_YOURS_ERROR });

    // Stripe removal (2026-09-12): createBoothCartQrSetupIntent above (step 1 of this
    // same rail) is now blocked unconditionally -- no legitimate caller can ever reach
    // this step 2 with a real setupIntentId again. Blocked here too, defense-in-depth
    // against a raw API caller supplying a stale/fabricated one, before the rest of
    // this function's ~230 lines of now-fully-dead per-booth PaymentMethod-clone +
    // PaymentIntent-confirm logic (which those lines have been deleted, not just
    // gated -- confirmed via repo-wide grep that createBoothCartQrSetupIntent is this
    // endpoint's only possible feeder and it can no longer produce a real setupIntentId).
    // Square QR (authorizeBoothCartSquareLegs) is the live replacement rail.
    return res.status(503).json({
      error: 'QR/in-app card checkout via this rail is temporarily unavailable. Please use the Square QR checkout instead.',
      code: 'STRIPE_QR_UNAVAILABLE',
    });
  } catch (error) {
    console.error('[authorizeBoothCartQrLegs] Error:', error);
    return res.status(500).json({ error: 'Failed to authorize QR legs' });
  }
};

// ============================================================================
// Square QR/in-app rail (vendor-booth-cart-checkout dispatch, 2026-09-07)
// ============================================================================
// Square has no server-hosted session object the register can poll directly the way
// Stripe's SetupIntent+clientSecret works (see BoothCartTransaction.squarePendingSourceId's
// own schema comment for the full rationale) -- the shopper's OWN phone page tokenizes the
// card client-side via the Web Payments SDK, then POSTs the resulting one-time sourceId to
// postBoothCartSquareToken below. The register polls getBoothCartSquareTokenStatus, then
// calls authorizeBoothCartSquareLegs once ready. Three-endpoint shape replaces Stripe's
// two-endpoint (setup-intent + qr/authorize) shape because of this session-object gap.

/**
 * POST /api/organizer/hubs/:hubId/cart/:cartTransactionId/square/begin
 * Body: none.
 * Square QR/in-app rail, step 0: runs the checkout guard + cart lock (PENDING ->
 * IN_PROGRESS) exactly once for this cart -- same beginCartCheckout the Terminal
 * and (now-dead) Stripe QR rails' own first authorize call already runs.
 *
 * Stripe removal (2026-09-12), found while verifying this rail after blocking the
 * dead Stripe QR endpoints: this lock step used to happen ONLY as a side effect of
 * calling createBoothCartQrSetupIntent (the Stripe QR rail's first call). The
 * Square QR rail's register-side handler (handleVenueGenerateSquareQr in pos.tsx)
 * never called that endpoint or ran beginCartCheckout any other way -- meaning a
 * cart could never actually reach IN_PROGRESS via the Square rail on its own, and
 * postBoothCartSquareToken / authorizeBoothCartSquareLegs (both of which require
 * IN_PROGRESS) would 409 on every real attempt. This gives the Square QR rail its
 * own explicit lock step instead of silently depending on a Stripe sibling's side
 * effect -- confirmed via repo-wide grep that beginCartCheckout had exactly two
 * callers (createBoothCartQrSetupIntent, captureBoothCartCash) before this change,
 * and grep of pos.tsx confirming handleVenueGenerateSquareQr calls no backend
 * endpoint at all today. Frontend wiring (pos.tsx) is a separate flagged item.
 */
export const beginBoothCartSquareCheckout = async (req: BoothAuthRequest, res: Response) => {
  try {
    const { hubId, cartTransactionId } = req.params;
    if (!req.boothAuth) return res.status(401).json({ error: 'Booth/team authentication required' });

    const cart = await prisma.boothCartTransaction.findFirst({ where: { id: cartTransactionId, hubId } });
    if (!cart) return res.status(404).json({ error: 'Cart not found' });
    if (!callerOwnsCart(req.boothAuth, cart)) return res.status(403).json({ error: CART_NOT_YOURS_ERROR });

    try {
      await beginCartCheckout({
        cart,
        hubId,
        cashierTeamMemberId: req.boothAuth.type === 'TEAM_MEMBER' ? req.boothAuth.teamMemberId : null,
        cashierBoothId: req.boothAuth.type === 'BOOTH' ? req.boothAuth.vendorBoothId : null,
        context: 'boothCartSquareBegin',
      });
    } catch (guardError: any) {
      if (guardError instanceof CheckoutGuardError) {
        return res.status(403).json({ error: guardError.message });
      }
      if (typeof guardError?.message === 'string' && guardError.message.startsWith('CART_NOT_CHARGEABLE:')) {
        return res.status(409).json({ error: `Cart cannot be charged (status: ${guardError.message.split(':')[1]})` });
      }
      throw guardError;
    }

    return res.status(200).json({ ok: true });
  } catch (error) {
    console.error('[beginBoothCartSquareCheckout] Error:', error);
    return res.status(500).json({ error: 'Failed to start Square checkout' });
  }
};


/**
 * POST /api/organizer/hubs/:hubId/cart/:cartTransactionId/square/token
 * Body: { sourceId }
 * Called by the SHOPPER's own phone page (no booth/team-member auth -- the shopper has no
 * cashier credentials). Scoped by hubId + cartTransactionId + cart.status === 'IN_PROGRESS',
 * the same trust model the existing Stripe QR flow already relies on (a SetupIntent
 * clientSecret embedded in a URL is exactly this same "unguessable id in the URL is the
 * credential" posture -- not a weaker security boundary than what already shipped).
 * Overwrites any previous pending token for this cart (last write wins) -- mirrors Stripe's
 * own "no idempotency check, cashier retries on failure" simplicity for this rail.
 */
export const postBoothCartSquareToken = async (req: AuthRequest, res: Response) => {
  try {
    const { hubId, cartTransactionId } = req.params;
    const { sourceId } = req.body as { sourceId?: string };
    if (!sourceId) return res.status(400).json({ error: 'sourceId is required' });

    const cart = await prisma.boothCartTransaction.findFirst({ where: { id: cartTransactionId, hubId } });
    if (!cart) return res.status(404).json({ error: 'Cart not found' });
    if (cart.status !== 'IN_PROGRESS') {
      return res.status(409).json({ error: `Cart is not ready for card entry (status: ${cart.status})` });
    }

    await prisma.boothCartTransaction.update({
      where: { id: cart.id },
      data: { squarePendingSourceId: sourceId, squarePendingSourceIdSetAt: new Date() },
    });

    return res.status(200).json({ ok: true });
  } catch (error) {
    console.error('[postBoothCartSquareToken] Error:', error);
    return res.status(500).json({ error: 'Failed to record card token' });
  }
};

/**
 * GET /api/organizer/hubs/:hubId/cart/:cartTransactionId/square/token-status
 * Register-side poll (booth/team-member auth) -- mirrors the existing venueQrStatus 'waiting'
 * poll shape in pos.tsx, Square-flavored. Never returns the raw sourceId itself (not needed
 * by the polling caller, and keeps the token off the wire an extra time before it's consumed).
 */
export const getBoothCartSquareTokenStatus = async (req: BoothAuthRequest, res: Response) => {
  try {
    const { hubId, cartTransactionId } = req.params;
    if (!req.boothAuth) return res.status(401).json({ error: 'Booth/team authentication required' });
    const cart = await prisma.boothCartTransaction.findFirst({ where: { id: cartTransactionId, hubId } });
    if (!cart) return res.status(404).json({ error: 'Cart not found' });
    if (!callerOwnsCart(req.boothAuth, cart)) return res.status(403).json({ error: CART_NOT_YOURS_ERROR });
    return res.status(200).json({ ready: !!cart.squarePendingSourceId });
  } catch (error) {
    console.error('[getBoothCartSquareTokenStatus] Error:', error);
    return res.status(500).json({ error: 'Failed to check card token status' });
  }
};

/**
 * POST /api/organizer/hubs/:hubId/cart/:cartTransactionId/square/authorize
 * Body: none -- reads the pending sourceId from the DB (NOT the request body), so the
 * cashier's own request can never supply/override the shopper's card token (mirrors the
 * Stripe QR rail's own posture: the register never sees or asserts the raw PaymentMethod,
 * only a server-verified clientSecret's resulting confirmation).
 *
 * RESEARCHED SHARED-CARD DESIGN -- see squareVendorBoothCartService.ts's file-header comment
 * for the full evidence trail (Square's Cards API "Shared Card on File" mechanism). Creates
 * the shared card ONCE in FindA.Sale's own platform Square account, then authorizes one
 * real-time Square Payment PER represented booth, each scoped to that booth's own OAuth
 * access token -- same per-booth-is-its-own-merchant-of-record shape as the Stripe QR rail's
 * authorizeBoothCartQrLegs, same whole-cart-fail-and-cancel-already-created-legs policy on
 * any per-booth failure.
 */
export const authorizeBoothCartSquareLegs = async (req: BoothAuthRequest, res: Response) => {
  try {
    const { hubId, cartTransactionId } = req.params;
    if (!req.boothAuth) return res.status(401).json({ error: 'Booth/team authentication required' });

    const cart = await prisma.boothCartTransaction.findFirst({ where: { id: cartTransactionId, hubId } });
    if (!cart) return res.status(404).json({ error: 'Cart not found' });
    if (!callerOwnsCart(req.boothAuth, cart)) return res.status(403).json({ error: CART_NOT_YOURS_ERROR });
    if (cart.status !== 'IN_PROGRESS') {
      return res.status(409).json({ error: `Cart is not ready for Square authorization (status: ${cart.status})` });
    }
    if (!cart.squarePendingSourceId) {
      return res.status(400).json({ error: 'No card has been entered for this cart yet' });
    }

    // Atomic claim-and-clear -- same conditional-updateMany CAS idiom this file already uses
    // elsewhere (beginCartCheckout's PENDING->IN_PROGRESS, captureBoothCart's capture lock):
    // only one concurrent /square/authorize call can consume a given pending sourceId. A
    // losing racer sees squarePendingSourceId already null and 400s cleanly rather than
    // double-spending the same single-use token against Square twice.
    const claimedSourceId = cart.squarePendingSourceId;
    const claim = await prisma.boothCartTransaction.updateMany({
      where: { id: cart.id, squarePendingSourceId: claimedSourceId },
      data: { squarePendingSourceId: null, squarePendingSourceIdSetAt: null },
    });
    if (claim.count !== 1) {
      return res.status(409).json({ error: 'This card token was already used by a concurrent request' });
    }

    let sharedCardId: string;
    try {
      const shared = await createSquareSharedCardForCart({ cartTransactionId: cart.id, sourceId: claimedSourceId });
      sharedCardId = shared.sharedCardId;
    } catch (err: any) {
      console.error('[authorizeBoothCartSquareLegs] Failed to create shared card on file:', err);
      return res.status(400).json({ error: 'Could not save the card for checkout. Please try again.' });
    }

    const booths = await prisma.vendorBooth.findMany({
      where: { id: { in: cart.boothsRepresented } },
      include: { hub: { select: { organizer: { select: { subscriptionTier: true, stripeConnectId: true, stripeOnboarded: true, stripeAccountType: true, squareOnboarded: true, squareLocationId: true } } } } },
    });
    const alreadyLegged = await prisma.boothCartLeg.findMany({
      where: { cartTransactionId: cart.id, status: { in: ['PENDING', 'REQUIRES_CAPTURE', 'CAPTURED'] } },
      select: { vendorBoothId: true },
    });
    const alreadyLeggedIds = new Set(alreadyLegged.map((l) => l.vendorBoothId));
    const boothsToCharge = booths.filter((b) => !alreadyLeggedIds.has(b.id));

    const createdLegs: Array<{ legId: string; vendorBoothId: string; squareAccessToken: string; squarePaymentId: string }> = [];
    let failure: { vendorBoothId: string; vendorName: string; message: string } | null = null;

    for (const booth of boothsToCharge) {
      if (!booth.squareOnboarded || !booth.squareAccountId) {
        const message = booth.isHubOwnerBooth
          ? 'Complete your Square account connection in Settings to sell your own items through this register'
          : `Booth "${booth.vendorName}" has not completed Square onboarding`;
        failure = { vendorBoothId: booth.id, vendorName: booth.vendorName, message };
        break;
      }

      // S1198-equivalent guard (2026-09-06 Stripe precedent, ported unconditionally here --
      // same checkoutGuard.ts-adjacent posture as the Terminal/Stripe-QR rails above).
      if (await isPayoutFlaggedForReview('VENDOR_BOOTH', booth.id)) {
        failure = {
          vendorBoothId: booth.id,
          vendorName: booth.vendorName,
          message: `Booth "${booth.vendorName}"'s payments are on hold pending admin review. Contact support@finda.sale for details.`,
        };
        break;
      }

      let boothAccessToken: string;
      try {
        boothAccessToken = await resolveVendorBoothSquareAccessToken(booth);
      } catch (tokenErr) {
        if (tokenErr instanceof SquareBoothOnboardingIncompleteError) {
          failure = { vendorBoothId: booth.id, vendorName: booth.vendorName, message: `Booth "${booth.vendorName}"'s Square account is not fully connected.` };
        } else {
          console.error(`[authorizeBoothCartSquareLegs] resolveVendorBoothSquareAccessToken failed for booth ${booth.id}:`, tokenErr);
          failure = { vendorBoothId: booth.id, vendorName: booth.vendorName, message: "Could not verify the booth's Square account. Please try again." };
        }
        break;
      }

      const items = await resolveBoothLegItems(cart.id, cart.boothsRepresented, booth.id);
      const amountCents = Math.round(items.reduce((sum, i) => sum + (i.price || 0), 0) * 100);
      if (amountCents < 50) {
        failure = { vendorBoothId: booth.id, vendorName: booth.vendorName, message: `Booth "${booth.vendorName}"'s subtotal must be at least $0.50` };
        break;
      }

      // ADR-123 §3.2: SQUARE readiness gate now checks the hub owner's OWN Square
      // onboarding status (squareOnboarded/squareLocationId), not Stripe's -- a Square-rail
      // sale with a revenue share owed is blocked here until the hub owner has their own
      // Square account connected, exactly mirroring the Stripe gate's guarantee. Once
      // gated, the actual settlement is now REAL-TIME (app_fee_allocations at authorize
      // time, see authorizeSquareBoothCartLeg below) -- superseding the older comment here
      // that said this only fed a future manual settlement system.
      const feeSplit = await computeLegFeeSplit({
        amountCents,
        revenueSharePercent: booth.revenueSharePercent,
        processor: 'SQUARE',
        hubOwnerOrganizer: booth.hub.organizer,
      });
      if (feeSplit.blocked) {
        failure = { vendorBoothId: booth.id, vendorName: booth.vendorName, message: feeSplit.reason };
        break;
      }

      const claimKey = `claim_square_${cart.id}_${booth.id}`;
      let claimedLeg;
      try {
        claimedLeg = await prisma.boothCartLeg.create({
          data: {
            cartTransactionId: cart.id,
            vendorBoothId: booth.id,
            stripeAccountId: '', // no Stripe account for a SQUARE leg -- column stays non-null legacy-shaped, empty string is this file's existing convention for "not applicable" (see the cash-leg rows above)
            processor: 'SQUARE',
            stripePaymentIntentId: null,
            squarePaymentId: claimKey, // temporary claim placeholder, same CAS idiom as the Stripe rails' claim_ prefix -- overwritten with the real Square payment id below
            amountCents,
            rail: 'QR',
            status: 'PENDING',
            hubOwnerShareAmount: feeSplit.hubOwnerShareCents > 0 ? new Decimal(feeSplit.hubOwnerShareCents / 100) : null,
            platformFeeCents: feeSplit.applicationFeeAmountCents - feeSplit.hubOwnerShareCents,
          },
        });
      } catch (claimErr: any) {
        if (claimErr?.code === 'P2002') {
          continue;
        }
        throw claimErr;
      }

      const authResult = await authorizeSquareBoothCartLeg({
        boothAccessToken,
        sharedCardId,
        amountCents,
        appFeeCents: feeSplit.applicationFeeAmountCents,
        cartTransactionId: cart.id,
        vendorBoothId: booth.id,
        hubId,
        // FIXED 2026-09-07 (CI type error, this session): VendorBooth has no squareLocationId
        // column (only Organizer/POSPaymentRequest do) -- authorizeSquareBoothCartLeg's own param
        // is optional and Square's CreatePayment falls back to the merchant's default location
        // when omitted, so this is correctly left unset rather than reading a nonexistent field.
        squareLocationId: null,
        // ADR-123 §3.1: when this leg owes the hub owner a revenue-share cut, route it via
        // app_fee_allocations to the hub owner's OWN connected Square location (already
        // confirmed present + onboarded by computeLegFeeSplit's SQUARE readiness gate above
        // -- this should never be null here when hubOwnerShareCents > 0, and
        // resolveSquareAppFeeParams throws loudly rather than silently dropping the cut if it
        // somehow is).
        hubOwnerShareCents: feeSplit.hubOwnerShareCents,
        hubOwnerSquareLocationId: booth.hub.organizer.squareLocationId,
      });

      if (!authResult.ok) {
        await prisma.boothCartLeg.delete({ where: { id: claimedLeg.id } }).catch((delErr) =>
          console.error(`[authorizeBoothCartSquareLegs] Failed to release claim leg ${claimedLeg.id} after Square error:`, delErr)
        );
        failure = { vendorBoothId: booth.id, vendorName: booth.vendorName, message: authResult.message };
        break;
      }

      // ADR-123 §4/§5 item 4: hubOwnerShareSettledAt records "this leg's hub-owner share
      // was already paid, atomically, as part of this SAME Square payment" -- the Square-path
      // sibling of the Stripe path's real stripeTransferId, but recording a FACT rather than a
      // separate transfer object's id (there is no separate transfer id for Square's real-time
      // allocation path). Only set when the payment actually carried an allocation
      // (hubOwnerShareSettledViaAllocation) -- a leg with no revenue share owed correctly
      // stays null here, same as it stays null on hubOwnerShareAmount.
      const leg = await prisma.boothCartLeg.update({
        where: { id: claimedLeg.id },
        data: {
          squarePaymentId: authResult.paymentId,
          status: authResult.status === 'APPROVED' ? 'REQUIRES_CAPTURE' : 'PENDING',
          hubOwnerShareSettledAt: authResult.hubOwnerShareSettledViaAllocation ? new Date() : null,
        },
      });
      createdLegs.push({ legId: leg.id, vendorBoothId: booth.id, squareAccessToken: boothAccessToken, squarePaymentId: authResult.paymentId });
    }

    if (failure) {
      // Whole-cart-fail: cancel every leg this call just created (free -- none are captured
      // yet), matching the Stripe QR rail's identical cancel policy.
      for (const created of createdLegs) {
        try {
          await cancelSquareBoothCartLeg(created.squareAccessToken, created.squarePaymentId);
        } catch (cancelErr) {
          console.error(`[authorizeBoothCartSquareLegs] Failed to cancel leg ${created.legId} during whole-cart-fail:`, cancelErr);
        }
        await prisma.boothCartLeg.update({ where: { id: created.legId }, data: { status: 'CANCELED' } }).catch(() => {});
      }
      return res.status(402).json({ error: failure.message, vendorBoothId: failure.vendorBoothId, vendorName: failure.vendorName });
    }

    return res.status(200).json({ legs: createdLegs.map(({ legId, vendorBoothId }) => ({ legId, vendorBoothId })) });
  } catch (error) {
    console.error('[authorizeBoothCartSquareLegs] Error:', error);
    return res.status(500).json({ error: 'Failed to authorize Square checkout legs' });
  }
};

/**
 * Shared finalize step for a cart whose legs have already reached a captured state,
 * regardless of HOW they got there -- a real Stripe capture (captureBoothCart, TERMINAL
 * or QR rail) or an immediate cash sale with no Stripe step at all (captureBoothCartCash).
 * Extracted 2026-07-31 so both callers run the exact same Purchase-row creation, stock
 * decrement, cross-channel-removal hooks, per-item receipt, cart-COMPLETED write, itemized
 * cart receipt email, and per-vendor sale notification -- instead of a second hand-copied
 * implementation drifting out of sync with this one.
 *
 * Deliberately does NOT call transferHubOwnerShareForLeg. That fires a real Stripe
 * Transfer out of the PLATFORM's own Stripe balance, and is only ever correct for a leg
 * whose money the platform actually collected via Stripe (an application_fee_amount taken
 * on a real captured PaymentIntent). A CASH leg's amount was never collected through
 * Stripe -- the cashier collected it in person -- so Transferring it would pay the hub
 * owner real platform funds for a sale that generated none on the platform's Stripe
 * balance. captureBoothCart (the real-money path) fires that Transfer itself, in its own
 * loop, AFTER calling this function -- exactly where the original inline code ran it,
 * just now a separate step instead of interleaved with the Purchase-creation loop.
 * captureBoothCartCash never calls transferHubOwnerShareForLeg at all.
 */
async function finalizeCapturedLegs(
  cart: { id: string; boothsRepresented: string[] },
  // findasale-hacker fix (2026-08-09, Direct-charges adversarial pass): widened to include
  // rail + stripeAccountId, both already present on every real BoothCartLeg row passed in by
  // both callers -- needed to correctly label the Purchase rows created below (see comment
  // at the purchase.create call). Widened again (2026-09-07, vendor-booth-cart-checkout
  // dispatch) to include processor + squarePaymentId -- both already present on every real
  // BoothCartLeg row (Wave 0.5 schema), needed to branch the Purchase.create call below.
  legs: Array<{
    id: string;
    vendorBoothId: string;
    stripePaymentIntentId: string | null;
    squarePaymentId: string | null;
    processor: string;
    rail: string;
    stripeAccountId: string | null;
  }>
): Promise<string[]> {
  // Finalize: create Purchase rows (real per-booth PaymentIntent id, or the cash_...
  // placeholder for a cash leg -- stripePaymentIntentId is @unique and non-null either
  // way), mark items SOLD, fire the same downstream hooks the old confirmBoothCart ran.
  const purchaseIds: string[] = [];
  for (const leg of legs) {
    const items = await resolveBoothLegItems(cart.id, cart.boothsRepresented, leg.vendorBoothId);
    for (const item of items) {
      try {
        // findasale-hacker fix (2026-08-09, Direct-charges adversarial pass): a non-CASH
        // leg's PaymentIntent was captured with { stripeAccount: leg.stripeAccountId } (see
        // captureBoothCart/QR-rail authorize above) -- a genuine Direct charge on the booth's
        // own connected account, unconditionally, independent of the Direct-charges
        // migration's allowlist (booth-cart legs have always worked this way, ADR-020). A
        // CASH leg (rail === 'CASH') has no real Stripe charge at all (stripePaymentIntentId
        // is a `cash_...` placeholder) -- DESTINATION is left as the (moot but harmless)
        // label there. refundService.ts's refund routing for booth-cart purchases keys off
        // boothCartTransactionId + item.vendorBooth.stripeAccountId, NOT this chargeType/
        // stripeAccountId pair, so this fix is a correctness/audit-trail fix (stops the
        // dispute-closed handler's chargeType/inference mismatch Sentry alert from firing on
        // every real booth-cart dispute) rather than a liability-routing fix.
        const legIsRealDirectCharge = leg.rail !== 'CASH' && leg.processor !== 'SQUARE' && !!leg.stripeAccountId;
        const isSquareLeg = leg.processor === 'SQUARE';
        // NO FEE SNAPSHOT, DELIBERATELY (2026-08-17): this row carries no platformFeeAmount at
        // all — booth-cart economics are settled per booth leg (ADR-020/ADR-090), not through
        // Purchase. There is no fee here to decompose, so the snapshot stays NULL.
        //
        // Square branch (2026-09-07, vendor-booth-cart-checkout dispatch): stripePaymentIntentId
        // stays null and squarePaymentId carries the real Square payment id instead --
        // chargeType (a Stripe Destination/Direct-charge-model concept, ADR-115) is left at its
        // schema default for a Square row; it is never read for a booth-cart purchase regardless
        // of processor (refundService.ts's isBoothCartPurchase branch always short-circuits past
        // the chargeType checks -- confirmed by direct read this dispatch).
        const purchase = await prisma.purchase.create({
          data: {
            userId: null, // walk-in POS: no server-derived shopper identity exists (P0 fix, 2026-07-28)
            itemId: item.id,
            amount: item.price || 0,
            processor: isSquareLeg ? 'SQUARE' : 'STRIPE',
            ...(isSquareLeg
              ? { squarePaymentId: leg.squarePaymentId }
              : {
                  stripePaymentIntentId: leg.stripePaymentIntentId,
                  chargeType: legIsRealDirectCharge ? 'DIRECT' : 'DESTINATION',
                  ...(legIsRealDirectCharge ? { stripeAccountId: leg.stripeAccountId! } : {}),
                }),
            source: 'POS',
            status: 'PAID',
            boothCartTransactionId: cart.id,
          },
        });
        purchaseIds.push(purchase.id);

        // ADR-085 Track B Phase 1 Step 4: atomic, race-safe stock decrement replaces the
        // old unconditional status update. Downstream cross-channel-removal hooks only
        // fire once the item is actually fully sold out (stockSold reached stockTotal) --
        // previously they fired unconditionally on every sale regardless of remaining stock.
        let fullySoldOut: boolean;
        let remainingStock: number;
        try {
          ({ fullySoldOut, remainingStock } = await sellItemUnits(item.id, 1));
        } catch (stockErr: any) {
          if (stockErr instanceof InsufficientStockError) {
            console.error(`[finalizeCapturedLegs] Oversold race on item ${item.id} despite captured payment:`, stockErr.message);
          }
          throw stockErr;
        }

        if (fullySoldOut) {
          endEbayListingIfExists(item.id).catch((err) => console.error('[eBay] Failed to withdraw offer:', err));
          markShopifyItemSold(item.id).catch((err) => console.error('[Shopify] Failed to mark item sold:', err));
          notifyFacebookExportedItemSold(item.id).catch((err) =>
            console.warn(`[FB Nudge] failed for item ${item.id}:`, err.message)
          );
        } else {
          // ADR-087 Phase 4: partial sale — revise eBay listing quantity if linked.
          syncMarketplaceStock(item.id, { fullySoldOut: false, remainingStock }).catch((err) =>
            console.error('[eBay ReviseQty] sync failed for item', item.id, err)
          );
        }
        generateReceipt(purchase.id).catch((err) => console.error('[receipt] Failed to generate receipt:', err));
      } catch (err: any) {
        console.error(`[finalizeCapturedLegs] Failed to finalize item ${item.id}:`, err);
      }
    }
  }

  await prisma.boothCartTransaction.update({ where: { id: cart.id }, data: { status: 'COMPLETED' } });

  sendBoothCartReceiptEmail(cart.id).catch((err) =>
    console.error('[finalizeCapturedLegs] Failed to send itemized cart receipt email:', err)
  );

  // Tell each vendor their own goods sold. The line above emails the SHOPPER a receipt;
  // until this existed, the vendor whose items just sold was told nothing on any channel.
  // Per LEG, not per cart and not per item: a leg is exactly one vendor's slice of this
  // cart. Fire-and-forget, same as the receipt email above: a captured/completed sale is
  // final at this point (real money for Stripe legs, cash already in the till for CASH
  // legs) and a notification must never delay, fail or roll back it. notifyVendorOfBoothSale
  // never throws and takes a compare-and-swap claim on BoothCartLeg.vendorSaleNotifiedAt
  // before sending, so a retried finalize call cannot email the same vendor twice.
  for (const leg of legs) {
    notifyVendorOfBoothSale(leg.id).catch((err) =>
      console.error(`[finalizeCapturedLegs] Vendor sale notification failed for leg ${leg.id} (non-fatal):`, err)
    );
  }

  return purchaseIds;
}

/**
 * POST /api/organizer/hubs/:hubId/cart/:cartTransactionId/capture
 * ADR-020 step 5 (shared by BOTH rails): once every leg in the cart has
 * successfully authorized, capture all of them — a loop of per-PaymentIntent
 * `/capture` calls, each scoped to that leg's own booth `stripeAccount`. This is
 * the moment the sale actually completes: Purchase rows are created (one per
 * item, `stripePaymentIntentId` = that item's booth's REAL leg PaymentIntent id —
 * no more `${piId}_${itemId}` composite placeholder), items are marked SOLD, and
 * the itemized per-vendor receipt is sent.
 */
export const captureBoothCart = async (req: BoothAuthRequest, res: Response) => {
  // findasale-hacker adversarial pass, 2026-07-08: lockedCartId + releaseCaptureLock
  // are declared outside the try block so every exit path (including the outer catch)
  // can release the CAPTURING lock taken below. See the lock's own comment for why.
  let lockedCartId: string | null = null;
  const releaseCaptureLock = async () => {
    if (!lockedCartId) return;
    await prisma.boothCartTransaction
      .updateMany({ where: { id: lockedCartId, status: 'CAPTURING' }, data: { status: 'IN_PROGRESS' } })
      .catch((err) => console.error('[captureBoothCart] Failed to release capture lock (non-fatal):', err));
  };
  try {
    const { hubId, cartTransactionId } = req.params;
    if (!req.boothAuth) return res.status(401).json({ error: 'Booth/team authentication required' });

    const cart = await prisma.boothCartTransaction.findFirst({ where: { id: cartTransactionId, hubId } });
    if (!cart) return res.status(404).json({ error: 'Cart not found' });
    if (!callerOwnsCart(req.boothAuth, cart)) return res.status(403).json({ error: CART_NOT_YOURS_ERROR });
    if (cart.status === 'COMPLETED') {
      return res.status(200).json({ success: true, message: 'Cart already completed' });
    }
    if (cart.status !== 'IN_PROGRESS') {
      return res.status(409).json({ error: `Cart cannot be captured (status: ${cart.status})` });
    }

    // FIX (2026-08-31): beginCartCheckout already checked isActive when this cart's FIRST
    // leg was authorized, but the market could have been closed in the window between that
    // authorize call and this capture call -- re-check here rather than trust the earlier
    // pass is still valid. Direct check (not routed through beginCartCheckout, which is a
    // no-op once the cart is already IN_PROGRESS and would silently skip this).
    const hubForCapture = await prisma.saleHub.findUnique({ where: { id: hubId }, select: { isActive: true } });
    if (!hubForCapture || !hubForCapture.isActive) {
      return res.status(403).json({ error: 'This market has been closed and can no longer accept payments.' });
    }

    // Race-safe capture lock (findasale-hacker adversarial pass, 2026-07-08): atomically
    // claim the IN_PROGRESS -> CAPTURING transition, same conditional-updateMany idiom
    // beginCartCheckout already uses for its PENDING -> IN_PROGRESS lock. Without this,
    // two concurrent /capture calls on the same cart could both pass the status check
    // above, both loop the SAME legs, and interleave captures across legs such that
    // EACH call's captureFailed array ends up non-empty (each racer fails on whichever
    // leg the OTHER racer captured first) -- meaning money gets captured but NEITHER
    // response path reaches the Finalize block that creates Purchase rows / marks items
    // SOLD / sends receipts. This lock ensures only one /capture call is ever inside the
    // capture loop for a given cart at a time. It is reverted back to IN_PROGRESS on
    // every non-success exit path below so legitimate retries after a genuine
    // (non-race) partial failure are never blocked.
    const captureLock = await prisma.boothCartTransaction.updateMany({
      where: { id: cart.id, status: 'IN_PROGRESS' },
      data: { status: 'CAPTURING' },
    });
    if (captureLock.count !== 1) {
      return res.status(409).json({ error: 'This cart is already being captured by another request' });
    }
    lockedCartId = cart.id;

    // Re-run the collusion guard at capture time. cashierTeamMemberId/cashierBoothId are
    // read from the cart row itself (persisted at startBoothCart), not from req.boothAuth,
    // since the cashier who opened the cart may differ from whoever calls /capture.
    //
    // P0 fix (findasale-hacker fix-and-reverify pass, 2026-07-28): the buyer id is no
    // longer accepted here. It came from req.body on a CASHIER-authenticated call and was
    // never validated against any session -- the cashier, i.e. the exact party this guard
    // exists to catch, was asserting the buyer's identity TO the guard. Omitting the field
    // skipped SELF_DEALING / SHARED_DEVICE_FP / SHARED_CARD_FP entirely (checkoutGuard.ts
    // returns early with no buyer id), and setting it to an arbitrary account attributed
    // the purchase there: receipts, order history, loyalty XP, and the first-month refund
    // cap in stripeController.applyFirstMonthRefundCap all key off Purchase.userId.
    // No shopper-authenticated caller exists for these routes, so the server-derived value
    // is "no buyer" -- the walk-in POS case, which is what production already does. The
    // cashier self-dealing check (cashierBoothId in boothsRepresented) still runs
    // unconditionally and is unaffected. See the buyer-side gap noted in checkoutGuard.ts.
    try {
      await assertBoothCartCheckoutAllowed({
        hubId,
        cartTransactionId: cart.id,
        boothsRepresented: cart.boothsRepresented,
        cashierTeamMemberId: cart.cashierTeamMemberId,
        cashierBoothId: cart.cashierBoothId,
        prisma,
        context: 'boothCartCapture',
      });
    } catch (guardError: any) {
      await releaseCaptureLock();
      if (guardError instanceof CheckoutGuardError) {
        return res.status(403).json({ error: guardError.message });
      }
      throw guardError;
    }

    const legs = await prisma.boothCartLeg.findMany({
      where: { cartTransactionId: cart.id, status: { in: ['PENDING', 'REQUIRES_CAPTURE'] } },
    });
    if (legs.length === 0) {
      await releaseCaptureLock();
      return res.status(400).json({ error: 'No authorized legs to capture on this cart' });
    }

    // Re-verify every leg's LIVE status before capturing any of them — all-or-nothing,
    // never a partial capture. A leg still 'PENDING' here means its tap hasn't
    // succeeded yet (cashier called authorize but the physical tap didn't complete).
    const notReady: string[] = [];
    // Booth Square-token cache for this request -- resolved at most once per booth even
    // though a leg is re-verified here AND captured in the loop below (avoids two token
    // resolves per Square leg per capture attempt).
    const squareBoothTokenCache = new Map<string, string>();
    async function resolveCachedSquareBoothToken(vendorBoothId: string): Promise<string> {
      const cached = squareBoothTokenCache.get(vendorBoothId);
      if (cached) return cached;
      const booth = await prisma.vendorBooth.findUnique({
        where: { id: vendorBoothId },
        select: { id: true, userId: true, squareAccountId: true, squareOnboarded: true },
      });
      if (!booth) throw new SquareBoothOnboardingIncompleteError(vendorBoothId);
      const token = await resolveVendorBoothSquareAccessToken(booth);
      squareBoothTokenCache.set(vendorBoothId, token);
      return token;
    }
    for (const leg of legs) {
      if (leg.processor === 'SQUARE') {
        // Square migration, vendor-booth-cart-checkout dispatch (2026-09-07): mirrors the
        // Stripe branch's live re-verification (never trust the DB-cached leg.status alone),
        // using getSquareBoothCartLegStatus/completeSquareBoothCartLeg's shared token-resolve
        // helper above instead of the Stripe `{ stripeAccount }` per-call option.
        try {
          const boothAccessToken = await resolveCachedSquareBoothToken(leg.vendorBoothId);
          const status = await getSquareBoothCartLegStatus(boothAccessToken, leg.squarePaymentId!);
          if (status !== 'APPROVED') notReady.push(leg.vendorBoothId);
        } catch (err) {
          console.error(`[captureBoothCart] Failed to retrieve Square leg ${leg.id} for re-verification:`, err);
          notReady.push(leg.vendorBoothId);
        }
        continue;
      }
      if (isTerminalSimulated() && leg.rail === 'TERMINAL') {
        // Simulated readers auto-succeed; trust the recorded status.
        if (leg.status !== 'REQUIRES_CAPTURE') notReady.push(leg.vendorBoothId);
        continue;
      }
      try {
        const pi = await stripe().paymentIntents.retrieve(leg.stripePaymentIntentId!, { stripeAccount: leg.stripeAccountId });
        if (pi.status !== 'requires_capture') notReady.push(leg.vendorBoothId);
      } catch (err) {
        console.error(`[captureBoothCart] Failed to retrieve leg ${leg.id} for re-verification:`, err);
        notReady.push(leg.vendorBoothId);
      }
    }
    if (notReady.length > 0) {
      await releaseCaptureLock();
      return res.status(409).json({ error: 'Not every booth has authorized yet', vendorBoothIds: notReady });
    }

    // All legs verified requires_capture — capture every one. A capture failure at
    // this point is a genuine rare edge (Stripe outage / the 2-day authorization
    // window expired) — money already captured on earlier legs in this loop can't be
    // silently uncaptured, so this is reported for manual reconciliation rather than
    // pretending the whole cart rolled back (flagged in the dev report, not built
    // out further here — no reconciliation tooling in this pass).
    const captured: typeof legs = [];
    const captureFailed: Array<{ vendorBoothId: string; message: string }> = [];
    for (const leg of legs) {
      try {
        if (leg.processor === 'SQUARE') {
          // Square migration, vendor-booth-cart-checkout dispatch (2026-09-07): CompletePayment
          // (capture) via the SAME booth-token-resolve helper the re-verify loop above just
          // used (cached, so no second token resolve for a leg re-verified this same request).
          const boothAccessToken = await resolveCachedSquareBoothToken(leg.vendorBoothId);
          await completeSquareBoothCartLeg(boothAccessToken, leg.squarePaymentId!);
        } else if (isTerminalSimulated() && leg.rail === 'TERMINAL') {
          await stripe().paymentIntents.capture(leg.stripePaymentIntentId!);
        } else {
          await stripe().paymentIntents.capture(leg.stripePaymentIntentId!, {}, { stripeAccount: leg.stripeAccountId });
        }
        await prisma.boothCartLeg.update({ where: { id: leg.id }, data: { status: 'CAPTURED' } });
        captured.push(leg);
      } catch (err: any) {
        console.error(`[captureBoothCart] Failed to capture leg ${leg.id}:`, err);
        captureFailed.push({ vendorBoothId: leg.vendorBoothId, message: err.message || 'Capture failed' });
      }
    }

    if (captureFailed.length > 0) {
      await releaseCaptureLock();
      return res.status(207).json({
        error: 'Some booths captured, others did not: needs manual reconciliation',
        captured: captured.map((l) => l.vendorBoothId),
        failed: captureFailed,
      });
    }

    // Finalize (2026-07-31: extracted to finalizeCapturedLegs, shared with the cash
    // capture endpoint below) -- creates Purchase rows (real per-booth PaymentIntent id,
    // no composite placeholder), marks items SOLD, fires the same downstream hooks the
    // old confirmBoothCart ran, marks the cart COMPLETED, and sends the itemized shopper
    // receipt + per-vendor sale notifications.
    const purchaseIds = await finalizeCapturedLegs(cart, captured);
    lockedCartId = null; // terminal state reached -- no lock left to release

    // ADR-090 Phase 2: fire the hub-owner Transfer for each captured leg carrying a
    // revenue-share slice. Runs once per LEG (not per item/Purchase row) -- the
    // application_fee_amount and its resulting hub-owner cut were computed once per
    // leg at authorize time. Best-effort/non-blocking: a Transfer failure here must
    // never roll back an already-captured payment: the shopper was already charged and
    // items already marked SOLD. Failures are logged for manual reconciliation -- no
    // automated retry endpoint exists yet. NEVER called from captureBoothCartCash --
    // see finalizeCapturedLegs' own comment for why a CASH leg must never reach this.
    for (const leg of captured) {
      if (!leg.hubOwnerShareAmount || Number(leg.hubOwnerShareAmount) <= 0) continue;
      await transferHubOwnerShareForLeg(leg.id).catch((err) =>
        console.error(`[captureBoothCart] Hub-owner Transfer failed for leg ${leg.id} — flagged for manual reconciliation:`, err)
      );
    }

    return res.status(200).json({ success: true, itemsSold: purchaseIds.length, purchaseIds });
  } catch (error) {
    console.error('[captureBoothCart] Error:', error);
    await releaseCaptureLock();
    return res.status(500).json({ error: 'Failed to capture cart payment' });
  }
};

/**
 * POST /api/organizer/hubs/:hubId/cart/:cartTransactionId/cash/capture
 * Body: { cashReceivedCents: number }
 * Cash rail for venue/multi-vendor carts (2026-07-31, Patrick-approved). Unlike the
 * TERMINAL/QR rails there is no PaymentIntent, no authorize step, and nothing to poll
 * or tap -- the cashier already has the cash in hand when this is called, so every leg
 * goes straight to CAPTURED. No Stripe call is made anywhere in this function.
 *
 * Runs the SAME checkout guard + cart lock (beginCartCheckout) the TERMINAL/QR rails'
 * first authorize call runs, and the SAME race-safe IN_PROGRESS -> CAPTURING capture
 * lock captureBoothCart uses, reused here rather than re-implemented, since this is the
 * cart's only capture attempt (no separate authorize step precedes it).
 *
 * Deliberately does NOT require booth.stripeAccountType === 'standard' && booth.stripeOnboarded
 * the way the TERMINAL/QR rails do before charging a booth's own connected account --
 * a cash sale never touches any booth's Stripe account, so a vendor who never onboarded
 * to Stripe can still ring up a cash sale at this register. Fee math still runs (via
 * computeLegFeeSplit's skipReadinessGate) purely for REPORTING -- the vendor notification
 * quotes what the platform fee and hub-owner revenue share WOULD be, since the organizer
 * and vendor still owe each other that money, just settled outside Stripe.
 *
 * MUST NEVER call transferHubOwnerShareForLeg -- see finalizeCapturedLegs' own comment.
 * A cash leg's amount never lands in the platform's Stripe balance, so there is nothing
 * for that function to Transfer out of; calling it here would pay the hub owner real
 * platform funds for a sale that collected none.
 */
export const captureBoothCartCash = async (req: BoothAuthRequest, res: Response) => {
  let lockedCartId: string | null = null;
  const releaseCaptureLock = async () => {
    if (!lockedCartId) return;
    await prisma.boothCartTransaction
      .updateMany({ where: { id: lockedCartId, status: 'CAPTURING' }, data: { status: 'IN_PROGRESS' } })
      .catch((err) => console.error('[captureBoothCartCash] Failed to release capture lock (non-fatal):', err));
  };
  try {
    const { hubId, cartTransactionId } = req.params;
    const { cashReceivedCents } = req.body as { cashReceivedCents?: number };
    if (!req.boothAuth) return res.status(401).json({ error: 'Booth/team authentication required' });
    if (typeof cashReceivedCents !== 'number' || !Number.isFinite(cashReceivedCents) || cashReceivedCents < 0) {
      return res.status(400).json({ error: 'cashReceivedCents is required and must be a non-negative number' });
    }

    const cart = await prisma.boothCartTransaction.findFirst({ where: { id: cartTransactionId, hubId } });
    if (!cart) return res.status(404).json({ error: 'Cart not found' });
    if (!callerOwnsCart(req.boothAuth, cart)) return res.status(403).json({ error: CART_NOT_YOURS_ERROR });
    if (cart.status === 'COMPLETED') {
      return res.status(200).json({ success: true, message: 'Cart already completed' });
    }

    // Standard cart-checkout guard/lock reuse (same as the TERMINAL/QR rails' first
    // authorize call) -- runs assertBoothCartCheckoutAllowed exactly once for this cart
    // and atomically flips PENDING -> IN_PROGRESS. No-op if a prior (abandoned) authorize
    // attempt on this same cart already ran it.
    try {
      await beginCartCheckout({
        cart,
        hubId,
        cashierTeamMemberId: req.boothAuth.type === 'TEAM_MEMBER' ? req.boothAuth.teamMemberId : null,
        cashierBoothId: req.boothAuth.type === 'BOOTH' ? req.boothAuth.vendorBoothId : null,
        context: 'boothCartCashCapture',
      });
    } catch (guardError: any) {
      if (guardError instanceof CheckoutGuardError) {
        return res.status(403).json({ error: guardError.message });
      }
      if (typeof guardError?.message === 'string' && guardError.message.startsWith('CART_NOT_CHARGEABLE:')) {
        return res.status(409).json({ error: `Cart cannot be charged (status: ${guardError.message.split(':')[1]})` });
      }
      throw guardError;
    }

    // Race-safe capture lock -- same conditional-updateMany idiom captureBoothCart uses,
    // reused here since a cash cart has no separate authorize step before this call: this
    // IS both the authorize and the capture, all in one request.
    const captureLock = await prisma.boothCartTransaction.updateMany({
      where: { id: cart.id, status: 'IN_PROGRESS' },
      data: { status: 'CAPTURING' },
    });
    if (captureLock.count !== 1) {
      return res.status(409).json({ error: 'This cart is already being captured by another request' });
    }
    lockedCartId = cart.id;

    const booths = await prisma.vendorBooth.findMany({
      where: { id: { in: cart.boothsRepresented } },
      include: { hub: { select: { organizer: { select: { subscriptionTier: true, stripeConnectId: true, stripeOnboarded: true, stripeAccountType: true, squareOnboarded: true, squareLocationId: true } } } } },
    });

    // Resolve every represented booth's items + amount BEFORE validating the cash
    // received, so the cashier is told the real total, not a stale cart.totalAmount.
    const boothAmounts: Array<{ booth: (typeof booths)[number]; amountCents: number }> = [];
    let totalCents = 0;
    for (const booth of booths) {
      const items = await resolveBoothLegItems(cart.id, cart.boothsRepresented, booth.id);
      const amountCents = Math.round(items.reduce((sum, i) => sum + (i.price || 0), 0) * 100);
      if (amountCents <= 0) continue; // nothing to charge this booth -- no leg needed
      boothAmounts.push({ booth, amountCents });
      totalCents += amountCents;
    }

    if (boothAmounts.length === 0) {
      await releaseCaptureLock();
      return res.status(400).json({ error: 'The venue cart is empty.' });
    }

    if (cashReceivedCents < totalCents) {
      await releaseCaptureLock();
      return res.status(400).json({
        error: `Cash received ($${(cashReceivedCents / 100).toFixed(2)}) is less than the total due ($${(totalCents / 100).toFixed(2)}).`,
        totalCents,
      });
    }
    const changeCents = cashReceivedCents - totalCents;

    // findasale-hacker fix (2026-08-09): widened to include rail + stripeAccountId so this array's type stays compatible with finalizeCapturedLegs' widened parameter type below -- the actual pushed objects (real BoothCartLeg rows from prisma.boothCartLeg.create) always had both fields already, this only fixes the local type annotation. Widened again (2026-09-07, vendor-booth-cart-checkout dispatch) for processor/squarePaymentId -- a cash leg is always processor:'STRIPE' (schema default, unchanged by this dispatch) and squarePaymentId:null, this too only fixes the local type annotation to match finalizeCapturedLegs' now-wider parameter type.
    const legs: Array<{ id: string; vendorBoothId: string; stripePaymentIntentId: string | null; squarePaymentId: string | null; processor: string; hubOwnerShareAmount: any; rail: string; stripeAccountId: string | null }> = [];
    for (const { booth, amountCents } of boothAmounts) {
      // Cash-only variant: computes platformFeeCents/hubOwnerShareCents for reporting
      // WITHOUT blocking on the hub owner's Stripe onboarding readiness -- see
      // computeLegFeeSplit's skipReadinessGate comment. blocked can never be true here.
      const feeSplit = await computeLegFeeSplit({
        amountCents,
        revenueSharePercent: booth.revenueSharePercent,
        processor: 'STRIPE', // irrelevant here (skipReadinessGate below), set for consistency/clarity only
        hubOwnerOrganizer: booth.hub.organizer,
        skipReadinessGate: true,
      });
      if (feeSplit.blocked) {
        // Unreachable with skipReadinessGate: true, but never silently drop a booth's
        // leg if this ever changes -- fail loudly instead of charging cash for goods
        // that then have no leg/Purchase row recording the sale.
        await releaseCaptureLock();
        return res.status(500).json({ error: `Unexpected fee-split failure for booth "${booth.vendorName}"` });
      }

      const leg = await prisma.boothCartLeg.create({
        data: {
          cartTransactionId: cart.id,
          vendorBoothId: booth.id,
          stripeAccountId: booth.stripeAccountId ?? '',
          // Mirrors terminalController.ts's existing cash-sale placeholder pattern
          // (stripePaymentIntentId is @unique and non-null) -- no real Stripe object
          // backs a cash leg.
          stripePaymentIntentId: `cash_${randomUUID()}`,
          amountCents,
          rail: 'CASH',
          status: 'CAPTURED',
          hubOwnerShareAmount: feeSplit.hubOwnerShareCents > 0 ? new Decimal(feeSplit.hubOwnerShareCents / 100) : null,
          platformFeeCents: feeSplit.applicationFeeAmountCents - feeSplit.hubOwnerShareCents,
        },
      });
      legs.push(leg);
    }

    // Finalize exactly like captureBoothCart does (Purchase rows, stock decrement,
    // cross-channel hooks, receipt, mark cart COMPLETED, notify each vendor) --
    // deliberately WITHOUT the hub-owner Transfer loop captureBoothCart runs right
    // after this same call. See this function's own doc-comment and
    // finalizeCapturedLegs' doc-comment for why that call must never appear here.
    const purchaseIds = await finalizeCapturedLegs(cart, legs);
    lockedCartId = null; // terminal state reached -- no lock left to release

    return res.status(200).json({
      success: true,
      itemsSold: purchaseIds.length,
      purchaseIds,
      totalCents,
      cashReceivedCents,
      changeCents,
    });
  } catch (error) {
    console.error('[captureBoothCartCash] Error:', error);
    await releaseCaptureLock();
    return res.status(500).json({ error: 'Failed to record cash sale' });
  }
};

/**
 * POST /api/organizer/hubs/:hubId/cart/:cartTransactionId/cancel
 * ADR-020 step 6, Patrick-approved v1 behavior: whole-cart-cancel-and-restart (NOT
 * partial-capture/split-transaction — that was explicitly rejected). Cancels every
 * uncaptured leg (free — no charge ever appeared, matches Stripe's own Terminal
 * guidance) and releases the cart's reserved items back to AVAILABLE. The cashier
 * starts a NEW cart, omitting whichever vendor's items couldn't be resolved — this
 * endpoint does not attempt to auto-resume or retry the same cart.
 */
export const cancelBoothCart = async (req: BoothAuthRequest, res: Response) => {
  try {
    const { hubId, cartTransactionId } = req.params;
    if (!req.boothAuth) return res.status(401).json({ error: 'Booth/team authentication required' });

    const cart = await prisma.boothCartTransaction.findFirst({ where: { id: cartTransactionId, hubId } });
    if (!cart) return res.status(404).json({ error: 'Cart not found' });
    if (!callerOwnsCart(req.boothAuth, cart)) return res.status(403).json({ error: CART_NOT_YOURS_ERROR });
    if (cart.status === 'COMPLETED') {
      return res.status(409).json({ error: 'Cart is already completed. Cannot cancel; use refund instead.' });
    }
    if (cart.status === 'FAILED') {
      return res.status(200).json({ success: true, message: 'Cart already cancelled' });
    }
    if (cart.status === 'CAPTURING') {
      // findasale-hacker adversarial pass, 2026-07-08: without this check, a /cancel
      // call racing a concurrent /capture call could try to release/cancel legs the
      // capture loop is actively finalizing -- this closes that window for the entire
      // duration of a capture attempt (see captureBoothCart's capture lock).
      return res.status(409).json({ error: 'Cart is currently being captured. Cannot cancel right now; try again shortly.' });
    }

    // Core release logic (Stripe-leg-cancel + item-release + status-flip-to-FAILED) is
    // extracted into vendorBoothCartLifecycleService.ts (2026-08-01) so the abandonment
    // sweep job can reuse it -- this function keeps only its own HTTP-request-specific
    // guards above (auth, COMPLETED/FAILED/CAPTURING status checks).
    const { cancelledLegIds } = await releasePendingCartHold(cart);

    return res.status(200).json({ success: true, cancelledLegIds });
  } catch (error) {
    console.error('[cancelBoothCart] Error:', error);
    return res.status(500).json({ error: 'Failed to cancel cart' });
  }
};


/**
 * GET /api/organizer/hubs/:hubId/cart-transactions
 * Organizer-only audit view: cashier, timestamp, booths represented, total.
 */

/**
 * GET /api/organizer/hubs/:hubId/cart/items?q=<string>&vendorBoothId=<optional>
 * Hub-wide item search (2026-07-31). Replaces searchVendorBoothItems (confirmed unused
 * anywhere else in the codebase, deleted rather than deprecated) -- that endpoint was
 * booth-scoped, but venue mode's cashier UI (pos.tsx, ?venue=<hubId>) has no single
 * selectedSaleId to search against (no one sale spans a multi-vendor hub), so "Search
 * by title or SKU" there silently never worked. This searches every CONFIRMED, claimed
 * booth's sellable items at once by title OR sku, optionally narrowed to one booth via
 * vendorBoothId (keeps serving the old QR-fail single-booth-fallback case too). Reuses
 * the exact same ownership-resolution pattern addBoothCartItems uses (CONFIRMED
 * VendorBooth at this hub, owner resolved via Item.organizerId) so the result set is
 * guaranteed to match what would actually be accepted into the cart.
 */
export const searchHubCartItems = async (req: BoothAuthRequest, res: Response) => {
  try {
    const { hubId } = req.params;
    const { q, vendorBoothId } = req.query as { q?: string; vendorBoothId?: string };
    if (!req.boothAuth) return res.status(401).json({ error: 'Booth/team authentication required' });

    const confirmedBooths = await prisma.vendorBooth.findMany({
      where: {
        hubId,
        status: 'CONFIRMED',
        userId: { not: null },
        ...(vendorBoothId ? { id: vendorBoothId } : {}),
      },
      select: { id: true, userId: true, vendorName: true, boothNumber: true },
    });

    // Fix 2 (2026-08-01): lazily provision the house booth so the hub owner's own
    // items are searchable/sellable here too. Only resolved when it could plausibly
    // matter -- no explicit vendorBoothId filter (a general search should include it),
    // or an explicit filter that found nothing above (it might be asking for the house
    // booth on its very first use, before it exists) -- so an ordinary single-vendor-
    // booth search never pays the extra lookup.
    if (!vendorBoothId || confirmedBooths.length === 0) {
      const houseBooth = await getOrCreateHouseBooth(hubId);
      if (houseBooth && (!vendorBoothId || vendorBoothId === houseBooth.id)) {
        const houseBoothRow = await prisma.vendorBooth.findUnique({
          where: { id: houseBooth.id },
          select: { id: true, userId: true, vendorName: true, boothNumber: true },
        });
        if (houseBoothRow && !confirmedBooths.some((b) => b.id === houseBoothRow.id)) {
          confirmedBooths.push(houseBoothRow);
        }
      }
    }

    // Same generic 404 whether the requested booth doesn't exist, belongs to a
    // different hub, isn't CONFIRMED, or is unclaimed -- no distinct signal leaked,
    // mirrors the old searchVendorBoothItems rejection behavior.
    if (vendorBoothId && confirmedBooths.length === 0) {
      return res.status(404).json({ error: 'Booth not found' });
    }

    // Resolve every booth's claiming User -> Organizer (mirrors addBoothCartItems'
    // owner-resolution pattern) so items can be mapped back to the right booth below.
    const userIds = Array.from(new Set(confirmedBooths.map((b) => b.userId as string)));
    const organizers = userIds.length
      ? await prisma.organizer.findMany({ where: { userId: { in: userIds } }, select: { id: true, userId: true } })
      : [];
    const userIdToOrganizerId = new Map(organizers.map((o) => [o.userId, o.id]));
    const organizerIdToBooth = new Map<string, (typeof confirmedBooths)[number]>();
    for (const booth of confirmedBooths) {
      const organizerId = booth.userId ? userIdToOrganizerId.get(booth.userId) : undefined;
      if (organizerId) organizerIdToBooth.set(organizerId, booth);
    }
    const organizerIds = Array.from(organizerIdToBooth.keys());

    if (organizerIds.length === 0) {
      return res.status(200).json({ items: [] });
    }

    const items = await prisma.item.findMany({
      where: {
        organizerId: { in: organizerIds },
        status: 'AVAILABLE',
        OR: [
          { title: { contains: q ?? '', mode: 'insensitive' as const } },
          { sku: { contains: q ?? '', mode: 'insensitive' as const } },
        ],
      },
      select: { id: true, title: true, sku: true, price: true, photoUrls: true, organizerId: true },
      orderBy: { title: 'asc' },
      take: 50,
    });

    return res.status(200).json({
      items: items.map((item) => {
        const booth = item.organizerId ? organizerIdToBooth.get(item.organizerId) : undefined;
        return {
          id: item.id,
          title: item.title,
          sku: item.sku,
          price: item.price,
          photoUrls: item.photoUrls,
          vendorBoothId: booth?.id ?? null,
          vendorName: booth?.vendorName ?? null,
          boothNumber: booth?.boothNumber ?? null,
        };
      }),
    });
  } catch (error) {
    console.error('[searchHubCartItems] Error:', error);
    return res.status(500).json({ error: 'Failed to search hub items' });
  }
};

export const listBoothCartTransactions = async (req: AuthRequest, res: Response) => {
  try {
    if (!req.user) return res.status(401).json({ error: 'Authentication required' });
    const { hubId } = req.params;

    const organizer = await prisma.organizer.findUnique({ where: { userId: req.user.id } });
    if (!organizer) return res.status(404).json({ error: 'Organizer profile not found' });

    const hub = await prisma.saleHub.findFirst({ where: { id: hubId, organizerId: organizer.id } });
    if (!hub) return res.status(404).json({ error: 'Hub not found' });

    const transactions = await prisma.boothCartTransaction.findMany({
      where: { hubId },
      select: {
        id: true, totalAmount: true, boothsRepresented: true, status: true, createdAt: true,
        cashierTeamMemberId: true, cashierBoothId: true, stripePaymentIntentId: true,
      },
      orderBy: { createdAt: 'desc' },
    });

    return res.status(200).json(
      transactions.map((t) => ({ ...t, totalAmount: t.totalAmount.toString() }))
    );
  } catch (error) {
    console.error('[listBoothCartTransactions] Error:', error);
    return res.status(500).json({ error: 'Failed to list cart transactions' });
  }
};
