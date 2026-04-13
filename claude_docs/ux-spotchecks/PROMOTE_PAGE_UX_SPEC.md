# UX Spec: Promote Page (`/promote/[saleId]`)

**Date:** 2026-03-15
**Designer:** findasale-ux
**Status:** Ready for Dev Handoff
**Context Checkpoint:** No

---

## Overview

The Promote page is an organizer-facing tool to help them reach more buyers by exporting their sale listings to external platforms (EstateSales.NET, Facebook Marketplace, Craigslist). The primary goal is to make exporting effortless—no technical knowledge required, no complicated workflows.

**Target User:** Estate sale organizers in Grand Rapids, MI (40-65 age range, often not tech-savvy)
**User Goal:** "I want to promote my sale on other sites without manually re-entering all my item information"

---

## Page Structure & Layout

### Desktop Layout (≥768px)

```
┌─────────────────────────────────────────────────────┐
│  [← Back to Dashboard]                              │
│                                                      │
│  Share Your Sale                                    │
│  Promote your inventory across the web              │
│                                                      │
├─────────────────────────────────────────────────────┤
│                                                      │
│  [Info Card: Item count + watermark note]          │
│                                                      │
│  ┌──────────────────────────────────────────────┐  │
│  │  📋 EstateSales.NET                          │  │
│  │  For dedicated vintage & estate hunters      │  │
│  │  Format: CSV download (spreadsheet)          │  │
│  │  [Export & Download] [Copy to Clipboard]    │  │
│  └──────────────────────────────────────────────┘  │
│                                                      │
│  ┌──────────────────────────────────────────────┐  │
│  │  👥 Facebook Marketplace                     │  │
│  │  Reach millions of local buyers              │  │
│  │  Format: JSON ready to paste                 │  │
│  │  [Export & Download] [Copy to Clipboard]    │  │
│  └──────────────────────────────────────────────┘  │
│                                                      │
│  ┌──────────────────────────────────────────────┐  │
│  │  🏠 Craigslist                               │  │
│  │  For "in the area" household goods           │  │
│  │  Format: Plain text, ready to paste          │  │
│  │  [Export & Download] [Copy to Clipboard]    │  │
│  └──────────────────────────────────────────────┘  │
│                                                      │
│  [Help section: Where to paste your data]          │
│                                                      │
└─────────────────────────────────────────────────────┘
```

### Mobile Layout (<768px)

```
┌────────────────────────┐
│ [← Back]               │
│                        │
│ Share Your Sale        │
│ Promote your inventory │
│                        │
├────────────────────────┤
│                        │
│ [Info Card: full-width]│
│                        │
│ ┌──────────────────┐   │
│ │ 📋 EstateSales   │   │
│ │ For vintage &    │   │
│ │ estate hunters   │   │
│ │ CSV download     │   │
│ │                  │   │
│ │ [Export]         │   │
│ │ [Copy]           │   │
│ └──────────────────┘   │
│                        │
│ ┌──────────────────┐   │
│ │ 👥 Facebook      │   │
│ │ Reach millions   │   │
│ │ [Export]         │   │
│ │ [Copy]           │   │
│ └──────────────────┘   │
│                        │
│ ┌──────────────────┐   │
│ │ 🏠 Craigslist    │   │
│ │ Household goods  │   │
│ │ [Export]         │   │
│ │ [Copy]           │   │
│ └──────────────────┘   │
│                        │
│ [Help section]         │
│                        │
└────────────────────────┘
```

---

## Content & Copy

### Page Header
- **Main Heading:** "Share Your Sale"
  *Why:* "Promote" feels marketing-speak; "Share" feels more human and organizer-friendly.

- **Subheading:** "Export your items to reach more buyers on platforms they already use"
  *Why:* Explains the benefit (reach more buyers) without jargon.

- **Back Button:** Text link "← Back to Dashboard"
  *Why:* Consistent with existing organizer pages; mobile-friendly tap target.

---

### Info Card (Appears above export options)

**Content:**
```
📦 [Item Count] items will be exported
💧 All photos will include a FindA.Sale watermark
ℹ️ Watermarks protect your inventory from unauthorized copying
```

**Styling:**
- Card with light amber background (`bg-amber-50` or `bg-warm-50`)
- Gray text (`text-warm-700`)
- Icon emojis for visual clarity
- No interaction—purely informational

