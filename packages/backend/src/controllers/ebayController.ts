import crypto from 'crypto';
import https from 'https';
import express, { Request, Response } from 'express';
import sanitizeHtml from 'sanitize-html';
import { AuthRequest } from '../middleware/auth';
import { prisma } from '../lib/prisma';
import { getWatermarkedUrl, getWatermarkedUrlWithQR } from '../utils/cloudinaryWatermark';
import { canRemoveWatermark, WatermarkPolicyOrganizer } from '../utils/watermarkPolicy';
import { classifyEbayShipping } from '../utils/ebayShippingClassifier';
import { getIO } from '../lib/socket';
import { isEbayRateLimited, trackEbayCall, getEbayRateLimitStatus } from '../lib/ebayRateLimiter';
import {
  parseWeightTiers,
  classifyPolicy,
  matchWeightTier,
  toOunces,
  ParsedWeightTier,
  EbayFulfillmentPolicySummary,
  WeightTierMapping,
} from '../utils/ebayPolicyParser';
import { getTierLimit, SubscriptionTier } from '../constants/tierLimits';
import { domainToL1 } from '../config/ebayCategories';
import { notifyFacebookExportedItemSold } from '../services/facebookNudgeService';
import { ensureCalculatedFulfillmentPolicy } from '../services/ebayCalculatedPolicyService';
import { ensureFvfFlatRatePolicy } from '../services/ebayFlatRatePolicyService';
import {
  computeCheapestForOrigin,
  USPS_RATE_EFFECTIVE_DATE,
  UPS_RATE_EFFECTIVE_DATE,
  FEDEX_RATE_EFFECTIVE_DATE,
} from '../services/ebayRateEstimateService';
import { resolveItemShipping } from '../services/ebayShippingResolver';
import { computeNetProceeds, suggestPriceForMargin } from '../services/ebayNetProceedsService';
import { estimatePackageProfile } from '../services/ebayPackageEstimateService';
import { modelTokenFrom } from '../services/ebayCatalogLookup';

/**
 * Feature #229: AI Price Comps Tool
 * Feature #244 Phase 1: eBay CSV Export
 * Feature #244 Phase 2: eBay OAuth + Inventory API Push
 *
 * eBay API integration for price comparison, CSV export, OAuth, and direct inventory push.
 */

// EPN Campaign ID for affiliate tracking — S725: kept
const EBAY_EPN_CAMPID = '5339148447';

// Token cache for eBay OAuth (simple in-memory, will be replaced with Redis in production)
interface CachedToken {
  token: string;
  expiresAt: number;
}

let ebayTokenCache: CachedToken | null = null;

// In-memory cache for Finding API comps results (1-hour TTL)
// Prevents rate-limit errors (errorId 10001) when the same title is looked up repeatedly
const findingApiCache = new Map<string, { result: any; expiresAt: number }>();
const FINDING_API_CACHE_TTL_MS = 60 * 60 * 1000; // 1 hour

/**
 * Builds the eBay Custom Label (SKU) for a given item and organizer.
 * Base: FAS-{itemId}
 * Optional appends (organizer toggles): date, costBasis, roomTag
 * Format: "FAS-abc123 2026-05-20 $10.50 Living Room"
 */
function buildCustomLabel(
  itemId: string,
  organizer: { skuAppendDate?: boolean; skuAppendCost?: boolean; skuAppendLocation?: boolean },
  item: { createdAt?: Date | null; costBasis?: number | null; roomTag?: string | null }
): string {
  const parts: string[] = [`FAS-${itemId}`];
  if (organizer.skuAppendDate && item.createdAt) {
    parts.push(item.createdAt.toISOString().slice(0, 10)); // YYYY-MM-DD
  }
  if (organizer.skuAppendCost && item.costBasis != null) {
    parts.push(`$${item.costBasis.toFixed(2)}`);
  }
  if (organizer.skuAppendLocation && item.roomTag) {
    parts.push(item.roomTag);
  }
  return parts.join(' ');
}


// Decode common HTML entities (eBay Description arrives entity-encoded inside XML)
function decodeHtmlEntities(str: string): string {
  return str
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&apos;/g, "'")
    .replace(/&nbsp;/g, ' ');
}

// Module-scope XML helpers (used in Trading API + Shopping API parsing)
function xmlVal(block: string, tag: string): string | null {
  const m = block.match(new RegExp(`<${tag}(?:\\s[^>]*)?>([\\s\\S]*?)<\\/${tag}>`));
  return m ? m[1].trim() : null;
}
function xmlAll(block: string, tag: string): string[] {
  const results: string[] = [];
  const re = new RegExp(`<${tag}(?:\\s[^>]*)?>([\\s\\S]*?)<\\/${tag}>`, 'g');
  let m: RegExpExecArray | null;
  while ((m = re.exec(block)) !== null) results.push(m[1]);
  return results;
}

// Condition mapping: FindA.Sale grade to eBay condition ID
const CONDITION_ID_MAP: Record<string, string> = {
  'S': '1000', // New
  'A': '3000', // Like New
  'B': '4000', // Very Good
  'C': '5000', // Good
  'D': '6000', // Acceptable
};

// Secondary category map: tag keywords to eBay category IDs.
// DISABLED (2026-06-13): these values are ROOT categories, not leaves. eBay
// rejects non-leaf secondary categories with errorId 25005 "category selected
// is not a leaf category" (param SECONDARY_CATEGORY_ID), so every item tagged
// with these always failed to publish. The offer payload no longer reads this
// map. Do NOT re-enable until the values are replaced with real eBay LEAF
// category IDs (one specific leaf per tag, verified via the Taxonomy API).
// Kept here as a placeholder for that future leaf-id mapping.
const SECONDARY_CATEGORY_MAP: Record<string, string> = {
  vintage: '1',          // Collectibles root — NON-LEAF, invalid as secondary
  antique: '20081',      // Antiques root — NON-LEAF, invalid as secondary
  handmade: '14339',     // Crafts root — NON-LEAF, invalid as secondary
  rare: '1',             // Collectibles root — NON-LEAF, invalid as secondary
  collectible: '1',      // Collectibles root — NON-LEAF, invalid as secondary
};

// ── Vercel Proxy Helpers ────────────────────────────────────────────────────
// Railway DNS cannot resolve api.ebay.com directly, so all eBay API calls route
// through the Vercel proxy at /api/proxy/ebay. These helpers ensure consistent
// URL and header construction across all 35+ call sites.
const ebayProxyUrl = (path: string): string =>
  `${process.env.FRONTEND_URL ?? 'https://finda.sale'}/api/proxy/ebay?path=${path}`;

const ebayProxyHeaders = (): Record<string, string> => {
  const secret = process.env.EBAY_PROXY_SECRET;
  return secret ? { 'X-Proxy-Secret': secret } : {};
};

// HTML sanitizer for descriptions
function sanitizeDescriptionForEbay(raw: string | null | undefined): string {
  if (!raw) return '';
  const clean = sanitizeHtml(raw, {
    allowedTags: ['p', 'br', 'b', 'strong', 'em', 'i', 'u', 'ul', 'ol', 'li', 'h1', 'h2', 'h3', 'h4', 'a', 'img', 'table', 'tr', 'td', 'th', 'tbody', 'thead'],
    allowedAttributes: { a: ['href'], img: ['src', 'alt'] },
    allowedSchemes: ['http', 'https'],
  });
  return clean.length > 4000 ? clean.substring(0, 4000) : clean;
}

// Build condition description for eBay from grade, notes, and tags
function buildConditionDescription(item: { condition: string | null; conditionGrade: string | null; description: string | null; conditionNotes: string | null; tags: string[] }): string | undefined {
  if (item.condition === 'NEW' || !item.condition) return undefined;
  const parts: string[] = [];
  if (item.conditionGrade) {
    const gradeLabels: Record<string, string> = { S: 'Grade S — Mint condition', A: 'Grade A — Excellent condition', B: 'Grade B — Very good condition', C: 'Grade C — Good condition', D: 'Grade D — Fair condition' };
    parts.push(gradeLabels[item.conditionGrade] || `Grade ${item.conditionGrade}`);
  }
  if (item.conditionNotes) parts.push(item.conditionNotes);
  if (item.description) {
    const plain = item.description.replace(/<[^>]*>/g, '').trim();
    if (plain) parts.push(plain.substring(0, 400));
  }
  const relevantTags = item.tags.filter(t => ['vintage', 'antique', 'handmade', 'rare', 'collectible', 'signed', 'limited'].includes(t.toLowerCase()));
  if (relevantTags.length) parts.push(`Notes: ${relevantTags.join(', ')}`);
  const joined = parts.join('\n\n');
  return joined.length > 1000 ? joined.substring(0, 1000) : joined;
}

/**
 * Get or refresh eBay OAuth access token using Client Credentials flow
 */
export async function getEbayAccessToken(): Promise<string | null> {
  try {
    const clientId = process.env.EBAY_CLIENT_ID;
    const clientSecret = process.env.EBAY_CLIENT_SECRET;

    // Mock fallback if credentials not set
    if (!clientId || !clientSecret) {
      console.warn('[eBay] EBAY_CLIENT_ID or EBAY_CLIENT_SECRET not configured');
      return null;
    }

    // Return cached token if still valid
    if (ebayTokenCache && ebayTokenCache.expiresAt > Date.now()) {
      return ebayTokenCache.token;
    }

    // Route through Vercel proxy — Railway's network blocks api.ebay.com at DNS level.
    // Vercel holds its own copy of EBAY_CLIENT_ID/SECRET and fetches the token directly.
    // Railway just asks "give me a token" — no credential forwarding needed.
    // NOTE: Mode 1 uses ?action=token directly; do NOT route through ebayProxyUrl()
    // which prepends ?path= and would corrupt the URL into ?path=?action=token.
    const frontendUrl = process.env.FRONTEND_URL ?? 'https://finda.sale';
    const proxyRes = await fetch(
      `${frontendUrl}/api/proxy/ebay?action=token`,
      {
        method: 'POST',
        headers: ebayProxyHeaders(),
      }
    );

    if (!proxyRes.ok) {
      const body = await proxyRes.text().catch(() => '(unreadable)');
      console.error(`[eBay] Token fetch via proxy failed: ${proxyRes.status} — body: ${body.slice(0, 300)}`);
      return null;
    }

    const data = await proxyRes.json() as any;
    if (!data?.access_token) return null;
    const expiresIn = data.expires_in || 7200; // Default 2 hours

    ebayTokenCache = {
      token: data.access_token,
      expiresAt: Date.now() + (expiresIn - 300) * 1000, // Refresh 5 minutes before expiry
    };

    return ebayTokenCache.token;
  } catch (error: any) {
    // Suppress verbose stack for known Railway→eBay network block (ENOTFOUND api.ebay.com).
    // Log a single terse line instead of a full stack trace.
    const isNetworkBlock = error?.cause?.code === 'ENOTFOUND' && error?.cause?.hostname === 'api.ebay.com';
    if (isNetworkBlock) {
      console.warn('[eBay] api.ebay.com unreachable from Railway — eBay sync disabled until proxy routing resolved');
    } else {
      console.error('[eBay] Token fetch error:', error);
    }
    return null;
  }
}

/**
 * Fetch eBay price comps for an item based on title, category, condition
 * Exported for use by jobs and controllers alike
 *
 * Used by:
 * - getComps route handler (HTTP endpoint)
 * - fetchEbayCompsForItem job (async background job)
 */
export async function fetchEbayPriceComps(params: {
  title: string;
  category?: string;
  condition?: string;
  maxResults?: number;
}): Promise<{
  min: number;
  max: number;
  median: number;
  count: number;
  suggestedPrice: number;
  compsRunAt: string;
  listings: Array<{ title: string; price: number; condition: string; url: string; imageUrl?: string }>;
  isMockData?: boolean;
  message?: string;
}> {
  return getEbayPriceComps(params.title, params.condition, params.maxResults || 10);
}

/**
 * Internal: Get eBay price comps for an item based on title and condition
 *
 * Uses the eBay Browse API to search active fixed-price listings.
 * Returns live eBay listings with prices, images, and raw itemWebUrl listing URLs.
 * EPN affiliate tracking parameters are appended client-side (EbayCompTiles.tsx)
 * using the current EPN direct-link format — rover.ebay.com is deprecated.
 *
 * Note: findCompletedItems (Finding API XML) would return actual sold prices but
 * requires separate eBay production approval; Browse API is the modern replacement.
 */
async function getEbayPriceComps(
  title: string,
  conditionGrade: string | null | undefined,
  limit: number = 10
): Promise<{
  min: number;
  max: number;
  median: number;
  count: number;
  suggestedPrice: number;
  compsRunAt: string;
  listings: Array<{ title: string; price: number; condition: string; url: string; imageUrl?: string }>;
  isMockData?: boolean;
  message?: string;
}> {
  try {
    const clientId = process.env.EBAY_CLIENT_ID;
    const clientSecret = process.env.EBAY_CLIENT_SECRET;

    // Fallback to mock data if no credentials (clientId is used as APP_ID for Finding API)
    if (!clientId || !clientSecret) {
      console.warn('[eBay] EBAY_CLIENT_ID or EBAY_CLIENT_SECRET not configured for comps');
      return {
        min: 25,
        max: 75,
        median: 45,
        count: 0,
        suggestedPrice: 45,
        compsRunAt: new Date().toISOString(),
        listings: [],
        isMockData: true,
        message: 'eBay credentials not configured — showing sample data',
      };
    }

    // Check in-memory cache first to avoid rate-limit errors (errorId 10001)
    const cacheKey = `${title.toLowerCase().trim()}:${conditionGrade ?? ''}:${limit}`;
    const cached = findingApiCache.get(cacheKey);
    if (cached && cached.expiresAt > Date.now()) {
      return cached.result;
    }

    // Get OAuth token (reuses cached token from getEbayAccessToken)
    const token = await getEbayAccessToken();
    if (!token) {
      return {
        min: 25, max: 75, median: 45, count: 0, suggestedPrice: 45,
        compsRunAt: new Date().toISOString(), listings: [], isMockData: true,
        message: 'eBay token unavailable — showing sample data',
      };
    }

    // Browse API: search active fixed-price listings as a proxy for market value.
    // The Finding API (findCompletedItems) requires special eBay approval for production;
    // the Browse API is the modern OAuth-based replacement available to all production apps.

    // Clean the title down to brand + model for a tighter search.
    // Full item titles ("Zoom B3 Multi-Effects Processor, Rec, Model B3") return
    // accessories and unrelated items; trimming to the core identifier fixes this.
    const cleanTitle = (raw: string): string => {
      // Strip anything after common separator patterns
      let cleaned = raw
        .replace(/,.*$/, '')           // remove everything after first comma
        .replace(/\s+[-–]\s+.*$/, '')  // remove everything after standalone dash (not hyphenated words)
        .replace(/\s*\(.*\)/, '')      // remove parentheticals
        .replace(/(vintage|used|new|model|item|lot|set|piece|rare|original|authentic|antique|collectible|condition|excellent|good|fair|poor|grade|circa)/gi, '')
        .replace(/\s{2,}/g, ' ')
        .trim();

      // If the result is too short, fall back to first 4 words of original
      const words = cleaned.split(/\s+/);
      if (words.length < 2) {
        return raw.split(/\s+/).slice(0, 4).join(' ');
      }
      // Cap at 5 words to avoid over-specificity
      return words.slice(0, 5).join(' ');
    };

    // Catalog Enrichment (ADR 2026-06-14): enforce a model token so comps don't drift
    // across near-name models (AP-4 / AP-100 vs AP-40). Comps only has the title here.
    const compsModelToken = modelTokenFrom({ title });
    const cleanedTitle = cleanTitle(title);
    const queryText = compsModelToken && !cleanedTitle.toUpperCase().includes(compsModelToken)
      ? `${cleanedTitle} ${compsModelToken}`
      : cleanedTitle;
    const query = encodeURIComponent(queryText);
    console.log(`[eBay] Price comps query: "${queryText}" (from: "${title.slice(0, 60)}"${compsModelToken ? `, model token: ${compsModelToken}` : ''})`);
    const browseUrl =
      `https://api.ebay.com/buy/browse/v1/item_summary/search?` +
      `q=${query}&` +
      `filter=buyingOptions%3A%7BFIXED_PRICE%7D&` +
      `sort=bestMatch&` +
      `limit=${Math.min(limit, 50)}`;

    const response = await fetch(browseUrl, {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json',
        'X-EBAY-C-MARKETPLACE-ID': 'EBAY_US',
      },
    });

    if (!response.ok) {
      const errBody = await response.text().catch(() => '(unreadable)');
      console.error(`[eBay] Browse API failed: ${response.status} — body: ${errBody.slice(0, 500)}`);
      return {
        min: 25, max: 75, median: 45, count: 0, suggestedPrice: 45,
        compsRunAt: new Date().toISOString(), listings: [], isMockData: true,
        message: 'eBay API error — showing sample data',
      };
    }

    const data = (await response.json()) as any;
    let items = data.itemSummaries || [];

    // Model-token post-filter: drop listings whose title lacks the exact model token.
    // If filtering leaves fewer than 2 comps, fall back to the unfiltered set (never empty).
    if (compsModelToken && items.length) {
      const tokenLower = compsModelToken.toLowerCase();
      const filtered = items.filter((it: any) =>
        (it?.title ?? '').toLowerCase().includes(tokenLower)
      );
      if (filtered.length >= 2) {
        items = filtered;
      }
    }

    if (!items.length) {
      const emptyResult = {
        min: 25, max: 75, median: 45, count: 0, suggestedPrice: 45,
        compsRunAt: new Date().toISOString(), listings: [], isMockData: false,
      };
      findingApiCache.set(cacheKey, { result: emptyResult, expiresAt: Date.now() + FINDING_API_CACHE_TTL_MS });
      return emptyResult;
    }

    const prices = items
      .map((item: any) => parseFloat(item.price?.value || '0'))
      .filter((p: number) => p > 0)
      .sort((a: number, b: number) => a - b);

    if (prices.length === 0) {
      const emptyResult = {
        min: 25, max: 75, median: 45, count: 0, suggestedPrice: 45,
        compsRunAt: new Date().toISOString(), listings: [], isMockData: false,
      };
      findingApiCache.set(cacheKey, { result: emptyResult, expiresAt: Date.now() + FINDING_API_CACHE_TTL_MS });
      return emptyResult;
    }

    const min = Math.min(...prices);
    const max = Math.max(...prices);
    const median = prices[Math.floor(prices.length / 2)];

    const listings = items.slice(0, 10).map((item: any) => ({
      title: item.title || 'Unknown',
      price: parseFloat(item.price?.value || '0'),
      condition: item.condition || 'Unknown',
      url: item.itemWebUrl || '',
      imageUrl: item.image?.imageUrl || undefined,
    }));

    console.log(`[eBay] Browse API: ${prices.length} listings for "${title}" (min=$${min.toFixed(2)}, median=$${median.toFixed(2)}, max=$${max.toFixed(2)})`);

    const result = {
      min, max, median,
      count: prices.length,
      suggestedPrice: median,
      compsRunAt: new Date().toISOString(),
      listings,
    };
    findingApiCache.set(cacheKey, { result, expiresAt: Date.now() + FINDING_API_CACHE_TTL_MS });
    return result;
  } catch (error) {
    console.error('[eBay] Price comps error:', error);
    // Fallback to mock data on any error
    return {
      min: 25,
      max: 75,
      median: 45,
      count: 0,
      suggestedPrice: 45,
      compsRunAt: new Date().toISOString(),
      listings: [],
      isMockData: true,
      message: 'Error fetching eBay data — showing sample data',
    };
  }
}

/**
 * POST /api/items/:id/comps
 * Get price comps for an item from eBay
 */
export const getComps = async (req: AuthRequest, res: Response) => {
  try {
    const { id } = req.params;
    const userId = req.user?.id;

    if (!userId) {
      return res.status(401).json({ message: 'Authentication required' });
    }

    // Fetch item with sale and organizer info
    const item = await prisma.item.findUnique({
      where: { id },
      select: {
        id: true,
        title: true,
        conditionGrade: true,
        sale: {
          select: {
            organizerId: true,
          },
        },
      },
    });

    if (!item) {
      return res.status(404).json({ message: 'Item not found' });
    }

    // Verify organizer owns this item
    // userId is User.id, but item.sale!.organizerId is Organizer.id, so we need to look up the organizer first
    const organizer = await prisma.organizer.findUnique({
      where: { userId },
    });
    if (!organizer || item.sale!.organizerId !== organizer.id) {
      return res.status(403).json({ message: 'Not authorized to access this item' });
    }

    // Get comps from eBay
    const comps = await fetchEbayPriceComps({
      title: item.title,
      condition: item.conditionGrade || undefined,
      maxResults: 10
    });

    // Update item with suggested price if available
    if (comps.count > 0) {
      await prisma.item.update({
        where: { id },
        data: {
          aiSuggestedPrice: comps.suggestedPrice,
        },
      });
    }

    res.json(comps);
  } catch (error) {
    console.error('[eBay] getComps error:', error);
    res.status(500).json({
      min: 25,
      max: 75,
      median: 45,
      count: 0,
      suggestedPrice: 45,
      compsRunAt: new Date().toISOString(),
      listings: [],
      isMockData: true,
      message: 'Server error — showing sample data',
    });
  }
};

/**
 * Map condition grade to eBay Condition ID
 */
function mapConditionGradeToEbayId(grade: string | null | undefined): string {
  if (!grade) return '3000'; // Default to Used

  // Universal eBay condition IDs — valid across all categories
  // (2000/4000/5000/6000 are category-specific and rejected when category is unknown)
  const gradeMap: Record<string, string> = {
    'S': '1000', // New
    'A': '1000', // Like New → New (safest universal for eBay)
    'B': '3000', // Good → Used
    'C': '3000', // Fair → Used
    'D': '7000', // Poor → For parts or not working
  };

  return gradeMap[grade.toUpperCase()] || '3000'; // Default to Used
}

/**
 * Generate eBay CSV for a sale's items
 * Matches eBay Seller Hub bulk upload draft listings template format
 */
function generateEbayCsv(
  items: Array<{
    id: string;
    title: string;
    description: string | null;
    price: number | null;
    category: string | null;
    conditionGrade: string | null;
    ebayCategoryId: string | null;
    photoUrls: string[];
    estimatedValue: any;
    aiSuggestedPrice: any;
  }>,
  saleTitle: string,
  includeWatermark: boolean = false,
  organizer: WatermarkPolicyOrganizer | null = null
): string {
  // Escape CSV values (quote if contains comma, quote, or newline)
  const escapeCsvValue = (value: string | number): string => {
    const str = String(value);
    if (str.includes(',') || str.includes('"') || str.includes('\n')) {
      return `"${str.replace(/"/g, '""')}"`;
    }
    return str;
  };

  // eBay template header rows (required for Seller Hub bulk upload)
  const infoRows: string[] = [
    '#INFO,Version=0.0.2,Template= eBay-draft-listings-template_US,,,,,,,,',
    '#INFO Action and Category ID are required fields. 1) Set Action to Draft 2) Please find the category ID for your listings here: https://pages.ebay.com/sellerinformation/news/categorychanges.html,,,,,,,,,,',
    '"#INFO After you\'ve successfully uploaded your draft from the Seller Hub Reports tab, complete your drafts to active listings here: https://www.ebay.com/sh/lst/drafts",,,,,,,,,,',
    '#INFO,,,,,,,,,,',
  ];

  // Column header row (exact format required by eBay)
  const headerLine = 'Action(SiteID=US|Country=US|Currency=USD|Version=1193|CC=UTF-8),Custom label (SKU),Category ID,Title,UPC,Price,Quantity,Item photo URL,Condition ID,Description,Format';

  const rows: string[] = [...infoRows, headerLine];

  items.forEach((item) => {
    // Extract first photo URL or use empty string
    let photoUrl = '';
    if (item.photoUrls && item.photoUrls.length > 0) {
      photoUrl = item.photoUrls[0];
      if (includeWatermark && photoUrl) {
        if (!canRemoveWatermark(organizer)) {
          photoUrl = getWatermarkedUrl(photoUrl);
        }
      }
    }

    // Truncate title to 80 chars for eBay
    const truncatedTitle = item.title.substring(0, 80);

    // Clean description: strip HTML tags, limit to 500 chars
    const cleanDescription = (item.description || '')
      .replace(/<[^>]*>/g, '') // Remove HTML tags
      .replace(/&nbsp;/g, ' ')
      .replace(/&amp;/g, '&')
      .replace(/&lt;/g, '<')
      .replace(/&gt;/g, '>')
      .replace(/&quot;/g, '"')
      .trim()
      .substring(0, 500);

    // Determine price: use aiSuggestedPrice > estimatedValue > price > default
    let price = 0.99;
    if (item.aiSuggestedPrice) {
      price = Number(item.aiSuggestedPrice);
    } else if (item.estimatedValue) {
      price = Number(item.estimatedValue);
    } else if (item.price) {
      price = item.price;
    }

    // Get condition ID mapping
    const conditionId = mapConditionGradeToEbayId(item.conditionGrade);

    // Use stored ebayCategoryId if available; otherwise use '99' (fallback)
    const ebayCategoryId = item.ebayCategoryId || '99';

    // Build data row in correct column order
    const row = [
      escapeCsvValue('Draft'), // Action
      escapeCsvValue(item.id.substring(0, 12)), // Custom label (SKU) — use truncated ID
      escapeCsvValue(ebayCategoryId), // Category ID (stored or fallback)
      escapeCsvValue(truncatedTitle), // Title
      escapeCsvValue(''), // UPC
      escapeCsvValue(price.toFixed(2)), // Price
      escapeCsvValue('1'), // Quantity
      escapeCsvValue(photoUrl), // Item photo URL
      escapeCsvValue(conditionId), // Condition ID
      escapeCsvValue(cleanDescription), // Description
      escapeCsvValue('FixedPrice'), // Format
    ];

    rows.push(row.join(','));
  });

  return rows.join('\n');
}

/**
 * GET /api/organizer/sales/:saleId/ebay-export
 * Generate and download eBay CSV for a sale
 */
export const exportSaleToEbay = async (req: AuthRequest, res: Response) => {
  try {
    const { saleId } = req.params;
    const { photoMode, itemIds } = req.query as { photoMode?: string; itemIds?: string };
    const userId = req.user?.id;

    if (!userId) {
      return res.status(401).json({ message: 'Authentication required' });
    }

    // Parse selected item IDs if provided
    const selectedIds = itemIds ? itemIds.split(',').filter(Boolean) : null;

    // Fetch sale with organizer and items
    const sale = await prisma.sale.findUnique({
      where: { id: saleId },
      select: {
        id: true,
        title: true,
        organizerId: true,
        items: {
          where: {
            status: 'AVAILABLE',
            ...(selectedIds && selectedIds.length > 0 ? { id: { in: selectedIds } } : {}),
          },
          select: {
            id: true,
            title: true,
            description: true,
            price: true,
            category: true,
            conditionGrade: true,
            ebayCategoryId: true,
            photoUrls: true,
            estimatedValue: true,
            aiSuggestedPrice: true,
          },
        },
      },
    });

    if (!sale) {
      return res.status(404).json({ message: 'Sale not found' });
    }

    // Verify organizer owns this sale
    // userId is User.id, but sale.organizerId is Organizer.id, so we need to look up the organizer first
    const organizer = await prisma.organizer.findUnique({
      where: { userId },
      select: { id: true, subscriptionTier: true },
    });
    if (!organizer || sale.organizerId !== organizer.id) {
      return res.status(403).json({ message: 'Not authorized to export this sale' });
    }

    // Check tier for clean photo export (TEAMS only)
    if (photoMode === 'clean') {
      if (organizer.subscriptionTier !== 'TEAMS') {
        return res.status(403).json({
          message: 'Clean photo export requires TEAMS tier',
        });
      }
    }

    if (sale.items.length === 0) {
      return res.status(400).json({
        message: 'No available items to export',
      });
    }

    // Generate CSV (includeWatermark = true when photoMode is not 'clean')
    const includeWatermark = photoMode !== 'clean';
    const csv = generateEbayCsv(sale.items, sale.title, includeWatermark, organizer);

    // Set response headers for file download
    const timestamp = new Date().toISOString().split('T')[0];
    const safeTitle = sale.title.replace(/[^\w\s-]/g, '').replace(/\s+/g, '-').replace(/-+/g, '-').trim() || 'sale';
    const filename = `ebay-export-${safeTitle}-${timestamp}.csv`;

    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.send(csv);
  } catch (error) {
    console.error('[eBay] Export error:', error);
    res.status(500).json({ message: 'Failed to generate CSV export' });
  }
};

/**
 * Feature #244 Phase 2: eBay OAuth + Inventory API
 */

/**
 * Refresh eBay access token if expired
 * Called internally before every eBay API call
 * Exported for use by ebaySoldSyncCron
 */
export async function refreshEbayAccessToken(organizerId: string): Promise<string | null> {
  try {
    const connection = await prisma.ebayConnection.findUnique({
      where: { organizerId },
    });

    if (!connection) {
      console.warn(`[eBay] No connection found for organizer ${organizerId}`);
      return null;
    }

    // Check if token is still valid (more than 5 minutes remaining)
    const now = new Date();
    const expiresIn = (connection.tokenExpiresAt.getTime() - now.getTime()) / 1000;

    if (expiresIn > 300) {
      // Token still valid for at least 5 minutes
      return connection.accessToken;
    }

    // Token expired or expiring soon — refresh it
    const clientId = process.env.EBAY_CLIENT_ID;
    const clientSecret = process.env.EBAY_CLIENT_SECRET;

    if (!clientId || !clientSecret) {
      console.error('[eBay] EBAY_CLIENT_ID or EBAY_CLIENT_SECRET not configured');
      return null;
    }

    const params = new URLSearchParams({
      grant_type: 'refresh_token',
      refresh_token: connection.refreshToken,
    });

    const credentials = Buffer.from(`${clientId}:${clientSecret}`).toString('base64');
    const response = await fetch(
      ebayProxyUrl('/identity/v1/oauth2/token'),
      {
        method: 'POST',
        headers: {
          'Authorization': `Basic ${credentials}`,
          'Content-Type': 'application/x-www-form-urlencoded',
          ...ebayProxyHeaders(),
        },
        body: params.toString(),
      }
    );

    if (!response.ok) {
      const errorMsg = `Token refresh failed: ${response.status}`;
      console.error(`[eBay] ${errorMsg}`);
      await prisma.ebayConnection.update({
        where: { organizerId },
        data: {
          lastErrorAt: new Date(),
          lastErrorMessage: errorMsg,
        },
      });
      return null;
    }

    const data = (await response.json()) as any;
    const newAccessToken = data.access_token;
    const newRefreshToken = data.refresh_token || connection.refreshToken; // Some flows don't return refresh token
    const newExpiresIn = data.expires_in || 7200;
    const newTokenExpiresAt = new Date(Date.now() + newExpiresIn * 1000);

    // Update connection with new tokens
    await prisma.ebayConnection.update({
      where: { organizerId },
      data: {
        accessToken: newAccessToken,
        refreshToken: newRefreshToken,
        tokenExpiresAt: newTokenExpiresAt,
        lastRefreshedAt: new Date(),
        lastErrorAt: null,
        lastErrorMessage: null,
      },
    });

    return newAccessToken;
  } catch (error) {
    console.error('[eBay] Token refresh error:', error);
    return null;
  }
}


/**
 * Standard headers for all eBay REST API calls that require a user access token.
 * Accept-Language is required by eBay — omitting it or sending an invalid locale causes 400.
 */
function ebayUserHeaders(accessToken: string): Record<string, string> {
  return {
    'Authorization': `Bearer ${accessToken}`,
    'Content-Type': 'application/json',
    'Accept-Language': 'en-US',
    'Content-Language': 'en-US',
  };
}

