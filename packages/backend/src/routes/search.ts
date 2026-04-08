import { Router, Request, Response } from 'express';
import { Prisma } from '@prisma/client';
import { z } from 'zod';
import { prisma } from '../lib/prisma';
import { getVisionLabels } from '../services/cloudAIService';
import { upload } from '../controllers/uploadController';
import { searchItems } from '../services/itemSearchService';
import { PUBLIC_ITEM_FILTER } from '../helpers/itemQueries'; // Phase 1B: Rapidfire Mode public item filtering

const router = Router();

// Search query validation schemas
const searchQuerySchema = z.object({
  q: z.string().min(2, 'Search query must be at least 2 characters'),
  type: z.enum(['all', 'sales', 'items']).optional().default('all'),
  page: z.coerce.number().int().positive().optional().default(1),
  limit: z.coerce.number().int().min(1).max(20).optional().default(10),
  priceMin: z.coerce.number().int().optional(),
  priceMax: z.coerce.number().int().optional(),
  condition: z.string().optional(),
  category: z.string().optional(),
  saleStatus: z.string().optional().default('all'),
  sortBy: z.string().optional().default('recent'),
});

const categoriesQuerySchema = z.object({
  page: z.coerce.number().int().positive().optional().default(1),
  limit: z.coerce.number().int().min(1).max(30).optional().default(20),
});

const randomQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(24).optional().default(12),
  maxPrice: z.coerce.number().positive().optional(),
  category: z.string().optional(),
  lat: z.coerce.number().optional(),
  lng: z.coerce.number().optional(),
  radiusMiles: z.coerce.number().positive().optional(),
});

/**
 * GET /api/search?q=&type=all|sales|items&page=&limit=&priceMin=&priceMax=&condition=&category=&saleStatus=&sortBy=
 * Phase 29: Full-text search across published sales and available items with advanced filters.
 */
router.get('/', async (req: Request, res: Response) => {
  try {
    const validatedQuery = searchQuerySchema.parse(req.query);
    const { q, type, page, limit, priceMin, priceMax, condition, category, saleStatus, sortBy } = validatedQuery;
    const skip = (page - 1) * limit;

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
      ...PUBLIC_ITEM_FILTER,
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

    const [salesResult, itemsResult, itemSearchResult, organizerSearchResult] = await Promise.all([
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
      // Search organizers by business name
      type !== 'items' && q
        ? prisma.organizer.findMany({
            where: {
              businessName: { contains: q, mode: 'insensitive' },
              user: { role: 'ORGANIZER' },
            },
            select: {
              id: true,
            },
            take: 100,
          })
        : Promise.resolve([]),
    ]);

    // If searching sales, merge in sales from items that match and from organizers that match
    let finalSalesResult = salesResult;
    if (type !== 'items' && q.length >= 2) {
      const saleIdsToFetch = new Set<string>();

      // Get sale IDs from items that match the query
      if (itemSearchResult) {
        itemSearchResult.data.forEach((item) => saleIdsToFetch.add(item.saleId));
      }

      // Get sale IDs from organizers whose names match the query
      if (organizerSearchResult && organizerSearchResult.length > 0) {
        const organizerIds = organizerSearchResult.map((org) => org.id);
        const salesByOrganizer = await prisma.sale.findMany({
          where: {
            organizerId: { in: organizerIds },
            status: 'PUBLISHED',
          },
          select: { id: true },
        });
        salesByOrganizer.forEach((sale) => saleIdsToFetch.add(sale.id));
      }

      // Fetch all matching sales (from items and organizers)
      if (saleIdsToFetch.size > 0) {
        const salesFromMatches = await prisma.sale.findMany({
          where: {
            id: { in: Array.from(saleIdsToFetch) },
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
        // Merge: deduplicate by ID, keep the original sale results and add any new ones
        const saleIdSet = new Set(finalSalesResult.map((s: any) => s.id));
        const newSales = salesFromMatches.filter((s: any) => !saleIdSet.has(s.id));
        finalSalesResult = [...finalSalesResult, ...newSales].slice(0, limit);
      }
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
    if (err instanceof z.ZodError) {
      return res.status(400).json({ message: 'Validation error', errors: err.errors });
    }
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
    const validatedQuery = categoriesQuerySchema.parse(req.query);
    const { page, limit } = validatedQuery;
    const skip = (page - 1) * limit;

    const where = {
      category: { equals: category, mode: 'insensitive' as const },
      status: 'AVAILABLE',
      sale: { status: 'PUBLISHED' },
      ...PUBLIC_ITEM_FILTER,
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
    if (err instanceof z.ZodError) {
      return res.status(400).json({ message: 'Validation error', errors: err.errors });
    }
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
    const validatedQuery = randomQuerySchema.parse(req.query);
    const { limit, maxPrice, category, lat, lng, radiusMiles } = validatedQuery;

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
    const priceCondition = maxPrice !== undefined && !isNaN(maxPrice)
      ? Prisma.sql`AND i.price <= ${maxPrice}`
      : Prisma.empty;

    const categoryCondition = category
      ? Prisma.sql`AND LOWER(i.category) = LOWER(${category})`
      : Prisma.empty;

    // If location filter requested, add haversine distance condition
    const useLocation = lat !== undefined && lng !== undefined && radiusMiles !== undefined;

    const radiusKm = useLocation ? (radiusMiles as number) * 1.60934 : 0;

    const locationCondition = useLocation
      ? Prisma.sql`AND (
          6371 * acos(
            LEAST(1.0, cos(radians(${lat as number})) * cos(radians(s.lat)) *
            cos(radians(s.lng) - radians(${lng as number})) +
            sin(radians(${lat as number})) * sin(radians(s.lat)))
          )
        ) <= ${radiusKm}`
      : Prisma.empty;

    // #105: SQL Injection hardening - already using Prisma.sql template with Prisma.raw conditions
    const rows = await prisma.$queryRaw<RawItem[]>(Prisma.sql`
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
        AND i."draftStatus" = 'PUBLISHED'
        ${priceCondition}
        ${categoryCondition}
        ${locationCondition}
      ORDER BY RANDOM()
      LIMIT ${limit}
    `);

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
    if (err instanceof z.ZodError) {
      return res.status(400).json({ message: 'Validation error', errors: err.errors });
    }
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
        ...PUBLIC_ITEM_FILTER,
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
