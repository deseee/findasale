# FindA.Sale — Complete Feature Inventory (GitHub Source of Truth)

**Date:** 2026-03-15 (Session 176)
**Method:** Full audit of `packages/backend/src/routes/` (57 files) + `packages/frontend/pages/` (all routes)
**WARNING:** This document supersedes all prior feature lists. The roadmap.md and pricing-strategy.md were both significantly incomplete.

---

## ⚠️ CRITICAL ISSUES — READ FIRST

### 1. Hunt Pass is LIVE PAID BILLING RIGHT NOW
`streaks.ts` implements a **$4.99/30-day Hunt Pass** with full Stripe PaymentIntent creation and confirmation. Beta testers could be purchasing this today. It is NOT in the roadmap, NOT in the pricing strategy, and was NOT in the tier matrix produced earlier this session. This needs an immediate decision: is this intentional monetization or a dev experiment that needs to be disabled during beta?

### 2. pricing-strategy.md is Dangerously Stale
`claude_docs/strategy/pricing-strategy.md` says the fee is **5% (fixed) / 7% (auction)**. The roadmap locked the fee at **10% flat** in Session 106. These conflict. Any organizer reading the pricing strategy doc gets the wrong number. This doc needs to be archived or corrected immediately.

### 3. The Tier Backend Already Exists
`tiers.ts` has `getMyTier`, `getOrganizerPublicTier`, and `syncTierForOrganizer`. Feature #65 (Organizer Mode Tiers) is not starting from zero — there is already tier infrastructure in production.

### 4. ~25 Shipped Features Were Never Added to the Roadmap
See the "Undocumented Shipped Features" sections below. These need tier classification before beta testers see the app.

---

## PLATFORM FEE (Locked)
**10% flat on all transactions** (locked Session 106). Applies equally across all organizer tiers. This is separate from any subscription fee.

---

## ORGANIZER FEATURES

### Core Sale Management — SIMPLE (Free)

| Feature | Status | Notes |
|---------|--------|-------|
| Create / edit / publish / archive sale | SHIPPED | Core |
| Sale types (ESTATE/CHARITY/BUSINESS/CORPORATE) | SHIPPED | Enum validation debt — feature #5 |
| Sale map with address geocoding | SHIPPED | `/api/geocode` |
| Entrance Pin / Front Door Locator | SHIPPED | `#35` |
| Sale calendar view (organizer) | SHIPPED | `/calendar` page |
| Item add / edit / delete / status | SHIPPED | Core |
| Photo upload (single + multi) | SHIPPED | `/api/upload` with Cloudinary |
| Rapidfire Camera Mode | SHIPPED | Multi-photo AI draft pipeline |
| AI tag suggestions + health score | SHIPPED | Haiku via Claude |
| Condition grading (S/A/B/C/D) | SHIPPED | Migration 20260315000001 |
| Item holds / reservations | SHIPPED | `/api/reservations` — placeHold, cancelHold, batchUpdateHolds |
| Hold duration configuration per sale | SHIPPED | Per-sale configurable |
| Holds-Only View (batch release/extend/markSold) | SHIPPED | `#24` — grouped by buyer |
| Sale Checklist | SHIPPED | `/api/checklist` — per-sale checklist with custom items. **NOT IN ROADMAP.** |
| Email reminders to shoppers | SHIPPED | `/api/reminders` |
| Push notification subscriptions | SHIPPED | `/api/push` VAPID |
| Notification inbox | SHIPPED | `/api/notification-inbox` — in-app notification center. **NOT IN ROADMAP.** |
| Organizer digest emails | SHIPPED | `/api/organizer-digest` — separate from shopper digest. **NOT IN ROADMAP.** |
| Basic organizer profile | SHIPPED | businessName, phone, bio, website |
| Organizer public profile page | SHIPPED | `/organizers/[slug]` |
| Pickup scheduling | SHIPPED | `/api/pickup` — organizers create time slots, shoppers book them. **NOT IN ROADMAP.** |
| Sale Waitlist | SHIPPED | `/api/sale-waitlist` — shoppers join, organizer broadcasts notification. **NOT IN ROADMAP.** |
| Flash Deals | SHIPPED | `/api/flash-deals` — organizer creates/deletes time-limited price drops. Public endpoint to view active. **NOT IN ROADMAP as shipped.** |
| Reviews (receive + view) | SHIPPED | `/api/reviews` — shoppers review sales + organizer. **NOT IN ROADMAP as shipped.** |
| Contact form | SHIPPED | `/api/contact` |
| Payout Transparency / Earnings Dashboard | SHIPPED | `/api/stripe/earnings` + earnings PDF route |
| Organizer Referral (fee bypass) | SHIPPED | `#11` — referralDiscountExpiry |

