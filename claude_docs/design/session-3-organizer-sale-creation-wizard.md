# Design Session 3 — Organizer Sale Creation Wizard
FindA.Sale · May 2026 · Mid-fi target

---

## Context

FindA.Sale is a two-sided PWA for secondary sale organizers (estate sales, yard sales,
auctions, flea markets, antique malls) and shoppers. Organizers post sales, add inventory,
and manage their listings. Shoppers browse, save, and buy.

**Stack:** Next.js PWA, mobile-first. Organizers primarily use the product on desktop to
create sales and manage inventory, but mobile matters for day-of management.

**Brand voice:** Warm, local, knowledgeable. No "AI" in copy — use "Smart" or "Auto."
Give organizers confidence they're doing it right; don't make them feel like they're
filling out a form.

**Design system established in Sessions 1–2:** Three-tier organizer storefronts
(Simple / Pro / Teams), dark/light theme tokens, icon set. Reuse those tokens here.

---

## What this surface is

The sale creation wizard is the **most-used feature in the entire product** from an organizer's
perspective. Every sale starts here. Every item gets added through it (or through the item
manager it leads into). If this flow is slow, confusing, or error-prone, organizers churn.

It connects directly to the Onboarding Card (Session 1 Brief B): completing Step 1 of 5
("Create Your First Sale") is what triggers the onboarding card to dismiss and reveal the
full dashboard. That means this wizard is also the **activation gate** — organizers who finish
it are retained; those who abandon it are lost.

**Current state:** A basic multi-field form exists but has no step-by-step design, no photo-first
flow, and no progressive disclosure. It's a long page that organizers scroll through linearly.

---

## What exists in the data

**Sale model (what gets created):**
- `title` — sale name
- `description` — optional freetext
- `saleType` — ESTATE / YARD / AUCTION / FLEA_MARKET (controls downstream features)
- `startDate`, `endDate` — date range
- `address`, `city`, `state`, `zip` — physical location
- `lat`, `lng` — geocoded from address
- `entranceLat`, `entranceLng`, `entranceNote` — parking/entrance (optional)
- `photoUrls[]` — sale-level photos (Cloudinary upload)
- `tags[]` — free-form searchable tags
- `notes` — day-of approach notes
- `holdDurationHours` — how long holds last (default 48h)
- `returnWindowHours` — optional return window
- `status` — DRAFT on creation, organizer publishes when ready

**SaleTemplate model (reuse past sales):**
- Organizers can save a sale as a template (name, description, defaultItems, settings)
- `usedCount` tracks how many times it's been used
- On creation, organizer can start from a blank sale or from a saved template

**Item model (created after sale, but wizard should prime the flow):**
- `title`, `description`, `price`
- `category` — eBay L1 category (e.g., "Home & Garden", "Jewelry & Watches")
- `condition` — NEW / USED / REFURBISHED / PARTS_OR_REPAIR
- `rarity` — COMMON / UNCOMMON / RARE / ULTRA_RARE / LEGENDARY
- `photoUrls[]` — item photos (Cloudinary, camera capture on mobile)
- `listingType` — FIXED / AUCTION / REVERSE_AUCTION / LIVE_DROP / POS
- `shippingAvailable`, `shippingPrice`
- `isAiTagged` — true when Smart tagging was used

**Organizer branding available to apply to sale:**
- `brandLogoUrl`, `brandPrimaryColor`, `brandBannerImageUrl`

---

## The wizard flow — 5 steps

Design this as a **linear stepper**, not a tab nav. Organizers should feel forward momentum.
Step indicator persists at top. Each step is one screen (or one scroll on mobile).
"Save as draft and continue later" is available at every step.

### Step 1 — Sale type + name
**The first choice shapes everything else.** Picking AUCTION unlocks lot/bidding settings.
FLEA_MARKET unlocks vendor booth count. ESTATE is the default.

- Large-format type selector: 4 options with icons and one-line descriptions
  - Estate Sale — "Whole-home contents, priced to sell"
  - Yard / Garage Sale — "Driveway, porch, or lawn sale"
  - Auction — "Bidding, lots, and timed closes"
  - Flea Market / Pop-Up — "Multi-vendor or recurring market"
- After type is selected: title input appears below. Pre-filled suggestion based on type
  (e.g., "Smith Family Estate Sale" for estate, using organizer businessName).
- Optional: description (collapsed by default — "Add a description →" expander)

### Step 2 — Dates and location
- Date range picker — start and end date (same day for single-day, multi-day supported)
- Time range — start time / end time per day. If multi-day: "Same hours each day" toggle or per-day override.
- Address input with autocomplete. On confirm, show a map pin preview.
- Optional: entrance/parking note ("Where should shoppers park or enter?") — text input with a
  small map that lets them drop a second pin for the entrance location.

### Step 3 — Photos ← most important step
**Photo-first is the #1 driver of discoverability and shopper trust.** This step should feel
like the heart of the wizard, not a checkbox.