/**
 * Call eBay Taxonomy API getCategorySuggestions to resolve a real LEAF
 * categoryId for an item based on its title. eBay's suggestions are always
 * leaves (which is what Inventory API requires) so this eliminates the
 * 25021 "condition is invalid for primary category" errors caused by the
 * hardcoded name→ID map resolving to branch categories.
 *
 * IMPORTANT: Taxonomy API requires an APPLICATION access token (client
 * credentials), NOT the organizer's user token. User tokens do not carry
 * commerce.taxonomy scope and return 403 errorId 1100 ACCESS/REQUEST.
 *
 * Returns null on any failure so caller can fall back to the static map.
 * US marketplace tree id is '0'.
 */
/**
 * Fetch eBay category suggestions for a title, sorted deepest-level first.
 * Returns up to 5 candidates. Deeper = more likely to be a leaf category.
 */
interface EbayCategoryCandidate {
  categoryId: string;
  categoryName: string;
  level: number;
  /** Original eBay relevance order (0 = top-ranked). Preserve this — do NOT depth-sort. */
  index: number;
  /** Ancestor path top→leaf, e.g. [{Pet Supplies}, {Fish & Aquariums}, {Pumps}]. */
  ancestors: Array<{ categoryId: string; categoryName: string }>;
}

async function getEbayCategoryCandidates(
  title: string
): Promise<EbayCategoryCandidate[]> {
  try {
    const appToken = await getEbayAccessToken();
    if (!appToken) {
      console.warn('[eBay Taxonomy] App token unavailable — check EBAY_CLIENT_ID/SECRET');
      return [];
    }
    const treeId = '0'; // EBAY_US
    const q = encodeURIComponent(title.slice(0, 100));
    const path = encodeURIComponent(`/commerce/taxonomy/v1/category_tree/${treeId}/get_category_suggestions?q=${q}`);
    const res = await fetch(ebayProxyUrl(path), {
      method: 'GET',
      headers: {
        Authorization: `Bearer ${appToken}`,
        'Content-Type': 'application/json',
        'Accept-Language': 'en-US',
        ...ebayProxyHeaders(),
      },
    });
    if (!res.ok) {
      const body = await res.text();
      console.error(`[eBay Taxonomy] getCategorySuggestions ${res.status}: ${body.slice(0, 200)}`);
      return [];
    }
    const data = (await res.json()) as {
      categorySuggestions?: Array<{
        category: { categoryId: string; categoryName: string };
        categoryTreeNodeLevel?: number;
        categoryTreeNodeAncestors?: Array<{ categoryId: string; categoryName: string }>;
      }>;
    };
    const suggestions = data.categorySuggestions ?? [];
    // PRESERVE eBay's relevance order. eBay returns candidates ranked by relevance;
    // re-sorting deepest-first (the prior behavior) promoted wrong-domain deep leaves
    // (the Danner aquarium pump landed under Fishing › Bait Buckets — 2026-06-14).
    // `index` captures the original rank so the domain-aware selector can use it as
    // the within-domain tiebreaker.
    return suggestions.slice(0, 5).map((s, index) => ({
      categoryId: s.category.categoryId,
      categoryName: s.category.categoryName,
      level: s.categoryTreeNodeLevel ?? 0,
      index,
      // eBay returns ancestors leaf→root in get_category_suggestions; normalize to a
      // plain id+name list (order not relied on — we match on membership).
      ancestors: (s.categoryTreeNodeAncestors ?? []).map((a) => ({
        categoryId: a.categoryId,
        categoryName: a.categoryName,
      })),
    }));
  } catch (err) {
    console.error('[eBay Taxonomy] Error:', err);
    return [];
  }
}

/**
 * Map a free-text AI domain hint (item.category / summary.suggestedCategory) and/or
 * title to the eBay top-level (L1) ancestor name(s) we expect the correct category to
 * live under. The keyword map and the canonical L1 name set now live in the shared
 * config module (ebayCategories.ts) so this resolver and the AI prompt that produces
 * `item.category` cannot drift. Empty array = no domain constraint.
 */
function ebayTopLevelForDomain(domainHint: string | null | undefined): string[] {
  return domainToL1(domainHint);
}

const isCatchAllCategory = (name: string): boolean =>
  /\b(other|misc|miscellaneous|everything\s+else)\b/i.test(name);

/**
 * Domain-aware eBay category resolver (ADR 2026-06-14).
 *
 * Selection order:
 *   1. If a domainHint maps to expected eBay top-level(s), prefer candidates whose
 *      ancestor path contains a matching top-level — taking the best eBay relevance
 *      rank (lowest index) among those, skipping catch-all buckets.
 *   2. Else any non-catch-all candidate in eBay relevance order.
 *   3. Else candidates[0].
 *
 * The depth re-sort is gone: relevance order is the tiebreaker WITHIN the right
 * domain. The domain hint is what prevents cross-domain misfiles (aquarium pump →
 * Pet Supplies, not Fishing › Bait Buckets).
 *
 * @param domainHint Free-text AI category (item.category / summary.suggestedCategory).
 * @returns { categoryId, categoryName } or null if eBay returned nothing.
 */
export async function suggestEbayCategoryForTitle(
  title: string,
  domainHint?: string | null
): Promise<{ categoryId: string; categoryName: string } | null> {
  const candidates = await getEbayCategoryCandidates(title);
  if (candidates.length === 0) {
    console.warn(`[eBay Taxonomy] No suggestions for "${title.slice(0, 60)}"`);
    return null;
  }

  // In eBay relevance order (candidates already preserve it; sort defensively by index).
  const byRelevance = [...candidates].sort((a, b) => a.index - b.index);

  // Domain match: ancestor path (or the candidate's own name) contains an expected L1.
  // Detect the domain from the AI category hint AND the title — the AI's free-text
  // category is unreliable (e.g. an aquarium air pump was labeled "Electronics"), but
  // the title ("...Aquarium Aerator...") carries the real signal. Combining both makes
  // the resolver robust to a wrong AI category. (S975)
  const expectedL1 = ebayTopLevelForDomain([domainHint, title].filter(Boolean).join(' '));
  const matchesDomain = (c: EbayCategoryCandidate): boolean => {
    if (expectedL1.length === 0) return false;
    const names = [c.categoryName, ...c.ancestors.map((a) => a.categoryName)].map((n) => n.toLowerCase());
    return expectedL1.some((l1) => names.some((n) => n.includes(l1.toLowerCase())));
  };

  // 1. matching-domain, non-catch-all, best relevance
  const domainPick = byRelevance.find((c) => matchesDomain(c) && !isCatchAllCategory(c.categoryName));
  // 2. any non-catch-all, best relevance
  const nonCatchAll = byRelevance.find((c) => !isCatchAllCategory(c.categoryName));
  // 3. candidates[0] (eBay top-ranked, even if catch-all)
  const best = domainPick ?? nonCatchAll ?? byRelevance[0];

  if (!domainPick && expectedL1.length > 0) {
    console.warn(
      `[eBay Taxonomy] "${title.slice(0, 40)}" hint="${domainHint}" (expect L1 ${expectedL1.join('/')}) → no ancestor match; falling back to ${best.categoryId} (${best.categoryName})`
    );
  }
  if (best === byRelevance[0] && isCatchAllCategory(best.categoryName)) {
    console.warn(
      `[eBay Taxonomy] "${title.slice(0, 40)}" → only catch-all categories returned; using ${best.categoryId} (${best.categoryName})`
    );
  }
  console.log(
    `[eBay Taxonomy] "${title.slice(0, 40)}" hint="${domainHint ?? ''}" → ${best.categoryId} (${best.categoryName}) level=${best.level} index=${best.index}${domainPick ? ' [domain-matched]' : ''}`
  );
  return { categoryId: best.categoryId, categoryName: best.categoryName };
}

/**
 * Fetch organizer's real business policies from eBay and store them
 * Called after OAuth connect completes. Fire-and-forget on error.
 * marketplace_id=EBAY_US is required by the Account API.
 */
export async function fetchAndStoreEbayPolicies(organizerId: string, accessToken: string): Promise<void> {
  try {
    // Fetch payment policies
    const paymentRes = await fetch(ebayProxyUrl('/sell/account/v1/payment_policy?marketplace_id=EBAY_US'), {
      method: 'GET',
      headers: {
        ...ebayUserHeaders(accessToken),
        ...ebayProxyHeaders(),
      },
    });

    // Fetch fulfillment policies
    const fulfillmentRes = await fetch(ebayProxyUrl('/sell/account/v1/fulfillment_policy?marketplace_id=EBAY_US'), {
      method: 'GET',
      headers: {
        ...ebayUserHeaders(accessToken),
        ...ebayProxyHeaders(),
      },
    });

    // Fetch return policies
    const returnRes = await fetch(ebayProxyUrl('/sell/account/v1/return_policy?marketplace_id=EBAY_US'), {
      method: 'GET',
      headers: {
        ...ebayUserHeaders(accessToken),
        ...ebayProxyHeaders(),
      },
    });

    let paymentPolicyId: string | null = null;
    let fulfillmentPolicyId: string | null = null;
    let returnPolicyId: string | null = null;

    // Extract payment policy ID — prefer EBAY_US with default flag, fall back to filtered list, then unfiltered
    if (paymentRes.ok) {
      const paymentData = (await paymentRes.json()) as any;
      const allPolicies = paymentData.paymentPolicies || [];
      const ebayUsPolicies = allPolicies.filter((p: any) => p.marketplaceId === 'EBAY_US');
      const defaultPolicy = ebayUsPolicies.find((p: any) => p.categoryTypes?.some((ct: any) => ct.default === true));
      const fallbackEbayUs = ebayUsPolicies[0];
      const fallbackAny = allPolicies[0];
      const chosen = defaultPolicy || fallbackEbayUs || fallbackAny;
      if (chosen) {
        paymentPolicyId = chosen.paymentPolicyId;
      }
    } else {
      console.warn(`[eBay] Failed to fetch payment policies: ${paymentRes.status}`);
    }

    // Extract fulfillment policy ID — prefer EBAY_US with default flag, fall back to filtered list, then unfiltered
    if (fulfillmentRes.ok) {
      const fulfillmentData = (await fulfillmentRes.json()) as any;
      const allPolicies = fulfillmentData.fulfillmentPolicies || [];
      const ebayUsPolicies = allPolicies.filter((p: any) => p.marketplaceId === 'EBAY_US');
      const defaultPolicy = ebayUsPolicies.find((p: any) => p.categoryTypes?.some((ct: any) => ct.default === true));
      const fallbackEbayUs = ebayUsPolicies[0];
      const fallbackAny = allPolicies[0];
      const chosen = defaultPolicy || fallbackEbayUs || fallbackAny;
      if (chosen) {
        fulfillmentPolicyId = chosen.fulfillmentPolicyId;
      }
    } else {
      console.warn(`[eBay] Failed to fetch fulfillment policies: ${fulfillmentRes.status}`);
    }

    // Extract return policy ID — prefer EBAY_US with default flag, fall back to filtered list, then unfiltered
    if (returnRes.ok) {
      const returnData = (await returnRes.json()) as any;
      const allPolicies = returnData.returnPolicies || [];
      const ebayUsPolicies = allPolicies.filter((p: any) => p.marketplaceId === 'EBAY_US');
      const defaultPolicy = ebayUsPolicies.find((p: any) => p.categoryTypes?.some((ct: any) => ct.default === true));
      const fallbackEbayUs = ebayUsPolicies[0];
      const fallbackAny = allPolicies[0];
      const chosen = defaultPolicy || fallbackEbayUs || fallbackAny;
      if (chosen) {
        returnPolicyId = chosen.returnPolicyId;
      }
    } else {
      console.warn(`[eBay] Failed to fetch return policies: ${returnRes.status}`);
    }

    // Update EbayConnection with policy IDs (at least one may be null)
    if (paymentPolicyId || fulfillmentPolicyId || returnPolicyId) {
      await prisma.ebayConnection.update({
        where: { organizerId },
        data: {
          paymentPolicyId,
          fulfillmentPolicyId,
          returnPolicyId,
          policiesFetchedAt: new Date(),
        },
      });
      console.log(
        `[eBay] Stored policies for organizer ${organizerId}: payment=${paymentPolicyId}, fulfillment=${fulfillmentPolicyId}, return=${returnPolicyId}`
      );
    } else {
      console.warn(`[eBay] No policies could be fetched for organizer ${organizerId}`);
    }
  } catch (error) {
    console.error('[eBay] Error fetching and storing policies:', error);
    // Don't throw — policy fetch failure should not break OAuth callback
  }
}

/**
 * Fetch ALL eBay policies (fulfillment, return, payment) for the organizer.
 * Returns structured arrays of policies for UI consumption + setup.
 */
export async function fetchAllEbayPolicies(organizerId: string, accessToken: string): Promise<{
  fulfillmentPolicies: Array<{ fulfillmentPolicyId: string; name: string; description?: string }>;
  returnPolicies: Array<{ returnPolicyId: string; name: string; description?: string }>;
  paymentPolicies: Array<{ paymentPolicyId: string; name: string; description?: string }>;
}> {
  const headers = ebayUserHeaders(accessToken);

  async function fetchAll(endpoint: string, resultKey: string): Promise<any[]> {
    try {
      const res = await fetch(
        ebayProxyUrl(`/sell/account/v1/${endpoint}?marketplace_id=EBAY_US&limit=100`),
        {
          headers: {
            ...headers,
            ...ebayProxyHeaders(),
          },
        }
      );
      if (!res.ok) {
        console.error(`[eBay] ${endpoint} fetch failed: ${res.status}`);
        return [];
      }
      trackEbayCall();
      const data = await res.json();
      return data[resultKey] || [];
    } catch (err) {
      console.error(`[eBay] ${endpoint} error:`, err);
      return [];
    }
  }

  const [fulfillmentPolicies, returnPolicies, paymentPolicies] = await Promise.all([
    fetchAll('fulfillment_policy', 'fulfillmentPolicies'),
    fetchAll('return_policy', 'returnPolicies'),
    fetchAll('payment_policy', 'paymentPolicies'),
  ]);

  return { fulfillmentPolicies, returnPolicies, paymentPolicies };
}

/**
 * Fetch eBay merchant locations for the organizer.
 * Used to populate location selector and merchantLocationSource options.
 */
export async function fetchEbayMerchantLocations(organizerId: string, accessToken: string): Promise<Array<{
  merchantLocationKey: string;
  name: string;
  locationTypes?: string[];
  address?: any;
}>> {
  const headers = ebayUserHeaders(accessToken);
  try {
    const res = await fetch(ebayProxyUrl('/sell/inventory/v1/location?limit=100'), {
      headers: {
        ...headers,
        ...ebayProxyHeaders(),
      },
    });
    if (!res.ok) {
      console.error(`[eBay] fetch locations failed: ${res.status}`);
      return [];
    }
    trackEbayCall();
    const data = await res.json();
    return (data.locations || []).map((loc: any) => ({
      merchantLocationKey: loc.merchantLocationKey,
      name: loc.name || loc.merchantLocationKey,
      locationTypes: loc.locationTypes,
      address: loc.location?.address,
    }));
  } catch (err) {
    console.error('[eBay] fetchEbayMerchantLocations error:', err);
    return [];
  }
}

/**
 * Handler: GET /api/ebay/setup-data
 * Returns current policies, locations, and existing policy mapping for UI configuration.
 * Used to populate the eBay Policy Routing Settings page.
 */
export async function getEbaySetupData(req: AuthRequest, res: Response): Promise<Response> {
  try {
    const organizer = await prisma.organizer.findFirst({
      where: { userId: req.user!.id },
      include: { ebayConnection: true, ebayPolicyMapping: true },
    });
    if (!organizer) return res.status(404).json({ error: 'Organizer not found' });
    if (!organizer.ebayConnection) return res.status(400).json({ error: 'eBay not connected' });

    const accessToken = await refreshEbayAccessToken(organizer.id);
    if (!accessToken) return res.status(500).json({ error: 'Failed to refresh eBay token' });

    const [allPolicies, locations] = await Promise.all([
      fetchAllEbayPolicies(organizer.id, accessToken),
      fetchEbayMerchantLocations(organizer.id, accessToken),
    ]);

    const suggestedWeightTiers = parseWeightTiers(
      allPolicies.fulfillmentPolicies as EbayFulfillmentPolicySummary[]
    );

    const classifiedFulfillment = allPolicies.fulfillmentPolicies.map((p) => ({
      ...p,
      classification: classifyPolicy(p.name),
    }));

    return res.json({
      fulfillmentPolicies: classifiedFulfillment,
      returnPolicies: allPolicies.returnPolicies,
      paymentPolicies: allPolicies.paymentPolicies,
      merchantLocations: locations,
      currentMapping: organizer.ebayPolicyMapping,
      suggestedWeightTiers,
      handlingTimeDays: organizer.ebayConnection.handlingTimeDays ?? 3,
    });
  } catch (err: any) {
    console.error('[eBay] getEbaySetupData error:', err);
    return res.status(500).json({ error: err.message || 'Failed to load setup data' });
  }
}

/**
 * Handler: POST /api/ebay/policy-mapping
 * Saves organizer's policy routing configuration (weight tiers, category overrides, defaults, etc).
 */
export async function saveEbayPolicyMapping(req: AuthRequest, res: Response): Promise<Response> {
  try {
    const organizer = await prisma.organizer.findFirst({
      where: { userId: req.user!.id },
    });
    if (!organizer) return res.status(404).json({ error: 'Organizer not found' });

    const body = req.body || {};
    const data = {
      defaultFulfillmentPolicyId: body.defaultFulfillmentPolicyId ?? null,
      defaultReturnPolicyId: body.defaultReturnPolicyId ?? null,
      defaultPaymentPolicyId: body.defaultPaymentPolicyId ?? null,
      defaultDescriptionHtml: body.defaultDescriptionHtml ?? null,
      weightTierMappings: body.weightTierMappings ?? [],
      categoryOverrides: body.categoryOverrides ?? [],
      heavyOversizedPolicyId: body.heavyOversizedPolicyId ?? null,
      fragilePolicyId: body.fragilePolicyId ?? null,
      unknownPolicyId: body.unknownPolicyId ?? null,
      pushAsDraft: body.pushAsDraft ?? false,
      merchantLocationSource: body.merchantLocationSource || 'SALE_ADDRESS',
      shippingMode: body.shippingMode === 'FLAT_TIERS' ? 'FLAT_TIERS' : 'CALCULATED',
      freeShippingOptIn: body.freeShippingOptIn === true,
    };

    const mapping = await prisma.ebayPolicyMapping.upsert({
      where: { organizerId: organizer.id },
      create: { organizerId: organizer.id, ...data },
      update: data,
    });

    // Persist handling time on the connection (feeds the calculated fulfillment policy).
    if (typeof body.handlingTimeDays === 'number' && body.handlingTimeDays >= 0) {
      await prisma.ebayConnection.updateMany({
        where: { organizerId: organizer.id },
        data: { handlingTimeDays: Math.min(30, Math.round(body.handlingTimeDays)) },
      });
    }

    // When CALCULATED mode is selected, provision the calculated fulfillment policy
    // so it's ready at push time. Best-effort: failure is non-fatal (push will retry).
    if (data.shippingMode === 'CALCULATED') {
      ensureCalculatedFulfillmentPolicy(organizer.id).catch((err) =>
        console.warn('[eBay] calculated policy provisioning on save failed', err)
      );
    }

    return res.json({ success: true, mapping });
  } catch (err: any) {
    console.error('[eBay] saveEbayPolicyMapping error:', err);
    return res.status(500).json({ error: err.message || 'Failed to save mapping' });
  }
}

/**
 * Create per-organizer eBay ORDER_CONFIRMATION subscription
 * Uses the organizer's user token (from OAuth) to subscribe to order notifications
 * Stores the subscriptionId on the Organizer record for later deletion
 */
async function createEbayOrderSubscription(organizerId: string, userAccessToken: string): Promise<void> {
  const endpointUrl = process.env.EBAY_NOTIFICATION_ENDPOINT_URL;
  const EBAY_NOTIFY_BASE = 'https://api.ebay.com/commerce/notification/v1';

  try {
    // Destinations are app-scoped — must look them up with the app token, not the user token
    const appToken = await getEbayAccessToken();
    if (!appToken) {
      console.warn(`[eBay Notify] Could not get app token for destination lookup (organizer ${organizerId})`);
      return;
    }
    const destListResp = await fetch(`${EBAY_NOTIFY_BASE}/destination`, {
      method: 'GET',
      headers: { Authorization: `Bearer ${appToken}`, 'Content-Type': 'application/json' },
    });
    if (!destListResp.ok) {
      console.warn(`[eBay Notify] Could not list destinations for organizer ${organizerId}`);
      return;
    }
    const destData = await destListResp.json();
    const destination = (destData.destinations || []).find((d: any) => d.deliveryConfig?.endpoint === endpointUrl);
    if (!destination) {
      console.warn(`[eBay Notify] No matching destination found for endpoint ${endpointUrl}`);
      return;
    }

    // Create subscription using the organizer's user token (ORDER_CONFIRMATION is user-scoped)
    const subResp = await fetch(`${EBAY_NOTIFY_BASE}/subscription`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${userAccessToken}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        topicId: 'ORDER_CONFIRMATION',
        status: 'ENABLED',
        destinationId: destination.destinationId,
        payload: { deliveryProtocol: 'HTTPS', format: 'JSON', schemaVersion: '1.0' },
      }),
    });

    if (subResp.ok || subResp.status === 204) {
      const subText = await subResp.text();
      const subData = subText ? JSON.parse(subText) : {};
      const subscriptionId = subData.subscriptionId;
      if (subscriptionId) {
        await prisma.organizer.update({ where: { id: organizerId }, data: { ebaySubscriptionId: subscriptionId } });
        console.log(`[eBay Notify] ORDER_CONFIRMATION subscription created for organizer ${organizerId} (id: ${subscriptionId})`);
      } else {
        console.log(`[eBay Notify] Subscription created for organizer ${organizerId} (no subscriptionId in response)`);
      }
    } else {
      const err = await subResp.text();
      console.warn(`[eBay Notify] Failed to create subscription for organizer ${organizerId}: HTTP ${subResp.status} — ${err.slice(0, 300)}`);
    }
  } catch (err: any) {
    console.warn(`[eBay Notify] Exception creating subscription for organizer ${organizerId}:`, err.message);
  }
}

/**
 * GET /api/ebay/connect
 * Redirect organizer to eBay OAuth authorization URL
 */
export const connectEbayAccount = async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.user?.id;
    if (!userId) {
      return res.status(401).json({ message: 'Authentication required' });
    }

    // Get organizer
    const organizer = await prisma.organizer.findUnique({
      where: { userId },
    });

    if (!organizer) {
      return res.status(404).json({ message: 'Organizer profile not found' });
    }

    // Generate state parameter encoding organizerId + nonce
    // This allows the callback (public endpoint) to identify the organizer
    const nonce = crypto.randomBytes(16).toString('hex');
    const statePayload = {
      organizerId: organizer.id,
      nonce,
      iat: Date.now(),
    };
    const stateToken = Buffer.from(JSON.stringify(statePayload)).toString('base64url');

    const clientId = process.env.EBAY_CLIENT_ID;
    const redirectUri = process.env.EBAY_OAUTH_REDIRECT_URI;

    if (!clientId || !redirectUri) {
      return res.status(500).json({
        message: 'eBay OAuth not configured (missing EBAY_CLIENT_ID or EBAY_OAUTH_REDIRECT_URI)',
      });
    }

    const authUrl = new URL('https://auth.ebay.com/oauth2/authorize');
    authUrl.searchParams.set('client_id', clientId);
    authUrl.searchParams.set('redirect_uri', redirectUri);
    authUrl.searchParams.set('response_type', 'code');
    authUrl.searchParams.set('scope', [
      'https://api.ebay.com/oauth/api_scope/sell.inventory',
      'https://api.ebay.com/oauth/api_scope/sell.account',
      'https://api.ebay.com/oauth/api_scope/sell.fulfillment',
      'https://api.ebay.com/oauth/api_scope/commerce.identity.readonly',
      'https://api.ebay.com/oauth/api_scope/commerce.notification.subscription',
      'openid',
    ].join(' '));
    authUrl.searchParams.set('state', stateToken);
    authUrl.searchParams.set('prompt', 'login');

    res.json({ redirectUrl: authUrl.toString() });
  } catch (error) {
    console.error('[eBay] Connect error:', error);
    res.status(500).json({ message: 'Failed to initiate eBay OAuth' });
  }
};

/**
 * GET /api/ebay/callback
 * Exchange authorization code for tokens; store in EbayConnection
 * PUBLIC endpoint — eBay redirects here without FindA.Sale JWT
 * Organizer ID is encoded in the state parameter
 */
export const ebayOAuthCallback = async (req: Request, res: Response) => {
  try {
    const { code, state } = req.query as { code?: string; state?: string };

    if (!code) {
      return res.status(400).json({ message: 'Authorization code missing' });
    }

    if (!state) {
      return res.status(400).json({ message: 'State parameter missing' });
    }

    // Decode state to get organizerId
    let statePayload: { organizerId: string; nonce: string; iat: number };
    try {
      const decoded = Buffer.from(state, 'base64url').toString('utf-8');
      statePayload = JSON.parse(decoded);
    } catch (e) {
      console.error('[eBay] Failed to decode state parameter:', e);
      return res.status(400).json({ message: 'Invalid state parameter' });
    }

    // Validate state freshness (max 10 minutes old)
    const stateAge = Date.now() - statePayload.iat;
    if (stateAge > 10 * 60 * 1000) {
      return res.status(400).json({ message: 'State parameter expired' });
    }

    // Get organizer by ID from state
    const organizer = await prisma.organizer.findUnique({
      where: { id: statePayload.organizerId },
    });

    if (!organizer) {
      return res.status(404).json({ message: 'Organizer not found' });
    }

    const clientId = process.env.EBAY_CLIENT_ID;
    const clientSecret = process.env.EBAY_CLIENT_SECRET;
    const redirectUri = process.env.EBAY_OAUTH_REDIRECT_URI;

    if (!clientId || !clientSecret || !redirectUri) {
      return res.status(500).json({
        message: 'eBay OAuth not configured',
      });
    }

    // Exchange code for tokens
    const params = new URLSearchParams({
      grant_type: 'authorization_code',
      code,
      redirect_uri: redirectUri,
    });

    const credentials = Buffer.from(`${clientId}:${clientSecret}`).toString('base64');
    const tokenResponse = await fetch(ebayProxyUrl('/identity/v1/oauth2/token'), {
      method: 'POST',
      headers: {
        'Authorization': `Basic ${credentials}`,
        'Content-Type': 'application/x-www-form-urlencoded',
        ...ebayProxyHeaders(),
      },
      body: params.toString(),
    });

    if (!tokenResponse.ok) {
      const errorData = await tokenResponse.text();
      console.error(`[eBay] Token exchange failed: ${tokenResponse.status} ${errorData}`);
      return res.status(400).json({ message: 'Failed to exchange authorization code' });
    }

    const tokenData = (await tokenResponse.json()) as any;
    const accessToken = tokenData.access_token;
    const refreshToken = tokenData.refresh_token;
    const expiresIn = tokenData.expires_in || 7200;
    const tokenExpiresAt = new Date(Date.now() + expiresIn * 1000);

    // Fetch real eBay display username via Identity API
    // Requires commerce.identity.readonly scope
    let ebayUserId = 'unknown';
    try {
      const identityRes = await fetch('https://apiz.ebay.com/commerce/identity/v1/user/', {
        headers: ebayUserHeaders(accessToken),
      });
      if (identityRes.ok) {
        const identityData = (await identityRes.json()) as any;
        ebayUserId = identityData.username || identityData.userId || 'unknown';
        console.log('[eBay] Identity resolved:', ebayUserId);
      } else {
        // Fallback: decode JWT sub claim (internal eBay user ID, not display name)
        const parts = accessToken.split('.');
        if (parts.length === 3) {
          const decoded = JSON.parse(Buffer.from(parts[1], 'base64').toString());
          // sub is the eBay internal user ID; iss is the issuer URL — never use iss
          ebayUserId = decoded.sub || decoded.user_id || 'unknown';
        }
      }
    } catch (e) {
      console.warn('[eBay] Could not resolve eBay user identity', e);
    }

    // Upsert EbayConnection
    const connection = await prisma.ebayConnection.upsert({
      where: { organizerId: organizer.id },
      create: {
        organizerId: organizer.id,
        accessToken,
        refreshToken,
        tokenExpiresAt,
        ebayUserId,
        connectedAt: new Date(),
        lastRefreshedAt: new Date(),
      },
      update: {
        accessToken,
        refreshToken,
        tokenExpiresAt,
        ebayUserId,
        lastRefreshedAt: new Date(),
        lastErrorAt: null,
        lastErrorMessage: null,
      },
    });

    // Fire-and-forget: fetch and store organizer's business policies
    fetchAndStoreEbayPolicies(organizer.id, accessToken).catch(err =>
      console.error('[eBay] Failed to fetch policies after OAuth:', err)
    );

    // Fire-and-forget: create ORDER_CONFIRMATION subscription using organizer's user token
    createEbayOrderSubscription(organizer.id, accessToken).catch(err =>
      console.warn('[eBay Notify] Subscription creation failed:', err.message)
    );

    const frontendUrl = process.env.FRONTEND_URL ?? 'https://finda.sale';
    res.redirect(`${frontendUrl}/organizer/settings?ebay_connected=true`);
  } catch (error) {
    console.error('[eBay] OAuth callback error:', error);
    res.status(500).json({ message: 'Failed to process OAuth callback' });
  }
};

/**
 * GET /api/ebay/connection
 * Return connection status for the organizer
 */
export const checkEbayConnection = async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.user?.id;
    if (!userId) {
      return res.status(401).json({ message: 'Authentication required' });
    }

    const organizer = await prisma.organizer.findUnique({
      where: { userId },
      include: { ebayConnection: true },
    });

    if (!organizer) {
      return res.status(404).json({ message: 'Organizer profile not found' });
    }

    const connection = organizer.ebayConnection;

    if (!connection) {
      return res.json({
        connected: false,
        ebayUserId: null,
        connectedAt: null,
        error: null,
      });
    }

    const inventorySale = await prisma.sale.findFirst({
      where: { organizerId: organizer.id, title: 'eBay Inventory' },
      select: { id: true },
    });

    res.json({
      connected: true,
      ebayUserId: connection.ebayUserId,
      connectedAt: connection.connectedAt,
      lastRefreshedAt: connection.lastRefreshedAt,
      lastEbayInventorySyncAt: connection.lastEbayInventorySyncAt,
      ebaySaleId: inventorySale?.id ?? null,
      error: connection.lastErrorMessage ? 'TOKEN_REFRESH_FAILED' : null,
      errorMessage: connection.lastErrorMessage,
      fulfillmentPolicyId: connection.fulfillmentPolicyId ?? null,
      returnPolicyId: connection.returnPolicyId ?? null,
      paymentPolicyId: connection.paymentPolicyId ?? null,
      policiesFetchedAt: connection.policiesFetchedAt ?? null,
    });
  } catch (error) {
    console.error('[eBay] Connection status error:', error);
    res.status(500).json({ message: 'Failed to check connection status' });
  }
};

/**
 * DELETE /api/ebay/connection
 * Revoke and delete eBay connection
 */
