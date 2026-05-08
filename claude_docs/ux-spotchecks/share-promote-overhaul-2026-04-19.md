# UX Spec: Share & Promote Overhaul
Date: 2026-04-19 | Session: S520

## Problem Summary
The Share Your Sale promote page and Share & Promote modal have several usability problems that prevent organizers from effectively distributing their sale listings. The page is hidden, the two social post generators are confusing, platform priorities don't match the audience, and there's a live time bug in the modal.

## Root Causes (from live site audit + code review)

### 1. Time Bug — SharePromoteModal.tsx line 97
`const time = format(parseISO(sale.startDate), 'h:mm a');`
The Sale schema stores `startDate` as a DateTime with no guaranteed time component (no startTime/endTime fields exist). This produces garbage time values (live site showed "10:01 PM"). Fix: remove time from all templates. No schema change needed.

### 2. Facebook Marketplace copy is misleading
Button says "Export & Download" / description says "copy and paste into Facebook Marketplace" — but FB Marketplace has no JSON import. The downloaded file is reference data only. Fix: rename button to "Download Data", update description to be honest.

### 3. Two separate social post generators
- Page body: per-item generator (`/social/${itemId}/template` API), Instagram/Facebook only
- Modal: static string templates for whole sale, 8 tabs
No clear mental model for why these are separate. Fix: keep both but consolidate into modal (move per-item generator to a "Spotlight an Item" tab in the modal), remove it from the page body.

### 4. Platform priority wrong for audience
Estate/yard sale organizers use Facebook Groups and Nextdoor most. Modal buries Nextdoor as tab 8. Fix: reorder modal tabs, add Nextdoor as a first-class action card on the promote page itself.

### 5. No WhatsApp
Common share method for organizers texting their regulars. Fix: add WhatsApp card/button.

### 6. No discovery path
No post-publish nudge, no dashboard CTA, no in-flow moment. Fix: post-publish banner on dashboard + sale-day reminder banner.

## Batch A: Modal + Promote Page Fixes
Files: SharePromoteModal.tsx, [saleId].tsx

### A1 — Fix time bug (SharePromoteModal.tsx)
- Remove `const time = format(...)` line (line 97)
- Remove all `🕐 ${time}` references from template strings (social, flyer, email, neighborhood)
- In email/flyer where time is shown, replace with placeholder: `[Your Hours]` so organizer fills it in

### A2 — Fix Facebook Marketplace card ([saleId].tsx)
- Change ExportCard description: "Your item data formatted for Facebook Marketplace. Download the file, then open Facebook Marketplace and create listings using the details inside."
- Change buttonText from "Export & Download" to "Download Data"
- Change secondaryButtonText from "Copy to Clipboard" to "Copy Item Data"
- Update How-to-use instructions for Facebook to match honest framing

### A3 — Add Nextdoor as a first-class card ([saleId].tsx)
- Add a 4th card to the export grid (change to `md:grid-cols-2 lg:grid-cols-4`)
- Nextdoor card: icon 🏡, title "Nextdoor", description "Share with neighbors. Copy a ready-to-paste post for your local Nextdoor feed."
- Two buttons: "Copy Post" (copies the modal's nextdoor template content) and "Open Nextdoor" (opens nextdoor.com/news_feed/)
- The "Copy Post" button generates the Nextdoor template inline using the same logic as the modal (sale title, dates, address, city, item count)

### A4 — Add WhatsApp quick-share ([saleId].tsx)
- Add a "Share via WhatsApp" button below the 4-card grid (or as a 5th card)
- WhatsApp URL: `https://wa.me/?text=${encodeURIComponent(message)}`
- Message template: `Check out ${sale.title}! ${startDate}–${endDate} at ${address}. Browse items at: ${saleUrl}`
- Falls back to clipboard copy if on desktop

### A5 — Reorder modal tabs (SharePromoteModal.tsx)
New tab order: Social Post → Nextdoor → Neighborhood Post → Facebook → Threads → Email Invite → Flyer Copy → Pinterest → TikTok
Rationale: leads with highest-value platforms for this audience

### A6 — Add "Spotlight an Item" tab to modal (SharePromoteModal.tsx)
- New tab: "Spotlight" with icon 🔦
- Contains the per-item social generator (tone selector, platform selector, item dropdown)
- Uses existing `/social/${itemId}/template` API endpoint
- Requires `items` prop to be passed to SharePromoteModal (add to interface)
- Once this tab exists, remove the "Create Social Posts" section from the promote page body

## Batch B: Dashboard Discovery
Files: dashboard.tsx

### B1 — Post-publish share banner
- When a sale has `status === 'PUBLISHED'`, show a dismissible amber banner below the sale card: "🎉 Your sale is live! Share it to get more buyers."
- Three inline quick-action buttons: [Copy Link] [Generate Post →] [Get QR Code]
  - Copy Link: copies `${origin}/sales/${saleId}` to clipboard
  - Generate Post: navigates to `/organizer/promote/${saleId}` (opens modal immediately via `?modal=true` query param)
  - Get QR Code: navigates to `/organizer/promote/${saleId}#qr`
- Dismiss stores `share-prompt-dismissed-${saleId}` in localStorage
- Only shows once per sale (dismissed = never shows again for that saleId)

### B2 — Sale day reminder banner
- Logic: if sale `startDate` is today or tomorrow AND status === 'PUBLISHED'
- Show a teal/info banner: "📅 Your sale starts [today/tomorrow]! One more share could bring in more buyers."
- Two inline quick-action buttons: [Copy Nextdoor Post] [Copy Facebook Post]
- Both buttons copy the relevant template text to clipboard (same content as modal tabs)
- No dismiss — shows every time until sale is ENDED (it's temporary by nature)

## Data Preflight
| Field | Source | Status |
|-------|--------|--------|
| sale.startDate | Sale.startDate | EXISTS — DateTime |
| sale.endDate | Sale.endDate | EXISTS — DateTime |
| sale.status | Sale.status | EXISTS — String (DRAFT/PUBLISHED/ENDED) |
| sale.saleType | Sale.saleType | EXISTS — String |
| sale.title, address, city, state, zip | Sale | ALL EXIST |
| sale.startTime / endTime | Schema | DOES NOT EXIST — remove time from templates |
| items for Spotlight tab | items API | EXISTS — /items/drafts?saleId= |

## No schema changes required.
