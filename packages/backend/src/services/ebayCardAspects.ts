/**
 * ADR-134 #643 (batch B5): eBay item-specific (aspect) auto-fill for trading cards.
 *
 * Pure functions only: no env reads, no network, no database. The caller passes in the live aspect
 * spec (getRequiredAspectsForCategory, which is cached) and the card record.
 *
 * RULES
 *  1. Matching is by aspect NAME, case-insensitive, against the LIVE spec. A card value is only
 *     emitted for an aspect that exists in the spec, and the emitted key uses the spec's own casing
 *     (so fillRequiredAspects, which checks `result[aspect.name]` exactly, sees it as already set).
 *  2. A SELECTION_ONLY aspect receives a value only if it equals (accent, case and punctuation
 *     insensitive) one of the aspect's enumValues; otherwise the aspect is left out so the existing
 *     flow decides, instead of the enumValues[0] last resort fillRequiredAspects can take.
 *  3. Organizer tag aspects win on conflict (mergeCardAspects, case-insensitive key check).
 *  4. Nothing is guessed from other fields: a null card field produces no aspect.
 *
 * UNVERIFIED (ADR-134 section 5.6 and 14, step V2): the live aspect names for categories 183454,
 * 183050 and 261328 and their allowed values. The names below are the candidate names the ADR lists
 * (Game, Set, Card Name, Card Number, Finish, Language, Manufacturer) plus the graded family
 * (Graded, Professional Grader, Grade, Certification Number). Because of rule 1, a wrong or
 * retired candidate name is simply never emitted. Attach the V2 output before relying on any of them.
 * The per-value candidate lists (game display names, publishers, finish words) are likewise
 * UNVERIFIED against eBay's enum and are only emitted when the live spec accepts them.
 *
 * `Manufacturer` is supplied here explicitly because fillRequiredAspects special-cases
 * Manufacturer, Model and MPN to item.mpn, which is always null for cards.
 */

import type { RequiredAspect } from './ebayPublishService';
import type { EbayCardInput } from '../config/cardEbayCategories';

/** eBay's maximum item-specific value length. */
const MAX_ASPECT_VALUE_LENGTH = 65;

/** Candidate aspect names per logical field (matched against the live spec, case-insensitive). */
export const CARD_ASPECT_NAMES = {
  game: ['Game'],
  set: ['Set'],
  cardName: ['Card Name'],
  cardNumber: ['Card Number'],
  finish: ['Finish'],
  language: ['Language'],
  manufacturer: ['Manufacturer'],
  graded: ['Graded'],
  grader: ['Professional Grader'],
  grade: ['Grade'],
  certNumber: ['Certification Number'],
} as const;

/** Game code to the value candidates for the Game aspect (first is used for free text). UNVERIFIED. */
const GAME_VALUES: Readonly<Record<string, readonly string[]>> = {
  MTG: ['Magic: The Gathering', 'Magic The Gathering'],
  POKEMON: ['Pokémon TCG', 'Pokemon TCG', 'Pokémon', 'Pokemon'],
  YUGIOH: ['Yu-Gi-Oh! TCG', 'Yu-Gi-Oh!', 'Yu-Gi-Oh', 'YuGiOh'],
  LORCANA: ['Disney Lorcana', 'Lorcana'],
  ONE_PIECE: ['One Piece Card Game', 'One Piece'],
};

/** Game code to publisher candidates for the Manufacturer aspect (first is used for free text). UNVERIFIED. */
const MANUFACTURER_VALUES: Readonly<Record<string, readonly string[]>> = {
  MTG: ['Wizards of the Coast'],
  POKEMON: ['Nintendo', 'The Pokémon Company', 'The Pokemon Company', 'Pokémon Company International'],
  YUGIOH: ['Konami'],
  LORCANA: ['Ravensburger'],
  ONE_PIECE: ['Bandai'],
};

/** ItemCard.finish code to value candidates for the Finish aspect. UNVERIFIED. */
const FINISH_VALUES: Readonly<Record<string, readonly string[]>> = {
  NONFOIL: ['Non-Foil', 'Nonfoil', 'Regular', 'Normal'],
  FOIL: ['Foil'],
  ETCHED: ['Etched Foil', 'Etched'],
  HOLO: ['Holo', 'Holofoil', 'Holographic'],
  REVERSE_HOLO: ['Reverse Holo', 'Reverse Holofoil'],
};

/** Scryfall-style language code to value candidates for the Language aspect. */
const LANGUAGE_VALUES: Readonly<Record<string, readonly string[]>> = {
  en: ['English'],
  es: ['Spanish'],
  fr: ['French'],
  de: ['German'],
  it: ['Italian'],
  pt: ['Portuguese'],
  ja: ['Japanese'],
  ko: ['Korean'],
  ru: ['Russian'],
  zhs: ['Chinese Simplified', 'Simplified Chinese', 'Chinese'],
  zht: ['Chinese Traditional', 'Traditional Chinese', 'Chinese'],
};

