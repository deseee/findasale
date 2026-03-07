/**
 * itemSearchService.ts — Sprint 4a
 * Full-text search across Item records using PostgreSQL tsvector + GIN index.
 * Falls back to ILIKE if FTS is unavailable or query is empty.
 *
 * Uses $queryRawUnsafe with numbered PostgreSQL params ($1, $2, ...) — safe from injection.
 * plainto_tsquery handles multi-word input naturally ("vintage chair" → "vintage & chair").
 */

import { prisma } from '../lib/prisma';

export interface SearchQuery {
  q?: string;
  category?: string;
  condition?: string;
  saleId?: string;
  priceMin?: number;
  priceMax?: number;
  sort?: 'relevance' | 'newest' | 'price_asc' | 'price_desc';
  limit?: number;
  offset?: number;
}

export interface ItemSearchResult {
  id: string;
  title: string;
  price: number | null;
  photoUrls: string[];
  category: string | null;
  condition: string | null;
  saleId: string;
  organizerId: string;
  businessName: string;
  relevanceScore?: number;
}

export interface SearchFacets {
  categories: { name: string; count: number }[];
  conditions: { name: string; count: number }[];
  priceRange: { min: number; max: number } | null;
}

export interface SearchResponse {
  data: ItemSearchResult[];
  total: number;
  limit: number;
  offset: number;
  facets: SearchFacets;
}

// ---------------------------------------------------------------------------
// searchItems — primary FTS query path with ILIKE fallback
// ---------------------------------------------------------------------------
export async function searchItems(query: SearchQuery): Promise<SearchResponse> {
  const {
    q = '',
    category,
    condition,
    saleId,
    priceMin,
    priceMax,
    sort = 'relevance',
    limit: rawLimit = 20,
    offset: rawOffset = 0,
  } = query;

  const limit = Math.min(Math.max(1, rawLimit), 100);
  const offset = Math.max(0, rawOffset);
  const qTrimmed = q.trim();

  let data: ItemSearchResult[];
  let total: number;

  if (qTrimmed.length > 0) {
    // FTS path — tsvector + plainto_tsquery
    ({ data, total } = await ftsSearch({
      q: qTrimmed,
      category,
      condition,
      saleId,
      priceMin,
      priceMax,
      sort,
      limit,
      offset,
    }));
  } else {
    // No query — return all available items with filters applied
    ({ data, total } = await filteredSearch({
      category,
      condition,
      saleId,
      priceMin,
      priceMax,
      sort,
      limit,
      offset,
    }));
  }

  const facets = await getItemFacets({ category, condition, saleId, priceMin, priceMax });

  return { data, total, limit, offset, facets };
}

// ---------------------------------------------------------------------------
// ftsSearch — uses searchVector @@ plainto_tsquery
// ---------------------------------------------------------------------------
async function ftsSearch(params: Omit<SearchQuery, 'q'> & Required<Pick<SearchQuery, 'limit' | 'offset' | 'sort'>> & { q: string }) {
  const { q, category, condition, saleId, priceMin, priceMax, sort, limit, offset } = params;

  const sqlParts: string[] = [];
  const sqlParams: (string | number)[] = [];
  let idx = 1;

  // Base SELECT with FTS rank
  sqlParts.push(`
    SELECT
      i.id,
      i.title,
      i.price,
      i."photoUrls",
      i.category,
      i.condition,
      i."saleId",
      s."organizerId",
      o."businessName",
      ts_rank_cd(i."searchVector", plainto_tsquery('english', $${idx})) AS "relevanceScore"
    FROM "Item" i
    JOIN "Sale" s ON i."saleId" = s.id
    JOIN "Organizer" o ON s."organizerId" = o.id
    WHERE i.status = 'AVAILABLE'
      AND s.status = 'PUBLISHED'
      AND i."searchVector" @@ plainto_tsquery('english', $${idx + 1})
  `);
  sqlParams.push(q, q);
  idx += 2;

  idx = appendFilters(sqlParts, sqlParams, idx, { category, condition, saleId, priceMin, priceMax });

  // ORDER BY
  sqlParts.push(orderByClause(sort));

  // LIMIT / OFFSET
  sqlParts.push(`LIMIT $${idx} OFFSET $${idx + 1}`);
  sqlParams.push(limit, offset);

  const sql = sqlParts.join('\n');

  try {
    const rows = (await prisma.$queryRawUnsafe<any[]>(sql, ...sqlParams)).map(mapRow);
    const total = await countFts(q, { category, condition, saleId, priceMin, priceMax });
    return { data: rows, total };
  } catch (err) {
    // FTS index might not exist yet on this environment — fall back to ILIKE
    console.warn('[itemSearch] FTS failed, falling back to ILIKE:', (err as Error).message);
    return ilikeSearch(params);
  }
}

