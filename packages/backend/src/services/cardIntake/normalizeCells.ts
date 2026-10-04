/**
 * Pure cell parsers for the card intake (ADR-134 sections 4.4, 4.7, 4.8). No I/O, no imports with
 * side effects. Nothing here guesses: an unrecognized value is reported as such so the caller can
 * send the row to review or reject it.
 */
import { CARD_GAMES, canonicalizeVocabValue } from '../../constants/cardVocabulary';
import { MAX_QUANTITY } from './config';

export type QuantityResult = { ok: true; value: number } | { ok: false };

/** A whole number from 1 to MAX_QUANTITY ("3" or "3.0"). Blank, zero, negative, fractional or huge is rejected. */
export function parseQuantityCell(raw: string): QuantityResult {
  const s = String(raw ?? '').trim();
  if (!/^\d+(\.0+)?$/.test(s)) return { ok: false };
  const n = parseInt(s, 10);
  if (!Number.isInteger(n) || n < 1 || n > MAX_QUANTITY) return { ok: false };
  return { ok: true, value: n };
}

// Strict money form, same rules as the legacy importer's parseImportMoney (itemCsvImport.ts, not imported
// here so intake stays free of that module's dependencies): optional $, optional US thousands commas, at
// most two decimals, optional trailing USD. Anything else is invalid, never "close enough".
const MONEY_RE = /^\$?\s?(?:(?:\d{1,3}(?:,\d{3})+|\d+)(?:\.\d{1,2})?|\.\d{1,2})(?:\s?usd)?$/i;
const MAX_MONEY = 10_000_000;

/** null = blank, NaN = invalid, otherwise the amount in dollars. */
export function parseMoneyCell(raw: string): number | null {
  const s = String(raw ?? '').trim();
  if (!s) return null;
  if (!MONEY_RE.test(s)) return NaN;
  const parsed = parseFloat(s.replace(/usd$/i, '').replace(/[$,\s]/g, ''));
  if (!Number.isFinite(parsed) || parsed < 0 || parsed > MAX_MONEY) return NaN;
  return Math.round(parsed * 100) / 100;
}

export type FinishCell =
  | { kind: 'absent' }
  | { kind: 'value'; finish: 'NONFOIL' | 'FOIL' | 'ETCHED' | 'HOLO' | 'REVERSE_HOLO' }
  | { kind: 'unrecognized'; text: string };

const FINISH_WORDS: Record<string, 'NONFOIL' | 'FOIL' | 'ETCHED' | 'HOLO' | 'REVERSE_HOLO'> = {
  normal: 'NONFOIL',
  nonfoil: 'NONFOIL',
  'non-foil': 'NONFOIL',
  'non foil': 'NONFOIL',
  regular: 'NONFOIL',
  no: 'NONFOIL',
  false: 'NONFOIL',
  n: 'NONFOIL',
  '0': 'NONFOIL',
  foil: 'FOIL',
  yes: 'FOIL',
  true: 'FOIL',
  y: 'FOIL',
  '1': 'FOIL',
  etched: 'ETCHED',
  'etched foil': 'ETCHED',
  holo: 'HOLO',
  holofoil: 'HOLO',
  holographic: 'HOLO',
  'holo foil': 'HOLO',
  'reverse holo': 'REVERSE_HOLO',
  'reverse holofoil': 'REVERSE_HOLO',
  'reverse holo foil': 'REVERSE_HOLO',
  reverse: 'REVERSE_HOLO',
};

/**
 * Finish cell. When blankMeansNonfoil is true (Moxfield: the Foil column is blank for non-foil cards) a blank
 * cell is non-foil; otherwise a blank or missing cell is "absent" (the finish is not known from the file).
 */
export function parseFinishCell(raw: string | undefined, blankMeansNonfoil: boolean): FinishCell {
  if (raw === undefined) return { kind: 'absent' };
  const s = raw.trim().toLowerCase().replace(/\s+/g, ' ');
  if (s === '') return blankMeansNonfoil ? { kind: 'value', finish: 'NONFOIL' } : { kind: 'absent' };
  const hit = FINISH_WORDS[s];
  if (hit) return { kind: 'value', finish: hit };
  return { kind: 'unrecognized', text: raw.trim().slice(0, 40) };
}

