# Architecture Decision Record — Treasure Trails (Explorer's Guild Phase 2)

**Date:** 2026-04-06
**Feature:** Treasure Trails — Curated multi-stop local experiences anchored by a FindA.Sale event
**Architect:** Systems Architect
**Status:** GO — Feasible with defined constraints

---

## Executive Summary

Treasure Trails is **technically feasible** within the current stack. The feature requires:
- **New schema:** 3 models (Trail, TrailStop, TrailCheckIn) + XP event type
- **Location data:** Google Places API (cost-justified; Nominatim too sparse for POI discovery)
- **Check-in verification:** Reuse existing `SaleCheckin` pattern + GPS radius check
- **Photo integration:** Extend existing Cloudinary pipeline with `TrailPhoto` type
- **XP integration:** Hooks into existing `PointsTransaction` system (type = "TRAIL_STOP", "TRAIL_COMPLETION")

**No blockers. Proceed to dev.**

---

## 1. Location Data Source Decision

### Options Evaluated

| Source | Cost | Data Quality | Complexity | Fit |
|--------|------|---|---|---|
| **Google Places API** | $0.017/query; ~$5-7/mo @ scale | Excellent (verified business info) | Low (standard SDK) | **BEST** |
| Foursquare/Swipe (Venue API) | $25/mo (free tier deprecating) | Very good | Low | Viable, licensing risk |
| OpenStreetMap Nominatim | Free | Patchy (reliant on community data) | Low | Too sparse for discovery |
| Manual organizer entry | Free | High fraud risk | Low code | Unmaintainable at scale |

### Decision: Google Places API

**Rationale:**
- Cost is negligible at scale (organic trail builders = <100 API calls/day across all organizers)
- Solves the core problem: organizers need a way to *discover* nearby resale shops, cafés, landmarks without manually entering every stop
- Verified business data (hours, phone, rating) improves user trust in trail recommendations
- Already use Google/Nominatim for sale address geocoding — one more Google service is acceptable operational debt

**Implementation:**
- Backend service: `PlacesService` (new utility)
- Endpoint: POST `/trails/:id/search-nearby`
  - Query: `{ latitude, longitude, radius: 500 (meters), type: "resale_shop" | "cafe" | "landmark" | "partner" }`
  - Response: `{ places: [{ googlePlaceId, name, address, lat, lng, rating, iconUrl }] }`
- Cache results in Redis (1 hour TTL) to avoid duplicate queries from same organizer
- Rate limit: 200 requests/organizer/day (soft quota, no hard block)

**Cost Management:**
- No upfront contract. Pay-as-you-go ($0.017 per query) with $200/mo cap via Google Cloud billing
- Track usage in `PointsTransaction` audit log for visibility

**Fallback:** Organizers can manually add stops by lat/lng + name if Places is unavailable

---

## 2. GPS Check-In Verification (Non-Sale Stops)

### Existing Pattern
`SaleCheckin` already verifies GPS proximity to a sale:
- Store user lat/lng at check-in time
- Backend calculates distance to sale's lat/lng (haversine formula)
- Organizer configures tolerance (default: ~100m) in `OrganizerHoldSettings`

### Reuse for Trail Stops

**Check-in flow:**
1. Shopper opens app, sees "Check in at [Stop Name]" button
2. App captures user's current GPS (requires location permission)
3. Frontend calculates distance locally to stop's lat/lng
4. If ≤100m: enable check-in button; >100m: disable with "Move closer" message
5. On check-in, backend receives user lat/lng + stop ID
6. Backend verifies: `distance(userLat/lng, stopLat/lng) ≤ 100m` (double-check)
7. Award XP, record `TrailCheckIn`

**Fraud Risk Assessment:**
- **Low.** GPS spoofing requires jailbreak + fake location app (visible to organizers in system logs)
- Photo verification (optional, +2 XP) provides secondary proof for photo-earning stops
- Per-trail completion bonus (once per trail per user) caps max XP from fraudulent stops
- Daily XP caps on individual actions (e.g., visit limit) provide additional backstop

**Organizer Control:**
Add field to `OrganizerHoldSettings`:
```
trailCheckInRadiusMeters: Int @default(100)
```
Allows organizers to customize tolerance per sale (e.g., 50m for urban area, 200m for park trail)

---

## 3. Schema Design

### New Models

#### Trail
Replace/extend existing `TreasureTrail` model to support Treasure Trails (local discoveries) vs route trails.

