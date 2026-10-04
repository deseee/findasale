/**
 * Card (CCG) vocabulary, ADR-134 section 2.2. Single source of truth for every enumerated card
 * field. The frontend never hardcodes these lists; it reads them from the backend
 * (GET /api/cards/vocabulary, built from CARD_VOCABULARY below).
 *
 * Pure constants and helpers only: no env reads, no network, no imports. Safe to import anywhere.
 * (The backend cannot import packages/shared, so this lives here.)
 */

export const CARD_GAMES = ['MTG', 'POKEMON', 'YUGIOH', 'LORCANA', 'ONE_PIECE', 'OTHER'] as const;
export const CARD_PRODUCT_TYPES = ['SINGLE', 'SEALED', 'ACCESSORY'] as const; // v1 writes SINGLE only
// Scryfall language codes.
export const CARD_LANGUAGES = ['en', 'es', 'fr', 'de', 'it', 'pt', 'ja', 'ko', 'ru', 'zhs', 'zht'] as const;
export const CARD_FINISHES = ['NONFOIL', 'FOIL', 'ETCHED', 'HOLO', 'REVERSE_HOLO'] as const;
export const CARD_CONDITION_CODES = ['NM', 'LP', 'MP', 'HP', 'DMG'] as const; // null when the card is graded
// Subset of eBay's grader list (ADR-134 section 5.3). CSG is listed in ADR section 2.2 although
// section 5.3 notes eBay accepts it for sports categories only; the eBay branch (batch B5) must
// treat a grader it cannot map as unresolved rather than publishing it as ungraded.
export const CARD_GRADERS = ['PSA', 'BGS', 'BVG', 'BCCG', 'CGC', 'SGC', 'TAG', 'CSG', 'HGA', 'ISA', 'OTHER'] as const;
// eBay grade list (ADR-134 section 5.3), stored as the display string.
export const CARD_GRADES = [
  '10', '9.5', '9', '8.5', '8', '7.5', '7', '6.5', '6', '5.5', '5', '4.5', '4', '3.5', '3', '2.5', '2', '1.5', '1',
  'Authentic', 'Authentic Altered', 'Authentic - Trimmed', 'Authentic - Coloured',
] as const;

export type CardGame = (typeof CARD_GAMES)[number];
export type CardProductType = (typeof CARD_PRODUCT_TYPES)[number];
export type CardLanguage = (typeof CARD_LANGUAGES)[number];
export type CardFinish = (typeof CARD_FINISHES)[number];
export type CardConditionCode = (typeof CARD_CONDITION_CODES)[number];
export type CardGrader = (typeof CARD_GRADERS)[number];
export type CardGrade = (typeof CARD_GRADES)[number];

export const CARD_GAME_LABELS: Record<CardGame, string> = {
  MTG: 'Magic: The Gathering',
  POKEMON: 'Pokemon',
  YUGIOH: 'Yu-Gi-Oh!',
  LORCANA: 'Disney Lorcana',
  ONE_PIECE: 'One Piece Card Game',
  OTHER: 'Other',
};

export const CARD_CONDITION_LABELS: Record<CardConditionCode, string> = {
  NM: 'Near Mint',
  LP: 'Lightly Played',
  MP: 'Moderately Played',
  HP: 'Heavily Played',
  DMG: 'Damaged',
};

export const CARD_FINISH_LABELS: Record<CardFinish, string> = {
  NONFOIL: 'Non-foil',
  FOIL: 'Foil',
  ETCHED: 'Etched foil',
  HOLO: 'Holo',
  REVERSE_HOLO: 'Reverse holo',
};

/** Shape returned to the frontend by the vocabulary endpoint. */
export const CARD_VOCABULARY = {
  games: CARD_GAMES,
  productTypes: CARD_PRODUCT_TYPES,
  languages: CARD_LANGUAGES,
  finishes: CARD_FINISHES,
  conditionCodes: CARD_CONDITION_CODES,
  graders: CARD_GRADERS,
  grades: CARD_GRADES,
  labels: {
    games: CARD_GAME_LABELS,
    conditionCodes: CARD_CONDITION_LABELS,
    finishes: CARD_FINISH_LABELS,
  },
} as const;

/**
 * Case-insensitive lookup that returns the canonical list entry, or undefined when the value is
 * not in the list. Used to normalize seller and import input ("psa" -> "PSA", "nm" -> "NM").
 */
export function canonicalizeVocabValue<T extends string>(list: readonly T[], value: unknown): T | undefined {
  if (typeof value !== 'string') return undefined;
  const needle = value.trim().toLowerCase();
  if (needle === '') return undefined;
  return list.find((entry) => entry.toLowerCase() === needle);
}