// ---------------------------------------------------------------------------
// ilikeSearch — ILIKE fallback (slower but always available)
// ---------------------------------------------------------------------------
async function ilikeSearch(params: Omit<SearchQuery, 'q'> & Required<Pick<SearchQuery, 'limit' | 'offset' | 'sort'>> & { q: string }) {
  const { q, category, condition, saleId, priceMin, priceMax, sort, limit, offset } = params;

  const sqlParts: string[] = [];
  const sqlParams: (string | number)[] = [];
  let idx = 1;

  sqlParts.push(`
    SELECT
      i.id,
      i.title,
      i.price,
      i."photoUrls",
      i.category,
      i.condition,
      i."saleId",
      s."organizerId",
      o."businessName",
      0.5 AS "relevanceScore"
    FROM "Item" i
    JOIN "Sale" s ON i."saleId" = s.id
    JOIN "Organizer" o ON s."organizerId" = o.id
    WHERE i.status = 'AVAILABLE'
      AND s.status = 'PUBLISHED'
      AND (
        i.title ILIKE '%' || $${idx} || '%'
        OR i.description ILIKE '%' || $${idx} || '%'
        OR i.category ILIKE '%' || $${idx} || '%'
      )
  `);
  sqlParams.push(q);
  idx += 1;

  idx = appendFilters(sqlParts, sqlParams, idx, { category, condition, saleId, priceMin, priceMax });

  sqlParts.push(orderByClause(sort, false));
  sqlParts.push(`LIMIT $${idx} OFFSET $${idx + 1}`);
  sqlParams.push(limit, offset);

  const sql = sqlParts.join('\n');
  const rows = (await prisma.$queryRawUnsafe<any[]>(sql, ...sqlParams)).map(mapRow);
  const total = await countIlike(q, { category, condition, saleId, priceMin, priceMax });
  return { data: rows, total };
}

// ---------------------------------------------------------------------------
// filteredSearch — no q, return all items matching filters
// ---------------------------------------------------------------------------
async function filteredSearch(params: Omit<SearchQuery, 'q'> & Required<Pick<SearchQuery, 'limit' | 'offset' | 'sort'>>) {
  const { category, condition, saleId, priceMin, priceMax, sort, limit, offset } = params;

  const sqlParts: string[] = [];
  const sqlParams: (string | number)[] = [];
  let idx = 1;

  sqlParts.push(`
    SELECT
      i.id,
      i.title,
      i.price,
      i."photoUrls",
      i.category,
      i.condition,
      i."saleId",
      s."organizerId",
      o."businessName",
      NULL AS "relevanceScore"
    FROM "Item" i
    JOIN "Sale" s ON i."saleId" = s.id
    JOIN "Organizer" o ON s."organizerId" = o.id
    WHERE i.status = 'AVAILABLE'
      AND s.status = 'PUBLISHED'
  `);

  idx = appendFilters(sqlParts, sqlParams, idx, { category, condition, saleId, priceMin, priceMax });

  sqlParts.push(orderByClause(sort, false));
  sqlParts.push(`LIMIT $${idx} OFFSET $${idx + 1}`);
  sqlParams.push(limit, offset);

  const sql = sqlParts.join('\n');
  const rows = (await prisma.$queryRawUnsafe<any[]>(sql, ...sqlParams)).map(mapRow);
  const total = await countFiltered({ category, condition, saleId, priceMin, priceMax });
  return { data: rows, total };
}

