import crypto from 'crypto';
import express, { Request, Response } from 'express';
import sanitizeHtml from 'sanitize-html';
import { AuthRequest } from '../middleware/auth';
import { prisma } from '../lib/prisma';
import { getWatermarkedUrl, getWatermarkedUrlWithQR } from '../utils/cloudinaryWatermark';
import { classifyEbayShipping } from '../utils/ebayShippingClassifier';
import { getIO } from '../lib/socket';

/**
 * Feature #229: AI Price Comps Tool
 * Feature #244 Phase 1: eBay CSV Export
 * Feature #244 Phase 2: eBay OAuth + Inventory API Push
 *
 * eBay API integration for price comparison, CSV export, OAuth, and direct inventory push.
 */

// EPN Campaign ID for affiliate tracking
const EBAY_EPN_CAMPID = '5339148447';

// Token cache for eBay OAuth (simple in-memory, will be replaced with Redis in production)
interface CachedToken {
  token: string;
  expiresAt: number;
}

let ebayTokenCache: CachedToken | null = null;

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

// Secondary category map: tag keywords to eBay category IDs
const SECONDARY_CATEGORY_MAP: Record<string, string> = {
  vintage: '1',          // Collectibles root
  antique: '20081',      // Antiques root
  handmade: '14339',     // Crafts root
  rare: '1',             // Collectibles root
  collectible: '1',      // Collectibles root
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

    // Request new token
    const credentials = Buffer.from(`${clientId}:${clientSecret}`).toString('base64');
    const response = await fetch('https://api.ebay.com/identity/v1/oauth2/token', {
      method: 'POST',
      headers: {
        'Authorization': `Basic ${credentials}`,
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: 'grant_type=client_credentials&scope=https://api.ebay.com/oauth/api_scope',
    });

    if (!response.ok) {
      console.error(`[eBay] Token fetch failed: ${response.status}`);
      return null;
    }

    const data = (await response.json()) as any;
    const expiresIn = data.expires_in || 7200; // Default 2 hours

    ebayTokenCache = {
      token: data.access_token,
      expiresAt: Date.now() + (expiresIn - 300) * 1000, // Refresh 5 minutes before expiry
    };

    return ebayTokenCache.token;
  } catch (error) {
    console.error('[eBay] Token fetch error:', error);
    return null;
  }
}

/**
 * Get eBay price comps for an item based on title and condition
 */
