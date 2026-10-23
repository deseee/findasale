/**
 * Tool handlers: validate input, call the public backend API anonymously, and
 * return allow-listed public projections (see lib/publicShape.ts).
 *
 * Backend contracts (verified against packages/backend 2026-10-23):
 * - GET /api/sales            listSales: PUBLISHED, current, non-container sales. Params city, zip,
 *                             lat, lng, radius (km), startDate, endDate (filter on startDate),
 *                             saleType, minConfidence, page, limit (max 50). Returns { sales, pagination }.
 * - GET /api/sales/search     searchSales: requires q. Returns a bare array (max 20), PUBLISHED + ENDED.
 * - GET /api/sales/:id        getSale: 404 for DRAFT/CANCELLED/deleted; embargoed items removed.
 * - GET /api/sales/cities     getCities: { cities: [{ city, state, activeSales, totalSales, lastSaleDate }] }.
 * - GET /api/items/search     searchItems: q, category, condition, priceMin, priceMax, sort, limit, offset.
 *                             Published, non-embargoed items in PUBLISHED sales. Returns { data, total }.
 * - GET /api/items/:id        getItemById: 404 for hidden / draft / embargoed items.
 * - GET /api/items/categories { categories: { [name]: count } }.
 */

import { getJSON, DEFAULT_TTL_MS, LONG_TTL_MS, UpstreamError } from './lib/apiClient';
import { cacheGet, cacheSet } from './lib/cache';
import {
  isPublicActiveSale,
  isPublicItem,
  toPublicItem,
  toPublicSale,
  PublicItem,
  PublicSale,
  saleUrl,
  SITE_BASE,
} from './lib/publicShape';

export const SALE_TYPES = ['ESTATE', 'YARD', 'AUCTION', 'FLEA_MARKET', 'RETAIL', 'DORM_DASH'] as const;

const ID_PATTERN = /^[A-Za-z0-9_-]{1,64}$/;

function requireId(value: unknown, field: string): string {
  if (typeof value !== 'string' || !ID_PATTERN.test(value.trim())) {
    throw new Error(`${field} must be a FindA.Sale id (letters, numbers, - or _)`);
  }
  return value.trim();
}

function clampInt(v: unknown, def: number, min: number, max: number): number {
  const n = typeof v === 'number' ? Math.trunc(v) : def;
  if (!Number.isFinite(n)) return def;
  return Math.min(Math.max(n, min), max);
}

function isoDay(v: unknown): string | undefined {
  if (typeof v !== 'string' || v.trim() === '') return undefined;
  const d = new Date(v);
  if (Number.isNaN(d.getTime())) throw new Error(`Invalid date: ${v}. Use YYYY-MM-DD.`);
  return d.toISOString().slice(0, 10);
}

function cityMatches(saleCity: unknown, wanted?: string): boolean {
  if (!wanted) return true;
  return typeof saleCity === 'string' && saleCity.toLowerCase().includes(wanted.trim().toLowerCase());
}

// ──────────────────────────────────────────────────────────────
// Sales
// ──────────────────────────────────────────────────────────────

export interface SearchSalesArgs {
  query?: string;
  city?: string;
  zip?: string;
  lat?: number;
  lng?: number;
  radiusKm?: number;
  startDate?: string;
  endDate?: string;
  saleType?: string[];
  limit?: number;
  minConfidence?: number;
}

export interface SalesResult {
  sales: PublicSale[];
  total: number;
  browseUrl: string;
}

