/**
 * Tool Handler Functions
 *
 * Each tool receives input, validates, calls backend API, and returns response.
 */

import { fetchJSON } from './lib/apiClient';
import {
  SearchSalesInput,
  GetSaleInput,
  SearchItemsInput,
  GetItemInput,
  SearchSalesResponse,
  GetSaleResponse,
  SearchItemsResponse,
  GetItemResponse,
  ListCitiesResponse,
  ListSaleTypesResponse,
  ListCategoriesResponse,
  GetTrendingSalesInput,
  GetTrendingSalesResponse,
  GetSalesStartingSoonInput,
  GetSalesStartingSoonResponse,
  FindItemForSaleInput,
  FindItemForSaleResponse,
} from './types';

// ──────────────────────────────────────────────────────────────
// search_sales Handler
// ──────────────────────────────────────────────────────────────

export async function handleSearchSales(
  input: Record<string, any>
): Promise<SearchSalesResponse> {
  const {
    city,
    lat,
    lng,
    radiusKm,
    startDate,
    endDate,
    saleType,
    status,
    query,
    limit = 20,
    sortBy,
    minConfidence,
  } = input as SearchSalesInput;

  if (limit && (limit < 1 || limit > 50)) {
    throw new Error('limit must be between 1 and 50');
  }

  if (minConfidence !== undefined && (minConfidence < 0 || minConfidence > 1)) {
    throw new Error('minConfidence must be between 0.0 and 1.0');
  }

  const params: Record<string, any> = {};
  if (city) params.city = city;
  if (lat !== undefined && lng !== undefined) {
    params.lat = lat;
    params.lng = lng;
  }
  if (radiusKm !== undefined) params.radiusKm = radiusKm;
  if (startDate) params.startDate = startDate;
  if (endDate) params.endDate = endDate;
  if (saleType && saleType.length > 0) params.saleType = saleType.join(',');
  if (status) params.status = status;
  if (query) params.query = query;
  if (limit) params.limit = limit;
  if (sortBy) params.sortBy = sortBy;
  if (minConfidence !== undefined) params.minConfidence = minConfidence;

  return fetchJSON<SearchSalesResponse>('get', '/api/sales/search', params);
}

// ──────────────────────────────────────────────────────────────
// get_sale Handler
// ──────────────────────────────────────────────────────────────

export async function handleGetSale(input: Record<string, any>): Promise<GetSaleResponse> {
  const { saleId } = input as GetSaleInput;

  if (!saleId) {
    throw new Error('saleId is required');
  }

  if (typeof saleId !== 'string' || saleId.trim().length === 0) {
    throw new Error('saleId must be a non-empty string');
  }

  return fetchJSON<GetSaleResponse>('get', `/api/sales/${saleId}`);
}

// ──────────────────────────────────────────────────────────────
// search_items Handler
// ──────────────────────────────────────────────────────────────

export async function handleSearchItems(
  input: Record<string, any>
): Promise<SearchItemsResponse> {
  const {
    query,
    category,
    city,
    priceMin,
    priceMax,
    condition,
    limit = 20,
    sortBy,
  } = input as SearchItemsInput;

  if (!query) {
    throw new Error('query is required');
  }

  if (typeof query !== 'string' || query.trim().length === 0) {
    throw new Error('query must be a non-empty string');
  }

  if (limit && (limit < 1 || limit > 50)) {
    throw new Error('limit must be between 1 and 50');
  }

  const params: Record<string, any> = { query };
  if (category) params.category = category;
  if (city) params.city = city;
  if (priceMin !== undefined) params.priceMin = priceMin;
  if (priceMax !== undefined) params.priceMax = priceMax;
  if (condition && condition.length > 0) params.condition = condition.join(',');
  if (limit) params.limit = limit;
  if (sortBy) params.sortBy = sortBy;

  return fetchJSON<SearchItemsResponse>('get', '/api/items/search', params);
}

// ──────────────────────────────────────────────────────────────
// get_item Handler
// ──────────────────────────────────────────────────────────────

export async function handleGetItem(input: Record<string, any>): Promise<GetItemResponse> {
  const { itemId } = input as GetItemInput;

  if (!itemId) {
    throw new Error('itemId is required');
  }

  if (typeof itemId !== 'string' || itemId.trim().length === 0) {
    throw new Error('itemId must be a non-empty string');
  }

  return fetchJSON<GetItemResponse>('get', `/api/items/${itemId}`);
}

// ──────────────────────────────────────────────────────────────
// list_cities Handler
// ──────────────────────────────────────────────────────────────

export async function handleListCities(): Promise<ListCitiesResponse> {
  return fetchJSON<ListCitiesResponse>('get', '/api/sales/cities');
}

// ──────────────────────────────────────────────────────────────
// list_sale_types Handler
// ──────────────────────────────────────────────────────────────

export async function handleListSaleTypes(): Promise<ListSaleTypesResponse> {
  // Hardcoded per spec -- no backend call needed
  // ADR-023: real 6-value saleType enum only. CONSIGNMENT is a saleSubtype
  // under RETAIL now, not a top-level type.
  return {
    types: [
      {
        id: 'ESTATE',
        displayName: 'Estate Sale',
        description: 'Liquidation of personal property from an estate',
        icon: 'estate',
      },
      {
        id: 'YARD',
        displayName: 'Yard Sale',
        description: 'Casual outdoor sale of household items',
        icon: 'yard',
      },
      {
        id: 'AUCTION',
        displayName: 'Auction',
        description: 'Competitive bidding sale with hammer price',
        icon: 'auction',
      },
      {
        id: 'FLEA_MARKET',
        displayName: 'Flea Market',
        description: 'Multi-vendor marketplace event',
        icon: 'flea_market',
      },
      {
        id: 'RETAIL',
        displayName: 'Retail / Storefront',
        description: 'Permanent storefront or resale shop',
        icon: 'retail',
      },
      {
        id: 'DORM_DASH',
        displayName: 'Dorm Dash',
        description: 'Student move-out sale of dorm items',
        icon: 'dorm_dash',
      },
    ],
  };
}

