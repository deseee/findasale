# Dashboard Makeover + Settlement Hub — UX Spec (S367)

**Date:** 2026-04-01
**Scope:** Organizer dashboard redesign + post-sale settlement workflows
**Target Role:** Sale organizers (estate, auction, flea market, yard sale, consignment)
**Status:** UX Design Complete — Ready for Dev

---

## 1. COMPONENT MAP — Current State

Inventory of all components and widgets currently on `/organizer/dashboard.tsx` as of S366.

| Component | Current Behavior | Status | Action | New Location / Notes |
|-----------|-----------------|--------|--------|----------------------|
| Header (Welcome greeting) | Dynamic greeting per dashboard state | ✅ Works | Keep | Top of page, state-aware greeting |
| Tier Lapse Banner | Red alert if subscription lapsed | ✅ Works | Keep | Top, after header, dismissible |
| Onboarding Modal | 3-screen intro for new organizers | ✅ Works | Keep | Modal overlay on State 1 only |
| Onboarding Wizard | Step-by-step sale setup guide | ✅ Works | Keep | Modal overlay if `onboardingComplete === false` |
| Sale Status Widget | Shows active sale title, status badge, photo, urgency tag, CTAs | ✅ Works | Keep + enhance | State 2 only, top priority, ADD quick-action buttons |
| Selling Tools Grid (6 items) | Create Sale, Add Items, QR Codes, POS, Print Inventory, Analytics | ✅ Works | Keep | Mobile: 2 cols, Desktop: 3 cols |
| Sale List / Archive | Compact list of up to 5 sales with quick actions | ✅ Works | Keep | State 2 + State 3, collapsible, "View all" link to `/organizer/sales` |
| Tier Progress Badge | "Bronze Organizer", progress toward next tier | ✅ Works | Keep | Right side of header or sidebar (desktop) / below header (mobile) |
| Analytics Card | Link to `/organizer/ripples` or `/organizer/insights` | ✅ Works | Keep | Part of Selling Tools or dedicated card |
| OrganizerHoldsPanel | Summary badge + link to holds page | ✅ Works | Keep | State 2 only, below Sale Status Widget |
| SimpleModePanel | Simplified dashboard view toggle | ✅ Works | Keep | Available as opt-in, not default |
| Social Post Generator | Modal for drafting social posts | ✅ Works | Keep | Triggered from sale quick-actions |
| Flash Deal Form | Quick discount/flash sale creation | ✅ Works | Keep | Secondary action from sale status widget |
| Sale QR Code Modal | Display/share QR for current sale | ✅ Works | Keep | Triggered from selling tools grid |

**Accounts for all current elements.** No removal. All existing components remain functional.

---

## 2. ADAPTIVE DASHBOARD LAYOUT

The dashboard adapts its widget layout and copy based on **sale state** (0 sales, active, ended) and **sale type** (estate, yard, auction, flea market, consignment).

### 2.1 — STATE 1: New Organizer (0 Sales Ever)

#### Copy Variant (Same for all sale types)

```
Greeting: "Welcome to FindA.Sale Organizer"
Subheading: "Let's set up your first sale in 5 minutes"
```

#### Layout (Mobile + Desktop)

**Mobile (< 768px):**
- Hero card (full width, gradient bg, 3-step path graphic, CTA button)
- 3 benefits cards (stacked 1 col)
- Quick links grid (3 items, 1 col)

**Desktop (≥ 768px):**
- Hero card (full width)
- 3 benefits cards (3 col grid)
- Quick links grid (3 items, 3 col)

#### Widgets Shown
- Onboarding Modal (once, dismissible)
- Hero Card
- Benefits Grid (3 benefits)
- Quick Links (Create Sale, Browse Inspiration, See Pricing)

#### Empty State
None — new organizers get the full hero experience.

#### Primary CTA
"Create Your First Sale" (button in hero card)

#### Secondary CTAs
- "Watch a quick tour" (link, under CTA)
- 3 quick-link cards below benefits

---

### 2.2 — STATE 2: Active Organizer (DRAFT or PUBLISHED Sale)

Dashboard shows the **active sale at the top with context-aware CTAs**, followed by selling tools and stats.

#### Copy Variants by Sale Type

**Estate Sales:**
- Greeting: "Welcome back — estate sale in motion"
- Sale Status: "Estate Sale" badge
- Primary action: "Manage items" (if PUBLISHED) or "Add photos" (if DRAFT)

**Yard Sales:**
- Greeting: "Welcome back — yard sale live"
- Sale Status: "Yard Sale" badge
- Primary action: "Manage items" (if PUBLISHED) or "Add photos" (if DRAFT)

**Auction:**
- Greeting: "Welcome back — auction running"
- Sale Status: "Auction" badge
- Primary action: "Manage bids" (future: live auction controls) or "Add items" (if DRAFT)

**Flea Market:**
- Greeting: "Welcome back — flea market live"
- Sale Status: "Flea Market" badge
- Primary action: "Manage inventory" or "Add items"

**Consignment:**
- Greeting: "Welcome back — consignment sale active"
- Sale Status: "Consignment" badge
- Primary action: "Manage items" (if PUBLISHED) or "Add items" (if DRAFT)

#### Layout (Mobile + Desktop)

**Mobile (< 768px):**
1. Header + Tier Badge (stacked)
2. Tier Lapse Banner (if applicable)
3. Sale Status Widget (full width, photo + title + status + urgency tag + quick actions)
4. Selling Tools Grid (2 cols)
5. **NEW: Sale Pulse Widget** (engagement metrics)
6. **NEW: High-Value Item Tracker** (if flagged items exist)
7. **NEW: Smart Buyer Intelligence** (upcoming shopper count + top profiles)
8. **NEW: Organizer Efficiency Coaching** (benchmark card)
9. OrganizerHoldsPanel (summary + link)
10. Recent Sales List (up to 3, "View all" link)

**Desktop (≥ 768px):**
1. Header + Tier Badge (side-by-side)
2. Tier Lapse Banner (if applicable)
3. Sale Status Widget (photo + details + quick actions, full width)
4. 2-column layout:
   - Left: Selling Tools Grid (2 cols), Sale Pulse (below), High-Value Tracker (below)
   - Right: Organizer Efficiency Coaching, Smart Buyer Intelligence, OrganizerHoldsPanel (all stacked)
5. Recent Sales List (full width, up to 5, "View all" link)

#### Widgets Shown

**Always (State 2):**
- Sale Status Widget (HIGHEST PRIORITY — top of page)
- Selling Tools Grid (6 items)
- OrganizerHoldsPanel
- Recent Sales List (up to 5)
- Tier Badge

**Conditional:**
- Tier Lapse Banner (if `subscriptionLapsed === true`)
- **Sale Pulse** (appears if sale is PUBLISHED only)
- **High-Value Item Tracker** (appears if flagged items count > 0)
- **Smart Buyer Intelligence** (appears if sale is PUBLISHED only)
- **Organizer Efficiency Coaching** (appears for organizers with 2+ completed sales)
- **Weather Strip** (appears if sale date is within 10 days, positioned near sale title)

#### Empty States

**No flagged items:** High-Value Item Tracker hidden entirely.
**No organizer history:** Efficiency Coaching hidden until 2+ sales completed.
**New shopper list not available:** "Loading attendees..." placeholder in Smart Buyer Intelligence.

#### Primary CTA

**If DRAFT sale with 0 items:** "Add Photos"
**If DRAFT sale with items:** "Publish Sale"
**If PUBLISHED sale:** "Manage Items"

Also: "Close Sale Early" (secondary, red button, visible only if PUBLISHED)

#### Secondary CTAs

- Manage Holds (link to `/organizer/holds`)
- View Live Sale (link to shopper-facing sale page)
- Add Items (link to `/organizer/add-items/[saleId]`)
- POS Checkout (link to `/organizer/pos`)
- QR Codes (link to `/organizer/qr`)
- Analytics (link to `/organizer/ripples`)

---

### 2.3 — STATE 3: Between Sales (All Sales ENDED)

Dashboard shows **congratulations message**, past sales archive, and prompt to start next sale.

#### Copy Variant (Same for all sale types)

