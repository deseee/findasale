/**
 * Product Enrichment Cascade (ADR — 2026-06-14, S975)
 *
 * One service that runs pluggable providers in priority order, takes the first
 * non-null value per field (with `source` + `confidence` attached), caches by
 * identifier, and returns a merged map. The CALLER decides what to auto-apply
 * vs. write to `Item.catalogSuggestions` (organizer-set values always win).
 *
 * Providers (priority order):
 *   1. localBarcode  — the locally DECODED barcode → upc / ean / isbn. No API. conf 1.0.
 *   2. openLibrary   — isbn → confirmed identifier (+ publisher as brand). Free, no key.
 *   3. openFoodFacts — grocery upc → brand + net weight. Free, no key.
 *   4. ebayCatalog   — wraps existing enrichItemFromCatalog (dormant on 403 — harmless).
 *   5. goUpc (PAID)  — env-gated, DEFAULT OFF — upc → name/brand/weight/dims.
 *   6. aiEstimate    — last resort: weight/dims from the analysis result. Always on.
 *
 * Each provider's `lookup` returns null on miss/error and NEVER throws. Results are
 * cached in a module-level Map keyed by `${provider}:${upc||isbn||mpn}` — products'
 * specs don't change, so each identifier is fetched at most once. aiEstimate is not
 * cached (depends on the per-item analysis result, not a stable identifier).
 */

import axios from 'axios';
import { enrichItemFromCatalog } from './ebayCatalogLookup';

// ── Contract (from the ADR) ─────────────────────────────────────────────────

export type EnrichField =
  | 'brand' | 'mpn' | 'upc' | 'ean' | 'isbn' | 'epid'
  | 'ebayCategoryId' | 'ebayCategoryName'
  | 'weightOz' | 'lengthIn' | 'widthIn' | 'heightIn';

export interface ProviderResult {
  fields: Partial<Record<EnrichField, string | number>>;
  confidence: number;
  source: string;
  /**
   * Optional per-field confidence override. When a provider's overall `confidence` doesn't
   * apply uniformly to every field it returns (e.g. aiEstimateProvider returning brand/mpn at
   * the underlying AI vision confidence while weight/dims stay at a flat suggestion-only
   * confidence), set the specific field here. Falls back to `confidence` when absent — fully
   * backward-compatible, no other provider needs to set this.
   */
  fieldConfidence?: Partial<Record<EnrichField, number>>;
}

/** Minimal shape the cascade reads off an item. */
export interface EnrichItemInput {
  title?: string | null;
  brand?: string | null;
  mpn?: string | null;
  upc?: string | null;
  ean?: string | null;
  isbn?: string | null;
  tags?: string[] | null;
}

export interface EnrichContext {
  decodedBarcode?: { code: string; type?: string };
  aiResult?: any;
  /** ADR-089: category signal for book detection (openLibrarySearch gate). */
  categoryHint?: { id?: string | null; name?: string | null };
}

export interface EnrichmentProvider {
  name: string;
  isEnabled(): boolean;                                              // env-flag gate (paid default OFF)
  appliesTo(item: EnrichItemInput, ctx: EnrichContext): boolean;     // e.g. openLibrary only when isbn present
  lookup(item: EnrichItemInput, ctx: EnrichContext): Promise<ProviderResult | null>; // null on miss/error — NEVER throws
}

export interface MergedEnrichment {
  merged: Record<string, { value: string | number; source: string; confidence: number }>;
}

// ── Per-identifier result cache (products' specs never change) ──────────────

const providerCache = new Map<string, ProviderResult | null>();

/** Build a stable cache key from the strongest available identifier. */
function cacheKey(provider: string, item: EnrichItemInput, ctx: EnrichContext): string | null {
  const upc = (item.upc || '').trim();
  const ean = (item.ean || '').trim();
  const isbn = (item.isbn || '').trim();
  const mpn = (item.mpn || '').trim();
  const decoded = (ctx.decodedBarcode?.code || '').trim();
  const id = upc || ean || isbn || decoded || mpn;
  return id ? `${provider}:${id}` : null;
}

// ── Identifier helpers ──────────────────────────────────────────────────────

/** True for a numeric UPC/EAN barcode (8, 12, or 13 digits). */
function isUpcEanCode(code: string): boolean {
  return /^\d+$/.test(code) && [8, 12, 13].includes(code.length);
}

/** True for an ISBN-10 / ISBN-13 (10 or 13 chars; ISBN-10 may end in X). */
function isIsbnCode(code: string): boolean {
  const c = code.replace(/[-\s]/g, '');
  return (/^\d{13}$/.test(c)) || (/^\d{9}[\dXx]$/.test(c));
}

