# ADR-068 Sprint 1 Implementation Specification

**Feature:** Command Center Dashboard (Multi-Sale Overview)
**Tier:** PRO
**Status:** READY FOR DEVELOPMENT
**Target Dev Time:** 4–5 days (findasale-dev)

---

## Overview

This spec defines the exact code requirements for Sprint 1 (backend only). Sprint 2 (frontend UI) will follow after backend API is validated.

---

## 1. New File: `commandCenterService.ts`

**Path:** `packages/backend/src/services/commandCenterService.ts`

**Purpose:**
- Fetch organizer's sales and calculate metrics
- Cache results in Redis with 5-minute TTL
- Handle invalidation on mutations

**Responsibilities:**
1. Query sales filtered by status/date range
2. Aggregate item counts (listed, sold, available, reserved)
3. Aggregate purchase/revenue data
4. Calculate per-sale metrics (conversion rate, avg price)
5. Get pending actions count
6. Cache and invalidate

**Key Functions:**

### `getCommandCenterSummary(organizerId: string, filters?: Filters): Promise<CommandCenterSummary>`

**Input:**
```typescript
interface Filters {
  status?: 'active' | 'upcoming' | 'recent' | 'all';
  dateFrom?: string; // ISO date
  dateTo?: string; // ISO date
}
```

**Logic:**

1. **Resolve Status Filter** (if provided):
   ```
   active = NOW >= startDate AND NOW <= endDate AND status='PUBLISHED'
   upcoming = startDate > NOW AND status='PUBLISHED' OR 'DRAFT'
   recent = endDate < NOW AND status='ENDED'
   all = no filter
   ```

2. **Query Sales:**
   ```javascript
   const sales = await prisma.sale.findMany({
     where: {
       organizerId,
       ...(filter condition based on status)
     },
     select: {
       id: true,
       title: true,
       status: true,
       startDate: true,
       endDate: true,
       _count: {
         select: {
           items: {
             where: { draftStatus: { not: 'DRAFT' } } // published items only
           },
           favorites: true,
           purchases: true,
         }
       }
     },
     orderBy: { startDate: 'desc' }
   });
   ```

3. **For Each Sale, Query Metrics:**
   ```javascript
   const metrics = await prisma.item.groupBy({
     by: ['saleId'],
     where: {
       saleId: { in: saleIds },
       draftStatus: { not: 'DRAFT' }
     },
     _count: { id: true },
     _sum: { price: true },
     _avg: { price: true }
   });

   const itemStatus = await prisma.item.groupBy({
     by: ['saleId', 'status'],
     where: {
       saleId: { in: saleIds },
       draftStatus: { not: 'DRAFT' }
     },
     _count: { id: true }
   });

   const revenue = await prisma.purchase.groupBy({
     by: ['saleId'],
     where: {
       saleId: { in: saleIds },
       status: 'PAID'
     },
     _sum: { amount: true }
   });

   const reservations = await prisma.itemReservation.groupBy({
     by: ['saleId'],
     where: {
       saleId: { in: saleIds },
       status: 'PENDING'
     },
     _count: { id: true }
   });

   const unpaid = await prisma.purchase.groupBy({
     by: ['saleId'],
     where: {
       saleId: { in: saleIds },
       status: 'PENDING'
     },
     _count: { id: true }
   });

   const noPhotos = await prisma.item.groupBy({
     by: ['saleId'],
     where: {
       saleId: { in: saleIds },
       draftStatus: { not: 'DRAFT' },
       photoUrls: { equals: [] }
     },
     _count: { id: true }
   });
   ```

4. **Calculate Aggregates:**
   - For each sale, compute derived metrics:
     - `conversionRate = (itemsSold / itemsListed) * 100`
     - `avgItemPrice = totalPrice / itemsListed`
     - `daysUntilStart = (startDate - NOW) / 86400000`
     - Pending actions = itemsNeedingPhotos + pendingHolds + unpaidPurchases

