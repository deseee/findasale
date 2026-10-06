/**
 * Bulk lot packs (ADR-136 Addendum E, roadmap #659). Pure functions: no database, no env, no I/O, no network.
 *
 * MODEL
 *  A lot may have an optional PACK SIZE: a fixed number of cards the vendor sells as one unit, for example 1,000 cards.
 *  A pack is then an ordinary one-button item for every channel that has no free quantity box (another vendor's cashier in the
 *  hub cart, and an online shopper). Free quantity (any number of cards) stays only at the organizer's own counter register.
 *
 *   - pack price   = the register's price for packSize cards (priceCentsForCards: half up, rounded ONCE). There is no second
 *                    rounding formula. N packs cost N times the pack price, so a shopper who sees "$X per pack" always pays a
 *                    whole multiple of it. (Selling the same cards by free quantity rounds once on the whole line, which can differ
 *                    by under one cent per pack. Documented in ADR-136 Addendum E, E.4.)
 *   - packs left   = floor(cards left / packSize). Fewer cards than one pack stay sellable only at the counter register.
 *   - N packs take N x packSize cards through the existing guarded decrement, so Purchase.bulkQuantity, holds, partial refunds
 *                    and the eBay reconcile hook keep working on cards, unchanged.
 *
 * The pack size range is the same as the eBay bundle size range (100 to 5,000) so a shop thinks about one set of sizes. The
 * browser has a copy of the price formula for the live preview in lib/bulkLot.ts; a golden test keeps the two in step and the
 * server's number is always the one charged.
 */
import { MAX_LOT_CARDS, formatCardCount, formatCents, priceCentsForCards, remainingCards } from './bulkLotPricing';

export const PACK_SIZE_MIN = 100;
export const PACK_SIZE_MAX = 5000;
/** Quick picks in the vendor UI. Any whole number between the min and the max is allowed. */
export const PACK_SIZE_PRESETS: readonly number[] = [100, 250, 500, 1000, 2500, 5000];
/** Conservative ceiling on one pack's price, in cents ($99,999.99). */
export const PACK_MAX_PRICE_CENTS = 9_999_999;
/** The most packs one cart line or one online purchase can hold. */
export const MAX_PACKS_PER_LINE = 50;

/** A whole number of cards from PACK_SIZE_MIN to PACK_SIZE_MAX, or null. Accepts a number or a digit string ("1,000"). */
export function parsePackSize(raw: unknown): number | null {
  let n: number | null = null;
  if (typeof raw === 'number') n = Number.isSafeInteger(raw) ? raw : null;
  else if (typeof raw === 'string') {
    const cleaned = raw.replace(/[\s,]/g, '');
    n = /^\d{1,9}$/.test(cleaned) ? Number(cleaned) : null;
  }
  return n !== null && n >= PACK_SIZE_MIN && n <= PACK_SIZE_MAX ? n : null;
}

/** A whole number of packs from 1 to MAX_PACKS_PER_LINE, or null. */
export function parsePackCount(raw: unknown): number | null {
  let n: number | null = null;
  if (typeof raw === 'number') n = Number.isSafeInteger(raw) ? raw : null;
  else if (typeof raw === 'string') {
    const cleaned = raw.trim();
    n = /^\d{1,3}$/.test(cleaned) ? Number(cleaned) : null;
  }
  return n !== null && n >= 1 && n <= MAX_PACKS_PER_LINE ? n : null;
}

export type PackPriceErrorCode = 'BULK_PACK_INVALID' | 'BAD_PRICE' | 'QUANTITY_TOO_SMALL' | 'BULK_PACK_TOO_PRICEY';
export type PackPriceResult = { ok: true; cents: number } | { ok: false; code: PackPriceErrorCode };

/** Price of ONE pack in cents: priceCentsForCards(packSize, price per 1,000), the only rounding there is. */
export function packPriceCents(packSize: unknown, pricePerThousandCents: number | null | undefined): PackPriceResult {
  const size = parsePackSize(packSize);
  if (size === null) return { ok: false, code: 'BULK_PACK_INVALID' };
  if (typeof pricePerThousandCents !== 'number') return { ok: false, code: 'BAD_PRICE' };
  const priced = priceCentsForCards(size, pricePerThousandCents);
  if (!priced.ok) return { ok: false, code: priced.code === 'QUANTITY_TOO_SMALL' ? 'QUANTITY_TOO_SMALL' : priced.code === 'BAD_PRICE' ? 'BAD_PRICE' : 'BULK_PACK_INVALID' };
  if (priced.cents > PACK_MAX_PRICE_CENTS) return { ok: false, code: 'BULK_PACK_TOO_PRICEY' };
  return { ok: true, cents: priced.cents };
}

