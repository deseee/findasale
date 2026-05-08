# Design Session 2 — Sale Detail Page + Shopper First-Run Experience
FindA.Sale · May 2026 · Mid-fi target

---

## Context

FindA.Sale is a two-sided PWA connecting secondary sale organizers (estate sales, yard sales,
auctions, flea markets, antique malls) with shoppers. Organizers post sales and manage
inventory; shoppers browse, save, follow, and buy. The product is in beta with real organizers
and real sales.

**Stack:** Next.js PWA, mobile-first. Dark and light themes. Accent color: `#E97C4D` (dark mode),
`#C8552B` (light mode). Typography: Inter + Inter Tight. Stripe for payments.

**Brand voice:** Warm, local, knowledgeable neighbor — not corporate. Short sentences.
No "AI" anywhere in UI copy. Use "Smart" or "Auto" instead.

**Design system established in Session 1:** Three-tier organizer storefronts (Simple / Pro / Teams),
dark/light theme tokens, icon set, placeholder convention. Reuse those tokens here.

---

## Surface 1 — Sale Detail Page

### What it is
The public page for a single sale: `/sales/[saleId]`
This is the **highest-traffic page in the product** after the homepage. Shoppers land here
directly from Google ("estate sales Grand Rapids this weekend"), from share links, and from
the discovery feed. Most of them have never heard of FindA.Sale before.

### What exists in the data

**Sale fields available:**
- `title`, `description` — organizer-written
- `startDate`, `endDate` — multi-day supported
- `address`, `city`, `state`, `zip`, `lat`, `lng`
- `entranceLat`, `entranceLng`, `entranceNote` — exact parking/entrance location
- `photoUrls[]` — sale photos (Cloudinary)
- `tags[]` — free-form array (e.g. "furniture", "jewelry", "mid-century")
- `saleType` — ESTATE / YARD / AUCTION / FLEA_MARKET
- `status` — DRAFT / PUBLISHED / ENDED (display as: Upcoming / Live / Ended)
- `notes` — day-of approach notes (parking, entrance, hours)
- `holdDurationHours` — how long a hold lasts (default 48h)

**Related data:**
- `organizer` — businessName, tagline, profilePhoto, brandLogoUrl, verificationStatus, avgRating, totalReviews, followers count
- `items[]` — inventory (title, price, category, condition, rarity, photoUrls, listingType, status)
- `reviews[]` — rating (1–5), comment, verifiedPurchase flag, organizer response
- `favorites` — shopper can save the sale (Favorite model, saleId + userId)
- `subscribers` — shopper can subscribe for reminders (phone or email, no account required)
- `rsvps` — formal RSVP for high-demand sales
- `lineEntries` — virtual line / queue position
- `flashDeals` — time-limited item discounts

**Item listing types:**
- FIXED — standard priced item
- AUCTION — proxy bidding, `auctionEndTime` per item
- REVERSE_AUCTION — price drops daily to floor
- LIVE_DROP — item hidden until `liveDropAt`
- POS — cash/in-person only

**Item rarity:** COMMON / UNCOMMON / RARE / ULTRA_RARE / LEGENDARY (badge system)

### Design asks

**Hero section**
- Full-bleed photo at top — first photo in `photoUrls[]` as hero, thumbnail strip below.
  If no photos: striped placeholder with a soft "Photos coming soon" message.
- Sale type pill (ESTATE / YARD / AUCTION / FLEA MARKET) + status pill (UPCOMING / LIVE / ENDED)
  layered over the hero — same system as Session 1 storefront.
- Title large, date/time and address below in a compact info strip.

**Primary action strip (sticky, appears below hero on scroll)**
- Save (heart) — favorites the sale, prompts login if not authed
- Remind Me — subscribes to sale reminders (phone or email, no account needed)
- Share — native share sheet on mobile, copy link on desktop
- If LIVE: "View Items" CTA is primary and bold
- If ENDED: Replace action strip with "Follow [Organizer] for next sale"

**Sale info section**
- Dates and times — multi-day display: show each day with hours if available
- Address with map thumbnail — tap opens native maps app
- Entrance/parking note if `entranceNote` is set (styled as a tip, not an address)
- Day-of notes (`notes` field) — prominent, not buried

**Items preview section**
- Show first 8–12 items in a grid (photo-first cards)
- Each card: photo, title, price (or bid status for auctions), rarity badge if RARE+, listing type indicator
- "View all [N] items" expansion
- Empty state: "Inventory being added — check back soon" with a Remind Me CTA
- Auction items show current bid + time remaining; reverse auctions show current price + floor

