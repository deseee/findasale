/*
 * etsyEligibility.ts -- organizer-facing wrapper around the shared eligibility registry's ETSY rule
 * (ADR-135 D4.3, batch E-B2). Pure: no I/O, no env reads. The only clock read happens inside
 * checkEligibility (marketplaceEligibilityRules.ts) unless the caller injects `asOfYear`.
 *
 * The registry keeps its single static reason string; this wrapper picks one of three exact,
 * organizer-facing messages so the organizer learns what to fix:
 *   1. no era given        -> ETSY_MSG_NO_ERA
 *   2. era too recent      -> etsyMsgEraTooRecent(label)
 *   3. card year too recent -> etsyMsgCardYearTooRecent(year)
 *
 * There is NO override (ADR-135 D4.4): no flag, no env bypass. Draft and publish endpoints must
 * re-run this check server-side every time.
 *
 * Copy rules: no "AI", no "estate sale", no em dashes (covered by etsyEligibility.test.ts).
 */

import { checkEligibility, EligibilityResult } from '../marketplaceEligibilityRules';
import { getEtsyWhenMade } from '../../config/etsyWhenMade';

/** Message 1: nothing was said about when the item was made (and it is not a craft supply). */
export const ETSY_MSG_NO_ERA =
  'To list this item on Etsy, tell us when it was made. Etsy only accepts items that are 20 or more years old, items you made or designed, or craft and party supplies.';

const ETSY_MSG_ERA_TOO_RECENT_TEMPLATE =
  'This item is marked as made in {era}. Etsy only accepts items that are 20 or more years old, items you made or designed, or craft and party supplies, so it cannot be listed on Etsy.';

const ETSY_MSG_CARD_YEAR_TOO_RECENT_TEMPLATE =
  'This card was released in {year}. Etsy only accepts items that are 20 or more years old, so it cannot be listed on Etsy.';

/** Message 2: the attested era is a known Etsy era that is too recent. `eraLabel` is the era's label. */
export function etsyMsgEraTooRecent(eraLabel: string): string {
  return ETSY_MSG_ERA_TOO_RECENT_TEMPLATE.replace('{era}', eraLabel);
}

/** Message 3: the card record's release year is too recent. */
export function etsyMsgCardYearTooRecent(year: number): string {
  return ETSY_MSG_CARD_YEAR_TOO_RECENT_TEMPLATE.replace('{year}', String(year));
}

export type EtsyEligibilityCode = 'OK' | 'NO_ERA' | 'ERA_TOO_RECENT' | 'CARD_YEAR_TOO_RECENT';

export interface EtsyEligibilityResult extends EligibilityResult {
  /** Machine-readable outcome so callers (routes, UI) can branch without parsing the message. */
  code: EtsyEligibilityCode;
}

/** The only item facts the Etsy rule reads. Pass either `releaseYear` or the loaded `card` relation. */
export interface EtsyEligibilityItemInput {
  /** Card release year, e.g. from Item.card.releaseYear (ADR-134). Wins over `card` if both are set. */
  releaseYear?: number | null;
  /** The `Item.card` relation (ItemCard) when loaded; only releaseYear is read. */
  card?: { releaseYear?: number | null } | null;
}

/** What the organizer attested in the draft review modal. */
export interface EtsyAttestationInput {
  /** Etsy `when_made` enum string. */
  whenMade?: string | null;
  /** "This is a craft or party supply" checkbox. */
  isSupply?: boolean | null;
  /** Test injection for the year age is measured against. Omit in production. */
  asOfYear?: number;
}

function resolveReleaseYear(item: EtsyEligibilityItemInput): number | null {
  const direct = item.releaseYear;
  if (typeof direct === 'number' && isFinite(direct)) return direct;
  const fromCard = item.card?.releaseYear;
  if (typeof fromCard === 'number' && isFinite(fromCard)) return fromCard;
  return null;
}

/**
 * Checks whether an item may be listed on Etsy, returning one of the three exact organizer-facing
 * messages from ADR-135 D4.3 when it may not. Deliberately does NOT pass category or title to the
 * registry, so no eBay-category text can leak into the decision.
 */
export function checkEtsyEligibility(
  item: EtsyEligibilityItemInput,
  attestation: EtsyAttestationInput = {}
): EtsyEligibilityResult {
  const releaseYear = resolveReleaseYear(item);
  const result = checkEligibility('ETSY', {
    category: null,
    ebayCategoryId: null,
    releaseYear,
    etsyWhenMade: attestation.whenMade ?? null,
    etsyIsCraftSupply: attestation.isSupply ?? null,
    asOfYear: attestation.asOfYear,
  });

  if (result.eligible) return { eligible: true, reason: null, code: 'OK' };

  // The registry's releaseYear branch decides alone, so a numeric releaseYear that failed is
  // always the card-year message, even if the organizer also ticked craft supply.
  if (releaseYear !== null) {
    return { eligible: false, reason: etsyMsgCardYearTooRecent(releaseYear), code: 'CARD_YEAR_TOO_RECENT' };
  }

  const era = getEtsyWhenMade(attestation.whenMade);
  if (era) {
    return { eligible: false, reason: etsyMsgEraTooRecent(era.label), code: 'ERA_TOO_RECENT' };
  }

  // No era, or a value that is not a real Etsy era: treated as no data.
  return { eligible: false, reason: ETSY_MSG_NO_ERA, code: 'NO_ERA' };
}
