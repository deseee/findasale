import { Router, Request, Response } from 'express';
import { Prisma } from '@prisma/client';
import { prisma } from '../lib/prisma';
import { getVisionLabels } from '../services/cloudAIService';
import { upload } from '../controllers/uploadController';
import { searchItems } from '../services/itemSearchService';

const router = Router();

/**
 * GET /api/search?q=&type=all|sales|items&page=&limit=&priceMin=&priceMax=&condition=&category=&saleStatus=&sortBy=
 * Phase 29: Full-text search across published sales and available items with advanced filters.
 */
router.get('/', async (req: Request, res: Response) => {
  try {
    const q = ((req.query.q as string) || '').trim();
    const type = (req.query.type as string) || 'all';
    const page = Math.max(1, parseInt(req.query.page as string) || 1);
    const limit = Math.min(20, Math.max(1, parseInt(req.query.limit as string) || 10));
    const skip = (page - 1) * limit;

    // Parse filter params
    const priceMin = req.query.priceMin ? parseInt(req.query.priceMin as string) : null;
    const priceMax = req.query.priceMax ? parseInt(req.query.priceMax as string) : null;
    const condition = (req.query.condition as string)?.trim() || null;
    const category = (req.query.category as string)?.trim() || null;
    const saleStatus = (req.query.saleStatus as string) || 'all';
    const sortBy = (req.query.sortBy as string) || 'recent';

    if (!q || q.length < 2) {
      return res.status(400).json({ message: 'q must be at least 2 characters' });
    }

    const textWhere = {
      OR: [
        { title: { contains: q, mode: 'insensitive' as const } },
        { description: { contains: q, mode: 'insensitive' as const } },
      ],
    };

    // Build sale status filter
    const now = new Date();
    let saleStatusWhere = {};
    if (saleStatus === 'active') {
      saleStatusWhere = {
        startDate: { lte: now },
        endDate: { gte: now },
      };
    } else if (saleStatus === 'upcoming') {
      saleStatusWhere = { startDate: { gt: now } };
    }

    // Build item filters
    const itemWhere: any = {
      OR: [
        { title: { contains: q, mode: 'insensitive' } },
        { description: { contains: q, mode: 'insensitive' } },
      ],
      status: 'AVAILABLE',
      sale: { status: 'PUBLISHED', ...saleStatusWhere },
    };

    // Apply price filters
    if (priceMin !== null || priceMax !== null) {
      itemWhere.price = {};
      if (priceMin !== null) itemWhere.price.gte = priceMin / 100;
      if (priceMax !== null) itemWhere.price.lte = priceMax / 100;
    }

    // Apply condition filter
    if (condition) {
      itemWhere.condition = { equals: condition, mode: 'insensitive' as const };
    }

    // Apply category filter
    if (category) {
      itemWhere.category = { equals: category, mode: 'insensitive' as const };
    }

    // Determine sort order
    let itemOrderBy: any = { createdAt: 'desc' };
    if (sortBy === 'price_asc') {
      itemOrderBy = { price: 'asc' };
    } else if (sortBy === 'price_desc') {
      itemOrderBy = { price: 'desc' };
    } else if (sortBy === 'ending_soon') {
      itemOrderBy = { 'sale.endDate': 'asc' };
    }

    const [salesResult, itemsResult, itemSearchResult] = await Promise.all([
      type !== 'items'
        ? prisma.sale.findMany({
            where: { ...textWhere, status: 'PUBLISHED' },
            select: {
              id: true,
              title: true,
              description: true,
              city: true,
              state: true,
              startDate: true,
              endDate: true,
              photoUrls: true,
              isAuctionSale: true,
              organizer: { select: { id: true, businessName: true, reputationTier: true } },
            },
            take: limit,
            skip: type === 'sales' ? skip : 0,
            orderBy: { startDate: 'asc' },
          })
        : Promise.resolve([]),
      type !== 'sales'
        ? prisma.item.findMany({
            where: itemWhere,
            select: {
              id: true,
              title: true,
              description: true,
              price: true,
              photoUrls: true,
              category: true,
              condition: true,
              status: true,
              sale: {
                select: {
                  id: true,
                  title: true,
                  city: true,
                  state: true,
                  status: true,
                  startDate: true,
                  endDate: true,
                },
              },
            },
            take: limit,
            skip: type === 'items' ? skip : 0,
            orderBy: itemOrderBy,
          })
        : Promise.resolve([]),
      // Search items by FTS to find sale IDs that have matching items
      type !== 'items' && q
        ? searchItems({ q, limit: 100, offset: 0 })
        : Promise.resolve(null),
    ]);

    // If searching sales, merge in sale IDs from items that match the query
    let finalSalesResult = salesResult;
    if (type !== 'items' && itemSearchResult && q.length >= 2) {
      // Get unique sale IDs from items
      const saleIdsFromItems = new Set(itemSearchResult.data.map((item) => item.saleId));
      // Get those sales
      const salesFromItems = await prisma.sale.findMany({
        where: {
          id: { in: Array.from(saleIdsFromItems) },
          status: 'PUBLISHED',
        },
        select: {
          id: true,
          title: true,
          description: true,
          city: true,
          state: true,
          startDate: true,
          endDate: true,
          photoUrls: true,
          isAuctionSale: true,
          organizer: { select: { id: true, businessName: true, reputationTier: true } },
        },
      });
      // Merge: deduplicate by ID, keep the original sale results and add any new ones from items
      const saleIdSet = new Set(finalSalesResult.map((s: any) => s.id));
      const newSales = salesFromItems.filter((s: any) => !saleIdSet.has(s.id));
      finalSalesResult = [...finalSalesResult, ...newSales].slice(0, limit);
    }

    res.json({
      query: q,
      sales: finalSalesResult,
      items: itemsResult.map((item: any) => ({
        ...item,
        price: item.price != null ? Number(item.price) : null,
      })),
    });
  } catch (err) {
    console.error('GET /api/search error:', err);
    res.status(500).json({ message: 'Server error' });
  }
});