```prisma
model TreasureTrail {
  id               String         @id @default(cuid())
  organizerId      String         // Organizer who created the trail
  organizer        Organizer      @relation(fields: [organizerId], references: [id])
  saleId           String         // Anchored sale
  sale             Sale           @relation(fields: [saleId], references: [id], onDelete: Cascade)

  // Trail metadata
  name             String         // e.g., "Eastown Saturday"
  description      String?        @db.VarChar(500)
  heroImageUrl     String?        // Cloudinary URL for trail card display

  // Trail type
  type             String         @default("DISCOVERY") // "DISCOVERY" | "ROUTE"
  // DISCOVERY: local POI tour + a sale anchor
  // ROUTE: multi-sale route (existing use case, V1 support)

  // Route-specific (V1 legacy, optional)
  stops_json       Json?          // [{saleId, order, timeEstimateMin}] — for ROUTE type only
  totalDistanceKm  Float?
  totalDurationMin Int?

  // Discovery-specific (new V2)
  minStopsRequired Int            @default(3)   // Minimum stops to complete
  maxStops         Int            @default(7)   // Max stops (affects bonus scaling)
  windowDays       Int            @default(7)   // Days to complete from first check-in

  // Completion tracking
  isActive         Boolean        @default(true)
  isFeatured       Boolean        @default(false) // Platform-curated featured trails
  isPublic         Boolean        @default(false)
  shareToken       String?        @unique @db.VarChar(32)

  // Stats
  viewCount        Int            @default(0)
  completionCount  Int            @default(0)
  avgRating        Decimal?       // Shopper ratings post-completion

  createdAt        DateTime       @default(now())
  updatedAt        DateTime       @updatedAt

  // Relations
  stops            TrailStop[]
  checkIns         TrailCheckIn[]
  completions      TrailCompletion[]
  ratings          TrailRating[]

  @@index([organizerId])
  @@index([saleId])
  @@index([isPublic, isFeatured])
  @@index([type])
}
```

#### TrailStop
Represents a single stop on the trail (sale, shop, POI, partner).

```prisma
model TrailStop {
  id              String         @id @default(cuid())
  trailId         String
  trail           TreasureTrail  @relation(fields: [trailId], references: [id], onDelete: Cascade)

  // Stop identification
  stopType        String         // "SALE" | "RESALE_SHOP" | "LANDMARK" | "CAFE" | "PARTNER"
  stopName        String
  stopDescription String?        @db.VarChar(300)
  address         String?

  // Geolocation
  latitude        Float
  longitude       Float

  // External reference (if applicable)
  saleId          String?        // For SALE type only
  sale            Sale?          @relation(fields: [saleId], references: [id], onDelete: SetNull)
  googlePlaceId   String?        // For non-sale stops (RESALE_SHOP, LANDMARK, CAFE)
  googleRating    Decimal?       // Cached from Places API
  googlePhone     String?        // Cached from Places API

  // XP reward
  baseXp          Int            // 5=sale, 3=resale, 2=POI, 4=partner (locked per type)
  photoXpBonus    Int            @default(2)

  // Sequence
  order           Int            // 0-based ordering in trail

  // Organizer note
  organizer_note  String?        @db.VarChar(200) // "Hidden gem", "Great coffee", etc.

  createdAt       DateTime       @default(now())
  updatedAt       DateTime       @updatedAt

  // Relations
  checkIns        TrailCheckIn[]
  photos          TrailPhoto[]

  @@unique([trailId, order])
  @@index([trailId])
  @@index([stopType])
  @@index([googlePlaceId])
}
```

#### TrailCheckIn
Records each user's check-in at a stop (like `SaleCheckin` but for trail stops).

```prisma
model TrailCheckIn {
  id             String        @id @default(cuid())
  trailId        String
  trail          TreasureTrail @relation(fields: [trailId], references: [id], onDelete: Cascade)
  stopId         String
  stop           TrailStop     @relation(fields: [stopId], references: [id], onDelete: Cascade)

  userId         String
  user           User          @relation(fields: [userId], references: [id], onDelete: Cascade)

  // GPS data
  latitude       Float
  longitude      Float

  // XP awarded
  baseXpAwarded  Int           // Base per-stop XP
  photoXpAwarded Int           @default(0) // 0 or 2 if photo posted

  // Photo (optional)
  photoId        String?       // Link to TrailPhoto if user posted one
  photo          TrailPhoto?   @relation(fields: [photoId], references: [id], onDelete: SetNull)

  // Timing
  checkedInAt    DateTime      @default(now())
  createdAt      DateTime      @default(now())

  @@unique([trailId, stopId, userId]) // One check-in per user per stop per trail
  @@index([trailId, userId])
  @@index([stopId])
  @@index([userId])
  @@index([checkedInAt])
}
```

