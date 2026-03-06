# ROADMAP – FindA.Sale

**Last Updated:** 2026-03-06 (v14 — Session 82 batches 9–17. All CA/CB/CC/CD complete. Beta invite flow wired. 8 broken fetch() fixed. Pre-push hook silent. Badge notifications live.)
**Status:** Production MVP live at finda.sale. All phases + CA/CB/CC/CD complete. Beta invite system fully functional. 35 Neon migrations applied. Pre-push hook zero warnings. Beta recruitment ready.

---

## Achievement: All Sprints Complete ✅

21 phases + post-launch Sprints T–X shipped. Five Pillars complete. Full detail: `claude_docs/COMPLETED_PHASES.md`.

---

## Parallel Path Architecture

5 tracks run concurrently. Sync points defined below.

**P — Patrick (Human):** Beta recruitment, API keys, branding decisions, Stripe setup, real-world partnerships.

**CA — Claude: Production Readiness:** Stress testing, bug fixing, ToS implementation, polish. Fully autonomous.

**CB — Claude: AI Image Processing (Cloud Pipeline):** Google Vision + Claude Haiku shipped. Standalone tagger retired. Quality tuning + legacy cleanup remaining.

**CC — Claude: Business Intel & Content:** Investor materials, marketing content, pricing analysis. Fully autonomous.

**CD — Claude: Innovation & Experience:** Blue-sky feature development, branding implementation, UX research, cross-industry feature porting.

---

## Path P — Patrick

### P1: Business Formation — IN PROGRESS
- [x] File Michigan LLC with LARA
- [x] Get EIN from IRS.gov
- [x] Open business bank account
- [ ] Set up support@finda.sale email forwarding
- [ ] Order business cards (~$25)
- [ ] Create Google Business Profile for FindA.Sale

### P2: Legal + Stripe — IN PROGRESS
- [ ] Open Stripe business account (if easier than personal Connect)
- [ ] ⚡ **Sync: Claude implements ToS/Privacy into the app (CA1)**
- [ ] Set up Google Voice for support line
- [ ] Google Search Console verification (if not done)

### P3: Field Research — ✅ COMPLETE
Original project research done. Notes available.

### P4: Beta Recruitment (Week 3–6)
- [ ] Identify 5 target beta organizers
- [ ] ⚡ **Sync: Claude provides demo walkthrough + onboarding guide (CA7)**
- [ ] Schedule 1-on-1 onboarding sessions
- [ ] Hand-hold first 3 sales
- [ ] Collect structured feedback
- [ ] ⚡ **Sync: feedback → Claude for iteration**

### P5: API Keys & Services (As Needed)
- [x] Google Cloud account + Vision API key ✅ 2026-03-05
- [x] Anthropic API key (for Claude Haiku) ✅ 2026-03-05
- [x] UptimeRobot monitoring ✅ 2026-03-05
- [ ] OAuth credentials (Google, Facebook) → Vercel env vars: GOOGLE_CLIENT_ID/SECRET, FACEBOOK_CLIENT_ID/SECRET
- [ ] VAPID keys confirmed in production

### P6: Branding Decisions (Week 2–4)
- [x] Review branding brief (`claude_docs/research/branding-brief-2026-03-05.md`)
- [x] Logo generated via AI (SVG) — `claude_docs/brand/logo-primary.svg` ✅ 2026-03-05 — unblocks business cards + CD1
- [ ] ⚡ **Sync: Claude implements chosen color palette, typography, PWA manifest (CD1)**

---

## Path CA — Claude: Production Readiness

### CA1: ToS & Privacy Policy Implementation — ✅ COMPLETE (Session 66)
`/terms` and `/privacy` pages live. Footer links + checkout consent checkbox shipped.

### CA2: Database & Migration Health — ✅ COMPLETE (Session 68)
Prisma schema validated. Production migration runbook documented. All 35 migrations applied to Neon production (2026-03-06).

### CA3: Payment Flow Stress Test — ✅ COMPLETE (Session 69)
All Stripe paths tested. 2 bugs found and fixed. 5%/7% fee logic verified.

### CA4: User Flow Audit — ✅ COMPLETE (Session 70)
Shopper + organizer journeys audited. 5 polish fixes shipped (merged with CA6).

### CA5: Performance & Security — ✅ COMPLETE (Session 67)
Health-scout GREEN. All critical issues resolved.

### CA6: Feature Polish — ✅ COMPLETE (Session 70)
5 fixes shipped across photo upload UX, empty states, and error handling.

### CA7: Human Documentation — ✅ COMPLETE (Session 77)
`/guide` organizer page, expanded `/faq` (shopper + organizer tabs), footer guide link, webhook Zapier guide link. ⚡ **Sync: Patrick reviews before beta launch.**

---

## Path CB — Claude: AI Image Processing (Cloud Pipeline)

> **Standalone image tagger retired.** Google Vision + Claude Haiku is the production pipeline. Ollama remains as optional local dev fallback only. The `TAGGER_URL`/`TAGGER_API_KEY` env vars and RAM++ references can be removed in a future cleanup pass.