export const disconnectEbay = async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.user?.id;
    if (!userId) {
      return res.status(401).json({ message: 'Authentication required' });
    }

    const organizer = await prisma.organizer.findUnique({
      where: { userId },
      include: { ebayConnection: true },
    });

    if (!organizer) {
      return res.status(404).json({ message: 'Organizer profile not found' });
    }

    // Delete eBay ORDER_CONFIRMATION subscription if exists
    if (organizer.ebaySubscriptionId && organizer.ebayConnection) {
      // Fire-and-forget subscription deletion — non-fatal if this fails
      fetch(ebayProxyUrl(encodeURIComponent(`/commerce/notification/v1/subscription/${organizer.ebaySubscriptionId}`)), {
        method: 'DELETE',
        headers: {
          Authorization: `Bearer ${organizer.ebayConnection.accessToken}`,
          'Content-Type': 'application/json',
          ...ebayProxyHeaders(),
        },
      }).catch(err => console.warn('[eBay Notify] Failed to delete subscription:', err.message));
    }

    // Delete connection (cascade will clean up any related data)
    await prisma.ebayConnection.deleteMany({
      where: { organizerId: organizer.id },
    });

    // Clear ebaySubscriptionId from organizer
    await prisma.organizer.update({
      where: { id: organizer.id },
      data: { ebaySubscriptionId: null },
    });

    res.json({
      success: true,
      message: 'eBay account disconnected',
    });
  } catch (error) {
    console.error('[eBay] Disconnect error:', error);
    res.status(500).json({ message: 'Failed to disconnect eBay account' });
  }
};

/**
 * GET /api/organizer/items/:itemId/ebay-preview
 * Return pre-filled eBay listing data for review modal
 */
export const getEbayPreview = async (req: AuthRequest, res: Response) => {
  try {
    const { itemId } = req.params;
    const { photoMode } = req.query as { photoMode?: string };
    const userId = req.user?.id;

    if (!userId) {
      return res.status(401).json({ message: 'Authentication required' });
    }

    // Fetch item with sale info
    const item = await prisma.item.findUnique({
      where: { id: itemId },
      select: {
        id: true,
        title: true,
        description: true,
        conditionGrade: true,
        category: true,
        photoUrls: true,
        aiSuggestedPrice: true,
        estimatedValue: true,
        price: true,
        tags: true,
        ebayListingId: true,
        ebayCategoryId: true,
        createdAt: true,
        costBasis: true,
        roomTag: true,
        sale: {
          select: {
            organizerId: true,
          },
        },
      },
    });

    if (!item) {
      return res.status(404).json({ message: 'Item not found' });
    }

    // Verify organizer owns this item
    const organizer = await prisma.organizer.findUnique({
      where: { userId },
    });

    if (!organizer || item.sale!.organizerId !== organizer.id) {
      return res.status(403).json({ message: 'Not authorized to preview this item' });
    }

    // Build preview payload
    const sku = buildCustomLabel(item.id, organizer, item);
    const conditionId = mapConditionGradeToEbayId(item.conditionGrade);
    // Resolve categoryId: stored → Taxonomy API suggestion → static map fallback
    // (same cascade as pushSaleToEbay). Requires an active user access token
    // for the Taxonomy API call; refresh lazily only when we need to suggest.
    let categoryId: string | null = item.ebayCategoryId || null;
    if (!categoryId) {
      const suggested = await suggestEbayCategoryForTitle(item.title, item.category);
      if (suggested) {
        categoryId = suggested.categoryId;
        await prisma.item.update({
          where: { id: item.id },
          // Persist BOTH id + name so the edit-item Category picker can surface the
          // resolved category (ADR 2026-06-14) instead of rendering blank.
          data: { ebayCategoryId: suggested.categoryId, ebayCategoryName: suggested.categoryName },
        });
      }
    }

    // Determine price
    let price = 0.99;
    if (item.aiSuggestedPrice) {
      price = Number(item.aiSuggestedPrice);
    } else if (item.estimatedValue) {
      price = Number(item.estimatedValue);
    } else if (item.price) {
      price = item.price;
    }

    // Apply watermark/clean to photos
    const photos = item.photoUrls.map((url: string) => {
      if (photoMode === 'clean') {
        return url; // Return clean URL
      }
      if (canRemoveWatermark(organizer)) {
        return url; // TEAMS with toggle: return clean URL
      }
      return getWatermarkedUrl(url); // Return watermarked URL
    });

    // Build aspects from tags
    const aspects: Record<string, string> = {};
    item.tags.forEach((tag: string) => {
      const [key, value] = tag.split(':');
      if (key && value) {
        aspects[key] = value;
      }
    });

    res.json({
      itemId: item.id,
      sku,
      title: item.title.substring(0, 80),
      description: (item.description || '').replace(/<[^>]*>/g, '').substring(0, 4000),
      price,
      conditionId,
      conditionLabel: getConditionLabel(conditionId),
      categoryId,
      categoryLabel: getCategoryLabel(categoryId ?? '99'),
      photos,
      aspects,
      ebayUrl: item.ebayListingId ? `https://www.ebay.com/itm/${item.ebayListingId}` : null,
      alreadyListed: !!item.ebayListingId,
    });
  } catch (error) {
    console.error('[eBay] Preview error:', error);
    res.status(500).json({ message: 'Failed to generate eBay preview' });
  }
};

/**
 * POST /api/organizer/sales/:saleId/ebay-push
 * Push selected items to eBay
 */
export const pushSaleToEbay = async (req: AuthRequest, res: Response) => {
  try {
    const { saleId } = req.params;
    // S725: DRAFT mode removed (eBay Inventory API unpublished offers can't be
    // viewed/published from Seller Hub UI — feature was broken-by-design).
    // All pushes now go LIVE. Use the per-item "Publish to eBay now" button
    // (publishItemOffer) for any item whose ebayOfferId is stale.
    const { itemIds, photoMode } = req.body as {
      itemIds: string[];
      photoMode?: string;
    };
    const userId = req.user?.id;

    if (!userId) {
      return res.status(401).json({ message: 'Authentication required' });
    }

    if (!itemIds || !Array.isArray(itemIds) || itemIds.length === 0) {
      return res.status(400).json({ message: 'itemIds required' });
    }

    // Get organizer and verify tier
    const organizer = await prisma.organizer.findUnique({
      where: { userId },
      include: { ebayConnection: true },
    });

    if (!organizer) {
      return res.status(404).json({ message: 'Organizer profile not found' });
    }

    // Check tier gate
    if (organizer.subscriptionTier !== 'PRO' && organizer.subscriptionTier !== 'TEAMS') {
      return res.status(403).json({
        message: 'eBay direct push requires PRO or TEAMS tier',
      });
    }

    // Feature #75: Quota enforcement — eBay push limit check
    const tier = (organizer.subscriptionTier || 'SIMPLE') as SubscriptionTier;
    const ebayPushLimit = getTierLimit(tier, 'ebayPushesPerMonth');

    // Check if monthly quota has been exceeded
    if (organizer.ebayPushesThisMonth >= ebayPushLimit) {
      return res.status(429).json({
        code: 'EBAY_PUSH_QUOTA_EXCEEDED',
        message: `Monthly eBay push limit reached (${ebayPushLimit} per month for ${tier}). Upgrade to increase limit.`,
        limit: ebayPushLimit,
        used: organizer.ebayPushesThisMonth,
      });
    }

    // Verify eBay connection exists
    if (!organizer.ebayConnection) {
      return res.status(400).json({
        message: 'eBay account not connected',
      });
    }

    // Verify eBay connection has at least minimal policy configuration
    // If organizer has not set up EbayPolicyMapping, we will fall back to EbayConnection defaults
    const conn = organizer.ebayConnection;
    const hasEbayConnection = !!conn;
    if (!hasEbayConnection) {
      return res.status(400).json({
        error: 'EBAY_NOT_CONNECTED',
        message: 'Please connect your eBay account first.',
      });
    }

    // Refresh token if needed
    const accessToken = await refreshEbayAccessToken(organizer.id);
    if (!accessToken) {
      return res.status(500).json({
        message: 'Failed to refresh eBay access token',
      });
    }

    // Check eBay daily rate limit (soft cap at 4,500 of 5,000 daily calls)
    if (isEbayRateLimited()) {
      const rateLimitStatus = getEbayRateLimitStatus();
      return res.status(429).json({
        code: 'EBAY_RATE_LIMITED',
        message: 'Daily eBay API limit reached. Push will be available again tomorrow.',
        callCount: rateLimitStatus.callCount,
        limit: rateLimitStatus.limit,
      });
    }

    // Fetch items with Phase B fields and sale address
    const sale = await prisma.sale.findUnique({
      where: { id: saleId },
      select: {
        id: true,
        organizerId: true,
        address: true,
        city: true,
        state: true,
        zip: true,
        items: {
          where: {
            id: { in: itemIds },
            status: 'AVAILABLE',
          },
          select: {
            id: true,
            title: true,
            description: true,
            price: true,
            category: true,
            condition: true,
            conditionGrade: true,
            conditionNotes: true,
            photoUrls: true,
            estimatedValue: true,
            aiSuggestedPrice: true,
            tags: true,
            ebayOfferId: true,
            ebayListingId: true,
            ebayListedAt: true,
            ebayCategoryId: true,
            ebayNeedsReview: true,
            ebayShippingClassification: true,
            packageWeightOz: true,
            packageLengthIn: true,
            packageWidthIn: true,
            packageHeightIn: true,
            packageType: true,
            upc: true,
            ean: true,
            isbn: true,
            mpn: true,
            brand: true,
            ebayEpid: true,
            ebaySubtitle: true,
            ebaySecondaryCategoryId: true,
            allowBestOffer: true,
            bestOfferAutoAcceptAmt: true,
            bestOfferMinimumAmt: true,
            draftStatus: true,
            ebayShippingOverride: true,
            createdAt: true,
            costBasis: true,
            roomTag: true,
          },
        },
      },
    });

    if (!sale) {
      return res.status(404).json({ message: 'Sale not found' });
    }

    if (sale.organizerId !== organizer.id) {
      return res.status(403).json({ message: 'Not authorized to access this sale' });
    }

    if (sale.items.length === 0) {
      return res.status(400).json({ message: 'No available items to push' });
    }

    // Resolve or create a merchant location key (required by eBay for Item.Country)
    const saleAddressHint = sale.address ? {
      address: sale.address,
      city: sale.city || '',
      state: sale.state || '',
      zip: sale.zip || '',
    } : null;
    const locationResult = await getOrCreateMerchantLocation(accessToken, saleAddressHint);
    if ('error' in locationResult) {
      return res.status(400).json({
        error: 'MERCHANT_LOCATION_UNAVAILABLE',
        message: 'Seller has no eBay inventory location and sale address is missing. Please add a pickup/warehouse address in eBay Seller Hub or set the sale address in FindA.Sale first.',
      });
    }
    const merchantLocationKey = locationResult.merchantLocationKey;

    // S725: All pushes go LIVE. DRAFT mode removed — eBay Inventory API
    // unpublished offers can't be viewed/published from Seller Hub UI.
    // The replacement for "Push as Draft" is the per-item "Publish to eBay now"
    // button (publishItemOffer endpoint) for fixing stale offers in-app.
    console.log(`[eBay Push] saleId=${saleId} mode=LIVE`);

    // Fetch the organizer's eBay fulfillment policies once for shipping smart-pick.
    // Used when organizer.ebayDefaultShippingPolicyId is null and no EbayPolicyMapping rule fires.
    // Stored on the closure so resolvePoliciesForItem doesn't refetch per item.
    let ebayFulfillmentPolicies: any[] | null = null;
    const getFulfillmentPoliciesOnce = async (): Promise<any[]> => {
      if (ebayFulfillmentPolicies !== null) return ebayFulfillmentPolicies;
      try {
        const res = await fetch(
          ebayProxyUrl('/sell/account/v1/fulfillment_policy?marketplace_id=EBAY_US&limit=100'),
          { headers: { ...ebayUserHeaders(accessToken), ...ebayProxyHeaders() } }
        );
        if (res.ok) {
          trackEbayCall();
          const data = (await res.json()) as any;
          ebayFulfillmentPolicies = data.fulfillmentPolicies || [];
        } else {
          ebayFulfillmentPolicies = [];
        }
      } catch (err) {
        console.warn('[eBay ShippingPick] failed to fetch fulfillment policies:', err);
        ebayFulfillmentPolicies = [];
      }
      return ebayFulfillmentPolicies ?? [];
    };

    // Push each item to eBay
    const frontendUrl = process.env.FRONTEND_URL ?? 'https://finda.sale';
    const proxySecret = process.env.EBAY_PROXY_SECRET;
    const results: any[] = [];

    for (const item of sale.items) {
      try {
        const sku = buildCustomLabel(item.id, organizer, item);

        // Resolve policies for this item based on organizer's routing configuration
        const routing = await resolvePoliciesForItem(
          organizer.id,
          {
            id: item.id,
            packageWeightOz: item.packageWeightOz,
            packageLengthIn: item.packageLengthIn != null ? Number(item.packageLengthIn) : null,
            packageWidthIn: item.packageWidthIn != null ? Number(item.packageWidthIn) : null,
            packageHeightIn: item.packageHeightIn != null ? Number(item.packageHeightIn) : null,
            packageType: item.packageType,
            ebayShippingClassification: item.ebayShippingClassification,
            ebayCategoryId: item.ebayCategoryId,
            category: item.category,
            ebayShippingOverride: item.ebayShippingOverride,
          },
          { fetchFulfillmentPolicies: getFulfillmentPoliciesOnce, fromZip: sale.zip || null }
        );

        if ('error' in routing) {
          // Record per-item error, skip this item, continue with next
          results.push({
            itemId: item.id,
            sku,
            status: 'error',
            code: routing.code,
            message: routing.message,
          });
          continue;
        }

        // Resolve categoryId in this order:
        // 1. Stored ebayCategoryId (from eBay import — always a valid leaf)
        // 2. eBay Taxonomy API getCategorySuggestions by title — returns a leaf,
        //    cache it back to the item so future pushes skip the API call
        // 3. Static name→ID map (last resort; may land on a branch → 25021)
        let categoryId: string | null = item.ebayCategoryId || null;
        if (!categoryId) {
          // Domain-aware resolve (ADR 2026-06-14): pass item.category as the domain
          // hint so an aquarium pump lands under Pet Supplies, not Fishing.
          const resolved = await suggestEbayCategoryForTitle(item.title, item.category);
          if (resolved) {
            categoryId = resolved.categoryId;
            // Cache — idempotent, cheap, avoids repeated API calls on re-push.
            // Persist BOTH id + name so the resolved category is visible in edit-item.
            await prisma.item.update({
              where: { id: item.id },
              data: { ebayCategoryId: resolved.categoryId, ebayCategoryName: resolved.categoryName },
            });
          }
        }

        // Resolve condition: grade → inventory enum → remap to category-accepted value
        // Pass item.condition so organizer-set USED/REFURBISHED override S→NEW mapping
        const desiredCondition = mapGradeToInventoryCondition(item.conditionGrade, item.condition);
        const ebayCondition = await ensureConditionValidForCategory(
          desiredCondition,
          categoryId ?? '99'
        );
        console.log(
          `[eBay Push] ${item.title.slice(0, 40)} → category=${categoryId} condition=${ebayCondition} (grade=${item.conditionGrade || 'none'})`
        );

        // Determine price — organizer-set price always wins.
        // AI suggestions (aiSuggestedPrice, estimatedValue) are fallbacks only
        // for items the organizer never priced. Fixed 2026-04-14: prior ordering
        // sent AI guess to eBay even when organizer had set an explicit price
        // (Patrick: $285 saved, $169.09 on eBay from aiSuggestedPrice override).
        let price = 0.99;
        if (item.price && Number(item.price) > 0) {
          price = Number(item.price);
        } else if (item.aiSuggestedPrice) {
          price = Number(item.aiSuggestedPrice);
        } else if (item.estimatedValue) {
          price = Number(item.estimatedValue);
        }

        // Prepare photo URLs
        const photos = item.photoUrls.map((url: string) => {
          if (photoMode === 'clean') {
            return url;
          }
          if (canRemoveWatermark(organizer)) {
            return url; // TEAMS with toggle: return clean URL
          }
          return getWatermarkedUrlWithQR(url, item.id); // QR+name watermark default
        });

        // Step 1: Create or replace inventory item
        const inventoryPath = encodeURIComponent(`/sell/inventory/v1/inventory_item/${encodeURIComponent(sku)}`);
        const inventoryUrl = ebayProxyUrl(inventoryPath);
        // Build aspects: start with user-provided tags, then auto-fill any
        // REQUIRED aspects the category demands (prevents errorId 25002
        // "The item specific X is missing").
        const userAspects = buildAspects(item.tags);
        let aspects = await fillRequiredAspects(userAspects, categoryId ?? '99', {
          title: item.title,
          tags: item.tags,
          description: item.description,
          brand: item.brand,
          mpn: item.mpn,
        });
        // Guarantee organizer-set product identifiers reach eBay's item-specifics
        // (aspects) regardless of whether fillRequiredAspects ran. The Taxonomy API
        // (getRequiredAspectsForCategory) can return null on timeout/failure, in which
        // case fillRequiredAspects bails and the top-level product.brand field alone is
        // NOT treated by eBay as the "Brand" item-specific — causing errorId 25002
        // "The item specific Brand is missing." Inject Brand/MPN into aspects when the
        // organizer set them and fillRequiredAspects did not already choose a value
        // (case-insensitive key check — never overwrite a keyword/Unbranded value it set).
        if ((item.brand && item.brand.trim()) || (item.mpn && item.mpn.trim())) {
          const aspectsObj: Record<string, string[]> = aspects ?? {};
          const hasKey = (key: string): boolean =>
            Object.keys(aspectsObj).some((k) => k.toLowerCase() === key.toLowerCase());
          if (item.brand && item.brand.trim() && !hasKey('Brand')) {
            aspectsObj['Brand'] = [item.brand.trim()];
          }
          if (item.mpn && item.mpn.trim() && !hasKey('MPN')) {
            aspectsObj['MPN'] = [item.mpn.trim()];
          }
          aspects = aspectsObj;
        }
        // Brand+MPN pairing (evidence 2026-06-13, errorId 25002 param BrandMPN):
        // eBay categories that require Brand reject with "Input data for tag
        // <BrandMPN> is invalid or missing" unless MPN is ALSO present. Setting
        // Brand alone is NOT enough. Whenever aspects ends up with a Brand key
        // (case-insensitive) but no MPN key, inject MPN ('Does Not Apply' is
        // eBay's accepted placeholder when there's no real part number).
        if (aspects) {
          const hasAspect = (key: string): boolean =>
            Object.keys(aspects!).some((k) => k.toLowerCase() === key.toLowerCase());
          if (hasAspect('Brand') && !hasAspect('MPN')) {
            aspects['MPN'] = [item.mpn?.trim() || 'Does Not Apply'];
          }
        }
        const sanitizedDescription = sanitizeDescriptionForEbay(item.description);
        // Bug #424: replace ALL occurrences of {{DESCRIPTION}} in the organizer's template.
        // String.replace() with a string arg only replaces the first match; split/join is
        // equivalent to replaceAll and works across all Node versions.
        // Defined here (before inventoryPayload) so both the inventory item description
        // and the offer listingDescription use the same resolved value.
        const applyDescTemplate = (template: string, desc: string): string =>
          template.includes('{{DESCRIPTION}}')
            ? template.split('{{DESCRIPTION}}').join(desc)
            : template + (desc ? `\n\n${desc}` : '');
        const resolvedDescription = routing.descriptionHtml
          ? applyDescTemplate(routing.descriptionHtml, sanitizedDescription)
          : sanitizedDescription;
        const inventoryPayload: Record<string, unknown> = {
          product: {
            title: item.title.substring(0, 80),
            description: resolvedDescription,
            imageUrls: photos,
            ...(aspects ? { aspects } : {}),
            ...(item.brand ? { brand: item.brand } : {}),
            // Brand+MPN pairing: when brand is sent but no real MPN exists, send
            // 'Does Not Apply' (eBay's accepted placeholder). Sending brand alone
            // triggers errorId 25002 <BrandMPN> on Brand-requiring categories.
            ...(item.mpn
              ? { mpn: item.mpn }
              : item.brand
                ? { mpn: 'Does Not Apply' }
                : {}),
            ...(item.upc ? { upc: [item.upc] } : {}),
            ...(item.ean ? { ean: [item.ean] } : {}),
            ...(item.isbn ? { isbn: [item.isbn] } : {}),
            ...(item.ebayEpid ? { epid: item.ebayEpid } : {}),
            ...(item.ebaySubtitle ? { subtitle: item.ebaySubtitle } : {}),
          },
          condition: ebayCondition,
          ...(buildConditionDescription(item) ? { conditionDescription: buildConditionDescription(item) } : {}),
          availability: {
            shipToLocationAvailability: {
              quantity: 1,
            },
          },
          ...(item.packageWeightOz ? {
            packageWeightAndSize: {
              weight: { unit: 'OUNCE', value: Number(item.packageWeightOz) },
              ...(item.packageLengthIn && item.packageWidthIn && item.packageHeightIn ? {
                dimensions: {
                  unit: 'INCH',
                  length: Number(item.packageLengthIn),
                  width: Number(item.packageWidthIn),
                  height: Number(item.packageHeightIn),
                },
              } : {}),
              // eBay packageType is a strict enum — drop the field if value isn't on the allowlist (avoids err 2004).
              // Also suppress packageType when routing via LSAS calculated shipping (routingReason='calculated-default'):
              // LSAS computes rates from weight+dims alone and rejects incompatible packageType values (err 216314).
              ...((): { packageType?: string } => {
                // LSAS-validated auto policies (calculated + FVF flat-rate buckets) reject
                // box/envelope packageType values incompatible with the weight/dims — e.g.
                // MAILING_BOX for an ~11lb parcel → errorId 25101 / err:216305 MailingBoxes
                // (proven via live eBay API, S975). Weight + dims are sufficient for these
                // paths, so strip packageType. This is why a pump that listed fine via the
                // calculated path failed once it routed through the new flat-rate path.
                const rr = routing.routingReason || '';
                if (
                  rr === 'calculated-default' ||
                  rr.startsWith('calculated') ||
                  rr.startsWith('fvf-flat') ||
                  rr.startsWith('tier-gap-fvf-flat')
                ) {
                  return {};
                }
                const valid = new Set([
                  'LETTER','BULKY_GOODS','CARAVAN','CARS','EUROPALLET','EXPANDABLE_TOUGH_BAGS',
                  'EXTRA_LARGE_PACK','FURNITURE','INDUSTRY_VEHICLES','LARGE_CANADA_POSTBOX',
                  'LARGE_CANADA_POST_BUBBLE_MAILER','LARGE_ENVELOPE','MAILING_BOX',
                  'MEDIUM_CANADA_POST_BOX','MEDIUM_CANADA_POST_BUBBLE_MAILER','MOTORBIKES',
                  'ONE_WAY_PALLET','PACKAGE_THICK_ENVELOPE','PADDED_BAGS',
                  'PARCEL_OR_PADDED_ENVELOPE','ROLL','SMALL_CANADA_POST_BOX',
                  'SMALL_CANADA_POST_BUBBLE_MAILER','TOUGH_BAGS','UPS_LETTER',
                  'USPS_FLAT_RATE_ENVELOPE','USPS_LARGE_PACK','VERY_LARGE_PACK',
                  'WINE_PRESENTATION_BOX',
                ]);
                const pt = item.packageType ? String(item.packageType).trim().toUpperCase().replace(/\s+/g, '_') : '';
                if (pt && valid.has(pt)) return { packageType: pt };
                if (item.packageType) console.warn(`[eBay InventoryPayload] dropping invalid packageType="${item.packageType}" (not in eBay enum)`);
                return {};
              })(),
            },
          } : {}),
        };

        console.log(`[eBay InventoryPayload] sku=${sku} weightOz=${item.packageWeightOz ?? 'null'} dims=${item.packageLengthIn ?? '?'}x${item.packageWidthIn ?? '?'}x${item.packageHeightIn ?? '?'} hasPackageWeightAndSize=${Boolean((inventoryPayload as any).packageWeightAndSize)}`);

        const inventoryResponse = await fetch(inventoryUrl, {
          method: 'PUT',
          headers: {
            ...ebayUserHeaders(accessToken),
            ...ebayProxyHeaders(),
          },
          body: JSON.stringify(inventoryPayload),
        });

        if (!inventoryResponse.ok && inventoryResponse.status !== 204) {
          const errorData = await inventoryResponse.text();
          console.error(`[eBay] Inventory creation failed: ${inventoryResponse.status} ${errorData}`);
          results.push({
            itemId: item.id,
            sku,
            ebayListingId: null,
            status: 'error',
            error: 'INVENTORY_CREATION_FAILED',
            message: `Failed to create inventory item: ${inventoryResponse.status}`,
          });
          continue;
        }

        // Track successful API call toward daily limit
        trackEbayCall();

        // Verify the condition actually stuck on the inventory_item (diagnostic —
        // PUT can return 204 but eBay may silently reject condition changes on
        // pre-existing SKUs from prior failed pushes).
        try {
          const verifyRes = await fetch(inventoryUrl, {
            headers: ebayUserHeaders(accessToken),
          });
          if (verifyRes.ok) {
            trackEbayCall();
            const verifyData = (await verifyRes.json()) as { condition?: string };
            console.log(
              `[eBay InventoryVerify] ${sku}: sent=${ebayCondition} stored=${verifyData.condition || 'null'}`
            );
          }
        } catch (err) {
          console.warn('[eBay InventoryVerify] error:', err);
        }

        // Step 2: Upsert offer — find existing or create new, then update price/policies
        // resolvedDescription was computed above (Bug #424) and already has the
        // organizer's description template applied with all {{DESCRIPTION}} tokens
        // replaced. Use it directly for the offer's listingDescription as well.
        const finalDescription = resolvedDescription;

        const offerPayload: Record<string, unknown> = {
          sku,
          marketplaceId: 'EBAY_US',
          format: 'FIXED_PRICE',
          pricingSummary: {
            price: {
              currency: 'USD',
              value: price.toFixed(2),
            },
          },
          categoryId,
          listingDuration: 'GTC',
          merchantLocationKey,
          listingPolicies: {
            paymentPolicyId: routing.paymentPolicyId,
            fulfillmentPolicyId: routing.fulfillmentPolicyId,
            returnPolicyId: routing.returnPolicyId,
          },
          ...(finalDescription ? { listingDescription: finalDescription } : {}),
          ...(item.allowBestOffer ? {
            bestOfferTerms: {
              bestOfferEnabled: true,
              ...(item.bestOfferAutoAcceptAmt ? { autoAcceptPrice: { value: Number(item.bestOfferAutoAcceptAmt).toFixed(2), currency: 'USD' } } : {}),
              ...(item.bestOfferMinimumAmt ? { autoDeclinePrice: { value: Number(item.bestOfferMinimumAmt).toFixed(2), currency: 'USD' } } : {}),
            },
          } : {}),
          // Secondary category (evidence 2026-06-13, errorId 25005 param
          // SECONDARY_CATEGORY_ID "category selected is not a leaf category"):
          // eBay rejects any non-leaf secondary category. Only emit
          // item.ebaySecondaryCategoryId when it's a non-empty LEAF id that is
          // NOT a known root ('1' Collectibles, '20081' Antiques, '14339' Crafts)
          // and differs from the primary categoryId. The SECONDARY_CATEGORY_MAP
          // tag→category branch is DISABLED — that map produced only root
          // categories, so every tagged item failed to publish with 25005.
          ...(item.ebaySecondaryCategoryId &&
            typeof item.ebaySecondaryCategoryId === 'string' &&
            item.ebaySecondaryCategoryId.trim() &&
            !['1', '20081', '14339'].includes(item.ebaySecondaryCategoryId.trim()) &&
            item.ebaySecondaryCategoryId.trim() !== categoryId
            ? { secondaryCategoryId: item.ebaySecondaryCategoryId.trim() }
            : {}),
        };

        // Resolve existing offerId: use stored value or look up by SKU on eBay
        let offerId: string | null = item.ebayOfferId || null;
        let existingOfferCategoryId: string | null = null;
        let existingOfferStatus: string | null = null;

        if (!offerId) {
          const getOfferRes = await fetch(
            `${frontendUrl}/api/proxy/ebay?path=${encodeURIComponent(`/sell/inventory/v1/offer?sku=${encodeURIComponent(sku)}`)}`,
            {
              headers: {
                ...ebayUserHeaders(accessToken),
                ...(proxySecret ? { 'X-Proxy-Secret': proxySecret } : {}),
              },
            }
          );
          if (getOfferRes.ok) {
            const getOfferData = (await getOfferRes.json()) as any;
            const existing = getOfferData.offers?.[0];
            if (existing) {
              offerId = existing.offerId;
              existingOfferCategoryId = existing.categoryId || null;
              existingOfferStatus = existing.status || null;
            }
          }
        } else {
          // Fetch current state of the stored offer so we can compare categoryId
          const getOfferRes = await fetch(
            `${frontendUrl}/api/proxy/ebay?path=${encodeURIComponent(`/sell/inventory/v1/offer/${offerId}`)}`,
            {
              headers: {
                ...ebayUserHeaders(accessToken),
                ...(proxySecret ? { 'X-Proxy-Secret': proxySecret } : {}),
              },
            }
          );
          if (getOfferRes.ok) {
            const getOfferData = (await getOfferRes.json()) as any;
            existingOfferCategoryId = getOfferData.categoryId || null;
            existingOfferStatus = getOfferData.status || null;
          }
        }

        // If an existing UNPUBLISHED offer has a different categoryId than what we
        // want now (e.g. was created under an old bad branch category), eBay's
        // offer PUT may not cleanly swap it — delete and recreate to avoid 25021.
        if (
          offerId &&
          existingOfferStatus &&
          existingOfferStatus.toUpperCase() !== 'PUBLISHED' &&
          existingOfferCategoryId &&
          existingOfferCategoryId !== categoryId
        ) {
          console.log(
            `[eBay Offer] stale category detected: offer=${offerId} had=${existingOfferCategoryId} want=${categoryId} — deleting + recreating`
          );
          await fetch(`${frontendUrl}/api/proxy/ebay?path=${encodeURIComponent(`/sell/inventory/v1/offer/${offerId}`)}`, {
            method: 'DELETE',
            headers: {
              ...ebayUserHeaders(accessToken),
              ...(proxySecret ? { 'X-Proxy-Secret': proxySecret } : {}),
            },
          });
          offerId = null;
          await prisma.item.update({
            where: { id: item.id },
            data: { ebayOfferId: null },
          });
        }

        if (offerId) {
          // Update existing offer (PUT replaces the offer body)
          const updateRes = await fetch(
            `${frontendUrl}/api/proxy/ebay?path=${encodeURIComponent(`/sell/inventory/v1/offer/${offerId}`)}`,
            {
              method: 'PUT',
              headers: {
                ...ebayUserHeaders(accessToken),
                ...(proxySecret ? { 'X-Proxy-Secret': proxySecret } : {}),
              },
              body: JSON.stringify(offerPayload),
            }
          );
          if (!updateRes.ok && updateRes.status !== 204) {
            const errText = await updateRes.text();
            console.warn(`[eBay] Offer update failed (non-fatal): ${updateRes.status} ${errText}`);
            // Proceed anyway — existing offer may still be publishable
          } else {
            trackEbayCall();
          }
        } else {
          // Create new offer
          const createRes = await fetch(`${frontendUrl}/api/proxy/ebay?path=/sell/inventory/v1/offer`, {
            method: 'POST',
            headers: {
              ...ebayUserHeaders(accessToken),
              ...(proxySecret ? { 'X-Proxy-Secret': proxySecret } : {}),
            },
            body: JSON.stringify(offerPayload),
          });
          if (!createRes.ok) {
            const errText = await createRes.text();
            console.error(`[eBay] Offer creation failed: ${createRes.status} ${errText}`);
            results.push({
              itemId: item.id,
              sku,
              ebayListingId: null,
              status: 'error',
              error: 'OFFER_CREATION_FAILED',
              message: `Failed to create offer: ${createRes.status}`,
            });
            continue;
          }
          trackEbayCall();
          const createData = (await createRes.json()) as any;
          offerId = createData.offerId;
        }

        // Store offerId
        await prisma.item.update({
          where: { id: item.id },
          data: { ebayOfferId: offerId },
        });

        // Track which condition is currently committed to eBay's inventory item.
        // Initially this matches what we PUT in Step 1 (ebayCondition). When the 25021
        // retry succeeds with a new value, we update this so the 25101 retry uses the
        // correct condition instead of reverting to the original payload's value.
        let currentInventoryCondition: string = ebayCondition;

        // Step 3: Publish offer LIVE (S725: DRAFT mode removed — broken-by-design)
        const publishPath = encodeURIComponent(`/sell/inventory/v1/offer/${offerId}/publish`);
        const publishUrl = `${frontendUrl}/api/proxy/ebay?path=${publishPath}`;

        let publishResponse = await fetch(publishUrl, {
          method: 'POST',
          headers: {
            ...ebayUserHeaders(accessToken),
            ...(proxySecret ? { 'X-Proxy-Secret': proxySecret } : {}),
          },
        });

        // Resolve listing ID — either from publish response or from existing offer
        let ebayListingId: string | null = null;

        // 25021 retry: eBay sometimes rejects a condition even when the metadata
        // API says it's accepted (stale inventory state, category transition edge
        // cases). If we see 25021, walk the accepted-conditions list and retry
        // the inventory PUT + publish with each candidate until one works or we
        // exhaust the list.
        // Pass 1: 25021 condition retry
        if (!publishResponse.ok) {
          const publishErrorText = await publishResponse.clone().text();
          if (publishErrorText.includes('25021')) {
            const accepted = await getAcceptedConditionsForCategory(categoryId ?? '99');
            // Bias retry toward conditions that MATCH the item's current condition family
            // (USED_* vs NEW_*). For a used item with USED_VERY_GOOD initially rejected,
            // try USED_GOOD next, not NEW_OTHER (which is wrong for a used item).
            const isUsedFamily = typeof ebayCondition === 'string' && ebayCondition.startsWith('USED_');
            const retryOrder = (isUsedFamily
              ? ['USED_GOOD', 'USED_VERY_GOOD', 'USED_EXCELLENT', 'USED_ACCEPTABLE', 'FOR_PARTS_OR_NOT_WORKING', 'NEW_OTHER', 'NEW']
              : ['NEW_OTHER', 'NEW', 'NEW_WITH_DEFECTS', 'USED_EXCELLENT', 'USED_GOOD']
            ).filter((c) => c !== ebayCondition && (!accepted || accepted.has(c)));

            for (const retryCondition of retryOrder) {
              console.log(
                `[eBay Retry25021] ${sku}: ${ebayCondition} rejected — retrying with ${retryCondition}`
              );
              const retryInvPayload = { ...inventoryPayload, condition: retryCondition };
              const retryInvRes = await fetch(inventoryUrl, {
                method: 'PUT',
                headers: {
                  ...ebayUserHeaders(accessToken),
                  ...(proxySecret ? { 'X-Proxy-Secret': proxySecret } : {}),
                },
                body: JSON.stringify(retryInvPayload),
              });
              if (!retryInvRes.ok && retryInvRes.status !== 204) {
                const t = await retryInvRes.text();
                console.warn(`[eBay Retry25021] inventory PUT failed: ${retryInvRes.status} ${t.slice(0, 200)}`);
                continue;
              }
              publishResponse = await fetch(publishUrl, {
                method: 'POST',
                headers: {
                  ...ebayUserHeaders(accessToken),
                  ...(proxySecret ? { 'X-Proxy-Secret': proxySecret } : {}),
                },
              });
              if (publishResponse.ok) {
                console.log(`[eBay Retry25021] ${sku}: succeeded with condition=${retryCondition}`);
                currentInventoryCondition = retryCondition;
                break;
              }
              // Even if THIS publish ultimately fails with a different error (e.g. 25101),
              // remember that the PUT succeeded with this condition — Pass 3 needs it.
              currentInventoryCondition = retryCondition;
              const retryErr = await publishResponse.clone().text();
              if (!retryErr.includes('25021')) {
                console.warn(`[eBay Retry25021] ${sku}: non-25021 error, stopping: ${retryErr.slice(0, 200)}`);
                break;
              }
            }
          }
        }

        // Pass 2: 25005 category-not-a-leaf retry (runs after 25021 pass or on initial 25005)
        if (!publishResponse.ok) {
          const currentErrorText = await publishResponse.clone().text();
          if (currentErrorText.includes('25005')) {
            // Clear the bad cached category so future pushes re-query
            await prisma.item.update({
              where: { id: item.id },
              data: { ebayCategoryId: null },
            });
            const candidates = await getEbayCategoryCandidates(item.title);
            const alreadyTried = new Set([categoryId ?? '']);
            for (const candidate of candidates) {
              if (alreadyTried.has(candidate.categoryId)) continue;
              alreadyTried.add(candidate.categoryId);
              console.log(
                `[eBay Retry25005] ${sku}: category ${categoryId} not a leaf — retrying with ${candidate.categoryId} (${candidate.categoryName})`
              );
              // Fetch current offer to preserve all fields (PUT replaces entire object)
              const existingOfferRes = await fetch(
                `${frontendUrl}/api/proxy/ebay?path=${encodeURIComponent(`/sell/inventory/v1/offer/${offerId}`)}`,
                {
                  headers: {
                    ...ebayUserHeaders(accessToken),
                    ...(proxySecret ? { 'X-Proxy-Secret': proxySecret } : {}),
                  },
                }
              );
              if (!existingOfferRes.ok) {
                console.warn(`[eBay Retry25005] could not fetch offer: ${existingOfferRes.status}`);
                continue;
              }
              const existingOffer = (await existingOfferRes.json()) as any;
              const updatedOffer = { ...existingOffer, categoryId: candidate.categoryId };
              // Strip read-only fields eBay rejects on PUT
              delete updatedOffer.offerId;
              delete updatedOffer.offerState;
              delete updatedOffer.listing;
              const patchOfferRes = await fetch(
                `${frontendUrl}/api/proxy/ebay?path=${encodeURIComponent(`/sell/inventory/v1/offer/${offerId}`)}`,
                {
                  method: 'PUT',
                  headers: {
                    ...ebayUserHeaders(accessToken),
                    ...(proxySecret ? { 'X-Proxy-Secret': proxySecret } : {}),
                  },
                  body: JSON.stringify(updatedOffer),
                }
              );
              if (!patchOfferRes.ok && patchOfferRes.status !== 204) {
                const t = await patchOfferRes.text();
                console.warn(`[eBay Retry25005] offer PUT failed: ${patchOfferRes.status} ${t.slice(0, 200)}`);
                continue;
              }
              publishResponse = await fetch(publishUrl, {
                method: 'POST',
                headers: {
                  ...ebayUserHeaders(accessToken),
                  ...(proxySecret ? { 'X-Proxy-Secret': proxySecret } : {}),
                },
              });
              if (publishResponse.ok) {
                categoryId = candidate.categoryId;
                await prisma.item.update({
                  where: { id: item.id },
                  // Persist name too so the retry-resolved category shows in edit-item.
                  data: { ebayCategoryId: candidate.categoryId, ebayCategoryName: candidate.categoryName },
                });
                console.log(`[eBay Retry25005] ${sku}: succeeded with category=${candidate.categoryId}`);
                break;
              }
              const retryErr = await publishResponse.clone().text();
              if (!retryErr.includes('25005')) {
                console.warn(`[eBay Retry25005] ${sku}: non-25005 error, stopping: ${retryErr.slice(0, 200)}`);
                break;
              }
            }
          }
        }

        // Pass 3: 25101 Invalid <ShippingPackage> retry — eBay rejected the
        // item's packageType because the picked fulfillment policy's shipping
        // services don't accept it (e.g. policy with USPS_FLAT_RATE_ENVELOPE
        // services but item.packageType=MAILING_BOX or PARCEL_OR_PADDED_ENVELOPE).
        // Defensive fix: strip packageType from the inventory payload and let
        // eBay infer from weight/dims. Logs the event so the organizer-set
        // packageType vs picked-policy mismatch is diagnosable.
        if (!publishResponse.ok) {
          const currentErrorText = await publishResponse.clone().text();
          if (currentErrorText.includes('25101')) {
            console.warn(`[eBay 25101 Retry] sku=${sku} pickedPolicy=${routing.fulfillmentPolicyId} itemPackageType="${item.packageType ?? 'null'}" currentCondition=${currentInventoryCondition} — stripping packageType and retrying`);
            // Preserve whatever condition is currently on eBay's inventory item (which
            // may have been updated by Pass 1's 25021 retry). Reverting to the original
            // inventoryPayload.condition would re-trigger the 25021 we just resolved.
            const stripped = { ...inventoryPayload, condition: currentInventoryCondition };
            if ((stripped as any).packageWeightAndSize) {
              const pkg = { ...((stripped as any).packageWeightAndSize as Record<string, unknown>) };
              delete (pkg as any).packageType;
              (stripped as any).packageWeightAndSize = pkg;
            }
            const retryInvRes = await fetch(inventoryUrl, {
              method: 'PUT',
              headers: {
                ...ebayUserHeaders(accessToken),
                ...(proxySecret ? { 'X-Proxy-Secret': proxySecret } : {}),
              },
              body: JSON.stringify(stripped),
            });
            if (retryInvRes.ok || retryInvRes.status === 204) {
              publishResponse = await fetch(publishUrl, {
                method: 'POST',
                headers: {
                  ...ebayUserHeaders(accessToken),
                  ...(proxySecret ? { 'X-Proxy-Secret': proxySecret } : {}),
                },
              });
              if (publishResponse.ok) {
                trackEbayCall();
                console.log(`[eBay 25101 Retry] ${sku}: succeeded after stripping packageType`);
              } else {
                const stillErr = await publishResponse.clone().text();
                console.warn(`[eBay 25101 Retry] ${sku}: still failing: ${stillErr.slice(0, 200)}`);
              }
            } else {
              console.warn(`[eBay 25101 Retry] inventory PUT (strip packageType) failed: ${retryInvRes.status}`);
            }
          }
        }

        if (publishResponse.ok) {
          trackEbayCall();
          const publishData = (await publishResponse.json()) as any;
          ebayListingId = publishData.listingId;
        } else {
          const publishError = await publishResponse.text();
          console.warn(`[eBay] Publish returned ${publishResponse.status}: ${publishError}`);

          // If already published, fetch listingId from the existing offer
          const offerDetailRes = await fetch(
            `${frontendUrl}/api/proxy/ebay?path=${encodeURIComponent(`/sell/inventory/v1/offer/${offerId}`)}`,
            {
              headers: {
                ...ebayUserHeaders(accessToken),
                ...(proxySecret ? { 'X-Proxy-Secret': proxySecret } : {}),
              },
            }
          );
          if (offerDetailRes.ok) {
            const offerDetail = (await offerDetailRes.json()) as any;
            ebayListingId = offerDetail.listing?.listingId || null;
          }

          if (!ebayListingId) {
            const is25005 = publishError.includes('25005');
            if (is25005) {
              await prisma.item.update({
                where: { id: item.id },
                data: { ebayNeedsReview: true },
              });
              console.warn(`[eBay] Category review needed for ${sku} — organizer must set eBay category manually`);
              results.push({
                itemId: item.id,
                sku,
                ebayListingId: null,
                status: 'category_review_needed',
                error: 'CATEGORY_REVIEW_NEEDED',
                message: 'eBay could not find a valid category for this item. Open the item editor, set the eBay Category, and push again.',
              });
            } else {
              console.error(`[eBay] Publish failed and no listingId found: ${publishResponse.status} ${publishError}`);
              results.push({
                itemId: item.id,
                sku,
                ebayListingId: null,
                status: 'error',
                error: 'PUBLISH_FAILED',
                message: `Failed to publish offer: ${publishResponse.status}`,
              });
            }
            continue;
          }
        }

        // Update item with eBay listing ID; auto-publish on FindA.Sale; clear any prior review flag
        await prisma.item.update({
          where: { id: item.id },
          data: {
            ebayListingId,
            listedOnEbayAt: new Date(),
            // ebayListedAt: first listing timestamp — only set once, never overwritten on relist
            ...(item.ebayListedAt == null ? { ebayListedAt: new Date() } : {}),
            ebayNeedsReview: false,
            // Auto-publish on FindA.Sale when pushed to eBay — item should not
            // remain on the "review & publish" page after a successful eBay push.
            ...(item.draftStatus !== 'PUBLISHED' ? { draftStatus: 'PUBLISHED' } : {}),
          },
        });

        results.push({
          itemId: item.id,
          sku,
          ebayListingId,
          status: 'success',
          ebayUrl: `https://www.ebay.com/itm/${ebayListingId}`,
          publishedAt: new Date(),
        });
      } catch (itemError) {
        // Structured per-item error log — captures saleId/itemId/category/reason
        // so push failures are diagnosable without sifting stack traces. The
        // loop continues so one bad item never kills the whole push job.
        const errMsg = itemError instanceof Error ? itemError.message : String(itemError);
        const errStack = itemError instanceof Error ? itemError.stack : undefined;
        console.error(
          `[eBay Push Failed] saleId=${saleId} itemId=${item.id} title="${(item.title || '').slice(0, 60)}" category=${item.ebayCategoryId || 'none'} reason=${errMsg}`
        );
        if (errStack) {
          console.error(`[eBay Push Failed] stack: ${errStack.split('\n').slice(0, 4).join(' | ')}`);
        }
        results.push({
          itemId: item.id,
          sku: buildCustomLabel(item.id, organizer, item),
          ebayListingId: null,
          status: 'error',
          error: 'INTERNAL_ERROR',
          message: `Internal server error processing item: ${errMsg.slice(0, 200)}`,
        });
      }
    }

    // Calculate summary
    const summary = {
      total: results.length,
      success: results.filter((r: any) => r.status === 'success').length,
      failed: results.filter((r: any) => r.status === 'error').length,
    };

    // Increment eBay push counter for successful pushes (includes drafts).
    // Wrapped defensively — if the quota update throws, we still want to
    // return the per-item results so the organizer sees what shipped.
    const successCount = results.filter((r: any) => r.status === 'success' || r.status === 'draft').length;
    if (successCount > 0) {
      try {
        await prisma.organizer.update({
          where: { id: organizer.id },
          data: {
            ebayPushesThisMonth: { increment: successCount },
            ebayPushesResetAt: organizer.ebayPushesResetAt || new Date(), // Initialize if not set
          },
        });
      } catch (quotaErr) {
        const msg = quotaErr instanceof Error ? quotaErr.message : String(quotaErr);
        console.error(
          `[eBay Push Failed] quota update failed (results still returned) organizerId=${organizer.id} successCount=${successCount} reason=${msg}`
        );
      }
    }

    res.json({ results, summary });
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    const stack = error instanceof Error ? error.stack : undefined;
    console.error(`[eBay Push Failed] saleId=${req.params.saleId} fatal=${msg}`);
    if (stack) {
      console.error(`[eBay Push Failed] stack: ${stack.split('\n').slice(0, 6).join(' | ')}`);
    }
    if (!res.headersSent) {
      res.status(500).json({ message: 'Failed to push items to eBay', error: msg.slice(0, 200) });
    }
  }
};

