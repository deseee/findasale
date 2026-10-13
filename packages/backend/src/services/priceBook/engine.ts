/**
 * The price book rule engine (ADR-140 section 6). Pure functions: no database, no environment, no network, and no clock
 * except for measuring the age of a reference and the expiry of a lock through the injected config.now (getTime only).
 *
 * Input: one card, the reference candidates the providers found for it, the book's rules and settings, the bulk rate card,
 * and the injected config. Output: a price in integer cents with its source, date, rule, step by step trace, warnings, review
 * reasons and plain words. The processing order is fixed (section 6.3) and the step names below follow it:
 *   1 validate, 2 order rules, 3 match rules and select a reference, 4 base, 5 percent, 6 condition, 7 language, 8 add,
 *   9 cost floor, 10 clamp, 11 round then clamp once more, 12 result floor, 13 checks, 14 lock, 15 fill the result.
 *
 * All money is integer cents with half up rounding at the step named. There is no floating point money.
 *
 * Imports are limited to this directory. Nothing here knows about eBay, other marketplaces or any price feed: the only
 * numbers it uses are the candidates it is handed.
 */
import { explain } from './explain';
import { lookupRate, tierForRarityClass } from './bulkRates';
import {
  COPY,
  CONDITION_LABELS,
  SOURCE_LABELS,
  cardMinimumWarning,
  formatShortDate,
  oldReferenceWarning,
  referenceTooOldText,
  roundingLabel,
  traceLabel,
} from './messages';
import { mulBps, roundCents, roundHalfUp } from './rounding';
import type {
  BookSettings,
  CardInput,
  EngineInput,
  PriceRule,
  PriceSuggestion,
  ReferenceCandidate,
  ReviewReason,
  SuggestionCode,
  SuggestionWarning,
  TraceLine,
  TraceStep,
} from './types';
import {
  CATALOG_MAX_AGE_DAYS,
  DAY_MS,
  DEFAULT_CATALOG_STALE_HOURS,
  HOUR_MS,
  LOW_SAMPLE_BELOW,
  MAX_BULK_CARDS,
  isBasis,
  isConditionCode,
  isFamily,
  isFinish,
  isReferenceKind,
  isRoundingDirection,
  isRoundingMode,
} from './vocabulary';
import type { Basis, ConditionCode, PriceSource, ReferenceKind, RoundingDirection, RoundingMode } from './vocabulary';

export type { EngineInput };

const eqi = (a: string | null | undefined, b: string | null | undefined): boolean =>
  String(a ?? '').trim().toUpperCase() === String(b ?? '').trim().toUpperCase();

function conditionBps(book: BookSettings, code: ConditionCode): number {
  switch (code) {
    case 'NM':
      return book.condNmBps;
    case 'LP':
      return book.condLpBps;
    case 'MP':
      return book.condMpBps;
    case 'HP':
      return book.condHpBps;
    default:
      return book.condDmgBps;
  }
}

// ---------------------------------------------------------------------------------------------
// Reference selection (section 6.4)
// ---------------------------------------------------------------------------------------------

export interface ReferenceSelection {
  selected: ReferenceCandidate | null;
  /** Warnings that belong to the selected candidate (REFERENCE_OLD, CATALOG_ESTIMATE). */
  warnings: SuggestionWarning[];
  /** One note per kind whose candidates were all older than the hard limit (used for NO_REFERENCE). */
  tooOld: SuggestionWarning[];
}

/** Rank of a candidate for this card: lower is better; null means it cannot be used for this finish or language. */
function compatRank(c: ReferenceCandidate, finish: string, language: string): number | null {
  let finishRank = 0;
  if (c.finish !== undefined) {
    const cf = c.finish.trim().toUpperCase();
    if (cf === finish) finishRank = 0;
    else if (cf === 'ANY' && c.kind === 'SHOP_BENCHMARK') finishRank = 1;
    else return null;
  }
  let languageRank = 0;
  if (c.language !== undefined) {
    const cl = c.language.trim().toLowerCase();
    if (cl === language) languageRank = 0;
    else if (cl === 'en') languageRank = 1;
    else return null;
  }
  return finishRank * 2 + languageRank;
}

