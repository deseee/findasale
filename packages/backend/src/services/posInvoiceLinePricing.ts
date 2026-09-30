import { resolvePosDiscount, type DiscountRequestInput } from './posDiscountService';
import { MAX_POS_AMOUNT_CENTS } from './cashFeeService';
import type { ResolvedPosActor } from '../utils/posAuth';

/**
 * posInvoiceLinePricing.ts -- money review P1-6/8 (2026-09-29).
 *
 * Shared, pure-ish pricing rules for the two register endpoints that turn caller-supplied lines
 * into a charge: sendHoldInvoice (held item + misc lines) and createPaymentLink (QR link).
 *
 * THE BUG: both trusted the client's numbers. sendHoldInvoice summed `Math.round(amount * 100)`
 * over misc lines with no integer-cent check, so 0.005 rounded and 1e9 flowed to Square, and a
 * NEGATIVE misc line (a discount) was accepted from any team member with no discount permission,
 * no cap and no catalog floor: a cashier could invoice a $500 held item for $1, or for a negative
 * total. createPaymentLink accepted any positive amount against catalog items, so a QR link for a
 * $500 item could be created for a dollar. createPaymentRequest already closes both with
 * resolvePosDiscount (permission + workspace cap) and the catalog floor
 * (`catalogSubtotal - discount - 1`); this file makes that rule reusable and applies it to the
 * other two entry points so the three can never drift.
 *
 * RULES
 *   - Misc amounts are dollars with at most two decimals (whole cents), bounded by
 *     MAX_POS_AMOUNT_CENTS, at most MAX_MISC_LINES lines, each with a title and a unique itemId.
 *   - A line that carries an itemId is a REAL merged hold: it cannot be negative. Billing it below
 *     its list price is a discount.
 *   - A negative line without an itemId is a discount.
 *   - Any discount (negative line or below-list merged item) must pass resolvePosDiscount: the
 *     actor's APPLY_POS_DISCOUNT permission (team members), the workspace cap, and "cannot exceed
 *     the catalog subtotal".
 *   - The charged total may never fall below `catalogSubtotal - authorizedDiscount - 1`.
 *   - A hold invoice total must be greater than zero. A free item is not an invoice: complete it
 *     as a sale from the register instead.
 * Extras (a positive misc line with no itemId, or a merged item billed above list) add freely,
 * unchanged from ADR-112's separate trust boundary.
 */

export const MAX_MISC_LINES = 50;
export const MAX_MISC_TITLE_LENGTH = 200;

export interface NormalizedMiscLine {
  /** Set when the line is a merged real hold. */
  itemId: string | null;
  title: string;
  amountCents: number;
}

export type PricingFailure = { ok: false; status: number; message: string; code: string };

export type MiscLinesResult = { ok: true; lines: NormalizedMiscLine[] } | PricingFailure;

const fail = (status: number, code: string, message: string): PricingFailure => ({ ok: false, status, code, message });

/** Dollars -> whole cents, or null if the number is not a whole number of cents. */
export function dollarsToWholeCents(amount: unknown): number | null {
  if (typeof amount !== 'number' || !Number.isFinite(amount)) return null;
  const cents = Math.round(amount * 100);
  if (Math.abs(amount * 100 - cents) > 1e-6) return null;
  return cents;
}

/** Validate and normalize the request's misc lines. `undefined` / `null` means no lines. */
export function normalizeMiscLines(raw: unknown): MiscLinesResult {
  if (raw === undefined || raw === null) return { ok: true, lines: [] };
  if (!Array.isArray(raw)) return fail(400, 'INVALID_MISC_ITEMS', 'miscItems must be an array');
  if (raw.length > MAX_MISC_LINES) {
    return fail(400, 'INVALID_MISC_ITEMS', `An invoice can have at most ${MAX_MISC_LINES} extra lines`);
  }
  const lines: NormalizedMiscLine[] = [];
  const seenItemIds = new Set<string>();
  for (const entry of raw) {
    if (!entry || typeof entry !== 'object') {
      return fail(400, 'INVALID_MISC_ITEMS', 'Each extra line must be an object');
    }
    const e = entry as { itemId?: unknown; title?: unknown; amount?: unknown };
    const amountCents = dollarsToWholeCents(e.amount);
    if (amountCents === null) {
      return fail(400, 'INVALID_MISC_AMOUNT', 'Each extra line amount must be a whole number of cents (for example 12.50)');
    }
    if (Math.abs(amountCents) > MAX_POS_AMOUNT_CENTS) {
      return fail(400, 'INVALID_MISC_AMOUNT', `An extra line cannot exceed $${(MAX_POS_AMOUNT_CENTS / 100).toFixed(2)}`);
    }
    let itemId: string | null = null;
    if (e.itemId !== undefined && e.itemId !== null) {
      if (typeof e.itemId !== 'string' || e.itemId.trim() === '' || e.itemId.length > 100) {
        return fail(400, 'INVALID_MISC_ITEMS', 'itemId on an extra line must be a non-empty string');
      }
      itemId = e.itemId;
      if (seenItemIds.has(itemId)) {
        return fail(400, 'INVALID_MISC_ITEMS', 'The same item appears on more than one line');
      }
      seenItemIds.add(itemId);
      if (amountCents < 0) {
        return fail(400, 'INVALID_MISC_AMOUNT', 'An item line cannot be negative. Use a discount instead.');
      }
    }
    if (e.title !== undefined && e.title !== null && typeof e.title !== 'string') {
      return fail(400, 'INVALID_MISC_ITEMS', 'Each extra line title must be text');
    }
    const title = (typeof e.title === 'string' ? e.title.trim() : '').slice(0, MAX_MISC_TITLE_LENGTH) || 'Custom item';
    lines.push({ itemId, title, amountCents });
  }
  return { ok: true, lines };
}

