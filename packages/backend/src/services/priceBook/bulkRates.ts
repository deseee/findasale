/**
 * The bulk rate card as pure functions (ADR-140 sections 8.1 to 8.4). Money is integer cents. A PER_1000 rate is cents per
 * 1,000 cards ($8.00 per 1,000 is 800); a PER_CARD rate is cents per card.
 *
 * The arithmetic matches ADR-136 (bulkLotPricing): the price of N cards at P cents per 1,000 is floor((N * P + 500) / 1000),
 * rounded once on the whole line, and a line that comes to less than one cent is refused.
 */
import { mulBps, roundHalfUp } from './rounding';
import { rateChangeText, rateLabel } from './messages';
import type { BulkRate } from './types';
import {
  DEFAULT_BUY_CREDIT_BPS,
  LOT_KIND_TIER,
  MAX_BULK_CARDS,
  MAX_RATE_ADJUST_BPS,
  MAX_RATE_PER_1000_CENTS,
  MAX_RATE_PER_CARD_CENTS,
  MIN_RATE_ADJUST_BPS,
  isBulkLotKind,
  isDirection,
  isTier,
  isUnit,
} from './vocabulary';
import type { RarityClass, Tier, Unit } from './vocabulary';

export interface RateQuery {
  direction: string;
  game: string;
  tier: string;
  finish: string;
  unit: string;
}

const sameGame = (a: string, b: string) => a.trim().toUpperCase() === b.trim().toUpperCase();

/** The exact finish row first, then the ANY row. Null when neither exists. */
export function lookupRate(rates: readonly BulkRate[], q: RateQuery): BulkRate | null {
  const finish = q.finish.trim().toUpperCase();
  const find = (f: string): BulkRate | null =>
    rates.find(
      (r) =>
        r.direction === q.direction &&
        sameGame(r.game, q.game) &&
        r.tier === q.tier &&
        r.unit === q.unit &&
        r.finish.trim().toUpperCase() === f
    ) ?? null;
  const exact = finish === 'ANY' ? null : find(finish);
  return exact ?? find('ANY');
}

/** A single card's tier comes from its rarity class; UNKNOWN has no tier. */
export function tierForRarityClass(rarityClass: RarityClass | string): Tier | null {
  return isTier(rarityClass) ? rarityClass : null;
}

/** ADR-140 section 8.1: BULK_COMMON gives COMMON and so on. Null for a name that is not a lot kind. */
export function tierForLotKind(lotKind: string): Tier | null {
  return isBulkLotKind(lotKind) ? LOT_KIND_TIER[lotKind] : null;
}

/** The SELL PER_1000 row for the lot's tier at finish ANY, in cents per 1,000 cards. Null means NO_RATE. */
export function lotPricePerThousandCents(rates: readonly BulkRate[], q: { game: string; lotKind: string }): number | null {
  const tier = tierForLotKind(q.lotKind);
  if (!tier) return null;
  const row = lookupRate(rates, { direction: 'SELL', game: q.game, tier, finish: 'ANY', unit: 'PER_1000' });
  return row ? row.rateCents : null;
}

export type BulkLineCode = 'NO_RATE' | 'BAD_QUANTITY' | 'BAD_TIER' | 'QUANTITY_TOO_SMALL';

export interface BulkLineInput {
  direction: string;
  game: string;
  tier: string;
  finish: string;
  cards: number;
  /** When absent, the finer finish row wins, and within a finish PER_1000 is tried before PER_CARD. */
  unit?: string;
}

export type BulkLineResult =
  | {
      ok: true;
      cents: number;
      /** BUY lines only. */
      creditCents: number | null;
      rateCents: number;
      unit: Unit;
      finishUsed: string;
    }
  | { ok: false; code: BulkLineCode };

function lineCents(unit: Unit, rateCents: number, cards: number): number {
  return unit === 'PER_1000' ? Math.floor((cards * rateCents + 500) / 1000) : cards * rateCents;
}

function validRate(unit: Unit, rate: number): boolean {
  if (!Number.isSafeInteger(rate) || rate < 1) return false;
  return unit === 'PER_1000' ? rate <= MAX_RATE_PER_1000_CENTS : rate <= MAX_RATE_PER_CARD_CENTS;
}

/**
 * Quotes one line. BUY lines also carry the store credit: the explicit creditRateCents converted the same way, else the
 * cash amount times the book credit multiplier (buyCreditBps, default 12000), rounded half up.
 */
