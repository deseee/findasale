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

// ============================================================================
// Vendor Booth Payments — assertBoothCartCheckoutAllowed (2026-07-07)
// ADR-017 Fix #3 (P0): a new sibling guard, NOT a parameterization of
// assertCheckoutAllowed. assertCheckoutAllowed resolves exactly one protected
// party (sale.organizer.userId) and has a live production caller
// (createPaymentIntent) that must not regress from a breaking signature change.
// A BoothCartTransaction has no single saleId — it spans a hub and N vendor
// booths — so it needs a distinct protected-party resolution shape (N parties,
// not 1). Shares the same three-check primitive (SELF_DEALING, SHARED_DEVICE_FP,
// SHARED_CARD_FP) conceptually, but does NOT write to FraudSignal because
// FraudSignal.saleId is a required (non-nullable) FK and a booth cart has no
// saleId to satisfy it — logging is console-only for this guard (flagged gap,
// see Dev Handoff "Blocked / Flagged": FraudSignal has no hub-scoped variant yet).
// ============================================================================

export interface AssertBoothCartCheckoutAllowedParams {
  buyerUserId?: string;
  hubId: string;
  cartTransactionId: string;
  boothsRepresented: string[];
  cashierTeamMemberId?: string | null;
  cashierBoothId?: string | null;
  prisma: PrismaClientLike;
  context: string; // e.g. 'boothCartCharge'
}

/**
 * Best-effort, non-throwing console log for booth-cart collusion signals.
 * FraudSignal cannot be used here (saleId is required, non-nullable, and a
 * booth cart has no single sale). This is a real, documented gap relative to
 * the sale-scoped guard's persisted-signal behavior — flagged in the Dev
 * Handoff, not silently accepted as equivalent.
 */
function logBoothCartSignal(params: {
  signalType: CollusionSignalType;
  context: string;
  hubId: string;
  cartTransactionId: string;
  buyerUserId: string;
  notes: string;
}): void {
  console.error(
    `[checkoutGuard][boothCart] ${params.signalType} — hub=${params.hubId} cart=${params.cartTransactionId} buyer=${params.buyerUserId} [${params.context}] ${params.notes}`
  );
}

/**
 * assertBoothCartCheckoutAllowed — HARD BLOCK guard for the roaming multi-booth
 * cart charge endpoint. Throws CheckoutGuardError when identity-grade collusion
 * is detected against ANY protected party. Callers must catch this and return a
 * generic HTTP 403 — never leak which signal or which party fired.
 *
 * Protected parties resolved as:
 *  - the hub's owning Organizer.userId (via SaleHub.organizerId -> Organizer.userId)
 *  - the cashier's User.id, if a TeamMember rang up the cart (via
 *    TeamMember.workspaceMemberId -> WorkspaceMember.userId/organizerId -> User)
 *    — a booth-token cashier session (cashierBoothId set) has no separate
 *    "cashier User" beyond its own booth's identity (next bullet)
 *  - every VendorBooth.userId's User for each booth ID in boothsRepresented
 *    (skip nulls — an unclaimed booth has no User yet, so has no identity
 *    fingerprint to compare; per the 2026-07-07 decision log, unclaimed booths
 *    are BLOCKED from checkout entirely at the cart add-items step, which closes
 *    most of this residual gap in practice — this guard's null-skip is defense
 *    in depth for any booth that becomes unclaimed between add-items and charge)
 *
 * Checks per protected party (identity-grade only, same as assertCheckoutAllowed):
 *  SELF_DEALING (buyer === protected party's User.id), SHARED_DEVICE_FP, SHARED_CARD_FP.
 *
 * Cart-specific additional check: SELF_DEALING extends to cashierBoothId === any
 * vendorBoothId in boothsRepresented — a booth-token session ringing up its own
 * booth's items is self-dealing regardless of who the buyer is.
 *
 * Never reads or compares IP address — shared network/IP is explicitly out of scope,
 * same as assertCheckoutAllowed.
 */
