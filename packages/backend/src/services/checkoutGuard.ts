import { prisma as prismaClient } from '../lib/prisma';

type PrismaClientLike = typeof prismaClient;

/**
 * Checkout Guard — Collusion / Wash-Trade Prevention
 * Security audit S1072 (claude_docs/audits/security-visibility-audit-2026-07-04.md, Finding #4)
 *
 * Hard-blocks identity-grade collusion at the buyer/value-transfer entry points
 * (createPaymentIntent, placeHold, placeBid). The cash/terminal path is log-only
 * (recordSuspectedSignal) since it's offsite and cannot be prevented server-side.
 *
 * IMPORTANT: IP address / shared network is NEVER used as a block or self-flag signal.
 * A real customer on the organizer's wifi has their own device + card and must not be
 * blocked. This module never reads or compares IP for any decision.
 */

export class CheckoutGuardError extends Error {
  constructor(message: string = "This purchase can't be completed") {
    super(message);
    this.name = 'CheckoutGuardError';
  }
}

export type CollusionSignalType = 'SELF_DEALING' | 'SHARED_DEVICE_FP' | 'SHARED_CARD_FP';

interface AssertCheckoutAllowedParams {
  buyerUserId: string;
  saleId: string;
  itemId?: string;
  prisma: PrismaClientLike;
  context: string; // e.g. 'createPaymentIntent' | 'placeHold' | 'placeBid' — for FraudSignal notes
}

/**
 * Writes a FraudSignal row for a confirmed (block-worthy) collusion signal.
 * Uses upsert against the @@unique([userId, itemId, signalType]) constraint so
 * logging never throws and never blocks the caller's real error response.
 */
async function recordConfirmedSignal(
  prisma: PrismaClientLike,
  params: {
    userId: string;
    itemId: string | null;
    saleId: string;
    signalType: CollusionSignalType;
    notes: string;
  }
): Promise<void> {
  const { userId, itemId, saleId, signalType, notes } = params;
  try {
    // FraudSignal.itemId is optional but @@unique needs a concrete scalar for the
    // compound where clause — use an empty-string sentinel when itemId is absent.
    const itemKey = itemId ?? '';
    await prisma.fraudSignal.upsert({
      where: {
        userId_itemId_signalType: {
          userId,
          itemId: itemKey,
          signalType,
        },
      },
      update: {
        confidenceScore: 100,
        reviewOutcome: 'CONFIRMED',
        notes,
        detectedAt: new Date(),
      },
      create: {
        userId,
        itemId: itemId ?? undefined,
        saleId,
        signalType,
        confidenceScore: 100,
        reviewOutcome: 'CONFIRMED',
        notes,
      },
    });
  } catch (err) {
    console.error('[checkoutGuard] Failed to record FraudSignal (non-fatal):', err);
  }
}

/**
 * Records a lower-confidence, non-blocking FraudSignal for contexts where we can
 * observe a collusion-shaped pattern but cannot prevent it (e.g. cash/offsite sales).
 * Never throws — used by the POS/cash path, which must never be blocked by this module.
 */
export async function recordSuspectedSignal(params: {
  prisma: PrismaClientLike;
  userId: string;
  itemId?: string | null;
  saleId: string;
  signalType: CollusionSignalType;
  notes: string;
}): Promise<void> {
  const { prisma, userId, itemId, saleId, signalType, notes } = params;
  try {
    const itemKey = itemId ?? '';
    await prisma.fraudSignal.upsert({
      where: {
        userId_itemId_signalType: {
          userId,
          itemId: itemKey,
          signalType,
        },
      },
      update: {
        confidenceScore: 60,
        notes,
        detectedAt: new Date(),
      },
      create: {
        userId,
        itemId: itemId ?? undefined,
        saleId,
        signalType,
        confidenceScore: 60,
        reviewOutcome: 'PENDING',
        notes,
      },
    });
  } catch (err) {
    console.error('[checkoutGuard] Failed to record suspected FraudSignal (non-fatal):', err);
  }
}

