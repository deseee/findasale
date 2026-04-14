/**
 * ebayTaxonomyService.ts — Phase C Taxonomy + Catalog + AI Suggest
 *
 * Provides three services for eBay listing data parity:
 * 1. getAspectsForCategory — fetch item aspect schema for a category
 * 2. searchCatalogProduct — find EPID by UPC/ISBN/MPN/brand
 * 3. suggestIdentifiersFromItem — extract identifiers using Claude Haiku
 *
 * Uses in-memory caching with TTL for aspects.
 */

import { prisma } from '../lib/prisma';
import { isAnthropicAvailable } from './cloudAIService';
import axios from 'axios';

// ── Simple in-memory aspect cache (24h TTL) ──────────────────────────────────

interface CachedAspect {
  data: any;
  expiresAt: number;
}

const aspectCache = new Map<string, CachedAspect>();

function getCachedAspects(categoryId: string): any | null {
  const cached = aspectCache.get(categoryId);
  if (cached && cached.expiresAt > Date.now()) {
    return cached.data;
  }
  if (cached) {
    aspectCache.delete(categoryId);
  }
  return null;
}

function setCachedAspects(categoryId: string, data: any): void {
  const expiresAt = Date.now() + 24 * 60 * 60 * 1000; // 24 hours
  aspectCache.set(categoryId, { data, expiresAt });
}

// ── Taxonomy API: Get aspects for category ────────────────────────────────────

/**
 * Fetch eBay's item aspect schema for a given category ID.
 * Returns the raw eBay response or parsed aspects.
 * Uses in-memory cache with 24h TTL.
 *
 * @param accessToken eBay OAuth access token
 * @param categoryId eBay category ID
 * @returns Aspect schema or null on error
 */
export async function getAspectsForCategory(
  accessToken: string,
  categoryId: string
): Promise<any | null> {
  try {
    // Check cache first
    const cached = getCachedAspects(categoryId);
    if (cached) {
      return cached;
    }

    // Fetch from eBay Taxonomy API
    const response = await axios.get(
      `https://api.ebay.com/commerce/taxonomy/v1/category_tree/0/get_item_aspects_for_category`,
      {
        params: { category_id: categoryId },
        headers: {
          Authorization: `Bearer ${accessToken}`,
          'Content-Type': 'application/json',
        },
        timeout: 10000,
      }
    );

    const aspects = response.data;

    // Cache the result
    setCachedAspects(categoryId, aspects);

    return aspects;
  } catch (error: any) {
    console.error(`[ebayTaxonomy] getAspectsForCategory error for ${categoryId}:`, error.message || error);
    return null;
  }
}

// ── Catalog API: Search for product by identifier ────────────────────────────

interface CatalogSearchParams {
  upc?: string;
  isbn?: string;
  ean?: string;
  mpn?: string;
  brand?: string;
}

interface CatalogProduct {
  epid: string;
  title: string;
  image?: string;
  brand?: string;
}

/**
 * Search eBay's Catalog API for a product by UPC, ISBN, EAN, MPN, or brand+MPN.
 * Returns top 3 matches (if multiple found) with epid, title, image, brand.
 *
 * @param accessToken eBay OAuth access token
 * @param params Search parameters (at least one required)
 * @returns Array of matching products or empty array
 */
