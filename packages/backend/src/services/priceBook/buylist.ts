/**
 * Buylist rules, the second rule family (ADR-140 section 7). Pure.
 *
 * The same engine prices both families; this module adds what is specific to buying: the store credit offer, the minimum
 * offer, and the starter templates. Nothing here writes an item, a price or stock, and no intake calls it in v1 (the Price
 * Book page has a buy calculator that uses quoteBuylist).
 *
 * Cash offer = the engine result for family BUYLIST (percent, condition, language, add, clamp, round; default rounding is
 * TIERED rounded DOWN so the shop never pays more than its own percent). There is no synthetic default rule for buying: no
 * matching rule gives NO_RULE and no offer.
 */
import { explain } from './explain';
import { COPY, traceLabel } from './messages';
import { mulBps, roundCents } from './rounding';
import { suggestPrice } from './engine';
import type { EngineConfig, EngineInput, NewPriceRule, PriceSuggestion } from './types';
import { isRoundingDirection, isRoundingMode } from './vocabulary';

export type BuylistInput = Omit<EngineInput, 'config'> & { config: Omit<EngineConfig, 'family'> };

/**
 * Quotes one card for buying. Credit = round_half_up(cash x creditBps / 10000) where creditBps is the matching rule's value or
 * the book's buyCreditBps, rounded with the same mode and direction as the cash offer, and never below the cash offer.
 * minOfferCents: a cash offer below it gives BELOW_MIN_OFFER and no number.
 */
export function quoteBuylist(input: BuylistInput): PriceSuggestion {
  const cash = suggestPrice({ ...input, config: { ...input.config, family: 'BUYLIST' } });
  if (!cash.ok || cash.priceCents === null) return cash;

  const matched = cash.rule && cash.rule.id !== null ? input.rules.find((r) => r.id === cash.rule?.id) : undefined;
  const quantity = input.card.quantity === undefined ? 1 : input.card.quantity;

  const minOffer = matched?.minOfferCents ?? null;
  if (minOffer !== null && cash.priceCents < minOffer) {
    const refused: Omit<PriceSuggestion, 'why'> = {
      ...cash,
      ok: false,
      code: 'BELOW_MIN_OFFER',
      priceCents: null,
      creditCents: null,
      lineCents: null,
      creditLineCents: null,
      unchanged: false,
      applyAllowed: false,
    };
    return { ...refused, why: explain(refused) };
  }

  const creditBps = matched?.creditBps ?? input.book.buyCreditBps;
  const modeRaw = cash.roundingUsed?.mode ?? 'TIERED';
  const directionRaw = cash.roundingUsed?.direction ?? 'DOWN';
  const mode = isRoundingMode(modeRaw) ? modeRaw : 'TIERED';
  const direction = isRoundingDirection(directionRaw) ? directionRaw : 'DOWN';
  const rawCredit = mulBps(cash.priceCents, creditBps);
  const credit = Math.max(cash.priceCents, roundCents(rawCredit, mode, direction).cents);

  const withCredit: Omit<PriceSuggestion, 'why'> = {
    ...cash,
    creditCents: credit,
    creditLineCents: credit * quantity,
    trace: [
      ...cash.trace,
      { step: 'CREDIT', label: traceLabel('CREDIT', { bps: creditBps }), beforeCents: cash.priceCents, afterCents: credit },
    ],
  };
  return { ...withCredit, why: explain(withCredit) };
}

/**
 * The starting point for BUYLIST (section 7.7), applied only when the family has no rules and labelled "Starting point, set
 * your own." These numbers are product defaults, not sourced facts, and carry no vendor name: up to $1.49 at 40 percent,
 * $1.50 to $24.99 at 50 percent, $25.00 and up at 60 percent, credit 120 percent.
 */
export function starterBuylistRules(): NewPriceRule[] {
  const common = {
    family: 'BUYLIST',
    enabled: true,
    productType: 'SINGLE',
    basis: 'REFERENCE',
    addCents: 0,
    creditBps: 12000,
  } as const;
  return [
    { ...common, name: COPY.starterBuyUnder, priority: 10, percentBps: 4000, refMinCents: null, refMaxCents: 149 },
    { ...common, name: COPY.starterBuyMiddle, priority: 20, percentBps: 5000, refMinCents: 150, refMaxCents: 2499 },
    { ...common, name: COPY.starterBuyTop, priority: 30, percentBps: 6000, refMinCents: 2500, refMaxCents: null },
  ];
}

/** The retail starting point: one rule "All cards" at 100 percent, so the shop sees the structure. */
export function starterRetailRules(): NewPriceRule[] {
  return [
    {
      family: 'RETAIL',
      name: COPY.starterSellAll,
      priority: 10,
      enabled: true,
      productType: 'SINGLE',
      basis: 'REFERENCE',
      percentBps: 10000,
      addCents: 0,
    },
  ];
}