```
Greeting: "Great job! Your sale has ended."
Subheading: "Ready for the next one? Here's your summary."
```

#### Layout (Mobile + Desktop)

**Mobile (< 768px):**
1. Header
2. Tier Lapse Banner (if applicable)
3. **NEW: Post-Sale Momentum Card** (summary stats + "Start next sale" button with pre-fill)
4. Selling Tools Grid (2 cols)
5. **NEW: Charity Close Card** (estate/consignment only, "Donate unsold items" action)
6. Recent Sales Archive (up to 5, "View all" link)

**Desktop (≥ 768px):**
1. Header
2. Tier Lapse Banner (if applicable)
3. **Post-Sale Momentum Card** (full width, stats + pre-fill form button)
4. 2-column layout:
   - Left: Selling Tools Grid (2 cols)
   - Right: **Charity Close Card** (if applicable)
5. Recent Sales Archive (full width, up to 5, "View all" link)

#### Widgets Shown

**Always (State 3):**
- Post-Sale Momentum Card (summary of last sale + "Start next sale" button)
- Selling Tools Grid
- Recent Sales Archive (up to 5)

**Conditional:**
- Tier Lapse Banner (if applicable)
- **Charity Close Card** (estate and consignment sales only)

#### Empty State

No empty state — organizers always have completed sales to show after State 3 is entered.

#### Primary CTA

"Start Next Sale" (button in Post-Sale Momentum card, pre-fills form from previous sale)

#### Secondary CTAs

- "Donate Unsold Items" (Charity Close card, estate/consignment only)
- All selling tools

---

## 3. NEW WIDGETS — Detailed Specifications

### 3.1 — Sale Pulse (Engagement Score)

**Job to be Done:**
Organizer at their sale (or checking their phone mid-sale) needs to know if the sale is getting attention, so they can decide whether to promote further or are confident the momentum is good.

**When it appears:** State 2, PUBLISHED sales only
**Data source:** `/api/organizers/stats` + new endpoint for real-time metrics
**Appearance on page:** State 2, desktop: right column below Efficiency Coaching; mobile: after Selling Tools Grid

#### Card Layout

**Mobile:**
```
┌─────────────────────────────┐
│ Sale Pulse                  │
│ 🔥 Buzz Score: 7.2/10      │
│                             │
│ • 348 page views           │
│ • 42 item saves            │
│ • 3 shopper questions      │
│                             │
│ [Boost visibility →]        │
└─────────────────────────────┘
```

**Desktop:** Same card, slightly wider, aligned right column.

#### Data Fields

| Field | Source | Status |
|-------|--------|--------|
| Buzz Score (0–10) | Calculated: (pageViews / 100) + (itemSaves × 0.5) + (questions × 0.3), capped at 10 | NEEDS BACKEND |
| Page Views | `/api/organizers/stats` → `activeSale.viewCount` | Exists |
| Item Saves | `/api/organizers/stats` → New field `activeSale.saveCount` | NEEDS BACKEND |
| Shopper Questions | New backend field tracking questions/comments on active sale | NEEDS BACKEND |

#### States

**Loading:** "Loading engagement metrics..."
**Empty:** Hidden if sale is less than 1 hour old (insufficient data). Shows text: "Check back after your sale gets traffic."
**Error:** "Couldn't load metrics. Try refreshing."

#### Actions

- "Boost visibility" → Links to sharing/promotion tools (Facebook, email, QR share from `/organizer/qr`)
- Tap/click card itself → Links to detailed `/organizer/insights` page

#### Copy

- **Buzz Score:** Plain language interpretation: ≤3 = "Your sale is quiet", 4–6 = "Good momentum", 7–10 = "Hot sale! 🔥"
- No jargon. "Page views" not "impressions."

#### Mobile Considerations

- Card is full width, stacks below Selling Tools
- Action button is large enough for thumb (48px+ height)
- Number formatting: 1,234 not 1234

---

### 3.2 — Organizer Efficiency Coaching

**Job to be Done:**
Organizer who has run multiple sales wants to know how fast they're moving compared to others (photo-to-publish time, sell-through %), so they know if they're getting faster or need to optimize their process.

**When it appears:** State 2 only, requires 2+ completed sales
**Data source:** New endpoint `/api/organizers/me/benchmark`
**Appearance on page:** State 2, desktop: right column; mobile: between Sale Pulse and Buyer Intelligence

#### Card Layout

**Mobile:**
```
┌─────────────────────────────┐
│ Organizer Insights          │
│ You're in the top 30%       │
│                             │
│ Photo → Published: 4.2 hrs  │
│ Avg for your type: 6.1 hrs  │
│ ✓ You're 1.9 hrs faster!    │
│                             │
│ Sell-through: 82%           │
│ Avg: 76%                    │
│ ✓ 6% above average!         │
│                             │
│ [Tips to improve →]         │
└─────────────────────────────┘
```

#### Data Fields

| Field | Source | Status |
|-------|--------|--------|
| Percentile Rank | New backend calc: `organizer's avg vs. all organizers of same sale type` | NEEDS BACKEND |
| Avg Photo-to-Publish Time | Track item creation date vs. publish date | NEEDS BACKEND |
| Category Avg Time | Pre-calculated per sale type | NEEDS BACKEND |
| Sell-Through % | Items sold / total items in completed sales | Needs API endpoint |
| Category Avg Sell-Through | Pre-calculated per sale type | NEEDS BACKEND |

#### States

**Loading:** "Analyzing your efficiency..."
**Insufficient Data:** Hidden until organizer has 2+ completed sales.
**Error:** "Couldn't load your benchmark. Check back later."

#### Actions

- "Tips to improve" → Modal with 3–5 quick tips (e.g., "Use AI tags to describe items faster", "Add 3+ photos per item for higher sell-through")
- Card itself is informational; no direct action

#### Copy

- Use **positive framing** only. Never "You're slower than average." Always "You're in the top 30%!" or "You're 6% above average."
- Avoid jargon. "Photo to publication" not "TTL" or "ingestion time."
- If organizer is in top tier, celebrate: "You're a top 5% efficiency champion!"

#### Mobile Considerations

- Full width, stacks naturally
- Icons (✓, >) are simple and accessible

---

### 3.3 — Post-Sale Momentum (State 3 only)

**Job to be Done:**
Organizer just ended a sale and is standing in their living room looking at the leftover items. They need a quick summary of "how did this sale do?" and a frictionless way to start their next sale, possibly with items from this one.

**When it appears:** State 3 only, immediately after a sale ends (within 48 hours)
**Data source:** `/api/organizers/stats` (previous sale summary)
**Appearance on page:** State 3, top card, full width, above Selling Tools

#### Card Layout

**Mobile:**
```
┌─────────────────────────────┐
│ 🎉 Great Sale!             │
│                             │
│ Items Sold: 48 / 60        │
│ Total Revenue: $2,840      │
│ Your Earnings: $2,556      │
│ Unsold Items: 12           │
│                             │
│ [Start Next Sale →]         │
│ [Donate Unsold (Est) →]     │
└─────────────────────────────┘
```

**Desktop:** Same card, full width, positioned at top.

#### Data Fields

| Field | Source | Status |
|-------|--------|--------|
| Items Sold | Completed sale item count | Exists (statsData) |
| Total Revenue | Stripe settlement total | Exists (analyticsData) |
| Organizer Earnings | Total Revenue - Fees | Needs calculation |
| Unsold Count | Items with status !== SOLD | Exists |
| Sale Title | Previous sale record | Exists |

#### States

**Loading:** "Summarizing your sale..."
**Error:** "Couldn't load summary. Try refreshing."

#### Actions

**Primary:** "Start Next Sale" → Pre-fills form with:
  - Sale type (same as previous)
  - Title (auto-suggested based on location + type, editable)
  - Date/time defaults (user edits)
  - Option to re-list unsold items from previous sale (checkbox in form, checked by default)

**Secondary (Estate/Consignment only):** "Donate Unsold Items" → Triggers Charity Close flow

#### Copy

- Celebratory tone. "Great Sale!" not "Sale Ended."
- Plain numbers. No jargon.
- "Start Next Sale" not "Create New Sale" — emphasizes continuity