function ageState(c: ReferenceCandidate, book: BookSettings, staleHours: number, nowMs: number): { tooOld: boolean; warn: boolean } {
  if (c.kind === 'SHOP_SOLD_HISTORY') return { tooOld: false, warn: false };
  const external = c.kind === 'CATALOG_REFERENCE' || c.kind === 'LICENSED_FEED';
  if (c.asOf === null) return { tooOld: false, warn: external };
  const ageMs = nowMs - c.asOf.getTime();
  if (external) return { tooOld: ageMs > CATALOG_MAX_AGE_DAYS * DAY_MS, warn: ageMs > staleHours * HOUR_MS };
  return { tooOld: ageMs > book.referenceMaxDays * DAY_MS, warn: ageMs > book.referenceWarnDays * DAY_MS };
}

const isNewer = (a: ReferenceCandidate, b: ReferenceCandidate): boolean =>
  a.asOf !== null && (b.asOf === null || a.asOf.getTime() > b.asOf.getTime());

/**
 * Picks the first kind (in the book's order, narrowed by the rule's sourceKinds) that has a usable candidate. Within a kind
 * the exact finish and language wins, then a benchmark for ANY finish or an English number for another language, then the
 * newest. Usable means a value above zero that is not past the age limit for its kind.
 */
export function selectReference(args: {
  candidates: readonly ReferenceCandidate[];
  rule: Pick<PriceRule, 'sourceKinds'>;
  finish: string;
  language: string;
  book: BookSettings;
  config: { now: Date; catalogStaleHours?: number };
}): ReferenceSelection {
  const { candidates, rule, finish, language, book, config } = args;
  const restrict = rule.sourceKinds && rule.sourceKinds.length > 0 ? rule.sourceKinds : null;
  const kinds: ReferenceKind[] = [];
  for (const k of book.referenceOrder) {
    if (isReferenceKind(k) && !kinds.includes(k) && (!restrict || restrict.includes(k))) kinds.push(k);
  }
  const nowMs = config.now.getTime();
  const staleHours = config.catalogStaleHours && config.catalogStaleHours > 0 ? config.catalogStaleHours : DEFAULT_CATALOG_STALE_HOURS;
  const tooOld: SuggestionWarning[] = [];

  for (const kind of kinds) {
    let best: ReferenceCandidate | null = null;
    let bestRank = 0;
    let bestWarn = false;
    let sawTooOld = false;
    for (let i = 0; i < candidates.length; i += 1) {
      const c = candidates[i];
      if (c === undefined || c.kind !== kind) continue;
      if (!Number.isSafeInteger(c.valueCents) || c.valueCents < 1) continue;
      const rank = compatRank(c, finish, language);
      if (rank === null) continue;
      const age = ageState(c, book, staleHours, nowMs);
      if (age.tooOld) {
        sawTooOld = true;
        continue;
      }
      if (best === null || rank < bestRank || (rank === bestRank && isNewer(c, best))) {
        best = c;
        bestRank = rank;
        bestWarn = age.warn;
      }
    }
    if (best !== null) {
      const warnings: SuggestionWarning[] = [];
      if (bestWarn) {
        const iso = best.asOf ? best.asOf.toISOString() : null;
        warnings.push({ code: 'REFERENCE_OLD', message: oldReferenceWarning(formatShortDate(iso)) });
      }
      if (kind === 'CATALOG_REFERENCE') warnings.push({ code: 'CATALOG_ESTIMATE', message: COPY.catalogGuide });
      return { selected: best, warnings, tooOld: [] };
    }
    if (sawTooOld) {
      const days = kind === 'CATALOG_REFERENCE' || kind === 'LICENSED_FEED' ? CATALOG_MAX_AGE_DAYS : book.referenceMaxDays;
      tooOld.push({ code: 'REFERENCE_TOO_OLD', message: referenceTooOldText(kind, days) });
    }
  }
  return { selected: null, warnings: [], tooOld };
}

// ---------------------------------------------------------------------------------------------
// Rules (sections 6.3 steps 2 and 3)
// ---------------------------------------------------------------------------------------------

function compareRules(a: PriceRule, b: PriceRule): number {
  if (a.priority !== b.priority) return a.priority - b.priority;
  return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
}

function ruleMatches(rule: PriceRule, card: CardInput, finish: string, language: string): boolean {
  if (rule.productType && !eqi(rule.productType, card.productType ?? 'SINGLE')) return false;
  if (rule.game && !eqi(rule.game, card.game)) return false;
  if (rule.setCode && !eqi(rule.setCode, card.setCode)) return false;
  if (rule.rarityClass) {
    if (card.rarityClass === 'UNKNOWN' || !eqi(rule.rarityClass, card.rarityClass)) return false;
  }
  if (rule.rarityText && !eqi(rule.rarityText, card.rarityText)) return false;
  if (rule.finish && !eqi(rule.finish, 'ANY') && !eqi(rule.finish, finish)) return false;
  if (rule.language && String(rule.language).trim().toLowerCase() !== language) return false;
  if (rule.variantToken) {
    const token = rule.variantToken.trim().toUpperCase();
    const tokens = card.variantTokens.map((t) => t.toUpperCase());
    if (token === 'NONE') {
      if (tokens.length > 0) return false;
    } else if (!tokens.includes(token)) {
      return false;
    }
  }
  return true;
}

