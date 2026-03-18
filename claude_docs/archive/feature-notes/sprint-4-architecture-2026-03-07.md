# Sprint 4 Architecture: Search by Item Type
**Date:** 2026-03-07
**Status:** Design Authority
**Roadmap Ref:** "Index items, search UI, result optimization" (Sprints 4a + 4b)

---

## Context

Current state:
- Beta launch ready. Core sale + item CRUD shipped.
- Item model has `category` and `condition` fields but no search infrastructure.
- Shoppers can only browse items within a visible sale; no cross-sale item search.
- Organizers need ability to highlight specific item types (furniture, vintage, etc.) to drive traffic.

Scale assumptions:
- Beta: 100–500 items across 5–20 sales (Grand Rapids initial)
- 2-year horizon: 10K–50K items (if successful)
- Search queries: 10–100/day initially; 1K+/day post-launch

Stack constraints:
- PostgreSQL (Neon) — no separate search index (Elasticsearch, Algolia not justified)
- Prisma ORM — limited full-text search support but workable for beta
- Next.js Pages Router frontend
- Stateless API (Express backend)

---

## Decision: PostgreSQL Full-Text Search (tsvector) for Sprint 4a → ILIKE fallback for 4b

### Rationale

| Approach | Pros | Cons | Beta Fit |
|----------|------|------|----------|
| **PostgreSQL `tsvector` (FTS)** | Language-aware, fast, scales to 50K items, no external infra, handles typos/stemming | Requires Prisma `@db.Unsupported` migration, query complexity, operator learning curve | ✅ **YES** — preferred for 4a |
| **Simple `ILIKE` filtering** | Zero setup, Prisma-native, immediate payoff, maintainable | Slow on large tables, no fuzzy matching, manual index tuning | ✅ **YES** — fallback if FTS blocks, also used in 4b for category/condition |
| **External (Algolia, Typesense)** | Best UX, instant, typo-tolerant | Cost, infrastructure, API keys, data sync, overkill for beta | ❌ **NO** |
| **Embedding vectors (Ollama nomic)** | Future semantic search, already have embeddings | Requires vector index, complex queries, not ready for beta | ❌ **NO** (defer to Phase X) |

**Decision:** Sprint 4a implements PostgreSQL FTS (`tsvector`) on `Item.title` + `Item.description` + indexed `category`. Sprint 4b adds ILIKE fallback + category/condition refinement UI if performance issues arise.

---

## 1. Schema Changes

### New Indexes (Prisma Migration)

```sql
-- Index 1: Full-text search vector (Sprint 4a)
CREATE TABLE "Item" (
  ...
  searchVector tsvector GENERATED ALWAYS AS (
    setweight(to_tsvector('english', COALESCE(title, '')), 'A') ||
    setweight(to_tsvector('english', COALESCE(description, '')), 'B') ||
    setweight(to_tsvector('english', COALESCE(category, '')), 'C')
  ) STORED
);

CREATE INDEX "idx_item_search_vector" ON "Item" USING gin (searchVector);

-- Index 2: Category + condition (compound, for filtering)
CREATE INDEX "idx_item_category_condition_status" ON "Item" (category, condition, status);

-- Index 3: Sale ID + status (for cross-sale queries)
CREATE INDEX "idx_item_sale_status" ON "Item" (saleId, status);

-- Index 4: ILIKE fallback (single-column, for 4b)
CREATE INDEX "idx_item_title_trgm" ON "Item" USING gin (title gin_trgm_ops);
-- Requires: CREATE EXTENSION IF NOT EXISTS pg_trgm;
```

### Schema.prisma Changes

```prisma
model Item {
  id               String    @id @default(cuid())
  title            String
  sku              String?
  description      String?
  price            Float?
  // ... existing fields ...

  // Sprint 4: Search metadata
  category         String?   // furniture, decor, vintage, textiles, collectibles, art, antiques, jewelry, books, tools, electronics, clothing, home, other
  condition        String?   // mint, excellent, good, fair, poor

  // FTS vector (generated, stored) — no explicit field needed; query via raw SQL

  // Timestamps
  createdAt        DateTime  @default(now())
  updatedAt        DateTime  @updatedAt

  @@index([saleId, status])
  @@index([category, condition, status])
}
```

