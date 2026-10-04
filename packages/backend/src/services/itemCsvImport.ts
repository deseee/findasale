/**
 * itemCsvImport.ts -- shared row validation for both CSV item-import routes:
 *   POST /api/items/:saleId/bulk-import   (#395, column-mapping flow used by CSVImportModal)
 *   POST /api/items/:saleId/import-items  (legacy, exact/alias header flow)
 *
 * One implementation so the two routes can never drift apart again. Safety rules (every imported row):
 *   - always lands as a DRAFT (draftStatus DRAFT, status AVAILABLE) so the organizer reviews and publishes it;
 *     a `status` column is accepted but only DRAFT/AVAILABLE are recognised (never SOLD / AUCTION_ENDED / ...)
 *   - photoUrls are stored as strings only (nothing is fetched at import time), https only, no credentials,
 *     no IP-literal / localhost / internal hosts (some server-side paths later fetch item photos), capped per tier
 *   - text fields are length-limited, money is validated, auction / reverse-auction fields are validated as a set
 *
 * Pure functions, no I/O: unit-tested in __tests__/itemCsvImport.test.ts.
 */

import { isSafePublicUrlSyntax } from '../utils/safeFetchPublicUrl';
import { normalizeCondition } from '../utils/conditionMapping'; // U4: one condition vocabulary

export const IMPORT_MAX_ROWS = 200;
export const IMPORT_MAX_PHOTO_URLS = 10;
export const IMPORT_MAX_TITLE = 200;
export const IMPORT_MAX_DESCRIPTION = 2000;
export const IMPORT_MAX_CATEGORY = 50;
const IMPORT_MAX_URL_LENGTH = 2048;
const IMPORT_MAX_MONEY = 10_000_000;

export const IMPORT_VALID_CONDITIONS = ['NEW', 'USED', 'REFURBISHED', 'PARTS_OR_REPAIR'];
/** Recognised values of an imported `status` column. Both import as an AVAILABLE draft. */
export const IMPORT_ALLOWED_STATUSES = ['DRAFT', 'AVAILABLE'];

/** Case-insensitive header aliases per FindA.Sale import field (compared against header.toLowerCase().trim()). */
export const IMPORT_FIELD_ALIASES: Record<string, string[]> = {
  title:             ['title', 'name', 'item name', 'item', 'product', 'product name'],
  price:             ['price', 'cost', 'amount', 'sale price', 'retail price', 'asking price'],
  description:       ['description', 'desc', 'details', 'notes', 'about'],
  condition:         ['condition', 'grade', 'quality', 'state'],
  category:          ['category', 'type', 'genre', 'department'],
  photoUrls:         ['photourls', 'photo urls', 'photo url', 'photo', 'photos', 'image', 'images', 'image url', 'image urls', 'picture', 'pictures'],
  status:            ['status', 'listing status'],
  auctionStartPrice: ['auctionstartprice', 'auction start price', 'starting bid', 'start bid', 'opening bid'],
  bidIncrement:      ['bidincrement', 'bid increment', 'increment'],
  auctionEndTime:    ['auctionendtime', 'auction end time', 'auction end', 'auction ends', 'end time'],
  reverseAuction:    ['reverseauction', 'reverse auction'],
  reverseDailyDrop:  ['reversedailydrop', 'reverse daily drop', 'daily drop'],
  reverseFloorPrice: ['reversefloorprice', 'reverse floor price', 'floor price'],
  reverseStartDate:  ['reversestartdate', 'reverse start date'],
};

/** Every field an import CSV column can be mapped to. */
export const IMPORT_FIELD_KEYS = Object.keys(IMPORT_FIELD_ALIASES);

export function detectImportColumnMapping(headers: string[]): Record<string, string> {
  const mapping: Record<string, string> = {};
  for (const header of headers) {
    const lower = header.replace(/^﻿/, '').toLowerCase().trim();
    for (const [field, aliases] of Object.entries(IMPORT_FIELD_ALIASES)) {
      if (aliases.includes(lower) && !mapping[field]) {
        mapping[field] = header;
        break;
      }
    }
  }
  return mapping;
}

