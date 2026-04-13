# ADR — Feature #30 (AI Item Valuation), #46 (Treasure Typology Classifier), #69 (Offline Mode)

**Date:** 2026-03-17
**Status:** Architecture Design Complete — Ready for Implementation
**Decision Made By:** Systems Architect
**Features:** #30 (PRO), #46 (PRO), #69 (PRO)
**Sprint Allocation:** #30 = 2 sprints, #46 = 2 sprints, #69 = 3 sprints (7 sprints total, ~5 weeks)

---

## Executive Summary

Three PRO features designed for 2026 Q2 delivery. All leverage existing cloud AI infrastructure (Google Vision + Claude Haiku). #30 and #46 add organizer-facing intelligence; #69 adds offline-first catalog capability with async sync. Zero schema conflicts. Clear tier gating. Feasible within current stack. **Go.**

---

## Feature #30: AI Item Valuation & Comparables [PRO]

### Business Value
Organizers price items with confidence by seeing comparable sold-item prices. Reduces underpricing, accelerates listing, increases revenue per sale.

### Design Overview

**Phase 1 (Sprint 1):** Statistical comparables model — find sold items in same category/price band, return min/median/max as estimated range.

**Phase 2 (Sprint 2):** Embedding-based similarity — use multi-modal embeddings (Vision labels + description text) to find semantically similar sold items, weight by recency + condition match.

### Schema Changes

**New Model: `ItemValuation`**
```prisma
model ItemValuation {
  id                 String    @id @default(cuid())
  itemId             String    @unique
  item               Item      @relation(fields: [itemId], references: [id], onDelete: Cascade)

  // Valuation results
  suggestedPriceLow  Float     // cents
  suggestedPriceHigh Float     // cents
  suggestedPriceMid  Float     // cents (median of comparables)
  confidenceScore    Int       // 0-100 based on sample size and recency
  method             String    // 'STATISTICAL' | 'EMBEDDING'

  // Comparables metadata
  basedOnCount       Int       // Number of sold items used in calculation
  categoryMatches    Int       // Count in same category
  conditionMatches   Int       // Count with matching condition band

  // Filtering & recency
  minDaysOld         Int       // Oldest comparable sale (days ago)
  maxDaysOld         Int       // Newest comparable sale (days ago)

  // Raw metadata (diagnostic)
  rawResponse        Json?     // Comparables array: [ { price, saleDate, condition, similarity }, ... ]

  generatedAt        DateTime  @default(now())
  updatedAt          DateTime  @updatedAt
}

// Index for fast lookup during item detail render
@@index([itemId])
@@index([generatedAt])
```

**Relation on Item:**
```prisma
model Item {
  // ... existing fields ...
  valuation       ItemValuation?
}
```

**Migration File:** `20260317_add_item_valuation.sql`
```sql
CREATE TABLE "ItemValuation" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "itemId" TEXT NOT NULL UNIQUE,
  "suggestedPriceLow" DOUBLE PRECISION NOT NULL,
  "suggestedPriceHigh" DOUBLE PRECISION NOT NULL,
  "suggestedPriceMid" DOUBLE PRECISION NOT NULL,
  "confidenceScore" INTEGER NOT NULL,
  "method" TEXT NOT NULL,
  "basedOnCount" INTEGER NOT NULL,
  "categoryMatches" INTEGER NOT NULL,
  "conditionMatches" INTEGER NOT NULL,
  "minDaysOld" INTEGER,
  "maxDaysOld" INTEGER,
  "rawResponse" JSONB,
  "generatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "ItemValuation_itemId_fkey" FOREIGN KEY ("itemId") REFERENCES "Item"("id") ON DELETE CASCADE
);
CREATE INDEX "ItemValuation_itemId_idx" ON "ItemValuation"("itemId");
CREATE INDEX "ItemValuation_generatedAt_idx" ON "ItemValuation"("generatedAt");
```

### API Contract

**Endpoint 1: Generate Valuation (Async)**
```
POST /api/items/:itemId/valuation/generate

Request: {}
Response: {
  status: 'QUEUED',
  jobId: string
}

Authentication: requireTier('PRO')
```