#### TrailPhoto
Photos posted by shoppers at non-sale trail stops (goes to Loot Legend feed).

```prisma
model TrailPhoto {
  id             String        @id @default(cuid())
  checkInId      String
  checkIn        TrailCheckIn  @relation(fields: [checkInId], references: [id], onDelete: Cascade)
  stopId         String
  stop           TrailStop     @relation(fields: [stopId], references: [id], onDelete: Cascade)

  userId         String
  user           User          @relation(fields: [userId], references: [id], onDelete: Cascade)

  // Photo storage
  cloudinaryUrl  String        // Cloudinary CDN URL
  cloudinaryId   String        // For deletion reference

  // Social
  postedToFeed   Boolean       @default(true) // Shopper chose to share publicly
  likeCount      Int           @default(0)
  commentCount   Int           @default(0)

  createdAt      DateTime      @default(now())

  @@index([userId])
  @@index([stopId])
  @@index([createdAt])
}
```

#### TrailCompletion (Optional but Recommended)
Denormalized table to track user completions (avoids runtime aggregation).

```prisma
model TrailCompletion {
  id                     String        @id @default(cuid())
  trailId                String
  trail                  TreasureTrail @relation(fields: [trailId], references: [id], onDelete: Cascade)

  userId                 String
  user                   User          @relation(fields: [userId], references: [id], onDelete: Cascade)

  // Completion metadata
  completionBonusXp      Int           // 40–80 XP based on stop count
  totalXpEarned          Int           // Sum of all stop XP + bonus
  stopCountCompleted     Int           // Number of stops checked in
  photoCountPosted       Int           // Number of photos posted

  firstCheckInAt         DateTime      // When user completed first stop
  completedAt            DateTime      // When user completed last stop
  daysToComplete         Int           // Computed: (completedAt - firstCheckInAt).days

  rating                 Int?          // 1-5 star rating post-completion
  review                 String?       @db.VarChar(300)

  createdAt              DateTime      @default(now())
  updatedAt              DateTime      @updatedAt

  @@unique([trailId, userId])
  @@index([trailId])
  @@index([userId])
  @@index([completedAt])
}
```

#### TrailRating (Optional)
Shopper ratings of trails post-completion.

```prisma
model TrailRating {
  id             String        @id @default(cuid())
  trailId        String
  trail          TreasureTrail @relation(fields: [trailId], references: [id], onDelete: Cascade)

  userId         String
  user           User          @relation(fields: [userId], references: [id], onDelete: Cascade)

  rating         Int           // 1–5
  review         String?       @db.VarChar(500)

  createdAt      DateTime      @default(now())

  @@unique([trailId, userId]) // One rating per user per trail
  @@index([trailId, rating])
}
```

### User Model Relation

Add to `User` model:
```prisma
trails            TreasureTrail[]      // Trails created by organizer
trailCheckIns     TrailCheckIn[]       // Check-ins by shopper
trailPhotos       TrailPhoto[]         // Photos posted by shopper
trailCompletions  TrailCompletion[]    // Completed trails (shopper)
trailRatings      TrailRating[]        // Ratings given by shopper
```

### Sale Model Relation

Add to `Sale` model:
```prisma
trails            TreasureTrail[] @relation("SaleTrails")
trailStops        TrailStop[]     @relation("SaleTrailStops") // Stops anchored to this sale
```

### Migration Plan

**File:** `packages/database/prisma/migrations/[timestamp]_add_treasure_trails/migration.sql`

