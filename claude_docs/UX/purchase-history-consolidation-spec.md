# Purchase History Consolidation Spec

**Status:** Design Specification (Ready for Patrick Review)
**Date:** 2026-03-31
**Requested by:** Patrick (S[current]) — "they seem like 3 of the same thing"

---

## Executive Summary

FindA.Sale currently has three overlapping pages showing shopper purchase history:
- `/shopper/purchases` — sortable transaction list with coupons
- `/shopper/receipts` — receipt cards with return request tracking
- `/shopper/loot-log` — photo gallery with stats and sharing

**Recommendation:** Consolidate into **ONE primary page** (`/shopper/history`) with **two specialized sub-views** (Gallery / Receipts), plus preserve the **public loot log** as a separate read-only sharing surface.

This reduces cognitive load, eliminates duplicate navigation, and provides a single source of truth for "what I bought, when, and what happened to it."

---

## Jobs to be Done

### Primary Job (All Three Pages Currently Address)
In 2–3 minutes, shopper needs to: **Review a past purchase to answer a specific question.**

| Question | Current Page | Data Needed |
|----------|--------------|-------------|
| "What did I spend on this item?" | Any | Item, price, date |
| "Where's my receipt?" | Receipts | Full receipt with sale date/location |
| "Can I still return this?" | Receipts | Return window, deadline, status |
| "Show me photos of my finds" | Loot Log | Item images, stats, category |
| "What do I have to share with someone?" | Loot Log | Public URL, items, stats |
| "What are my active coupons?" | Purchases | Coupon code, expiry, value |

### Secondary Jobs (Currently Fragmented Across Pages)
- Browse entire history at a glance (Gallery or List)
- Track return request status (Receipts only)
- Share collection with friends (Loot Log only)
- See cumulative stats (Loot Log only)

---

## Current State Analysis

### Page 1: `/shopper/purchases`
**What it does:** Sortable list of transactions (most recent / price high-to-low / price low-to-high)

**Unique content:**
- Sortable interface for price/date
- Active coupons banner at top
- Item title, organizer name, date, amount, status badge (completed / pending)

**API:** `/users/purchases` (sort param: recent | price-high | price-low)

**UX strengths:**
- Quick price comparison
- Coupons surfaced prominently
- Simple, scannable list