**Note:** `searchVector` is a generated column; no Prisma field needed. Queried via `$queryRaw`.

### Migration File Naming
`20260310000001_add_item_fulltext_search_indexes.sql` (scheduled for Sprint 4a Week 1)

---

## 2. API Contract

### New Endpoints

#### `GET /api/items/search`

**Request:**
```typescript
{
  q?: string;                    // Query string (title + description + category)
  category?: string;             // Filter: furniture, decor, vintage, etc.
  condition?: string;            // Filter: mint, excellent, good, fair, poor
  saleId?: string;              // Scope to single sale (optional; cross-sale by default)
  priceMin?: number;            // Filter: minimum price
  priceMax?: number;            // Filter: maximum price
  radius?: number;              // Radius in miles from coordinates (future; ignored now)
  lat?: number;                 // Shopper latitude (future)
  lng?: number;                 // Shopper longitude (future)
  sort?: "relevance" | "newest" | "price_asc" | "price_desc"; // Default: relevance (FTS rank)
  limit?: number;               // Per-page (default 20, max 100)
  offset?: number;              // Pagination (default 0)
}
```

**Response:**
```typescript
{
  data: [
    {
      id: string;
      title: string;
      price: number | null;
      photoUrl?: string;         // First photo only
      category: string;
      condition: string;
      saleId: string;
      organizer: {
        id: string;
        businessName: string;
      };
      distance?: number;         // Miles (future; null for now)
      relevanceScore?: number;   // FTS rank (0-1 normalized)
    }
  ];
  total: number;
  limit: number;
  offset: number;
  facets: {
    categories: { name: string; count: number }[];
    conditions: { name: string; count: number }[];
    priceRange: { min: number; max: number };
  };
}
```

#### `GET /api/items/categories` (metadata endpoint)

Returns all available categories + counts for UI filter dropdowns.

**Request:** None (query cache: 5 min)

**Response:**
```typescript
{
  categories: {
    furniture: 45,
    vintage: 32,
    decor: 28,
    // ...
  }
}
```

### Updated Endpoints

#### `PATCH /api/items/:id` (existing, enhanced)

When `category` or `condition` changes, `searchVector` auto-regenerates (PostgreSQL generated column). No backend code change needed.

---

## 3. Search Strategy & Query Logic

### Sprint 4a: PostgreSQL Full-Text Search (tsvector)

**Query Path:**
```typescript
// backend/src/services/itemSearchService.ts (NEW)

async function searchItems(query: SearchQuery) {
  const {
    q,
    category,
    condition,
    priceMin,
    priceMax,
    limit = 20,
    offset = 0,
    sort = 'relevance'
  } = query;

  // Build raw SQL query
  let sql = `
    SELECT
      i.id, i.title, i.price, i.category, i.condition,
      i."photoUrls", i."saleId", s."organizerId",
      o."businessName",
      ts_rank_cd(i."searchVector", to_tsquery('english', $1)) AS relevance
    FROM "Item" i
    JOIN "Sale" s ON i."saleId" = s.id
    JOIN "Organizer" o ON s."organizerId" = o.id
    WHERE i.status = 'AVAILABLE'
      AND i."searchVector" @@ to_tsquery('english', $2)
  `;

  // Build params array
  const params: any[] = [q, q];
  let paramIndex = 3;

  // Add filters
  if (category) {
    sql += ` AND i.category = $${paramIndex++}`;
    params.push(category);
  }
  if (condition) {
    sql += ` AND i.condition = $${paramIndex++}`;
    params.push(condition);
  }
  if (priceMin !== undefined) {
    sql += ` AND i.price >= $${paramIndex++}`;
    params.push(priceMin);
  }
  if (priceMax !== undefined) {
    sql += ` AND i.price <= $${paramIndex++}`;
    params.push(priceMax);
  }

  // Add sort
  if (sort === 'relevance') {
    sql += ` ORDER BY relevance DESC, i."createdAt" DESC`;
  } else if (sort === 'newest') {
    sql += ` ORDER BY i."createdAt" DESC`;
  } else if (sort === 'price_asc') {
    sql += ` ORDER BY i.price ASC, i."createdAt" DESC`;
  } else if (sort === 'price_desc') {
    sql += ` ORDER BY i.price DESC, i."createdAt" DESC`;
  }

  // Add pagination
  sql += ` LIMIT $${paramIndex++} OFFSET $${paramIndex++}`;
  params.push(limit, offset);

  // Execute raw query
  const results = await prisma.$queryRaw(sql, ...params);
  const total = await prisma.item.count({ where: { status: 'AVAILABLE' } });

  return {
    data: results.map(mapItemResult),
    total,
    limit,
    offset,
    facets: await getItemFacets() // count by category, condition, price range
  };
}
```