```sql
-- New tables for Treasure Trails
CREATE TABLE "TreasureTrail" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "organizerId" TEXT NOT NULL,
  "saleId" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "description" VARCHAR(500),
  "heroImageUrl" TEXT,
  "type" TEXT NOT NULL DEFAULT 'DISCOVERY',
  "stops_json" JSONB,
  "totalDistanceKm" DOUBLE PRECISION,
  "totalDurationMin" INTEGER,
  "minStopsRequired" INTEGER NOT NULL DEFAULT 3,
  "maxStops" INTEGER NOT NULL DEFAULT 7,
  "windowDays" INTEGER NOT NULL DEFAULT 7,
  "isActive" BOOLEAN NOT NULL DEFAULT true,
  "isFeatured" BOOLEAN NOT NULL DEFAULT false,
  "isPublic" BOOLEAN NOT NULL DEFAULT false,
  "shareToken" VARCHAR(32) UNIQUE,
  "viewCount" INTEGER NOT NULL DEFAULT 0,
  "completionCount" INTEGER NOT NULL DEFAULT 0,
  "avgRating" DECIMAL,
  "createdAt" TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP NOT NULL,
  FOREIGN KEY ("organizerId") REFERENCES "Organizer"("id") ON DELETE RESTRICT,
  FOREIGN KEY ("saleId") REFERENCES "Sale"("id") ON DELETE CASCADE
);
CREATE INDEX "TreasureTrail_organizerId_idx" ON "TreasureTrail"("organizerId");
CREATE INDEX "TreasureTrail_saleId_idx" ON "TreasureTrail"("saleId");
CREATE INDEX "TreasureTrail_isPublic_isFeatured_idx" ON "TreasureTrail"("isPublic", "isFeatured");
CREATE INDEX "TreasureTrail_type_idx" ON "TreasureTrail"("type");

CREATE TABLE "TrailStop" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "trailId" TEXT NOT NULL,
  "stopType" TEXT NOT NULL,
  "stopName" TEXT NOT NULL,
  "stopDescription" VARCHAR(300),
  "address" TEXT,
  "latitude" DOUBLE PRECISION NOT NULL,
  "longitude" DOUBLE PRECISION NOT NULL,
  "saleId" TEXT,
  "googlePlaceId" TEXT,
  "googleRating" DECIMAL,
  "googlePhone" TEXT,
  "baseXp" INTEGER NOT NULL,
  "photoXpBonus" INTEGER NOT NULL DEFAULT 2,
  "order" INTEGER NOT NULL,
  "organizer_note" VARCHAR(200),
  "createdAt" TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP NOT NULL,
  FOREIGN KEY ("trailId") REFERENCES "TreasureTrail"("id") ON DELETE CASCADE,
  FOREIGN KEY ("saleId") REFERENCES "Sale"("id") ON DELETE SET NULL,
  UNIQUE("trailId", "order")
);
CREATE INDEX "TrailStop_trailId_idx" ON "TrailStop"("trailId");
CREATE INDEX "TrailStop_stopType_idx" ON "TrailStop"("stopType");
CREATE INDEX "TrailStop_googlePlaceId_idx" ON "TrailStop"("googlePlaceId");

CREATE TABLE "TrailCheckIn" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "trailId" TEXT NOT NULL,
  "stopId" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "latitude" DOUBLE PRECISION NOT NULL,
  "longitude" DOUBLE PRECISION NOT NULL,
  "baseXpAwarded" INTEGER NOT NULL,
  "photoXpAwarded" INTEGER NOT NULL DEFAULT 0,
  "photoId" TEXT,
  "checkedInAt" TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "createdAt" TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY ("trailId") REFERENCES "TreasureTrail"("id") ON DELETE CASCADE,
  FOREIGN KEY ("stopId") REFERENCES "TrailStop"("id") ON DELETE CASCADE,
  FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE,
  UNIQUE("trailId", "stopId", "userId")
);
CREATE INDEX "TrailCheckIn_trailId_userId_idx" ON "TrailCheckIn"("trailId", "userId");
CREATE INDEX "TrailCheckIn_stopId_idx" ON "TrailCheckIn"("stopId");
CREATE INDEX "TrailCheckIn_userId_idx" ON "TrailCheckIn"("userId");
CREATE INDEX "TrailCheckIn_checkedInAt_idx" ON "TrailCheckIn"("checkedInAt");

CREATE TABLE "TrailPhoto" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "checkInId" TEXT NOT NULL,
  "stopId" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "cloudinaryUrl" TEXT NOT NULL,
  "cloudinaryId" TEXT NOT NULL,
  "postedToFeed" BOOLEAN NOT NULL DEFAULT true,
  "likeCount" INTEGER NOT NULL DEFAULT 0,
  "commentCount" INTEGER NOT NULL DEFAULT 0,
  "createdAt" TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY ("checkInId") REFERENCES "TrailCheckIn"("id") ON DELETE CASCADE,
  FOREIGN KEY ("stopId") REFERENCES "TrailStop"("id") ON DELETE CASCADE,
  FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE
);
CREATE INDEX "TrailPhoto_userId_idx" ON "TrailPhoto"("userId");
CREATE INDEX "TrailPhoto_stopId_idx" ON "TrailPhoto"("stopId");
CREATE INDEX "TrailPhoto_createdAt_idx" ON "TrailPhoto"("createdAt");

CREATE TABLE "TrailCompletion" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "trailId" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "completionBonusXp" INTEGER NOT NULL,
  "totalXpEarned" INTEGER NOT NULL,
  "stopCountCompleted" INTEGER NOT NULL,
  "photoCountPosted" INTEGER NOT NULL,
  "firstCheckInAt" TIMESTAMP NOT NULL,
  "completedAt" TIMESTAMP NOT NULL,
  "daysToComplete" INTEGER NOT NULL,
  "rating" INTEGER,
  "review" VARCHAR(300),
  "createdAt" TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP NOT NULL,
  FOREIGN KEY ("trailId") REFERENCES "TreasureTrail"("id") ON DELETE CASCADE,
  FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE,
  UNIQUE("trailId", "userId")
);
CREATE INDEX "TrailCompletion_trailId_idx" ON "TrailCompletion"("trailId");
CREATE INDEX "TrailCompletion_userId_idx" ON "TrailCompletion"("userId");
CREATE INDEX "TrailCompletion_completedAt_idx" ON "TrailCompletion"("completedAt");

CREATE TABLE "TrailRating" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "trailId" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "rating" INTEGER NOT NULL,
  "review" VARCHAR(500),
  "createdAt" TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY ("trailId") REFERENCES "TreasureTrail"("id") ON DELETE CASCADE,
  FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE,
  UNIQUE("trailId", "userId")
);
CREATE INDEX "TrailRating_trailId_rating_idx" ON "TrailRating"("trailId", "rating");

-- Link Sale and TrailPhoto to User
ALTER TABLE "TreasureTrail" ADD CONSTRAINT "TreasureTrail_organizerId_fkey"
  FOREIGN KEY ("organizerId") REFERENCES "Organizer"("id") ON DELETE RESTRICT;
ALTER TABLE "TrailPhoto" ADD CONSTRAINT "TrailPhoto_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE;

-- Link TrailCompletion and TrailRating to User
ALTER TABLE "TrailCompletion" ADD CONSTRAINT "TrailCompletion_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE;
ALTER TABLE "TrailRating" ADD CONSTRAINT "TrailRating_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE;
```

