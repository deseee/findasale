import { prisma } from '../lib/prisma';
import { Prisma } from '@prisma/client';

/**
 * EncyclopediaService — CRUD + search operations for encyclopedia entries
 */

export interface CreateEntryInput {
  title: string;
  subtitle?: string;
  content: string;
  category: string;
  tags?: string[];
  references?: Array<{ title: string; url: string; source?: string }>;
}

export interface UpdateEntryInput {
  title?: string;
  subtitle?: string;
  content?: string;
  category?: string;
  tags?: string[];
  changeNote?: string;
}

export interface ListEntriesQuery {
  page?: number;
  limit?: number;
  category?: string;
  search?: string;
  sort?: 'recent' | 'popular' | 'trending';
}

/**
 * Create a new encyclopedia entry (PENDING_REVIEW status)
 */
export const createEntry = async (
  authorId: string,
  input: CreateEntryInput
): Promise<any> => {
  // Generate slug from title
  const slug = generateSlug(input.title);

  // Check if slug already exists
  const existing = await prisma.encyclopediaEntry.findUnique({
    where: { slug }
  });

  if (existing) {
    throw new Error('Entry with this slug already exists');
  }

  // Create entry with references
  const entry = await prisma.encyclopediaEntry.create({
    data: {
      slug,
      title: input.title,
      subtitle: input.subtitle,
      content: input.content,
      category: input.category,
      tags: input.tags || [],
      authorId,
      status: 'PENDING_REVIEW',
      references: {
        create: (input.references || []).map(ref => ({
          title: ref.title,
          url: ref.url,
          source: ref.source
        }))
      }
    },
    include: {
      author: {
        select: { id: true, name: true }
      },
      references: true
    }
  });

  return entry;
};

/**
 * Get entry by slug with full details (published only for non-authors)
 */
export const getEntryBySlug = async (
  slug: string,
  userId?: string
): Promise<any> => {
  const entry = await prisma.encyclopediaEntry.findUnique({
    where: { slug },
    include: {
      author: {
        select: { id: true, name: true }
      },
      benchmarks: true,
      references: true,
      revisions: {
        orderBy: { createdAt: 'desc' },
        select: {
          id: true,
          changeNote: true,
          createdAt: true,
          author: { select: { name: true } }
        }
      },
      votes: userId ? { where: { userId } } : false
    }
  });

  if (!entry) {
    return null;
  }

  // Check visibility: non-authors should only see PUBLISHED entries
  if (entry.status !== 'PUBLISHED' && entry.authorId !== userId) {
    return null;
  }

  // Increment view count
  await prisma.encyclopediaEntry.update({
    where: { slug },
    data: { viewCount: { increment: 1 } }
  });

  // Fetch related entries (3 random from same category, published only)
  const related = await prisma.encyclopediaEntry.findMany({
    where: {
      category: entry.category,
      id: { not: entry.id },
      status: 'PUBLISHED'
    },
    select: { slug: true, title: true, viewCount: true },
    take: 3,
    orderBy: { viewCount: 'desc' }
  });

  return {
    ...entry,
    userVote: entry.votes && entry.votes.length > 0 ? entry.votes[0].helpful : null,
    related
  };
};

/**
 * List encyclopedia entries with pagination and filtering
 */