/** The lowest total a charge may come to, given the catalog subtotal and the authorized discount. */
export const catalogFloorCents = (catalogSubtotalCents: number, authorizedDiscountCents: number): number =>
  catalogSubtotalCents - authorizedDiscountCents - 1;

/**
 * Authorize the discount (permission, cap) and enforce the catalog floor for a charge.
 * `discount` is the request's discount fields (both empty = no discount requested).
 */
export async function authorizeDiscountAndCheckFloor(opts: {
  actor: ResolvedPosActor;
  catalogSubtotalCents: number;
  /** Everything the buyer is being charged across all tenders (cash + card), in cents. */
  totalCents: number;
  discount: DiscountRequestInput;
}): Promise<{ ok: true; discountAmountCents: number } | PricingFailure> {
  const resolution = await resolvePosDiscount({
    actor: opts.actor,
    input: opts.discount,
    catalogSubtotalCents: opts.catalogSubtotalCents,
  });
  if (!resolution.ok) return fail(resolution.status, 'DISCOUNT_NOT_ALLOWED', resolution.message);
  const floor = catalogFloorCents(opts.catalogSubtotalCents, resolution.discountAmountCents);
  if (opts.totalCents < floor) {
    return fail(
      400,
      'TOTAL_BELOW_CATALOG_FLOOR',
      resolution.discountAmountCents > 0
        ? `Total does not match the applied discount. Expected at least ${floor} cents.`
        : `Total does not match catalog pricing. Expected at least ${floor} cents.`
    );
  }
  return { ok: true, discountAmountCents: resolution.discountAmountCents };
}

export type InvoicePricingResult =
  | {
      ok: true;
      grandTotalCents: number;
      miscTotalCents: number;
      discountCents: number;
      catalogSubtotalCents: number;
    }
  | PricingFailure;

/**
 * Price a hold invoice from the held item plus the normalized lines.
 *
 * @param heldItemCents        the held item's list price, in cents (server-side, from the database)
 * @param mergedListCents      list price in cents of each merged real item, keyed by itemId. Every
 *                             line that carries an itemId MUST have an entry (the caller has
 *                             already verified those items belong to this sale and organizer).
 */
export async function evaluateInvoicePricing(opts: {
  actor: ResolvedPosActor;
  heldItemCents: number;
  lines: NormalizedMiscLine[];
  mergedListCents: Map<string, number>;
}): Promise<InvoicePricingResult> {
  const { actor, heldItemCents, lines, mergedListCents } = opts;

  let catalogSubtotalCents = heldItemCents;
  let itemDiscountCents = 0;
  let negativeLineCents = 0;
  let miscTotalCents = 0;

  for (const line of lines) {
    miscTotalCents += line.amountCents;
    if (line.itemId) {
      const list = mergedListCents.get(line.itemId);
      if (list === undefined) {
        return fail(404, 'ITEM_NOT_FOUND', 'One or more items were not found in this sale');
      }
      catalogSubtotalCents += list;
      if (line.amountCents < list) itemDiscountCents += list - line.amountCents;
    } else if (line.amountCents < 0) {
      negativeLineCents += -line.amountCents;
    }
  }

  const discountCents = itemDiscountCents + negativeLineCents;
  const grandTotalCents = heldItemCents + miscTotalCents;

  if (grandTotalCents <= 0) {
    return fail(
      400,
      'INVOICE_TOTAL_INVALID',
      'An invoice total must be greater than zero. To give an item away, complete it as a sale from the register.'
    );
  }
  if (grandTotalCents > MAX_POS_AMOUNT_CENTS) {
    return fail(400, 'INVALID_AMOUNT', `An invoice cannot exceed $${(MAX_POS_AMOUNT_CENTS / 100).toFixed(2)}`);
  }

  const authorized = await authorizeDiscountAndCheckFloor({
    actor,
    catalogSubtotalCents,
    totalCents: grandTotalCents,
    discount:
      discountCents > 0
        ? { discountType: 'FIXED', discountValue: discountCents / 100, discountReasonNote: 'Register discount on hold invoice' }
        : {},
  });
  if (!authorized.ok) return authorized;

  return { ok: true, grandTotalCents, miscTotalCents, discountCents: authorized.discountAmountCents, catalogSubtotalCents };
}