export async function handleSearchSales(args: SearchSalesArgs): Promise<SalesResult> {
  const limit = clampInt(args.limit, 20, 1, 50);
  const startDate = isoDay(args.startDate);
  const endDate = isoDay(args.endDate);
  const types = (args.saleType ?? []).filter((t) => (SALE_TYPES as readonly string[]).includes(t));

  if ((args.lat === undefined) !== (args.lng === undefined)) {
    throw new Error('lat and lng must be given together');
  }

  const query = args.query?.trim();
  if (query) {
    // Keyword search: backend matches title/description/tags, then we filter.
    const raw = await getJSON<any[]>('/api/sales/search', {
      q: query,
      minConfidence: args.minConfidence,
    });
    const now = new Date();
    const filtered = (Array.isArray(raw) ? raw : [])
      .filter((s) => isPublicActiveSale(s, now))
      .filter((s) => cityMatches(s.city, args.city))
      .filter((s) => !args.zip || s.zip === args.zip)
      .filter((s) => types.length === 0 || types.includes(s.saleType))
      .filter((s) => !startDate || (s.startDate && String(s.startDate).slice(0, 10) >= startDate) || s.isOngoing)
      .filter((s) => !endDate || (s.startDate && String(s.startDate).slice(0, 10) <= endDate));
    const sales = filtered.slice(0, limit).map(toPublicSale);
    return { sales, total: filtered.length, browseUrl: `${SITE_BASE}/sales` };
  }

  // Browse: one request per sale type (backend accepts a single saleType).
  const base: Record<string, unknown> = {
    city: args.city,
    zip: args.zip,
    startDate,
    endDate,
    limit,
    page: 1,
    minConfidence: args.minConfidence,
  };
  if (args.lat !== undefined && args.lng !== undefined) {
    base.lat = args.lat;
    base.lng = args.lng;
    base.radius = Math.min(Math.max(args.radiusKm ?? 25, 1), 200);
  }

  const typeList: (string | undefined)[] = types.length > 0 ? types : [undefined];
  const pages = await Promise.all(
    typeList.map((t) => getJSON<any>('/api/sales', { ...base, saleType: t }))
  );
  const now = new Date();
  const seen = new Set<string>();
  const merged: any[] = [];
  let total = 0;
  for (const page of pages) {
    total += Number(page?.pagination?.total ?? page?.total ?? 0) || 0;
    for (const s of page?.sales ?? []) {
      if (!isPublicActiveSale(s, now) || seen.has(s.id)) continue;
      seen.add(s.id);
      merged.push(s);
    }
  }
  merged.sort((a, b) => String(a.startDate ?? '').localeCompare(String(b.startDate ?? '')));

  // The browse feed skips listings without photos (directory stubs). When a city
  // browse finds nothing, fall back to the keyword index (which backs public search)
  // with the city name, still filtered to that exact city and the other filters.
  if (merged.length === 0 && args.city && args.city.trim().length >= 3 && args.lat === undefined) {
    return handleSearchSales({ ...args, query: args.city.trim() });
  }

  return {
    sales: merged.slice(0, limit).map(toPublicSale),
    total: Math.max(total, merged.length),
    browseUrl: `${SITE_BASE}/sales`,
  };
}

export interface SaleDetail extends PublicSale {
  itemCount: number;
  items: PublicItem[];
  organizerRating: number | null;
  organizerReviewCount: number | null;
  calendarUrl: string;
}

const SALE_DETAIL_ITEMS = 25;
const MAX_SALE_LOOKUPS = 10;
const SUMMARY_TTL_MS = 30 * 60_000;

export async function handleGetSale(args: { saleId: string }): Promise<SaleDetail> {
  const saleId = requireId(args.saleId, 'saleId');
  const key = `sale-detail:${saleId}`;
  const cached = cacheGet<SaleDetail>(key);
  if (cached) return cached;

  const raw = await getJSON<any>(`/api/sales/${encodeURIComponent(saleId)}`, undefined, 0);
  if (!raw || raw.status === 'DRAFT' || raw.status === 'CANCELLED' || raw.deletedAt) {
    throw new UpstreamError('Not found', 404);
  }
  const allItems: any[] = Array.isArray(raw.items) ? raw.items : [];
  const publicItems = allItems.filter((i) => isPublicItem({ ...i, sale: undefined }));
  const available = publicItems.filter((i) => !i.status || i.status === 'AVAILABLE');
  const saleRef = { title: raw.title, city: raw.city, state: raw.state };
  const detail: SaleDetail = {
    ...toPublicSale(raw),
    itemCount: publicItems.length,
    items: available.slice(0, SALE_DETAIL_ITEMS).map((i) => toPublicItem({ ...i, saleId }, saleRef)),
    organizerRating: typeof raw.organizer?.avgRating === 'number' && raw.organizer.reviewCount > 0 ? raw.organizer.avgRating : null,
    organizerReviewCount: typeof raw.organizer?.reviewCount === 'number' ? raw.organizer.reviewCount : null,
    calendarUrl: `https://api.finda.sale/api/sales/${encodeURIComponent(saleId)}/calendar.ics`,
  };
  // Mirror summary cache used by item search.
  cacheSet(`sale-summary:${saleId}`, summaryOf(raw), SUMMARY_TTL_MS);
  cacheSet(key, detail, DEFAULT_TTL_MS);
  return detail;
}

interface SaleSummary {
  id: string;
  title: string | null;
  city: string | null;
  state: string | null;
  public: boolean;
}

