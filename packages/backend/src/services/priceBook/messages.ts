/**
 * Every English string the price book engine can hand to a person (ADR-140 section 11.7). Pure: no imports besides
 * types. The copy rules apply to all of it: never the two-letter banned word, no em dash or en dash, no banned sale phrase,
 * plain short words, no vendor names in defaults. allPriceBookMessages() lists every static string plus a rendering of
 * every template so the copy lint test can check them all.
 */
import type { ConditionCode, Direction, FinishOrAny, PriceSource, RoundingDirection, RoundingMode, Tier, Unit } from './vocabulary';
import type { ReviewReason, SuggestionCode, TraceStep, WarningCode } from './types';

// ---------------------------------------------------------------------------------------------
// Formatting helpers (deterministic: no locale lookup, no clock)
// ---------------------------------------------------------------------------------------------

/** Fills {name} placeholders. A missing name is left as written. */
export function fill(template: string, vars: Record<string, string | number>): string {
  return template.replace(/\{(\w+)\}/g, (whole, name: string) => (name in vars ? String(vars[name]) : whole));
}

/** "$12.00" from integer cents, with thousands separators. A negative amount is "-$1.00". */
export function formatCentsUsd(cents: number): string {
  const whole = Math.trunc(Number.isFinite(cents) ? cents : 0);
  const sign = whole < 0 ? '-' : '';
  const abs = Math.abs(whole);
  const dollars = String(Math.floor(abs / 100)).replace(/\B(?=(\d{3})+(?!\d))/g, ',');
  return `${sign}$${dollars}.${String(abs % 100).padStart(2, '0')}`;
}

/** 9500 gives "95"; 9550 gives "95.5"; 3333 gives "33.33". */
export function formatPercentBps(bps: number): string {
  const value = bps / 100;
  if (Number.isInteger(value)) return String(value);
  return value.toFixed(2).replace(/0+$/, '').replace(/\.$/, '');
}

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

/** "Oct 3" from an ISO date or date time string. Null when the text is not a date. No Date object is used. */
export function formatShortDate(iso: string | null | undefined): string | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso ?? '');
  if (!m) return null;
  const month = MONTHS[Number(m[2]) - 1];
  if (!month) return null;
  return `${month} ${Number(m[3])}`;
}

export function lowerFirst(text: string): string {
  return text.length === 0 ? text : text.charAt(0).toLowerCase() + text.slice(1);
}

export function upperFirst(text: string): string {
  return text.length === 0 ? text : text.charAt(0).toUpperCase() + text.slice(1);
}

// ---------------------------------------------------------------------------------------------
// Labels
// ---------------------------------------------------------------------------------------------

export const SOURCE_LABELS: Record<PriceSource, string> = {
  MANUAL: 'Your typed price',
  SHOP_SOLD_HISTORY: 'Your recent sales',
  SHOP_BENCHMARK: 'Your benchmark for this kind of card',
  CATALOG_REFERENCE: 'Catalog estimate (marketplace data carried by Scryfall)',
  LICENSED_FEED: 'Licensed price feed',
  RATE_CARD: 'Your bulk rate card',
  FIXED_RULE: 'Fixed price in your rule',
  COST: 'Your cost plus your margin',
};

export const CONDITION_LABELS: Record<ConditionCode, string> = {
  NM: 'Near Mint',
  LP: 'Lightly Played',
  MP: 'Moderately Played',
  HP: 'Heavily Played',
  DMG: 'Damaged',
};

export const TIER_LABELS: Record<Tier, string> = {
  COMMON: 'Commons',
  UNCOMMON: 'Uncommons',
  COMMON_UNCOMMON: 'Commons and uncommons',
  RARE: 'Rares',
  MYTHIC: 'Mythics',
  SPECIAL: 'Special cards',
  LAND: 'Lands',
  MIXED: 'Mixed bulk',
};

export const FINISH_LABELS: Record<FinishOrAny, string> = {
  ANY: 'Any finish',
  NONFOIL: 'Non-foil',
  FOIL: 'Foil',
  ETCHED: 'Etched foil',
  HOLO: 'Holo',
  REVERSE_HOLO: 'Reverse holo',
};