#### Mobile Considerations

- Full width, stacked vertically
- Buttons are large (48px+ height)
- Pre-fill form opens as modal or in-page form (mobile: modal, desktop: in-page)

---

### 3.4 — Smart Buyer Intelligence

**Job to be Done:**
Organizer running a live/upcoming sale wants to know who's coming, so they can prepare for shopper behavior (e.g., if a lot of high-value hunters are registered, they know to have more staff or premium items ready).

**When it appears:** State 2, PUBLISHED sales only, only if shopper list is available
**Data source:** New endpoint `/api/sales/[saleId]/incoming-shoppers`
**Appearance on page:** State 2, desktop: right column below Buyer Intelligence; mobile: after High-Value Item Tracker

#### Card Layout

**Mobile:**
```
┌─────────────────────────────┐
│ Who's Coming                │
│ 284 shoppers registered     │
│                             │
│ 🏆 Hunters: 47              │
│ 🔍 Explorers: 156           │
│ 👀 Browsers: 81             │
│                             │
│ 👤 Sarah M. (Hunter)        │
│ 👤 Mike D. (Explorer)       │
│ 👤 Lisa K. (Hunter)         │
│                             │
│ [See all attendees →]       │
└─────────────────────────────┘
```

**Desktop:** Same card, slightly wider.

#### Data Fields

| Field | Source | Status |
|-------|--------|--------|
| Total Registered Shoppers | `/api/sales/[saleId]/incoming-shoppers` → count | NEEDS BACKEND |
| Shopper Tier Distribution | Group by `xpTier` (Hunter, Explorer, Browser) | NEEDS BACKEND |
| Top Shoppers (3–5) | Sorted by visit frequency, XP, or engagement | NEEDS BACKEND |
| Avatar + Tier Badge | User avatar, tier icon/color | Exists (user model) |

#### States

**Loading:** "Finding attendees..."
**Empty/No Data:** "No registered shoppers yet. Share the link to fill it up!"
**Error:** "Couldn't load attendees. Try refreshing."

#### Actions

- "See all attendees" → Links to `/organizer/sale/[saleId]/attendees` (new page showing full list with filters by tier)

#### Copy

- Friendly, not intimidating. "Who's Coming" not "Buyer Demographics."
- Tier names are relatable (Hunter, Explorer) not "Tier 3" or "Gold."

#### Mobile Considerations

- Card is full width
- Avatar images sized for fast loading (~40px)
- Tier badges are color-coded, not text-only

---

### 3.5 — High-Value Item Tracker

**Job to be Done:**
Organizer flagged certain items as "premium" or "high-value" and wants a quick reference of which items need extra attention (watching for reserves, damage, VIP holds).

**When it appears:** State 2, PUBLISHED sales only, only if flagged items exist
**Data source:** `/api/sales/[saleId]/items?flagged=true`
**Appearance on page:** State 2, desktop: left column below Selling Tools; mobile: after Selling Tools Grid

#### Card Layout

**Mobile:**
```
┌─────────────────────────────┐
│ Premium Items (3)           │
│                             │
│ 📷 Victorian Desk           │
│    $450 | Hold: Sarah M.    │
│    [Mark sold] [Remove]     │
│                             │
│ 📷 Tiffany Lamp             │
│    $180 | Available         │
│    [Mark reserved] [Remove] │
│                             │
│ 📷 Gold Necklace Set        │
│    $220 | Sold              │
│    [Mark sold] [Remove]     │
└─────────────────────────────┘
```

**Desktop:** Similar card, slightly wider.

#### Data Fields

| Field | Source | Status |
|-------|--------|--------|
| Item Photo | Thumbnail (first photo from item) | Exists |
| Item Name | Item.title | Exists |
| Flagged Price | Item.salePrice or estimatedValue | Exists |
| Current Hold Status | Reservation linked to item | Exists |
| Item Status | AVAILABLE, RESERVED, SOLD | Exists |

#### States

**Loading:** "Loading premium items..."
**Empty:** Card hidden entirely (no flagged items = widget disappears).
**Error:** "Couldn't load premium items. Try refreshing."

#### Actions

- "Mark sold" → Inline status update, refreshes card
- "Mark reserved" → Opens small modal for hold duration (optional)
- "Remove flag" → Removes `isFlagged` status, item stays in sale, moves out of this widget
- **Item photo + name:** Tap to jump to item detail page (edit item)

#### Copy

- "Premium Items" or "High-Value Items" (if organizer flagged them that way)
- Status text is clear: "On hold until 3pm", "Sold", "Available"

#### Mobile Considerations

- Full width card
- Photo thumbnail is square (~60px)
- Action buttons are inline with enough tap space (40px minimum)
- Swipe-to-delete (optional UX enhancement, not required)

---

### 3.6 — Weather Strip

**Job to be Done:**
Organizer running an outdoor or semi-outdoor sale (yard sale, flea market, estate sale in driveway) needs a quick glance at the weather forecast for sale day, so they know if they need to adjust setup (tent, tarps, umbrellas).

**When it appears:** State 2, PUBLISHED sales only, sale date within 10 days
**Data source:** New endpoint `/api/weather/forecast?zipcode=[from sale.zipcode]&date=[sale.startDate]`
**Appearance on page:** State 2, positioned near sale title (above or inline with status badge)

#### Layout

**Mobile + Desktop:**
```
┌────────────────────────────────────────────────────┐
│ 🌤️ Partly cloudy, 68°F | 20% chance rain         │
└────────────────────────────────────────────────────┘
```

Thin horizontal strip, no padding, minimal visual weight.

#### Data Fields

| Field | Source | Status |
|-------|--------|--------|
| Condition (text) | Weather API (OpenWeather, WeatherAPI) | NEEDS BACKEND |
| Temp (high/low) | Weather API | NEEDS BACKEND |
| Precip Probability | Weather API | NEEDS BACKEND |

#### States

**Loading:** Hidden until data loaded (takes <500ms)
**Error:** Hidden (non-critical information, no error state shown)
**Outside 10-day window:** Hidden

#### Actions

None. Informational only.

#### Copy

- Simple, conversational. "Partly cloudy, 68°F | 20% chance rain" not "Partly cloudy, high 68, precip 0.2."
- If rain likely (>30%), icon changes to 🌧️ and text becomes red/warning color

#### Mobile Considerations

- Strip is full width
- No interaction needed
- Fits above mobile viewport without scrolling on sale status widget

---

### 3.7 — Charity Close (Post-Sale, Estate/Consignment Only)

**Job to be Done:**
After an estate sale or consignment event, organizer has leftover items and wants to donate them to a local charity for a tax receipt, so they don't have to haul items away themselves.

**When it appears:** State 3, ENDED sales, sale type = ESTATE or CONSIGNMENT only
**Data source:** `/api/sales/[saleId]/items?status=UNSOLD`
**Appearance on page:** State 3, desktop: right column next to Post-Sale Momentum; mobile: after Post-Sale Momentum card

#### Card Layout

**Mobile:**
```
┌─────────────────────────────┐
│ Donate Unsold Items         │
│                             │
│ 12 items ready to donate    │
│                             │
│ [Donate Unsold →]           │
│ Select charity, generate    │
│ receipt for taxes           │
└─────────────────────────────┘
```

**Desktop:** Same card.

#### Data Fields

| Field | Source | Status |
|-------|--------|--------|
| Unsold Item Count | `/api/sales/[saleId]/items?status=UNSOLD` → count | Exists |
| Item List (for flow) | Full unsold item records | Exists |

#### States

**Loading:** "Counting unsold items..."
**Empty:** Card hidden (no unsold items)
**Error:** "Couldn't load unsold items. Try refreshing."

#### Actions

**Primary:** "Donate Unsold Items" → Triggers **Charity Close flow** (see §4.3)

#### Copy

- Benefit-focused. "Generate receipt for taxes" not just "Donate."
- Friendly tone. "Donate Unsold Items" not "Dispose of Excess Inventory."

#### Mobile Considerations

- Full width card, stacks naturally

---

## 4. SETTLEMENT HUB FLOW — Complete UX

The Settlement Hub is a guided wizard for closing out a sale financially. It **varies significantly by sale type**.