### PRO Organizer Features — PRO Tier (Paid)

| Feature | Status | Tier Rationale |
|---------|--------|----------------|
| Seller Performance Dashboard (per-sale analytics) | SHIPPED | PRO — insight requires subscription |
| Organizer Insights (lifetime cross-sale totals) | SHIPPED | PRO — power analytics |
| Batch Operations Toolkit (bulk price/status/category/tag/photo) | SHIPPED | PRO — efficiency multiplier |
| CSV/JSON/Text listing exports (Listing Factory) | SHIPPED | PRO — data portability |
| Open Data Export (ZIP: items/sales/purchases) | SHIPPED | PRO — CCPA/GDPR |
| Social Templates (3 tones × 2 platforms) | SHIPPED | PRO — marketing value |
| Cloudinary watermark on photo exports | SHIPPED | PRO — brand protection |
| Brand Kit (businessName, logo, colors, social links, bio) | SHIPPED | PRO — brand identity |
| Message Templates | SHIPPED | `/api/message-templates` — saved reply templates. **NOT IN ROADMAP.** PRO — efficiency |
| A/B Testing (organizer) | SHIPPED | `/api/ab-test` — unclear scope. **NOT IN ROADMAP.** Classify as PRO or ENTERPRISE |
| Virtual Queue / Line Management | SHIPPED | `/api/lines` — start line, call next, join line, leave line, SMS broadcast. **NOT IN ROADMAP as shipped.** PRO — high-traffic sale management |

### PRO/ENTERPRISE Boundary Features

| Feature | Status | Notes |
|---------|--------|-------|
| Tiers backend (getMyTier, syncTier) | SHIPPED | `/api/tiers` — infrastructure for #65 already exists |
| Webhooks | SHIPPED | `/api/webhooks` route exists — scope unclear. Enterprise feature in plan. |
| Affiliate program (organizer) | SHIPPED | `/affiliate/*` frontend + `/api/affiliate` backend. **NOT IN ROADMAP.** Decision needed: free or paid? |
| Disputes | SHIPPED | `/api/disputes` — dispute management. **NOT IN ROADMAP.** Classify: free or PRO? |
| Invites | SHIPPED | `/api/invites` — invite-to-sale or invite-to-platform. **NOT IN ROADMAP.** |
| Admin panel | SHIPPED | `/admin/*` + `/api/admin` — internal only, not a customer feature |

---

## SHOPPER FEATURES

### Free Shopper Features (All Shoppers)

