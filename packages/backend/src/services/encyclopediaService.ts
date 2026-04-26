/**
 * encyclopediaService.ts — ADR-069 Phase 1
 *
 * Service for creating and managing EncyclopediaEntry stubs from Haiku analysis.
 * Supports auto-generation and deduplication by slug.
 */

import { prisma } from '../lib/prisma';

export interface NewEncyclopediaStub {
  slug: string;
  title: string;
  description: string;
  category: string;
  tags: string[];
  estimatedPriceLow: number; // in cents
  estimatedPriceHigh: number; // in cents
}

/**
 * Create an Encyclopedia stub if one with the same slug doesn't already exist.
 *
 * Creates both:
 * 1. EncyclopediaEntry with status='AUTO_GENERATED'
 * 2. PriceBenchmark with dataSource='haiku_inferred'
 *
 * Fire-and-forget: does not throw, logs errors internally.
 */
export async function createEncyclopediaStubIfNew(
  stub: NewEncyclopediaStub,
  triggerItemId?: string
): Promise<void> {
  try {
    // Check if slug already exists
    const existing = await prisma.encyclopediaEntry.findUnique({
      where: { slug: stub.slug },
    });

    if (existing) {
      console.log(`[encyclopediaService] Entry slug "${stub.slug}" already exists, skipping creation`);
      return;
    }

    // Create entry + benchmark in transaction
    const entry = await prisma.encyclopediaEntry.create({
      data: {
        slug: stub.slug,
        title: stub.title,
        subtitle: `Auto-generated from item analysis`,
        content: stub.description,
        category: stub.category,
        tags: stub.tags,
        status: 'AUTO_GENERATED',
        triggerItemId: triggerItemId || null,
        // Auto-generated entries need an author; use system user (or admin ID if defined)
        authorId: process.env.SYSTEM_USER_ID || 'system',
      },
    });

    // Create paired PriceBenchmark
    const benchmark = await prisma.priceBenchmark.create({
      data: {
        entryId: entry.id,
        condition: 'USED', // Default condition for auto-generated benchmarks
        region: 'National', // Default region
        priceRangeLow: stub.estimatedPriceLow,
        priceRangeHigh: stub.estimatedPriceHigh,
        dataSource: 'haiku_inferred',
      },
    });

    console.log(
      `[encyclopediaService] Created EncyclopediaEntry "${stub.slug}" (id: ${entry.id}) + PriceBenchmark (id: ${benchmark.id})`
    );
  } catch (error) {
    console.error('[encyclopediaService] Failed to create Encyclopedia stub:', error);
    // No throw: this is async, fire-and-forget
  }
}

/**
 * Bulk create multiple Encyclopedia stubs (for seed data or backfill).
 * Skips entries that already exist by slug.
 */
export async function createEncyclopediaStubsIfNew(stubs: NewEncyclopediaStub[]): Promise<void> {
  for (const stub of stubs) {
    await createEncyclopediaStubIfNew(stub);
  }
}

// ── Existing Encyclopedia Service Functions (used by encyclopediaController) ──

/**
 * List Encyclopedia entries with pagination and filtering.
 */
export async function listEntries(
  params: { page?: number; limit?: number; category?: string; search?: string; sort?: 'recent' | 'popular' | 'trending' },
  _userId?: string
): Promise<{ entries: any[]; total: number }> {
  const { page = 1, limit = 20, category, search, sort = 'recent' } = params;
  const skip = (page - 1) * limit;

  const where: any = { status: 'PUBLISHED' };
  if (category && category !== 'All') {
    where.category = { contains: category, mode: 'insensitive' };
  }
  if (search) {
    where.OR = [
      { title: { contains: search, mode: 'insensitive' } },
      { content: { contains: search, mode: 'insensitive' } },
    ];
  }

  const orderBy =
    sort === 'popular' ? { helpfulVotes: { _count: 'desc' as const } } :
    sort === 'trending' ? { updatedAt: 'desc' as const } :
    { createdAt: 'desc' as const };

  const [entries, total] = await Promise.all([
    prisma.encyclopediaEntry.findMany({
      where,
      skip,
      take: limit,
      include: { author: { select: { name: true } } },
      orderBy,
    }),
    prisma.encyclopediaEntry.count({ where }),
  ]);

  return { entries, total };
}

/**
 * Get a single Encyclopedia entry by slug.
 */
export async function getEntryBySlug(slug: string, userId?: string): Promise<any> {
  const entry = await prisma.encyclopediaEntry.findUnique({
    where: { slug },
    include: {
      author: { select: { name: true, id: true } },
      benchmarks: true,
      votes: userId ? { where: { userId } } : false,
    },
  });

  if (!entry) {
    return null; // Controller checks for null and returns 404
  }

  return entry;
}

/**
 * Create a new Encyclopedia entry (used by authenticated users).
 */
