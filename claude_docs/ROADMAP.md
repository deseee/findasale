# ROADMAP – FindA.Sale

**Last Updated:** 2026-03-06 (v12 — Sessions 77–79 completions. CD2 Phases 2–4 shipped (35+ features). CA/CB paths complete. Recovered from v3 regression.)
**Status:** Production MVP live at finda.sale. 21 core phases + post-launch T–X + 35 CD2 features shipped. All CA/CB/CC paths complete. Entering beta recruitment.

---

## Achievement: All Sprints Complete ✅

21 phases + post-launch Sprints T–X shipped. Five Pillars complete. Full detail: `claude_docs/COMPLETED_PHASES.md`.

---

## Parallel Path Architecture

5 tracks run concurrently. Sync points defined below.

**P — Patrick (Human):** Beta recruitment, API keys, branding decisions, Stripe setup, real-world partnerships.

**CA — Claude: Production Readiness:** ✅ ALL COMPLETE. Stress testing, bug fixing, ToS, polish, documentation.

**CB — Claude: AI Image Processing:** ✅ ALL COMPLETE. Google Vision + Claude Haiku pipeline. Legacy tagger retired.

**CC — Claude: Business Intel & Content:** ✅ ALL COMPLETE. Investor materials, marketing content, pricing analysis.

**CD — Claude: Innovation & Experience:** CD1 complete. CD2 Phases 1–4 substantially shipped. Ongoing feature innovation.

---

## Path P — Patrick

### P1: Business Formation — ✅ COMPLETE
- [x] File Michigan LLC with LARA
- [x] Get EIN from IRS.gov
- [x] Open business bank account
- [x] Set up support@finda.sale email forwarding ✅ 2026-03-06
- [ ] Order business cards (~$25) — PNG logos ready in `claude_docs/brand/`
- [ ] Create Google Business Profile for FindA.Sale

### P2: Legal + Stripe — IN PROGRESS
- [ ] Open Stripe business account (if easier than personal Connect)
- [x] ⚡ ToS/Privacy implemented (CA1) ✅
- [ ] Set up Google Voice for support line
- [ ] Google Search Console verification (if not done)

### P3: Field Research — ✅ COMPLETE

### P4: Beta Recruitment (Week 3–6) ← NEXT PATRICK TRACK
- [ ] Identify 5 target beta organizers
- [x] ⚡ Demo walkthrough + onboarding guide shipped (CA7) ✅
- [ ] Schedule 1-on-1 onboarding sessions
- [ ] Hand-hold first 3 sales
- [ ] Collect structured feedback
- [ ] ⚡ **Sync: feedback → Claude for iteration**

### P5: API Keys & Services — ✅ COMPLETE
- [x] Google Cloud account + Vision API key ✅ 2026-03-05
- [x] Anthropic API key ✅ 2026-03-05
- [x] UptimeRobot monitoring ✅ 2026-03-05
- [x] OAuth credentials (Google, Facebook) → Vercel env vars ✅ 2026-03-06
- [x] Redirect URIs configured ✅ 2026-03-06
- [ ] VAPID keys confirmed in production

### P6: Branding — ✅ COMPLETE
- [x] Branding brief reviewed
- [x] AI-generated logos (SVG + PNG) ✅ 2026-03-05
- [x] Color palette + typography applied (CD1) ✅

---

## Path CA — Claude: Production Readiness — ✅ ALL COMPLETE

| Task | Status |
|------|--------|
| CA1: ToS & Privacy Policy | ✅ Session 66 |
| CA2: Database & Migration Health | ✅ Session 68 |
| CA3: Payment Flow Stress Test | ✅ Session 69 |
| CA4: User Flow Audit | ✅ Session 70 |
| CA5: Performance & Security | ✅ Session 67 |
| CA6: Feature Polish | ✅ Session 70 |
| CA7: Human Documentation | ✅ Session 77 — /guide page, FAQ (shopper+organizer tabs), footer links |

---

## Path CB — Claude: AI Image Processing — ✅ ALL COMPLETE

> Standalone image tagger retired. Google Vision + Claude Haiku is production pipeline.

| Task | Status |
|------|--------|
| CB1: Research & Architecture | ✅ Session 68 |
| CB2: Backend Integration | ✅ Session 69 — cloudAIService.ts |
| CB3: Frontend Integration | ✅ Session 69 — AI suggestions panel |
| CB4: Quality Tuning | ✅ Session 77 — Haiku prompt improved, tags field, feedback endpoint |
| CB5: Legacy Cleanup | ✅ Session 77 — TAGGER_URL removed, Ollama fallback updated |