function firstIsbn(item: EnrichItemInput, ctx: EnrichContext): string | null {
  const fromItem = (item.isbn || '').replace(/[-\s]/g, '').trim();
  if (fromItem && isIsbnCode(fromItem)) return fromItem;
  const decoded = (ctx.decodedBarcode?.code || '').replace(/[-\s]/g, '').trim();
  if (decoded && isIsbnCode(decoded) && (ctx.decodedBarcode?.type || '').toUpperCase().includes('ISBN')) {
    return decoded;
  }
  // EAN-13 starting 978/979 is a Bookland ISBN-13.
  if (decoded && /^(978|979)\d{10}$/.test(decoded)) return decoded;
  if (fromItem && /^(978|979)\d{10}$/.test(fromItem)) return fromItem;
  return null;
}

function firstUpc(item: EnrichItemInput, ctx: EnrichContext): string | null {
  const fromItem = (item.upc || '').trim();
  if (fromItem && isUpcEanCode(fromItem)) return fromItem;
  const ean = (item.ean || '').trim();
  if (ean && isUpcEanCode(ean)) return ean;
  const decoded = (ctx.decodedBarcode?.code || '').trim();
  const dType = (ctx.decodedBarcode?.type || '').toUpperCase();
  if (decoded && isUpcEanCode(decoded) && !dType.includes('ISBN')) return decoded;
  return null;
}

const GRAMS_PER_OZ = 28.3495;

// ── Provider 1: localBarcode ────────────────────────────────────────────────
// The locally DECODED barcode is the authoritative UPC/EAN/ISBN source. No API.

const localBarcodeProvider: EnrichmentProvider = {
  name: 'localBarcode',
  isEnabled: () => true,
  appliesTo: (_item, ctx) => !!ctx.decodedBarcode?.code?.trim(),
  async lookup(_item, ctx) {
    try {
      const code = (ctx.decodedBarcode?.code || '').trim();
      if (!code) return null;
      const type = (ctx.decodedBarcode?.type || '').toUpperCase();
      const fields: Partial<Record<EnrichField, string | number>> = {};

      if (isIsbnCode(code) && (type.includes('ISBN') || /^(978|979)\d{10}$/.test(code))) {
        fields.isbn = code;
      } else if (isUpcEanCode(code)) {
        // 12-digit → UPC; 8/13-digit → EAN (13-digit is the EAN superset).
        if (code.length === 12) fields.upc = code;
        else fields.ean = code;
      } else {
        return null; // QR / non-product code — nothing authoritative to store.
      }
      return { fields, confidence: 1.0, source: 'barcode' };
    } catch {
      return null;
    }
  },
};

// ── Provider 1b: ocrIdentifier (ADR-089) ────────────────────────────────────
// A checksum-valid ISBN read from the full Vision OCR block (cloudAIService.extractIsbnFromText,
// threaded onto aiResult.ocrIsbn). Barcode-grade, no network call. Always-on (not book-gated).

const ocrIdentifierProvider: EnrichmentProvider = {
  name: 'ocrIdentifier',
  isEnabled: () => true,
  appliesTo: (_item, ctx) => !!ctx.aiResult?.ocrIsbn,
  async lookup(_item, ctx) {
    try {
      const raw = String(ctx.aiResult?.ocrIsbn || '').replace(/[-\s]/g, '').trim();
      if (!raw || !isIsbnCode(raw)) return null;
      return { fields: { isbn: raw }, confidence: 0.9, source: 'ocr' };
    } catch {
      return null;
    }
  },
};

// ── Provider 2: openLibrary ─────────────────────────────────────────────────
// isbn → confirmed identifier (+ publisher mapped to brand). Free, no key.

const openLibraryProvider: EnrichmentProvider = {
  name: 'openLibrary',
  isEnabled: () => true,
  appliesTo: (item, ctx) => !!firstIsbn(item, ctx),
  async lookup(item, ctx) {
    try {
      const isbn = firstIsbn(item, ctx);
      if (!isbn) return null;
      const res = await axios.get(`https://openlibrary.org/isbn/${encodeURIComponent(isbn)}.json`, {
        timeout: 8000,
        validateStatus: () => true,
      });
      if (res.status !== 200 || !res.data || typeof res.data !== 'object') return null;
      const data: any = res.data;
      const fields: Partial<Record<EnrichField, string | number>> = { isbn };
      // Publishers is an array of strings on the edition record.
      const publisher = Array.isArray(data.publishers) && data.publishers.length
        ? String(data.publishers[0]).trim()
        : '';
      if (publisher) fields.brand = publisher;
      return { fields, confidence: 0.95, source: 'openLibrary' };
    } catch {
      return null;
    }
  },
};