export async function assertBoothCartCheckoutAllowed({
  buyerUserId,
  hubId,
  cartTransactionId,
  boothsRepresented,
  cashierTeamMemberId,
  cashierBoothId,
  prisma,
  context,
}: AssertBoothCartCheckoutAllowedParams): Promise<void> {
  // Cart-specific: a booth-token cashier session ringing up its own booth is
  // self-dealing regardless of buyer identity.
  if (cashierBoothId && boothsRepresented.includes(cashierBoothId)) {
    logBoothCartSignal({
      signalType: 'SELF_DEALING',
      context,
      hubId,
      cartTransactionId,
      buyerUserId,
      notes: `Booth-token cashier (boothId ${cashierBoothId}) rang up a cart containing its own booth's items.`,
    });
    throw new CheckoutGuardError();
  }

  // 2026-07-07 fix (findasale-hacker adversarial pass): the buyer-identity checks
  // below all require a real buyerUserId. A walk-in POS cart with no buyer account
  // has none to check — that is expected and fine. This is an explicit, documented
  // no-op, not a silent skip: the cashier self-dealing check above already ran
  // unconditionally and is NOT affected by buyerUserId being absent.
  if (!buyerUserId) {
    return;
  }

  // Resolve protected party User IDs: hub organizer + cashier (if TeamMember) + every
  // represented booth's claiming User (skip unclaimed/null).
  const protectedUserIds = new Set<string>();

  const hub = await prisma.saleHub.findUnique({
    where: { id: hubId },
    select: { organizer: { select: { userId: true } } },
  });
  if (hub?.organizer?.userId) protectedUserIds.add(hub.organizer.userId);

  if (cashierTeamMemberId) {
    const cashier = await prisma.teamMember.findUnique({
      where: { id: cashierTeamMemberId },
      select: {
        workspaceMember: { select: { userId: true, organizerId: true, organizer: { select: { userId: true } } } },
      },
    });
    const cashierUserId =
      cashier?.workspaceMember?.userId || cashier?.workspaceMember?.organizer?.userId || null;
    if (cashierUserId) protectedUserIds.add(cashierUserId);
  }

  if (boothsRepresented.length > 0) {
    const booths = await prisma.vendorBooth.findMany({
      where: { id: { in: boothsRepresented } },
      select: { userId: true },
    });
    for (const b of booths) {
      if (b.userId) protectedUserIds.add(b.userId);
    }
  }

  if (protectedUserIds.size === 0) return;

  const buyer = await prisma.user.findUnique({
    where: { id: buyerUserId },
    select: { deviceFingerprint: true, stripeCardFingerprint: true },
  });

  for (const partyUserId of protectedUserIds) {
    // (a) SELF-DEALING: buyer === protected party (User.id space)
    if (buyerUserId === partyUserId) {
      logBoothCartSignal({
        signalType: 'SELF_DEALING',
        context,
        hubId,
        cartTransactionId,
        buyerUserId,
        notes: `Buyer userId matches a protected party (hub organizer, cashier, or represented booth operator) userId ${partyUserId}.`,
      });
      throw new CheckoutGuardError();
    }

    const party = await prisma.user.findUnique({
      where: { id: partyUserId },
      select: { deviceFingerprint: true, stripeCardFingerprint: true },
    });

    // (b) SHARED DEVICE FINGERPRINT
    if (
      buyer?.deviceFingerprint != null &&
      party?.deviceFingerprint != null &&
      buyer.deviceFingerprint === party.deviceFingerprint
    ) {
      logBoothCartSignal({
        signalType: 'SHARED_DEVICE_FP',
        context,
        hubId,
        cartTransactionId,
        buyerUserId,
        notes: `Buyer device fingerprint matches protected party ${partyUserId}.`,
      });
      throw new CheckoutGuardError();
    }

    // (c) SHARED CARD FINGERPRINT
    if (
      buyer?.stripeCardFingerprint != null &&
      party?.stripeCardFingerprint != null &&
      buyer.stripeCardFingerprint === party.stripeCardFingerprint
    ) {
      logBoothCartSignal({
        signalType: 'SHARED_CARD_FP',
        context,
        hubId,
        cartTransactionId,
        buyerUserId,
        notes: `Buyer card fingerprint matches protected party ${partyUserId}.`,
      });
      throw new CheckoutGuardError();
    }
  }
}