**Query Tuning:**
- `ts_rank_cd()` — PostgreSQL's built-in ranking function (faster than plain `@@` match)
- Weight: title (A) > description (B) > category (C) for relevance
- Indexed on `searchVector` (GIN index) → O(log N) lookup

**Fallback (if index missing):**
```sql
WHERE i.status = 'AVAILABLE'
  AND (
    i.title ILIKE '%' || $1 || '%'
    OR i.description ILIKE '%' || $1 || '%'
    OR i.category ILIKE '%' || $1 || '%'
  )
```

---

### Sprint 4b: ILIKE Refinement + Filter UI

If FTS proves slow or complex, switch to simpler ILIKE + indexed category filtering:

```typescript
// Simpler query path
const items = await prisma.item.findMany({
  where: {
    status: 'AVAILABLE',
    OR: [
      { title: { contains: q, mode: 'insensitive' } },
      { description: { contains: q, mode: 'insensitive' } },
      { category: { contains: q, mode: 'insensitive' } }
    ],
    ...(category && { category }),
    ...(condition && { condition }),
    ...(priceMin !== undefined && { price: { gte: priceMin } }),
    ...(priceMax !== undefined && { price: { lte: priceMax } })
  },
  orderBy: sort === 'newest' ? { createdAt: 'desc' } : { updatedAt: 'desc' },
  take: limit,
  skip: offset,
  select: { /* fields */ }
});
```

**Trade-off:** Slower for large datasets, but Prisma-native and easier to maintain. Acceptable for 50K items if indexed on `category` + `condition`.

---

## 4. Frontend Contract

### Search UI Component (`packages/frontend/components/ItemSearch.tsx`)

**Props:**
```typescript
interface ItemSearchProps {
  initialQuery?: string;
  initialCategory?: string;
  initialCondition?: string;
  onResultsChange?: (results: ItemSearchResult[]) => void;
}
```

**UI Flow:**
1. Search bar + faceted filters (category, condition, price range)
2. Real-time query-as-you-type (debounce 300ms)
3. Result grid (4 cols on desktop, 2 on mobile)
4. Pagination (20 results/page)

**Query Params:**
```
/search?q=chair&category=furniture&condition=excellent&priceMax=500&sort=price_asc
```

### Integration Points

1. **Main Search Page** (`pages/search.tsx`)
   - Full page layout with sidebar filters
   - Saves query to URL params (shareable links)

2. **Sale Detail Page** (`pages/sales/[id].tsx`)
   - Optional: sale-scoped item search (set `saleId` param)

3. **Homepage** (`pages/index.tsx`)
   - Featured search bar linking to `/search`

### Query Param Persistence
React Query + React Router params, not Redux (align with existing pattern).

---

## 5. Sprint Breakdown

### Sprint 4a (Week 1–2): Schema + FTS API
- **DB Migration** (Day 1)
  - Add `searchVector` generated column + GIN index
  - Add compound index on `category`, `condition`, `status`
  - Test on Neon staging
  - Rollback plan: drop indexes (safe)

- **Backend Service** (Days 2–3)
  - `itemSearchService.ts` with FTS query + fallback
  - `GET /api/items/search` endpoint (query, filters, sort, pagination)
  - `GET /api/categories` metadata endpoint
  - Error handling + query validation