### 4.1 — Settlement Hub: Estate / Consignment / Auction

**Job to be Done:**
Organizer conducted a sale, now needs to calculate final payouts (their cut vs. consignor/client cut), track expenses, and either send Stripe payouts to clients or record manual payments, so the sale is fully reconciled and documented.

**Entry points:**
1. "Mark settlement complete" button in Post-Sale Momentum card (State 3)
2. `/organizer/settlement/[saleId]` (direct URL, accessible from edit-sale page post-sale)

**Expected completion time:** 5–10 minutes for typical sale (50 items, 5–10 expenses)

#### Step 1: Summary Review

**Page title:** "Settlement Preview"
**Job:** Organizer scans the numbers (total gross, items, unsold) before entering expense details.

**Mobile layout:**
```
┌─────────────────────────────┐
│ Settlement: Antique Estate  │
│ May 3, 2026                 │
│                             │
│ Items Sold: 48 / 60        │
│ Gross Sales: $3,240        │
│ Unsold Items: 12           │
│                             │
│ [Start Settlement →]        │
│                             │
│ (Can skip to final review)  │
└─────────────────────────────┘
```

**Desktop:** Slightly wider card, same content.

**Data Fields:**

| Field | Source | Status |
|-------|--------|--------|
| Sale title | Completed sale record | Exists |
| Sale date | Completed sale record | Exists |
| Items sold count | Item count with status = SOLD | Exists |
| Total items | Sum of all items in completed sale | Exists |
| Gross sales total | Sum of item prices for SOLD items | Exists (analyticsData) |
| Unsold count | Items with status !== SOLD | Exists |

**Actions:**
- "Start Settlement" → Proceed to Step 2
- "Review later" → Save progress, return to dashboard

**Copy:**
- Plain numbers, no jargon
- Sale title auto-populated from completed sale
- Encouragement: "You're almost done. Let's close this out."

---

#### Step 2: Expense Entry

**Page title:** "Record Expenses"
**Job:** Organizer enters all expenses (hauling, ads, staff, venue, supplies, other) so net profit can be calculated.

**Mobile layout:**
```
┌─────────────────────────────┐
│ Record Expenses             │
│                             │
│ Gross Sales: $3,240        │
│ Expenses: $450             │
│ (Running total visible)    │
│                             │
│ Category          Amount    │
│ ─────────────────────────── │
│ ✓ Hauling         $150     │
│ ✓ Advertising     $200     │
│ ✓ Staff           $100     │
│ ✓ Supplies        $0       │
│ ✓ Venue           $0       │
│ ✓ Other           $0       │
│                             │
│ [Edit] [X] Hauling         │
│                             │
│ [+ Add Custom]              │
│ [Continue →]                │
└─────────────────────────────┘
```

**Desktop:** Two columns (left: category list, right: running total + detail form).

**Data Fields:**

| Field | Source | Status |
|-------|--------|--------|
| Expense categories | Pre-defined: Hauling, Advertising, Staff, Supplies, Venue, Other | Frontend |
| Amount per category | Form input, validated > 0 | Frontend |
| Total expenses | Sum of all category amounts | Frontend |
| Running net | Gross - Expenses | Frontend calc |

**States:**
- **Initial:** No expenses entered, all categories show $0
- **Partial:** Some categories have amounts, running total updates live
- **Complete:** All categories filled (user confirms ready to proceed)

**Actions:**
- Tap category row → Edit mode (text input, keyboard visible)
- Confirm amount (tap outside field or press Enter) → Saves, recalculates total
- "[Edit]" link next to expense → Edit existing entry
- "[X]" button next to expense → Remove category (category resets to $0, not deleted)
- "[+ Add Custom]" → Add user-named expense category (if organizer has unusual costs)
- "[Continue]" → Proceed to Step 3

**Copy:**
- Category labels are plain: "Hauling" not "Logistics", "Staff" not "Labor"
- Help text above form: "Enter what you spent to run this sale. Be as accurate as you can — these numbers help with taxes."
- No requirement to fill all categories (can leave $0 for unused ones)

**Mobile Considerations:**
- Vertical stack of category rows, each tappable
- Amount field is wide enough for 3–4 digits (right-aligned)
- Keyboard appears on tap, dismisses after confirmation
- Running total is always visible at top (sticky on mobile)

---

#### Step 3: Commission Calculation

**Page title:** "Commission Breakdown"
**Job:** Organizer sees the commission rate, decides if they want to adjust it (if applicable for their business model), and sees the net-to-client calculation.

**Note:** This step varies by **sale type** and **commission model**:
- **Estate sales:** Typically 10% flat (FindA.Sale fee) + optional additional commission for organizer to consignor
- **Consignment:** Organizer keeps percentage of sales (e.g., 70% to consignor, 30% to organizer), or flat fee
- **Auction:** Hammer price + buyer's premium (varies by house)
- **Yard/Flea:** Flat fee or no fee depending on setup

For this spec, we assume **Estate + Consignment = Commission-based**, **Auction = Custom fee**, **Yard/Flea = Simplified** (§4.2).

**Mobile layout:**
```
┌─────────────────────────────┐
│ Commission Breakdown        │
│                             │
│ Gross Sales:  $3,240       │
│ - Expenses:     $450       │
│ = Subtotal:   $2,790       │
│                             │
│ - FindA.Sale Fee (10%):$274 │
│ - Consignor Comm (20%): $548│
│                             │
│ = Your Earnings: $1,968    │
│ = Client/Consignor: $548   │
│                             │
│ Commission %: [  20  ]%    │
│ (Edit inline if needed)    │
│                             │
│ [Continue →]               │
└─────────────────────────────┘
```

**Desktop:** Same card, slightly wider, maybe with a visual breakdown (simple stacked bar).

**Data Fields:**

| Field | Source | Status |
|-------|--------|--------|
| Gross sales | From Step 1 | Carried forward |
| Total expenses | From Step 2 | Carried forward |
| Subtotal | Gross - Expenses | Frontend calc |
| FindA.Sale fee % | From STACK.md: 10% flat | Hardcoded |
| FindA.Sale fee amount | Subtotal × 10% | Frontend calc |
| Commission rate % (editable) | Default: 10% for estate, 20% for consignment | Editable per sale type |
| Commission amount | Subtotal × Commission % | Frontend calc |
| Organizer earnings | Subtotal - FindA Fee - Commission | Frontend calc |
| Client/Consignor earnings | Commission amount | Frontend calc |

**States:**
- **Initial:** Shows default commission rate for sale type
- **Editing:** Commission % field is editable (tap to edit, shows text input)
- **Recalculating:** If user changes commission %, all downstream numbers update live

**Actions:**
- Tap commission % field → Edit mode (text input 0–99)
- Confirm % (tap outside or Enter) → Recalculate all numbers
- "[Continue]" → Proceed to Step 4

**Copy:**
- Label clarity: "FindA.Sale Fee (10%)" not "Platform Fee"
- "Your Earnings" and "Client Earnings" are explicit (for estate) or "Consignor Earnings" (for consignment)
- Below breakdown: "Adjust commission % if your agreement with the client differs."

**Mobile Considerations:**
- Numeric field is right-aligned, large font
- All currency values are right-aligned for easy scanning
- Visual hierarchy: Biggest emphasis on "Your Earnings" (larger font, highlighted color)

---

#### Step 4: Client Payout

**Page title:** "Pay the Client"
**Job:** Organizer decides who gets paid (client/consignor name + relationship), how much, and via which method (Stripe payout or manual payment), so the settlement is recorded.

**Mobile layout:**
```
┌─────────────────────────────┐
│ Client Payout               │
│                             │
│ Client Name: [Select...]   │
│ (linked to this sale, or   │
│  type custom name)         │
│                             │
│ Payout Amount: $548        │
│ (auto-filled from Step 3)  │
│                             │
│ Payment Method:             │
│ ( ) Stripe (instant)       │
│     (connect account req'd)│
│ (o) Record as Manual       │
│     (check box when paid)  │
│                             │
│ Note (optional):           │
│ [_____________________]    │
│                             │
│ [Continue →]               │
└─────────────────────────────┘
```

**Desktop:** Similar form, slightly wider.