**Logic:**
- Fetch published item count from API
- Show count: "12 items will be exported" (not "12 items in this sale")
- Only show this card if count > 0 (see empty state below)

---

### Export Option Cards

Each card follows this structure:

```
┌─────────────────────────────────────────────────┐
│ [Platform Icon] Platform Name                    │
│                                                  │
│ One-liner benefit statement                      │
│ Format: [Type of download/file]                  │
│                                                  │
│ [Primary Button] [Secondary Button]              │
│                                                  │
└─────────────────────────────────────────────────┘
```

#### Card 1: EstateSales.NET

**Icon:** 📋 (clipboard)
**Platform Name:** EstateSales.NET
**Benefit:** "For dedicated vintage & estate hunters"
**Format Line:** "CSV spreadsheet — download and upload to EstateSales.NET"

**Primary Button:** "Export & Download"
- Icon: ⬇️ (download)
- Color: `bg-amber-600 hover:bg-amber-700`
- On click: Fetch CSV, trigger browser download
- Filename: `sale-{saleId}-estatesales.csv`

**Secondary Button:** "Copy to Clipboard"
- Icon: 📋 (copy)
- Color: `bg-warm-100 hover:bg-warm-200 text-warm-900`
- On click: Fetch CSV as text, copy to clipboard, show toast "Copied! Paste into EstateSales.NET"

**Why CSV?** EstateSales.NET accepts CSV uploads. Organizers can upload the file directly on their platform.

---

#### Card 2: Facebook Marketplace

**Icon:** 👥 (people)
**Platform Name:** Facebook Marketplace
**Benefit:** "Reach millions of local buyers"
**Format Line:** "JSON data — copy and paste into Facebook Marketplace"

**Primary Button:** "Export & Download"
- Icon: ⬇️ (download)
- Color: `bg-amber-600 hover:bg-amber-700`
- On click: Fetch JSON, trigger browser download
- Filename: `sale-{saleId}-facebook.json`

**Secondary Button:** "Copy to Clipboard"
- Icon: 📋 (copy)
- Color: `bg-warm-100 hover:bg-warm-200 text-warm-900`
- On click: Fetch JSON as formatted text, copy to clipboard, show toast "Copied! Paste into Facebook Marketplace"

**Why JSON?** Facebook has no direct CSV import. JSON is human-readable when pasted into a browser developer tools or Facebook's API, but organizers will likely need the help section below to understand what to do with it.

---

#### Card 3: Craigslist

**Icon:** 🏠 (house)
**Platform Name:** Craigslist
**Benefit:** "For household goods and local shoppers"
**Format Line:** "Plain text — copy and paste directly into Craigslist listings"

**Primary Button:** "Export & Download"
- Icon: ⬇️ (download)
- Color: `bg-amber-600 hover:bg-amber-700`
- On click: Fetch plain text, trigger browser download
- Filename: `sale-{saleId}-craigslist.txt`

**Secondary Button:** "Copy to Clipboard"
- Icon: 📋 (copy)
- Color: `bg-warm-100 hover:bg-warm-200 text-warm-900`
- On click: Fetch plain text, copy to clipboard, show toast "Copied! Paste into Craigslist"

**Why Plain Text?** Craigslist is copy/paste friendly. Organizers post one listing per item; this export gives them the text to copy.

---

### Help Section (Collapsible / Always-visible)

**Heading:** "How to use these exports"

**Content (as accordion or always-visible):**

```
📋 EstateSales.NET
1. Click "Export & Download" to save the CSV file
2. Go to EstateSales.NET and log in
3. Find "Upload Inventory" or "Bulk Import"
4. Select the CSV file and upload
5. Review and publish your items

👥 Facebook Marketplace
1. Click "Export & Download" to save the JSON file
2. Go to Facebook Marketplace (on Facebook.com or Facebook app)
3. Click "Create" → "List an item"
4. You'll need to manually create listings, but the data is ready to copy/paste
   (Or share the JSON with a Facebook tech-savvy friend to help you post)
5. Photos are already included and watermarked

🏠 Craigslist
1. Click "Export & Download" or "Copy to Clipboard"
2. Go to Craigslist.org → "Post to Classifieds"
3. Select your category (e.g., "Household Items")
4. Paste the text into the description field
5. Add any additional details and post

💡 Pro Tips
- Always download/copy both the listings AND the photo URLs
- Watermarked photos protect your inventory — don't remove them
- Some platforms require you to host photos separately; FindA.Sale photos are already public
- If you update items on FindA.Sale, re-export to keep platforms in sync
```