### CB1: Research & Architecture — ✅ COMPLETE (Session 68)
Google Vision (labels) + Claude Haiku (structured analysis). Cost at beta: $10–50/month. Spec + cost model documented.

### CB2: Backend Integration — ✅ COMPLETE (Session 69)
`cloudAIService.ts` shipped. Fallback chain: Vision → Haiku → Ollama → manual. Rate limiting and cache in place.

### CB3: Frontend Integration — ✅ COMPLETE (Session 69)
AI suggestions review panel on add-items page. Accept/edit/reject per suggestion. Rapid-batch upload endpoint live.

### CB4: Quality Tuning — ✅ COMPLETE (Session 77)
Tags field added to AITagResult. Haiku prompt improved (estate-sale context, category guidance, condition guidelines). Feedback endpoints `/upload/ai-feedback` + stats. Tags shown as pill badges in add-items panel.

### CB5: Legacy Cleanup — ✅ COMPLETE (Session 77)
TAGGER_URL/TAGGER_API_KEY removed from itemController. analyzeItemTags uses cloudAIService. .env vars deprecated. Ollama fallback prompt updated. Note: `packages/backend/services/image-tagger/` directory still needs manual deletion by Patrick.

---

## Path CC — Claude: Business Intel & Content

### CC1: Investor Materials — ✅ COMPLETE (Session 68)
Executive summary, 12-slide pitch deck, 3-year financial model, TAM/SAM/SOM, competitive landscape. All in `claude_docs/research/`.

### CC2: Marketing Content — ✅ COMPLETE (Session 69)
Blog posts, social templates, email templates shipped. See `claude_docs/research/marketing-content-2026-03-05.md`.

### CC3: Pricing Model Analysis — ✅ COMPLETE (Session 68)
Recommends flat 5%/7% for beta. Full analysis in `claude_docs/research/pricing-analysis-2026-03-05.md`. ⚡ **Sync: Patrick confirms launch pricing.**

### CC4: Automated Intelligence (running)
7 scheduled tasks covering competitor monitoring, industry intel, changelog, UX spots, health, monthly digest, workflow retrospective.

---

## Path CD — Claude: Innovation & Experience

### CD1: Branding Implementation — ✅ COMPLETE (Session 70)
Fraunces serif + sage-green palette applied. PWA manifest, favicon, app icons updated. Brand voice in microcopy shipped.

### CD2: Feature Innovation Pipeline (ongoing)

**Phase 1 — Quick Wins: ✅ COMPLETE (Session 69)**

| Feature | Status |
|---------|--------|
| Live Scarcity Counter | ✅ Shipped — "3 left" / "5 bought in last hour" badges |
| Social Proof Live Feed | ✅ Shipped — "X people viewing" / "Y just bought" stats bar |
| Streak Challenges | Deferred to Phase 2 (needs Hunt Pass system first) |

**Phase 2 — Engagement Layer (Weeks 5–12):** ← NEXT CD TRACK

| Feature | What It Does | Claude Path |
|---------|-------------|-------------|
| Smart Inventory Upload | Bulk photo → AI tags → listings in one batch | ✅ COMPLETE (SmartInventoryUpload.tsx, rapid-batch endpoint) |
| Treasure Hunt Mode | Daily discovery challenges with AI-generated clues | ✅ COMPLETE (TreasureHuntBanner, service, routes, items/[id] integration) |
| Live Drop Events | Countdown reveals of premium items, FOMO-driven | ✅ COMPLETE (isLiveDrop/liveDropAt in items/[id].tsx + add-items.tsx) |
| Personalized Weekly Email | Curated items based on shopper browse/buy history | ✅ COMPLETE (weeklyEmailService personalized picks + weeklyEmailJob.ts) |
| Streak Challenges + Hunt Pass | Visit/save/buy streaks with point bonuses, $4.99 Hunt Pass Stripe flow | ✅ COMPLETE (StreakWidget.tsx + HuntPassModal.tsx, backend activate/confirm routes, Session 81) |
| QR Codes for Physical Sales | Scannable codes linking to digital inventory at sale location | ✅ COMPLETE (SaleQRCode.tsx, Session 77) |

**Phase 3 — Moat Features (Months 4–6):**

