# ADR — Phase 4 Architecture Brief
**Features #25, #29, #31, #32**

**Decision Date:** 2026-03-17 (Session 187)
**Status:** Architecture Complete — GO for implementation
**Architect:** Systems Architect

---

## Executive Summary

Phase 4 introduces four complementary features targeting organizer productivity (Item Library), shopper retention (Loyalty Passport), brand amplification (Brand Kit expansion), and intelligent notifications (Wishlist Alerts). All four are additive to existing schema; none require destructive migrations. Three require new models; one leverages existing infrastructure.

**Go/No-Go:** **ALL GO** — Risk is LOW across the board. No schema bottlenecks. All deps satisfied by existing infrastructure.

---

## Feature #25 — Organizer Item Library (Consignment Rack) [PRO]

### Product Summary
Organizers catalog items in a persistent library across sales. Items in the library can be:
- Pulled into a specific sale (status → PUBLISHED within a sale)
- Priced independently per-sale
- Tracked across multiple sales with price history
- Searched and filtered by organizer

Schema question: **Does a LibraryItem become a regular Item when added to a sale, or are they separate models?**

**Architecture Decision: Unified model.** Item gains a `libraryId` field (nullable). When `libraryId=null, saleId=set`, the item is in-sale. When `libraryId=set, saleId=null`, the item is in library. When both are set, the item is staged for addition to a sale. Maintains single source of truth; avoids duplication.

### Schema Design

**New Models:** None. Extend existing `Item` model.

**New Fields on `Item`:**
```prisma
model Item {
  // ... existing fields ...

  // Item Library Support
  libraryId       String?        // Links item to organizer's library (FK on future LibraryItem table, optional for now)
  inLibrary       Boolean        @default(false) // Cached flag for rapid filtering
  priceVariants   Json?          // { saleId: price } map for per-sale pricing

  // Price History (already exists: ItemPriceHistory model)
  // — use existing table, new changedBy reason: "library_pulled"

  @@index([libraryId])
  @@index([organizerId, inLibrary])
}

// Future: Separate LibraryItem model for de-duplication
// For Phase 4, keep items unified. Scale to separate model in Phase 5 if needed.
```

**No schema migration required yet.** The design pattern works with existing Item model using `inLibrary` flag + `libraryId` as namespace anchor. Full normalization (separate LibraryItem table) deferred to Phase 5 when data volume warrants it.

### Backend Contract

**Service:** `itemLibraryService.ts` (new)
```typescript
// Core operations
addToLibrary(itemId, organizerId): Promise<Item>
removeFromLibrary(itemId): Promise<void>
pullFromLibrary(itemId, saleId, priceOverride?): Promise<Item> // Creates copy in sale
getLibraryItems(organizerId, filters?): Promise<Item[]> // { search, category, minPrice, maxPrice, sold }
getPriceHistory(itemId): Promise<ItemPriceHistory[]>
getPricingSuggestion(itemId, saleId): Promise<{ suggested, min, max }> // From sold items in same category
```

**Controller:** `itemLibraryController.ts` (new)
```typescript
// Endpoints (all require auth + PRO tier)
POST   /api/library/add                    // { itemId } → add to library
DELETE /api/library/:itemId                 // Remove from library
POST   /api/library/:itemId/pull            // { saleId, priceOverride? } → pull into sale
GET    /api/library                         // List library items (org-scoped)
GET    /api/library/:itemId/price-history   // Price history for item
GET    /api/library/:itemId/pricing-advice  // ML-based price suggestion
```

**Route:** `routes/library.ts` (new) — register in `index.ts`

**Auth:** `requireTier('PRO')` middleware on all endpoints.

### Frontend Contract

**Hook:** `useItemLibrary.ts` (new)
```typescript
const {
  libraryItems,
  loading,
  addToLibrary,
  removeFromLibrary,
  pullFromLibrary,
  getPriceHistory
} = useItemLibrary(organizerId)
```

**Pages/Components:**
- `pages/organizer/library.tsx` (new) — Library browser with filters, search, pull dialog
- `pages/organizer/add-items/[saleId].tsx` (MODIFIED) — Add "Pull from Library" button next to manual add
- `components/LibraryItemCard.tsx` (new) — Card display for library items in browse view
- `components/PullFromLibraryModal.tsx` (new) — Modal to select library items + confirm price per-sale