/** Photos allowed per imported item: the tier's photosPerItem, never more than IMPORT_MAX_PHOTO_URLS. */
export function importPhotoCapForTier(tier: string | null | undefined): number {
  const perTier: Record<string, number> = { SIMPLE: 5, PRO: 10 };
  const cap = tier ? perTier[tier] : undefined;
  return Math.min(cap ?? IMPORT_MAX_PHOTO_URLS, IMPORT_MAX_PHOTO_URLS);
}

export interface RawImportRow {
  title?: string;
  price?: string;
  description?: string;
  condition?: string;
  category?: string;
  photoUrls?: string;
  status?: string;
  auctionStartPrice?: string;
  bidIncrement?: string;
  auctionEndTime?: string;
  reverseAuction?: string;
  reverseDailyDrop?: string;
  reverseFloorPrice?: string;
  reverseStartDate?: string;
}

export interface ImportItemData {
  saleId: string;
  organizerId: string;
  title: string;
  description: string;
  price: number | null;
  originalPrice: number | null;
  category: string | null;
  condition: string | null;
  status: 'AVAILABLE';
  draftStatus: 'DRAFT';
  embedding: number[];
  photoUrls: string[];
  listingType: 'FIXED' | 'AUCTION' | 'REVERSE_AUCTION';
  auctionStartPrice: number | null;
  bidIncrement?: number;
  auctionEndTime: Date | null;
  reverseAuction: boolean;
  reverseDailyDrop: number | null; // cents per day
  reverseFloorPrice: number | null; // cents
  reverseStartDate: Date | null;
}

export type ImportRowResult =
  | { ok: true; data: ImportItemData; warnings: string[] }
  | { ok: false; error: string };

export interface ImportRowContext {
  saleId: string;
  organizerId: string;
  /** Max photo URLs kept per item (see importPhotoCapForTier). */
  maxPhotos: number;
  /** bulk-import requires a price on fixed-price rows; the legacy route never did. */
  requirePrice: boolean;
  /** Injectable clock for tests. */
  now?: Date;
}

const clean = (v: unknown): string => (typeof v === 'string' ? v.trim() : '');

/**
 * Strict money parse. Accepts a plain amount with an optional leading "$", optional US thousands commas and
 * an optional trailing "USD": "25", "25.9", "25.99", ".50", "$1,250.00", "25.99 USD". Everything else is
 * rejected (NaN) so the row is reported instead of silently importing a wrong price:
 *   - exponent / scientific forms ("1e3"), negatives ("-5", "(5)"), signs, garbage ("abc", "12abc")
 *   - more than 2 decimal places ("1.999"), European separators ("1.234,56", "1 234"), misplaced commas ("1,2,3")
 *   - values over IMPORT_MAX_MONEY
 * The old lenient parse stripped every non-digit, so "1e3" became 13 and "1.234,56" became 1.234.
 * null = empty, NaN = invalid.
 */
const IMPORT_MONEY_RE = /^\$?\s?(?:(?:\d{1,3}(?:,\d{3})+|\d+)(?:\.\d{1,2})?|\.\d{1,2})(?:\s?usd)?$/i;
export function parseImportMoney(raw: string): number | null {
  if (!raw) return null;
  const s = raw.trim();
  if (!s) return null;
  if (!IMPORT_MONEY_RE.test(s)) return NaN;
  const parsed = parseFloat(s.replace(/usd$/i, '').replace(/[$,\s]/g, ''));
  if (!Number.isFinite(parsed) || parsed < 0 || parsed > IMPORT_MAX_MONEY) return NaN;
  return parsed;
}

function parseImportDate(raw: string): Date | null {
  if (!raw) return null;
  const d = new Date(raw);
  return isNaN(d.getTime()) ? null : d;
}

const isTruthyFlag = (raw: string): boolean => ['true', '1', 'yes', 'y'].includes(raw.toLowerCase());

