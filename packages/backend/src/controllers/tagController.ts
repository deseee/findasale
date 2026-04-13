import { Request, Response } from 'express';
import { prisma } from '../index';
/**
 * Curated tag vocabulary — mirrors packages/shared/src/constants/tagVocabulary.ts
 * Duplicated here because backend tsconfig rootDir=./src blocks cross-package source imports.
 * If updating tags, update both files. Quarterly review owned by Patrick.
 */
const CURATED_TAGS = [
  'mid-century-modern', 'art-deco', 'victorian', 'craftsman', 'industrial',
  'farmhouse', 'bohemian', 'danish-modern', 'scandinavian', 'atomic-age',
  'hollywood-regency', 'arts-and-crafts', 'colonial', 'transitional', 'contemporary',
  'walnut', 'oak', 'teak', 'brass', 'cast-iron',
  'wicker', 'leather', 'ceramic', 'glass', 'chrome',
  'hand-painted', 'signed', 'original', 'limited-edition', 'first-edition',
  'handmade', 'restored', 'vintage-1950s', 'vintage-1960s', 'vintage-1970s',
  'collectible', 'antique', 'sterling-silver', 'costume-jewelry', 'fine-art',
  'folk-art', 'architectural-salvage', 'garden-decor', 'holiday-decor', 'musical',
] as const;

/**
 * Tag Controller — Sprint 3
 *
 * Powers tag-based SEO landing pages (/tags/[slug]).
 * Two endpoints:
 *   GET /api/tags/popular — top tags by item count (for sitemap + getStaticPaths)
 *   GET /api/tags/:slug/items — paginated published items for a specific tag
 */

/**
 * GET /api/tags/popular
 *
 * Returns curated tags with their published item counts.
 * Used by next-sitemap and getStaticPaths for ISR.
 * Only returns tags that have at least 1 published item.
 */
export const getPopularTags = async (_req: Request, res: Response) => {
  try {
    // Query all published items that have tags
    const items = await prisma.item.findMany({
      where: {
        draftStatus: 'PUBLISHED',
        isActive: true,
        tags: { isEmpty: false },
        sale: { status: 'PUBLISHED' },
      },
      select: {
        tags: true,
      },
    });

    // Count occurrences of each curated tag
    const tagCounts = new Map<string, number>();
    for (const item of items) {
      for (const tag of item.tags) {
        const normalized = tag.toLowerCase().trim();
        // Only count curated tags (exclude custom free-form tags from SEO pages)
        if ((CURATED_TAGS as readonly string[]).includes(normalized)) {
          tagCounts.set(normalized, (tagCounts.get(normalized) || 0) + 1);
        }
      }
    }

    // Sort by count descending, format as array
    const tags = Array.from(tagCounts.entries())
      .map(([slug, count]) => ({ slug, count }))
      .sort((a, b) => b.count - a.count);

    res.json({ tags });
  } catch (error) {
    console.error('Error fetching popular tags:', error);
    res.status(500).json({ message: 'Server error fetching popular tags' });
  }
};

/**
 * GET /api/tags/:slug/items?page=1&limit=24
 *
 * Returns published items matching a specific tag, with sale summaries.
 * Powers the /tags/[slug] ISR page.
 */
export const getItemsByTag = async (req: Request, res: Response) => {
  try {
    const { slug } = req.params;
    const page = Math.max(1, parseInt(req.query.page as string) || 1);
    const limit = Math.min(48, Math.max(1, parseInt(req.query.limit as string) || 24));

    if (!slug) {
      return res.status(400).json({ message: 'Tag slug is required' });
    }

    const normalizedSlug = slug.toLowerCase().trim();

    // Fetch paginated items with this tag
    const [items, totalCount] = await Promise.all([
      prisma.item.findMany({
        where: {
          tags: { has: normalizedSlug },
          draftStatus: 'PUBLISHED',
          isActive: true,
          sale: { status: 'PUBLISHED' },
        },
        select: {
          id: true,
          title: true,
          price: true,
          category: true,
          condition: true,
          photoUrls: true,
          tags: true,
          createdAt: true,
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
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * limit,
        take: limit,
      }),
      prisma.item.count({
        where: {
          tags: { has: normalizedSlug },
          draftStatus: 'PUBLISHED',
          isActive: true,
          sale: { status: 'PUBLISHED' },
        },
      }),
    ]);

    // Extract unique sales for summary
    const saleMap = new Map<string, any>();
    for (const item of items) {
      if (!saleMap.has(item.sale.id)) {
        saleMap.set(item.sale.id, {
          id: item.sale.id,
          title: item.sale.title,
          city: item.sale.city,
          state: item.sale.state,
          startDate: item.sale.startDate,
          endDate: item.sale.endDate,
        });
      }
    }

    // Format items for response (add thumbnail with watermark)
    const formattedItems = items.map((item) => ({
      id: item.id,
      title: item.title,
      price: item.price,
      category: item.category,
      condition: item.condition,
      thumbnailUrl: item.photoUrls?.[0] || null,
      tags: item.tags,
      saleId: item.sale.id,
      saleTitle: item.sale.title,
      city: item.sale.city,
      state: item.sale.state,
      createdAt: item.createdAt,
    }));

    res.json({
      tag: normalizedSlug,
      itemCount: totalCount,
      items: formattedItems,
      sales: Array.from(saleMap.values()),
      pagination: {
        page,
        limit,
        totalPages: Math.ceil(totalCount / limit),
        hasMore: page * limit < totalCount,
      },
    });
  } catch (error) {
    console.error('Error fetching items by tag:', error);
    res.status(500).json({ message: 'Server error fetching items by tag' });
  }
};