export function quoteBulkLine(
  rates: readonly BulkRate[],
  line: BulkLineInput,
  opts: { buyCreditBps?: number } = {}
): BulkLineResult {
  if (!isDirection(line.direction)) return { ok: false, code: 'NO_RATE' };
  if (!isTier(line.tier)) return { ok: false, code: 'BAD_TIER' };
  if (!Number.isSafeInteger(line.cards) || line.cards < 1 || line.cards > MAX_BULK_CARDS) return { ok: false, code: 'BAD_QUANTITY' };

  const finish = line.finish.trim().toUpperCase() || 'ANY';
  const units: Unit[] = line.unit !== undefined ? (isUnit(line.unit) ? [line.unit] : []) : ['PER_1000', 'PER_CARD'];
  const finishes = finish === 'ANY' ? ['ANY'] : [finish, 'ANY'];
  let row: BulkRate | null = null;
  let unitUsed: Unit = 'PER_CARD';
  let finishUsed = 'ANY';
  search: for (const f of finishes) {
    for (const u of units) {
      const hit = lookupRate(rates, { direction: line.direction, game: line.game, tier: line.tier, finish: f, unit: u });
      if (hit && hit.finish.trim().toUpperCase() === f) {
        row = hit;
        unitUsed = u;
        finishUsed = f;
        break search;
      }
    }
  }
  if (!row || !validRate(unitUsed, row.rateCents)) return { ok: false, code: 'NO_RATE' };

  const cents = lineCents(unitUsed, row.rateCents, line.cards);
  if (cents < 1) return { ok: false, code: 'QUANTITY_TOO_SMALL' };

  let creditCents: number | null = null;
  if (line.direction === 'BUY') {
    const explicit = row.creditRateCents;
    creditCents =
      typeof explicit === 'number' && Number.isSafeInteger(explicit) && explicit >= 0
        ? lineCents(unitUsed, explicit, line.cards)
        : mulBps(cents, opts.buyCreditBps ?? DEFAULT_BUY_CREDIT_BPS);
  }
  return { ok: true, cents, creditCents, rateCents: row.rateCents, unit: unitUsed, finishUsed };
}

export type BulkBuyResult =
  | { ok: true; cashCents: number; creditCents: number; lines: BulkLineResult[] }
  | { ok: false; code: BulkLineCode; cashCents: null; creditCents: null; lines: BulkLineResult[] };

/**
 * Sums BUY lines. A line with no rate is refused (NO_RATE) and the whole quote fails: totals are never given for a basket
 * that has a line the book cannot price, and nothing is guessed.
 */
export function quoteBulkBuy(
  rates: readonly BulkRate[],
  book: { buyCreditBps: number },
  lines: readonly BulkLineInput[]
): BulkBuyResult {
  const results = lines.map((l) => quoteBulkLine(rates, { ...l, direction: 'BUY' }, { buyCreditBps: book.buyCreditBps }));
  const firstBad = results.find((r) => !r.ok);
  if (firstBad && !firstBad.ok) return { ok: false, code: firstBad.code, cashCents: null, creditCents: null, lines: results };
  let cash = 0;
  let credit = 0;
  for (const r of results) {
    if (r.ok) {
      cash += r.cents;
      credit += r.creditCents ?? 0;
    }
  }
  return { ok: true, cashCents: cash, creditCents: credit, lines: results };
}

export interface RateAdjustment {
  direction: string;
  game: string;
  tier: string;
  finish: string;
  unit: string;
  beforeCents: number;
  afterCents: number;
  creditBeforeCents: number | null;
  creditAfterCents: number | null;
  /** True when the result was held at the lowest or highest value the rate card allows. */
  clamped: boolean;
}

export type AdjustResult =
  | { ok: true; changes: RateAdjustment[]; unchangedCount: number }
  | { ok: false; code: 'BAD_PERCENT' | 'BAD_DIRECTION' };

function adjustOne(value: number, percentBps: number, unit: string): { value: number; clamped: boolean } {
  const max = unit === 'PER_1000' ? MAX_RATE_PER_1000_CENTS : MAX_RATE_PER_CARD_CENTS;
  const raw = roundHalfUp(value * (10000 + percentBps), 10000);
  if (raw < 1) return { value: 1, clamped: true };
  if (raw > max) return { value: max, clamped: true };
  return { value: raw, clamped: false };
}

