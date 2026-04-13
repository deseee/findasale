## ADR — Seller Performance Dashboard (Feature #6) — 2026-03-15

### Decision

Implement a comprehensive analytics dashboard for estate sale organizers to track sale performance in real-time. The dashboard surfaces key metrics, benchmarks, and pricing recommendations powered by Stripe payment data + existing sale/item/purchase records. Schema requires no changes; all metrics computed at query time and cached.

---

### Scope

**Target Metrics (8 primary):**
1. **Revenue per Sale** — Total amount paid (from Stripe payment intents) minus platform fees, grouped by sale
2. **Top-Selling Items** — Items ranked by purchase volume + revenue contribution within a sale
3. **Conversion Rate** — (Purchases / Unique Item Views) × 100% — estimated from favorite count as proxy for "view interest"
4. **Average Price per Category** — Mean item price by category within a sale (e.g., furniture avg $85, jewelry avg $200)
5. **Hold/No-Show Rate** — (Expired Holds + Cancelled Holds) / Total Holds created — tracks purchase reliability
6. **Item Health Score** — Average health score (0–100) across all items in a sale — tied to Listing Factory (#27)
7. **Sell-Through Rate** — (Sold Items / Total Items Listed) × 100% per sale
8. **Seasonal Price Recommendations** — AI-powered pricing suggestions based on category + season + historical sell-through

**Secondary Features (in first sprint):**
- Date range selector (Last 7 days, 30 days, custom range)
- Sale picker (single sale detail OR multi-sale comparison)
- Comparison to "Grand Rapids average" (organizer's own average vs. area benchmark)
- Export as CSV/PDF for record-keeping

**Out of Scope (Phase 2+):**
- Real-time bidding analytics (requires live auction events — feature #15)
- Shopper demographic insights (requires user accounts at purchase time — future phase)
- Fraud/bot detection analytics (feature #17)
- Multi-metric goal tracking (future gamification)

---

### Data Sources

| Metric | Source(s) | Fetch Method | Refresh Cadence |
|--------|-----------|--------------|-----------------|
| Revenue per Sale | Stripe API (`list_payment_intents`) + Purchase records (saleId) | Server-side Stripe query at request time, joined with local Purchase table | On-demand, cached 1h |
| Top-Selling Items | Purchase table (count by itemId, sum amount) within a saleId | Local DB query | On-demand |
| Conversion Rate | Favorite count (proxy for item interest) + Purchase count | Local DB query | On-demand |
| Avg Price per Category | Item + Purchase join on itemId, group by category, avg(price) | Local DB query | On-demand |
| Hold/No-Show Rate | ItemReservation (count by status) within a saleId | Local DB query | On-demand |
| Item Health Score | Item health scores (computed per Listing Factory #27) within saleId, avg | Local DB query with Listing Factory utility | On-demand |
| Sell-Through Rate | Item (count by status=SOLD) / Item (count all) within saleId | Local DB query | On-demand |
| Seasonal Recommendations | Item price history + category + season + AI model (Haiku) | Hybrid: local analytics + Stripe context-enrichment at endpoint | On-demand, cached 6h |

**Stripe Integration Details:**
- Call `list_payment_intents` server-side with filter: `organizer's Stripe account ID + date range`
- Stripe MCP is already connected (S172); backend can call it directly
- Stripe data is authoritative for revenue; local Purchase records are backups
- Cache layer: in-memory cache (node-cache) OR database-stored snapshot (Snapshot table — optional) with 1h TTL
- No frontend calls to Stripe; all Stripe queries happen in backend controller

---

### API Contract

**Endpoint:** `GET /api/organizer/performance`

**Query Parameters:**
```
?saleId=sale_abc123        // required: single sale ID
&range=30d                  // optional: "7d", "30d", "90d", "custom" (default: "30d")
&from=2026-02-13T00:00:00Z  // optional: ISO8601 start (required if range=custom)
&to=2026-03-15T23:59:59Z    // optional: ISO8601 end (required if range=custom)
```

**Response Shape:**
```json
{
  "success": true,
  "organizerId": "org_xyz",
  "saleId": "sale_abc123",
  "dateRange": {
    "from": "2026-02-13T00:00:00Z",
    "to": "2026-03-15T23:59:59Z",
    "label": "Last 30 days"
  },
  "metrics": {
    "revenue": {
      "total": 2450.75,
      "currency": "USD",
      "platformFeeAmount": 245.08,
      "strikeThrough": 2695.83,
      "organiserNetRevenue": 2205.67,
      "sourceCounts": {
        "online": 18,
        "pos": 3
      }
    },
    "itemMetrics": {
      "topSellingItems": [
        {
          "itemId": "item_001",
          "title": "Victorian Oak Desk",
          "category": "furniture",
          "unitsSold": 1,
          "totalRevenue": 350.00,
          "avgPrice": 350.00,
          "healthScore": 92
        },
        {
          "itemId": "item_002",
          "title": "Set of 4 Dining Chairs",
          "category": "furniture",
          "unitsSold": 2,
          "totalRevenue": 240.00,
          "avgPrice": 120.00,
          "healthScore": 85
        }
      ],
      "categoryBreakdown": [
        {
          "category": "furniture",
          "itemsListed": 15,
          "itemsSold": 8,
          "sellThroughRate": 0.533,
          "avgListPrice": 175.50,
          "avgSoldPrice": 155.25,
          "totalRevenue": 1242.00,
          "healthScoreAvg": 88.4
        },
        {
          "category": "vintage",
          "itemsListed": 12,
          "itemsSold": 6,
          "sellThroughRate": 0.50,
          "avgListPrice": 45.00,
          "avgSoldPrice": 42.00,
          "totalRevenue": 252.00,
          "healthScoreAvg": 82.1
        }
      ],
      "aggregateHealthScore": 85.25
    },
    "purchasingMetrics": {
      "conversionRate": 0.48,
      "conversionRateNote": "48% of favorited items were purchased",
      "totalUniqueBuyers": 12,
      "averageCartValue": 204.23,
      "repeatBuyerRate": 0.25
    },
    "holdMetrics": {
      "holdsCreated": 22,
      "holdsExpired": 5,
      "holdsCancelled": 2,
      "holdsConverted": 15,
      "noShowRate": 0.318,
      "noShowRateNote": "31.8% of holds did not convert to purchase"
    },
    "recommendations": {
      "seasonalPricingTips": [
        {
          "category": "furniture",
          "basePrice": 175.50,
          "seasonalFactor": 1.12,
          "recommendedPrice": 196.56,
          "rationale": "Mid-March is peak home refreshing season; furniture demand up 12% historically",
          "confidence": 0.78
        },
        {
          "category": "vintage",
          "basePrice": 45.00,
          "seasonalFactor": 0.95,
          "recommendedPrice": 42.75,
          "rationale": "Vintage decorative items see seasonal dips post-holiday (March = lull period)",
          "confidence": 0.65
        }
      ],
      "actionItems": [
        {
          "priority": "high",
          "title": "Improve Furniture Photography",
          "reason": "Furniture items with health score < 80 have 30% lower conversion rate",
          "estimate": "2–3 items need better photos"
        },
        {
          "priority": "medium",
          "title": "Reduce Hold Duration for Quick-Turnaround Categories",
          "reason": "31.8% no-show rate suggests 48h hold duration is too long for vintage/small items",
          "estimate": "Consider 24h for items < $50"
        }
      ]
    }
  },
  "lastUpdated": "2026-03-15T14:32:10Z",
  "cacheExpiry": "2026-03-15T15:32:10Z"
}
```

**HTTP Status Codes:**
- `200 OK` — Metrics returned successfully
- `400 Bad Request` — Invalid dateRange or saleId
- `401 Unauthorized` — User not logged in OR doesn't own sale
- `404 Not Found` — Sale not found
- `500 Internal Server Error` — Stripe API failure (include fallback: serve cached metrics if available)

**Errors:**
```json
{
  "success": false,
  "error": "stripe_unavailable",
  "message": "Payment data temporarily unavailable. Showing cached metrics from 2h ago.",
  "cachedMetrics": { ... },
  "cachedAt": "2026-03-15T12:32:10Z"
}
```

---

### Schema Plan

**No Schema Changes Required.**

All metrics are computed on-the-fly from existing tables:
- `Purchase` — revenue, cart metrics
- `Item` — category, price, health score (from Listing Factory)
- `ItemReservation` — hold/no-show rates
- `Sale` — saleId, date filtering

**Optional Optimization (Post-MVP):**
If query performance degrades, add a `PerformanceSnapshot` table:
```prisma
model PerformanceSnapshot {
  id String @id @default(cuid())
  organizerId String
  saleId String
  dateRange String    // "7d", "30d", custom ISO range
  metrics Json        // entire metrics object, serialized
  computedAt DateTime
  expiresAt DateTime  // 1h after computedAt for refresh
  createdAt DateTime @default(now())
  @@index([organizerId, saleId, dateRange])
  @@index([expiresAt])
}
```

**No migration needed for MVP.** If added later, use standard Prisma migrate.

---

### Caching Strategy

**In-Memory Cache (MVP Approach):**
- Use `node-cache` package (already in backend dependencies)
- Cache key format: `perf:org_{organizerId}:sale_{saleId}:range_{range}`
- TTL: 1 hour (metrics don't change fast; provides good balance)
- Cache invalidation: On purchase creation (clear sale metrics) + manual organizer refresh button
- Size limit: 100 MB (typical organizer has 3–5 active sales; ~200 KB per sale snapshot)

**Code Pattern:**
```typescript
// In performanceController.ts
const cacheKey = `perf:org_${organizerId}:sale_${saleId}:range_${range}`;
let metrics = cache.get(cacheKey);
if (!metrics) {
  metrics = await computeMetrics(organizerId, saleId, range);
  cache.set(cacheKey, metrics, 3600); // 1h TTL
}
return metrics;
```

**Fallback (Stripe Unavailable):**
- If Stripe API returns error, serve cached metrics with `"cached": true` flag
- If no cache exists, return `500` with descriptive error

**Redis Alternative (Phase 2):**
- Replace node-cache with ioredis when scaling to 100+ organizers
- Same TTL and key format
- Benefits: distributed cache, session persistence across Railway restarts

---

### Frontend Breakdown

**New React Components:**

1. **PerformanceDashboard.tsx** (Page container)
   - Route: `/organizer/performance` (new page)
   - Renders: SaleSelector + DateRangeSelector + MetricsGrid + RecommendationsPanel
   - State: useQuery from react-query (caching, refetch on focus)
   - Fetches: `GET /api/organizer/performance?saleId=...&range=...`

2. **MetricsGrid.tsx** (Main metrics cards)
   - 8 metric cards: Revenue, Top Items, Conversion Rate, Category Breakdown, Hold/No-Show, Health Score, Sell-Through, Recommendations
   - Uses Recharts (already in package.json):
     - BarChart for category breakdown (x: category, y: revenue)
     - LineChart for hold/no-show trend over time (if date range allows)
     - PieChart for sell-through rate (sold vs. unsold segments)
   - Responsive: 2 columns on desktop, 1 on mobile

3. **TopItemsTable.tsx** (Top-selling items card)
   - Table: itemId, title, category, unitsSold, totalRevenue, avgPrice, healthScore
   - Sortable columns (click to sort by revenue/units/price)
   - Link each item to `/items/[id]` for detail view

4. **CategoryBreakdownChart.tsx**
   - Grouped bar chart: category on x-axis, sellThroughRate + revenue on y-axes
   - Tooltip shows: category name, items listed, items sold, avg price, health score

5. **HoldMetricsCard.tsx**
   - Summary stats: holdsCreated, holdsExpired, holdsConverted
   - Single metric: noShowRate prominently displayed
   - Optional sparkline (Recharts LineChart) showing no-show trend over date range

6. **RecommendationsPanel.tsx**
   - Renders seasonal pricing suggestions (table or cards)
   - "Action Items" list with priority badges (high/medium/low)
   - Each recommendation has a reason + estimate

7. **DateRangeSelector.tsx** (Reusable)
   - Buttons: "Last 7d", "Last 30d", "Last 90d", "Custom"
   - If Custom: date picker for from/to (use existing DatePicker component pattern)

8. **SaleSelector.tsx** (Dropdown)
   - Fetches organizer's sales list (already have `/api/organizer/sales` endpoint)
   - Shows sale title + endDate
   - Selected sale triggers dashboard refetch

**Existing Package Usage:**
- `recharts` — already in package.json (v2+); use BarChart, LineChart, PieChart, Tooltip, Legend
- `react-query` — already in package.json (@tanstack/react-query); for caching + async data fetching
- `date-fns` — likely already in project; for date formatting and range calculations

**New npm Packages (if needed):**
- None anticipated; recharts + react-query + date-fns cover all needs

**Tailwind Classes:**
- Existing: flex, grid, rounded-lg, shadow, border, bg-white, text-gray-900
- New: justify-between, items-center (for card headers), gap-4 (spacing between metrics)
- Responsive: `md:grid-cols-2 lg:grid-cols-4` for metrics grid

---

### Risk Assessment

**High-Risk Scenarios:**

1. **Stripe API Downtime**
   - Impact: Metrics unavailable; organizers can't see sales performance
   - Mitigation: Cache metrics aggressively (1h TTL); return cached data if API fails; fallback message: "Showing data from X hours ago"
   - Severity: HIGH (business-critical for organizers)

2. **Query Performance Degradation** (with 1000+ items/organizer)
   - Impact: Dashboard loads slowly (>3s)
   - Mitigation: Add database indexes on (saleId, status), (itemId, price), (userId, createdAt) — verify at test time; consider snapshot table if queries exceed 500ms
   - Severity: MEDIUM (noticed after scale)

3. **Organizer Ownership Bypass**
   - Impact: Organizer A sees organizer B's metrics
   - Mitigation: Always validate `sale.organizerId === req.user.organizerId` before serving metrics
   - Severity: CRITICAL (data privacy breach)

4. **Edge Case: Sale with No Purchases**
   - Impact: Division by zero in conversion rate calc, empty charts
   - Mitigation: Handle gracefully — if no purchases, show "No sales yet" state with helpful message ("List more items" or "Review pricing")
   - Severity: LOW (expected state for new sales)

5. **Stripe Webhook Inconsistency**
   - Impact: Stripe payment_intent.succeeded fires after Purchase record created in DB — slight race condition
   - Mitigation: On fetch, if Stripe amount != DB amount, use Stripe as truth + log discrepancy
   - Severity: LOW (rare; Stripe eventual consistency <1s)

6. **Hold No-Show Rate Calculation**
   - Impact: If holds table has no expiresAt data, rate is undefined
   - Mitigation: Default expiry to `createdAt + sale.holdDurationHours`; ensure all holds have expiresAt field
   - Severity: LOW (schema supports this)

---

### Development Instructions

**Phase 1: Backend (2–3 days)**

1. **Create performanceController.ts**
   - Implement `getOrganizerPerformance(organizerId, saleId, range)` function
   - Call Stripe MCP via `list_payment_intents` (server-side)
   - Compute all 8 metrics using Prisma queries
   - Return response shape matching API contract
   - Include error handling (Stripe down, invalid saleId, etc.)
   - Add caching layer (node-cache)

2. **Create performanceService.ts** (optional, if logic grows)
   - Utility functions: `computeRevenueMetrics()`, `computeCategoryBreakdown()`, `computeHoldMetrics()`, `computePricingRecommendations()`
   - Seasonal pricing logic: base category average × seasonal factor (lookup table or Haiku call)
   - Keep controller thin, logic in service

3. **Add route in sales.ts**
   - `GET /api/organizer/performance` → performanceController.getOrganizerPerformance
   - Auth gate: verify organizer owns sale
   - Query param parsing + validation (dateRange, saleId)

4. **Write integration tests**
   - Mock Stripe MCP responses
   - Test metric calculations (verify revenue sum, conversion rate formula, etc.)
   - Test error scenarios (Stripe down, missing sale)

**Phase 2: Frontend (2–3 days)**

1. **Create pages/organizer/performance.tsx**
   - Main page component
   - Render: SaleSelector → DateRangeSelector → MetricsGrid/RecommendationsPanel
   - useQuery hook with caching

2. **Create components/PerformanceDashboard/MetricsGrid.tsx**
   - 8 metric cards in responsive grid
   - Use Recharts for visualizations

3. **Create components/PerformanceDashboard/TopItemsTable.tsx**
   - Sortable table of top-selling items

4. **Create components/PerformanceDashboard/RecommendationsPanel.tsx**
   - Seasonal pricing suggestions + action items

5. **Create reusable components/DateRangeSelector.tsx**
   - 4 quick-pick buttons + custom date range modal

6. **Create reusable components/SaleSelector.tsx**
   - Dropdown of organizer's sales

7. **Write tests**
   - Snapshot tests for metric cards
   - Interaction tests (select sale, change date range, verify refetch)

8. **Polish & Accessibility**
   - Ensure all metrics have accessible labels (aria-label)
   - Test keyboard navigation (Tab through metric cards)
   - Test on mobile (1 column layout)

---

### Flagged for Patrick

**Decision Required:**

1. **Stripe Cash Tracking** — Should performance dashboard include cash POS transactions? Currently, Purchase records exist for online + POS sales. Stripe API only tracks online. Decision: (a) Include both (show "Online" and "POS" sources separately), or (b) Online only (defer POS metrics to post-beta).
   - **Recommendation:** Include both. Organizers want full picture. Stripe tracks online; POS is in local Purchase table with `source="POS"`. Separate them in the "sourceCounts" field so organizers see the split.

2. **Seasonal Pricing Confidence** — Should we AI-generate seasonal recommendations for every category, or only high-confidence suggestions (>70% confidence)? Current approach: include all with confidence scores visible.
   - **Recommendation:** Show all with confidence badges. Organizer should decide what to trust. Flag low-confidence (<60%) with a warning icon.

3. **No-Show Threshold** — When should we flag a high no-show rate as "actionable"? Current threshold: 25%+ is worth a recommendation.
   - **Recommendation:** Use 25% as the gate. If no-show rate > 25%, show "Reduce Hold Duration" action item.

4. **Seasonal Pricing Frequency** — Should recommendations refresh daily (compute from scratch) or cache like other metrics?
   - **Recommendation:** Cache at 6h (seasonal factors don't change hour-to-hour). Seasonal pricing is guidance, not real-time.

5. **MVP vs. Phase 2** — Which items are must-have for launch vs. deferred to Phase 2?
   - **MVP (Sprint 1):** Revenue + top items + conversion rate + category breakdown + hold no-show rate
   - **Phase 2 (Sprint 2):** Seasonal pricing recommendations, action items, export CSV/PDF, multi-sale comparison

**Env Vars (No New Ones):**
- Existing Stripe MCP integration already configured (S172)
- Cache TTL hardcoded to 1h; can be env var later if needed

**Patrick Ops Checklist:**
- [ ] After MVP backend ships, test Stripe integration: create test payment intent, verify it appears in dashboard metrics
- [ ] Verify organizer ownership gate: log in as Organizer A, confirm can't see Organizer B's sales metrics
- [ ] Load test: create mock sale with 500+ items/purchases; verify dashboard loads in <2s

---

## Rollback: Schema Migration (if snapshot table added later)

**Migration File:** `20260320000000_add_performance_snapshot_table.sql`

**Up:**
```sql
CREATE TABLE "PerformanceSnapshot" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "organizerId" TEXT NOT NULL,
  "saleId" TEXT NOT NULL,
  "dateRange" TEXT NOT NULL,
  "metrics" JSONB NOT NULL,
  "computedAt" TIMESTAMP(3) NOT NULL,
  "expiresAt" TIMESTAMP(3) NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX "PerformanceSnapshot_organizerId_saleId_dateRange_idx"
  ON "PerformanceSnapshot"("organizerId", "saleId", "dateRange");

CREATE INDEX "PerformanceSnapshot_expiresAt_idx"
  ON "PerformanceSnapshot"("expiresAt");
```

**Down:**
```sql
DROP INDEX IF EXISTS "PerformanceSnapshot_expiresAt_idx";
DROP INDEX IF EXISTS "PerformanceSnapshot_organizerId_saleId_dateRange_idx";
DROP TABLE IF EXISTS "PerformanceSnapshot";
```

**Rollback Playbook (if needed post-deploy):**
1. Run: `npx prisma migrate resolve --rolled-back 20260320000000_add_performance_snapshot_table`
2. Code reverts to in-memory cache (node-cache) — no app restart required
3. Performance will degrade under load until either (a) cache fills up, or (b) new deploy with optimization lands
4. **Timeline:** Rollback is safe; can happen anytime. Cache ensures dashboard stays live.

---

### Summary

The Seller Performance Dashboard gives organizers actionable insights into their sales in one view: revenue, item performance, buyer behavior, and pricing guidance. Built on Stripe MCP (now connected), Prisma queries, and Recharts visualizations. Two-sprint build: backend metrics + caching (S1), then frontend UI + recommendations (S2). No schema changes for MVP; optional snapshot table for post-scale optimization.

**Next Step:** findasale-dev implements Phase 1 backend. Patrick provides decision on Stripe cash tracking + seasonal pricing confidence thresholds. Deploy to Railway/Vercel after QA green-light.