**Endpoint 2: Get Valuation**
```
GET /api/items/:itemId/valuation

Response:
{
  data: {
    itemId: string,
    suggestedPriceLow: number,
    suggestedPriceHigh: number,
    suggestedPriceMid: number,
    confidenceScore: 0–100,
    method: 'STATISTICAL' | 'EMBEDDING',
    basedOnCount: number,
    categoryMatches: number,
    conditionMatches: number,
    minDaysOld: number,
    maxDaysOld: number,
    generatedAt: ISO8601,
    _status: 'READY' | 'INSUFFICIENT_DATA' | 'GENERATING'
  },
  error?: string  // if INSUFFICIENT_DATA: "Need 10+ comparables to generate valuation"
}

Authentication: requireTier('PRO')
Status: 200 (READY), 202 (GENERATING), 400 (INSUFFICIENT_DATA)
```

### Implementation Details

**Service: `valuationService.ts`**

1. **Phase 1: Statistical Model**
   ```
   findComparables(item: Item):
     - Query Purchase where item.saleId IS DIFFERENT
     - Match: same category, condition within 1 band
     - Filter: sold at least 7 days ago (avoid current/upcoming sales)
     - Sort: most recent first
     - Return: min, median, max prices
     - Threshold: if count < 10, return { insufficient_data: true }
     - Confidence = min(count / 100, 100) * recency_bonus
   ```

2. **Phase 2: Embedding-Based Similarity** (Sprint 2)
   - Requires `embedding` field on Item (already in schema)
   - Use cosine similarity to find sold items with similar embeddings
   - Weight results: 40% recency, 30% condition match, 30% similarity score
   - Fallback to statistical if embedding is null

3. **Async Job Processing**
   ```
   Node-cron job (runs every 4 hours):
   - Find all PRO organizer items without valuation
   - Batch generate valuations
   - Log failures, skip retries if not improving
   ```

### Frontend Integration

**Component: `ValuationWidget.tsx` (organizer add-items flow)**
```
Displays when:
- Organizer is PRO tier
- Item is in same category as 10+ sold items
- User clicks "See comparable sales"

Shows:
- Price range (low–high)
- Confidence badge (e.g., "83% confident")
- "Based on 23 recent sales in Furniture, Excellent condition"
- Breakdown: chart of comparable sales by price band
- Recency: "Most recent: 3 days ago"

Actions:
- Apply price suggestion (sets item.price to mid)
- Dismiss and set custom price
```

### Risk & Mitigation

| Risk | Severity | Mitigation |
|------|----------|-----------|
| Insufficient sold items in category | Medium | Clearly show "Not enough comparables yet" instead of wrong suggestions |
| Outlier prices skewing median | Medium | Exclude top/bottom 5% of comparable prices in median calc |
| Stale embeddings causing poor similarity | Medium | Phase 1 is statistical only; Phase 2 requires fresh embeddings |
| Performance: querying 10K+ purchases per item | High | Add indexes: `Purchase(saleId, item.category, item.condition, createdAt)` |

---

## Feature #46: Treasure Typology Classifier [PRO]

### Business Value
AI-powered item classification into collector categories (Art Deco, Mid-Century Modern, Americana, etc.) suggests relevant tags and improves search discoverability. Enables "Collector Typology" dashboards (future: "I collect MCM — show me all MCM items").

### Design Overview

**Approach:** Use Claude Haiku vision API (existing infrastructure) to classify items into 10 typology categories with confidence scores. Store classification, allow organizer to correct/override. Log corrections for future fine-tuning.

### Schema Changes