// ── Provider 2b: openLibrarySearch (ADR-089) ────────────────────────────────
// title/author -> ISBN via Open Library search.json (FREE, no key). Runs only when no
// derivable identifier exists AND there is a book signal. A naive full-title query returns 0
// for many books (verified: the Beeple book), so build a short, author-anchored query cascade,
// most-specific first, and take the first dominant match. Every value is URL-encoded.

/** Strip marketing/format noise from a raw item title to get the core book title. */
function cleanBookTitle(title: string): string {
  let t = title || '';
  t = t.replace(/\bby\s+.+$/i, ' '); // drop trailing "by <author>" (captured separately)
  t = t.replace(/\b(hardcover|paperback|hardback|softcover|mass market|library binding|book|novel|edition|illustrated|reprint|revised|deluxe|boxed set|volume|vol\.?)\b/gi, ' ');
  t = t.replace(/[,:;\u2013\u2014-]+/g, ' ');
  return t.replace(/\s+/g, ' ').trim();
}

/** True when a string looks like a person's name (2-4 capitalized tokens). */
function looksLikePerson(sName: string): boolean {
  const tokens = (sName || '').trim().split(/\s+/);
  if (tokens.length < 2 || tokens.length > 4) return false;
  return tokens.every((w) => /^[A-Z][A-Za-z.'\u2019-]+$/.test(w));
}

/** Extract an author from the item title ("... by Jane Doe") or a person-like brand. */
function extractAuthor(item: EnrichItemInput): string | null {
  const title = item.title || '';
  const m = title.match(/\bby\s+([A-Za-z.'\u2019-]+(?:\s+[A-Za-z.'\u2019-]+){0,3})\s*$/i);
  if (m && m[1] && looksLikePerson(m[1].trim())) return m[1].trim();
  const brand = (item.brand || '').trim();
  if (brand && looksLikePerson(brand)) return brand;
  return null;
}

/** Pick a preferred ISBN-13 (978/979) from Open Library's merged isbn[] array. */
function pickIsbn13(isbnArr: unknown): string | null {
  if (!Array.isArray(isbnArr)) return null;
  const clean = isbnArr
    .map((x) => String(x || '').replace(/[-\s]/g, '').trim())
    .filter((x) => /^\d{13}$/.test(x) || /^\d{9}[\dXx]$/.test(x));
  const pref = clean.find((x) => /^(978|979)\d{10}$/.test(x));
  if (pref) return pref;
  return clean.find((x) => /^\d{13}$/.test(x)) || null;
}

interface OpenLibraryDoc { isbn?: string[]; author_name?: string[]; title?: string }

/**
 * Author-anchored Open Library query cascade -> a work ISBN-13, or null. Bounded: at most
 * 3 requests, 8s timeout each, every interpolated value URL-encoded (no query injection).
 * Confidence 0.9 for a single dominant match; 0.6 for a 2-3-result ambiguous match; null > 3.
 */
async function openLibrarySearchIsbn(
  item: EnrichItemInput,
): Promise<{ isbn: string; confidence: number } | null> {
  const rawTitle = (item.title || '').trim();
  if (!rawTitle) return null;
  const author = extractAuthor(item);
  const cleanedTitle = cleanBookTitle(rawTitle);
  const firstToken = (item.brand?.trim() || cleanedTitle.split(/\s+/)[0] || '').trim();

  const enc = encodeURIComponent;
  const base = 'https://openlibrary.org/search.json';
  const fields = '&fields=isbn,title,author_name&limit=5';
  const urls: string[] = [];
  if (cleanedTitle && author) urls.push(`${base}?title=${enc(cleanedTitle)}&author=${enc(author)}${fields}`);
  if (firstToken && author)   urls.push(`${base}?q=${enc(`${firstToken} ${author}`)}${fields}`);
  if (author)                 urls.push(`${base}?author=${enc(author)}${fields}`);
  if (urls.length === 0) return null;

  for (const url of urls.slice(0, 3)) {
    try {
      const res = await axios.get(url, { timeout: 8000, validateStatus: () => true });
      if (res.status !== 200 || !res.data || typeof res.data !== 'object') continue;
      const data: any = res.data;
      const docs: OpenLibraryDoc[] = Array.isArray(data.docs) ? data.docs : [];
      if (docs.length === 0) continue;
      const numFound: number = typeof data.numFound === 'number' ? data.numFound
        : typeof data.num_found === 'number' ? data.num_found : docs.length;

      if (numFound === 1) {
        const isbn = pickIsbn13(docs[0].isbn);
        if (isbn) return { isbn, confidence: 0.9 };
        continue;
      }
      if (numFound <= 3) {
        const doc = docs.find((d) => pickIsbn13(d.isbn));
        const isbn = doc ? pickIsbn13(doc.isbn) : null;
        if (isbn) return { isbn, confidence: 0.6 };
      }
      // numFound > 3 -> too weak; more-specific queries were tried first, so give up.
    } catch {
      continue;
    }
  }
  return null;
}

const openLibrarySearchProvider: EnrichmentProvider = {
  name: 'openLibrarySearch',
  isEnabled: () => true,
  appliesTo: (item, ctx) => {
    if (firstIsbn(item, ctx) || firstUpc(item, ctx)) return false; // already have an identifier
    const hint = ctx.categoryHint;
    const catBook = !!(hint && ((hint.id && String(hint.id) === '261186') || (hint.name && /book/i.test(hint.name))));
    const text = `${item.title || ''} ${(item.tags || []).join(' ')}`.toLowerCase();
    const textBook = /\b(book|hardcover|paperback|novel|isbn)\b/.test(text);
    return catBook || textBook;
  },
  async lookup(item) {
    try {
      const r = await openLibrarySearchIsbn(item);
      if (!r) return null;
      return { fields: { isbn: r.isbn }, confidence: r.confidence, source: 'openLibrarySearch' };
    } catch {
      return null;
    }
  },
};

// ── Provider 2c: googleBooks (env-gated, DEFAULT OFF) ───────────────────────
// Per-edition ISBNs (better format disambiguation) via Google Books volumes. Keyless access
// is hard-blocked (HTTP 429, quota 0), so this lights up only when GOOGLE_BOOKS_API_KEY is set.
// Never primary/required.
const googleBooksProvider: EnrichmentProvider = {
  name: 'googleBooks',
  isEnabled: () => !!process.env.GOOGLE_BOOKS_API_KEY,
  appliesTo: (item, ctx) => {
    if (firstIsbn(item, ctx) || firstUpc(item, ctx)) return false;
    const hint = ctx.categoryHint;
    const catBook = !!(hint && ((hint.id && String(hint.id) === '261186') || (hint.name && /book/i.test(hint.name))));
    const text = `${item.title || ''} ${(item.tags || []).join(' ')}`.toLowerCase();
    return catBook || /\b(book|hardcover|paperback|novel|isbn)\b/.test(text);
  },
  async lookup(item) {
    try {
      const author = extractAuthor(item);
      const cleaned = cleanBookTitle(item.title || '');
      if (!cleaned) return null;
      const q = author ? `${cleaned} ${author}` : cleaned;
      const url = `https://www.googleapis.com/books/v1/volumes?q=${encodeURIComponent(q)}&maxResults=3&key=${encodeURIComponent(process.env.GOOGLE_BOOKS_API_KEY || '')}`;
      const res = await axios.get(url, { timeout: 8000, validateStatus: () => true });
      if (res.status !== 200 || !res.data || typeof res.data !== 'object') return null;
      const items: any[] = Array.isArray(res.data.items) ? res.data.items : [];
      for (const vol of items) {
        const ids: any[] = vol?.volumeInfo?.industryIdentifiers || [];
        const hit = ids.find((i) => i?.type === 'ISBN_13' && /^(978|979)\d{10}$/.test(String(i.identifier || '').replace(/[-\s]/g, '')));
        if (hit) return { fields: { isbn: String(hit.identifier).replace(/[-\s]/g, '') }, confidence: 0.6, source: 'googleBooks' };
      }
      return null;
    } catch {
      return null;
    }
  },
};

/**
 * Standalone publish-time JIT resolver (ADR-089 Decision 3.2). Covers legacy Books items
 * tagged before auto-ISBN. Same author-anchored Open Library cascade as the provider.
 */
export async function resolveBookIsbn(
  item: EnrichItemInput,
): Promise<{ isbn: string; confidence: number } | null> {
  return openLibrarySearchIsbn(item);
}

// ── Provider 3: openFoodFacts ───────────────────────────────────────────────
// grocery upc → brand + net weight (product_quantity is grams). Free, no key.

const openFoodFactsProvider: EnrichmentProvider = {
  name: 'openFoodFacts',
  isEnabled: () => true,
  appliesTo: (item, ctx) => !!firstUpc(item, ctx),
  async lookup(item, ctx) {
    try {
      const upc = firstUpc(item, ctx);
      if (!upc) return null;
      const res = await axios.get(
        `https://world.openfoodfacts.org/api/v2/product/${encodeURIComponent(upc)}.json` +
          `?fields=product_name,brands,product_quantity,quantity`,
        { timeout: 8000, validateStatus: () => true },
      );
      if (res.status !== 200 || !res.data || typeof res.data !== 'object') return null;
      const data: any = res.data;
      if (data.status !== 1 || !data.product) return null;
      const product: any = data.product;
      const fields: Partial<Record<EnrichField, string | number>> = { upc };

      // brands is a comma-separated string; take the first.
      const brandsRaw = typeof product.brands === 'string' ? product.brands.trim() : '';
      if (brandsRaw) {
        const first = brandsRaw.split(',')[0].trim();
        if (first) fields.brand = first;
      }

      // product_quantity is the net product weight in grams (numeric or numeric-string).
      const qtyRaw = product.product_quantity;
      const grams =
        typeof qtyRaw === 'number' ? qtyRaw :
        typeof qtyRaw === 'string' && qtyRaw.trim() !== '' && !isNaN(Number(qtyRaw)) ? Number(qtyRaw) :
        null;
      if (grams != null && grams > 0) {
        const oz = Math.round(grams / GRAMS_PER_OZ);
        if (oz > 0) fields.weightOz = oz;
      }

      // Need at least one usable field to count as a hit.
      if (Object.keys(fields).length <= 1) return { fields, confidence: 0.9, source: 'openFoodFacts' };
      return { fields, confidence: 0.9, source: 'openFoodFacts' };
    } catch {
      return null;
    }
  },
};

// ── Provider 4: ebayCatalog ─────────────────────────────────────────────────
// Wraps existing enrichItemFromCatalog. Returns null on the current 403 — harmless;
// lights up automatically when the Buy-API grant lands.

const ebayCatalogProvider: EnrichmentProvider = {
  name: 'ebayCatalog',
  isEnabled: () => true,
  appliesTo: (item) =>
    !!(item.upc || item.ean || item.isbn || (item.brand && (item.mpn || item.title))),
  async lookup(item) {
    try {
      const r = await enrichItemFromCatalog({
        title: item.title ?? null,
        brand: item.brand ?? null,
        mpn: item.mpn ?? null,
        upc: item.upc ?? null,
        ean: item.ean ?? null,
        isbn: item.isbn ?? null,
        tags: item.tags ?? null,
      });
      if (!r) return null;
      const fields: Partial<Record<EnrichField, string | number>> = {};
      const id = r.identifiers || {};
      if (id.mpn) fields.mpn = id.mpn;
      if (id.upc) fields.upc = id.upc;
      if (id.ean) fields.ean = id.ean;
      if (id.epid) fields.epid = id.epid;
      if (id.brand) fields.brand = id.brand;
      const pk = r.package || {};
      if (pk.weightOz != null) fields.weightOz = pk.weightOz;
      if (pk.lengthIn != null) fields.lengthIn = pk.lengthIn;
      if (pk.widthIn != null) fields.widthIn = pk.widthIn;
      if (pk.heightIn != null) fields.heightIn = pk.heightIn;
      if (Object.keys(fields).length === 0) return null;
      return { fields, confidence: r.confidence, source: 'ebayCatalog' };
    } catch {
      return null;
    }
  },
};

// ── Provider 5: goUpc (PAID — env-gated, DEFAULT OFF) ───────────────────────
// upc → name/brand/weight/dimensions. Wired but dormant until GOUPC_API_KEY is set.

const goUpcProvider: EnrichmentProvider = {
  name: 'goUpc',
  isEnabled: () => !!process.env.GOUPC_API_KEY,
  appliesTo: (item, ctx) => !!firstUpc(item, ctx),
  async lookup(item, ctx) {
    try {
      const upc = firstUpc(item, ctx);
      if (!upc) return null;
      const res = await axios.get(`https://go-upc.com/api/v1/code/${encodeURIComponent(upc)}`, {
        headers: { Authorization: `Bearer ${process.env.GOUPC_API_KEY}` },
        timeout: 8000,
        validateStatus: () => true,
      });
      if (res.status !== 200 || !res.data || typeof res.data !== 'object') return null;
      const product: any = res.data.product ?? res.data;
      if (!product || typeof product !== 'object') return null;
      const fields: Partial<Record<EnrichField, string | number>> = { upc };

      const brand = typeof product.brand === 'string' ? product.brand.trim() : '';
      if (brand) fields.brand = brand;
      // go-upc exposes specs as a label/value array on some plans.
      const specs: Array<{ key?: string; value?: string }> = Array.isArray(product.specs)
        ? product.specs
        : [];
      const findSpec = (re: RegExp): string | null => {
        const hit = specs.find((s) => typeof s?.key === 'string' && re.test(s.key));
        return hit && typeof hit.value === 'string' ? hit.value : null;
      };
      const weightRaw = (typeof product.weight === 'string' ? product.weight : '') || findSpec(/weight/i) || '';
      const w = parseOzFromText(weightRaw);
      if (w != null) fields.weightOz = w;
      const dimRaw = (typeof product.dimension === 'string' ? product.dimension : '') || findSpec(/dimension|size/i) || '';
      const dims = parseDimsFromText(dimRaw);
      if (dims) {
        if (dims.lengthIn != null) fields.lengthIn = dims.lengthIn;
        if (dims.widthIn != null) fields.widthIn = dims.widthIn;
        if (dims.heightIn != null) fields.heightIn = dims.heightIn;
      }
      if (Object.keys(fields).length <= 1 && !brand) return { fields, confidence: 0.9, source: 'goUpc' };
      return { fields, confidence: 0.9, source: 'goUpc' };
    } catch {
      return null;
    }
  },
};

/** Parse total ounces from a free-text weight like "2.5 lbs", "400 g", "1 lb 4 oz". */
function parseOzFromText(raw: string): number | null {
  if (!raw) return null;
  const lower = raw.toLowerCase();
  const patterns: Array<{ re: RegExp; mult: number }> = [
    { re: /(\d+(?:\.\d+)?)\s*(?:lbs?|pounds?)\b/gi, mult: 16 },
    { re: /(\d+(?:\.\d+)?)\s*(?:kg|kilograms?)\b/gi, mult: 35.274 },
    { re: /(\d+(?:\.\d+)?)\s*(?:oz|ounces?)\b/gi, mult: 1 },
    { re: /(\d+(?:\.\d+)?)\s*(?:g|grams?)\b/gi, mult: 0.03527396 },
  ];
  let total = 0;
  let matched = false;
  for (const { re, mult } of patterns) {
    let m: RegExpExecArray | null;
    while ((m = re.exec(lower)) !== null) { total += parseFloat(m[1]) * mult; matched = true; }
  }
  return matched ? Math.round(total) : null;
}

/** Parse "L x W x H" dims (inches/cm) from free text. Returns inches or null. */
function parseDimsFromText(raw: string): { lengthIn?: number; widthIn?: number; heightIn?: number } | null {
  if (!raw) return null;
  const parts = raw.split(/[xX×]/);
  if (parts.length < 3) return null;
  const lower = raw.toLowerCase();
  const factor = /\bcm\b|centimeter/.test(lower) ? (1 / 2.54)
    : /\bmm\b|millimeter/.test(lower) ? (1 / 25.4)
    : /\b(?:ft|feet|foot)\b/.test(lower) ? 12
    : 1;
  const conv = (s: string): number | undefined => {
    const m = s.match(/(\d+(?:\.\d+)?)/);
    if (!m) return undefined;
    return parseFloat((parseFloat(m[1]) * factor).toFixed(2));
  };
  const lengthIn = conv(parts[0]);
  const widthIn = conv(parts[1]);
  const heightIn = conv(parts[2]);
  if (lengthIn == null && widthIn == null && heightIn == null) return null;
  return { lengthIn, widthIn, heightIn };
}

// ── Provider 6: aiEstimate (always on, NOT cached) ──────────────────────────
// Last resort: weight/dims from the analysis result. confidence ~0.5.

const aiEstimateProvider: EnrichmentProvider = {
  name: 'aiEstimate',
  isEnabled: () => true,
  appliesTo: (_item, ctx) => !!ctx.aiResult,
  async lookup(_item, ctx) {
    try {
      const ai = ctx.aiResult;
      if (!ai) return null;
      const fields: Partial<Record<EnrichField, string | number>> = {};
      const fieldConfidence: Partial<Record<EnrichField, number>> = {};
      if (typeof ai.estimatedWeightOz === 'number' && ai.estimatedWeightOz > 0) {
        fields.weightOz = Math.round(ai.estimatedWeightOz);
      }
      const dims = ai.estimatedDimensionsIn;
      if (dims && typeof dims === 'object') {
        if (typeof dims.length === 'number' && dims.length > 0) fields.lengthIn = dims.length;
        if (typeof dims.width === 'number' && dims.width > 0) fields.widthIn = dims.width;
        if (typeof dims.height === 'number' && dims.height > 0) fields.heightIn = dims.height;
      }
      // Bug fix (S1076): brand/mpn read directly off visible labels/marks by the vision
      // model were previously never surfaced by this cascade at all (only weight/dims were),
      // so a correctly-identified brand/mpn could never reach Item.brand/Item.mpn through
      // reanalyzeService.ts's Re-analyze path -- it silently required an external catalog/
      // barcode hit instead. Surface them here at the AI'S OWN confidence (not the flat 0.5
      // used for weight/dims, which is deliberately suggestion-only) so planEnrichmentApply's
      // existing >=0.85 auto-apply bar is judged on the real identification confidence:
      // a high-confidence read (e.g. 0.92) auto-applies into an empty field, a lower-confidence
      // one still correctly falls through to catalogSuggestions instead of being discarded.
      const aiConfidence = typeof ai.confidence === 'number' ? ai.confidence : 0.5;
      const brand = typeof ai.brand === 'string' ? ai.brand.trim() : '';
      if (brand) {
        fields.brand = brand;
        fieldConfidence.brand = aiConfidence;
      }
      const mpn = typeof ai.mpn === 'string' ? ai.mpn.trim() : '';
      if (mpn) {
        fields.mpn = mpn;
        fieldConfidence.mpn = aiConfidence;
      }
      if (Object.keys(fields).length === 0) return null;
      return { fields, confidence: 0.5, source: 'aiEstimate', fieldConfidence };
    } catch {
      return null;
    }
  },
};

// ── Cascade ─────────────────────────────────────────────────────────────────

/** Providers in priority order (first non-null per field wins). */
const PROVIDERS: EnrichmentProvider[] = [
  localBarcodeProvider,
  ocrIdentifierProvider,
  openLibraryProvider,
  openLibrarySearchProvider,
  googleBooksProvider,
  openFoodFactsProvider,
  ebayCatalogProvider,
  goUpcProvider,
  aiEstimateProvider,
];

/** Every field the cascade wants to fill. Cascade stops early once all are present. */
const WANTED_FIELDS: EnrichField[] = [
  'brand', 'mpn', 'upc', 'ean', 'isbn', 'epid',
  'ebayCategoryId', 'ebayCategoryName',
  'weightOz', 'lengthIn', 'widthIn', 'heightIn',
];

/** Run a provider with the per-identifier cache (aiEstimate is never cached). */
async function runProvider(
  provider: EnrichmentProvider,
  item: EnrichItemInput,
  ctx: EnrichContext,
): Promise<ProviderResult | null> {
  if (provider.name === 'aiEstimate') {
    return provider.lookup(item, ctx);
  }
  const key = cacheKey(provider.name, item, ctx);
  if (key && providerCache.has(key)) return providerCache.get(key) ?? null;
  const result = await provider.lookup(item, ctx);
  if (key) providerCache.set(key, result);
  return result;
}

/**
 * Run the enrichment cascade. First provider to supply a field wins that field;
 * each winning value carries its `source` + `confidence`. Stops early once all
 * wanted fields are filled. Never throws — provider errors yield null and are skipped.
 */
export async function enrichItem(
  item: EnrichItemInput,
  ctx: EnrichContext = {},
): Promise<MergedEnrichment> {
  const merged: MergedEnrichment['merged'] = {};

  for (const provider of PROVIDERS) {
    // Stop early once every wanted field is filled.
    if (WANTED_FIELDS.every((f) => merged[f] !== undefined)) break;

    try {
      if (!provider.isEnabled()) continue;
      if (!provider.appliesTo(item, ctx)) continue;
      const result = await runProvider(provider, item, ctx);
      if (!result) continue;
      for (const [field, value] of Object.entries(result.fields)) {
        if (value == null) continue;
        if (merged[field] !== undefined) continue; // first non-null wins
        const confidence = result.fieldConfidence?.[field as EnrichField] ?? result.confidence;
        merged[field] = { value: value as string | number, source: result.source, confidence };
      }
    } catch {
      // Provider isolation — one bad provider never breaks the cascade.
      continue;
    }
  }

  return { merged };
}

/**
 * Translate a merged cascade result into a concrete apply/suggestion split for an
 * existing item, following the ADR apply rule:
 *   - A field is AUTO-APPLIED when its winning source is authoritative
 *     ({barcode, openLibrary, openFoodFacts, ebayCatalog, goUpc}) OR confidence >= 0.85,
 *     AND only into an EMPTY field (organizer-set / userEdited always wins).
 *   - weight/dims auto-apply only when packageConfirmedByOrganizer === false.
 *   - Everything else → merged into `catalogSuggestions` (one-click accept in the UI).
 *
 * Identifier fields (brand/mpn/upc/ean/isbn/epid/ebayCategory*) map to the matching
 * Item columns; weight/dims map to packageWeightOz / packageLengthIn/WidthIn/HeightIn.
 */
const AUTHORITATIVE_SOURCES = new Set(['barcode', 'ocr', 'openLibrary', 'openFoodFacts', 'ebayCatalog', 'goUpc']);

export interface ApplyTargetItem {
  brand?: string | null;
  mpn?: string | null;
  upc?: string | null;
  ean?: string | null;
  isbn?: string | null;
  ebayEpid?: string | null;
  ebayCategoryId?: string | null;
  packageWeightOz?: number | null;
  packageLengthIn?: unknown;
  packageWidthIn?: unknown;
  packageHeightIn?: unknown;
  packageConfirmedByOrganizer?: boolean | null;
  userEditedFields?: string[] | null;
}

export interface EnrichmentApplyPlan {
  /** Prisma `data` fragment of real-column writes (empty when nothing auto-applies). */
  apply: Record<string, any>;
  /** `catalogSuggestions` payload (object) or null to clear; undefined = leave untouched. */
  suggestion: any;
}

/** Is `existing[col]` empty (null/undefined/empty-string)? */
function isEmptyCol(v: unknown): boolean {
  return v == null || (typeof v === 'string' && v.trim() === '');
}

export function planEnrichmentApply(
  merged: MergedEnrichment['merged'],
  existing: ApplyTargetItem,
): EnrichmentApplyPlan {
  const ue = existing.userEditedFields ?? [];
  const apply: Record<string, any> = {};
  const pkgUnlocked = existing.packageConfirmedByOrganizer === false;

  const accept = (m: { value: string | number; source: string; confidence: number } | undefined): boolean =>
    !!m && (AUTHORITATIVE_SOURCES.has(m.source) || m.confidence >= 0.85);

  // ── Identifier columns ────────────────────────────────────────────────────
  const idMap: Array<{ field: EnrichField; col: string; ueKey?: string; existingVal: unknown }> = [
    { field: 'brand', col: 'brand', ueKey: 'brand', existingVal: existing.brand },
    { field: 'mpn',   col: 'mpn',   ueKey: 'mpn',   existingVal: existing.mpn },
    { field: 'upc',   col: 'upc',   existingVal: existing.upc },
    { field: 'ean',   col: 'ean',   existingVal: existing.ean },
    { field: 'isbn',  col: 'isbn',  existingVal: existing.isbn },
    { field: 'epid',  col: 'ebayEpid', existingVal: existing.ebayEpid },
    { field: 'ebayCategoryId', col: 'ebayCategoryId', ueKey: 'ebayCategoryId', existingVal: existing.ebayCategoryId },
  ];
  for (const { field, col, ueKey, existingVal } of idMap) {
    const m = merged[field];
    if (!accept(m)) continue;
    if (ueKey && ue.includes(ueKey)) continue;        // organizer-edited wins
    if (!isEmptyCol(existingVal)) continue;            // only fill empties
    apply[col] = m!.value;
  }
  // ebayCategoryName rides along with id (no standalone accept gate).
  if (apply.ebayCategoryId !== undefined && merged.ebayCategoryName) {
    apply.ebayCategoryName = merged.ebayCategoryName.value;
  }

  // ── Package weight / dims (only when organizer hasn't confirmed package) ───
  if (pkgUnlocked) {
    const w = merged.weightOz;
    if (accept(w) && !ue.includes('packageWeightOz') && isEmptyCol(existing.packageWeightOz)) {
      apply.packageWeightOz = Math.round(Number(w!.value));
    }
    const dimMap: Array<{ field: EnrichField; col: string; existingVal: unknown }> = [
      { field: 'lengthIn', col: 'packageLengthIn', existingVal: existing.packageLengthIn },
      { field: 'widthIn',  col: 'packageWidthIn',  existingVal: existing.packageWidthIn },
      { field: 'heightIn', col: 'packageHeightIn', existingVal: existing.packageHeightIn },
    ];
    for (const { field, col, existingVal } of dimMap) {
      const m = merged[field];
      if (!accept(m)) continue;
      if (!isEmptyCol(existingVal)) continue;
      apply[col] = Number(m!.value);
    }
  }

  // ── Suggestion: every merged field that did NOT auto-apply ────────────────
  const suggestionFields: Record<string, { value: string | number; source: string; confidence: number }> = {};
  for (const [field, m] of Object.entries(merged)) {
    const col =
      field === 'epid' ? 'ebayEpid' :
      field === 'weightOz' ? 'packageWeightOz' :
      field === 'lengthIn' ? 'packageLengthIn' :
      field === 'widthIn' ? 'packageWidthIn' :
      field === 'heightIn' ? 'packageHeightIn' :
      field;
    if (apply[col] !== undefined) continue;            // already auto-applied
    suggestionFields[field] = m;
  }

  let suggestion: any = undefined;
  if (Object.keys(suggestionFields).length > 0) {
    const sources = Array.from(new Set(Object.values(suggestionFields).map((m) => m.source)));
    suggestion = {
      source: sources.length === 1 ? sources[0] : 'enrichment-cascade',
      sources,
      fields: suggestionFields,
      suggestedAt: new Date().toISOString(),
    };
  } else if (Object.keys(apply).length > 0) {
    // Everything confident auto-applied — clear any stale low-confidence suggestion.
    suggestion = null;
  }

  return { apply, suggestion };
}

/** Test/maintenance hook — clears the per-identifier provider cache. */
export function _clearEnrichmentCache(): void {
  providerCache.clear();
}