function summaryOf(raw: any): SaleSummary {
  return {
    id: String(raw?.id ?? ''),
    title: typeof raw?.title === 'string' ? raw.title : null,
    city: typeof raw?.city === 'string' ? raw.city : null,
    state: typeof raw?.state === 'string' ? raw.state : null,
    public: isPublicActiveSale(raw),
  };
}

/** Title/city/state for a sale, cached separately so item search does not hold full sale payloads. */
async function getSaleSummary(saleId: string): Promise<SaleSummary | null> {
  const key = `sale-summary:${saleId}`;
  const cached = cacheGet<SaleSummary>(key);
  if (cached) return cached;
  try {
    const raw = await getJSON<any>(`/api/sales/${encodeURIComponent(saleId)}`, undefined, 0);
    const summary = summaryOf(raw);
    cacheSet(key, summary, SUMMARY_TTL_MS);
    return summary;
  } catch {
    return null;
  }
}

export async function handleGetTrendingSales(args: { city?: string; saleType?: string; limit?: number }): Promise<SalesResult> {
  const limit = clampInt(args.limit, 10, 1, 25);
  const saleType = args.saleType && (SALE_TYPES as readonly string[]).includes(args.saleType) ? args.saleType : undefined;
  // Pull a wider page, then rank by recent activity (updatedAt) among current public sales.
  const page = await getJSON<any>('/api/sales', { city: args.city, saleType, limit: 50, page: 1 });
  const now = new Date();
  const ranked = (page?.sales ?? [])
    .filter((s: any) => isPublicActiveSale(s, now))
    .sort((a: any, b: any) => {
      const fav = (Number(b.favoriteCount) || 0) - (Number(a.favoriteCount) || 0);
      if (fav !== 0) return fav;
      return String(b.updatedAt ?? '').localeCompare(String(a.updatedAt ?? ''));
    });
  return { sales: ranked.slice(0, limit).map(toPublicSale), total: ranked.length, browseUrl: `${SITE_BASE}/sales` };
}

export async function handleGetSalesStartingSoon(args: { city?: string; saleType?: string; daysAhead?: number }): Promise<SalesResult> {
  const days = clampInt(args.daysAhead, 7, 1, 14);
  const today = new Date();
  const future = new Date(today.getTime() + days * 24 * 60 * 60 * 1000);
  const saleType = args.saleType && (SALE_TYPES as readonly string[]).includes(args.saleType) ? args.saleType : undefined;
  const page = await getJSON<any>('/api/sales', {
    city: args.city,
    saleType,
    startDate: today.toISOString().slice(0, 10),
    endDate: future.toISOString().slice(0, 10),
    limit: 25,
    page: 1,
  });
  const sales = (page?.sales ?? []).filter((s: any) => isPublicActiveSale(s, today)).map(toPublicSale);
  return { sales, total: Number(page?.pagination?.total ?? sales.length) || sales.length, browseUrl: `${SITE_BASE}/sales` };
}

export async function handleListCities(args: { state?: string; limit?: number } = {}): Promise<{ cities: Array<{ city: string; state: string; activeSales: number; browseUrl: string }>; total: number }> {
  const raw = await getJSON<any>('/api/sales/cities', undefined, LONG_TTL_MS);
  const cities = (raw?.cities ?? [])
    .filter((c: any) => typeof c?.city === 'string' && c.city.trim() !== '')
    .map((c: any) => ({
      city: String(c.city),
      state: String(c.state ?? ''),
      activeSales: Number(c.activeSales) || 0,
      browseUrl: `${SITE_BASE}/sales?city=${encodeURIComponent(String(c.city))}`,
    }))
    .filter((c: { state: string }) => !args.state || c.state.toUpperCase() === args.state.trim().toUpperCase())
    .sort((a: { activeSales: number }, b: { activeSales: number }) => b.activeSales - a.activeSales);
  const limit = clampInt(args.limit, 100, 1, 500);
  return { cities: cities.slice(0, limit), total: cities.length };
}

export function handleListSaleTypes(): { types: Array<{ id: string; displayName: string; description: string }> } {
  // ADR-023: the six real saleType values. Consignment is a RETAIL subtype, not a top-level type.
  return {
    types: [
      { id: 'ESTATE', displayName: 'Whole-house sale', description: 'Contents of a home sold on site, usually over a few days' },
      { id: 'YARD', displayName: 'Yard or garage sale', description: 'Casual sale of household items at a home' },
      { id: 'AUCTION', displayName: 'Auction', description: 'Items sold to the highest bidder' },
      { id: 'FLEA_MARKET', displayName: 'Flea market', description: 'Multi-vendor market event' },
      { id: 'RETAIL', displayName: 'Shop or storefront', description: 'Resale, thrift, antique or consignment shop with regular hours' },
      { id: 'DORM_DASH', displayName: 'Dorm move-out sale', description: 'Student move-out sale of dorm items' },
    ],
  };
}

