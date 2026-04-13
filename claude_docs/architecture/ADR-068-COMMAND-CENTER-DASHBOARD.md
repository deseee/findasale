# ADR-068: Command Center Dashboard — Architecture Design

**Status:** APPROVED FOR SPRINT 1 IMPLEMENTATION
**Decision Date:** 2026-03-16
**Tier:** PRO/TEAMS (gated by `requireTier('PRO')`)
**Effort:** 2 sprints (Sprint 1: backend + data pipeline; Sprint 2: frontend UI)
**Owner:** findasale-dev

---

## 1. Feature Definition

**Command Center Dashboard** is a multi-sale overview for power organizers (PRO/TEAMS tier) managing 5+ active/upcoming/recent sales simultaneously. Single-screen view of:

- All sales at a glance (active, upcoming, recent)
- Key metrics per sale (items listed, sold, revenue, views, favorites)
- Pending actions across all sales (items needing photos, pending holds, unpaid purchases)
- Quick-jump navigation to any sale's management page
- Aggregate stats (total revenue across all active sales, total items, conversion rate)

**User Flow:**
1. Organizer with PRO tier visits `/organizer/command-center`
2. Sees 4-6 active sales in a card grid + 3-4 recent/upcoming below
3. Each card shows key metrics + color-coded pending action badge
4. Click card to deep-link to sale's edit page
5. Filter by status (active/upcoming/recent) or date range
6. Optional: export summary as CSV/PDF

---

## 2. Data Model & Schema Analysis

**Current Capabilities:**
- `Sale` table: status (DRAFT, PUBLISHED, ENDED), title, startDate, endDate, metadata
- `Item` table: saleId, status (AVAILABLE, SOLD, RESERVED), price, photoUrls
- `Favorite` table: userId, saleId, itemId
- `Purchase` table: saleId, itemId, amount, status
- `ItemReservation` table: itemId, expiresAt, status

**Schema Status:** ✅ **READY — NO MIGRATIONS REQUIRED**

The schema already supports all needed aggregations. No new fields required.

**Metrics to Aggregate:**

| Metric | Source | Calculation |
|--------|--------|-------------|
| `items_listed` | `Item` count | WHERE saleId=X AND draftStatus != 'DRAFT' |
| `items_sold` | `Item` count | WHERE saleId=X AND status='SOLD' |
| `items_available` | `Item` count | WHERE saleId=X AND status='AVAILABLE' |
| `items_reserved` | `Item` count | WHERE saleId=X AND status='RESERVED' |
| `revenue` | `Purchase` sum | WHERE saleId=X AND status='PAID' |
| `conversion_rate` | Calculation | (items_sold / items_listed) * 100 |
| `avg_item_price` | `Item` avg | WHERE saleId=X AND price IS NOT NULL |
| `favorites_count` | `Favorite` count | WHERE saleId=X |
| `views_count` | `Sale` field (if tracked) | OR estimate from qrScanCount |
| `items_needing_photos` | `Item` count | WHERE saleId=X AND photoUrls.length=0 |
| `pending_holds` | `ItemReservation` count | WHERE saleId=X AND status='PENDING' |
| `unpaid_purchases` | `Purchase` count | WHERE saleId=X AND status='PENDING' |

---

## 3. API Design

### Endpoint 1: Get Command Center Summary

```
GET /api/organizer/command-center
```

**Query Parameters:**
- `status` (optional): filter by sale status: `active` | `upcoming` | `recent` | `all` (default: `active`)
- `dateFrom` (optional): ISO date string, filter sales starting >= this date
- `dateTo` (optional): ISO date string, filter sales starting <= this date

**Response Shape:**

