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
      const frontendUrl = process.env.FRONTEND_URL ?? 'https://finda.sale';
      const proxySecret = process.env.EBAY_PROXY_SECRET;
      const response = await fetch(`${frontendUrl}/api/proxy/ebay?path=/identity/v1/oauth2/token`, {
        method: 'POST',
        headers: {
          Authorization: `Basic ${credentials}`,
          'Content-Type': 'application/x-www-form-urlencoded',
          ...(proxySecret ? { 'X-Proxy-Secret': proxySecret } : {}),
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

    // Get eBay access token
    const token = await getOrganizerEbayToken(organizerId);
    if (!token) {
      res.status(401).json({ error: 'eBay connection not authorized' });
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
      res.status(503).json({ error: 'eBay app token unavailable' });
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
