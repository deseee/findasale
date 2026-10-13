/**
 * Pure mapping from parsed TCGdex set and card data to catalog rows (IDENTITY ONLY).
 *
 * What is read, by allowlist and nothing else:
 *   set:   id, name (per language), cardCount.official, releaseDate
 *   card:  name (per language), rarity, variants
 *   variant entries: type, subtype, stamp, size, languages
 *
 * What is never read, so it can never be stored: thirdParty (TCGplayer, Cardmarket and CardTrader
 * product ids), any price or pricing object, image fields, illustrator, card text, boosters,
 * dex ids. The five catalog columns that could carry third-party data (scryfallId,
 * tcgplayerProductId, cardmarketId, imageSmallUrl, imageNormalUrl) are always null on TCGDEX
 * rows, and assertIdentityOnly() re-checks that before anything is written.
 *
 * Variant model: TCGdex describes every card with a list of variant entries. One catalog row is
 * produced per distinct variant identity (subtype + stamps + jumbo size); the foil types inside
 * that identity become the row's finishes:
 *   normal -> NONFOIL, holo -> HOLO, reverse -> REVERSE_HOLO
 * (metal, lenticular and any other type have no finish in the card vocabulary: the row keeps its
 * other finishes and the type is reported in `notes`). Editions are not finishes, so they live in
 * the row id and in the setName suffix, for example "Base Set (Shadowless, 1st Edition)".
 */
import { createHash } from 'crypto';
import type { PrintingRow } from './types';
import { normalizeCardName, yearFromDate } from './normalize';
import { isPlainRecord } from './tcgdexLiteralParser';

export const TCGDEX_VARIANT_FINISH: Record<string, string> = {
  normal: 'NONFOIL',
  holo: 'HOLO',
  reverse: 'REVERSE_HOLO',
};

/** Stored finish order (the card vocabulary order), so a repeat run produces identical arrays. */
const FINISH_ORDER = ['NONFOIL', 'FOIL', 'ETCHED', 'HOLO', 'REVERSE_HOLO'];

/** TCGdex language code to the card vocabulary language code stored in CardPrinting.language. */
export const TCGDEX_LANGUAGE_TO_CARD_LANGUAGE: Record<string, string> = {
  en: 'en',
  fr: 'fr',
  es: 'es',
  'es-mx': 'es',
  it: 'it',
  pt: 'pt',
  'pt-br': 'pt',
  'pt-pt': 'pt',
  de: 'de',
  ru: 'ru',
  ja: 'ja',
  ko: 'ko',
  'zh-tw': 'zht',
  'zh-cn': 'zhs',
};

/** The suggested-price route accepts printing ids up to 80 characters; longer ids are shortened with a hash. */
export const MAX_PRINTING_ID_LENGTH = 80;

export interface TcgdexSetMeta {
  id: string;
  names: Record<string, string>;
  officialCount: number | null;
  releaseDate: string | Record<string, string> | null;
}

export interface VariantEntry {
  type: string;
  subtype: string | null;
  stamps: string[];
  size: string | null;
  languages: string[] | null;
}

export interface MapTcgdexCardInput {
  set: TcgdexSetMeta;
  localId: string;
  card: Record<string, unknown>;
  /** TCGdex language code (a key of TCGDEX_LANGUAGE_TO_CARD_LANGUAGE). */
  lang: string;
}

export interface MapTcgdexCardResult {
  rows: PrintingRow[];
  /** Variant types or shapes that had no finish or could not be read; counted by the ingest. */
  notes: string[];
}

/** Keeps only non-empty string values, with lower-cased keys. Anything else is dropped. */
function textMap(value: unknown): Record<string, string> {
  const out: Record<string, string> = {};
  if (!isPlainRecord(value)) return out;
  for (const key of Object.keys(value)) {
    const v = value[key];
    if (typeof v === 'string' && v.trim()) out[key.toLowerCase()] = v.trim();
  }
  return out;
}

function lowerText(value: unknown): string | null {
  return typeof value === 'string' && value.trim() ? value.trim().toLowerCase() : null;
}