**Tags / categories**
- Horizontal scrollable chip row below items: what you'll find at this sale
- Tapping a tag filters the items grid

**Organizer mini-profile**
- Card at bottom of main content (or side rail on desktop)
- Logo, name, verification badge, star rating + review count, follower count
- "Follow [Name]" CTA — one tap, no modal
- Link to full storefront

**Reviews section**
- Aggregate star display (from all this organizer's sales — not just this one)
- 3 most recent reviews visible, expand to show all
- Verified purchase badge where applicable
- If organizer responded, show response threaded below the review

**Desktop layout:** Two-column — main content left (hero, items, reviews), side rail right
(sticky: save/remind/share, map, organizer card, dates). Mirror the Session 1 Pro storefront
rail pattern.

**Mobile layout:** Single column, stacked. Action strip is bottom-pinned and always visible.

### Questions for design to answer back
- How should multi-day sales display dates? (e.g., "Fri–Sun, May 16–18 · 8am–4pm each day" vs. per-day breakdown?)
- Should the items grid be photo-dense (4 col mobile, 6 col desktop) or card-with-detail (2 col)?
- For AUCTION sales: does the lot catalog belong on this page or is it a separate tab?
- How prominent should the "Follow organizer" CTA be for a shopper who has never used the product?

---

## Surface 2 — Shopper First-Run / Empty State Experience

### What it is
The experience for a shopper who visits FindA.Sale for the first time — either from the homepage
or directly from a sale detail page link. They have no account, no location set, no follows.

This is not a separate page — it's a **layered set of states and prompts** that guide a cold
visitor to their first meaningful action without friction.

### The three entry points to design

**Entry A — Lands on homepage (no account)**
- See Brief A (Session 1) for the geo-toggle + trust metric
- First-run state adds: a soft one-line value prop beneath the search bar: "Find estate sales, yard sales, auctions, and more near you."
- After browsing 2–3 sales without saving anything: a non-modal nudge appears — "Save sales to come back to them → Create a free account"
- Location permission ask: design as a contextual prompt tied to the geo-toggle, not a browser default. "See sales within 10 miles" with a location icon — tap triggers the browser permission.

**Entry B — Lands on a sale detail page (no account)**
- No interruption — let them browse the sale fully first
- When they tap Save or Remind Me: show a lightweight identity capture.
  - For Remind Me: email or phone only, no account required. "We'll text you the day before."
  - For Save: prompt to create account or sign in. Keep it to 2 fields (email + password). No OAuth required for MVP.
- After they save or subscribe: show a single follow suggestion — the organizer from the sale they just viewed. "Follow [Name] to hear about their next sale."

**Entry C — Lands on homepage, grants location, sees sales**
- After they tap into a sale and come back: the homepage remembers their location and shows
  "Sales near [City]" as the feed header
- If they viewed 3+ sales: show a "Your Saves" empty-state nudge in the nav — "Start saving sales to build your list"

### Key design principles for shopper first-run
1. Never interrupt browsing with a signup wall — earn the account after they've seen value
2. Remind Me (phone/email capture) is the lowest-friction conversion — design it as a CTA, not a form
3. The first follow is the retention hook — design it as a single-tap moment, not a discovery task
4. PWA install prompt: surface it after the shopper saves their first sale. "Add to your home screen for sale-day alerts." Not before.

### Data available for personalization (once account exists)
- `User.categoryInterests[]` — interests set during onboarding
- `User.following[]` — organizer follows
- `User.favorites[]` — saved sales and items
- `User.notificationPrefs` — email/push preferences

### Questions for design to answer back
- Should the Remind Me flow be a bottom sheet or an inline form below the action strip?
- How do we handle the PWA install prompt without it feeling like a pop-up ad?
- Should we show a "Complete your profile" nudge after account creation, or go straight to the discovery feed?

---

## Data constraints to know

- No per-day sale hours model yet — hours are per-sale (startDate/endDate). Design for the future state and we'll build to it.
- Reviews are per-sale, not per-organizer. The aggregate rating shown on the sale detail page is `Organizer.avgRating` computed across all sales.
- Items can exist without photos — design graceful no-photo states throughout.
- Shipping is available on some items (`shippingAvailable`, `shippingPrice`) — surface it on item cards if set.

---

## What to deliver back

1. Sale detail page — desktop and mobile variants, both dark and light themes
2. Sale detail page — Auction variant (lot catalog treatment, bid CTA, countdown)
3. Sale detail page — Ended state (no actions, follow organizer CTA, past sale archive feel)
4. Shopper first-run overlay / nudge states for Entry A and Entry B
5. Remind Me capture component (bottom sheet, mobile-first)
6. Answers to the questions above

