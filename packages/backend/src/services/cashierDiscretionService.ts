/**
 * Cashier Discretionary Discount at Point of Sale (ADR cashier-discretionary-discount,
 * 2026-09-25, Maple Lake Mall shared register). Deliberately NOT merged with
 * posDiscountService.ts -- that mechanism is cart-level/role-level and scoped to the
 * single-organizer POS flow (posPaymentController.ts / terminalController.ts); this one
 * is item-level, cap-bounded against the item's own original/current price, and scoped
 * to the hub/venue-cart booth-checkout flow (vendorBoothCartController.ts).
 *
 * Contract:
 *   - computeCashierDiscretionCap is PURE -- no DB access, no side effects. It takes a
 *     live Item row's price/originalPrice (in dollars, as Prisma hands them back) and
 *     returns the max additional discretion (in cents) that can be applied RIGHT NOW,
 *     using the CONSERVATIVE reading Patrick decided on: both caps apply
 *     INDEPENDENTLY -- max 10% of the item's CURRENT price, AND never more than 20% off
 *     the item's ORIGINAL price in total. This can land slightly under 20% in some cases
 *     (e.g. already-10%-off item + another 10% of current = 19% off original) -- that is
 *     correct and expected, never special-cased to force exactly 20%.
 *   - resolveCashierDiscretion is the only function that talks to the DB. It (a) checks
 *     the actor is allowed to grant discretion at all (HUB_OWNER always passes with no
 *     grant row needed -- but is STILL cap-bounded, see the cap check below, never
 *     exempt from it; TEAM_MEMBER/BOOTH require an enabled CashierDiscretionGrant row
 *     for this hub), then (b) computes the live cap from the item row the CALLER
 *     supplies (never trusts a client-supplied price/originalPrice/cap -- every caller
 *     of this function is expected to have just read `item` fresh from Prisma), then
 *     (c) clamps the cashier's requested percent (of the item's CURRENT price, 0-10)
 *     down to that cap. The server NEVER accepts a client-supplied cents/dollar amount
 *     directly -- only a requested PERCENT, resolved to cents here, server-side, from a
 *     fresh read.
 */

import { prisma } from '../lib/prisma';

// Both caps below apply INDEPENDENTLY (Patrick's Decision 1, conservative reading) --
// never combined into a single "top up to exactly 20%" rule.
const DISCRETION_HARD_CAP_PERCENT_OF_CURRENT = 0.10; // max 10% of the item's CURRENT price
const DISCRETION_CEILING_PERCENT_OF_ORIGINAL = 0.20; // never more than 20% off ORIGINAL, total (markdown + discretion combined)

export type CashierActorType = 'HUB_OWNER' | 'TEAM_MEMBER' | 'BOOTH';

export interface CashierDiscretionCapInput {
  originalPrice: number | null;
  price: number | null;
}

export interface CashierDiscretionCapResult {
  maxDiscretionCents: number;
  originalCents: number;
  currentCents: number;
  alreadyOffCents: number;
}

/**
 * Pure, per ADR §2 (used as-is, conservative reading): given a live Item row's
 * originalPrice/price (dollars), returns the max ADDITIONAL discretion (cents) that can
 * be applied to this item right now. originalCents<=0 or currentCents<=0 (unpriced item,
 * or an item that somehow never got an originalPrice backfilled) safely returns a zero
 * cap rather than dividing by zero or inventing a number.
 */
export function computeCashierDiscretionCap(item: CashierDiscretionCapInput): CashierDiscretionCapResult {
  const originalCents = Math.round((item.originalPrice ?? 0) * 100);
  const currentCents = Math.round((item.price ?? 0) * 100);

  if (originalCents <= 0 || currentCents <= 0) {
    return { maxDiscretionCents: 0, originalCents, currentCents, alreadyOffCents: 0 };
  }

  const alreadyOffCents = Math.max(0, originalCents - currentCents);
  const ceilingCents = Math.round(originalCents * DISCRETION_CEILING_PERCENT_OF_ORIGINAL);
  const remainingToCeilingCents = Math.max(0, ceilingCents - alreadyOffCents);
  const hardCapOnDiscretionCents = Math.round(currentCents * DISCRETION_HARD_CAP_PERCENT_OF_CURRENT);
  const maxDiscretionCents = Math.min(hardCapOnDiscretionCents, remainingToCeilingCents, currentCents);

  return { maxDiscretionCents, originalCents, currentCents, alreadyOffCents };
}

