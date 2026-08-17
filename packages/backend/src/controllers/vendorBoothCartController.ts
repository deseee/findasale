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
import { getAccountStatus } from '../services/stripeConnectService'; // Direct-charges migration (2026-08-08): live capability preflight

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
  hubOwnerOrganizer: {
    subscriptionTier: string | null;
    stripeConnectId: string | null;
    stripeOnboarded: boolean;
    stripeAccountType: string | null;
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
  const { amountCents, revenueSharePercent, hubOwnerOrganizer, skipReadinessGate } = params;
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
    const hubOwnerReady =
      !!hubOwnerOrganizer &&
      hubOwnerOrganizer.stripeAccountType === 'standard' &&
      hubOwnerOrganizer.stripeOnboarded &&
      !!hubOwnerOrganizer.stripeConnectId;

    if (!hubOwnerReady) {
      return {
        blocked: true,
        reason:
          "This hub's owner has not completed Stripe onboarding yet. Checkout is unavailable for booths with a revenue-share agreement until they do.",
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

    const hub = await prisma.saleHub.findUnique({ where: { id: hubId }, select: { id: true } });
    if (!hub) return res.status(404).json({ error: 'Hub not found' });

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
    const hub = await prisma.saleHub.findUnique({ where: { id: hubId }, select: { organizerId: true } });
    if (!hub) return res.status(404).json({ error: 'Hub not found' });

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

    if (isTerminalSimulated()) {
      const token = await stripe().terminal.connectionTokens.create({});
      return res.status(200).json({ secret: token.secret });
    }

    const booth = await prisma.vendorBooth.findFirst({ where: { id: vendorBoothId, hubId } });
    if (!booth?.stripeAccountId) {
      return res.status(400).json({ error: 'This booth has not completed Stripe onboarding' });
    }

    const token = await stripe().terminal.connectionTokens.create({}, { stripeAccount: booth.stripeAccountId! });
    return res.status(200).json({ secret: token.secret });
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

    try {
      await beginCartCheckout({
        cart,
        hubId,
        cashierTeamMemberId: req.boothAuth.type === 'TEAM_MEMBER' ? req.boothAuth.teamMemberId : null,
        cashierBoothId: req.boothAuth.type === 'BOOTH' ? req.boothAuth.vendorBoothId : null,
        context: 'boothCartTerminalAuthorize',
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

    const booth = await prisma.vendorBooth.findFirst({
      where: { id: vendorBoothId, hubId },
      include: { hub: { select: { organizer: { select: { subscriptionTier: true, stripeConnectId: true, stripeOnboarded: true, stripeAccountType: true } } } } },
    });
    if (!booth) return res.status(404).json({ error: 'Booth not found' });
    if (!isTerminalSimulated()) {
      if (booth.stripeAccountType !== 'standard' || !booth.stripeOnboarded || !booth.stripeAccountId) {
        // Fix 2 (2026-08-01): a house booth failing this gate is the HUB OWNER's own
        // Stripe account, not some other vendor's -- the generic "Booth X hasn't
        // completed onboarding" copy would be confusing/wrong addressed to the owner
        // themselves. This is an intentional, architect-approved limitation (ADR-023):
        // an owner still on a legacy Express account can't sell their own items via
        // card/QR through venue mode until they migrate to Standard -- cash still works
        // (captureBoothCash doesn't require this gate). The gate itself is unchanged.
        const message = booth.isHubOwnerBooth
          ? 'Complete your Stripe account upgrade in Settings to sell your own items through this register'
          : `Booth "${booth.vendorName}" has not completed Standard-account onboarding`;
        return res.status(400).json({ error: message });
      }
      // Direct-charges migration (2026-08-08): live capability preflight. The check above
      // relies on VendorBooth.stripeOnboarded, a cached DB flag that can drift from
      // Stripe's actual live state (a DB-cache vs live-Stripe discrepancy was confirmed
      // for at least one real organizer this session) -- never authorize a real charge
      // against an account Stripe itself doesn't currently report as charge-capable.
      try {
        const liveStatus = await getAccountStatus(booth.stripeAccountId!);
        if (!liveStatus.chargesEnabled) {
          return res.status(400).json({ error: `Booth "${booth.vendorName}"'s Stripe account cannot currently accept charges. Please check its Stripe onboarding status.` });
        }
      } catch (statusErr) {
        console.error(`[boothCartTerminalAuthorize] getAccountStatus preflight failed for booth ${booth.id}:`, statusErr);
        return res.status(502).json({ error: "Could not verify the booth's payment account status. Please try again." });
      }
    }

    const items = await resolveBoothLegItems(cart.id, cart.boothsRepresented, vendorBoothId);
    const amountCents = Math.round(items.reduce((sum, i) => sum + (i.price || 0), 0) * 100);
    if (amountCents < 50) {
      return res.status(400).json({ error: `Booth "${booth.vendorName}"'s subtotal must be at least $0.50 to process payment` });
    }

    // ADR-090 Phase 2: platform cut + hub-owner revenue-share split, computed once
    // per leg. Blocks checkout (400) if this booth owes a revenue share but its hub
    // owner isn't onboarded — never silently drops the hub owner's cut.
    const feeSplit = await computeLegFeeSplit({
      amountCents,
      revenueSharePercent: booth.revenueSharePercent,
      hubOwnerOrganizer: booth.hub.organizer,
    });
    if (feeSplit.blocked) {
      return res.status(400).json({ error: feeSplit.reason });
    }

    // Race-safe claim (findasale-hacker adversarial pass, 2026-07-08): the existingLeg
    // check above is a plain read and cannot close a TOCTOU window between two
    // concurrent authorize calls for the SAME booth on the SAME cart (e.g. a flaky
    // cashier UI double-firing the tap request) -- both could pass that read before
    // either creates its row, producing TWO PaymentIntents (and, once captured, TWO
    // Purchase rows) for the same booth's items. This claim leverages the EXISTING
    // @unique constraint on BoothCartLeg.stripePaymentIntentId as a compare-and-swap
    // primitive (no schema change): a deterministic key means only one concurrent
    // request's create() can win; the loser gets a Prisma P2002 and is rejected below,
    // BEFORE any Stripe call is made (so a losing request never creates a stray
    // PaymentIntent). The winner overwrites the placeholder with the real Stripe
    // PaymentIntent id once it's created.
    const claimKey = `claim_${cart.id}_${vendorBoothId}`;
    let claimedLeg;
    try {
      claimedLeg = await prisma.boothCartLeg.create({
        data: {
          cartTransactionId: cart.id,
          vendorBoothId,
          stripeAccountId: isTerminalSimulated() ? '' : booth.stripeAccountId!,
          stripePaymentIntentId: claimKey,
          amountCents,
          rail: 'TERMINAL',
          status: 'PENDING',
          hubOwnerShareAmount: feeSplit.hubOwnerShareCents > 0 ? new Decimal(feeSplit.hubOwnerShareCents / 100) : null,
          // Persist the platform's own cut alongside the hub owner's, so the vendor-facing
          // sale notification can quote what was ACTUALLY charged. application_fee_amount is
          // platformFee + hubOwnerShare, and only the hub-owner half was ever stored -- the
          // platform half was unrecoverable afterwards without re-reading the organizer's
          // MUTABLE subscriptionTier, which is exactly how a disclosure ends up saying 10%
          // when the charge was 8%. Written unconditionally, mirroring hubOwnerShareAmount.
          platformFeeCents: feeSplit.applicationFeeAmountCents - feeSplit.hubOwnerShareCents,
        },
      });
    } catch (claimErr: any) {
      if (claimErr?.code === 'P2002') {
        return res.status(409).json({ error: 'This booth already has an active leg on this cart (concurrent request)' });
      }
      throw claimErr;
    }

    const piParams = {
      amount: amountCents,
      currency: 'usd',
      payment_method_types: ['card_present'],
      capture_method: 'manual' as const,
      // ADR-090 Phase 2: application_fee_amount only applies to a Direct/Destination
      // charge on a connected account — simulated-mode PIs aren't scoped to one
      // (mirrors terminalController.ts's own !isSimulated gate on this same field).
      ...(!isTerminalSimulated() ? { application_fee_amount: feeSplit.applicationFeeAmountCents } : {}),
      metadata: {
        source: 'booth_cart_leg',
        rail: 'TERMINAL',
        hubId,
        cartTransactionId: cart.id,
        vendorBoothId,
      },
    };

    let paymentIntent;
    try {
      paymentIntent = isTerminalSimulated()
        ? await stripe().paymentIntents.create(piParams)
        : await stripe().paymentIntents.create(piParams, { stripeAccount: booth.stripeAccountId! });
    } catch (err: any) {
      console.error('[authorizeBoothCartTerminalLeg] Failed to create PaymentIntent:', err);
      // Release the claim so a retry isn't permanently blocked by the deterministic key.
      await prisma.boothCartLeg.delete({ where: { id: claimedLeg.id } }).catch((delErr) =>
        console.error('[authorizeBoothCartTerminalLeg] Failed to release claim leg after Stripe error:', delErr)
      );
      return res.status(500).json({ error: 'Failed to create payment intent for this booth', details: err.message });
    }

    const leg = await prisma.boothCartLeg.update({
      where: { id: claimedLeg.id },
      data: { stripePaymentIntentId: paymentIntent.id },
    });

    return res.status(200).json({
      legId: leg.id,
      vendorBoothId,
      clientSecret: paymentIntent.client_secret,
      paymentIntentId: paymentIntent.id,
      amountCents,
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

    // Ad hoc platform-level Stripe Customer for this walk-in cart -- the SetupIntent
    // (and the PaymentMethod-clone step after it) hangs off it. POS walk-in buyers
    // legitimately have no FindA.Sale account; Purchase.userId is already nullable for
    // exactly this case.
    //
    // P0 fix (2026-07-28): the branch removed here reused -- and on the miss path
    // OVERWROTE -- User.stripeCustomerId for whatever user id the CASHIER put in the
    // request body. That let a cashier both probe an arbitrary account for a saved-card
    // Customer and clobber it with one of their own making, on an unverified id. Buyer
    // identity is never taken from the body of a cashier-authenticated call.
    const customer = await stripe().customers.create({
      metadata: { source: 'booth_cart_qr', hubId, cartTransactionId: cart.id },
    });
    const platformCustomerId = customer.id;

    const setupIntent = await stripe().setupIntents.create({
      customer: platformCustomerId,
      payment_method_types: ['card'],
      usage: 'off_session',
      metadata: { source: 'booth_cart_qr', hubId, cartTransactionId: cart.id },
    });

    return res.status(200).json({ clientSecret: setupIntent.client_secret, setupIntentId: setupIntent.id });
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
    if (cart.status !== 'IN_PROGRESS') {
      return res.status(409).json({ error: `Cart is not ready for QR authorization (status: ${cart.status})` });
    }

    let setupIntent;
    try {
      setupIntent = await stripe().setupIntents.retrieve(setupIntentId);
    } catch (err: any) {
      console.error('[authorizeBoothCartQrLegs] Failed to retrieve SetupIntent:', err);
      return res.status(400).json({ error: 'Could not verify card setup with Stripe' });
    }
    if (setupIntent.status !== 'succeeded') {
      return res.status(400).json({ error: `SetupIntent status is ${setupIntent.status}, expected succeeded` });
    }
    const platformCustomerId = typeof setupIntent.customer === 'string' ? setupIntent.customer : setupIntent.customer?.id;
    const platformPaymentMethodId = typeof setupIntent.payment_method === 'string' ? setupIntent.payment_method : setupIntent.payment_method?.id;
    if (!platformCustomerId || !platformPaymentMethodId) {
      return res.status(400).json({ error: 'SetupIntent is missing a customer or payment method' });
    }
    // The SetupIntent id is a client-supplied body field, so it must be proven to belong
    // to THIS cart -- not merely to exist and have succeeded (findasale-hacker
    // fix-and-reverify pass, 2026-07-28). Every booth-cart SetupIntent is created by
    // createBoothCartQrSetupIntent above with source/cartTransactionId metadata on the
    // PLATFORM account, so without this check a cashier could hand in another cart's
    // succeeded SetupIntent and clone THAT shopper's card into this cart's booths --
    // charging a card whose owner never agreed to this basket.
    if (
      setupIntent.metadata?.source !== 'booth_cart_qr' ||
      setupIntent.metadata?.cartTransactionId !== cart.id
    ) {
      return res.status(400).json({ error: 'This card setup does not belong to this cart' });
    }

    const booths = await prisma.vendorBooth.findMany({
      where: { id: { in: cart.boothsRepresented } },
      include: { hub: { select: { organizer: { select: { subscriptionTier: true, stripeConnectId: true, stripeOnboarded: true, stripeAccountType: true } } } } },
    });
    const alreadyLegged = await prisma.boothCartLeg.findMany({
      where: { cartTransactionId: cart.id, status: { in: ['PENDING', 'REQUIRES_CAPTURE', 'CAPTURED'] } },
      select: { vendorBoothId: true },
    });
    const alreadyLeggedIds = new Set(alreadyLegged.map((l) => l.vendorBoothId));
    const boothsToCharge = booths.filter((b) => !alreadyLeggedIds.has(b.id));

    const createdLegs: Array<{ legId: string; vendorBoothId: string; paymentIntentId: string }> = [];
    let failure: { vendorBoothId: string; vendorName: string; message: string } | null = null;

    for (const booth of boothsToCharge) {
      if (booth.stripeAccountType !== 'standard' || !booth.stripeOnboarded || !booth.stripeAccountId) {
        // Fix 2 (2026-08-01): see the identical note on the Terminal rail above -- a
        // house booth here is the hub owner's own account, so the failure copy is
        // organizer-facing instead of the generic vendor-facing message.
        const message = booth.isHubOwnerBooth
          ? 'Complete your Stripe account upgrade in Settings to sell your own items through this register'
          : `Booth "${booth.vendorName}" has not completed Standard-account onboarding`;
        failure = { vendorBoothId: booth.id, vendorName: booth.vendorName, message };
        break;
      }

      // Direct-charges migration (2026-08-08): live capability preflight -- same
      // DB-cache vs live-Stripe rationale as the Terminal rail's identical check above.
      try {
        const liveStatus = await getAccountStatus(booth.stripeAccountId!);
        if (!liveStatus.chargesEnabled) {
          failure = {
            vendorBoothId: booth.id,
            vendorName: booth.vendorName,
            message: `Booth "${booth.vendorName}"'s Stripe account cannot currently accept charges. Please check its Stripe onboarding status.`,
          };
          break;
        }
      } catch (statusErr) {
        console.error(`[boothCartQrAuthorize] getAccountStatus preflight failed for booth ${booth.id}:`, statusErr);
        failure = { vendorBoothId: booth.id, vendorName: booth.vendorName, message: "Could not verify the booth's payment account status. Please try again." };
        break;
      }

      const items = await resolveBoothLegItems(cart.id, cart.boothsRepresented, booth.id);
      const amountCents = Math.round(items.reduce((sum, i) => sum + (i.price || 0), 0) * 100);
      if (amountCents < 50) {
        failure = { vendorBoothId: booth.id, vendorName: booth.vendorName, message: `Booth "${booth.vendorName}"'s subtotal must be at least $0.50` };
        break;
      }

      // ADR-090 Phase 2: platform cut + hub-owner revenue-share split (see Terminal
      // rail's identical computation above for the full rationale). Whole-cart-fail
      // like every other per-leg failure in this loop — never silently drops the
      // hub owner's cut.
      const feeSplit = await computeLegFeeSplit({
        amountCents,
        revenueSharePercent: booth.revenueSharePercent,
        hubOwnerOrganizer: booth.hub.organizer,
      });
      if (feeSplit.blocked) {
        failure = { vendorBoothId: booth.id, vendorName: booth.vendorName, message: feeSplit.reason };
        break;
      }

      // Race-safe claim (findasale-hacker adversarial pass, 2026-07-08): same
      // compare-and-swap technique as the Terminal rail's authorize endpoint -- the
      // alreadyLeggedIds snapshot computed above this loop is a plain read and can't
      // close a TOCTOU window against a second concurrent /qr/authorize call (e.g. a
      // double-submitted "Pay" tap on the shopper's phone) for the same booth on the
      // same cart. A losing concurrent request gets P2002 here and skips this booth
      // (its leg was already claimed by the winner) rather than creating a duplicate
      // PaymentMethod clone + PaymentIntent for the same items.
      const claimKey = `claim_${cart.id}_${booth.id}`;
      let claimedLeg;
      try {
        claimedLeg = await prisma.boothCartLeg.create({
          data: {
            cartTransactionId: cart.id,
            vendorBoothId: booth.id,
            stripeAccountId: booth.stripeAccountId!,
            stripePaymentIntentId: claimKey,
            amountCents,
            rail: 'QR',
            status: 'PENDING',
            hubOwnerShareAmount: feeSplit.hubOwnerShareCents > 0 ? new Decimal(feeSplit.hubOwnerShareCents / 100) : null,
            // Same as the TERMINAL rail above: store the platform's own cut so the sale
            // notification never has to re-derive it. Both rails converge on captureBoothCart.
            platformFeeCents: feeSplit.applicationFeeAmountCents - feeSplit.hubOwnerShareCents,
          },
        });
      } catch (claimErr: any) {
        if (claimErr?.code === 'P2002') {
          continue;
        }
        throw claimErr;
      }

      try {
        // Clone the platform PaymentMethod onto this booth's connected account —
        // Stripe's documented "share payment methods across multiple accounts for
        // direct charges" call. Returns a NEW PaymentMethod id valid only on this
        // connected account.
        const clonedPm = await stripe().paymentMethods.create(
          { customer: platformCustomerId, payment_method: platformPaymentMethodId },
          { stripeAccount: booth.stripeAccountId! }
        );

        const paymentIntent = await stripe().paymentIntents.create(
          {
            amount: amountCents,
            currency: 'usd',
            payment_method_types: ['card'],
            payment_method: clonedPm.id,
            capture_method: 'manual',
            confirm: true,
            off_session: true,
            // ADR-090 Phase 2: platform cut + hub-owner revenue-share cut.
            application_fee_amount: feeSplit.applicationFeeAmountCents,
            metadata: {
              source: 'booth_cart_leg',
              rail: 'QR',
              hubId,
              cartTransactionId: cart.id,
              vendorBoothId: booth.id,
            },
          },
          { stripeAccount: booth.stripeAccountId! }
        );

        const leg = await prisma.boothCartLeg.update({
          where: { id: claimedLeg.id },
          data: {
            stripePaymentIntentId: paymentIntent.id,
            status: paymentIntent.status === 'requires_capture' ? 'REQUIRES_CAPTURE' : 'PENDING',
          },
        });
        createdLegs.push({ legId: leg.id, vendorBoothId: booth.id, paymentIntentId: paymentIntent.id });
      } catch (err: any) {
        console.error(`[authorizeBoothCartQrLegs] Failed to confirm leg for booth ${booth.id}:`, err);
        await prisma.boothCartLeg.delete({ where: { id: claimedLeg.id } }).catch((delErr) =>
          console.error(`[authorizeBoothCartQrLegs] Failed to release claim leg ${claimedLeg.id} after Stripe error:`, delErr)
        );
        failure = { vendorBoothId: booth.id, vendorName: booth.vendorName, message: err.message || 'Card was declined' };
        break;
      }
    }

    if (failure) {
      // Whole-cart-fail: cancel every leg this call just created (free — none are
      // captured yet), matching the Terminal rail's cancel policy.
      for (const created of createdLegs) {
        const legBooth = booths.find((b) => b.id === created.vendorBoothId);
        try {
          if (legBooth?.stripeAccountId) {
            await stripe().paymentIntents.cancel(created.paymentIntentId, {}, { stripeAccount: legBooth.stripeAccountId! });
          }
        } catch (cancelErr) {
          console.error(`[authorizeBoothCartQrLegs] Failed to cancel leg ${created.legId} during whole-cart-fail:`, cancelErr);
        }
        await prisma.boothCartLeg.update({ where: { id: created.legId }, data: { status: 'CANCELED' } }).catch(() => {});
      }
      return res.status(402).json({ error: failure.message, vendorBoothId: failure.vendorBoothId, vendorName: failure.vendorName });
    }

    return res.status(200).json({ legs: createdLegs });
  } catch (error) {
    console.error('[authorizeBoothCartQrLegs] Error:', error);
    return res.status(500).json({ error: 'Failed to authorize QR checkout legs' });
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
  // at the purchase.create call).
  legs: Array<{ id: string; vendorBoothId: string; stripePaymentIntentId: string; rail: string; stripeAccountId: string | null }>
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
        const legIsRealDirectCharge = leg.rail !== 'CASH' && !!leg.stripeAccountId;
        // NO FEE SNAPSHOT, DELIBERATELY (2026-08-17): this row carries no platformFeeAmount at
        // all — booth-cart economics are settled per booth leg (ADR-020/ADR-090), not through
        // Purchase. There is no fee here to decompose, so the snapshot stays NULL.
        const purchase = await prisma.purchase.create({
          data: {
            userId: null, // walk-in POS: no server-derived shopper identity exists (P0 fix, 2026-07-28)
            itemId: item.id,
            amount: item.price || 0,
            stripePaymentIntentId: leg.stripePaymentIntentId,
            source: 'POS',
            status: 'PAID',
            boothCartTransactionId: cart.id,
            chargeType: legIsRealDirectCharge ? 'DIRECT' : 'DESTINATION',
            ...(legIsRealDirectCharge ? { stripeAccountId: leg.stripeAccountId! } : {}),
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
    for (const leg of legs) {
      if (isTerminalSimulated() && leg.rail === 'TERMINAL') {
        // Simulated readers auto-succeed; trust the recorded status.
        if (leg.status !== 'REQUIRES_CAPTURE') notReady.push(leg.vendorBoothId);
        continue;
      }
      try {
        const pi = await stripe().paymentIntents.retrieve(leg.stripePaymentIntentId, { stripeAccount: leg.stripeAccountId });
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
        if (isTerminalSimulated() && leg.rail === 'TERMINAL') {
          await stripe().paymentIntents.capture(leg.stripePaymentIntentId);
        } else {
          await stripe().paymentIntents.capture(leg.stripePaymentIntentId, {}, { stripeAccount: leg.stripeAccountId });
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
      include: { hub: { select: { organizer: { select: { subscriptionTier: true, stripeConnectId: true, stripeOnboarded: true, stripeAccountType: true } } } } },
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

    // findasale-hacker fix (2026-08-09): widened to include rail + stripeAccountId so this array's type stays compatible with finalizeCapturedLegs' widened parameter type below -- the actual pushed objects (real BoothCartLeg rows from prisma.boothCartLeg.create) always had both fields already, this only fixes the local type annotation.
    const legs: Array<{ id: string; vendorBoothId: string; stripePaymentIntentId: string; hubOwnerShareAmount: any; rail: string; stripeAccountId: string | null }> = [];
    for (const { booth, amountCents } of boothAmounts) {
      // Cash-only variant: computes platformFeeCents/hubOwnerShareCents for reporting
      // WITHOUT blocking on the hub owner's Stripe onboarding readiness -- see
      // computeLegFeeSplit's skipReadinessGate comment. blocked can never be true here.
      const feeSplit = await computeLegFeeSplit({
        amountCents,
        revenueSharePercent: booth.revenueSharePercent,
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