export const DIRECTION_LABELS: Record<Direction, string> = { SELL: 'We sell', BUY: 'We buy' };
export const UNIT_LABELS: Record<Unit, string> = { PER_1000: 'per 1,000', PER_CARD: 'per card' };

// ---------------------------------------------------------------------------------------------
// Static copy (ADR-140 section 11.7 table, plus the engine's own sentences)
// ---------------------------------------------------------------------------------------------

export const COPY = {
  pageIntro: 'Set your own pricing rules. Prices are suggestions until you apply them. You are always in charge of the final price.',
  noSuggestion: 'No suggestion yet. Add a price for this card in your price book.',
  catalogGuide: 'Catalog estimate (marketplace data carried by Scryfall). Use it as a guide only.',
  cardMinimum: 'Card payments need at least {min}. Cash sales have no minimum.',
  oldReference: 'This price was set on {date}. Check it still looks right.',
  oldReferenceNoDate: 'This price may be out of date. Check it still looks right.',
  largeMove: 'This is {percent} percent away from the current price. Take a look before you apply it.',
  lowSample: 'Based on only {n} sales.',
  locked: 'Locked by you, so the price book will not change it.',
  recentEdit: 'You changed this price on {date}, so it was left alone.',
  recentEditNoDate: 'You changed this price recently, so it was left alone.',
  markedDown: 'This card is marked down, so it was left alone.',
  ebayLive: 'This card is listed on eBay, so it was left alone.',
  previewSummary: '{a} prices will change, {b} stay the same, {c} are skipped, {d} need a look.',
  apply: 'Apply {n} prices',
  applyConfirm: 'This changes the price on {n} cards. You can undo for 7 days.',
  applied: 'Applied {n} prices.',
  changedSince: '{n} cards changed after the preview, so we left them alone.',
  undo: 'Undo these changes',
  undoSkipped: '{n} cards were changed by hand since, so we left them alone.',
  rateNoteHelp: "Type what you see if you want to compare. We do not look up other shops' rates.",
  rateGap: 'You: {you} per 1,000. Noted: {them} per 1,000 ({date}). You are {percent} percent {direction}.',
  foreignFile: 'This file has price columns from another site. Use your own prices only.',
  catalogSettingHelp:
    'Magic only. These numbers come from marketplace data carried by Scryfall. They can be a day old and are a guide, not a quote. Off by default.',
  starterLabel: 'Starting point, set your own.',
  disabled: 'The price book is not turned on yet. You can still set every price by hand.',
  defaultRuleName: 'Default rule',
  rangeConflict: 'Your minimum is higher than your maximum for this rule, so the minimum was used.',
  belowCost: 'The price is below your cost.',
  hitFloor: 'The price was held up by your minimum.',
  hitCeiling: 'The price was held down by your maximum.',
  referenceMoved: 'The price this is based on moved a lot since the last time you applied it.',
  noRule: 'No rule in your price book fits this card.',
  noBuyRule: 'No buying rule fits this card, so there is no offer.',
  noCost: 'This rule starts from your cost, and this card has no cost on file.',
  noRate: 'No bulk rate is set for this kind of card.',
  gradedNotSupported: 'There is no free price source for graded cards. Enter your own price.',
  unsupportedProduct: 'The price book prices single cards only.',
  invalidInput: 'This card is missing details the price book needs, such as finish or condition.',
  belowMinOffer: 'Below your minimum buy price. No offer.',
  referenceTooOldTyped: 'Your typed price is more than {age} old.',
  referenceTooOldBenchmark: 'Your benchmark is more than {age} old.',
  referenceTooOldCatalog: 'The catalog estimate is more than {age} old.',
  referenceTooOldOther: 'The price this is based on is more than {age} old.',
  rateTooLarge: '{label} changed from {old} to {now}. Check it before you save.',
  rateDecimalSlip: '{label} changed from {old} to {now}. Check the decimal point before you save.',
  bulkNoRate: 'No rate set for {label}.',
  bulkBadQuantity: 'Enter a whole number of cards, from 1 to 1,000,000.',
  bulkTooSmall: 'That many cards comes to less than one cent at this rate.',
  starterBuyUnder: 'Buy under $1.50',
  starterBuyMiddle: 'Buy $1.50 to $24.99',
  starterBuyTop: 'Buy $25.00 and up',
  starterSellAll: 'All cards',
} as const;