/** Reads the identity fields of a TCGdex set file. Returns null when the set has no id. */
export function readSetMeta(raw: unknown): TcgdexSetMeta | null {
  if (!isPlainRecord(raw)) return null;
  const id = typeof raw.id === 'string' ? raw.id.trim() : '';
  if (!id) return null;
  let officialCount: number | null = null;
  const cardCount = raw.cardCount;
  if (isPlainRecord(cardCount)) {
    const n = cardCount.official;
    if (typeof n === 'number' && Number.isInteger(n) && n > 0 && n < 100000) officialCount = n;
  }
  let releaseDate: TcgdexSetMeta['releaseDate'] = null;
  if (typeof raw.releaseDate === 'string') releaseDate = raw.releaseDate.trim();
  else if (isPlainRecord(raw.releaseDate)) releaseDate = textMap(raw.releaseDate);
  return { id, names: textMap(raw.name), officialCount, releaseDate };
}

function setReleaseYear(set: TcgdexSetMeta, lang: string): number | null {
  const rd = set.releaseDate;
  if (rd === null) return null;
  if (typeof rd === 'string') return yearFromDate(rd);
  const direct = rd[lang];
  if (direct) return yearFromDate(direct);
  const first = Object.keys(rd)[0];
  return first ? yearFromDate(rd[first]) : null;
}

function stampList(value: unknown): string[] {
  const list = Array.isArray(value) ? value : typeof value === 'string' ? [value] : [];
  const out: string[] = [];
  for (const item of list) {
    const s = lowerText(item);
    if (s && !out.includes(s)) out.push(s);
  }
  return out;
}

/**
 * Normalizes the `variants` field of a card. Two shapes exist upstream:
 *  - a list of detailed entries ({ type, subtype?, stamp?, size?, foil?, languages?, thirdParty? })
 *  - the older flag object ({ normal?, reverse?, holo?, firstEdition?, wPromo?, preRelease?, jumbo? }),
 *    where `normal` defaults to true. A missing field means a single normal variant.
 * The foil pattern (`foil`) and every third-party field are ignored.
 */
export function readVariantEntries(raw: unknown, notes: string[]): VariantEntry[] {
  if (raw === undefined || raw === null) return [{ type: 'normal', subtype: null, stamps: [], size: null, languages: null }];

  if (Array.isArray(raw)) {
    const out: VariantEntry[] = [];
    for (const el of raw) {
      const type = isPlainRecord(el) ? lowerText(el.type) : null;
      if (!isPlainRecord(el) || !type) {
        notes.push('variant:malformed');
        continue;
      }
      const size = lowerText(el.size);
      const langs = Array.isArray(el.languages)
        ? (el.languages as unknown[]).map((l) => lowerText(l)).filter((l): l is string => !!l)
        : [];
      out.push({
        type,
        subtype: lowerText(el.subtype),
        stamps: stampList(el.stamp),
        size: size === 'standard' ? null : size,
        languages: langs.length > 0 ? langs : null,
      });
    }
    return out;
  }

  if (isPlainRecord(raw)) {
    const entry = (type: string, stamps: string[] = []): VariantEntry => ({ type, subtype: null, stamps, size: null, languages: null });
    const out: VariantEntry[] = [];
    const first = raw.firstEdition === true;
    if (typeof raw.normal === 'boolean' ? raw.normal : true) {
      out.push(entry('normal'));
      if (first) out.push(entry('normal', ['1st-edition']));
      if (raw.wPromo === true) out.push(entry('normal', ['w-promo']));
      if (raw.preRelease === true) out.push(entry('normal', ['pre-release']));
    }
    if (raw.reverse === true) {
      out.push(entry('reverse'));
      if (first) out.push(entry('reverse', ['1st-edition']));
    }
    if (raw.holo === true) {
      out.push(entry('holo'));
      if (first) out.push(entry('holo', ['1st-edition']));
    }
    if (raw.jumbo === true) notes.push('flag:jumbo');
    return out;
  }

  notes.push('variants:unsupported');
  return [];
}

function cleanPart(part: string): string {
  return part.replace(/[^a-z0-9._-]+/g, '-').replace(/^-+|-+$/g, '');
}

/** Identity parts of one variant entry: subtype, then stamps, then jumbo. Empty for a plain print. */
export function variantParts(e: VariantEntry): string[] {
  const raw = [e.subtype, ...e.stamps, e.size === 'jumbo' ? 'jumbo' : null];
  const out: string[] = [];
  for (const p of raw) {
    if (!p) continue;
    const c = cleanPart(p);
    if (c && !out.includes(c)) out.push(c);
  }
  return out;
}

const LABEL_OVERRIDES: Record<string, string> = {
  '1st-edition': '1st Edition',
  'w-promo': 'W Promo',
  '1999-2000-copyright': '1999-2000 Copyright',
  '1995-1998-copyright': '1995-1998 Copyright',
};