**Styling:**
- Slightly smaller text than main content (`text-sm` or `text-base`)
- Secondary color (`text-warm-600`)
- Use icons or emojis for each platform section
- Optional: Make this a collapsible accordion on mobile to save space

---

## Interaction Flows

### Happy Path: Download Export

1. Organizer lands on `/promote/[saleId]`
2. Page loads with sale info and item count
3. Organizer clicks "Export & Download" on one of the platform cards
4. Page shows loading state (spinner or opacity fade)
5. API call: `GET /api/export/[saleId]/[format]` (estatesales-csv, facebook-json, or craigslist-text)
6. Browser downloads file (filename varies by format)
7. Toast appears: "Export ready! Check your downloads folder"
8. Organizer opens the file in Excel, Notepad, or their browser

### Happy Path: Copy to Clipboard

1. Organizer lands on `/promote/[saleId]`
2. Organizer clicks "Copy to Clipboard" on a platform card
3. Page shows loading state
4. API call: `GET /api/export/[saleId]/[format]`
5. Response is copied to browser clipboard
6. Toast appears: "Copied! Ready to paste into [Platform Name]"
7. Organizer switches to the target platform (in another tab or app)
8. Organizer pastes the data (Ctrl+V / Cmd+V)

---

## Error States

### No Published Items
**Trigger:** `GET /promote/[saleId]` when sale has 0 published items

**Display:**
```
┌─────────────────────────────────────────┐
│ 📦 No items to export yet               │
│                                          │
│ You need to publish at least one item    │
│ before you can promote your sale.        │
│                                          │
│ [Add Items] [Edit Sale]                  │
│                                          │
└─────────────────────────────────────────┘
```

**Actions:**
- "Add Items" → `/organizer/add-items/[saleId]`
- "Edit Sale" → `/organizer/edit-sale/[saleId]`

**Tone:** Encouraging, not discouraging. Treat as a call-to-action, not an error.

---

### Export API Failure (500 / 400 / 403)

**Trigger:** API returns error while fetching export

**Display:**
```
Toast: "Export failed. Try again in a moment."
(Standard error toast, auto-dismiss after 3 seconds)
```

**On Retry:**
- Same button remains clickable
- User can try again immediately
- No retry limit

**Why Not Modal?** Toast is less interrupting; organizer can keep the page open and try again.

---

### Not Authorized (403)

**Trigger:** User tries to export a sale they don't own

**Display:**
```
┌─────────────────────────────────────────┐
│ ⚠️ You don't have access to this sale   │
│                                          │
│ Only the sale organizer can export.      │
│                                          │
│ [Back to Dashboard]                      │
│                                          │
└─────────────────────────────────────────┘
```

**Tone:** Not accusatory; just a matter-of-fact boundary.

---

### Sale Not Found (404)

**Trigger:** Sale was deleted or saleId is invalid

**Display:**
```
┌─────────────────────────────────────────┐
│ 🔍 Sale not found                       │
│                                          │
│ This sale may have been deleted or       │
│ moved. Check your dashboard for active   │
│ sales.                                   │
│                                          │
│ [Back to Dashboard]                      │
│                                          │
└─────────────────────────────────────────┘
```

---

## Empty States

### Initial Load / Loading State

**Trigger:** Page loads, waiting for sale data and item count

**Display:**
- Page header loads immediately (static text)
- Info card shows as skeleton: `<Skeleton className="h-20 w-full mb-6" />`
- Three export cards show as skeletons (staggered, 100ms apart for visual rhythm)

**Why Skeleton?** Familiar pattern from rest of app; shows the user that data is loading, not that something failed.

---

## Success States

### After Export / Copy

**Toast Duration:** 3 seconds
**Toast Type:** `success`
**Messages:**

- **Download Success:** "Export ready! Check your downloads folder."
  *Why:* Confirms the action and hints at the next step (finding the file).

- **Copy Success:** "Copied! Ready to paste into [Platform Name]."
  *Why:* Confirms the action and reminds the organizer where to go next.

**Optional Micro-interaction:** Subtle button state change (e.g., button icon changes to ✓ for 1 second, then resets).

---

## Mobile Responsiveness