---

## 4. Photo Mechanic Integration

### Existing Cloudinary Pipeline

Current photo upload (items):
1. Frontend: `ItemPhotoManager` → Cloudinary signed URL upload
2. Backend: `POST /items/:id/photos` receives Cloudinary URL + metadata
3. Storage: Photos stored in `Photo` model (itemId + URL)
4. Serving: Cloudinary CDN

### Trail Photo Integration

**Extend, don't duplicate:**

1. **Same Cloudinary bucket:** Trail photos live in same project folder as item photos (e.g., `/findasale/trails/[trailId]/[stopId]/[photoId].jpg`)
2. **Same upload flow:** Frontend uses Cloudinary signed URL, backend receives callback
3. **New model:** `TrailPhoto` (not a separate photo system)
4. **Social sharing:** Trail photos post to "Loot Legend" feed via existing UGC infrastructure (`UGCPhoto` table)

### Backend Changes

**New endpoint:** `POST /trails/:trailId/stops/:stopId/photo`
- Receives: `{ cloudinaryUrl, cloudinaryId }`
- Links photo to the most recent `TrailCheckIn` for this user + stop + trail
- Creates `TrailPhoto` record
- Posts to user's Loot Legend feed (via `UGCPhoto` create)
- Awards +2 XP if this is the user's first photo at this stop

### Frontend Changes

**Photo flow in trail check-in:**
1. After check-in succeeds, show "Add a photo (+2 XP)" button
2. Tap → camera/gallery picker
3. Upload to Cloudinary (signed URL)
4. POST to `/trails/:trailId/stops/:stopId/photo` with URL
5. Toast: "Photo posted to Loot Legend! +2 XP"
6. Refresh user's XP display

---

## 5. API Contracts

### Organizer Trail Builder APIs

#### POST /trails
Create a new trail (organizer only).

**Request:**
```json
{
  "saleId": "sale_123",
  "name": "Eastown Saturday",
  "description": "Estate sale + vintage shops",
  "type": "DISCOVERY",
  "minStopsRequired": 3,
  "maxStops": 7,
  "windowDays": 7
}
```