- **Testing** (Day 4)
  - Unit tests: query building, filter logic
  - Integration tests: 100 sample items, category facets
  - Performance baseline: <100ms for 100 items, <500ms for 10K
  - Neon production: verify index creation

- **Deliverable:** API ready; no UI yet

### Sprint 4b (Week 3–4): Frontend + Refinement
- **Search Page** (Days 1–2)
  - `ItemSearch.tsx` component (query bar + filters)
  - `/search` page layout
  - Faceted filter sidebar (category, condition, price)
  - Result grid + pagination

- **Integration** (Days 3)
  - Wired to homepage
  - Sale detail item search (optional scoping)
  - Query param persistence

- **Optimization** (Day 4)
  - ILIKE fallback if FTS slow (see rationale)
  - Add database indexes if needed
  - Measure query times; adjust index tuning

- **Testing**
  - Component tests: filter UI, query building
  - E2E: search for item, filter by category, sort by price
  - Performance: cold cache (<500ms), warm cache (<100ms)

- **Deliverable:** Full search feature shipped to beta

---

## 6. Implementation Plan

### File Structure (New & Modified)

**Backend — NEW:**
```
packages/backend/src/
├── services/
│   └── itemSearchService.ts       # Query building, FTS logic, fallback
├── controllers/
│   └── searchController.ts        # GET /api/items/search, /api/categories
└── routes/
    └── search.ts                  # Route definitions
```

**Backend — MODIFIED:**
```
packages/backend/src/
├── app.ts                         # Register /api/search routes
└── index.ts                       # Validate search env vars (if needed)
```

**Frontend — NEW:**
```
packages/frontend/
├── components/
│   ├── ItemSearch.tsx             # Query + filter form
│   ├── ItemSearchResults.tsx      # Grid + pagination
│   ├── FilterSidebar.tsx          # Category/condition/price facets
│   └── hooks/
│       └── useItemSearch.ts       # React Query + URL params
├── pages/
│   └── search.tsx                 # Full page layout
└── types/
    └── search.ts                  # SearchQuery, SearchResult interfaces
```

**Database — NEW:**
```
packages/database/prisma/migrations/
└── 20260310000001_add_item_fulltext_search_indexes.sql
```

### Migration Steps (Neon Production)

1. **Local dev:** Run migration, test queries
2. **Staging (if available):** Deploy migration, test with larger dataset
3. **Production (Day 1 of 4a deployment):**
   ```bash
   cd packages/database
   # Set DIRECT_URL to Neon direct connection
   export DIRECT_URL="postgresql://user:pw@direct-url.neon.tech/db"
   npx prisma migrate deploy
   ```
4. **Verify:** Query production index stats
   ```sql
   SELECT * FROM pg_stat_user_indexes WHERE indexname LIKE '%search%';
   ```

### Error Handling

- **Query validation:** Empty `q` returns all items (paginated)
- **Invalid filters:** Silently ignored (no 400 error)
- **FTS syntax errors:** Catch and fall back to ILIKE
- **Large result sets:** Hardcoded max 10K results (pagination enforced)
- **Neon rate limits:** Implement circuit breaker if >1K req/sec (unlikely in beta)

---

## 7. Migration Sequence

### Prisma Migration Script

**File:** `packages/database/prisma/migrations/20260310000001_add_item_fulltext_search_indexes.sql`

```sql
-- Enable pg_trgm extension for trigram matching (ILIKE optimization)
CREATE EXTENSION IF NOT EXISTS pg_trgm;

-- Add searchVector generated column (auto-computed, stored on disk)
ALTER TABLE "Item"
ADD COLUMN "searchVector" tsvector GENERATED ALWAYS AS (
  setweight(to_tsvector('english', COALESCE("title", '')), 'A') ||
  setweight(to_tsvector('english', COALESCE("description", '')), 'B') ||
  setweight(to_tsvector('english', COALESCE("category", '')), 'C')
) STORED;

-- FTS index
CREATE INDEX "idx_item_search_vector" ON "Item" USING gin ("searchVector");

-- Compound index for category + condition filtering
CREATE INDEX "idx_item_category_condition_status" ON "Item" (category, condition, status);

-- ILIKE fallback index (trigram)
CREATE INDEX "idx_item_title_trgm" ON "Item" USING gin ("title" gin_trgm_ops);

-- Enhance sale lookup for search results
CREATE INDEX "idx_item_sale_status" ON "Item" ("saleId", status);
```