**New Model: `ItemTypology`**
```prisma
model ItemTypology {
  id                    String   @id @default(cuid())
  itemId                String   @unique
  item                  Item     @relation(fields: [itemId], references: [id], onDelete: Cascade)

  // Primary classification
  primaryCategory       String   // Required: one of TypologyCategory enum
  primaryConfidence     Float    // 0.0–1.0
  secondaryCategory     String?  // Optional: fallback category if primary weak
  secondaryConfidence   Float?   // 0.0–1.0

  // Raw AI response for audit trail
  rawResponse           Json?    // Full Haiku response: { category, confidence, reasoning }

  // Organizer feedback
  organizer_reviewed    Boolean  @default(false)
  organizer_correctedTo String?  // If organizer manually changed classification
  correctionReason      String?  // Organizer note (diagnostic)

  classifiedAt          DateTime @default(now())
  updatedAt             DateTime @updatedAt
}

// Typology categories enum
enum TypologyCategory {
  ART_DECO
  MID_CENTURY_MODERN
  AMERICANA
  VICTORIAN
  INDUSTRIAL
  FARMHOUSE
  RETRO_ATOMIC
  PRIMITIVE_FOLK_ART
  ART_NOUVEAU
  CONTEMPORARY
  OTHER
}

// Relation on Item
model Item {
  // ... existing fields ...
  typology            ItemTypology?
}
```

**Migration File:** `20260317_add_item_typology.sql`
```sql
CREATE TYPE "TypologyCategory" AS ENUM (
  'ART_DECO', 'MID_CENTURY_MODERN', 'AMERICANA', 'VICTORIAN',
  'INDUSTRIAL', 'FARMHOUSE', 'RETRO_ATOMIC', 'PRIMITIVE_FOLK_ART',
  'ART_NOUVEAU', 'CONTEMPORARY', 'OTHER'
);

CREATE TABLE "ItemTypology" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "itemId" TEXT NOT NULL UNIQUE,
  "primaryCategory" "TypologyCategory" NOT NULL,
  "primaryConfidence" DOUBLE PRECISION NOT NULL,
  "secondaryCategory" "TypologyCategory",
  "secondaryConfidence" DOUBLE PRECISION,
  "rawResponse" JSONB,
  "organizer_reviewed" BOOLEAN NOT NULL DEFAULT false,
  "organizer_correctedTo" "TypologyCategory",
  "correctionReason" TEXT,
  "classifiedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "ItemTypology_itemId_fkey" FOREIGN KEY ("itemId") REFERENCES "Item"("id") ON DELETE CASCADE
);
CREATE INDEX "ItemTypology_itemId_idx" ON "ItemTypology"("itemId");
CREATE INDEX "ItemTypology_primaryCategory_idx" ON "ItemTypology"("primaryCategory");
```

### API Contract

**Endpoint 1: Classify Item (Async)**
```
POST /api/items/:itemId/classify

Request: {}
Response: {
  status: 'QUEUED' | 'COMPLETE',
  typology?: {
    primaryCategory: TypologyCategory,
    primaryConfidence: 0.0–1.0,
    secondaryCategory?: TypologyCategory,
    secondaryConfidence?: 0.0–1.0
  }
}

Authentication: requireTier('PRO')
```

**Endpoint 2: Get Typology**
```
GET /api/items/:itemId/typology

Response: {
  data: {
    itemId: string,
    primaryCategory: TypologyCategory,
    primaryConfidence: 0.0–1.0,
    secondaryCategory?: TypologyCategory,
    secondaryConfidence?: 0.0–1.0,
    organizer_reviewed: boolean,
    organizer_correctedTo?: TypologyCategory,
    classifiedAt: ISO8601
  }
}

Authentication: requireTier('PRO')
```

**Endpoint 3: Update Typology (Organizer Correction)**
```
PATCH /api/items/:itemId/typology

Request: {
  correctedTo: TypologyCategory,
  reason?: string  // e.g., "Actually Farmhouse, not Americana"
}

Response: { success: true }

Authentication: requireTier('PRO') + item.sale.organizerId === auth.user.id
```

### Implementation Details

**Service: `typologyService.ts`**

1. **Classification Flow**
   ```
   classifyItem(itemId):
     - Get item + primaryPhoto
     - Send to Haiku with system prompt:
       "Classify this item into ONE primary typology category.
        Categories: [list 10 categories with examples]
        Return JSON: { primaryCategory, primaryConfidence, secondaryCategory?, reasoning }"
     - Parse response, validate category enum
     - If confidence < 0.5, mark secondaryCategory as null
     - Store in DB, emit Socket.io event to organizer
   ```