export const ROUNDING_NAMES: Record<RoundingMode, string> = {
  NONE: 'No rounding',
  TIERED: 'Tiered (5 cents, 25 cents, whole dollars)',
  NEAREST_5C: '5 cents',
  NEAREST_25C: '25 cents',
  NEAREST_DOLLAR: 'Whole dollars',
  ENDING_99: 'Prices ending in 99',
  KEYSTONE_49_99: 'Prices ending in 49 or 99',
};

export const ROUNDING_DIRECTION_NAMES: Record<RoundingDirection, string> = {
  NEAREST: 'Nearest',
  UP: 'Round up',
  DOWN: 'Round down',
};

// ---------------------------------------------------------------------------------------------
// Sentences built from parts
// ---------------------------------------------------------------------------------------------

export function cardMinimumWarning(minCents: number): string {
  return fill(COPY.cardMinimum, { min: formatCentsUsd(minCents) });
}

export function oldReferenceWarning(dateText: string | null): string {
  return dateText ? fill(COPY.oldReference, { date: dateText }) : COPY.oldReferenceNoDate;
}

export function largeMoveText(percent: number): string {
  return fill(COPY.largeMove, { percent: Math.abs(percent) });
}

export function lowSampleText(n: number): string {
  return fill(COPY.lowSample, { n });
}

export function recentEditText(dateText: string | null): string {
  return dateText ? fill(COPY.recentEdit, { date: dateText }) : COPY.recentEditNoDate;
}

/** "a year" for 365 days, otherwise "N days". */
export function ageWords(days: number): string {
  return days === 365 ? 'a year' : `${days} days`;
}

export function referenceTooOldText(kind: string, days: number): string {
  const age = ageWords(days);
  if (kind === 'MANUAL') return fill(COPY.referenceTooOldTyped, { age });
  if (kind === 'SHOP_BENCHMARK') return fill(COPY.referenceTooOldBenchmark, { age });
  if (kind === 'CATALOG_REFERENCE') return fill(COPY.referenceTooOldCatalog, { age });
  return fill(COPY.referenceTooOldOther, { age });
}

export function previewSummaryText(change: number, same: number, skipped: number, review: number): string {
  return fill(COPY.previewSummary, { a: change, b: same, c: skipped, d: review });
}

export function reviewReasonText(reason: ReviewReason, vars: { percent?: number; n?: number } = {}): string {
  switch (reason) {
    case 'LARGE_MOVE':
      return largeMoveText(vars.percent ?? 0);
    case 'HIT_FLOOR':
      return COPY.hitFloor;
    case 'HIT_CEILING':
      return COPY.hitCeiling;
    case 'BELOW_COST':
      return COPY.belowCost;
    case 'REFERENCE_MOVED':
      return COPY.referenceMoved;
    case 'LOW_SAMPLE':
      return lowSampleText(vars.n ?? 0);
    default:
      return COPY.oldReferenceNoDate;
  }
}

export function warningText(code: WarningCode, vars: { minCents?: number; dateText?: string | null } = {}): string {
  switch (code) {
    case 'BELOW_CARD_MINIMUM':
      return cardMinimumWarning(vars.minCents ?? 99);
    case 'REFERENCE_OLD':
      return oldReferenceWarning(vars.dateText ?? null);
    case 'CATALOG_ESTIMATE':
      return COPY.catalogGuide;
    case 'RANGE_CONFLICT':
      return COPY.rangeConflict;
    default:
      return COPY.oldReferenceNoDate;
  }
}

export function failureText(code: SuggestionCode, family: 'RETAIL' | 'BUYLIST'): string {
  switch (code) {
    case 'NO_REFERENCE':
      return COPY.noSuggestion;
    case 'NO_RULE':
      return family === 'BUYLIST' ? COPY.noBuyRule : COPY.noRule;
    case 'NO_COST':
      return COPY.noCost;
    case 'NO_RATE':
      return COPY.noRate;
    case 'GRADED_NOT_SUPPORTED':
      return COPY.gradedNotSupported;
    case 'UNSUPPORTED_PRODUCT':
      return COPY.unsupportedProduct;
    case 'BELOW_MIN_OFFER':
      return COPY.belowMinOffer;
    default:
      return COPY.invalidInput;
  }
}

