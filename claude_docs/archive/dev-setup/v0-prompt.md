# FindA.Sale — v0.app Prompt

Build a full-featured **Progressive Web App** for **FindA.Sale** — a marketplace platform for estate sales, yard sales, auctions, and flea markets. The app has two distinct user types: **Organizers** (sellers who run sales) and **Shoppers** (buyers who discover and attend). Design in a clean, warm, modern aesthetic: off-white backgrounds, earth-tone accents (amber, terracotta, sage), rounded corners, high-contrast text for outdoor readability, Tailwind-style utility classes. The app must feel trustworthy and professional, not junky or garage-sale cheap.

---

## Global Design System

- **Fonts:** Sans-serif primary (Inter or equivalent). Large, legible sizes — users are often in bright sunlight on mobile.
- **Colors:** Off-white `#FAF9F7` background, amber `#D97706` primary accent, sage green `#6B8F6E` secondary, neutral grays. Red `#DC2626` for destructive. Green `#16A34A` for success/active.
- **Cards:** White with `shadow-sm`, `rounded-2xl`, subtle hover lift.
- **Badges:** Pill-shaped status chips — Active (green), Ended (gray), Draft (amber), Hold (blue), Sold (red).
- **Navigation:** Bottom tab bar on mobile (Home, Search, Map, My Stuff, Profile). Sidebar on desktop.
- **PWA-ready:** All screens designed for 390px mobile width first.

---

## Screen 1 — Shopper: Home / Discovery Feed

**Route:** `/`

A warm landing page for shoppers. Top section: location-aware greeting ("Sales near Grand Rapids this weekend"). Below: horizontally scrollable **Sale Cards** showing sale photo, organizer name, date range, distance, item count, and a "47 people interested" social proof chip. Below that: **Category Quick-Links** row — icons for Furniture, Antiques, Clothing, Electronics, Books, Tools, Art, Collectibles. Below: **Trending Items** grid (masonry, 2-col mobile) showing item photo cards with title, price, sale name. Footer nudge: "Feeling lucky? Try Surprise Me →" linking to `/surprise-me`.

**Components:**
- `SaleCard` — hero photo, organizer badge, date pill, distance, item count, hype meter ("47 viewing")
- `CategoryIcon` — icon + label, tappable pill
- `ItemThumbCard` — photo, title, price, sale name, condition grade badge (S/A/B/C)
- `HypeMeter` — subtle animated pulse dot + "X people viewing"

---

## Screen 2 — Shopper: Map + Heatmap View

**Route:** `/map`

Full-screen Leaflet-style map. Sales shown as **custom map pins** — amber circle with organizer initials or thumbnail. Background: **density heatmap overlay** with color-coded zones (green = 1–2 sales, amber = 3–5 sales, red = 6+ sales in radius). Top: search bar overlay with "Search this area" pill button. Bottom sheet (draggable): list of sales in view, sorted by distance. Each row: sale name, organizer, date, item count, distance. Tap a pin → bottom sheet expands to that sale's preview card with "Get Directions" button. "Plan Route" FAB (floating action button) lets shoppers select 2–5 sales to build an optimized driving route (OSRM). Route result shows stop order, drive times, total distance.

**Components:**
- `MapPin` — animated, cluster-capable
- `HeatmapLayer` — color gradient overlay
- `SaleBottomSheet` — draggable, snappable
- `RouteBuilder` — multi-stop selector + OSRM result card with turn-by-turn summary
- `EntrancePin` — secondary pin type showing parking/entry point (distinct icon)

---

## Screen 3 — Shopper: Sale Detail Page

**Route:** `/sales/[id]`

Hero image (sale photos carousel). Sale title, organizer name + **Reputation Score** (star rating 1–5 with review count). Date/time range, address with small inline map preview showing **entrance pin**. "Add to Calendar" + "Remind Me" buttons. **Hype Meter** bar: "312 people are watching this sale." Live Sale Feed strip (scrolling ticker): "Victorian lamp just sold · Eames chair hold placed · 14 new items added." Item grid below (filterable by category, condition, price range). Each item card shows photo, title, price, condition grade, AI-suggested tags as small pills, hold/favorite buttons.

**Components:**
- `SaleHero` — carousel with pagination dots
- `OrganizerBadge` — avatar, name, reputation stars, verified badge (if earned)
- `LiveFeedTicker` — horizontal scroll, auto-advancing sale activity
- `ItemGrid` — 2-col masonry on mobile, filterable
- `ItemCard` — photo, title, price, condition grade chip, tag pills, ❤️ favorite + 🔒 hold CTA
- `EntranceMapPinCard` — mini map with entrance/parking pin callout