**UX weaknesses:**
- No images (vs. Loot Log's photo gallery)
- No return window info (vs. Receipts)
- No stats or context
- Doesn't show sale location/timing

---

### Page 2: `/shopper/receipts`
**What it does:** Two-tab page — Receipts (detailed receipt cards) + Returns (return request status)

**Unique content (Receipts tab):**
- ReceiptCard components showing full receipt details (item, organizer, date, location, amount)
- Return window countdown (48-hour default)
- Sale end date context

**Unique content (Returns tab):**
- Return requests with status (PENDING / APPROVED / DENIED)
- Request reason
- Resolution date (if applicable)
- Amount refunded

**APIs:**
- `/receipts/my-receipts` → full receipt cards
- `/returns/my-returns` → return request list

**UX strengths:**
- Legal/compliance-grade receipt detail
- Return window tracking is clear and actionable
- Two-tab layout separates "completed" from "in-progress"

**UX weaknesses:**
- Separate route from purchases (confusing: why are receipts not on purchases page?)
- No photos, no stats
- Return status tab only shows items WITH returns (empty for shoppers who don't return things)

---

### Page 3: `/shopper/loot-log`
**What it does:** Photo gallery view with collector stats and sharing

**Unique content:**
- Grid gallery (3 columns, item image or placeholder)
- Stats bar: Total Finds, Total Spent, Favorite Category, Sales Attended
- "Share Loot Log" button (copies `/shopper/loot-log/public/[userId]`)
- Load More pagination
- Item detail page at `/shopper/loot-log/[purchaseId]` (shows full item photo + metadata)
- Public profile at `/shopper/loot-log/public/[userId]` (shareable, read-only)

**APIs:**
- `/loot-log` → paginated gallery + stats
- `/loot-log/stats` → aggregated stats
- `/loot-log/[purchaseId]` → single item detail
- `/loot-log/public/[userId]` → public read-only gallery

**UX strengths:**
- Visual, engaging gallery experience
- Stats reinforce "collector" identity (gamification)
- Shareable public URL is unique value prop
- Item detail drilling is natural photo experience

**UX weaknesses:**
- No return window tracking
- No receipt/refund info
- No sorting or filtering (can only paginate forward)
- Redundant with `/shopper/purchases` (same data, different view)

---

### Page 4 (Bonus): `/purchases/[id]`
**What it does:** Persistent purchase confirmation page for auctions/checkouts

**Context:** Shown after user wins an auction or completes checkout. Stays accessible via URL for reference.

**Unique content:**
- Hero confirmation with checkmark / status badge
- Item image, title, winning bid (auctions) or purchase price (shops)
- Pickup instructions, address, dates
- Sale organizer contact
- Status: PAID / PENDING / FAILED / REFUNDED
- Next action button (depends on status)

**API:** `/users/purchases/[purchaseId]`

**UX strengths:**
- Calm, celebratory UX for purchase moment
- Trust-building context (organizer, pickup location, status)
- Actionable next steps clearly labeled

**UX purpose:** Confirmation + reference. Should be separate (it's a "moment" page, not a history page).

---

## Recommended Architecture

### New Structure: 3 Routes

#### Route 1: `/shopper/history` — Primary Purchase History Hub
**Purpose:** Single entry point for all purchase-related questions. Three views: List, Gallery, Receipts.

**Sections:**
1. **Header + Controls**
   - Title: "My Purchase History"
   - View toggle buttons: List | Gallery | Receipts
   - (In List view) Sort selector: Recent / Price High-Low / Price Low-High

2. **Coupons Banner** (appears in all views)
   - Only if shopper has active coupons
   - List them with code, discount, expiry, Copy button
   - Same design as current `/shopper/purchases`

3. **List View** (default)
   - Sortable transaction list
   - Columns: Item, Organizer, Date, Price, Status, Return Window (if applicable), Action
   - Return Window shows countdown IF within return window (red if expiring soon)
   - Action button: "View Receipt" → expands inline receipt details OR "View Item" → links to detail page
   - Empty state: "No purchases yet" + "Browse Sales" link

4. **Gallery View**
   - Same photo grid as current `/shopper/loot-log`
   - Stats bar (Total Finds, Total Spent, Favorite Category, Sales Attended)
   - Load More pagination
   - Clicking item → `/shopper/history/[purchaseId]` detail page (unified)

5. **Receipts View**
   - Receipts tab (all receipts, grouped by recent)
   - Returns tab (return requests in progress or resolved)
   - Same cards + tab logic as current `/shopper/receipts`

6. **Footer**
   - "Share my collection" button (if view is Gallery)
   - Copies `/shopper/loot-log/public/[userId]` URL (preserved route)

**Data preflight:**
| Data | Source | Status |
|------|--------|--------|
| Purchase list, sorting | `/users/purchases` | Exists |
| Coupons | `/coupons` | Exists |
| Receipt details | `/receipts/my-receipts` | Exists |
| Return requests | `/returns/my-returns` | Exists |
| Loot log gallery | `/loot-log` | Exists |
| Loot log stats | `/loot-log/stats` | Exists |
| Return window calc | **NEEDS BACKEND** — Field not currently exposed in API responses. Backend must return `returnWindowExpiresAt` timestamp in purchases/receipts. |

---

#### Route 2: `/shopper/history/[purchaseId]` — Item Detail Page
**Purpose:** Deep dive into one item (photos, full metadata, return status, actions)

**Replaces:** Current `/shopper/loot-log/[purchaseId]` AND `/purchases/[id]` for in-history access.

**Sections:**
1. Breadcrumb: "My Purchase History > [Item Title]"
2. Item image (hero size)
3. Item details: title, category, price, sale name, organizer, date
4. Sale info: location, pickup dates
5. Return info (if applicable):
   - Return window countdown (if active)
   - Return status (PENDING / APPROVED / DENIED)
   - Return button (if within window)
6. Actions: Share item, mark found/unfound (gamification), back to history

**Data preflight:**
| Data | Source | Status |
|------|--------|--------|
| Item details | `/loot-log/[purchaseId]` OR `/users/purchases/[purchaseId]` | Exists |
| Return status | `/returns/my-returns` | Exists (join on purchase) |
| Return window | **NEEDS BACKEND** — See above |

**Note:** This replaces the "confirmation" purpose of `/purchases/[id]`. That page's moment experience moves to a separate flow (see Route 4 below).

---

#### Route 3: `/shopper/loot-log/public/[userId]` — Public Shareable Profile
**Purpose:** Read-only gallery + stats that anyone with the URL can view. **MUST be preserved unchanged.**

**Behavior:**
- Unauthenticated access allowed
- Shows only what the shopper has marked as "public" (if profile privacy setting exists)
- Gallery view + stats bar
- No edit controls, no sensitive data
- Watermark: "Visit [Shopper Name]'s Loot Log on FindA.Sale"
- No return info, no coupons, no receipts

**Data preflight:**
| Data | Source | Status |
|------|--------|--------|
| Public profile | `/loot-log/public/[userId]` | Exists |

**Why separate:** This is an **external sharing surface**, not a history view. It serves a different job (show off my collection to strangers) vs. the primary job (manage my purchases). Keep it isolated.

---

#### Route 4: `/purchases/[id]` — Purchase Confirmation Page (POST-PURCHASE MOMENT)
**Purpose:** One-time celebration + reference after auction win or checkout.

**Status:** Keep this route, but **refocus its UX purpose**. This is the "wow, I won!" page, not the "view my purchase history" page.

**Recommended behavior:**
- Shown immediately after successful payment
- Can revisit via URL (for reference)
- DOES NOT replace detail page in `/shopper/history/[purchaseId]`
- Celebratory tone (hero image, big checkmark, CTA: "View My Receipts" or "Continue Shopping")

**Why keep it separate:** The UX is fundamentally different. A purchase confirmation (moment-based, celebratory, action-oriented) serves a different emotional need than a purchase history page (reference, searching, comparing). Users arriving at `/purchases/[id]` moments after purchase expect celebration. Users arriving at `/shopper/history` minutes or days later expect information retrieval.

If we merge them, the celebration gets buried in a list, and historical references get a confusing "you just won!" tone.

---

## Navigation Changes

### Entry Points to Update

| Component | Current Link | New Link | Notes |
|-----------|--------------|----------|-------|
| `Layout.tsx` (Desktop nav) | `/shopper/purchases` | `/shopper/history` | Replace all 3 instances (desktop, mobile dropdown, hamburger) with single "Purchase History" link |
| `Layout.tsx` (Mobile dropdown) | `/shopper/purchases` | `/shopper/history` | Same |
| `Layout.tsx` (Mobile hamburger) | `/shopper/purchases` | `/shopper/history` | Same |
| `shopper/dashboard.tsx` | Two separate buttons: "Loot Log" + "Receipts" | One button: "My History" linking to `/shopper/history?view=gallery` | Consolidate Quick Links to single entry point. Default to List view; user can switch to Gallery. |
| No change required | N/A | N/A | AvatarDropdown doesn't currently link to any of these pages |

**Dashboard Quick Links after consolidation:**
- Remove "Loot Log" button (📜)
- Remove "Receipts" button (🧾)
- Add "My History" button (with icon TBD — maybe 📋 or 🛍️)
- Link: `/shopper/history` or `/shopper/history?view=gallery` (if Patrick wants gallery to be default)

### Deprecated Routes & Redirects

| Old Route | Action | Redirect To | Reason |
|-----------|--------|-------------|--------|
| `/shopper/purchases` | REDIRECT | `/shopper/history` | Consolidation |
| `/shopper/receipts` | REDIRECT | `/shopper/history?view=receipts` | Consolidation; preserve tab state in URL |
| `/shopper/loot-log` | REDIRECT | `/shopper/history?view=gallery` | Consolidation; preserve view preference |
| `/shopper/loot-log/[purchaseId]` | REDIRECT | `/shopper/history/[purchaseId]` | Consolidation; unified detail page |
| `/purchases/[id]` | KEEP (no change) | — | Separate confirmation flow (see Route 4 rationale) |
| `/shopper/loot-log/public/[userId]` | KEEP (no change) | — | External sharing surface; do not merge |

---

## API Endpoints Analysis

### Endpoints Still Needed
| Endpoint | View(s) Using It | Status | Notes |
|----------|------------------|--------|-------|
| `/users/purchases` | List, sort control | KEEP | Core purchase list |
| `/coupons` | Coupons banner (all views) | KEEP | Active coupons |
| `/receipts/my-receipts` | Receipts tab, List view (inline expand) | KEEP | Receipt details |
| `/returns/my-returns` | Returns tab, List view (return window) | KEEP | Return request tracking |
| `/loot-log` | Gallery view | KEEP | Photo gallery + pagination |
| `/loot-log/stats` | Stats bar (Gallery view) | KEEP | Aggregate stats |
| `/loot-log/[purchaseId]` | Item detail page | KEEP | Single item detail |
| `/loot-log/public/[userId]` | Public profile | KEEP | Shareable gallery |
| `/users/purchases/[purchaseId]` | Item detail page (for metadata) | KEEP | Purchase confirmation page also uses this |

### Endpoints No Longer Called (After Redirects)
**None eliminated — all three pages' APIs remain in use within the consolidated view.**

### New Backend Requirements
**1. Return Window Expiration Timestamp**
   - **Where:** Purchase and Receipt responses
   - **What:** Add `returnWindowExpiresAt` timestamp (or calculate from `purchasedDate + 48 hours`)
   - **Why:** List view and detail page need to show "Return expires in X hours" countdown
   - **Example response:**
   ```json
   {
     "id": "p-123",
     "amount": 49.99,
     "purchasedDate": "2026-03-20",
     "returnWindowExpiresAt": "2026-03-22T14:30:00Z",
     "status": "completed"
   }
   ```
   - **Implementation note:** This can be calculated on the fly (purchasedDate + 48h) or stored in DB.

**2. Return Window Status Flag** (optional optimization)
   - Add `returnWindowActive: boolean` to purchases and receipts
   - Allows frontend to conditionally highlight return-eligible items without date math
   - Simplifies List view rendering

---

## Data Flows

### Scenario 1: Shopper Wants to Know if She Can Still Return an Item
**Current flow (fragmented):**
1. User goes to `/shopper/receipts`
2. Clicks "Receipts" tab
3. Scans ReceiptCard for return window countdown
4. If expired, tries Returns tab (or gives up)

**Consolidated flow:**
1. User goes to `/shopper/history` (default List view, sorted Recent)
2. Scans "Return Window" column
3. If within window, clicks "Return" button in Actions
4. If past window, status shows "Return Expired"

**Benefit:** No tab switching. Return window visible at a glance on the same page.

---

### Scenario 2: Shopper Wants to Show a Friend His Vintage Furniture Collection
**Current flow:**
1. User navigates to `/shopper/loot-log`
2. Clicks "Share Loot Log" button
3. Copies URL
4. Sends to friend
5. Friend opens `/shopper/loot-log/public/[userId]`

**Consolidated flow (no change):**
1. User navigates to `/shopper/history?view=gallery`
2. Clicks "Share my collection" button
3. Copies URL (still `/shopper/loot-log/public/[userId]` — this route never changes)
4. Sends to friend
5. Friend opens same URL

**Benefit:** Share button now available from within the primary history view.

---

### Scenario 3: Shopper Wins an Auction and Completes Checkout
**Current flow:**
1. Stripe returns to `/purchases/[id]`
2. Confirmation page shows (celebration)
3. User clicks "View My Purchases" to see it in history
4. Lands on `/shopper/purchases` (List view)

**Consolidated flow:**
1. Stripe returns to `/purchases/[id]`
2. Confirmation page shows (celebration) — same as before
3. User clicks "View My Purchase History"
4. Lands on `/shopper/history` (List view, default)
5. New purchase visible at top (sorted by Recent)

**Benefit:** `/purchases/[id]` stays focused on celebration. History page unifies all references.

---

## Open Questions for Patrick

Before dev starts, clarify these product decisions:

### Q1: Default View for `/shopper/history`
**Question:** When a shopper lands on `/shopper/history`, should they see:
- (A) **List view** (sortable, text-heavy, return windows visible) — practical default
- (B) **Gallery view** (photos, stats, shareable) — engaging default, more "collection" feel

**Recommendation:** (A) List view. Why? Most landing reasons are practical (check a return window, look up a price, find a coupon). Gallery view is for browsing/showing off, which feels more secondary.

**If you choose (B):** Add a "Sort by" or "View purchases as" toggle to flip between List/Gallery on the same page.

---

### Q2: Return Window Default Visibility
**Question:** Should the return window countdown show in:
- (A) **List view only** (as a column in the table)
- (B) **All views** (in List view AND in Gallery hover overlay)
- (C) **Badge-only** (only if return expires within 24 hours)

**Recommendation:** (A) List view only, as a dedicated column. In Gallery view, it's noise. In detail page, show it prominently.

---

### Q3: Item Detail Page Behavior
**Question:** When a shopper clicks an item in the list or gallery, should the detail page at `/shopper/history/[purchaseId]`:
- (A) **Replace the history page** (standard Next.js routing)
- (B) **Modal overlay** (stay on `/shopper/history`, show detail in a modal)
- (C) **Side panel** (slide-over from the right)

**Recommendation:** (A) Full page. Simpler, fewer moving parts. Mobile-friendly by default. User can back-button to return to list.

---

### Q4: Return Request Inline vs. Tab
**Question:** Should return requests show:
- (A) **In a separate "Returns" tab** (like current Receipts page)
- (B) **Inline in List view** (as a filter: "Show completed purchases" / "Show pending returns")
- (C) **In detail page only** (not in list; only visible when you open an item)

**Recommendation:** (A) Keep the tab. Why? Return requests are rare for most shoppers. Tabbing keeps them discoverable without cluttering the main list.

---

### Q5: Stats Bar Behavior in List View
**Question:** Should the stats bar (Total Finds, Total Spent, etc.):
- (A) **Only appear in Gallery view** (like current Loot Log)
- (B) **Appear in all views** (sticky header or collapsible)
- (C) **Never appear** (stats are secondary; remove to simplify)

**Recommendation:** (A) Gallery view only. In List view, they're visual bloat and don't inform decisions. In Gallery view, they're a visual anchor and reinforce "collector" identity.

---

### Q6: Coupons Placement
**Question:** Should the coupons banner:
- (A) **Appear at the top of all three views** (current behavior, but now in one page)
- (B) **Only appear in List view** (most practical view)
- (C) **Move to a separate "My Deals" page** (out of history entirely)

**Recommendation:** (A) Keep at the top of all views. Coupons are a valuable feature. If a user is already looking at history (close to deciding on another purchase), a reminder about available discounts is helpful.

---

### Q7: Public Loot Log Branding
**Question:** The public loot log page (`/shopper/loot-log/public/[userId]`) is shareable. Should it:
- (A) **Stay at current URL** (external URLs don't break if consolidation happens)
- (B) **Move to `/shopper/history/public/[userId]`** (consistent with new naming)

**Recommendation:** (A) Stay at current URL. This URL may exist in the wild (shared via email, social, etc.). Changing it breaks those links.

---

## Implementation Roadmap

### Phase 1: Backend Prep
1. Add `returnWindowExpiresAt` to `/users/purchases` response
2. Add `returnWindowActive` flag to purchases and receipts (optional optimization)
3. Test API responses with all required fields

### Phase 2: Frontend – `/shopper/history` Page
1. Create new page at `/pages/shopper/history.tsx`
2. Implement view toggle (List / Gallery / Receipts)
3. Implement List view:
   - Fetch `/users/purchases` with sort
   - Render sortable table with return window column
   - Conditionally show "Return Expired" or countdown badge
4. Copy Gallery view logic from current `/shopper/loot-log.tsx`
5. Copy Receipts tab logic from current `/shopper/receipts.tsx`
6. Integrate coupons banner across all views

### Phase 3: Frontend – Detail Page
1. Create `/pages/shopper/history/[purchaseId].tsx`
2. Fetch data from `/loot-log/[purchaseId]` and `/returns/my-returns` (join on purchase)
3. Render item hero, metadata, return status, actions

### Phase 4: Redirects & Cleanup
1. Add 301 redirects: `/shopper/purchases` → `/shopper/history`
2. Add 301 redirects: `/shopper/receipts` → `/shopper/history?view=receipts`
3. Add 301 redirects: `/shopper/loot-log` → `/shopper/history?view=gallery`
4. Add 301 redirects: `/shopper/loot-log/[purchaseId]` → `/shopper/history/[purchaseId]`
5. Update all nav links (Layout, Dashboard, etc.)
6. Remove old pages from codebase (or keep as fallbacks during transition)

### Phase 5: QA & Testing
1. Test all three views (List, Gallery, Receipts)
2. Test sorts (Recent, Price High-Low, Price Low-High)
3. Test return window countdown (mocked dates)
4. Test empty states
5. Test public loot log (still accessible, unchanged)
6. Test deep links to `/shopper/history/[purchaseId]`
7. Test old URL redirects

---

## Summary: What Changes, What Stays

| Element | Current | After Consolidation | Status |
|---------|---------|---------------------|--------|
| Main entry point | 3 routes (`/purchases`, `/receipts`, `/loot-log`) | 1 route (`/shopper/history`) | Changed |
| Views available | Separate pages | Single page, 3 tabs/toggles | Changed |
| Sort/filter options | List only | List only (in new page) | Same functionality |
| Coupons visibility | `/shopper/purchases` top | All views in `/shopper/history` | Enhanced |
| Return tracking | `/shopper/receipts` returns tab | Receipts tab + List view return column | Enhanced |
| Photo gallery | `/shopper/loot-log` | Gallery view in `/shopper/history` | Same |
| Stats display | Loot Log only | Gallery view in history | Same |
| Item detail page | `/shopper/loot-log/[purchaseId]` | `/shopper/history/[purchaseId]` | Unified route |
| Public sharing | `/shopper/loot-log/public/[userId]` | `/shopper/loot-log/public/[userId]` (unchanged) | Same |
| Purchase confirmation | `/purchases/[id]` | `/purchases/[id]` (unchanged) | Same |
| Navigation links | 3 separate destinations | 1 destination | Simplified |

---

## Wireframe Notes

### `/shopper/history` — List View
```
┌─────────────────────────────────────────┐
│ My Purchase History                     │
│ [List] [Gallery] [Receipts]            │
├─────────────────────────────────────────┤
│ 🎟️ My Coupons                          │
│ [CODE123 $5 off · Expires 4/15] [Copy] │
├─────────────────────────────────────────┤
│ 5 items purchased  [Sort: Recent ▼]    │
├─────────────────────────────────────────┤
│ Item         | Organizer | Date  | ... │
├─────────────────────────────────────────┤
│ Lamp         | Estate Co | 3/20  | ... │
│ Return expires in 12 hours               │
├─────────────────────────────────────────┤
│ Sofa         | Yard Sale | 3/15  | ... │
│ Return expired                          │
├─────────────────────────────────────────┤
```

### `/shopper/history` — Gallery View
```
┌─────────────────────────────────────────┐
│ My Purchase History                     │
│ [List] [Gallery] [Receipts]            │
├─────────────────────────────────────────┤
│ 🎟️ My Coupons (if any)                 │
├─────────────────────────────────────────┤
│ [🎯 5 Finds] [💰 $123.45] [⭐ Category] [🏪 3 Sales] │
├─────────────────────────────────────────┤
│ [IMG] [IMG] [IMG]                       │
│ Lamp  Sofa  Vase                        │
├─────────────────────────────────────────┤
│            [Load More]                  │
│     [Share my collection]               │
└─────────────────────────────────────────┘
```

### `/shopper/history/[purchaseId]` — Detail Page
```
┌─────────────────────────────────────────┐
│ < My Purchase History / Lamp           │
├─────────────────────────────────────────┤
│              [LARGE ITEM IMAGE]         │
├─────────────────────────────────────────┤
│ Ceramic Lamp                            │
│ Estate Sale | $49.99 | 3/20/2026       │
├─────────────────────────────────────────┤
│ Pickup: 123 Main St, GR, MI 49503      │
│ Saturday – Sunday, March 21-22          │
├─────────────────────────────────────────┤
│ Can return until: Saturday (12 hours)  │
│              [Request Return]           │
├─────────────────────────────────────────┤
│ [Share] [Save to Collection] [More]    │
└─────────────────────────────────────────┘
```

---

## Acceptance Criteria

For dev to mark this spec **Done**:

1. ✅ `/shopper/history` page loads with List view as default
2. ✅ View toggle (List / Gallery / Receipts) works and persists in URL (`?view=gallery`)
3. ✅ List view shows all purchases, sortable by Recent / Price High-Low / Price Low-High
4. ✅ Return window countdown shows correctly in List view (and in detail page)
5. ✅ Coupons banner appears at top of all three views (if coupons exist)
6. ✅ Gallery view displays photo grid + stats bar (no return windows)
7. ✅ Receipts view shows two tabs (Receipts + Returns) with proper data
8. ✅ Item detail page at `/shopper/history/[purchaseId]` displays full item + return status
9. ✅ All old routes redirect correctly:
   - `/shopper/purchases` → `/shopper/history`
   - `/shopper/receipts` → `/shopper/history?view=receipts`
   - `/shopper/loot-log` → `/shopper/history?view=gallery`
   - `/shopper/loot-log/[purchaseId]` → `/shopper/history/[purchaseId]`
10. ✅ Navigation links updated (Layout, Dashboard)
11. ✅ Public loot log (`/shopper/loot-log/public/[userId]`) still works unchanged
12. ✅ Purchase confirmation page (`/purchases/[id]`) still works unchanged
13. ✅ Mobile responsive (tested on phone viewport)
14. ✅ Dark mode works across all views
15. ✅ Empty states shown when appropriate (no purchases, no coupons, no returns)

---

**Spec prepared by:** FindA.Sale UX Agent
**Next step:** Patrick review + approval of open questions, then dispatch to findasale-dev for implementation