- Full-screen camera/upload interface on mobile
- Drag-to-reorder on desktop
- First photo is always the hero (labeled "Cover photo")
- Minimum soft target: 3 photos. Show progress: "1 of 3 recommended" as photos are added.
- Photo tips: brief, friendly nudge — "Photos of your best items get 3x more saves"
- If organizer skips: allow it, but show a warning: "Sales without photos get far fewer views.
  You can add them before you go live."
- On mobile: camera button is primary, upload from library is secondary

### Step 4 — Details (progressive by sale type)

**All sale types:**
- Tags (what you'll find) — chip selector with common options + free-type. Examples: "Furniture", "Jewelry", "Vintage", "Tools", "Clothing", "Books", "Collectibles", "Kitchen"
- Notes — "Any day-of info for shoppers? (parking, entrance, sale rules)"

**Auction only — extra fields appear:**
- Bidding type: Timed online / Live in-person / Both
- Buyer's premium % (optional)
- Preview dates (when can bidders view items in person)

**FLEA_MARKET only:**
- Approximate number of vendors
- Recurring event toggle — "This happens every [month / week]"

### Step 5 — Review + publish

- Summary card: type, title, dates, address, photo count, tag count
- Preview link: "See how your sale page looks" — opens a read-only preview in a new tab
- Three actions:
  - **Publish now** — goes live immediately (primary CTA)
  - **Schedule** — set a publish date/time (Pro/Teams only)
  - **Save as draft** — stay in progress

**After publish:** Celebrate the moment. Full-screen success state:
- Confirmation that the sale is live
- Share card (one tap to share the sale link — native share sheet on mobile)
- Next step prompt: "Add your first item →" (transitions into item manager)
- For new organizers: dismisses the onboarding card and reveals the full dashboard

---

## Start from template flow

For organizers with 2+ past sales, the wizard should offer a template path before Step 1:

- "Start from scratch" vs. "Copy a past sale"
- If template chosen: show their past sales as cards (title, date, photo thumbnail)
- Selecting one pre-fills Steps 1–4 with that sale's data (new dates required, address carries over)
- SaleTemplate model: if organizer has saved named templates, show those first

---

## Item manager (post-wizard, not part of the wizard itself)

The wizard ends at sale publish. After that, organizers add items via a separate Item Manager.
Design the **entry state** for a newly published sale with zero items:

- Empty state: "Your sale is live — now add your items"
- Two paths: "Add items one by one" (manual) or "Bulk upload from photos" (camera roll → Smart tag)
- Smart tagging disclosure: "We'll suggest a title, category, and price — you review before publishing"
- Quick-add card: photo → Smart tag → review → save. Should feel like 15 seconds per item on mobile.

---

## Mobile-specific requirements

Organizers creating sales on mobile (common for day-of setup):

- Camera-first photo step — the native camera button should be the largest tap target on Step 3
- Location autofill from device GPS ("Use my current location") on Step 2
- All form inputs should be large-tap, no tiny text fields
- Keyboard-aware layouts — inputs should not be obscured by the soft keyboard
- Progress is auto-saved — closing the app mid-wizard should resume exactly where they left off

---

## Sale type: AUCTION — special considerations

Auction house organizers have meaningfully different needs. The wizard should feel native to
their workflow, not like a garage-sale form with extra fields bolted on.

- Lot numbering: "Will you add lot numbers to items?" — yes/no toggle (affects item manager UI)
- Bidding platform: "Online bidding through FindA.Sale" vs. "External platform (link only)"
  (For beta: only FindA.Sale bidding is supported — external platform = link field)
- Consignment flag: "Is this a consignment auction?" — if yes, consignor info fields appear on items
- Terms: default terms text field (carries over to storefront Terms card from Session 1)

---

## Data constraints to know

- No per-day hours model yet — `startDate`/`endDate` cover the date range. Per-day time
  overrides are not in schema. Design the per-day hours UI and we'll add the data model.
- The Smart tagging pipeline exists (Cloudinary upload → AI → fields suggested) but requires
  review before save. Never auto-publish AI-tagged items without organizer confirmation.
- Geocoding happens server-side from address — lat/lng are not user-entered.
- `holdDurationHours` and `returnWindowHours` are advanced settings — collapse them behind
  "Advanced settings →" and don't surface them in the main wizard flow.

---

## What to deliver back

1. Wizard step-by-step — all 5 steps, mobile and desktop
2. Start-from-template selection screen
3. Post-publish success state with share card
4. Item manager entry state (new sale, zero items)
5. Quick-add item card (photo → Smart tag → review → save)
6. Auction variant — Steps 1 and 4 showing auction-specific fields
7. Answers to questions below

### Questions for design to answer back

- How should the step indicator behave on mobile — top bar, bottom dots, or side drawer?
- Should the photo step allow video? (We don't support it today, but worth designing for)
- For the post-publish success state: full-screen celebration or inline confirmation?
- How do we handle the case where an organizer tries to publish with no photos and no items — block or warn?
- Should "Save as draft" be explicit (a button) or implicit (auto-save on navigate away)?