/**
 * True only for an https URL that is safe to store as a photo reference. The host rules live in ONE place,
 * utils/safeFetchPublicUrl.isSafePublicUrlSyntax (https only, no credentials, port 443, real DNS name, never an
 * IP literal in any spelling, never localhost / .local / .internal / single-label), so the import path and the
 * later server-side fetch path cannot drift apart. The extra length cap keeps stored references small.
 */
export function isSafeImportPhotoUrl(raw: string): boolean {
  if (!raw || raw.length > IMPORT_MAX_URL_LENGTH) return false;
  return isSafePublicUrlSyntax(raw);
}

/**
 * Split a photoUrls cell into candidate URLs. Splits on whitespace / newline / pipe, and on a comma only when
 * the next token starts a new URL (Cloudinary transformation URLs legitimately contain commas: w_200,h_200).
 */
export function splitPhotoUrlCell(cell: string): string[] {
  return cell
    .split(/[\s|]+|,(?=\s*https?:\/\/)/i)
    .map((s) => s.trim().replace(/^,+|,+$/g, ''))
    .filter(Boolean);
}

export function buildImportItem(raw: RawImportRow, ctx: ImportRowContext): ImportRowResult {
  const now = ctx.now ?? new Date();
  const warnings: string[] = [];

  const title = clean(raw.title);
  if (!title) return { ok: false, error: 'title is required and cannot be empty' };
  if (title.length > IMPORT_MAX_TITLE) return { ok: false, error: `title is too long (max ${IMPORT_MAX_TITLE} characters)` };

  const description = clean(raw.description);
  if (description.length > IMPORT_MAX_DESCRIPTION) {
    return { ok: false, error: `description is too long (max ${IMPORT_MAX_DESCRIPTION} characters)` };
  }

  const category = clean(raw.category);
  if (category.length > IMPORT_MAX_CATEGORY) {
    return { ok: false, error: `category is too long (max ${IMPORT_MAX_CATEGORY} characters)` };
  }

  const rawCondition = clean(raw.condition).toUpperCase();
  let condition: string | null = null;
  if (rawCondition) {
    // U4: the canonical four pass through unchanged; legacy words (Like New, Good, Fair, Poor, ...) fold onto them.
    const normalizedCondition = normalizeCondition(rawCondition).condition;
    if (normalizedCondition && IMPORT_VALID_CONDITIONS.includes(normalizedCondition)) condition = normalizedCondition;
    else warnings.push(`condition "${clean(raw.condition)}" is not recognised (use ${IMPORT_VALID_CONDITIONS.join(', ')}); left blank`);
  }

  const rawStatus = clean(raw.status).toUpperCase();
  if (rawStatus && !IMPORT_ALLOWED_STATUSES.includes(rawStatus)) {
    warnings.push(`status "${clean(raw.status)}" was ignored; imported items are always saved as drafts for review`);
  }

  // Photos: stored as strings only
  const photoUrls: string[] = [];
  const photoCell = clean(raw.photoUrls);
  if (photoCell) {
    for (const candidate of splitPhotoUrlCell(photoCell)) {
      if (!isSafeImportPhotoUrl(candidate)) {
        warnings.push(`photo URL "${candidate.slice(0, 60)}${candidate.length > 60 ? '...' : ''}" was skipped (must be a public https address)`);
        continue;
      }
      if (photoUrls.includes(candidate)) continue;
      if (photoUrls.length >= ctx.maxPhotos) {
        warnings.push(`only the first ${ctx.maxPhotos} photo URLs were kept`);
        break;
      }
      photoUrls.push(candidate);
    }
  }

  // Prices
  const rawPrice = clean(raw.price);
  const price = parseImportMoney(rawPrice);
  if (rawPrice && Number.isNaN(price)) return { ok: false, error: `price "${rawPrice}" is not a valid number` };

  const rawAuctionStart = clean(raw.auctionStartPrice);
  const rawAuctionEnd = clean(raw.auctionEndTime);
  const wantsReverse = isTruthyFlag(clean(raw.reverseAuction));
  const wantsAuction = !!(rawAuctionStart || rawAuctionEnd);

  let listingType: ImportItemData['listingType'] = 'FIXED';
  let auctionStartPrice: number | null = null;
  let bidIncrement: number | undefined;
  let auctionEndTime: Date | null = null;
  let reverseDailyDrop: number | null = null;
  let reverseFloorPrice: number | null = null;
  let reverseStartDate: Date | null = null;

  if (wantsReverse && wantsAuction) {
    return { ok: false, error: 'a row cannot be both an auction and a reverse auction' };
  }

  if (wantsAuction) {
    const start = parseImportMoney(rawAuctionStart);
    if (start === null || Number.isNaN(start)) return { ok: false, error: 'auctionStartPrice is required and must be a valid number for auction rows' };
    const end = parseImportDate(rawAuctionEnd);
    if (!end) return { ok: false, error: 'auctionEndTime is required and must be a valid date/time for auction rows' };
    if (end.getTime() <= now.getTime()) return { ok: false, error: 'auctionEndTime must be in the future' };
    const rawInc = clean(raw.bidIncrement);
    let inc = parseImportMoney(rawInc);
    if (inc === null) {
      inc = 1;
    } else if (Number.isNaN(inc) || inc <= 0) {
      warnings.push(`bidIncrement "${rawInc}" is not valid; defaulted to 1`);
      inc = 1;
    }
    listingType = 'AUCTION';
    auctionStartPrice = start;
    bidIncrement = inc;
    auctionEndTime = end;
  } else if (wantsReverse) {
    if (price === null || Number.isNaN(price) || price <= 0) return { ok: false, error: 'price (the starting price) is required for reverse-auction rows' };
    const drop = parseImportMoney(clean(raw.reverseDailyDrop));
    if (drop === null || Number.isNaN(drop) || drop <= 0) return { ok: false, error: 'reverseDailyDrop is required and must be greater than 0 for reverse-auction rows' };
    const floor = parseImportMoney(clean(raw.reverseFloorPrice));
    if (floor === null || Number.isNaN(floor)) return { ok: false, error: 'reverseFloorPrice is required and must be a valid number for reverse-auction rows' };
    if (floor >= price) return { ok: false, error: 'reverseFloorPrice must be lower than the starting price' };
    const rawStartDate = clean(raw.reverseStartDate);
    if (rawStartDate) {
      reverseStartDate = parseImportDate(rawStartDate);
      if (!reverseStartDate) return { ok: false, error: `reverseStartDate "${rawStartDate}" is not a valid date` };
    }
    listingType = 'REVERSE_AUCTION';
    reverseDailyDrop = Math.round(drop * 100);
    reverseFloorPrice = Math.round(floor * 100);
  } else {
    if (ctx.requirePrice && price === null) return { ok: false, error: 'price is required and cannot be empty' };
    if (clean(raw.bidIncrement) || clean(raw.reverseDailyDrop) || clean(raw.reverseFloorPrice) || clean(raw.reverseStartDate)) {
      warnings.push('auction / reverse-auction columns were ignored because this row is not an auction (fill auctionStartPrice + auctionEndTime, or set reverseAuction to true)');
    }
  }

  const fixedPrice = price === null || Number.isNaN(price) ? null : price;

  return {
    ok: true,
    warnings,
    data: {
      saleId: ctx.saleId,
      organizerId: ctx.organizerId,
      title,
      description,
      price: fixedPrice,
      originalPrice: fixedPrice, // pricing anchor, set once at creation (same as createItem)
      category: category || null,
      condition,
      status: 'AVAILABLE',
      draftStatus: 'DRAFT',
      embedding: [], // embedding default dropped in migration -- supplied explicitly; backfilled async
      photoUrls,
      listingType,
      auctionStartPrice,
      ...(bidIncrement !== undefined ? { bidIncrement } : {}),
      auctionEndTime,
      reverseAuction: listingType === 'REVERSE_AUCTION',
      reverseDailyDrop,
      reverseFloorPrice,
      reverseStartDate,
    },
  };
}