---

## Screen 4 — Shopper: Item Detail Page

**Route:** `/items/[id]`

Photo viewer (swipeable, full-width). Below: item title (large), price (XL bold), condition grade badge with definition tooltip ("A — Excellent: minor wear only"). AI-generated tag pills: "mid-century modern · teak · Danish · 1960s." Description paragraph. Sale info card: organizer, sale name, dates, address. Action bar: "Request Hold (48h)" button (primary), "Add to Wishlist" (secondary), Share button. Shopper logged in → hold confirmation modal with expiry timer. Below: "More from this sale" horizontal scroll of similar items.

**Components:**
- `PhotoViewer` — swipe gallery, zoom-capable
- `ConditionGrade` — colored badge (S=emerald, A=green, B=amber, C=orange, D=red) with popover definition
- `TagPill` — small rounded chip, tappable for tag browse
- `HoldModal` — 48h countdown clock confirmation
- `SimilarItemsRail` — horizontal scroll

---

## Screen 5 — Shopper: Surprise Me (Serendipity Search)

**Route:** `/surprise-me`

Playful single-screen. Large shuffling card animation — item photo fills screen with price and sale name overlaid. "Next →" swipe or button. Filter row at top: category chips, price range slider, distance toggle. "Save This" and "Skip" buttons at bottom. After 10 skips: "Want us to alert you when something like this appears?" prompt → Wishlist Alert setup flow.

---

## Screen 6 — Shopper: Loot Log (Purchase History)

**Route:** `/my/purchases`

Personal gallery of everything the shopper has bought. Masonry grid of purchased items — photo, item name, sale name, price paid, date. Tap item → **Digital Receipt** modal: full receipt with itemized list, photos, organizer name, sale address, total, platform notes. "Share My Haul" button generates a shareable image card (OG-style) of top finds. Loyalty Passport widget at top: stamp grid showing sale attendance badges, current streak ("Weekend Warrior — 3 weekends in a row!"), next reward unlock progress bar.

**Components:**
- `LootGrid` — masonry purchase gallery
- `DigitalReceipt` — modal with item photos, price breakdown, organizer contact
- `LoyaltyPassport` — stamp card UI, badge gallery, streak counter, progress bar

---

## Screen 7 — Shopper: Collector Passport

**Route:** `/my/collector`

Identity-based collection profile. Header: "What do you collect?" with editable tag cloud (Depression glass · Fiestaware · MCM furniture · Vinyl records). Below: **Active Alerts** — categories/tags/organizers the shopper follows, each showing "3 matching items found this week" with mini previews. Alert cards have edit/delete. "Add New Interest" CTA opens tag-picker drawer. Below: **Collection Gallery** — items the shopper has favorited organized by collector category. Near-Miss Nudges strip: "You're 1 find away from completing your Fiestaware set!"

---

## Screen 8 — Organizer: Dashboard (Command Center)

**Route:** `/organizer/dashboard`

Top: greeting + quick stats row — Active Sales, Total Items Listed, This Week's Revenue, Pending Holds. Below: **Active Sales** list with per-sale cards: sale name, status chip, item count, hold count, revenue to date, quick actions (Manage Items, View Holds, Open POS). Sales in "Draft" state show a **Listing Health Score** progress bar ("Sale health: 72% — 3 items need photos"). Below: **Alert Feed** — "Sale A: 2 holds expired," "Item #47 has 14 people viewing," "Payout of $234 processing." Mode toggle in top-right: **Simple / Pro / Enterprise** pill selector — switches which features and complexity are visible.

**Simple mode:** 5 actions visible: Create Sale → Add Items → Set Prices → Publish → Get Paid.
**Pro mode:** Full dashboard with batch ops, analytics, branding, export tools.
**Enterprise mode:** Multi-sale command center, API access badge, team management stub.

**Components:**
- `StatBar` — 4-up metric tiles
- `SaleCommandCard` — per-sale overview with health score
- `AlertFeed` — chronological activity list
- `ModeTierToggle` — Simple/Pro/Enterprise pill

---

## Screen 9 — Organizer: Rapidfire Camera Intake

**Route:** `/organizer/add-items/[saleId]`

Three tabs: **Rapid Capture**, **Camera**, **CSV Import**.