| Feature | Status | Notes |
|---------|--------|-------|
| Browse sales (homepage + map) | SHIPPED | `/map`, `/` |
| Sale detail page | SHIPPED | `/sales/[slug]` |
| Item detail page | SHIPPED | `/items/[id]` |
| Search (full-text, filters, category, location) | SHIPPED | `/search` — large route with many filter options |
| Category browsing | SHIPPED | `/categories` index + `/categories/[slug]` |
| Tag browsing | SHIPPED | `/tags/[slug]` ISR pages |
| Surprise Me / Serendipity | SHIPPED | `/surprise-me` |
| Sale calendar (upcoming sales) | SHIPPED | `/calendar` |
| Sale reminders (Remind Me button) | SHIPPED | `#37` |
| Favorites | SHIPPED | `/api/favorites` |
| Wishlists | SHIPPED | `/api/wishlists` + `/wishlists` page — **distinct from favorites**, full wishlist management. NOT IN ROADMAP as shipped. |
| Saved Searches | SHIPPED | `/api/saved-searches` with `notifyOnNew` toggle — auto-notify when new matches appear. **NOT IN ROADMAP.** |
| Holds / Reservations (place + cancel) | SHIPPED | Via `/api/reservations` |
| Shopper messaging (shopper ↔ organizer) | SHIPPED | `/messages/*` + `/api/messages` — full threaded conversations, unread count. **NOT IN ROADMAP.** |
| Reviews (submit sale/organizer review) | SHIPPED | Via `/api/reviews` |
| User profile page | SHIPPED | `/profile` |
| Registration + login + OAuth | SHIPPED | `/register`, `/login`, Google/Facebook |
| Forgot password / reset | SHIPPED | Auth flows |
| Shopper referral program | SHIPPED | `/api/shopper-referral` + referral dashboard. **NOT IN ROADMAP as shipped.** |
| Referral dashboard | SHIPPED | `/referral-dashboard` page |
| Notification center | SHIPPED | `/notifications` page |
| Unsubscribe | SHIPPED | `/unsubscribe` page + `/api/unsubscribe` |
| Weekly Treasure Digest (email) | SHIPPED | `#36` — MailerLite Sunday 6pm |
| Contact organizer | SHIPPED | Via messaging system |
| Trending items/sales | SHIPPED | `/trending` page + `/api/trending`. **NOT IN ROADMAP as shipped.** |
| Activity Feed | SHIPPED | `/feed` page + `/api/feed`. **NOT IN ROADMAP as shipped.** |
| Neighborhood Heatmap | SHIPPED | `#28` |
| Route planning (multi-sale) | SHIPPED | `/api/routes` — OSRM-based multi-sale route planning. **NOT IN ROADMAP as shipped.** |
| City pages | SHIPPED | `/cities` + `/city/[slug]` — city-level sale browsing. **NOT IN ROADMAP (deferred).** |
| Neighborhood pages | SHIPPED | `/neighborhoods/[slug]` — **NOT IN ROADMAP.** |
| Condition Guide | SHIPPED | `/condition-guide` — public educational page. |
| FAQ | SHIPPED | `/faq` |
| Guide | SHIPPED | `/guide` — how-to guide |
| Terms / Privacy | SHIPPED | Legal pages |
| Organizer profile pages (public) | SHIPPED | `/organizers/[slug]` |
| Shopper profile pages (public) | SHIPPED | `/shoppers/[slug]` — **NOT IN ROADMAP.** |
| Pickup booking (schedule pickup) | SHIPPED | Via `/api/pickup` — shoppers book slots |
| Virtual Queue (join/leave line) | SHIPPED | Via `/api/lines` — shoppers join line for high-demand sales |
| Sale Waitlist (join waitlist) | SHIPPED | Via `/api/sale-waitlist` |
| Buying Pools | SHIPPED | `/api/buying-pools` — shoppers form group buying pools for items. **NOT IN ROADMAP.** |
| Bounties (item requests) | SHIPPED | `/api/bounties` — shoppers post "looking for X" bounties that organizers fulfill. **NOT IN ROADMAP.** |
| Flash Deals (view + access) | SHIPPED | Via `/api/flash-deals` |
| Hype Meter | SHIPPED | `#34` — real-time social proof |
| Share Card Factory | SHIPPED | `#33` — OG cards on item pages |

### Shopper Gamification (Free — Decision Needed on Hunt Pass)

| Feature | Status | Notes |
|---------|--------|-------|
| Points system | SHIPPED | `/api/points` — 1 pt per sale visit/day, points transactions log, tier based on points |
| Streaks (visit/save/purchase) | SHIPPED | `/api/streaks` — daily visit streak, save streak, purchase streak |
| Treasure Hunt | SHIPPED | `/api/treasure-hunt` — daily clue + category, point rewards for finding matching items |
| Leaderboard (shoppers + organizers) | SHIPPED | `/api/leaderboard` + `/leaderboard` page — public rankings |
| Near-Miss Nudges | SHIPPED | `#61` — gamification progress prompts |
| **Hunt Pass — $4.99/30 days** | **SHIPPED + BILLING LIVE** | **`/api/streaks/activate-huntpass` → Stripe PaymentIntent $4.99. THIS IS ACTIVE MONETIZATION.** Doubles streak points. 30-day subscription. Decision: keep, pause, or price differently? |

### Shopper Premium (Not Yet Built / Planned)