**Response:**
```json
{
  "id": "trail_456",
  "organizerId": "org_123",
  "saleId": "sale_123",
  "name": "Eastown Saturday",
  "description": "Estate sale + vintage shops",
  "type": "DISCOVERY",
  "stops": [],
  "isActive": true,
  "isFeatured": false,
  "createdAt": "2026-04-06T10:00:00Z"
}
```

#### POST /trails/:id/stops
Add a stop to a trail.

**Request:**
```json
{
  "stopType": "RESALE_SHOP",
  "stopName": "Vintage Collective",
  "address": "123 Main St, Grand Rapids, MI 49503",
  "latitude": 42.9629,
  "longitude": -85.6789,
  "googlePlaceId": "ChIJv3M...",
  "baseXp": 3,
  "organizer_note": "Hidden gem, ask for Amy"
}
```

**Response:**
```json
{
  "id": "stop_789",
  "trailId": "trail_456",
  "stopType": "RESALE_SHOP",
  "stopName": "Vintage Collective",
  "latitude": 42.9629,
  "longitude": -85.6789,
  "baseXp": 3,
  "order": 1,
  "createdAt": "2026-04-06T10:05:00Z"
}
```

#### GET /trails/:id/search-nearby
Search for nearby places to add as stops.

**Query params:**
```
?latitude=42.9629&longitude=-85.6789&radius=500&type=resale_shop
```

**Response:**
```json
{
  "places": [
    {
      "googlePlaceId": "ChIJ...",
      "name": "Vintage Collective",
      "address": "123 Main St, Grand Rapids, MI 49503",
      "latitude": 42.9629,
      "longitude": -85.6789,
      "rating": 4.7,
      "phone": "(616) 123-4567",
      "iconUrl": "https://maps.gstatic.com/..."
    }
  ]
}
```

#### PATCH /trails/:id
Update trail metadata (organizer only).

**Request:**
```json
{
  "name": "Eastown Saturday Edition 2",
  "description": "Updated description",
  "isPublic": true,
  "isFeatured": false
}
```

### Shopper Trail Discovery & Check-In APIs

#### GET /trails
List available trails (filtered by proximity to user or featured).

**Query params:**
```
?latitude=42.9629&longitude=-85.6789&radiusKm=10&sort=featured|nearby|completion
```

**Response:**
```json
{
  "trails": [
    {
      "id": "trail_456",
      "name": "Eastown Saturday",
      "description": "Estate sale + vintage shops",
      "heroImageUrl": "https://cloudinary.../",
      "organizerName": "Acme Estate Sales",
      "stopCount": 5,
      "avgRating": 4.8,
      "completionCount": 127,
      "estimatedXp": 140,
      "distance_km": 2.1,
      "isFeatured": true
    }
  ]
}
```

#### GET /trails/:id
Get trail details + user's progress (if logged in).

**Response:**
```json
{
  "id": "trail_456",
  "name": "Eastown Saturday",
  "description": "Estate sale + vintage shops",
  "type": "DISCOVERY",
  "organizerName": "Acme Estate Sales",
  "organizerId": "org_123",
  "stops": [
    {
      "id": "stop_789",
      "order": 0,
      "stopType": "SALE",
      "stopName": "Acme Estate Sale",
      "baseXp": 5,
      "photoXpBonus": 0,
      "userCheckedIn": true,
      "userPostedPhoto": false
    },
    {
      "id": "stop_790",
      "order": 1,
      "stopType": "RESALE_SHOP",
      "stopName": "Vintage Collective",
      "baseXp": 3,
      "photoXpBonus": 2,
      "userCheckedIn": true,
      "userPostedPhoto": true
    }
  ],
  "userProgress": {
    "checkedInStops": 2,
    "totalStops": 5,
    "isCompleted": false,
    "completionBonusEligible": false,
    "firstCheckInAt": "2026-04-06T11:00:00Z",
    "xpEarned": 8,
    "windowExpiresAt": "2026-04-13T11:00:00Z"
  }
}
```

#### POST /trails/:id/stops/:stopId/checkin
Check in to a trail stop.

**Request:**
```json
{
  "latitude": 42.9629,
  "longitude": -85.6789
}
```