export const listEntries = async (
  query: ListEntriesQuery,
  userId?: string
): Promise<{ entries: any[]; total: number; page: number; hasMore: boolean }> => {
  const page = query.page || 1;
  const limit = Math.min(query.limit || 20, 100);
  const skip = (page - 1) * limit;

  // Build where clause
  const where: Prisma.EncyclopediaEntryWhereInput = {
    status: 'PUBLISHED'
  };

  if (query.category) {
    where.category = query.category;
  }

  // Full-text search on title and tags
  if (query.search) {
    where.OR = [
      { title: { contains: query.search, mode: 'insensitive' } },
      { tags: { hasSome: [query.search] } }
    ];
  }

  // Order by sort parameter
  let orderBy: Prisma.EncyclopediaEntryOrderByWithRelationInput = { createdAt: 'desc' };
  if (query.sort === 'popular') {
    orderBy = { viewCount: 'desc' };
  } else if (query.sort === 'trending') {
    // Trending = recent + popular (views in last 7 days)
    // Simplified: just use viewCount for now
    orderBy = { viewCount: 'desc' };
  }

  const [entries, total] = await Promise.all([
    prisma.encyclopediaEntry.findMany({
      where,
      include: {
        author: { select: { name: true } },
        votes: userId ? { where: { userId } } : false
      },
      orderBy,
      skip,
      take: limit
    }),
    prisma.encyclopediaEntry.count({ where })
  ]);

  const mapped = entries.map(e => ({
    id: e.id,
    slug: e.slug,
    title: e.title,
    subtitle: e.subtitle,
    category: e.category,
    authorName: e.author.name,
    status: e.status,
    viewCount: e.viewCount,
    helpfulCount: e.helpfulCount,
    excerpt: e.content.substring(0, 200),
    isFeatured: e.isFeatured,
    createdAt: e.createdAt,
    updatedAt: e.updatedAt,
    userVote: e.votes && e.votes.length > 0 ? e.votes[0].helpful : null
  }));

  return {
    entries: mapped,
    total,
    page,
    hasMore: skip + limit < total
  };
};

/**
 * Vote on entry (helpful/not helpful)
 */
export const voteOnEntry = async (
  entryId: string,
  userId: string,
  helpful: boolean
): Promise<{ helpfulCount: number; userVote: boolean }> => {
  // Verify entry exists
  const entry = await prisma.encyclopediaEntry.findUnique({
    where: { id: entryId }
  });

  if (!entry) {
    throw new Error('Entry not found');
  }

  // Upsert vote
  const vote = await prisma.encyclopediaVote.upsert({
    where: { entryId_userId: { entryId, userId } },
    update: { helpful },
    create: { entryId, userId, helpful }
  });

  // Recalculate helpful count
  const helpfulCount = await prisma.encyclopediaVote.count({
    where: { entryId, helpful: true }
  });

  // Update entry
  await prisma.encyclopediaEntry.update({
    where: { id: entryId },
    data: { helpfulCount }
  });

  return {
    helpfulCount,
    userVote: helpful
  };
};

/**
 * Update entry (owner or admin only) — creates revision
 */
export const updateEntry = async (
  entryId: string,
  userId: string,
  userRole: string,
  input: UpdateEntryInput
): Promise<any> => {
  // Check authorization
  const entry = await prisma.encyclopediaEntry.findUnique({
    where: { id: entryId }
  });

  if (!entry) {
    throw new Error('Entry not found');
  }

  if (entry.authorId !== userId && userRole !== 'ADMIN') {
    throw new Error('Unauthorized');
  }

  // Create revision before update
  const revision = await prisma.encyclopediaRevision.create({
    data: {
      entryId,
      title: input.title || entry.title,
      content: input.content || entry.content,
      category: input.category || entry.category,
      tags: input.tags || entry.tags,
      authorId: userId,
      changeNote: input.changeNote
    }
  });

  // Update entry
  const updated = await prisma.encyclopediaEntry.update({
    where: { id: entryId },
    data: {
      title: input.title,
      subtitle: input.subtitle,
      content: input.content,
      category: input.category,
      tags: input.tags,
      updatedAt: new Date()
    },
    include: {
      author: { select: { id: true, name: true } },
      revisions: { orderBy: { createdAt: 'desc' }, take: 5 }
    }
  });

  return {
    ...updated,
    revisionId: revision.id
  };
};

/**
 * Get entry revisions
 */
export const getEntryRevisions = async (entryId: string): Promise<any> => {
  const revisions = await prisma.encyclopediaRevision.findMany({
    where: { entryId },
    include: {
      author: { select: { name: true } }
    },
    orderBy: { createdAt: 'desc' }
  });

  return revisions;
};

/**
 * Helper: Generate URL-friendly slug
 */
function generateSlug(title: string): string {
  return title
    .toLowerCase()
    .trim()
    .replace(/[^\w\s-]/g, '') // Remove special chars
    .replace(/\s+/g, '-') // Replace spaces with hyphens
    .replace(/-+/g, '-') // Replace multiple hyphens with single
    .substring(0, 100);
}