// ──────────────────────────────────────────────────────────────
// get_trending_sales Handler
// ──────────────────────────────────────────────────────────────

const SITE_BASE = 'https://finda.sale';

export async function handleGetTrendingSales(
  input: Record<string, any>
): Promise<GetTrendingSalesResponse> {
  const { city, saleType, limit = 10 } = input as GetTrendingSalesInput;

  const clampedLimit = Math.min(Math.max(1, limit), 25);

  const params: Record<string, any> = {
    status: 'PUBLISHED',
    orderBy: 'updatedAt',
    limit: clampedLimit,
  };
  if (city) params.city = city;
  if (saleType) params.saleType = saleType;

  // Call listSales endpoint which accepts these params
  const raw = await fetchJSON<any>('get', '/api/sales', params);

  const sales = (raw.sales || []).map((s: any) => ({
    id: s.id,
    title: s.title,
    city: s.city,
    state: s.state,
    saleType: s.saleType || s.type || 'UNKNOWN',
    startDate: s.startDate,
    endDate: s.endDate,
    itemCount: s._count?.items ?? s.itemCount ?? 0,
    url: SITE_BASE + '/sales/' + s.id,
  }));

  return { sales, total: raw.total ?? sales.length };
}

// ──────────────────────────────────────────────────────────────
// get_sales_starting_soon Handler
// ──────────────────────────────────────────────────────────────

export async function handleGetSalesStartingSoon(
  input: Record<string, any>
): Promise<GetSalesStartingSoonResponse> {
  const { city, saleType, daysAhead = 7 } = input as GetSalesStartingSoonInput;

  const clampedDays = Math.min(Math.max(1, daysAhead), 14);

  const today = new Date();
  const future = new Date(today.getTime() + clampedDays * 24 * 60 * 60 * 1000);
  const todayStr = today.toISOString().split('T')[0];
  const futureStr = future.toISOString().split('T')[0];

  const params: Record<string, any> = {
    status: 'PUBLISHED',
    startDate: todayStr,
    endDate: futureStr,
    limit: 25,
  };
  if (city) params.city = city;
  if (saleType) params.saleType = saleType;

  const raw = await fetchJSON<any>('get', '/api/sales', params);

  const sales = (raw.sales || []).map((s: any) => ({
    id: s.id,
    title: s.title,
    city: s.city,
    state: s.state,
    saleType: s.saleType || s.type || 'UNKNOWN',
    startDate: s.startDate,
    endDate: s.endDate,
    url: SITE_BASE + '/sales/' + s.id,
  }));

  return { sales, total: raw.total ?? sales.length };
}

// ──────────────────────────────────────────────────────────────
// find_item_for_sale Handler
// ──────────────────────────────────────────────────────────────

export async function handleFindItemForSale(
  input: Record<string, any>
): Promise<FindItemForSaleResponse> {
  const { query, city, maxPrice, minPrice } = input as FindItemForSaleInput;

  if (!query || typeof query !== 'string' || query.trim().length === 0) {
    throw new Error('query is required');
  }

  const params: Record<string, any> = { q: query.trim() };
  if (city) params.city = city;
  if (maxPrice !== undefined) params.priceMax = maxPrice;
  if (minPrice !== undefined) params.priceMin = minPrice;

  const raw = await fetchJSON<any>('get', '/api/items/search', params);

  const rawItems = raw.items || raw.data || [];

  const items = rawItems.map((item: any) => ({
    itemName: item.title,
    description: item.description ?? null,
    price: item.price != null ? Number(item.price) : null,
    condition: item.condition ?? null,
    saleTitle: item.sale?.title ?? item.saleName ?? '',
    saleCity: item.sale?.city ?? item.saleCity ?? '',
    saleState: item.sale?.state ?? item.saleState ?? '',
    saleEndDate: item.sale?.endDate ?? item.saleEndDate ?? '',
    saleUrl: item.sale?.id
      ? SITE_BASE + '/sales/' + item.sale.id
      : item.saleId
      ? SITE_BASE + '/sales/' + item.saleId
      : '',
  }));

  return { items, total: raw.total ?? items.length };
}

// ──────────────────────────────────────────────────────────────
// list_categories Handler
// ──────────────────────────────────────────────────────────────

export async function handleListCategories(): Promise<ListCategoriesResponse> {
  // Try to fetch from backend first
  try {
    const result = await fetchJSON<ListCategoriesResponse>('get', '/api/items/categories');
    return result;
  } catch (err) {
    // Fallback to hardcoded eBay categories if backend route doesn't exist
    console.warn('Failed to fetch categories from backend, using hardcoded list');
    return {
      categories: [
        { id: 'Furniture', name: 'Furniture', itemCount: 0 },
        { id: 'Collectibles', name: 'Collectibles', itemCount: 0 },
        { id: 'Vintage', name: 'Vintage', itemCount: 0 },
        { id: 'Art', name: 'Art & Antiques', itemCount: 0 },
        { id: 'Jewelry', name: 'Jewelry & Watches', itemCount: 0 },
        { id: 'Books', name: 'Books & Media', itemCount: 0 },
        { id: 'Decor', name: 'Home Decor', itemCount: 0 },
        { id: 'Tools', name: 'Tools & Hardware', itemCount: 0 },
        { id: 'Sporting', name: 'Sporting Goods', itemCount: 0 },
        { id: 'Toys', name: 'Toys & Games', itemCount: 0 },
      ],
      total: 10,
    };
  }
}
