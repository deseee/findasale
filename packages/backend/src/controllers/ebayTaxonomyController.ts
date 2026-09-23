/**
 * ebayTaxonomyController.ts — Phase C Taxonomy + Catalog + AI Suggest Routes
 *
 * Handles three authenticated endpoints for eBay listing data parity:
 * GET /api/ebay/taxonomy/aspects/:categoryId
 * GET /api/ebay/catalog/search
 * POST /api/ebay/suggest/identifiers
 */

import { Response } from 'express';
import { AuthRequest, requireOrganizer } from '../middleware/auth';
import { prisma } from '../lib/prisma';
import {
  getAspectsForCategory,
  searchCatalogProduct,
  suggestIdentifiersFromItem,
  suggestCategories,
} from '../services/ebayTaxonomyService';
import { getEbayAccessToken } from './ebayController';
import { ebayFetch } from '../services/ebayPublishService';

// ── Vercel Proxy Helpers ────────────────────────────────────────────────────
// Railway DNS cannot resolve api.ebay.com directly, so all eBay API calls route
// through the Vercel proxy at /api/proxy/ebay. These helpers ensure consistent
// URL and header construction.
const ebayProxyUrl = (path: string): string =>
  `${process.env.FRONTEND_URL ?? 'https://finda.sale'}/api/proxy/ebay?path=${path}`;

const ebayProxyHeaders = (): Record<string, string> => {
  const secret = process.env.EBAY_PROXY_SECRET;
  return secret ? { 'X-Proxy-Secret': secret } : {};
};

// ── Helper: Get organizer's eBay connection + refresh token if needed ────────

async function getOrganizerEbayToken(organizerId: string): Promise<string | null> {
  const connection = await prisma.ebayConnection.findUnique({
    where: { organizerId },
  });

  if (!connection) {
    return null;
  }

  // Check if token is expired, refresh if needed
  const now = new Date();
  if (connection.tokenExpiresAt <= now) {
    // Token expired — attempt refresh
    const clientId = process.env.EBAY_CLIENT_ID;
    const clientSecret = process.env.EBAY_CLIENT_SECRET;

    if (!clientId || !clientSecret) {
      console.warn('[ebayTaxonomy] EBAY_CLIENT_ID or EBAY_CLIENT_SECRET not configured');
      return null;
    }

    try {
      const credentials = Buffer.from(`${clientId}:${clientSecret}`).toString('base64');
      const response = await fetch(ebayProxyUrl('/identity/v1/oauth2/token'), {
        method: 'POST',
        headers: {
          Authorization: `Basic ${credentials}`,
          'Content-Type': 'application/x-www-form-urlencoded',
          ...ebayProxyHeaders(),
        },
        body: `grant_type=refresh_token&refresh_token=${connection.refreshToken}&scope=https://api.ebay.com/oauth/api_scope`,
      });

      if (!response.ok) {
        console.error(`[ebayTaxonomy] Token refresh failed: ${response.status}`);
        return null;
      }

      const data = (await response.json()) as any;
      const expiresIn = data.expires_in || 7200;

      // Update connection with new token
      await prisma.ebayConnection.update({
        where: { organizerId },
        data: {
          accessToken: data.access_token,
          tokenExpiresAt: new Date(Date.now() + (expiresIn - 300) * 1000),
          lastRefreshedAt: new Date(),
        },
      });

      return data.access_token;
    } catch (error) {
      console.error('[ebayTaxonomy] Token refresh error:', error);
      return null;
    }
  }

  // Token still valid
  return connection.accessToken;
}

// ── Handler 1: GET /api/ebay/taxonomy/aspects/:categoryId ───────────────────

/**
 * GET /api/ebay/listing-debug/:itemId — diagnostic-only, organizer-scoped.
 *
 * Added 2026-09-22 to verify (not guess) why ebayPriceRevisionService.ts's Best-Offer-
 * threshold repair keeps failing on legacy listing 136164918832 with "Auto Accept Price
 * must be less than the Buy It Now price" even though the repair's own math is correct
 * (accept < revised StartPrice). Hypothesis under test: this listing type carries a
 * separate BuyItNowPrice field our revise call never touches, left stale below the new
 * accept threshold. Read-only -- no eBay or DB mutation. Item must belong to the calling
 * organizer (same OR-scoping pattern platformStatsController.ts's getEbaySyncIssues uses).
 * Token never leaves the server -- fetched via the existing getOrganizerEbayToken helper,
 * same as every other handler in this file.
 */
