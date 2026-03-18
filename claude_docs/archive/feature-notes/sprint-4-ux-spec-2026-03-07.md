# Sprint 4 UX Spec — Search by Item Type
**Date:** 2026-03-07
**Audience:** Estate sale shoppers looking for specific item types across multiple active sales

---

## Executive Summary

Sprint 4 introduces full-text search by item keywords and category-based filtering across all active estate sale inventory. Current shopping is sale-first (browse a sale's items); Sprint 4 pivots to item-first (find a specific chair, then learn which sales have it).

This is powered by PostgreSQL full-text search (FTS) on item titles + descriptions + categories, allowing shoppers to search "vintage walnut dresser" or "Tiffany lamp" and get ranked results from all active sales. On the backend, a generated `searchVector` column and compound indexes ensure sub-100ms query times. On the frontend, shoppers interact with an intuitive search bar + faceted filters (category, condition, price, sort) similar to Etsy or Facebook Marketplace.

The feature lives primarily on a new `/search` page and is accessible from: homepage search bar, sale detail pages (scope to one sale's items), and category landing pages (future).

---

## Shopper Intent — Top 3 Use Cases

**1. Specific Item Search ("I'm looking for a walnut dining table")**
- Shopper has a clear item in mind and searches by keywords
- Types "walnut table" or "dining table" and wants relevant results ranked by relevance
- Refines by price ($200–$800), condition (excellent), or just browses
- **Job:** Find a specific item type across all active sales without knowing which sale has it
- **Motivation:** Time-sensitive; good items sell fast; wants to find and buy same-day

**2. Category Browsing ("Show me all furniture under $300")**
- Shopper knows the general category (furniture, vintage, decor) but not specific keywords
- Wants to see all available items in that category, sorted by price/newest
- May save favorites or check multiple sales in person
- **Job:** Discover what's available in a category at a price point
- **Motivation:** Budget shopping; wants options; willing to browse

**3. Deal Hunting ("What's new in antiques?")**
- Shopper returns repeatedly with high intent to purchase
- Wants fresh items within preferred categories, sorted by newest first
- Checks daily or weekly for deals; may alert on specific item types
- **Job:** Stay updated on newly listed inventory
- **Motivation:** Collector or reseller; early-bird advantage

---

## Search Entry Points

### Primary Entry: Homepage Search Bar
**`/search?q=[query]`** — Full-text keyword search
- Prominent position, above the fold on homepage
- Placeholder: "Search items... (chair, vintage, electronics)"
- Single text input + optional date filters (existing)
- **Mobile:** Full-width input; tap expands to search page
- **Desktop:** Click → navigate to `/search?q=[query]` with results

### Secondary Entries

**1. Search Results Page Filters** (`/search` page)
- Full layout with sidebar filters (left) + results grid (right)
- Sticky search bar at top (can re-search or filter)
- Faceted filters: Category, Condition, Price Range, Sort
- **Mobile:** Filters collapse into a drawer/modal

**2. Sale Detail Page Item Scoping** (`/sales/[id]`)
- "View All Items" button or tab shows items within that sale
- Scoped to `saleId=[id]`; filters (category, condition) apply to one sale only
- Helps shoppers see full inventory of a sale before visiting

**3. Category Landing Pages** (Future, Sprint 4b)
- `/search?category=furniture` pre-populated
- Shows all furniture across active sales
- Direct link from homepage category buttons (optional enhancement)

---

## Filter & Facet Design

### Primary Filters (Priority Order)

**1. Search Query (Primary)**
- Text input: "Search items... (chair, vintage, electronics)"
- Debounce 300ms → update results in real-time
- Query matches against title + description + category (FTS ranking)
- No autocomplete dropdown (KISS); simple text search

**2. Category (Optional Refine)**
- Checkboxes (allow multi-select) or dropdown
- Options (from schema): furniture, decor, vintage, textiles, collectibles, art, antiques, jewelry, books, tools, electronics, clothing, home, other
- Show facet counts: "Furniture (45)", "Decor (28)"
- Counts update dynamically as user adds/removes filters

**3. Condition (Optional Refine)**
- Buttons or checkboxes: mint, excellent, good, fair, poor
- Helps shoppers understand wear/restoration level
- Show facet counts

**4. Price Range (Optional Refine)**
- Min/Max inputs or slider ($0–$2,000+)
- Native number input on mobile (opens numeric keyboard)
- Shows current price range in results

**5. Sort Options (Sticky)**
- Dropdown: Relevance (default FTS rank), Newest, Price Low→High, Price High→Low
- Persist in URL (`&sort=price_asc`)
- Default: Relevance (FTS rank)

### Facet Display

**Desktop (Sidebar, Always Visible):**
```
Filters                           Results
├─ Search                         ┌─────────────┐
│  [Search items...] [Search]    │ Vintage Chair│
│                                │ $85          │
├─ Category                       │ Fair Cond    │
│  ☐ Furniture (45)              │ [Save]       │
│  ☐ Decor (28)                  │ [View Sale]  │
│  ☐ Vintage (32)                └─────────────┘
│  [View more]                    [Grid: 4 cols]
│
├─ Condition
│  ☐ Mint (3)
│  ☐ Excellent (67)
│  ☐ Good (105)
│  ☐ Fair (22)
│
├─ Price Range
│  Min: [100] Max: [1000]
│
├─ Sort: [Relevance ▼]
│  - Relevance
│  - Newest
│  - Price (Low→High)
│  - Price (High→Low)
│
└─ [Clear All Filters]
```

**Mobile (Collapsible Sheet/Drawer):**
- Filters hidden by default
- Tap "Filters" button → full-screen drawer slides up
- User adjusts filters → tap "Apply" → drawer closes
- Results update to match

---

## Results Display

### Item Card Layout (Grid)
Each item shows:
```
┌─────────────────┐
│                 │
│   Item Photo    │  (aspect-ratio: 1:1; lazy-loaded)
│  (tap → detail) │  (fallback: gray box w/ item icon)
│                 │
├─────────────────┤
│ Item Title      │  ("Vintage Oak Dresser")
│ (2 lines, …)    │  (truncated if >50 chars)
│                 │
│ $350            │  (bold, green or amber-600)
│                 │
│ Furniture       │  (category badge)
│ Fair Condition  │  (condition badge, optional)
│                 │
│ Johnson Estate  │  (organizer name, small gray text)
│ [Save ♡]        │  (heart icon, toggle favorite)
└─────────────────┘
```

**Tap behavior:**
- Card → opens item detail page (`/items/[id]`)
- Heart icon → saves item to favorites (existing)
- Organizer name → (future) opens sale detail

### Grid Layout
- **Desktop (≥1200px):** 4 columns, gap-4
- **Tablet (768–1199px):** 2–3 columns
- **Mobile (<768px):** 2 columns, full-width, gap-2

### Header & Status Line
```
Showing 1–20 of 87 items  |  Sort: [Relevance ▼]  |  [☰ Filters]
```
- Shows result count range
- Sticky at top (desktop + mobile)
- Filters button toggles sidebar (desktop) or drawer (mobile)

---

## Mobile-First Considerations

### One-Handed UX
- **Search bar:** Full-width at top, accessible with thumb
- **Filter button:** Bottom-right or top-right, large tap target (44px minimum)
- **Item cards:** 2-column grid (fits thumb scroll, visible price)
- **Category pills:** Horizontal scroll if needed, not wrapped

### Form Inputs
- **Price inputs:** Native number spinners; accept touch input
- **Condition/Status buttons:** Large buttons (44px tall, easy tap)
- **Filter panel:** Full-screen modal on mobile (don't split screen)

### Photo Loading
- Lazy load images; placeholder grey box while loading
- Square aspect ratio matches mobile viewport
- Tap on card → opens detail page (item/[id])

### Navigation
- Back button (top-left) returns to categories or previous search
- Breadcrumb: Home > Search > [Category] (optional, clean on mobile)

---

## Empty States, Loading & Error Handling

### Loading State (Skeleton)
```
[Search bar]
[Sort: Relevance ▼]  Showing 1–20 of ...

┌───────────────┐  ┌───────────────┐  ┌───────────────┐
│ [Skeleton]    │  │ [Skeleton]    │  │ [Skeleton]    │
│ [Skeleton]    │  │ [Skeleton]    │  │ [Skeleton]    │
│ [Skeleton]    │  │ [Skeleton]    │  │ [Skeleton]    │
└───────────────┘  └───────────────┘  └───────────────┘

[6–8 skeleton cards in grid]
```
- Pulse animation (gray → white breathing)
- Skeletons match card dimensions (200px × 250px on desktop)

### No Results State
```
                  🔍  No items found

   "vintage lamp" didn't match any items.

   Try:
   • Adjust your price filter
   • Search for a different term
   • Browse all items instead

      [Clear Filters]  [Browse All]
```

**Copy details:**
- Show the query user searched for ("vintage lamp")
- Suggest next actions (broaden search, clear filters, browse)
- Don't blame the user ("No results found" not "You didn't search right")

### Error State (Network / API Failure)
```
             ⚠️  Oops, something went wrong

   We couldn't load search results.
   Check your connection and try again.

                   [Retry]
```

**Action:** Retry button to refetch with same params
**Fallback:** If persistent error, show [Go Back] to homepage or [Browse Sales]

### First-Time Visitor (New Shopper)
- No special welcome state needed
- Filters show facet counts (e.g., "Furniture (45)") — helps orient user
- Default sort is "Relevance" — most useful results first

---

## Copy Notes

### Labels & Button Text
| Element | Text | Notes |
|---------|------|-------|
| Primary CTA (homepage) | "Browse by Item Type" | Links to `/search?type=category` |
| Category Selection | e.g., "Furniture" | Singular, title case |
| Filter Panel Title | "Filters" (mobile), "Refine Your Search" (desktop) | Short & clear |
| Price Label | "Price Range" | Include $ symbol in input |
| Condition Label | "Condition" | Dropdown/pill options |
| Sale Status Label | "Sale Status" | Helps with urgency |
| Sort Label | "Sort by" | Dropdown, default: "Newest First" |
| Empty State | "No items found in [Category]" | Use dynamic category name |
| CTA (empty state) | "Clear Filters" or "Browse Categories" | Offer paths forward |
| Result Counter | "47 items in [Category]" | Show count clearly |

### Inline Help
- Hover tooltip on "Condition": "Describes item wear: Like New (no visible wear), Good (minor wear), Fair (significant wear), Parts Only (non-functional)"
- Price range input placeholder: "Min – Max"

---

## Dev Handoff Notes

### API Contract (Per sprint-4-architecture-2026-03-07.md)

**Endpoint:** `GET /api/items/search`

**Request Parameters:**
```typescript
{
  q?: string;                    // Query string (title + description + category)
  category?: string;             // Filter: furniture, decor, vintage, etc.
  condition?: string;            // Filter: mint, excellent, good, fair, poor
  saleId?: string;              // Scope to single sale (optional; cross-sale by default)
  priceMin?: number;            // Filter: minimum price
  priceMax?: number;            // Filter: maximum price
  sort?: "relevance" | "newest" | "price_asc" | "price_desc"; // Default: relevance
  limit?: number;               // Per-page (default 20, max 100)
  offset?: number;              // Pagination (default 0)
}
```

**Response:**
```json
{
  "data": [
    {
      "id": "item_123",
      "title": "Vintage Oak Dresser",
      "price": 350,
      "photoUrl": "https://...",
      "category": "Furniture",
      "condition": "Good",
      "saleId": "sale_456",
      "organizer": {
        "id": "org_789",
        "businessName": "Johnson Estate Sales"
      },
      "relevanceScore": 0.95
    }
  ],
  "total": 87,
  "limit": 20,
  "offset": 0,
  "facets": {
    "categories": [
      { "name": "Furniture", "count": 45 },
      { "name": "Decor", "count": 28 },
      { "name": "Vintage", "count": 32 }
    ],
    "conditions": [
      { "name": "Excellent", "count": 67 },
      { "name": "Good", "count": 105 }
    ],
    "priceRange": { "min": 10, "max": 2500 }
  }
}
```

### Frontend Implementation Checklist

**New Components:**
- [ ] `ItemSearch.tsx` — query bar + filter form
- [ ] `ItemSearchResults.tsx` — grid + pagination
- [ ] `FilterSidebar.tsx` — category/condition/price facets
- [ ] `hooks/useItemSearch.ts` — React Query + URL param sync

**New Pages:**
- [ ] `/search.tsx` — full search page layout (enhances existing)

**Homepage Integration:**
- [ ] Add search bar to hero section (or use existing)
- [ ] Link to `/search` on submit

**Sale Detail Integration:**
- [ ] Optional "Items in this sale" section with category filter
- [ ] Set `saleId=[id]` in API call (read-only filter)

**Mobile Considerations:**
- [ ] Filters in a bottom drawer/sheet (not sidebar)
- [ ] 2-column item grid
- [ ] 44px+ tap targets
- [ ] Lazy-load images (Intersection Observer)
- [ ] Max 20 items per page

**React Query Setup:**
- [ ] `useQuery` hook: `['search', query, category, condition, priceMin, priceMax, sort, offset]`
- [ ] Debounce input: 300ms
- [ ] Cache stale time: 5 minutes
- [ ] Refetch on filter change

**Accessibility (WCAG 2.1 AA):**
- [ ] Search input: `aria-label="Search items across all sales"`
- [ ] Filter labels: associated with inputs via `<label htmlFor>`
- [ ] Results: announce changes via live region (aria-live="polite")
- [ ] Images: `alt` text = item title
- [ ] Semantic buttons (not divs)

**Performance Baselines (from architecture):**
- [ ] Cold cache: <500ms for 10–100 items
- [ ] Warm cache: <100ms for 10–100 items
- [ ] Image load: lazy-load with Intersection Observer
- [ ] Search debounce: 300ms

### URL Params Persistence
Save to URL whenever user changes:
- `q` (search query)
- `category`, `condition`, `priceMin`, `priceMax` (filters)
- `sort` (sort order)
- `offset` (pagination)

**Example:** `/search?q=chair&category=furniture&condition=excellent&priceMax=500&sort=price_asc&offset=0`

### Testing Checklist

**Functional:**
- [ ] Search by keyword returns results ranked by relevance
- [ ] Category filter works (single + multi-select)
- [ ] Condition filter works
- [ ] Price range filter works (both inputs)
- [ ] Sort by relevance, newest, price works
- [ ] Pagination works (20 items/page)
- [ ] Facet counts update dynamically
- [ ] Empty state shows when no results
- [ ] Loading state shows during fetch
- [ ] Error state shows on API failure

**Mobile:**
- [ ] Filters collapse into drawer
- [ ] 2-column grid fits screen
- [ ] Tap targets ≥44px
- [ ] No horizontal scroll
- [ ] Images lazy-load

**Desktop:**
- [ ] 4-column grid
- [ ] Sidebar filters always visible
- [ ] Pagination buttons work

**Accessibility:**
- [ ] Tab order is logical
- [ ] Labels associated with inputs
- [ ] Error messages are descriptive
- [ ] Images have alt text
- [ ] Keyboard navigation works

**Performance:**
- [ ] Cold cache: <500ms
- [ ] Warm cache: <100ms
- [ ] Images load without blocking layout

---

## ASCII Wireframes

### Desktop — Item Search Results (Full Page)

```
╔════════════════════════════════════════════════════════════════════════════╗
║  FindA.Sale  [Logo]                              [Account] [Favorites] [☰] ║
╠════════════════════════════════════════════════════════════════════════════╣
║                                                                            ║
║  ┌────────────────────────────────────────────────────────────────────┐   ║
║  │ 🔍  Search: "furniture"                                        [X] │   ║
║  └────────────────────────────────────────────────────────────────────┘   ║
║                                                                            ║
║  ┌──────────────────────┐  ┌────────────────────────────────────────┐   ║
║  │  FILTERS             │  │ Showing 1–20 of 87                    │   ║
║  │                      │  │ Sort: [Relevance ▼]                   │   ║
║  │ Search               │  │                                        │   ║
║  │ [Search items...]    │  │ ┌──────────┐ ┌──────────┐ ┌──────────┐│   ║
║  │                      │  │ │[Photo]   │ │[Photo]   │ │[Photo]   ││   ║
║  │ Category             │  │ │          │ │          │ │          ││   ║
║  │ ☐ Furniture (45)     │  │ ├──────────┤ ├──────────┤ ├──────────┤│   ║
║  │ ☐ Decor (28)         │  │ │Walnut    │ │Oak Desk  │ │Leather   ││   ║
║  │ ☐ Vintage (32)       │  │ │Dresser   │ │$325     │ │Chair     ││   ║
║  │ ☐ Textiles (15)      │  │ │$485     │ │Excellent│ │$120     ││   ║
║  │ ☐ Books (9)          │  │ │Good     │ │[Save ♡] │ │Fair     ││   ║
║  │ [View more +3]       │  │ │[Save ♡] │ │[View]   │ │[Save ♡] ││   ║
║  │                      │  │ └──────────┘ └──────────┘ └──────────┘│   ║
║  │ Condition            │  │                                        │   ║
║  │ ☐ Mint (3)           │  │ ┌──────────┐ ┌──────────┐ ┌──────────┐│   ║
║  │ ☐ Excellent (67)     │  │ │[Photo]   │ │[Photo]   │ │[Photo]   ││   ║
║  │ ☐ Good (105)         │  │ │          │ │          │ │          ││   ║
║  │ ☐ Fair (22)          │  │ ├──────────┤ ├──────────┤ ├──────────┤│   ║
║  │ ☐ Poor (8)           │  │ │Dresser   │ │Cabinet   │ │Night-    ││   ║
║  │                      │  │ │$200     │ │$400     │ │stand     ││   ║
║  │ Price Range          │  │ │Excellent│ │Fair     │ │$95      ││   ║
║  │ Min: [____] Max: [___]│  │ │[Save ♡] │ │[Save ♡] │ │[Save ♡] ││   ║
║  │                      │  │ │[View]   │ │[View]   │ │[View]   ││   ║
║  │ [Clear All]          │  │ └──────────┘ └──────────┘ └──────────┘│   ║
║  │                      │  │                                        │   ║
║  │                      │  │ ◄  1  [2]  3  4  ►                    │   ║
║  └──────────────────────┘  └────────────────────────────────────────┘   ║
║                                                                            ║
╚════════════════════════════════════════════════════════════════════════════╝
```

### Mobile — Search Results (Compact)

```
╔══════════════════════════════════════════╗
║  FindA.Sale                          [☰] ║
╠══════════════════════════════════════════╣
║                                          ║
║  ┌────────────────────────────────────┐ ║
║  │ 🔍  Search: "furniture"        [X] │ ║
║  └────────────────────────────────────┘ ║
║                                          ║
║  Showing 1–20 of 87                      ║
║  [Relevance ▼]  [☰ Filters]             ║
║                                          ║
║  ┌──────────────────┐                    ║
║  │                  │                    ║
║  │   [Photo]        │                    ║
║  │                  │                    ║
║  ├──────────────────┤                    ║
║  │ Walnut Dresser   │                    ║
║  │ $485             │                    ║
║  │ Good Condition   │                    ║
║  │ [Save ♡] [View] │                    ║
║  └──────────────────┘                    ║
║                                          ║
║  ┌──────────────────┐                    ║
║  │   [Photo]        │                    ║
║  ├──────────────────┤                    ║
║  │ Oak Desk         │                    ║
║  │ $325             │                    ║
║  │ Excellent Cond   │                    ║
║  │ [Save ♡] [View] │                    ║
║  └──────────────────┘                    ║
║                                          ║
║  ┌──────────────────┐                    ║
║  │   [Photo]        │                    ║
║  ├──────────────────┤                    ║
║  │ Leather Chair    │                    ║
║  │ $120             │                    ║
║  │ Fair Condition   │                    ║
║  │ [Save ♡] [View] │                    ║
║  └──────────────────┘                    ║
║                                          ║
║  [Load More...]                          ║
║                                          ║
╚══════════════════════════════════════════╝
```

### Mobile — Filters Drawer (When [☰ Filters] Opened)

```
╔══════════════════════════════════════════╗
║            FILTERS                  [X]  ║
╠══════════════════════════════════════════╣
║                                          ║
║  Category                                ║
║  ☑ Furniture                             ║
║  ☐ Decor                                 ║
║  ☐ Vintage                               ║
║  ☐ Textiles                              ║
║  ☐ [View more +9]                        ║
║                                          ║
║  Condition                               ║
║  ☑ Excellent (67)                        ║
║  ☐ Good (105)                            ║
║  ☐ Fair (22)                             ║
║  ☐ Mint (3)                              ║
║                                          ║
║  Price Range                             ║
║  Min: [____]  Max: [____]               ║
║                                          ║
║  Sort                                    ║
║  [Relevance ▼]                           ║
║   - Relevance                            ║
║   - Newest                               ║
║   - Price Low→High                       ║
║   - Price High→Low                       ║
║                                          ║
║  ┌────────────────────────────────────┐ ║
║  │  [Clear All]  [Apply Filters]      │ ║
║  └────────────────────────────────────┘ ║
║                                          ║
╚══════════════════════════════════════════╝
```

### Empty State (No Search Results)

```
╔══════════════════════════════════════════╗
║  FindA.Sale                          [☰] ║
╠══════════════════════════════════════════╣
║                                          ║
║  ┌────────────────────────────────────┐ ║
║  │ 🔍  Search: "Tiffany lamp"     [X] │ ║
║  └────────────────────────────────────┘ ║
║                                          ║
║           🔍  No items found             ║
║                                          ║
║  "Tiffany lamp" didn't match any items. ║
║                                          ║
║  Try:                                    ║
║  • Search for "lamp" instead             ║
║  • Adjust your price filter              ║
║  • Browse all items                      ║
║                                          ║
║  ┌────────────────────────────────────┐ ║
║  │      [Clear Filters]                │ ║
║  └────────────────────────────────────┘ ║
║                                          ║
║  ┌────────────────────────────────────┐ ║
║  │      [Browse All Items]             │ ║
║  └────────────────────────────────────┘ ║
║                                          ║
╚══════════════════════════════════════════╝
```

### Homepage Search Bar (New Entry Point)

```
╔════════════════════════════════════════════════════════════════════════════╗
║  FindA.Sale  [Logo]                              [Account] [Favorites] [☰] ║
╠════════════════════════════════════════════════════════════════════════════╣
║                                                                            ║
║                        Discover Amazing Deals                             ║
║     Find estate sales, garage sales, and auctions near you                ║
║                                                                            ║
║  ┌────────────────────────────────────────────────────────────────────┐   ║
║  │ 🔍  Search items... (chair, vintage, electronics)           [→]   │   ║
║  └────────────────────────────────────────────────────────────────────┘   ║
║                                                                            ║
║                                                                            ║
║           [All] [Upcoming] [This Weekend] [This Month]                   ║
║                                                                            ║
║                    Sales Near You (Map)                                   ║
║                                                                            ║
║                        Featured Sales                                     ║
║                                                                            ║
║  ┌──────────┐  ┌──────────┐  ┌──────────┐  ┌──────────┐                 ║
║  │[Photo]   │  │[Photo]   │  │[Photo]   │  │[Photo]   │                 ║
║  │Estate #1 │  │Vintage   │  │Furniture │  │Auction   │                 ║
║  │$45–150   │  │$10–300   │  │$50–2K   │  │$25–500   │                 ║
║  └──────────┘  └──────────┘  └──────────┘  └──────────┘                 ║
║                                                                            ║
╚════════════════════════════════════════════════════════════════════════════╝

KEY POINTS:
- Click search bar → takes to /search?q=[input]
- Placeholder explains search types
- Icon is search/magnifying glass
- Mobile: full-width input, tap expands to /search page
```

---

## Design System & Visual Style

### Colors (Use Existing Tailwind)
- **Search bar:** White bg, warm-300 border, amber-600 focus ring
- **Filter labels:** Warm-900 text, warm-100 bg (light)
- **Facet counts:** Warm-500 text (secondary)
- **Price:** Green-600 or amber-600 (bold)
- **Category/Condition badges:** Warm-100 bg, warm-700 text
- **Skeleton pulse:** Warm-200 → white animation

### Typography
- **Page title:** 2xl font-bold warm-900
- **Card title:** lg font-semibold warm-900 (2-line truncate)
- **Price:** xl font-bold green-600
- **Organizer name:** sm text-warm-500
- **Filter labels:** base font-medium warm-900

### Spacing & Layout
- Container padding: 4 (px-4) on mobile, 6 (px-6) on desktop
- Grid gap: 4 on desktop, 2 on mobile
- Card border radius: lg (8px)
- Sidebar width (desktop): 256px (fixed)
- Filter drawer (mobile): Full-screen modal

---

## Success Metrics & Measurements

### User Behavior
- Search queries submitted (top 10 terms)
- Filters applied (% searches using category, condition, price)
- Results engagement (CTR to item detail, CTR to sale detail)
- Empty state recovery (% using "Clear Filters" or "Browse All")

### Performance
- Search API latency (target <100ms warm, <500ms cold)
- Time to interactive (TTI) on /search page
- Image lazy-load success rate

### Business
- Items sold via search (vs. sale-level browsing)
- Conversion rate: search → item detail → sale → purchase
- Average search-to-purchase time

---

## Open Questions for Patrick

1. **Multi-category filtering** — Should shoppers select multiple categories (e.g., "Furniture + Decor") or single-select only? Current spec: single-select for MVP (can expand post-beta).

2. **Distance-based sorting** — Important for Grand Rapids beta? If yes, can we prompt for location permission on /search page? Or gray out until user grants access?

3. **Facet counts in UI** — Show dynamic counts next to filter options (e.g., "Furniture (45)")? Improves UX but adds backend load. Recommend yes for beta.

4. **Sale-scoped item search** — On `/sales/[id]`, should there be a "View Items" section with category filter? Helps shoppers see full inventory before visiting. Recommend yes for 4b.

5. **Homepage integration** — Keep search bar as-is (on existing index.tsx), or add featured category buttons below it? Can defer to 4b if needed.

6. **Saved searches / search history** — Low priority for beta, but should we design for it (localStorage)? Defer to Phase X.

7. **Category taxonomy finalization** — Are the 14 categories (furniture, decor, vintage, textiles, etc.) locked, or can organizers add custom categories? Locked for beta; flag custom categories as future work.

---

## Coordination with Backend (sprint-4-architecture-2026-03-07.md)

This UX spec **depends on** the backend API contract defined in `sprint-4-architecture-2026-03-07.md`. Key alignment points:

| Backend | UX Expectation |
|---------|---|
| `searchVector` generated column (tsvector) | Full-text search ranks results by relevance |
| `GET /api/items/search?q=...` | Search bar → query parameter |
| Facets response (categories, conditions, price range) | Filter sidebar shows counts |
| Compound index on (category, condition, status) | Filters respond <100ms |
| ILIKE fallback if FTS slow | Graceful degradation (user doesn't notice) |
| Max 100 results, pagination (limit/offset) | Results paginated 20/page |

**Dev task:** Implement frontend components that consume the `/api/items/search` endpoint (4a) and integrate with `/search` page (4b).

---

## Sprint Roadmap Integration

**Sprint 4a (Week 1–2):** Backend API (database migration, search service, endpoints)
- UX spec provides requirements; dev implements API
- No frontend changes yet

**Sprint 4b (Week 3–4):** Frontend UI (search page, filters, results grid)
- UX spec provides wireframes and interaction model
- Dev implements `ItemSearch.tsx`, `ItemSearchResults.tsx`, `/search` page enhancement
- Integrate with existing homepage search bar

**Post-Sprint:** Optimization & Analytics
- Monitor search performance (query times, empty state rate)
- Add saved searches, search history (if data supports it)
- Refine category taxonomy based on shopper behavior

---

## Summary for Dev Handoff

**What is this spec?**
A complete UX specification for Sprint 4 Search by Item Type. It defines how shoppers search for items across all estate sales, how results are displayed, how filtering works, and what states (loading, empty, error) they see.

**Key Deliverables from This Spec:**
1. 3 detailed shopper use cases (bargain hunting, category browsing, deal chasing)
2. Search entry points (homepage bar, sale detail page, future category pages)
3. Filter design (category, condition, price range, sort)
4. Results card layout (4-column desktop, 2-column mobile)
5. Empty/loading/error states with copy
6. Accessibility checklist (WCAG 2.1 AA)
7. 4 ASCII wireframes (desktop search, mobile search, mobile filters, empty state)
8. Dev implementation notes (API contract, React Query setup, mobile considerations)
9. Testing checklist (functional, mobile, accessibility, performance)

**What does Dev implement?**
- **4a (Backend):** Migration, FTS service, API endpoint (`/api/items/search`)
- **4b (Frontend):** Components, `/search` page, homepage integration, mobile responsiveness

**No code in this spec:** This is UX-only. Dev writes the implementation.

---

**Spec Owner:** FindA.Sale UX Agent
**Architecture Authority:** sprint-4-architecture-2026-03-07.md (backend contract)
**Sprint:** 4a + 4b — Search by Item Type
**Status:** ✅ Ready for Dev Handoff
**Last Updated:** 2026-03-07
**Next Step:** Load `findasale-dev` agent with this spec + architecture doc to begin implementation