**Response:**
```json
{
  "checkInId": "checkin_999",
  "stopId": "stop_789",
  "baseXpAwarded": 3,
  "message": "Checked in! +3 XP. Add a photo for +2 more XP.",
  "updatedUserXp": 278,
  "trailProgress": {
    "checkedInStops": 2,
    "totalStops": 5,
    "isCompleted": false
  }
}
```

#### POST /trails/:id/stops/:stopId/photo
Post a photo at a trail stop.

**Request:**
```json
{
  "cloudinaryUrl": "https://res.cloudinary.com/...",
  "cloudinaryId": "findasale/trails/trail_456/stop_789/xyz.jpg"
}
```

**Response:**
```json
{
  "photoId": "photo_111",
  "postedToFeed": true,
  "photoXpAwarded": 2,
  "message": "Photo added to Loot Legend! +2 XP.",
  "updatedUserXp": 280
}
```

#### GET /trails/:id/completions
List users who completed this trail (public).

**Response:**
```json
{
  "completions": [
    {
      "userId": "user_222",
      "shopperName": "Alice",
      "profileUrl": "/profiles/alice",
      "completedAt": "2026-04-06T15:00:00Z",
      "daysToComplete": 1,
      "totalXpEarned": 149,
      "rating": 5,
      "review": "Awesome trail, great recommendations!"
    }
  ]
}
```

#### POST /trails/:id/rate
Rate a trail post-completion (shopper only).

**Request:**
```json
{
  "rating": 5,
  "review": "Fantastic! Can't wait for more."
}
```

**Response:**
```json
{
  "trailId": "trail_456",
  "userId": "user_222",
  "rating": 5,
  "updatedAvgRating": 4.9,
  "updatedRatingCount": 47
}
```

---

## 6. Photo Integration — Technical Details

### Cloudinary Folder Structure

```
/findasale/trails/[trailId]/[stopId]/[photoId].jpg
```

Example:
```
/findasale/trails/trail_456/stop_789/photo_111.jpg
```

### Signed URL Generation (Frontend)

Existing code already generates signed URLs for item photos. Reuse:

```javascript
// POST /cloudinary-signature (backend)
// Request: { folder: "trails", trailId, stopId }
// Response: { signature, timestamp, publicId, apiKey }
```

Backend logic:
```javascript
const folder = `findasale/trails/${trailId}/${stopId}`;
const publicId = `${uuidv4()}`;
const signature = cloudinary.utils.api_sign_request(
  { folder, public_id: publicId, resource_type: 'auto' },
  process.env.CLOUDINARY_API_SECRET
);
```

### XP Posting

When photo is posted, create `PointsTransaction`:
```
{
  userId: user_222,
  type: "TRAIL_PHOTO",
  points: 2,
  saleId: trail_456,  // Link back to sale
  description: "Photo at Vintage Collective",
  createdAt: now()
}
```

---

## 7. XP Integration with Broader System

### PointsTransaction Types (New)

Add to existing enum:
```
"TRAIL_STOP_CHECKIN",
"TRAIL_COMPLETION_BONUS",
"TRAIL_PHOTO"
```

### Transaction Recording

**On check-in:**
```sql
INSERT INTO PointsTransaction (userId, type, points, description, createdAt)
VALUES (user_222, 'TRAIL_STOP_CHECKIN', 3, 'Checked in at Vintage Collective', now());
```

**On completion bonus:**
```sql
INSERT INTO PointsTransaction (userId, type, points, description, createdAt)
VALUES (user_222, 'TRAIL_COMPLETION_BONUS', 40, 'Completed Eastown Saturday (3 stops)', now());
```

**On photo post:**
```sql
INSERT INTO PointsTransaction (userId, type, points, description, createdAt)
VALUES (user_222, 'TRAIL_PHOTO', 2, 'Photo at Vintage Collective', now());
```

### Rank Calculation

Existing logic in `userService`:
```javascript
const totalXp = await getPointsSum(userId); // Sum all PointsTransaction.points
const rank = calculateRank(totalXp); // INITIATE < Scout (500) < Ranger (2000) < Sage (5000) < Grandmaster (12000)
```

Trail XP feeds directly into this sum. No changes needed.

### XP Caps (Daily/Monthly)

Existing caps apply to trail actions:
- **Per-day visit cap:** 150 XP/mo → includes trail stop check-ins
- **Per-month photo bonus cap:** Recommend 50 XP/mo → includes trail photos
- **Completion bonus:** Unlimited (no cap; 1x per trail per user prevents abuse)

No new caps needed. Trails fit into existing framework.