export async function createEntry(
  authorId: string,
  data: { slug: string; title: string; content: string; category: string; tags: string[] }
): Promise<any> {
  const existing = await prisma.encyclopediaEntry.findUnique({
    where: { slug: data.slug },
  });

  if (existing) {
    throw new Error(`Slug "${data.slug}" already exists`);
  }

  const entry = await prisma.encyclopediaEntry.create({
    data: {
      ...data,
      status: 'PENDING_REVIEW',
      authorId,
    },
  });

  return entry;
}

/**
 * Vote on (like/dislike) an Encyclopedia entry.
 */
export async function voteOnEntry(
  entryId: string,
  userId: string,
  helpful: boolean
): Promise<any> {
  const vote = await prisma.encyclopediaVote.upsert({
    where: {
      entryId_userId: { entryId, userId },
    },
    create: { entryId, userId, helpful },
    update: { helpful },
  });

  // Update helpfulCount on entry
  const entry = await prisma.encyclopediaEntry.findUnique({
    where: { id: entryId },
  });

  if (entry) {
    const newHelpfulCount = await prisma.encyclopediaVote.count({
      where: { entryId, helpful: true },
    });

    await prisma.encyclopediaEntry.update({
      where: { id: entryId },
      data: { helpfulCount: newHelpfulCount },
    });
  }

  return vote;
}

/**
 * Get a single Encyclopedia entry by ID.
 */
export async function getEntry(entryId: string): Promise<any> {
  const entry = await prisma.encyclopediaEntry.findUnique({
    where: { id: entryId },
    include: { author: { select: { name: true } } },
  });

  if (!entry) {
    throw new Error(`Encyclopedia entry not found: ${entryId}`);
  }

  return entry;
}

/**
 * Update an Encyclopedia entry (authorization should be checked by controller).
 */
export async function updateEntry(
  entryId: string,
  data: Partial<{ title: string; content: string; category: string; tags: string[] }>
): Promise<any> {
  const entry = await prisma.encyclopediaEntry.update({
    where: { id: entryId },
    data,
  });

  return entry;
}

/**
 * Get revision history for an Encyclopedia entry.
 */
export async function getEntryRevisions(entryId: string, limit: number = 20): Promise<any[]> {
  const revisions = await prisma.encyclopediaRevision.findMany({
    where: { entryId },
    include: { author: { select: { name: true } } },
    orderBy: { createdAt: 'desc' },
    take: limit,
  });

  return revisions;
}

/**
 * Match Encyclopedia entry during item editing.
 * Search strategy (in order of priority):
 * 1. Exact slug match from title → toSlug(title)
 * 2. Tag overlap: entries where tags array overlaps with query tags
 * 3. Category match: entries in same category
 *
 * Returns the best matching PUBLISHED entry + its price benchmarks, or null.
 */
export async function matchEntry(
  title?: string,
  category?: string,
  tags?: string[]
): Promise<{ entry: any; benchmarks: any[] } | null> {
  if (!title && !category && (!tags || tags.length === 0)) {
    return null;
  }

  // Helper: slugify title
  const toSlug = (s: string) =>
    s
      .toLowerCase()
      .trim()
      .replace(/\s+/g, '-')
      .replace(/[^a-z0-9-]/g, '');

  // Strategy 1: Exact title slug match
  if (title) {
    const titleSlug = toSlug(title);
    const exactMatch = await prisma.encyclopediaEntry.findUnique({
      where: { slug: titleSlug },
      include: { benchmarks: true },
    });

    if (exactMatch && exactMatch.status === 'PUBLISHED') {
      return { entry: exactMatch, benchmarks: exactMatch.benchmarks };
    }
  }

  // Strategy 2: Tag overlap + category
  const whereCondition: any = { status: 'PUBLISHED' };
  if (category) {
    whereCondition.category = { contains: category, mode: 'insensitive' };
  }

  const entries = await prisma.encyclopediaEntry.findMany({
    where: whereCondition,
    include: { benchmarks: true },
    take: 10, // Limit results for performance
  });

  if (tags && tags.length > 0) {
    // Score by tag overlap
    const scored = entries
      .map(entry => {
        const entryTagSet = new Set((entry.tags || []).map((t: string) => t.toLowerCase()));
        const queryTagSet = new Set(tags.map(t => t.toLowerCase()));
        const overlap = Array.from(queryTagSet).filter(t => entryTagSet.has(t)).length;
        return { entry, overlap };
      })
      .filter(({ overlap }) => overlap > 0)
      .sort((a, b) => b.overlap - a.overlap);

    if (scored.length > 0) {
      const best = scored[0];
      return { entry: best.entry, benchmarks: best.entry.benchmarks };
    }
  }

  // Strategy 3: Category match only (if tags didn't match)
  if (category && entries.length > 0) {
    return { entry: entries[0], benchmarks: entries[0].benchmarks };
  }

  return null;
}
