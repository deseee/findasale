# Item Card Unification Spec

**Author:** Architect
**Date:** 2026-03-28
**Status:** Implementation-Ready
**Priority:** High (UX consistency, maintainability)

---

## Executive Summary

FindA.Sale renders item cards in 5+ locations with inconsistent structures, styles, and interactive elements. This spec consolidates all item card rendering into a single reusable `<ItemCard>` component with optional prop toggles for different display contexts (feed, search, trending, inspiration, sale detail).

---

## Part 1: Current State Audit

### 1.1 Locations Where Item Cards Are Rendered

| Surface | File | Component | Current Approach | Item Shape |
|---------|------|-----------|------------------|-----------|
| **Sale Detail Page** | `pages/sales/[id].tsx` | Inline JSX (`<div>` cards) | Inline card structure with manual JSX | Full item object from sale |
| **Search Results** | `pages/search.tsx` | Inline `ItemCard` component | Inline component (local definition, ~30 lines) | Item with photoUrls array |
| **Item Search Results** | `components/ItemSearchResults.tsx` | Inline `ItemCard` component | Inline component (local definition, ~25 lines) | ItemSearchResult from FTS hook |
| **Shopper Wishlist** | `pages/shopper/wishlist.tsx` | Inline `<div>` cards | Inline card structure with manual JSX | Item from favorites/wishlist |
| **Shopper Dashboard** | `pages/shopper/dashboard.tsx` | Inline `<div>` cards + `ItemCard` ref | Inline cards for favorites grid | Item from various queries |
| **Trending Page** | `pages/trending.tsx` | Inline `<div>` cards | Inline card structure with manual JSX | TrendingItem with _count.favorites |
| **Inspiration Gallery** | `components/InspirationGrid.tsx` | Inline card structure | Masonry cards within InspirationGrid component | InspirationItem (photo-centric) |
| **Item Library** (Organizer) | `components/LibraryItemCard.tsx` | Dedicated component | Standalone component for draft items | LibraryItem with status/condition |

### 1.2 Existing Reusable Component

**`components/ItemCard.tsx`** (lines 1–163)
- **Current usage:** None on core surfaces (not imported anywhere yet)
- **Props:** Single `item: Item` interface with 10 required/optional fields
- **Features:** LQIP blur, lazy-load image, rarity badge, AI-tagged disclosure, status badge, countdown timer, favorite button
- **Renders:** ~60% image (aspect-square 1:1), ~40% content (title, price, countdown)
- **Strengths:** Advanced image optimization, rarity/AI disclosure, favorites integration
- **Weaknesses:** Requires auctionEndTime for countdown (not all items have this); no showCategory, showCondition, showSaleInfo toggles

### 1.3 Component Variations & Missing Props

#### Sale Detail Page (`[id].tsx` lines 816–900+)
- **Current structure:** Manually built cards with `<div className="border border-warm-200...">`
- **Image:** `getOptimizedUrl()` with h-48 (fixed height, NOT aspect-square)
- **Content:** title, description (line-clamp-2), category, condition, auction end time, status badges
- **Metadata:** Category filter UI, condition badge, status badges (ON HOLD / SOLD / PENDING)
- **Interactions:** Favorite button (top-right), click navigates to item detail
- **Missing from ItemCard.tsx:** description field, category toggle, condition toggle, h-48 image variant

#### Search Results (`search.tsx` lines 33–63)
- **Current structure:** Inline component definition (not reused)
- **Image:** `photoUrls[0]` with aspect-square (raw URL, no optimization)
- **Content:** title (line-clamp-1), price, sale.title + city/state (bottom)
- **Interactions:** Link to item detail
- **Missing from ItemCard.tsx:** sale.title, city/state, sale.businessName

#### Item Search Results (`ItemSearchResults.tsx` lines 13–59)
- **Current structure:** Inline component definition
- **Image:** `photoUrls[0]` with aspect-square (raw URL, no optimization)
- **Content:** title (line-clamp-2), price, category (bg-warm-100), condition, businessName
- **Metadata:** Category + condition pills (flex-wrap, mt-auto)
- **Missing from ItemCard.tsx:** businessName, no favorite button