### Breakpoints

- **Mobile (< 640px):** Single-column layout; buttons full-width
- **Tablet (640–1024px):** Single-column; wider cards (max-width: 600px)
- **Desktop (> 1024px):** Max-width container (800–900px centered)

### Mobile-Specific Adjustments

1. **Buttons:** Full-width stacked buttons (primary on top, secondary below)
   ```
   [Export & Download]
   [Copy to Clipboard]
   ```
   Instead of side-by-side.

2. **Card Spacing:** Increase vertical rhythm (gap between cards)
   - Desktop: `gap-6`
   - Mobile: `gap-4` (to account for screen size)

3. **Help Section:** Collapsible accordion on mobile to save vertical space
   - "How to use these exports" can be a `<details>` element
   - Expanded state shows full help text
   - Desktop: Always visible, no accordion needed

4. **Font Sizing:**
   - Platform names: `text-lg` (desktop) → `text-base` (mobile)
   - Benefit text: `text-base` (desktop) → `text-sm` (mobile)
   - Help section: `text-sm` (both) → `text-xs` for secondary tips on mobile

5. **Tap Targets:** All buttons min-height 44px, min-width 44px (WCAG AA)
   - Primary button: `py-3 px-4`
   - Secondary button: `py-2 px-3` (min 44px in height)

6. **Safe Area on PWA:** If running as installed PWA on iPhone, account for notch/safe area with `safe-area-inset-*` if needed

---

## Accessibility Notes

### Keyboard Navigation
- Tab order: Back link → Info card text (no interaction) → Card 1 buttons → Card 2 buttons → Card 3 buttons → Help section (if expandable)
- All buttons must be keyboard-accessible (already provided by Next.js)
- Card text is not focusable (not interactive)

### Screen Reader
- Info card should have `role="status"` or `aria-live="polite"` (non-intrusive announcement of item count)
- Each export card should be a `<section>` with an `aria-label`:
  ```
  <section aria-label="Export to EstateSales.NET">
    ...
  </section>
  ```
- Buttons should have descriptive `aria-label` if icon-only:
  ```
  <button aria-label="Download export as CSV file">
    ⬇️ Export & Download
  </button>
  ```
- Help section: If collapsible, use `<details>` and `<summary>` (native semantics) or ARIA `aria-expanded`

### Color Contrast
- Info card text on `bg-warm-50`: Ensure `text-warm-700` meets 4.5:1 ratio (likely yes; test with axe)
- Button text on `bg-amber-600`: White text should meet 4.5:1 (standard Tailwind colors do)
- Links in help section: Use `text-amber-600` with underline to meet 4.5:1 and distinguish from plain text

### Motor Accessibility
- No double-click required
- No time limits on interactions
- Buttons are large enough for users with limited dexterity (44px min)
- Copy to clipboard doesn't require precise clicking (standard button size)

---

## Dev Handoff Instructions

### Frontend: promote.tsx Page Structure

1. **Create file:** `packages/frontend/pages/promote/[saleId].tsx`

2. **Page Layout:**
   ```tsx
   export default function PromotePage() {
     return (
       <Layout>
         {/* Page structure as outlined above */}
       </Layout>
     );
   }
   ```

3. **State Management:**
   - Use `useQuery` to fetch sale data and item count: `GET /api/sales/[saleId]`
   - Use `useAuth` to verify organizer access
   - Use `useState` for loading states during export (one boolean per export option, or a single `loadingPlatform` string)

4. **API Integration:**
   - On export button click, call `GET /api/export/[saleId]/estatesales-csv` (etc.)
   - Trigger download: Use `blob` response + `<a href={blobUrl} download="filename">` pattern
   - Trigger copy: Use `navigator.clipboard.writeText()`

5. **Toast Usage:**
   - Import `useToast` from `components/ToastContext`
   - Call `showToast("message", "success")` or `showToast("message", "error")`

6. **Mobile Responsiveness:**
   - Use Tailwind breakpoints: `lg:` for desktop adjustments
   - Stack buttons vertically on mobile: `flex flex-col gap-2`
   - Help section: Use `<details>` for mobile accordion, show always on desktop

7. **Loading States:**
   - Show `Skeleton` components while fetching sale data
   - Show button opacity fade or spinner icon during export download/copy

