# ROADMAP – FindA.Sale v2

**Last Updated:** 2026-04-14 (v104 — S450–S459: Dashboard character sheet + rank staleness P0 fixed (S450); dashboard layout reordered + action buttons + QR inline (S451); eBay + Stripe go-live prep with policy IDs + bidirectional sync (S452); Hunt Pass recurring Stripe Subscription + POS generic product (S454); eBay inventory OAuth/cart fixes + terminology cleanup (library→inventory) (S455); eBay inventory fully operational with Trading API GetItem enrichment (86 items, photos) (S456); Pull to Sale fixed (embedding + inInventory filter) (S457); Pull to Sale UX + enhanced GetItem enrichment (S458); eBay webhook + enrichment operational (S459). Patrick human QA confirmed: S451 dashboard layout ✅, S450 rank display + character sheet ✅, S456 eBay import ✅. #25 UPDATED: eBay import shipped S456 with 86 items imported + photos + categories; S457 Pull to Sale fixed; S458–S459 enrichment operational.)
**Last Updated:** 2026-04-08 (v102 — S413–S416: Admin nav gaps filled (ab-tests, bid-review, disputes, invites), 4 orphaned pages removed, AI terminology sweep, feature gating fixes (S413). eBay category picker shipped with searchable 2-level hierarchy (S414). Tech debt Phase 1+2 — 30 files: Stripe price IDs → env vars, fraud cron wired, Zod validation on 5 routes, next/image migration, condition constants centralized, account deletion endpoint (S415). Map MVP: Treasure Trails amber badge on sale pins + RouteBuilder "Start from My Location" toggle; loot-log imageUrl fix; dispute filing restored to ReceiptCard; pricing transparency (all-in fee callouts); PRO upgrade nudge banner; 4 integration test files (S416). ⚠️ ROADMAP ROW UPDATES PENDING for S413–S416 new features — queue for S417 roadmap pass.)
**Last Updated:** 2026-04-07 (v101 — S412: Checklist sale-picker created (pages/organizer/checklist/index.tsx, 200 lines). Shopper reputation page rebuilt from stub to full dashboard (pages/shopper/reputation.tsx, 366 lines) showing purchase count, payment completion rate, total spent, reputation level logic. #148 Sale Checklist Nav ✅. #71 Reputation Score status upgraded to reflect S412 rebuild. 12+ nav links unblocked: promote, send-update, photo-ops, qr-codes, calendar, staff, earnings, ripples, ugc-moderation, inventory, reputation (organizer), bounties, line-queue removed "(Soon)" labels + cursor-not-allowed.)
**Last Updated:** 2026-04-07 (v100 — S411: S409+S410 Chrome smoke test complete. Dashboard ✅, Calendar auth guards ✅, Listing Type UI ✅, Promote page template social ✅. Bug fixed: #27a Social Post Generator modal had no trigger — "📱 Social Posts" button added to dashboard PUBLISHED sale card in S411. #27a still Pending Chrome QA for end-to-end AI post generation test.)
**Last Updated:** 2026-04-07 (v99 — S409 audit: Moved 3 Chrome-verified features (#133 Hunt Pass Redesign, #213 Hunt Pass, #287 Add-Items Sort Controls all Chrome-verified S407) from UNTESTED to "Only Human Left". Previous v98 — S408 audit: S392–S407 shipping + Chrome QA applied. POS #162 Chrome-verified S406b+S407 ✅. Hunt Pass #133/#213 Chrome-verified S407 ✅ (⚠️ cleared — 2x→1.5x copy fixed S390). New entries: #284 Feedback Survey System, #285 POS In-App Payment Request, #286 Shopper QR Code, #287 Add-Items Sort Controls (all S397–S405). eBay production confirmed S406b. Condition field standardized S406. Health score category scoring S402/S406.)
**Last Updated:** 2026-04-03 (v97 — S391: Condition rating XP wired (#145), streak milestone triggers wired (#210), Collector Passport completion XP + migration (#45), Haul Posts #88 LIVE (2 new pages + nav), Treasure Hunt Pro Hunt Pass perk (#278), Rare Finds Pass Hunt Pass perk (#279). #278–#283 new entries.)

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
|  84 | ExplorerProfile Schema | ARCH | RESOLVED S352 — Option A: all gamification fields (guildXp, explorerRank, huntPassActive, huntPassExpiry) already exist on User model. No schema change needed. GET /api/xp/profile already existed; service response shape corrected + GRANDMASTER threshold fixed (10000→5000). Dashboard fully wired. | None — resolved | No |


## Only Human Left

|  #  | DB | API | UI | Nav | Claude QA | Human QA | Status | Feature | Role | Tier | Needs | Notes |
|-----|----|----|----|----|-----------|----------|--------|---------|------|------|-------|-------|
|  62 | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ Chrome-verified S355 | Digital Receipt + Returns | SHO | FREE | Chrome-verified S355: page renders, empty state correct. S356: receiptController null guard on p.item?.title (TS build fix). Ready to graduate to TESTING. | Auto-generated receipt post-POS, return window |
| 157 | ✅ | ✅ | ✅ | 📋 | ✅ | ✅ Chrome-verified S356 | Pickup Scheduling | BOTH | SIMPLE | Chrome-verified S356: "+ Add Pickup Slot" button (type="button") stays on page, slot form opens with 6 date/time inputs. Axios fix (S346) confirmed working. Ready to graduate to TESTING. | Organizer slots + shopper booking |
|  37 | ✅ | ✅ | ✅ | 📋 | ✅ | ✅ Chrome-verified S355 | Sale Reminders (Remind Me) | SHO | SIMPLE | Chrome-verified S355: fires correctly, toggles to "Cancel Reminder" state. Copy + toggle fix (S344) confirmed working. Ready to graduate to TESTING. | Sale alerts for shoppers |
|  89 | NA | ✅ | ✅ | 📋 | ✅ | ✅ Chrome-verified S355 | Unified Print Kit | ORG | SIMPLE | Chrome-verified S355: toast fires correctly. URL prefix fix (S344) confirmed working. Ready to graduate to TESTING. | /organizer/print-kit/[saleId] — yard sign + item price tags (6/page). Print CSS. |
| 243 | NA | ✅ | ✅ | ✅ | ✅ | ✅ Chrome-verified S376 | Smart Cart (Running Total) | SHO | SIMPLE | Human QA: verify cross-sale switch modal, checkout flow | S375: localStorage shopper cart — useShopperCart hook + ShopperCartDrawer + ShopperCartFAB. Single-sale scoping, cross-sale switch confirm. Wired to sale detail page. S376: Chrome QA as user11 — Buy Now + "+ Cart" buttons ✅, toast on add ✅, toggles "✓ In Cart" ✅, SOLD excluded ✅, cart drawer in DOM ✅. FAB z-index + position fixed. Also wired into items/[id].tsx. S378: ShopperCartDrawer wired to desktop nav cart button. |
| 140 | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | WORKS | Sale Calendar View | BOTH | SIMPLE | Human QA | Organizer + shopper views load, events display on calendar, click event → sale detail  | 
| 151 | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | WORKS | Notification Inbox | BOTH | SIMPLE | Human QA | In-app notification center loads, notifications display with timestamps, click → navigate to relevant page  | 
| 162 | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | Chrome-verified S406b+S407 | Stripe Terminal POS (v2) | ORG | SIMPLE | Human QA | S406b ✅: all 4 payment tiles render (Cash/Stripe QR/Card Reader/Invoice), correct order. S407 ✅: Cash tile highlights green on click. S394: rebuilt PosManualCard/PosPaymentQr/PosOpenCarts/PosInvoiceModal. Multi-item, cash change calc, shopper QR scan via POS (S405). |
|  22 | NA | ✅ | ✅ | ✅ | ✅ | ✅ | WORKS | Low-Bandwidth Mode (PWA) | BOTH | SIMPLE | Human QA | Network API detection, localStorage, LowBandwidthContext loads, images compress on slow networks  | 
|  19 | ✅ | ✅ | ✅ | ✅ | ✅ | ⬜ | WORKS | Passkey / WebAuthn Login | ORG | SIMPLE | Human QA | Passkey registration works, login with passkey works, fallback to password works  | 
| 167 | ✅ | ✅ | ✅ | ✅ | ✅ | ⬜ | WORKS | Disputes Management | BOTH | SIMPLE | Human QA | Trust & safety dispute flow wired, dispute form submits, admin queue receives  | 
| 135 | NA | NA | ✅ | 📋 | ✅ | ⬜ | WORKS | Social Templates Expansion | ORG | SIMPLE | Human QA | SharePromoteModal renders TikTok, Pinterest, Threads, Nextdoor tabs (external links)  | 
|  65 | —- | ✅ | ✅ | -— | ✅ | ✅ | WORKS | Organizer Mode Tiers (Simple/Pro/Teams) | ORG | PRO | Human QA | S289+S290: Full tier infrastructure (SubscriptionTier enum, tierGate.ts, requireTier, Stripe billing, Progressive Disclosure UI). SIMPLE user sees upgrade wall.  |
|  25 | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | Shipped S456 — Pending Chrome QA | Organizer Persistent Inventory (eBay Sync) | ORG | PRO | Human QA: verify eBay import pulls items into /organizer/inventory, photos display, category/condition populated, Pull to Sale works | S455: eBay OAuth + import flow wired. S456: 86 eBay listings imported, Trading API + GetItem enrichment, photos + categories + conditions backfilled. S457: Pull to Sale fixed (embedding + inInventory filter). S458–S459: GetItem enrichment operational, socket listener for enrichment completion. Ready for Chrome QA on full import cycle + pull workflow. | 
|  42 | NA | ✅ | ✅ | NA | ✅ | ⬜ | WORKS | Voice-to-Tag | ORG | PRO | Human QA | VoiceTagButton.tsx + useVoiceTag.ts complete, Web Speech API integration functional need way more thinking about where this diplays | 
|  30 | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | WORKS | AI Item Valuation & Comparables | ORG | PRO | Human QA | S202: ValuationWidget (PRO-gated) on add-items page, suggestions display, CTA works  | 
|  14 | ✅ | ✅ | ✅ | NA | ✅ | ✅ | WORKS | Real-Time Status Updates | BOTH | PRO | Human QA | S202: Organizer widget, SMS/email alerts, SaleStatusWidget functional  | 
|  20 | NA | ✅ | ✅ | NA | ✅ | ✅ | WORKS | Proactive Degradation Mode | BOTH | PRO | Human QA | S202: DegradationBanner + middleware for offline, fallback UI displays  | 
| 179 | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | WORKS | Full-Text Search | SHO | FREE | Human QA | Advanced filters + location search functional, results accurate  | 
| 189 | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | WORKS | Trending Items / Sales | SHO | FREE | Human QA | S288: `/trending` page + API, items/sales sorted by views/engagement  | 
| 190 | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | WORKS | Activity Feed | SHO | FREE | Human QA | S297: `/feed` page + API, activity timeline loads  | 
|  78 | NA | ✅ | ✅ | 📋 | ✅ | ✅ | WORKS | Inspiration Page — Item Gallery | SHO | FREE | Human QA | S286: `/inspiration` masonry grid, items from active/upcoming sales display  | 
|  92 | NA | ✅ | ✅ | 📋 | ✅ | ⬜ | WORKS | City Weekend Landing Pages | SHO | FREE | Human QA | S286: `/city/[city].tsx` ISR pages with Schema.org JSON-LD, Grand Rapids pre-generated, live  | 
| 204 | ✅ | ✅ | ✅ | 📋 | ✅ | ⬜ | WORKS | Unsubscribe / Preferences | SHO | FREE | Human QA | S286: `/unsubscribe` + `/api/unsubscribe`, preference toggles work  | 
| 206 | ✅ | ✅ | ✅ | 📋 | ✅ | ⬜ | WORKS | Condition Guide | SHO | FREE | Human QA | S288: `/condition-guide` educational page loads with condition descriptions, isn't linked to from anywhere? needs dark mode treatment  | 
| 207 | ✅ | ✅ | ✅ | 📋 | ✅ | ✅ | WORKS | FAQ / Guide / Terms / Privacy | PUB | FREE | Human QA | S286: Legal + help pages load, content displays correctly  | 
| 214 | ✅ | ✅ | ✅ | 📋 | ✅ | ⬜ | WORKS | AI Sale Planner Chat | PUB | FREE | Human QA | S288: `/plan` page, public rate-limited acquisition tool, chat works but needs a much broader scope... way too estate sale oriented  | 
|  59 | ✅ | ✅ | ✅ | ✅ | ✅ | ⬜ | WORKS | Streak Rewards | SHO | FREE | Human QA — confirm StreakWidget renders correctly on both loyalty and dashboard pages | S346 StreakWidget confirmed present on /shopper/loyalty + /shopper/dashboard (code-verified S347). Visit/save/purchase streaks. StreakWidget wired into both pages.  |
| 146 | ✅ | ✅ | ✅ | NA | ✅ | ✅ | Pending Chrome QA | Item Holds / Reservations | BOTH | SIMPLE | Shipped S332–S340. HoldButton UI, GPS/QR gates, expiry cron, shopper notifications. HoldTimer countdown Chrome-verified S338. Full E2E pending tonight's QA. LeaveSaleWarning.tsx wired into sale detail page S364. |  |
| 147 | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | Pending Chrome QA | Hold Duration Configuration | ORG | SIMPLE | Shipped S333. S389: Scout bug fixed (was 30min, now correctly 45min). Rank-based: Initiate 30min, Scout 45min, Ranger 45min, Sage 60min, Grandmaster 90min. holdsEnabled toggle per sale. |  |
|  24 | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | Pending Chrome QA | Holds-Only Item View (Batch Ops) | ORG | SIMPLE | Shipped S333–S340. Organizer can view/cancel/extend holds. Batch extend endpoint verified S340. OrganizerHoldsPanel.tsx wired into organizer dashboard S364. |  | 
| 200 | ✅ | ✅ | ✅ | 📋 | ✅ | ⬜ | Pending Chrome QA | Shopper Public Profiles | SHO | FREE | Shipped S344. profileSlug/purchasesVisible/collectorTitle schema + migration (deploy needed). GET /shoppers/:id, /shoppers/[id].tsx, settings section. |  | 
|  64 | ✅ | ✅ | ✅ | ✅ | ✅ | ⬜ | Pending Chrome QA | Save/Wishlist/My Collections | SHO | FREE | Chrome QA: verify nav unified to /shopper/wishlist, favorites tab removed from dashboard, /shopper/favorites + /shopper/alerts redirect correctly | Shipped S344 — nav unified, My Collections label applied to 6 surfaces |
| 122 | ✅ | ✅ | ✅ | ✅ | ✅ | ⬜ | Pending Chrome QA | Explorer's Guild Phase 1 | SHO | FREE | Chrome QA: XP scan cap (100/day), visit XP, Guild nav link, onboarding modal (localStorage-gated), Sage threshold 2500 (beta), Hunt Pass trial banner, SourcebookEntry + Sale.prelaunchAt schema | Shipped S342–S344 |
| 133 | ✅ | ✅ | ✅ | 📋 | ✅ | ✅ | Chrome-verified S407 | Hunt Pass Subscription Redesign | SHO | PAID_ADDON | Human QA | S407 ✅: $4.99/month, 1.5x XP, flash deals 6h early, XP earning matrix all confirmed. S390: "2x XP"→"1.5x XP" copy fixed (prior ⚠️ now resolved). S389: 1.5x multiplier in stripeController + auctionJob. |
| 213 | ✅ | ✅ | ✅ | NA | ✅ | ✅ | Chrome-verified S407 | Hunt Pass | SHO | PAID_ADDON | Human QA | S407 ✅: hunt-pass.tsx — $4.99/month, 1.5x XP, flash deals, full XP earning matrix confirmed. Dashboard card + Upgrade Now CTA present. FIXED S347. |
| 287 | NA | NA | ✅ | ✅ | ✅ | ✅ | Chrome-verified S407 | Add-Items Sort Controls + Mobile Polish | ORG | SIMPLE | Human QA: verify sort persists after navigation, items reorder correctly, toolbar responsive on mobile | S397: Name/Price/Status/Date sort buttons on add-items + review pages. Item row restructure (checkbox+arrow left, status+trash right, title flex-1). Header 2-row layout. BulkActionDropdown fixed viewport (no clipping). Dark mode toolbar. S407 ✅: Name Z→A, Price $418→$130 descending, 4 sort buttons present, toolbar visible in dark mode. |



## BROKEN — Fix Before Anything Else

Features that Patrick's human QA walkthrough confirmed are broken. Use the two-stage format.

|  #  | DB | API | UI | Nav | Claude QA | Human QA | Status | Feature | Role | Tier | Needs | Notes |
|-----|----|----|----|----|-----------|----------|--------|---------|------|------|-------|-------|
| 174 | ✅ | ✅ | ✅ | NA | ⬜ | ⬜ FIXED S344 | Auction Mechanics + Close Flow | ORG | SIMPLE | Pending Chrome QA — Phase 1: reserve price check in auctionJob.ts. Phase 2: /purchases/[id].tsx persistent confirmation, CheckoutModal redirects to it, checkout-success backward compat. | Countdown timer, bid modal, auto-bid, cron closing, manual end-auction button, auctionEndTime field, winner Stripe checkout link, organizer close notification, admin bid-review queue |
|  41 | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ FIXED S355 | Flip Report | ORG | PRO | Pending Chrome QA — S344: null safety + division-by-zero guard. S355: ownership fix (req.user.organizerProfile?.id). S356 fix in GitHub, PENDING RAILWAY DEPLOY. | Item resale potential scoring |
|  50 | ✅ | ✅ | ✅ | ✅ | ✅ | ✅️ NOT A CODE BUG — test data issue | Loot Log | SHO | FREE | user11's purchases are PENDING not PAID — Loot Log correctly filters PAID only. No code fix needed. Verify with a PAID purchase. | Personal purchase history with photos + prices |
| 184 | ✅ | ✅ | ✅ | NA | ✅ | ✅ FIXED S355 | iCal / Calendar Export | SHO | SIMPLE | Pending Chrome QA — S344: route ordering fix. S355: changed relative path to NEXT_PUBLIC_API_URL in [id].tsx. Both fixes in GitHub, pending Railway deploy + Chrome QA. | Download .ics file for sales + items |
|  48 | ✅ | ✅ | ✅ | ✅ | ⬜ | ✅ Chrome-verified S360 | FIXED S359+S360 | Treasure Trail Route Builder | SHO | FREE | Chrome-verified S360 (ss_5655xvb8r): GET /api/trails → 200, "Grand Rapids Saturday Run" renders name/desc/stops, Edit/Delete buttons present. S359: switched to `api` lib. S360: fixed double /api/ prefix. Ready to graduate to TESTING. | Trail pages + share token, multi-sale routing |
|  13 | ✅ | ✅ | ✅ | 📋 | ⬜ | ⬜ FIXED S346 | FIXED S346 | TEAMS Workspace | ORG | TEAMS | Pending Chrome QA — member lookup missing relations fixed, invite error parsing fixed (error→message field) | Multi-user workspace, role management |
|   7 | ✅ | ✅ | ✅ | ✅ | ⬜ | ⬜ | Shipped S390 — Pending Chrome QA | Shopper Referral Rewards | SHO | FREE | Chrome QA: navigate to /shopper/referrals, verify referral link displays, copy link works, share buttons present, stats show signups/XP | S389: backend wired (authController signup 20 XP + stripeController first-purchase 30 XP to referrer). S390: NEW /shopper/referrals page — unique link display, WhatsApp/SMS/Twitter/Email/copy share buttons, referral stats (signups, purchases, total XP earned). Dashboard "Share & Earn" card also added (#265). |
|  46 | ✅ | ✅ | ✅ | ✅ | ✅ |✅⬜ FIXED S346 | FIXED S346 | Treasure Typology Classifier | ORG | PRO | Deprecated Feature
|  80 | NA | ✅ | ✅ | 📋 | ✅ | ✅ FIXED S356 | Purchase Confirmation Redesign | SHO | FREE | Pending Chrome QA — S344: /purchases/[id].tsx page. S356: userController.ts + organizer businessName + date ISO fix (was showing "From: blank", "Purchased blank"). NEEDS PUSH + Railway deploy. | MERGED WITH #174 — see #174 |

## Building — Active Backlog

|-----|----|----|----|----|-----------|----------|--------|---------|------|------|-------|-------|
|  #  | DB | API | UI | Nav | Claude QA | Human QA | Status | Feature | Role | Tier | Needs | Notes |
|-----|----|----|----|----|-----------|----------|--------|---------|------|------|-------|-------|
| 222 | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | Shipped S351 + S450–S451 | Dashboard Redesign (Org + Shopper) | BOTH | ALL | Human QA: Patrick confirmed S451 layout ✅ | Organizer: 3-state layout (new/active/between), Sale Status Widget, Next Action Zone, Quick Stats, Tier Progress, 6-tool grid, OrganizerOnboardingModal wired (S351). Shopper: RankHeroSection character sheet (S450), Rank Progress Card w/ exact per-rank XP copy, StreakWidget + permanent explainer, Hunt Pass CTA, Action Bar buttons (Collections/History/Trails/Referral/QR) (S450–S451), QR panel inline, Hero→Action→QR→Hunt Pass→Tabs→Content order locked (S451). P0 rank staleness fixed — Nav fetches fresh rank via useXpProfile (S450). |
| 223 | ✅ | ✅ | ✅ | ✅ | ⬜ | ⬜ | Shipped S351 — Pending Chrome QA | Organizer Guidance Layer (Tooltips + Explainers) | ORG | ALL | Chrome QA S352 | TooltipHelper.tsx + OrganizerOnboardingModal.tsx created. Tier inline explainers on pricing.tsx. Rank badges + Grandmaster "almost always follows through" copy on holds.tsx. reservationController now returns explorerRank on holds list. S386: TooltipHelper wired to pricing.tsx tier name section with SIMPLE/PRO/TEAMS explainer copy. |
| 224 | ✅ | ✅ | ✅ | ✅ | ⬜ | ⬜ | Shipped S351 — Pending Chrome QA | Photo Capture Protocol (Camera Flow Enhancement) | ORG | SIMPLE | Chrome QA S352 | Tiered lighting system (Tier 1 silent/Tier 2 soft toast+buttons/Tier 3 hard modal); shot sequence guidance (copy after each of 5 shots); AI confidence-based copy on PreviewModal (high/medium/low); pre-capture viewfinder brightness indicator (green/yellow/red real-time). New: BrightnessIndicator.tsx. |
| 225 | ✅ | ✅ | ✅ | NA | ✅ | ✅ | Shipped S352 — Pending Chrome QA | Revenue/Metrics API Endpoints | ORG | ALL | Chrome QA S352 | GET /api/organizers/stats endpoint built: revenue (lifetime/current-sale/this-month), item counts (total/available/sold/draft), active sale metrics (viewCount, holdCount). Wired into organizer dashboard State 2 Revenue Widget + Quick Stats Grid. Zero TS errors. |
| 226 | ✅ | NA | NA | NA | NA | NA | Shipped S352 — Pending Railway migration | Pre-wire Schema Additions (Deferred Unlocks) | ORG | PRO | Patrick: deploy migration 20260330_add_item_prewire_fields to Railway | persistentInventory Boolean + masterItemLibraryId FK on Item; consignor relation wired. Migration SQL created. No API/UI — schema only. |
| 227 | ✅ | ✅ | ✅ | NA | ⬜ | ⬜ | Shipped S352 — Pending Chrome QA | XP Profile API + Shopper Dashboard Wiring | SHO | FREE | Chrome QA S352 | GET /api/xp/profile was already built; service response shape corrected (returns guildXp, explorerRank, huntPassActive, rankProgress with nextRank/xpToNextRank). GRANDMASTER threshold fixed 10000→5000. Shopper dashboard already wired via useXpProfile hook. |
| 228 | ✅ | ✅ | ✅ | ✅ | ⬜ | ⬜ | Built S368 — Pending Chrome QA | Settlement Hub (Commission Calc + Expense Tracker + Client Payout) | ORG | SIMPLE | Migration deployed to Railway. Chrome QA needed: settlement wizard (estate=5-step, yard=simple card), expense CRUD, commission calc, client payout. | 4 new Prisma models (SaleSettlement, SaleExpense, ClientPayout, SaleTransaction). 7 backend endpoints. SettlementWizard.tsx + 3 sub-components. /organizer/settlement/[saleId] page. "Settle This Sale" button on edit-sale ENDED. |
| 229 | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | Phase 1 Shipped S375 — Pending Chrome QA | AI Comp Tool (Photo → eBay Sold Comps → Price Suggestion) | ORG | SIMPLE | Chrome QA: verify "Get Price Comps" on edit-item, eBay results or mock fallback display | S375: Phase 1 built — eBay Browse API OAuth + search, "Get Price Comps" button on edit-item/[id].tsx, mock fallback without credentials. S376: auth bug fixed (was comparing organizerId vs userId — always mismatched). Phase 2 (direct eBay listing push) still deferred. |
| 230 | NA | ✅ | ✅ | ✅ | ⬜ | ⬜ | Built S368 — Pending Chrome QA | Smart Buyer Intelligence Widget | ORG | SIMPLE | Chrome QA: check widget renders on dashboard State 2 with subscriber/favorite data | SmartBuyerWidget.tsx on dashboard. GET /api/organizers/smart-buyers/:saleId. Shows top shoppers by XP + rank chip. |
| 231 | ✅ | ✅ | ✅ | ✅ | ⬜ | ⬜ | Built S368 — Pending Chrome QA | High-Value Item Tracker | ORG | SIMPLE | Chrome QA: flag item as high-value, verify tracker shows on dashboard | HighValueTrackerWidget.tsx. PATCH /api/items/:id/high-value toggle. Schema: Item.isHighValue, highValueThreshold, estimatedValue, aiSuggestedPrice. |
| 232 | NA | ✅ | ✅ | ✅ | ⬜ | ⬜ | Built S368 — Pending Chrome QA | Sale Pulse Widget (Engagement Score) | ORG | ALL | Chrome QA: verify buzz score renders on active sale dashboard | SalePulseWidget.tsx. GET /api/organizers/sale-pulse/:saleId. Buzz score 0-100, views/saves/questions metrics. |
| 233 | NA | ✅ | ✅ | ✅ | ⬜ | ⬜ | Built S368 — Pending Chrome QA | Organizer Efficiency Coaching Widget | ORG | ALL | Chrome QA: verify stats + tips render on dashboard States 2 & 3 | EfficiencyCoachingWidget.tsx. GET /api/organizers/efficiency-stats. Photo-to-publish time, sell-through %, percentile rank, tips. |
| 234 | NA | NA | ✅ | ✅ | ⬜ | ⬜ | Built S368 — Pending Chrome QA | Post-Sale Momentum Prompt | ORG | ALL | Chrome QA: verify card appears in dashboard State 3 with revenue/items/sell-through | PostSaleMomentumCard.tsx on dashboard State 3. "Settle This Sale" + "Start Next Sale" CTAs. |
| 235 | ✅ | ✅ | ✅ | ✅ | ⬜ | ⬜ | Shipped S376 — Pending Chrome QA | Charity Close + Tax Receipt PDF | ORG | SIMPLE | Chrome QA: DonationModal (3-step), PRO gate + upsell CTA, receipt step in SettlementWizard | S376: SaleDonation + DonatedItem schema + migration deployed. donationController (POST donate, GET list, GET receipt PDF via PDFKit). 3 routes wired in organizers.ts. DonationModal.tsx (3-step wizard). PRO-gated. Wired into SettlementWizard receipt step. |
| 236 | NA | NA | ✅ | ✅ | ✅ | ✅ | Built S368 — Pending Chrome QA | Weather Strip Widget | ORG | ALL | Chrome QA: verify strip shows on dashboard when sale ≤10 days out. Phase 1 uses month-based approximation, no external API. | WeatherStrip.tsx. Month-based GR,MI temp approximation. Shows date + high/low + condition. No API key needed in Phase 1. |
| 237 | NA | NA | ✅ | NA | ⬜ | ⬜ | Built S368 — Pending Chrome QA | Sale-Type Adaptive Dashboard (Command Center) | ORG | ALL | Chrome QA: verify widget visibility changes per sale type (estate vs yard) | dashboard-sale-type-config.ts. CONSIGNMENT + OTHER added to SaleType enum. Per-type widget visibility, settlement type (FULL_WIZARD vs SIMPLE_CARD), clientLabel. |
| 238 | ⬜ | ⬜ | ⬜ | ⬜ | ⬜ | ⬜ | Folded into #40 S436 | Flea Market Vendor Management + Settlement | ORG | SIMPLE | Folded into #40 Sale Hubs repurpose. See ADR-014 and flea-market-software-competitive-analysis.md. | Organizer collects booth fees, optional % of vendor sales. Per-vendor per-event settlement. Export to CSV. Recurring event model. Scope as standalone PWA module. |
| 239 | ⬜ | ⬜ | ⬜ | ⬜ | ⬜ | ⬜ | Needs Scoping — Deferred | Multi-Consignor Estate Settlement (Per-Consignor Stripe Payouts) | ORG | PRO | Requires separate scoping session — complex Stripe Connect topology (one organizer → many payees). | Multiple consignors contributing items to a single estate sale. Each consignor gets their own Stripe payout after settlement. Distinct from #228 which is single executor payout. |
| 240 | ✅ | ✅ | ✅ | ✅ | ✅ | ⬜ | Shipped S375 — Pending Chrome QA | Print-to-QR Sign Kit | ORG | SIMPLE | Chrome QA: verify 5 sign types render/print, QR codes correct, nav wired | S375: 5 sign templates (yard, directional, table tent, hang tag, full kit). Routes: `/api/organizer/sales/:saleId/signs/{type}`. S376: Print Kit nav wired (4 surfaces: dashboard live card, Layout.tsx, add-items bulk toolbar, BulkActionDropdown). S376+S377: window.open paths fixed (apiBase → NEXT_PUBLIC_API_URL). S379: /organizer/print-kit/index.tsx sale picker created. |
| 241 | ✅ | NA | ✅ | ✅ | ⬜ | ⬜ | Shipped S375 — Pending Chrome QA | Organizer Brand Kit Expansion | ORG | PRO | Chrome QA: verify 4 PDF generators (business cards, letterhead, social headers, branded yard sign), PRO gate + SIMPLE upsell | S375: 4 PDF generators built. PRO-gated with SIMPLE upsell CTA. Integrated with existing #31 Brand Kit. |
| 242 | ✅ | ✅ | ✅ | ✅ | ⬜ | ⬜ | Shipped S375 — Pending Chrome QA | QR/Barcode Item Labels | ORG | SIMPLE | Chrome QA: verify QR codes in labels link to correct item pages, Print Label button on edit-item | S375: QR codes (40×40px → item page URL) embedded in item labels. Print Label button on edit-item/[id].tsx. |
| 244 | NA | ✅ | ✅ | ✅ | ⬜ | ⬜ | Phase 1 Shipped S375 — Pending Chrome QA | eBay Quick List (AI-Assisted eBay Export) | ORG | SIMPLE/PRO | Chrome QA: verify eBay CSV export from add-items page, watermark toggle, clean photo PRO gate | S375: Phase 1 built — eBay File Exchange CSV export from add-items page. Watermark toggle (clean = PRO-gated). Phase 2 (direct eBay Inventory API push, PRO OAuth) and Phase 3 (bidirectional sold sync) still deferred. Spec: feature-decisions/ebay-quick-list-spec.md. |
| 245 | NA | NA | ✅ | NA | ✅ | ✅ | Shipped S385 — Pending Chrome QA | Feedback Widget (Global Floating Button) | BOTH | FREE | deprecated, and moved to micro surveys
| 246 | NA | NA | ✅ | NA | ✅ | ✅ | Shipped S388 — Pending Chrome QA | Camera Coaching Banner (Inline) | ORG | SIMPLE | Chrome QA: verify banner appears in regular camera mode, progressive messages per shot, dismiss works | RapidCapture.tsx: contextual inline banner in regular mode. Progressive copy for shots 0–5+. Dismissable. Replaced dead showShotGuidance function. |
| 247 | NA | NA | ✅ | NA | ✅ | ✅ | Shipped S388 — Pending Chrome QA | AI Branding Purge + Sale Type Inclusivity | BOTH | ALL | Chrome QA: verify no "AI" text visible in any user-facing page. Verify sale type language includes yard/garage/flea/consignment. | 13 "AI" references replaced across 9 files. Sale type language broadened in index/about/guide/faq. |
| 248 | NA | NA | ✅ | NA | ✅ | ✅ | Shipped S388 — Pending Chrome QA | FAQ Expansion (7 New Entries) | BOTH | ALL | Chrome QA: verify all 7 new FAQ entries render on /faq page | Explorer's Guild, seasonal challenges, Collector Passport, Condition Rating (shopper); SIMPLE/PRO/TEAMS differences, Brand Kit, Command Center (organizer). |
| 249 | ✅ | ✅ | ✅ | NA | ⬜ | ⬜ | Shipped S389 — Pending Chrome QA | SIMPLE Concurrent Sales Gate | ORG | SIMPLE | Does not work Chrome QA: try creating 2nd sale as SIMPLE user, verify 409 + upgrade CTA | maxConcurrentSales in tierLimits.ts (SIMPLE=1, PRO=3, TEAMS=Infinity). Gate in createSale() + updateSaleStatus(). 409 TIER_LIMIT_EXCEEDED + upgrade CTA in create-sale.tsx + edit-sale/[id].tsx. Schema index on Sale(organizerId, status, endDate). |
| 250 | NA | NA | ✅ | NA | ✅ | ✅ | Shipped S389 — Pending Chrome QA | Price Research Panel | ORG | SIMPLE | Chrome QA: open edit-item, expand Price Research panel, verify eBay comps + AI estimate render | NEW PriceResearchPanel.tsx — collapsible panel consolidating PriceSuggestion + ValuationWidget + eBay comps. Wired to add-items (collapsed), review (collapsed), edit-item (expanded). |
| 251 | NA | ✅ | ✅ | NA | ⬜ | ⬜ | Shipped S389 — Pending Chrome QA | priceBeforeMarkdown Crossed-Out Price | SHO | SIMPLE |don't see this ?   Chrome QA: set priceBeforeMarkdown on an item, verify crossed-out price shows on item card + detail | itemController returns priceBeforeMarkdown + markdownApplied. ItemCard, LibraryItemCard, items/[id].tsx show crossed-out original price when markdown applied. |
| 252 | NA | NA | ✅ | NA | ⬜ | ⬜ | Shipped S389 — Pending Chrome QA | Verified Purchase Badge | SHO | FREE | Chrome QA: submit review as shopper who purchased item, verify ✓ Verified Purchase badge displays | ReviewsSection.tsx shows badge. reviewController returns verifiedPurchase on all 4 query endpoints. |
| 253 | NA | NA | ✅ | NA | ⬜ | ⬜ | Shipped S389 — Pending Chrome QA | SettlementWizard Transfer ID + Failure Banner | ORG | SIMPLE | Chrome QA: complete settlement with payout, verify transfer ID displays in receipt step | SettlementWizard receipt step now shows clientPayoutStripeTransferId and failure reason banner. |
| 254 | ✅ | ✅ | NA | NA | ⬜ | ⬜ | Shipped S389 — Pending Chrome QA | Hunt Pass 1.5x XP Multiplier (Wired) | SHO | PAID_ADDON | Chrome QA: purchase item as Hunt Pass subscriber, verify XP award is 1.5x | stripeController + auctionJob now apply 1.5x multiplier before awarding purchase/auction XP. Referral first-purchase (30 XP to referrer) also wired in stripeController. |
| 255 | NA | ✅ | NA | NA | ⬜ | ⬜ | Shipped S389 — Pending Chrome QA | Rank-Up Notifications | SHO | FREE | Chrome QA: earn enough XP to rank up, verify congratulatory notification appears | xpService.awardXp() now calls createNotification() when rank changes. All rank transitions covered. |
| 256 | ✅ | ✅ | NA | NA | ⬜ | ⬜ | Shipped S389 — Pending Chrome QA | Referral Signup XP Wiring | SHO | FREE | Chrome QA: sign up with referral code, verify referrer gets 20 XP notification | authController.processReferral() called at signup. awardXp(referrerId, REFERRAL_SIGNUP, 20). First-purchase trigger (30 XP) in stripeController. Schema + XP values existed since S344; routes now active. |
| 257 | NA | ✅ | NA | NA | ⬜ | ⬜ | Shipped S389 — Pending Chrome QA | Scout Hold Duration Fix | SHO | FREE | Chrome QA: hold an item as Scout rank user, verify hold shows 45 min (not 30) | reservationController.getHoldDurationMinutes() — SCOUT was returning INITIATE's 30 min. Now correctly returns 45. |
| 258 | NA | NA | ✅ | NA | ✅ | ✅ | Shipped S389 — Research/Strategy | Comprehensive Product Alignment Analysis | BOTH | ALL | Review and prioritize: claude_docs/strategy/S389-comprehensive-alignment.md | Full audit: all roadmap features × gamification × virality × nav menus × dashboards × pricing page × Hunt Pass page. 5 priority recommendations: fix Hunt Pass 2x→1.5x copy, add à la carte to pricing page, wire referral UI, implement first rank gate, add TEAMS solo differentiator. |
| 259 | NA | NA | ✅ | NA | ⬜ | ⬜ | Shipped S390 — Pending Chrome QA | Hunt Pass Page Accuracy Fix | SHO | PAID_ADDON | Chrome QA: /shopper/hunt-pass — verify "1.5x XP" everywhere, XP matrix table present, flash deal says "6 hours early" | hunt-pass.tsx: "2x" → "1.5x" throughout. XP Earning Matrix added (Standard vs Hunt Pass columns). Flash deals clarified to "6 hours early". Loot Legend explanation added. shopper/dashboard.tsx Hunt Pass CTA also corrected. |
| 260 | NA | NA | ✅ | NA | ⬜ | ⬜ | Shipped S390 — Pending Chrome QA | À La Carte Pricing Page Visibility | ORG | PAID_ADDON | Chrome QA: /organizer/pricing — verify "Just one sale? Pay as you go." callout visible below tier cards, $9.99 price shows, CTA present | pricing.tsx: pay-as-you-go section added. $9.99 per-sale, no monthly commitment, CTA → /organizer/create-sale. Also added à la carte note to organizer dashboard onboarding state. (Payment processing flow is separate — see #132.) |
| 261 | NA | ✅ | NA | NA | ⬜ | ⬜ | Shipped S390 — Pending Chrome QA | Treasure Hunt XP Rank Multiplier (Ranger+) | SHO | FREE | Chrome QA: scan QR as Ranger user, verify ~38 XP awarded (not flat 25). As Grandmaster, verify ~50 XP. | xpService.ts: getRankXpMultiplier() added. itemController.ts scanItemQr: fetches explorerRank, applies multiplier. Ranger=1.5x(38), Sage=1.75x(44), Grandmaster=2x(50). Daily cap (100 XP) still enforced. |
| 262 | NA | ✅ | ✅ | NA | ✅ | ✅ | Shipped S390 — Pending Chrome QA | Tier Restructure — Batch Ops + Seller Badge + Link Click Stats → SIMPLE | ORG | SIMPLE | Chrome QA: as SIMPLE organizer verify batch operations available, link click stats endpoint accessible | tierLimits.ts: batchOpsAllowed=true for SIMPLE. linkClicks.ts route: requireTier downgraded PRO→SIMPLE. TierComparisonTable.tsx: all 3 features show ✅ in SIMPLE column. pricing.tsx updated. |
| 263 | NA | NA | ✅ | ✅ | ⬜ | ⬜ | Shipped S390 — Pending Chrome QA | Organizer Nav Additions (Insights + Branding) | ORG | PRO | Chrome QA: verify "Insights" and "Branding" nav sections appear in organizer sidebar, links route to /organizer/insights and /organizer/brand-kit | Layout.tsx: added Insights section (BarChart2 icon → /organizer/insights) and Branding section (Palette icon → /organizer/brand-kit) to organizer nav. Duplicate Brand Kit removed from Pro Tools section. PRO tooltip labels intact. |
| 264 | NA | NA | ✅ | NA | ⬜ | ⬜ | Shipped S390 — Pending Chrome QA | Organizer Dashboard Tier Progress Widget | ORG | SIMPLE/PRO | Chrome QA: as SIMPLE organizer verify PRO upgrade pitch card present. As PRO verify TEAMS pitch. As TEAMS verify widget hidden. | organizer/dashboard.tsx: conditional Tier Progress widget. SIMPLE shows PRO ($29/mo) pitch + feature highlights. PRO shows TEAMS ($79/mo) pitch. TEAMS tier: widget not rendered. CTA links to /organizer/pricing. |
| 265 | NA | NA | ✅ | NA | ⬜ | ⬜ | Shipped S390 — Pending Chrome QA | Shopper Dashboard Gamification Enhancements | SHO | FREE | Chrome QA: verify rank card shows next-rank benefit text, "Share & Earn" referral card present and dismissible | shopper/dashboard.tsx: rank progress card now shows next-rank specific benefit (Scout→Ranger: +15 min holds, Ranger→Sage: +1 concurrent hold, Sage→GM: +30 min holds + 2x TH XP). New dismissible "Share & Earn" referral card. CTA → /shopper/referrals. |
| 266 | NA | NA | ✅ | ✅ | ⬜ | ⬜ | Shipped S390 — Pending Chrome QA | Collector Passport Nav Rename | SHO | FREE | Chrome QA: verify "Collector Passport" label in organizer sidebar, mobile nav (both locations), and AvatarDropdown | Layout.tsx: "Explorer Passport" → "Collector Passport" in 3 nav locations. AvatarDropdown.tsx: same rename in dropdown. Link still routes to /shopper/explorer-passport (page path unchanged). |
| 267 | NA | ✅ | NA | NA | ⬜ | ⬜ | Shipped S390b — Pending Chrome QA | RSVP Bonus XP (2 XP, cap 10/month) | SHO | FREE | Chrome QA: RSVP to a sale, verify 2 XP awarded; RSVP 5+ times in a month, verify cap at 10 XP | rsvpController.ts: awards 2 XP on RSVP creation. xpService.ts: RSVP action + MONTHLY_XP_CAPS.RSVP=10, checkMonthlyXpCap(). |
| 268 | NA | ✅ | NA | NA | ⬜ | ⬜ | Shipped S390b — Pending Chrome QA | Treasure Hunt Trail Completion XP (100 XP, one-time) | SHO | FREE | Chrome QA: complete all stops on a trail, verify 100 XP awarded once only | trailController.ts: 100 XP on completion. xpService.ts: TRAIL_COMPLETE + hasEarnedTrailBonus() idempotency guard. |
| 269 | NA | ✅ | NA | NA | ⬜ | ⬜ | Shipped S390b — Pending Chrome QA | Legendary-First Access Flash Deal Gating | SHO | FREE/PAID | Chrome QA: as Initiate shopper, flash deals starting <6h should be hidden; as Sage/Hunt Pass subscriber they should appear | flashDealController.ts: deals starting within 6h shown only to Sage+/GM rank OR huntPassActive=true. Active/past deals visible to all. |
| 270 | NA | NA | ✅ | NA | ⬜ | ⬜ | Shipped S390b — Pending Chrome QA | Explorer's Guild Onboarding Card | SHO | FREE | Chrome QA: new/Initiate shopper sees onboarding card on dashboard, dismiss works and persists | shopper/dashboard.tsx: dismissible onboarding card for INITIATE rank or guildXp < 50. Rank progression, XP action preview, perks. localStorage dismiss. |
| 271 | NA | NA | ✅ | NA | ⬜ | ⬜ | Shipped S390b — Pending Chrome QA | TEAMS Solo Organizer Differentiator | ORG | TEAMS | Chrome QA: /organizer/pricing TEAMS section now mentions API/webhooks/white-label for solo power users | pricing.tsx: TEAMS description updated with solo pitch. TierComparisonTable.tsx: "API access & webhooks (connect to your tools)" clarified. |
| 272 | NA | NA | ✅ | NA | ⬜ | ⬜ | Shipped S390b — Pending Chrome QA | Post-Purchase "Share Your Haul" CTA | SHO | FREE | Chrome QA: complete a purchase, verify Share Your Haul section on confirmation page, test Web Share | checkout-success.tsx: "Share Your Haul" section. Web Share API + clipboard fallback. Dynamic share text with item + sale name. |
| 273 | NA | NA | ✅ | NA | ⬜ | ⬜ | Shipped S390b — Pending Chrome QA | Rank Achievement Share | SHO | FREE | Chrome QA: rank up, check notifications, verify share button on rank-up notification | notifications.tsx: share button on rank-type notifications. Share text: "I just reached [Rank] on FindA.Sale's Explorer's Guild!" |
| 274 | NA | NA | ✅ | NA | ⬜ | ⬜ | Shipped S390b — Pending Chrome QA | Trail Completion Share | SHO | FREE | Chrome QA: complete all stops on a trail, verify celebration + share button | trails/[trailId].tsx: completion celebration + share button when scannedCount >= totalStops. |
| 275 | NA | NA | ✅ | ✅ | ⬜ | ⬜ | Shipped S390b — Pending Chrome QA | Hunt Pass Cosmetic Add-ons (Option A) | SHO | PAID_ADDON | Chrome QA: subscribe to Hunt Pass — verify amber ring on avatar, 🏆 badge on leaderboard, new benefits on hunt-pass page | AvatarDropdown.tsx: amber ring frame (ring-2 ring-amber-400). hunt-pass.tsx: Golden Trophy + Insider Newsletter benefits. league.tsx: 🏆 badge. loyaltyController.ts: huntPassActive in leaderboard. |
| 276 | ✅ | ✅ | ✅ | ✅ | ⬜ | ⬜ | Shipped S391 — Pending Chrome QA | Brand Follow (#87) — FIXED | SHO | FREE | Chrome QA: shopper dashboard Brands tab → BrandFollowManager renders, follow/unfollow works | Audit: schema ✅, routes ✅, component ✅, but never mounted in dashboard Brands tab. Fixed: 5 lines added to shopper/dashboard.tsx. |
| 277 | ✅ | ✅ | ✅ | ✅ | ⬜ | ⬜ | Shipped S391 — Pending Chrome QA | Haul Posts (#88) | SHO | FREE | Chrome QA: /shopper/haul-posts feed page, /shopper/haul-posts/create, like/unlike, nav link present | S391: 2 new pages (haul-posts.tsx feed + create.tsx), useHaulPosts.ts hook, Layout.tsx nav link, coming-soon.tsx redirects. Grid layout, likes, dark mode. |
| 278 | NA | ✅ | NA | NA | ⬜ | ⬜ | Shipped S391 — Pending Chrome QA | Treasure Hunt Pro (Hunt Pass Perk) | SHO | PAID_ADDON | Chrome QA: scan QR as Hunt Pass subscriber, verify +10% XP bonus and 150 daily cap (vs 100) | xpService.ts: checkDailyXpCap raises to 150 for Hunt Pass. itemController.ts recordQrScan: +10% multiplier on top of rank. hunt-pass.tsx: benefit listed. |
| 279 | ✅ | ✅ | ✅ | ✅ | ⬜ | ⬜ | Shipped S391 — Pending Chrome QA | Rare Finds Pass (Hunt Pass Perk) | SHO | PAID_ADDON | Chrome QA: /shopper/rare-finds page, dashboard Rare Finds widget (Hunt Pass only), verify early visibility filter | itemController.ts: isItemVisibleToUser() — Rare 6h early, Legendary 12h early for Hunt Pass. GET /items/rare-finds endpoint. RareFindsFeed.tsx dashboard widget. rare-finds.tsx full page with rarity filters. |
| 280 | NA | ✅ | NA | NA | ⬜ | ⬜ | Shipped S391 — Pending Chrome QA | Condition Rating XP (3 XP per item) | ORG | SIMPLE | Chrome QA: set condition grade on item, verify 3 XP awarded (one-time per item) | itemController.ts updateItem: awards CONDITION_RATING 3 XP when conditionGrade changes from null. Duplicate prevention via PointsTransaction. |
| 281 | NA | ✅ | NA | NA | ⬜ | ⬜ | Shipped S391 — Pending Chrome QA | Streak Milestone XP Triggers | SHO | FREE | Chrome QA: visit for 5+ consecutive days, verify milestone XP awarded | streakService.ts recordVisit: calls checkStreakMilestones(userId, newStreak). Awards 5/10/20 XP at 5/10/20-day streaks. |
| 282 | ✅ | ✅ | NA | NA | ⬜ | ⬜ | Shipped S391 — Pending Chrome QA | Collector Passport Completion XP (50 XP) | SHO | FREE | Chrome QA: fill specialties+categories+keywords on passport, verify 50 XP awarded once | collectorPassportService.ts: checkAndAwardPassportCompletion(). Schema: passportCompleted Boolean on User. Migration: 20260403_add_passport_completed. |
| 288 | ✅ | ✅ | ✅ | ✅ | ✅ | ⬜ | Built S419 — Pending Chrome QA | Featured Boost System (Dual-Rail XP/Stripe) | BOTH | ALL | Chrome QA: buy a SALE_BUMP boost via XP rail (dashboard → ⭐ Boost Sale), verify BoostPurchase created ACTIVE. Then Stripe rail: verify PaymentElement renders, payment succeeds, webhook flips PENDING→ACTIVE. Verify ⭐ Featured badge appears on map pin for boosted sale. | S419: schema (BoostPurchase model + 3 enums), migration 20260408_add_boost_purchase_and_coupon_tiers, boostPricing.ts, boostService.ts, boostController.ts, routes/boosts.ts, boostExpiryJob.ts, stripeController.ts webhook branch, BoostPurchaseModal.tsx, BoostBadge.tsx, dashboard.tsx wired, SaleMap.tsx+SaleMapInner.tsx+map.tsx featured badge. |
| 289 | ✅ | ✅ | ✅ | ✅ | ✅ | ⬜ | Built S419 — Pending Chrome QA | Shopper Coupon Generation (3 Tiers) | SHO | FREE | Chrome QA: log in as shopper with 500 XP, POST /api/coupons/generate-from-xp {tier:"FIVE_OFF_FIFTY"}, verify 500 XP deducted, coupon row created with generatedFromXp:true, xpTier set, code returned. Test monthly cap: try 2nd FIVE_OFF_FIFTY in same month → 429. | S419: couponController.ts generateShopperCoupon + SHOPPER_COUPON_TIERS constant (100/150/500 XP), routes/coupons.ts POST /generate-from-xp. Schema fields generatedFromXp + xpTier already in migration 20260408_add_boost_purchase_and_coupon_tiers. |
| 290 | NA | NA | ✅ | NA | ✅ | ⬜ | Built S419 — Pending Chrome QA | Hunt Pass Page — Dual-Rail Cash Column | SHO | ALL | Chrome QA: visit /shopper/hunt-pass, verify Rarity Boost shows "15 XP / or $0.15 via card", Haul Visibility shows "$0.25 via card", Event Sponsorship shows "$5.00 via card". Shopper Coupon section updated to show 3-tier breakdown. | S419: hunt-pass.tsx — Gameplay Boosts section (Rarity/Haul/Bounty Visibility), Organizer section (Event Sponsorship), and Hunt Pass section ($1 Off updated to 3-tier description). |
| 291 | ⬜ | ⬜ | ⬜ | ⬜ | ⬜ | ⬜ | Spec Locked S419 — Build Pending S420 | Lucky Roll / Mystery Box (Gacha Mechanic) | SHO | FREE | Dispatch findasale-dev with ADR-lucky-roll-schema-S419.md. Schema first: 4 User fields + LuckyRoll model. Then luckyRollService.ts, controller, route, frontend page. | S419: full game design locked (gamedesign-decisions-2026-04-08.md Section 4). Architect ADR written (ADR-lucky-roll-schema-S419.md). 100 XP/roll, weekly cap (1 base, 2 HP), 7-outcome table, 2-layer pity, hidden streak protection, server-side RNG, regulatory transparency. Pending: dev implementation + migration. |


## TESTING — Active QA Queue

|-----|----|----|----|----|-----------|----------|--------|---------|------|------|-------|-------|
|  #  | DB | API | UI | Nav | Claude QA | Human QA | Status | Feature | Role | Tier | Needs | Notes |
|-----|----|----|----|----|-----------|----------|--------|---------|------|------|-------|-------|
| 176 | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | PARTIAL | Browse Sales (Homepage + Map) | SHO | FREE | Chrome QA verify filter pills still work after S288 fix | Homepage loads. Filter pills display. Map renders sales. Clicking sale card → detail. Walkthrough: filter pill fix applied S288 but needs re-verify. Sales near you missing. Filter pill fix applied; needs re-verify |
|  71 | ✅ | ✅ | ✅ | ✅ | ✅ | ⚠️ | PARTIAL | Reputation Score | ORG | SIMPLE | Chrome QA: verify shopper reputation dashboard (purchase count, payment completion rate, total spent, reputation level) | S202: reputation.tsx displays 1-5 star score. S347 added guard. S385: shopperRating field now aggregated live from Review.rating. S412: Shopper reputation page rebuilt from stub to full dashboard (pages/shopper/reputation.tsx, 366 lines) showing purchase count, payment completion rate, total spent, reputation level logic. |
| 172 | ✅ | ✅ | ✅ | NA | ✅ | ⚠️ | PARTIAL | Stripe Connect Setup | ORG | SIMPLE | Verify: complete payout flow (connect account → make sale → money arrives in bank). Needs full e2e verification | S288: settings page + Setup Stripe Connect button confirmed working. S295: Checkout fee display fixed (double-fee bug resolved). Payout bank account linking + verification |
| 132 | ✅ | ✅ | ✅ | NA | ✅ | ⚠️ | PARTIAL | À La Carte Single-Sale Fee ($9.99) | ORG | PAID_ADDON | Verify: purchase flow end-to-end, receipt generation, organizer sees payment. Walkthrough: payment incomplete, needs verification | S288: Stripe checkout works, fee charged correctly. Sale.purchaseModel + alaCarte + alaCarteFeePaid. Stripe checkout. AlaCartePublishModal for SIMPLE tier |
|  27 | NA | ✅ | ✅ | 📋 | ✅ | ⚠️ | PARTIAL | Exports (CSV/JSON) | ORG | PRO | Chrome verify export files generate with correct data. Needs re-verify | S290: items.csv + sales.csv + purchases.csv download confirmed. PRO gate working. items.csv + sales.csv + purchases.csv download confirmed. PRO gate working. |
|  66 | ✅ | ✅ | ✅ | ✅ | ✅ | ⚠️ | PARTIAL | Open Data Export (ZIP) | ORG | PRO | Test with real purchases (not just headers). Needs real data scenario | S290: items.csv (36 rows), sales.csv (3 rows), purchases.csv (header only). items.csv (36 rows), sales.csv (3 rows), purchases.csv (header only). |
|  31 | ✅ | ✅ | ✅ | ✅ | ✅ | ⚠️ | PARTIAL | Brand Kit | ORG | PRO | Test: upload brand kit → verify colors/logo appear on social templates and export. Walkthrough: "needs data" and verification that auto-propagation works | Colors, logo, socials page loads. Colors, logo, socials (auto-propagates) |
|  60 | ✅ | ✅ | ✅ | -— | ⬜ | ⚠️ | Pending Chrome QA | Premium Tier Bundle | ORG | PRO | Chrome QA: verify comparison table renders, upgrade CTA flows to Stripe checkout | S388: pricing.tsx fixed $49→$29 PRO, $99→$79 TEAMS. Teams member count 5→12 (D-007). TierComparisonTable already correct. Stripe price IDs confirmed matching. |

### UNTESTED — Need Chrome QA

Features built but never browser-tested or Chrome test is stale (>3 sessions old). Dispatch to findasale-qa.

|  #  | DB | API | UI | Nav | Claude QA | Human QA | Status | Feature | Role | Tier | Needs | Notes |
|-----|----|----|----|----|-----------|----------|--------|---------|------|------|-------|-------|
| 138 | ✅ | ✅ | ✅ | NA | ⬜ | ⬜ | UNTESTED | Sale Types (ESTATE/CHARITY/BUSINESS/CORPORATE) | ORG | SIMPLE | Chrome QA: verify 4 sale types selectable, API validates, enum works | Enum validation + validation matrix | 
|   5 | ✅ | ✅ | ✅ | NA | ⬜ | ⬜ | UNTESTED | Listing Type Schema Validation | ORG | SIMPLE | Chrome QA: test FIXED/AUCTION/REVERSE_AUCTION/LIVE_DROP/POS validation | Backend validation for FIXED/AUCTION/REVERSE_AUCTION/LIVE_DROP/POS | 
|  35 | ✅ | ✅ | ✅ | ✅ | ⬜ | ✅ | UNTESTED | Entrance Pin / Front Door Locator | BOTH | SIMPLE | Chrome QA: verify entrance marker displays on map, stores location | Shopper convenience, parking + entrance detail | 
| 142 | ✅ | ✅ | ✅ | NA | ⬜ | ✅ | UNTESTED | Photo Upload (Single + Multi) | ORG | SIMPLE | Chrome QA: verify upload to Cloudinary, files visible, multi-upload works |  | 
| 145 | ✅ | ✅ | ✅ | NA | ⬜ | ✅ | UNTESTED | Condition Grading (S/A/B/C/D) | ORG | SIMPLE | Chrome QA: verify AI grades condition, manual override works, XP awarded on first grade | S391: Condition rating XP wired — 3 XP awarded when organizer sets conditionGrade for first time. | 
| 148 | ✅ | ✅ | ✅ | ✅ | ⬜ | ⬜ | UNTESTED | Sale Checklist | ORG | SIMPLE | Chrome QA: verify checklist CRUD, per-sale customization | S412: Checklist sale-picker created — pages/organizer/checklist/index.tsx (200 lines). Nav link added to organizer menu. | 
| 149 | ✅ | ✅ | ✅ | NA | ⬜ | ✅ | Chrome-verified S355 | Email Reminders to Shoppers | SHO | SIMPLE | Chrome-verified S355: button fires correctly, toggles to "Cancel Reminder". RemindMeButton shipped S344. WORKS. |  | 
| 150 | ✅ | ✅ | ✅ | NA | ⬜ | ⬜ | UNTESTED | Push Notification Subscriptions | BOTH | SIMPLE | Chrome QA: verify VAPID, service worker registration, notification display |  | 
| 152 | ✅ | ✅ | ✅ | NA | ⬜ | ⬜ | UNTESTED | Organizer Digest Emails | ORG | SIMPLE | Chrome QA: verify weekly email content, scheduling |  | 
| 154 | ✅ | ✅ | ✅ | ✅ | ⬜ | ⬜ | UNTESTED | Organizer Public Profile Page | ORG | SIMPLE | Chrome QA: verify `/organizers/[slug]` loads, sales list displays |  | 
| 155 | ✅ | ✅ | ✅ | 📋 | ⬜ | ⬜ | UNTESTED | Password Reset Flow | ORG | SIMPLE | Chrome QA: verify email sent, reset link works, password updates |  | 
| 156 | ✅ | ✅ | ✅ | ✅ | ⬜ | ⬜ | UNTESTED | Refund Policy Configuration | ORG | SIMPLE | Chrome QA: verify per-organizer refund window config |  | 
| 158 | ✅ | ✅ | ✅ | NA | ⬜ | ⬜ | UNTESTED | Sale Waitlist | BOTH | SIMPLE | Chrome QA: verify shopper join, organizer broadcast | S385: SaleWaitlistButton + RSVPBadge + SaleRSVPButton all wired to sales/[id].tsx. RSVP system components live on sale detail. |
| 159 | ✅ | ✅ | ✅ | ✅ | ⬜ | ⬜ | Shipped S389 — Pending Chrome QA | Flash Deals | ORG | SIMPLE | Chrome QA: click ⚡ button on active sale, create flash deal, verify countdown timer | S389: Flash Deal ⚡ button wired in dashboard.tsx. useQuery fetches sale items. FlashDealForm props fixed (onClose→onCancel, added saleItems + onSuccess). |
| 160 | ✅ | ✅ | ✅ | ✅ | ⬜ | ⬜ | UNTESTED | Reviews (Receive + View) | BOTH | SIMPLE | Chrome QA: verify review submit, display, organizer receives, organizer response saves + displays | S385: Organizer review response feature built — PATCH /reviews/:id/respond endpoint, /organizer/reviews management page (NEW), response form inline, responses display in ReviewsSection. Nav link added to AvatarDropdown + Layout Post Sales section. |
| 161 | ✅ | ✅ | ✅ | 📋 | ⬜ | ⬜ | UNTESTED | Contact Form | PUB | SIMPLE | Chrome QA: verify form submit, email sent |  | 
| 163 | ✅ | ✅ | ✅ | ✅ | ⬜ | ⬜ | UNTESTED | Payout Transparency / Earnings Dashboard | ORG | SIMPLE | Chrome QA: verify item-level fee breakdown, PDF export |  | 
|  11 | ✅ | ✅ | ✅ | 📋 | ⬜ | ⬜ | UNTESTED | Organizer Referral (Fee Bypass) | ORG | SIMPLE | Chrome QA: verify referral code application, fee bypass |  | 
| 164 | -— | ⬜ | ⬜ | -— | ⬜ | ⬜ | UNTESTED | Tiers Backend Infrastructure | ORG | SIMPLE | Chrome QA: verify getMyTier, syncTier, tier display | |
| 165 | ✅ | ✅ | ✅ | 📋 | ⬜ | ⬜ | UNTESTED | A/B Testing Infrastructure | ORG | SIMPLE | Chrome QA: verify A/B variant assignment, tracking |  | 
| 166 | ✅ | ✅ | ✅ | 📋 | ⬜ | ⬜ | UNTESTED | Invites | ORG | SIMPLE | Chrome QA: verify invite-to-sale, beta code acceptance |  | 
|  72 | -— | ⬜ | ⬜ | -— | ⬜ | ⬜ | UNTESTED | Dual-Role Account Schema | BOTH | SIMPLE | Chrome QA: verify admin+organizer dual roles work on all endpoints (S309 fixed 4 itemController endpoints) | S348: Nav deduplication fixed — dual-role users no longer see duplicate "My Profile" / "Shopper Dashboard" / "My Collections" links |
|  74 | -— | ⬜ | ⬜ | -— | ⬜ | ⬜ | UNTESTED | Role-Aware Registration Consent | BOTH | FREE | Chrome QA: verify consent checkboxes at signup, copy attorney-reviewed | |
|  75 | ✅ | ✅ | ✅ | -— | ⬜ | ⬜ | Pending Chrome QA | Tier Lapse State Logic | ORG | PRO | Chrome QA: verify lapse banner displays, organizer features suspend on lapse, Stripe webhook fires on cancel/failed payment, cron runs 8AM+11PM UTC, re-sub restores immediately | S347 confirmed fully implemented: tierLapseService.ts, tierLapseJob.ts, stripeController.ts (customer.subscription.deleted + invoice.payment_failed), auth.ts lapse middleware, organizer dashboard lapse banner |
| 127 | -— | ⬜ | ⬜ | -— | ⬜ | ⬜ | UNTESTED | POS Value Unlock Tiers | ORG | SIMPLE | Chrome QA: verify dual-gate (tx+revenue), tier unlocks, gates enforce | |
|  77 | NA | NA | ✅ | NA | ⬜ | ⬜ | UNTESTED | Sale Published Celebration | ORG | SIMPLE | Chrome QA: verify confetti overlay, full-screen celebration UX |  | 
|  79 | NA | NA | ✅ | NA | ⬜ | ⬜ | UNTESTED | Earnings Counter Animation | ORG | SIMPLE | Chrome QA: verify counter animation on dashboard load |  | 
| 168 | ✅ | ✅ | ✅ | ✅ | ⬜ | ⬜ | UNTESTED | Seller Performance Dashboard | ORG | PRO | Chrome QA: verify per-sale analytics, insights load |  | 
|   8 | ✅ | ✅ | ✅ | ✅ | ⬜ | ⬜ | UNTESTED | Batch Operations Toolkit | ORG | PRO | Chrome QA: verify bulk price/status/category/tag/photo updates | S385: BulkPriceModal wired into BulkActionDropdown on add-items/[saleId].tsx. onSetPrice prop added. |
| 170 | ✅ | ✅ | ✅ | 📋 | ⬜ | ⬜ | UNTESTED | CSV Listing Import | ORG | SIMPLE | Chrome QA: verify bulk upload, validation, items created |  | 
| 171 | ✅ | ✅ | ✅ | 📋 | ⬜ | ⬜ | UNTESTED | Payout PDF Export | ORG | PRO | Chrome QA: verify PDF generation, content, download |  | 
|  18 | ✅ | ✅ | ✅ | ✅ | ⬜ | ⬜ | UNTESTED | Post Performance Analytics | ORG | PRO | Chrome QA: verify UTM tracking on social template downloads |  | 
| 136 | ✅ | ✅ | ✅ | NA | ⬜ | ⬜ | UNTESTED | QR Code Auto-Embedding in Exports | ORG | SIMPLE | Chrome QA: verify QR overlay, export with QR embedded |  | 
| 27a | -— | ⬜ | ✅ | -— | ⬜ | ⬜ | Shipped S410 — Pending Chrome QA | Social Templates (5 platforms + photos) | ORG | SIMPLE | Chrome QA: verify 3 tone variants, Instagram/Facebook/TikTok/Pinterest/Threads copy + photo preview + copy-link | S410: TikTok, Pinterest, Threads added to SocialPostGenerator. Platform-specific Cloudinary crops (Pinterest 2:3, TikTok 9:16, Instagram 4:5). Photos returned (tier-aware watermark). Facebook CSV gets image_url column. S411 BUG FIX: Modal trigger button was missing from dashboard — "📱 Social Posts" button added to PUBLISHED sale card action row. Feature now accessible. |
| 27b | -— | ⬜ | ⬜ | -— | ⬜ | ⬜ | UNTESTED | Cloudinary Watermark on Photo Exports | ORG | SIMPLE | Chrome QA: verify watermark applied, brand protection visible | |
| 27c | -— | ⬜ | ⬜ | -— | ⬜ | ⬜ | UNTESTED | CSV/JSON Listing Exports (Listing Factory) | ORG | SIMPLE | Chrome QA: verify multi-platform export formats | |
|  33 | NA | ✅ | ✅ | NA | ⬜ | ⬜ | UNTESTED | Share Card Factory (OG Tags) | ORG | SIMPLE | Chrome QA: verify branded social previews, OG images |  | 
|  34 | NA | ✅ | ✅ | NA | ⬜ | ⬜ | UNTESTED | Hype Meter | ORG | SIMPLE | Chrome QA: verify real-time social proof display | S385: HypeMeter component wired to sales/[id].tsx. ActivityFeed also wired. Both render on sale detail page. |
|  63 | NA | ✅ | ✅ | NA | ⬜ | ⬜ | UNTESTED | Dark Mode + Accessibility | BOTH | FREE | Chrome QA: verify dark mode works, WCAG 2.1 AA compliant |  | 
|  67 | NA | ✅ | ✅ | NA | ⬜ | ⬜ | UNTESTED | Social Proof Notifications | BOTH | SIMPLE | Chrome QA: verify engagement notifications (favorites, bids, holds) |  | 
|   6 | ✅ | ✅ | ✅ | ✅ | ⬜ | ⬜ | UNTESTED | Virtual Queue / Line Management | ORG | SIMPLE | Chrome QA: verify queue UI, call next flow, SMS integration | Nav added S348 — "Virtual Queue (Soon)" placeholder in both organizer menus |
|  28 | ✅ | ✅ | ✅ | ✅ | ⬜ | ⬜ | UNTESTED | Neighborhood Heatmap | BOTH | SIMPLE | Chrome QA: verify density overlay on map, neighborhood highlighting |  | 
|  39 | ✅ | ✅ | ✅ | ✅ | ⬜ | ⬜ | UNTESTED | Photo Op Stations | ORG | PRO | Chrome QA: verify PhotoOpMarker on map, rate limiting |  | 
|  40 | ✅ | ✅ | ✅ | ✅ | ⬜ | ⬜ | Repurposed S436 — Flea Market Events (TEAMS) | Sale Hubs | ORG | TEAMS | Repurposed as Flea Market Events foundation. TEAMS tier. VendorBooth model replaces SaleHubMembership. ADR-014. Competitive research: claude_docs/research/flea-market-software-competitive-analysis.md. Folds #238. | 
|  16 | ✅ | ✅ | ✅ | NA | ⬜ | ⬜ | UNTESTED | Verified Organizer Badge | ORG | PRO | Chrome QA: verify badge on sales detail, VerifiedBadge renders |  | 
| 175 | ✅ | ✅ | ✅ | NA | ⬜ | ⬜ | UNTESTED | Coupons (PERCENT/FIXED) | ORG | SIMPLE | Chrome QA: verify coupon creation, validation, application |  | 
| 178 | ✅ | ✅ | ✅ | 📋 | ⬜ | ⬜ | UNTESTED | Item Detail Page | SHO | FREE | Chrome QA: verify `/items/[id]` loads, item details display |  | 
| 180 | ✅ | ✅ | ✅ | ✅ | ⬜ | ⬜ | UNTESTED | Category Browsing | SHO | FREE | Chrome QA: verify `/categories` index, `/categories/[slug]` pages |  | 
| 181 | ✅ | ✅ | ✅ | ✅ | ⬜ | ⬜ | UNTESTED | Tag Browsing | SHO | FREE | Chrome QA: verify `/tags/[slug]` ISR pages |  | 
| 183 | ✅ | ✅ | ✅ | ✅ | ⬜ | ⬜ | UNTESTED | Sale Calendar (Upcoming) | SHO | FREE | Chrome QA: verify `/calendar` page, upcoming sales list | Nav added S347/S348 — Calendar link in static nav + dashboard calendar widget for both organizer and shopper |
| 185 | ✅ | ✅ | ✅ | NA | ⬜ | ⬜ | UNTESTED | QR Code Signs (Yard + Item Labels) | ORG | SIMPLE | Chrome QA: verify printable QR codes, yard signs |  | 
| 186 | ✅ | ✅ | ✅ | NA | ⬜ | ⬜ | UNTESTED | QR Scan Analytics | ORG | SIMPLE | Chrome QA: verify QR scan tracking, insights |  | 
| 187 | ✅ | ✅ | ✅ | 📋 | ⬜ | ⬜ | UNTESTED | City Pages | SHO | FREE | Chrome QA: verify `/cities` index, `/city/[slug]` pages |  | 
| 191 | ✅ | ✅ | ✅ | NA | ⬜ | ⬜ | UNTESTED | Route Planning (Multi-Sale) | SHO | FREE | Chrome QA: verify `/api/routes` OSRM-based routing |  | 
| 192 | ✅ | ✅ | ✅ | NA | ⬜ | ⬜ | UNTESTED | Price History Tracking | SHO | FREE | Chrome QA: verify price trends display, historical data | S385: ItemPriceHistoryChart wired below price input on organizer/edit-item/[id].tsx. |
|  52 | ✅ | ✅ | ✅ | ✅ | ⬜ | ⬜ | UNTESTED | Estate Sale Encyclopedia | SHO | FREE | Chrome QA: verify wiki-style knowledge base, EncyclopediaCard |  | 
|  70 | ✅ | ✅ | ✅ | NA | ⬜ | ⬜ | UNTESTED | Live Sale Feed | SHO | SIMPLE | Chrome QA: verify Redis adapter, JWT socket auth, LiveFeedTicker |  | 
| 193 | ✅ | ✅ | ✅ | 📋 | ⬜ | ⬜ | UNTESTED | Wishlists | SHO | FREE | Chrome QA: verify full CRUD, alerts, share link | S385: WishlistShareButton wired to wishlists.tsx. WishlistAlertForm wired to shopper/wishlist.tsx. |
| 194 | ✅ | ✅ | ✅ | 📋 | ⬜ | ⬜ | UNTESTED | Saved Searches with notifyOnNew | SHO | FREE | Chrome QA: verify save search button, notification on new matches |  | 
| 195 | ✅ | ✅ | ✅ | 📋 | ⬜ | ⬜ | UNTESTED | Shopper ↔ Organizer Messaging | BOTH | FREE | Chrome QA: verify threaded conversations, real-time updates |  | 
| 196 | ✅ | ✅ | ✅ | NA | ⬜ | ⬜ | UNTESTED | Buying Pools | SHO | FREE | Chrome QA: verify group buying on items |  | 
| 197 | ✅ | ✅ | ✅ | ✅ | ⬜ | ⬜ | UNTESTED | Bounties (Item Requests) | SHO | FREE | Chrome QA: verify want-ads, shopper requests work | S385: BountyModal wired to sales/[id].tsx. |
| 198 | ✅ | ✅ | ✅ | ✅ | ⬜ | ⬜ | UNTESTED | Reviews (Submit Sale / Organizer) | SHO | FREE | Chrome QA: verify review submit, organizer receives, organizer can respond | S385: Organizer response via /organizer/reviews page. Nav link in AvatarDropdown + Layout. See #160 for full response feature detail. |
| 201 | ✅ | ✅ | ✅ | 📋 | ⬜ | ⬜ | UNTESTED | Favorites | SHO | FREE | Chrome QA: verify item-level favorites, seller-follow (deferred post-beta per S285) |  | 
| 202 | ✅ | ✅ | ✅ | 📋 | ⬜ | ⬜ | UNTESTED | Notification Center | SHO | FREE | Chrome QA: verify `/notifications` page, notification display |  | 
| 203 | ✅ | ✅ | ✅ | NA | ⬜ | ⬜ | UNTESTED | Email + SMS Validation (Twilio) | BOTH | SIMPLE | Chrome QA: verify phone verification via SMS |  | 
|  36 | ✅ | ✅ | ✅ | NA | ⬜ | ⬜ | UNTESTED | Weekly Treasure Digest (Email) | SHO | FREE | Chrome QA: verify MailerLite Sunday 6pm email send |  | 
| 205 | ✅ | ✅ | ✅ | NA | ⬜ | ⬜ | UNTESTED | Contact Organizer | SHO | FREE | Chrome QA: verify messaging system initiates correctly |  | 
| 208 | ✅ | ✅ | ✅ | 📋 | ⬜ | ⬜ | UNTESTED | Pickup Booking (Schedule Pickup) | SHO | FREE | Chrome QA: verify shopper-side scheduling, confirmation |  | 
|  84 | ✅ | ✅ | ✅ | ✅ | ⬜ | ⬜ | UNTESTED | Approach Notes (Arrival Assistant) | SHO | SIMPLE | Chrome QA: verify arrival notification, notes display |  | 
|  47 | ✅ | ✅ | ✅ | ✅ | ⬜ | ⬜ | UNTESTED | UGC Photo Tags | SHO | FREE | Chrome QA: verify shopper photo upload, moderation queue |  | 
| 209 | ✅ | ✅ | ✅ | NA | ⬜ | ⬜ | UNTESTED | Points System | SHO | FREE | Chrome QA: verify 1 pt/visit/day, tier-based points |  | 
| 210 | ✅ | ✅ | ✅ | NA | ⬜ | ⬜ | UNTESTED | Streaks (Visit / Save / Purchase) | SHO | FREE | Chrome QA: verify daily streak tracking, milestone XP at 5/10/20 days | S391: Streak milestone triggers wired — streakService.ts recordVisit() now calls checkStreakMilestones(). Awards 5/10/20 XP. | 
| 211 | ✅ | ✅ | ✅ | NA | ⬜ | ⬜ | UNTESTED | Treasure Hunt (Daily) | SHO | FREE | Chrome QA: verify daily clue, category matching |  | 
|  61 | NA | ✅ | ✅ | NA | ⬜ | ⬜ | UNTESTED | Near-Miss Nudges | SHO | FREE | Chrome QA: verify 4 nudge types, variable-ratio psychology |  | 
|  23 | NA | ✅ | ✅ | 📋 | ⬜ | ⬜ | UNTESTED | Unsubscribe-to-Snooze (MailerLite) | SHO | SIMPLE | Chrome QA: verify unsubscribe intercept, 30-day snooze |  | 
|  57 | ✅ | ✅ | ✅ | NA | ⬜ | ⬜ | UNTESTED | Shiny / Rare Item Badges | SHO | FREE | Chrome QA: verify RarityBadge on item cards, data loads |  | 
|  55 | ✅ | ✅ | ✅ | 📋 | ⬜ | ⬜ | UNTESTED | Seasonal Discovery Challenges | SHO | FREE | Chrome QA: verify rotating challenges, season logic |  | 
| 124 | -— | ✅ | ✅ | NA | ⬜ | ⬜ | Pending Chrome QA | Rarity Boost XP Sink | SHO | FREE/PAID_ADDON | Chrome QA: verify RarityBoostModal renders, 15 XP cost deducts, sale picker shows recent sales, disabled when XP insufficient | S347: RarityBoostModal.tsx built — sale picker, 15 XP cost gate, disabled state; useXpSink.ts updated; loyalty.tsx "Coming Soon" placeholder replaced | 
| 215 | ✅ | ✅ | ✅ | NA | ⬜ | ⬜ | UNTESTED | AI Tag Suggestions (Haiku) | ORG | SIMPLE | Chrome QA: verify part of Rapidfire, all tiers |  | 
| 216 | ✅ | ✅ | ✅ | NA | ⬜ | ⬜ | UNTESTED | AI Condition Grade Suggestions | ORG | SIMPLE | Chrome QA: verify S/A/B/C/D from photo, manual override |  | 
| 217 | ✅ | ✅ | ✅ | NA | ⬜ | ⬜ | UNTESTED | AI SEO Description Optimization | ORG | SIMPLE | Chrome QA: verify high-intent search term bias |  | 
|  21 | NA | ✅ | ✅ | NA | ⬜ | ⬜ | UNTESTED | User Impact Scoring in Sentry | BOTH | FREE | Chrome QA: verify error prioritization by tier/points/hunt-pass |  | 
| 128 | NA | ✅ | ✅ | ✅ | ⬜ | ⬜ | UNTESTED | Automated Support Stack (5-Layer) | PLATFORM | ALL | Chrome QA: verify /support page, fuse.js FAQ, Claude API chat L2, escalation L4 |  | 
| 218 | -— | ⬜ | ⬜ | -— | ⬜ | ⬜ | UNTESTED | Shopper Trades | SHO | FREE | Chrome QA: verify `/shopper/trades` page, trade/swap system | |
| 219 | -— | ⬜ | ⬜ | -— | ⬜ | ⬜ | UNTESTED | Shopper Achievements | SHO | FREE | Chrome QA: verify `/shopper/achievements` page, badge display | |
|  17 | ✅ | ✅ | ✅ | ✅ | ⬜ | ⬜ | UNTESTED | Bid Bot Detector + Fraud Score | ORG | PRO | Chrome QA: verify FraudBadge on holds page, fraud-signals.tsx |  | 
|  32 | ✅ | ✅ | ✅ | ✅ | ⬜ | ⬜ | UNTESTED | Shopper Wishlist Alerts + Smart Follow | SHO | FREE | Chrome QA: verify category/tag/organizer alerts on new items | S385: WishlistAlertForm wired to shopper/wishlist.tsx. |
|  45 | ✅ | ✅ | ✅ | ✅ | ⬜ | ⬜ | UNTESTED | Collector Passport | SHO | FREE | Chrome QA: verify specialty tracking, completion XP (50 XP when all 3 fields filled) | S391: passportCompleted Boolean + migration. collectorPassportService checks specialties+categories+keywords, awards 50 XP one-time. | 
|  51 | ✅ | ✅ | ✅ | ✅ | ⬜ | ⬜ | UNTESTED | Sale Ripples | SHO | FREE | Chrome QA: verify VIEW/SAVE/SHARE/BID ripples fire, RippleIndicator renders | S373: Two auth bugs fixed — missing GET /organizers/me/sales endpoint + all axios calls converted to authenticated api lib. Ripple events wired: VIEW fires on sales/[id].tsx load, SAVE fires from FavoriteButton, SHARE fires from SaleShareButton (6 handlers). Seed data: 30 ripple records seeded for test sales. |
|  54 | ✅ | ✅ | ✅ | ✅ | ⬜ | ⬜ | UNTESTED | Crowdsourced Appraisal (Base) | BOTH | FREE | Chrome QA: verify request/submit/vote appraisals |  | 
|  68 | ✅ | ✅ | ✅ | ✅ | ⬜ | ⬜ | UNTESTED | Command Center Dashboard | ORG | PRO | Chrome QA: verify UPCOMING/LIVE/ENDED badges, tabs show distinct data, Recent tab shows past sales | S373: Three bugs fixed — (1) always-401 (auth middleware pattern fixed to DB lookup), (2) all tabs same data (Redis cache key now status-aware), (3) Recent tab empty (query now includes PUBLISHED+ENDED). Date-aware badges added. "View Sale ↗" button + hover underline on title. SaleStatusWidget gated to live-only. | 
|  73 | ✅ | ✅ | ✅ | ✅ | ⬜ | ⬜ | UNTESTED | Two-Channel Notification System | BOTH | SIMPLE | Chrome QA: verify OPERATIONAL + DISCOVERY channels, inbox tabs |  | 
|  76 | NA | NA | ✅ | NA | ⬜ | ⬜ | UNTESTED | Skeleton Loaders | BOTH | FREE | Chrome QA: verify ghost card layouts on item/sale grids |  | 
|  81 | NA | NA | ✅ | NA | ⬜ | ⬜ | UNTESTED | Empty State Audit + Copy Pass | BOTH | FREE | Chrome QA: verify EmptyState component across 8 pages |  | 
|  88 | ✅ | ✅ | ✅ | ✅ | ⬜ | ⬜ | Shipped S391 — Pending Chrome QA | Haul Post Gallery (UGC Social Proof) | SHO | FREE | Chrome QA: /shopper/haul-posts feed, create page, like/unlike, nav link | S391: Full haul post pages shipped. S385: HaulPostCard + UGCPhotoSubmitButton on history.tsx. |
|  91 | ✅ | ✅ | ✅ | NA | ⬜ | ⬜ | UNTESTED | Auto-Markdown (Smart Clearance) | ORG | PRO | Chrome QA: verify markdownEnabled, markdownFloor, markdownCron |  | 
| 125 | ✅ | ✅ | ✅ | ✅ | ⬜ | ⬜ | UNTESTED | Inventory Syndication CSV Export | ORG | PRO | Chrome QA: verify PRO/TEAMS gate, export rate limiting (1/month) |  |
| 134 | NA | NA | ✅ | ✅ | ⬜ | ⬜ | UNTESTED | Plan a Sale Dashboard Card | ORG | SIMPLE | Chrome QA: verify "Coming Soon" card on organizer dashboard |  | 
| 143 | ✅ | ✅ | ✅ | ✅ | ⬜ | ⬜ | UNTESTED | Rapidfire Camera Mode | ORG | SIMPLE | Chrome QA: verify S313 AI confidence fix deployed, photo upload E2E |  | 
| 173 | ✅ | ✅ | ✅ | ✅ | ⬜ | ⬜ | UNTESTED | Message Templates | ORG | PRO | Chrome QA: verify `/organizer/message-templates` page, templates CRUD |  |
| 221 | -— | ⬜ | ⬜ | -— | ⬜ | ⬜ | Pending Chrome QA | Mark Sold → Hold-to-Pay (Remote Invoice + POS Cart) | BOTH | SIMPLE | Code shipped S341 (schema, backend, frontend). Railway ✅ Vercel ✅. Awaiting browser QA (user journey, Stripe webhook validation). Remote Path: consolidated Stripe Checkout for held items, shopper pays item price, organizer receives minus platform fee. POS Path: pre-stage into organizer's active POS cart. Rank-gated payment windows (Initiate 2h→Scout 3h→Ranger 4h→Sage 6h→Grandmaster 8h), +15 guildXP, Hunt Pass fast-track, Verified Buyer badge, 3-strike no-show system. | Depends on #13 (shipped S332-S340) + Stripe Connect (existing) + POS (existing) |
| 188 | ✅ | ✅ | ✅ | ✅ | ⬜ | ⬜ | Pending Chrome QA | Neighborhood Pages | SHO | FREE | Chrome QA: verify 14 GR neighborhood pages load, content correct, links work | Pages confirmed functional S342 — was stale "not found" note |
|  49 | ✅ | NA | ✅ | ✅ | ⬜ | ⬜ | Pending Chrome QA | City Heat Index | SHO | FREE | Chrome QA: verify /city-heat-index redirects to /cities correctly | Shipped S344 — redirects to /cities; heat density indicator on /cities is future enhancement |
| 177 | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ Chrome-verified S356 | Sale Detail Page | SHO | FREE | Chrome-verified S356 (user12): sale info, items, prices, SOLD/RESERVED/AVAILABLE badges render. Item detail navigates. Buy Now → "Complete Purchase" modal opens. ⚠️ UX gap: modal missing item name/price confirmation. | FIXED S346 |
|  29 | ✅ | ✅ | ✅ | ✅ | ⬜ | ⬜ | Pending Chrome QA | Loyalty Passport | SHO | FREE | Chrome QA after S346 fix: Explorer's Guild copy, tier names Initiate→Grandmaster, XP earn guide, coupon/rarity boost explainers | FIXED S346 |
| 199 | ✅ | ✅ | ✅ | 📋 | ⬜ | ⬜ | Pending Chrome QA | User Profile Page | SHO | FREE | Chrome QA after S346 fix: Hunt Pass section visible, bid status returns real DB value (not hardcoded), push notification moved to shopper/settings | FIXED S346 |
| 131 | NA | ✅ | ✅ | ✅ | ⬜ | ⬜ | Pending Chrome QA | Share Templates | ORG | SIMPLE | Chrome QA after S347 fix: Facebook popup, Nextdoor copy+open newsfeed, Threads intent popup, Pinterest pin dialog, TikTok copy+open | FIXED S347 |
| 212 | ✅ | ✅ | ✅ | NA | ✅ | ✅ Chrome-verified S356 | Leaderboard | SHO | FREE | Chrome-verified S356 (user12): /shopper/leaderboard loads. /api/xp/leaderboard returns 200 empty array (no XP data in test env yet). Correct empty state shown. WORKS. | FIXED S347 |
| 153 | ✅ | ✅ | ✅ | 📋 | ⬜ | ⬜ | Pending Chrome QA | Basic Organizer Profile | ORG | SIMPLE | Chrome QA after S347 fix: Facebook, Instagram, Etsy URL fields save and persist on reload | FIXED S347 |
|  58 | ✅ | ✅ | ✅ | ✅ | ⬜ | ⬜ | Pending Chrome QA | Achievement Badges | SHO | FREE | Chrome QA after S346 fix: badges display on /shopper/dashboard, /shopper/loyalty, /shopper/explorer-passport, and /shopper/achievements | FIXED S346 — AchievementBadgesSection.tsx wired into 4 pages |
| 123 | ✅ | ✅ | ✅ | ✅ | ⬜ | ⬜ | Pending Chrome QA | Explorer's Guild Phase 2 | SHO | FREE/PAID_ADDON | Chrome QA after S347 fix: XP earn tooltip (+5 visit, +10 scan, +25 purchase), rank thresholds visible (Initiate→Scout 500→Ranger 1500→Sage 2500→Grandmaster 5000), Hunt Pass $4.99/mo badge, nav label "Explorer's Guild" | FIXED S347 |
| 284 | ✅ | ✅ | ✅ | ✅ | ⬜ | ⬜ | Shipped S399/S404 — Pending Chrome QA | Feedback Survey System | BOTH | ALL | Chrome QA: trigger a FeedbackSurvey via one of 9 wired events (OG-1 through SH-5 except OG-3), verify modal appears + submits, check suppression works | S398: UX spec + architect approval. S399: FeedbackSuppression schema + migration, FeedbackContext, useFeedbackSurvey hook, FeedbackSurvey portal, FeedbackMenu in organizer/shopper settings. S404: 9/10 triggers wired (OG-3 deferred). |
| 285 | ✅ | ✅ | ✅ | ✅ | ⬜ | ⬜ | Shipped S405 — Pending Chrome QA | POS In-App Payment Request | BOTH | SIMPLE | Chrome QA: organizer creates payment request in POS, shopper receives real-time notification, shopper pays via /shopper/pay-request/[requestId], organizer sees status update | S405: POSPaymentRequest schema + migration, posPaymentController (create/get/accept/decline), Stripe webhook, Socket.io POS_PAYMENT_REQUEST/POS_PAYMENT_STATUS events, usePOSPaymentRequest hook, PaymentRequestForm component, shopper pay-request page. |
| 286 | ✅ | ✅ | ✅ | ✅ | ⬜ | ⬜ | Shipped S405 — Pending Chrome QA | Shopper QR Code (Dashboard + POS Scan) | BOTH | SIMPLE | Chrome QA: view QR on shopper dashboard, organizer scans findasale://user/ QR in POS, linked shopper banner appears + persists when cart empty | S405: GET /users/qr/:userId, shopper dashboard "My QR Code" section, POS findasale://user/{userId} branch, persistent linked shopper banner with dark mode. |


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

Infrastructure and internal systems. All code-verified. No browser QA needed.

| # | Feature | Role | Tier | Notes |
|---|---------|------|------|-------|
|  93 | Account Age Gate (Auction Bidding) | PLATFORM | ALL | accountAgeGate.ts — 7-day minimum, ADMIN bypass, wired to POST /:id/bids. (S280) |
|  94 | IP Tracking / Bid Review Queue | PLATFORM | ALL | BidIpRecord model + IP tracking in itemController. Admin bid-review page built. (S280) |
|  95 | Bid Rate Limiter | PLATFORM | ALL | bidRateLimiter.ts — 10 bids/60s via Redis, graceful degradation. (S280) |
|  96 | Stripe Fee Disclosure | PLATFORM | ALL | stripeController itemized breakdown + CheckoutModal disclosure. (S280) |
|  97 | Buyer Premium Breakdown Email | PLATFORM | ALL | breakdownHtml in stripeController — buyer premium, item photo, org name. (S280) |
|  98 | Checkout Evidence Capture | PLATFORM | ALL | CheckoutEvidence model + auto-capture in stripeController. (S280). S385: emailSentAt now stamped on CheckoutEvidence.updateMany when receipt email fires. |
|  99 | Export Rate Limiting | PLATFORM | ALL | CSV/JSON exports: 1/month/account — prevents data harvesting. See anti-abuse §Vector 1 |
| 100 | Refund Abuse Cap | PLATFORM | ALL | Refunds capped at 50% if requested <30 days post-signup. See anti-abuse §Vector 1 |
| 101 | Multi-Account Email Prevention | PLATFORM | ALL | Hard gate: no multi-account signup with same email. See anti-abuse §Vector 4 |
| 102 | Linked Account Detection | PLATFORM | ALL | Links organizer accounts sharing Stripe card/PayPal; suggests merge to Pro tier. See anti-abuse §Vector 4 |
| 103 | Auto-Archive / Delete Old Sales | PLATFORM | ALL | Auto-archive after 90 days, delete after 1 year; reduces Cloudinary costs. See TCO §Section 3 |
| 104 | Ollama API Cost Failover | PLATFORM | ALL | Auto-switch to Ollama if Claude API cost exceeds monthly threshold. See TCO §Section 5 |
| 105 | Cloudinary Bandwidth Tracker | PLATFORM | ALL | cloudinaryBandwidthTracker.ts — daily serve tracking, alerts at 80% of 25GB free tier. (S280) |
| 106 | Organizer Reputation Engine | PLATFORM | ALL | OrganizerReputation model + computeReputationScore service. Badge endpoint live. (S280) |
| 107 | Bid Manipulation Detection | PLATFORM | ALL | Flags chargeback + same-IP bidding pattern; suspension after 3+ incidents. See anti-abuse §Vector 2 |
| 108 | Suspicious Auction Price Guard | PLATFORM | ALL | Flags winning bid <10% of estimated value; holds payment 24h for review. See anti-abuse §Vector 3 |
| 109 | Low-Value Sale Pattern Detection | PLATFORM | ALL | 30-day pattern: low-price + no activity flagged. See anti-abuse §Vector 3 |
| 110 | Multi-Account Sale Pattern Detection | PLATFORM | ALL | Same-IP accounts with >3 concurrent sales in <7 days; suggests merge. See anti-abuse §Vector 4 |
| 111 | Image Endpoint Rate Limiting | PLATFORM | ALL | Rate limits image endpoints; prevents bot harvesting via Cloudinary bandwidth spike. See TCO §Section 4 |
| 112 | Stale Sale Quarterly Auto-Archive | PLATFORM | ALL | Quarterly soft-delete of old sales/items; reduces compute bloat. See TCO §Section 3 |
| 113 | Background Tag Processing | PLATFORM | ALL | Background worker processes tags; prevents Claude API rate limiting on peak uploads. See TCO §Risk #4 |
| 114 | Bid Cancellation Pattern Tracking | PLATFORM | ALL | Tracks bid cancellations; flagged after 5+ cancellations + 3+ chargebacks. See anti-abuse §Vector 2 |
| 115 | Verified Purchase Review Gate | PLATFORM | ALL | Only non-refunded past purchasers can leave reviews; prevents fake review spam. See anti-abuse §Novel Vector B |
| 116 | Review Manipulation Detection | PLATFORM | ALL | Flags reviews <1h post-purchase or same IP within 24h; manual moderation queue. See anti-abuse §Novel Vector B |
| 117 | Chargeback Buyer Detection | PLATFORM | ALL | Flags buyers at 2+ chargebacks; suspends after 3+ incidents. See anti-abuse §Vector 6 |
| 118 | Photo Upload Validation | PLATFORM | ALL | Auto-compress on-device; reject <100×100px or >50MB. See anti-abuse §Novel Vector C |
| 119 | Chargeback Rate Monitor | PLATFORM | ALL | Tracks monthly chargeback rate; pre-auth + hold if >0.8%, escalation if >1%. See anti-abuse §Novel Vector D |
| 120 | Flash-Cancel Detection | PLATFORM | ALL | Flags sales cancelled <2h post-pub with >100 holds; requires organizer explanation. See anti-abuse §Novel Vector A |
| 121 | Tiered Photo Storage Migration (Cloudinary → B2/Bunny) | PLATFORM | ALL | 3-tier: Active (0–90d Cloudinary), Warm (90d–2y B2+Bunny CDN), Cold (2y+ metadata-only). ~70% cost savings. See photo-storage-strategy |
| 220 | Cloudinary URL Utility | PLATFORM | ALL | Consolidated Cloudinary URL generation into single shared utility. S317. |

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
| Organizer Hall of Fame Leaderboard | ORG | SIMPLE | Top organizers by items sold/revenue/ratings. Monthly featured spotlight + badges. Community gamification. | After 100+ organizers + 6 months data |
| Community "Feature Your Sale" Request Form | SHO | FREE | Shoppers nominate sales for featured homepage placement. Moderation queue. Low complexity. | After homepage design stabilizes |
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

*Deprecated (won't build): Co-Branded Yard Signs*

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
| Holds expiry: 48 hours default, configurable per-sale in organizer settings. Nightly cron cleanup.
| Health score: Hybrid gate — block publishing below 40% (no photo or title), nudge 40–70%, free above 70%. Progress bar UX, never punitive.
| Tag vocabulary: Curated list of 30–50 core tags + 1 free-form custom slot per item. AI suggests from curated list. Quarterly review.
| Social templates: Auto-fill v1 with 3 tone options (Casual, Professional, Friendly). Defer WYSIWYG editor to post-beta.
| Heatmap density: Radius-based (1–3 mile), pre-computed grid tiles every 6h, 7-day rolling window.
| Background removal: On-demand Cloudinary b_remove transform only. Primary photo. No batch job.
| Holds grouping: By-item in schema, grouped-by-buyer in display. No junction table.
| Reputation scoring: Two separate scores — organizer reputation (sale quality, reliability) and shopper reputation (buyer reliability, pickup behavior). Schema must accommodate both; shopper score can be deferred but field must exist from day one. Single-score merge not permitted after schema is locked.
| Tier lapse state: Lapsing organizer subscription suspends organizer-only features. Shopper features retained. Full account freeze is not the default behavior. Re-activation on billing resume restores organizer features immediately.
| Notification defaults: Both notification channels default to opt-in. Shopper discovery alerts and organizer operational alerts are separate consent items at registration. No "all on" default for either channel.
| Roadmap (bottom) — 7 locked UX/product decisions from S155 (holds expiry, health score, tag vocabulary, social templates, heatmap density, background removal, holds grouping)
| claude_docs/architecture/ — 13 ADR files covering feature-specific technical specs (#13/#60 Teams Bundle, #17/#19 Bid Bot/Passkey, #30/#46/#69 AI/Offline, #40/#44/#48 Hubs/Trail, #52/#53/#54 Encyclopedia/Aggregator/Appraisal, #65 Tiers, #68 Command Center)
| claude_docs/feature-decisions/ — 7 files covering architecture choices (camera workflow, cash fee collection, push coordinator, manager subagent)
| decisions-log.md — governance/process decisions (subagent-first gate, file delivery rule, roadmap schema)
| FindaSale\claude_docs\feature-notes.md - design decisions based on emotion and animations