/**
 * POST /api/ebay/items/:itemId/publish
 *
 * S725: "Publish to eBay now" — publishes an existing UNPUBLISHED Inventory API
 * offer that was created by an earlier push (e.g. when DRAFT mode was on, or
 * when the publish step failed but the offer was created). Replaces the dead
 * "Push as Draft" flow — DRAFT offers in eBay's Inventory API cannot be viewed
 * or published from the Seller Hub UI, so we surface a publish button in-app.
 *
 * Behavior:
 *   - Requires authentication + organizer ownership of the item
 *   - Reads item.ebayOfferId — 400 if null
 *   - Calls eBay POST /sell/inventory/v1/offer/{offerId}/publish
 *   - On 25021 (condition rejected): walks accepted-conditions list
 *   - On success: stores item.ebayListingId, returns { ebayListingId, ebayItemUrl }
 */
export const publishItemOffer = async (req: AuthRequest, res: Response) => {
  try {
    const { itemId } = req.params;
    const userId = req.user?.id;

    if (!userId) {
      return res.status(401).json({ message: 'Authentication required' });
    }

    // Load the item + its sale's organizerId for ownership check
    const item = await prisma.item.findUnique({
      where: { id: itemId },
      select: {
        id: true,
        ebayOfferId: true,
        ebayListingId: true,
        ebayListedAt: true,
        ebayCategoryId: true,
        ebayCategoryName: true,
        draftStatus: true,
        title: true,
        category: true,
        brand: true,
        mpn: true,
        createdAt: true,
        costBasis: true,
        roomTag: true,
        sale: { select: { organizerId: true, address: true, city: true, state: true, zip: true } },
      },
    });

    if (!item) {
      return res.status(404).json({ message: 'Item not found' });
    }

    // Inventory items without a sale can't be published this way.
    if (!item.sale) {
      return res.status(400).json({ message: 'Item is not attached to a sale' });
    }

    // Organizer ownership check
    const organizer = await prisma.organizer.findUnique({
      where: { userId },
      include: { ebayConnection: true },
    });
    if (!organizer) {
      return res.status(404).json({ message: 'Organizer profile not found' });
    }
    if (item.sale.organizerId !== organizer.id) {
      return res.status(403).json({ message: 'Not authorized to publish this item' });
    }

    // Already live? Idempotent — but re-pin shipping first (Part B).
    // Re-pushing a live item is a signal the organizer may have re-rated it
    // (re-weighed/measured), so re-resolve and re-apply the shipping policy to
    // the live offer before returning. Never let resync failure break the
    // idempotent response — the listing URL must always come back.
    if (item.ebayListingId) {
      let shippingResynced = false;
      try {
        const resync = await resyncItemShippingPolicy(item.id);
        shippingResynced = resync.changed;
      } catch (resyncErr) {
        console.warn(
          `[eBay PublishNow] shipping resync failed for item ${item.id} (non-fatal):`,
          (resyncErr as Error).message
        );
      }
      return res.json({
        ebayListingId: item.ebayListingId,
        ebayItemUrl: `https://www.ebay.com/itm/${item.ebayListingId}`,
        alreadyPublished: true,
        shippingResynced,
      });
    }

    if (!item.ebayOfferId) {
      return res.status(400).json({
        code: 'NO_OFFER',
        message: 'Item has not been pushed to eBay yet',
      });
    }

    if (!organizer.ebayConnection) {
      return res.status(400).json({ message: 'eBay account not connected' });
    }

    const accessToken = await refreshEbayAccessToken(organizer.id);
    if (!accessToken) {
      return res.status(500).json({ message: 'Failed to refresh eBay access token' });
    }

    if (isEbayRateLimited()) {
      return res.status(429).json({
        code: 'EBAY_RATE_LIMITED',
        message: 'Daily eBay API limit reached. Try again tomorrow.',
      });
    }

    const frontendUrl = process.env.FRONTEND_URL ?? 'https://finda.sale';
    const proxySecret = process.env.EBAY_PROXY_SECRET;
    // Canonical SKU — must match the eBay Custom Label originally pushed to eBay.
    // The repair paths below GET/PUT the inventory item by SKU; using a bare
    // `FAS-${item.id}` 404s when the organizer has skuAppendDate/Cost/Location toggles
    // enabled. buildCustomLabel applies those toggles so the SKU matches eBay.
    const sku = buildCustomLabel(item.id, organizer, item);
    const publishPath = encodeURIComponent(`/sell/inventory/v1/offer/${item.ebayOfferId}/publish`);
    const publishUrl = `${frontendUrl}/api/proxy/ebay?path=${publishPath}`;

    let publishResponse = await fetch(publishUrl, {
      method: 'POST',
      headers: {
        ...ebayUserHeaders(accessToken),
        ...(proxySecret ? { 'X-Proxy-Secret': proxySecret } : {}),
      },
    });

    let ebayListingId: string | null = null;

    if (publishResponse.ok) {
      trackEbayCall();
      const publishData = (await publishResponse.json()) as any;
      ebayListingId = publishData.listingId;
    } else {
      const publishError = await publishResponse.text();
      console.warn(`[eBay PublishNow] offerId=${item.ebayOfferId} status=${publishResponse.status} body=${publishError.slice(0, 300)}`);

      // 25021 retry path: walk accepted conditions and re-publish
      if (publishError.includes('25021') && item.ebayCategoryId) {
        // Resolve the canonical SKU from the live offer — buildCustomLabel may return a
        // different string if item fields (roomTag, costBasis, createdAt) changed since
        // the offer was first pushed.  The offer always stores the original SKU.
        let canonicalSku25021 = sku;
        const offerPath25021 = encodeURIComponent(`/sell/inventory/v1/offer/${item.ebayOfferId}`);
        const offerGetRes25021 = await fetch(ebayProxyUrl(offerPath25021), {
          headers: { ...ebayUserHeaders(accessToken), ...ebayProxyHeaders() },
        });
        if (offerGetRes25021.ok) {
          const offerData25021 = (await offerGetRes25021.json()) as any;
          if (offerData25021.sku) canonicalSku25021 = offerData25021.sku;
        } else {
          console.warn(`[eBay PublishNow 25021] offer GET failed (${offerGetRes25021.status}); falling back to buildCustomLabel SKU`);
        }
        const inventoryPath = encodeURIComponent(`/sell/inventory/v1/inventory_item/${encodeURIComponent(canonicalSku25021)}`);
        const inventoryUrl = ebayProxyUrl(inventoryPath);
        // Fetch the current inventory item so we have its payload shape
        const invGet = await fetch(inventoryUrl, { headers: { ...ebayUserHeaders(accessToken), ...ebayProxyHeaders() } });
        if (invGet.ok) {
          const invBody = (await invGet.json()) as any;
          const accepted = await getAcceptedConditionsForCategory(item.ebayCategoryId);
          // Bias retry toward conditions that MATCH the item's current condition family
          // (USED_* vs NEW_*). If the existing condition is a USED_* variant, prefer
          // USED_GOOD (eBay's universal "Used") and other USED variants before falling
          // back to NEW_OTHER. Prevents auto-listing used items as NEW_OTHER just
          // because that came first alphabetically in the fallback list.
          const isUsedFamily = typeof invBody.condition === 'string' && invBody.condition.startsWith('USED_');
          const retryOrder = (isUsedFamily
            ? ['USED_GOOD', 'USED_VERY_GOOD', 'USED_EXCELLENT', 'USED_ACCEPTABLE', 'FOR_PARTS_OR_NOT_WORKING', 'NEW_OTHER', 'NEW']
            : ['NEW_OTHER', 'NEW', 'NEW_WITH_DEFECTS', 'USED_EXCELLENT', 'USED_GOOD']
          ).filter((c) => c !== invBody.condition && (!accepted || accepted.has(c)));
          for (const retryCondition of retryOrder) {
            console.log(`[eBay PublishNow Retry25021] ${canonicalSku25021}: retrying with condition=${retryCondition}`);
            const retryInvPayload = { ...invBody, condition: retryCondition };
            const retryInvRes = await fetch(inventoryUrl, {
              method: 'PUT',
              headers: {
                ...ebayUserHeaders(accessToken),
                ...(proxySecret ? { 'X-Proxy-Secret': proxySecret } : {}),
              },
              body: JSON.stringify(retryInvPayload),
            });
            if (!retryInvRes.ok && retryInvRes.status !== 204) continue;
            publishResponse = await fetch(publishUrl, {
              method: 'POST',
              headers: {
                ...ebayUserHeaders(accessToken),
                ...(proxySecret ? { 'X-Proxy-Secret': proxySecret } : {}),
              },
            });
            if (publishResponse.ok) {
              trackEbayCall();
              const publishData = (await publishResponse.json()) as any;
              ebayListingId = publishData.listingId;
              break;
            }
          }
        }
      }

      // 25002 self-heal path: a stale offer can have a missing required item-specific
      // (most commonly Brand). The bulk-push aspect builder may have skipped it if the
      // Taxonomy API failed at push time, and the publish path only re-publishes the
      // existing offer — it never rebuilds aspects. So when publish fails with 25002,
      // GET the inventory item, inject Brand (and MPN) from the organizer's current
      // values into product.aspects, PUT it back, then re-publish once. Fall back to
      // "Unbranded" (eBay's accepted no-brand value) when the organizer set no brand.
      if (!ebayListingId && publishError.includes('25002')) {
        // Resolve the canonical SKU from the live offer — same SKU-drift risk as 25021.
        let canonicalSku25002 = sku;
        const offerPath25002 = encodeURIComponent(`/sell/inventory/v1/offer/${item.ebayOfferId}`);
        const offerGetRes25002 = await fetch(ebayProxyUrl(offerPath25002), {
          headers: { ...ebayUserHeaders(accessToken), ...ebayProxyHeaders() },
        });
        if (offerGetRes25002.ok) {
          const offerData25002 = (await offerGetRes25002.json()) as any;
          if (offerData25002.sku) canonicalSku25002 = offerData25002.sku;
        } else {
          console.warn(`[eBay PublishNow 25002] offer GET failed (${offerGetRes25002.status}); falling back to buildCustomLabel SKU`);
        }
        const inventoryPath = encodeURIComponent(`/sell/inventory/v1/inventory_item/${encodeURIComponent(canonicalSku25002)}`);
        const inventoryUrl = ebayProxyUrl(inventoryPath);
        const invGet = await fetch(inventoryUrl, { headers: { ...ebayUserHeaders(accessToken), ...ebayProxyHeaders() } });
        if (invGet.ok) {
          const invBody = (await invGet.json()) as any;
          if (!invBody.product || typeof invBody.product !== 'object') invBody.product = {};
          const aspectsObj: Record<string, string[]> =
            invBody.product.aspects && typeof invBody.product.aspects === 'object'
              ? invBody.product.aspects
              : {};
          const hasKey = (key: string): boolean =>
            Object.keys(aspectsObj).some((k) => k.toLowerCase() === key.toLowerCase());
          if (!hasKey('Brand')) {
            aspectsObj['Brand'] = item.brand && item.brand.trim() ? [item.brand.trim()] : ['Unbranded'];
          }
          // Brand+MPN pairing (evidence 2026-06-13, errorId 25002 param BrandMPN):
          // this self-heal always sets a Brand aspect, so MPN MUST also be present
          // or eBay re-rejects with the <BrandMPN> error. Inject MPN whenever the
          // aspect is absent — use the organizer's real MPN or 'Does Not Apply'.
          if (!hasKey('MPN')) {
            aspectsObj['MPN'] = [item.mpn?.trim() || 'Does Not Apply'];
          }
          // Model aspect: required for many hardware/electronics categories (e.g. 47091).
          // Use item.mpn as Model when organizer has set it; fall back to title-derived.
          if (!hasKey('Model')) {
            const modelVal = item.mpn?.trim()
              || (item as any).title?.replace(new RegExp('\\b' + (item.brand || '').replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '\\b', 'i'), '').trim().slice(0, 65)
              || 'Unspecified';
            aspectsObj['Model'] = [modelVal];
          }
          invBody.product.aspects = aspectsObj;
          // Mirror the MPN into the top-level product field so the pair is complete.
          if (!invBody.product.mpn) {
            invBody.product.mpn = item.mpn?.trim() || 'Does Not Apply';
          }
          console.log(`[eBay PublishNow Retry25002] ${canonicalSku25002}: injecting Brand=${aspectsObj['Brand']?.[0]} + MPN=${aspectsObj['MPN']?.[0]} and re-publishing`);
          const retryInvRes = await fetch(inventoryUrl, {
            method: 'PUT',
            headers: {
              ...ebayUserHeaders(accessToken),
              ...(proxySecret ? { 'X-Proxy-Secret': proxySecret } : {}),
            },
            body: JSON.stringify(invBody),
          });
          if (retryInvRes.ok || retryInvRes.status === 204) {
            publishResponse = await fetch(publishUrl, {
              method: 'POST',
              headers: {
                ...ebayUserHeaders(accessToken),
                ...(proxySecret ? { 'X-Proxy-Secret': proxySecret } : {}),
              },
            });
            if (publishResponse.ok) {
              trackEbayCall();
              const publishData = (await publishResponse.json()) as any;
              ebayListingId = publishData.listingId;
            }
          }
        }
      }

         // 25005 self-heal: eBay category is invalid/deprecated.
      // Strategy: GET the current offer from eBay, swap categoryId with a fresh taxonomy
      // lookup, PUT it back (or delete+recreate if PUT fails), then republish.
      if (!ebayListingId && publishError.includes('25005')) {
        console.warn(`[eBay PublishNow 25005] ${sku}: invalid category — attempting full self-heal`);
        try {
          // 1. Get fresh category from eBay taxonomy
          const freshCategory = await suggestEbayCategoryForTitle(item.title, (item as any).category ?? null);
          const newCategoryId = freshCategory?.categoryId;

          if (newCategoryId) {
            // 2. GET the current offer payload from eBay
            const offerPath = encodeURIComponent(`/sell/inventory/v1/offer/${item.ebayOfferId}`);
            const offerGetRes = await fetch(ebayProxyUrl(offerPath), {
              headers: { ...ebayUserHeaders(accessToken), ...ebayProxyHeaders() },
            });

            if (offerGetRes.ok) {
              trackEbayCall();
              const offerBody = (await offerGetRes.json()) as Record<string, unknown>;

              // Build updated offer — swap category, strip eBay read-only fields
              const updatedOffer: Record<string, unknown> = { ...offerBody, categoryId: newCategoryId };
              for (const ro of ['offerId', 'status', 'listing', 'listingId', 'listingStatus', 'marketplaceId']) {
                delete updatedOffer[ro];
              }

              // 3. Try PUT (update in place)
              let activeOfferId: string = item.ebayOfferId as string;
              const offerPutRes = await fetch(ebayProxyUrl(offerPath), {
                method: 'PUT',
                headers: { ...ebayUserHeaders(accessToken), ...ebayProxyHeaders() },
                body: JSON.stringify(updatedOffer),
              });

              if (offerPutRes.ok || offerPutRes.status === 204) {
                trackEbayCall();
                console.log(`[eBay PublishNow 25005] offer PUT succeeded with category=${newCategoryId}`);
                await prisma.item.update({
                  where: { id: item.id },
                  data: { ebayCategoryId: newCategoryId, ebayCategoryName: freshCategory.categoryName },
                });
              } else {
                // 4. PUT failed — delete and recreate offer
                const putErrText = await offerPutRes.text();
                console.warn(`[eBay PublishNow 25005] PUT failed (${offerPutRes.status} ${putErrText.slice(0, 200)}) — deleting + recreating offer`);

                await fetch(ebayProxyUrl(offerPath), {
                  method: 'DELETE',
                  headers: { ...ebayUserHeaders(accessToken), ...ebayProxyHeaders() },
                });

                // updatedOffer already has the new categoryId and no read-only fields
                // marketplaceId is required for POST — add it back
                updatedOffer.marketplaceId = 'EBAY_US';
                const createRes = await fetch(
                  `${frontendUrl}/api/proxy/ebay?path=/sell/inventory/v1/offer`,
                  {
                    method: 'POST',
                    headers: { ...ebayUserHeaders(accessToken), ...ebayProxyHeaders() },
                    body: JSON.stringify(updatedOffer),
                  }
                );

                if (createRes.ok) {
                  trackEbayCall();
                  const createData = (await createRes.json()) as any;
                  activeOfferId = createData.offerId;
                  console.log(`[eBay PublishNow 25005] new offer created: offerId=${activeOfferId} category=${newCategoryId}`);
                  await prisma.item.update({
                    where: { id: item.id },
                    data: {
                      ebayOfferId: activeOfferId,
                      ebayCategoryId: newCategoryId,
                      ebayCategoryName: freshCategory.categoryName,
                    },
                  });
                } else {
                  const createErr = await createRes.text();
                  console.error(`[eBay PublishNow 25005] offer recreate failed: ${createErr.slice(0, 300)}`);
                }
              }

              // 5. Republish with the corrected offer
              const republishPath = encodeURIComponent(`/sell/inventory/v1/offer/${activeOfferId}/publish`);
              publishResponse = await fetch(`${frontendUrl}/api/proxy/ebay?path=${republishPath}`, {
                method: 'POST',
                headers: {
                  ...ebayUserHeaders(accessToken),
                  ...(proxySecret ? { 'X-Proxy-Secret': proxySecret } : {}),
                },
              });
              if (publishResponse.ok) {
                trackEbayCall();
                const pubData = (await publishResponse.json()) as any;
                ebayListingId = pubData.listingId ?? null;
                console.log(`[eBay PublishNow 25005] self-heal published: listingId=${ebayListingId}`);
              } else {
                const pubErr = await publishResponse.text();
                console.warn(`[eBay PublishNow 25005] re-publish failed: ${pubErr.slice(0, 300)}`);
              }
            } else {
              console.warn(`[eBay PublishNow 25005] offer GET failed (${offerGetRes.status}) — cannot self-heal`);
            }
          } else {
            console.warn(`[eBay PublishNow 25005] taxonomy returned no category for "${item.title.slice(0, 40)}" — cannot self-heal`);
          }
        } catch (healErr) {
          console.error('[eBay PublishNow 25005] self-heal threw:', (healErr as Error).message);
        }

        // If still no listingId, clear the stale category so the next push re-resolves it
        if (!ebayListingId) {
          await prisma.item.update({
            where: { id: item.id },
            data: { ebayCategoryId: null, ebayCategoryName: null },
          });
          console.warn(`[eBay PublishNow 25005] self-heal failed — stale category cleared for next push`);
        }
      }

            // If still no listingId, try fetching from the offer directly (in case it already published)
      if (!ebayListingId) {
        const offerDetailRes = await fetch(
          `${frontendUrl}/api/proxy/ebay?path=${encodeURIComponent(`/sell/inventory/v1/offer/${item.ebayOfferId}`)}`,
          { headers: { ...ebayUserHeaders(accessToken), ...(proxySecret ? { 'X-Proxy-Secret': proxySecret } : {}) } }
        );
        if (offerDetailRes.ok) {
          const offerDetail = (await offerDetailRes.json()) as any;
          ebayListingId = offerDetail.listing?.listingId || null;
        }
      }

      if (!ebayListingId) {
        return res.status(400).json({
          code: 'PUBLISH_FAILED',
          message: parseEbayErrorMessage(publishError) || `eBay rejected publish (status ${publishResponse.status})`,
          ebayStatus: publishResponse.status,
        });
      }
    }

    // Success — persist listing ID and auto-publish on FindA.Sale
    await prisma.item.update({
      where: { id: item.id },
      data: {
        ebayListingId,
        listedOnEbayAt: new Date(),
        // ebayListedAt: first listing timestamp — only set once, never overwritten on relist
        ...(item.ebayListedAt == null ? { ebayListedAt: new Date() } : {}),
        ebayNeedsReview: false,
        // Auto-publish on FindA.Sale — pushing to eBay should remove the item
        // from the "review & publish" queue automatically.
        ...(item.draftStatus !== 'PUBLISHED' ? { draftStatus: 'PUBLISHED' } : {}),
      },
    });

    return res.json({
      ebayListingId,
      ebayItemUrl: `https://www.ebay.com/itm/${ebayListingId}`,
    });
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    console.error(`[eBay PublishNow Failed] itemId=${req.params.itemId} reason=${msg}`);
    if (!res.headersSent) {
      return res.status(500).json({ message: 'Failed to publish item', error: msg.slice(0, 200) });
    }
  }
};