/** TCGplayer seller exports may append a foil marker to the condition ("Near Mint Foil"). */
export function splitFoilFromCondition(raw: string): { condition: string; foil: boolean } {
  const s = String(raw ?? '').trim();
  const m = /^(.*?)[\s-]*\bfoil$/i.exec(s);
  if (m && m[1].trim() !== '') return { condition: m[1].trim(), foil: true };
  return { condition: s, foil: false };
}

/** Catalog finish text (the stored values are already vocabulary codes: NONFOIL, FOIL, ETCHED, HOLO, REVERSE_HOLO) to the card vocabulary; unknown finishes are ignored. */
export function catalogFinishToVocab(finish: string): 'NONFOIL' | 'FOIL' | 'ETCHED' | 'HOLO' | 'REVERSE_HOLO' | null {
  const s = String(finish ?? '').trim().toLowerCase();
  if (s === 'nonfoil' || s === 'normal') return 'NONFOIL';
  if (s === 'foil') return 'FOIL';
  if (s === 'etched') return 'ETCHED';
  if (s === 'holo' || s === 'holofoil') return 'HOLO';
  if (s === 'reverse_holo' || s === 'reverseholo' || s === 'reverse holofoil' || s === 'reverseholofoil' || s === 'reverse holo') return 'REVERSE_HOLO';
  return null;
}

const LANGUAGE_WORDS: Record<string, string> = {
  english: 'en',
  spanish: 'es',
  french: 'fr',
  german: 'de',
  italian: 'it',
  portuguese: 'pt',
  japanese: 'ja',
  korean: 'ko',
  russian: 'ru',
  'chinese simplified': 'zhs',
  'simplified chinese': 'zhs',
  'chinese traditional': 'zht',
  'traditional chinese': 'zht',
  zh_cn: 'zhs',
  'zh-cn': 'zhs',
  zh_tw: 'zht',
  'zh-tw': 'zht',
  jp: 'ja',
};

export type LanguageCell = { kind: 'absent' } | { kind: 'value'; code: string } | { kind: 'unknown' };

export function parseLanguageCell(raw: string | undefined): LanguageCell {
  if (raw === undefined) return { kind: 'absent' };
  const s = raw.trim().toLowerCase().replace(/\s+/g, ' ');
  if (s === '') return { kind: 'absent' };
  if (['en', 'es', 'fr', 'de', 'it', 'pt', 'ja', 'ko', 'ru', 'zhs', 'zht'].includes(s)) return { kind: 'value', code: s };
  const hit = LANGUAGE_WORDS[s];
  if (hit) return { kind: 'value', code: hit };
  return { kind: 'unknown' };
}

const GAME_WORDS: Record<string, string> = {
  magic: 'MTG',
  mtg: 'MTG',
  'magic the gathering': 'MTG',
  'magic: the gathering': 'MTG',
  pokemon: 'POKEMON',
  'pokémon': 'POKEMON',
  'pokemon tcg': 'POKEMON',
  yugioh: 'YUGIOH',
  'yu-gi-oh': 'YUGIOH',
  'yu-gi-oh!': 'YUGIOH',
  'yu gi oh': 'YUGIOH',
  lorcana: 'LORCANA',
  'disney lorcana': 'LORCANA',
  'one piece': 'ONE_PIECE',
  'one piece card game': 'ONE_PIECE',
};

/** Game name or code to the vocabulary; any other non-blank text is OTHER. Blank is undefined. */
export function parseGameCell(raw: string | undefined): string | undefined {
  if (raw === undefined) return undefined;
  const s = raw.trim().toLowerCase().replace(/\s+/g, ' ');
  if (s === '') return undefined;
  const code = canonicalizeVocabValue(CARD_GAMES, s);
  if (code) return code;
  return GAME_WORDS[s] ?? 'OTHER';
}