/** 'shadowless' -> 'Shadowless', '1st-edition' -> '1st Edition'. */
export function humanizeVariantToken(token: string): string {
  const override = LABEL_OVERRIDES[token];
  if (override) return override;
  return token
    .split('-')
    .filter((w) => w.length > 0)
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(' ');
}

/** Stable printing id: TCGDEX:<lang>:<setId>-<localId>[:<variant parts joined by +>], shortened with a hash when over 80 characters. */
export function buildTcgdexPrintingId(lang: string, setId: string, localId: string, key: string): string {
  const raw = `TCGDEX:${lang}:${setId}-${localId}${key ? `:${key}` : ''}`;
  if (raw.length <= MAX_PRINTING_ID_LENGTH) return raw;
  const digest = createHash('sha1').update(raw).digest('hex').slice(0, 10);
  return `${raw.slice(0, MAX_PRINTING_ID_LENGTH - 11)}~${digest}`;
}

/** Printed collector number: '4/102' for numeric ids when the set size is known, else the local id as is ('SWSH001'). */
export function formatCollectorNumber(localId: string, officialCount: number | null): string {
  if (/^\d+$/.test(localId) && officialCount !== null) return `${localId}/${officialCount}`;
  return localId;
}

/**
 * Maps one parsed card file to catalog rows for one language. Returns null when the card has no
 * name in that language (it simply does not exist in that language).
 */
export function mapTcgdexCard(input: MapTcgdexCardInput): MapTcgdexCardResult | null {
  const { set, localId, card, lang } = input;
  const name = textMap(card.name)[lang];
  if (!name) return null;
  const cardLanguage = TCGDEX_LANGUAGE_TO_CARD_LANGUAGE[lang];
  if (!cardLanguage) return null;

  const notes: string[] = [];
  const entries = readVariantEntries(card.variants, notes);

  const groups = new Map<string, { parts: string[]; finishes: Set<string> }>();
  for (const e of entries) {
    if (e.languages && !e.languages.includes(lang)) continue;
    const parts = variantParts(e);
    const key = parts.join('+');
    let group = groups.get(key);
    if (!group) {
      group = { parts, finishes: new Set<string>() };
      groups.set(key, group);
    }
    const finish = TCGDEX_VARIANT_FINISH[e.type];
    if (finish) group.finishes.add(finish);
    else notes.push(`type:${e.type}`);
  }
  if (groups.size === 0) groups.set('', { parts: [], finishes: new Set<string>() });

  const baseSetName = set.names[lang] ?? set.names.en ?? null;
  const rarityText = typeof card.rarity === 'string' ? card.rarity.trim() : '';
  const rarity = rarityText && rarityText.toLowerCase() !== 'none' ? rarityText : null;
  const releaseYear = setReleaseYear(set, lang);
  const collectorNumber = formatCollectorNumber(localId, set.officialCount);
  const nameNorm = normalizeCardName(name);

  const rows: PrintingRow[] = [];
  for (const [key, group] of groups) {
    const label = group.parts.map(humanizeVariantToken).join(', ');
    const setName = baseSetName ? (label ? `${baseSetName} (${label})` : baseSetName) : label || null;
    rows.push({
      id: buildTcgdexPrintingId(lang, set.id, localId, key),
      source: 'TCGDEX',
      game: 'POKEMON',
      name,
      nameNorm,
      setCode: set.id.toLowerCase(),
      setName,
      collectorNumber,
      language: cardLanguage,
      rarity,
      releaseYear,
      finishes: FINISH_ORDER.filter((f) => group.finishes.has(f)),
      scryfallId: null,
      tcgplayerProductId: null,
      cardmarketId: null,
      imageSmallUrl: null,
      imageNormalUrl: null,
    });
  }
  return { rows, notes };
}

/**
 * Last line of defence before a write: a TCGDEX row must be a Pokemon identity row with none of
 * the third-party columns set. Throws on a violation (a programming error, never data).
 */
export function assertIdentityOnly(row: PrintingRow): void {
  if (row.source !== 'TCGDEX' || row.game !== 'POKEMON' || !row.id.startsWith('TCGDEX:')) {
    throw new Error(`Refusing to store a non-TCGdex row from the TCGdex ingest: ${row.id}`);
  }
  if (
    row.scryfallId !== null ||
    row.tcgplayerProductId !== null ||
    row.cardmarketId !== null ||
    row.imageSmallUrl !== null ||
    row.imageNormalUrl !== null
  ) {
    throw new Error(`TCGdex row carries a third-party id or image and was not stored: ${row.id}`);
  }
}
