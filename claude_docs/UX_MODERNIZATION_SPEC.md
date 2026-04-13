# FindA.Sale Homepage Modernization Spec
**Date:** March 24, 2026
**Scope:** Homepage visual design overhaul
**Audience:** Patrick (visual thinker), dev team via findasale-dev subagent

---

## 1. Current State Assessment

### Layout Structure: The "Blocky" Problem
**Current:** Centered 12-column container with rigid stacking sections.
- Hero (centered text)
- Map section (full-width white box)
- Search + filters (horizontal flex, wraps awkwardly on mobile)
- Featured Sales grid (2 cols mobile, 3 cols desktop)

**Visual issue:** Each section feels like a literal stack of boxes. No spatial breathing. The 12px border-radius on cards (`card: '0.75rem'`) feels slightly rounded but "safe"—not modern. White card backgrounds on warm-50 background create hard edges (border: 1px solid gray-200 dark:border-gray-700).

**Comparison to modern sites:**
- Etsy: Hero bleeds to edges, overlapping content layers, asymmetric layout grids
- Airbnb: Cards have 12px radius with subtle depth, content flows below hero without hard section breaks
- Facebook Marketplace: Infinite scroll, cards have NO visible borders (shadow-only), overlapping text on hero background
- Nextdoor: Soft card shadows, large heading typography, generous whitespace between sections

---

### 2. Visual Hierarchy Issues

**Current problems:**
1. **Hero is weak.** "Discover Amazing Deals" (text-4xl/5xl amber-600) sits in a plain text block with no visual anchor. First-time visitors don't know what to do—hero needs a CTA, background treatment, or visual depth.
2. **Map dominates middle.** The "Sales Near You" section (full white card, 300px tall) takes up valuable above-the-fold real estate but doesn't sell the value proposition.
3. **Cards are dense.** Small text (text-xs for organizer), small image (60/40 split with cramped padding), reputation badges stack horizontally and overflow on small screens.
4. **Search filters are secondary.** "Featured Sales" heading + badge appears AFTER map + search. User doesn't know they're browsing sale cards until halfway down.

**Eyes should land on:**
1. Hero statement + CTA (above fold)
2. Sale cards immediately visible (scroll 1x = cards, no map required)
3. Organizer credibility (verified badge, reputation, favorites count) prominent on cards

---

### 3. Typography & Spacing — Dated Patterns

**Current:**
- Fraunces (serif) on headline only: `text-4xl md:text-5xl font-bold` on hero
- Inter body + Fraunces heading on titles: `text-sm font-semibold` on card title (inconsistent)
- Padding: 3px, 4px, 6px, 8px on cards (too tight)
- Line-height safe defaults: 1.2 on headers, 1.7 on body

**Dated feels:**
- Hero headline is serif-only. Modern sites (Etsy, Airbnb) use serif + sans-serif pairing: big serif phrase + small sans subtitle.
- Card padding `p-3` (12px) makes content claustrophobic. Photos are 1:1 square but text below is squeezed.
- Organizer name is hyperlink (amber-600 text-xs) with badges stacked right—no visual separation, feels crowded.

**Modern pattern:** Generous whitespace, mixed font sizes on card (large date, normal title, small organizer), and clear text hierarchy.

---

### 4. Card Design — Functional but Generic

**Current SaleCard:**
- 1:1 image (aspect-square) + 40% text area
- LQIP blur background + skeleton loading (good tech, bad UX—skeleton is invisible)
- Badge (top-left) in small pill shape, hard to spot
- Text: title (line-clamp-1), subtitle (date/city), organizer footer
- Reputation badges overflow footer: verified icon + tier + score stacked, wraps on mobile

**Bland elements:**
- No visual differentiation between sale types (auction vs. flash vs. upcoming)
- Favorite count (♥ {count}) is tiny text, right-aligned, conflicts with badges
- "SOLD" / "LIVE" / "TODAY" badges are small, easy to miss on mobile
- No hover state (shadow-card-hover exists in config but not used prominently)

**Modern patterns to steal:**
- **Etsy cards:** Large, clear title. 2-line organizer row (name + rating) below image. Price prominent. No badge overlay—use status below image.
- **Airbnb cards:** 4:3 image, title overlaid on bottom of image (white text, dark scrim), date+rating below. Hover reveals more info (no click required).
- **Facebook Marketplace:** 1:1 image, huge price overlay (bottom-right corner), title below, "X hours ago" in small type, no organizer visible (just item focus).

---

### 5. Hero / Above-the-Fold — Static & Vague