```typescript
{
  success: boolean;
  organizerId: string;
  summary: {
    totalActiveSales: number;
    totalItems: number;
    totalRevenue: number;
    totalFavorites: number;
    aggregateConversionRate: number; // %
    totalPendingActions: number; // count of all items needing photos + pending holds + unpaid purchases
  };
  sales: {
    id: string;
    title: string;
    status: 'DRAFT' | 'PUBLISHED' | 'ENDED';
    startDate: string; // ISO
    endDate: string; // ISO;
    daysUntilStart: number; // negative if started
    itemsListed: number;
    itemsSold: number;
    itemsAvailable: number;
    itemsReserved: number;
    revenue: number;
    conversionRate: number; // %
    avgItemPrice: number;
    favoritesCount: number;
    viewsCount: number;
    pendingActions: {
      itemsNeedingPhotos: number;
      pendingHolds: number;
      unpaidPurchases: number;
      total: number;
    };
  }[];
}
```

**Performance Notes:**
- Organizer can have 10–50 active sales
- Each sale requires 3 queries (items, purchases, reservations) = 3N queries
- Solution: Use batch queries or single multi-join at application layer (see below)

---

## 4. Caching Strategy

**Problem:** Aggregations are expensive. Organizer with 50 active sales = 150+ queries if naive.

**Solution: Tiered Cache + Background Invalidation**

### Tier 1: In-Memory Cache (Redis)
- Key: `command-center:{organizerId}`
- TTL: 5 minutes
- Invalidation trigger: item/purchase/reservation mutation (via event queue or webhook)
- Size estimate: ~2KB per sale = 100KB for 50 sales (negligible)

### Tier 2: Database Materialized View (Future, Phase 2)
- Create PostgreSQL view: `vw_sale_metrics` aggregating counts per sale
- Refresh via trigger on `Item`, `Purchase`, `ItemReservation` inserts/updates
- Not needed for Sprint 1 (app-layer aggregation suffices)

### Tier 3: Stale-Fallback
- If Redis miss and DB slow, return cached snapshot from previous successful fetch (up to 10 minutes old)
- Frontend shows "data as of X minutes ago" badge

**Cache Invalidation Events:**
- Item created/updated/deleted → invalidate
- Purchase status changed → invalidate
- ItemReservation created/expired → invalidate
- Sale status changed → invalidate

**Implementation:**
- Use `ioredis` (already in stack)
- Set cache key on successful fetch
- Delete key on mutation (eager invalidation)
- If Redis unavailable, fall back to DB (cache-aside pattern)

---

## 5. Sprint Breakdown

### Sprint 1: Backend Data Pipeline (4–5 days)

**Deliverables:**
1. **New Service:** `packages/backend/src/services/commandCenterService.ts`
   - `getCommandCenterSummary(organizerId, filters?)` → Promise<CommandCenterSummary>
   - Internal: batch queries with aggregation logic
   - Handles caching (Redis)

2. **New Controller:** `packages/backend/src/controllers/commandCenterController.ts`
   - `getCommandCenter(req: AuthRequest, res: Response)` → calls service

3. **New Route:** `packages/backend/src/routes/commandCenter.ts`
   - `GET /api/organizer/command-center` (authenticated, requireTier('PRO'))

4. **Updated index.ts:**
   - Register command center route

5. **Type Definitions:** `packages/shared/src/types/commandCenter.ts`
   - Interfaces: `CommandCenterSummary`, `SaleMetrics`, `PendingActions`

**Files Modified/Created:**
- ✅ commandCenterService.ts (NEW, ~200 lines)
- ✅ commandCenterController.ts (NEW, ~30 lines)
- ✅ commandCenter.ts route (NEW, ~10 lines)
- ✅ index.ts (MODIFIED, +1 route import + registration)
- ✅ commandCenter.ts types (NEW, ~100 lines)

**Testing:**
- Unit: service aggregation logic (5 test cases)
- Integration: API endpoint with 3 organizers × 50 sales each
- Performance: API response time <1s with Redis, <3s on cold start

**Tier Gating:**
- Apply `requireTier('PRO')` middleware to route
- Verify via `tierGate.ts` — no code changes needed

---

### Sprint 2: Frontend UI (4–5 days)

**Deliverables:**
1. **New Page:** `packages/frontend/pages/organizer/command-center.tsx`
   - Grid layout: 4–6 sale cards per row
   - Card component shows all metrics
   - Status filter tabs (Active/Upcoming/Recent)
   - Optional date range picker

