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
  } = input as SearchSalesInput;

  if (limit && (limit < 1 || limit > 50)) {
    throw new Error('limit must be between 1 and 50');
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
  // Hardcoded per spec — no backend call needed
  return {
    types: [
      {
        id: 'ESTATE',
        displayName: 'Estate Sale',
        description: 'Liquidation of personal property from an estate',
        icon: '🏛️',
      },
      {
        id: 'YARD',
        displayName: 'Yard Sale',
        description: 'Casual outdoor sale of household items',
        icon: '🏠',
      },
      {
        id: 'AUCTION',
        displayName: 'Auction',
        description: 'Competitive bidding sale with hammer price',
        icon: '🔨',
      },
      {
        id: 'FLEA_MARKET',
        displayName: 'Flea Market',
        description: 'Multi-vendor marketplace event',
        icon: '🎪',
      },
      {
        id: 'CONSIGNMENT',
        displayName: 'Consignment',
        description: 'Items sold on behalf of consignors',
        icon: '🤝',
      },
    ],
  };
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