export interface ResolveCashierDiscretionParams {
  hubId: string;
  actorType: CashierActorType;
  actorTeamMemberId?: string | null;
  actorBoothId?: string | null;
  item: CashierDiscretionCapInput;
  /** 0-10, PERCENT of the item's CURRENT price -- never a client-supplied cents/dollar amount. */
  requestedPercent: number;
}

export type CashierDiscretionResolution =
  | { ok: true; appliedCents: number; cap: CashierDiscretionCapResult }
  | { ok: false; status: number; message: string };

/**
 * Resolves and clamps a cashier's requested discretionary discount for ONE item.
 * Never trusts requestedPercent beyond 0-10 (validated here), and the resulting cents
 * are ALWAYS `min(requestedCents, freshly-computed cap)` -- the caller cannot widen this
 * by any input. `item` must be a FRESH read (the caller's responsibility) so the cap
 * reflects the item's live price/originalPrice, not a stale client-supplied snapshot.
 */
export async function resolveCashierDiscretion(
  params: ResolveCashierDiscretionParams
): Promise<CashierDiscretionResolution> {
  const { hubId, actorType, actorTeamMemberId, actorBoothId, item, requestedPercent } = params;

  if (
    typeof requestedPercent !== 'number' ||
    !Number.isFinite(requestedPercent) ||
    requestedPercent < 0 ||
    requestedPercent > 10
  ) {
    return { ok: false, status: 400, message: 'requestedPercent must be a number between 0 and 10' };
  }

  // HUB_OWNER needs no grant row (ADR §1B) -- always allowed to REQUEST discretion, but
  // (below) is cap-bounded exactly like everyone else. TEAM_MEMBER/BOOTH require an
  // enabled CashierDiscretionGrant row for this specific hub.
  if (actorType === 'TEAM_MEMBER') {
    if (!actorTeamMemberId) {
      return { ok: false, status: 403, message: 'Unable to verify discount permission for this account' };
    }
    const grant = await prisma.cashierDiscretionGrant.findUnique({
      where: { hubId_cashierTeamMemberId: { hubId, cashierTeamMemberId: actorTeamMemberId } },
      select: { enabled: true },
    });
    if (!grant?.enabled) {
      return {
        ok: false,
        status: 403,
        message: 'You do not have permission to apply a discount at this register. Ask the market organizer to enable it.',
      };
    }
  } else if (actorType === 'BOOTH') {
    if (!actorBoothId) {
      return { ok: false, status: 403, message: 'Unable to verify discount permission for this booth' };
    }
    const grant = await prisma.cashierDiscretionGrant.findUnique({
      where: { hubId_cashierBoothId: { hubId, cashierBoothId: actorBoothId } },
      select: { enabled: true },
    });
    if (!grant?.enabled) {
      return {
        ok: false,
        status: 403,
        message: 'You do not have permission to apply a discount at this register. Ask the market organizer to enable it.',
      };
    }
  }
  // actorType === 'HUB_OWNER': no grant lookup, always passes this gate.

  const cap = computeCashierDiscretionCap(item);
  const requestedCents = Math.round((cap.currentCents * requestedPercent) / 100);
  // Server clamp, ALWAYS -- the resolved cents can never exceed the freshly-computed cap,
  // regardless of what was requested.
  const appliedCents = Math.min(requestedCents, cap.maxDiscretionCents);

  return { ok: true, appliedCents, cap };
}