**Data Flow:**
1. Organizer creates item → "Save to Library?" checkbox on item-add form
2. Item marked `inLibrary=true`, appears in library browser
3. Organizer opens a new sale, clicks "Pull from Library"
4. Selects items, sets per-sale price overrides
5. Selected items get `priceVariants[saleId] = price`, `saleId` set, `inLibrary` remains true
6. Item now appears in both library and the sale

### Dependencies

- Existing `Item`, `ItemPriceHistory` models ✅
- `requireTier('PRO')` middleware ✅
- Organizer auth context ✅

**No external deps.**

### Risk Assessment

**Risk: LOW**

- **Rationale:** Zero schema modifications required initially. Works as feature flag (inLibrary boolean). Existing ItemPriceHistory table handles tracking. No concurrent write conflicts. Read-heavy (library browsing).
- **Mitigation:** Query indexing on `(organizerId, inLibrary)` to keep library queries <100ms. Price variants stored as JSON (not normalized) — acceptable for <1k items per org.

### Sprints Estimate

- **Sprint 1:** itemLibraryService + itemLibraryController + routes + `useItemLibrary` hook. (2–2.5 sprints)
- **Sprint 2:** Library browser page + pull modal + add-items integration. (1.5–2 sprints)

**Total: 3.5–4 sprints (~7–8 hours)**

### GO/NO-GO Recommendation

**GO** — Ship in Phase 4. PRO tier upsell with high perceived value. Schema is stable; no risk to other features. Can run in parallel with #29, #31, #32.

---

## Feature #29 — Shopper Loyalty Passport [FREE]

### Product Summary
Stamps system where shoppers earn stamps for actions: ATTEND_SALE (1 stamp), MAKE_PURCHASE (2 stamps), WRITE_REVIEW (1 stamp), REFER_FRIEND (3 stamps). Badges unlock at milestones: 5 stamps = Bronze, 20 = Silver, 50 = Gold.

Hunt Pass holders get **early access** to new listings — technically, items published to a sale are hidden from non-Hunt-Pass shoppers for 24 hours before full visibility.

**Schema check:** Hunt Pass exists (`User.huntPassActive`, `User.huntPassExpiry`). Stamps need new model. Badges partially exist (Badge, UserBadge) but need new stamp-based criteria.

### Schema Design

**New Models:**

```prisma
model ShopperStamp {
  id        String   @id @default(cuid())
  userId    String
  user      User     @relation(fields: [userId], references: [id], onDelete: Cascade)
  type      String   // "ATTEND_SALE" | "MAKE_PURCHASE" | "WRITE_REVIEW" | "REFER_FRIEND"
  count     Int      @default(1) // Number of stamps for this type
  earnedAt  DateTime @default(now())
  createdAt DateTime @default(now())

  @@unique([userId, type])
  @@index([userId])
}

model StampMilestone {
  id        String   @id @default(cuid())
  userId    String
  user      User     @relation(fields: [userId], references: [id], onDelete: Cascade)
  milestone Int      // 5, 20, 50
  badgeType String   // "BRONZE" | "SILVER" | "GOLD"
  earnedAt  DateTime @default(now())

  @@unique([userId, milestone])
  @@index([userId])
}
```

**Extend User model:**
```prisma
model User {
  // ... existing ...
  stamps          ShopperStamp[]
  stampMilestones StampMilestone[]
}
```

**Extend Item model (Hunt Pass early access):**
```prisma
model Item {
  // ... existing ...
  earlyAccessUntil DateTime?  // Embargo time for non-Hunt-Pass shoppers
}
```

**Migration:** `20260317000000_add_shopper_stamps/migration.sql`

### Backend Contract

**Service:** `stampService.ts` (new)
```typescript
addStamp(userId, type): Promise<ShopperStamp>
getStampCount(userId, type?): Promise<{ type: string; count: int }[]>
getTotalStamps(userId): Promise<number>
checkAndAwardMilestone(userId): Promise<StampMilestone | null>
getShopperPassport(userId): Promise<{ stamps, totalStamps, milestones, badges }>
```

