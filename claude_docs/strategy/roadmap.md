# ROADMAP – FindA.Sale v2

**Last Updated:** 2026-03-30 (v83 — fixed-width format rebuild with roadmap.md integration)

**Status:** Production MVP live at finda.sale. Beta: GO. Full build history: `claude_docs/strategy/COMPLETED_PHASES.md`.

## Formatting Rules (Agents Must Read Before Editing)

**STOP. Read this section before making any changes to this file. This is binding on all agents.**

1. **Fixed-Width Format (NOT Markdown Tables).** Feature lines use this locked column-aligned format:
   ```
    #   Feature                                                 Role     Tier        DB API UI QA Chr Nav Hum  Notes
   138 Sale Types (ESTATE/CHARITY/BUSINESS/CORPORATE)           ORG      SIMPLE      Y  Y  Y  Y  P  -  P  Enum validation + validation matrix
   ```
   - Column alignment is strict. Use 3-char padding for # (` 7`, `41`, `174`)
   - NO PIPES. NO MARKDOWN TABLES for feature lines. Exception: Deferred & Rejected use markdown tables (different columns).
   - Columns: # | Feature | Role | Tier | DB | API | UI | QA | Chr | Nav | Hum | Notes
   - Status markers: Y = confirmed working, P = pending/not tested, W = issues found, F = fix in progress, - = not human-testable, NA = not applicable

2. **Section header format:**
   ```
    #   Feature                                                 Role     Tier        DB API UI QA Chr Nav Hum  Notes
   -------------------------------------------------------------------------------------------------
   ```
   Dashes = fixed-width separator line (96 chars).

3. **When updating status:** Only change the specific column that changed. Do not rewrite Notes or other rows.

4. **This document is the source of truth for product roadmap.** Update at every session wrap.

5. **Nothing gets dropped.** Every feature must appear somewhere in v2.

6. This document is the source of truth for product roadmap. Updated at every session wrap when a feature ships, beta status changes, or a deferred item is revisited. Full build history: `claude_docs/strategy/COMPLETED_PHASES.md`.

## Patrick's Checklist

### Business Formation + Legal
- [x] File Michigan LLC with LARA ✅
- [x] Get EIN from IRS.gov ✅
- [x] Open business bank account ✅
- [x] Set up support@finda.sale email forwarding ✅ (2026-03-06)
- [ ] Order business cards (~$25) — files in `claude_docs/brand/`
- [ ] Create Google Business Profile for FindA.Sale
- [ ] Open Stripe business account
- [ ] Google Search Console verification
- [ ] Set up Google Voice for support line

### Credentials + Services
- [x] Google Cloud account + Vision API key ✅ (2026-03-05)
- [x] Anthropic API key (for Claude Haiku) ✅ (2026-03-05)
- [x] UptimeRobot monitoring ✅ (2026-03-05)
- [x] Rotate Neon database credentials ✅ (2026-03-09)
- [x] OAuth credentials (Google, Facebook) → Vercel env vars ✅ (2026-03-06)
- [x] Platform fee locked at 10% flat ✅ (session 106)
- [ ] VAPID keys confirmed in production
- [ ] **⚠️ Set `MAILERLITE_SHOPPERS_GROUP_ID=182012431062533831` on Railway**
- [ ] **⚠️ Verify `RESEND_API_KEY` and `RESEND_FROM_EMAIL` on Railway**

### Beta Recruitment
- [ ] Identify 5 target beta organizers — outreach template ready (`claude_docs/beta-launch/organizer-outreach.md`)
- [ ] Schedule 1-on-1 onboarding sessions
- [ ] Hand-hold first 3 sales
- [ ] Collect structured feedback
- [ ] Sync: feedback → Claude for iteration