/** Whole packs that fit in the cards left. 0 for no pack size or a bad one. */
export function packsAvailable(remaining: number, packSize: number | null | undefined): number {
  if (typeof packSize !== 'number' || !Number.isSafeInteger(packSize) || packSize < 1) return 0;
  if (!Number.isFinite(remaining) || remaining < 1) return 0;
  return Math.floor(Math.trunc(remaining) / packSize);
}

/** Cards left over when no whole pack fits (sellable only at the counter register). */
export function leftoverCards(remaining: number, packSize: number | null | undefined): number {
  if (typeof packSize !== 'number' || !Number.isSafeInteger(packSize) || packSize < 1) return Math.max(0, Math.trunc(remaining) || 0);
  return Math.max(0, Math.trunc(remaining) || 0) % packSize;
}

/** Cards taken by `packs` packs, or null when the count is not a whole number from 1 to MAX_PACKS_PER_LINE. */
export function cardsForPacks(packs: unknown, packSize: number): number | null {
  const n = parsePackCount(packs);
  if (n === null) return null;
  const cards = n * packSize;
  return Number.isSafeInteger(cards) && cards <= MAX_LOT_CARDS ? cards : null;
}

/** Price of `packs` packs in cents: packs times the one-pack price. */
export function packLineCents(packs: number, onePackCents: number): number {
  return packs * onePackCents;
}

/** "1,000-card pack". */
export function packLabel(packSize: number): string {
  return `${formatCardCount(packSize)}-card pack`;
}

/** "1,000-card pack, $8.00". Used on the register search results and the price list. */
export function packOfferLabel(packSize: number, cents: number): string {
  return `${packLabel(packSize)}, ${formatCents(cents)}`;
}

/** "2 packs of 1,000 cards". */
export function describePackLine(packs: number, packSize: number): string {
  return `${formatCardCount(packs)} ${packs === 1 ? 'pack' : 'packs'} of ${formatCardCount(packSize)} cards`;
}

export interface PackView {
  /** Cards in one pack, or null when the lot is not sold in packs. */
  packSize: number | null;
  /** Price of one pack in cents (server priced), or null. */
  packCents: number | null;
  /** "1,000-card pack" */
  packLabel: string | null;
  /** "$8.00 per pack" */
  packPriceLabel: string | null;
  /** Whole packs left. 0 when there is no pack size. */
  packsAvailable: number;
  /** "4 packs available", "1 pack available" or "No packs left". Null when there is no pack size. */
  packsAvailableLabel: string | null;
  /** Cards that do not make a whole pack. */
  leftoverCards: number;
  /** True when a shopper can buy a pack right now. */
  packAvailable: boolean;
}

export const EMPTY_PACK_VIEW: PackView = {
  packSize: null,
  packCents: null,
  packLabel: null,
  packPriceLabel: null,
  packsAvailable: 0,
  packsAvailableLabel: null,
  leftoverCards: 0,
  packAvailable: false,
};

/** Everything a screen shows about a lot's pack, built here so every screen shows the same numbers. */
export function buildPackView(args: { packSize: number | null | undefined; pricePerThousandCents: number | null; remaining: number; status?: string }): PackView {
  const size = parsePackSize(args.packSize);
  if (size === null) return { ...EMPTY_PACK_VIEW };
  const priced = packPriceCents(size, args.pricePerThousandCents);
  const left = packsAvailable(args.remaining, size);
  const cents = priced.ok ? priced.cents : null;
  return {
    packSize: size,
    packCents: cents,
    packLabel: packLabel(size),
    packPriceLabel: cents !== null ? `${formatCents(cents)} per pack` : null,
    packsAvailable: left,
    packsAvailableLabel: left < 1 ? 'No packs left' : `${formatCardCount(left)} ${left === 1 ? 'pack' : 'packs'} available`,
    leftoverCards: leftoverCards(args.remaining, size),
    packAvailable: left >= 1 && cents !== null && (args.status === undefined || args.status === 'AVAILABLE'),
  };
}

/** Cards left in a lot, for callers that hold the raw row. Re-exported so pack code has one import for the count. */
export { remainingCards };