**Remaining:** Delete `packages/backend/services/image-tagger/` directory (Patrick manual — FastAPI legacy).

---

## Path CC — Claude: Business Intel & Content — ✅ ALL COMPLETE

| Task | Status |
|------|--------|
| CC1: Investor Materials | ✅ Session 68 |
| CC2: Marketing Content | ✅ Session 69 |
| CC3: Pricing Model Analysis | ✅ Session 68 — Recommends flat 5%/7%. ⚡ Patrick confirms? |
| CC4: Automated Intelligence | ✅ Running — 7 scheduled tasks active |

---

## Path CD — Claude: Innovation & Experience

### CD1: Branding Implementation — ✅ COMPLETE (Session 70)
Fraunces serif + sage-green palette. PWA manifest, favicon, app icons. Brand voice in microcopy.

### CD2: Feature Innovation Pipeline

**Phase 1 — Quick Wins: ✅ COMPLETE (Session 69)**

| Feature | Status |
|---------|--------|
| Live Scarcity Counter | ✅ Shipped |
| Social Proof Live Feed | ✅ Shipped |

**Phase 2 — Engagement Layer: ✅ COMPLETE (Sessions 77–78)**

| Feature | Status |
|---------|--------|
| Smart Inventory Upload | ✅ Shipped (CB leverages cloudAIService) |
| Treasure Hunt Mode | ✅ Shipped + verified (Session 77) |
| Live Drop Events | ✅ Shipped + verified (Session 77) |
| Personalized Weekly Email | ✅ Shipped (weeklyEmailService) |
| Streak Challenges + Hunt Pass | ✅ Shipped (Session 78 — streakService, StreakWidget) |
| QR Codes for Physical Sales | ✅ Shipped (Session 77 — SaleQRCode component) |

**Phase 3 — Moat Features: ✅ SUBSTANTIALLY COMPLETE (Session 78)**

| Feature | Status |
|---------|--------|
| AI Discovery Feed | ✅ Shipped (discoveryService — personalized scoring) |
| Buyer-to-Sale Matching | ✅ Shipped (buyerMatchService — notifyMatchedBuyers on publish) |
| Dynamic Pricing | ✅ Shipped (PriceSuggestion component, prior session) |
| Visual Search | ✅ Shipped (Google Vision + label matching, prior session) |
| City Leaderboards & Badges | ✅ Shipped (Session 78 — /leaderboard page) |
| Sale Near Me Heat Map | ✅ Shipped (Session 78 — /map page, Leaflet) |
| Organizer Insights Dashboard | ✅ Shipped (Session 78 — /organizer/insights) |
| Virtual Tours (360°) | Deferred — needs 360° camera integration |

**Phase 4 — Market Expansion: ✅ SUBSTANTIALLY COMPLETE (Sessions 78–79)**

| Feature | Status |
|---------|--------|
| Reverse Auction | ✅ Shipped (reverseAuctionJob daily cron, organizer controls) |
| Group Buying Pools | ✅ Shipped (buyingPoolController, /buying-pools) |
| Estate Sale Planning Assistant | ✅ Shipped (/plan chatbot via Haiku) |
| Wishlist/Registry | ✅ Shipped (occasion-based, share links) |
| Flash Deals & Promotions | ✅ Shipped (flashDealController, time-limited, in-app notifications) |
| Organizer Tier Rewards | ✅ Shipped (Bronze/Silver/Gold tiers, tierService) |
| White-label MaaS | Deferred — post-beta business decision |
| Consignment Integration | Deferred — needs partner POS systems |
| AR Furniture Preview | Deferred — long-term R&D |

**Additional Features Shipped (Sessions 78–79):**