function centsWord(step: number): string {
  return `${step} cents`;
}

/** The full plain words phrase for a rounding step, such as "Rounded to the nearest 25 cents". */
export function roundingLabel(mode: RoundingMode, direction: RoundingDirection, stepCents: number | null): string {
  if (mode === 'NONE') return 'No rounding';
  if (mode === 'ENDING_99') {
    if (direction === 'UP') return 'Rounded up to a price ending in 99';
    if (direction === 'DOWN') return 'Rounded down to a price ending in 99';
    return 'Rounded to the nearest price ending in 99';
  }
  if (mode === 'KEYSTONE_49_99') {
    if (direction === 'UP') return 'Rounded up to a price ending in 49 or 99';
    if (direction === 'DOWN') return 'Rounded down to a price ending in 49 or 99';
    return 'Rounded to the nearest price ending in 49 or 99';
  }
  const step = stepCents ?? 5;
  if (step >= 100) {
    if (direction === 'UP') return 'Rounded up to the next whole dollar';
    if (direction === 'DOWN') return 'Rounded down to the whole dollar';
    return 'Rounded to the nearest dollar';
  }
  if (direction === 'UP') return `Rounded up to a multiple of ${centsWord(step)}`;
  if (direction === 'DOWN') return `Rounded down to a multiple of ${centsWord(step)}`;
  return `Rounded to the nearest ${centsWord(step)}`;
}

export function traceLabel(step: TraceStep, vars: { cents?: number; bps?: number; text?: string } = {}): string {
  const usd = formatCentsUsd(vars.cents ?? 0);
  const pct = formatPercentBps(vars.bps ?? 0);
  switch (step) {
    case 'REFERENCE':
      return vars.text ?? '';
    case 'RATE_CARD':
      return SOURCE_LABELS.RATE_CARD;
    case 'FIXED':
      return SOURCE_LABELS.FIXED_RULE;
    case 'COST':
      return 'Your cost';
    case 'RETAIL_PRICE':
      return 'Your shelf price for this card';
    case 'PERCENT':
      return `${pct} percent`;
    case 'CONDITION':
      return `${vars.text ?? ''} at ${pct} percent`;
    case 'LANGUAGE':
      return `Non-English copy at ${pct} percent`;
    case 'ADD':
      return (vars.cents ?? 0) >= 0 ? `Plus ${usd}` : `Minus ${formatCentsUsd(Math.abs(vars.cents ?? 0))}`;
    case 'COST_FLOOR':
      return `Raised to your cost plus margin, ${usd}`;
    case 'FLOOR_APPLIED':
      return `Raised to your minimum of ${usd}`;
    case 'CEILING_APPLIED':
      return `Held at your maximum of ${usd}`;
    case 'ROUND':
      return vars.text ?? '';
    case 'CLAMP_AFTER_ROUND':
      return 'Kept within your minimum and maximum';
    case 'RESULT_FLOOR':
      return `Raised to ${usd}, the lowest price possible`;
    case 'CREDIT':
      return `Store credit at ${pct} percent`;
    default:
      return '';
  }
}

export function rateLabel(row: { direction: string; game: string; tier: string; finish: string; unit: string }): string {
  const direction = DIRECTION_LABELS[row.direction as Direction] ?? row.direction;
  const tier = TIER_LABELS[row.tier as Tier] ?? row.tier;
  const finish = FINISH_LABELS[row.finish as FinishOrAny] ?? row.finish;
  const unit = UNIT_LABELS[row.unit as Unit] ?? row.unit;
  return `${direction}, ${tier}, ${finish}, ${unit}`;
}

export function rateChangeText(kind: 'LARGE' | 'DECIMAL_SLIP', label: string, oldCents: number, newCents: number): string {
  return fill(kind === 'LARGE' ? COPY.rateTooLarge : COPY.rateDecimalSlip, {
    label,
    old: formatCentsUsd(oldCents),
    now: formatCentsUsd(newCents),
  });
}