**Current:**
```
Discover Amazing Deals
Find estate sales, garage sales, yard sales, auctions, flea markets, and more near you with FindA.Sale
[City Heat Banner]
[Treasure Hunt Banner]
```

**Problems:**
- No visual hook (just text on warm-50 background)
- No CTA button ("Search Now", "Browse Sales", "Create Wishlist")
- Two promotional banners below hero are feature-focused, not value-focused
- First-time visitor sees: text + banner + banner, then map, then search, then cards. Navigation is unclear.

**Modern approach:**
- **Hero should be:** Large serif headline (Fraunces) + sans serif subheading + image/illustration OR text-only with background gradient/color block
- **Include CTA:** "Browse Sales" or "Search Your Area" button below text
- **Remove map from above-fold:** Move it down or put it in a modal (most users want to browse cards, not see pins)
- **Promotional banners:** Keep as secondary content AFTER featured cards, not before

---

### 6. Mobile (375px) — Cramped

**Current issues at 375px width:**
- Grid: `grid-cols-2 md:grid-cols-3` = 2-col grid on mobile
- Card width: ~175px (very small image)
- Search + date filters stack but buttons wrap: "All Upcoming This Weekend This Month" wraps to 3 lines
- Organizer badges wrap to 2-3 lines: name + verified + tier + score = overflow hell
- Map stays 300px tall (half the viewport on small phone)

**Modern mobile pattern:**
- 2-col grid is correct
- But card images should be taller (3:2 or 4:3 ratio instead of 1:1 square)
- Organizer info should NOT stack—show name only, move reputation to second row
- Search bar full-width, buttons below in 2-col or pill layout

---

### 7. Dark Mode — Acceptable but Flat

**Current dark mode:**
- Background: `dark:bg-gray-900`
- Cards: `dark:bg-gray-800`
- Text: `dark:text-gray-100` / `dark:text-gray-300` / `dark:text-gray-400`
- Accent: `dark:text-amber-400` (lighter amber for contrast)

**Works,** but feels "safe" (standard Tailwind grays). No personality.

**Modern dark mode pattern (Etsy/Airbnb):**
- Dark blue-gray or charcoal base (not pure black, not Tailwind gray-900)
- Cards have elevated background (slightly lighter than page background) with subtle shadow to show depth
- Accent color slightly muted (not -400, maybe -300)

---

### 8. Comparison to Real Sites

| Site | Hero | Cards | Above-Fold Flow | Mobile |
|------|------|-------|-----------------|--------|
| **Etsy** | Large serif title + search bar overlaid on hero image; CTA buttons below | 3-4 col grid, 4:3 image, title + organizer + price, hover shows review stars | Logo → Search → Hero with CTA → Cards visible | 1-col grid, full-width cards, search sticky |
| **Airbnb** | Hero image fills viewport, title + filters overlay bottom; "Search" CTA | 3-4 col grid, 4:3 image, title overlaid with gradient scrim, date/price below | Logo → Hero → Filters → Cards | 1-col grid, hero 60% viewport, filters sticky |
| **Facebook Marketplace** | Search bar sticky, no visible hero | 2-col grid mobile, 4-5 col desktop; 1:1 image, title below, price overlaid, "active now" indicator | Logo → Sticky search → Infinite card scroll | 2-col grid, large images, search sticky at top |
| **Nextdoor** | Serif headline + serif tagline + CTA button; background color block | 3-col grid, 1:1 image, title + organizer + "posted 2h ago", subtle shadow | Logo → Hero with CTA → Cards | 2-col grid, cards full-width, generous padding |
| **FindA.Sale (current)** | Sans-serif title + paragraph text; no CTA, no background | 3-col grid desktop/2 mobile, 1:1 image, text cramped (p-3), organizer badges overflow | Logo → Hero (text only) → Map → Search → Banners → Cards | 2-col grid, map takes space, search wraps, organizer badges break |

---

## 9. What's Working (Keep Intact)

1. **2-col mobile grid** — Correct for category/search results
2. **Reputation badges** (VerifiedBadge, TierBadge, ReputationBadge) — Add credibility, keep them but reposition them
3. **1:1 square image** — Common pattern, but could upgrade to 4:3
4. **LQIP + skeleton loading tech** — Good; just make the UX feel faster (less visible skeleton bounce)
5. **Dark mode toggle** — Works, keep the accessibility
6. **Sale type badges** (AUCTION, FLASH, LIVE, TODAY) — Useful, just make them more prominent
7. **Date + location subtitle** — Clear metadata, keep it
8. **Sage green accent color** — Good secondary accent, underutilized
9. **Bottom tab nav** — Not on homepage but part of overall UX; works for shoppers
10. **Search + filter on homepage** — Correct placement (let users refine), just improve layout