// ---------------------------------------------------------------------------
// COUNT helpers
// ---------------------------------------------------------------------------
async function countFts(
  q: string,
  filters: Pick<SearchQuery, 'category' | 'condition' | 'saleId' | 'priceMin' | 'priceMax'>,
): Promise<number> {
  const sqlParts: string[] = [];
  const sqlParams: (string | number)[] = [];
  let idx = 1;

  sqlParts.push(`
    SELECT COUNT(*)::int AS count
    FROM "Item" i
    JOIN "Sale" s ON i."saleId" = s.id
    WHERE i.status = 'AVAILABLE'
      AND s.status = 'PUBLISHED'
      AND i."searchVector" @@ plainto_tsquery('english', $${idx})
  `);
  sqlParams.push(q);
  idx += 1;
  appendFilters(sqlParts, sqlParams, idx, filters);

  const rows = await prisma.$queryRawUnsafe<{ count: number }[]>(sqlParts.join('\n'), ...sqlParams);
  return rows[0]?.count ?? 0;
}

async function countIlike(
  q: string,
  filters: Pick<SearchQuery, 'category' | 'condition' | 'saleId' | 'priceMin' | 'priceMax'>,
): Promise<number> {
  const sqlParts: string[] = [];
  const sqlParams: (string | number)[] = [];
  let idx = 1;

  sqlParts.push(`
    SELECT COUNT(*)::int AS count
    FROM "Item" i
    JOIN "Sale" s ON i."saleId" = s.id
    WHERE i.status = 'AVAILABLE'
      AND s.status = 'PUBLISHED'
      AND (
        i.title ILIKE '%' || $${idx} || '%'
        OR i.description ILIKE '%' || $${idx} || '%'
        OR i.category ILIKE '%' || $${idx} || '%'
      )
  `);
  sqlParams.push(q);
  idx += 1;
  appendFilters(sqlParts, sqlParams, idx, filters);

  const rows = await prisma.$queryRawUnsafe<{ count: number }[]>(sqlParts.join('\n'), ...sqlParams);
  return rows[0]?.count ?? 0;
}

async function countFiltered(
  filters: Pick<SearchQuery, 'category' | 'condition' | 'saleId' | 'priceMin' | 'priceMax'>,
): Promise<number> {
  const sqlParts: string[] = [];
  const sqlParams: (string | number)[] = [];
  let idx = 1;

  sqlParts.push(`
    SELECT COUNT(*)::int AS count
    FROM "Item" i
    JOIN "Sale" s ON i."saleId" = s.id
    WHERE i.status = 'AVAILABLE'
      AND s.status = 'PUBLISHED'
  `);
  appendFilters(sqlParts, sqlParams, idx, filters);

  const rows = await prisma.$queryRawUnsafe<{ count: number }[]>(sqlParts.join('\n'), ...sqlParams);
  return rows[0]?.count ?? 0;
}

// ---------------------------------------------------------------------------
// appendFilters — shared filter builder (mutates sqlParts + sqlParams, returns next idx)
// ---------------------------------------------------------------------------
function appendFilters(
  sqlParts: string[],
  sqlParams: (string | number)[],
  startIdx: number,
  filters: Pick<SearchQuery, 'category' | 'condition' | 'saleId' | 'priceMin' | 'priceMax'>,
): number {
  let idx = startIdx;
  const { category, condition, saleId, priceMin, priceMax } = filters;

  if (category) {
    sqlParts.push(`AND i.category ILIKE $${idx}`);
    sqlParams.push(category);
    idx++;
  }
  if (condition) {
    sqlParts.push(`AND i.condition ILIKE $${idx}`);
    sqlParams.push(condition);
    idx++;
  }
  if (saleId) {
    sqlParts.push(`AND i."saleId" = $${idx}`);
    sqlParams.push(saleId);
    idx++;
  }
  if (priceMin !== undefined && priceMin !== null) {
    sqlParts.push(`AND i.price >= $${idx}`);
    sqlParams.push(priceMin);
    idx++;
  }
  if (priceMax !== undefined && priceMax !== null) {
    sqlParts.push(`AND i.price <= $${idx}`);
    sqlParams.push(priceMax);
    idx++;
  }

  return idx;
}

