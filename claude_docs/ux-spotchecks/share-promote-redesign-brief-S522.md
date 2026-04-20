# Share & Promote — Full Page Redesign Brief
Date: 2026-04-20 | Session: S522
Status: Ready for Claude Design OR findasale-dev

---

## The Problem with What's There Now

The current `/organizer/promote/[saleId]` page is two disconnected surfaces:
a 4-card export grid plus a modal with 9 scrolling tabs for social posts. Organizers
have to find the modal button, open it, scroll sideways through tabs, and copy.
It doesn't feel like a tool people want to use — it feels like a settings page.

The redesign kills the modal entirely. Everything lives on one page. An organizer
lands here and can share their sale to every relevant channel without ever opening
a popup.

---

## Concept: "Launch Your Sale"

**Mental model shift:** This page is not an export tool. It's a launch pad.
An organizer just published their sale and now has one job: get buyers to show up.
The page should feel like a moment — "your sale is live, now let's get people there."

**Visual tone:**
- Warm amber/gold gradient hero (matches FindA.Sale brand)
- Dark mode support (follows app theme)
- Card-based layout — no tabs, no modals
- Platform tiles use real platform brand colors as subtle accents
- Copy buttons are large and satisfying to tap on mobile
- Generous white space — not cramped, not cluttered