export async function getListingDebugInfo(req: AuthRequest, res: Response): Promise<void> {
  try {
    if (!req.user) {
      res.status(401).json({ error: 'Unauthorized' });
      return;
    }
    const organizerId = (req.user as any).organizer?.id;
    if (!organizerId) {
      res.status(403).json({ error: 'Organizer profile not found' });
      return;
    }

    const { itemId } = req.params;
    const item = await prisma.item.findFirst({
      where: { id: itemId, OR: [{ organizerId }, { sale: { organizerId } }] },
      select: { id: true, ebayListingId: true },
    });
    if (!item || !item.ebayListingId) {
      res.status(404).json({ error: 'Item not found, not yours, or not on eBay' });
      return;
    }

    const token = await getOrganizerEbayToken(organizerId);
    if (!token) {
      res.status(401).json({ error: 'eBay connection not authorized' });
      return;
    }

    const xml = `<?xml version="1.0" encoding="utf-8"?><GetItemRequest xmlns="urn:ebay:apis:eBLBaseComponents"><ItemID>${item.ebayListingId}</ItemID><OutputSelector>Item.ListingType</OutputSelector><OutputSelector>Item.StartPrice</OutputSelector><OutputSelector>Item.BuyItNowPrice</OutputSelector><OutputSelector>Item.SellingStatus.CurrentPrice</OutputSelector><OutputSelector>Item.BestOfferDetails</OutputSelector></GetItemRequest>`;

    const ebayRes = await fetch(ebayProxyUrl('/ws/api.dll'), {
      method: 'POST',
      headers: {
        'X-EBAY-API-CALL-NAME': 'GetItem',
        'X-EBAY-API-SITEID': '0',
        'X-EBAY-API-COMPATIBILITY-LEVEL': '967',
        'X-EBAY-API-IAF-TOKEN': token,
        'Content-Type': 'text/xml',
        ...ebayProxyHeaders(),
      },
      body: xml,
    });
    const text = await ebayRes.text();
    const xmlVal = (block: string, tag: string): string | null => {
      const m = block.match(new RegExp(`<${tag}(?:\\s[^>]*)?>([\\s\\S]*?)<\\/${tag}>`));
      return m ? m[1].trim() : null;
    };

    res.json({
      itemId: item.ebayListingId,
      ack: xmlVal(text, 'Ack'),
      listingType: xmlVal(text, 'ListingType'),
      startPrice: xmlVal(text, 'StartPrice'),
      buyItNowPrice: xmlVal(text, 'BuyItNowPrice'),
      currentPrice: xmlVal(text, 'CurrentPrice'),
      bestOfferEnabled: xmlVal(text, 'BestOfferEnabled'),
      errorMessage: xmlVal(text, 'LongMessage') || xmlVal(text, 'ShortMessage'),
    });
  } catch (error: any) {
    console.error('[ebayTaxonomy] getListingDebugInfo error:', error.message);
    res.status(500).json({ error: 'Internal server error' });
  }
}

/**
 * GET /api/ebay/inventory-debug/:itemId -- diagnostic-only, organizer-scoped.
 *
 * Added 2026-09-23 (Gap 2, eBay sync-issues investigation) -- to verify, not infer from
 * log silence, whether the "Amplifier Type" aspect is genuinely already set on eBay's live
 * inventory item for item cmnzf780a0009pf19ru5qppqn. ebayPriceRevisionService.ts's
 * injectMissingCategoryAspects() has a hasKey() guard that silently skips re-injecting an
 * aspect already present in a fetched inventory item, which is CONSISTENT with the
 * offer-level "Amplifier Type is missing" error persisting even after a prior successful
 * injection cycle -- but that's an inference from log silence, not confirmed ground truth.
 * This dumps the LIVE inventory item's actual current product.aspects so the real next
 * step (if any) is evidence-based.
 *
 * Covers the Inventory-API/offer-based item shape (item.ebayOfferId) -- the sibling
 * getListingDebugInfo handler above covers the legacy Trading-API shape (item.ebayListingId)
 * instead; these two item populations don't overlap. Read-only -- no eBay or DB mutation.
 * Item must belong to the calling organizer, same OR-scoping pattern getListingDebugInfo
 * uses. SKU is read off the live offer GET response, never guessed from a naming
 * convention -- mirrors exactly how ebayPriceRevisionService.ts's reviseEbayOfferPrice
 * resolves sku today.
 */