export async function handleListCategories(): Promise<{ categories: Array<{ name: string; itemCount: number }>; total: number }> {
  const raw = await getJSON<any>('/api/items/categories', undefined, LONG_TTL_MS);
  const map = raw?.categories && typeof raw.categories === 'object' ? raw.categories : {};
  const categories = Object.entries(map)
    .map(([name, count]) => ({ name, itemCount: Number(count) || 0 }))
    // Top-level categories only (the backend also returns full eBay category paths).
    .filter((c) => !c.name.includes(':') && !c.name.includes('&amp;'))
    .sort((a, b) => b.itemCount - a.itemCount);
  return { categories, total: categories.length };
}

// ──────────────────────────────────────────────────────────────
// Items
// ──────────────────────────────────────────────────────────────

export interface SearchItemsArgs {
  query: string;
  category?: string;
  city?: string;
  priceMin?: number;
  priceMax?: number;
  condition?: string;
  limit?: number;
  sortBy?: 'relevance' | 'newest' | 'price_asc' | 'price_desc';
}

export interface ItemsResult {
  items: PublicItem[];
  total: number;
}

export async function handleSearchItems(args: SearchItemsArgs): Promise<ItemsResult> {
  const query = typeof args.query === 'string' ? args.query.trim() : '';
  if (!query) throw new Error('query is required');
  const limit = clampInt(args.limit, 20, 1, 50);
  if (args.priceMin !== undefined && args.priceMax !== undefined && args.priceMin > args.priceMax) {
    throw new Error('priceMin must not be greater than priceMax');
  }

  // A city filter is applied here (the item index has no city), so fetch a wider page.
  const raw = await getJSON<any>('/api/items/search', {
    q: query,
    category: args.category,
    condition: args.condition,
    priceMin: args.priceMin,
    priceMax: args.priceMax,
    sort: args.sortBy ?? 'relevance',
    limit: args.city ? 50 : limit,
    offset: 0,
  });
  const rows: any[] = (raw?.data ?? raw?.items ?? []).filter((i: any) => isPublicItem(i));

  // Sale title/city come from the sale record, which is a large payload, so it is only
  // looked up when a city filter needs it (max 10 distinct sales, cached 30 minutes).
  const summaries = new Map<string, SaleSummary | null>();
  if (args.city) {
    const saleIds = [...new Set(rows.map((i) => i.saleId).filter((id: unknown): id is string => typeof id === 'string'))].slice(0, MAX_SALE_LOOKUPS);
    await Promise.all(saleIds.map(async (id) => summaries.set(id, await getSaleSummary(id))));
  }

  const items: PublicItem[] = [];
  for (const row of rows) {
    const summary = typeof row.saleId === 'string' ? summaries.get(row.saleId) ?? null : null;
    if (summary && !summary.public) continue;
    if (args.city && !cityMatches(summary?.city, args.city)) continue;
    items.push(toPublicItem(row, summary));
    if (items.length >= limit) break;
  }
  return { items, total: args.city ? items.length : Number(raw?.total ?? items.length) || items.length };
}

export async function handleGetItem(args: { itemId: string }): Promise<PublicItem & { saleDates: { startDate: string | null; endDate: string | null } | null }> {
  const itemId = requireId(args.itemId, 'itemId');
  const raw = await getJSON<any>(`/api/items/${encodeURIComponent(itemId)}`);
  if (!isPublicItem(raw)) throw new UpstreamError('Not found', 404);
  const item = toPublicItem(raw, raw.sale ?? null);
  return {
    ...item,
    saleDates: raw.sale ? { startDate: raw.sale.startDate ?? null, endDate: raw.sale.endDate ?? null } : null,
  };
}

export async function handleFindItemForSale(args: { query: string; city?: string; maxPrice?: number; minPrice?: number }): Promise<ItemsResult> {
  return handleSearchItems({
    query: args.query,
    city: args.city,
    priceMin: args.minPrice,
    priceMax: args.maxPrice,
    limit: 10,
  });
}

export { saleUrl };