/**
 * Helper: extract the first user-friendly error message from an eBay error response body.
 */
function parseEbayErrorMessage(body: string): string | null {
  try {
    const parsed = JSON.parse(body);
    if (parsed?.errors?.[0]?.message) return String(parsed.errors[0].message);
    if (parsed?.errors?.[0]?.longMessage) return String(parsed.errors[0].longMessage);
    if (parsed?.message) return String(parsed.message);
  } catch {
    // not JSON
  }
  return null;
}

/**
 * Helper: Build aspects object from tags
 */
/**
 * Fetch the first existing merchant location key, or create a default US one.
 * Required by eBay Inventory API to satisfy Item.Country on offer publishing.
 * eBay requires city + stateOrProvince + postalCode + country for US locations.
 * Status cannot be set at creation — must call /enable separately.
 */
async function getOrCreateMerchantLocation(
  accessToken: string,
  saleAddressHint?: { address: string; city: string; state: string; zip: string } | null
): Promise<{ merchantLocationKey: string } | { error: string }> {
  const headers = {
    Authorization: `Bearer ${accessToken}`,
    'Content-Type': 'application/json',
    'Content-Language': 'en-US',
  };

  // --- Path 1: saleAddressHint provided — use deterministic zip-based location key ---
  if (saleAddressHint) {
    const locationKey = `findasale-${saleAddressHint.zip}`;
    console.log(`[eBay] saleAddressHint provided — using deterministic location key: ${locationKey}`);

    // Try to GET the specific location first
    try {
      const getRes = await fetch(ebayProxyUrl(`/sell/inventory/v1/location/${locationKey}`), {
        headers: {
          ...headers,
          ...ebayProxyHeaders(),
        },
      });
      if (getRes.ok) {
        console.log(`[eBay] Existing location found for key ${locationKey} — reusing`);
        return { merchantLocationKey: locationKey };
      }
      // If 404 or any non-OK response, fall through to create
      const statusText = getRes.status;
      console.log(`[eBay] Location ${locationKey} not found (HTTP ${statusText}) — will create`);
    } catch (err) {
      console.error(`[eBay] Exception fetching location ${locationKey}:`, err);
      // Fall through to create attempt
    }

    // Location doesn't exist — create it with the sale address
    console.log(`[eBay] Creating merchant location ${locationKey} for ${saleAddressHint.city}, ${saleAddressHint.state} ${saleAddressHint.zip}`);
    try {
      const createRes = await fetch(
        ebayProxyUrl(`/sell/inventory/v1/location/${locationKey}`),
        {
          method: 'POST',
          headers: {
            ...headers,
            ...ebayProxyHeaders(),
          },
          body: JSON.stringify({
            location: {
              address: {
                addressLine1: saleAddressHint.address,
                city: saleAddressHint.city,
                stateOrProvince: saleAddressHint.state,
                postalCode: saleAddressHint.zip,
                country: 'US',
              },
            },
            locationInstructions: 'Items ship from this location',
            name: `FindA.Sale ${saleAddressHint.city}`,
            locationTypes: ['WAREHOUSE'],
          }),
        }
      );
      if (!createRes.ok) {
        const errText = await createRes.text();
        console.warn(`[eBay] Failed to create merchant location ${locationKey} with full address — retrying with city/state/zip only:`, errText);

        // Retry without addressLine1 — eBay sometimes rejects specific street addresses
        // but accepts city + state + zip (same "nearest match" fallback used in geocoding)
        const retryRes = await fetch(
          ebayProxyUrl(`/sell/inventory/v1/location/${locationKey}`),
          {
            method: 'POST',
            headers: {
              ...headers,
              ...ebayProxyHeaders(),
            },
            body: JSON.stringify({
              location: {
                address: {
                  city: saleAddressHint.city,
                  stateOrProvince: saleAddressHint.state,
                  postalCode: saleAddressHint.zip,
                  country: 'US',
                },
              },
              locationInstructions: 'Items ship from this location',
              name: `FindA.Sale ${saleAddressHint.city}`,
              locationTypes: ['WAREHOUSE'],
            }),
          }
        );
        if (!retryRes.ok) {
          const retryErr = await retryRes.text();
          console.error(`[eBay] Retry (city/zip only) also failed for ${locationKey}:`, retryErr);
          return { error: 'MERCHANT_LOCATION_CREATION_FAILED' };
        }
        console.log(`[eBay] Retry succeeded — created ${locationKey} with city/zip only`);
      }

      // Enable the newly created location
      const enableRes = await fetch(
        ebayProxyUrl(`/sell/inventory/v1/location/${locationKey}/enable`),
        {
          method: 'POST',
          headers: {
            ...headers,
            ...ebayProxyHeaders(),
          },
        }
      );
      if (!enableRes.ok) {
        const errText = await enableRes.text();
        console.warn(`[eBay] Failed to enable location ${locationKey} (may already be enabled):`, errText);
      }

      console.log(`[eBay] Created and enabled merchant location: ${locationKey}`);
      return { merchantLocationKey: locationKey };
    } catch (err) {
      console.error(`[eBay] Exception creating merchant location ${locationKey}:`, err);
      return { error: 'MERCHANT_LOCATION_CREATION_FAILED' };
    }
  }

  // --- Path 2: No saleAddressHint — fall back to listing all locations ---
  console.log('[eBay] No saleAddressHint — falling back to listing all merchant locations');
  try {
    const listRes = await fetch(ebayProxyUrl('/sell/inventory/v1/location'), {
      headers: {
        ...headers,
        ...ebayProxyHeaders(),
      },
    });
    if (listRes.ok) {
      const data = (await listRes.json()) as any;
      const locations: any[] = data.locations || [];
      // Prefer ENABLED locations; fall back to first available
      const enabled = locations.find((l: any) => l.merchantLocationStatus === 'ENABLED');
      const chosen = enabled || locations[0];
      if (chosen) {
        console.log(`[eBay] Using existing merchant location (fallback): ${chosen.merchantLocationKey}`);
        return { merchantLocationKey: chosen.merchantLocationKey };
      }
    }
  } catch (err) {
    console.error('[eBay] Failed to list merchant locations:', err);
  }

  // No address hint and no existing locations — fail
  return { error: 'MERCHANT_LOCATION_UNAVAILABLE' };
}

function buildAspects(tags: string[]): Record<string, string[]> | undefined {
  const aspects: Record<string, string[]> = {};
  (tags || []).forEach(tag => {
    const colonIdx = tag.indexOf(':');
    if (colonIdx > 0) {
      const key = tag.substring(0, colonIdx).trim();
      const value = tag.substring(colonIdx + 1).trim();
      if (key && value) {
        if (aspects[key]) {
          aspects[key].push(value);
        } else {
          aspects[key] = [value];
        }
      }
    }
  });
  return Object.keys(aspects).length > 0 ? aspects : undefined;
}

/**
 * Smart-pick a fulfillment policy from the organizer's eBay policies when no explicit override matches.
 * Priority:
 *   1. policy with shippingOptions[].costType === 'CALCULATED' (weight-based — accurate per shopper ZIP)
 *   2. policy with shippingOptions[].costType === 'FLAT_RATE' (predictable, organizer-controlled)
 *   3. free shipping (FLAT_RATE with cost 0, or name contains "free") as last resort
 * Returns null if no policies are available.
 * Logs the choice + reason for diagnostics.
 */
async function pickFulfillmentPolicySmart(
  fetchPolicies?: () => Promise<any[]>,
  itemHasWeight: boolean = false
): Promise<{ policyId: string; reason: 'weight-based' | 'flat-rate' | 'free-fallback' } | null> {
  if (!fetchPolicies) return null;
  const policies = await fetchPolicies();
  if (!policies || policies.length === 0) return null;

  const hasCostType = (p: any, type: 'CALCULATED' | 'FLAT_RATE'): boolean =>
    Array.isArray(p.shippingOptions) &&
    p.shippingOptions.some((opt: any) => opt && opt.costType === type);

  // 1. Calculated (weight-based) — only if item has a valid weight, else eBay rejects publish with error 25020
  const calc = policies.find((p) => hasCostType(p, 'CALCULATED'));
  if (calc && itemHasWeight) {
    console.log(`[eBay ShippingPick] policy="${calc.name}" reason="weight-based"`);
    return { policyId: calc.fulfillmentPolicyId, reason: 'weight-based' };
  }
  if (calc && !itemHasWeight) {
    console.warn(`[eBay ShippingPick] WARN skipping CALCULATED policy "${calc.name}" — item has no packageWeightOz (would cause eBay error 25020). Falling back to flat-rate/free.`);
  }

  // 2. Flat-rate (non-zero cost). Use shippingServices[0].shippingCost.value if present to distinguish "free".
  const flat = policies.find((p) => {
    if (!hasCostType(p, 'FLAT_RATE')) return false;
    const opt = (p.shippingOptions as any[]).find((o) => o.costType === 'FLAT_RATE');
    const svc = opt?.shippingServices?.[0];
    const cost = Number(svc?.shippingCost?.value ?? svc?.additionalShippingCost?.value ?? 0);
    return cost > 0;
  });
  if (flat) {
    console.log(`[eBay ShippingPick] policy="${flat.name}" reason="flat-rate"`);
    return { policyId: flat.fulfillmentPolicyId, reason: 'flat-rate' };
  }

  // 3. Free shipping fallback (any remaining policy, prefer those with FLAT_RATE costType or name containing "free")
  const free = policies.find((p) =>
    hasCostType(p, 'FLAT_RATE') || /free/i.test(p.name || '')
  ) || policies[0];
  if (free) {
    console.log(`[eBay ShippingPick] policy="${free.name}" reason="free-fallback"`);
    return { policyId: free.fulfillmentPolicyId, reason: 'free-fallback' };
  }

  return null;
}

/**
 * Resolve policies for a single item based on organizer's policy mapping.
 * Priority: category override → shipping classification → weight tier → default.
 * Falls back to EbayConnection defaults if no mapping exists.
 *
 * Returns policy IDs, draft mode flag, merchant location source, and routing reason for logging.
 */
interface PolicyRoutingResult {
  fulfillmentPolicyId: string;
  returnPolicyId: string;
  paymentPolicyId: string;
  descriptionHtml: string | null;
  pushAsDraft: boolean;
  merchantLocationSource: string;
  routingReason: string;
}

async function resolvePoliciesForItem(
  organizerId: string,
  item: {
    id: string;
    packageWeightOz?: number | null;
    packageLengthIn?: number | null;
    packageWidthIn?: number | null;
    packageHeightIn?: number | null;
    packageType?: string | null;
    ebayShippingClassification?: string | null;
    ebayCategoryId?: string | null;
    category?: string | null;
    ebayShippingOverride?: string | null;
  },
  smartPickContext?: {
    fetchFulfillmentPolicies?: () => Promise<any[]>;
    fromZip?: string | null;
  }
): Promise<PolicyRoutingResult | { error: string; code: string; message: string }> {
  const organizer = await prisma.organizer.findUnique({
    where: { id: organizerId },
    include: { ebayConnection: true, ebayPolicyMapping: true },
  });

  if (!organizer?.ebayConnection) {
    return {
      error: 'EBAY_NOT_CONNECTED',
      code: 'EBAY_NOT_CONNECTED',
      message: 'eBay account not connected',
    };
  }

  const mapping = organizer.ebayPolicyMapping;
  const conn = organizer.ebayConnection;

  // Item-level LOCAL_PICKUP_ONLY override — highest priority, beats all other routing rules.
  // Looks for a synced fulfillment policy with pickupDropOff=true or name containing "local pickup".
  if (item.ebayShippingOverride === 'LOCAL_PICKUP_ONLY') {
    const returnPolicyId = mapping?.defaultReturnPolicyId || conn.returnPolicyId;
    const paymentPolicyId = mapping?.defaultPaymentPolicyId || conn.paymentPolicyId;
    const allPolicies: any[] = (conn as any).fulfillmentPolicies || [];
    const localPickupPolicy = allPolicies.find(
      (p: any) => p.pickupDropOff === true || /local\s*pickup/i.test(p.name || '')
    );
    if (localPickupPolicy) {
      console.log(`[eBay ShippingPick] item=${item.id} LOCAL_PICKUP_ONLY → policy="${localPickupPolicy.fulfillmentPolicyId}"`);
      return {
        fulfillmentPolicyId: localPickupPolicy.fulfillmentPolicyId,
        returnPolicyId: returnPolicyId || '',
        paymentPolicyId: paymentPolicyId || '',
        descriptionHtml: mapping?.defaultDescriptionHtml ?? null,
        pushAsDraft: false,
        merchantLocationSource: mapping?.merchantLocationSource || conn.merchantLocationSource || 'SALE_ADDRESS',
        routingReason: 'local-pickup-override',
      };
    }
    console.warn(`[eBay ShippingPick] item=${item.id} LOCAL_PICKUP_ONLY requested but no local pickup policy found — falling through to normal routing`);
  }

  // Organizer-level explicit override beats every other rule.
  // When ebayDefaultShippingPolicyId is set, smart-pick and weight/category mappings are skipped.
  if (organizer.ebayDefaultShippingPolicyId) {
    const returnPolicyId = mapping?.defaultReturnPolicyId || conn.returnPolicyId;
    const paymentPolicyId = mapping?.defaultPaymentPolicyId || conn.paymentPolicyId;
    if (!returnPolicyId || !paymentPolicyId) {
      return {
        error: 'POLICIES_NOT_CONFIGURED',
        code: 'POLICIES_NOT_CONFIGURED',
        message: 'Please set default return and payment policies in eBay Settings.',
      };
    }
    console.log(`[eBay ShippingPick] policy="${organizer.ebayDefaultShippingPolicyId}" reason="organizer-default-shipping-policy"`);
    return {
      fulfillmentPolicyId: organizer.ebayDefaultShippingPolicyId,
      returnPolicyId,
      paymentPolicyId,
      descriptionHtml: mapping?.defaultDescriptionHtml ?? null,
      pushAsDraft: mapping?.pushAsDraft ?? false,
      merchantLocationSource: mapping?.merchantLocationSource || conn.merchantLocationSource || 'SALE_ADDRESS',
      routingReason: 'organizer-default-shipping-policy',
    };
  }

  // ── Shipping-mode routing (calculated vs flat-tiers) ───────────────────────
  // Default mode = CALCULATED: the buyer pays the real rate eBay computes at
  // checkout from their ZIP. Requires the item to have a weight AND all 3 dims so
  // eBay does not reject the publish. New organizers default here; existing
  // organizers with configured weight tiers are migrated to FLAT_TIERS (backfill).
  const shippingMode = mapping?.shippingMode || 'CALCULATED';

  if (shippingMode === 'CALCULATED') {
    const hasWeight = item.packageWeightOz != null && item.packageWeightOz > 0;

    const returnPolicyId = mapping?.defaultReturnPolicyId || conn.returnPolicyId;
    const paymentPolicyId = mapping?.defaultPaymentPolicyId || conn.paymentPolicyId;

    if (hasWeight) {
      if (!returnPolicyId || !paymentPolicyId) {
        return {
          error: 'POLICIES_NOT_CONFIGURED',
          code: 'POLICIES_NOT_CONFIGURED',
          message: 'Please set default return and payment policies in eBay Settings.',
        };
      }
      // FVF-inclusive flat-rate path (S968): items with a known weight use a per-bucket
      // flat-rate policy priced at ceil(estimatedRate / 0.864) so the organizer nets at
      // least the USPS label cost after eBay's 13.6% FVF on shipping.
      // Falls back to calculated policy if provisioning fails.
      const fromZip = smartPickContext?.fromZip ?? null;
      const dims = (
        item.packageLengthIn != null && item.packageWidthIn != null && item.packageHeightIn != null
          ? { length: item.packageLengthIn, width: item.packageWidthIn, height: item.packageHeightIn }
          : null
      );
      const fvfResult = await ensureFvfFlatRatePolicy(
        organizerId,
        item.packageWeightOz!,
        dims,
        fromZip
      );
      if (fvfResult) {
        console.log(
          `[eBay ShippingPick] item=${item.id} fvf-flat flatRate=${fvfResult.flatRate} policy=${fvfResult.policyId}`
        );
        return {
          fulfillmentPolicyId: fvfResult.policyId,
          returnPolicyId,
          paymentPolicyId,
          descriptionHtml: mapping?.defaultDescriptionHtml ?? null,
          pushAsDraft: mapping?.pushAsDraft ?? false,
          merchantLocationSource: mapping?.merchantLocationSource || conn.merchantLocationSource || 'SALE_ADDRESS',
          routingReason: `fvf-flat:${fvfResult.flatRate}`,
        };
      }
      // FVF provisioning failed. We NEVER fall back to eBay calculated shipping
      // (it leaves the seller short on the 13.6% FVF). Soft-block, flag for review,
      // and return an actionable error so the organizer can retry or adjust.
      await prisma.item.update({
        where: { id: item.id },
        data: { ebayNeedsReview: true },
      }).catch(() => undefined);
      console.warn(
        `[eBay ShippingPick] item=${item.id} FVF flat provisioning failed — soft-blocked (no calculated fallback)`
      );
      return {
        error: 'SHIPPING_POLICY_UNAVAILABLE',
        code: 'SHIPPING_POLICY_UNAVAILABLE',
        message: 'We couldn\'t set up a flat-rate shipping policy for this item right now. Confirm your eBay account is connected with return and payment policies set, then try pushing again. If it keeps failing, check the item\'s package weight and box dimensions.',
      };
    } else if (mapping?.freeShippingOptIn) {
      // Organizer opted into free shipping — fall back to a free/flat policy via smart-pick.
      const smartPicked = await pickFulfillmentPolicySmart(
        smartPickContext?.fetchFulfillmentPolicies,
        false
      );
      const chosen = smartPicked?.policyId || conn.fulfillmentPolicyId;
      if (chosen && returnPolicyId && paymentPolicyId) {
        console.log(`[eBay ShippingPick] item=${item.id} free-shipping-opt-in policy=${chosen}`);
        return {
          fulfillmentPolicyId: chosen,
          returnPolicyId,
          paymentPolicyId,
          descriptionHtml: mapping?.defaultDescriptionHtml ?? null,
          pushAsDraft: mapping?.pushAsDraft ?? false,
          merchantLocationSource: mapping?.merchantLocationSource || conn.merchantLocationSource || 'SALE_ADDRESS',
          routingReason: 'free-shipping-opt-in',
        };
      }
    } else {
      // No package details and no free-shipping opt-in — soft-block and flag for review.
      await prisma.item.update({
        where: { id: item.id },
        data: { ebayNeedsReview: true },
      }).catch(() => undefined);
      return {
        error: 'NEEDS_PACKAGE_DETAILS',
        code: 'NEEDS_PACKAGE_DETAILS',
        message: 'Add the package weight and box dimensions so eBay can calculate the buyer\'s shipping rate — or turn on free shipping in eBay Settings.',
      };
    }
    // Fall through to the flat-tier / smart-pick cascade below as a safety net.
  }

  // If mapping doesn't exist, fall back to EbayConnection default policies (or smart-pick)
  if (!mapping) {
    if (!conn.returnPolicyId || !conn.paymentPolicyId) {
      return {
        error: 'POLICIES_NOT_CONFIGURED',
        code: 'POLICIES_NOT_CONFIGURED',
        message: 'Please complete eBay setup in Settings — pick your default policies before pushing.',
      };
    }
    // Prefer smart-pick over the stale connection-default fulfillment policy when we have policies to choose from.
    const smartPicked = await pickFulfillmentPolicySmart(
      smartPickContext?.fetchFulfillmentPolicies,
      Boolean(item.packageWeightOz && item.packageWeightOz > 0)
    );
    const chosenFulfillmentId = smartPicked?.policyId || conn.fulfillmentPolicyId;
    if (!chosenFulfillmentId) {
      return {
        error: 'POLICIES_NOT_CONFIGURED',
        code: 'POLICIES_NOT_CONFIGURED',
        message: 'Please complete eBay setup in Settings — pick your default policies before pushing.',
      };
    }
    return {
      fulfillmentPolicyId: chosenFulfillmentId,
      returnPolicyId: conn.returnPolicyId,
      paymentPolicyId: conn.paymentPolicyId,
      descriptionHtml: null,
      pushAsDraft: false,
      merchantLocationSource: conn.merchantLocationSource || 'SALE_ADDRESS',
      routingReason: smartPicked ? `smart-pick:${smartPicked.reason}` : 'fallback-to-connection-defaults',
    };
  }

  // Policy resolution priority (S725 — weight-tier promoted ahead of category
  // per organizer-configured maxOz rules taking precedence over category routing):
  //   1. Weight-tier match (organizer's EbayPolicyMapping.weightTierMappings)
  //   2. Category override (exact ebayCategoryId match)
  //   3. Shipping classification override (HEAVY_OVERSIZED, FRAGILE)
  //   4. UNKNOWN classification fallback
  //   5. Default mapping fulfillment policy
  //   6. Smart-pick (calculated → flat-rate → free fallback)

  let fulfillmentPolicyId: string | null = null;
  let routingReason = '';
  let cascadeStep = '';

  // 1. Weight-tier match (highest priority after explicit organizer override)
  const tiers = (mapping.weightTierMappings as unknown as WeightTierMapping[]) || [];
  if (tiers.length > 0 && item.packageWeightOz != null) {
    const weightOz = item.packageWeightOz;
    const tier = matchWeightTier(weightOz, tiers);
    if (tier) {
      // Gap-overshoot guard (S-stopgap): organizer weight-tier maps can have gaps
      // (e.g. a "6+ lb / ≤111oz" tier, then nothing until "45 lb / ≤720oz").
      // matchWeightTier picks the smallest tier whose maxOz >= weight, so an item
      // that overshoots the granular tiers falls into a much-larger catch-all tier
      // and gets charged that flat rate (an 11 lb item billed at the 45 lb $75 rate).
      // If the item has a real weight and the matched tier covers items at least ~2x
      // heavier than this one, it fell through a gap — block the push with an
      // actionable message instead of silently overcharging.
      // Both thresholds (16 oz floor, 2x multiplier) are tunable: the 16 oz floor and
      // 2x ratio prevent false positives on small items that match their correct
      // granular low-weight tiers (those match tightly, ratio near 1).
      if (
        item.packageWeightOz != null &&
        item.packageWeightOz > 16 &&
        tier.maxOz > item.packageWeightOz * 2
      ) {
        // Tier gap: item overshot the organizer's USPS tier table.
        // Before blocking, try the FVF flat-rate path — it provisions a fresh
        // eBay policy at the correct USPS rate so the organizer doesn't get
        // slotted into an oversized catch-all (e.g. 45-lb FedEx $75 for 11 lb).
        const _gapFromZip = smartPickContext?.fromZip ?? null;
        const _gapDims = (
          item.packageLengthIn != null && item.packageWidthIn != null && item.packageHeightIn != null
            ? { length: item.packageLengthIn, width: item.packageWidthIn, height: item.packageHeightIn }
            : null
        );
        const _gapFvf = await ensureFvfFlatRatePolicy(organizerId, item.packageWeightOz!, _gapDims, _gapFromZip);
        if (_gapFvf) {
          console.log(
            `[eBay ShippingPick] item=${item.id} tier-gap fvf-flat flatRate=${_gapFvf.flatRate} policy=${_gapFvf.policyId}`
          );
          return {
            fulfillmentPolicyId: _gapFvf.policyId,
            returnPolicyId: mapping.defaultReturnPolicyId || conn.returnPolicyId || '',
            paymentPolicyId: mapping.defaultPaymentPolicyId || conn.paymentPolicyId || '',
            descriptionHtml: mapping.defaultDescriptionHtml ?? null,
            pushAsDraft: mapping.pushAsDraft ?? false,
            merchantLocationSource: mapping.merchantLocationSource || conn.merchantLocationSource || 'SALE_ADDRESS',
            routingReason: `tier-gap-fvf-flat:${_gapFvf.flatRate}`,
          };
        }
        console.warn(
          `[eBay ShippingPick] item=${item.id} tier-gap overshoot: weight=${item.packageWeightOz}oz matched tier maxOz=${tier.maxOz} — blocked to avoid overcharge`
        );
        await prisma.item.update({
          where: { id: item.id },
          data: { ebayNeedsReview: true },
        });
        return {
          error: 'SHIPPING_TIER_GAP',
          code: 'SHIPPING_TIER_GAP',
          message: `This item weighs ~${(item.packageWeightOz / 16).toFixed(1)} lb but your nearest shipping tier covers up to ${(tier.maxOz / 16).toFixed(0)} lb — it would be overcharged. Add a shipping tier near ${(item.packageWeightOz / 16).toFixed(0)} lb, or switch to calculated shipping so the buyer is charged the real rate.`,
        };
      }
      fulfillmentPolicyId = tier.policyId;
      routingReason = `weight-tier:${tier.maxOz}oz`;
      cascadeStep = 'weight-tier';
    }
  }

  // 2. Category override
  if (!fulfillmentPolicyId) {
    const categoryOverrides = (mapping.categoryOverrides as any[]) || [];
    if (item.ebayCategoryId) {
      const match = categoryOverrides.find((c: any) => c.categoryId === item.ebayCategoryId);
      if (match) {
        fulfillmentPolicyId = match.policyId;
        routingReason = `category-override:${item.ebayCategoryId}`;
        cascadeStep = 'category';
      }
    }
  }

  // 3. Shipping classification override
  if (!fulfillmentPolicyId) {
    if (item.ebayShippingClassification === 'HEAVY_OVERSIZED' && mapping.heavyOversizedPolicyId) {
      fulfillmentPolicyId = mapping.heavyOversizedPolicyId;
      routingReason = 'classification:HEAVY_OVERSIZED';
      cascadeStep = 'classification';
    } else if (item.ebayShippingClassification === 'FRAGILE' && mapping.fragilePolicyId) {
      fulfillmentPolicyId = mapping.fragilePolicyId;
      routingReason = 'classification:FRAGILE';
      cascadeStep = 'classification';
    }
  }

  // 4. UNKNOWN classification fallback
  if (!fulfillmentPolicyId && (item.ebayShippingClassification === 'UNKNOWN' || !item.ebayShippingClassification) && mapping.unknownPolicyId) {
    fulfillmentPolicyId = mapping.unknownPolicyId;
    routingReason = 'classification:UNKNOWN';
    cascadeStep = 'classification';
  }

  // 5. Default mapping fulfillment policy
  if (!fulfillmentPolicyId && mapping.defaultFulfillmentPolicyId) {
    fulfillmentPolicyId = mapping.defaultFulfillmentPolicyId;
    routingReason = 'default-fulfillment';
    cascadeStep = 'default';
  }

  // 6. Smart-pick from organizer's eBay policies (calculated > flat-rate > free fallback)
  //    Replaces the prior "connection-default-fulfillment" fallback. Falls back to conn.fulfillmentPolicyId if smart-pick fetches nothing.
  if (!fulfillmentPolicyId) {
    const smartPicked = await pickFulfillmentPolicySmart(
      smartPickContext?.fetchFulfillmentPolicies,
      Boolean(item.packageWeightOz && item.packageWeightOz > 0)
    );
    if (smartPicked) {
      fulfillmentPolicyId = smartPicked.policyId;
      routingReason = `smart-pick:${smartPicked.reason}`;
      cascadeStep = 'smart-pick';
    } else if (conn.fulfillmentPolicyId) {
      fulfillmentPolicyId = conn.fulfillmentPolicyId;
      routingReason = 'connection-default-fulfillment';
      cascadeStep = 'default';
    }
  }

  // S725: structured cascade log so future shipping-pick bugs are diagnosable in one line.
  if (fulfillmentPolicyId) {
    console.log(`[eBay ShippingPick] cascade-step=${cascadeStep} reason=${routingReason} weightOz=${item.packageWeightOz ?? 'null'} packageType=${item.packageType ?? 'null'}`);
  }

  if (!fulfillmentPolicyId) {
    return {
      error: 'NO_FULFILLMENT_POLICY_MATCH',
      code: 'NO_FULFILLMENT_POLICY_MATCH',
      message: `No eBay fulfillment policy matched for this item (weight=${item.packageWeightOz}, classification=${item.ebayShippingClassification}, category=${item.ebayCategoryId}). Add a matching tier in Settings or set a default fulfillment policy.`,
    };
  }

  const returnPolicyId = mapping.defaultReturnPolicyId || conn.returnPolicyId;
  const paymentPolicyId = mapping.defaultPaymentPolicyId || conn.paymentPolicyId;

  if (!returnPolicyId || !paymentPolicyId) {
    return {
      error: 'POLICIES_NOT_CONFIGURED',
      code: 'POLICIES_NOT_CONFIGURED',
      message: 'Please set default return and payment policies in eBay Settings.',
    };
  }

  return {
    fulfillmentPolicyId,
    returnPolicyId,
    paymentPolicyId,
    descriptionHtml: mapping.defaultDescriptionHtml,
    pushAsDraft: mapping.pushAsDraft,
    merchantLocationSource: mapping.merchantLocationSource,
    routingReason,
  };
}