export async function getInventoryItemDebugInfo(req: AuthRequest, res: Response): Promise<void> {
  try {
    if (!req.user) {
      res.status(401).json({ error: 'Unauthorized' });
      return;
    }
    const organizerId = (req.user as any).organizer?.id;
    if (!organizerId) {
      res.status(403).json({ error: 'Organizer profile not found' });
      return;
    }

    const { itemId } = req.params;
    const item = await prisma.item.findFirst({
      where: { id: itemId, OR: [{ organizerId }, { sale: { organizerId } }] },
      select: { id: true, ebayOfferId: true },
    });
    if (!item || !item.ebayOfferId) {
      res.status(404).json({ error: 'Item not found, not yours, or has no eBay offer' });
      return;
    }

    const token = await getOrganizerEbayToken(organizerId);
    if (!token) {
      res.status(401).json({ error: 'eBay connection not authorized' });
      return;
    }

    const offerRes = await ebayFetch(`/sell/inventory/v1/offer/${encodeURIComponent(item.ebayOfferId)}`, token, { method: 'GET' });
    if (!offerRes.ok) {
      const bodyText = await offerRes.text().catch(() => '');
      res.status(502).json({ error: 'eBay offer GET failed', status: offerRes.status, detail: bodyText.slice(0, 500) });
      return;
    }
    const offerBody = (await offerRes.json()) as any;
    const sku = typeof offerBody.sku === 'string' ? offerBody.sku : null;
    if (!sku) {
      res.status(502).json({ error: 'eBay offer has no sku field', offerBody });
      return;
    }

    const invRes = await ebayFetch(`/sell/inventory/v1/inventory_item/${encodeURIComponent(sku)}`, token, { method: 'GET' });
    if (!invRes.ok) {
      const bodyText = await invRes.text().catch(() => '');
      res.status(502).json({ error: 'eBay inventory item GET failed', status: invRes.status, detail: bodyText.slice(0, 500) });
      return;
    }
    const invBody = (await invRes.json()) as any;

    res.json({
      sku,
      offerCategoryId: offerBody.categoryId ?? null,
      aspects: invBody?.product?.aspects ?? null,
      productTitle: invBody?.product?.title ?? null,
      condition: invBody?.condition ?? null,
      availability: invBody?.availability ?? null,
    });
  } catch (error: any) {
    console.error('[ebayTaxonomy] getInventoryItemDebugInfo error:', error.message);
    res.status(500).json({ error: 'Internal server error' });
  }
}

export async function getAspectsHandler(req: AuthRequest, res: Response): Promise<void> {
  try {
    if (!req.user) {
      res.status(401).json({ error: 'Unauthorized' });
      return;
    }

    const organizerId = (req.user as any).organizer?.id;
    if (!organizerId) {
      res.status(403).json({ error: 'Organizer profile not found' });
      return;
    }

    const { categoryId } = req.params;
    if (!categoryId) {
      res.status(400).json({ error: 'categoryId required' });
      return;
    }

    // Get eBay app-level access token. Fix (2026-09-22, evidence-backed --
    // Railway logs showed this endpoint 403ing on every call): eBay's Taxonomy
    // API get_item_aspects_for_category is a public catalog endpoint requiring
    // only the base app-level client-credentials token (same one suggestCategories
    // already uses successfully below) -- NOT the organizer's own user OAuth
    // token, which doesn't carry the scope this call needs. Swapping the token
    // source is the fix; nothing else about this handler changes.
    const token = await getEbayAccessToken();
    if (!token) {
      res.status(503).json({ error: 'eBay app token unavailable' });
      return;
    }

    // Fetch aspects
    const aspects = await getAspectsForCategory(token, categoryId);
    if (!aspects) {
      res.status(500).json({ error: 'Failed to fetch aspects from eBay' });
      return;
    }

    res.json(aspects);
  } catch (error: any) {
    console.error('[ebayTaxonomy] getAspectsHandler error:', error.message);
    res.status(500).json({ error: 'Internal server error' });
  }
}