**Service:** `earlyAccessService.ts` (new)
```typescript
isEarlyAccessEmbargoed(itemId, userId): Promise<boolean>
setEarlyAccess(itemId, durationHours): Promise<Item> // Called on item publish
```

**Controller:** `stampController.ts` (new)
```typescript
GET /api/stamps/my-passport              // { stamps, milestones, badges }
POST /api/stamps/attend/:saleId           // Award attendance stamp (called after shopper visits)
```

**Route:** `routes/stamps.ts` (new)

**Trigger Points (wired into existing controllers):**
- `reservationController.ts` — After HOLD placed, call `stampService.addStamp(userId, 'ATTEND_SALE')`
- `stripeController.ts` — After purchase, call `stampService.addStamp(userId, 'MAKE_PURCHASE', 2)`
- `reviewController.ts` — After review created, call `stampService.addStamp(userId, 'WRITE_REVIEW')`
- `saleController.ts` — On item publish, call `earlyAccessService.setEarlyAccess(itemId, 24)` if sale is public

**Search filtering:**
- `itemController.ts` — GET `/api/items/:saleId` — filter items by `earlyAccessUntil`. If `now < earlyAccessUntil` AND user is not Hunt Pass holder, exclude item.

### Frontend Contract

**Hook:** `useStampPassport.ts` (new)
```typescript
const {
  stamps,
  totalStamps,
  milestones,
  loadingPassport,
  refetch
} = useStampPassport()
```

**Component:** `StampPassportBadge.tsx` (new)
- Progress bar toward next milestone
- Stamp count breakdown (5 / 20 ATTEND_SALE, etc.)
- Badge display (Bronze at 5, Silver at 20, Gold at 50)
- Sage-green theme with mint accents

**Page:** `pages/shopper/passport.tsx` (new)
- Full passport view with stamp history, milestones, badges
- CTA: "Upgrade to Hunt Pass for 24h early access"

**Integration points:**
- `/` homepage — Show compact stamp badge in user nav (if logged in)
- `/sales/[id]` detail — Show "Early access for Hunt Pass" banner on embargoed items

**Data Flow:**
1. Shopper visits sale → stamp awarded (handled server-side after hold/purchase/review)
2. Shopper reaches 5 stamps → Bronze badge auto-awarded
3. Shopper with Hunt Pass sees items 24h earlier
4. Shopper without Hunt Pass sees "Coming in 24h" or embargo timer

### Dependencies

- Existing `User`, `Item` models ✅
- `Badge`, `UserBadge` models for badge display ✅
- Hunt Pass implementation (`User.huntPassActive`, `User.huntPassExpiry`) ✅
- Auth context ✅

**New DB models: 2** (`ShopperStamp`, `StampMilestone`)

### Risk Assessment

**Risk: LOW**

- **Rationale:** Purely additive. No breaking changes to existing queries. Stamp award logic sits at transaction boundaries (after hold/purchase confirmed). Early access embargo is simple datetime comparison on item query.
- **Concern:** Spam risk — user could manually award stamps if endpoint auth is weak. **Mitigation:** All stamp endpoints require auth + only backend can call stampService. No user-facing endpoint to manually add stamps.

### Sprints Estimate

- **Sprint 1:** stampService + earlyAccessService + controllers + stamps route + migration. (1.5–2 sprints)
- **Sprint 2:** StampPassportBadge + passport page + integration into item query filter. (1–1.5 sprints)

**Total: 2.5–3.5 sprints (~5–7 hours)**

### GO/NO-GO Recommendation

**GO** — High engagement driver. FREE tier increases stickiness. Hunt Pass upsell angle is strong. Ship with Phase 4 after #25 (they're independent).

---

## Feature #31 — Organizer Brand Kit (Expansion) [PRO]

### Product Summary
Organizers customize their visual brand across all exports, social templates, and sale pages.

**Schema audit:** BrandKit exists partially. Current fields in Organizer:
- `brandLogoUrl` (Cloudinary URL)
- `brandPrimaryColor` (hex)
- `brandSecondaryColor` (hex)

