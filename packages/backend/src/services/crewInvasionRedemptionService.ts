import { prisma } from '../lib/prisma';

/**
 * Crew Invasion redemption (Feature #397, 2026-09-29).
 *
 * Until now a CrewInvasionCode was created, toasted to the crew and then never read by any
 * payment path. This module is the single place that turns a valid code into a real discount
 * on the Hold-to-Pay invoices (reservationController.markSoldAndCreateInvoice and
 * posController.sendHoldInvoice).
 *
 * RULES (locked with the spec, see crewInvasionService.ts header):
 *   - 10% (CrewInvasionCode.discountPct) off the shopper's HELD ITEMS at that sale only.
 *   - The code belongs to a crew + sale pair; the shopper must currently be a member of that
 *     crew. The code must be unexpired, unused, and the sale must still have Crew Invasion on.
 *   - Prices are computed server-side from Item.price. Nothing here trusts a client amount.
 *   - The discount is applied BEFORE the platform fee is computed by the caller, so the fee
 *     is charged on the discounted price (the caller passes the discounted total into
 *     calculateInclusiveCommissionCents).
 *   - One redemption per MEMBER per code (2026-09-29, replaces the old crew-wide single use).
 *     Every qualifying crew member gets the discount once per sale, matching the toast each
 *     member receives ("one use each"). Redemptions live in CrewInvasionRedemption, one row per
 *     (code, member), with a unique activeKey ("<codeId>:<userId>") that is set while the
 *     redemption is live and NULLed when it is released (same pattern as
 *     ConsignorPayoutItem.activeItemKey), so a double redeem is impossible while a released one
 *     can be redeemed again. CrewInvasionCode.usedAt is kept in the schema for compatibility but
 *     is no longer written or read: it can not block other members.
 *     Redemption is an insert guarded by the unique key (createMany skipDuplicates, no P2002
 *     catch) after an unexpired check. If the invoice/payment link cannot be created the caller
 *     calls releaseCrewInvasionRedemption(), fenced on the exact redeemedAt timestamp (and the
 *     member) so it can never release a later redemption. Once the HoldInvoice exists the caller
 *     links the redemption to it (linkCrewInvasionRedemptionToInvoice), and every path that
 *     kills an UNPAID discounted invoice (releaseInvoice, releaseInvoiceById, invoiceExpiryJob)
 *     calls releaseCrewInvasionRedemptionsForInvoice() AFTER its own transaction commits so the
 *     member can be re-invoiced with the discount while the code is still unexpired. A PAID
 *     invoice keeps its redemption for good.
 *   - Floor: the charge after discount never drops below CREW_INVASION_MIN_CHARGE_CENTS. That
 *     keeps it above the platform minimum fee (MINIMUM_TRANSACTION_FEE_CENTS, 75 cents) so the
 *     fee floor can never exceed what the shopper pays.
 *   - No stacking: if the invoice already carries another discount (for example a cashier
 *     discount line at the register), the shopper gets the LARGER of the two, never the sum.
 *     Concretely the crew discount is applied only for the amount by which it exceeds the
 *     other discount (top-up), so total discount = max(crew, other).
 */

/** Smallest total the shopper may be charged after the crew discount (cents). */
export const CREW_INVASION_MIN_CHARGE_CENTS = 100;

export type CrewCodeRejection =
  | 'CREW_CODE_INVALID'
  | 'CREW_CODE_WRONG_SALE'
  | 'CREW_CODE_NOT_YOURS'
  | 'CREW_CODE_EXPIRED'
  | 'CREW_CODE_USED'
  | 'CREW_CODE_DISABLED';

const REJECTION_MESSAGES: Record<CrewCodeRejection, string> = {
  CREW_CODE_INVALID: 'That crew discount code was not found.',
  CREW_CODE_WRONG_SALE: 'That crew discount code is for a different sale.',
  CREW_CODE_NOT_YOURS: 'That crew discount code belongs to a different crew.',
  CREW_CODE_EXPIRED: 'That crew discount code has expired.',
  CREW_CODE_USED: 'You have already used that crew discount code.',
  CREW_CODE_DISABLED: 'Crew Invasion is no longer active for this sale.',
};

export interface RedeemableCrewCode {
  id: string;
  code: string;
  discountPct: number;
}