export async function searchCatalogProduct(
  accessToken: string,
  params: CatalogSearchParams
): Promise<CatalogProduct[]> {
  try {
    // Validate at least one param provided
    if (!params.upc && !params.isbn && !params.ean && !params.mpn && !params.brand) {
      console.warn('[ebayTaxonomy] searchCatalogProduct: no search parameters provided');
      return [];
    }

    // Determine endpoint and query param
    let searchUrl = 'https://api.ebay.com/commerce/catalog/v1_beta/product_summary/search';
    let queryParam: any = {};

    // Priority: GTIN (UPC/ISBN/EAN) > MPN+brand
    if (params.upc || params.isbn || params.ean) {
      const gtin = params.upc || params.isbn || params.ean;
      queryParam.gtin = gtin;
    } else if (params.mpn && params.brand) {
      queryParam.mpn = params.mpn;
      queryParam.brand = params.brand;
    } else if (params.mpn) {
      queryParam.mpn = params.mpn;
    }

    const response = await axios.get(searchUrl, {
      params: { ...queryParam, limit: 3 },
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
      timeout: 10000,
    });

    const products = response.data.productSummaries ?? [];

    // Parse each product: extract epid, title, image, brand
    const results: CatalogProduct[] = products.slice(0, 3).map((p: any) => ({
      epid: p.epid,
      title: p.title,
      image: p.imageUrl,
      brand: p.brand,
    }));

    return results;
  } catch (error: any) {
    console.error('[ebayTaxonomy] searchCatalogProduct error:', error.message || error);
    return [];
  }
}

// ── AI Suggest: Extract identifiers from item data ───────────────────────────

interface ItemIdentifiersInput {
  id: string;
  title: string;
  description: string | null;
  tags: string[];
  brand: string | null;
  mpn: string | null;
  upc: string | null;
  isbn: string | null;
  ean: string | null;
}

/**
 * Use Claude Haiku to extract product identifiers from item data.
 * Only suggests identifiers that are NOT already filled.
 * Returns { brand?, mpn?, upc?, isbn?, ean? } with only new suggestions.
 *
 * @param item Item object with title, description, tags, and existing identifier fields
 * @returns Object with suggested identifiers (only new ones, not overwriting existing)
 */
export async function suggestIdentifiersFromItem(item: ItemIdentifiersInput): Promise<Record<string, string>> {
  if (!isAnthropicAvailable()) {
    return {};
  }

  try {
    // Build context from item
    const titleContext = item.title ? `Title: ${item.title}` : '';
    const descContext = item.description ? `Description: ${item.description.substring(0, 500)}` : '';
    const tagsContext = item.tags && item.tags.length > 0 ? `Tags: ${item.tags.join(', ')}` : '';

    const prompt = `Extract product identifiers from this secondhand-item listing. Return JSON only.

${titleContext}
${descContext}
${tagsContext}

Return: { "brand": string | null, "mpn": string | null, "upc": string | null, "isbn": string | null, "ean": string | null }
Only return identifiers that appear explicitly in the text. If unclear, return null for that field.`;

    const response = await axios.post(
      'https://api.anthropic.com/v1/messages',
      {
        model: process.env.ANTHROPIC_MODEL || 'claude-haiku-4-5-20251001',
        max_tokens: 300,
        messages: [
          {
            role: 'user',
            content: prompt,
          },
        ],
      },
      {
        headers: {
          'x-api-key': process.env.ANTHROPIC_API_KEY as string,
          'anthropic-version': '2023-06-01',
          'content-type': 'application/json',
        },
        timeout: 15000,
      }
    );

    const content: string = response.data.content?.[0]?.text ?? '';

    // Parse JSON response (strip markdown if present)
    const raw = content.replace(/```json\n?|\n?```/g, '').trim();
    const parsed = JSON.parse(raw);

    // Filter out fields that are already populated in the item
    const suggestions: Record<string, string> = {};

    if (parsed.brand && !item.brand) {
      suggestions.brand = parsed.brand;
    }
    if (parsed.mpn && !item.mpn) {
      suggestions.mpn = parsed.mpn;
    }
    if (parsed.upc && !item.upc) {
      suggestions.upc = parsed.upc;
    }
    if (parsed.isbn && !item.isbn) {
      suggestions.isbn = parsed.isbn;
    }
    if (parsed.ean && !item.ean) {
      suggestions.ean = parsed.ean;
    }

    return suggestions;
  } catch (error: any) {
    // Haiku extraction is best-effort — return empty object on error
    console.warn('[ebayTaxonomy] suggestIdentifiersFromItem error:', error.message || error);
    return {};
  }
}
