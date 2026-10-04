/**
 * Suggested price for a card printing (ADR-134 section 3.6, batch B3).
 *
 * Computed on demand from the stored catalog price. The result is returned to the caller and is
 * NEVER written to any Item column: the eBay paths fall back to the item's stored estimate
 * fields when the price is empty, so persisting a catalog number there could publish it without
 * the seller choosing it. A suggestion becomes a price only when the seller presses Apply, which
 * writes the item's price through the normal item update.
 *
 * Why not the existing pricing cascade: it applies category depreciation and trend multipliers
 * and charm-prices every result to .49 or .99, which is wrong for cheap singles whose value is a
 * market quote.
 *
 * Catalog sources carry no per-condition prices, so the condition multipliers below are a pricing
 * POLICY, not sourced facts. They ship as placeholders in one constant (DECISION NEEDED D10).
 */
import { DEFAULT_PRICE_STALE_HOURS } from './catalogConfig';

/** Placeholder policy numbers (D10). Near Mint is the reference all catalog prices describe. */
export const CONDITION_MULTIPLIERS: Record<string, number> = {
  NM: 1.0,
  LP: 0.9,
  MP: 0.8,
  HP: 0.65,
  DMG: 0.5,
};

/** Finish to the CardPrice column that holds its base price. */
export const FINISH_PRICE_FIELD: Record<string, 'usd' | 'usdFoil' | 'usdEtched' | 'usdReverse'> = {
  NONFOIL: 'usd',
  FOIL: 'usdFoil',
  HOLO: 'usdFoil',
  ETCHED: 'usdEtched',
  REVERSE_HOLO: 'usdReverse',
};

/** eBay rejects prices under $0.99 at publish time; the UI warns when a suggestion is below it. */
export const EBAY_MINIMUM_PRICE = 0.99;

export interface CatalogPriceInput {
  usd: number | null;
  usdFoil: number | null;
  usdEtched: number | null;
  usdReverse: number | null;
  asOf: Date | null;
}

export interface SuggestionInput {
  price: CatalogPriceInput | null;
  /** Latest data snapshot time known for the printing's source; the later of this and price.asOf is used. */
  sourceAsOf?: Date | null;
  finish?: string | null;
  conditionCode?: string | null;
  language?: string | null;
  grader?: string | null;
  grade?: string | null;
  now?: Date;
  staleHours?: number;
}

export type SuggestionFailureCode =
  | 'GRADED_NOT_SUPPORTED'
  | 'LANGUAGE_NOT_COVERED'
  | 'NO_PRICE_FOR_FINISH'
  | 'NO_PRICE_DATA'
  | 'INVALID_FINISH'
  | 'INVALID_CONDITION';

export interface SuggestionSuccess {
  ok: true;
  suggestedPrice: number;
  currency: 'USD';
  basis: { finish: string; priceField: string; basePrice: number; conditionCode: string; multiplier: number; rounding: string };
  asOf: string | null;
  /** True when the data is older than 24 hours: show "Price data from <date>". */
  showDataDate: boolean;
  /** True when the data is older than CARD_PRICE_STALE_HOURS (default 48): the UI warns. */
  stale: boolean;
  belowEbayMinimum: boolean;
  note: string;
}

export interface SuggestionFailure {
  ok: false;
  code: SuggestionFailureCode;
  suggestedPrice: null;
  message: string;
  /** For LANGUAGE_NOT_COVERED: the English reference price, labeled as such. */
  englishReference?: { finish: string; price: number; label: string };
}

export type SuggestionResult = SuggestionSuccess | SuggestionFailure;

const HOUR_MS = 60 * 60 * 1000;

/**
 * Rounds a price in cents: under $5 to the nearest $0.05, $5 to $50 to the nearest $0.25, over $50
 * to the nearest $1 (placeholder policy, D10). The result is never below $0.05.
 */
export function roundSuggestedCents(cents: number): { cents: number; rule: string } {
  const safe = Math.max(0, cents);
  let rounded: number;
  let rule: string;
  if (safe < 500) {
    rounded = Math.round(safe / 5) * 5;
    rule = 'nearest $0.05';
  } else if (safe <= 5000) {
    rounded = Math.round(safe / 25) * 25;
    rule = 'nearest $0.25';
  } else {
    rounded = Math.round(safe / 100) * 100;
    rule = 'nearest $1';
  }
  return { cents: Math.max(5, rounded), rule };
}

const fail = (code: SuggestionFailureCode, message: string, extra: Partial<SuggestionFailure> = {}): SuggestionFailure => ({
  ok: false,
  code,
  suggestedPrice: null,
  message,
  ...extra,
});

export function computeSuggestedPrice(input: SuggestionInput): SuggestionResult {
  const now = input.now ?? new Date();
  const staleHours = input.staleHours && input.staleHours > 0 ? input.staleHours : DEFAULT_PRICE_STALE_HOURS;

  // 1. Graded cards: no free graded price source exists.
  if ((input.grader && input.grader.trim()) || (input.grade && input.grade.trim())) {
    return fail('GRADED_NOT_SUPPORTED', 'There is no free price source for graded cards. Enter your own price.');
  }

  const finish = (input.finish ?? 'NONFOIL').toString().trim().toUpperCase() || 'NONFOIL';
  const field = FINISH_PRICE_FIELD[finish];
  if (!field) return fail('INVALID_FINISH', `Unknown finish: ${finish}`);

  const conditionCode = (input.conditionCode ?? 'NM').toString().trim().toUpperCase() || 'NM';
  const multiplier = CONDITION_MULTIPLIERS[conditionCode];
  if (multiplier === undefined) return fail('INVALID_CONDITION', `Unknown condition: ${conditionCode}`);

  if (!input.price) return fail('NO_PRICE_DATA', 'No catalog price is stored for this printing.');

  const base = input.price[field];
  const hasBase = typeof base === 'number' && Number.isFinite(base) && base > 0;

  // 2. Non-English: the catalog quotes English prices only.
  const language = (input.language ?? 'en').toString().trim().toLowerCase() || 'en';
  if (language !== 'en') {
    return fail('LANGUAGE_NOT_COVERED', 'Catalog prices cover English cards only. The English price is shown for reference.', {
      englishReference: hasBase
        ? { finish, price: Math.round((base as number) * 100) / 100, label: 'English Near Mint reference' }
        : undefined,
    });
  }

  // 3. Base price for the finish.
  if (!hasBase) return fail('NO_PRICE_FOR_FINISH', `The catalog has no price for the ${finish} finish of this printing.`);

  const conditioned = Math.round((base as number) * 100 * multiplier);
  const { cents, rule } = roundSuggestedCents(conditioned);
  const suggestedPrice = cents / 100;

  const dataAsOf = [input.price.asOf, input.sourceAsOf ?? null]
    .filter((d): d is Date => d instanceof Date && !Number.isNaN(d.getTime()))
    .sort((a, b) => b.getTime() - a.getTime())[0] ?? null;
  const ageMs = dataAsOf ? now.getTime() - dataAsOf.getTime() : Number.POSITIVE_INFINITY;

  return {
    ok: true,
    suggestedPrice,
    currency: 'USD',
    basis: { finish, priceField: field, basePrice: base as number, conditionCode, multiplier, rounding: rule },
    asOf: dataAsOf ? dataAsOf.toISOString() : null,
    showDataDate: ageMs > 24 * HOUR_MS,
    stale: ageMs > staleHours * HOUR_MS,
    belowEbayMinimum: suggestedPrice < EBAY_MINIMUM_PRICE,
    note: 'Estimate from free catalog data, for guidance only. Your price is never changed unless you apply this.',
  };
}