// ---------------------------------------------------------------------------------------------
// Results
// ---------------------------------------------------------------------------------------------

function failed(code: SuggestionCode, family: 'RETAIL' | 'BUYLIST', warnings: SuggestionWarning[] = []): PriceSuggestion {
  const base: Omit<PriceSuggestion, 'why'> = {
    ok: false,
    code,
    family,
    priceCents: null,
    creditCents: null,
    lineCents: null,
    creditLineCents: null,
    priceSource: null,
    priceAsOf: null,
    referenceCents: null,
    referenceOrigin: null,
    referenceLabel: null,
    referenceNote: null,
    referenceSampleCount: null,
    rule: null,
    unchanged: false,
    applyAllowed: false,
    lockedReason: null,
    review: { required: false, reasons: [], movePercent: null },
    warnings,
    trace: [],
    roundingUsed: null,
  };
  return { ...base, why: explain(base) };
}

function movePercentOf(price: number, current: number | null | undefined): number | null {
  if (current === null || current === undefined || !(current > 0)) return null;
  const diff = price - current;
  const magnitude = roundHalfUp(Math.abs(diff) * 100, current);
  return diff < 0 && magnitude !== 0 ? -magnitude : magnitude;
}

interface Internal {
  s: PriceSuggestion;
  /** The reference candidate the price came from, for the checks of a buylist that starts from the shelf price. */
  candidate: ReferenceCandidate | null;
}

interface Chosen {
  rule: PriceRule;
  isDefault: boolean;
  selection: ReferenceSelection | null;
  inner: Internal | null;
}