2. **Prompt Template (Haiku)**
   ```
   You are an expert in decorative and functional item classification.
   Analyze this item photo and classify it into exactly ONE primary typology category.

   Categories (with examples):
   - ART_DECO: Geometric, streamlined, 1920s–1930s (furniture, lamps, vases)
   - MID_CENTURY_MODERN: Clean lines, tapered legs, 1940s–1970s (chairs, tables, sideboards)
   - AMERICANA: Folk art, Americana flags, quilts, rustic 19th–early 20th century
   - VICTORIAN: Heavy ornament, dark wood, marble, 1837–1901 (dressers, sofas, mirrors)
   - INDUSTRIAL: Exposed metal, factory-inspired, reclaimed materials (shelving, lighting)
   - FARMHOUSE: Distressed wood, vintage signage, shiplap-inspired, early 20th century rural
   - RETRO_ATOMIC: 1950s–1960s popular culture, boomerangs, starburst, chrome (lamps, clocks)
   - PRIMITIVE_FOLK_ART: Handmade, naive style, rustic wood or ceramic, any era
   - ART_NOUVEAU: Curved organic forms, nature motifs, 1890s–1910s (vases, mirrors, jewelry)
   - CONTEMPORARY: Modern materials, minimal, post-1990s (glass, plastic, steel)
   - OTHER: None of the above

   Respond ONLY with valid JSON (no markdown, no explanation):
   {
     "primaryCategory": "CATEGORY_NAME",
     "primaryConfidence": 0.85,
     "secondaryCategory": "CATEGORY_NAME_OR_NULL",
     "reasoning": "This is a..." (1 sentence)
   }
   ```

3. **Async Job Processing**
   ```
   Node-cron job (runs every 2 hours):
   - Find all PRO organizer items without typology
   - Batch classify (max 20 per job to avoid rate limits)
   - On error: store error in ItemTypology.rawResponse, skip retry
   - Emit notification to organizer when complete
   ```

4. **Tag Suggestion Hook**
   - When typology is assigned, suggest tags like:
     - Primary category name (e.g., "Mid-Century Modern")
     - Confidence badge (e.g., "87% confident")
   - Organizer can accept/reject suggestions

### Frontend Integration

**Component: `TypologyBadge.tsx` (item detail + edit flow)**
```
Display in item edit modal:
- Primary category pill with confidence score (e.g., "Mid-Century Modern • 87%")
- Optional secondary category if confidence >= 0.6
- "Change classification" button → modal with 10 category options
- Save correction back to API

Show in organizer item-library view:
- Filter by typology category
- Tag suggestions based on typology
```

### Risk & Mitigation

| Risk | Severity | Mitigation |
|------|----------|-----------|
| Misclassification (e.g., Americana vs Farmhouse) | Medium | Show secondary category option; organizer can override |
| No photo or poor photo quality | High | Skip classification if photo is null; show "Unable to classify" message |
| Rate limiting on Anthropic API | Medium | Batch jobs in off-peak hours; implement exponential backoff |
| Organizer rejects majority of suggestions | Medium | Log all corrections, fine-tune prompt after 100+ data points |

---

## Feature #69: Local-First Offline Mode [PRO]

### Business Value
Organizers can build catalogs offline (in sales venues without WiFi), sync when reconnected. Reduces friction for rural sales. Increases feature adoption for PRO tier.

### Design Overview

**Client-Side (IndexedDB + Service Worker):**
- Service worker caches static assets + API responses
- IndexedDB stores: pending operations (create/update/delete), synced items, item photos
- Offline indicator UI banner

**Server-Side (Sync Endpoint):**
- `POST /api/sync/batch` accepts array of offline operations
- Applies atomically where possible, returns conflict resolution advice
- Syncs back: confirmed IDs, any server state changes

**Conflict Resolution:** Last-write-wins for scalar fields; merge strategy for arrays (photos, tags).

### Schema Changes

**Database Changes:**
```
NO NEW TABLES in Prisma schema.

Offline sync is purely client-side state management.
Server-side: just need a new API endpoint.
```

**Client-Side: IndexedDB Schema (Not in Prisma)**