// ─────────────────────────────────────────────────────────────────────────────
// Phase 2 (Part B): Shipping-policy re-sync for LIVE listings.
// ADR: claude_docs/feature-notes/adr-shipping-policy-resync.md
//
// When a live eBay listing's shipping-determining inputs change (organizer
// weighs/measures the item, or re-pushes), re-resolve the authoritative
// fulfillment policy and re-apply it to the live offer. publishItemOffer used
// to no-op on already-live items, so the policy never updated. These helpers
// fix that. Conservative by design: only re-pin when the policy id actually
// differs, always respect the rate limiter, never throw.
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Concatenated carrier rate-table effective-date version string, e.g.
 * `USPS:2026-04-26|UPS:2026-06-14|FEDEX:2026-06-14`. Stored on the item when a
 * shipping policy is (re)applied so Phase 3 drift detection can tell whether the
 * applied amount reflects the current rate tables.
 */
export function currentEbayRateVersion(): string {
  return `USPS:${USPS_RATE_EFFECTIVE_DATE}|UPS:${UPS_RATE_EFFECTIVE_DATE}|FEDEX:${FEDEX_RATE_EFFECTIVE_DATE}`;
}

/**
 * Apply a new fulfillmentPolicyId to an EXISTING live eBay offer.
 *
 * eBay offer PUT is a full REPLACE (not partial-merge), so we GET the current
 * offer, merge in the new listingPolicies.fulfillmentPolicyId, strip read-only
 * fields eBay rejects on PUT (offerId/offerState/listing/status), and PUT the
 * complete object back. Mirrors the GET-merge-PUT + read-only-strip pattern used
 * in the 25005 retry path of pushSaleToEbay.
 *
 * Returns { success } — never throws.
 */
export async function applyFulfillmentPolicyToOffer(
  offerId: string,
  fulfillmentPolicyId: string,
  accessToken: string
): Promise<{ success: boolean; status?: number; error?: string }> {
  try {
    const headers = { ...ebayUserHeaders(accessToken), ...ebayProxyHeaders() };
    const offerPath = `/sell/inventory/v1/offer/${offerId}`;

    // GET current offer (full object).
    const getRes = await fetch(ebayProxyUrl(encodeURIComponent(offerPath)), { headers });
    if (!getRes.ok) {
      const t = await getRes.text();
      console.warn(`[eBay ResyncShipping] offer GET failed: ${getRes.status} ${t.slice(0, 200)}`);
      return { success: false, status: getRes.status, error: 'OFFER_GET_FAILED' };
    }
    const offer = (await getRes.json()) as any;

    // Merge in the new fulfillment policy id, preserving the other listing policies.
    const existingPolicies = (offer.listingPolicies as Record<string, unknown> | undefined) ?? {};
    if (existingPolicies.fulfillmentPolicyId === fulfillmentPolicyId) {
      // Nothing to change on eBay — caller decides what to persist.
      return { success: true, status: getRes.status };
    }
    offer.listingPolicies = { ...existingPolicies, fulfillmentPolicyId };

    // Strip read-only fields eBay rejects on PUT.
    delete offer.offerId;
    delete offer.offerState;
    delete offer.listing;
    delete offer.status;

    const putRes = await fetch(ebayProxyUrl(encodeURIComponent(offerPath)), {
      method: 'PUT',
      headers,
      body: JSON.stringify(offer),
    });
    if (!putRes.ok && putRes.status !== 204) {
      const t = await putRes.text();
      console.warn(`[eBay ResyncShipping] offer PUT failed: ${putRes.status} ${t.slice(0, 300)}`);
      return { success: false, status: putRes.status, error: 'OFFER_PUT_FAILED' };
    }
    trackEbayCall();
    return { success: true, status: putRes.status };
  } catch (err) {
    console.warn('[eBay ResyncShipping] applyFulfillmentPolicyToOffer threw:', (err as Error).message);
    return { success: false, error: 'EXCEPTION' };
  }
}

/**
 * Re-resolve and (if changed) re-apply the shipping policy for a LIVE item.
 *
 * Used by (a) the edit-save path when package dims/weight/type change, and
 * (b) publishItemOffer when re-pushing an already-live item. Conservative:
 * only re-pins when the resolved policy id actually differs from the stored
 * applied id, always respects the rate limiter, and never throws.
 *
 * Returns { changed, reason }. `changed` is true only when the live offer's
 * fulfillment policy was actually updated on eBay.
 */
export async function resyncItemShippingPolicy(
  itemId: string
): Promise<{ changed: boolean; reason: string }> {
  try {
    const item = await prisma.item.findUnique({
      where: { id: itemId },
      select: {
        id: true,
        ebayListingId: true,
        ebayOfferId: true,
        ebayFulfillmentPolicyId: true,
        ebayShippingAmountCents: true,
        packageWeightOz: true,
        packageLengthIn: true,
        packageWidthIn: true,
        packageHeightIn: true,
        packageType: true,
        ebayShippingClassification: true,
        ebayCategoryId: true,
        category: true,
        ebayShippingOverride: true,
        sale: {
          select: {
            zip: true,
            organizer: {
              select: {
                id: true,
                lat: true,
                lng: true,
                ebayPolicyMapping: {
                  select: { shippingMode: true, freeShippingOptIn: true, weightTierMappings: true },
                },
              },
            },
          },
        },
      },
    });

    if (!item) return { changed: false, reason: 'not-found' };
    if (!item.ebayListingId || !item.ebayOfferId) return { changed: false, reason: 'not-live' };

    const organizer = item.sale?.organizer;
    if (!organizer) return { changed: false, reason: 'no-organizer' };

    // Safety: never auto-price an item with no weight, and never convert a
    // local-pickup-only listing onto a shipping policy. These need the organizer
    // to add a weight / clear the pickup override — they must not be guessed.
    if (item.packageWeightOz == null || item.packageWeightOz <= 0) return { changed: false, reason: 'no-weight' };
    if (item.ebayShippingOverride === 'LOCAL_PICKUP_ONLY') return { changed: false, reason: 'local-pickup' };

    // Don't spend eBay calls when rate-limited.
    if (isEbayRateLimited()) return { changed: false, reason: 'rate-limited' };

    const accessToken = await refreshEbayAccessToken(organizer.id);
    if (!accessToken) return { changed: false, reason: 'no-token' };

    const fromZip = item.sale?.zip || null;

    // Authoritative new policy id (provisions FVF-flat via ensureFvfFlatRatePolicy
    // when needed). Pass a fetcher so resolvePoliciesForItem can look up real ids.
    const fetchFulfillmentPolicies = async (): Promise<any[]> => {
      try {
        const res = await fetch(
          ebayProxyUrl('/sell/account/v1/fulfillment_policy?marketplace_id=EBAY_US&limit=100'),
          { headers: { ...ebayUserHeaders(accessToken), ...ebayProxyHeaders() } }
        );
        if (res.ok) {
          trackEbayCall();
          const data = (await res.json()) as any;
          return data.fulfillmentPolicies || [];
        }
      } catch (err) {
        console.warn('[eBay ResyncShipping] fulfillment policy fetch failed:', (err as Error).message);
      }
      return [];
    };

    const routing = await resolvePoliciesForItem(
      organizer.id,
      {
        id: item.id,
        packageWeightOz: item.packageWeightOz,
        packageLengthIn: item.packageLengthIn != null ? Number(item.packageLengthIn) : null,
        packageWidthIn: item.packageWidthIn != null ? Number(item.packageWidthIn) : null,
        packageHeightIn: item.packageHeightIn != null ? Number(item.packageHeightIn) : null,
        packageType: item.packageType,
        ebayShippingClassification: item.ebayShippingClassification,
        ebayCategoryId: item.ebayCategoryId,
        category: item.category,
        ebayShippingOverride: item.ebayShippingOverride,
      },
      { fetchFulfillmentPolicies, fromZip }
    );

    if ('error' in routing) {
      return { changed: false, reason: routing.code };
    }

    // New buyer-facing shipping amount (for drift detection / persistence).
    const shipping = await resolveItemShipping({
      organizer: { lat: organizer.lat, lng: organizer.lng },
      mapping: organizer.ebayPolicyMapping,
      item: {
        packageWeightOz: item.packageWeightOz,
        packageLengthIn: item.packageLengthIn != null ? Number(item.packageLengthIn) : null,
        packageWidthIn: item.packageWidthIn != null ? Number(item.packageWidthIn) : null,
        packageHeightIn: item.packageHeightIn != null ? Number(item.packageHeightIn) : null,
        ebayShippingOverride: item.ebayShippingOverride,
      },
      fromZip,
    });
    const buyerAmountCents = shipping.buyerAmountCents;

    // Only re-pin the live offer when the resolved policy id actually differs.
    if (routing.fulfillmentPolicyId !== item.ebayFulfillmentPolicyId) {
      const applied = await applyFulfillmentPolicyToOffer(
        item.ebayOfferId,
        routing.fulfillmentPolicyId,
        accessToken
      );
      if (!applied.success) {
        return { changed: false, reason: applied.error || 'apply-failed' };
      }
      await prisma.item.update({
        where: { id: item.id },
        data: {
          ebayFulfillmentPolicyId: routing.fulfillmentPolicyId,
          ebayShippingAmountCents: buyerAmountCents,
          ebayShippingRatedAt: new Date(),
          ebayRateVersion: currentEbayRateVersion(),
        },
      });
      console.log(
        `[eBay ResyncShipping] item=${item.id} re-pinned policy ${item.ebayFulfillmentPolicyId ?? '(none)'} -> ${routing.fulfillmentPolicyId} ($${(buyerAmountCents / 100).toFixed(2)})`
      );
      return { changed: true, reason: 'repinned' };
    }

    // Policy unchanged — still refresh the rated amount/version so drift
    // detection has current data on file.
    await prisma.item.update({
      where: { id: item.id },
      data: {
        ebayShippingAmountCents: buyerAmountCents,
        ebayShippingRatedAt: new Date(),
        ebayRateVersion: currentEbayRateVersion(),
      },
    });
    return { changed: false, reason: 'already-current' };
  } catch (err) {
    console.warn(`[eBay ResyncShipping] resyncItemShippingPolicy threw for item ${itemId}:`, (err as Error).message);
    return { changed: false, reason: 'exception' };
  }
}
/**
 * Helper: Map condition ID to eBay Inventory API condition enum.
 * Trading API IDs → Inventory API string enums (NOT the same scale).
 */
function mapConditionIdToEbayCondition(conditionId: string): string {
  const conditionMap: Record<string, string> = {
    '1000': 'NEW',
    '1500': 'NEW_OTHER',
    '1750': 'NEW_WITH_DEFECTS',
    '2500': 'SELLER_REFURBISHED',
    '3000': 'USED_EXCELLENT',   // eBay conditionId 3000 "Used" → Inventory API USED_EXCELLENT (confirmed 2026-05-13)
    '4000': 'USED_VERY_GOOD',   // Trading API 4000 = "Very Good"
    '5000': 'USED_GOOD',        // Trading API 5000 = "Good"
    '6000': 'USED_ACCEPTABLE',  // Trading API 6000 = "Acceptable"
    '7000': 'FOR_PARTS_OR_NOT_WORKING',
  };
  return conditionMap[conditionId] || 'USED_GOOD';
}

/**
 * Helper: Map FindA.Sale condition grade directly to eBay Inventory API enum.
 * Bypasses the two-step Trading API conversion for the push flow.
 *
 * IMPORTANT — condition enums are category-restricted:
 *   - LIKE_NEW       → media only (Books, DVDs, CDs, Video Games)
 *   - USED_EXCELLENT → Vehicles + select Collectibles only
 *   - NEW_OTHER      → some new-goods categories only
 * We therefore default to the most universal enum values. Any category that
 * doesn't accept the default gets remapped by ensureConditionValidForCategory()
 * via eBay's getItemConditionPolicies.
 *
 * Fix: If organizer explicitly set condition to 'USED' or 'REFURBISHED' and
 * grade is 'S', return 'USED_EXCELLENT' (honors explicit condition over grade).
 */
function mapGradeToInventoryCondition(grade: string | null | undefined, condition?: string | null): string {
  const gradeUpper = (grade || '').toUpperCase();

  // If organizer explicitly set condition to USED/REFURBISHED and grade is S,
  // respect the explicit condition instead of mapping S → NEW
  if (gradeUpper === 'S' && (condition === 'USED' || condition === 'REFURBISHED')) {
    return 'USED_EXCELLENT';
  }

  switch (gradeUpper) {
    case 'S': return 'NEW';               // universal
    case 'A': return 'USED_VERY_GOOD';    // was LIKE_NEW (media-only — rejected everywhere else)
    case 'B': return 'USED_VERY_GOOD';    // universal
    case 'C': return 'USED_GOOD';         // universal
    case 'D': return 'FOR_PARTS_OR_NOT_WORKING'; // universal
    default:  return 'USED_GOOD';         // universal
  }
}

/**
 * Cache of per-category accepted condition enums (eBay getItemConditionPolicies).
 * Key = categoryId, value = Set of valid condition enum strings for that category.
 * Cleared implicitly on server restart; eBay policies change rarely.
 */
const CATEGORY_CONDITION_CACHE = new Map<string, Set<string>>();

/**
 * Fetch accepted conditions for a given eBay category via the Metadata API.
 * Uses the app token (client credentials) — the sell.metadata scope is app-level.
 * Returns a Set of valid enum strings, or null if the call fails (caller falls
 * back to sending the default and letting eBay reject if wrong).
 */
async function getAcceptedConditionsForCategory(categoryId: string): Promise<Set<string> | null> {
  const cached = CATEGORY_CONDITION_CACHE.get(categoryId);
  if (cached) return cached;

  try {
    const appToken = await getEbayAccessToken();
    if (!appToken) return null;
    // Metadata API: item condition policies per marketplace, filtered by categoryId
    const path = encodeURIComponent(
      `/sell/metadata/v1/marketplace/EBAY_US/get_item_condition_policies?filter=categoryIds:%7B${categoryId}%7D`
    );
    const res = await fetch(ebayProxyUrl(path), {
      headers: {
        'Authorization': `Bearer ${appToken}`,
        'Accept': 'application/json',
        'Accept-Language': 'en-US',
        ...ebayProxyHeaders(),
      },
    });
    if (!res.ok) {
      const body = await res.text();
      console.warn(`[eBay ConditionPolicies] ${res.status}: ${body.slice(0, 200)}`);
      return null;
    }
    const data = (await res.json()) as {
      itemConditionPolicies?: Array<{
        categoryId: string;
        itemConditions?: Array<{ conditionId: string; conditionDescription?: string }>;
      }>;
    };
    const policy = data.itemConditionPolicies?.[0];
    if (!policy?.itemConditions?.length) return null;
    // Map numeric conditionId → Inventory API enum (same map as mapConditionIdToEbayCondition)
    const idToEnum: Record<string, string> = {
      '1000': 'NEW',
      '1500': 'NEW_OTHER',
      '1750': 'NEW_WITH_DEFECTS',
      '2000': 'CERTIFIED_REFURBISHED',
      '2010': 'EXCELLENT_REFURBISHED',
      '2020': 'VERY_GOOD_REFURBISHED',
      '2030': 'GOOD_REFURBISHED',
      '2500': 'SELLER_REFURBISHED',
      '2750': 'LIKE_NEW',
      // eBay conditionId 3000 ("Used") maps to the Inventory API enum USED_EXCELLENT.
      // Confirmed empirically 2026-05-13: category 22669 accepts conditionId 3000, and
      // publishing succeeds ONLY when the inventory item's condition enum is USED_EXCELLENT
      // (USED_GOOD = conditionId 5000, which 22669 does NOT accept → errorId 25021).
      // This matches eBay's official condition-id-values table. The real prior bug was
      // the phantom "accepted.add('USED_VERY_GOOD')" alias, now removed.
      '3000': 'USED_EXCELLENT',
      '4000': 'USED_VERY_GOOD',
      '5000': 'USED_GOOD',
      '6000': 'USED_ACCEPTABLE',
      '7000': 'FOR_PARTS_OR_NOT_WORKING',
    };
    const accepted = new Set<string>();
    for (const c of policy.itemConditions) {
      const enumName = idToEnum[c.conditionId];
      if (enumName) accepted.add(enumName);
    }
    CATEGORY_CONDITION_CACHE.set(categoryId, accepted);
    console.log(
      `[eBay ConditionPolicies] category ${categoryId} accepts: ${Array.from(accepted).join(', ')}`
    );
    return accepted;
  } catch (err) {
    console.error('[eBay ConditionPolicies] Error:', err);
    return null;
  }
}

/**
 * Remap a condition enum to one accepted by the target category.
 * If the desired condition is accepted, return it unchanged.
 * Otherwise pick the best-available substitute using a quality-ordered fallback.
 * If the policy call fails, returns desired unchanged (eBay will reject at publish
 * if invalid — logged for diagnosis).
 */
async function ensureConditionValidForCategory(
  desired: string,
  categoryId: string
): Promise<string> {
  const accepted = await getAcceptedConditionsForCategory(categoryId);
  if (!accepted) return desired;
  if (accepted.has(desired)) return desired;

  // Ordered fallback — pick the closest accepted enum for the desired condition.
  const fallbacksByDesired: Record<string, string[]> = {
    'NEW':                      ['NEW_OTHER', 'NEW_WITH_DEFECTS', 'USED_VERY_GOOD', 'USED_GOOD'],
    'LIKE_NEW':                 ['USED_VERY_GOOD', 'USED_EXCELLENT', 'USED_GOOD', 'NEW_OTHER'],
    'USED_VERY_GOOD':           ['USED_EXCELLENT', 'USED_GOOD', 'USED_ACCEPTABLE', 'NEW_OTHER'],
    'USED_EXCELLENT':           ['USED_VERY_GOOD', 'USED_GOOD', 'USED_ACCEPTABLE'],
    'USED_GOOD':                ['USED_VERY_GOOD', 'USED_ACCEPTABLE', 'USED_EXCELLENT', 'NEW_OTHER'],  // never downgrade to FOR_PARTS unless organizer set PARTS_OR_REPAIR
    'USED_ACCEPTABLE':          ['USED_GOOD', 'USED_VERY_GOOD', 'NEW_OTHER'],  // never downgrade to FOR_PARTS unless organizer set PARTS_OR_REPAIR
    'FOR_PARTS_OR_NOT_WORKING': ['USED_ACCEPTABLE', 'USED_GOOD'],
  };
  const chain = fallbacksByDesired[desired] || ['USED_GOOD', 'USED_VERY_GOOD', 'NEW'];
  for (const candidate of chain) {
    if (accepted.has(candidate)) {
      console.log(
        `[eBay ConditionRemap] category ${categoryId}: ${desired} not accepted, using ${candidate}`
      );
      return candidate;
    }
  }
  // Nothing matched — return the first accepted enum as a last resort.
  const firstAccepted = Array.from(accepted)[0];
  if (firstAccepted) {
    console.log(
      `[eBay ConditionRemap] category ${categoryId}: no chain match for ${desired}, using ${firstAccepted}`
    );
    return firstAccepted;
  }
  return desired;
}

/**
 * Per-category required-aspect metadata (eBay Taxonomy getItemAspectsForCategory).
 *   name        - aspect name as eBay returns it (e.g. "Type", "Brand", "Color")
 *   required    - true if eBay will reject the listing when this aspect is missing
 *   enumValues  - constrained picklist; empty array when the aspect is free-text
 *   mode        - SELECTION_ONLY means the value MUST come from enumValues
 *   cardinality - SINGLE or MULTI (how many values the aspect accepts)
 */
interface RequiredAspect {
  name: string;
  required: boolean;
  enumValues: string[];
  cardinality: 'SINGLE' | 'MULTI';
  mode: 'SELECTION_ONLY' | 'FREE_TEXT';
}

/**
 * Cache of per-category aspect definitions. Key = categoryId.
 * Cleared implicitly on server restart; eBay aspect specs change rarely.
 */
const CATEGORY_ASPECTS_CACHE = new Map<string, RequiredAspect[]>();

/**
 * Fetch required + recommended aspects for a given eBay category via the
 * Taxonomy API. Uses the app token (commerce.taxonomy.readonly is app-level).
 * Returns the parsed aspect list or null on failure.
 */
async function getRequiredAspectsForCategory(categoryId: string): Promise<RequiredAspect[] | null> {
  const cached = CATEGORY_ASPECTS_CACHE.get(categoryId);
  if (cached) return cached;

  try {
    const appToken = await getEbayAccessToken();
    if (!appToken) return null;
    const treeId = '0'; // EBAY_US
    const path = encodeURIComponent(
      `/commerce/taxonomy/v1/category_tree/${treeId}/get_item_aspects_for_category?category_id=${categoryId}`
    );
    const res = await fetch(ebayProxyUrl(path), {
      headers: {
        'Authorization': `Bearer ${appToken}`,
        'Accept': 'application/json',
        'Accept-Language': 'en-US',
        ...ebayProxyHeaders(),
      },
    });
    if (!res.ok) {
      const body = await res.text();
      console.warn(`[eBay RequiredAspects] ${res.status}: ${body.slice(0, 200)}`);
      return null;
    }
    const data = (await res.json()) as {
      aspects?: Array<{
        localizedAspectName: string;
        aspectConstraint?: {
          aspectRequired?: boolean;
          aspectMode?: string;
          itemToAspectCardinality?: string;
        };
        aspectValues?: Array<{ localizedValue: string }>;
      }>;
    };
    const parsed: RequiredAspect[] = (data.aspects || []).map((a) => ({
      name: a.localizedAspectName,
      required: a.aspectConstraint?.aspectRequired === true,
      enumValues: (a.aspectValues || []).map((v) => v.localizedValue),
      cardinality: a.aspectConstraint?.itemToAspectCardinality === 'MULTI' ? 'MULTI' : 'SINGLE',
      mode: a.aspectConstraint?.aspectMode === 'SELECTION_ONLY' ? 'SELECTION_ONLY' : 'FREE_TEXT',
    }));
    CATEGORY_ASPECTS_CACHE.set(categoryId, parsed);
    const requiredNames = parsed.filter((a) => a.required).map((a) => a.name);
    console.log(
      `[eBay RequiredAspects] category ${categoryId}: ${requiredNames.length} required (${requiredNames.join(', ') || 'none'})`
    );
    return parsed;
  } catch (err) {
    console.error('[eBay RequiredAspects] Error:', err);
    return null;
  }
}

/**
 * Merge item.tags-derived aspects with auto-filled defaults for any REQUIRED
 * aspect the user didn't provide. Strategy:
 *   1. Keep all aspects the user supplied via tags.
 *   2. For each required aspect not yet present:
 *      a. For Brand: check item.brand directly (organizer-set) → keyword match
 *         → "Unbranded" from enum → do NOT fall to enumValues[0].
 *      b. For MPN/Model/Manufacturer: check item.mpn directly → "Does Not Apply".
 *      c. For Type/Style/Material (enum): check item.tags[] against enum values
 *         → keyword match in title/description → enumValues[0] last resort.
 *      d. If FREE_TEXT — use "Does Not Apply" for identifier-like aspects,
 *         "Unspecified" otherwise.
 * Prevents errorId 25002 "The item specific X is missing".
 */
async function fillRequiredAspects(
  existing: Record<string, string[]> | undefined,
  categoryId: string,
  item: { title: string; tags: string[]; description?: string | null; brand?: string | null; mpn?: string | null }
): Promise<Record<string, string[]> | undefined> {
  const spec = await getRequiredAspectsForCategory(categoryId);
  if (!spec || spec.length === 0) return existing;

  const result: Record<string, string[]> = { ...(existing || {}) };
  const titleLower = item.title.toLowerCase();
  const descLower = (item.description || '').toLowerCase();

  for (const aspect of spec) {
    if (!aspect.required) continue;
    // User already provided this aspect via tags — keep their value.
    if (result[aspect.name] && result[aspect.name].length > 0) continue;

    let picked: string | null = null;
    let source: string = 'enum-fallback';

    // Special handling for Brand: check organizer-set value first
    if (/^brand$/i.test(aspect.name)) {
      if (item.brand && item.brand.trim()) {
        picked = item.brand;
        source = 'item.brand';
      } else if (aspect.enumValues.length > 0) {
        // Keyword match in title/description
        for (const val of aspect.enumValues) {
          const vLower = val.toLowerCase();
          if (vLower && (titleLower.includes(vLower) || descLower.includes(vLower))) {
            picked = val;
            source = 'keyword-match';
            break;
          }
        }
        // Prefer "Unbranded" when available — do NOT fall to enumValues[0] for Brand
        if (!picked) {
          const unbranded = aspect.enumValues.find((v) => /unbranded/i.test(v));
          if (unbranded) {
            picked = unbranded;
            source = 'unbranded-default';
          }
        }
      }
      // Final fallback: never leave the Brand aspect unset. eBay rejects with
      // errorId 25002 "The item specific Brand is missing" when a required Brand
      // aspect has no value. This fires when the organizer set no brand AND the
      // category's Brand aspect is free-text (no enumValues) or its enum lacks an
      // "Unbranded" option — previously picked stayed null and Brand was dropped.
      // "Unbranded" is a universally accepted Brand value (valid enum member in
      // virtually all Brand picklists and acceptable as free text).
      if (!picked) {
        picked = 'Unbranded';
        source = 'brand-unbranded-fallback';
      }
    }
    // Special handling for MPN/Model/Manufacturer identifiers: check item.mpn first
    else if (/^(mpn|model|manufacturer)$/i.test(aspect.name)) {
      if (item.mpn && item.mpn.trim()) {
        picked = item.mpn;
        source = 'item.mpn';
      } else if (aspect.enumValues.length > 0) {
        // Try keyword match
        for (const val of aspect.enumValues) {
          const vLower = val.toLowerCase();
          if (vLower && (titleLower.includes(vLower) || descLower.includes(vLower))) {
            picked = val;
            source = 'keyword-match';
            break;
          }
        }
        // Prefer "Does Not Apply" / "Unbranded" / "Not Specified" over arbitrary enum[0]
        if (!picked) {
          const safeDefault = aspect.enumValues.find((v) =>
            /^(does\s*not\s*apply|unbranded|not\s*specified|n\/?a|unspecified)$/i.test(v)
          );
          if (safeDefault) {
            picked = safeDefault;
            source = 'identifier-default';
          }
        }
        // For Model specifically: derive from item title when no enum match found.
        // MPN and Manufacturer must NOT be derived from title (risk of wrong part number),
        // but Model is the product name — title is the safest available source.
        if (!picked && /^model$/i.test(aspect.name) && item.title) {
          const brandStr = (item.brand || '').toLowerCase().trim();
          const escapedBrand = brandStr.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
          const titleClean = brandStr
            ? item.title.replace(new RegExp('\\b' + escapedBrand + '\\b', 'i'), '').trim().replace(/\s+/g, ' ')
            : item.title.trim();
          picked = titleClean.slice(0, 65);
          source = 'title-derived-model';
        }
        // Skip rather than fabricate an MPN/Manufacturer — Model already handled above
        if (!picked) {
          console.warn(
            `[eBay AspectFill] category ${categoryId}: SKIPPED ${aspect.name} (no item.mpn, no safe enum default) — listing may fail with missing-aspect`
          );
          continue;
        }
      } else {
        // Free-text aspect
        picked = 'Does Not Apply';
        source = 'identifier-default';
      }
    }
    // Standard handling for other aspects (Type, Style, Material, etc.)
    else if (aspect.enumValues.length > 0) {
      // Check item.tags[] for direct enum value matches
      for (const tag of item.tags) {
        const tagLower = tag.toLowerCase();
        for (const val of aspect.enumValues) {
          const vLower = val.toLowerCase();
          if (tagLower === vLower || vLower.includes(tagLower) || tagLower.includes(vLower)) {
            picked = val;
            source = 'tag-match';
            break;
          }
        }
        if (picked) break;
      }
      // Try keyword match in title/description
      if (!picked) {
        for (const val of aspect.enumValues) {
          const vLower = val.toLowerCase();
          if (vLower && (titleLower.includes(vLower) || descLower.includes(vLower))) {
            picked = val;
            source = 'keyword-match';
            break;
          }
        }
      }
      // Neutral-value preference: instead of picking enumValues[0] (which has
      // fabricated wrong listings — see "For Instrument"="Accordion" for a
      // MIDI cable, S-eBay-Crash), prefer values that mean "not category-
      // specific": Universal, Other, Not Specified, Multiple, N/A,
      // Unspecified, Various, Any. These are safe defaults for required
      // aspects that don't actually describe the item.
      if (!picked) {
        const neutralPatterns = [
          /^universal$/i,
          /^other$/i,
          /^not\s*specified$/i,
          /^unspecified$/i,
          /^n\/?a$/i,
          /^multiple$/i,
          /^various$/i,
          /^any$/i,
          /^does\s*not\s*apply$/i,
          /universal/i,
          /not\s*specified/i,
        ];
        for (const pattern of neutralPatterns) {
          const match = aspect.enumValues.find((v) => pattern.test(v));
          if (match) {
            picked = match;
            source = 'neutral-default';
            break;
          }
        }
      }
      // Last resort: SKIP the required aspect rather than fabricate.
      // Picking enumValues[0] for a SELECTION_ONLY enum produces wrong
      // listings (e.g. "Accordion" for a MIDI cable). Better to let eBay
      // reject with a clear "missing required aspect" error than to ship
      // a mislabeled listing the organizer would have to refund.
      // For FREE_TEXT aspects, "Unspecified" is acceptable since it's
      // descriptive, not a category claim.
      if (!picked) {
        if (aspect.mode === 'FREE_TEXT') {
          picked = 'Unspecified';
          source = 'freetext-default';
        } else {
          // SELECTION_ONLY with no safe match — skip + log so the push
          // fails with a diagnosable reason rather than a fabricated value.
          console.warn(
            `[eBay AspectFill] category ${categoryId}: SKIPPED ${aspect.name} (SELECTION_ONLY, no neutral value, ${aspect.enumValues.length} enums: ${aspect.enumValues.slice(0, 5).join('|')}${aspect.enumValues.length > 5 ? '...' : ''}) — listing will likely fail with missing-aspect, organizer must set manually`
          );
          continue;
        }
      }
    } else {
      // Free-text aspect
      if (/^(brand|manufacturer|mpn|upc|ean|model|gtin|isbn)$/i.test(aspect.name)) {
        picked = 'Does Not Apply';
        source = 'identifier-default';
      } else {
        picked = 'Unspecified';
        source = 'generic-default';
      }
    }

    if (picked) {
      result[aspect.name] = [picked];
      console.log(
        `[eBay AspectFill] category ${categoryId}: ${aspect.name}="${picked}" (${source})`
      );
    }
  }

  return Object.keys(result).length > 0 ? result : undefined;
}

/**
 * Helper: Get condition label from ID
 */
function getConditionLabel(conditionId: string): string {
  const labelMap: Record<string, string> = {
    '1000': 'New',
    '3000': 'Like New',
    '4000': 'Very Good',
    '5000': 'Good',
    '6000': 'Acceptable',
    '7000': 'For Parts or Not Working',
  };
  return labelMap[conditionId] || 'Unknown';
}

/**
 * Helper: Get category label from ID
 */
function getCategoryLabel(categoryId: string): string {
  // This would normally look up from eBay's category taxonomy
  // For now, return a generic label
  return `eBay Category ${categoryId}`;
}

/**
 * Withdraw an eBay offer when the item sells on FindA.Sale
 * Fire-and-forget: logs errors but does not throw
 * Prevents double-sell risk (item stays active on eBay after FindA.Sale sale)
 */
