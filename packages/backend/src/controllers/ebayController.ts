import { Response } from 'express';
import { AuthRequest } from '../middleware/auth';
import { prisma } from '../lib/prisma';

/**
 * Feature #229: AI Price Comps Tool
 * Feature #244 Phase 1: eBay CSV Export
 *
 * eBay API integration for price comparison and CSV export.
 */

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

// eBay category mapping table
const EBAY_CATEGORY_MAP: Record<string, string> = {
  'Furniture': '3197',
  'Electronics': '58058',
  'Clothing': '11450',
  'Jewelry': '281',
  'Art': '550',
  'Books': '267',
  'Toys': '220',
  'Kitchen': '20625',
  'Tools': '631',
  'Sports': '888',
  'Collectibles': '1',
  'Other': '99',
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
    if (item.sale.organizerId !== userId) {
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
 * Generate eBay CSV for a sale's items
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
  saleTitle: string
): string {
  const csvHeaders = [
    '*Action',
    '*Category',
    'PicURL',
    '*Title',
    'Description',
    '*StartPrice',
    '*Quantity',
    '*ConditionID',
    '*ListingDuration',
    '*ReturnsAcceptedOption',
    '*Format',
    'SKU',
    'ItemSpecifics:Brand',
    'ItemSpecifics:Condition Description',
  ];

  const rows = items.map((item) => {
    const conditionId = CONDITION_ID_MAP[item.conditionGrade || 'B'] || '5000';
    const categoryId = EBAY_CATEGORY_MAP[item.category || 'Other'] || '99';

    // Determine price: use aiSuggestedPrice > estimatedValue > price > default
    let startPrice = 0.99;
    if (item.aiSuggestedPrice) {
      startPrice = Number(item.aiSuggestedPrice);
    } else if (item.estimatedValue) {
      startPrice = Number(item.estimatedValue);
    } else if (item.price) {
      startPrice = item.price;
    }

    // Get first photo URL or empty
    const photoUrl = item.photoUrls?.[0] || '';

    // Truncate title to 80 chars for eBay
    const truncatedTitle = item.title.substring(0, 80);

    // Strip description (remove any internal tags)
    const cleanDescription = (item.description || '')
      .replace(/<[^>]*>/g, '')
      .replace(/&nbsp;/g, ' ')
      .trim()
      .substring(0, 4000);

    return [
      'ADD',
      categoryId,
      photoUrl,
      truncatedTitle,
      cleanDescription,
      startPrice.toFixed(2),
      '1',
      conditionId,
      'GTC',
      'ReturnsAccepted',
      'FixedPrice',
      `FAS-${item.id}`,
      '',
      '',
    ];
  });

  // Escape CSV values (quote if contains comma, quote, or newline)
  const escapeCsvValue = (value: string | number): string => {
    const str = String(value);
    if (str.includes(',') || str.includes('"') || str.includes('\n')) {
      return `"${str.replace(/"/g, '""')}"`;
    }
    return str;
  };

  const headerLine = csvHeaders.map(escapeCsvValue).join(',');
  const dataLines = rows
    .map((row) => row.map(escapeCsvValue).join(','))
    .join('\n');

  return `${headerLine}\n${dataLines}`;
}

/**
 * GET /api/organizer/sales/:saleId/ebay-export
 * Generate and download eBay CSV for a sale
 */
export const exportSaleToEbay = async (req: AuthRequest, res: Response) => {
  try {
    const { saleId } = req.params;
    const { photoMode } = req.query as { photoMode?: string };
    const userId = req.user?.id;

    if (!userId) {
      return res.status(401).json({ message: 'Authentication required' });
    }

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
    if (sale.organizerId !== userId) {
      return res.status(403).json({ message: 'Not authorized to export this sale' });
    }

    // Check tier for clean photo export (PRO only)
    if (photoMode === 'clean') {
      const organizer = await prisma.organizer.findUnique({
        where: { userId },
        select: { tier: true },
      });

      if (organizer?.tier !== 'PRO') {
        return res.status(403).json({
          message: 'Clean photo export requires PRO tier',
        });
      }
    }

    if (sale.items.length === 0) {
      return res.status(400).json({
        message: 'No available items to export',
      });
    }

    // Generate CSV
    const csv = generateEbayCsv(sale.items, sale.title);

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