5. **Build Response:**
   ```javascript
   const summary = {
     totalActiveSales: sales.filter(s => isActive).length,
     totalItems: sumItemsListed,
     totalRevenue: sumRevenue,
     totalFavorites: sumFavorites,
     aggregateConversionRate: (totalSold / totalListed) * 100,
     totalPendingActions: sumPendingActions
   };

   const saleDetails = sales.map(sale => ({
     id: sale.id,
     title: sale.title,
     status: sale.status,
     startDate: sale.startDate,
     endDate: sale.endDate,
     daysUntilStart: calculateDaysUntil(sale.startDate),
     itemsListed: countListed[sale.id] || 0,
     itemsSold: countSold[sale.id] || 0,
     itemsAvailable: countAvailable[sale.id] || 0,
     itemsReserved: countReserved[sale.id] || 0,
     revenue: totalRevenue[sale.id] || 0,
     conversionRate: ...,
     avgItemPrice: avgPrice[sale.id] || 0,
     favoritesCount: sale._count.favorites,
     viewsCount: sale.qrScanCount || 0,
     pendingActions: {
       itemsNeedingPhotos: noPhotos[sale.id] || 0,
       pendingHolds: reservations[sale.id] || 0,
       unpaidPurchases: unpaid[sale.id] || 0,
       total: (noPhotos[sale.id] || 0) + (reservations[sale.id] || 0) + (unpaid[sale.id] || 0)
     }
   }));

   return { success: true, organizerId, summary, sales: saleDetails };
   ```

6. **Cache:**
   ```javascript
   const cacheKey = `command-center:${organizerId}`;
   const cached = await redis.get(cacheKey);
   if (cached) return JSON.parse(cached);

   // fetch from DB...

   await redis.setex(cacheKey, 300, JSON.stringify(result)); // 5 min TTL
   return result;
   ```

**Error Handling:**
- If Redis unavailable: continue without caching (log warning)
- If Prisma query fails: return 500 with "Failed to fetch metrics"

---

### `invalidateCommandCenterCache(organizerId: string): Promise<void>`

**Purpose:** Delete Redis cache when mutations affect sales/items/purchases

**Implementation:**
```javascript
const cacheKey = `command-center:${organizerId}`;
await redis.del(cacheKey);
```

**Called From:**
- `itemController.ts`: after createItem, updateItem, deleteItem
- `purchaseController.ts`: after purchase status change
- `saleController.ts`: after sale status change

---

## 2. New File: `commandCenterController.ts`

**Path:** `packages/backend/src/controllers/commandCenterController.ts`

**Purpose:** HTTP request handler for `/api/organizer/command-center`

**Code:**
```typescript
import { Router } from 'express';
import { AuthRequest, authenticate } from '../middleware/auth';
import { requireTier } from '../middleware/requireTier';
import { getCommandCenterSummary, invalidateCommandCenterCache } from '../services/commandCenterService';

export const getCommandCenter = async (req: AuthRequest, res: Response) => {
  try {
    if (!req.user?.id || !req.user?.organizerId) {
      return res.status(401).json({ success: false, error: 'Unauthorized' });
    }

    const { status, dateFrom, dateTo } = req.query;

    const filters = {
      status: (status as string)?.toLowerCase() || 'active',
      dateFrom: dateFrom as string | undefined,
      dateTo: dateTo as string | undefined,
    };

    const result = await getCommandCenterSummary(req.user.organizerId, filters);
    res.json(result);
  } catch (error) {
    console.error('Command Center error:', error);
    res.status(500).json({ success: false, error: 'Failed to fetch command center' });
  }
};
```

---

## 3. New File: `routes/commandCenter.ts`

**Path:** `packages/backend/src/routes/commandCenter.ts`

**Code:**
```typescript
import { Router } from 'express';
import { authenticate } from '../middleware/auth';
import { requireTier } from '../middleware/requireTier';
import { getCommandCenter } from '../controllers/commandCenterController';

const router = Router();

// GET /api/organizer/command-center
router.get(
  '/',
  authenticate,
  requireTier('PRO'),
  getCommandCenter
);

export default router;
```

---

## 4. Modified File: `index.ts`

**Path:** `packages/backend/src/index.ts`

**Changes:**
```typescript
// Add import at top
import commandCenterRoutes from './routes/commandCenter';

// Register route with app (after other organizer routes)
app.use('/api/organizer/command-center', commandCenterRoutes);
```

---

## 5. New File: Types Definition

**Path:** `packages/shared/src/types/commandCenter.ts`

**Code:**
```typescript
export interface PendingActions {
  itemsNeedingPhotos: number;
  pendingHolds: number;
  unpaidPurchases: number;
  total: number;
}

export interface SaleMetrics {
  id: string;
  title: string;
  status: 'DRAFT' | 'PUBLISHED' | 'ENDED';
  startDate: string; // ISO
  endDate: string; // ISO
  daysUntilStart: number;
  itemsListed: number;
  itemsSold: number;
  itemsAvailable: number;
  itemsReserved: number;
  revenue: number;
  conversionRate: number;
  avgItemPrice: number;
  favoritesCount: number;
  viewsCount: number;
  pendingActions: PendingActions;
}

export interface CommandCenterSummary {
  totalActiveSales: number;
  totalItems: number;
  totalRevenue: number;
  totalFavorites: number;
  aggregateConversionRate: number;
  totalPendingActions: number;
}

export interface CommandCenterResponse {
  success: boolean;
  organizerId: string;
  summary: CommandCenterSummary;
  sales: SaleMetrics[];
}

export interface CommandCenterFilters {
  status?: 'active' | 'upcoming' | 'recent' | 'all';
  dateFrom?: string;
  dateTo?: string;
}
```