**Rapid Capture tab:** Full-screen camera view. Bottom: shutter button (large circle), torch toggle, camera flip, gallery picker. Top: mode toggle pill (Single / Rapid). In Rapid mode: each shutter press adds photo to a bottom carousel strip — thumbnails appear left-to-right with a "+" add-photo-to-item badge. After capture session: "Review 12 drafts →" button. 4:3 crop guide overlay. Auto-enhance ✨ badge appears on enhanced photos.

**Review/Publish screen** (after Rapid session): Grid of draft item cards. Each card: photo, AI-suggested title, AI-suggested price, condition grade (AI-suggested, editable), tag pills, **Listing Health Score** mini bar (photo ✅, title ✅, price ✅, tags ⚠️). Batch toolbar at top: Select All, Bulk Price, Bulk Category, Bulk BG Removal. Per-item expand panel: aspect ratio toggle (4:3/1:1/16:9), background removal toggle, brightness/contrast sliders, auto-enhance toggle. "Publish All" button at bottom.

**Components:**
- `RapidCameraView` — camera with carousel strip
- `DraftItemCard` — photo, AI fields, health score bar
- `BatchToolbar` — floating multi-select actions
- `HealthScoreBar` — color-coded progress (red <40%, amber 40–70%, green >70%)
- `ConditionGradePicker` — S/A/B/C/D selector with AI suggestion highlighted

---

## Screen 10 — Organizer: Listing Factory

**Route:** `/organizer/listing-factory/[saleId]`

Post-publish export hub. Left panel: item list with checkboxes. Right panel: **Export Options**.

Export options:
1. **EstateSales.NET Import Pack** — CSV in their format, download ZIP
2. **Facebook Marketplace** — pre-filled text + photo pack download
3. **Instagram / Facebook Post** — social template cards with tone selector (Casual / Professional / Friendly), auto-filled with item tags + sale hashtags, preview shows OG-style card with organizer branding + watermark
4. **Share Card** — individual item share cards (Cloudinary OG format), downloadable

Listing Health Score summary at top: "14 items ready to export, 3 items need attention." Tag editor inline: AI-suggested tags shown with confidence dots, organizer can add/remove from curated vocabulary (30–50 standard tags shown as selectable pills + 1 free-form slot). **Organizer Brand Kit** banner (Pro/Enterprise): logo upload, brand color picker — previews applied to all export templates.

---

## Screen 11 — Organizer: Point of Sale (POS)

**Route:** `/organizer/pos/[saleId]`

Dark-mode optimized screen for use in bright/outdoor conditions. Top: sale name + Stripe Terminal connection status (green dot "Reader connected" / amber "Connecting...").

**Item entry area:** Search bar to find listed items by name/ID OR quick-add misc buttons: 25¢, 50¢, $1, $2, $5, $10. Below: **Cart** — list of items with title, price, × remove button. Cart total (large, bottom).

**Numpad panel** (collapsible): 12-key numeric pad for custom price entry and cash received.

**Payment row:** "Charge Card" (Stripe Terminal — WisePOS E/S700) + "Accept Cash" buttons. Cash flow: enter cash received → shows change due → confirm → receipt generated. Card flow: "Tap, swipe, or insert" waiting state → success animation. Post-payment: **Digital Receipt** prompt ("Text or email receipt?").

**Components:**
- `CartItem` — title, price, remove
- `MiscQuickAdd` — denomination buttons
- `Numpad` — collapsible 12-key
- `PaymentMethodRow` — Card + Cash CTAs
- `CashChangeCalc` — real-time change display
- `ReceiptPrompt` — email/SMS post-sale

---

## Screen 12 — Organizer: Holds Management

**Route:** `/organizer/holds/[saleId]`

Holds-only filtered view. Top filter: All Holds / Active / Expired / Cancelled. Each hold card: item photo thumbnail, item name, price, buyer name/email, hold placed time, **expiry countdown** (amber when <6h, red when <1h), Release / Extend / Mark Sold actions. Grouped-by-buyer toggle: flips layout to show "Buyer: Sarah M. — 3 items on hold" expandable rows.

**Components:**
- `HoldCard` — item + buyer + timer + actions
- `ExpiryCountdown` — animated color-shifting timer
- `GroupByBuyerToggle` — layout switcher

---

## Screen 13 — Organizer: Seller Performance Dashboard + Price Intelligence

**Route:** `/organizer/insights`

**Overview tab:** Revenue over time chart (line, 30/90/all). Category breakdown donut. Top items by revenue table. Sell-through rate by category. Per-sale selector dropdown.