| Feature | What It Does |
|---------|-------------|
| Admin Panel | /admin with user management, sale oversight, suspensions |
| In-app Notification Inbox | NotificationBell + /notifications page, mark-read, delete |
| Abandoned Checkout Recovery | Hourly cron, 2h recovery email via emailTemplateService |
| Item Waitlist / Notify Me | waitlistController — email when item becomes available |
| Bulk Item Management | BulkItemToolbar + ItemListWithBulkSelection — multi-select actions |
| Sale Ending Soon | Hourly job, 24h push + email to followers |
| Pickup Appointment Scheduling | PickupSlotManager (organizer) + PickupBookingCard (shopper) |
| Organizer Onboarding Wizard | 4-step guided setup (profile → first sale → items → publish) |
| Sale Calendar | /calendar — month grid of upcoming sales |
| OG Social Preview Cards | Dynamic Open Graph images for sales, items, homepage |
| JSON-LD Structured Data | Event (sales), Product (items), Organization+WebSite (homepage) |
| Sale Cloning | One-click duplicate from organizer dashboard |
| Advanced Search Filters | Price range, condition, category, sort — URL-synced |
| Shopper Dashboard | Activity stats, recently viewed, flash deals banner, notification prefs |
| Email Design System | emailTemplateService.ts — buildEmail() + buildItemCard() centralized |
| Price Drop Alerts | Detects price changes on favorited items, emails users |
| Accessibility | ARIA labels, keyboard nav, skip-to-content, screen reader support |
| Sale Countdown Timer | CountdownTimer component on sale cards + detail pages |

### CD3: Cross-Industry Research (ongoing)
Weekly feature-innovation-scan monitors: real estate, social commerce, gaming, food delivery, dating apps, fitness apps, auction houses.

### CD4: UX & Workflow Review System (bi-weekly)
Scheduled bi-weekly review of session logs, skill effectiveness, doc freshness, and workflow bottlenecks. ✅ COMPLETE (Session 69).

---

## What's Next

### Remaining CD2 Features (batch 7 incomplete)
- [ ] Social sharing for items/sales (Web Share API + fallbacks)
- [ ] Organizer print inventory list (print CSS + formatted view)

### Sprint E: Phase 26 — Listing Card Redesign
1:1 square photo, 60/40 image/content split, badge overlay, 2-column mobile / 3-column desktop. Three-tier image loading: LQIP base64 blur → skeleton → lazy high-quality WebP.

### Sprint F: Phase 31 — OAuth Social Login
NextAuth.js v5, Google + Facebook. OAuthProvider + oauthId fields on User. Apple as fast follow. ⚡ P5 OAuth credentials now done.

### Sprint G: Phase 28 — Social Proof + Activity Feed
Real-time activity feed, social sharing integrations, community engagement.

### Sprint H: Phase 27 — Onboarding + Empty States + Microinteractions
Empty states for every screen. Heart animation, confetti on first publish. (Onboarding wizard already shipped — this is the polish pass.)

---

## Sync Point Calendar

| Week | Sync | What Converges | Status |
|------|------|----------------|--------|
| 1 | ⚡ ToS review | CA1 draft → Patrick approves | ✅ Done |
| 1 | ⚡ Branding direction | Patrick chooses path → CD1 implements | ✅ Done |
| 2 | ⚡ AI tagging approach | CB1 spec → Patrick approves + API keys | ✅ Done |
| 3 | ⚡ Payment test results | CA3 report → go/no-go | ✅ Done |
| 4 | ⚡ Documentation review | CA7 guides → Patrick reviews | ✅ Done |
| 4 | ⚡ Launch pricing confirmation | CC3 analysis → Patrick decides 5%/7% | Pending Patrick |
| 5 | ⚡ Beta readiness check | All paths → go/no-go for beta | ← NEXT |
| 6–8 | ⚡ Beta feedback loops | P4 feedback → CA/CB/CD iterate | Pending |

---

## Long-Term Hold

| Item | Reason | Revisit |
|------|--------|----------|
| Video-to-inventory | Vision models can't segment rooms | Late 2026+ |
| Multi-metro expansion | Grand Rapids validation first | After beta data |
| White-label MaaS | Business decision | Post-beta revenue signal |
| AR Furniture Preview | Long-term R&D | When WebXR matures |
| Virtual Tours (360°) | Needs 360° camera integration | Post-beta demand signal |

---

## Infrastructure (All Done)

Backend on Railway (`backend-production-153c9.up.railway.app`), PostgreSQL on Neon, frontend on Vercel (`finda.sale`). Dockerfile.production auto-runs `prisma migrate deploy` on each deploy. Session safeguards, model routing, scheduled tasks, self-healing skills all active.

---

*v12 updated 2026-03-06. Recovered from v3 regression (commit 1061965 overwrote v11). Sessions 77–79: CA7/CB4/CB5 complete, CD2 Phases 2–4 shipped (35+ features across 7 batches). All CA/CB/CC paths now fully complete. Source: git show daa399d:claude_docs/roadmap.md (v11 base).*