// ── Handler 2: GET /api/ebay/catalog/search ──────────────────────────────────

export async function catalogSearchHandler(req: AuthRequest, res: Response): Promise<void> {
  try {
    if (!req.user) {
      res.status(401).json({ error: 'Unauthorized' });
      return;
    }

    const organizerId = (req.user as any).organizer?.id;
    if (!organizerId) {
      res.status(403).json({ error: 'Organizer profile not found' });
      return;
    }

    // Extract query params
    const { upc, isbn, ean, mpn, brand } = req.query;
    const params: any = {};

    if (upc) params.upc = upc;
    if (isbn) params.isbn = isbn;
    if (ean) params.ean = ean;
    if (mpn) params.mpn = mpn;
    if (brand) params.brand = brand;

    // Validate at least one param
    if (Object.keys(params).length === 0) {
      res.status(400).json({ error: 'At least one search parameter required (upc, isbn, ean, mpn, or brand)' });
      return;
    }

    // Get eBay access token
    const token = await getOrganizerEbayToken(organizerId);
    if (!token) {
      res.status(401).json({ error: 'eBay connection not authorized' });
      return;
    }

    // Search catalog
    const results = await searchCatalogProduct(token, params);

    res.json({ results });
  } catch (error: any) {
    console.error('[ebayTaxonomy] catalogSearchHandler error:', error.message);
    res.status(500).json({ error: 'Internal server error' });
  }
}

// ── Handler 3: POST /api/ebay/suggest/identifiers ───────────────────────────

interface SuggestIdentifiersBody {
  itemId: string;
}

export async function suggestIdentifiersHandler(req: AuthRequest, res: Response): Promise<void> {
  try {
    if (!req.user) {
      res.status(401).json({ error: 'Unauthorized' });
      return;
    }

    const { itemId } = req.body as SuggestIdentifiersBody;
    if (!itemId) {
      res.status(400).json({ error: 'itemId required' });
      return;
    }

    // Load item from DB
    const item = await prisma.item.findUnique({
      where: { id: itemId },
      include: { sale: { include: { organizer: true } } },
    });

    if (!item) {
      res.status(404).json({ error: 'Item not found' });
      return;
    }

    // Verify organizer ownership
    const organizerId = (req.user as any).organizer?.id;
    if (!organizerId || item.sale?.organizerId !== organizerId) {
      res.status(403).json({ error: 'Not authorized to suggest identifiers for this item' });
      return;
    }

    // Get suggestions from Haiku
    const suggestions = await suggestIdentifiersFromItem({
      id: item.id,
      title: item.title,
      description: item.description,
      tags: item.tags,
      brand: item.brand,
      mpn: item.mpn,
      upc: item.upc,
      isbn: item.isbn,
      ean: item.ean,
    });

    res.json(suggestions);
  } catch (error: any) {
    console.error('[ebayTaxonomy] suggestIdentifiersHandler error:', error.message);
    res.status(500).json({ error: 'Internal server error' });
  }
}

// ── Handler 4: GET /api/ebay/taxonomy/suggest ────────────────────────────────

export async function suggestCategoriesHandler(req: AuthRequest, res: Response): Promise<void> {
  try {
    if (!req.user) {
      res.status(401).json({ error: 'Unauthorized' });
      return;
    }

    const { q } = req.query;
    if (!q || typeof q !== 'string') {
      res.status(400).json({ error: 'q (query) parameter required' });
      return;
    }

    // Taxonomy suggest only needs an app token (public catalog API — no user OAuth required)
    const token = await getEbayAccessToken();
    if (!token) {
      console.warn('[ebayTaxonomy] eBay app token unavailable — returning empty suggestions');
      res.json({ suggestions: [] });
      return;
    }

    // Fetch category suggestions
    const suggestions = await suggestCategories(token, q);

    res.json({ suggestions });
  } catch (error: any) {
    console.error('[ebayTaxonomy] suggestCategoriesHandler error:', error.message);
    res.status(500).json({ error: 'Internal server error' });
  }
}