2. **New Component:** `packages/frontend/components/CommandCenterCard.tsx`
   - Displays one sale's metrics
   - Color-coded pending action badge (red/yellow/green)
   - Click-to-navigate to edit-sale page

3. **New Hook:** `packages/frontend/hooks/useCommandCenter.ts`
   - React Query: `useQuery(['command-center'], ...)` with 30s stale time
   - Handles loading/error states

4. **Updated Navigation:**
   - Add "Command Center" link to organizer sidebar/navigation

**Files Modified/Created:**
- ✅ command-center.tsx page (NEW, ~150 lines)
- ✅ CommandCenterCard.tsx component (NEW, ~80 lines)
- ✅ useCommandCenter.ts hook (NEW, ~30 lines)
- ✅ Layout.tsx or navigation (MODIFIED, +1 link)

**Tier Gating:**
- Wrap page in `requireTier('PRO')` check (frontend)
- Backend already protects API endpoint

---

## 6. Frontend Architecture (Sprint 2)

### Component Tree

```
/organizer/command-center.tsx (page)
├── Head (title, meta)
├── Layout (sidebar + header)
├── <Filters>
│   ├── StatusTabs (Active / Upcoming / Recent / All)
│   └── Optional: DateRangeSelector
├── <Metrics Summary>
│   ├── Total Revenue card
│   ├── Total Items card
│   ├── Aggregate Conversion Rate card
│   └── Pending Actions card
├── <SaleCardsGrid>
│   └── CommandCenterCard (× N)
│       ├── Sale title + status badge
│       ├── Metrics grid (4 columns)
│       ├── Pending actions badge
│       └── "Manage Sale" CTA button
└── <EmptyState> (if no sales)
```

### Styling

- Reuse existing design system (Tailwind + sage-green theme from STATE.md)
- Card layout: 4 columns on desktop, 2 on tablet, 1 on mobile
- Metrics in small bold text (14px) with label below
- Pending action badge top-right corner (red if >3, yellow if 1–3, green if 0)

---

## 7. Performance & Scalability

### Query Strategy (Sprint 1)

**Current Naive Approach (BAD):**
```javascript
for each sale:
  count items (1 query)
  count purchases (1 query)
  count reservations (1 query)
  count favorites (1 query)
  sum revenue (1 query)
// = 5N queries for N sales
```

**Optimized Approach (GOOD):**
```javascript
// Single query with LEFT JOIN + GROUP BY
const metrics = await prisma.sale.findMany({
  where: { organizerId },
  select: {
    id: true,
    title: true,
    startDate: true,
    endDate: true,
    status: true,
    _count: {
      select: {
        items: { where: { draftStatus: { not: 'DRAFT' } } },
        favorites: true,
        purchases: { where: { status: 'PAID' } },
      }
    },
  },
});

// Then use single aggregation query
const aggregations = await prisma.item.groupBy({
  by: ['saleId'],
  where: { saleId: { in: saleIds } },
  _count: true,
  _sum: { price: true },
  _avg: { price: true },
});
```

**Actual Implementation:**
- Use Prisma `findMany` with `_count` for item/favorite counts
- Separate aggregation query for revenue/items-sold (requires `Purchase.groupBy`)
- Cache result in Redis for 5 minutes
- Total queries: 2–3 instead of 5N

**Expected Performance:**
- 50 active sales: <500ms with Redis cache, ~1.5s on cold start
- 10 active sales: <100ms cached, ~300ms cold
- Acceptable for organizer dashboards

---

## 8. Tier Gating

**Current Setup:**
- `requireTier.ts` middleware: `requireTier('PRO')` throws 403 if tier < PRO
- `tierGate.ts`: `FEATURE_TIERS.commandCenter = 'TEAMS'` (line 43 already exists!)

**For Sprint 1:**
- Use `requireTier('PRO')` on the route — command center is PRO feature
- Update `FEATURE_TIERS` if needed (check current value)
- Test: authenticate as SIMPLE user → should get 403

