import crypto from 'crypto';
import express, { Response } from 'express';
import { AuthRequest } from '../middleware/auth';
import { prisma } from '../lib/prisma';
import { getWatermarkedUrl } from '../utils/cloudinaryWatermark';
import { getEbayCategoryId } from '../utils/ebayCategoryMap';

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

// Condition mapping: FindA.Sale grade to eBay condition ID
const CONDITION_ID_MAP: Record<string, string> = {
  'S': '1000', // New
  'A': '3000', // Like New
  'B': '4000', // Very Good
  'C': '5000', // Good
  'D': '6000', // Acceptable
};

/**
 * Get or refresh eBay OAuth access token using Client Credentials flow
 */
async function getEbayAccessToken(): Promise<string | null> {
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

    // Get eBay category ID from category name
    const ebayCategoryId = getEbayCategoryId(item.category);

    // Build data row in correct column order
    const row = [
      escapeCsvValue('Draft'), // Action
      escapeCsvValue(item.id.substring(0, 12)), // Custom label (SKU) — use truncated ID
      escapeCsvValue(ebayCategoryId), // Category ID (mapped from FindA.Sale category name)
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
 */
async function refreshEbayAccessToken(organizerId: string): Promise<string | null> {
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

    // Generate CSRF token (state parameter)
    const stateToken = crypto.randomBytes(32).toString('hex');

    // In a real app, store state token in Redis or DB with expiry
    // For now, we'll rely on the OAuth endpoint validation
    // TODO: Add state token validation on callback

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
    authUrl.searchParams.set('scope', 'https://api.ebay.com/oauth/api_scope/sell.inventory');
    authUrl.searchParams.set('state', stateToken);
    authUrl.searchParams.set('prompt', 'login');

    res.redirect(authUrl.toString());
  } catch (error) {
    console.error('[eBay] Connect error:', error);
    res.status(500).json({ message: 'Failed to initiate eBay OAuth' });
  }
};

/**
 * GET /api/ebay/callback
 * Exchange authorization code for tokens; store in EbayConnection
 */
export const ebayOAuthCallback = async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.user?.id;
    if (!userId) {
      return res.status(401).json({ message: 'Authentication required' });
    }

    const { code, state } = req.query as { code?: string; state?: string };

    if (!code) {
      return res.status(400).json({ message: 'Authorization code missing' });
    }

    // Get organizer
    const organizer = await prisma.organizer.findUnique({
      where: { userId },
    });

    if (!organizer) {
      return res.status(404).json({ message: 'Organizer profile not found' });
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

    // Decode JWT to get eBay user ID (optional, but recommended)
    // For now, extract from token response if present
    let ebayUserId = 'unknown';
    try {
      // Basic JWT decode (without verification) — in production, verify signature
      const parts = accessToken.split('.');
      if (parts.length === 3) {
        const decoded = JSON.parse(Buffer.from(parts[1], 'base64').toString());
        ebayUserId = decoded.iss || decoded.user_id || 'unknown';
      }
    } catch (e) {
      console.warn('[eBay] Could not decode eBay user ID from JWT', e);
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

    res.json({
      success: true,
      ebayUserId: connection.ebayUserId,
      connectedAt: connection.connectedAt,
      redirectTo: '/organizer/settings#ebay',
    });
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

    res.json({
      connected: true,
      ebayUserId: connection.ebayUserId,
      connectedAt: connection.connectedAt,
      lastRefreshedAt: connection.lastRefreshedAt,
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
    });

    if (!organizer) {
      return res.status(404).json({ message: 'Organizer profile not found' });
    }

    // Delete connection (cascade will clean up any related data)
    await prisma.ebayConnection.deleteMany({
      where: { organizerId: organizer.id },
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
    const categoryId = getEbayCategoryId(item.category);

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
    const photos = item.photoUrls.map(url => {
      if (photoMode === 'clean') {
        return url; // Return clean URL
      }
      return getWatermarkedUrl(url); // Return watermarked URL
    });

    // Build aspects from tags
    const aspects: Record<string, string> = {};
    item.tags.forEach(tag => {
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
      categoryLabel: getCategoryLabel(categoryId),
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

    // Refresh token if needed
    const accessToken = await refreshEbayAccessToken(organizer.id);
    if (!accessToken) {
      return res.status(500).json({
        message: 'Failed to refresh eBay access token',
      });
    }

    // Fetch items
    const sale = await prisma.sale.findUnique({
      where: { id: saleId },
      select: {
        id: true,
        organizerId: true,
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
            conditionGrade: true,
            photoUrls: true,
            estimatedValue: true,
            aiSuggestedPrice: true,
            tags: true,
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

    // Push each item to eBay
    const results: any[] = [];

    for (const item of sale.items) {
      try {
        const sku = `FAS-${item.id}`;
        const conditionId = mapConditionGradeToEbayId(item.conditionGrade);
        const categoryId = getEbayCategoryId(item.category);

        // Determine price
        let price = 0.99;
        if (item.aiSuggestedPrice) {
          price = Number(item.aiSuggestedPrice);
        } else if (item.estimatedValue) {
          price = Number(item.estimatedValue);
        } else if (item.price) {
          price = item.price;
        }

        // Prepare photo URLs
        const photos = item.photoUrls.map(url => {
          if (photoMode === 'clean') {
            return url;
          }
          return getWatermarkedUrl(url);
        });

        // Step 1: Create or replace inventory item
        const inventoryUrl = `https://api.ebay.com/sell/inventory/v1/inventory_item/${encodeURIComponent(sku)}`;
        const inventoryPayload = {
          product: {
            title: item.title.substring(0, 80),
            description: (item.description || '').replace(/<[^>]*>/g, '').substring(0, 4000),
            imageUrls: photos,
            aspects: buildAspects(item.tags),
          },
          condition: mapConditionIdToEbayCondition(conditionId),
          availability: {
            shipToLocationAvailability: [
              {
                quantity: 1,
                locationKey: 'DEFAULT',
              },
            ],
          },
        };

        const inventoryResponse = await fetch(inventoryUrl, {
          method: 'PUT',
          headers: {
            'Authorization': `Bearer ${accessToken}`,
            'Content-Type': 'application/json',
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

        // Step 2: Create offer
        const offerUrl = 'https://api.ebay.com/sell/inventory/v1/offer';
        const offerPayload = {
          sku,
          listingDescription: item.description || '',
          pricingSummary: {
            price: {
              currency: 'USD',
              value: price.toFixed(2),
            },
          },
          categoryId,
          condition: mapConditionIdToEbayCondition(conditionId),
          listingDuration: 'GTC',
          listingPolicies: {
            // Note: These policy IDs would need to be fetched from organizer's account
            // For MVP, using placeholder — should be configurable
            paymentPolicyId: 'EBAY_DEFAULT',
            fulfillmentPolicyId: 'EBAY_DEFAULT',
            returnPolicyId: 'EBAY_DEFAULT',
          },
          referralUrl: `https://www.ebay.com/?campid=${EBAY_EPN_CAMPID}`,
        };

        const offerResponse = await fetch(offerUrl, {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${accessToken}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify(offerPayload),
        });

        if (!offerResponse.ok) {
          const errorData = await offerResponse.text();
          console.error(`[eBay] Offer creation failed: ${offerResponse.status} ${errorData}`);
          results.push({
            itemId: item.id,
            sku,
            ebayListingId: null,
            status: 'error',
            error: 'OFFER_CREATION_FAILED',
            message: `Failed to create offer: ${offerResponse.status}`,
          });
          continue;
        }

        const offerData = (await offerResponse.json()) as any;
        const offerId = offerData.offerId;

        // Step 3: Publish offer
        const publishUrl = `https://api.ebay.com/sell/inventory/v1/offer/${offerId}/publish`;
        const publishResponse = await fetch(publishUrl, {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${accessToken}`,
            'Content-Type': 'application/json',
          },
          body: '{}',
        });

        if (!publishResponse.ok) {
          const errorData = await publishResponse.text();
          console.error(`[eBay] Publish failed: ${publishResponse.status} ${errorData}`);
          results.push({
            itemId: item.id,
            sku,
            ebayListingId: null,
            status: 'error',
            error: 'PUBLISH_FAILED',
            message: `Failed to publish offer: ${publishResponse.status}`,
          });
          continue;
        }

        const publishData = (await publishResponse.json()) as any;
        const ebayListingId = publishData.listingId;

        // Update item with eBay listing ID
        await prisma.item.update({
          where: { id: item.id },
          data: {
            ebayListingId,
            listedOnEbayAt: new Date(),
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
function buildAspects(tags: string[]): Record<string, string> {
  const aspects: Record<string, string> = {};
  tags.forEach(tag => {
    const [key, value] = tag.split(':');
    if (key && value) {
      aspects[key] = value;
    }
  });
  return aspects;
}

/**
 * Helper: Map condition ID to eBay condition string
 */
function mapConditionIdToEbayCondition(conditionId: string): string {
  const conditionMap: Record<string, string> = {
    '1000': 'NEW',
    '3000': 'LIKE_NEW',
    '4000': 'VERY_GOOD',
    '5000': 'GOOD',
    '6000': 'ACCEPTABLE',
    '7000': 'FOR_PARTS_OR_NOT_WORKING',
  };
  return conditionMap[conditionId] || 'USED';
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