---

## 8. Show-Stoppers Assessment

### Potential Risks Evaluated

| Risk | Impact | Mitigation | Status |
|------|--------|-----------|--------|
| **Google Places API cost scaling** | $5-7/mo → $50+/mo if 1000+ trails | Implement Redis cache (1h TTL); rate limit 200 queries/org/day | ✅ LOW |
| **GPS spoofing for XP** | Fraudster completes 7-stop trail from home | Photo verification required for photo XP; per-trail completion bonus caps fraud XP | ✅ MANAGEABLE |
| **Organizer manual entry burden** | Organizer must enter all stops manually | Google Places API search + auto-populate addresses | ✅ LOW |
| **Off-sale stop verification** | How do we verify someone actually visited a café? | GPS radius + optional photo; matches hold verification pattern | ✅ ACCEPTABLE |
| **Trail "dark matter"** | Old trails remain public; organizer can't delete | Add `deletedAt` soft-delete field; restore from archive on organizer request | ✅ FUTURE |
| **Multi-tenancy confusion** | "Did I complete this trail?" state sync | TrailCompletion table + check API for user's completion status | ✅ LOW |
| **Photo storage runaway** | Thousands of trail photos; storage cost | Cloudinary auto-delete policy (90 days if unpopular); compression on upload | ✅ FUTURE |

**CONCLUSION: NO BLOCKERS.** All risks are mitigated by existing patterns or deferred to Phase 2.

---

## 9. Flagged for Patrick (Business Decisions)

1. **Google Places API cost:** Approve $200/mo spend cap? (Currently $0; scales to ~$7/mo typical, potentially $50+/mo if viral)

2. **Featured Trails Curation:** Who decides which trails are featured? Organizers request? Platform reviewer? Algorithm (completion rate + rating)?

3. **Trail Creator Incentive:** Do we reward organizers for creating high-quality trails? (e.g., +20 XP bonus per completed trail they created, once per trail)

4. **Trail Sharing Revenue:** Should we offer trail creators a commission on organizer sign-ups driven by their trail? (Deferred to Phase 2)

5. **Community Trails (Phase 2):** When/how do shoppers create trails instead of organizers? Gating (Sage+ rank)? Editorial review?

---

## 10. Implementation Roadmap

### Phase 2a (MVP — This Sprint)

**Backend:**
- [ ] New schema: Trail, TrailStop, TrailCheckIn, TrailPhoto, TrailCompletion
- [ ] Migration script (manual deploy via Railway with DATABASE_URL override)
- [ ] PlacesService: Google Places API integration + caching
- [ ] Trail builder endpoints: POST /trails, POST /trails/:id/stops, GET /trails/:id/search-nearby, PATCH /trails/:id
- [ ] Shopper endpoints: GET /trails, GET /trails/:id, POST /trails/:id/stops/:stopId/checkin, POST /trails/:id/stops/:stopId/photo, POST /trails/:id/rate
- [ ] XP recording: PointsTransaction types + logic

**Frontend:**
- [ ] Trail discovery page: list + map view
- [ ] Trail details page: stops, user progress, ratings
- [ ] Check-in flow: geolocation verification + XP toast
- [ ] Photo upload: Cloudinary signed URL + feed posting

**QA:**
- [ ] End-to-end: organizer creates trail, shopper completes trail, XP awarded + completion tracked
- [ ] GPS edge cases: boundary check (99m pass, 101m fail)
- [ ] Photo posting: Cloudinary upload + Loot Legend appearance
- [ ] Completion bonus math: 3-stop=40, 4=50, etc.

### Phase 2b (Organizer Dashboard)

- [ ] Trail analytics: views, completions, avg rating, revenue (if applicable)
- [ ] Trail editing: rename, update description, reorder stops, retire old trails
- [ ] Featured trail nomination

### Phase 2c (Community & Curation)

- [ ] Community trail creation (Sage+ rank gate)
- [ ] Editorial review workflow
- [ ] Trail revenue share for creators

---

## 11. Context Checkpoint

**Ready for developer dispatch:** YES

**Blockers:** None

**Known unknowns:**
- Patrick's approval on Google Places cost cap
- Curation rules for featured trails
- Organizer incentive strategy

**Next steps:**
1. Patrick approves ADR + cost cap
2. Dispatch to findasale-dev for schema + backend endpoints
3. Dispatch to findasale-dev for frontend trail discovery
4. Dispatch to findasale-qa for E2E verification