| Feature | What It Does | Claude Path |
|---------|-------------|-------------|
| AI Discovery Feed | Personalized item feed using ML on browse/buy signals | ✅ COMPLETE (discoveryService.ts, /api/feed route, index.tsx personalized feed, Session 80+) |
| Buyer-to-Sale Matching | ML matches shoppers to sales based on preference history | ✅ COMPLETE (buyerMatchService.ts, triggered on sale publish, Session 80+) |
| Dynamic Pricing | AI suggests prices based on comps, condition, demand | ✅ COMPLETE (PriceSuggestion.tsx + /items/ai/price-suggest + DB comps, Session 81) |
| Visual Search | Photo → find similar items across all active sales | ✅ COMPLETE (VisualSearchButton.tsx + /api/search/visual, Session 80+) |
| Virtual Tours (360°) | Walkable preview of sale space before visiting | ✅ COMPLETE (SaleTourGallery.tsx — full-screen tour with swipe/keyboard/filmstrip, Session 82) |
| City Leaderboards & Badges | Gamification layer for repeat buyers/organizers | ✅ COMPLETE (leaderboard.tsx page + leaderboardController.ts, Session 80+) |
| Sale Near Me Heat Map | Geo-visual discovery of active/upcoming sales | ✅ COMPLETE (map.tsx — Leaflet map with date filters and geolocation, Session 80+) |
| Organizer Insights Dashboard | Analytics on views, conversions, popular items | ✅ COMPLETE (organizer/insights.tsx, Session 80+) |

**Phase 4 — Market Expansion (Months 7–12):**

| Feature | What It Does | Status |
|---------|-------------|--------|
| Reverse Auction | Declining price on slow inventory — daily auto price drop | ✅ COMPLETE (ReverseAuctionBadge.tsx + reverseAuctionJob.ts, Session 80+) |
| Group Buying Pools | Co-buy expensive items (antique sets, furniture collections) | ✅ COMPLETE (BuyingPoolCard.tsx + buyingPoolController.ts, Session 80+) |
| Wishlist/Registry | Occasion-based wishlists (moving, downsizing, decorating) | ✅ COMPLETE (wishlists.tsx, Session 80+) |
| Flash Deals & Promotions | Time-limited organizer promotions with push notifications | ✅ COMPLETE (FlashDealForm.tsx + FlashDealBanner.tsx, Session 80+) |
| Organizer Tier Rewards | Bronze/Silver/Gold tiers with reduced fees + priority features | ✅ COMPLETE (OrganizerTierBadge.tsx + tierController.ts, Session 80+) |
| White-label MaaS | Marketplace-as-a-Service for thrift chains and antique dealers | Deferred post-beta |
| Estate Sale Planning Assistant | AI chatbot guiding executors through the entire process | ✅ COMPLETE (plan.tsx AI chat, Session 80+) |
| Consignment Integration | Connect thrift store POS systems to FindA.Sale listings | Deferred post-beta |
| AR Furniture Preview | See items in your space before buying (long-term R&D) | Deferred — hardware not ready |

### CD3: Cross-Industry Research (ongoing)
Weekly feature-innovation-scan monitors: real estate, social commerce, gaming, food delivery, dating apps, fitness apps, auction houses.

### CD4: UX & Workflow Review System (bi-weekly)
Scheduled bi-weekly review of session logs, skill effectiveness, doc freshness, and workflow bottlenecks.

---

## Sync Point Calendar (Updated)

| Week | Sync | What Converges | Status |
|------|------|----------------|--------|
| 1 | ⚡ ToS review | CA1 draft → Patrick approves | ✅ Done |
| 1 | ⚡ Branding direction | Patrick chooses path → CD1 implements | ✅ Done |
| 2 | ⚡ AI tagging approach | CB1 spec → Patrick approves + API keys | ✅ Done |
| 3 | ⚡ Payment test results | CA3 report → go/no-go | ✅ Done |
| 4 | ⚡ Documentation review | CA7 guides → Patrick reviews | ← NEXT |
| 4 | ⚡ Launch pricing confirmation | CC3 analysis → Patrick decides 5%/7% | Pending Patrick |
| 5 | ⚡ Beta readiness check | All paths → go/no-go for beta | Pending |
| 6–8 | ⚡ Beta feedback loops | P4 feedback → CA/CB/CD iterate | Pending |

---

## Long-Term Hold

| Item | Reason | Revisit |
|------|--------|---------|
| Video-to-inventory | Vision models can't segment rooms reliably yet | Late 2026+ |
| Multi-metro expansion | Business decision — Grand Rapids validation first | After beta data |

---

## Infrastructure (All Done)

Backend on Railway (`backend-production-153c9.up.railway.app`), PostgreSQL on Neon (all 35 migrations applied as of 2026-03-06), frontend on Vercel (`finda.sale`). Session safeguards, model routing, scheduled tasks, self-healing skills all active. Git workflow: `.\push.ps1` replaces raw `git push` — handles index.lock, CRLF phantoms, fetch+merge (not rebase). Pre-push hook validates TS, Prisma schema, controller stubs, auth coverage. See `claude_docs/CORE.md` and `claude_docs/self_healing_skills.md`.

---

*v13 updated 2026-03-06 (Session 82). CD2 Phase 2+3 complete. CD2 Phase 4 substantially complete (Reverse Auction, Group Buying, Wishlists, Flash Deals, Tier Rewards, Planning Assistant). Remaining deferred: White-label MaaS, Consignment, AR Preview. Health scout: GREEN. SaleTourGallery created. Dynamic pricing with DB comps.*