---

## 6. Cache Invalidation Hooks

**In `itemController.ts`:**
After `createItem`, `updateItem`, `deleteItem`:
```typescript
import { invalidateCommandCenterCache } from '../services/commandCenterService';

// After item mutation...
await invalidateCommandCenterCache(sale.organizerId);
```

**In `purchaseController.ts`:**
After purchase status update:
```typescript
await invalidateCommandCenterCache(purchase.sale.organizerId);
```

**In `saleController.ts`:**
After `updateSaleStatus`:
```typescript
await invalidateCommandCenterCache(sale.organizerId);
```

---

## 7. Testing Checklist

### Unit Tests (commandCenterService.ts)
- [ ] Metrics aggregation with 0 items
- [ ] Metrics aggregation with 10 items, 5 sold
- [ ] Status filter: active (current date in range)
- [ ] Status filter: upcoming (future startDate)
- [ ] Status filter: recent (past endDate)
- [ ] Cache hit/miss behavior
- [ ] Cache invalidation on mutation

### Integration Tests (API endpoint)
- [ ] GET /api/organizer/command-center returns 401 (no auth)
- [ ] GET /api/organizer/command-center returns 403 (SIMPLE tier)
- [ ] GET /api/organizer/command-center returns 200 (PRO tier)
- [ ] Response structure matches CommandCenterResponse type
- [ ] Metrics are accurate (spot check 3 sales)
- [ ] Performance: response <500ms with cache, <1.5s cold
- [ ] Date filters work (dateFrom/dateTo)

### Smoke Tests (end-to-end)
- [ ] Create 5 sales for test organizer
- [ ] Add items to each sale
- [ ] Create purchases for some items
- [ ] Create holds on some items
- [ ] Hit endpoint, verify counts match
- [ ] Edit item, verify cache invalidates
- [ ] Create new purchase, verify cache invalidates

---

## 8. Deployment Checklist

- [ ] All code merged to `main` branch
- [ ] TypeScript builds clean (`pnpm build` in both backend + frontend)
- [ ] Tests passing (unit + integration)
- [ ] Railway deploy successful (no build errors)
- [ ] Redis connection verified on Railway
- [ ] API endpoint tested manually with dev/staging organizer (PRO tier)
- [ ] Response time logged and acceptable (<1s)

---

## 9. Acceptance Criteria

✅ **Go to Sprint 2 if:**
1. API endpoint exists and returns 200
2. Response shape matches ADR-068 spec
3. Metrics are within ±1% of manual spot check
4. Performance acceptable (< 1.5s cold, <500ms cached)
5. Tier gating enforced (SIMPLE gets 403)
6. Cache invalidation works on mutations

❌ **Block Sprint 2 if:**
1. Endpoint returns 5xx errors on production organizers
2. Response time >3s on cold start
3. Metrics significantly off (>5% error)
4. Tier gating missing or bypassable
5. Redis unavailable and no graceful fallback

---

## 10. Known Unknowns & Future Optimization

### Future (Phase 2)
- PostgreSQL materialized view + trigger-based refresh
- Elasticsearch for faster aggregations on 100+ sales
- Graphql subscription for real-time metric updates
- Export to CSV/PDF

### Current Limitations (Acceptable for Sprint 1)
- No real-time updates (data stale 5 minutes max)
- No per-item metrics per sale (only aggregates)
- No forecasting (predicted revenue, etc.)

---

## Files Checklist

✅ Sprint 1 deliverables:
- [ ] `commandCenterService.ts` (NEW, ~250 lines)
- [ ] `commandCenterController.ts` (NEW, ~25 lines)
- [ ] `routes/commandCenter.ts` (NEW, ~15 lines)
- [ ] `index.ts` (MODIFIED, +3 lines)
- [ ] `shared/src/types/commandCenter.ts` (NEW, ~50 lines)
- [ ] Cache invalidation in 3 existing controllers (MODIFIED, +5 lines each)

**Total:** 5 new files, 4 modified files, ~360 lines of code