async function getEbayPriceComps(
  title: string,
  conditionGrade: string | null | undefined
): Promise<{
  min: number;
  max: number;
  median: number;
  count: number;
  suggestedPrice: number;
  compsRunAt: string;
  listings: Array<{ title: string; price: number; condition: string; url: string }>;
  isMockData?: boolean;
  message?: string;
}> {
  try {
    const token = await getEbayAccessToken();

    // Fallback to mock data if no token (credentials not set)
    if (!token) {
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

    const conditionId = CONDITION_ID_MAP[conditionGrade || 'B'] || CONDITION_ID_MAP['B'];
    const query = encodeURIComponent(title);

    const url =
      `https://api.ebay.com/buy/browse/v1/item_summary/search?` +
      `q=${query}&` +
      `filter=conditionIds:${conditionId},buyingOptions:FIXED_PRICE,price:[5..],priceCurrency:USD&` +
      `sort=endDate&` +
      `limit=10`;

    const response = await fetch(url, {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
    });

    if (!response.ok) {
      console.error(`[eBay] Browse API failed: ${response.status}`);
      // Fallback to mock data on API error
      return {
        min: 25,
        max: 75,
        median: 45,
        count: 0,
        suggestedPrice: 45,
        compsRunAt: new Date().toISOString(),
        listings: [],
        isMockData: true,
        message: 'eBay API error — showing sample data',
      };
    }

    const data = (await response.json()) as any;
    const summaries = data.itemSummaries || [];

    if (summaries.length === 0) {
      // No results found, return mock data
      return {
        min: 25,
        max: 75,
        median: 45,
        count: 0,
        suggestedPrice: 45,
        compsRunAt: new Date().toISOString(),
        listings: [],
        isMockData: false,
      };
    }

    const prices = summaries
      .map((item: any) => parseFloat(item.price?.value || 0))
      .filter((p: number) => p > 0)
      .sort((a: number, b: number) => a - b);

    if (prices.length === 0) {
      return {
        min: 25,
        max: 75,
        median: 45,
        count: 0,
        suggestedPrice: 45,
        compsRunAt: new Date().toISOString(),
        listings: [],
        isMockData: false,
      };
    }

    const min = Math.min(...prices);
    const max = Math.max(...prices);
    const median = prices[Math.floor(prices.length / 2)];

    const listings = summaries.slice(0, 10).map((item: any) => ({
      title: item.title || 'Unknown',
      price: parseFloat(item.price?.value || 0),
      condition: item.condition || 'Unknown',
      url: item.itemWebUrl || '',
    }));

    return {
      min,
      max,
      median,
      count: prices.length,
      suggestedPrice: median,
      compsRunAt: new Date().toISOString(),
      listings,
    };
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
    // userId is User.id, but item.sale.organizerId is Organizer.id, so we need to look up the organizer first
    const organizer = await prisma.organizer.findUnique({
      where: { userId },
    });
    if (!organizer || item.sale.organizerId !== organizer.id) {
      return res.status(403).json({ message: 'Not authorized to access this item' });
    }

    // Get comps from eBay
    const comps = await getEbayPriceComps(item.title, item.conditionGrade);

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
  includeWatermark: boolean = false
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
        photoUrl = getWatermarkedUrl(photoUrl);
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
    const csv = generateEbayCsv(sale.items, sale.title, includeWatermark);

    // Set response headers for file download
    const timestamp = new Date().toISOString().split('T')[0];
    const filename = `ebay-export-${sale.title.replace(/\s+/g, '-')}-${timestamp}.csv`;

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
    const response = await fetch('https://api.ebay.com/identity/v1/oauth2/token', {
      method: 'POST',
      headers: {
        'Authorization': `Basic ${credentials}`,
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: params.toString(),
    });

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
async function getEbayCategoryCandidates(
  title: string
): Promise<Array<{ categoryId: string; categoryName: string; level: number }>> {
  try {
    const appToken = await getEbayAccessToken();
    if (!appToken) {
      console.warn('[eBay Taxonomy] App token unavailable — check EBAY_CLIENT_ID/SECRET');
      return [];
    }
    const treeId = '0'; // EBAY_US
    const q = encodeURIComponent(title.slice(0, 100));
    const url = `https://api.ebay.com/commerce/taxonomy/v1/category_tree/${treeId}/get_category_suggestions?q=${q}`;
    const res = await fetch(url, {
      headers: {
        Authorization: `Bearer ${appToken}`,
        'Content-Type': 'application/json',
        'Accept-Language': 'en-US',
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
      }>;
    };
    const suggestions = data.categorySuggestions ?? [];
    return suggestions
      .slice(0, 5)
      .map((s) => ({
        categoryId: s.category.categoryId,
        categoryName: s.category.categoryName,
        level: s.categoryTreeNodeLevel ?? 0,
      }))
      .sort((a, b) => b.level - a.level); // deepest first
  } catch (err) {
    console.error('[eBay Taxonomy] Error:', err);
    return [];
  }
}

async function suggestEbayCategoryForTitle(title: string): Promise<string | null> {
  const candidates = await getEbayCategoryCandidates(title);
  if (candidates.length === 0) {
    console.warn(`[eBay Taxonomy] No suggestions for "${title.slice(0, 60)}"`);
    return null;
  }
  const best = candidates[0];
  console.log(
    `[eBay Taxonomy] "${title.slice(0, 40)}" → ${best.categoryId} (${best.categoryName}) level=${best.level}`
  );
  return best.categoryId;
}

/**
 * Fetch organizer's real business policies from eBay and store them
 * Called after OAuth connect completes. Fire-and-forget on error.
 * marketplace_id=EBAY_US is required by the Account API.
 */
async function fetchAndStoreEbayPolicies(organizerId: string, accessToken: string): Promise<void> {
  try {
    // Fetch payment policies
    const paymentRes = await fetch('https://api.ebay.com/sell/account/v1/payment_policy?marketplace_id=EBAY_US', {
      method: 'GET',
      headers: ebayUserHeaders(accessToken),
    });

    // Fetch fulfillment policies
    const fulfillmentRes = await fetch('https://api.ebay.com/sell/account/v1/fulfillment_policy?marketplace_id=EBAY_US', {
      method: 'GET',
      headers: ebayUserHeaders(accessToken),
    });

    // Fetch return policies
    const returnRes = await fetch('https://api.ebay.com/sell/account/v1/return_policy?marketplace_id=EBAY_US', {
      method: 'GET',
      headers: ebayUserHeaders(accessToken),
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
    const tokenResponse = await fetch('https://api.ebay.com/identity/v1/oauth2/token', {
      method: 'POST',
      headers: {
        'Authorization': `Basic ${credentials}`,
        'Content-Type': 'application/x-www-form-urlencoded',
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

    const frontendUrl = process.env.FRONTEND_URL || 'https://finda.sale';
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
      const EBAY_NOTIFY_BASE = 'https://api.ebay.com/commerce/notification/v1';
      // Fire-and-forget subscription deletion — non-fatal if this fails
      fetch(`${EBAY_NOTIFY_BASE}/subscription/${organizer.ebaySubscriptionId}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${organizer.ebayConnection.accessToken}`, 'Content-Type': 'application/json' },
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

    if (!organizer || item.sale.organizerId !== organizer.id) {
      return res.status(403).json({ message: 'Not authorized to preview this item' });
    }

    // Build preview payload
    const sku = `FAS-${item.id}`;
    const conditionId = mapConditionGradeToEbayId(item.conditionGrade);
    // Resolve categoryId: stored → Taxonomy API suggestion → static map fallback
    // (same cascade as pushSaleToEbay). Requires an active user access token
    // for the Taxonomy API call; refresh lazily only when we need to suggest.
    let categoryId: string | null = item.ebayCategoryId || null;
    if (!categoryId) {
      const suggested = await suggestEbayCategoryForTitle(item.title);
      if (suggested) {
        categoryId = suggested;
        await prisma.item.update({
          where: { id: item.id },
          data: { ebayCategoryId: suggested },
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
    const { itemIds, photoMode } = req.body as { itemIds: string[]; photoMode?: string };
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

    // Verify eBay connection exists
    if (!organizer.ebayConnection) {
      return res.status(400).json({
        message: 'eBay account not connected',
      });
    }

    // Check if policies are configured
    const conn = organizer.ebayConnection;
    if (!conn.paymentPolicyId || !conn.fulfillmentPolicyId || !conn.returnPolicyId) {
      return res.status(400).json({
        error: 'POLICIES_NOT_CONFIGURED',
        message:
          'Please connect your eBay account again to configure business policies, or set up business policies in eBay Seller Hub first.',
      });
    }

    // Refresh token if needed
    const accessToken = await refreshEbayAccessToken(organizer.id);
    if (!accessToken) {
      return res.status(500).json({
        message: 'Failed to refresh eBay access token',
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
            ebayCategoryId: true,
            ebayNeedsReview: true,
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

    // Push each item to eBay
    const results: any[] = [];

    for (const item of sale.items) {
      try {
        const sku = `FAS-${item.id}`;
        // Resolve categoryId in this order:
        // 1. Stored ebayCategoryId (from eBay import — always a valid leaf)
        // 2. eBay Taxonomy API getCategorySuggestions by title — returns a leaf,
        //    cache it back to the item so future pushes skip the API call
        // 3. Static name→ID map (last resort; may land on a branch → 25021)
        let categoryId: string | null = item.ebayCategoryId || null;
        if (!categoryId) {
          categoryId = await suggestEbayCategoryForTitle(item.title);
          if (categoryId) {
            // Cache — idempotent, cheap, avoids repeated API calls on re-push
            await prisma.item.update({
              where: { id: item.id },
              data: { ebayCategoryId: categoryId },
            });
          }
        }

        // Resolve condition: grade → inventory enum → remap to category-accepted value
        const desiredCondition = mapGradeToInventoryCondition(item.conditionGrade);
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
          return getWatermarkedUrlWithQR(url, item.id); // QR+name watermark default
        });

        // Step 1: Create or replace inventory item
        const inventoryUrl = `https://api.ebay.com/sell/inventory/v1/inventory_item/${encodeURIComponent(sku)}`;
        // Build aspects: start with user-provided tags, then auto-fill any
        // REQUIRED aspects the category demands (prevents errorId 25002
        // "The item specific X is missing").
        const userAspects = buildAspects(item.tags);
        const aspects = await fillRequiredAspects(userAspects, categoryId ?? '99', {
          title: item.title,
          tags: item.tags,
          description: item.description,
        });
        const sanitizedDescription = sanitizeDescriptionForEbay(item.description);
        const inventoryPayload: Record<string, unknown> = {
          product: {
            title: item.title.substring(0, 80),
            description: sanitizedDescription,
            imageUrls: photos,
            ...(aspects ? { aspects } : {}),
            ...(item.brand ? { brand: item.brand } : {}),
            ...(item.mpn ? { mpn: item.mpn } : {}),
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
              weight: { unit: 'OUNCE', value: item.packageWeightOz },
              ...(item.packageLengthIn && item.packageWidthIn && item.packageHeightIn ? {
                dimensions: {
                  unit: 'INCH',
                  length: Number(item.packageLengthIn),
                  width: Number(item.packageWidthIn),
                  height: Number(item.packageHeightIn),
                },
              } : {}),
              ...(item.packageType ? { packageType: item.packageType } : {}),
            },
          } : {}),
        };

        const inventoryResponse = await fetch(inventoryUrl, {
          method: 'PUT',
          headers: ebayUserHeaders(accessToken),
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

        // Verify the condition actually stuck on the inventory_item (diagnostic —
        // PUT can return 204 but eBay may silently reject condition changes on
        // pre-existing SKUs from prior failed pushes).
        try {
          const verifyRes = await fetch(inventoryUrl, {
            headers: ebayUserHeaders(accessToken),
          });
          if (verifyRes.ok) {
            const verifyData = (await verifyRes.json()) as { condition?: string };
            console.log(
              `[eBay InventoryVerify] ${sku}: sent=${ebayCondition} stored=${verifyData.condition || 'null'}`
            );
          }
        } catch (err) {
          console.warn('[eBay InventoryVerify] error:', err);
        }

        // Step 2: Upsert offer — find existing or create new, then update price/policies
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
            paymentPolicyId: conn.paymentPolicyId,
            fulfillmentPolicyId: conn.fulfillmentPolicyId,
            returnPolicyId: conn.returnPolicyId,
          },
          ...(sanitizedDescription ? { listingDescription: sanitizedDescription } : {}),
          ...(item.allowBestOffer ? {
            bestOfferTerms: {
              bestOfferEnabled: true,
              ...(item.bestOfferAutoAcceptAmt ? { autoAcceptPrice: { value: Number(item.bestOfferAutoAcceptAmt).toFixed(2), currency: 'USD' } } : {}),
              ...(item.bestOfferMinimumAmt ? { autoDeclinePrice: { value: Number(item.bestOfferMinimumAmt).toFixed(2), currency: 'USD' } } : {}),
            },
          } : {}),
          ...(item.ebaySecondaryCategoryId ? { secondaryCategoryId: item.ebaySecondaryCategoryId } : item.tags?.some((t: string) => Object.keys(SECONDARY_CATEGORY_MAP).includes(t.toLowerCase())) ? {
            secondaryCategoryId: Object.entries(SECONDARY_CATEGORY_MAP).find(([tag]) => item.tags.some((t: string) => t.toLowerCase() === tag))?.[1],
          } : {}),
        };

        // Resolve existing offerId: use stored value or look up by SKU on eBay
        let offerId: string | null = item.ebayOfferId || null;
        let existingOfferCategoryId: string | null = null;
        let existingOfferStatus: string | null = null;

        if (!offerId) {
          const getOfferRes = await fetch(
            `https://api.ebay.com/sell/inventory/v1/offer?sku=${encodeURIComponent(sku)}`,
            { headers: ebayUserHeaders(accessToken) }
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
            `https://api.ebay.com/sell/inventory/v1/offer/${offerId}`,
            { headers: ebayUserHeaders(accessToken) }
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
          await fetch(`https://api.ebay.com/sell/inventory/v1/offer/${offerId}`, {
            method: 'DELETE',
            headers: ebayUserHeaders(accessToken),
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
            `https://api.ebay.com/sell/inventory/v1/offer/${offerId}`,
            {
              method: 'PUT',
              headers: ebayUserHeaders(accessToken),
              body: JSON.stringify(offerPayload),
            }
          );
          if (!updateRes.ok && updateRes.status !== 204) {
            const errText = await updateRes.text();
            console.warn(`[eBay] Offer update failed (non-fatal): ${updateRes.status} ${errText}`);
            // Proceed anyway — existing offer may still be publishable
          }
        } else {
          // Create new offer
          const createRes = await fetch('https://api.ebay.com/sell/inventory/v1/offer', {
            method: 'POST',
            headers: ebayUserHeaders(accessToken),
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
          const createData = (await createRes.json()) as any;
          offerId = createData.offerId;
        }

        // Store offerId
        await prisma.item.update({
          where: { id: item.id },
          data: { ebayOfferId: offerId },
        });

        // Step 3: Publish offer
        const publishUrl = `https://api.ebay.com/sell/inventory/v1/offer/${offerId}/publish`;
        let publishResponse = await fetch(publishUrl, {
          method: 'POST',
          headers: ebayUserHeaders(accessToken),
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
            const retryOrder = [
              'NEW_OTHER',
              'USED_VERY_GOOD',
              'USED_EXCELLENT',
              'USED_GOOD',
              'USED_ACCEPTABLE',
              'NEW',
            ].filter((c) => c !== ebayCondition && (!accepted || accepted.has(c)));

            for (const retryCondition of retryOrder) {
              console.log(
                `[eBay Retry25021] ${sku}: ${ebayCondition} rejected — retrying with ${retryCondition}`
              );
              const retryInvPayload = { ...inventoryPayload, condition: retryCondition };
              const retryInvRes = await fetch(inventoryUrl, {
                method: 'PUT',
                headers: ebayUserHeaders(accessToken),
                body: JSON.stringify(retryInvPayload),
              });
              if (!retryInvRes.ok && retryInvRes.status !== 204) {
                const t = await retryInvRes.text();
                console.warn(`[eBay Retry25021] inventory PUT failed: ${retryInvRes.status} ${t.slice(0, 200)}`);
                continue;
              }
              publishResponse = await fetch(publishUrl, {
                method: 'POST',
                headers: ebayUserHeaders(accessToken),
              });
              if (publishResponse.ok) {
                console.log(`[eBay Retry25021] ${sku}: succeeded with condition=${retryCondition}`);
                break;
              }
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
                `https://api.ebay.com/sell/inventory/v1/offer/${offerId}`,
                { headers: ebayUserHeaders(accessToken) }
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
                `https://api.ebay.com/sell/inventory/v1/offer/${offerId}`,
                {
                  method: 'PUT',
                  headers: ebayUserHeaders(accessToken),
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
                headers: ebayUserHeaders(accessToken),
              });
              if (publishResponse.ok) {
                categoryId = candidate.categoryId;
                await prisma.item.update({
                  where: { id: item.id },
                  data: { ebayCategoryId: candidate.categoryId },
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

        if (publishResponse.ok) {
          const publishData = (await publishResponse.json()) as any;
          ebayListingId = publishData.listingId;
        } else {
          const publishError = await publishResponse.text();
          console.warn(`[eBay] Publish returned ${publishResponse.status}: ${publishError}`);

          // If already published, fetch listingId from the existing offer
          const offerDetailRes = await fetch(
            `https://api.ebay.com/sell/inventory/v1/offer/${offerId}`,
            { headers: ebayUserHeaders(accessToken) }
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

        // Update item with eBay listing ID; clear any prior review flag
        await prisma.item.update({
          where: { id: item.id },
          data: {
            ebayListingId,
            listedOnEbayAt: new Date(),
            ebayNeedsReview: false,
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
        console.error(`[eBay] Error processing item ${item.id}:`, itemError);
        results.push({
          itemId: item.id,
          sku: `FAS-${item.id}`,
          ebayListingId: null,
          status: 'error',
          error: 'INTERNAL_ERROR',
          message: 'Internal server error processing item',
        });
      }
    }

    // Calculate summary
    const summary = {
      total: results.length,
      success: results.filter((r: any) => r.status === 'success').length,
      failed: results.filter((r: any) => r.status === 'error').length,
    };

    res.json({ results, summary });
  } catch (error) {
    console.error('[eBay] Push error:', error);
    res.status(500).json({ message: 'Failed to push items to eBay' });
  }
};

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

  // Try to find an existing enabled location
  try {
    const listRes = await fetch('https://api.ebay.com/sell/inventory/v1/location', { headers });
    if (listRes.ok) {
      const data = (await listRes.json()) as any;
      const locations: any[] = data.locations || [];
      // Prefer ENABLED locations; fall back to first available
      const enabled = locations.find((l: any) => l.merchantLocationStatus === 'ENABLED');
      const chosen = enabled || locations[0];
      if (chosen) {
        console.log(`[eBay] Using existing merchant location: ${chosen.merchantLocationKey}`);
        return { merchantLocationKey: chosen.merchantLocationKey };
      }
    }
  } catch (err) {
    console.error('[eBay] Failed to list merchant locations:', err);
  }

  // If saleAddressHint provided, try to create a location from it
  if (saleAddressHint) {
    console.log('[eBay] No existing merchant location — creating from sale address');
    try {
      const locationKey = `findasale-sale-${Date.now()}`;
      const createRes = await fetch(
        `https://api.ebay.com/sell/inventory/v1/location/${locationKey}`,
        {
          method: 'POST',
          headers,
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
        const err = await createRes.text();
        console.error('[eBay] Failed to create merchant location from sale address:', err);
        return { error: 'MERCHANT_LOCATION_CREATION_FAILED' };
      } else {
        // Enable the newly created location
        const enableRes = await fetch(
          `https://api.ebay.com/sell/inventory/v1/location/${locationKey}/enable`,
          { method: 'POST', headers }
        );
        if (!enableRes.ok) {
          const err = await enableRes.text();
          console.warn('[eBay] Failed to enable merchant location (may already be enabled):', err);
        }
        return { merchantLocationKey: locationKey };
      }
    } catch (err) {
      console.error('[eBay] Exception creating merchant location from sale address:', err);
      return { error: 'MERCHANT_LOCATION_CREATION_FAILED' };
    }
  }

  // No existing location and no sale address hint — fail
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
 * Helper: Map condition ID to eBay Inventory API condition enum.
 * Trading API IDs → Inventory API string enums (NOT the same scale).
 */
function mapConditionIdToEbayCondition(conditionId: string): string {
  const conditionMap: Record<string, string> = {
    '1000': 'NEW',
    '1500': 'NEW_OTHER',
    '1750': 'NEW_WITH_DEFECTS',
    '2500': 'SELLER_REFURBISHED',
    '3000': 'USED_GOOD',        // Trading API 3000 = "Used" → USED_GOOD
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
 */
function mapGradeToInventoryCondition(grade: string | null | undefined): string {
  switch ((grade || '').toUpperCase()) {
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
    const url =
      `https://api.ebay.com/sell/metadata/v1/marketplace/EBAY_US/get_item_condition_policies` +
      `?filter=categoryIds:%7B${categoryId}%7D`;
    const res = await fetch(url, {
      headers: {
        'Authorization': `Bearer ${appToken}`,
        'Accept': 'application/json',
        'Accept-Language': 'en-US',
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
    // Also accept the alternate "USED_GOOD"↔"3000" naming eBay uses in some responses
    if (accepted.has('USED_EXCELLENT')) accepted.add('USED_VERY_GOOD');
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
    'USED_GOOD':                ['USED_VERY_GOOD', 'USED_ACCEPTABLE', 'FOR_PARTS_OR_NOT_WORKING'],
    'USED_ACCEPTABLE':          ['USED_GOOD', 'FOR_PARTS_OR_NOT_WORKING'],
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
    const url =
      `https://api.ebay.com/commerce/taxonomy/v1/category_tree/${treeId}/get_item_aspects_for_category` +
      `?category_id=${categoryId}`;
    const res = await fetch(url, {
      headers: {
        'Authorization': `Bearer ${appToken}`,
        'Accept': 'application/json',
        'Accept-Language': 'en-US',
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
 *      a. If SELECTION_ONLY / has enumValues — match title + description against
 *         the enum list (case-insensitive substring), else prefer "Unbranded"
 *         for Brand aspects, else fall back to enumValues[0].
 *      b. If FREE_TEXT — use "Does Not Apply" for identifier-like aspects
 *         (Brand / MPN / UPC / Model / Manufacturer), "Unspecified" otherwise.
 * Prevents errorId 25002 "The item specific X is missing".
 */
async function fillRequiredAspects(
  existing: Record<string, string[]> | undefined,
  categoryId: string,
  item: { title: string; tags: string[]; description?: string | null }
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

    if (aspect.enumValues.length > 0) {
      // Try keyword match against enum values
      for (const val of aspect.enumValues) {
        const vLower = val.toLowerCase();
        if (vLower && (titleLower.includes(vLower) || descLower.includes(vLower))) {
          picked = val;
          break;
        }
      }
      // Brand fallback — prefer "Unbranded" when available and nothing matched
      if (!picked && /^brand$/i.test(aspect.name)) {
        const unbranded = aspect.enumValues.find((v) => /unbranded/i.test(v));
        if (unbranded) picked = unbranded;
      }
      // Last resort — first enum value (safe default; organizer can edit on eBay)
      if (!picked) picked = aspect.enumValues[0];
    } else {
      // Free-text aspect
      if (/^(brand|manufacturer|mpn|upc|ean|model|gtin|isbn)$/i.test(aspect.name)) {
        picked = 'Does Not Apply';
      } else {
        picked = 'Unspecified';
      }
    }

    if (picked) {
      result[aspect.name] = [picked];
      console.log(
        `[eBay AspectFill] category ${categoryId}: ${aspect.name}="${picked}" (auto-filled)`
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
    const withdrawUrl = `https://api.ebay.com/sell/inventory/v1/offer/${item.ebayOfferId}/withdraw`;
    const response = await fetch(withdrawUrl, {
      method: 'POST',
      headers: ebayUserHeaders(accessToken),
      body: '{}',
    });

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
      const url = `https://api.ebay.com/sell/inventory/v1/inventory_item?limit=${limit}&offset=${offset}`;
      const response = await fetch(url, {
        headers: ebayUserHeaders(accessToken),
      });

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

        // Dedup: skip if already imported
        const existing = await prisma.item.findFirst({
          where: { organizerId: organizer.id, ebayListingId: sku }
        });
        if (existing) { skipped++; continue; }

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

        await prisma.item.create({
          data: {
            title: title.slice(0, 255),
            description: description.slice(0, 2000),
            photoUrls: imageUrls.slice(0, 5),
            price: null,           // Price is on eBay offer, not inventory item — organizer sets manually
            status: 'AVAILABLE',
            inInventory: true,
            organizerId: organizer.id,
            saleId: containerSale!.id,
            ebayListingId: sku,
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

    // If Inventory API returned 0 items, fall back to eBay Trading API GetMyeBaySelling.
    // This is the only eBay endpoint that returns ALL active listings regardless of how they were created.
    if (totalFetched === 0) {
      console.log('[eBay Import] Inventory API returned 0. Trying Trading API GetMyeBaySelling...');

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

        const tradingResp = await fetch('https://api.ebay.com/ws/api.dll', {
          method: 'POST',
          headers: {
            'X-EBAY-API-CALL-NAME': 'GetMyeBaySelling',
            'X-EBAY-API-SITEID': '0',
            'X-EBAY-API-COMPATIBILITY-LEVEL': '967',
            'X-EBAY-API-APP-NAME': process.env.EBAY_CLIENT_ID || '',
            'X-EBAY-API-IAF-TOKEN': accessToken,
            'Content-Type': 'text/xml',
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
          const descriptionRaw = xmlVal(itemBlock, 'Description') || '';
          const description = decodeHtmlEntities(descriptionRaw).replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 2000);
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

          await prisma.item.create({
            data: {
              title: titleRaw.slice(0, 255),
              description,
              photoUrls,
              price,
              status: 'AVAILABLE',
              inInventory: true,
              organizerId: organizer.id,
              saleId: containerSale!.id,
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
        const getItemXml = `<?xml version="1.0" encoding="utf-8"?><GetItemRequest xmlns="urn:ebay:apis:eBLBaseComponents"><ItemID>${itemId}</ItemID><OutputSelector>Description</OutputSelector><OutputSelector>ItemSpecifics</OutputSelector><OutputSelector>PictureDetails</OutputSelector><OutputSelector>ConditionID</OutputSelector><OutputSelector>PrimaryCategory</OutputSelector></GetItemRequest>`;
        try {
          const getItemHeaders: Record<string, string> = {
            'X-EBAY-API-CALL-NAME': 'GetItem',
            'X-EBAY-API-SITEID': '0',
            'X-EBAY-API-COMPATIBILITY-LEVEL': '967',
            'X-EBAY-API-APP-NAME': process.env.EBAY_CLIENT_ID || '',
            'Content-Type': 'text/xml',
          };
          if (accessToken) getItemHeaders['X-EBAY-API-IAF-TOKEN'] = accessToken;
          const resp = await fetch('https://api.ebay.com/ws/api.dll', { method: 'POST', headers: getItemHeaders, body: getItemXml });
          const text = await resp.text();
          const ack = xmlVal(text, 'Ack');
          if (ack !== 'Success' && ack !== 'Warning') {
            console.warn(`[eBay Enrich] GetItem ${itemId}: ${ack} — ${xmlVal(text, 'ShortMessage') || 'Unknown'}`);
            return;
          }
          const itemBlock = text.match(/<Item>([\s\S]*?)<\/Item>/)?.[1] || '';
          const backfill: Record<string, any> = {};
          const descRaw = xmlVal(itemBlock, 'Description') || '';
          const descClean = decodeHtmlEntities(descRaw).replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 2000);
          if (descClean) backfill.description = descClean;
          const pictureUrls = xmlAll(itemBlock, 'PictureURL');
          if (pictureUrls.length > 0) backfill.photoUrls = pictureUrls;
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
      let matchedItem: { id: string; title: string; saleId: string; ebayOfferId: string | null; sale: { organizerId: string; organizer: { userId: string } } } | null = null;

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

      // Notify organizer
      await prisma.notification.create({
        data: {
          userId: matchedItem.sale.organizer.userId,
          type: 'SALE_UPDATE',
          title: 'Item sold on eBay',
          body: `"${matchedItem.title}" was purchased on eBay and has been marked as sold.`,
          link: `/organizer/sales/${matchedItem.saleId}`,
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
 * Returns items that haven't sold (status NOT IN SOLD, RESERVED)
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
            status: {
              notIn: ['SOLD', 'RESERVED'],
            },
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

    // Compute effective shipping for each item
    const items = sale.items.map((item: any) => {
      const effectiveShipping = item.ebayShippingOverride || classifyEbayShipping(item.category, item.tags);
      return {
        ...item,
        effectiveShipping,
      };
    });

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

    if (item.sale.organizerId !== organizer.id) {
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