export interface CrewDiscountApplied {
  applied: true;
  codeId: string;
  code: string;
  discountPct: number;
  discountCents: number;
  /**
   * Exact redeemedAt written by the redemption (named usedAt for caller compatibility); pass it
   * back to releaseCrewInvasionRedemption / linkCrewInvasionRedemptionToInvoice.
   */
  usedAt: Date;
  /** The redeeming member (needed to release or link exactly this member's redemption). */
  userId: string;
}

export interface CrewDiscountNotApplied {
  applied: false;
  /** Set only when the caller supplied an explicit code and it was rejected. */
  rejection?: { status: 400; code: CrewCodeRejection; message: string };
}

export type CrewDiscountResult = CrewDiscountApplied | CrewDiscountNotApplied;

/**
 * Pure discount math, in integer cents.
 *
 * @param eligibleBaseCents  Sum of the HELD ITEMS' prices being paid (never misc/ad hoc lines).
 * @param chargeableTotalCents  What the shopper would pay right now (after any other discount).
 * @param discountPct  CrewInvasionCode.discountPct.
 * @param otherDiscountCents  Discount already on the invoice from another source. The larger
 *                            of the two wins, so only the excess is added.
 */
export function computeCrewInvasionDiscountCents(params: {
  eligibleBaseCents: number;
  chargeableTotalCents: number;
  discountPct: number;
  otherDiscountCents?: number;
}): number {
  const { eligibleBaseCents, chargeableTotalCents, discountPct } = params;
  const other = Number.isFinite(params.otherDiscountCents) ? Math.max(0, params.otherDiscountCents as number) : 0;
  if (!Number.isFinite(eligibleBaseCents) || eligibleBaseCents <= 0) return 0;
  if (!Number.isFinite(chargeableTotalCents) || chargeableTotalCents <= 0) return 0;
  if (!Number.isFinite(discountPct) || discountPct <= 0) return 0;
  const pct = Math.min(100, Math.floor(discountPct));
  const crewDiscount = Math.round((eligibleBaseCents * pct) / 100);
  const topUp = Math.max(0, crewDiscount - other);
  const roomAboveFloor = Math.max(0, chargeableTotalCents - CREW_INVASION_MIN_CHARGE_CENTS);
  return Math.min(topUp, roomAboveFloor);
}

/** The shopper's currently redeemable code for a sale (unexpired, not yet used BY THIS SHOPPER), or null. */
export async function findRedeemableCrewInvasionCode(params: {
  saleId: string;
  shopperUserId: string;
  now?: Date;
}): Promise<RedeemableCrewCode | null> {
  const { saleId, shopperUserId } = params;
  const now = params.now ?? new Date();
  const memberships = await prisma.crewMember.findMany({
    where: { userId: shopperUserId },
    select: { crewId: true },
  });
  if (memberships.length === 0) return null;
  const row = await prisma.crewInvasionCode.findFirst({
    where: {
      saleId,
      crewId: { in: memberships.map((m: { crewId: string }) => m.crewId) },
      expiresAt: { gt: now },
      sale: { crewInvasionEnabled: true },
      // Per member: skip a code THIS shopper already has a live (or paid) redemption on. Other
      // members' redemptions never matter.
      redemptions: { none: { userId: shopperUserId, activeKey: { not: null } } },
    },
    orderBy: { expiresAt: 'asc' },
    select: { id: true, code: true, discountPct: true },
  });
  return row ?? null;
}

/**
 * Validate an explicitly supplied code string for this shopper and sale. Returns the code row
 * or a 4xx-shaped rejection with a specific, user-readable message.
 */