**Data Fields:**

| Field | Source | Status |
|-------|--------|--------|
| Client name | Pre-filled from sale record (consignor/estate executor name) | Exists, editable |
| Payout amount | From Step 3 "Client/Consignor earnings" | Auto-filled |
| Payment method | Radio: Stripe or Manual | Frontend |
| Stripe acct (if selected) | Linked Stripe Connect ID for this organizer | Exists or NEEDS VERIFICATION |
| Manual payment note | Free text, optional (e.g., "Check mailed May 5") | Frontend |

**States:**
- **Initial:** Client name pre-filled from sale record; Stripe selected if organizer has Connect
- **Stripe selected:** Shows "Sending payout to [client], amount $X, will arrive in 1–2 days"
- **Manual selected:** Shows note field for payment details

**Actions:**
- Tap "Select..." → Dropdown or search (if multiple clients/consignors linked to organizer)
- Type custom name → If not found in dropdown, allow free text entry
- Select radio button → Payment method changes, form updates
- "[Continue]" → Proceed to Step 5 (execute payout or save manual record)

**Copy:**
- "Client Name" (estate) or "Consignor Name" (consignment)
- "Record as Manual" means "Mark as complete manually, I'll handle the payment outside FindA.Sale"
- If Stripe: "Payment will be sent immediately to the connected Stripe account"
- If Manual: "Record when you've paid them (via check, cash, etc.)"

**Mobile Considerations:**
- Client name field is searchable (autocomplete)
- Amount is read-only (not editable — prevent typos)
- Manual note has placeholder text: "e.g., Check mailed 5/3/26"

---

#### Step 5: Receipt & Close

**Page title:** "Settlement Complete"
**Job:** Organizer reviews the full settlement breakdown, downloads a receipt (PDF, for their records/taxes), and marks the sale as fully settled.

**Mobile layout:**
```
┌─────────────────────────────┐
│ Settlement Confirmed ✓      │
│                             │
│ Sale: Antique Estate        │
│ Settled: May 3, 2026        │
│                             │
│ Summary:                    │
│ ─────────────────────────── │
│ Gross Sales:    $3,240     │
│ - Expenses:       $450     │
│ - Platform Fee:   $274     │
│ - Commission:     $548     │
│ ─────────────────────────── │
│ Your Earnings:  $1,968     │
│ Client Payout:    $548     │
│                             │
│ [Download PDF Receipt]      │
│ [Mark Settlement Complete]  │
│                             │
│ [Return to Dashboard →]     │
└─────────────────────────────┘
```

**Desktop:** Wider card, maybe with visual breakdown chart.

**Data Fields:**

| Field | Source | Status |
|-------|--------|--------|
| Sale title | Completed sale record | Exists |
| Settlement date | Current date | Autofilled |
| All summary numbers | Computed from Steps 1–4 | Computed |

**States:**
- **Initial:** Shows summary with PDF download and completion button
- **Downloading:** PDF button shows "Downloading..." briefly
- **Completed:** After "Mark Settlement Complete" clicked, shows success state with link to dashboard

**Actions:**
- "[Download PDF Receipt]" → Generates PDF with full breakdown (invoice-like, for taxes)
- "[Mark Settlement Complete]" → Saves settlement record, marks sale as `settlementStatus = COMPLETE`
- "[Return to Dashboard]" → Links to `/organizer/dashboard` after completion

**Copy:**
- Success messaging: "Great! This settlement is recorded in your account."
- Below buttons: "Keep this receipt for your records."

**Mobile Considerations:**
- Full width card
- Download button and completion button are both large (48px+)
- PDF opens in new tab (native phone behavior)

---

#### Edge Cases & Error States

**No unsold items → Settlement shows $0 for charity donation step (skipped)**

**Client name not found → Show "Add custom name" option**

**Stripe payout fails → Show error with retry button and manual payment fallback**

**PDF generation fails → Show "Download as JSON" fallback or email receipt option**

---

### 4.2 — Settlement Hub: Yard Sales (Simplified)

**Job to be Done:**
Organizer running a yard sale (personal event, typically not consigned) just needs a quick reconciliation card to record gross sales, expenses, and net profit. No client payout, no commission complexity.

**Entry point:**
1. "Quick Settlement" card on State 3 dashboard (post-sale)
2. `/organizer/settlement/[saleId]` (same endpoint, shows simplified version if `saleType = YARD_SALE`)

**Expected completion:** 2–3 minutes

**Mobile layout:**
```
┌─────────────────────────────┐
│ Yard Sale Settlement        │
│                             │
│ Gross Sales:      $340     │
│                             │
│ Expenses:                   │
│ [  $20  ]                   │
│ (signage, supplies, etc)   │
│                             │
│ Platform Fee (10%):  $34   │
│                             │
│ Your Net Profit:   $286    │
│                             │
│ [Save Settlement]           │
│ [Return to Dashboard →]     │
└─────────────────────────────┘
```

**Desktop:** Same card.

**Data Fields:**

| Field | Source | Status |
|-------|--------|--------|
| Gross sales | Sum of sold items | Exists |
| Expenses | Single text field, user enters total | Frontend |
| Platform fee | Gross × 10% | Hardcoded |
| Net profit | Gross - Expenses - Fee | Frontend calc |

**States:**
- **Initial:** Shows gross and fee pre-filled, expense field is blank
- **Entering expenses:** Expense field is a single number input (not categories)
- **Saved:** Shows success message, save button becomes "Settlement Saved ✓"

**Actions:**
- Tap expense field → Enter total amount
- "[Save Settlement]" → Records the settlement, closes the flow
- "[Return to Dashboard]" → Links to dashboard

**Copy:**
- "Yard Sale Settlement" (plain, friendly)
- No "commission" talk, no "client" talk — just their profit
- "Platform Fee" is simple: shown, not hidden

**Mobile Considerations:**
- Single card, minimal fields
- Fast completion (no multi-step wizard)

---

### 4.3 — Charity Close Flow (Estate/Consignment Post-Sale)

**Job to be Done:**
Organizer has unsold items from an estate or consignment sale and wants to donate them to a local charity (Goodwill, Salvation Army, etc.) to get a tax receipt, so they don't have to haul items to a landfill.

**Entry point:**
1. "Donate Unsold Items" button in Charity Close card (State 3)
2. Can also be accessed from `/organizer/settlement/[saleId]` if organizer skipped it in post-sale flow

**Expected completion:** 5–7 minutes

**Step 1: Charity Selection**

**Page title:** "Choose a Charity"
**Job:** Organizer picks a local charity to donate unsold items to.

**Mobile layout:**
```
┌─────────────────────────────┐
│ Select a Charity            │
│                             │
│ 12 items ready to donate    │
│ (from Antique Estate)       │
│                             │
│ Search: [_________________]│
│                             │
│ Popular in Grand Rapids:    │
│ [Goodwill]                  │
│ [Salvation Army]            │
│ [Habitat for Humanity]      │
│ [Vietnam Veterans]          │
│ [+5 more]                   │
│                             │
│ Or enter custom:            │
│ Charity name: [___________] │
│ Pickup available: (o) Yes   │
│                             │
│ [Continue →]                │
└─────────────────────────────┘
```

**Desktop:** Wider search box, list of charities in 2 columns.

**Data Fields:**

| Field | Source | Status |
|-------|--------|--------|
| Unsold item count | From completed sale, status !== SOLD | Exists |
| Charity list (local) | Pre-populated by ZIP code from sale location | NEEDS BACKEND |
| Charity name (custom) | Free text if organizer enters custom charity | Frontend |
| Pickup available | Yes/No toggle for custom charity | Frontend |

**States:**
- **Initial:** Shows popular charities for the sale's ZIP code
- **Searching:** Filters list as organizer types
- **Custom entry:** Allows organizer to add charity name + pickup preference

**Actions:**
- Tap charity name → Selects it, shows confirmation
- Type in search → Filters list
- "Enter custom" → Shows text input for charity name + toggle
- "[Continue]" → Proceed to Step 2

**Copy:**
- "Select a Charity" (straightforward)
- Below unsold count: "These items will be packaged and picked up (or you can drop off)"
- Help text: "Choose a local charity you trust. FindA.Sale will generate a tax receipt."