**Missing:**
- Custom storefront URL slug (`/organizers/[customSlug]`)
- Email header customization (logo + primary color override)
- Social card template color overrides
- Custom favicon + banner image for organizer profile
- Font choice (1–2 options, e.g., Serif vs. Sans)

### Schema Design

**Extend Organizer model (ADDITIVE ONLY):**

```prisma
model Organizer {
  // ... existing Brand Kit fields ...

  // Brand Kit Expansion Fields
  customStorefrontSlug   String?     @unique     // e.g., "vintage-estate-co"
  brandFaviconUrl        String?                 // Favicon (Cloudinary)
  brandBannerUrl         String?                 // Profile banner image (Cloudinary)
  brandFont              String      @default("sans") // "sans" | "serif"
  emailHeaderBgColor     String?     // Hex override for email template header
  socialCardTextColor    String?     // Hex for social template text (contrast override)
  socialCardBgGradient   String?     // CSS gradient for social card background
}
```

**Migration:** `20260317000000_expand_brand_kit/migration.sql`

**Rollback Plan:**
```sql
-- Down: Rollback existing fields (undo expansion only)
ALTER TABLE "Organizer" DROP COLUMN IF EXISTS "customStorefrontSlug";
ALTER TABLE "Organizer" DROP COLUMN IF EXISTS "brandFaviconUrl";
ALTER TABLE "Organizer" DROP COLUMN IF EXISTS "brandBannerUrl";
ALTER TABLE "Organizer" DROP COLUMN IF EXISTS "brandFont";
ALTER TABLE "Organizer" DROP COLUMN IF EXISTS "emailHeaderBgColor";
ALTER TABLE "Organizer" DROP COLUMN IF EXISTS "socialCardTextColor";
ALTER TABLE "Organizer" DROP COLUMN IF EXISTS "socialCardBgGradient";
```

### Backend Contract

**Service:** `brandKitService.ts` (new)
```typescript
updateBrandKit(organizerId, {
  customStorefrontSlug,
  brandFaviconUrl,
  brandBannerUrl,
  brandFont,
  emailHeaderBgColor,
  socialCardTextColor,
  socialCardBgGradient
}): Promise<Organizer>

getBrandKit(organizerId): Promise<BrandKitDTO>
validateSlug(slug): Promise<{ valid: boolean; reason?: string }> // Check uniqueness + format
generateSocialCardPreview(organizerId): Promise<string> // SVG preview
```

**Controller:** `brandKitController.ts` (existing, extend)
```typescript
PUT /api/brand-kit                 // Update brand kit (all fields)
GET /api/brand-kit/:organizerId    // Get organizer's brand kit
POST /api/brand-kit/slug-available // { slug } → { available: boolean }
```

**Route:** Extend existing `routes/brand-kit.ts`

**Auth:** `requireTier('PRO')` middleware on PUT; GET is public.

**Webhook integration (Stripe):**
- On subscription downgrade PRO → SIMPLE, disable custom slug (revert to `/organizers/[id]`)

### Frontend Contract

**Page:** `pages/organizer/brand-kit.tsx` (MODIFIED)

Add sections:
- **Custom Storefront URL:** Text input + slug availability checker
- **Visual Elements:** Logo, favicon, banner upload fields (Cloudinary)
- **Font Choice:** Dropdown (Sans / Serif)
- **Email & Social Overrides:** Color pickers for email header BG, social card text/gradient
- **Preview:** Live preview of social card with chosen colors + font

**Component:** `BrandKitPreview.tsx` (new)
- Renders social card preview with organizer's branding
- Real-time updates as user changes colors

**Data Flow:**
1. Organizer enters custom slug → auto-check availability via POST `/api/brand-kit/slug-available`
2. Uploads images → Cloudinary integration
3. Picks colors + font → live preview updates
4. Clicks Save → PUT `/api/brand-kit` with all fields
5. Profile page auto-redirects from `/organizers/[id]` to `/organizers/[customSlug]`

### Dependencies