**Brand colors:** amber-600 primary (#d97706), warm neutrals, green for WhatsApp,
dark mode via gray-900/gray-800 backgrounds

---

## Page Sections (top to bottom)

### 1. Hero — Sale Identity

Full-width header band. Shows:
- Sale title (e.g., "Downtown Downsizing Sale 17") in large bold text
- Date range: "Apr 24 – Apr 26" with calendar icon
- Address line: "123 Main St, Grand Rapids, MI"
- Item count badge: "43 items ready to share" (amber pill)
- Sale link with one-tap copy button: `finda.sale/sales/[id]` + [Copy Link]

Background: warm amber gradient (amber-600 to amber-700) with a subtle
texture or pattern. White text. This is the "your sale is live" moment.

Mobile: stack vertically, full width copy button at bottom of hero.

---

### 2. Quick Share — "Get the Word Out"

Section heading: "Quick Share"
Subheading: "Tap to copy a ready-to-post message for each platform"

**Layout: 2-column grid on mobile, 4-column on desktop**

Each tile is a compact card (~120px tall on desktop):
- Platform icon (colored emoji or SVG)
- Platform name
- One large "Copy Post" button (full card width)
- On copy: button flashes green + "Copied!" for 1.5s, then resets

**Platforms (in order):**

| Tile | Icon | Color accent | Post type |
|------|------|-------------|-----------|
| Facebook | 👥 | blue-600 | Group post with dates, address, sale URL |
| Nextdoor | 🏡 | green-600 | Neighbor-friendly post with address + items |
| Instagram | 📸 | pink-600 | Caption + hashtags for Instagram bio link |
| WhatsApp | 💬 | green-500 | Short text + sale URL (opens wa.me on mobile) |
| Threads | 🧵 | gray-800 | Short post, clean hashtags |
| Email | ✉️ | amber-600 | Subject line + body ready to paste |
| Pinterest | 📌 | red-600 | Pin description with image URL |
| TikTok | 🎵 | gray-900 | Video caption + hashtags |

Each platform's copy content is the same logic from SharePromoteModal.tsx —
no new API needed, just inline template generation.

**WhatsApp is the exception:** on mobile, tapping "Share" opens
`wa.me/?text=...` instead of copying. On desktop, copies to clipboard
with toast "Copied! Paste into WhatsApp on your phone."

---

### 3. Spotlight an Item — "Feature Your Best Find"

Section heading: "Spotlight an Item"
Subheading: "Generate a post for a specific piece"

Compact single-row layout on desktop, stacked on mobile:
- Item dropdown: "Choose an item..." (populated from itemsData)
- Platform selector: Instagram / Facebook / Threads pills
- Tone selector: Casual / Enthusiastic / Professional pills
- [Generate Post] button → shows generated text below in a copy-ready textarea
- [Copy] button below the textarea

Uses existing `/social/${itemId}/template` API endpoint (no backend work needed).

If no items: show a gentle nudge — "Add items to your sale to spotlight them here"
with a [Go to Items] link.

---

### 4. Listing Exports — "Post to Listing Sites"

Section heading: "List on Other Sites"
Subheading: "Export your inventory to reach buyers on listing platforms"

**Layout: 3-column grid (desktop), stacked (mobile)**

Each export card:
- Platform icon + name (large)
- One-line description of who uses it
- Format label: "CSV file" / "Item data" / "Plain text"
- Two buttons: [Download] + [Copy]

Cards: EstateSales.NET, Facebook Marketplace, Craigslist
(Same cards as today — just restyled to match the new layout)

---

### 5. Print & Flyer — "Physical Promotion"

Section heading: "Print & Flyer"
Compact single card:
- "Flyer Copy" label with 🖨️ icon
- Description: "Ready-to-paste text for a printed flyer or bulletin board post"
- [Copy Flyer Text] button
- Below: collapsible "How to print" with 3-step instructions

---

### 6. How to Use (Collapsible)

A `<details>` accordion at the bottom:
"How to use these exports" — same content as today's help section.
Collapsed by default on mobile, expanded on desktop.

---

## Data Available (No Backend Work Needed)

All content is generated from existing data:
- `sale.title`, `sale.startDate`, `sale.endDate`, `sale.address`, `sale.city`, `sale.state`, `sale.zip` → all in `/api/sales/[saleId]`
- `itemsData` → `/items/drafts?saleId=`
- Spotlight posts → `/social/${itemId}/template` (existing endpoint)
- Export downloads → `/export/${saleId}/estatesales-csv` etc. (existing endpoints)

**No schema changes. No new API endpoints.**

---

## What Gets Removed

- `SharePromoteModal.tsx` — tab content moves inline to the page
- The "📢 Share & Promote" modal trigger button in the page header
- The separate modal component (can be archived, not deleted immediately — Patrick to confirm)

---

## Mobile Behavior

- Hero: full-width, stacked text, large copy button at bottom
- Quick Share tiles: 2×4 grid → scrolls naturally
- Spotlight: stacked column
- Exports: single column stacked cards
- All copy buttons: min 48px height, full card width
- No horizontal scrolling anywhere

---

## Animation / Interaction Polish

- Copy button: flash to green ("✓ Copied!") for 1.5s, then back to original
- Spotlight Generate button: brief spinner, then text fades in
- WhatsApp tile on mobile: opens in new tab (wa.me), desktop: copies
- Download buttons: brief "Downloading..." state while fetch runs
- On page load: hero fades in (200ms), sections stagger-fade in below (100ms each)

---

## For Claude Design

If using Claude Design to prototype this:

1. Upload a screenshot of the current promote page
2. Paste this brief as the prompt
3. Ask for: "Single-page layout, no modal. Warm amber gradient hero.
   2×4 quick-share tile grid. Compact spotlight section. 3-column export grid.
   Match the FindA.Sale brand (amber-600 primary, warm neutrals, dark mode).
   Make the copy buttons large and satisfying to tap. Should feel like a
   launch pad, not a settings page."
4. Brand colors: amber-600 (#d97706), warm-50 (#fdfaf7), warm-900 (#1c1009)
5. Export as standalone HTML for dev handoff

---

## For findasale-dev

When implementing:
1. Keep all export logic (downloadFile, copyToClipboard functions) — unchanged
2. Keep WhatsApp handler — unchanged
3. Keep Spotlight API call (`/social/${itemId}/template`) — move from modal to page
4. Extract all template strings from SharePromoteModal.tsx tabs — move inline to page
5. Remove `<SharePromoteModal>` import and usage from `[saleId].tsx`
6. SharePromoteModal.tsx: do NOT delete — archive/deprecate with a comment,
   Patrick to confirm removal

File to edit: `packages/frontend/pages/organizer/promote/[saleId].tsx` (full rewrite)
Component to deprecate: `packages/frontend/components/SharePromoteModal.tsx`

TS check required before returning: `cd packages/frontend && npx tsc --noEmit --skipLibCheck`