// ---------------------------------------------------------------------------
// orderByClause — SQL ORDER BY fragment
// ---------------------------------------------------------------------------
function orderByClause(
  sort: SearchQuery['sort'],
  hasFtsRank = true,
): string {
  switch (sort) {
    case 'price_asc':
      return 'ORDER BY i.price ASC NULLS LAST, i."createdAt" DESC';
    case 'price_desc':
      return 'ORDER BY i.price DESC NULLS LAST, i."createdAt" DESC';
    case 'newest':
      return 'ORDER BY i."createdAt" DESC';
    case 'relevance':
    default:
      return hasFtsRank
        ? 'ORDER BY "relevanceScore" DESC, i."createdAt" DESC'
        : 'ORDER BY i."createdAt" DESC';
  }
}

// ---------------------------------------------------------------------------
// mapRow — normalize raw DB row to ItemSearchResult
// ---------------------------------------------------------------------------
function mapRow(row: any): ItemSearchResult {
  return {
    id: row.id,
    title: row.title,
    price: row.price !== null && row.price !== undefined ? Number(row.price) : null,
    photoUrls: row.photoUrls ?? [],
    category: row.category ?? null,
    condition: row.condition ?? null,
    saleId: row.saleId,
    organizerId: row.organizerId,
    businessName: row.businessName,
    relevanceScore: row.relevanceScore !== null ? Number(row.relevanceScore) : undefined,
  };
}

// ---------------------------------------------------------------------------
// getItemFacets — counts by category, condition, price range (for filter UI)
// ---------------------------------------------------------------------------
export async function getItemFacets(
  filters: Pick<SearchQuery, 'category' | 'condition' | 'saleId' | 'priceMin' | 'priceMax'> = {},
): Promise<SearchFacets> {
  const [categoryRows, conditionRows, priceRows] = await Promise.all([
    prisma.item.groupBy({
      by: ['category'],
      where: { status: 'AVAILABLE', sale: { status: 'PUBLISHED' }, category: { not: null } },
      _count: { id: true },
      orderBy: { _count: { id: 'desc' } },
    }),
    prisma.item.groupBy({
      by: ['condition'],
      where: { status: 'AVAILABLE', sale: { status: 'PUBLISHED' }, condition: { not: null } },
      _count: { id: true },
      orderBy: { _count: { id: 'desc' } },
    }),
    prisma.item.aggregate({
      where: { status: 'AVAILABLE', sale: { status: 'PUBLISHED' }, price: { not: null } },
      _min: { price: true },
      _max: { price: true },
    }),
  ]);

  return {
    categories: categoryRows.map(r => ({ name: r.category!, count: r._count.id })),
    conditions: conditionRows.map(r => ({ name: r.condition!, count: r._count.id })),
    priceRange:
      priceRows._min.price !== null && priceRows._max.price !== null
        ? { min: Number(priceRows._min.price), max: Number(priceRows._max.price) }
        : null,
  };
}

// ---------------------------------------------------------------------------
// getItemCategories — all active categories with item counts (metadata endpoint)
// ---------------------------------------------------------------------------
export async function getItemCategories(): Promise<Record<string, number>> {
  const rows = await prisma.item.groupBy({
    by: ['category'],
    where: { status: 'AVAILABLE', sale: { status: 'PUBLISHED' }, category: { not: null } },
    _count: { id: true },
    orderBy: { _count: { id: 'desc' } },
  });

  return Object.fromEntries(rows.map(r => [r.category!, r._count.id]));
}