8. **Error Handling:**
   - 404: Render empty state "Sale not found"
   - 403: Render empty state "Not authorized"
   - 400: Toast "No items to export"
   - 500: Toast "Export failed"

### Backend: Route Registration (Already Specified in ARCHITECTURE_SPEC)

Routes should be registered in `packages/backend/src/routes/exportRoutes.ts`:
- `GET /api/export/:saleId/estatesales-csv`
- `GET /api/export/:saleId/facebook-json`
- `GET /api/export/:saleId/craigslist-text`

All handlers verify auth, check ownership, and return appropriate status codes.

### Shared: Types (If Needed)

No new types required beyond existing `Sale` and `Item` types. Export responses are raw (CSV string, JSON object, plain text).

---

## Design Tokens & Patterns

### Colors
- **Primary Action (buttons):** `bg-amber-600` (matches existing organizer buttons)
- **Secondary Action:** `bg-warm-100` text `text-warm-900`
- **Info Card Background:** `bg-warm-50` or `bg-amber-50`
- **Text (primary):** `text-warm-900`
- **Text (secondary):** `text-warm-600`
- **Links:** `text-amber-600 underline`

### Typography
- **Page Heading:** `text-3xl font-bold text-warm-900` (desktop) → `text-2xl` (mobile)
- **Subheading:** `text-lg text-warm-600`
- **Card Titles:** `text-lg font-semibold text-warm-900`
- **Card Benefit:** `text-base text-warm-600`
- **Card Format:** `text-sm text-warm-500`
- **Help Text:** `text-sm text-warm-600`

### Spacing
- **Page Container:** `max-w-4xl mx-auto px-4` (matches existing organizer pages)
- **Card Gap:** `gap-6` (desktop) → `gap-4` (mobile)
- **Button Gap (within card):** `gap-2` (stacked) or `gap-3` (side-by-side on larger screens)
- **Section Margins:** `mb-8` between major sections

### Components
- **Card:** Use existing `.card` class if available, or `border rounded-lg bg-white p-6`
- **Button:** `py-2 px-4` (secondary) or `py-3 px-6` (primary), `rounded-lg`, `transition-colors`
- **Icon:** Emoji (no Icon library needed) or simple SVG
- **Skeleton:** Use `Skeleton` component from `components/Skeleton`
- **Toast:** Use `showToast()` from `ToastContext`
- **Empty State:** Use `EmptyState` component from `components/EmptyState`

---

## Open Questions for Patrick

1. **Facebook Marketplace Workflow:** Organizers may struggle with "paste JSON into Facebook." Should we provide a link to a help article, or consider a different format? (E.g., a CSV that Facebook can import?)

2. **Watermark Customization:** The spec shows a semi-transparent bottom-right watermark. Is this sufficient, or would you like it more prominent or differently positioned?

3. **Export Frequency:** Should we limit how often an organizer can export (e.g., once per hour)? Or no limit?

4. **Item Count in Header:** Should the item count update in real-time if items are published/unpublished while the page is open? Or is a simple page refresh fine?

5. **File Format Defaults:** Do organizers prefer "Download" or "Copy to Clipboard" as the primary action? (Currently, Download is primary; Copy is secondary.)

---

## Accessibility Checklist (findasale-ux responsibility)

- [x] Page title is descriptive: "Share Your Sale — [Sale Name]"
- [x] All labels are plain English (no jargon)
- [x] Primary action (Download/Copy) is visually distinct
- [x] Empty states have CTAs
- [x] Keyboard navigation order is logical
- [x] No time limits on interactions
- [x] Buttons are min 44px tap target
- [x] Color contrast meets WCAG AA (4.5:1 for text, 3:1 for graphics)
- [x] Icons have `aria-label` if icon-only
- [x] All form elements (if any) have labels
- [x] Error messages are clear and suggest recovery
- [x] Page works on mobile without horizontal scrolling

---

## Summary

The Promote page should feel like three easy options—not a complicated export tool. Each platform card is self-contained, with clear copy that explains what it's for and how to use it. Organizers should be able to click "Export" or "Copy" and have the data ready to use, with minimal additional steps. The help section provides guidance for those who need it, but isn't required to complete the task.

**Success Metrics:**
- Organizer can export to any platform in ≤3 clicks
- No errors on export (unless API fails, which is handled gracefully)
- Organizer understands what each platform is for (from the benefit line)
- Mobile experience is as smooth as desktop