#### Trending Page (`trending.tsx` lines 131–166)
- **Current structure:** Inline cards (not reused)
- **Image:** Image component with hover scale-105, aspect-square
- **Content:** title (line-clamp-2), price, sale.title (truncate)
- **Metadata:** Top-left "🔥 Hot" badge (top 3 only), top-right favorite count badge, favorite button (absolute positioned)
- **Missing from ItemCard.tsx:** favorite count display, "Hot" ranking badge, sale title on card

#### Inspiration Gallery (`InspirationGrid.tsx` lines 61–120)
- **Current structure:** Inline cards within component
- **Image:** Image component with group-hover:scale-105, aspect-square, fallback SVG
- **Content:** title (line-clamp-2), price, sale info (truncate), AI confidence (never displayed on card)
- **Metadata:** No badges, no category, no condition
- **Missing from ItemCard.tsx:** Masonry-optimized card (3-col grid), no status indicators

#### Item Library (`LibraryItemCard.tsx` lines 28–100)
- **Current structure:** Standalone component (organizer-only surface, draft items)
- **Image:** h-32 (fixed height, not aspect-square)
- **Content:** title, category, condition, price (optional)
- **Metadata:** Status badge (top-right, color-coded), copy/delete/pull/history actions
- **Interactions:** Hover to show action buttons
- **Purpose:** Draft item manager (NOT for public/shopper-facing use)

#### Shopper Dashboard & Wishlist (`dashboard.tsx`, `wishlist.tsx`)
- **Current structure:** Inline `<div>` cards or reference to ItemCard (inconsistent)
- **Image:** Inline `<img>` with aspect-square or h-40
- **Content:** title, price, sale info
- **Metadata:** None visible
- **Interactions:** Link + optional action modals

---

## Part 2: Proposed Unified ItemCard Component

### 2.1 Component Interface

```typescript
interface UnifiedItemCardItem {
  // === MANDATORY (always required) ===
  id: string;
  title: string;
  photoUrls?: string[];  // Array of image URLs; first is primary

  // === COMMON OPTIONAL (most contexts) ===
  price?: number;
  currentBid?: number;
  status?: 'ACTIVE' | 'SOLD' | 'PENDING' | 'RESERVED' | string;
  rarity?: string | null;  // e.g., 'RARE', 'COMMON', 'VINTAGE'
  isAiTagged?: boolean;

  // === SALE CONTEXT (search, trending, inspiration) ===
  sale?: {
    id: string;
    title: string;
    city?: string;
    state?: string;
  };
  businessName?: string;  // Organizer name (from sale or item)

  // === DETAIL CONTEXT (sale detail page) ===
  description?: string;
  category?: string;
  condition?: string;
  auctionEndTime?: string;  // ISO string for countdown

  // === TRENDING/RANKING (trending page) ===
  _count?: {
    favorites?: number;
  };
  rankingIndex?: number;  // For "Hot" badge (top 3)

  // === AI CONFIDENCE (inspiration gallery) ===
  aiConfidence?: number;  // 0–1 scale; not displayed on card
}

interface ItemCardProps {
  item: UnifiedItemCardItem;
  variant?: 'default' | 'compact' | 'detailed';  // Layout mode
  showImage?: boolean;  // Default: true
  showTitle?: boolean;  // Default: true
  showPrice?: boolean;  // Default: true
  showCategory?: boolean;  // Default: false
  showCondition?: boolean;  // Default: false
  showSaleInfo?: boolean;  // Default: false (sale.title + city/state)
  showCountdown?: boolean;  // Default: false (requires auctionEndTime)
  showStatus?: boolean;  // Default: true (SOLD / PENDING / ON HOLD badges)
  showRarity?: boolean;  // Default: true
  showAiTagged?: boolean;  // Default: true
  showFavoriteButton?: boolean;  // Default: true
  showFavoriteCount?: boolean;  // Default: false (for trending)
  showRankingBadge?: boolean;  // Default: false (for top 3 trending)
  imageHeight?: 'square' | 'fixed-h48' | 'fixed-h32';  // Default: 'square'
  imageOptimization?: 'advanced' | 'basic' | 'none';  // LQIP/lazy vs. raw URL
  className?: string;  // Allow consumer override
  onClick?: () => void;  // Optional custom click handler
}
```

### 2.2 Layout Variants