```javascript
// IndexedDB databases created by offlineSync.ts
// 'findASaleOffline' database:
{
  stores: {
    offlineItems: {
      keyPath: 'localId',           // UUID generated client-side
      indexes: {
        byItemId: 'itemId',         // Server itemId once synced
        byStatus: 'syncStatus',     // 'PENDING_CREATE' | 'PENDING_UPDATE' | 'SYNCED'
        bySaleId: 'saleId'
      }
    },
    offlinePhotos: {
      keyPath: 'localPhotoId',
      indexes: {
        byItemId: 'localItemId',
        byUrl: 'url'                // Blob URL or local filename
      }
    },
    syncQueue: {
      keyPath: 'seq',               // Auto-increment timestamp-based sequence
      indexes: {
        byStatus: 'status',         // 'PENDING' | 'SENT' | 'CONFIRMED'
        byItemId: 'itemId'
      }
    }
  }
}
```

### API Contract

**New Endpoint: Batch Sync**
```
POST /api/sync/batch

Request:
{
  operations: [
    {
      type: 'CREATE_ITEM' | 'UPDATE_ITEM' | 'DELETE_ITEM' | 'UPLOAD_PHOTO',
      localId: string,              // Client-generated UUID for offline tracking
      itemId?: string,              // Server itemId if updating existing
      payload: {
        title: string,
        description: string,
        price: number,
        category: string,
        condition: string,
        photoUrls?: string[],
        tags?: string[],
        // ... other Item fields
      },
      saleId: string,               // Required: can't determine context without it
      timestamp: ISO8601
    }
  ],
  clientState: {
    lastSyncAt: ISO8601,
    offlineItemCount: number
  }
}

Response:
{
  synced: [
    {
      localId: string,
      itemId: string,               // Server-assigned ID for CREATE
      status: 'SUCCESS' | 'CONFLICT',
      serverTimestamp: ISO8601,
      resolvedValues?: {            // If CONFLICT: server-resolved values
        price: number,
        tags: string[]
      }
    }
  ],
  failed: [
    {
      localId: string,
      error: string,
      retryable: boolean            // true = try again, false = user must fix manually
    }
  ],
  serverItems: [                    // Items modified on server while offline
    {
      itemId: string,
      updatedAt: ISO8601,
      reason: 'SOLD' | 'PRICE_DROPPED_BY_ORGANIZER' | 'OTHER'
    }
  ]
}

Authentication: requireTier('PRO')
Status: 200 (partial/full success), 207 (Multi-Status: some success, some fail), 400 (validation error), 409 (unresolvable conflict)
```

### Implementation Details

**Frontend Service: `offlineSync.ts`**

1. **IndexedDB Initialization**
   ```typescript
   initOfflineDB():
     - Open 'findASaleOffline' database
     - Create offlineItems, offlinePhotos, syncQueue stores
     - Attach listeners for add/sync events
   ```

2. **Offline Operation Tracking**
   ```typescript
   recordOfflineItem(saleId, item):
     - Generate localId = uuid()
     - Store in IndexedDB.offlineItems: { localId, itemId: null, syncStatus: 'PENDING_CREATE', ...item }
     - Add to syncQueue: { operation: 'CREATE_ITEM', localId, timestamp: now(), status: 'PENDING' }
     - Emit UI event: "Item saved offline — will sync when online"

   recordOfflinePhotoUpload(localItemId, photoBlob):
     - Generate photoDataURI or store blob
     - Store in IndexedDB.offlinePhotos: { localPhotoId: uuid(), localItemId, url: dataURI }
     - Reference in offlineItems.photoUrls array
   ```

3. **Sync on Reconnect**
   ```typescript
   triggerSync():
     - Detect online event (window.online + network health check)
     - Read syncQueue from IndexedDB (sorted by timestamp)
     - POST /api/sync/batch with all PENDING operations
     - On response:
       - Mark SYNCED operations as confirmed in IndexedDB
       - Update localId → itemId mapping for creates
       - Show toast: "Synced 5 items"
     - On error (transient):
       - Retry after 30s, max 3 retries
       - If final fail: notify user "Manual sync required — see offline queue"
     - On error (permanent, e.g., 400 validation):
       - Show error toast with item ID, allow user to fix
   ```