export async function endEbayListingIfExists(itemId: string): Promise<void> {
  try {
    // Query the item for offer and listing IDs
    const item = await prisma.item.findUnique({
      where: { id: itemId },
      select: {
        ebayOfferId: true,
        ebayListingId: true,
        saleId: true,
      },
    });

    if (!item) {
      console.warn(`[eBay] Item ${itemId} not found`);
      return;
    }

    // If no eBay offer ID, item was never pushed to eBay
    if (!item.ebayOfferId) {
      return;
    }

    // Feature #300: eBay item may have null saleId (inventory item) — skip sale lookup
    if (!item.saleId) {
      console.warn(`eBay item ${itemId} has no saleId — skipping sale lookup`);
      return;
    }

    // Get organizer's eBay connection via the sale
    const sale = await prisma.sale.findUnique({
      where: { id: item.saleId },
      select: { organizerId: true },
    });

    if (!sale) {
      console.warn(`[eBay] Sale ${item.saleId} not found for item ${itemId}`);
      return;
    }

    const organizer = await prisma.organizer.findUnique({
      where: { id: sale.organizerId },
      select: { ebayConnection: true },
    });

    if (!organizer?.ebayConnection) {
      console.warn(`[eBay] No eBay connection for organizer of item ${itemId}`);
      return;
    }

    // Refresh access token if needed
    const accessToken = await refreshEbayAccessToken(organizer.ebayConnection.organizerId);
    if (!accessToken) {
      console.error(`[eBay] Could not refresh token to withdraw offer for item ${itemId}`);
      return;
    }

    // Call eBay API to withdraw the offer
    const response = await fetch(
      ebayProxyUrl(encodeURIComponent(`/sell/inventory/v1/offer/${item.ebayOfferId}/withdraw`)),
      {
        method: 'POST',
        headers: {
          ...ebayUserHeaders(accessToken),
          ...ebayProxyHeaders(),
        },
        body: '{}',
      }
    );

    if (!response.ok) {
      const errorData = await response.text();
      console.error(
        `[eBay] Failed to withdraw offer ${item.ebayOfferId} for item ${itemId}: ${response.status} ${errorData}`
      );
      return;
    }

    console.log(
      `[eBay] Successfully withdrew offer ${item.ebayOfferId} for item ${itemId} — item sold on FindA.Sale`
    );
  } catch (error) {
    console.error(`[eBay] Error withdrawing eBay listing for item ${itemId}:`, error);
    // Fire-and-forget: don't throw
  }
}

/**
 * POST /api/ebay/import-inventory
 * Import organizer's eBay inventory into FindA.Sale.
 * Creates or finds inventory container sale, fetches items from eBay Inventory API, deduplicates by SKU.
 */
export const importInventoryFromEbay = async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.user?.id;
    if (!userId) return res.status(401).json({ error: 'Unauthorized' });

    // Get organizer
    const organizer = await prisma.organizer.findUnique({ where: { userId } });
    if (!organizer) return res.status(403).json({ error: 'Not an organizer' });

    // Get eBay connection
    const ebayConn = await prisma.ebayConnection.findUnique({
      where: { organizerId: organizer.id }
    });
    if (!ebayConn) return res.status(400).json({ error: 'No eBay account connected' });

    // Refresh token if needed
    const accessToken = await refreshEbayAccessToken(organizer.id);
    if (!accessToken) return res.status(400).json({ error: 'Unable to get eBay access token. Please reconnect your eBay account.' });

    // Find or create inventory container sale
    let containerSale = await prisma.sale.findFirst({
      where: { organizerId: organizer.id, isInventoryContainer: true }
    });
    if (!containerSale) {
      containerSale = await prisma.sale.create({
        data: {
          title: 'eBay Inventory',
          description: 'Auto-generated container for eBay inventory items',
          status: 'DRAFT',
          isInventoryContainer: true,
          organizerId: organizer.id,
          // Required fields with placeholder values for container sale
          address: '',
          city: '',
          state: '',
          zip: '',
          startDate: new Date('2099-01-01'),
          endDate: new Date('2099-12-31'),
        }
      });
    }

    // --- Title reconciliation helper (links classic / non-FAS eBay listings to existing items) ---
    const normTitleForMatch = (v: string | null | undefined): string =>
      (v || '').trim().toLowerCase().replace(/\s+/g, ' ');
    // Returns true if an existing organizer item was backfilled with this listing —
    // caller must then skip creating a duplicate inventory item.
    const tryReconcileByTitle = async (
      rawTitle: string,
      listingId: string,
      categoryId: string | null,
      categoryName: string | null,
    ): Promise<boolean> => {
      const target = normTitleForMatch(rawTitle);
      if (!target || !listingId) return false;
      const candidates = await prisma.item.findMany({
        where: { organizerId: organizer.id, ebayListingId: null },
        select: { id: true, title: true, listedOnEbayAt: true, ebayCategoryId: true, category: true },
      });
      const hits = candidates.filter((c) => normTitleForMatch(c.title) === target);
      if (hits.length === 0) return false;
      if (hits.length > 1) {
        console.warn(`[eBay Import] Title tie — ${hits.length} existing items match "${target}" for organizer ${organizer.id}; skipping reconciliation, creating inventory item.`);
        return false;
      }
      const hit = hits[0];
      await prisma.item.update({
        where: { id: hit.id },
        data: {
          ebayListingId: listingId,
          listedOnEbayAt: hit.listedOnEbayAt ?? new Date(),
          ...(hit.ebayCategoryId || !categoryId ? {} : { ebayCategoryId: categoryId }),
          ...(hit.category || !categoryName ? {} : { category: categoryName }),
        },
      });
      console.log(`[eBay Import] Reconciled eBay listing ${listingId} to existing item ${hit.id} by title match ("${target}")`);
      return true;
    };

    // Paginate eBay Inventory API (covers items created via eBay Inventory API)
    // Note: items created via eBay's regular Sell/Seller Hub interface do NOT appear here.
    // They appear in the Offers endpoint instead — we check both below.
    let offset = 0;
    const limit = 200;
    let totalFetched = 0;
    let imported = 0;
    let skipped = 0;
    let hasMore = true;
    let ebayApiError: string | null = null;

    while (hasMore) {
      const response = await fetch(
        ebayProxyUrl(encodeURIComponent(`/sell/inventory/v1/inventory_item?limit=${limit}&offset=${offset}`)),
        {
          headers: {
            ...ebayUserHeaders(accessToken),
            ...ebayProxyHeaders(),
          },
        }
      );

      if (!response.ok) {
        const errText = await response.text();
        console.error('[eBay Import] Inventory API error:', response.status, errText);
        ebayApiError = `eBay Inventory API returned ${response.status}. ${errText.slice(0, 300)}`;
        break;
      }

      const data = (await response.json()) as any;
      const items: any[] = data.inventoryItems || [];
      totalFetched += items.length;

      for (const ebayItem of items) {
        const sku = ebayItem.sku as string;
        if (!sku) { skipped++; continue; }

        // Dedup: handle FAS-* (FindA.Sale-pushed) items specially
        let existing: any = null;
        let shouldBackfillEbayListingId = false;
        // For non-FAS items, will be overwritten with the numeric eBay listingId
        // fetched from the offer API. Defaults to SKU as fallback.
        let ebayListingIdToStore: string = sku;

        if (sku.startsWith('FAS-')) {
          // Extract FindA.Sale itemId from SKU
          const itemId = sku.slice(4); // Remove 'FAS-' prefix
          existing = await prisma.item.findUnique({
            where: { id: itemId }
          });

          if (existing) {
            // Item exists — check if it needs backfill
            if (!existing.organizerId || existing.organizerId !== organizer.id) {
              // Wrong organizer — treat as orphaned, skip
              skipped++;
              continue;
            }

            if (existing.ebayListingId === null) {
              // Item needs backfill — try to fetch the numeric listing ID from eBay offer
              shouldBackfillEbayListingId = true;
            } else {
              // ebayListingId already set — just skip
              skipped++;
              continue;
            }
          } else {
            // Item not found by itemId — orphaned SKU, skip
            skipped++;
            continue;
          }
        } else {
          // Non-FAS SKU: fetch the numeric listingId from the offer API.
          // The Inventory API only exposes the SKU; the Fulfillment API (used by the sold-sync
          // cron) identifies line items by legacyItemId (numeric), NOT by inventory SKU.
          // Storing the SKU as ebayListingId breaks sold-sync matching — always use numeric ID.
          try {
            const offerRes = await fetch(
              ebayProxyUrl(encodeURIComponent(`/sell/inventory/v1/offer?sku=${encodeURIComponent(sku)}`)),
              { headers: { ...ebayUserHeaders(accessToken), ...ebayProxyHeaders() } }
            );
            if (offerRes.ok) {
              const offerData = (await offerRes.json()) as any;
              const listingId = offerData?.offers?.[0]?.listing?.listingId;
              if (listingId) ebayListingIdToStore = listingId;
            }
          } catch (err: any) {
            console.warn(`[eBay Import] Could not fetch offer for SKU ${sku}, using SKU as fallback:`, err.message);
          }

          // Dedup: check by both numeric listingId AND sku to catch items stored either way
          existing = await prisma.item.findFirst({
            where: {
              organizerId: organizer.id,
              OR: [
                { ebayListingId: ebayListingIdToStore },
                { ebayListingId: sku },
              ],
            }
          });
          if (existing) {
            // Backfill: migrate SKU-stored ebayListingId to numeric ID so sold-sync can match
            if (ebayListingIdToStore !== sku && existing.ebayListingId !== ebayListingIdToStore) {
              await prisma.item.update({
                where: { id: existing.id },
                data: { ebayListingId: ebayListingIdToStore },
              });
              console.log(`[eBay Import] Backfilled numeric listingId ${ebayListingIdToStore} on item ${existing.id} (was SKU: ${sku})`);
            }
            skipped++;
            continue;
          }
        }

        // If backfill needed, fetch the numeric listing ID from eBay offer
        if (shouldBackfillEbayListingId) {
          try {
            const offerRes = await fetch(
              ebayProxyUrl(encodeURIComponent(`/sell/inventory/v1/offer?sku=${encodeURIComponent(sku)}`)),
              {
                headers: {
                  ...ebayUserHeaders(accessToken),
                  ...ebayProxyHeaders(),
                },
              }
            );

            if (offerRes.ok) {
              const offerData = (await offerRes.json()) as any;
              const listingId = offerData?.offers?.[0]?.listing?.listingId;

              if (listingId && existing) {
                // Update item with the numeric listing ID and mark as listed
                await prisma.item.update({
                  where: { id: existing.id },
                  data: {
                    ebayListingId: listingId,
                    listedOnEbayAt: new Date(),
                  },
                });
                skipped++;
                continue;
              }
            }
          } catch (err: any) {
            console.warn(`[eBay Import] Failed to fetch offer for SKU ${sku}:`, err.message);
          }

          // If backfill failed, just skip without creating a duplicate
          skipped++;
          continue;
        }

        // Map eBay fields → Item
        const product = ebayItem.product || {};
        const title: string = product.title || sku;
        const description: string = product.description || '';
        const imageUrls: string[] = product.imageUrls || [];

        // Map eBay condition to conditionGrade
        const conditionMap: Record<string, string> = {
          'NEW': 'S',
          'LIKE_NEW': 'A',
          'EXCELLENT_REFURBISHED': 'A',
          'VERY_GOOD_REFURBISHED': 'B',
          'GOOD_REFURBISHED': 'B',
          'SELLER_REFURBISHED': 'B',
          'USED_EXCELLENT': 'B',
          'USED_VERY_GOOD': 'B',
          'USED_GOOD': 'C',
          'USED_ACCEPTABLE': 'D',
          'FOR_PARTS_OR_NOT_WORKING': 'D',
        };
        const conditionGrade = conditionMap[ebayItem.condition] || null;
        const condition = conditionGrade === 'S' ? 'NEW'
          : conditionGrade === 'D' ? 'PARTS_OR_REPAIR'
          : conditionGrade ? 'USED'
          : null;

        // Reconcile this classic/non-FAS listing with an existing item by normalized title before creating a duplicate
        if (await tryReconcileByTitle(title, ebayListingIdToStore, null, null)) { skipped++; continue; }

        await prisma.item.create({
          data: {
            title: title.slice(0, 255),
            description: description.slice(0, 2000),
            photoUrls: imageUrls.slice(0, 5),
            price: null,           // Price is on eBay offer, not inventory item — organizer sets manually
            status: 'AVAILABLE',
            inInventory: true,
            organizerId: organizer.id,
            saleId: null,          // Feature #300: inventory items need no sale container
            ebayListingId: ebayListingIdToStore, // numeric listingId if offer fetch succeeded; sku as fallback
            conditionGrade,
            condition,
            embedding: [],  // populated later when item is indexed for search
          }
        });
        imported++;
      }

      // Check pagination
      hasMore = items.length === limit;
      offset += limit;
    }

    // If Inventory API returned an error, surface it instead of silently returning 0
    if (ebayApiError) {
      return res.status(502).json({
        error: `eBay API error: ${ebayApiError}. If your listings were created through eBay's regular Sell interface (not Inventory API), they won't appear here. Try reconnecting your eBay account.`
      });
    }

    // Always run Trading API GetMyeBaySelling to capture classic listings (created directly on eBay,
    // not via the Inventory API). ArtifactMI and similar sellers use BOTH: some items pushed via
    // FindA.Sale (appear in Inventory API) and some listed manually on eBay (classic listings).
    // Dedup logic below handles items already imported — running both paths is always safe.
    {
      console.log('[eBay Import] Running Trading API GetMyeBaySelling to capture classic listings...');

      const tradingConditionMap: Record<string, string> = {
        '1000': 'S', '1500': 'S', '1750': 'A', '2000': 'A', '2500': 'A',
        '3000': 'A', '4000': 'B', '5000': 'C', '6000': 'D', '7000': 'D',
      };

      let tradingPage = 1;
      let tradingTotalPages = 1;

      while (tradingPage <= tradingTotalPages) {
        // OAuth tokens use X-EBAY-API-IAF-TOKEN header — NOT <eBayAuthToken> (that's legacy Auth'n'Auth only)
        // OutputSelector replaces GranularityLevel (mutually exclusive); use OutputSelector to get specific fields
        const tradingXml = `<?xml version="1.0" encoding="utf-8"?><GetMyeBaySellingRequest xmlns="urn:ebay:apis:eBLBaseComponents"><RequesterCredentials></RequesterCredentials><OutputSelector>ActiveList.ItemArray.Item.ItemID</OutputSelector><OutputSelector>ActiveList.ItemArray.Item.SKU</OutputSelector><OutputSelector>ActiveList.ItemArray.Item.Title</OutputSelector><OutputSelector>ActiveList.ItemArray.Item.SellingStatus</OutputSelector><OutputSelector>ActiveList.ItemArray.Item.BuyItNowPrice</OutputSelector><OutputSelector>ActiveList.ItemArray.Item.PictureDetails</OutputSelector><OutputSelector>ActiveList.ItemArray.Item.ConditionID</OutputSelector><OutputSelector>ActiveList.ItemArray.Item.PrimaryCategory</OutputSelector><OutputSelector>ActiveList.PaginationResult</OutputSelector><ActiveList><Include>true</Include><Pagination><EntriesPerPage>200</EntriesPerPage><PageNumber>${tradingPage}</PageNumber></Pagination></ActiveList></GetMyeBaySellingRequest>`;

        const tradingResp = await fetch(ebayProxyUrl('/ws/api.dll'), {
          method: 'POST',
          headers: {
            'X-EBAY-API-CALL-NAME': 'GetMyeBaySelling',
            'X-EBAY-API-SITEID': '0',
            'X-EBAY-API-COMPATIBILITY-LEVEL': '967',
            'X-EBAY-API-APP-NAME': process.env.EBAY_CLIENT_ID || '',
            'X-EBAY-API-IAF-TOKEN': accessToken,
            'Content-Type': 'text/xml',
            ...ebayProxyHeaders(),
          },
          body: tradingXml,
        });

        const tradingText = await tradingResp.text();

        if (!tradingResp.ok) {
          console.error('[eBay Import] Trading API error:', tradingResp.status, tradingText.slice(0, 500));
          break;
        }

        const ack = xmlVal(tradingText, 'Ack');
        if (ack !== 'Success' && ack !== 'Warning') {
          const errMsg = xmlVal(tradingText, 'LongMessage') || xmlVal(tradingText, 'ShortMessage') || 'Unknown error';
          console.error('[eBay Import] Trading API failure:', errMsg);
          console.error('[eBay Import] Trading API raw response (first 800 chars):', tradingText.slice(0, 800));
          break;
        }

        // Parse pagination
        const totalPages = xmlVal(tradingText, 'TotalNumberOfPages');
        if (totalPages) tradingTotalPages = parseInt(totalPages, 10);

        // Parse each Item block
        const activeListBlock = tradingText.match(/<ActiveList>([\s\S]*?)<\/ActiveList>/)?.[1] || '';
        const itemBlocks = xmlAll(activeListBlock, 'Item');
        console.log(`[eBay Import] Trading API page ${tradingPage}/${tradingTotalPages}: ${itemBlocks.length} items`);

        for (const itemBlock of itemBlocks) {
          const ebayItemId = xmlVal(itemBlock, 'ItemID');
          if (!ebayItemId) { skipped++; continue; }

          const sku = xmlVal(itemBlock, 'SKU');
          const storedId = sku || ebayItemId;  // matches how we stored it

          // Check by both stored ID and raw ItemID to catch items saved either way
          const existing = await prisma.item.findFirst({
            where: {
              organizerId: organizer.id,
              OR: [
                { ebayListingId: storedId },
                { ebayListingId: ebayItemId },
              ],
            }
          });

          const titleRaw = xmlVal(itemBlock, 'Title') || ebayItemId;
          const priceRaw = xmlVal(itemBlock, 'CurrentPrice') || xmlVal(itemBlock, 'BuyItNowPrice');
          const price = priceRaw ? parseFloat(priceRaw) : null;
          // OutputSelector includes PictureDetails with multiple PictureURL tags; GalleryURL is fallback
          const pictureUrls = xmlAll(itemBlock, 'PictureURL');
          const photoUrls = pictureUrls.length > 0 ? pictureUrls : (xmlVal(itemBlock, 'GalleryURL') ? [xmlVal(itemBlock, 'GalleryURL')!] : []);
          // Extract description — strip HTML tags from eBay's CDATA description
          // Many eBay sellers use HTML templates; strip <style>/<script> blocks first
          // so CSS/JS doesn't become part of the visible text output
          const descriptionRaw = xmlVal(itemBlock, 'Description') || '';
          const descriptionWithoutBlocks = descriptionRaw
            .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, ' ')
            .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, ' ');
          const description = decodeHtmlEntities(descriptionWithoutBlocks)
            .replace(/<[^>]*>/g, ' ')
            .replace(/\s+/g, ' ')
            .trim()
            .slice(0, 2000);
          const conditionId = xmlVal(itemBlock, 'ConditionID') || '';
          const conditionGrade = tradingConditionMap[conditionId] || null;
          const condition = conditionGrade === 'S' ? 'NEW'
            : conditionGrade === 'D' ? 'PARTS_OR_REPAIR'
            : conditionGrade ? 'USED'
            : null;
          // Extract PrimaryCategory name AND numeric CategoryID.
          // Storing both — name drives human-readable UI + shipping classifier;
          // ID is used directly on push-back to avoid 25021 category errors.
          const categoryBlock = itemBlock.match(/<PrimaryCategory>([\s\S]*?)<\/PrimaryCategory>/)?.[1] || '';
          const ebayCategory = categoryBlock ? xmlVal(categoryBlock, 'CategoryName') : null;
          const ebayCategoryIdFromImport = categoryBlock ? xmlVal(categoryBlock, 'CategoryID') : null;
          // Extract ItemSpecifics values as tags (Brand, Type, Color, Material, etc.)
          const specificsBlock = itemBlock.match(/<ItemSpecifics>([\s\S]*?)<\/ItemSpecifics>/)?.[1] || '';
          const nameValueBlocks = xmlAll(specificsBlock, 'NameValueList');
          const ebayCategoryTags: string[] = nameValueBlocks
            .map(nvBlock => xmlVal(nvBlock, 'Value'))
            .filter((v): v is string => !!v && v.length > 0)
            .slice(0, 10);
          console.log(`[eBay Import] Item ${ebayItemId}: photos=${photoUrls.length}, condition=${conditionGrade || 'none'}, category=${ebayCategory || 'none'}, tags=${ebayCategoryTags.length}`);

          // If item already exists, backfill any empty fields on re-sync
          if (existing) {
            const backfill: Record<string, any> = {};
            if (photoUrls.length > existing.photoUrls.length) backfill.photoUrls = photoUrls;
            if (description && !existing.description) backfill.description = description;
            if (condition && !existing.condition) backfill.condition = condition;
            if (conditionGrade && !existing.conditionGrade) backfill.conditionGrade = conditionGrade;
            if (ebayCategory && !existing.category) backfill.category = ebayCategory;
            if (ebayCategoryTags.length > 0 && (!existing.tags || existing.tags.length === 0)) backfill.tags = ebayCategoryTags;
            // Backfill eBay numeric CategoryID for push-back (always overwrite — import is source of truth)
            if (ebayCategoryIdFromImport && existing.ebayCategoryId !== ebayCategoryIdFromImport) backfill.ebayCategoryId = ebayCategoryIdFromImport;
            // Migrate SKU-stored ebayListingId to numeric eBay ItemID so GetItem enrichment works
            if (existing.ebayListingId !== ebayItemId) backfill.ebayListingId = ebayItemId;
            if (Object.keys(backfill).length > 0) {
              await prisma.item.update({ where: { id: existing.id }, data: backfill });
            }
            skipped++;
            continue;
          }

          // Reconcile this classic listing with an existing item by normalized title before creating a duplicate
          if (await tryReconcileByTitle(titleRaw, ebayItemId, ebayCategoryIdFromImport ?? null, ebayCategory ?? null)) { skipped++; continue; }

          await prisma.item.create({
            data: {
              title: titleRaw.slice(0, 255),
              description,
              photoUrls,
              price,
              status: 'AVAILABLE',
              inInventory: true,
              organizerId: organizer.id,
              saleId: null,          // Feature #300: inventory items need no sale container
              ebayListingId: ebayItemId,  // always store numeric eBay ItemID, not SKU
              conditionGrade,
              condition,
              category: ebayCategory || undefined,
              ebayCategoryId: ebayCategoryIdFromImport || undefined,
              tags: ebayCategoryTags,
              embedding: [],  // populated later when item is indexed for search
            }
          });
          imported++;
          totalFetched++;
        }

        tradingPage++;
      }

    }

    // Update sync timestamp
    await prisma.ebayConnection.update({
      where: { organizerId: organizer.id },
      data: { lastEbayInventorySyncAt: new Date() }
    });

    // If truly found no eBay listings at all (imported 0, skipped 0)
    if (imported === 0 && skipped === 0) {
      const username = ebayConn.ebayUserId && ebayConn.ebayUserId !== 'unknown' ? ebayConn.ebayUserId : null;
      return res.json({
        success: true,
        imported: 0,
        skipped: 0,
        total: 0,
        message: username
          ? `No active listings found for eBay seller "${username}". If you have listings, they may be in a different seller account or all items are already imported.`
          : 'No items found. eBay account username could not be resolved — try disconnecting and reconnecting your eBay account, then sync again.'
      });
    }

    // Respond immediately — enrichment runs in background to avoid HTTP timeout on large catalogs
    res.json({
      success: true,
      imported,
      skipped,
      total: imported + skipped,
      message: `Imported ${imported} item${imported !== 1 ? 's' : ''} from eBay${skipped > 0 ? ` (${skipped} already existed)` : ''}. Syncing photos and details in the background…`
    });

    // Fire-and-forget: GetItem enrichment for photos, categories, descriptions, tags
    ;(async () => {
      const allEbayItems = await prisma.item.findMany({
        where: {
          organizerId: organizer.id,
          ebayListingId: { not: null },
        },
        select: { id: true, ebayListingId: true, description: true, category: true, tags: true, conditionGrade: true, photoUrls: true },
      });

      // Always enrich ALL eBay items to refresh photos/details on every sync
      const itemsToEnrich = allEbayItems;

      if (itemsToEnrich.length === 0) return;
      console.log(`[eBay Enrich] Starting GetItem enrichment for ${itemsToEnrich.length} items...`);
      let enrichedCount = 0;
      const ENRICH_CONCURRENCY = 20;

      const enrichSingleItem = async (item: typeof itemsToEnrich[0]): Promise<void> => {
        const itemId = item.ebayListingId!;
        // Skip items where ebayListingId is not a real eBay numeric ItemID (e.g. FAS-* internal IDs)
        if (!/^\d+$/.test(itemId)) {
          console.warn(`[eBay Enrich] Skipping ${itemId} — not a numeric eBay ItemID`);
          return;
        }
        const getItemXml = `<?xml version="1.0" encoding="utf-8"?><GetItemRequest xmlns="urn:ebay:apis:eBLBaseComponents"><ItemID>${itemId}</ItemID><OutputSelector>Description</OutputSelector><OutputSelector>ConditionDescription</OutputSelector><OutputSelector>ItemSpecifics</OutputSelector><OutputSelector>PictureDetails</OutputSelector><OutputSelector>ConditionID</OutputSelector><OutputSelector>PrimaryCategory</OutputSelector></GetItemRequest>`;
        try {
          const getItemHeaders: Record<string, string> = {
            'X-EBAY-API-CALL-NAME': 'GetItem',
            'X-EBAY-API-SITEID': '0',
            'X-EBAY-API-COMPATIBILITY-LEVEL': '967',
            'X-EBAY-API-APP-NAME': process.env.EBAY_CLIENT_ID || '',
            'Content-Type': 'text/xml',
            ...ebayProxyHeaders(),
          };
          if (accessToken) getItemHeaders['X-EBAY-API-IAF-TOKEN'] = accessToken;
          const resp = await fetch(ebayProxyUrl('/ws/api.dll'), { method: 'POST', headers: getItemHeaders, body: getItemXml });
          const text = await resp.text();
          const ack = xmlVal(text, 'Ack');
          if (ack !== 'Success' && ack !== 'Warning') {
            console.warn(`[eBay Enrich] GetItem ${itemId}: ${ack} — ${xmlVal(text, 'ShortMessage') || 'Unknown'}`);
            return;
          }
          const itemBlock = text.match(/<Item>([\s\S]*?)<\/Item>/)?.[1] || '';
          const backfill: Record<string, any> = {};
          const descRaw = xmlVal(itemBlock, 'Description') || '';
          const descWithoutBlocks = descRaw
            .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, ' ')
            .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, ' ');
          const descClean = decodeHtmlEntities(descWithoutBlocks)
            .replace(/<[^>]*>/g, ' ')
            .replace(/\s+/g, ' ')
            .trim()
            .slice(0, 2000);
          // Fall back to ConditionDescription if main description is template-only (strips to empty)
          const conditionDesc = (xmlVal(itemBlock, 'ConditionDescription') || '').trim().slice(0, 2000);
          const finalDesc = descClean || conditionDesc;
          if (finalDesc) backfill.description = finalDesc;
          const pictureUrls = xmlAll(itemBlock, 'PictureURL');
          if (pictureUrls.length > 0) {
            backfill.photoUrls = pictureUrls;
          }
          if (!item.conditionGrade) {
            const conditionId = xmlVal(itemBlock, 'ConditionID') || '';
            const condMapEnrich: Record<string, string> = { '1000': 'S', '1500': 'S', '1750': 'A', '2000': 'A', '2500': 'A', '3000': 'A', '4000': 'B', '5000': 'C', '6000': 'D', '7000': 'D' };
            const condGrade = condMapEnrich[conditionId] || null;
            if (condGrade) { backfill.conditionGrade = condGrade; backfill.condition = condGrade === 'S' ? 'NEW' : condGrade === 'D' ? 'PARTS_OR_REPAIR' : 'USED'; }
          }
          const categoryBlock = itemBlock.match(/<PrimaryCategory>([\s\S]*?)<\/PrimaryCategory>/)?.[1] || '';
          const categoryName = categoryBlock ? xmlVal(categoryBlock, 'CategoryName') : null;
          if (categoryName) backfill.category = categoryName;
          const specificsBlock = itemBlock.match(/<ItemSpecifics>([\s\S]*?)<\/ItemSpecifics>/)?.[1] || '';
          const nameValueBlocks = xmlAll(specificsBlock, 'NameValueList');
          const tags: string[] = nameValueBlocks.map(b => xmlVal(b, 'Value')).filter((v): v is string => !!v && v.length > 0).slice(0, 10);
          if (tags.length > 0) backfill.tags = tags;
          if (Object.keys(backfill).length > 0) {
            await prisma.item.update({ where: { id: item.id }, data: backfill });
            enrichedCount++;
          }
        } catch (err: any) {
          console.warn(`[eBay Enrich] GetItem ${itemId} exception: ${err.message}`);
        }
      };

      for (let i = 0; i < itemsToEnrich.length; i += ENRICH_CONCURRENCY) {
        await Promise.allSettled(itemsToEnrich.slice(i, i + ENRICH_CONCURRENCY).map(enrichSingleItem));
      }
      console.log(`[eBay Enrich] Complete. Updated ${enrichedCount}/${itemsToEnrich.length} items.`);

      // Notify organizer via Socket.io
      try {
        const io = getIO();
        io.to(`user:${userId}`).emit('EBAY_ENRICH_COMPLETE', {
          enriched: enrichedCount,
          total: itemsToEnrich.length,
          message: enrichedCount > 0
            ? `Photos and details synced for ${enrichedCount} eBay item${enrichedCount !== 1 ? 's' : ''}`
            : 'eBay item details already up to date',
        });
      } catch (socketErr: any) {
        console.warn('[eBay Enrich] Socket notification failed:', socketErr.message);
      }
    })().catch((err: any) => console.error('[eBay Enrich] Background enrichment failed:', err.message));

  } catch (err: any) {
    console.error('[eBay Import] Error:', err);
    return res.status(500).json({ error: 'Failed to import eBay inventory' });
  }
};

/**
 * GET /api/ebay/account-deletion
 * eBay marketplace account deletion verification handshake
 * Required for eBay production keyset GDPR compliance
 */
export const handleEbayAccountDeletionVerification = (req: express.Request, res: Response): void => {
  const challengeCode = req.query.challenge_code as string;
  if (!challengeCode) {
    res.status(400).json({ error: 'challenge_code required' });
    return;
  }

  const verificationToken = process.env.EBAY_VERIFICATION_TOKEN;
  const endpointUrl = process.env.EBAY_DELETION_ENDPOINT_URL;

  if (!verificationToken || !endpointUrl) {
    console.error('[eBay] EBAY_VERIFICATION_TOKEN or EBAY_DELETION_ENDPOINT_URL not configured');
    res.status(500).json({ error: 'Endpoint not configured' });
    return;
  }

  const hash = crypto
    .createHash('sha256')
    .update(challengeCode + verificationToken + endpointUrl)
    .digest('hex');

  res.json({ challengeResponse: hash });
};

/**
 * POST /api/ebay/account-deletion
 * eBay marketplace account deletion notification
 * FindA.Sale does not store eBay member data — acknowledge and discard
 */
export const handleEbayAccountDeletion = (_req: express.Request, res: Response): void => {
  res.status(200).json({});
};

/**
 * GET /api/ebay/notifications
 * eBay Commerce Notification API — endpoint challenge verification
 * Same SHA256(challengeCode + verificationToken + endpointUrl) scheme as account-deletion
 */