#### Variant: `default` (Most surfaces: search, dashboard, wishlist)
- **Image:** aspect-square 1:1, lazy-loaded, LQIP blur
- **Content:** title (line-clamp-1 or -2), price, sale.title (optional)
- **Metadata:** Category + condition badges (if enabled), status badge
- **Interactions:** Favorite button (top-right), click navigates
- **Visual weight:** 60% image, 40% content

#### Variant: `compact` (Trending page)
- **Image:** aspect-square, hover-scale-105
- **Content:** title (line-clamp-2), price
- **Metadata:** Favorite count badge (top-right), Hot ranking (top-left, if top 3)
- **Interactions:** Favorite button overlay
- **Visual weight:** 70% image, 30% content

#### Variant: `detailed` (Sale detail page)
- **Image:** Fixed h-48 (not aspect-square), lazy-loaded
- **Content:** title (bold), description (line-clamp-2), all metadata
- **Metadata:** Category, condition, auction end time, status badges
- **Interactions:** Favorite button (top-right), category filter UI (outside card)
- **Visual weight:** 60% image, 40% content with details

#### Variant: N/A — `LibraryItemCard` (Organizer only, draft items)
- **Keep as separate component** — organizer-specific logic (pull/delete/history actions)
- **Not unified** — different data model (draft vs. published)

#### Variant: N/A — `InspirationGrid` (Photo-centric gallery)
- **Keep as wrapper component** — contains its own card layout for masonry
- **Optionally use ItemCard** inside if masonry is decoupled

### 2.3 Default Behavior Matrix

| Surface | Variant | showCategory | showCondition | showSaleInfo | showCountdown | showFavoriteCount | imageHeight |
|---------|---------|--------------|---------------|--------------|---------------|-------------------|-------------|
| Search Results | `default` | `true` | `true` | `true` | `false` | `false` | `square` |
| FTS Results | `default` | `true` | `true` | `false` | `false` | `false` | `square` |
| Shopper Dashboard | `default` | `false` | `false` | `false` | `false` | `false` | `square` |
| Shopper Wishlist | `default` | `false` | `false` | `false` | `false` | `false` | `square` |
| Sale Detail | `detailed` | `true` | `true` | `false` | `true` | `false` | `fixed-h48` |
| Trending Items | `compact` | `false` | `false` | `false` | `false` | `true` | `square` |
| Inspiration | `default` | `false` | `false` | `true` | `false` | `false` | `square` |

### 2.4 Key Features

#### Image Optimization
- **LQIP blur (advanced):** 3-tier loading (LQIP → skeleton → main image)
- **Basic:** Raw image URL, no LQIP
- **None:** Consumer-supplied image or placeholder

#### Badges & Overlays
- **Status badge** (top-left): SOLD, PENDING, ON HOLD (RESERVED)
- **Rarity badge** (top-right): RARE, VINTAGE, etc. (only if rarity ≠ COMMON)
- **AI-tagged disclosure** (bottom-right, small): "AI" badge with tooltip
- **Favorite count badge** (trending): "❤️ 42" (top-right, optional)
- **Hot ranking badge** (trending, top 3): "🔥 Hot" (top-left, conditional)

#### Interactive Elements
- **Favorite button:** FavoriteButton component (icon variant), top-right overlay
- **Link wrapper:** Navigates to `/items/{itemId}` by default (or custom onClick)
- **Hover state:** shadow-md, optional scale-105 on image (compact variant)

#### Dark Mode
- All surfaces support dark mode via `dark:` Tailwind classes
- Colors: warm-900/dark:gray-100 for text, bg-warm-50/dark:gray-900 for backgrounds

---

## Part 3: Migration Plan

### 3.1 Implementation Order (Lowest to Highest Risk)

#### Phase 1: Foundation (No breaking changes)
1. **Enhance ItemCard.tsx** with new props and variants
   - Add `variant` enum (default, compact, detailed)
   - Add toggle props (showCategory, showCondition, etc.)
   - Add `imageHeight` variant (square, fixed-h48, fixed-h32)
   - Maintain backward compatibility (all new props default to existing behavior)
   - Duration: 2–4 hours

2. **Test ItemCard.tsx in isolation** (unit + component tests)
   - Verify all prop combinations render correctly
   - Verify dark mode works
   - Verify responsive (mobile, tablet, desktop)
   - Duration: 1–2 hours