/**
 * GET /api/search/categories/:category?page=&limit=
 * Phase 29: Browse available items by category across all published sales.
 */
router.get('/categories/:category', async (req: Request, res: Response) => {
  try {
    const { category } = req.params;
    const page = Math.max(1, parseInt(req.query.page as string) || 1);
    const limit = Math.min(30, Math.max(1, parseInt(req.query.limit as string) || 20));
    const skip = (page - 1) * limit;

    const where = {
      category: { equals: category, mode: 'insensitive' as const },
      status: 'AVAILABLE',
      sale: { status: 'PUBLISHED' },
    };

    const [items, total] = await Promise.all([
      prisma.item.findMany({
        where,
        select: {
          id: true,
          title: true,
          description: true,
          price: true,
          photoUrls: true,
          category: true,
          condition: true,
          sale: {
            select: {
              id: true,
              title: true,
              city: true,
              state: true,
              startDate: true,
              endDate: true,
            },
          },
        },
        take: limit,
        skip,
        orderBy: { createdAt: 'desc' },
      }),
      prisma.item.count({ where }),
    ]);

    res.json({
      category,
      items: items.map((item: any) => ({
        ...item,
        price: item.price != null ? Number(item.price) : null,
      })),
      pagination: {
        page,
        limit,
        total,
        pages: Math.ceil(total / limit),
      },
    });
  } catch (err) {
    console.error('GET /api/search/categories error:', err);
    res.status(500).json({ message: 'Server error' });
  }
});

/**
 * GET /api/search/random?lat=&lng=&radiusMiles=&maxPrice=&category=&limit=12
 * Feature #10: Serendipity Search — returns random available items from active sales.
 * All query params are optional. If lat/lng/radiusMiles provided, filters by proximity.
 * Uses ORDER BY RANDOM() for genuine serendipity on every request.
 */