function compute(input: EngineInput): Internal {
  const { card, candidates, book, config } = input;
  const family = config.family;
  const rates = input.rates ?? [];
  const bad = (code: SuggestionCode, warnings: SuggestionWarning[] = []): Internal => ({
    s: failed(code, family, warnings),
    candidate: null,
  });

  // 1. Validate.
  if (!isFamily(family)) return bad('INVALID_INPUT');
  const finish = String(card.finish ?? '').trim().toUpperCase();
  if (!isFinish(finish)) return bad('INVALID_INPUT');
  if (card.graded) return bad('GRADED_NOT_SUPPORTED');
  const productType = String(card.productType ?? 'SINGLE').trim().toUpperCase();
  if (productType !== 'SINGLE') return bad('UNSUPPORTED_PRODUCT');
  const condition = String(card.conditionCode ?? '').trim().toUpperCase();
  if (!isConditionCode(condition)) return bad('INVALID_INPUT');
  const quantity = card.quantity === undefined ? 1 : card.quantity;
  if (!Number.isSafeInteger(quantity) || quantity < 1 || quantity > MAX_BULK_CARDS) return bad('INVALID_INPUT');
  const language = String(card.language ?? 'en').trim().toLowerCase() || 'en';

  // 2. Order the rules: enabled rules of this family by priority then id, then the synthetic default (RETAIL only).
  const views: Array<{ rule: PriceRule; isDefault: boolean }> = input.rules
    .filter((r) => r.enabled && r.family === family)
    .slice()
    .sort(compareRules)
    .map((rule) => ({ rule, isDefault: false }));
  if (family === 'RETAIL') {
    views.push({
      isDefault: true,
      rule: {
        id: '',
        family: 'RETAIL',
        name: COPY.defaultRuleName,
        priority: Number.MAX_SAFE_INTEGER,
        enabled: true,
        basis: 'REFERENCE',
        percentBps: book.retailPercentBps,
        addCents: 0,
      },
    });
  }

  // 3. Match rules and select a reference. The first rule that passes is the rule used.
  let pending: SuggestionCode | null = null;
  let pendingWarnings: SuggestionWarning[] = [];
  let chosen: Chosen | null = null;
  for (const view of views) {
    const rule = view.rule;
    if (!ruleMatches(rule, card, finish, language)) continue;
    if (!isBasis(rule.basis)) continue;
    if (rule.basis === 'RETAIL_PRICE' && family !== 'BUYLIST') continue;
    const hasBand = (rule.refMinCents ?? null) !== null || (rule.refMaxCents ?? null) !== null;
    let selection: ReferenceSelection | null = null;
    let inner: Internal | null = null;
    let refValue: number | null = null;
    let innerFailure: SuggestionCode | null = null;
    let missingWarnings: SuggestionWarning[] = [];

    if (rule.basis === 'RETAIL_PRICE') {
      inner = compute({
        ...input,
        card: { ...card, lock: null, currentPriceCents: null, previousReferenceCents: null },
        config: { ...config, family: 'RETAIL' },
      });
      if (inner.s.ok) refValue = inner.s.referenceCents;
      else {
        innerFailure = inner.s.code ?? 'NO_REFERENCE';
        missingWarnings = inner.s.warnings;
      }
    } else if (rule.basis === 'REFERENCE' || hasBand) {
      selection = selectReference({ candidates, rule, finish, language, book, config });
      refValue = selection.selected ? selection.selected.valueCents : null;
      missingWarnings = selection.tooOld;
    }

    if (hasBand) {
      const min = rule.refMinCents ?? null;
      const max = rule.refMaxCents ?? null;
      if (innerFailure !== null) {
        if (pending === null) {
          pending = innerFailure;
          pendingWarnings = missingWarnings;
        }
        continue;
      }
      if (refValue === null) {
        if (pending === null) {
          pending = 'NO_REFERENCE';
          pendingWarnings = missingWarnings;
        }
        continue;
      }
      if ((min !== null && refValue < min) || (max !== null && refValue > max)) continue;
    } else {
      if (innerFailure !== null) return bad(innerFailure, missingWarnings);
      if (rule.basis === 'REFERENCE' && refValue === null) return bad('NO_REFERENCE', missingWarnings);
    }
    chosen = { rule, isDefault: view.isDefault, selection, inner };
    break;
  }
  if (chosen === null) return bad(pending ?? 'NO_RULE', pendingWarnings);

  const rule = chosen.rule;
  const basis = rule.basis as Basis;
  const trace: TraceLine[] = [];
  const warnings: SuggestionWarning[] = [];
  const addStep = (step: TraceStep, label: string, before: number | null, after: number | null) => {
    trace.push({ step, label, beforeCents: before, afterCents: after });
  };

  // 4. Base by basis.
  let value: number;
  let source: PriceSource;
  let candidate: ReferenceCandidate | null = null;
  let referenceCents: number | null = null;
  let referenceOrigin: string | null = null;
  let referenceLabel: string | null = null;
  let priceAsOf: string | null = null;
  let referenceNote: string | null = null;
  let referenceSampleCount: number | null = null;

  if (basis === 'REFERENCE') {
    const picked = chosen.selection ? chosen.selection.selected : null;
    if (picked === null) return bad('NO_REFERENCE');
    candidate = picked;
    source = picked.kind;
    value = picked.valueCents;
    referenceCents = picked.valueCents;
    referenceOrigin = picked.origin;
    referenceLabel = picked.label.trim() !== '' ? picked.label.trim() : SOURCE_LABELS[picked.kind];
    priceAsOf = picked.asOf ? picked.asOf.toISOString() : null;
    referenceNote = picked.note ?? null;
    referenceSampleCount = typeof picked.sampleCount === 'number' ? picked.sampleCount : null;
    warnings.push(...(chosen.selection ? chosen.selection.warnings : []));
    addStep('REFERENCE', referenceLabel, null, value);
  } else if (basis === 'RETAIL_PRICE') {
    const inner = chosen.inner;
    if (inner === null || !inner.s.ok || inner.s.priceCents === null || inner.s.priceSource === null) return bad('NO_REFERENCE');
    candidate = inner.candidate;
    source = inner.s.priceSource;
    value = inner.s.priceCents;
    referenceCents = inner.s.referenceCents;
    referenceOrigin = inner.s.referenceOrigin;
    referenceLabel = inner.s.referenceLabel;
    priceAsOf = inner.s.priceAsOf;
    referenceNote = inner.s.referenceNote ?? null;
    referenceSampleCount = inner.s.referenceSampleCount ?? null;
    warnings.push(...inner.s.warnings.filter((w) => w.code !== 'BELOW_CARD_MINIMUM'));
    addStep('RETAIL_PRICE', traceLabel('RETAIL_PRICE'), null, value);
  } else if (basis === 'BULK_RATE') {
    const tier = tierForRarityClass(card.rarityClass);
    const row = tier ? lookupRate(rates, { direction: 'SELL', game: card.game, tier, finish, unit: 'PER_CARD' }) : null;
    if (row === null || !Number.isSafeInteger(row.rateCents) || row.rateCents < 1) return bad('NO_RATE');
    source = 'RATE_CARD';
    value = row.rateCents;
    referenceOrigin = 'SHOP';
    referenceLabel = SOURCE_LABELS.RATE_CARD;
    addStep('RATE_CARD', traceLabel('RATE_CARD'), null, value);
  } else if (basis === 'FIXED_CENTS') {
    const fixed = rule.fixedCents ?? null;
    if (fixed === null || !Number.isSafeInteger(fixed) || fixed < 1) return bad('INVALID_INPUT');
    source = 'FIXED_RULE';
    value = fixed;
    referenceOrigin = 'SHOP';
    referenceLabel = SOURCE_LABELS.FIXED_RULE;
    addStep('FIXED', traceLabel('FIXED'), null, value);
  } else {
    const cost = card.costCents ?? null;
    if (cost === null || !Number.isSafeInteger(cost) || cost < 1) return bad('NO_COST');
    source = 'COST';
    value = cost;
    referenceOrigin = 'SHOP';
    referenceLabel = SOURCE_LABELS.COST;
    addStep('COST', traceLabel('COST'), null, value);
  }

  // 5. Percent.
  if (!Number.isSafeInteger(rule.percentBps) || rule.percentBps < 0) return bad('INVALID_INPUT');
  if (rule.percentBps !== 10000) {
    const before = value;
    value = mulBps(value, rule.percentBps);
    addStep('PERCENT', traceLabel('PERCENT', { bps: rule.percentBps }), before, value);
  }

  // 6 and 7. Condition and language: for a card priced from a reference or from cost. A bulk rate is for the card as
  // bought, a fixed price is fixed, and a shelf price already carries both.
  const adjustsForCard = basis === 'REFERENCE' || basis === 'COST_PLUS';
  if (adjustsForCard) {
    const condBps = conditionBps(book, condition);
    if (condBps !== 10000) {
      const before = value;
      value = mulBps(value, condBps);
      addStep('CONDITION', traceLabel('CONDITION', { bps: condBps, text: CONDITION_LABELS[condition] }), before, value);
    }
    const exactLanguage = candidate !== null && candidate.language !== undefined && candidate.language.trim().toLowerCase() === language;
    if (language !== 'en' && !exactLanguage && book.nonEnglishBps !== 10000) {
      const before = value;
      value = mulBps(value, book.nonEnglishBps);
      addStep('LANGUAGE', traceLabel('LANGUAGE', { bps: book.nonEnglishBps }), before, value);
    }
  }

  // 8. Add.
  const addCents = rule.addCents ?? 0;
  if (!Number.isSafeInteger(addCents)) return bad('INVALID_INPUT');
  if (addCents !== 0) {
    const before = value;
    value = Math.max(0, value + addCents);
    addStep('ADD', traceLabel('ADD', { cents: addCents }), before, value);
  }

  // 9 and 10. Cost floor and clamp. The rule's floor replaces the book default; the cost floor can only raise the bound.
  const cost = card.costCents ?? null;
  const costFloor =
    cost !== null && cost > 0 && rule.minMarginBps !== null && rule.minMarginBps !== undefined
      ? mulBps(cost, Math.max(0, 10000 + rule.minMarginBps))
      : null;
  const ruleFloor = rule.floorCents ?? book.defaultFloorCents ?? 0;
  const lower = Math.max(ruleFloor, costFloor ?? 0);
  const lowerIsCost = costFloor !== null && costFloor > ruleFloor;
  const ceilingRaw = rule.ceilingCents ?? book.defaultCeilingCents ?? null;
  const rangeConflict = ceilingRaw !== null && lower > ceilingRaw;
  const upper = ceilingRaw === null ? null : Math.max(ceilingRaw, lower);
  let hitFloor = false;
  let hitCeiling = false;
  if (value < lower) {
    const before = value;
    value = lower;
    hitFloor = true;
    addStep(lowerIsCost ? 'COST_FLOOR' : 'FLOOR_APPLIED', traceLabel(lowerIsCost ? 'COST_FLOOR' : 'FLOOR_APPLIED', { cents: lower }), before, value);
  } else if (upper !== null && value > upper) {
    const before = value;
    value = upper;
    hitCeiling = true;
    addStep('CEILING_APPLIED', traceLabel('CEILING_APPLIED', { cents: upper }), before, value);
  }

  // 11. Round, then clamp once more: if rounding crossed a bound the bound wins exactly.
  const modeRaw = rule.roundingMode ?? (family === 'BUYLIST' ? 'TIERED' : book.defaultRoundingMode);
  const mode: RoundingMode = isRoundingMode(modeRaw) ? modeRaw : 'TIERED';
  const directionRaw = rule.roundingDirection ?? (family === 'BUYLIST' ? 'DOWN' : book.defaultRoundingDirection);
  const direction: RoundingDirection = isRoundingDirection(directionRaw) ? directionRaw : family === 'BUYLIST' ? 'DOWN' : 'NEAREST';
  if (mode !== 'NONE') {
    const before = value;
    const rounded = roundCents(value, mode, direction);
    value = rounded.cents;
    addStep('ROUND', roundingLabel(mode, direction, rounded.stepCents), before, value);
  }
  {
    const before = value;
    if (value < lower) {
      value = lower;
      hitFloor = true;
    } else if (upper !== null && value > upper) {
      value = upper;
      hitCeiling = true;
    }
    if (value !== before) addStep('CLAMP_AFTER_ROUND', traceLabel('CLAMP_AFTER_ROUND'), before, value);
  }

  // 12. Result floor: never below one cent.
  if (value < 1) {
    const before = value;
    value = 1;
    addStep('RESULT_FLOOR', traceLabel('RESULT_FLOOR', { cents: 1 }), before, value);
  }

  // 13. Checks. None of them changes the number.
  if (rangeConflict) warnings.push({ code: 'RANGE_CONFLICT', message: COPY.rangeConflict });
  if (family === 'RETAIL' && value < config.minCardSaleCents) {
    warnings.push({ code: 'BELOW_CARD_MINIMUM', message: cardMinimumWarning(config.minCardSaleCents) });
  }
  const current = card.currentPriceCents ?? null;
  const threshold = book.movementReviewBps;
  const reasons: ReviewReason[] = [];
  if (current !== null && current > 0 && Math.abs(value - current) * 10000 > current * threshold) reasons.push('LARGE_MOVE');
  if (hitFloor) reasons.push('HIT_FLOOR');
  if (hitCeiling) reasons.push('HIT_CEILING');
  if (family === 'RETAIL' && cost !== null && cost > 0 && value < cost) reasons.push('BELOW_COST');
  const previous = card.previousReferenceCents ?? null;
  if (previous !== null && previous > 0 && referenceCents !== null && Math.abs(referenceCents - previous) * 10000 > previous * threshold) {
    reasons.push('REFERENCE_MOVED');
  }
  if (candidate !== null && candidate.kind === 'SHOP_SOLD_HISTORY' && typeof candidate.sampleCount === 'number' && candidate.sampleCount < LOW_SAMPLE_BELOW) {
    reasons.push('LOW_SAMPLE');
  }
  if (warnings.some((w) => w.code === 'REFERENCE_OLD')) reasons.push('REFERENCE_OLD');

  // 14. Lock. The number is still returned so the screen can show what the book would suggest.
  const lock = card.lock ?? null;
  const lockActive = lock !== null && (lock.until === null || lock.until.getTime() > config.now.getTime());

  // 15. Fill the result.
  const base: Omit<PriceSuggestion, 'why'> = {
    ok: true,
    family,
    priceCents: value,
    lineCents: value * quantity,
    priceSource: source,
    priceAsOf,
    referenceCents,
    referenceOrigin,
    referenceLabel,
    referenceNote,
    referenceSampleCount,
    rule: { id: chosen.isDefault ? null : rule.id, name: chosen.isDefault ? COPY.defaultRuleName : rule.name, bookVersion: book.version, isDefault: chosen.isDefault },
    unchanged: current !== null && Math.abs(value - current) <= 1,
    applyAllowed: !lockActive,
    lockedReason: lockActive && lock !== null ? lock.kind : null,
    review: { required: reasons.length > 0, reasons, movePercent: movePercentOf(value, current) },
    warnings,
    trace,
    roundingUsed: { mode, direction },
  };
  return { s: { ...base, why: explain(base) }, candidate };
}

/** Prices one card for one family (config.family). The only entry point other modules and services call. */
export function suggestPrice(input: EngineInput): PriceSuggestion {
  return compute(input).s;
}