#### Phase 2: Low-Risk Migrations (Dashboard, wishlist, trending)
3. **Shopper Dashboard** (`pages/shopper/dashboard.tsx`)
   - Replace inline `<div>` cards with `<ItemCard variant="default" />`
   - Risk: Low (internal shopper surface, not user-facing revenue impact)
   - Duration: 1–2 hours

4. **Shopper Wishlist** (`pages/shopper/wishlist.tsx`)
   - Replace inline cards with `<ItemCard variant="default" />`
   - Risk: Low (internal surface)
   - Duration: 1–2 hours

5. **Trending Page** (`pages/trending.tsx`)
   - Replace inline item cards with `<ItemCard variant="compact" showFavoriteCount showRankingBadge />`
   - Risk: Low (trending is a secondary page; not high-traffic)
   - Duration: 2–3 hours

#### Phase 3: Medium-Risk Migrations (Search results, FTS)
6. **Search Results** (`pages/search.tsx`)
   - Replace inline `ItemCard` definition with `<ItemCard variant="default" showSaleInfo showCategory />`
   - Risk: Medium (high-traffic surface; inconsistent with current visual style possible)
   - Duration: 2–3 hours

7. **Item Search Results** (`components/ItemSearchResults.tsx`)
   - Replace inline `ItemCard` definition with imported `<ItemCard variant="default" showCategory showCondition />`
   - Risk: Medium (FTS is new; need to verify category/condition display)
   - Duration: 1–2 hours

#### Phase 4: High-Risk Migration (Sale detail page)
8. **Sale Detail Page** (`pages/sales/[id].tsx`)
   - Replace manually-built cards (lines 816–900+) with `<ItemCard variant="detailed" />`
   - Risk: High (primary user-facing surface; category filter integration)
   - **Dependency:** Verify category filter logic works outside card (separate filter UI)
   - Duration: 3–4 hours

#### Phase 5: Gallery Surfaces (Evaluation needed)
9. **Inspiration Gallery** (`components/InspirationGrid.tsx`)
   - **Decision:** Use ItemCard vs. keep masonry wrapper
   - Option A: Keep InspirationGrid as masonry wrapper; use ItemCard inside
   - Option B: Lift masonry logic to InspirationGrid parent; use ItemCard child
   - Risk: Medium (photo-centric surface; masonry layout is important)
   - Duration: 2–3 hours (pending UX review)

10. **Item Library** (`components/LibraryItemCard.tsx`)
    - **Decision:** Keep separate or unify?
    - Status: **Keep separate** (organizer-only draft item manager; different data model + actions)
    - Duration: 0 hours (no change)

### 3.2 Rollback Strategy

Each phase can roll back independently:
- If Phase 3 (search results) breaks, revert to inline ItemCard definitions
- If Phase 4 (sale detail) breaks, revert to inline `<div>` cards
- Phases 1 & 2 have no user-facing impact if rolled back

### 3.3 Testing Checklist Per Phase

- [ ] Component renders without console errors
- [ ] All enabled props render correctly
- [ ] Images lazy-load (DevTools Network tab)
- [ ] LQIP blur visible on slow 3G (if advanced optimization enabled)
- [ ] Favorite button works (adds/removes item)
- [ ] Status badges display correctly (SOLD / PENDING / ON HOLD)
- [ ] Category & condition badges display (if enabled)
- [ ] Price formats correctly (currency)
- [ ] Countdown timer works (if auctionEndTime provided)
- [ ] Dark mode colors correct
- [ ] Responsive on mobile (375px), tablet (768px), desktop (1200px)
- [ ] Click navigates to item detail (or custom onClick fires)

---

## Part 4: Risks & Mitigation

### 4.1 Image Rendering Risks

**Risk:** LQIP blur + lazy loading may not trigger correctly on all surfaces.
- **Current variance:** ItemCard.tsx uses `getLqipUrl()` + custom hook; search pages use raw URLs
- **Mitigation:**
  - Centralize image URL selection in ItemCard (pass raw URL; component decides optimization level)
  - Add `imageOptimization: 'advanced' | 'basic' | 'none'` prop
  - Test all variants with slow network throttling (DevTools 3G)

### 4.2 Data Shape Risks