router.get('/random', async (req: Request, res: Response) => {
  try {
    const limit = Math.min(24, Math.max(1, parseInt(req.query.limit as string) || 12));
    const maxPrice = req.query.maxPrice ? parseFloat(req.query.maxPrice as string) : null;
    const category = (req.query.category as string)?.trim() || null;
    const lat = req.query.lat ? parseFloat(req.query.lat as string) : null;
    const lng = req.query.lng ? parseFloat(req.query.lng as string) : null;
    const radiusMiles = req.query.radiusMiles ? parseFloat(req.query.radiusMiles as string) : null;

    type RawItem = {
      id: string;
      title: string;
      description: string | null;
      price: number | null;
      photo_urls: string[];
      category: string | null;
      condition: string | null;
      sale_id: string;
      sale_title: string;
      sale_city: string;
      sale_state: string;
      sale_start_date: Date;
      sale_end_date: Date;
    };

    // Build optional SQL fragments using Prisma.sql for safe parameterization
    const priceCondition = maxPrice !== null && !isNaN(maxPrice)
      ? Prisma.sql`AND i.price <= ${maxPrice}`
      : Prisma.empty;

    const categoryCondition = category
      ? Prisma.sql`AND LOWER(i.category) = LOWER(${category})`
      : Prisma.empty;

    // If location filter requested, add haversine distance condition
    const useLocation = lat !== null && lng !== null && radiusMiles !== null
      && !isNaN(lat!) && !isNaN(lng!) && !isNaN(radiusMiles!);

    const radiusKm = useLocation ? radiusMiles! * 1.60934 : 0;

    const locationCondition = useLocation
      ? Prisma.sql`AND (
          6371 * acos(
            LEAST(1.0, cos(radians(${lat})) * cos(radians(s.lat)) *
            cos(radians(s.lng) - radians(${lng})) +
            sin(radians(${lat})) * sin(radians(s.lat)))
          )
        ) <= ${radiusKm}`
      : Prisma.empty;

    const rows = await prisma.$queryRaw<RawItem[]>`
      SELECT
        i.id,
        i.title,
        i.description,
        i.price,
        i."photoUrls" AS photo_urls,
        i.category,
        i.condition,
        s.id AS sale_id,
        s.title AS sale_title,
        s.city AS sale_city,
        s.state AS sale_state,
        s."startDate" AS sale_start_date,
        s."endDate" AS sale_end_date
      FROM "Item" i
      JOIN "Sale" s ON i."saleId" = s.id
      WHERE
        i.status = 'AVAILABLE'
        AND s.status = 'PUBLISHED'
        AND s."endDate" >= NOW()
        ${priceCondition}
        ${categoryCondition}
        ${locationCondition}
      ORDER BY RANDOM()
      LIMIT ${limit}
    `;

    const items = rows.map((row) => ({
      id: row.id,
      title: row.title,
      description: row.description,
      price: row.price != null ? Number(row.price) : null,
      photoUrls: row.photo_urls,
      category: row.category,
      condition: row.condition,
      sale: {
        id: row.sale_id,
        title: row.sale_title,
        city: row.sale_city,
        state: row.sale_state,
        startDate: row.sale_start_date,
        endDate: row.sale_end_date,
      },
    }));

    return res.json({ items, count: items.length });
  } catch (err) {
    console.error('GET /api/search/random error:', err);
    res.status(500).json({ message: 'Server error' });
  }
});

/**
 * POST /api/search/visual
 * CD2 Phase 3: Visual search — upload photo, extract Vision API labels, search items.
 * Accepts: multipart form data with image file
 * Returns: { detectedLabels: string[], results: Item[] }
 */
router.post('/visual', upload.single('photo'), async (req: Request, res: Response) => { // public, no auth needed — visual search is open to guests
  try {
    const file = req.file as Express.Multer.File | undefined;
    if (!file) {
      return res.status(400).json({ error: 'No image provided' });
    }

    // Call Google Vision API to extract labels
    let labels: string[] = [];
    try {
      const allLabels = await getVisionLabels(file.buffer.toString('base64'));
      // Take top 5 labels with high confidence
      labels = allLabels.slice(0, 5);
    } catch (err) {
      console.error('Vision API error:', err);
      return res.status(500).json({ error: 'Failed to analyze image' });
    }

    if (labels.length === 0) {
      return res.json({ detectedLabels: [], results: [] });
    }

    // Build search query: OR logic across all detected labels
    const searchQuery = labels.join(' ');

    // Query items matching any of the detected labels
    const items = await prisma.item.findMany({
      where: {
        OR: [
          { title: { contains: labels[0], mode: 'insensitive' } },
          ...(labels.length > 1 ? labels.slice(1).map(label => ({ title: { contains: label, mode: 'insensitive' as const } })) : []),
          { description: { contains: labels[0], mode: 'insensitive' } },
          ...(labels.length > 1 ? labels.slice(1).map(label => ({ description: { contains: label, mode: 'insensitive' as const } })) : []),
        ],
        status: 'AVAILABLE',
        sale: { status: 'PUBLISHED' },
      },
      select: {
        id: true,
        title: true,
        description: true,
        price: true,
        photoUrls: true,
        category: true,
        condition: true,
        status: true,
        sale: {
          select: {
            id: true,
            title: true,
            city: true,
            state: true,
            status: true,
          },
        },
      },
      take: 20,
      orderBy: { createdAt: 'desc' },
    });

    res.json({
      detectedLabels: labels,
      results: items.map((item: any) => ({
        ...item,
        price: item.price != null ? Number(item.price) : null,
      })),
    });
  } catch (err) {
    console.error('POST /api/search/visual error:', err);
    res.status(500).json({ error: 'Visual search failed' });
  }
});

export default router;