4. **Service Worker Caching**
   ```typescript
   // Use Workbox (if already configured) or custom SW

   Cache Strategies:
   - Static assets (JS, CSS, fonts): Cache-first, max 30 days
   - API calls (GET /api/items, GET /api/sales): Network-first, fallback to cache
   - Image uploads (POST /api/items): Network-only (can't cache uploads)
   - Offline HTML (index.html): Cache-first with network fallback
   ```

**Backend Endpoint: `syncController.ts`**

```typescript
POST /api/sync/batch:
  1. Validate request:
     - All operations must have saleId
     - saleId must belong to authenticated organizer
     - Timestamp must be within 30 days

  2. Process operations:
     FOR EACH operation:
       a) CREATE_ITEM:
          - Create Item in DB (or return conflict if duplicate sku in sale)
          - Return assigned itemId
          - On error (sku conflict): status: CONFLICT, resolvedValues: { itemId: existingId }

       b) UPDATE_ITEM:
          - Fetch current Item from DB
          - Compare timestamps: if server.updatedAt > client.timestamp:
            - Conflict detected → return CONFLICT + resolvedValues
          - Else: apply update (last-write-wins)
          - Return status: SUCCESS

       c) DELETE_ITEM:
          - Mark as deleted (soft delete via isActive: false)
          - Return status: SUCCESS

       d) UPLOAD_PHOTO:
          - [Deferred: requires photo handling, default to URLs for MVP]

  3. Return response with synced/failed/serverItems arrays
```

### Frontend Integration

**Component: `OfflineIndicator.tsx` (top-level banner)**
```
Displays when offline:
- Orange banner: "Offline — changes will sync when connected"
- Badge showing count of pending items
- "View sync queue" link (debugging)

Displays when syncing:
- Pulsing indicator: "Syncing... 5 items"

Displays when conflicts detected:
- Red banner: "Sync issue on Item #42 — please review"
- Link to conflict resolution modal
```

**Component: `SyncQueueModal.tsx` (organizer settings page)**
```
Shows:
- All pending operations: CREATE_ITEM, UPDATE_ITEM, DELETE_ITEM
- Last synced timestamp
- Manual "Sync now" button
- Clear offline cache (destructive warning)

Conflict resolution:
- Item detail modal showing server vs. local
- Radio buttons: "Keep server version | Keep my changes | Merge"
- Save choice, retry sync
```

**Workflow: Add Item Offline**
```
1. Organizer opens sale, goes to add-items page
2. Adds item (title, description, price, photo)
3. App detects offline (window.navigator.onLine === false)
4. Shows toast: "Saved offline — syncing when online"
5. Item stored in IndexedDB with localId = uuid()
6. Item appears in draft list locally (no networkId yet)
7. When online: auto-trigger sync
8. Server creates Item with real itemId
9. App updates local item: localId → itemId mapping
10. Item appears in published list
```

### Risk & Mitigation

| Risk | Severity | Mitigation |
|------|----------|-----------|
| IndexedDB quota exceeded (>50MB) | High | Warn organizer when queue > 100 items; provide "Clear old items" option; document quota per browser |
| Conflict resolution wrong (overwrite sold item) | High | Server-side: check item.status before applying UPDATE; reject updates on SOLD items with 409 Conflict |
| Service worker cache poisoning | High | Cache keys include version number; clear cache on major deploy |
| Organizer re-creates item with same sku while offline | Medium | Server returns CONFLICT with existingId; UI prompts "Item already exists" |
| Photo upload while offline | High | **MVP: Photos upload AFTER sync (defer complex blob handling)**. Client queues photos for sync-time upload. |

### Database Migration

**No new Prisma models needed.** Just ensure `Item` model includes:
- `isActive` (soft delete) — already present
- `updatedAt` (optimistic concurrency) — already present

---

## Cross-Feature Constraints

### Tier Gating
All three features require `subscriptionTier === 'PRO'`.

```typescript
// In backend middleware
requireTier('PRO') used on:
- POST /api/items/:itemId/valuation/generate
- GET /api/items/:itemId/valuation
- POST /api/items/:itemId/classify
- GET /api/items/:itemId/typology
- PATCH /api/items/:itemId/typology
- POST /api/sync/batch

PRO organizers who downgrade to SIMPLE:
- Cannot trigger new valuations/classifications
- Can still view existing ones (read-only)
- Offline sync continues to work (data loss prevention)
```

