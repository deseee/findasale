/**
 * Bulk lot pricing and quantity rules (ADR-136 sections 3 and 6). Pure functions: no database, no env, no I/O, no
 * imports. Every money figure here is an integer number of cents; floating point dollars never enter the arithmetic
 * except in dollarsToCents, which rounds once at the edge.
 *
 * Model: the price of a lot is "cents per 1,000 cards" (P, an integer). The price of N cards is N * P / 1000, rounded
 * half up to a whole cent ONCE, on the total of the sale line, never per card. Example: P = 800 ($8.00 per 1,000),
 * N = 1,500 -> 1,200 cents. P = 650, N = 1,500 -> 975 cents. P = 650, N = 1 -> 0.65 cents -> rounds to 1 cent.
 * A line that would round to 0 cents is refused (QUANTITY_TOO_SMALL), because the register never records a free sale.
 */

/** A lot holds at least 2 cards (a 1-card item is an ordinary item) and at most 1,000,000. */
export const MIN_LOT_CARDS = 2;
export const MAX_LOT_CARDS = 1_000_000;
/** One register line sells at most one whole lot's worth. */
export const MAX_SALE_CARDS = MAX_LOT_CARDS;
/** $100,000.00 per 1,000 cards. Far above any real bulk price; keeps N * P below 2^53 with a wide margin. */
export const MAX_PRICE_PER_THOUSAND_CENTS = 10_000_000;

/** Quantities offered as quick buttons and shown on the public price list. */
export const LADDER_STEPS: readonly number[] = [100, 500, 1000, 2500, 5000];

export type PricingErrorCode = 'BAD_QUANTITY' | 'BAD_PRICE' | 'QUANTITY_TOO_SMALL';
export type PriceResult = { ok: true; cents: number } | { ok: false; code: PricingErrorCode };

/**
 * A whole number from a number or a digit string (commas and spaces allowed in a string, "1,500"). Rejects decimals,
 * exponents, signs, NaN, Infinity, booleans, null and anything over 9 digits. Returns null when it is not one.
 */
export function parseWholeNumber(raw: unknown): number | null {
  if (typeof raw === 'number') {
    return Number.isSafeInteger(raw) ? raw : null;
  }
  if (typeof raw === 'string') {
    const cleaned = raw.replace(/[\s,]/g, '');
    if (!/^\d{1,9}$/.test(cleaned)) return null;
    return Number(cleaned);
  }
  return null;
}

/**
 * Item.price (dollars, a float) -> integer cents per 1,000 cards. Null for a missing, non-finite, zero or negative
 * price, and for a price above MAX_PRICE_PER_THOUSAND_CENTS. Rounds once, to the nearest cent.
 */
export function pricePerThousandCentsFromDollars(dollars: unknown): number | null {
  if (typeof dollars !== 'number' || !Number.isFinite(dollars) || dollars <= 0) return null;
  const cents = Math.round(dollars * 100);
  if (!Number.isSafeInteger(cents) || cents < 1 || cents > MAX_PRICE_PER_THOUSAND_CENTS) return null;
  return cents;
}

/** Price of `cards` cards at `pricePerThousandCents`, half up to a whole cent. See the file header. */
export function priceCentsForCards(cards: number, pricePerThousandCents: number): PriceResult {
  if (!Number.isSafeInteger(cards) || cards < 1 || cards > MAX_SALE_CARDS) return { ok: false, code: 'BAD_QUANTITY' };
  if (!Number.isSafeInteger(pricePerThousandCents) || pricePerThousandCents < 1 || pricePerThousandCents > MAX_PRICE_PER_THOUSAND_CENTS) {
    return { ok: false, code: 'BAD_PRICE' };
  }
  const cents = Math.floor((cards * pricePerThousandCents + 500) / 1000);
  if (cents < 1) return { ok: false, code: 'QUANTITY_TOO_SMALL' };
  return { ok: true, cents };
}

/** Cards left in a lot. A null total counts as 1 (same as itemStockService). Never negative. */
export function remainingCards(stockTotal: number | null | undefined, stockSold: number | null | undefined): number {
  const total = typeof stockTotal === 'number' && Number.isFinite(stockTotal) ? stockTotal : 1;
  const sold = typeof stockSold === 'number' && Number.isFinite(stockSold) ? stockSold : 0;
  return Math.max(Math.trunc(total) - Math.trunc(sold), 0);
}

/** "4,200". Deterministic (no locale lookup). */
export function formatCardCount(n: number): string {
  const whole = Math.trunc(Number.isFinite(n) ? n : 0);
  const sign = whole < 0 ? '-' : '';
  return sign + String(Math.abs(whole)).replace(/\B(?=(\d{3})+(?!\d))/g, ',');
}

/** "$8.00" from integer cents. */
export function formatCents(cents: number): string {
  const whole = Math.trunc(Number.isFinite(cents) ? cents : 0);
  const sign = whole < 0 ? '-' : '';
  const abs = Math.abs(whole);
  return `${sign}$${Math.floor(abs / 100)}.${String(abs % 100).padStart(2, '0')}`;
}

/** Informational per-card price, "$0.008", from cents per 1,000. Never used to charge anyone. */
export function formatPerCardPrice(pricePerThousandCents: number): string {
  if (!Number.isFinite(pricePerThousandCents) || pricePerThousandCents <= 0) return '$0.00';
  const dollars = pricePerThousandCents / 100000;
  let text = dollars.toFixed(5).replace(/0+$/, '');
  const decimals = text.split('.')[1] ?? '';
  if (decimals.length < 2) text = dollars.toFixed(2);
  return `$${text}`;
}

/**
 * Receipt and cart wording for one bulk sale line (ADR-136 Addendum A): the cards and the price per 1,000 are both shown,
 * for example "MTG commons: 1,500 cards at $8.00 per 1,000". Without a price per 1,000 it is just "MTG commons: 1,500 cards".
 * Plain text; callers that put it in HTML escape the title themselves.
 */
export function describeBulkSaleLine(title: string, cards: number, pricePerThousandCents?: number | null): string {
  const name = typeof title === 'string' && title.trim() ? title.trim() : 'Bulk lot';
  const base = `${name}: ${formatCardCount(cards)} ${cards === 1 ? 'card' : 'cards'}`;
  if (typeof pricePerThousandCents === 'number' && Number.isFinite(pricePerThousandCents) && pricePerThousandCents > 0) {
    return `${base} at ${formatCents(pricePerThousandCents)} per 1,000`;
  }
  return base;
}

export interface LadderRow {
  cards: number;
  cents: number;
  /** True for the "all remaining" row. */
  isAll: boolean;
}

/**
 * Price list rows: each step that fits in the remaining stock, then one "all remaining" row. Rows that would round
 * to 0 cents are dropped. Built on the server so the browser never does pricing arithmetic.
 */
export function buildPriceLadder(pricePerThousandCents: number, remaining: number, steps: readonly number[] = LADDER_STEPS): LadderRow[] {
  const rows: LadderRow[] = [];
  if (!Number.isSafeInteger(remaining) || remaining < 1) return rows;
  for (const step of steps) {
    if (step > remaining) continue;
    const r = priceCentsForCards(step, pricePerThousandCents);
    if (r.ok) rows.push({ cards: step, cents: r.cents, isAll: step === remaining });
  }
  if (!rows.some((row) => row.cards === remaining)) {
    const r = priceCentsForCards(Math.min(remaining, MAX_SALE_CARDS), pricePerThousandCents);
    if (r.ok) rows.push({ cards: Math.min(remaining, MAX_SALE_CARDS), cents: r.cents, isAll: true });
  }
  return rows;
}