/** Grader code to value candidates when a Professional Grader aspect exists. UNVERIFIED. */
const GRADER_VALUES: Readonly<Record<string, readonly string[]>> = {
  PSA: ['Professional Sports Authenticator (PSA)', 'PSA'],
  BCCG: ['Beckett Collectors Club Grading (BCCG)', 'BCCG'],
  BVG: ['Beckett Vintage Grading (BVG)', 'BVG'],
  BGS: ['Beckett Grading Services (BGS)', 'Beckett', 'BGS'],
  CSG: ['Certified Sports Guaranty (CSG)', 'CSG'],
  CGC: ['Certified Guaranty Company (CGC)', 'CGC'],
  SGC: ['Sportscard Guaranty Corporation (SGC)', 'SGC'],
  HGA: ['Hybrid Grading Approach (HGA)', 'HGA'],
  ISA: ['International Sports Authentication (ISA)', 'ISA'],
  TAG: ['Technical Authentication & Grading (TAG)', 'TAG'],
  OTHER: ['Other'],
};

/** Lowercase, strip accents and punctuation, collapse whitespace, for enum comparison only. */
function norm(s: string): string {
  return s
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

function findAspect(spec: readonly RequiredAspect[], names: readonly string[]): RequiredAspect | undefined {
  const wanted = names.map((n) => n.trim().toLowerCase());
  return spec.find((a) => wanted.includes(a.name.trim().toLowerCase()));
}

/**
 * Pick the value to send for one aspect from ordered candidates.
 * Returns the enum's own spelling when a candidate matches the enum; otherwise the first candidate
 * for a free-text aspect; otherwise null (SELECTION_ONLY with no enum match emits nothing).
 */
export function chooseAspectValue(aspect: RequiredAspect, candidates: readonly string[]): string | null {
  const cands = candidates.map((c) => c.trim()).filter((c) => c.length > 0);
  if (cands.length === 0) return null;
  for (const c of cands) {
    const hit = aspect.enumValues.find((v) => norm(v) === norm(c));
    if (hit) return hit.slice(0, MAX_ASPECT_VALUE_LENGTH);
  }
  if (aspect.mode === 'SELECTION_ONLY') return null;
  return cands[0].slice(0, MAX_ASPECT_VALUE_LENGTH);
}

function candidatesFor(table: Readonly<Record<string, readonly string[]>>, key: string | null | undefined): readonly string[] {
  if (!key) return [];
  const k = String(key).trim();
  return table[k] ?? table[k.toUpperCase()] ?? table[k.toLowerCase()] ?? [];
}

/**
 * Build the card-derived aspects for one card against the live aspect spec.
 * Returns an empty object when there is no card, no spec, or nothing matches. Never throws.
 */
export function buildCardAspects(
  card: EbayCardInput | null | undefined,
  spec: readonly RequiredAspect[] | null | undefined
): Record<string, string[]> {
  const out: Record<string, string[]> = {};
  if (!card || !spec || spec.length === 0) return out;
  const liveSpec: readonly RequiredAspect[] = spec;

  const put = (names: readonly string[], candidates: readonly string[]): void => {
    if (candidates.length === 0) return;
    const aspect = findAspect(liveSpec, names);
    if (!aspect) return;
    const value = chooseAspectValue(aspect, candidates);
    if (value) out[aspect.name] = [value];
  };
  const text = (v: string | null | undefined): string[] => {
    const t = (v ?? '').trim();
    return t ? [t] : [];
  };

  put(CARD_ASPECT_NAMES.game, candidatesFor(GAME_VALUES, card.game));
  put(CARD_ASPECT_NAMES.set, text(card.setName));
  put(CARD_ASPECT_NAMES.cardName, text(card.cardName));
  put(CARD_ASPECT_NAMES.cardNumber, text(card.collectorNumber));
  put(CARD_ASPECT_NAMES.finish, candidatesFor(FINISH_VALUES, card.finish));
  put(
    CARD_ASPECT_NAMES.language,
    LANGUAGE_VALUES[String(card.language ?? '').trim().toLowerCase()] ?? text(card.language)
  );
  put(CARD_ASPECT_NAMES.manufacturer, candidatesFor(MANUFACTURER_VALUES, card.game));

  // Graded family. Only emitted when the live spec still carries these aspects (eBay moved grading
  // to condition descriptors, so they may be absent). A graded card never receives "No".
  const isGraded = !!((card.grader ?? '').trim() || (card.grade ?? '').trim());
  put(CARD_ASPECT_NAMES.graded, [isGraded ? 'Yes' : 'No']);
  if (isGraded) {
    put(CARD_ASPECT_NAMES.grader, candidatesFor(GRADER_VALUES, card.grader));
    put(CARD_ASPECT_NAMES.grade, text(card.grade));
    put(CARD_ASPECT_NAMES.certNumber, text(card.certNumber));
  }
  return out;
}

/**
 * Merge organizer tag aspects with card-derived aspects. Organizer values win on conflict, matched
 * case-insensitively on the aspect name. Returns undefined when both are empty (same convention as
 * buildAspects in ebayController).
 */
export function mergeCardAspects(
  organizerAspects: Record<string, string[]> | undefined,
  cardAspects: Record<string, string[]>
): Record<string, string[]> | undefined {
  const merged: Record<string, string[]> = { ...(organizerAspects || {}) };
  const have = new Set(Object.keys(merged).map((k) => k.trim().toLowerCase()));
  for (const [name, values] of Object.entries(cardAspects)) {
    if (have.has(name.trim().toLowerCase())) continue; // organizer wins
    merged[name] = values;
    have.add(name.trim().toLowerCase());
  }
  return Object.keys(merged).length > 0 ? merged : undefined;
}
