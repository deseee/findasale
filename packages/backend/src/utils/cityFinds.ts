/**
 * cityFinds.ts (ADR-074 city cluster wiring, 2026-09-29)
 *
 * Pure helpers behind GET /api/cities/:slug/finds and the city directory filter.
 *
 * WHY THIS EXISTS: ADR-074 section 7.2 recommends computing "Top Finds" on demand from the Item
 * table for the MVP. The MetroTopFinds table cannot back a public "finds" section honestly:
 *   - its eBay rows are ACTIVE national keyword listings stamped onto every metro (metroSyncCron
 *     documents "Results are national listings"), not sold items and not local to the city;
 *   - its own-item rows were selected by STATE only, so "Grand Rapids" showed all of Michigan.
 * These helpers select real, currently available items from PUBLISHED sales whose canonical city
 * slug equals the page slug, and describe savings only when the item carries a real original price.
 *
 * No prisma import: keep this file pure so it is unit-testable without a database.
 */

import { CITY_SLUG_PATTERN, canonicalCitySlug } from './citySlug';

export interface ParsedCitySlug {
  /** Upper-case two letter region code, e.g. "MI". */
  stateCode: string;
  /** Title-cased display name derived from the slug, e.g. "Grand Rapids". */
  cityName: string;
  /**
   * The most distinctive word of the city name, used as a cheap SQL `contains` pre-filter
   * ("rapids" for grand-rapids-mi, "louis" for st-louis-mo). The exact match is always
   * re-checked with canonicalCitySlug afterwards.
   */
  matchToken: string;
}

/** Parse "grand-rapids-mi". Null when the slug does not satisfy the canonical contract. */
export function parseCitySlug(input: string | null | undefined): ParsedCitySlug | null {
  if (!input) return null;
  const slug = input.toLowerCase();
  if (!CITY_SLUG_PATTERN.test(slug)) return null;
  const parts = slug.split('-');
  const stateCode = parts[parts.length - 1].toUpperCase();
  const words = parts.slice(0, -1).filter(Boolean);
  if (words.length === 0) return null;
  const cityName = words.map((w) => w.charAt(0).toUpperCase() + w.slice(1)).join(' ');
  // Longest word wins; on a tie the later word wins (so "st-louis" picks "louis").
  let matchToken = words[0];
  for (const w of words) {
    if (w.length >= matchToken.length) matchToken = w;
  }
  return { stateCode, cityName, matchToken };
}

/** True when a sale's stored city + state canonicalize to exactly this slug. */
export function slugMatchesCity(slug: string, city: string | null | undefined, state: string | null | undefined): boolean {
  return canonicalCitySlug(city, state) === slug.toLowerCase();
}

/**
 * Savings percent for display, or null when it must not be claimed.
 * Requires a real original price above the current price. A cut under 5% is noise, and a cut over
 * 90% is far more likely a stale or mistyped original price than a real deal, so neither is shown.
 */
export function computeSavingsPct(price: number | null | undefined, originalPrice: number | null | undefined): number | null {
  if (typeof price !== 'number' || typeof originalPrice !== 'number') return null;
  if (!Number.isFinite(price) || !Number.isFinite(originalPrice)) return null;
  if (price <= 0 || originalPrice <= price) return null;
  const pct = Math.round(((originalPrice - price) / originalPrice) * 100);
  if (pct < 5 || pct > 90) return null;
  return pct;
}

export interface CityFindInput {
  id: string;
  title: string;
  price: number | null;
  originalPrice: number | null;
  condition: string | null;
  category: string | null;
  photoUrls: string[];
  saleId: string | null;
  createdAt: Date | string;
  sale: { id?: string; title?: string | null; city: string | null; state: string | null } | null;
}

export interface CityFind {
  id: string;
  title: string;
  price: number;
  originalPrice: number | null;
  savingsPct: number | null;
  condition: string | null;
  category: string | null;
  photoUrl: string;
  saleId: string | null;
  saleTitle: string | null;
}

/**
 * Keep only items whose sale really belongs to this city, then rank: items with a real savings
 * percent first (largest first), then the rest newest first. Dedupes by id.
 */
export function rankCityFinds(items: CityFindInput[], slug: string, limit = 12): CityFind[] {
  const seen = new Set<string>();
  const rows: Array<CityFind & { _t: number }> = [];
  for (const it of items) {
    if (!it || seen.has(it.id)) continue;
    if (!it.sale || !slugMatchesCity(slug, it.sale.city, it.sale.state)) continue;
    if (typeof it.price !== 'number' || !Number.isFinite(it.price) || it.price <= 0) continue;
    const photoUrl = Array.isArray(it.photoUrls) ? it.photoUrls.find((u) => typeof u === 'string' && u.length > 0) : undefined;
    if (!photoUrl) continue;
    seen.add(it.id);
    const savingsPct = computeSavingsPct(it.price, it.originalPrice);
    rows.push({
      id: it.id,
      title: it.title,
      price: it.price,
      originalPrice: savingsPct !== null ? it.originalPrice : null,
      savingsPct,
      condition: it.condition ?? null,
      category: it.category ?? null,
      photoUrl,
      saleId: it.saleId ?? null,
      saleTitle: it.sale.title ?? null,
      _t: new Date(it.createdAt).getTime() || 0,
    });
  }
  rows.sort((a, b) => {
    const sa = a.savingsPct ?? -1;
    const sb = b.savingsPct ?? -1;
    if (sa !== sb) return sb - sa;
    return b._t - a._t;
  });
  return rows.slice(0, Math.max(0, limit)).map(({ _t, ...rest }) => rest);
}

/**
 * Prisma `where` fragment for the city directory: the organizer address must name the city AND
 * carry this region code. Region codes are matched case-sensitively in the ", MI " / ", MI" / " MI"
 * positions so "MI" cannot match "Miami" or "Minnesota". Without this, "Grand Rapids" in Michigan
 * also listed Grand Rapids, Minnesota businesses.
 */
export function directoryAddressWhere(cityName: string, stateCode: string) {
  const st = stateCode.toUpperCase();
  return {
    AND: [
      { address: { contains: cityName, mode: 'insensitive' as const } },
      {
        OR: [
          { address: { contains: `, ${st} ` } },
          { address: { endsWith: `, ${st}` } },
          { address: { endsWith: ` ${st}` } },
        ],
      },
    ],
  };
}
