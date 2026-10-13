/**
 * Reference keys and Pokemon variant tokens (ADR-140 sections 6.2 and 9.1). Pure.
 *
 * A reference key is the card identity a typed price attaches to: 'p:<printingId>' when a catalog printing is known,
 * otherwise 's:<setCode>|<numerator>|<normalized name>|<variants>'. Finish and language are NOT part of the key (they are
 * separate columns), and condition never is (references are Near Mint equivalents). The printing part is the same text
 * that computeDedupKey (cardRecordService.ts) uses, so both agree on what "the same card" means.
 */
import { normalizeCardName } from '../cardCatalog/normalize';
import type { VariantToken } from './vocabulary';

export const MAX_REFERENCE_KEY_LENGTH = 200;

/**
 * "138/195" gives "138"; leading zeros are dropped from a numerator that continues with a digit ("007" gives "7").
 * Same output as collectorNumerator in cardRecordService.ts; a test pins the two together.
 */
export function collectorNumeratorOf(collectorNumber: string | null | undefined): string {
  const numerator = (collectorNumber ?? '').split('/')[0]?.trim().toLowerCase() ?? '';
  return numerator.replace(/^0+(?=\d)/, '');
}

export interface ReferenceKeyInput {
  catalogPrintingId?: string | null;
  game?: string | null;
  setCode?: string | null;
  collectorNumber?: string | null;
  cardName?: string | null;
  /** One token or several (several are sorted and joined with a plus sign). */
  variantToken?: string | readonly string[] | null;
}

function variantSuffix(variant: string | readonly string[] | null | undefined): string {
  if (variant === null || variant === undefined) return '';
  const list = typeof variant === 'string' ? [variant] : Array.from(variant);
  const cleaned = list
    .map((v) => v.trim().toLowerCase())
    .filter((v) => v !== '' && v !== 'none');
  return Array.from(new Set(cleaned)).sort().join('+');
}

export function referenceKey(input: ReferenceKeyInput): string {
  if (input.catalogPrintingId) return `p:${input.catalogPrintingId}`;
  const head = `s:${(input.setCode ?? '').toLowerCase()}|${collectorNumeratorOf(input.collectorNumber)}|`;
  const tail = `|${variantSuffix(input.variantToken)}`;
  const room = Math.max(0, MAX_REFERENCE_KEY_LENGTH - head.length - tail.length);
  return `${head}${normalizeCardName(input.cardName).slice(0, room)}${tail}`;
}

/** The text a provider uses as the map key for one card at one finish and language. */
export function lookupKey(cardKeyValue: string, finish: string, language: string): string {
  return `${cardKeyValue}|${finish}|${language}`;
}

// ---------------------------------------------------------------------------------------------
// Variant tokens (Pokemon variants from the TCGdex printing rows)
// ---------------------------------------------------------------------------------------------

export interface VariantParse {
  tokens: VariantToken[];
  /** Raw tokens that mapped to STAMPED, kept for the trace ('w-promo'). */
  stampedRaw: string[];
}

function normalizeToken(raw: string): string {
  return raw.trim().toLowerCase().replace(/\s+/g, '-');
}

function mapRawTokens(rawList: readonly string[]): VariantParse {
  const tokens: VariantToken[] = [];
  const stampedRaw: string[] = [];
  for (const entry of rawList) {
    const t = normalizeToken(entry);
    if (t === '') continue;
    let token: VariantToken;
    if (t === '1st-edition') token = 'FIRST_EDITION';
    else if (t === 'shadowless') token = 'SHADOWLESS';
    else if (t === 'unlimited') token = 'UNLIMITED';
    else {
      token = 'STAMPED';
      if (!stampedRaw.includes(t)) stampedRaw.push(t);
    }
    if (!tokens.includes(token)) tokens.push(token);
  }
  return { tokens, stampedRaw };
}

/** The trailing parenthetical of a set name split on commas: "Base Set (Shadowless, 1st Edition)" gives two parts. */
function parentheticalParts(setName: string | null | undefined): string[] | null {
  const m = /\(([^()]*)\)\s*$/.exec(setName ?? '');
  if (!m) return null;
  const parts = (m[1] ?? '').split(',').map((p) => p.trim()).filter((p) => p !== '');
  return parts.length > 0 ? parts : null;
}

/** True when buildTcgdexPrintingId shortened the id with a hash ("...~<10 hex>"). */
function isShortenedId(id: string): boolean {
  return /~[0-9a-f]{10}$/.test(id);
}

/** The variant part of 'TCGDEX:<lang>:<setId>-<localId>[:<parts joined by +>]', or [] when there is none. */
function idVariantParts(id: string): string[] {
  const pieces = id.split(':');
  if (pieces.length < 4) return [];
  const rest = pieces.slice(3).join(':').replace(/~[0-9a-f]*$/, '');
  return rest.split('+').filter((p) => p !== '');
}

export interface PrintingVariantInput {
  id: string;
  source: string | null | undefined;
  setName: string | null | undefined;
}

/**
 * Variant tokens of a catalog printing (ADR-140 section 9.1). Only TCGDEX rows carry variants.
 *
 * The set name suffix is preferred because ids over 80 characters are shortened with a hash and may be cut mid word.
 * When the id was NOT shortened, its variant part is complete and is used as is: this avoids reading a real parenthetical
 * that belongs to the set name itself (for example a set called "Something (Promo)") as a stamp.
 */
export function parsePrintingVariants(input: PrintingVariantInput): VariantParse {
  if (String(input.source ?? '').toUpperCase() !== 'TCGDEX') return { tokens: [], stampedRaw: [] };
  const fromId = idVariantParts(input.id);
  if (!isShortenedId(input.id)) return mapRawTokens(fromId);
  const fromName = parentheticalParts(input.setName);
  return mapRawTokens(fromName ?? fromId);
}

export function variantTokensFromPrinting(input: PrintingVariantInput): VariantToken[] {
  return parsePrintingVariants(input).tokens;
}

/** Typed (non catalog) Pokemon items: the same parse on the typed set name, or [] when there is no parenthetical. */
export function variantTokensFromSetName(setName: string | null | undefined): VariantToken[] {
  const parts = parentheticalParts(setName);
  return parts ? mapRawTokens(parts).tokens : [];
}