**Price Intelligence tab:** Per-category benchmarks — "Your avg. furniture price: $45. Platform avg: $62. You may be underpricing." Price range histograms by category. **Seasonal Pricing Templates** card: "It's spring — outdoor furniture and garden tools typically sell 23% above baseline. Suggested price bump: +15%." AI confidence-tagged suggestions.

**Flip Report panel** (Pro/Enterprise): Post-sale PDF export — "What sold, what didn't, suggested prices for next time." Preview inline, download button.

---

## Screen 14 — Organizer: Payout Dashboard

**Route:** `/organizer/payouts`

Summary cards: Lifetime Earnings, Pending Payout, Cash Fee Balance (with info tooltip: "10% fee on cash sales — deducted from next payout"), Referral Discount badge (green banner if active: "Referral discount active — 0% fee until [date]").

Per-sale earnings table: item name, sale price, platform fee (10%), est. Stripe fee, **net payout**. Expandable rows. "Download Earnings PDF" button. Cash fee balance card shows running total + deduction preview for next Stripe payout.

---

## Screen 15 — Organizer: Open Data Export

**Route:** `/organizer/settings/export`

Clean settings-style screen. "Your data is yours." Export options as action rows: items.csv, sales.csv, purchases.csv, analytics.csv, Photos (Cloudinary URLs in ZIP). Each row: description, last exported date, "Export Now" button. On click: "Preparing your export — you'll receive an email with a download link." Status spinner → "Sent to [email]" confirmation.

---

## Screen 16 — Organizer: Reputation Profile (Public)

**Route:** `/organizers/[slug]`

Public-facing organizer profile. Header: organizer photo/logo, name, **Reputation Score** (large star display, sub-metrics: response time ★, sale frequency ★, photo quality ★, dispute rate ★). "New Organizer" badge for <5 sales. Verified Organizer badge (checkmark). Bio/description. Past sales list with dates, item counts, sold percentages. Shopper reviews section. "Follow this Organizer" button (triggers push/email alerts for new sales).

---

## Screen 17 — Neighborhood Sale Day / Sale Hub

**Route:** `/hubs/[hub-id]`

Group sale event page. Map showing all participating organizers' locations with numbered pins. "Weekend Sale Circuit — 6 sales, 2.3 mile radius." Combined item count, date range. Participating organizers grid (avatar + name + item count). "Plan My Route" CTA opens RouteBuilder pre-loaded with all hub sales. Hub-branded social share card. Email reminder signup.

---

## Screen 18 — Weekly Treasure Digest (Email Preview)

**Design as a rendered email template (HTML email layout):**

Header: FindA.Sale logo + "Your Weekly Treasure Digest." Section 1: "Sales near you this weekend" — 3 sale cards with photo, name, date, distance. Section 2: "Trending Items" — 4 item cards, photo + price + sale name. Section 3: "New from organizers you follow" — 2 organizer activity cards. Footer: preferences link, "Snooze emails for 30 days" link (not unsubscribe).

---

## Key Interaction Notes for v0

- **Condition Grade badges** always use consistent color coding: S=emerald, A=green, B=amber, C=orange, D=red
- **Health Score bars** always show fill color: <40% red (blocked, shows "Add photo to publish"), 40–70% amber (nudge), >70% green (publish ready)
- **Hold countdown timers** animate from green → amber → red as expiry approaches
- **Mode Tier** (Simple/Pro/Enterprise) should visibly simplify or expand the organizer dashboard — Simple shows 5 large action buttons, Pro shows full feature set, Enterprise adds command center panels
- **All item photos** support 4:3 aspect ratio as default (fits estate sale photography)
- **POS screen** uses dark background (`#1C1917`) for glare reduction outdoors
- **Live Sale Feed** is a subtly animated horizontal ticker — don't make it intrusive
- **Reputation Score** sub-metrics displayed as small colored star rows, not just a single number
- **Surprise Me** uses a full-bleed photo card with swipe affordance — think Tinder card stack

---

## Pages to Generate (Priority Order)

1. Shopper Home (Screen 1)
2. Organizer Dashboard — Pro mode (Screen 8)
3. Rapidfire Camera + Review (Screen 9)
4. POS Screen (Screen 11)
5. Sale Detail — Shopper (Screen 3)
6. Listing Factory (Screen 10)
7. Seller Performance Dashboard (Screen 13)
8. Item Detail — Shopper (Screen 4)
9. Holds Management (Screen 12)
10. Loot Log + Loyalty Passport (Screen 6)
