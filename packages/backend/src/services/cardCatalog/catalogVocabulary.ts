/**
 * Vocabulary served by GET /api/cards/vocabulary (ADR-134 sections 2.2 and 3.4).
 *
 * NOTE (batch B3): the ADR says this endpoint reads constants/cardVocabulary.ts, which batch B2
 * creates in parallel. B3 may not touch B2's files and cannot import a module whose export names
 * it cannot see, so the lists are declared here from the ADR section 2.2 field table. When both
 * batches are merged, a follow-up should make constants/cardVocabulary.ts the single source and
 * have this file re-export from it. Values below must stay identical to that table.
 */

export interface VocabularyEntry {
  code: string;
  label: string;
}

export interface GameEntry extends VocabularyEntry {
  /** True when the free catalog can autofill this game (MTG now; Pokemon and Yu-Gi-Oh behind CARD_CATALOG_GAMES). */
  catalogBacked: boolean;
}

export const CARD_GAMES: GameEntry[] = [
  { code: 'MTG', label: 'Magic: The Gathering', catalogBacked: true },
  { code: 'POKEMON', label: 'Pokemon', catalogBacked: true },
  { code: 'YUGIOH', label: 'Yu-Gi-Oh!', catalogBacked: true },
  { code: 'LORCANA', label: 'Disney Lorcana', catalogBacked: false },
  { code: 'ONE_PIECE', label: 'One Piece Card Game', catalogBacked: false },
  { code: 'OTHER', label: 'Other', catalogBacked: false },
];

export const CARD_PRODUCT_TYPES: VocabularyEntry[] = [
  { code: 'SINGLE', label: 'Single card' },
  { code: 'SEALED', label: 'Sealed product' },
  { code: 'ACCESSORY', label: 'Accessory' },
];

export const CARD_FINISHES: VocabularyEntry[] = [
  { code: 'NONFOIL', label: 'Non-foil' },
  { code: 'FOIL', label: 'Foil' },
  { code: 'ETCHED', label: 'Etched foil' },
  { code: 'HOLO', label: 'Holofoil' },
  { code: 'REVERSE_HOLO', label: 'Reverse holofoil' },
];

export const CARD_CONDITION_CODES: VocabularyEntry[] = [
  { code: 'NM', label: 'Near Mint' },
  { code: 'LP', label: 'Lightly Played' },
  { code: 'MP', label: 'Moderately Played' },
  { code: 'HP', label: 'Heavily Played' },
  { code: 'DMG', label: 'Damaged' },
];

export const CARD_GRADERS: string[] = ['PSA', 'BGS', 'BVG', 'BCCG', 'CGC', 'SGC', 'TAG', 'CSG', 'HGA', 'ISA', 'OTHER'];

export const CARD_GRADES: string[] = [
  '10', '9.5', '9', '8.5', '8', '7.5', '7', '6.5', '6', '5.5', '5', '4.5', '4', '3.5', '3', '2.5', '2', '1.5', '1',
  'Authentic', 'Authentic Altered', 'Authentic - Trimmed', 'Authentic - Coloured',
];

export const CARD_LANGUAGES: VocabularyEntry[] = [
  { code: 'en', label: 'English' },
  { code: 'es', label: 'Spanish' },
  { code: 'fr', label: 'French' },
  { code: 'de', label: 'German' },
  { code: 'it', label: 'Italian' },
  { code: 'pt', label: 'Portuguese' },
  { code: 'ja', label: 'Japanese' },
  { code: 'ko', label: 'Korean' },
  { code: 'ru', label: 'Russian' },
  { code: 'zhs', label: 'Chinese (Simplified)' },
  { code: 'zht', label: 'Chinese (Traditional)' },
];

export function getCatalogVocabulary() {
  return {
    games: CARD_GAMES,
    productTypes: CARD_PRODUCT_TYPES,
    finishes: CARD_FINISHES,
    conditionCodes: CARD_CONDITION_CODES,
    graders: CARD_GRADERS,
    grades: CARD_GRADES,
    languages: CARD_LANGUAGES,
  };
}