---

**Step 2: Item Review & Notes**

**Page title:** "Review Items"
**Job:** Organizer sees the list of unsold items being donated and can add optional notes (condition, special instructions).

**Mobile layout:**
```
┌─────────────────────────────┐
│ Items to Donate             │
│ Goodwill Grand Rapids       │
│                             │
│ 📷 Victorian Desk           │
│ 📷 Tiffany Lamp             │
│ 📷 Gold Necklace Set        │
│ 📷 Box of Books (12)        │
│ ... (4 more)                │
│                             │
│ [View All Items]            │
│                             │
│ Donation Notes (optional):  │
│ All items are clean and    │
│ in good condition.         │
│ No electrical items.       │
│ [_____________________]    │
│                             │
│ [Continue →]                │
└─────────────────────────────┘
```

**Desktop:** Wider list, all items shown, notes field on right.

**Data Fields:**

| Field | Source | Status |
|-------|--------|--------|
| Item photos (thumbnails) | First photo of each unsold item | Exists |
| Item names | Item titles | Exists |
| Count of items | Unsold items for this sale | Exists |
| Donation notes | Free text, optional | Frontend |

**States:**
- **Initial:** Shows first 4 items, "[View All Items]" link expands list
- **Expanded:** All unsold items shown
- **Notes entered:** Organizer can add condition/instructions

**Actions:**
- "[View All Items]" → Expands list or links to detail modal
- Tap item → (Optional) shows item detail
- Notes field → Free text, saved as organizer enters
- "[Continue]" → Proceed to Step 3

**Copy:**
- "Review Items" (simple)
- Donation notes placeholder: "e.g., All items clean, no electrical items, books may have library labels"

---

**Step 3: Pickup Scheduling**

**Page title:** "Schedule Pickup"
**Job:** Organizer books a pickup time with the charity (if available), or schedules a drop-off.

**Mobile layout:**
```
┌─────────────────────────────┐
│ Arrange Pickup              │
│                             │
│ Goodwill Grand Rapids       │
│ Address: 123 Main St        │
│                             │
│ Pickup available? YES       │
│                             │
│ Preferred date:             │
│ [May 4, 2026        ▼]     │
│                             │
│ Preferred time:             │
│ [9am–12pm           ▼]     │
│                             │
│ Contact phone (optional):   │
│ [_________________]         │
│                             │
│ (Charity will contact to   │
│  confirm)                   │
│                             │
│ [Continue →]                │
└─────────────────────────────┘
```

**Desktop:** Similar form.

**Data Fields:**

| Field | Source | Status |
|-------|--------|--------|
| Charity address | Pre-filled from charity selection | Exists |
| Pickup availability | Charity record (yes/no) | NEEDS BACKEND |
| Preferred date | Date picker, pre-filled to tomorrow or next available | Frontend |
| Preferred time window | Dropdown: 9am–12pm, 12pm–3pm, 3pm–6pm, By request | Frontend |
| Contact phone | Organizer's phone, pre-filled from account | Pre-filled |

**States:**
- **Pickup available:** Shows date/time picker and phone field
- **Pickup not available:** Shows "Drop-off only" message with charity's address/hours
- **Submitted:** Charity receives request, will contact organizer to confirm

**Actions:**
- Tap date field → Calendar picker
- Tap time field → Dropdown
- Phone field → Pre-filled, editable
- "[Continue]" → Proceed to Step 4 (receipt generation)

**Copy:**
- "Schedule Pickup" or "Plan Your Donation" (friendly)
- Below contact phone: "The charity will call or text this number to confirm pickup."
- If drop-off only: "This charity accepts drop-offs at: [address & hours]"

---

**Step 4: Tax Receipt**

**Page title:** "Donation Confirmation"
**Job:** Organizer gets a tax receipt (PDF) documenting the donation for their taxes.

**Mobile layout:**
```
┌─────────────────────────────┐
│ Donation Confirmed ✓        │
│                             │
│ Goodwill Grand Rapids       │
│ 12 items donated            │
│ May 3, 2026                 │
│                             │
│ Estimated Value: $450      │
│ (based on appraised prices) │
│                             │
│ Pickup scheduled:           │
│ May 4, 9am–12pm            │
│ Confirmation call expected  │
│                             │
│ [Download Tax Receipt]      │
│ [Return to Dashboard →]     │
└─────────────────────────────┘
```

**Desktop:** Wider card, maybe with charity logo.

**Data Fields:**

| Field | Source | Status |
|-------|--------|--------|
| Charity name | From Step 1 selection | Carried forward |
| Item count | Unsold items being donated | Carried forward |
| Donation date | Today's date | Autofilled |
| Estimated value | Sum of unsold item prices (or estimated resale value) | Calculated |
| Pickup confirmation | From Step 3 | Carried forward |

**States:**
- **Success:** Shows confirmation with download option
- **Downloading:** Receipt button shows "Generating..."
- **Downloaded:** Button shows "✓ Downloaded"

**Actions:**
- "[Download Tax Receipt]" → Generates PDF with charity name, item count, estimated value, donation date
- "[Return to Dashboard]" → Links to dashboard

**Copy:**
- Success messaging: "Great! Your donation is recorded."
- Below receipt: "Use this receipt for your tax deduction. Consult your tax professional about valuation."

**Mobile Considerations:**
- Full width card
- Download button is large (48px+)
- Receipt opens in new tab (phone default PDF viewer)

---

#### Charity Close Edge Cases

**Charity not available in list → Custom entry field allows any charity name**
**No pickup available → Drop-off instructions shown, no scheduling needed**
**Items listed for free/no appraised value → Estimated value = $0, receipt still generated**

---

## 5. NAVIGATION & LINKING MAP

How all new flows and pages connect to existing navigation.

### 5.1 — Dashboard Nav Destinations

From the main dashboard, organizers can reach:

| Element | Destination | Current Status |
|---------|-------------|-----------------|
| **Sale Status Widget** | `/organizer/edit-sale/[saleId]` (edit sale page) | Exists |
| Sale Status "View Live" | `/sales/[saleId]` (shopper-facing sale page) | Exists |
| Sale Status "Add Items" | `/organizer/add-items/[saleId]` | Exists |
| Sale Status "Manage Items" | `/organizer/add-items/[saleId]` (same, context-aware label) | Exists |
| Sale Status "Holds" | `/organizer/holds` | Exists |
| Sale Status "Close Sale Early" | Confirmation dialog → PATCH `/sales/[saleId]/status` to ENDED | Exists (S366) |
| **Selling Tools Grid** | Links per tool (Create Sale, Add Items, QR, POS, Print, Analytics) | Exists |
| **Sale Pulse** "Boost visibility" | `/organizer/qr` or `/organizer/social` (sharing/promo tools) | Exists |
| **Efficiency Coaching** "Tips to improve" | Modal with tips (in-page), no new route | New |
| **Buyer Intelligence** "See all attendees" | `/organizer/sales/[saleId]/attendees` | **NEW PAGE** |
| **Post-Sale Momentum** "Start Next Sale" | `/organizer/create-sale` (pre-fill modal with previous sale data) | **NEW FEATURE** (pre-fill form) |
| **Post-Sale Momentum** "Donate Unsold" | `/organizer/settlement/[saleId]/charity-close` | **NEW FLOW** |
| **Charity Close** "Donate Unsold Items" | `/organizer/settlement/[saleId]/charity-close` Step 1 | **NEW FLOW** |
| **Settlement Card** (if visible) | `/organizer/settlement/[saleId]` Step 1 | **NEW FLOW** |

### 5.2 — Settlement Hub Routes

| Step | Route | Method | Notes |
|------|-------|--------|-------|
| Summary Review | `/organizer/settlement/[saleId]` | GET | Shows post-sale summary, entry to wizard |
| Expense Entry | `/organizer/settlement/[saleId]?step=expenses` | GET + POST | Form submission saves to temp state |
| Commission Calc | `/organizer/settlement/[saleId]?step=commission` | GET + POST | Pre-filled from expense data |
| Client Payout | `/organizer/settlement/[saleId]?step=payout` | GET + POST | Stripe or manual selection |
| Receipt & Close | `/organizer/settlement/[saleId]?step=receipt` | GET + POST | Final submission, generates settlement record |