### Frontend Feature Flags
```typescript
// featureFlags.ts
FEATURE_VALUATION: user.subscriptionTier === 'PRO'
FEATURE_TYPOLOGY: user.subscriptionTier === 'PRO'
FEATURE_OFFLINE: user.subscriptionTier === 'PRO'
```

---

## Implementation Sprint Breakdown

### Sprint 1 (Feature #30: Statistical Valuation)
**Architect→Dev Handoff**
- Implement `valuationService.ts`: `findComparables()`, `generateValuation()`
- Add `ItemValuation` model + migration
- Implement API endpoints: `POST /api/items/:itemId/valuation/generate`, `GET /api/items/:itemId/valuation`
- Create `ValuationWidget.tsx` (organizer add-items flow)
- Add tier gate + tests
- **Files:** 1 service, 1 model migration, 1 controller, 1 component

### Sprint 2 (Feature #30: Embedding-Based Valuation)
- Enhance `valuationService.ts`: add `findSimilarItemsByEmbedding()`
- Update API response to show method (STATISTICAL vs EMBEDDING)
- Implement cron job for async batch generation
- Add Socket.io notification to organizer on completion
- **Files:** 1 service update, 1 cron job file

### Sprint 3 (Feature #46: Typology Classification)
- Implement `typologyService.ts`: `classifyItem()` with Haiku prompt
- Add `ItemTypology` model + migration
- Implement API endpoints: POST/GET/PATCH typology
- Create `TypologyBadge.tsx` + `TypologyClassificationModal.tsx`
- Add correction logging for audit trail
- **Files:** 1 service, 1 model migration, 1 controller, 2 components

### Sprint 4 (Feature #46: Organizer Feedback Loop)
- Implement feedback logging: organizer corrections stored in `organizer_correctedTo`
- Add tag suggestion hook based on typology
- Create batch job to analyze correction patterns
- **Files:** 1 service enhancement

### Sprint 5 (Feature #69: Client-Side Offline)
- Implement `offlineSync.ts`: IndexedDB setup, operation tracking, sync trigger
- Implement service worker caching strategy (Workbox or custom)
- Create `OfflineIndicator.tsx` + `SyncQueueModal.tsx`
- Test offline workflow: create item → go online → verify sync
- **Files:** 1 sync service, 1 SW config update, 2 components

### Sprint 6 (Feature #69: Server Sync Endpoint)
- Implement `syncController.ts`: batch sync endpoint with conflict detection
- Implement conflict resolution logic (last-write-wins, merge strategy)
- Add validation: saleId ownership, timestamp bounds
- Add tests: success path, partial failure, conflicts
- **Files:** 1 controller, database tests

### Sprint 7 (Feature #69: Integration + Polish)
- Hook offline sync into item add/edit flow
- Test error scenarios: network timeout, auth expiry, storage quota
- Add docs: "Using Offline Mode" guide for organizers
- Full end-to-end test: add 20 items offline → sync → verify all created
- **Files:** Documentation, integration tests

---

## Files Affected (Summary)

### New Files
**Backend:**
- `packages/backend/src/services/valuationService.ts`
- `packages/backend/src/services/typologyService.ts`
- `packages/backend/src/controllers/valuationController.ts`
- `packages/backend/src/controllers/typologyController.ts`
- `packages/backend/src/controllers/syncController.ts`
- `packages/backend/src/jobs/valuationJob.ts` (cron)
- `packages/backend/src/jobs/typologyJob.ts` (cron)

**Frontend:**
- `packages/frontend/services/offlineSync.ts`
- `packages/frontend/components/ValuationWidget.tsx`
- `packages/frontend/components/TypologyBadge.tsx`
- `packages/frontend/components/TypologyClassificationModal.tsx`
- `packages/frontend/components/OfflineIndicator.tsx`
- `packages/frontend/components/SyncQueueModal.tsx`
- `packages/frontend/hooks/useOfflineSync.ts`

**Database:**
- `packages/database/prisma/migrations/20260317_add_item_valuation.sql`
- `packages/database/prisma/migrations/20260317_add_item_typology.sql`