**Risk:** Different surfaces pass different item shapes (ItemSearchResult vs. TrendingItem vs. Item from sale detail).
- **Current variance:** 7+ different interfaces for "item"
- **Mitigation:**
  - Use a union type or discriminated interface (optional fields for context-specific data)
  - Make ItemCardProps.item flexible: `item: Item | ItemSearchResult | TrendingItem | InspirationItem`
  - Add TypeScript overload: `<ItemCard<T extends UnifiedItemCardItem> item: T />`
  - Document which fields are required for each variant

### 4.3 Sale Detail Category Filter Risk

**Risk:** Current sale detail page uses category filter UI integrated INTO the item cards. Unifying ItemCard may break filter logic.
- **Current structure:** Filter buttons (line 758–786) are SEPARATE; cards are filtered by `selectedCategory` state
- **Mitigation:**
  - Keep filter UI outside ItemCard component
  - ItemCard only displays category badge (if enabled)
  - Parent component (sale detail page) manages filter state and item filtering
  - No risk — filter logic is in parent, not card

### 4.4 Favorite Button Collision Risk

**Risk:** Multiple components import FavoriteButton; button state may not sync across cards (e.g., favorite on trending, see it unfavorited on search results).
- **Current:** FavoriteButton uses internal state + API call; no global state
- **Mitigation:**
  - FavoriteButton already uses React Query (useQuery + mutation), which invalidates cache
  - Ensure `queryKey: ['favorites']` is consistent across all surfaces
  - Test by favoriting an item on trending, navigating to search results, verifying it's still favorited

### 4.5 Mobile Responsiveness Risk

**Risk:** Different surfaces have different grid layouts (2-col mobile trending, 1-col search results). ItemCard must not assume layout.
- **Current:** Layouts are in parent (grid container), not card
- **Mitigation:**
  - ItemCard exports a simple card; parent manages grid (grid-cols-1, grid-cols-2, etc.)
  - No risk — card is layout-agnostic

### 4.6 Inspiration Gallery Masonry Risk

**Risk:** InspirationGrid is a masonry layout component; unifying ItemCard might require moving masonry logic.
- **Current:** InspirationGrid defines the grid (grid-cols-2 md:grid-cols-3)
- **Decision:** Keep InspirationGrid as wrapper; use ItemCard inside for individual cards
- **Mitigation:**
  - InspirationGrid maps items → `<ItemCard variant="default" />`
  - Masonry logic stays in InspirationGrid wrapper
  - No risk if kept as wrapper

### 4.7 Countdown Timer Risk

**Risk:** Not all items have `auctionEndTime`. Countdown display may be undefined/empty.
- **Current:** ItemCard checks `if (!item.auctionEndTime) return ''`
- **Mitigation:**
  - Make countdown optional: `showCountdown` prop defaults to false
  - Only display if `auctionEndTime` is provided AND `showCountdown === true`
  - Consumer determines if countdown is relevant for their context
  - No risk

---

## Part 5: Implementation Details

### 5.1 Image Optimization Modes

#### Mode: `advanced` (Current ItemCard.tsx behavior)
```typescript
const lqipUrl = getLqipUrl(item.photoUrl);
const optimizedUrl = getOptimizedUrl(item.photoUrl, imageQuality);
// Render: LQIP blur → skeleton → lazy-loaded optimized image
```

#### Mode: `basic`
```typescript
const photoUrl = item.photoUrls?.[0];
// Render: Skeleton → lazy-loaded raw image URL
```

#### Mode: `none`
```typescript
// Consumer supplies image or placeholder
```

### 5.2 Countdown Timer Logic

```typescript
const getCountdownText = (auctionEndTime?: string): string => {
  if (!auctionEndTime) return '';
  const endTime = new Date(auctionEndTime).getTime();
  const now = Date.now();
  const diff = endTime - now;
  if (diff <= 0) return 'Ended';
  const days = Math.floor(diff / (1000 * 60 * 60 * 24));
  const hours = Math.floor((diff % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
  const minutes = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));
  if (days > 0) return `${days}d ${hours}h left`;
  if (hours > 0) return `${hours}h ${minutes}m left`;
  return `${minutes}m left`;
};
```

### 5.3 Status Badge Logic