### 5.3 — Charity Close Routes

| Step | Route | Method | Notes |
|------|-------|--------|-------|
| Charity Selection | `/organizer/settlement/[saleId]/charity-close/select` | GET | Search + dropdown |
| Item Review | `/organizer/settlement/[saleId]/charity-close/review` | GET | Item list + notes |
| Pickup Scheduling | `/organizer/settlement/[saleId]/charity-close/schedule` | GET + POST | Date/time picker |
| Tax Receipt | `/organizer/settlement/[saleId]/charity-close/receipt` | GET | PDF download + confirmation |

### 5.4 — Navigation Wiring for Mobile + Desktop

**Mobile (< 768px):**
- Dashboard nav: Primary CTA is always visible (sticky at bottom or full-width button above fold)
- Widgets stack 1 column
- Secondary actions (links) are inline with cards or grouped in a "More" menu

**Desktop (≥ 768px):**
- Dashboard nav: 2–3 column layout, widgets sized for scanning
- Sidebar (optional) for secondary nav or account menu
- Secondary actions are inline

**All sizes:**
- Back button / breadcrumb on settlement pages for navigation
- Exit flow always available (return to dashboard link, usually at bottom)

---

## 6. EMPTY / LOADING / ERROR STATES

### 6.1 — Empty States

**No flagged items (High-Value Tracker):**
Widget hidden entirely. If organizer navigates to `/organizer/settlement/[saleId]` with no high-value items, Tracker section is omitted.

**No registered shoppers (Buyer Intelligence):**
Card shows: "No registered shoppers yet. Share the link to fill it up!" + "[Share Link]" button.

**No completed sales (Efficiency Coaching):**
Widget hidden until 2+ completed sales exist.

**No unsold items (Charity Close card):**
Card hidden entirely on State 3 dashboard.

**Yard sale (no commission data):**
Settlement wizard shows simplified form (not multi-step commission wizard).

---

### 6.2 — Loading States

**Dashboard loading:**
Skeleton loaders (existing from current dashboard.tsx) show for:
- Sale Status Widget (rectangle with photo placeholder)
- Stats metrics (3-column skeleton)
- Sales list (card skeletons × 3)

**Settlement wizard loading:**
Each step shows "Loading..." placeholder with spinner. Do not show partially-loaded data.

**Charity close loading:**
Each step shows "Loading..." until data arrives.

---

### 6.3 — Error States

**Sale not found:**
"Sale not found. Return to dashboard." + link to `/organizer/dashboard`

**Settlement already completed:**
"This sale's settlement is already marked complete. View settlement details." + link to summary page

**Stripe payout failed:**
"Payout failed. Check your Stripe account or select Manual payment instead. [Retry] [Switch to Manual]"

**Charity pickup confirmation failed:**
"Couldn't schedule pickup. Try again or contact the charity directly at [phone]. [Retry]"

**PDF generation failed:**
"Couldn't generate receipt. [Retry] or [Email me the receipt]"

---

## 7. MOBILE VS DESKTOP LAYOUT NOTES

### 7.1 — Key Mobile Differences

**Breakpoint:** 768px (Tailwind `md` breakpoint)

**Below 768px (mobile):**
1. **Widgets stack 1 column** — full width, no side-by-side layouts
2. **Sticky primary CTA** — e.g., "Start Settlement" button sticks to bottom, always reachable with thumb
3. **Reduced photo sizes** — thumbnails in High-Value Tracker are ~60px (not 100px)
4. **Form inputs are wider** — text fields expand to full width, with adequate padding
5. **Tap targets min 44px height** — buttons, links all meet accessibility minimum
6. **Horizontal scrolling prohibited** — no tables that require left-right scroll
7. **Number formatting** — $1,234 not $1234; readable at phone zoom level

**Above 768px (desktop):**
1. **2–3 column grids** — Selling Tools in 3 cols, widgets can sit side-by-side
2. **Wider cards** — widgets are ~400–600px wide instead of full-width
3. **Sidebar optional** — secondary nav or secondary info can appear in right sidebar
4. **Tables & data-heavy components** are readable (no forced mobile truncation)

### 7.2 — Component-Level Mobile Notes

**Sale Status Widget:**
- Mobile: Photo stacked above text, full width
- Desktop: Photo left, text right (horizontal layout)

**Selling Tools Grid:**
- Mobile: 2 cols (3 rows)
- Desktop: 3 cols (2 rows)

**Buyer Intelligence Card:**
- Mobile: Avatar stack, vertical list of top shoppers
- Desktop: Avatar + badge side-by-side, maybe card grid

**Settlement Form (Step 2 — Expenses):**
- Mobile: Category list stacked, amount field on right
- Desktop: Category + amount in 2-column table

**Recent Sales List:**
- Mobile: Card-per-sale (stacked), compact (title + 1-line summary)
- Desktop: Table-like layout or card grid, 2 cols

### 7.3 — Responsive UX Patterns Used

**Sticky buttons (mobile):** Primary CTA stays visible as user scrolls (mobile only)
**Progressive disclosure:** Advanced options (like editing commission %) are hidden behind taps until needed
**Touch-friendly inputs:** Tap targets always ≥ 44px, keyboard appears on focus
**Text wrapping:** All labels wrap correctly on narrow screens; no truncation or overflow
**Dark mode:** All colors tested in dark mode; no light-bg text on light-bg, no unreadable contrast

---

## 8. DESIGN SYSTEM CONSTRAINTS

### Colors & Contrast

All text on button/card backgrounds must meet WCAG AA contrast (4.5:1 for normal text, 3:1 for large text).

- Primary action buttons: `bg-amber-600` (or dynamic based on sale type)
- Secondary actions: `bg-gray-200` or outlined
- Alerts/warnings: `bg-red-100` with `text-red-800` (dark mode: `bg-red-900` + `text-red-200`)
- Success: `bg-green-100` + `text-green-800`

### Typography

- Page title: Tailwind `text-2xl font-bold` (desktop) → `text-xl font-bold` (mobile)
- Section heading: `text-lg font-bold`
- Body text: `text-base` (desktop), `text-sm` (mobile forms)
- Labels: `text-sm font-semibold`
- Help text: `text-xs` + `text-gray-600` (light) or `text-gray-400` (dark)

### Spacing

- Card padding: `p-6` (desktop), `p-4` (mobile)
- Gap between widgets: `gap-4` (mobile), `gap-6` (desktop)
- Margin below section: `mb-6` or `mb-8`

### Buttons

- Primary: `bg-amber-600 hover:bg-amber-700 text-white font-semibold py-2 px-4 rounded-lg`
- Height: ≥ 40px (44px preferred for mobile)
- Width: Full width on mobile forms, auto-width on desktop
- Disabled state: `opacity-50 cursor-not-allowed`

### Cards

- Border: `border border-warm-200 dark:border-gray-700`
- Background: `bg-white dark:bg-gray-800`
- Padding: `p-6` (desktop), `p-4` (mobile)
- Rounded: `rounded-lg`
- Shadow: `shadow` or `shadow-md` (hover state)

---

## 9. COPY & VOICE GUIDELINES

### Tone

- **Friendly, not cutesy** — "Let's close this out" not "Let's wrap this puppy!"
- **Plain English, no jargon** — "Commission" not "Royalty", "Pickup" not "Fulfillment"
- **Empowering, not patronizing** — "Ready for your next sale?" not "Can you handle another sale?"
- **Action-oriented** — "Add Photos", "Start Settlement", "Download Receipt" (verbs)

### Microcopy Patterns

**Empty state:** "No [items] yet. [Action to create one]."
Example: "No flagged items yet. [Flag items when you want to track them closely.]"

**Error state:** "[What happened]. [What to do next]."
Example: "Payout failed. [Retry] or [switch to manual payment]."

**Success state:** "[Outcome]. [Confirmation]."
Example: "Settlement saved. Download your receipt anytime from the dashboard."

**Help text:** Appears below field in `text-xs`, explains why we need this info.
Example: "We use this to schedule the charity's pickup truck."

