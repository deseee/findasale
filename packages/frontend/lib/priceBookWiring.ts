/**
 * priceBookWiring (ADR-140 batch B8): the small pure rules behind the price book lines that sit inside the existing
 * screens (item editor, scan queue, card import result, add items links).
 *
 * No React, no axios, no env reads, no network: plain functions covered by lib/__tests__/priceBookWiring.test.ts.
 * Nothing here changes a price. Every line these rules allow is a link or a note; the shop still presses Apply itself.
 * Run: npm test   (node:test through tsx)
 */
import type { PriceBookLockRow, PriceBookStatus } from './priceBook';

export const PRICE_BOOK_PAGE_PATH = '/organizer/price-book';

const ID_PATTERN = /^[A-Za-z0-9_-]{1,64}$/;

/** An id from a URL or a response, or an empty string when it is not a plain id. */
export function cleanId(value: unknown): string {
  return typeof value === 'string' && ID_PATTERN.test(value.trim()) ? value.trim() : '';
}

/** Adds itemId to the suggested-price request only when the item exists (ADR-140 section 12.3). Returns the same object. */
export function withItemId(params: Record<string, string>, itemId: string | null | undefined): Record<string, string> {
  if (typeof itemId === 'string' && itemId.trim() !== '') params.itemId = itemId.trim();
  return params;
}

/** The "Price the cards without a price" start on the Price Book page: which sale and which import batch. */
export interface UnpricedPreset {
  saleId: string | null;
  batchId: string | null;
}

/** The link from a finished import or scan save to the Changes tab, set to cards without a price (ADR-140 section 12.4). */
export function repriceUnpricedHref(saleId: string | null | undefined, batchId: string | null | undefined): string {
  const parts = ['tab=changes', 'unpriced=1'];
  const sale = cleanId(saleId);
  const batch = cleanId(batchId);
  if (sale) parts.push(`sale=${encodeURIComponent(sale)}`);
  if (batch) parts.push(`batch=${encodeURIComponent(batch)}`);
  return `${PRICE_BOOK_PAGE_PATH}?${parts.join('&')}`;
}

type QueryValue = string | string[] | undefined;

function firstValue(v: QueryValue): string {
  if (Array.isArray(v)) return typeof v[0] === 'string' ? v[0] : '';
  return typeof v === 'string' ? v : '';
}

/** Reads the preset back from the page URL. Null unless the URL asks for the Changes tab with unpriced=1. */
export function readUnpricedPreset(query: Record<string, QueryValue> | null | undefined): UnpricedPreset | null {
  if (!query) return null;
  if (firstValue(query.tab) !== 'changes' || firstValue(query.unpriced) !== '1') return null;
  return { saleId: cleanId(firstValue(query.sale)) || null, batchId: cleanId(firstValue(query.batch)) || null };
}

/**
 * Whether the result panel of a card import or scan save adds the "Price the cards without a price" line. Only when some
 * cards have no price, the save has a batch to point at, the price book is on, and the shop's own book is on.
 */
export function offerRepriceUnpriced(opts: {
  needsPrice: number;
  batchId: string | null | undefined;
  status: Pick<PriceBookStatus, 'enabled' | 'bookEnabled'> | null | undefined;
}): boolean {
  const s = opts.status;
  return opts.needsPrice > 0 && cleanId(opts.batchId) !== '' && !!s && s.enabled === true && s.bookEnabled === true;
}

/** True when the item has a pin that has not run out. A pin with no end date holds until the shop lets go. */
export function isItemPinned(locks: ReadonlyArray<PriceBookLockRow> | null | undefined, itemId: string | null | undefined, now: Date): boolean {
  if (!locks || !itemId) return false;
  return locks.some((lock) => {
    if (lock.itemId !== itemId) return false;
    if (!lock.lockedUntil) return true;
    const end = new Date(lock.lockedUntil).getTime();
    return Number.isFinite(end) ? end > now.getTime() : true;
  });
}