/**
 * The proposed new values for "Move all sell rates" (and buy rates). percentBps is the signed CHANGE in basis points:
 * -1000 is minus 10 percent, 2500 is plus 25 percent. It must be a whole number from -9000 to 100000. Each result is rounded
 * half up to a whole cent (per card) or a whole cent per 1,000, and held between 1 and the card limits. Pure: nothing is
 * saved. Rows outside the chosen game and finish are not listed.
 */
export function adjustRates(
  rates: readonly BulkRate[],
  opts: { percentBps: number; direction: string; game?: string | null; finish?: string | null }
): AdjustResult {
  if (!Number.isInteger(opts.percentBps) || opts.percentBps < MIN_RATE_ADJUST_BPS || opts.percentBps > MAX_RATE_ADJUST_BPS) {
    return { ok: false, code: 'BAD_PERCENT' };
  }
  if (!isDirection(opts.direction)) return { ok: false, code: 'BAD_DIRECTION' };
  const changes: RateAdjustment[] = [];
  let unchanged = 0;
  for (const r of rates) {
    if (r.direction !== opts.direction) continue;
    if (opts.game && !sameGame(r.game, opts.game)) continue;
    if (opts.finish && r.finish.trim().toUpperCase() !== opts.finish.trim().toUpperCase()) continue;
    const after = adjustOne(r.rateCents, opts.percentBps, r.unit);
    const creditBefore = typeof r.creditRateCents === 'number' ? r.creditRateCents : null;
    const creditAfter = creditBefore === null ? null : creditBefore === 0 ? 0 : adjustOne(creditBefore, opts.percentBps, r.unit).value;
    if (after.value === r.rateCents && creditAfter === creditBefore) {
      unchanged += 1;
      continue;
    }
    changes.push({
      direction: r.direction,
      game: r.game,
      tier: r.tier,
      finish: r.finish,
      unit: r.unit,
      beforeCents: r.rateCents,
      afterCents: after.value,
      creditBeforeCents: creditBefore,
      creditAfterCents: creditAfter,
      clamped: after.clamped,
    });
  }
  return { ok: true, changes, unchangedCount: unchanged };
}

export interface RateChangeWarning {
  code: 'LARGE_RATE_CHANGE' | 'DECIMAL_SLIP';
  key: string;
  oldRateCents: number;
  newRateCents: number;
  message: string;
}

function rateKey(r: { direction: string; game: string; tier: string; finish: string; unit: string }): string {
  return [r.direction, r.game.trim().toUpperCase(), r.tier, r.finish.trim().toUpperCase(), r.unit].join('|');
}

/** True when one number is the other times 10, 100 or 1,000 exactly (8.00 typed as 800.00, or the reverse). */
function isDecimalSlip(oldRate: number, newRate: number): boolean {
  for (const factor of [10, 100, 1000]) {
    if (newRate === oldRate * factor || oldRate === newRate * factor) return true;
  }
  return false;
}

/**
 * Warnings the screen shows before saving: a rate that changed by more than 50 percent, or a decimal slip such as 8 typed as
 * 800. A decimal slip is reported once (not also as a large change). Rows that are new or removed are not warned about, and
 * unchanged rows never are. Output order follows the new rate list.
 */
export function rateChangeWarnings(oldRates: readonly BulkRate[], newRates: readonly BulkRate[]): RateChangeWarning[] {
  const before = new Map<string, BulkRate>();
  for (const r of oldRates) before.set(rateKey(r), r);
  const out: RateChangeWarning[] = [];
  for (const r of newRates) {
    const key = rateKey(r);
    const prev = before.get(key);
    if (!prev || prev.rateCents === r.rateCents || prev.rateCents < 1 || r.rateCents < 1) continue;
    const label = rateLabel(r);
    if (isDecimalSlip(prev.rateCents, r.rateCents)) {
      out.push({
        code: 'DECIMAL_SLIP',
        key,
        oldRateCents: prev.rateCents,
        newRateCents: r.rateCents,
        message: rateChangeText('DECIMAL_SLIP', label, prev.rateCents, r.rateCents),
      });
    } else if (Math.abs(r.rateCents - prev.rateCents) * 100 > prev.rateCents * 50) {
      out.push({
        code: 'LARGE_RATE_CHANGE',
        key,
        oldRateCents: prev.rateCents,
        newRateCents: r.rateCents,
        message: rateChangeText('LARGE', label, prev.rateCents, r.rateCents),
      });
    }
  }
  return out;
}