export async function validateCrewInvasionCode(params: {
  codeText: string;
  saleId: string;
  shopperUserId: string;
  now?: Date;
}): Promise<{ ok: true; code: RedeemableCrewCode } | { ok: false; rejection: { status: 400; code: CrewCodeRejection; message: string } }> {
  const now = params.now ?? new Date();
  const reject = (code: CrewCodeRejection) => ({
    ok: false as const,
    rejection: { status: 400 as const, code, message: REJECTION_MESSAGES[code] },
  });

  const text = typeof params.codeText === 'string' ? params.codeText.trim().toUpperCase() : '';
  if (!text || text.length > 64) return reject('CREW_CODE_INVALID');

  const row = await prisma.crewInvasionCode.findUnique({
    where: { code: text },
    select: {
      id: true,
      code: true,
      discountPct: true,
      saleId: true,
      crewId: true,
      expiresAt: true,
      sale: { select: { crewInvasionEnabled: true } },
    },
  });
  if (!row) return reject('CREW_CODE_INVALID');
  if (row.saleId !== params.saleId) return reject('CREW_CODE_WRONG_SALE');

  const membership = await prisma.crewMember.findFirst({
    where: { crewId: row.crewId, userId: params.shopperUserId },
    select: { id: true },
  });
  if (!membership) return reject('CREW_CODE_NOT_YOURS');
  // Per member: only THIS shopper's own live/paid redemption blocks the code.
  const alreadyRedeemed = await prisma.crewInvasionRedemption.findFirst({
    where: { codeId: row.id, userId: params.shopperUserId, activeKey: { not: null } },
    select: { id: true },
  });
  if (alreadyRedeemed) return reject('CREW_CODE_USED');
  if (row.expiresAt.getTime() <= now.getTime()) return reject('CREW_CODE_EXPIRED');
  if (!row.sale?.crewInvasionEnabled) return reject('CREW_CODE_DISABLED');

  return { ok: true, code: { id: row.id, code: row.code, discountPct: row.discountPct } };
}

/** activeKey value while a member's redemption of a code is live. */
export function crewRedemptionActiveKey(codeId: string, userId: string): string {
  return `${codeId}:${userId}`;
}

/**
 * Atomically redeem a code for ONE member. Exactly one caller can win per (code, member): the
 * insert is fenced by the unique activeKey (INSERT ... ON CONFLICT DO NOTHING via createMany
 * skipDuplicates, deliberately not a create-and-catch-P2002). Other crew members are unaffected.
 * The code must exist and be unexpired. Returns the redeemedAt written (the release fence) or null.
 * Signature note: (codeId, userId, now). The old crew-wide (codeId, now) form cannot express a
 * per-member redemption; its only callers were inside this module.
 */
export async function redeemCrewInvasionCode(
  codeId: string,
  userId: string,
  now: Date = new Date()
): Promise<Date | null> {
  if (!codeId || !userId) return null;
  const live = await prisma.crewInvasionCode.findFirst({
    where: { id: codeId, expiresAt: { gt: now } },
    select: { id: true },
  });
  if (!live) return null;
  try {
    const res = await prisma.crewInvasionRedemption.createMany({
      data: [{ codeId, userId, activeKey: crewRedemptionActiveKey(codeId, userId), redeemedAt: now }],
      skipDuplicates: true,
    });
    return res.count === 1 ? now : null;
  } catch (err: any) {
    // The code row was deleted between the check and the insert (crew disbanded): nothing to redeem.
    if (err?.code === 'P2003') return null;
    throw err;
  }
}

/**
 * Undo a redemption after the invoice/payment link could not be created. Fenced on the exact
 * redeemedAt this attempt wrote (and on the member when `userId` is supplied), so it is a no-op
 * if the redemption was released and redeemed again. Frees the member's activeKey so they can
 * redeem again; the row stays for audit. Never throws: a failed release is logged, and the
 * original failure stays the response.
 */
export async function releaseCrewInvasionRedemption(codeId: string, usedAt: Date, userId?: string): Promise<void> {
  try {
    await prisma.crewInvasionRedemption.updateMany({
      where: { codeId, redeemedAt: usedAt, releasedAt: null, ...(userId ? { userId } : {}) },
      data: { activeKey: null, releasedAt: new Date() },
    });
  } catch (err) {
    console.error('[crewInvasion] Failed to release redemption for code', codeId, err);
  }
}

/**
 * Attach a live redemption to the discounted HoldInvoice that now carries it, so the invoice
 * release / expiry paths can restore it. Fenced on the exact redemption this attempt made.
 * Never throws (logged): the invoice already exists and the shopper already has the discount.
 */
export async function linkCrewInvasionRedemptionToInvoice(params: {
  codeId: string;
  userId: string;
  usedAt: Date;
  holdInvoiceId: string;
}): Promise<void> {
  try {
    await prisma.crewInvasionRedemption.updateMany({
      where: { codeId: params.codeId, userId: params.userId, redeemedAt: params.usedAt, releasedAt: null },
      data: { holdInvoiceId: params.holdInvoiceId },
    });
  } catch (err) {
    console.error('[crewInvasion] Failed to link redemption to invoice', params.holdInvoiceId, err);
  }
}