**Downtime:** ~30 seconds on 10K items (estimate). Safe to run during beta.

---

## 8. Search Categories & Taxonomy

Locked category list (from schema comments):

```
furniture, decor, vintage, textiles, collectibles, art, antiques,
jewelry, books, tools, electronics, clothing, home, other
```

Conditions:
```
mint, excellent, good, fair, poor
```

**Future:** Add `tags[]` field to Item for keyword-based search (separate from structured category).

---

## 9. Consequences & Trade-offs

### Advantages
- **No external services** — PostgreSQL native, no Algolia/Typesense cost
- **Scales to 50K items** — FTS + indexes handle growth
- **Language-aware** — Stemming, stop words (English; future: multi-language)
- **Fast** — <100ms on warm cache for 10K items
- **Maintainable** — Prisma + raw SQL hybrid is acceptable

### Risks & Mitigations
| Risk | Mitigation |
|------|-----------|
| FTS query complexity scares off future devs | Document in SERVICE.md + code comments |
| Neon indexing slow at scale | Start with small dataset; test locally first |
| ILIKE fallback slower than FTS | Not a blocker; still <500ms for beta |
| Generated column storage bloats DB | ~5-10KB per 1000 items; acceptable |
| Category typos (e.g., "Furniture" vs "furniture") | Enforce enum in frontend/backend validation |

---

## 10. Success Criteria (Definition of Done)

**4a Checklist:**
- [ ] Migration runs on Neon without errors
- [ ] `GET /api/items/search?q=chair` returns results in <100ms (10 items)
- [ ] FTS handles typos (e.g., "chir" → "chair" via stemming)
- [ ] Category facets count items correctly
- [ ] ILIKE fallback works if FTS disabled
- [ ] Code reviewed + documented

**4b Checklist:**
- [ ] Search page renders and filters update URL params
- [ ] Faceted filters (category, price range) work
- [ ] Pagination works (20 items/page)
- [ ] Sorting options (relevance, newest, price) work
- [ ] Mobile responsive (2-col grid on small screens)
- [ ] E2E test: search → filter → add to favorites
- [ ] Performance: <500ms cold, <100ms warm
- [ ] Deployed to Vercel + Railway

---

## Appendix: Query Examples

### Example 1: "Vintage chair" (FTS)
```sql
SELECT i.id, i.title, ts_rank_cd(i."searchVector", q) AS rank
FROM "Item" i, to_tsquery('english', 'vintage & chair') q
WHERE i."searchVector" @@ q
ORDER BY rank DESC
LIMIT 20;
```
**Result:** Returns "Vintage armchair" (rank 0.95), "Chair (vintage style)" (rank 0.87), etc.

### Example 2: Filter by category + price
```sql
SELECT i.id, i.title, i.price
FROM "Item" i
WHERE i.status = 'AVAILABLE'
  AND i.category = 'furniture'
  AND i.price BETWEEN 100 AND 500
  AND i."searchVector" @@ to_tsquery('english', 'chair')
ORDER BY i.price ASC
LIMIT 20 OFFSET 0;
```

### Example 3: Facet counts (category)
```sql
SELECT category, COUNT(*) as count
FROM "Item"
WHERE status = 'AVAILABLE'
GROUP BY category
ORDER BY count DESC;
```

---

## Related Documents
- **STACK.md** — Locked PostgreSQL + Prisma + Express
- **STATE.md** — Current feature roadmap
- **RECOVERY.md** — Rollback procedures (if migration fails)
- **Service docs** (TBD) — itemSearchService.ts implementation guide

---

**Status:** APPROVED FOR SPRINT 4a KICKOFF
**Next Step:** Load `findasale-dev-environment` skill, create migration file, begin implementation