```typescript
const getStatusBadge = (status?: string): { label: string; className: string } | null => {
  switch (status) {
    case 'SOLD': return { label: 'SOLD', className: 'bg-warm-700 text-white' };
    case 'PENDING': return { label: 'PENDING', className: 'bg-yellow-500 text-white' };
    case 'RESERVED': return { label: 'ON HOLD', className: 'bg-amber-500 text-white' };
    case 'ACTIVE': return { label: 'ACTIVE', className: 'bg-green-600 text-white' };
    default: return null;
  }
};
```

### 5.4 Variant Styling

All variants share the same card base (`rounded-lg overflow-hidden shadow-sm hover:shadow-md transition-shadow`). Differences are in content layout:

```typescript
const contentLayout = variant === 'detailed'
  ? 'p-4 space-y-2'  // More padding, stacked metadata
  : 'p-3 space-y-1';  // Compact padding

const imageHeight = imageHeight === 'fixed-h48'
  ? 'h-48'
  : imageHeight === 'fixed-h32'
  ? 'h-32'
  : 'aspect-square';
```

---

## Part 6: Success Criteria

- [ ] All 8 item card surfaces use `<ItemCard>` component (or deliberately excluded)
- [ ] No prop-drilling of item data beyond ItemCard interface
- [ ] Light/dark mode works on all surfaces
- [ ] Mobile responsive (375px–1440px) on all surfaces
- [ ] Favorite button adds/removes items correctly
- [ ] Images lazy-load and LQIP blurs on slow networks
- [ ] Category & condition badges display when enabled
- [ ] Sale detail page category filter still works
- [ ] 0 console errors in any surface
- [ ] Trending page shows favorite counts + Hot badges
- [ ] Countdown timer displays for auction items

---

## Part 7: Files to Modify

| File | Change | Risk | Effort |
|------|--------|------|--------|
| `components/ItemCard.tsx` | Enhance with variants + props | Low | Medium |
| `pages/sales/[id].tsx` | Replace inline cards (lines 816–900) | **High** | Medium |
| `pages/search.tsx` | Replace inline ItemCard + add props | Medium | Low |
| `components/ItemSearchResults.tsx` | Replace inline ItemCard + add props | Medium | Low |
| `pages/shopper/dashboard.tsx` | Replace inline cards + add props | Low | Low |
| `pages/shopper/wishlist.tsx` | Replace inline cards + add props | Low | Low |
| `pages/trending.tsx` | Replace inline cards + add props (compact variant) | Low | Low |
| `components/InspirationGrid.tsx` | Wrap ItemCard inside masonry (evaluation) | Medium | Low |
| `components/LibraryItemCard.tsx` | **No change** (keep separate) | — | — |

---

## Appendix: Type Definitions

### Unified Item Type (TypeScript)

```typescript
export type UnifiedItemCardItem = {
  // Mandatory
  id: string;
  title: string;

  // Common optional
  photoUrls?: string[];
  price?: number;
  currentBid?: number;
  status?: 'ACTIVE' | 'SOLD' | 'PENDING' | 'RESERVED';
  rarity?: string | null;
  isAiTagged?: boolean;

  // Sale context
  sale?: {
    id: string;
    title: string;
    city?: string;
    state?: string;
  };
  businessName?: string;

  // Detail context
  description?: string;
  category?: string;
  condition?: string;
  auctionEndTime?: string;

  // Trending context
  _count?: {
    favorites?: number;
  };
  rankingIndex?: number;

  // AI context (not displayed)
  aiConfidence?: number;
};

export interface ItemCardProps {
  item: UnifiedItemCardItem;
  variant?: 'default' | 'compact' | 'detailed';
  showImage?: boolean;
  showTitle?: boolean;
  showPrice?: boolean;
  showCategory?: boolean;
  showCondition?: boolean;
  showSaleInfo?: boolean;
  showCountdown?: boolean;
  showStatus?: boolean;
  showRarity?: boolean;
  showAiTagged?: boolean;
  showFavoriteButton?: boolean;
  showFavoriteCount?: boolean;
  showRankingBadge?: boolean;
  imageHeight?: 'square' | 'fixed-h48' | 'fixed-h32';
  imageOptimization?: 'advanced' | 'basic' | 'none';
  className?: string;
  onClick?: () => void;
}
```

---

## Sign-Off

**Spec Author:** Findasale-Architect
**Date:** 2026-03-28
**Ready for Dev Implementation:** ✅ YES

This specification is ready for `findasale-dev` to implement. No major architectural blockers identified. Risk is manageable with phased rollout.