---

## 3. Proposed Design Changes (Ranked by Impact)

### **Change 1: Hero Section Overhaul (Highest Impact)**
**Current:** Centered text block on warm-50 background
**New:** Serif + sans-serif split headline + CTA button + subtle background treatment

**Specifics:**
- **Headline:** "Find Amazing Deals Near You" (Fraunces, text-5xl, warm-900/dark:gray-100)
  - Subheading: "Browse 500+ active estate sales, auctions, and yard sales in Grand Rapids & beyond." (Inter, text-base, warm-600/dark:gray-400)
- **CTA Button:** "Start Exploring" (amber-600 bg, white text, 48px min height for touch, px-6 py-3)
- **Background:** Use a subtle gradient or soft color block behind hero. Example: `bg-gradient-to-br from-amber-50 to-warm-100` OR solid `bg-sage-50` (use the underutilized sage color)
- **Layout:** Hero section should take 25-30% of viewport on desktop, 40% on mobile (don't let map steal space)
- **Remove:** "Discover Amazing Deals" text inline. Move to headline only.
- **Spacing:** Increase `py-8` to `py-12` or `py-16` for breathing room

**Why it matters:** Modern sites lead with a strong value prop + CTA. Visitors know immediately what to do. Sage-50 background ties to brand (sustainability angle). Serif + sans split is 2025 design trend (Etsy, Airbnb, Webflow all use this).

---

### **Change 2: Card Image Ratio & Hover State (High Impact)**
**Current:** 1:1 square image, minimal hover effect
**New:** 4:3 landscape image, pronounced hover lift + shadow

**Specifics:**
- **Image ratio:** Change `aspect-square` to `aspect-video` (16:9) OR custom `aspect-[4/3]` (3:2 compromise)
  - Rationale: More visual real estate for product photos. Estate sale / yard sale photos are typically landscape.
- **Hover effect:** Upgrade from `hover:shadow-card-hover` to:
  ```
  hover:shadow-lg hover:-translate-y-2 transition-all duration-200
  ```
  - Creates "lift" effect: shadow gets deeper AND card moves up slightly
  - Modern apps (Framer, Vercel dashboard) use this pattern
- **Border radius:** Keep `card` (12px) but ensure shadow has matching radius (it does)
- **Border:** Remove `border border-gray-200 dark:border-gray-700`. Replace with shadow-only (Tailwind default shadow-sm or custom shadow-card).
  - Borders feel dated; shadow-based elevation is modern
- **Padding adjustment:** Keep image at `aspect-[4/3]` but reduce text padding from `p-3` (12px) to `p-4` (16px) for better proportions

**Why it matters:** Larger images = more visual appeal. Hover lift is psychological feedback that cards are interactive. Borders are 2005 design; shadows are modern. 4:3 ratio is standard across Etsy, Pinterest, Google Photos.

---

### **Change 3: Card Footer Reorganization (High Impact)**
**Current:** Title (line-clamp-1) → date/location subtitle → organizer footer (name + verified + tier + score + favorites), all cramped

**New:** Clearer hierarchy with 3-row structure

**Structure:**
```
[Image] (4:3)
┌─────────────────────────┐
│ Sale Title              │ (semibold, text-sm, 2 lines allowed)
├─────────────────────────┤
│ Mar 24–26 · Grand Rapids │ (text-xs, warm-500, single line)
├─────────────────────────┤
│ Acme Estate Sales ✓ PRO  │ (text-xs, organizer name + badges in one line)
│ ★ 4.8 (23) · ♥ 156      │ (text-xs, reputation score + favorite count)
└─────────────────────────┘
```

**Specifics:**
- **Row 1 — Title:** Allow 2 lines (`line-clamp-2` instead of `line-clamp-1`), use `font-medium` (not `font-semibold`), `text-sm`
- **Row 2 — Date/Location:** Keep as-is: "Mar 24 – Mar 26 · Grand Rapids, MI" (text-xs, warm-500)
- **Row 3 — Organizer:** Single line: name (text-xs, amber-600) + verified badge (icon only, no label) + tier badge (small)
  - Move favorites count to second organizer line
  - If reputation score exists, show as stars or number: "⭐ 4.8 (23 reviews) · ♥ 156"
  - Don't let badges wrap—truncate organizer name if needed
- **Spacing between rows:** `gap-2` instead of `mt-2` throughout

**Why it matters:** 2-line title is standard (Etsy, Nextdoor). 3-row structure lets eyes scan top-to-bottom naturally. Organizer credibility (badges + rating) is now scannable without wrapping. Favorite count visible without hunting.

---

### **Change 4: Map Section Relocation / Optional Removal (Medium Impact)**
**Current:** "Sales Near You" map section appears immediately after hero, taking 300px of above-fold space

**Option A (Recommended):** Move map below featured cards OR put it in a modal/expandable section
**Option B:** Remove entirely from homepage (users can browse map from /map route)

**Specifics (Option A):**
- Create a toggle: "View on Map" button below cards or in a sticky footer
- On click: map opens in a modal or replaces card grid (with toggle to go back)
- Frees up ~400–500px of homepage real estate for cards

**Why it matters:** Most users want to browse cards, not see pins on a map. Putting map first delays the content users actually want. Nextdoor/Facebook Marketplace don't show map on homepage—it's a secondary view. Keep it accessible (many users WILL want it), just don't force it before cards.

---

### **Change 5: Search + Filter Layout Improvement (Medium Impact)**
**Current:** Search bar + 4 date filter buttons in horizontal flex, wraps awkwardly on mobile

**New:** 2-row layout on mobile, 1-row on desktop; larger touch targets

**Specifics:**
- **Desktop:** Keep horizontal layout (search bar + buttons side-by-side)
- **Mobile (375px):** Stack as:
  - Row 1: Search bar (full width)
  - Row 2: 4 filter buttons in pill layout, horizontally scrollable OR wrapped as 2x2 grid
- **Button sizing:** Increase from `px-4 py-2` to `px-5 py-2.5` (48px min touch height)
- **Search bar:** Keep icon (magnifying glass), but add `placeholder-warm-400` for visibility
- **Spacing:** `gap-3` between search + buttons, `gap-2` between buttons

**Why it matters:** Touch-friendly buttons = 48px minimum height (accessibility + mobile UX). Horizontal scrolling is standard for filter pills on mobile (Twitter, LinkedIn, Nextdoor). Current wrapping to 3 lines looks broken.

---

### **Change 6: Card Grid Adjustment (Medium Impact)**
**Current:** `grid grid-cols-2 md:grid-cols-3 gap-4`

**New:** Responsive gap + optional 4-col on large screens

**Specifics:**
- Mobile (< 640px): 2 columns, `gap-3` (12px)
- Tablet (640px–1024px): 3 columns, `gap-4` (16px)
- Desktop (> 1024px): 3 columns, `gap-4` (or 4 columns if hero + search take 30% height)
- **Card max-width:** No change needed; just ensure gap scales with breakpoints

**Why it matters:** 3-column is the goldilocks for secondary sales (not e-commerce where 4–5 is common). Smaller gap on mobile prevents squeeze. Consistent gap = better visual rhythm.

---

### **Change 7: Text Hierarchy & Font Pairing (Lower Impact, High Perception)**
**Current:** Fraunces on hero only; Inter throughout

**New:** Serif + sans-serif pairing across sections

**Specifics:**
- **Hero headline:** "Find Amazing Deals" — Fraunces (serif), text-5xl, warm-900
- **Section headers** ("Featured Sales", "Sales Near You"): Mix serif + sans:
  - "Featured" (Fraunces, text-3xl) + "Sales" (Inter, text-3xl, lighter weight)
  - OR: Keep as is but increase size from `text-3xl` to `text-4xl` and add `font-bold`
- **Card title:** Keep Inter, increase from `text-sm` to `text-base` (if allowing 2 lines)
- **Organizer name:** Keep `text-xs` but use `font-semibold` for contrast

**Why it matters:** Serif + sans mix is trendy (Etsy, Airbnb, Webflow, Linear). Larger section headers (text-4xl) add visual weight. Modern sites don't bury primary content in text-sm.

---

## 4. Layout Proposal

### Above-the-Fold (Mobile + Desktop)

```
┌─────────────────────────────────────────┐
│ HEADER: Logo + Search + Avatar          │
├─────────────────────────────────────────┤
│                                         │
│  Hero Section (sage-50 background)      │
│  ├─ Headline: "Find Amazing Deals..."   │
│  ├─ Subheading: "Browse 500+ sales..."  │
│  └─ CTA: [Start Exploring] button       │
│                                         │
│ Search Bar (full width)                 │
│ Date Filter Pills (horizontal)          │
│                                         │
├─────────────────────────────────────────┤
│ Featured Sales Grid (2–4 col)           │
│ ├─ Card 1 [4:3 image, new footer]       │
│ ├─ Card 2                               │
│ ├─ Card 3                               │
│ └─ Card 4 (visible on desktop)          │
│                                         │
├─────────────────────────────────────────┤
│ [City Heat Banner] (or below cards)     │
│ [Treasure Hunt Banner]                  │
│                                         │
├─────────────────────────────────────────┤
│ [View on Map] button / toggle           │
│                                         │
├─────────────────────────────────────────┤
│ FOOTER                                  │
└─────────────────────────────────────────┘
```

### Flow on First Visit
1. **Logo + Header** → immediately recognizable
2. **Hero + CTA** → value prop + action (not just text)
3. **Search bar** → quick access (but not forced)
4. **Featured cards** → visual payoff (cards sell the product)
5. **Banners** → secondary engagement (promos, features)
6. **Map option** → power users can find it

---

## 5. Reference Examples

**Hero + CTA Pattern (Steal From):**
- Etsy: https://www.etsy.com/ — Large headline + search overlay on hero image + CTA below
- Nextdoor: Large serif headline + sans-serif tagline + CTA button, solid background color (no image)

**Card Design (Steal From):**
- Etsy: https://www.etsy.com/search?q=estate+sale — 4:3 image, title + organizer + price, hover effects
- Airbnb: https://www.airbnb.com/ — 4:3 image, title overlaid on image with scrim, date/rating below
- Pinterest: 2-col mobile, 4:3 image, title below, hover lift effect

**Filter Pills (Steal From):**
- Twitter/X: Horizontal scrollable pill buttons for filters
- LinkedIn: Pill-shaped filters, horizontally scrollable on mobile
- Nextdoor: Date filters in pill shape, wrap to 2x2 on small screens

**Mobile Layout (Steal From):**
- Facebook Marketplace: Sticky search bar, 2-col grid, full-width cards
- Nextdoor: 2-col grid, generous padding, large card images

---

## 6. What NOT to Change

1. **Bottom tab navigation** — Works for shoppers; keep it
2. **Reputation badges (verified, tier, score)** — Essential for credibility; just reposition
3. **Dark mode** — Keep; just maybe warm the grays slightly (less pure gray-900)
4. **Sage green palette** — Underutilized; make it a background accent (hero, section dividers)
5. **Sale type badges (AUCTION, LIVE, TODAY, FLASH)** — Keep; just make top-left corner more prominent
6. **Date + location metadata** — Clear and useful; keep it
7. **Favorite count** — Useful social proof; keep visible
8. **2-col mobile grid** — Correct for this category; don't switch to 1-col
9. **LQIP image loading** — Great tech; just make skeleton less visible (fade to 5% opacity instead of 60%)
10. **Authentication flows** — Login/register not on homepage; no change needed

---

## 7. Implementation Priority

### Phase 1 (Weeks 1-2): Hero + Search + Card Footer Restructure
- New hero section with background color + CTA
- Reorganize card footer to 3-row structure
- Improve search + filter layout (touch-friendly buttons)
- Expected tokens: ~8-12k (findasale-dev dispatch)

### Phase 2 (Week 3): Image Ratio + Hover + Layout
- Change card images from `aspect-square` to `aspect-[4/3]`
- Add hover lift effect (shadow + translate)
- Remove borders, use shadow-only
- Adjust grid gaps for mobile
- Expected tokens: ~6-8k

### Phase 3 (Week 4): Polish + Optional Enhancements
- Section header typography (serif + sans pairing)
- Map relocation (optional; defer to user feedback)
- Dark mode warmth adjustment
- Expected tokens: ~4-6k

---

## 8. Success Metrics (What to Measure Post-Launch)

1. **Engagement:** Click-through rate on cards (currently unmeasured)
2. **Above-fold visibility:** Time to first card interaction (should be < 5 seconds)
3. **Mobile usability:** Form error rate on search + filters (should decrease)
4. **Hover effects:** Desktop hover state engagement (if analytics available)
5. **Dark mode:** Usage rate (confirm adoption)

---

## Design Specification Version
- **Created:** March 24, 2026
- **Status:** Ready for dev dispatch (findasale-dev)
- **Estimated implementation time:** 3-4 weeks
- **Risk level:** Low (mostly styling; no logic changes)

---

## Next Steps
1. Patrick reviews this spec and provides feedback (colors, hero CTA copy, layout preferences)
2. Main session dispatches to findasale-dev with this spec + any Patrick adjustments
3. Dev provides PR with visual screenshots (not deployed yet)
4. Patrick approves visual changes
5. MCP push to main branch
6. Vercel auto-deploys
7. Next session QA smoke test (homepage load, card clicks, dark mode, mobile at 375px)