### Pre-Beta Prep
- [ ] Brand Voice Session — use brand-voice plugin to establish documented voice, tone, and messaging pillars before beta outreach and email sequences
- [ ] Trademark filing — see Decisions Needed (#82)

### Human Verification (Patrick must run)
- [ ] **Auction E2E — Stripe test mode:** Set auction end time on a test item → click End Auction button → confirm winner notification sent → open Stripe checkout link → complete checkout → confirm organizer close notification fires. (Documented S279; feature shipped S278.)

## Decisions Needed (Product Decisions Only — Patrick Sign-Off Required)

These are decisions that block other work. Only Patrick can decide.

| # | Feature | Tier | Decision | Impact | Blocker? |
|-----|---------|------|----------|--------|----------|
|  82 | Trademark — FindA.Sale | LEGAL | File USPTO trademark? ~$250–400/class + attorney fees | Legal | No |
|  83 | Trade Secret Housekeeping | LEGAL | Document proprietary algorithms as trade secrets + NDA review | Legal | No |

## BROKEN — Fix Before Anything Else

Features that Patrick's human QA walkthrough confirmed are broken. Use the two-stage format.

|  #  | DB | API | UI | Nav | Claude QA | Human QA | Status | Feature | Role | Tier | Needs | Notes |
|-----|----|----|----|----|-----------|----------|--------|---------|------|------|-------|-------|
| 174 | ✅ | ✅ | ✅ | NA | ⬜ | ⬜ FIXED S344 | Auction Mechanics + Close Flow | ORG | SIMPLE | Pending Chrome QA — Phase 1: reserve price check in auctionJob.ts. Phase 2: /purchases/[id].tsx persistent confirmation, CheckoutModal redirects to it, checkout-success backward compat. | Countdown timer, bid modal, auto-bid, cron closing, manual end-auction button, auctionEndTime field, winner Stripe checkout link, organizer close notification, admin bid-review queue |
|  41 | ✅ | ✅ | ✅ | ✅ | ⬜ | ⬜ FIXED S344 | Flip Report | ORG | PRO | Pending Chrome QA — null safety on bestCategory.category + itemsSold division-by-zero guard. Enhanced error logging in controller. | Item resale potential scoring |
|  62 | ✅ | ✅ | ✅ | ✅ | ⬜ | ⬜ FIXED S344 | Digital Receipt + Returns | SHO | FREE | Pending Chrome QA — receiptController now queries Purchase directly (PAID status) instead of DigitalReceipt model which had no records. Response shape preserved for frontend compat. | Auto-generated receipt post-POS, return window |
|  50 | ✅ | ✅ | ✅ | ✅ | ⬜ | ⚠️ NOT A CODE BUG — test data issue | Loot Log | SHO | FREE | user11's purchases are PENDING not PAID — Loot Log correctly filters PAID only. No code fix needed. Verify with a PAID purchase. | Personal purchase history with photos + prices |
| 184 | ✅ | ✅ | ✅ | NA | ⬜ | ⬜ FIXED S344 | iCal / Calendar Export | SHO | SIMPLE | Pending Chrome QA — Express route ordering fix in sales.ts: /:id/calendar.ics moved before generic /:id catch-all handler which was intercepting .ics requests. | Download .ics file for sales + items |
|  48 | ✅ | ✅ | ✅ | ✅ | ⬜ | ⬜ FIXED S346 | FIXED S346 | Treasure Trail Route Builder | SHO | FREE | Pending Chrome QA — dark mode contrast fix (trail/[shareToken].tsx), edit save flow fix (trails/[trailId].tsx) | Trail pages + share token, multi-sale routing |
|  13 | ✅ | ✅ | ✅ | 📋 | ⬜ | ⬜ FIXED S346 | FIXED S346 | TEAMS Workspace | ORG | TEAMS | Pending Chrome QA — member lookup missing relations fixed, invite error parsing fixed (error→message field) | Multi-user workspace, role management |
| 157 | ✅ | ✅ | ✅ | 📋 | ⬜ | ⬜ FIXED S346 | FIXED S346 | Pickup Scheduling | BOTH | SIMPLE | Pending Chrome QA — all 4 mutations were returning full axios response instead of response.data, causing onSuccess to fail silently (PickupBookingCard, PickupSlotManager, MyPickupAppointments) | Organizer slots + shopper booking |
|   7 | ✅ | ✅ | ✅ | ✅ | ⬜ | ⬜ FIXED S344 | Shopper Referral Rewards | SHO | FREE | Pending Chrome QA — missing return statement before res.json() in referralController.ts (lines 26 + 38) caused API to hang with no response → frontend showed 0. | Referral tracking + rewards distribution |
|  37 | ✅ | ✅ | ✅ | 📋 | ⬜ | ⬜ FIXED S344 | Sale Reminders (Remind Me) | SHO | SIMPLE | Pending Chrome QA — copy updated to "Remind me by email", toggle-off state, disabled for ended sales | Sale alerts for shoppers | 
|  46 | ✅ | ✅ | ✅ | ✅ | ⬜ | ⬜ FIXED S346 | FIXED S346 | Treasure Typology Classifier | ORG | PRO | Pending Chrome QA — ANTHROPIC_API_KEY guard added to batchClassify(), dark mode badge contrast fixed in TypologyBadge.tsx | AI item classification; useTypology.ts, TypologyBadge.tsx |
|  80 | NA | NA | ✅ | 📋 | ⬜ | ⬜ FIXED S344 | Purchase Confirmation Redesign | SHO | FREE | Pending Chrome QA — MERGED WITH #174. Persistent /purchases/[id].tsx page shipped: hero check, item photo, pickup info, order details, status badges, auction buyer premium breakdown. | MERGED WITH #174 — see #174 |
|  89 | NA | ✅ | ✅ | 📋 | ⬜ | ⬜ FIXED S344 | Unified Print Kit | ORG | SIMPLE | Pending Chrome QA — frontend was calling /organizer/sales/{saleId}/print-kit (wrong prefix). Fixed to /organizers/{saleId}/print-kit. | /organizer/print-kit/[saleId] — yard sign + item price tags (6/page). Print CSS. |


## TESTING — Active QA Queue

### PARTIAL — Works but has known issues

Features that work but need fixes or refinement before shipping.

|  #  | DB | API | UI | Nav | Claude QA | Human QA | Status | Feature | Role | Tier | Needs | Notes |
|-----|----|----|----|----|-----------|----------|--------|---------|------|------|-------|-------|
| 177 | ✅ | ✅ | ✅ | ✅ | ✅ `/sales/[slug]` loads. Items display. Clicking item → detail. Share button → social links. Add to calendar → iCal ✅. | ⚠️ FIXED S346 — reviews moved into Organized By card, platform fee gated to auction items, item cards now aspect-square uniform height. Pickup scheduling separately fixed (#157). | PARTIAL | Sale Detail Page | SHO | FREE | Pending Chrome QA — 3 layout fixes applied | /sales/[slug] — Chrome verified |
| 176 | ✅ | ✅ | ✅ | ✅ | ✅ Homepage loads. Filter pills display. Map renders sales. Clicking sale card → detail. | ⚠️ Walkthrough: filter pill fix applied S288 but needs re-verify. Sales near you missing. | PARTIAL | Browse Sales (Homepage + Map) | SHO | FREE | Chrome QA verify filter pills still work after S288 fix | Filter pill fix applied; needs re-verify | 
|  29 | ✅ | ✅ | ✅ | ✅ | ✅ S300: `/shopper/loyalty` loads real data (0 XP, Bronze tier, Generate Coupon correctly gated at 20 XP min, layout correct) | ⚠️ FIXED S346 — copy rewritten to Explorer's Guild narrative (XP earn guide, tier names Initiate→Grandmaster, coupon/rarity boost explainers) | PARTIAL | Loyalty Passport | SHO | FREE | Pending Chrome QA — verify copy and tier display | /shopper/loyalty loads real data |
| 199 | ✅ | ✅ | ✅ | 📋 | ✅ S286: `/profile` page loads, user name displays, edit form works. | ⚠️ FIXED S346 — Hunt Pass section added, bid status now returns real DB value (was hardcoded PARTICIPATING), push notification moved to shopper/settings.tsx. Badges/referrals were already working. | PARTIAL | User Profile Page | SHO | FREE | Pending Chrome QA — Hunt Pass section, bid status, push notification placement | /profile — Chrome verified |
|  71 | ✅ | ✅ | ✅ | ✅ | ✅ S202: reputation.tsx displays 1-5 star score. | ⚠️ Walkthrough: stray 0 visible on leaderboard (data issue) | PARTIAL | Reputation Score | ORG | SIMPLE | Fix: seed data cleanup on Railway or query fix to filter null scores | 1-5 star public score + reputation.tsx frontend | 
| 131 | NA | ✅ | ✅ | ✅ | ✅ S289: 8-tab modal, real data, copy works, SharePromoteModal renders correctly | ⚠️ FIXED S347 — Facebook/Threads use window.open() popups; Nextdoor = copy+open newsfeed with toast; Threads = threads.net/intent/post popup; Pinterest wired; TikTok = copy+open. Pending Chrome QA. | PARTIAL | Share Templates | ORG | SIMPLE | Update: add proper sharing integrations for Nextdoor, Threads; verify Facebook share button | SharePromoteModal: 4 templates (social post, flyer, email invite, neighborhood post) | 
| 212 | ✅ | ✅ | ✅ | 📋 | ✅ S288: `/leaderboard` page loads, rankings display | ⚠️ FIXED S347 — badges added to leaderboard query (top 3 per user, leaderboardController.ts); stray totalItemsSold=0 guarded. Pending Chrome QA. | PARTIAL | Leaderboard | SHO | FREE | Fix: ensure badges render on leaderboard cards or add badge display logic | Public rankings | 
| 213 | ✅ | ✅ | ✅ | NA | ✅ S288: Hunt Pass purchase flow works, Stripe checkout integrates | ⚠️ FIXED S347 — dashboard Hunt Pass card upgraded: 3 benefit bullets (2x XP, 6h early access, badge), prominent "Upgrade Now" button, $4.99/mo price. Only shows for non-subscribers. Pending Chrome QA. | PARTIAL | Hunt Pass | SHO | PAID_ADDON | Add: prominent upgrade CTA to dashboard, benefit explanation, early access messaging | 2x streak multiplier, recurring Stripe billing | 
| 172 | ✅ | ✅ | ✅ | NA | ✅ S288: settings page + Setup Stripe Connect button confirmed working. S295: Checkout fee display fixed (double-fee bug resolved). | ⚠️ Needs full e2e verification | PARTIAL | Stripe Connect Setup | ORG | SIMPLE | Verify: complete payout flow (connect account → make sale → money arrives in bank) | Payout bank account linking + verification | 
| 132 | ✅ | ✅ | ✅ | NA | ✅ S288: Stripe checkout works, fee charged correctly | ⚠️ Walkthrough: payment incomplete, needs verification | PARTIAL | À La Carte Single-Sale Fee ($9.99) | ORG | PAID_ADDON | Verify: purchase flow end-to-end, receipt generation, organizer sees payment | Sale.purchaseModel + alaCarte + alaCarteFeePaid. Stripe checkout. AlaCartePublishModal for SIMPLE tier | 
| 153 | ✅ | ✅ | ✅ | 📋 | ✅ S286: businessName, phone, bio, website. Save persists on reload. | ⚠️ FIXED S347 — settings.tsx: Facebook, Instagram, Etsy URL fields added (all exist in schema). PATCH /organizers/me already accepts these. Pending Chrome QA. | PARTIAL | Basic Organizer Profile | ORG | SIMPLE | Enhance: auto-fill from business license if available, add more profile fields (hours, social links) | businessName, phone, bio, website. Save persists on reload. | 
|  58 | ✅ | ✅ | ✅ | ✅ | ✅ S286: `/shopper/achievements` page loads, badge grid displays | ⚠️ FIXED S346 — new AchievementBadgesSection.tsx component added to dashboard, loyalty, and explorer-passport | PARTIAL | Achievement Badges | SHO | FREE | Pending Chrome QA — verify badges on all 4 pages | /shopper/achievements page — Chrome verified |
| 123 | ✅ | ✅ | ✅ | ✅ | ✅ S286: XP endpoints live, Loot Legend page displays | ⚠️ FIXED S347 — loyalty.tsx: XP earn tooltip (+5 visit, +10 scan, +25 purchase), rank threshold display (Initiate→Scout 500→Ranger 1500→Sage 2500→Grandmaster 5000), Hunt Pass $4.99/mo badge. Layout.tsx: "Loyalty" nav label → "Explorer's Guild". Pending Chrome QA. | PARTIAL | Explorer's Guild Phase 2 | SHO | FREE/PAID_ADDON | Clarify: finalize name (Explorer/Guild/Loot Legend terms), add onboarding tooltips explaining XP/badges/tiers | User.guildXp + User.explorerRank + RarityBoost table. XP sinks (coupon-gen, rarity boost, Hunt Pass discount). Loot Legend portfolio. | 
|  59 | ✅ | ✅ | ✅ | ⚠️ | ✅ Widget on /shopper/dashboard loads | ⚠️ Verified S347 — StreakWidget already present in loyalty.tsx (S346). No code change needed. Pending Human QA to confirm display. | PARTIAL | Streak Rewards | SHO | FREE | Verify: should Streaks appear on both pages or just one? Add to missing page or hide from dashboard | Visit/save/purchase streaks wired to Layout — widget on /shopper/dashboard but NOT on /shopper/loyalty — P2 gap | 
|  27 | NA | ✅ | ✅ | 📋 | ✅ S290: items.csv + sales.csv + purchases.csv download confirmed. PRO gate working. | ⚠️ Needs re-verify | PARTIAL | Exports (CSV/JSON) | ORG | PRO | Chrome verify export files generate with correct data | items.csv + sales.csv + purchases.csv download confirmed. PRO gate working. | 
|  66 | ✅ | ✅ | ✅ | ✅ | ✅ S290: items.csv (36 rows), sales.csv (3 rows), purchases.csv (header only) | ⚠️ Needs real data scenario | PARTIAL | Open Data Export (ZIP) | ORG | PRO | Test with real purchases (not just headers) | items.csv (36 rows), sales.csv (3 rows), purchases.csv (header only). | 
|  31 | ✅ | ✅ | ✅ | ✅ | ✅ Colors, logo, socials page loads | ⚠️ Walkthrough: "needs data" and verification that auto-propagation works | PARTIAL | Brand Kit | ORG | PRO | Test: upload brand kit → verify colors/logo appear on social templates and export | Colors, logo, socials (auto-propagates) | 

### WORKS — Ready for Human QA only

Claude has verified these with real Chrome evidence. Patrick: ~30 sec per feature.

|  #  | DB | API | UI | Nav | Claude QA | Human QA | Status | Feature | Role | Tier | Needs | Notes |
|-----|----|----|----|----|-----------|----------|--------|---------|------|------|-------|-------|
| 140 | ✅ | ✅ | ✅ | ✅ | ✅ Organizer + shopper views load, events display on calendar, click event → sale detail | ⬜ | WORKS | Sale Calendar View | BOTH | SIMPLE | Human QA |  | 
| 151 | ✅ | ✅ | ✅ | ✅ | ✅ In-app notification center loads, notifications display with timestamps, click → navigate to relevant page | ⬜ | WORKS | Notification Inbox | BOTH | SIMPLE | Human QA |  | 
| 162 | ✅ | ✅ | ✅ | ✅ | ✅ Multi-item + cash, 10% fee parity, POS checkout works | ⬜ | WORKS | Stripe Terminal POS (v2) | ORG | SIMPLE | Human QA |  | 
|  22 | NA | ✅ | ✅ | ✅ | ✅ Network API detection, localStorage, LowBandwidthContext loads, images compress on slow networks | ⬜ | WORKS | Low-Bandwidth Mode (PWA) | BOTH | SIMPLE | Human QA |  | 
|  19 | ✅ | ✅ | ✅ | ✅ | ✅ Passkey registration works, login with passkey works, fallback to password works | ⬜ | WORKS | Passkey / WebAuthn Login | ORG | SIMPLE | Human QA |  | 
| 167 | ✅ | ✅ | ✅ | ✅ | ✅ Trust & safety dispute flow wired, dispute form submits, admin queue receives | ⬜ | WORKS | Disputes Management | BOTH | SIMPLE | Human QA |  | 
| 135 | NA | NA | ✅ | 📋 | ✅ SharePromoteModal renders TikTok, Pinterest, Threads, Nextdoor tabs (external links) | ⬜ | WORKS | Social Templates Expansion | ORG | SIMPLE | Human QA |  | 
|  65 | —- | ✅ | ✅ | -— | ✅ S289+S290: Full tier infrastructure (SubscriptionTier enum, tierGate.ts, requireTier, Stripe billing, Progressive Disclosure UI). SIMPLE user sees upgrade wall. | ⬜ | WORKS | Organizer Mode Tiers (Simple/Pro/Teams) | ORG | PRO | Human QA | |
|  25 | ✅ | ✅ | ✅ | ✅ | ✅ S301: page loads, empty state for PRO user with no consignment items. Not a bug — needs real consignment data. | ⬜ | WORKS | Organizer Item Library (Consignment Rack) | ORG | PRO | Human QA |  | 
|  42 | NA | ✅ | ✅ | NA | ✅ VoiceTagButton.tsx + useVoiceTag.ts complete, Web Speech API integration functional | ⬜ | WORKS | Voice-to-Tag | ORG | PRO | Human QA |  | 
|  30 | ✅ | ✅ | ✅ | ✅ | ✅ S202: ValuationWidget (PRO-gated) on add-items page, suggestions display, CTA works | ⬜ | WORKS | AI Item Valuation & Comparables | ORG | PRO | Human QA |  | 
|  14 | ✅ | ✅ | ✅ | NA | ✅ S202: Organizer widget, SMS/email alerts, SaleStatusWidget functional | ⬜ | WORKS | Real-Time Status Updates | BOTH | PRO | Human QA |  | 
|  20 | NA | ✅ | ✅ | NA | ✅ S202: DegradationBanner + middleware for offline, fallback UI displays | ⬜ | WORKS | Proactive Degradation Mode | BOTH | PRO | Human QA |  | 
| 179 | ✅ | ✅ | ✅ | ✅ | ✅ Advanced filters + location search functional, results accurate | ⬜ | WORKS | Full-Text Search | SHO | FREE | Human QA |  | 
| 189 | ✅ | ✅ | ✅ | ✅ | ✅ S288: `/trending` page + API, items/sales sorted by views/engagement | ⬜ | WORKS | Trending Items / Sales | SHO | FREE | Human QA |  | 
| 190 | ✅ | ✅ | ✅ | ✅ | ✅ S297: `/feed` page + API, activity timeline loads | ⬜ | WORKS | Activity Feed | SHO | FREE | Human QA |  | 
|  78 | NA | ✅ | ✅ | 📋 | ✅ S286: `/inspiration` masonry grid, items from active/upcoming sales display | ⬜ | WORKS | Inspiration Page — Item Gallery | SHO | FREE | Human QA |  | 
|  92 | NA | ✅ | ✅ | 📋 | ✅ S286: `/city/[city].tsx` ISR pages with Schema.org JSON-LD, Grand Rapids pre-generated, live | ⬜ | WORKS | City Weekend Landing Pages | SHO | FREE | Human QA |  | 
| 204 | ✅ | ✅ | ✅ | 📋 | ✅ S286: `/unsubscribe` + `/api/unsubscribe`, preference toggles work | ⬜ | WORKS | Unsubscribe / Preferences | SHO | FREE | Human QA |  | 
| 206 | ✅ | ✅ | ✅ | 📋 | ✅ S288: `/condition-guide` educational page loads with condition descriptions | ⬜ | WORKS | Condition Guide | SHO | FREE | Human QA |  | 
| 207 | ✅ | ✅ | ✅ | 📋 | ✅ S286: Legal + help pages load, content displays correctly | ⬜ | WORKS | FAQ / Guide / Terms / Privacy | PUB | FREE | Human QA |  | 
| 214 | ✅ | ✅ | ✅ | 📋 | ✅ S288: `/plan` page, public rate-limited acquisition tool, chat works | ⬜ | WORKS | AI Sale Planner Chat | PUB | FREE | Human QA |  | 

### UNTESTED — Need Chrome QA

Features built but never browser-tested or Chrome test is stale (>3 sessions old). Dispatch to findasale-qa.

|  #  | DB | API | UI | Nav | Claude QA | Human QA | Status | Feature | Role | Tier | Needs | Notes |
|-----|----|----|----|----|-----------|----------|--------|---------|------|------|-------|-------|
| 138 | ✅ | ✅ | ✅ | NA | ⬜ | ⬜ | UNTESTED | Sale Types (ESTATE/CHARITY/BUSINESS/CORPORATE) | ORG | SIMPLE | Chrome QA: verify 4 sale types selectable, API validates, enum works | Enum validation + validation matrix | 
|   5 | ✅ | ✅ | ✅ | NA | ⬜ | ⬜ | UNTESTED | Listing Type Schema Validation | ORG | SIMPLE | Chrome QA: test FIXED/AUCTION/REVERSE_AUCTION/LIVE_DROP/POS validation | Backend validation for FIXED/AUCTION/REVERSE_AUCTION/LIVE_DROP/POS | 
|  35 | ✅ | ✅ | ✅ | ✅ | ⬜ | ✅ | UNTESTED | Entrance Pin / Front Door Locator | BOTH | SIMPLE | Chrome QA: verify entrance marker displays on map, stores location | Shopper convenience, parking + entrance detail | 
| 142 | ✅ | ✅ | ✅ | NA | ⬜ | ✅ | UNTESTED | Photo Upload (Single + Multi) | ORG | SIMPLE | Chrome QA: verify upload to Cloudinary, files visible, multi-upload works |  | 
| 145 | ✅ | ✅ | ✅ | NA | ⬜ | ✅ | UNTESTED | Condition Grading (S/A/B/C/D) | ORG | SIMPLE | Chrome QA: verify AI grades condition, manual override works |  | 
| 146 | ✅ | ✅ | ✅ | NA | ✅ | ⬜ | Pending Chrome QA | Item Holds / Reservations | BOTH | SIMPLE | Shipped S332–S340. HoldButton UI, GPS/QR gates, expiry cron, shopper notifications. HoldTimer countdown Chrome-verified S338. Full E2E pending tonight's QA. |  |
| 147 | ✅ | ✅ | ✅ | ✅ | ✅ | ⬜ | Pending Chrome QA | Hold Duration Configuration | ORG | SIMPLE | Shipped S333. Rank-based: Initiate/Scout 30min, Ranger 45min, Sage 60min, Grandmaster 90min. holdsEnabled toggle per sale. Verified S340 rank duration correct. |  |
|  24 | ✅ | ✅ | ✅ | ✅ | ✅ | ⬜ | Pending Chrome QA | Holds-Only Item View (Batch Ops) | ORG | SIMPLE | Shipped S333–S340. Organizer can view/cancel/extend holds. Batch extend endpoint verified S340. |  | 
| 148 | ✅ | ✅ | ✅ | 📋 | ⬜ | ⬜ | UNTESTED | Sale Checklist | ORG | SIMPLE | Chrome QA: verify checklist CRUD, per-sale customization |  | 
| 149 | ✅ | ✅ | ✅ | NA | ✅ | ⬜ | Pending Chrome QA | Email Reminders to Shoppers | SHO | SIMPLE | Shipped S344. RemindMeButton: "Remind me by email" copy, toggle-off "Cancel Reminder" state, disabled for ended/cancelled sales. Backend was complete. |  | 
| 150 | ✅ | ✅ | ✅ | NA | ⬜ | ⬜ | UNTESTED | Push Notification Subscriptions | BOTH | SIMPLE | Chrome QA: verify VAPID, service worker registration, notification display |  | 
| 152 | ✅ | ✅ | ✅ | NA | ⬜ | ⬜ | UNTESTED | Organizer Digest Emails | ORG | SIMPLE | Chrome QA: verify weekly email content, scheduling |  | 
| 154 | ✅ | ✅ | ✅ | ✅ | ⬜ | ⬜ | UNTESTED | Organizer Public Profile Page | ORG | SIMPLE | Chrome QA: verify `/organizers/[slug]` loads, sales list displays |  | 
| 155 | ✅ | ✅ | ✅ | 📋 | ⬜ | ⬜ | UNTESTED | Password Reset Flow | ORG | SIMPLE | Chrome QA: verify email sent, reset link works, password updates |  | 
| 156 | ✅ | ✅ | ✅ | ✅ | ⬜ | ⬜ | UNTESTED | Refund Policy Configuration | ORG | SIMPLE | Chrome QA: verify per-organizer refund window config |  | 
| 158 | ✅ | ✅ | ✅ | NA | ⬜ | ⬜ | UNTESTED | Sale Waitlist | BOTH | SIMPLE | Chrome QA: verify shopper join, organizer broadcast | Shopper join + organizer broadcast | 
| 159 | ✅ | ✅ | ✅ | NA | ⬜ | ⬜ | UNTESTED | Flash Deals | ORG | SIMPLE | Chrome QA: verify time-limited price drops, countdown timer | Time-limited price drops | 
| 160 | ✅ | ✅ | ✅ | NA | ⬜ | ⬜ | UNTESTED | Reviews (Receive + View) | BOTH | SIMPLE | Chrome QA: verify review submit, display, organizer receives | Shopper → sale + organizer | 
| 161 | ✅ | ✅ | ✅ | 📋 | ⬜ | ⬜ | UNTESTED | Contact Form | PUB | SIMPLE | Chrome QA: verify form submit, email sent |  | 
| 163 | ✅ | ✅ | ✅ | ✅ | ⬜ | ⬜ | UNTESTED | Payout Transparency / Earnings Dashboard | ORG | SIMPLE | Chrome QA: verify item-level fee breakdown, PDF export |  | 
|  11 | ✅ | ✅ | ✅ | 📋 | ⬜ | ⬜ | UNTESTED | Organizer Referral (Fee Bypass) | ORG | SIMPLE | Chrome QA: verify referral code application, fee bypass |  | 
| 164 | -— | ⬜ | ⬜ | -— | ⬜ | ⬜ | UNTESTED | Tiers Backend Infrastructure | ORG | SIMPLE | Chrome QA: verify getMyTier, syncTier, tier display | |
| 165 | ✅ | ✅ | ✅ | 📋 | ⬜ | ⬜ | UNTESTED | A/B Testing Infrastructure | ORG | SIMPLE | Chrome QA: verify A/B variant assignment, tracking |  | 
| 166 | ✅ | ✅ | ✅ | 📋 | ⬜ | ⬜ | UNTESTED | Invites | ORG | SIMPLE | Chrome QA: verify invite-to-sale, beta code acceptance |  | 
|  72 | -— | ⬜ | ⬜ | -— | ⬜ | ⬜ | UNTESTED | Dual-Role Account Schema | BOTH | SIMPLE | Chrome QA: verify admin+organizer dual roles work on all endpoints (S309 fixed 4 itemController endpoints) | |
|  74 | -— | ⬜ | ⬜ | -— | ⬜ | ⬜ | UNTESTED | Role-Aware Registration Consent | BOTH | FREE | Chrome QA: verify consent checkboxes at signup, copy attorney-reviewed | |
|  75 | -— | ⬜ | ⬜ | -— | ⬜ | ⬜ | UNTESTED | Tier Lapse State Logic | ORG | PRO | Chrome QA: verify lapse warning, cron suspension, feature suspension logic | |
| 127 | -— | ⬜ | ⬜ | -— | ⬜ | ⬜ | UNTESTED | POS Value Unlock Tiers | ORG | SIMPLE | Chrome QA: verify dual-gate (tx+revenue), tier unlocks, gates enforce | |
|  77 | NA | NA | ✅ | NA | ⬜ | ⬜ | UNTESTED | Sale Published Celebration | ORG | SIMPLE | Chrome QA: verify confetti overlay, full-screen celebration UX |  | 
|  79 | NA | NA | ✅ | NA | ⬜ | ⬜ | UNTESTED | Earnings Counter Animation | ORG | SIMPLE | Chrome QA: verify counter animation on dashboard load |  | 
|  60 | -— | ⬜ | ⬜ | -— | ⬜ | ⚠️ FIXED S347 — organizer/pricing.tsx updated: correct prices ($49 PRO / $99 TEAMS), full PRO feature list (Flip Report, AI Valuation, Brand Kit, Auto-Markdown, Print Kit, Typology, etc), TEAMS = PRO + workspace/5 seats. Pending Chrome QA. | PARTIAL | Premium Tier Bundle | ORG | PRO | Chrome QA: verify comparison table renders, upgrade CTA flows to Stripe checkout | |
| 168 | ✅ | ✅ | ✅ | ✅ | ⬜ | ⬜ | UNTESTED | Seller Performance Dashboard | ORG | PRO | Chrome QA: verify per-sale analytics, insights load |  | 
|   8 | ✅ | ✅ | ✅ | ✅ | ⬜ | ⬜ | UNTESTED | Batch Operations Toolkit | ORG | PRO | Chrome QA: verify bulk price/status/category/tag/photo updates |  | 
| 170 | ✅ | ✅ | ✅ | 📋 | ⬜ | ⬜ | UNTESTED | CSV Listing Import | ORG | SIMPLE | Chrome QA: verify bulk upload, validation, items created |  | 
| 171 | ✅ | ✅ | ✅ | 📋 | ⬜ | ⬜ | UNTESTED | Payout PDF Export | ORG | PRO | Chrome QA: verify PDF generation, content, download |  | 
|  18 | ✅ | ✅ | ✅ | ✅ | ⬜ | ⬜ | UNTESTED | Post Performance Analytics | ORG | PRO | Chrome QA: verify UTM tracking on social template downloads |  | 
| 136 | ✅ | ✅ | ✅ | NA | ⬜ | ⬜ | UNTESTED | QR Code Auto-Embedding in Exports | ORG | SIMPLE | Chrome QA: verify QR overlay, export with QR embedded |  | 
| 27a | -— | ⬜ | ⬜ | -— | ⬜ | ⬜ | UNTESTED | Social Templates (3 tones × 2 platforms) | ORG | SIMPLE | Chrome QA: verify 3 tone variants, Instagram/Facebook copy | |
| 27b | -— | ⬜ | ⬜ | -— | ⬜ | ⬜ | UNTESTED | Cloudinary Watermark on Photo Exports | ORG | SIMPLE | Chrome QA: verify watermark applied, brand protection visible | |
| 27c | -— | ⬜ | ⬜ | -— | ⬜ | ⬜ | UNTESTED | CSV/JSON Listing Exports (Listing Factory) | ORG | SIMPLE | Chrome QA: verify multi-platform export formats | |
|  33 | NA | ✅ | ✅ | NA | ⬜ | ⬜ | UNTESTED | Share Card Factory (OG Tags) | ORG | SIMPLE | Chrome QA: verify branded social previews, OG images |  | 
|  34 | NA | ✅ | ✅ | NA | ⬜ | ⬜ | UNTESTED | Hype Meter | ORG | SIMPLE | Chrome QA: verify real-time social proof display |  | 
|  63 | NA | ✅ | ✅ | NA | ⬜ | ⬜ | UNTESTED | Dark Mode + Accessibility | BOTH | FREE | Chrome QA: verify dark mode works, WCAG 2.1 AA compliant |  | 
|  67 | NA | ✅ | ✅ | NA | ⬜ | ⬜ | UNTESTED | Social Proof Notifications | BOTH | SIMPLE | Chrome QA: verify engagement notifications (favorites, bids, holds) |  | 
|   6 | ✅ | ✅ | ✅ | 📋 | ⬜ | ⬜ | UNTESTED | Virtual Queue / Line Management | ORG | SIMPLE | Chrome QA: verify queue UI, call next flow, SMS integration |  | 
|  28 | ✅ | ✅ | ✅ | ✅ | ⬜ | ⬜ | UNTESTED | Neighborhood Heatmap | BOTH | SIMPLE | Chrome QA: verify density overlay on map, neighborhood highlighting |  | 
|  39 | ✅ | ✅ | ✅ | ✅ | ⬜ | ⬜ | UNTESTED | Photo Op Stations | ORG | PRO | Chrome QA: verify PhotoOpMarker on map, rate limiting |  | 
|  40 | ✅ | ✅ | ✅ | ✅ | ⬜ | ⬜ | UNTESTED | Sale Hubs | ORG | PRO | Chrome QA: verify hub pages, membership UI |  | 
|  16 | ✅ | ✅ | ✅ | NA | ⬜ | ⬜ | UNTESTED | Verified Organizer Badge | ORG | PRO | Chrome QA: verify badge on sales detail, VerifiedBadge renders |  | 
| 175 | ✅ | ✅ | ✅ | NA | ⬜ | ⬜ | UNTESTED | Coupons (PERCENT/FIXED) | ORG | SIMPLE | Chrome QA: verify coupon creation, validation, application |  | 
| 178 | ✅ | ✅ | ✅ | 📋 | ⬜ | ⬜ | UNTESTED | Item Detail Page | SHO | FREE | Chrome QA: verify `/items/[id]` loads, item details display |  | 
| 180 | ✅ | ✅ | ✅ | ✅ | ⬜ | ⬜ | UNTESTED | Category Browsing | SHO | FREE | Chrome QA: verify `/categories` index, `/categories/[slug]` pages |  | 
| 181 | ✅ | ✅ | ✅ | ✅ | ⬜ | ⬜ | UNTESTED | Tag Browsing | SHO | FREE | Chrome QA: verify `/tags/[slug]` ISR pages |  | 
| 183 | ✅ | ✅ | ✅ | 📋 | ⬜ | ⬜ | UNTESTED | Sale Calendar (Upcoming) | SHO | FREE | Chrome QA: verify `/calendar` page, upcoming sales list |  | 
| 185 | ✅ | ✅ | ✅ | NA | ⬜ | ⬜ | UNTESTED | QR Code Signs (Yard + Item Labels) | ORG | SIMPLE | Chrome QA: verify printable QR codes, yard signs |  | 
| 186 | ✅ | ✅ | ✅ | NA | ⬜ | ⬜ | UNTESTED | QR Scan Analytics | ORG | SIMPLE | Chrome QA: verify QR scan tracking, insights |  | 
| 187 | ✅ | ✅ | ✅ | 📋 | ⬜ | ⬜ | UNTESTED | City Pages | SHO | FREE | Chrome QA: verify `/cities` index, `/city/[slug]` pages |  | 
| 191 | ✅ | ✅ | ✅ | NA | ⬜ | ⬜ | UNTESTED | Route Planning (Multi-Sale) | SHO | FREE | Chrome QA: verify `/api/routes` OSRM-based routing |  | 
| 192 | ✅ | ✅ | ✅ | NA | ⬜ | ⬜ | UNTESTED | Price History Tracking | SHO | FREE | Chrome QA: verify price trends display, historical data |  | 
|  52 | ✅ | ✅ | ✅ | ✅ | ⬜ | ⬜ | UNTESTED | Estate Sale Encyclopedia | SHO | FREE | Chrome QA: verify wiki-style knowledge base, EncyclopediaCard |  | 
|  70 | ✅ | ✅ | ✅ | NA | ⬜ | ⬜ | UNTESTED | Live Sale Feed | SHO | SIMPLE | Chrome QA: verify Redis adapter, JWT socket auth, LiveFeedTicker |  | 
| 193 | ✅ | ✅ | ✅ | 📋 | ⬜ | ⬜ | UNTESTED | Wishlists | SHO | FREE | Chrome QA: verify full CRUD, distinct from favorites |  | 
| 194 | ✅ | ✅ | ✅ | 📋 | ⬜ | ⬜ | UNTESTED | Saved Searches with notifyOnNew | SHO | FREE | Chrome QA: verify save search button, notification on new matches |  | 
| 195 | ✅ | ✅ | ✅ | 📋 | ⬜ | ⬜ | UNTESTED | Shopper ↔ Organizer Messaging | BOTH | FREE | Chrome QA: verify threaded conversations, real-time updates |  | 
| 196 | ✅ | ✅ | ✅ | NA | ⬜ | ⬜ | UNTESTED | Buying Pools | SHO | FREE | Chrome QA: verify group buying on items |  | 
| 197 | ✅ | ✅ | ✅ | ✅ | ⬜ | ⬜ | UNTESTED | Bounties (Item Requests) | SHO | FREE | Chrome QA: verify want-ads, shopper requests work |  | 
| 198 | ✅ | ✅ | ✅ | NA | ⬜ | ⬜ | UNTESTED | Reviews (Submit Sale / Organizer) | SHO | FREE | Chrome QA: verify review submit, organizer receives |  | 
| 200 | ✅ | ✅ | ✅ | 📋 | ✅ | ⬜ | Pending Chrome QA | Shopper Public Profiles | SHO | FREE | Shipped S344. profileSlug/purchasesVisible/collectorTitle schema + migration (deploy needed). GET /shoppers/:id, /shoppers/[id].tsx, settings section. |  | 
| 201 | ✅ | ✅ | ✅ | 📋 | ⬜ | ⬜ | UNTESTED | Favorites | SHO | FREE | Chrome QA: verify item-level favorites, seller-follow (deferred post-beta per S285) |  | 
| 202 | ✅ | ✅ | ✅ | 📋 | ⬜ | ⬜ | UNTESTED | Notification Center | SHO | FREE | Chrome QA: verify `/notifications` page, notification display |  | 
| 203 | ✅ | ✅ | ✅ | NA | ⬜ | ⬜ | UNTESTED | Email + SMS Validation (Twilio) | BOTH | SIMPLE | Chrome QA: verify phone verification via SMS |  | 
|  36 | ✅ | ✅ | ✅ | NA | ⬜ | ⬜ | UNTESTED | Weekly Treasure Digest (Email) | SHO | FREE | Chrome QA: verify MailerLite Sunday 6pm email send |  | 
| 205 | ✅ | ✅ | ✅ | NA | ⬜ | ⬜ | UNTESTED | Contact Organizer | SHO | FREE | Chrome QA: verify messaging system initiates correctly |  | 
| 208 | ✅ | ✅ | ✅ | 📋 | ⬜ | ⬜ | UNTESTED | Pickup Booking (Schedule Pickup) | SHO | FREE | Chrome QA: verify shopper-side scheduling, confirmation |  | 
|  84 | ✅ | ✅ | ✅ | ✅ | ⬜ | ⬜ | UNTESTED | Approach Notes (Arrival Assistant) | SHO | SIMPLE | Chrome QA: verify arrival notification, notes display |  | 
|  47 | ✅ | ✅ | ✅ | ✅ | ⬜ | ⬜ | UNTESTED | UGC Photo Tags | SHO | FREE | Chrome QA: verify shopper photo upload, moderation queue |  | 
| 209 | ✅ | ✅ | ✅ | NA | ⬜ | ⬜ | UNTESTED | Points System | SHO | FREE | Chrome QA: verify 1 pt/visit/day, tier-based points |  | 
| 210 | ✅ | ✅ | ✅ | NA | ⬜ | ⬜ | UNTESTED | Streaks (Visit / Save / Purchase) | SHO | FREE | Chrome QA: verify daily streak tracking, multiplier |  | 
| 211 | ✅ | ✅ | ✅ | NA | ⬜ | ⬜ | UNTESTED | Treasure Hunt (Daily) | SHO | FREE | Chrome QA: verify daily clue, category matching |  | 
|  61 | NA | ✅ | ✅ | NA | ⬜ | ⬜ | UNTESTED | Near-Miss Nudges | SHO | FREE | Chrome QA: verify 4 nudge types, variable-ratio psychology |  | 
|  23 | NA | ✅ | ✅ | 📋 | ⬜ | ⬜ | UNTESTED | Unsubscribe-to-Snooze (MailerLite) | SHO | SIMPLE | Chrome QA: verify unsubscribe intercept, 30-day snooze |  | 
|  57 | ✅ | ✅ | ✅ | NA | ⬜ | ⬜ | UNTESTED | Shiny / Rare Item Badges | SHO | FREE | Chrome QA: verify RarityBadge on item cards, data loads |  | 
|  55 | ✅ | ✅ | ✅ | 📋 | ⬜ | ⬜ | UNTESTED | Seasonal Discovery Challenges | SHO | FREE | Chrome QA: verify rotating challenges, season logic |  | 
| 124 | -— | ✅ | -— | NA | ⬜ | ⬜ | UNTESTED | Rarity Boost XP Sink | SHO | FREE/PAID_ADDON | Chrome QA: verify POST /api/xp/sink/rarity-boost, UI build out "Coming Soon" placeholder |  | 
| 215 | ✅ | ✅ | ✅ | NA | ⬜ | ⬜ | UNTESTED | AI Tag Suggestions (Haiku) | ORG | SIMPLE | Chrome QA: verify part of Rapidfire, all tiers |  | 
| 216 | ✅ | ✅ | ✅ | NA | ⬜ | ⬜ | UNTESTED | AI Condition Grade Suggestions | ORG | SIMPLE | Chrome QA: verify S/A/B/C/D from photo, manual override |  | 
| 217 | ✅ | ✅ | ✅ | NA | ⬜ | ⬜ | UNTESTED | AI SEO Description Optimization | ORG | SIMPLE | Chrome QA: verify high-intent search term bias |  | 
|  21 | NA | ✅ | ✅ | NA | ⬜ | ⬜ | UNTESTED | User Impact Scoring in Sentry | BOTH | FREE | Chrome QA: verify error prioritization by tier/points/hunt-pass |  | 
| 128 | NA | ✅ | ✅ | ✅ | ⬜ | ⬜ | UNTESTED | Automated Support Stack (5-Layer) | PLATFORM | ALL | Chrome QA: verify /support page, fuse.js FAQ, Claude API chat L2, escalation L4 |  | 
| 218 | -— | ⬜ | ⬜ | -— | ⬜ | ⬜ | UNTESTED | Shopper Trades | SHO | FREE | Chrome QA: verify `/shopper/trades` page, trade/swap system | |
| 219 | -— | ⬜ | ⬜ | -— | ⬜ | ⬜ | UNTESTED | Shopper Achievements | SHO | FREE | Chrome QA: verify `/shopper/achievements` page, badge display | |
|  17 | ✅ | ✅ | ✅ | ✅ | ⬜ | ⬜ | UNTESTED | Bid Bot Detector + Fraud Score | ORG | PRO | Chrome QA: verify FraudBadge on holds page, fraud-signals.tsx |  | 
|  32 | ✅ | ✅ | ✅ | ✅ | ⬜ | ⬜ | UNTESTED | Shopper Wishlist Alerts + Smart Follow | SHO | FREE | Chrome QA: verify category/tag/organizer alerts on new items |  | 
|  45 | ✅ | ✅ | ✅ | ✅ | ⬜ | ⬜ | UNTESTED | Collector Passport | SHO | FREE | Chrome QA: verify specialty collection tracking, achievement path |  | 
|  51 | ✅ | ✅ | ✅ | ✅ | ⬜ | ⬜ | UNTESTED | Sale Ripples | SHO | FREE | Chrome QA: verify social proof activity tracking, RippleIndicator |  | 
|  54 | ✅ | ✅ | ✅ | ✅ | ⬜ | ⬜ | UNTESTED | Crowdsourced Appraisal (Base) | BOTH | FREE | Chrome QA: verify request/submit/vote appraisals |  | 
|  68 | ✅ | ✅ | ✅ | ✅ | ⬜ | ⬜ | UNTESTED | Command Center Dashboard | ORG | PRO | Chrome QA: verify per-sale widget dashboard, command center |  | 
|  73 | ✅ | ✅ | ✅ | ✅ | ⬜ | ⬜ | UNTESTED | Two-Channel Notification System | BOTH | SIMPLE | Chrome QA: verify OPERATIONAL + DISCOVERY channels, inbox tabs |  | 
|  76 | NA | NA | ✅ | NA | ⬜ | ⬜ | UNTESTED | Skeleton Loaders | BOTH | FREE | Chrome QA: verify ghost card layouts on item/sale grids |  | 
|  81 | NA | NA | ✅ | NA | ⬜ | ⬜ | UNTESTED | Empty State Audit + Copy Pass | BOTH | FREE | Chrome QA: verify EmptyState component across 8 pages |  | 
|  88 | ✅ | ✅ | ✅ | ✅ | ⬜ | ⬜ | UNTESTED | Haul Post Gallery (UGC Social Proof) | SHO | FREE | Chrome QA: verify UGCPhoto extended, `/hauls` page live |  | 
|  91 | ✅ | ✅ | ✅ | NA | ⬜ | ⬜ | UNTESTED | Auto-Markdown (Smart Clearance) | ORG | PRO | Chrome QA: verify markdownEnabled, markdownFloor, markdownCron |  | 
| 125 | ✅ | ✅ | ✅ | ✅ | ⬜ | ⬜ | UNTESTED | Inventory Syndication CSV Export | ORG | PRO | Chrome QA: verify PRO/TEAMS gate, export rate limiting (1/month) |  | 
| 133 | ✅ | ✅ | ✅ | 📋 | ⬜ | ⬜ | UNTESTED | Hunt Pass Subscription Redesign | SHO | PAID_ADDON | Chrome QA: verify LEGENDARY early access gate, 1.5x XP multiplier |  | 
| 134 | NA | NA | ✅ | ✅ | ⬜ | ⬜ | UNTESTED | Plan a Sale Dashboard Card | ORG | SIMPLE | Chrome QA: verify "Coming Soon" card on organizer dashboard |  | 
| 143 | ✅ | ✅ | ✅ | ✅ | ⬜ | ⬜ | UNTESTED | Rapidfire Camera Mode | ORG | SIMPLE | Chrome QA: verify S313 AI confidence fix deployed, photo upload E2E |  | 
| 173 | ✅ | ✅ | ✅ | ✅ | ⬜ | ⬜ | UNTESTED | Message Templates | ORG | PRO | Chrome QA: verify `/organizer/message-templates` page, templates CRUD |  |
| 221 | -— | ⬜ | ⬜ | -— | ⬜ | ⬜ | Pending Chrome QA | Mark Sold → Hold-to-Pay (Remote Invoice + POS Cart) | BOTH | SIMPLE | Code shipped S341 (schema, backend, frontend). Railway ✅ Vercel ✅. Awaiting browser QA (user journey, Stripe webhook validation). Remote Path: consolidated Stripe Checkout for held items, shopper pays item price, organizer receives minus platform fee. POS Path: pre-stage into organizer's active POS cart. Rank-gated payment windows (Initiate 2h→Scout 3h→Ranger 4h→Sage 6h→Grandmaster 8h), +15 guildXP, Hunt Pass fast-track, Verified Buyer badge, 3-strike no-show system. | Depends on #13 (shipped S332-S340) + Stripe Connect (existing) + POS (existing) |
| 188 | ✅ | ✅ | ✅ | ✅ | ⬜ | ⬜ | Pending Chrome QA | Neighborhood Pages | SHO | FREE | Chrome QA: verify 14 GR neighborhood pages load, content correct, links work | Pages confirmed functional S342 — was stale "not found" note |
|  49 | ✅ | NA | ✅ | ✅ | ⬜ | ⬜ | Pending Chrome QA | City Heat Index | SHO | FREE | Chrome QA: verify /city-heat-index redirects to /cities correctly | Shipped S344 — redirects to /cities; heat density indicator on /cities is future enhancement |
|  64 | ✅ | ✅ | ✅ | ✅ | ✅ | ⬜ | Pending Chrome QA | Save/Wishlist/My Collections | SHO | FREE | Chrome QA: verify nav unified to /shopper/wishlist, favorites tab removed from dashboard, /shopper/favorites + /shopper/alerts redirect correctly | Shipped S344 — nav unified, My Collections label applied to 6 surfaces |
| 122 | ✅ | ✅ | ✅ | ✅ | ✅ | ⬜ | Pending Chrome QA | Explorer's Guild Phase 1 | SHO | FREE | Chrome QA: XP scan cap (100/day), visit XP, Guild nav link, onboarding modal (localStorage-gated), Sage threshold 2500 (beta), Hunt Pass trial banner, SourcebookEntry + Sale.prelaunchAt schema | Shipped S342–S344 |

## ✅ SHIPPED & VERIFIED (Both Claude QA + Human QA)

Features fully shipped and verified by both Claude and Patrick. Compact format — no detailed notes.

| # | Feature | Role | Tier | Notes |
|-----|---------|------|------|-------|
| 137 | Create / Edit / Publish / Archive Sales | ORG | SIMPLE | Edit + Create ✅. 4 create-sale fixes. Chrome QA confirmed. |
| 139 | Sale Map with Geocoding | ORG | SIMPLE | Chrome ✅ S300: Leaflet map with geocoded address |
| 141 | Item Add / Edit / Delete / Status | ORG | SIMPLE | Core CRUD ✅. Chrome QA confirmed. |
| 144 | AI Tag Suggestions + Health Score | ORG | SIMPLE | Haiku-powered. ✅ S301: Suggest Price with CTA. |
| 169 | Organizer Insights (Lifetime) | ORG | PRO | ✅ S301: KPI cards + Per-Sale Breakdown with real data. |
|  87 | Brand & Designer Tracking | SHO | FREE | ✅ S301: Add/remove brands, persists on reload. |
|  85 | Treasure Hunt QR (In-Sale Scavenger Hunt) | SHO | FREE | Organizer toggle + clues + XP. Shopper QR modal + hunt-pass page. |
| 182 | Surprise Me / Serendipity Search | SHO | FREE | `/surprise-me` random discovery |
| 126 | Gamification Legacy Cleanup | SHO | FREE | User.points removed, pointsService deleted. No pts refs live. | 

## Platform Safety & Infrastructure

Infrastructure and internal systems that don't need browser QA. All verified. Format preserved from original.

| # | Feature | Role | Tier | DB | API | UI | QA | Chrome | Nav | Human | Notes |
|---|---------|------|------|----|----|----|----|--------|-----|-------|-------|
|  93 | NA | ✅ | NA | NA | ✅ | NA | ✅ | NA | NA | NA | accountAgeGate.ts confirmed in code. 7-day minimum, ADMIN bypass. Wired to POST /:id/bids. (S280 verified) | 
|  94 | ✅ | ✅ | ✅ | NA | ✅ | ✅ | ✅ | NA | NA | NA | BidIpRecord model + IP tracking in itemController. Admin bid-review page built. (S280 verified) | 
|  95 | NA | ✅ | NA | NA | ✅ | NA | ✅ | NA | NA | NA | bidRateLimiter.ts confirmed — 10 bids/60s via Redis, graceful degradation. (S280 verified) | 
|  96 | NA | ✅ | ✅ | NA | ✅ | ✅ | ✅ | NA | NA | NA | Confirmed: stripeController itemized breakdown + CheckoutModal disclosure. (S280 verified) | 
|  97 | NA | ✅ | NA | NA | ✅ | NA | ✅ | NA | NA | NA | Confirmed: breakdownHtml in stripeController with buyer premium, item photo, org name, etc. (S280 verified) | 
|  98 | ✅ | ✅ | NA | NA | ✅ | NA | ✅ | NA | NA | NA | Confirmed: CheckoutEvidence model in schema + auto-capture in stripeController. (S280 verified) | 
|  99 | ✅ | ✅ | NA | NA | ✅ | NA | ✅ | NA | NA | NA | CSV/JSON exports limited to 1 per month per account; prevents data harvesting. See anti-abuse-system-design-2026-03-19.md §Vector 1 | 
| 100 | NA | ✅ | NA | NA | ✅ | NA | ✅ | NA | NA | NA | Refunds capped at 50% if requested <30 days post-signup. See anti-abuse-system-design-2026-03-19.md §Vector 1 | 
| 101 | ✅ | ✅ | NA | NA | ✅ | NA | ✅ | NA | NA | NA | Hard gate: no multi-account signup with same email. See anti-abuse-system-design-2026-03-19.md §Vector 4 | 
| 102 | ✅ | ✅ | ✅ | NA | ✅ | ✅ | ✅ | NA | NA | NA | Links organizer accounts sharing Stripe card/PayPal; suggests merge to Pro tier. See anti-abuse-system-design-2026-03-19.md §Vector 4 | 
| 103 | ✅ | ✅ | NA | NA | ✅ | NA | ✅ | NA | NA | NA | Auto-archive after 90 days, delete after 1 year; reduces Cloudinary costs indefinitely. See total-cost-of-ownership-2026-03-19.md §Section 3 | 
| 106 | ✅ | ✅ | ✅ | NA | ✅ | ✅ | ✅ | NA | NA | NA | OrganizerReputation model + computeReputationScore service confirmed in code. Badge endpoint live. (S280 verified) | 
| 107 | ✅ | ✅ | NA | NA | ✅ | NA | ✅ | NA | NA | NA | Flags pattern of chargebacks + same-IP bidding; suspension after 3+ incidents. See anti-abuse-system-design-2026-03-19.md §Vector 2 | 
| 108 | ✅ | ✅ | NA | NA | ✅ | NA | ✅ | NA | NA | NA | Flags auctions with winning bid <10% of estimated value; holds payment 24h for review. See anti-abuse-system-design-2026-03-19.md §Vector 3 | 
| 109 | ✅ | ✅ | NA | NA | ✅ | NA | ✅ | NA | NA | NA | 30-day pattern detection: low-price sales with no activity flagged. See anti-abuse-system-design-2026-03-19.md §Vector 3 | 
| 110 | ✅ | ✅ | ✅ | NA | ✅ | ✅ | ✅ | NA | NA | NA | Suggests merge for accounts from same IP with >3 concurrent sales in <7 days. See anti-abuse-system-design-2026-03-19.md §Vector 4 | 
| 114 | ✅ | ✅ | ✅ | NA | ✅ | ✅ | ✅ | NA | NA | NA | Tracks bid cancellations; pattern flagged after 5+ cancellations + 3+ chargebacks. See anti-abuse-system-design-2026-03-19.md §Vector 2 | 
| 117 | ✅ | ✅ | NA | NA | ✅ | NA | ✅ | NA | NA | NA | Flags buyers at 2+ chargebacks; suspends after 3+ incidents. See anti-abuse-system-design-2026-03-19.md §Vector 6 | 
| 115 | ✅ | ✅ | ✅ | NA | ✅ | ✅ | ✅ | NA | NA | NA | Only non-refunded past purchasers can leave reviews; prevents fake review spam. See anti-abuse-system-design-2026-03-19.md §Novel Vector B | 
| 116 | ✅ | ✅ | NA | NA | ✅ | NA | ✅ | NA | NA | NA | Flags reviews <1 hour post-purchase or from same IP within 24 hours; manual moderation queue. See anti-abuse-system-design-2026-03-19.md §Novel Vector B | 
| 111 | NA | ✅ | NA | NA | ✅ | NA | ✅ | NA | NA | NA | Rate limits image endpoints; prevents bot harvesting via Cloudinary bandwidth spike. See total-cost-of-ownership-2026-03-19.md §Section 4 | 
| 112 | ✅ | ✅ | NA | NA | ✅ | NA | ✅ | NA | NA | NA | Quarterly soft-delete of old sales/items; reduces Neon compute bloat. See total-cost-of-ownership-2026-03-19.md §Section 3 | 
| 113 | ✅ | ✅ | NA | NA | ✅ | NA | ✅ | NA | NA | NA | Background worker processes tags; prevents Claude API rate limiting during peak uploads. See total-cost-of-ownership-2026-03-19.md §Risk #4 | 
| 118 | NA | ✅ | ✅ | NA | ✅ | ✅ | ✅ | NA | NA | NA | Auto-compress photos on-device; reject images <100×100px or >50MB. See anti-abuse-system-design-2026-03-19.md §Novel Vector C | 
| 120 | ✅ | ✅ | NA | NA | ✅ | NA | ✅ | NA | NA | NA | Flags sales cancelled <2h post-publication with >100 holds; requires organizer explanation. See anti-abuse-system-design-2026-03-19.md §Novel Vector A | 
| 121 | Tiered Photo Storage Migration (Cloudinary → B2/Bunny) | PLATFORM | ALL | ✅ | ✅ | -— | — | NA | NA | NA | Implements 3-tier strategy: Active (0–90d on Cloudinary), Warm (90d–2y on B2 + Bunny CDN), Cold (2y+ metadata-only). Saves ~70% storage cost; enables B2B analytics. See photo-storage-strategy-2026-03-19.md |
| 104 | NA | ✅ | -— | NA | ✅ | -— | ✅ | NA | NA | NA | Auto-switch to Ollama if Claude API cost exceeds monthly threshold. See total-cost-of-ownership-2026-03-19.md §Section 5 | 
| 105 | NA | ✅ | -— | NA | ✅ | -— | ✅ | NA | NA | NA | cloudinaryBandwidthTracker.ts confirmed — tracks daily serves, alerts at 80% of 25GB free tier. (S280 verified) | 
| 119 | ✅ | ✅ | -— | NA | ✅ | -— | ✅ | NA | NA | NA | Tracks monthly chargeback rate; triggers pre-auth + payment hold if >0.8%, account escalation if >1%. See anti-abuse-system-design-2026-03-19.md §Novel Vector D | 
| 220 | ✅ | -— | —- | NA | -— | —- | -— | NA | NA | NA | Consolidate scattered Cloudinary URL generation into single shared utility. S317. | 

## Blocked

| # | Feature | Role | Tier | DB | API | UI | QA | Chrome | Nav | Human | Notes |
|---|---------|------|------|----|----|----|----|--------|-----|-------|-------|
|  53 | -— | -— | -— | NA | -— | — | -— | NA | NA | -— | Legal review required — ToS risk with EstateSales.NET/Facebook scraping. ADR written. | 

## Deferred & Long-Term Hold

### Infrastructure & Platform

| Feature | Role | Tier | Reason | Revisit Trigger |
|---------|------|------|--------|-----------------|
| #69 Local-First Offline Mode | ORG | PRO | Post-beta deferred — architectural complexity, service worker caching strategy needs validation against Railway/Vercel constraints. | After beta stabilizes and offline demand confirmed |
| Zero-Downtime Migration Framework | INFRA | TEAMS | Blue-green migrations for large tables (items, purchases). Critical as data grows past 10k rows. Architect designs; Dev builds helpers. | When table sizes warrant it |
| Canary Deploy + Auto-Rollback | INFRA | SIMPLE | Deploy to Vercel preview + Railway staging first; auto-rollback if smoke tests fail. Enables daily deploys without risk. | After beta stabilizes — **trigger effectively met; pre-wire: Vercel preview env + Railway staging slot config can be set up now** |
| Audit Automation Library | INFRA | SIMPLE | Codify 8 pre-beta audit paths as reusable tests; run on every deploy. health-scout creates `audit_baseline.json`. | After beta launch — **trigger effectively met; pre-wire: health-scout baseline JSON and test harness can be scaffolded now** |

### Market Expansion & Positioning

| Feature | Role | Tier | Reason | Revisit Trigger |
|---------|------|------|--------|-----------------|
| #56 Printful Merch Store | BOTH | FREE | No demand signal pre-beta; external API adds complexity. | After beta proves shopper appetite for branded merch |
| #86 Friend Network (social graph) | SHO | FREE | DEFERRED S274 (Patrick+Architect). Social graph infra entangles with notifications, tier logic, and abuse guardrails. Public Shopper Profiles already shipped. | After beta feedback on #87/#88 social features; returns as S2 item |
| Affiliate Program | ORG | TEAMS | Backend 60% built. Referral badges (SIMPLE) + loyalty passport integration worth exploring first. Full payouts deferred. | After referral badges prove demand — **pre-wire: payout calculation engine + referral code table can be added to schema now; activation becomes a config flag** |
| White-label MaaS | ORG | TEAMS | Business decision — beta validation first | After beta data |
| Persistent Inventory (Cross-Sale Item Library) | ORG | PRO | Items that persist across multiple sales — organizer builds a master library, pulls items into each sale, unsold items carry over automatically. Designed for flea market vendors, antique booth operators, and recurring sale organizers. Requires new data model (items not bound to a single sale). `/organizer/inventory` is stubbed as "Coming Soon." | After beta data confirms demand from recurring-sale organizer segment — **pre-wire: add `persistentInventory` boolean + `masterItemLibraryId` FK to Item schema now; activation becomes a filter flag** |
| Consignment Integration | ORG | PRO | Thrift store POS — post-beta complexity | After beta data — **pre-wire: add `consignorId` + `consignmentSplitPct` fields to Item schema now; extends inventory library with zero migration at trigger** |
| QuickBooks Integration | ORG | SIMPLE | CSV export covers 80% of need | When organizers ask — **pre-wire: add QB-compatible column ordering + account codes to existing CSV export; zero-build activation when demand arrives** |
| Multi-metro expansion | ORG | SIMPLE | Beta validation first | After beta data |
| BUSINESS_PLAN.md rewrite | PUB | TEAMS | Reflect national positioning and current fee/feature state | After beta data confirms positioning |

### Hardware & Research

| Feature | Role | Tier | Reason | Revisit Trigger |
|---------|------|------|--------|-----------------|
| Video-to-inventory | ORG | TEAMS | Vision models can't reliably segment rooms yet | Late 2026+ |
| AR Furniture Preview | SHO | TEAMS | Hardware not ready | Long-term R&D |

### Brand Spreading & Viral Growth [S2-S3 DEFER]

| Feature | Role | Tier | Reason | Revisit Trigger |
|---------|------|------|--------|-----------------|
| Shopper Referral + Affiliate Mechanics | SHO/ORG | FREE | Shoppers earn 5% store credit on referrals; organizers earn 2-3% override. Leaderboard + badges. Needs financial model clarity first. | After pricing + financial model validated |
| Community Challenge / "Hunt Week" Viral Events | SHO | FREE | Weekly themed hunts with prizes, featured placement. Drives virality but needs organizer volume first. | After 50+ concurrent active sales |
| Organizer Brand Kit Expansion | ORG | PRO | Custom fonts, branded email signature, printable business cards, letterhead, social headers, yard sign PDFs with QR codes. | After Brand Kit v1 proves user adoption |
| Organizer Hall of Fame Leaderboard | ORG | SIMPLE | Top organizers by items sold/revenue/ratings. Monthly featured spotlight + badges. Community gamification. | After 100+ organizers + 6 months data |
| Community "Feature Your Sale" Request Form | SHO | FREE | Shoppers nominate sales for featured homepage placement. Moderation queue. Low complexity. | After homepage design stabilizes |
| Print-to-QR Sign Kit | ORG | SIMPLE | Downloadable PDF toolkit: yard signs, directional signs, table tents, hang tags, car magnets with QR codes. | When organizers request print collateral |
| AI Content Generation for Organizers (S3) | ORG | PRO | Claude Haiku auto-writes 10 social post variants per sale. Organizer picks + posts. Defer until templates prove demand. | After Social Templates adoption tracked |
| TikTok / Reels Auto-Generation (S3) | ORG | PRO | 15-second video from photos. Needs video generation, music licensing. Defer until social templates validate demand. | After Social Templates uptake proven |

### Advanced Organizer Features

| Feature | Role | Tier | Reason | Revisit Trigger |
|---------|------|------|--------|-----------------|
| #90 Sale Soundtrack (Ambient Vibes) | ORG | FREE | DEFERRED to organizer-side (S342). Remove from sale detail page — rebuild as inline ambient player on organizer dashboard or POS view when that redesign is in scope. | When organizer dashboard/POS redesign is underway |
| Instant Flash Auctions | ORG | PRO | Pre-beta, zero shoppers — no demand signal yet | After beta + 4–6 wks shopper data |
| Live Stream Sale Events | ORG | PRO | Heaviest build (3–4 sprints), requires on-camera organizers | After beta proves organizer appetite |
| Verified Organizer Insurance Badge | ORG | TEAMS | Requires micro-insurance partner — unvalidated market | After beta data + partner conversations |
| Hyper-Local Pop-Up Sale Network | SHO | FREE | Heatmap covers density; marketing layer on top | After Heatmap proves cluster value |

### Gamification Variants (Early Experiments)

| Feature | Role | Tier | Reason | Revisit Trigger |
|---------|------|------|--------|-----------------|
| QR/Barcode Item Labels | ORG | SIMPLE | Print scannable labels during intake → POS scan for instant lookup. High potential from retail experience. Pairs with POS v2. | Strong candidate when POS sees real usage |
| Featured Listings (Feature Boost) | ORG | PAID_ADDON | Paid homepage placement ($50–100/sale). Zero value pre-scale — needs 500+ daily shoppers. | After 500+ organizer accounts + 10+ active sales |
| Crowd-Sourced Corrections (Community Intel) | SHO | FREE | Shoppers report "still available?" status + correct entrance locations. Vote-based ranking. | After 500+ concurrent shoppers exist |
| Fast Pass for Sales (Priority Entry) | SHO | PAID_ADDON | $5–15 per pass, 30-min early access, capped at 20–50 passes. Revenue stream for organizers. | After beta proves high-demand sales |
| Sale Grand Finale Events | ORG | PRO | Last 2 hours: live-streamed event, flash auctions, 5x XP. Requires streaming infra. | After Live Stream Sale Events |
| VIP Behind-the-Scenes Tours | ORG | PAID_ADDON | $99–299 video shoot package with creator. Professional content for organizer marketing. | After creator network develops |
| Buddy System (Paired Shopping) | SHO | FREE | Pair with friend for sale visits. Shared cart, bonus XP, co-collector profile. | After gamification + social features |

### Creator & Community Economy

| Feature | Role | Tier | Reason | Revisit Trigger |
|---------|------|------|--------|-----------------|
| Restoration & Upcycling Marketplace | BOTH | FREE | Before/after project gallery. "Studio Pro" tier for restorers. Creator economy play. | After UGC Photo Tags proves community appetite |
| Book Club & Vinyl Community Hubs | SHO | FREE | Moderated collector hubs with feeds, swaps, events, challenges. Niche community retention. | After Collector Passport proves specialty-interest demand |

### Long-Term Platform Vision (R&D Phase)

| Feature | Role | Tier | Reason | Revisit Trigger |
|---------|------|------|--------|-----------------|
| FindA.Sale Network (Tier 3 Services) | PUB | TEAMS | Multi-sided ecosystem: organizers + buyers + restorers + appraisers + shippers + designers. Platform as infrastructure OS. | Transformative — after platform proves all 3 tiers viable |
| AI Buying Agent Scout | SHO | PRO | Personal AI shopping agent. Learns taste, proactively watches sales, auto-notifies. Premium $9.99/mo. | After ML pipeline + personalization data |
| Estate Planning Toolkit | ORG | TEAMS | Heir/executor liquidation assistant: inventory builder, appraisal integration, tax reporting. Upstream demand creation. | After core organizer features stable — **trigger effectively met; pre-wire: add `executorUserId` + `estateId` to Organizer schema; intake fields cost zero to add now** |
| State of Estate Sales Report | ORG | PAID_ADDON | Monthly anonymized data report: pricing trends, category velocity, regional hotspots. B2B intelligence ($199/yr). | After 6+ months transaction data |

### B2B/B2E/B2C Innovation Streams (Future Revenue Moats)

Deferred until 200+ organizers across 5+ metro areas. Requires aggregated anonymized transaction data (pricing, categories, locations, inventory patterns) to be credible. See `claude_docs/strategy/b2b-b2e-b2c-innovation-broad-2026-03-19.md` (full analysis) and `claude_docs/strategy/b2b-b2e-innovation-2026-03-19.md` (estate-focused opportunities).

| Feature | Role | Tier | Reason | Revisit Trigger |
|---------|------|------|--------|-----------------|
| Secondhand Market Intelligence Feed (B2B) | B2B | PAID_ADDON | Aggregated data: category pricing trends, regional inventory velocity, seasonal patterns. Target: antique dealers, resellers, retailers. $99–$499/mo. | After 200+ organizers + 12+ months data |
| Home Contents Valuation API (B2B for Appraisers/Insurers) | B2B | PAID_ADDON | Real-transaction valuation models trained on FindA.Sale data (not appraisal comps). License API to estate appraisers, insurance companies, tax professionals. $499–$999/mo. | After 200+ organizers + 6+ months credible data |
| Antiques Dealer Early Access Platform (B2B) | B2B | PAID_ADDON | Dedicated marketplace + curated feeds for professional dealers. First access to high-value estates. Target: antiquarians, gallery owners, auction houses. Premium subscription or commission on referrals. | After 200+ organizers + professional demand validation |
| Valuation Engine API Licensing (B2B) | B2B | PAID_ADDON | White-label API for eBay, Shopify, and marketplace integrations. Real-time pricing suggestions powered by our dataset. Revenue: API fees + per-query pricing. | After API-First Toolkit ships — Q1 2027+ |
| Flea Market Operator White-Label Platform (B2B) | B2B | TEAMS | White-label FindA.Sale for flea market operators (100+ vendors/weekend). Customizable vendor registration, booth lookup, item aggregation. Revenue: $1K–$5K/month per operator. | After core features stable + multi-organizer workflows proven |
| Municipal Economic Intelligence (B2E) | B2E | PAID_ADDON | Sell anonymized estate sale data to city planners, economic development authorities. Insights: household wealth distribution, downsizing trends, real estate health signals. Target: City Planner Associations. $500–$2K/month. | After 200+ organizers across 10+ cities |
| Moving Company Logistics Integration (B2B) | B2B | PAID_ADDON | White-label partnership + data feed. Help moving companies identify estate liquidation opportunities. Revenue: commission on referrals or subscription access. | After 500+ organizers |
| Nonprofit Fundraising Suite (B2C) | B2C | PAID_ADDON | Turnkey platform for nonprofits to run rummage/silent auctions. FindA.Sale handles fulfillment; nonprofit gets 100% of proceeds. Revenue: 10% of non-profit GMV. | After core nonprofit features prove demand |
| Consignment Shop Operations Suite (B2B) | B2B | TEAMS | Full SaaS for independent consignment shops (inventory, multi-vendor, POS, settlement). FindA.Sale becomes fulfillment + marketing layer. Revenue: $99–$199/month per shop. | After core organizer features stable + consignment demand validated |
| Organizer Certification Program (B2C/B2B) | B2C | PAID_ADDON | Accredited training + badge program for professional estate organizers. Courses: valuation, pricing psychology, buyer psychology, legal compliance. Revenue: $99/course, lifetime access, badge marketplace. | After 1,000+ shoppers + 200+ organizers |
| Shopper Behavior API (B2B) | B2B | PAID_ADDON | Anonymized behavioral data: search patterns, purchase intent, seasonal demand, demographic affinities. License to retailers, category managers, B2C marketplaces. $499–$999/mo. | After 10,000+ shoppers + 12+ months behavioral data |
| Circular Economy Data Feed (B2E) | B2E | PAID_ADDON | ESG/sustainability data: avg item lifecycle cost, resale % by category, waste reduction metrics. Target: ESG consultants, corporate sustainability teams, nonprofits. $199–$499/mo. | After 300+ organizers + data cleanup |
| Liquidation Insurance Product (B2B) | B2B | PAID_ADDON | Partner with specialty insurer: FindA.Sale users insure auction liquidations against underperformance. Revenue: 3–5% commission on policies written. | After 200+ organizers + claims data validated |
| Estate Sale Futures Market (Speculative R&D) | B2B | TEAMS | Speculative — bundle future estate sales; institutional buyers bid on portfolios. High-risk, high-reward. Regulatory review required. Legal TBD. | Long-term R&D — post-2027 |
| Full-Service Liquidation Platform (Speculative R&D) | ORG | TEAMS | Speculative — FindA.Sale hires liquidation coordinators; coordinates end-to-end estate liquidation for high-value estates. Revenue: 12–18% of GMV. Operational complexity TBD. | Long-term R&D — post-2027 |

### Gamification Research (Innovation Round 3)

| Feature | Role | Tier | Reason | Revisit Trigger |
|---------|------|------|--------|-----------------|
| Mystery Box Drops | SHO | FREE | Pre-beta, zero shoppers. Needs gamification scaffold + shopper base. MI gambling/sweepstakes law review needed. | After badge/XP system + Legal clears compliance |
| Daily Spin Wheel | SHO | FREE | Requires reward infrastructure + shopper base. Board may flag "too gamey" — position as daily check-in reward. | After badge/XP system + 500+ daily shoppers |
| Boost My Listing ($1-$5 microtx) | ORG | PAID_ADDON | Zero value until 50+ active sales + 500+ daily shoppers. FTC paid placement disclosure required. | After 500+ daily shoppers + Legal reviews disclosure |
| Instant Appraisal Token ($0.99) | SHO | PAID_ADDON | Needs sold-item data to be credible. Overlaps with AI Valuations. Requires 1,000+ sold items per category. | After AI Valuations + 6 months transaction data |
| Priority Checkout Pass ($2.99) | SHO | PAID_ADDON | Requires in-person QR validation + POS integration + organizer opt-in. Only viable at high-traffic sales. | After POS v2 sees real usage |
| Scan-to-Know (NFC Item Tags) | BOTH | SIMPLE | NFC tags add $0.05-$0.15/item cost. Start with QR labels first. Evolution of QR/Barcode Labels. | After QR labels prove demand |
| Smart Cart (Running Total) | SHO | SIMPLE | Only works for items with digital prices. Requires organizer adoption of digital pricing + QR/NFC. | After QR Labels + POS established |
| Agentic AI Assistant ("Scout") | SHO | PRO | Requires Wishlist Alerts + Collector Passport + sold-item data. XL complexity. Overlaps with AI Buying Agent Scout. | After Wishlist + Collector Passport + 6 months data — **pre-wire: add `tasteProfile` JSONB field to User schema now; preference data accrues passively from wishlist/save behavior before feature ships** |
| Voice Search + Navigation | SHO | SIMPLE | Web Speech API browser-native. Nice-to-have, not a retention driver. | After core search polished |
| RaaS for Organizers (Resale-as-a-Service) | ORG | TEAMS | Long-term platform vision: full business management suite. Japan/EU circular economy model. | After individual features prove themselves — 2027+ |
| Multi-Language Support (Spanish First) | PUB | SIMPLE | 42M native Spanish speakers in U.S. i18n framework. Important for national scale, not urgent for GR beta. | Before national expansion — Q1 2027 — **pre-wire: install next-intl now and extract all UI strings to locale files; every future UI addition becomes translation-ready automatically** |
| API-First Organizer Toolkit | ORG | TEAMS | OAuth2 auth, docs, rate limiting, versioning for public API. Behind Premium Tier. Enables Zapier. | After core features stabilize — Q4 2026-Q1 2027 — **pre-wire: add `ApiKey` table to schema + auth middleware stub now; no migration needed at launch** |
| Zapier/Make.com Integration Hub | ORG | TEAMS | Requires API-First Toolkit first. Official Zapier app with triggers + actions. 2.2M businesses use Zapier. | After API-First ships — Q1-Q2 2027 |
| TikTok-Style Item Reveal Feed | SHO | FREE | Vertical swipe feed of item reveals. Only works with high photo quality + item volume (100+/area). | After Rapidfire + Listing Factory drive quality up |
| Organizer AMAs (Reddit-Style Q&A) | BOTH | FREE | Scheduled pre-sale preview + Q&A sessions. Requires chat infrastructure + organizer willingness. | After 10+ active organizers |
| Workflow Automations (Built-in IFTTT) | ORG | PRO | Rule builder: Trigger → Condition → Action. Start with 5-10 hardcoded automations. | Hardcoded Q3 2026; custom rules 2027 |
| Auto-Reprice (Market-Responsive Pricing) | ORG | PRO | AI adjusts prices based on real-time demand signals. Extends Auto-Markdown. Requires transaction data. | After 6+ months transaction data |

*Deprecated (won't build): Co-Branded Yard Signs, Multi-Format Marketing Kit.*

---

## Rejected by Board

### Innovation Session — Brand Spreading [REJECT]

| Idea | Role | Tier | Reason |
|------|------|------|--------|
| Shopper Instagram Sticker Sharing | SHO | FREE | Instagram API too restrictive. Revisit Q3 if partnership emerges. |
| White-Label Resale Platform (B2B) | ORG | TEAMS | Too early. Revisit after 10+ paying organizers + $5K+ MRR proven. |
| Marketplace Watermark Variants | ORG | SIMPLE | Too micro-tactical. Merge into Nextdoor export template work. |

### Historical Rejections
| Idea | Role | Tier | Reason |
|------|------|------|--------|
| Pokéstop-Style Sale Markers | SHO | FREE | Gamification mismatch — estate sale shoppers skew older, Pokémon framing alienates core demo. |
| Trader Network | BOTH | TEAMS | P2P trading adds liability, moderation, and trust complexity. Not core to organizer value prop. |
| Egg Hatching Mechanic | SHO | FREE | Too game-y for audience. Confusing metaphor for non-gamers. |
| Team Rivalries | SHO | FREE | Competitive team mechanics don't match collaborative sale-shopping culture. |
| Raid-Style Group Events | SHO | FREE | Complex coordination + real-time features for uncertain demand. |
| Professional Certifications | ORG | TEAMS | Requires industry partnerships, legal review, ongoing administration. Low ROI for beta stage. |
| Mood Boards | SHO | FREE | Nice-to-have but no clear retention or revenue driver. |
| AR Item Overlay | SHO | TEAMS | Hardware/browser support still spotty. High build cost for novelty feature. |

## Design Decisions (Locked — Session 155)
- **Holds expiry:** 48 hours default, configurable per-sale in organizer settings. Nightly cron cleanup.
- **Health score:** Hybrid gate — block publishing below 40% (no photo or title), nudge 40–70%, free above 70%. Progress bar UX, never punitive.
- **Tag vocabulary:** Curated list of 30–50 core tags + 1 free-form custom slot per item. AI suggests from curated list. Quarterly review.
- **Social templates:** Auto-fill v1 with 3 tone options (Casual, Professional, Friendly). Defer WYSIWYG editor to post-beta.
- **Heatmap density:** Radius-based (1–3 mile), pre-computed grid tiles every 6h, 7-day rolling window.
- **Background removal:** On-demand Cloudinary `b_remove` transform only. Primary photo. No batch job.
- **Holds grouping:** By-item in schema, grouped-by-buyer in display. No junction table.
- **Reputation scoring:** Two separate scores — organizer reputation (sale quality, reliability) and shopper reputation (buyer reliability, pickup behavior). Schema must accommodate both; shopper score can be deferred but field must exist from day one. Single-score merge not permitted after schema is locked.
- **Tier lapse state:** Lapsing organizer subscription suspends organizer-only features. Shopper features retained. Full account freeze is not the default behavior. Re-activation on billing resume restores organizer features immediately.
- **Notification defaults:** Both notification channels default to opt-in. Shopper discovery alerts and organizer operational alerts are separate consent items at registration. No "all on" default for either channel.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                 