/**
 * Restore the member's redemption when a discounted invoice dies UNPAID (cancelled by the
 * organizer or shopper, or expired by invoiceExpiryJob): the discount is given back so the next
 * invoice for the held items can apply it again while the code is still unexpired. Idempotent
 * (only rows not yet released are touched). Call it AFTER the invoice's own transaction has
 * committed and never inside it: a failure here must not abort the release/expiry. Never throws.
 * A PAID invoice must never be passed here. Returns how many redemptions were restored.
 */
export async function releaseCrewInvasionRedemptionsForInvoice(holdInvoiceId: string): Promise<number> {
  if (!holdInvoiceId) return 0;
  try {
    const res = await prisma.crewInvasionRedemption.updateMany({
      where: { holdInvoiceId, releasedAt: null },
      data: { activeKey: null, releasedAt: new Date() },
    });
    return res.count;
  } catch (err) {
    console.error('[crewInvasion] Failed to restore redemption for invoice', holdInvoiceId, err);
    return 0;
  }
}

/**
 * Find (or validate) the shopper's code, compute the discount and redeem it.
 * Callers MUST call releaseCrewInvasionRedemption if the invoice is not created afterwards.
 *
 * A redemption is only recorded when the computed discount is greater than zero, so a tiny
 * invoice (already at the minimum charge) never burns the member's one use for nothing.
 */
export async function applyCrewInvasionDiscount(params: {
  saleId: string;
  shopperUserId: string;
  eligibleBaseCents: number;
  chargeableTotalCents: number;
  otherDiscountCents?: number;
  providedCode?: string | null;
}): Promise<CrewDiscountResult> {
  try {
    let code: RedeemableCrewCode | null;
    if (params.providedCode) {
      const v = await validateCrewInvasionCode({
        codeText: params.providedCode,
        saleId: params.saleId,
        shopperUserId: params.shopperUserId,
      });
      if (!v.ok) return { applied: false, rejection: v.rejection };
      code = v.code;
    } else {
      code = await findRedeemableCrewInvasionCode({ saleId: params.saleId, shopperUserId: params.shopperUserId });
    }
    if (!code) return { applied: false };

    const discountCents = computeCrewInvasionDiscountCents({
      eligibleBaseCents: params.eligibleBaseCents,
      chargeableTotalCents: params.chargeableTotalCents,
      discountPct: code.discountPct,
      otherDiscountCents: params.otherDiscountCents,
    });
    if (discountCents <= 0) return { applied: false };

    const usedAt = await redeemCrewInvasionCode(code.id, params.shopperUserId);
    if (!usedAt) {
      // Lost the race (this same member's other invoice redeemed it first) or it just expired.
      if (params.providedCode) {
        return {
          applied: false,
          rejection: { status: 400, code: 'CREW_CODE_USED', message: REJECTION_MESSAGES.CREW_CODE_USED },
        };
      }
      return { applied: false };
    }
    return {
      applied: true,
      codeId: code.id,
      code: code.code,
      discountPct: code.discountPct,
      discountCents,
      usedAt,
      userId: params.shopperUserId,
    };
  } catch (err) {
    // Fail safe: a discount lookup problem must never block invoicing. Full price is charged.
    console.error('[crewInvasion] applyCrewInvasionDiscount error:', err);
    return { applied: false };
  }
}

/**
 * How many of these shoppers currently have a redeemable Crew Invasion code at the sale. Used by
 * reservationController.batchUpdateHolds (CHECKOUT_LINK mode) to tell the organizer, in the
 * response, that the crew discount was NOT applied to a payment link (see the DECISION comment
 * there) and who could still get it through their own hold invoice. Read-only, never throws
 * (returns 0 on any lookup problem), capped at 50 shoppers to bound the queries.
 */
export async function countCrewDiscountEligibleShoppers(saleId: string, shopperUserIds: string[]): Promise<number> {
  try {
    const ids = Array.from(new Set(shopperUserIds.filter((id) => typeof id === 'string' && id))).slice(0, 50);
    let eligible = 0;
    for (const shopperUserId of ids) {
      const code = await findRedeemableCrewInvasionCode({ saleId, shopperUserId });
      if (code) eligible++;
    }
    return eligible;
  } catch (err) {
    console.error('[crewInvasion] countCrewDiscountEligibleShoppers error:', err);
    return 0;
  }
}