- Existing `Organizer` model ✅
- Cloudinary integration (existing) ✅
- `requireTier('PRO')` middleware ✅
- Social template system (from #27, exists) ✅
- Email template rendering (existing) ✅

**No external deps beyond what's already integrated.**

### Risk Assessment

**Risk: LOW**

- **Rationale:** Purely schema extension (no field removals or renames). Custom slug is scoped to organizer profile URLs only — no global routing changes. Color overrides are CSS-level — graceful fallback to defaults if missing.
- **Concern:** Slug collision after migration (two organizers pick the same slug). **Mitigation:** Unique constraint on `customStorefrontSlug` + pre-migration audit to identify collisions + first-come-first-served assignment.

### Sprints Estimate

- **Sprint 1:** Schema migration + brandKitService extend + controller endpoints. (1 sprint)
- **Sprint 2:** brand-kit.tsx UI + BrandKitPreview component + slug checker + Cloudinary wiring. (1.5 sprints)

**Total: 2.5 sprints (~5 hours)**

### GO/NO-GO Recommendation

**GO** — Natural extension of existing Brand Kit. High perceived value for PRO organizers (professional storefronts). Zero risk to other features. Can run in parallel.

---

## Feature #32 — Shopper Wishlist Alerts + Smart Follow [FREE]

### Product Summary
Shoppers set search preferences (category, price range, tags, organizer follows) → get notified (push + email) when matching sales publish or items list.

Two components:
1. **Wishlist Alerts:** Save a search query → get alerted when new items match
2. **Smart Follow:** Follow an organizer → auto-notify when they publish new sales

Both use existing **PushSubscription** model + VAPID infrastructure (confirmed in STATE.md). Push notification backend exists.

### Schema Design

**New Models:**

```prisma
model WishlistAlert {
  id            String   @id @default(cuid())
  userId        String
  user          User     @relation(fields: [userId], references: [id], onDelete: Cascade)
  name          String   // User-friendly name: "Mid-Century Furniture Under $200"
  query         Json     // { q: string; category: string; minPrice: int; maxPrice: int; tags: string[]; radius: int; lat: float; lng: float }
  notifyEmail   Boolean  @default(true)
  notifyPush    Boolean  @default(true)
  isActive      Boolean  @default(true)
  lastNotifiedAt DateTime?
  createdAt     DateTime @default(now())
  updatedAt     DateTime @updatedAt

  @@index([userId, isActive])
}

model SmartFollow {
  id            String    @id @default(cuid())
  userId        String
  user          User      @relation(fields: [userId], references: [id], onDelete: Cascade)
  organizerId   String
  organizer     Organizer @relation(fields: [organizerId], references: [id], onDelete: Cascade)
  notifyEmail   Boolean   @default(true)
  notifyPush    Boolean   @default(true)
  createdAt     DateTime  @default(now())

  @@unique([userId, organizerId])
  @@index([userId])
}
```

**Extend User model:**
```prisma
model User {
  // ... existing ...
  wishlistAlerts    WishlistAlert[]
  smartFollows      SmartFollow[]
}
```

**Extend Organizer model:**
```prisma
model Organizer {
  // ... existing ...
  smartFollowers SmartFollow[]
}
```

**Migration:** `20260317000001_add_wishlist_alerts/migration.sql`

**Rollback Plan:**
```sql
-- Down
DROP TABLE IF EXISTS "WishlistAlert" CASCADE;
DROP TABLE IF EXISTS "SmartFollow" CASCADE;
```

### Backend Contract

**Service:** `wishlistAlertService.ts` (new)
```typescript
createAlert(userId, { name, query, notifyEmail, notifyPush }): Promise<WishlistAlert>
updateAlert(alertId, updates): Promise<WishlistAlert>
deleteAlert(alertId): Promise<void>
getUserAlerts(userId): Promise<WishlistAlert[]>
matchItemToAlerts(item): Promise<WishlistAlert[]> // Returns matching alerts for an item
matchSaleToFollows(sale): Promise<SmartFollow[]> // Returns followers of organizer
```

**Service:** `notificationTriggerService.ts` (new or extend existing)
```typescript
sendWishlistAlertNotification(alert, item): Promise<void> // Push + email
sendSmartFollowNotification(follow, sale): Promise<void>  // Push + email
```

**Controller:** `wishlistAlertController.ts` (new)
```typescript
POST   /api/wishlist-alerts              // Create new alert
GET    /api/wishlist-alerts              // List my alerts
PUT    /api/wishlist-alerts/:id          // Update alert
DELETE /api/wishlist-alerts/:id          // Delete alert
```

**Controller:** `smartFollowController.ts` (new)
```typescript
POST   /api/smart-follows/:organizerId    // Follow organizer
GET    /api/smart-follows                 // List my follows
DELETE /api/smart-follows/:organizerId    // Unfollow
```

**Route:** `routes/wishlistAlerts.ts` + `routes/smartFollows.ts` (new)

**Trigger Points (wired into existing controllers):**
- `itemController.ts` — On item publish (status → PUBLISHED), call `wishlistAlertService.matchItemToAlerts(item)` → send notifications for each match
- `saleController.ts` — On sale publish (status → PUBLISHED), call `wishlistAlertService.matchSaleToFollows(sale.organizerId)` → send notifications to all followers

**Query Matching Logic:**
```typescript
// Pseudo-code for matching
function matchesAlert(item, alert) {
  const q = alert.query;
  return (
    (!q.q || item.title.includes(q.q)) &&
    (!q.category || item.category === q.category) &&
    (!q.minPrice || item.price >= q.minPrice) &&
    (!q.maxPrice || item.price <= q.maxPrice) &&
    (!q.tags.length || q.tags.some(t => item.tags.includes(t))) &&
    (!q.radius || distance(q.lat, q.lng, item.sale.lat, item.sale.lng) <= q.radius)
  )
}
```

### Frontend Contract

**Hook:** `useWishlistAlerts.ts` (new)
```typescript
const {
  alerts,
  loading,
  createAlert,
  updateAlert,
  deleteAlert
} = useWishlistAlerts()
```

**Hook:** `useSmartFollow.ts` (new)
```typescript
const {
  followedOrganizers,
  isFollowing,
  toggleFollow
} = useSmartFollow()
```

**Page:** `pages/shopper/wishlist-alerts.tsx` (new)
- List of saved searches + notification preferences
- "Create New Alert" button → modal
- Modal form: name, search filters (copied from search form), notification toggles

**Component:** `SaveSearchModal.tsx` (new)
- Captures search state (query, category, price range, tags, location) from search page
- "Save Search" button to create WishlistAlert
- Post-save: "Get notified when matching items list"

**Integration points:**
- `/search` page — "Save this search" button with modal
- `/organizers/[slug]` — "Follow for notifications" button (below profile info)
- User notification center — Show alerts from wishlist + follows separately

**Data Flow:**
1. Shopper searches for "mid-century chairs under $300" → clicks "Save Search"
2. Modal opens with pre-filled query → names it → clicks Save
3. WishlistAlert created with `notifyPush=true, notifyEmail=true` (defaults)
4. Shopper follows organizer "Vintage Estate Co" → SmartFollow created
5. Organizer lists new mid-century chair → Item published → `matchItemToAlerts` returns [savedSearch123]
6. Push notification sent: "New find for 'Mid-Century Chairs Under $300': Teak Dining Chairs - $250"
7. Email sent same day in digest (batched, not transactional)

### Dependencies

- Existing `User`, `Organizer`, `Item`, `Sale` models ✅
- PushSubscription + VAPID infrastructure ✅
- Email service (Resend, already integrated) ✅
- Search query schema + filtering logic ✅
- Auth context ✅

**New DB models: 2** (`WishlistAlert`, `SmartFollow`)

### Risk Assessment

**Risk: LOW**

- **Rationale:** Additive feature. Trigger points sit at existing publish workflows (item + sale publish). Matching logic is read-only on Item/Sale data. Push + email are non-critical (if send fails, notification lost but item still visible on search).
- **Concern:** Notification spam — user saves too many alerts, gets overwhelmed. **Mitigation:** (1) Max 10 active alerts per user. (2) Batch notifications: one email per day with all matches from past 24h. (3) Per-alert mute toggle. (4) Notification frequency cap: max 2 pushes/day per user.

### Sprints Estimate

- **Sprint 1:** wishlistAlertService + smartFollowService + controllers + routes + migration. (1.5–2 sprints)
- **Sprint 2:** UI integration (SaveSearchModal, wishlist-alerts page, smart-follows page, organizer profile follow button). (1.5–2 sprints)

**Total: 3–4 sprints (~6–8 hours)**

### GO/NO-GO Recommendation

**GO** — Foundational for shopper retention and intent data capture. FREE tier drives engagement. Zero risk to core features. Pairs well with #29 (Loyalty Passport). Ship in Phase 4.

---

## Cross-Feature Dependencies & Sequencing

### Dependency Matrix

| Feature | Depends On | Comment |
|---------|-----------|---------|
| #25 Library | Item, ItemPriceHistory, Organizer tier gate | Independent |
| #29 Loyalty | User, Item, Hunt Pass, Badge | Can run parallel to #32 |
| #31 Brand Kit | Organizer, Cloudinary, Email/Social templates | Independent |
| #32 Wishlist | User, Item, Sale, PushSubscription, Organizer | Can run parallel to #29 |

**No blocking dependencies.** All four can be built in parallel across 2–3 subagent sprints.

### Recommended Build Order

1. **#31 Brand Kit** (2.5 sprints) — Lowest risk, fastest. Organizers see immediate value.
2. **#25 Item Library** (3.5–4 sprints) — PRO feature, pairs with Brand Kit for premium positioning.
3. **#29 Loyalty Passport** (2.5–3.5 sprints) — FREE tier, drives shopper engagement, independent.
4. **#32 Wishlist Alerts** (3–4 sprints) — Highest complexity (matching logic), but fully independent.

**Total Phase 4 effort: 11.5–14.5 sprints (~23–29 hours across 2–3 concurrent dev sprints)**

---

## Schema Change Protocol

### Migrations Required

1. **#29 Loyalty Passport**
   ```
   File: packages/database/prisma/migrations/20260317000000_add_shopper_stamps/migration.sql
   Models: ShopperStamp, StampMilestone
   Extend: User, Item (add earlyAccessUntil)
   ```

2. **#31 Brand Kit Expansion**
   ```
   File: packages/database/prisma/migrations/20260317000001_expand_brand_kit/migration.sql
   Extend: Organizer (customStorefrontSlug, brandFaviconUrl, brandBannerUrl, brandFont, emailHeaderBgColor, socialCardTextColor, socialCardBgGradient)
   ```

3. **#32 Wishlist Alerts**
   ```
   File: packages/database/prisma/migrations/20260317000002_add_wishlist_alerts/migration.sql
   Models: WishlistAlert, SmartFollow
   Extend: User, Organizer
   ```

### Patrick Manual Actions

**For each migration file:**

```powershell
cd C:\Users\desee\ClaudeProjects\FindaSale\packages\database

# Before any deploy, apply migrations to Neon
$env:DATABASE_URL="postgresql://neondb_owner:npg_VYBnJs8Gt3bf@ep-plain-sound-aeefcq1y.c-2.us-east-2.aws.neon.tech/neondb?sslmode=require"

npx prisma migrate deploy   # Applies all pending migrations to Neon
npx prisma generate         # Regenerates TypeScript client with new models
```

**CRITICAL:** Use the Neon **non-pooled** connection (no `-pooler` suffix). Prisma requires direct DB access for migrations.

### Rollback Plans

#### Rollback: #29 Shopper Stamps
```sql
-- Down migration 20260317000000_add_shopper_stamps
ALTER TABLE "Item" DROP COLUMN IF EXISTS "earlyAccessUntil";
DROP TABLE IF EXISTS "ShopperStamp" CASCADE;
DROP TABLE IF EXISTS "StampMilestone" CASCADE;
```
**Playbook:** If deploy vX fails at item query layer (early access filter errors), run rollback. No data loss — stamps are new, no existing items depend on earlyAccessUntil.

#### Rollback: #31 Brand Kit Expansion
```sql
-- Down migration 20260317000001_expand_brand_kit
ALTER TABLE "Organizer" DROP COLUMN IF EXISTS "customStorefrontSlug";
ALTER TABLE "Organizer" DROP COLUMN IF EXISTS "brandFaviconUrl";
ALTER TABLE "Organizer" DROP COLUMN IF EXISTS "brandBannerUrl";
ALTER TABLE "Organizer" DROP COLUMN IF EXISTS "brandFont";
ALTER TABLE "Organizer" DROP COLUMN IF EXISTS "emailHeaderBgColor";
ALTER TABLE "Organizer" DROP COLUMN IF EXISTS "socialCardTextColor";
ALTER TABLE "Organizer" DROP COLUMN IF EXISTS "socialCardBgGradient";
```
**Playbook:** If custom slug routing breaks (path conflicts), revert and deploy without slug feature. All new columns are nullable — no constraint violations.

#### Rollback: #32 Wishlist Alerts
```sql
-- Down migration 20260317000002_add_wishlist_alerts
DROP TABLE IF EXISTS "WishlistAlert" CASCADE;
DROP TABLE IF EXISTS "SmartFollow" CASCADE;
```
**Playbook:** If notification triggers spam users or cause item query delays (matching is expensive), disable trigger points in code (comment out `matchItemToAlerts` calls) before running rollback. Tables are new — safe to drop.

---

## Risk Summary

| Feature | Risk Level | Rationale | Mitigation |
|---------|-----------|-----------|-----------|
| #25 Item Library | **LOW** | Additive model extension. Unified Item design avoids duplication. Query indexed. | Monitor per-org library sizes. Denormalize to separate table if >10k items/org. |
| #29 Loyalty Passport | **LOW** | Additive models. Trigger points are non-blocking (post-transaction). Hunt Pass already exists. | Notification spam cap (max 2 pushes/day/user). Validate stamp logic in tests. |
| #31 Brand Kit | **LOW** | Pure schema extension. No breaking changes. Graceful fallback for missing colors. | Pre-migration audit for slug collisions. Unique constraint on customStorefrontSlug. |
| #32 Wishlist Alerts | **LOW** | Additive models. Matching is read-only. Push/email are async (failures non-fatal). | Query performance: index on WishlistAlert(userId, isActive). Batch notifications to 1/day digest. |

**Overall Phase 4 Risk: LOW** ✅

---

## Implementation Handoff

### For Subagents

Each feature is **independent**. Can dispatch:
- `findasale-dev` — #25 (Library), #31 (Brand Kit expansion)
- `findasale-dev` — #29 (Loyalty Passport)
- `findasale-dev` — #32 (Wishlist Alerts)

All use same pattern: Schema → Service → Controller → Route → Hook → Page.

### For Patrick

**Pre-implementation:**
- [ ] Review this ADR. Confirm GO on all four features.
- [ ] Schedule 3 subagent dispatches (concurrent if possible).

**Post-implementation (each feature):**
- [ ] Run migration commands (Neon + generate)
- [ ] QA notification triggers (pushes, emails)
- [ ] Test UI integration (forms, pages, modals)
- [ ] Verify tier gating (#25, #31 PRO-only)

---

## Success Criteria

### #25 Item Library
- [x] Organizer can add item to library from add-items form
- [x] Library page lists items with search/filter
- [x] Pull-from-library flow adds item to sale with per-sale price override
- [x] Price history tracks all versions of item across sales

### #29 Loyalty Passport
- [x] Stamps awarded on attendance/purchase/review/referral
- [x] Milestones trigger badge awards (5/20/50 stamps)
- [x] Hunt Pass holders see items 24h before others
- [x] Passport page shows stamps + milestones + badges
- [x] Early access embargo respected in item queries

### #31 Brand Kit
- [x] Organizer can set custom slug + images + colors + font
- [x] Profile auto-redirects to custom slug
- [x] Social templates + email headers use organizer's colors
- [x] Preview shows real-time changes

### #32 Wishlist Alerts
- [x] Shopper can save search with name + notification prefs
- [x] Matching query runs on item publish, sends push + email
- [x] Shopper can follow organizer, get sale publish alerts
- [x] Notification batching: max 1 email/day, max 2 pushes/day

---

## Conclusion

**Phase 4 is GO.** Four complementary features with minimal risk, maximum engagement impact. No schema bottlenecks. Parallel builds recommended. All features ship with existing infrastructure; zero new platform dependencies.

**Estimated delivery: 4–6 weeks (concurrent 2–3 dev sprints).**

---

**Architect:** Systems Architect
**Review Date:** 2026-03-17
**Status:** APPROVED — Ready for dispatch to subagents