/**
 * assertCheckoutAllowed — HARD BLOCK guard for online buyer value-transfer paths.
 * Throws CheckoutGuardError when identity-grade collusion is detected. Callers must
 * catch this and return a generic HTTP 403 — never leak which signal fired to the client.
 *
 * Checks (in order):
 *  (a) SELF-DEALING — buyer is the sale's organizer (compares User.id, not Organizer.id —
 *      the exact ID-space bug from Finding #3).
 *  (b) SHARED DEVICE FINGERPRINT — buyer and organizer share a non-null deviceFingerprint.
 *  (c) SHARED CARD FINGERPRINT — buyer and organizer share a non-null stripeCardFingerprint,
 *      OR two distinct buyer accounts already active on the same sale share a non-null
 *      stripeCardFingerprint (2 buyers, 1 card = wash trade).
 *
 * Null-safe: a null fingerprint on either side never counts as a match.
 * Never reads or compares IP address — shared network/IP is explicitly out of scope.
 */
export async function assertCheckoutAllowed({
  buyerUserId,
  saleId,
  itemId,
  prisma,
  context,
}: AssertCheckoutAllowedParams): Promise<void> {
  const sale = await prisma.sale.findUnique({
    where: { id: saleId },
    select: {
      organizer: {
        select: {
          userId: true,
        },
      },
    },
  });

  if (!sale || !sale.organizer) {
    // Sale/organizer existence is validated by the caller's own existing checks —
    // this guard only asserts collusion, it never duplicates not-found handling.
    return;
  }

  const organizerUserId = sale.organizer.userId;

  // (a) SELF-DEALING: buyer === organizer (User.id space, not Organizer.id)
  if (buyerUserId === organizerUserId) {
    await recordConfirmedSignal(prisma, {
      userId: buyerUserId,
      itemId: itemId ?? null,
      saleId,
      signalType: 'SELF_DEALING',
      notes: `[${context}] Buyer userId matches sale organizer userId.`,
    });
    throw new CheckoutGuardError();
  }

  const [buyer, organizerUser] = await Promise.all([
    prisma.user.findUnique({
      where: { id: buyerUserId },
      select: { deviceFingerprint: true, stripeCardFingerprint: true },
    }),
    prisma.user.findUnique({
      where: { id: organizerUserId },
      select: { deviceFingerprint: true, stripeCardFingerprint: true },
    }),
  ]);

  // (b) SHARED DEVICE FINGERPRINT: buyer <-> organizer
  if (
    buyer?.deviceFingerprint != null &&
    organizerUser?.deviceFingerprint != null &&
    buyer.deviceFingerprint === organizerUser.deviceFingerprint
  ) {
    await recordConfirmedSignal(prisma, {
      userId: buyerUserId,
      itemId: itemId ?? null,
      saleId,
      signalType: 'SHARED_DEVICE_FP',
      notes: `[${context}] Buyer device fingerprint matches sale organizer's device fingerprint.`,
    });
    throw new CheckoutGuardError();
  }

  // (c) SHARED CARD FINGERPRINT: buyer <-> organizer
  if (
    buyer?.stripeCardFingerprint != null &&
    organizerUser?.stripeCardFingerprint != null &&
    buyer.stripeCardFingerprint === organizerUser.stripeCardFingerprint
  ) {
    await recordConfirmedSignal(prisma, {
      userId: buyerUserId,
      itemId: itemId ?? null,
      saleId,
      signalType: 'SHARED_CARD_FP',
      notes: `[${context}] Buyer card fingerprint matches sale organizer's card fingerprint.`,
    });
    throw new CheckoutGuardError();
  }

  // (c-cont) SHARED CARD FINGERPRINT: two distinct buyer accounts on the SAME sale
  // sharing a card = wash trade (2 buyers, one card). Only checked when the current
  // buyer has a non-null card fingerprint — null never matches.
  if (buyer?.stripeCardFingerprint != null) {
    const otherBuyerWithSameCard = await prisma.user.findFirst({
      where: {
        id: { not: buyerUserId },
        stripeCardFingerprint: buyer.stripeCardFingerprint,
        OR: [
          { purchases: { some: { saleId } } },
          { reservations: { some: { item: { saleId } } } },
        ],
      },
      select: { id: true },
    });

    if (otherBuyerWithSameCard) {
      await recordConfirmedSignal(prisma, {
        userId: buyerUserId,
        itemId: itemId ?? null,
        saleId,
        signalType: 'SHARED_CARD_FP',
        notes: `[${context}] Buyer card fingerprint matches another buyer (userId ${otherBuyerWithSameCard.id}) already active on this same sale.`,
      });
      throw new CheckoutGuardError();
    }
  }
}