**Confirmation prompts:** "Are you sure? [Outcome if you proceed]."
Example: "Close this sale early? Shoppers will lose access, but you can reopen it later."

---

## 10. IMPLEMENTATION CHECKLIST FOR DEV

Use this checklist to track implementation. Each item is a discrete dev task.

### Data & Backend

- [ ] Add `saveCount` field to `/api/organizers/stats` → `activeSale` object
- [ ] Add `questions` field to `/api/organizers/stats` → `activeSale` object
- [ ] Create `/api/organizers/me/benchmark` endpoint (percentile rank, time-to-publish, sell-through %)
- [ ] Create `/api/sales/[saleId]/incoming-shoppers` endpoint (shopper list, tier distribution)
- [ ] Create `/api/weather/forecast` endpoint (call external weather API, cache 6h)
- [ ] Add `isFlagged` boolean to Item model (Prisma schema)
- [ ] Create `/api/sales/[saleId]/items?flagged=true` endpoint
- [ ] Create Settlement model in Prisma (track expense records, commission, payout)
- [ ] Create Settlement API endpoints: POST (create), PATCH (update step), GET (retrieve)
- [ ] Charity model in Prisma + local pre-populated list of Grand Rapids charities
- [ ] Charity pickup confirmation: backend integration (email organizer + charity, generate PDF receipt)

### Frontend Components

- [ ] Sale Pulse widget component
- [ ] Organizer Efficiency Coaching widget component
- [ ] Smart Buyer Intelligence widget component
- [ ] High-Value Item Tracker widget component
- [ ] Weather Strip component (thin, informational)
- [ ] Post-Sale Momentum card (State 3)
- [ ] Charity Close card (State 3, conditional)
- [ ] Settlement wizard (5-step form)
  - [ ] Step 1: Summary Review
  - [ ] Step 2: Expense Entry
  - [ ] Step 3: Commission Calculation
  - [ ] Step 4: Client Payout
  - [ ] Step 5: Receipt & Close
- [ ] Charity Close flow (4-step wizard)
  - [ ] Step 1: Charity Selection
  - [ ] Step 2: Item Review
  - [ ] Step 3: Pickup Scheduling
  - [ ] Step 4: Tax Receipt
- [ ] `/organizer/sales/[saleId]/attendees` page (shopper list)

### Dashboard Rewiring

- [ ] Conditional rendering: show/hide widgets based on sale state + type
- [ ] Sale type detection: determine layout variant from `sale.type` field
- [ ] Copy variants: use sale type in greeting + widget labels
- [ ] Mobile layout: verify all widgets stack correctly at < 768px
- [ ] Sticky primary CTA (mobile): test on device
- [ ] Recent Sales List: show up to 5, add "View all" link
- [ ] Dark mode: test all new widgets in dark theme

### Forms & Interactions

- [ ] Settlement form: step navigation (prev/next buttons)
- [ ] Form validation: all fields, error messages per field
- [ ] Pre-fill logic: "Start Next Sale" button pre-fills create-sale form
- [ ] Charity search: autocomplete + custom entry
- [ ] Date/time pickers: accessibility (WCAG 2.1 AA)
- [ ] PDF generation: settlement receipt + tax donation receipt

### Testing

- [ ] Desktop smoke test (md breakpoint ≥ 768px)
- [ ] Mobile smoke test (< 768px)
- [ ] Dark mode verification (all new widgets)
- [ ] Accessibility audit: WCAG 2.1 AA (especially forms)
- [ ] Browser QA: Chrome, Firefox, Safari (desktop + iOS)
- [ ] Settlement flow: test all 5 steps, test with/without Stripe
- [ ] Charity flow: test with pickup + drop-off only charities
- [ ] Error states: test all error messages, retry flows

### Documentation

- [ ] API endpoint documentation (new endpoints)
- [ ] Component API docs (prop types, examples)
- [ ] Data flow diagram (from settlement to Stripe payout)

---

## 11. OPEN QUESTIONS FOR PATRICK

Before dev starts, clarify these business/product decisions:

1. **Settlement fee for estates/consignment:** Should FindA.Sale charge 10% flat to organizer, or does the commission structure vary? (This determines Step 3 complexity.)

2. **Charity database:** Which charities should be pre-populated in the dropdown? Grand Rapids area only, or statewide? Should organizers be able to suggest new charities?

3. **Tax receipt:** Should the donation receipt include a photo list of items, or just a count + estimated total value?

4. **Stripe payout method:** For multi-client estates (multiple consignors), should organizer be able to split one settlement into multiple Stripe payouts, or just one payout per completed sale?

5. **Yard/Flea Market settlement:** Do these sale types ever need the full settlement wizard, or is the simplified 3-field form sufficient?

6. **Post-sale prompt timing:** Should the "Start Next Sale" card appear immediately after a sale ends (ENDED status), or only after 24 hours? (To prevent accidental duplicate sales.)

7. **Efficiency Coaching:** Should this be visible to all organizers, or only SIMPLE+ tier (as a tier benefit)?

---

## 12. KEY UX DECISIONS SUMMARY

**1. No removal of working features.** Every current widget and action remains accessible. New widgets ADD functionality without deleting old paths.

**2. Sale-type-aware layout.** Dashboard copy and primary actions change based on `sale.type` (estate, yard, auction, etc.), so organizers feel the interface is tailored to them.

**3. Mobile-first, but desktop-optimized.** Widgets stack 1 col on mobile; on desktop, 2–3 col layouts reduce scrolling for power users.

**4. Progressive disclosure in settlement.** Rather than one giant form, the 5-step wizard breaks settlement into digestible chunks (review → expenses → commission → payout → receipt).

**5. No dead-end cards.** Every widget has a button or link (Sale Pulse → boost visibility, Efficiency Coaching → tips modal, Buyer Intelligence → attendees page). No pure data display without an action.

**6. Trust-building in charity close.** Tax receipt PDF + pickup confirmation email reassure organizers that their donation is recorded and tracked.

**7. Charity flow is separate.** Rather than bundling charity donation into the main settlement wizard, it's a parallel flow accessible from State 3 dashboard or the settlement page. Organizers who don't have unsold items don't see it.

---

## SPEC LOCATION

**Full spec:** `/sessions/keen-loving-keller/mnt/FindaSale/claude_docs/feature-notes/dashboard-makeover-ux-spec-S367.md`

**Status:** Ready for dev dispatch

**Implementation order:**
1. Backend: Settlement + Charity models, endpoints (1–2 days)
2. Frontend: Dashboard widgets, mobile layout (3–4 days)
3. Frontend: Settlement wizard (2 days)
4. Frontend: Charity flow (1–2 days)
5. Testing & Polish (2 days)

**Estimated total:** 9–11 dev days (if running in parallel, could compress to 5–7)

---

## HANDOFF SUMMARY

**UX Spec Author:** FindA.Sale UX Designer
**Date Completed:** 2026-04-01
**Deliverable:** Complete Dashboard Makeover + Settlement Hub UX Spec

**Key Design Decisions:**
- Adaptive layout per sale type (estate, yard, auction, etc.)
- 7 new widgets (Sale Pulse, Efficiency Coaching, Buyer Intelligence, High-Value Tracker, Weather, Post-Sale Momentum, Charity Close)
- 2 major flows: Settlement Hub (5-step wizard for estate/consignment/auction) + Charity Close (4-step wizard for donation)
- Mobile-first layout with sticky primary CTAs on phone
- Plain English copy, no jargon, action-oriented labeling
- All new elements connected to existing nav; no dead ends

**Decisions Needing Patrick Approval:**
1. Settlement fee model (flat 10% or variable by consignor?)
2. Charity database scope (Grand Rapids only or statewide?)
3. Efficiency Coaching visibility (all tiers or SIMPLE+ only?)
4. Post-sale prompt timing (immediate after sale ends, or 24h delay?)

**Components Ready for Dev:**
- High-level component map (§3 for each widget)
- Data requirements (which API fields exist, which need backend work)
- Mobile layout specifications
- Error/empty/loading states
- Copy guidelines and microcopy patterns
- Implementation checklist (51 discrete tasks)

**No Code Written.** All work is UX specification and flow design.

---