export const handleEbayNotificationVerification = (req: express.Request, res: Response): void => {
  const challengeCode = req.query.challenge_code as string;
  if (!challengeCode) {
    res.status(400).json({ error: 'challenge_code required' });
    return;
  }

  const verificationToken = process.env.EBAY_NOTIFICATION_VERIFICATION_TOKEN;
  const endpointUrl = process.env.EBAY_NOTIFICATION_ENDPOINT_URL;

  // Debug: log env var state and exact values used in hash (token masked)
  console.log('[eBay Notify] Challenge received:', {
    challengeCode,
    endpointUrl: endpointUrl || 'NOT SET',
    tokenSet: !!verificationToken,
    tokenLength: verificationToken?.length ?? 0,
  });

  if (!verificationToken || !endpointUrl) {
    console.error('[eBay Notify] EBAY_NOTIFICATION_VERIFICATION_TOKEN or EBAY_NOTIFICATION_ENDPOINT_URL not configured');
    res.status(500).json({ error: 'Notification endpoint not configured' });
    return;
  }

  const hash = crypto
    .createHash('sha256')
    .update(challengeCode + verificationToken + endpointUrl)
    .digest('hex');

  console.log('[eBay Notify] Challenge response hash:', hash);
  res.json({ challengeResponse: hash });
};

/**
 * POST /api/ebay/notifications
 * eBay Commerce Notification API — receive marketplace.order.paid events
 * When an item sells on eBay, mark it SOLD in FindA.Sale and withdraw the offer.
 */
export const handleEbayNotification = async (req: express.Request, res: Response): Promise<void> => {
  // Acknowledge immediately — eBay retries if we don't respond within 3s
  res.status(200).json({});

  try {
    const body = req.body as any;
    const topic = body?.metadata?.topic;

    if (topic !== 'ORDER_CONFIRMATION') {
      // We only handle ORDER_CONFIRMATION — silently accept other events
      return;
    }

    const lineItems: Array<{ sku?: string; legacyItemId?: string; title?: string }> = body?.data?.lineItems || [];
    if (lineItems.length === 0) return;

    console.log(`[eBay Notify] Received ORDER_CONFIRMATION — ${lineItems.length} line item(s)`);

    for (const lineItem of lineItems) {
      const sku = lineItem.sku || '';
      const legacyItemId = lineItem.legacyItemId || '';

      // Match FindA.Sale item by SKU (FAS-{itemId}) or by legacyItemId (eBay listing ID)
      let matchedItem: { id: string; title: string; saleId: string | null; ebayOfferId: string | null; sale: { organizerId: string; organizer: { userId: string } } | null } | null = null;

      if (sku.startsWith('FAS-')) {
        const itemId = sku.substring(4);
        matchedItem = await prisma.item.findUnique({
          where: { id: itemId },
          select: { id: true, title: true, saleId: true, ebayOfferId: true, sale: { select: { organizerId: true, organizer: { select: { userId: true } } } } },
        });
      }

      if (!matchedItem && legacyItemId) {
        matchedItem = await prisma.item.findFirst({
          where: { ebayListingId: legacyItemId, status: 'AVAILABLE' },
          select: { id: true, title: true, saleId: true, ebayOfferId: true, sale: { select: { organizerId: true, organizer: { select: { userId: true } } } } },
        });
      }

      if (!matchedItem) {
        console.log(`[eBay Notify] No matching item for SKU="${sku}" legacyItemId="${legacyItemId}"`);
        continue;
      }

      // Mark SOLD
      await prisma.item.update({ where: { id: matchedItem.id }, data: { status: 'SOLD' } });
      console.log(`[eBay Notify] Item ${matchedItem.id} ("${matchedItem.title}") marked SOLD via webhook`);

      // Withdraw eBay listing (fire-and-forget — item is already sold, prevent double-sale)
      endEbayListingIfExists(matchedItem.id).catch(err =>
        console.warn(`[eBay Notify] withdraw failed for item ${matchedItem!.id}:`, err.message)
      );
      notifyFacebookExportedItemSold(matchedItem.id).catch(err =>
        console.warn(`[FB Nudge] failed for item ${matchedItem!.id}:`, err.message)
      );

      // Notify organizer
      await prisma.notification.create({
        data: {
          userId: matchedItem.sale!.organizer.userId,
          type: 'SALE_UPDATE',
          title: 'Item sold on eBay',
          body: `"${matchedItem.title}" was purchased on eBay and has been marked as sold.`,
          link: matchedItem.saleId ? `/organizer/sales/${matchedItem.saleId}` : '/organizer/inventory',
          notificationChannel: 'IN_APP',
        },
      });
    }
  } catch (err: any) {
    console.error('[eBay Notify] Error processing notification:', err.message);
    // Response already sent — just log
  }
};

/**
 * GET /api/organizer/sales/:saleId/unsold-items
 * Feature #244 Phase 3: Post-sale eBay push — fetch unsold items with shipping classification
 * Returns items with status AVAILABLE (ready for donation or eBay listing)
 */
export const getUnsoldItems = async (req: AuthRequest, res: Response) => {
  try {
    const { saleId } = req.params;
    const userId = req.user?.id;

    if (!userId) {
      return res.status(401).json({ message: 'Authentication required' });
    }

    // Get sale and verify organizer ownership
    const sale = await prisma.sale.findUnique({
      where: { id: saleId },
      select: {
        id: true,
        organizerId: true,
        items: {
          where: {
            status: 'AVAILABLE',
          },
          select: {
            id: true,
            title: true,
            price: true,
            photoUrls: true,
            category: true,
            tags: true,
            ebayListingId: true,
            ebayShippingClassification: true,
            ebayShippingOverride: true,
            ebayCategoryId: true,
            // Phase B parity fields surfaced by the panel
            brand: true,
            mpn: true,
            upc: true,
            isbn: true,
            ean: true,
            ebaySubtitle: true,
            conditionNotes: true,
            allowBestOffer: true,
            bestOfferAutoAcceptAmt: true,
            bestOfferMinimumAmt: true,
            // Calculated-shipping package fields + estimate provenance
            packageWeightOz: true,
            packageLengthIn: true,
            packageWidthIn: true,
            packageHeightIn: true,
            packageType: true,
            packageEstimateSource: true,
            packageEstimateConfidence: true,
            packageConfirmedByOrganizer: true,
            // AI package estimate — feeds estimatePackageProfile step-4 AI path
            aiPackageWeightOz: true,
            aiPackageDimsJson: true,
            aiPackageConfidence: true,
          },
        },
      },
    });

    if (!sale) {
      return res.status(404).json({ message: 'Sale not found' });
    }

    // Verify organizer
    const organizer = await prisma.organizer.findUnique({
      where: { userId },
    });

    if (!organizer || sale.organizerId !== organizer.id) {
      return res.status(403).json({ message: 'Not authorized to access this sale' });
    }

    // Compute effective shipping + pre-fill package estimates for each item.
    // Organizer-confirmed values are never overwritten (estimatePackageProfile guards this).
    const items = await Promise.all(
      sale.items.map(async (item: any) => {
        const effectiveShipping = item.ebayShippingOverride || classifyEbayShipping(item.category, item.tags);

        // Pre-fill from PackageProfile / AI estimate only when the organizer has
        // not confirmed and the item is missing weight or dimensions.
        const missingPackage =
          !item.packageConfirmedByOrganizer &&
          (item.packageWeightOz == null ||
            item.packageLengthIn == null ||
            item.packageWidthIn == null ||
            item.packageHeightIn == null);

        let packageEstimate: any = null;
        if (missingPackage) {
          try {
            const est = await estimatePackageProfile({
              id: item.id,
              title: item.title,
              category: item.category,
              ebayCategoryId: item.ebayCategoryId,
              packageConfirmedByOrganizer: item.packageConfirmedByOrganizer,
              packageWeightOz: item.packageWeightOz,
              packageLengthIn: item.packageLengthIn != null ? Number(item.packageLengthIn) : null,
              packageWidthIn: item.packageWidthIn != null ? Number(item.packageWidthIn) : null,
              packageHeightIn: item.packageHeightIn != null ? Number(item.packageHeightIn) : null,
              packageType: item.packageType,
              // AI package estimate from cloudAI tagging pass
              aiEstimatedWeightOz: item.aiPackageWeightOz ?? null,
              aiEstimatedDimensions: item.aiPackageDimsJson as { length: number; width: number; height: number } | null ?? null,
              aiPackageConfidence: item.aiPackageConfidence != null ? Number(item.aiPackageConfidence) : null,
            });
            packageEstimate = {
              weightOz: est.weightOz,
              lengthIn: est.dims.length,
              widthIn: est.dims.width,
              heightIn: est.dims.height,
              packageType: est.packageType,
              confidence: est.confidence,
              source: est.source,
            };
          } catch {
            packageEstimate = null;
          }
        }

        return {
          ...item,
          packageLengthIn: item.packageLengthIn != null ? Number(item.packageLengthIn) : null,
          packageWidthIn: item.packageWidthIn != null ? Number(item.packageWidthIn) : null,
          packageHeightIn: item.packageHeightIn != null ? Number(item.packageHeightIn) : null,
          packageEstimateConfidence:
            item.packageEstimateConfidence != null ? Number(item.packageEstimateConfidence) : null,
          bestOfferAutoAcceptAmt:
            item.bestOfferAutoAcceptAmt != null ? Number(item.bestOfferAutoAcceptAmt) : null,
          bestOfferMinimumAmt:
            item.bestOfferMinimumAmt != null ? Number(item.bestOfferMinimumAmt) : null,
          price: item.price != null ? Number(item.price) : null,
          effectiveShipping,
          packageEstimate,
        };
      })
    );

    res.json({ items });
  } catch (err: any) {
    console.error('[eBay] getUnsoldItems error:', err.message);
    res.status(500).json({ message: 'Failed to fetch unsold items' });
  }
};

/**
 * PATCH /api/organizer/items/:itemId/ebay-shipping
 * Feature #244 Phase 3: Set organizer's shipping override for an item
 * Body: { override: 'SHIPPABLE' | 'LOCAL_PICKUP_ONLY' | 'DONT_LIST' | null }
 */
export const setEbayShippingOverride = async (req: AuthRequest, res: Response) => {
  try {
    const { itemId } = req.params;
    const { override } = req.body as { override?: string | null };
    const userId = req.user?.id;

    if (!userId) {
      return res.status(401).json({ message: 'Authentication required' });
    }

    // Validate override value
    const validOverrides = ['SHIPPABLE', 'LOCAL_PICKUP_ONLY', 'DONT_LIST', null];
    if (override !== undefined && override !== null && !validOverrides.includes(override)) {
      return res.status(400).json({
        message: 'Invalid override value. Must be SHIPPABLE, LOCAL_PICKUP_ONLY, DONT_LIST, or null',
      });
    }

    // Get organizer
    const organizer = await prisma.organizer.findUnique({
      where: { userId },
    });

    if (!organizer) {
      return res.status(404).json({ message: 'Organizer profile not found' });
    }

    // Get item and verify it belongs to organizer's sale
    const item = await prisma.item.findUnique({
      where: { id: itemId },
      select: {
        id: true,
        title: true,
        saleId: true,
        sale: {
          select: { organizerId: true },
        },
      },
    });

    if (!item) {
      return res.status(404).json({ message: 'Item not found' });
    }

    if (item.sale!.organizerId !== organizer.id) {
      return res.status(403).json({ message: 'Not authorized to modify this item' });
    }

    // Update the override
    const updated = await prisma.item.update({
      where: { id: itemId },
      data: {
        ebayShippingOverride: override,
      },
      select: {
        id: true,
        title: true,
        ebayShippingClassification: true,
        ebayShippingOverride: true,
        category: true,
        tags: true,
      },
    });

    // Compute effective shipping
    const effectiveShipping = updated.ebayShippingOverride || classifyEbayShipping(updated.category, updated.tags);

    res.json({
      id: updated.id,
      title: updated.title,
      ebayShippingClassification: updated.ebayShippingClassification,
      ebayShippingOverride: updated.ebayShippingOverride,
      effectiveShipping,
    });
  } catch (err: any) {
    console.error('[eBay] setEbayShippingOverride error:', err.message);
    res.status(500).json({ message: 'Failed to update shipping override' });
  }
};

/**
 * Checks all active eBay listings for a given organizer and clears
 * ebayListingId/listedOnEbayAt/ebayOfferId for any listings that have ENDED on eBay.
 * Uses Trading API GetItem (individual calls, still supported, no OAuth required).
 * Maintains batch structure of 20 for rate limiting.
 *
 * Returns: { checked: number, ended: number, itemsEnded: Array<{id, title, ebayListingId}> }
 */
export async function syncEndedListingsForOrganizer(organizerId: string): Promise<{
  checked: number;
  ended: number;
  itemsEnded: Array<{ id: string; title: string; ebayListingId: string }>;
}> {
  const result = { checked: 0, ended: 0, itemsEnded: [] as Array<{ id: string; title: string; ebayListingId: string }> };

  try {
    // Get organizer's eBay connection
    const connection = await prisma.ebayConnection.findUnique({
      where: { organizerId },
    });

    if (!connection) {
      console.log(`[eBay EndedSync] Organizer ${organizerId}: no eBay connection found`);
      return result;
    }

    // Get organizer's userId for notifications
    const organizer = await prisma.organizer.findUnique({
      where: { id: organizerId },
      select: { userId: true },
    });

    if (!organizer) {
      console.log(`[eBay EndedSync] Organizer ${organizerId}: not found`);
      return result;
    }

    // Fetch all AVAILABLE items with ebayListingId for this organizer
    const activeListings = await prisma.item.findMany({
      where: {
        ebayListingId: { not: null },
        status: 'AVAILABLE',
        sale: { organizerId },
      },
      select: {
        id: true,
        title: true,
        ebayListingId: true,
        saleId: true,
      },
    });

    if (!activeListings.length) {
      console.log(`[eBay EndedSync] Organizer ${organizerId}: no AVAILABLE items with ebayListingId`);
      return result;
    }

    console.log(
      `[eBay EndedSync] Organizer ${organizerId}: checking ${activeListings.length} active listings`
    );

    // Get organizer's OAuth access token for Trading API
    const accessToken = connection.accessToken;
    if (!accessToken) {
      console.error(`[eBay EndedSync] Organizer ${organizerId}: no OAuth access token found`);
      return result;
    }

    // Phase 3 optimization: Batch GetItem calls in concurrent requests (groups of 20)
    // Instead of sequential API calls, fire all GetItem requests in parallel per batch
    const batchSize = 20;
    for (let i = 0; i < activeListings.length; i += batchSize) {
      const batch = activeListings.slice(i, i + batchSize);

      // Build Promise array for concurrent API calls
      const getItemPromises = batch.map(async (item) => {
        try {
          // Build Trading API XML request for single item
          const requestXml = `<?xml version="1.0" encoding="utf-8"?>
<GetItemRequest xmlns="urn:ebay:apis:eBLBaseComponents">
  <ItemID>${item.ebayListingId}</ItemID>
</GetItemRequest>`;

          // Route through Vercel proxy to avoid Railway DNS block on api.ebay.com
          const ebayResponse = await fetch(ebayProxyUrl('/ws/api.dll'), {
            method: 'POST',
            headers: {
              'X-EBAY-API-CALL-NAME': 'GetItem',
              'X-EBAY-API-SITEID': '0',
              'X-EBAY-API-COMPATIBILITY-LEVEL': '967',
              'X-EBAY-API-APP-NAME': process.env.EBAY_CLIENT_ID || '',
              'X-EBAY-API-IAF-TOKEN': accessToken,
              'Content-Type': 'text/xml',
              ...ebayProxyHeaders(),
            },
            body: requestXml,
          });

          trackEbayCall(); // Track each GetItem call against daily limit

          if (!ebayResponse.ok) {
            console.warn(
              `[eBay EndedSync] Trading API HTTP error ${ebayResponse.status} for item ${item.ebayListingId}`
            );
            return { item, status: null, error: `HTTP ${ebayResponse.status}` };
          }

          const ebayText = await ebayResponse.text();

          // Check for XML error response (eBay returns XML errors even on HTTP 200)
          const ack = xmlVal(ebayText, 'Ack');
          if (ack && ack !== 'Success' && ack !== 'Warning') {
            const errMsg = xmlVal(ebayText, 'LongMessage') || xmlVal(ebayText, 'ShortMessage') || 'Unknown error';
            console.warn(`[eBay EndedSync] GetItem ${item.ebayListingId}: ${ack} — ${errMsg}`);
            return { item, status: null, error: `${ack}: ${errMsg}` };
          }

          // Extract ListingStatus from XML response (eBay Trading API returns XML)
          const status = xmlVal(ebayText, 'ListingStatus') || '';
          if (!status) {
            console.warn(`[eBay EndedSync] No ListingStatus in response for ${item.ebayListingId}`);
            return { item, status: null, error: 'No ListingStatus in response' };
          }

          return { item, status, error: null };
        } catch (error) {
          console.error(`[eBay EndedSync] Error checking item ${item.ebayListingId}:`, error);
          return { item, status: null, error: String(error) };
        }
      });

      // Execute all GetItem calls in parallel (concurrent batch)
      const batchResults = await Promise.all(getItemPromises);

      // Process results and update DB for ended listings
      for (const { item, status, error } of batchResults) {
        if (error) {
          continue; // Skip items with errors
        }

        if (!status) {
          continue; // Status should never be null here if error is null, but safe guard
        }

        result.checked++;

        // eBay status semantics — `Completed` and `Ended` are NOT the same:
        //   Completed = the listing SOLD (closed by a buyer).
        //   Ended     = the seller pulled the listing while it was still unsold.
        // SOLD (Completed): do NOT clear the eBay fields and do NOT tell the organizer to
        // re-push. Leave the item fully linked so ebaySoldSyncCron can match the eBay order
        // (by ebayListingId) and mark it SOLD with the correct "Item sold on eBay" alert.
        // Clearing here would flip a sold item back to "Push to eBay" AND destroy the match
        // key the sold-sync needs (the sold alert would then never fire).
        if (status === 'Completed') {
          console.log(
            `[eBay EndedSync] Item ${item.id} ("${item.title}"): listing Completed (SOLD) — leaving linked for sold-sync to reconcile`
          );
          continue;
        }

        // UNSOLD (Ended): clear the eBay link and invite a re-push.
        if (status === 'Ended') {
          console.log(
            `[eBay EndedSync] Item ${item.id} ("${item.title}"): listing Ended (unsold) — clearing eBay link`
          );

          // Clear eBay fields
          await prisma.item.update({
            where: { id: item.id },
            data: {
              ebayListingId: null,
              listedOnEbayAt: null,
              ebayOfferId: null,
            },
          });

          // Create notification
          await prisma.notification.create({
            data: {
              userId: organizer.userId,
              type: 'SALE_UPDATE',
              title: 'eBay listing ended',
              body: `"${item.title}" listing ended on eBay. You can re-push this item.`,
              link: `/organizer/sales/${item.saleId}`,
              notificationChannel: 'IN_APP',
            },
          });

          result.ended++;
          result.itemsEnded.push({
            id: item.id,
            title: item.title,
            ebayListingId: item.ebayListingId || '',
          });
        }
      }

      console.log(`[eBay EndedSync] Batch of ${batch.length} items processed, ${batchResults.filter(r => r.status).length} API calls succeeded`);

      // Small delay between batches to respect rate limits and give eBay some breathing room
      if (i + batchSize < activeListings.length) {
        await new Promise(resolve => setTimeout(resolve, 500)); // 500ms between batches
      }
    }

    console.log(
      `[eBay EndedSync] Organizer ${organizerId}: checked ${result.checked} listings, found ${result.ended} ended`
    );
  } catch (error) {
    console.error(`[eBay EndedSync ERROR] organizerId ${organizerId}:`, error);
  }

  return result;
}
type PreviewShippingResult = {
  buyerShipping: number;
  labelCost: number;
  carrier: 'USPS' | 'UPS' | 'FEDEX';
  basis: 'actual' | 'dimensional';
  cheapestRate: number;
  flatPolicy: { name: string; amount: number } | null;
  shippingMode: 'FLAT_TIERS' | 'CALCULATED';
};

/**
 * Resolve the organizer's own label-cost infra for the preview (cheapest carrier rate,
 * basis, carrier, shippingMode). The buyer-paid amount + flat policy are NOT computed
 * here -- resolveItemShipping (ebayShippingResolver.ts) is the single source of truth
 * for those, shared with the listing-push path so preview and listing can never disagree.
 * labelCost is the organizer's own outlay -- a DIFFERENT number from buyerShipping under
 * FLAT_TIERS.
 */
function resolvePreviewShipping(opts: {
  shippingMode: string;
  weightOz: number;
  dims?: { length?: number; width?: number; height?: number };
  origin: { zip?: string | null; lat?: number | null; lng?: number | null };
  labelCostOverride?: number;
}): PreviewShippingResult {
  const cheapest = computeCheapestForOrigin({
    weightOz: opts.weightOz,
    dims: opts.dims
      ? { length: opts.dims.length, width: opts.dims.width, height: opts.dims.height }
      : null,
    origin: opts.origin,
  });
  const labelCost = opts.labelCostOverride != null ? opts.labelCostOverride : cheapest.rate;
  const mode: 'FLAT_TIERS' | 'CALCULATED' =
    opts.shippingMode === 'FLAT_TIERS' ? 'FLAT_TIERS' : 'CALCULATED';

  // buyerShipping + flatPolicy are NOT computed here. resolveItemShipping is the single
  // source of truth for the buyer-paid amount (ADR Part A) — the caller fills those in.
  // This helper only computes the organizer's own label cost + carrier infra, which is a
  // DIFFERENT number from buyerShipping under FLAT_TIERS.
  return {
    buyerShipping: 0,
    labelCost,
    carrier: cheapest.carrier,
    basis: cheapest.basis,
    cheapestRate: cheapest.rate,
    flatPolicy: null,
    shippingMode: mode,
  };
}

/**
 * POST /api/ebay/shipping-preview
 * Returns an estimated buyer-shipping rate + net proceeds for a prospective listing.
 * Body accepts either { itemId } (loads the item) OR explicit
 * { weightOz, dims:{length,width,height}, itemPrice, ebayCategoryId, fromZip }.
 * Requires authenticate + requireOrganizer.
 */
export const getShippingNetPreview = async (req: AuthRequest, res: Response): Promise<Response> => {
  try {
    const userId = req.user?.id;
    if (!userId) {
      return res.status(401).json({ message: 'Authentication required' });
    }

    const organizer = await prisma.organizer.findUnique({
      where: { userId },
      include: { ebayPolicyMapping: true },
    });
    if (!organizer) {
      return res.status(403).json({ message: 'Organizer profile required' });
    }

    const body = (req.body || {}) as {
      itemId?: string;
      weightOz?: number;
      dims?: { length?: number; width?: number; height?: number };
      itemPrice?: number;
      ebayCategoryId?: string | null;
      fromZip?: string | null;
      toZip?: string | null;
      labelCost?: number;
      promotedPercent?: number;
      tax?: number;
    };

    let weightOz = body.weightOz;
    let dims = body.dims;
    let itemPrice = body.itemPrice;
    let ebayCategoryId: string | null = body.ebayCategoryId ?? null;
    let saleZip: string | null = null;

    // If an itemId was passed, load real values (organizer-scoped).
    if (body.itemId) {
      const item = await prisma.item.findFirst({
        where: { id: body.itemId, sale: { organizerId: organizer.id } },
        select: {
          price: true,
          packageWeightOz: true,
          packageLengthIn: true,
          packageWidthIn: true,
          packageHeightIn: true,
          ebayCategoryId: true,
          sale: { select: { zip: true } },
        },
      });
      if (!item) {
        return res.status(404).json({ message: 'Item not found' });
      }
      saleZip = item.sale?.zip ?? null;
      if (weightOz == null && item.packageWeightOz != null) weightOz = item.packageWeightOz;
      if (!dims) {
        dims = {
          length: item.packageLengthIn != null ? Number(item.packageLengthIn) : undefined,
          width: item.packageWidthIn != null ? Number(item.packageWidthIn) : undefined,
          height: item.packageHeightIn != null ? Number(item.packageHeightIn) : undefined,
        };
      }
      if (itemPrice == null && item.price != null) itemPrice = Number(item.price);
      if (ebayCategoryId == null) ebayCategoryId = item.ebayCategoryId ?? null;
    }

    if (weightOz == null || weightOz <= 0) {
      return res.status(400).json({
        code: 'NEEDS_PACKAGE_DETAILS',
        message: 'A package weight is required to estimate shipping.',
      });
    }

    const freeShippingOptIn = organizer.ebayPolicyMapping?.freeShippingOptIn ?? false;
    const shippingMode = organizer.ebayPolicyMapping?.shippingMode ?? 'CALCULATED';

    // labelCost / carrier / cheapestRate infra (organizer's own outlay).
    const ship = resolvePreviewShipping({
      shippingMode,
      weightOz,
      dims,
      origin: { zip: body.fromZip ?? saleZip, lat: organizer.lat, lng: organizer.lng },
      labelCostOverride: body.labelCost,
    });
    // Single source of truth for what the buyer is charged (matches the live listing).
    const resolved = await resolveItemShipping({
      organizer: { lat: organizer.lat, lng: organizer.lng },
      mapping: organizer.ebayPolicyMapping,
      item: {
        packageWeightOz: weightOz,
        packageLengthIn: dims?.length ?? null,
        packageWidthIn: dims?.width ?? null,
        packageHeightIn: dims?.height ?? null,
      },
      fromZip: body.fromZip ?? saleZip,
    });
    const buyerShipping = resolved.buyerAmountCents / 100;
    const flatPolicy =
      resolved.source === 'weight-tier' || resolved.source === 'fvf-flat'
        ? { name: resolved.policyName ?? `FindA.Sale Flat $${buyerShipping.toFixed(2)}`, amount: buyerShipping }
        : null;
    const labelCost = ship.labelCost;
    const fvfOnShipping = Math.round(buyerShipping * 0.136 * 100) / 100;
    const netToSeller = Math.round((buyerShipping - fvfOnShipping) * 100) / 100;

    const proceeds = await computeNetProceeds({
      itemPrice: itemPrice ?? 0,
      buyerShipping,
      tax: body.tax,
      ebayCategoryId,
      promotedPercent: body.promotedPercent,
      labelCost,
    });

    return res.json({
      buyerShipping,
      net: proceeds.net,
      breakdown: proceeds.breakdown,
      shippingMode: ship.shippingMode,
      flatPolicy,
      shippingEstimate: {
        rate: ship.cheapestRate,
        basis: ship.basis,
        service: ship.carrier,
        carrier: ship.carrier,
        isEstimate: true,
        source: ship.shippingMode === 'FLAT_TIERS' ? 'flat_policy' : 'calculated',
        freeShippingOptIn,
        labelCost,
        netToSeller,
        fvfOnShipping,
        shippingCovered: netToSeller >= labelCost,
      },
    });
  } catch (error: any) {
    console.error('[eBay ShippingPreview ERROR]', error);
    return res.status(500).json({ message: 'Failed to compute shipping preview' });
  }
};

/**
 * POST /api/ebay/shipping-preview/suggest-price
 * Back-solves the item price needed to hit a target net margin after eBay fees +
 * the organizer's label cost. NEVER auto-applies — returns a suggestion only.
 * Body: { itemId? | weightOz, dims, ebayCategoryId, fromZip, targetMarginPct, labelCost?, promotedPercent? }
 */
export const getSuggestedPriceForMargin = async (req: AuthRequest, res: Response): Promise<Response> => {
  try {
    const userId = req.user?.id;
    if (!userId) {
      return res.status(401).json({ message: 'Authentication required' });
    }

    const organizer = await prisma.organizer.findUnique({
      where: { userId },
      include: { ebayPolicyMapping: true },
    });
    if (!organizer) {
      return res.status(403).json({ message: 'Organizer profile required' });
    }

    const body = (req.body || {}) as {
      itemId?: string;
      weightOz?: number;
      dims?: { length?: number; width?: number; height?: number };
      ebayCategoryId?: string | null;
      fromZip?: string | null;
      toZip?: string | null;
      targetMarginPct?: number;
      labelCost?: number;
      promotedPercent?: number;
      tax?: number;
    };

    const targetMarginPct = typeof body.targetMarginPct === 'number' ? body.targetMarginPct : 0.3;
    let weightOz = body.weightOz;
    let dims = body.dims;
    let ebayCategoryId: string | null = body.ebayCategoryId ?? null;
    let saleZip: string | null = null;

    if (body.itemId) {
      const item = await prisma.item.findFirst({
        where: { id: body.itemId, sale: { organizerId: organizer.id } },
        select: {
          packageWeightOz: true,
          packageLengthIn: true,
          packageWidthIn: true,
          packageHeightIn: true,
          ebayCategoryId: true,
          sale: { select: { zip: true } },
        },
      });
      if (!item) {
        return res.status(404).json({ message: 'Item not found' });
      }
      saleZip = item.sale?.zip ?? null;
      if (weightOz == null && item.packageWeightOz != null) weightOz = item.packageWeightOz;
      if (!dims) {
        dims = {
          length: item.packageLengthIn != null ? Number(item.packageLengthIn) : undefined,
          width: item.packageWidthIn != null ? Number(item.packageWidthIn) : undefined,
          height: item.packageHeightIn != null ? Number(item.packageHeightIn) : undefined,
        };
      }
      if (ebayCategoryId == null) ebayCategoryId = item.ebayCategoryId ?? null;
    }

    if (weightOz == null || weightOz <= 0) {
      return res.status(400).json({
        code: 'NEEDS_PACKAGE_DETAILS',
        message: 'A package weight is required to suggest a price.',
      });
    }

    const freeShippingOptIn = organizer.ebayPolicyMapping?.freeShippingOptIn ?? false;
    const shippingMode = organizer.ebayPolicyMapping?.shippingMode ?? 'CALCULATED';
    const ship = resolvePreviewShipping({
      shippingMode,
      weightOz,
      dims,
      origin: { zip: body.fromZip ?? saleZip, lat: organizer.lat, lng: organizer.lng },
      labelCostOverride: body.labelCost,
    });
    // Single source of truth for what the buyer is charged (matches the live listing).
    const resolved = await resolveItemShipping({
      organizer: { lat: organizer.lat, lng: organizer.lng },
      mapping: organizer.ebayPolicyMapping,
      item: {
        packageWeightOz: weightOz,
        packageLengthIn: dims?.length ?? null,
        packageWidthIn: dims?.width ?? null,
        packageHeightIn: dims?.height ?? null,
      },
      fromZip: body.fromZip ?? saleZip,
    });
    const buyerShipping = resolved.buyerAmountCents / 100;
    const flatPolicy =
      resolved.source === 'weight-tier' || resolved.source === 'fvf-flat'
        ? { name: resolved.policyName ?? `FindA.Sale Flat $${buyerShipping.toFixed(2)}`, amount: buyerShipping }
        : null;
    const labelCost = ship.labelCost;
    const fvfOnShipping = Math.round(buyerShipping * 0.136 * 100) / 100;
    const netToSeller = Math.round((buyerShipping - fvfOnShipping) * 100) / 100;

    const result = await suggestPriceForMargin({
      targetMarginPct,
      buyerShipping,
      tax: body.tax,
      ebayCategoryId,
      promotedPercent: body.promotedPercent,
      labelCost,
    });

    return res.json({
      suggestedItemPrice: result.suggestedItemPrice,
      projectedNet: result.projectedNet,
      targetMarginPct: result.targetMarginPct,
      breakdown: result.breakdown,
      shippingMode: ship.shippingMode,
      flatPolicy,
      shippingEstimate: {
        rate: ship.cheapestRate,
        basis: ship.basis,
        service: ship.carrier,
        carrier: ship.carrier,
        isEstimate: true,
        source: ship.shippingMode === 'FLAT_TIERS' ? 'flat_policy' : 'calculated',
        freeShippingOptIn,
        labelCost,
        netToSeller,
        fvfOnShipping,
        shippingCovered: netToSeller >= labelCost,
      },
    });
  } catch (error: any) {
    console.error('[eBay SuggestPrice ERROR]', error);
    return res.status(500).json({ message: 'Failed to suggest price' });
  }
};