### Modified Files
- `packages/database/prisma/schema.prisma` (add ItemValuation, ItemTypology relations + TypologyCategory enum)
- `packages/backend/src/index.ts` (register new routes, init jobs)
- `packages/frontend/pages/organizer/add-items/[saleId].tsx` (add ValuationWidget)
- `packages/frontend/pages/_app.tsx` (init offline sync hook)
- `packages/frontend/components/Layout.tsx` (add OfflineIndicator)
- `packages/backend/src/lib/socket.ts` (emit typology classification events)

---

## Testing Strategy

### Unit Tests (Backend)
- `valuationService.test.ts`: findComparables, confidence scoring, edge cases (0 comparables, all outliers)
- `typologyService.test.ts`: classification prompt validation, category enum enforcement
- `syncController.test.ts`: batch operations, conflict detection, last-write-wins logic

### Integration Tests (E2E)
- Create PRO organizer, add sale, add items → verify valuation endpoints respond
- Classify item → verify typology stored → organizer corrects → verify correction logged
- Offline flow: add 5 items offline → go online → POST /sync/batch → verify all synced + IDs assigned

### UI Tests
- ValuationWidget displays when PRO, hides when SIMPLE
- TypologyBadge shows confidence score and allows organizer correction
- OfflineIndicator toggles on/offline, shows pending count
- SyncQueueModal shows conflicts and resolution options

---

## Risk Summary

**High Priority:**
1. **Insufficient sold items early in beta** → Valuation feature will be useless if no historical sales. *Mitigation:* Add placeholder mode "Add 5+ sales to your account to see comparables"; provide demo data option.
2. **Offline sync conflicts** → Organizer modifies item server-side (price drop) while offline, then syncs old version. *Mitigation:* Server checks `updatedAt` timestamp; reject with CONFLICT + show user UI to choose version.
3. **Embedding quality** → If embeddings are null or low-quality, Phase 2 will fail. *Mitigation:* Phase 1 uses statistical model only; Phase 2 gated on embedding availability.

**Medium Priority:**
1. **Rate limiting on Haiku API** → Classification job hits limits during bulk operations. *Mitigation:* Batch 20 at a time, spread across 2-hour windows.
2. **IndexedDB quota per browser** → Organizer can't store 500 items offline. *Mitigation:* Warn at 100 pending items; provide manual clear button; document browser limits.

**Low Priority:**
1. Typo in category enum values (e.g., "MID_CENTURY_MODERN" vs "MID_CENTURY") → Easily caught in QA.

---

## Rollback Plans

### Migration: ItemValuation
```
Down: DROP TABLE "ItemValuation"; DROP INDEX "ItemValuation_itemId_idx";
Playbook: If deploy vX fails on valuation endpoint, run down migration,
confirm Neon backup available, redeploy previous commit.
```

### Migration: ItemTypology
```
Down: DROP TABLE "ItemTypology"; DROP TYPE "TypologyCategory";
Playbook: If typology classification returns 500 errors, run down migration.
```

### Feature Flags (Offline)
```
No database changes for offline. If sync breaks, simply disable feature flag:
FEATURE_OFFLINE = false in config → all offline UI hidden, no sync attempts.
```

---

## Approval & Handoff

**Decision Made By:** Systems Architect (2026-03-17)
**Ready for:** findasale-dev implementation
**Constraint:** All three features require `subscriptionTier === 'PRO'` gate
**Business Owner Sign-Off:** Pending Patrick approval on sprint sequence

---

## Next Steps

1. **Patrick Review:** Approve sprint order and feature flags (FEATURE_VALUATION, FEATURE_TYPOLOGY, FEATURE_OFFLINE)
2. **Developer Assignment:** findasale-dev to implement per sprint breakdown
3. **QA Gate:** findasale-qa tests each feature before merging
4. **Migration Deployment:** Patrick runs Neon migrations post-merge (see CLAUDE.md §6)
5. **Beta Rollout:** Announce to PRO organizers; collect feedback on valuation accuracy, typology correctness

---

**Spec Status:** COMPLETE
**Last Updated:** 2026-03-17 17:45 UTC
**Next Review:** After Sprint 2 (valuation accuracy metrics + embedding validation)