| Feature | Status | Notes |
|---------|--------|-------|
| Collector Passport (#45) | PLANNED | Identity-based collection tracker |
| Shopper Loyalty Passport (#29) | PLANNED | Gamified repeat-visit system |
| Wishlist Alerts + Smart Follow (#32) | PLANNED | Push alerts for matching items |
| AI Buying Agent Scout | DEFERRED | Post ML pipeline |

---

## AI / PLATFORM FEATURES

| Feature | Status | Notes |
|---------|--------|-------|
| AI Sale Planner Chat | SHIPPED | `/plan` page + `/api/planner/chat` — public AI chat (no auth required), rate-limited 30 req/15 min. Claude-powered. **NOT IN ROADMAP.** Decision: free tool or PRO feature? |
| AI tag suggestions (Haiku) | SHIPPED | During Rapidfire Camera |
| AI condition grade suggestions | SHIPPED | S/A/B/C/D from photo |
| AI SEO description optimization | SHIPPED | High-intent search term bias |
| Social templates (3 tones × 2 platforms) | SHIPPED | PRO feature |
| Price History | SHIPPED | `/api/price-history` — tracks price changes on items. **NOT IN ROADMAP.** |
| Price Intelligence (cross-sale) | SHIPPED | Merged into Seller Performance Dashboard |

---

## EXISTING DOCS WITH SIMILAR COVERAGE

Existing documents that covered parts of this territory (all now superseded by this doc for completeness):

| Document | What It Covers | Issue |
|----------|---------------|-------|
| `claude_docs/strategy/pricing-strategy.md` | Fee model, competitive benchmark, monetization options | **CRITICALLY STALE** — shows 5%/7% fee, not 10% flat. Needs to be archived. |
| `claude_docs/feature-notes/feature-tier-matrix-2026-03-15.md` | Tier classification of roadmap features | **INCOMPLETE** — did not include any of the 25 undocumented shipped features |
| `claude_docs/strategy/pricing-and-tiers-overview-2026-03-15.md` | Synthesized pricing + tier strategy | **INCOMPLETE** — based on roadmap only, missing Hunt Pass, Virtual Queue, Messaging, etc. |
| `claude_docs/feature-notes/advisory-board-fee-structure-stress-test-2026-03-10.md` | Session 106 fee decision | Historical — fee locked at 10% |
| `claude_docs/strategy/BUSINESS_PLAN.md` | Business plan | Stale — still references Grand Rapids focus |

---

## SUMMARY: UNDOCUMENTED SHIPPED FEATURES (for roadmap + tier update)

These are confirmed built in production but have never been added to roadmap.md:

**Organizer:**
1. Sale Checklist (per-sale with custom items) → SIMPLE
2. Pickup Scheduling (slot creation + shopper booking) → SIMPLE or PRO
3. Flash Deals (time-limited price drops) → PRO
4. Sale Waitlist (shoppers join, organizer notifies) → SIMPLE
5. Message Templates (saved organizer replies) → PRO
6. Virtual Queue / Line Management → PRO
7. Organizer Digest emails (separate from shopper digest) → SIMPLE
8. Notification Inbox → SIMPLE
9. Reviews (receive shopper reviews) → SIMPLE
10. Affiliate Program (organizer affiliate links) → TBD
11. Disputes → SIMPLE (trust/safety)
12. A/B Testing → ENTERPRISE (internal tool)

**Shopper:**
13. Wishlists (full CRUD, distinct from favorites) → FREE
14. Saved Searches with notifyOnNew → FREE
15. Shopper ↔ Organizer Messaging → FREE
16. Buying Pools (group buying on items) → FREE (or PRO for organizer side)
17. Bounties (item want-ads) → FREE
18. Trending page + API → FREE
19. Activity Feed → FREE
20. Route Planning → FREE
21. City pages → FREE (SEO)
22. Neighborhood pages → FREE (SEO)
23. Shopper public profiles → FREE
24. Shopper Referral Dashboard → FREE

**Gamification (Shopper):**
25. Points system (1 pt/visit, tiers) → FREE
26. Streaks (visit/save/purchase) → FREE (Hunt Pass upgrade)
27. Treasure Hunt (daily) → FREE (Hunt Pass for bonus rewards)
28. Leaderboard (shopper + organizer) → FREE
29. **Hunt Pass — $4.99/30 days** → **ACTIVE PAID PRODUCT — needs decision**

**AI/Platform:**
30. AI Sale Planner Chat (`/plan`) → FREE or PRO — needs decision
31. Price History tracking → FREE (transparent for trust)

---

## NEXT ACTIONS

1. **Patrick decision:** Is Hunt Pass an intentional beta monetization feature or a dev experiment? If intentional — add it to pricing strategy and communicate to beta testers. If dev experiment — disable Stripe billing until ready to launch properly.

2. **Archive `pricing-strategy.md`:** Flag as stale, replace with corrected version showing 10% flat fee. Risk: any organizer or internal reader currently gets the wrong fee number.

3. **Update roadmap.md:** Add all 31 undocumented shipped features to the roadmap with correct [SHIPPED] status and tier tags.

4. **Update pricing-and-tiers-overview:** Add the Hunt Pass, Virtual Queue, Messaging, Buying Pools, Bounties, Flash Deals, AI Planner to the tier matrix with pricing implications.

5. **AI Planner decision:** `/plan` is public and free right now. Should it be gated to registered users? To PRO? Or left as a free acquisition tool?

6. **Flash Deals decision:** This is a significant organizer feature (time-limited discounts). Should it be SIMPLE (builds urgency for all organizers) or PRO (premium sales tactic)?
