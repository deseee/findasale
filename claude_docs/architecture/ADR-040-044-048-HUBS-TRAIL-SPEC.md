# ADR — Sale Hubs + Neighborhood Sale Day + Treasure Trail Route Builder

**Date:** 2026-03-17 | **Version:** 1.0 | **Status:** DESIGN PHASE

---

## Executive Summary

Three interconnected location-based shopping features:
- **#40 Sale Hubs [PRO]** — Group nearby sales into a discoverable hub with shared map, combined route, and landing page
- **#44 Neighborhood Sale Day [PRO]** — Extend Sale Hubs with coordinated event date and group marketing
- **#48 Treasure Trail Route Builder [FREE]** — Shoppers create multi-sale itineraries with time estimates, visit order, and "don't miss" item highlights

**Total effort:** ~4 sprints. **Risk:** LOW (read-mostly, OSRM already integrated). **Dependencies:** Heatmap density data (#28 exists), OSRM service (already live).

---

## Feature #40: Sale Hubs [PRO] — 1.5 sprints

**Goals:**
- Reduce shopper friction when multiple sales exist in one area
- Hub landing page = shared marketing asset for participating organizers
- Shared map + combined route simplifies "sale-hopping"
- PRO-gated monetization hook

### 1. Prisma Schema

```prisma
// NEW: Hub model — groups nearby sales
model SaleHub {
  id            String    @id @default(cuid())
  name          String    // e.g. "Downtown Estate Sales Weekend"
  slug          String    @unique @db.VarChar(100) // URL-safe: downtown-estate-sales-weekend
  description   String?   @db.VarChar(500) // Marketing text for hub landing page

  // Geolocation
  lat           Float     // Hub center point (computed from sales or set by organizer)
  lng           Float
  radiusKm      Float     @default(5) // Discover sales within this radius

  // Creator (PRO organizer)
  creatorId     String
  creator       Organizer @relation(fields: [creatorId], references: [id])

  // Lifecycle
  isActive      Boolean   @default(true) // Soft-delete via flag, not hard delete
  createdAt     DateTime  @default(now())
  updatedAt     DateTime  @updatedAt

  // Relations
  memberships   SaleHubMembership[]

  @@index([creatorId])
  @@index([lat, lng])  // Geo queries
  @@index([isActive])
}

// NEW: Hub membership — many-to-many Sales + SaleHubs
model SaleHubMembership {
  id        String    @id @default(cuid())
  hubId     String
  saleId    String

  // When organizer joined this sale to the hub
  addedAt   DateTime  @default(now())

  hub       SaleHub   @relation(fields: [hubId], references: [id], onDelete: Cascade)
  sale      Sale      @relation(fields: [saleId], references: [id], onDelete: Cascade)

  @@unique([hubId, saleId])
  @@index([hubId])
  @@index([saleId])
}

// MODIFY: Sale model — add hub relation
// Add to Sale model:
//   hubMemberships SaleHubMembership[]
```

### 2. Migration SQL

**File:** `packages/database/prisma/migrations/20260317001500_add_sale_hubs/migration.sql`

```sql
-- Create sale_hub table
CREATE TABLE "SaleHub" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "name" TEXT NOT NULL,
  "slug" TEXT NOT NULL UNIQUE,
  "description" VARCHAR(500),
  "lat" DOUBLE PRECISION NOT NULL,
  "lng" DOUBLE PRECISION NOT NULL,
  "radiusKm" DOUBLE PRECISION NOT NULL DEFAULT 5,
  "creatorId" TEXT NOT NULL,
  "isActive" BOOLEAN NOT NULL DEFAULT true,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "SaleHub_creatorId_fkey" FOREIGN KEY ("creatorId") REFERENCES "Organizer" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- Create index on creator (list hubs I created)
CREATE INDEX "SaleHub_creatorId_idx" ON "SaleHub"("creatorId");

-- Create index on geo location (discover hubs near me)
CREATE INDEX "SaleHub_lat_lng_idx" ON "SaleHub"("lat", "lng");

-- Create index on active flag (filter inactive hubs)
CREATE INDEX "SaleHub_isActive_idx" ON "SaleHub"("isActive");

-- Create sale_hub_membership table (junction)
CREATE TABLE "SaleHubMembership" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "hubId" TEXT NOT NULL,
  "saleId" TEXT NOT NULL,
  "addedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "SaleHubMembership_hubId_fkey" FOREIGN KEY ("hubId") REFERENCES "SaleHub" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "SaleHubMembership_saleId_fkey" FOREIGN KEY ("saleId") REFERENCES "Sale" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- Unique: one sale per hub
CREATE UNIQUE INDEX "SaleHubMembership_hubId_saleId_key" ON "SaleHubMembership"("hubId", "saleId");

-- Indexes for queries
CREATE INDEX "SaleHubMembership_hubId_idx" ON "SaleHubMembership"("hubId");
CREATE INDEX "SaleHubMembership_saleId_idx" ON "SaleHubMembership"("saleId");
```

### 3. Backend API Contract

#### 3.1 Hub Discovery

**GET `/api/hubs?lat={lat}&lng={lng}&radiusKm=10`**
- Query hubs near user location
- Returns: `{ hubs: [{ id, name, slug, lat, lng, saleCount, startsAt?, endsAt? }] }`
- Pagination: 20 results default
- No auth required

**GET `/api/hubs/{slug}`**
- Public hub landing page data
- Returns: `{ hub: { id, name, slug, description, lat, lng, radiusKm, saleDate?, sales: [{ id, title, address, lat, lng, startDate, endDate, organizer: { name } }], stats: { totalItems, priceRangeUSD: [min, max] } } }`
- No auth required

#### 3.2 Hub Management (PRO-gated)

**POST `/api/organizer/hubs`** — Create hub (requireTier('PRO'))
- Body: `{ name, slug, description, lat, lng, radiusKm }`
- Validates: slug unique, lat/lng valid
- Returns: `{ hubId, slug }`

**PUT `/api/organizer/hubs/{hubId}`** — Edit hub (requireTier('PRO'))
- Auth: verify creatorId === user.organizerId
- Body: `{ name, description, lat, lng, radiusKm }`
- Returns: `{ updated }`

**DELETE `/api/organizer/hubs/{hubId}`** — Soft-delete hub (requireTier('PRO'))
- Sets `isActive = false`
- Returns: `{ deleted: true }`

**GET `/api/organizer/hubs`** — List my hubs (requireTier('PRO'))
- Returns: `{ hubs: [{ id, name, slug, createdAt, saleCount, memberSaleCount }] }`

#### 3.3 Hub Membership (PRO-gated)

**POST `/api/organizer/hubs/{hubId}/join`** — Add my sale(s) to hub (requireTier('PRO'))
- Body: `{ saleIds: [string] }`
- Validates: all saleIds belong to authed organizer
- Returns: `{ added: number, skipped: [{ saleId, reason }] }`

**DELETE `/api/organizer/hubs/{hubId}/sales/{saleId}`** — Remove sale from hub (requireTier('PRO'))
- Auth: verify saleId belongs to authed organizer
- Returns: `{ removed: true }`

**GET `/api/hubs/{hubId}/sales`** — List sales in hub
- No auth required
- Pagination: 50 results default
- Returns: `{ sales: [...], total }`

#### 3.4 Map Integration

**GET `/api/hubs/{hubId}/route`** — Optimized route through hub sales (FREE users too)
- Body: `{ startCoord?: { lat, lng } }`
- Extends existing OSRM routeController to accept hubId instead of saleIds
- Returns: `{ waypoints: [{ saleId, order, lat, lng, title, address }], summary: { totalDistanceMi, totalDurationMin }, googleMapsUrl }`

### 4. Frontend Integration

#### 4.1 Hub Discovery Pages

**`/hubs`** — Hub listing (search nearby hubs)
- Map with hub pins (cluster by density from #28)
- Click hub → `/hubs/{slug}`

**`/hubs/{slug}`** — Hub landing page
- Hub name, description, sale count, price range stats
- Embedded map showing all member sales
- "Route Planner" button → calls `/api/hubs/{hubId}/route`
- "Browse Sales" button → list view of member sales
- Organizer logos + links (PRO organizers in hub)
- "Join This Hub" CTA → `/organizer/hubs/{slug}/join` (PRO gated)

#### 4.2 Organizer Dashboard

**`/organizer/hubs`** (NEW)
- My hubs list (created by me)
- Create Hub button → `/organizer/hubs/create`
- Hub cards: name, slug, sale count, visibility toggle (isActive)

**`/organizer/hubs/create`** (NEW)
- Form: name, description, lat/lng map picker, radiusKm slider
- Slug auto-generated from name (editable)
- Submit creates hub, redirects to `/organizer/hubs/{hubId}/manage`

**`/organizer/hubs/{hubId}/manage`** (NEW)
- Hub details (edit link)
- Sales in hub (current memberships)
- "Add Sales" button → modal/page to select additional sales
- "Remove from Hub" per-sale button
- Share link → copy `/hubs/{slug}` to clipboard

### 5. Sprint Breakdown

**Sprint 1 (1 sprint):**
- Schema + migration (SaleHub, SaleHubMembership models)
- Hub CRUD endpoints (POST/PUT/DELETE /organizer/hubs, GET /api/hubs/discovery)
- Hub landing page API (GET /api/hubs/{slug})
- Hub memberships API (POST/DELETE /organizer/hubs/{hubId}/join)
- Frontend: hub landing page (/hubs/{slug}), hub discovery (/hubs), organizer hub dashboard (/organizer/hubs)

**Sprint 2 (0.5 sprint, optional/dependent on other features):**
- Hub route planning (extend routeController to hubId)
- Organizer invite flow (share hub slug, invite other PRO organizers to join)
- Analytics: track hub page views, route clicks

---

## Feature #44: Neighborhood Sale Day [PRO] — 1 sprint

**Goals:**
- Coordinate sales in a hub to a shared event date
- Marketing hook: "Neighborhood Sale Day: Saturday, April 27"
- Extend hubs without redesign

### 1. Prisma Schema

**Additive only — extend SaleHub:**

```prisma
// MODIFY: SaleHub model — add date field
model SaleHub {
  // ... existing fields ...

  // Feature #44: Neighborhood Sale Day — coordinated event date
  saleDate      DateTime?  // If set, hub is a coordinated neighborhood event
  eventName     String?    // e.g. "Spring Cleanup Sale Weekend"

  // ... relations ...
}
```

**No new migration needed** (add saleDate and eventName columns to existing SaleHub):

**File:** `packages/database/prisma/migrations/20260317001600_add_neighborhood_sale_day/migration.sql`

```sql
ALTER TABLE "SaleHub" ADD COLUMN "saleDate" TIMESTAMP(3);
ALTER TABLE "SaleHub" ADD COLUMN "eventName" VARCHAR(150);
```

### 2. Backend API

**POST/PUT `/api/organizer/hubs/{hubId}/set-event-date`** — Set neighborhood sale day (requireTier('PRO'))
- Body: `{ saleDate: ISO8601, eventName: string }`
- Auth: verify creatorId === user.organizerId
- Returns: `{ updated }`

**GET `/api/hubs/{hubId}/event`** — Get event info (PUBLIC)
- Returns: `{ eventName, saleDate, salesCount, organizer: { name, logo } }`

### 3. Frontend Integration

**Hub landing page (/hubs/{slug})** — Enhanced with event info:
- If `saleDate` is set, show banner: "🎉 Neighborhood Sale Day: Saturday, April 27"
- Organizer invite link: "Know another organizer in the area? [Invite them to join](#invite-organizer)"

**Organizer hub management** (/organizer/hubs/{hubId}/manage):
- "Set Event Date" button → modal with date picker + event name input
- Shows current date/name if set

### 4. No Schema Rework Required

This is a pure extension — add 2 fields to SaleHub, no new models.

---

## Feature #48: Treasure Trail Route Builder [FREE] — 1.5 sprints

**Goals:**
- Shoppers curate multi-sale routes with time estimates and "don't miss" items
- Shareable public trail URLs
- Gamification hook: progress tracking, "complete the trail" badge

### 1. Prisma Schema

```prisma
// NEW: Treasure Trail — shopper's custom route through multiple sales
model TreasureTrail {
  id            String    @id @default(cuid())
  userId        String
  user          User      @relation(fields: [userId], references: [id], onDelete: Cascade)

  name          String    // e.g. "Vintage Furniture Hunt"
  description   String?   @db.VarChar(500)

  // Route data: array of stops with order and metadata
  stops         Json      // [{ saleId, order, timeEstimateMin, highlightItemIds: [itemId] }]

  // Precomputed route stats
  totalDistanceKm Float?   // Cached from OSRM call
  totalDurationMin Int?    // Cached from OSRM call

  // Sharing
  isPublic      Boolean   @default(false)
  shareToken    String?   @unique @db.VarChar(32) // Random token for public link

  // Gamification: progress tracking
  completedSaleIds String[] @default([])  // Which sales user has visited
  isCompleted   Boolean   @default(false) // All stops visited
  completedAt   DateTime?

  createdAt     DateTime  @default(now())
  updatedAt     DateTime  @updatedAt

  @@index([userId])
  @@index([isPublic])
}

// NEW: Track which items shopper marked as "don't miss" on trail stops
model TrailHighlight {
  id        String    @id @default(cuid())
  trailId   String
  itemId    String

  trail     TreasureTrail @relation(fields: [trailId], references: [id], onDelete: Cascade)
  item      Item          @relation(fields: [itemId], references: [id], onDelete: Cascade)

  order     Int       // Sort order within the trail

  createdAt DateTime  @default(now())

  @@unique([trailId, itemId])
  @@index([trailId])
  @@index([itemId])
}

// MODIFY: User model — add relation
// Add to User model:
//   treasureTrails TreasureTrail[]

// MODIFY: Item model — add relation
// Add to Item model:
//   trailHighlights TrailHighlight[]
```

### 2. Migration SQL

**File:** `packages/database/prisma/migrations/20260317001700_add_treasure_trail/migration.sql`

```sql
-- Create treasure_trail table
CREATE TABLE "TreasureTrail" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "userId" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "description" VARCHAR(500),
  "stops" JSONB NOT NULL DEFAULT '[]'::jsonb,
  "totalDistanceKm" DOUBLE PRECISION,
  "totalDurationMin" INTEGER,
  "isPublic" BOOLEAN NOT NULL DEFAULT false,
  "shareToken" VARCHAR(32) UNIQUE,
  "completedSaleIds" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  "isCompleted" BOOLEAN NOT NULL DEFAULT false,
  "completedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "TreasureTrail_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE INDEX "TreasureTrail_userId_idx" ON "TreasureTrail"("userId");
CREATE INDEX "TreasureTrail_isPublic_idx" ON "TreasureTrail"("isPublic");
CREATE UNIQUE INDEX "TreasureTrail_shareToken_key" ON "TreasureTrail"("shareToken");

-- Create trail_highlight table
CREATE TABLE "TrailHighlight" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "trailId" TEXT NOT NULL,
  "itemId" TEXT NOT NULL,
  "order" INTEGER NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "TrailHighlight_trailId_fkey" FOREIGN KEY ("trailId") REFERENCES "TreasureTrail" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "TrailHighlight_itemId_fkey" FOREIGN KEY ("itemId") REFERENCES "Item" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE UNIQUE INDEX "TrailHighlight_trailId_itemId_key" ON "TrailHighlight"("trailId", "itemId");
CREATE INDEX "TrailHighlight_trailId_idx" ON "TrailHighlight"("trailId");
CREATE INDEX "TrailHighlight_itemId_idx" ON "TrailHighlight"("itemId");
```

### 3. Backend API Contract

#### 3.1 Trail CRUD (Auth required)

**POST `/api/trails`** — Create trail
- Body: `{ name, description, saleIds: [string], highlightItemIds: [string] }`
- Validates: all saleIds are PUBLISHED, all itemIds belong to those sales
- Calls OSRM → precomputes distance/duration
- Returns: `{ trailId, shareToken }`

**GET `/api/trails/{trailId}`** — Get my trail (auth required)
- Auth: verify userId === authed user
- Returns: `{ trail: { id, name, description, stops: [...], totalDistanceKm, totalDurationMin, completedSaleIds, isCompleted, isPublic, shareToken } }`

**PUT `/api/trails/{trailId}`** — Update trail
- Body: `{ name, description, saleIds, highlightItemIds, isPublic }`
- Recalculates route if saleIds changed
- Returns: `{ updated }`

**DELETE `/api/trails/{trailId}`** — Delete trail
- Returns: `{ deleted: true }`

**GET `/api/trails`** — List my trails (auth required)
- Pagination: 20 per page
- Returns: `{ trails: [...], total }`

#### 3.2 Trail Discovery (Public)

**GET `/api/trails/public`** — Browse public trails
- Filtering: by name search, by sale city/state
- Returns: `{ trails: [{ id, name, description, creatorName, saleCount, completedCount, shareToken }], total }`

**GET `/trail/{shareToken}`** — Public trail view (no auth)
- Renders as public-facing page
- Shows: trail name, creator, all stops, highlight items, route map
- "Create Similar Trail" button (auth required)

#### 3.3 Trail Progress Tracking

**POST `/api/trails/{trailId}/mark-visited`** — Record sale visit
- Body: `{ saleId }`
- Adds saleId to completedSaleIds
- Checks if all stops completed → sets isCompleted, completedAt
- Returns: `{ trail: { completedSaleIds, isCompleted, progressPercent } }`

**POST `/api/trails/{trailId}/add-highlight`** — Add item to "don't miss" list
- Body: `{ itemId }`
- Creates TrailHighlight record
- Returns: `{ highlightId }`

**DELETE `/api/trails/{trailId}/highlights/{highlightId}`** — Remove highlight
- Returns: `{ removed: true }`

#### 3.4 Route Optimization (Extends OSRM)

**POST `/api/trails/{trailId}/optimize-route`** — TSP-solve reorder
- Uses OSRM to find nearest-neighbor optimization
- Optional: startCoord for "start from my location"
- Returns: `{ optimizedStops: [{ saleId, order, ... }], newDistanceKm, newDurationMin }`
- Note: User can manually reorder, or accept optimized route

### 4. Frontend Integration

#### 4.1 Trail Builder

**`/shopper/trails/create`** (NEW)
- Step 1: Search/select 2+ sales (map-based or list)
- Step 2: Order sales (drag-reorder or optimize button)
- Step 3: Add highlights (per sale: pick "don't miss" items)
- Step 4: Review (shows route map, distance, duration)
- Step 5: Name + description + publish toggle
- Submit → creates trail, shows share link

**`/shopper/trails`** (NEW) — My trails list
- Cards: trail name, sale count, "Complete" progress bar, edit/delete buttons
- "Create New Trail" button

**`/shopper/trails/{trailId}`** (NEW) — Trail detail (edit mode)
- All fields editable (name, sales, highlights, ordering, public toggle)
- Shows: map with route, total distance/time
- "Optimize Route" button (AI reorder)
- Share section: copy link or generate shareable card

#### 4.2 Trail Progress

**Progress tracker (on `/shopper/trails/{trailId}`):**
- Checklist: checkbox per sale, shows ✓ if visited
- Badge: "Trail Complete! 🏆" when all sales visited
- Stats: "3 of 5 sales visited", "Est. 2.3 miles remaining"

#### 4.3 Public Trail View

**`/trail/{shareToken}`** (NEW) — Public trail page (no auth)
- Trail name, creator profile, description
- Map showing all stops + highlights
- Browse items: expand each sale → show highlight items with prices
- "Create Your Own Trail" CTA (if not authed)
- "Fork This Trail" button (authed) → creates copy for current user

#### 4.4 Trail Discovery

**`/shopper/trails/discover`** (NEW)
- "Popular Trails This Week" — top 10 by completion rate
- Search trails by name/city
- Filter by sale dates
- Cards show: name, creator, sale count, # of times completed, 📌 if curated by staff

### 5. Integration with Existing Features

**Map page (`/map`):**
- "Build a Trail" button → `/shopper/trails/create`
- Trailing route visualization (if trail in progress)

**Sale detail page (`/sales/{saleId`):**
- "Add to Trail" button → modal to select existing trail or create new
- Shows highlight badge on items in a trail

**Social proof (#67):** Trail completion badges count as engagement
- "3 people completed this trail this week" badge on public trail

### 6. Sprint Breakdown

**Sprint 1 (1 sprint):**
- Schema + migrations (TreasureTrail, TrailHighlight models)
- Trail CRUD endpoints (POST/PUT/DELETE/GET /api/trails)
- Route optimization endpoint (POST /api/trails/{trailId}/optimize-route)
- Trail progress tracking (POST /api/trails/{trailId}/mark-visited)
- Frontend: Trail builder (/shopper/trails/create), My trails (/shopper/trails), trail detail (/shopper/trails/{trailId})

**Sprint 2 (0.5 sprint):**
- Public trail discovery (/shopper/trails/discover, /trail/{shareToken})
- Trail progress UI (checklist, progress bar, badge)
- Integration with map page (Build a Trail button)
- Integration with sale detail (Add to Trail button)
- Analytics: track trail creation, completion rate, popular trails

---

## Cross-Feature Dependencies & Integration

### #40 + #44 Connection

- Sale Hubs support #44 by providing a "group" structure
- Neighborhood Sale Day extends hubs with a date field
- Landing pages (/hubs/{slug}) display event branding when saleDate is set

### #48 Integration Points

- Treasure Trails reference sales and items (no Hub dependency)
- Users can build trails from hubs
- Trail highlights integrate with social proof (#67) — "X people completed this trail"
- Route optimizer uses existing OSRM service (already in routeController.ts)

### Shared Service: Route Planning

Both hubs (#40) and trails (#48) leverage OSRM. Architecture:
- **Hub routes:** `/api/hubs/{hubId}/route` → calls extended routeController
- **Trail optimization:** `/api/trails/{trailId}/optimize-route` → calls routeController with array of waypoints

---

## Implementation Files & Changes

### New Files (Schema & Backend)

**Database (Prisma):**
- `packages/database/prisma/migrations/20260317001500_add_sale_hubs/migration.sql`
- `packages/database/prisma/migrations/20260317001600_add_neighborhood_sale_day/migration.sql`
- `packages/database/prisma/migrations/20260317001700_add_treasure_trail/migration.sql`

**Backend Controllers:**
- `packages/backend/src/controllers/hubController.ts` (discovery, CRUD, membership)
- `packages/backend/src/controllers/trailController.ts` (CRUD, optimization, progress)

**Backend Routes:**
- `packages/backend/src/routes/hubs.ts`
- `packages/backend/src/routes/trails.ts`

**Backend Services:**
- `packages/backend/src/services/trailOptimizationService.ts` (OSRM wrapper for TSP)

### Modified Files

**Schema:**
- `packages/database/prisma/schema.prisma` (add SaleHub, SaleHubMembership, TreasureTrail, TrailHighlight models + relations)

**Backend:**
- `packages/backend/src/index.ts` (register hubs, trails routes)
- `packages/backend/src/controllers/routeController.ts` (extend to support hubId parameter)

**Frontend:**
- `packages/frontend/pages/hubs/index.tsx` (hub discovery)
- `packages/frontend/pages/hubs/[slug].tsx` (hub landing)
- `packages/frontend/pages/organizer/hubs/index.tsx` (my hubs)
- `packages/frontend/pages/organizer/hubs/create.tsx` (create hub)
- `packages/frontend/pages/organizer/hubs/[hubId]/manage.tsx` (manage hub)
- `packages/frontend/pages/shopper/trails/index.tsx` (my trails)
- `packages/frontend/pages/shopper/trails/create.tsx` (trail builder)
- `packages/frontend/pages/shopper/trails/[trailId]/index.tsx` (trail detail)
- `packages/frontend/pages/shopper/trails/discover.tsx` (public trails)
- `packages/frontend/pages/trail/[shareToken].tsx` (public trail view)
- `packages/frontend/components/HubCard.tsx` (reusable hub display)
- `packages/frontend/components/TrailProgressTracker.tsx` (checklist UI)
- `packages/frontend/hooks/useHubs.ts` (hub API integration)
- `packages/frontend/hooks/useTrails.ts` (trail API integration)

---

## Tier Gating

| Feature | Tier | Logic |
|---------|------|-------|
| Create/manage hubs | PRO | `requireTier('PRO')` on POST/PUT/DELETE /organizer/hubs |
| Join hub (add sales to hub) | PRO | `requireTier('PRO')` on POST /organizer/hubs/{hubId}/join |
| View hub landing page | FREE | Public endpoint, no auth |
| Browse public hubs | FREE | Public endpoint, no auth |
| Create trails | FREE | No tier requirement |
| View own trails | FREE | Auth required (user's own) |
| Share trails | FREE | Public link (no auth) |
| Browse public trails | FREE | Public endpoint, no auth |

---

## Risk Assessment

| Risk | Mitigation |
|------|-----------|
| Geo queries slow (lat/lng range) | Index on (lat, lng); add pagination; cache hub data |
| OSRM rate-limit on TSP calls | Cache optimization results 24h per trail; warn user if service unavailable |
| Trail highlight items deleted | Soft-delete items; TrailHighlight cascades gracefully |
| Hub organizer confusion (who owns?) | Clear creator attribution; only creator can edit/delete |
| Shopper trail spam (low-quality trails) | Moderation flag on public trails; staff curation for "featured" |
| Schema bloat from JSONB stops | 50-sale limit per trail; document for future migration to TrailStop model |

---

## Rollback Plan

**Hubs Migration (`20260317001500_add_sale_hubs`):**
```sql
-- Down migration
DROP INDEX IF EXISTS "SaleHubMembership_saleId_idx";
DROP INDEX IF EXISTS "SaleHubMembership_hubId_idx";
DROP UNIQUE INDEX IF EXISTS "SaleHubMembership_hubId_saleId_key";
DROP TABLE IF EXISTS "SaleHubMembership";

DROP INDEX IF EXISTS "SaleHub_isActive_idx";
DROP INDEX IF EXISTS "SaleHub_lat_lng_idx";
DROP INDEX IF EXISTS "SaleHub_creatorId_idx";
DROP TABLE IF EXISTS "SaleHub";
```

**Neighborhood Sale Day Migration (`20260317001600`):**
```sql
-- Down migration (reversible: just drop columns)
ALTER TABLE "SaleHub" DROP COLUMN "eventName";
ALTER TABLE "SaleHub" DROP COLUMN "saleDate";
```

**Treasure Trail Migration (`20260317001700`):**
```sql
-- Down migration
DROP INDEX IF EXISTS "TrailHighlight_itemId_idx";
DROP INDEX IF EXISTS "TrailHighlight_trailId_idx";
DROP UNIQUE INDEX IF EXISTS "TrailHighlight_trailId_itemId_key";
DROP TABLE IF EXISTS "TrailHighlight";

DROP UNIQUE INDEX IF EXISTS "TreasureTrail_shareToken_key";
DROP INDEX IF EXISTS "TreasureTrail_isPublic_idx";
DROP INDEX IF EXISTS "TreasureTrail_userId_idx";
DROP TABLE IF EXISTS "TreasureTrail";
```

---

## Decision Log

**Why JSONB for trail stops (not TrailStop model)?**
- Avoids N+1 queries for small (2–10 item) stop lists
- Simple moves/reordering without multiple DB writes
- Future migration to TrailStop model easy if multi-organizer trail management needed

**Why soft-delete hubs (isActive flag)?**
- Preserves historical data (trails may reference deleted hubs)
- Allows "undelete" if organizer changes mind

**Why no hub "invite" system in #40 Sprint 1?**
- Scope creep; organizers can manually share hub slug
- Sprint 2 can add formal invite flow with email

**Why free tier for trails (#48)?**
- Engagement multiplier: trails drive shopper return visits
- No organizer cost; no business logic needed
- Lower entry point for shoppers to invest time in app

---

## Success Metrics

| Metric | Target | Measurement |
|--------|--------|-------------|
| Hub adoption | 5% of PRO organizers create hub | Track at session end |
| Trail creation | 10% of active shoppers create ≥1 trail | Analytics event |
| Trail completion rate | 60% of created trails completed | completedAt != null |
| Hub landing page CTR | 15% click "Browse Sales" or "Route Planner" | Analytics event |
| Treasure Trail shares | 20% of public trails shared (shareToken accessed) | Track by token |

---

## Appendix: Type Definitions

### TrailStop JSON Schema

```typescript
interface TrailStop {
  saleId: string;       // Reference to Sale
  order: number;        // 1-indexed position in route
  timeEstimateMin: number;  // Duration in sale (minutes)
  highlightItemIds: string[];  // "Don't miss" items at this stop
}

// Example stops array:
// [
//   { saleId: "sale_1", order: 1, timeEstimateMin: 30, highlightItemIds: ["item_42", "item_99"] },
//   { saleId: "sale_2", order: 2, timeEstimateMin: 45, highlightItemIds: ["item_101"] }
// ]
```

### API Response Examples

**Hub Discovery:**
```json
{
  "hubs": [
    {
      "id": "hub_1",
      "name": "Downtown Estate Sales Weekend",
      "slug": "downtown-estate-sales-weekend",
      "lat": 42.7335,
      "lng": -85.5891,
      "saleCount": 5,
      "startsAt": "2026-04-27T08:00:00Z",
      "endsAt": "2026-04-28T18:00:00Z"
    }
  ]
}
```

**Trail List:**
```json
{
  "trails": [
    {
      "id": "trail_1",
      "name": "Vintage Furniture Hunt",
      "saleCount": 3,
      "completedCount": 2,
      "progressPercent": 67,
      "totalDistanceKm": 8.5,
      "createdAt": "2026-03-15T10:30:00Z"
    }
  ],
  "total": 12
}
```

---

**Document Status:** READY FOR SUBAGENT DISPATCH