export function bulkNoRateText(label: string): string {
  return fill(COPY.bulkNoRate, { label });
}

/** Every static string plus a rendering of every template, for the copy lint test. */
export function allPriceBookMessages(): string[] {
  const out: string[] = [];
  out.push(...Object.values(COPY));
  out.push(...Object.values(SOURCE_LABELS));
  out.push(...Object.values(CONDITION_LABELS));
  out.push(...Object.values(TIER_LABELS));
  out.push(...Object.values(FINISH_LABELS));
  out.push(...Object.values(DIRECTION_LABELS));
  out.push(...Object.values(UNIT_LABELS));
  out.push(...Object.values(ROUNDING_NAMES));
  out.push(...Object.values(ROUNDING_DIRECTION_NAMES));

  out.push(cardMinimumWarning(99), oldReferenceWarning('Oct 3'), oldReferenceWarning(null), largeMoveText(38), lowSampleText(2));
  out.push(recentEditText('Oct 3'), recentEditText(null), previewSummaryText(4, 3, 2, 1));
  out.push(referenceTooOldText('MANUAL', 365), referenceTooOldText('SHOP_BENCHMARK', 90), referenceTooOldText('CATALOG_REFERENCE', 14), referenceTooOldText('LICENSED_FEED', 30));
  for (const reason of ['LARGE_MOVE', 'HIT_FLOOR', 'HIT_CEILING', 'BELOW_COST', 'REFERENCE_MOVED', 'LOW_SAMPLE', 'REFERENCE_OLD'] as const) {
    out.push(reviewReasonText(reason, { percent: 38, n: 2 }));
  }
  for (const code of ['BELOW_CARD_MINIMUM', 'REFERENCE_OLD', 'CATALOG_ESTIMATE', 'RANGE_CONFLICT', 'REFERENCE_TOO_OLD'] as const) {
    out.push(warningText(code, { minCents: 99, dateText: 'Oct 3' }));
  }
  for (const code of ['NO_REFERENCE', 'NO_RULE', 'NO_COST', 'NO_RATE', 'GRADED_NOT_SUPPORTED', 'UNSUPPORTED_PRODUCT', 'INVALID_INPUT', 'BELOW_MIN_OFFER'] as const) {
    out.push(failureText(code, 'RETAIL'), failureText(code, 'BUYLIST'));
  }
  const modes = ['NONE', 'TIERED', 'NEAREST_5C', 'NEAREST_25C', 'NEAREST_DOLLAR', 'ENDING_99', 'KEYSTONE_49_99'] as const;
  const directions = ['NEAREST', 'UP', 'DOWN'] as const;
  for (const mode of modes) for (const direction of directions) for (const step of [5, 25, 100]) out.push(roundingLabel(mode, direction, step));
  const steps: TraceStep[] = [
    'REFERENCE', 'RATE_CARD', 'FIXED', 'COST', 'RETAIL_PRICE', 'PERCENT', 'CONDITION', 'LANGUAGE', 'ADD', 'COST_FLOOR',
    'FLOOR_APPLIED', 'CEILING_APPLIED', 'ROUND', 'CLAMP_AFTER_ROUND', 'RESULT_FLOOR', 'CREDIT',
  ];
  for (const step of steps) {
    out.push(traceLabel(step, { cents: 125, bps: 9500, text: 'Lightly Played' }), traceLabel(step, { cents: -125, bps: 9550, text: 'Rounded to the nearest 5 cents' }));
  }
  out.push(rateLabel({ direction: 'SELL', game: 'MTG', tier: 'COMMON', finish: 'ANY', unit: 'PER_1000' }));
  out.push(rateChangeText('LARGE', 'We sell, Commons, Any finish, per 1,000', 800, 1600), rateChangeText('DECIMAL_SLIP', 'We sell, Commons, Any finish, per 1,000', 800, 80000));
  out.push(bulkNoRateText('Commons'));
  return Array.from(new Set(out)).filter((s) => s !== '');
}