**For Sprint 2:**
- Frontend: Check `user.organizerTier` before rendering page
- Fallback: Show upgrade CTA if user tries to access `/organizer/command-center` but is SIMPLE

---

## 9. Go/No-Go Verdict

### Schema Status: ✅ GO
- All required fields exist
- No migrations needed
- `Sale`, `Item`, `Purchase`, `ItemReservation` all ready

### API Contract: ✅ GO
- Endpoint shape finalized
- Response types finalized
- Caching strategy locked

### Tier Gating: ✅ GO
- `requireTier('PRO')` already wired
- `FEATURE_TIERS.commandCenter` already in code

### Risk Assessment: ✅ LOW
- No schema changes = no data loss risk
- Caching is optional (read-only operation)
- Tier gating tested in S178 (billing feature)
- Query complexity moderate (2–3 queries per organizer, not per item)

### Dependencies: ✅ READY
- Redis available (used by other features)
- Prisma stable for aggregations
- No new npm packages needed

---

## 10. Next Steps & Handoff

### For findasale-dev (Sprint 1):
1. Implement `commandCenterService.ts` with optimized queries + Redis caching
2. Implement `commandCenterController.ts` + `commandCenter.ts` route
3. Add types to `shared/src/types/commandCenter.ts`
4. Update `index.ts` with route registration
5. Add `requireTier('PRO')` to route
6. Test: 5+ organizers with 10–50 sales each, verify response time <1s

### For findasale-dev (Sprint 2):
1. Implement page + component tree per §6
2. Wire up `useCommandCenter.ts` hook
3. Add "Command Center" nav link
4. Test: navigate page, verify card rendering, test status filters
5. Test: SIMPLE-tier user should see 403 or upgrade CTA

### For Patrick (Pre-Deploy):
- [ ] Verify Redis connection on Railway
- [ ] QA endpoint manually: GET /api/organizer/command-center (PRO user)
- [ ] Monitor query performance first week (should be <500ms cached)

---

## 11. Files Changed Summary

### Sprint 1
- ✅ `packages/backend/src/services/commandCenterService.ts` (NEW)
- ✅ `packages/backend/src/controllers/commandCenterController.ts` (NEW)
- ✅ `packages/backend/src/routes/commandCenter.ts` (NEW)
- ✅ `packages/backend/src/index.ts` (MODIFIED, +2 lines)
- ✅ `packages/shared/src/types/commandCenter.ts` (NEW)

### Sprint 2
- ✅ `packages/frontend/pages/organizer/command-center.tsx` (NEW)
- ✅ `packages/frontend/components/CommandCenterCard.tsx` (NEW)
- ✅ `packages/frontend/hooks/useCommandCenter.ts` (NEW)
- ✅ `packages/frontend/components/Layout.tsx` or nav (MODIFIED, +1 link)

**Total Files:** 8 new, 2 modified = 10 files changed across both sprints

---

## Appendix: Response Example

```json
{
  "success": true,
  "organizerId": "org_abc123",
  "summary": {
    "totalActiveSales": 4,
    "totalItems": 187,
    "totalRevenue": 3240.50,
    "totalFavorites": 56,
    "aggregateConversionRate": 34.2,
    "totalPendingActions": 12
  },
  "sales": [
    {
      "id": "sale_001",
      "title": "Estate Sale - Downtown",
      "status": "PUBLISHED",
      "startDate": "2026-03-20T09:00:00Z",
      "endDate": "2026-03-22T17:00:00Z",
      "daysUntilStart": 4,
      "itemsListed": 45,
      "itemsSold": 18,
      "itemsAvailable": 25,
      "itemsReserved": 2,
      "revenue": 890.25,
      "conversionRate": 40.0,
      "avgItemPrice": 19.78,
      "favoritesCount": 14,
      "viewsCount": 237,
      "pendingActions": {
        "itemsNeedingPhotos": 3,
        "pendingHolds": 1,
        "unpaidPurchases": 0,
        "total": 4
      }
    }
  ]
}
```
