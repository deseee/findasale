# ROADMAP – FindA.Sale

**Last Updated:** 2026-03-17 (v49 — Session 195+196: 26 QA passes applied. S195 audited 29 features. S196 built #22 Low-Bandwidth Mode, fixed #19 passkey UI, added rate limiting to photo-ops, fixed #54 appraisal tier gate.)
**Previous:** 2026-03-13 (v27 — Session 157: Innovation Round 3. 30 new ideas across 10 creative lenses (casino/gambling, microtransactions, big box retail, mobile trends, international, progressive disclosure, GitHub/open source, Reddit/social, Zapier/automation, emerging). 11 rated BUILD → added to Phase 4 (#61–#71). 19 rated DEFER → added to Deferred. Total: 71 active features + 65 deferred items. Research: `claude_docs/research/innovation-round3-2026-03-13.md`.)
**Status:** Production MVP live at finda.sale. Beta: GO. Full build history: `claude_docs/strategy/COMPLETED_PHASES.md`.

---

## Patrick's Checklist

### Business Formation + Legal
- [ ] Order business cards (~$25) — files in `claude_docs/brand/`
- [ ] Create Google Business Profile for FindA.Sale
- [ ] Open Stripe business account
- [ ] Google Search Console verification
- [ ] Set up Google Voice for support line

### Credentials + Services
- [ ] VAPID keys confirmed in production

### Beta Recruitment
- [ ] Identify 5 target beta organizers (`claude_docs/beta-launch/organizer-outreach.md` ready)
- [ ] Schedule 1-on-1 onboarding sessions
- [ ] Hand-hold first 3 sales
- [ ] Collect structured feedback
- [ ] ⚡ **Sync: feedback → Claude for iteration**

---

## Running Automations

10 scheduled tasks active: competitor monitoring, context refresh, context freshness check, UX spots, health scout (weekly), monthly digest, workflow retrospective, weekly Power User sweep, daily friction audit (Mon-Fri 8:30am), weekly pipeline briefing (Mon 9am). Managed by Cowork Power User + findasale-workflow + findasale-sales-ops agents.

### Upcoming Work Sessions
- Continue QA sweep: `/neighborhoods/[slug]` (needs real slug from DB — 404 on test slug), Wave 5 Sprint 2 frontend builds (6 features), Waves 1–4 QA pass for remaining [QA-PENDING] features
- P3 nav discoverability: trending, cities, neighborhood, activity feed, virtual queue, organizer digest, bounties, notification sidebar — none have obvious nav links from main dashboard
- Wave 5 Sprint 2 frontend builds (6 features)

### S194 QA Audit Results (2026-03-17)
**Chrome-tested, confirmed working:**
- `/trending` ✅ (dark mode fixed)
- `/feed` (activity feed) ✅
- `/cities` ✅
- `/city/grand-rapids` ✅ (backend route added, slug display fixed, dark mode fixed)
- `/organizer/bounties` ✅ (API endpoint fixed, dark mode fixed)
- `/organizer/message-templates` ✅ (dark mode fixed)
- `/organizer/email-digest-preview` ✅ (excellent — real data, professional template)
- `/organizer/workspace` ✅ TEAMS gate working, dark mode ✅
- `/shopper/achievements` ✅ (wrong env var fixed)
- `/shopper/disputes` ✅ (dark mode fixed)
- `/organizer/line-queue/[id]` ✅ (dark mode fixed)

**Still needs testing:**
- `/neighborhoods/[slug]` — 404 (needs real slug from DB)
- Wave 5 Sprint 1 API smoke tests (#46 #52 #54 #60 #69 #71)
- Waves 2–4 QA-PENDING features (30+)

**Bugs fixed this session (all live):**
1. Onboarding modal blocking entire dashboard (JWT `onboardingComplete` flag added; `POST /organizers/me/onboarding-complete` endpoint)
2. `useAchievements.ts` wrong env var (`NEXT_PUBLIC_API_BASE_URL` → `NEXT_PUBLIC_API_URL`)
3. `/sales/city/:city` route missing from backend (added controller + route)
4. `saleController.getSalesByCity` used `location` field (doesn't exist) → fixed to `city`
5. City slug humanization bug (`grand-rapids` → `Grand Rapids`)
6. Dark mode missing on 7 pages: trending, achievements, disputes, bounties, message-templates, line-queue, (+ city page)
7. Bounties dropdown wrong API endpoint (`/organizer/sales` → `/sales/mine`)
8. TEAMS nav link missing from Layout.tsx (added for TEAMS-tier users)
9. `.checkpoint-manifest.json` git-tracked → added to `.gitignore`

### Design Decisions (Locked Session 155)
- **Holds expiry:** 48 hours default, configurable per-sale in organizer settings. Nightly cron cleanup.
- **Health score:** Hybrid gate — block publishing below 40% (no photo or title), nudge 40–70%, free above 70%. Progress bar UX, never punitive.
- **Tag vocabulary:** Curated list of 30–50 core tags + 1 free-form custom slot per item. AI suggests from curated list. Quarterly review.
- **Social templates:** Auto-fill v1 with 3 tone options (Casual, Professional, Friendly). Defer WYSIWYG editor to post-beta.
- **Heatmap density:** Radius-based (1–3 mile), pre-computed grid tiles every 6h, 7-day rolling window baked in.
- **Background removal:** On-demand Cloudinary `b_remove` transform only. Primary photo. No batch job.
- **Holds grouping:** By-item in schema, grouped-by-buyer in display. No junction table.

---

## Feature Pipeline

### Next Up (Priority Order)

**TIER 1 — BACKEND SHIPPED, FRONTEND PENDING (Sprint 2 In-Flight)**
| # | Feature | Tier | Notes |
|---|---------|------|-------|
| 46 | Treasure Typology Classifier | [PRO] | **S196 — Backend Sprint 1 ✅, QA-PASS S196. Frontend Sprint 2 pending.** Classifier service + API complete, tested. Awaiting tag suggestion UI + Collector Passport integration. |
| 52 | Estate Sale Encyclopedia | [FREE] | **S196 — Backend Sprint 1 ✅, QA-PASS S196. Frontend Sprint 2+3 pending.** Full backend + migrations, tested. Awaiting frontend browse/submit/moderation UI. |
| 54 | Crowdsourced Appraisal API | [PAID_ADDON] | **S196 — QA-FIXED S196. Missing PAID_ADDON tier gate added; needs re-QA.** Full backend + migrations. Stripe integration wired. Awaiting frontend request form + Claude vision. |
| 69 | Local-First Offline Mode | [PRO] | **S196 — Backend Sprint 1 ✅, QA-PASS S196. Frontend Sprint 2 pending.** sync.ts routes + service worker core complete, tested. Awaiting full offline catalog UI + conflict resolution UI. |
| 71 | Organizer Reputation Score | [SIMPLE] | **S196 — Backend Sprint 1 ✅, QA-PASS S196. Frontend Sprint 2 pending.** API endpoints + badge component wired, tested. Awaiting reputation dashboard + shopper rating submission form. |
| 60 | Premium Tier Bundle | [PRO] | **S196 — Backend Sprint 1 ✅, QA-PARTIAL S196. Frontend Sprint 2 pending.** Schema/backend complete. Onboarding wizard + upgrade copy drafted. Awaiting full billing + workspace management UX (Sprint 2). |

**TIER 2 — SHIPPED S190, QA REQUIRED (all backend complete, frontend wired)**
| # | Feature | Tier | Session | Status |
|---|---------|------|---------|--------|
| 13 | TEAMS Workspace | [TEAMS] | S190 | [QA-PASS ✅ S195] Backend + workspace UI complete. Chrome-tested. |
| 17 | Bid Bot Detector + Fraud Score | [PRO] | S190 | [QA-PASS ✅ S195] FraudSignal schema + FraudBadge wired. Chrome-tested. |
| 19 | Passkey / WebAuthn Support | [SIMPLE] | S190 | [QA-FIXED S196] Frontend login UI added S196. Needs re-QA. |
| 20 | Proactive Degradation Mode | [PRO] | S190 | [QA-PASS ✅ S195] DegradationBanner + middleware wired. Chrome-tested. |
| 22 | Low-Bandwidth Mode (PWA) | [SIMPLE] | S190 | [BUILT S196] Zero impl found in S195 audit; full implementation built S196. Needs QA pass. |
| 30 | AI Item Valuation & Comparables | [PRO] | S190 | [QA-PASS ✅ S195] ValuationWidget wired. Chrome-tested. |
| 39 | Photo Op Stations | [PRO] | S190 | [QA-PASS ✅ S195] PhotoOpMarker on map wired. Chrome-tested. |
| 40 | Sale Hubs | [PRO] | S190 | [QA-PASS ✅ S195] Hub pages + membership UI wired. Chrome-tested. |
| 48 | Treasure Trail Route Builder | [FREE] | S190 | [QA-PASS ✅ S195] Trail pages + share token wired. Chrome-tested. |
| 57 | Shiny / Rare Item Badges | [FREE] | S190 | [QA-PASS ✅ S195] RarityBadge wired. Chrome-tested. |
| 58 | Achievement Badges | [FREE] | S190 | [QA-PASS ✅ S195] /shopper/achievements Chrome-tested. Dark mode fixed. Env var bug fixed (NEXT_PUBLIC_API_URL). |
| 59 | Streak Rewards | [FREE] | S190 | [QA-PASS ✅ S195] Streak indicator wired to Layout. Chrome-tested. |

**TIER 3 — SHIPPED S187–S189, QA REQUIRED**
| # | Feature | Tier | Session | Status |
|---|---------|------|---------|--------|
| 7 | Shopper Referral Rewards | [FREE] | S187 | [QA-PASS ✅ S195] |
| 14 | Real-Time Status Updates | [PRO] | S187 | [QA-WARN ⚠️ S195] Event-driven SSE only; no REST route for status query. Functional but incomplete. |
| 16 | Verified Organizer Badge | [PRO] | S189 | [QA-PASS ✅ S195] |
| 18 | Post Performance Analytics | [PRO] | S187 | [QA-PASS ✅ S195] |
| 25 | Organizer Item Library | [PRO] | S187 | [QA-PASS ✅ S195] |
| 29 | Shopper Loyalty Passport | [FREE] | S187 | [QA-PASS ✅ S195] |
| 31 | Organizer Brand Kit | [PRO] | S187 | [QA-PASS ✅ S195] |
| 32 | Shopper Wishlist Alerts | [FREE] | S187 | [QA-PASS ✅ S195] |
| 41 | Flip Report | [PRO] | S189 | [QA-PASS ✅ S195] |
| 42 | Voice-to-Tag | [PRO] | S187 | [QA-PASS ✅ S195] |
| 45 | Collector Passport | [FREE] | S189 | [QA-PASS ✅ S195] |
| 47 | UGC Photo Tags | [FREE] | S189 | [QA-PASS ✅ S195] |
| 49 | City Heat Index | [FREE] | S187 | [QA-PASS ✅ S195] |
| 50 | Loot Log | [FREE] | S189 | [QA-PASS ✅ S195] |
| 51 | Sale Ripples | [FREE] | S187 | [QA-PASS ✅ S195] |
| 55 | Seasonal Discovery Challenges | [FREE] | S189 | [QA-PASS ✅ S195] |
| 62 | Digital Receipt + Returns | [FREE] | S187 | [QA-PASS ✅ S195] |

**ON DECK (Backend & Frontend Both Shipped, Minor Work Only)**
| # | Feature | Tier | Session | Notes |
|---|---------|------|---------|-------|
| 15 | Shopper Referral Rewards expansion | [FREE] | S190 | Web Share API wired to ReferralWidget. Minor: ensure mobile testing. |
| 65 | Organizer Mode Tiers | [PRO] | S177–S183 | [FULLY-COMPLETE] Full schema + billing + Progressive Disclosure UI. Ready for promotion once other features QA'd. |
| 68 | Command Center Dashboard | [PRO] | S183 | [QA-PASS ✅ S195] Backend + frontend both complete. Full nav + widget. Chrome-tested. |
| 70 | Live Sale Feed | [SIMPLE] | S185 | [FULLY-COMPLETE] Deployed. Already live on staging. |

**BLOCKED**
| # | Feature | Reason |
|---|---------|--------|
| 53 | Cross-Platform Aggregator | [TEAMS] Legal review required — ToS risk with EstateSales.NET/Facebook scraping. ADR written. Do not implement until legal clears. |

### Vision — Long-Term 
| # | Feature | Est. | Notes |
|---|---------|------|-------|
| 56 | Printful Merch Store | 1 sprint | [FREE/PAID_ADDON] Drop-shipped branded merch (tees, totes, stickers) via Printful API. Zero inventory risk. Revenue diversification. "I ❤️ Estate Sales" lifestyle brand play. |

---

## Agent Task Queue

Proactive tasks assigned to the fleet. Not product features — operational work agents own.

### Pre-Beta — All Done ✅

OAuth Security Red-Team, Payment Edge-Case QA, Full-Text Search Migration Rollback Plan, Beta Organizer Email Sequence, and Fee Decision Brief all complete. See COMPLETED_PHASES.md.

### Beta Support — All Done ✅

Spring Content Push, Beta Dry Run, and Support KB Pre-Population all complete. See `claude_docs/archive/marketing/` and `claude_docs/beta-launch/`.

### Infrastructure (One-time, pays off indefinitely)
| Task | Agent | Priority | Brief |
|------|-------|----------|-------|
| Bug Blitz Scoping | findasale-qa + health-scout | P0 | Produce prioritized P0/P1/P2 bug list before Session 105 so dev session is pure execution |
| ~~RECOVERY.md Decision Trees~~ | findasale-ops | ✅ Done | Decision trees section live in `claude_docs/RECOVERY.md` with safe-to-auto vs. needs-Patrick labels. |
| STACK.md Deploy Risk Matrix | findasale-deploy | P1 | Write code-area → risk-level table (payments/auth/schema=HIGH) into STACK.md |
| Connector-Matrix.md | cowork-power-user | P2 | Audit available MCP connectors vs. Phase 3+4 roadmap features; save to `claude_docs/operations/connector-matrix.md` |

---

## Sync Points

| Sync | What's Needed | Status |
|------|---------------|--------|
| ✅ Platform fee | Locked at 10% flat — session 106 | Complete |
| ⚡ Beta readiness | Patrick's checklist above → first real user | Waiting on Patrick items |
| ⚡ Beta feedback loops | Beta feedback → Claude iterates on features | Pending beta launch |

---

## Deferred & Long-Term Hold

| Feature | Reason | Revisit |
|---------|--------|--------|
| White-label MaaS | [Tier: TEAMS] Business decision — beta validation first | After beta data |
| Consignment Integration | [Tier: PRO] Thrift store POS — post-beta complexity | After beta data |
| QuickBooks Integration | [Tier: SIMPLE] CSV export covers 80% of need | When organizers ask |
| Video-to-inventory | [Tier: FUTURE] Vision models can't reliably segment rooms yet | Late 2026+ |
| Multi-metro expansion | [Tier: SIMPLE] Beta validation first | After beta data |
| AR Furniture Preview | [Tier: FUTURE] Hardware not ready | Long-term R&D |
| BUSINESS_PLAN.md rewrite | [Tier: TBD] Current doc still references Grand Rapids as primary focus; needs update to reflect national open-to-all-organizers positioning and current fee/feature state | After beta data confirms positioning |
| Zero-Downtime Migration Framework | Infrastructure — blue-green migrations for large tables (items, purchases). Critical as data grows past 10k rows. Architect designs; Dev builds helpers. | When table sizes warrant it |
| Canary Deploy + Auto-Rollback | Infrastructure — deploy to Vercel preview + Railway staging first; auto-rollback if smoke tests fail. Enables daily deploys without risk. | After beta stabilizes |
| Audit Automation Library | Infrastructure — codify 8 pre-beta audit paths as reusable tests; run on every deploy. health-scout creates `audit_baseline.json`. | After beta launch |

| Instant Flash Auctions | [Tier: PRO] Pre-beta, zero shoppers — no demand signal yet. DA: PAUSE. | After beta + 4–6 wks shopper data |
| Live Stream Sale Events | [Tier: PRO] Heaviest build (3–4 sprints), requires on-camera organizers. DA: RETHINK. | After beta proves organizer appetite |
| Verified Organizer Insurance Badge | [Tier: TEAMS] Requires micro-insurance partner — unvalidated market. DA: DEFER. | After beta data + partner conversations |
| Hyper-Local Pop-Up Sale Network | [Tier: FREE] Heatmap (#28) covers density; "pop-up network" is marketing layer on top. DA: RETHINK. | After Heatmap proves cluster value |

| Pokéstop-Style Sale Markers | [Tier: FREE] Gamification mismatch — estate sale shoppers skew older, Pokémon framing alienates core demo. Board rejected 12-0. (Session 156) | Revisit if shopper demo shifts younger |
| Trader Network | [Tier: TEAMS] P2P trading adds liability, moderation burden, and trust complexity. Not core to organizer value prop. Board rejected. (Session 156) | After platform scale justifies marketplace expansion |
| Egg Hatching Mechanic | [Tier: FREE] Too game-y for audience. Confusing metaphor for non-gamers. Board rejected. (Session 156) | Unlikely — consider lighter gamification instead |
| Team Rivalries | [Tier: FREE] Competitive team mechanics don't match collaborative sale-shopping culture. Board rejected. (Session 156) | Unlikely — revisit only if community features prove demand |
| Raid-Style Group Events | [Tier: FREE] Complex coordination + real-time features for uncertain demand. Board rejected. (Session 156) | After community features prove engagement |
| Professional Certifications | [Tier: TEAMS] Requires industry partnerships, legal review, ongoing administration. Low ROI for beta stage. Board rejected. (Session 156) | After organizer base exceeds 100+ |
| Mood Boards | [Tier: FREE] Nice-to-have but no clear retention or revenue driver. Board rejected as low priority. (Session 156) | After Collector Passport (#45) proves collection-tracking demand |
| AR Item Overlay | [Tier: TEAMS] Hardware/browser support still spotty. High build cost for novelty feature. Board rejected. (Session 156) | Late 2027+ when WebXR matures |
| QR/Barcode Item Labels | [Tier: SIMPLE] Print scannable labels during intake → POS scan for instant lookup/checkout. Patrick flagged high potential from retail experience. Pairs with POS v2 + Rapidfire. Not in board review — added manually. (Session 156) | Strong candidate for Phase 4 promotion when POS sees real usage |
| City Weekend Landing Pages (Metro Explorer) | [Tier: FREE] SEO-indexed per-metro pages (/grand-rapids-estate-sales). ISR + Schema.org markup. High SEO ROI but slow payoff (6–12 wk indexing). Innovation R1 Gap #4. (Session 156) | After 10+ active sales in GR; start with Tier 2 cities |
| Featured Listings (Feature Boost) | [Tier: PAID_ADDON] Paid homepage placement ($50–100/sale). Zero value pre-scale — needs 500+ daily shoppers. Innovation R1 Gap #6. (Session 156) | After 500+ organizer accounts + 10+ active sales |
| Auto-Markdown (Smart Clearance) | [Tier: PRO] Auto-discount engine: 50% day 2, 75% day 3, configurable floor. Removes manual repricing. Innovation R1 Gap #10. (Session 156) | Week 3–4 of beta once organizers run 1–2 sales |
| Approach Notes (Arrival Assistant) | [Tier: SIMPLE] Push notification at 500m: "Parking around back, enter via side gate." Geolocation-dependent. Innovation R1 Gap #13. (Session 156) | After Front Door Locator (#35) + Entrance Pin (#38) ship |
| Crowd-Sourced Corrections (Community Intel) | [Tier: FREE] Shoppers report "still available?" status + correct entrance locations. Vote-based ranking. Innovation R1 Gap #14. (Session 156) | After 500+ concurrent shoppers exist |
| Treasure Hunt QR (In-Sale Scavenger Hunt) | [Tier: FREE] Organizer prints QR stickers for unique items → shoppers collect badges by scanning. Dwell time + impulse purchase driver. Innovation R1 Gap #15. (Session 156) | After gamification scaffold (badges/XP) ships |
| Shopper Profile + Friend Network | [Tier: FREE] Public mini-card showing badges, finds, friend activity. Social proof layer. Innovation R1 bonus idea. (Session 156) | After gamification + UGC features prove engagement |
| Unified Print Kit | [Tier: SIMPLE] Combined PDF: yard sign QR + item barcode stickers in one download. Attribution loop (yard scan → checkout scan). Innovation R1 bonus idea. (Session 156) | After QR/Barcode Labels promoted to active |
| Fast Pass for Sales (Priority Entry) | [Tier: PAID_ADDON] $5–15 per pass, 30-min early access, capped at 20–50 passes. Revenue stream for organizers. Innovation R2. (Session 156) | After beta proves high-demand sales exist |
| Sale Grand Finale Events | [Tier: PRO] Last 2 hours become live-streamed event: flash auctions, confetti, 5x XP. Requires streaming infra. Innovation R2. (Session 156) | After Live Stream Sale Events proves appetite |
| VIP Behind-the-Scenes Tours | [Tier: PAID_ADDON] $99–299 video shoot package with creator. Professional content for organizer marketing. Innovation R2. (Session 156) | After creator/influencer network develops |
| Buddy System (Paired Shopping) | [Tier: FREE] Pair with friend for sale visits. Shared cart, bonus XP, co-collector profile. Innovation R2. (Session 156) | After gamification + social features ship |
| Restoration & Upcycling Marketplace | [Tier: FREE] Before/after project gallery. "Studio Pro" tier for restorers. Creator economy play. Innovation R2. (Session 156) | After UGC Photo Tags (#47) proves community content appetite |
| Book Club & Vinyl Community Hubs | [Tier: FREE] Moderated collector hubs with feeds, swaps, events, challenges. Niche community retention. Innovation R2. (Session 156) | After Collector Passport (#45) proves specialty-interest demand |
| Brand & Designer Tracking | [Tier: FREE] Follow specific brands/designers (Eames, Hermès). Alerts when matching items post. Authentication partner links. Innovation R2. (Session 156) | After tag system + Wishlist Alerts (#32) ship |
| FindA.Sale Network (Tier 3 Services) | [Tier: FUTURE] Multi-sided ecosystem: organizers + buyers + restorers + appraisers + shippers + designers. Platform as infrastructure OS. Innovation R2 "Big Bet." (Session 156) | Transformative — after platform proves all 3 tiers viable |
| AI Buying Agent Scout | [Tier: PRO] Personal AI shopping agent. Learns taste, proactively watches sales, auto-notifies. Premium $9.99/mo. Innovation R2. (Session 156) | After ML pipeline + personalization data exists |
| Estate Planning Toolkit | [Tier: TEAMS] Heir/executor liquidation assistant: inventory builder, appraisal integration, tax reporting. Upstream demand creation. Innovation R2. (Session 156) | After core organizer features stable + appraiser partnerships |
| State of Estate Sales Report | [Tier: PAID_ADDON] Monthly anonymized data report: pricing trends, category velocity, regional hotspots. B2B intelligence product ($199/yr). Innovation R2. (Session 156) | After enough transaction data to be credible (6+ months) |

| Mystery Box Drops | [Tier: FREE] Pre-beta, zero shoppers. Needs gamification scaffold (badges/XP) + shopper base. MI gambling/sweepstakes law review needed. Innovation R3 Casino lens. (Session 157) | After badge/XP system ships + Legal clears sweepstakes compliance |
| Daily Spin Wheel | [Tier: FREE] Requires reward infrastructure + shopper base. Board may flag "too gamey" — position as daily check-in reward. Innovation R3 Casino lens. (Session 157) | After badge/XP system + 500+ daily shoppers |
| Boost My Listing ($1-$5 microtx) | [Tier: PAID_ADDON] Zero value until 50+ active sales + 500+ daily shoppers. FTC paid placement disclosure required. Innovation R3 Microtransaction lens. (Session 157) | After 500+ daily shoppers + Legal reviews FTC disclosure |
| Instant Appraisal Token ($0.99) | [Tier: PAID_ADDON] Needs sold-item data to be credible. Overlaps with AI Valuations (#30). Requires 1,000+ sold items per category. Innovation R3 Microtransaction lens. (Session 157) | After AI Valuations (#30) + 6 months transaction data |
| Priority Checkout Pass ($2.99) | [Tier: PAID_ADDON] Requires in-person QR validation + POS integration + organizer opt-in. Only viable at high-traffic sales. Innovation R3 Microtransaction lens. (Session 157) | After POS v2 sees real usage at busy sales |
| Scan-to-Know (NFC Item Tags) | [Tier: SIMPLE] NFC tags add $0.05-$0.15/item cost. Start with QR labels first (already in Deferred). Evolution of QR/Barcode Labels. Innovation R3 Big Box lens. (Session 157) | After QR labels prove demand |
| Smart Cart (Running Total) | [Tier: SIMPLE] Only works for items with digital prices in FindA.Sale. Requires organizer adoption of digital pricing + QR/NFC infrastructure. Innovation R3 Big Box lens. (Session 157) | After QR Labels + POS established |
| Agentic AI Assistant ("Scout") | [Tier: PRO] Requires Wishlist Alerts (#32) + Collector Passport (#45) + sold-item data + preference learning. XL complexity. Overlaps with AI Buying Agent Scout already in Deferred — this is the scoped-down version. Innovation R3 Mobile lens. (Session 157) | After Wishlist + Collector Passport + 6 months preference data |
| Voice Search + Navigation | [Tier: SIMPLE] Web Speech API browser-native. Nice-to-have, not a retention driver. Background noise at busy sales may degrade recognition. Innovation R3 Mobile lens. (Session 157) | After core search is fully polished |
| RaaS for Organizers (Resale-as-a-Service) | [Tier: FUTURE] Long-term platform vision: full business management suite. Japan/EU circular economy model. Many pieces already on roadmap individually. Innovation R3 International lens. (Session 157) | After individual features prove themselves — 2027+ |
| Multi-Language Support (Spanish First) | [Tier: SIMPLE] 42M native Spanish speakers in U.S. i18n framework + professional translation + AI description translation. Important for national scale, not urgent for GR beta. Innovation R3 International lens. (Session 157) | Before national expansion push — Q1 2027 |
| API-First Organizer Toolkit | [Tier: TEAMS] Most endpoints exist internally; need OAuth2 auth, docs, rate limiting, versioning for public API. Behind Premium Tier (#60). Enables Zapier integration. Innovation R3 Progressive Disclosure lens. (Session 157) | After core features stabilize — Q4 2026-Q1 2027 |
| Zapier/Make.com Integration Hub | [Tier: TEAMS] Requires API-First Toolkit first. Official Zapier app with triggers + actions. 2.2M businesses use Zapier. Innovation R3 Zapier lens. (Session 157) | After API-First ships — Q1-Q2 2027 |
| TikTok-Style Item Reveal Feed | [Tier: FREE] Vertical swipe feed of item reveals. Only works with high photo quality + item volume (100+ items/area). TikTok Shop 4.7% conversion rate proves format. Innovation R3 Social lens. (Session 157) | After Rapidfire + Listing Factory drive photo quality up |
| Haul Post Gallery (UGC Social Proof) | [Tier: FREE] Post-purchase "show off your finds" with item linking + reactions. Builds on UGC Photo Tags (#47). r/ThriftStoreHauls (3M+ members) proves format. Innovation R3 Reddit lens. (Session 157) | After UGC Photo Tags (#47) ships |
| Organizer AMAs (Reddit-Style Q&A) | [Tier: FREE] Scheduled pre-sale preview + Q&A sessions. Requires chat infrastructure + organizer willingness + minimum audience. Innovation R3 Reddit lens. (Session 157) | After 10+ active organizers |
| Workflow Automations (Built-in IFTTT) | [Tier: PRO] Rule builder: Trigger → Condition → Action. Start with 5-10 hardcoded automations before building custom rule engine. Over-engineering trap. Innovation R3 Zapier lens. (Session 157) | Hardcoded automations Q3 2026; custom rules 2027 |
| Auto-Reprice (Market-Responsive Pricing) | [Tier: PRO] AI adjusts prices based on real-time demand signals (views, favorites, sell-through). Extends Auto-Markdown (already in Deferred) to mid-sale optimization. Requires transaction data + price benchmarks. Innovation R3 Zapier/AI lens. (Session 157) | After 6+ months transaction data + AI Valuations (#30) |
| Sale Soundtrack (Ambient Vibes) | [Tier: FREE] AI-suggested Spotify/Apple Music playlists matched to sale type. Fun differentiator. Stick to external playlist links — zero licensing risk. Innovation R3 Emerging lens. (Session 157) | Anytime — low priority but fun marketing splash |

*Deprecated (won't build): Co-Branded Yard Signs, Multi-Format Marketing Kit.*

---

## Infrastructure

All infra complete. Backend: Railway. DB: Neon (82 migrations applied as of 2026-03-15). Frontend: Vercel (`finda.sale`). Git: `.\ push.ps1` replaces `git push`. See `claude_docs/CORE.md` and `claude_docs/STACK.md`.

---

## Maintenance Rules

This document is updated at **every session wrap** when:
- A Patrick checklist item is completed
- A feature ships
- Beta status changes
- A deferred item is activated or cancelled

**Enforcement:** `claude_docs/CORE.md` §15(b) and `claude_docs/SESSION_WRAP_PROTOCOL.md` Step 2.
Roadmap and session-log are always updated in the same commit.

**Archival Log:**
- pricing-strategy.md archived 2026-03-15 — superseded by pricing-and-tiers-overview-2026-03-15.md

---

## ✅ Completed Features (Shipped)

*Agents: you may stop reading here if you are not actively slotting newly completed features into this section or seeking information on already shipped features.*

### Organizer — Core Operations [SIMPLE]

| Feature | Tier | Notes |
|---------|------|-------|
| Create / Edit / Publish / Archive Sales | [SIMPLE] | Core workflow |
| Sale Types (ESTATE/CHARITY/BUSINESS/CORPORATE) | [SIMPLE] | Enum validation + validation matrix (Item #5) |
| Listing Type Schema Validation | [SIMPLE] | Item #5 — backend validation for FIXED/AUCTION/REVERSE_AUCTION/LIVE_DROP/POS enum consistency |
| Sale Map with Geocoding | [SIMPLE] | `/api/geocode` |
| Entrance Pin / Front Door Locator | [SIMPLE] | Item #35 + #38 — shopper convenience, parking + entrance detail on map |
| Sale Calendar View | [SIMPLE] | Organizer + shopper views |
| Item Add / Edit / Delete / Status | [SIMPLE] | Core CRUD |
| Photo Upload (Single + Multi) | [SIMPLE] | `/api/upload` with Cloudinary |
| Rapidfire Camera Mode | [SIMPLE] | Multi-photo AI draft pipeline |
| AI Tag Suggestions + Health Score | [SIMPLE] | Haiku-powered |
| Condition Grading (S/A/B/C/D) | [SIMPLE] | AI + manual override |
| Item Holds / Reservations | [SIMPLE] | `/api/reservations` with expiry |
| Hold Duration Configuration | [SIMPLE] | Per-sale configurable |
| Holds-Only Item View (Batch Ops) | [SIMPLE] | Item #24 — grouped by buyer |
| Sale Checklist | [SIMPLE] | Per-sale custom checklist (undocumented) |
| Email Reminders to Shoppers | [SIMPLE] | `/api/reminders` |
| Push Notification Subscriptions | [SIMPLE] | `/api/push` VAPID |
| Notification Inbox | [SIMPLE] | In-app notification center (undocumented) |
| Organizer Digest Emails | [SIMPLE] | Weekly activity summaries (undocumented) |
| Basic Organizer Profile | [SIMPLE] | businessName, phone, bio, website |
| Organizer Public Profile Page | [SIMPLE] | `/organizers/[slug]` |
| Pickup Scheduling | [SIMPLE] | Organizer slots + shopper booking (undocumented) |
| Sale Waitlist | [SIMPLE] | Shopper join + organizer broadcast (undocumented) |
| Flash Deals | [SIMPLE] | Time-limited price drops (undocumented) |
| Reviews (Receive + View) | [SIMPLE] | Shopper → sale + organizer (undocumented) |
| Contact Form | [SIMPLE] | `/api/contact` |
| Stripe Terminal POS (v2) | [SIMPLE] | Multi-item + cash, 10% fee parity |
| Payout Transparency / Earnings Dashboard | [SIMPLE] | Item-level fee breakdown + PDF |
| Organizer Referral (Fee Bypass) | [SIMPLE] | Item #11 — referralDiscountExpiry |
| Tiers Backend Infrastructure | [SIMPLE] | `/api/tiers` — getMyTier, syncTier (undocumented) |
| Organizer Mode Tiers (Simple/Pro/Teams) | [PRO] | Item #65 — Full tier infrastructure: SubscriptionTier enum (SIMPLE/PRO/TEAMS), tierGate.ts, requireTier middleware, Stripe billing (checkout, webhook, cancel), upgrade/subscription UI, Progressive Disclosure UI (SIMPLE sees 5-button surface, PRO/TEAMS see all features). Sprints 1+2 S177-S178, Sprint 3 S183. useOrganizerTier hook, AuthContext JWT tier extraction. |
| A/B Testing Infrastructure | [SIMPLE] | Internal optimization tool (undocumented) |
| Invites | [SIMPLE] | Invite-to-sale / invite-to-platform (undocumented) |
| Disputes Management | [SIMPLE] | Trust & safety (undocumented) |

### Organizer — Analytics & Intelligence [PRO]

| Feature | Tier | Notes |
|---------|------|-------|
| Seller Performance Dashboard | [PRO] | Per-sale analytics + insights |
| Organizer Insights (Lifetime) | [PRO] | Cross-sale totals + benchmarking |
| Batch Operations Toolkit | [PRO] | Item #8 — bulk price/status/category/tag/photo |
| CSV / JSON / Text Listing Exports | [PRO] | Item #27 Sprint 2 — multi-format output |
| Open Data Export (ZIP) | [PRO] | Item #66 — items/sales/purchases CSV |
| Payout PDF Export | [PRO] | Financial reporting for tax/accounting |
| Organizer Item Library (Consignment Rack) | [PRO] | Item #25 — Upload once, reuse across sales. Cross-sale search, price history, sold vs. unsold analytics. SHIPPED S187. |
| Voice-to-Tag | [PRO] | Item #42 — Organizer speaks item description during Rapidfire → AI transcribes + extracts tags automatically. Hands-free cataloging. SHIPPED S187. |

### Organizer — Marketing & Brand Amplification [SIMPLE/PRO mixed]

| Feature | Tier | Notes |
|---------|------|-------|
| Social Templates (3 tones × 2 platforms) | [SIMPLE] | Item #27 Sprint 2 — Instagram/Facebook copy (brand-spreading) |
| Cloudinary Watermark on Photo Exports | [SIMPLE] | Item #27 Sprint 2 — brand protection (brand-spreading) |
| CSV/JSON Listing Exports (Listing Factory) | [SIMPLE] | Item #27 Sprint 2 — multi-platform sharing (brand-spreading) |
| Brand Kit | [PRO] | Item #31 — colors, logo, socials (auto-propagates). SHIPPED S187 — QA pending. |
| Share Card Factory (OG Tags) | [SIMPLE] | Item #33 + #43 — branded social previews, dynamic OG images via Cloudinary |
| Message Templates | [PRO] | Saved organizer reply templates (undocumented) |
| Hype Meter | [SIMPLE] | Item #34 — real-time social proof |
| Post Performance Analytics | [PRO] | Item #18 — UTM tracking on social template downloads → "your Instagram post got 200 clicks" in organizer dashboard. SHIPPED S187 — QA pending. |
| Dark Mode + Accessibility | [FREE] | Item #63 — Tailwind dark variants (system preference + manual toggle), high-contrast outdoor mode, WCAG 2.1 AA compliant (all ratios passing). useTheme hook (SSR-safe), ThemeToggle component, Appearance settings tab with font size slider (14–20px) + high-contrast toggle. 14 files, 3 phases (S182) |
| Social Proof Notifications | [SIMPLE] | Item #67 — stateless engagement aggregation (favorites, bids, holds) at item + sale level. Backend: socialProofService (aggregation logic), socialProofController (GET endpoints), socialProof route. Frontend: useSocialProof hook (React Query, 30s stale), SocialProofBadge component (compact/full, sage-green). No schema changes (S181) |

### Organizer — Sales Tools & Workflow [SIMPLE/PRO mixed]

| Feature | Tier | Notes |
|---------|------|-------|
| Virtual Queue / Line Management | [SIMPLE] | Item #6 — start/call next/join line + SMS (undocumented). S176 decision: free for all organizers. |
| Sale Reminders (Calendar + Remind Me) | [SIMPLE] | Item #37 — sale alerts for shoppers |
| Neighborhood Heatmap | [SIMPLE] | Item #28 — density-based Leaflet overlay |
| Organizer Reputation Score | [SIMPLE] | Item #71 — 1-5 stars public display (backend deployed S191, frontend pending Sprint 2) |
| Real-Time Status Updates | [PRO] | Item #14 — Organizer mobile widget, SMS/email alerts. SHIPPED S187 — QA pending. |

### Shopper — Discovery & Search [FREE]

| Feature | Tier | Notes |
|---------|------|-------|
| Browse Sales (Homepage + Map) | [FREE] | `/map`, `/` |
| Sale Detail Page | [FREE] | `/sales/[slug]` |
| Item Detail Page | [FREE] | `/items/[id]` |
| Full-Text Search | [FREE] | Advanced filters + location |
| Category Browsing | [FREE] | `/categories` index + `/categories/[slug]` |
| Tag Browsing | [FREE] | `/tags/[slug]` ISR pages |
| Surprise Me / Serendipity Search | [FREE] | `/surprise-me` — random item discovery |
| Sale Calendar (Upcoming) | [FREE] | `/calendar` |
| Neighborhood Heatmap | [FREE] | Item #28 — visual density map |
| City Pages | [FREE] | `/cities` + `/city/[slug]` — city-level browsing (undocumented) |
| Neighborhood Pages | [FREE] | `/neighborhoods/[slug]` — local discovery (undocumented) |
| Trending Items / Sales | [FREE] | `/trending` page + API (undocumented) |
| Activity Feed | [FREE] | `/feed` page + API (undocumented) |
| Route Planning (Multi-Sale) | [FREE] | `/api/routes` — OSRM-based (undocumented) |
| Price History Tracking | [FREE] | `/api/price-history` — price changes over time (undocumented) |
| City Heat Index | [FREE] | Item #49 — City-level "estate sale activity" score — weekly ranking of hottest metro areas. Content marketing magnet + SEO play. Powered by aggregated sale data. SHIPPED S187. |
| Sale Ripples | [FREE] | Item #51 — Smart notification algorithm — "A sale just posted 2 miles from a sale you liked." Proximity + preference signals. Drives spontaneous visits. SHIPPED S187. |

### Shopper — Engagement & Community [FREE]

| Feature | Tier | Notes |
|---------|------|-------|
| Wishlists | [FREE] | Full CRUD, distinct from favorites (undocumented) |
| Saved Searches with notifyOnNew | [FREE] | `/api/saved-searches` — auto-notify on new matches (undocumented) |
| Shopper ↔ Organizer Messaging | [FREE] | `/messages/*` — threaded conversations (undocumented) |
| Buying Pools | [FREE] | `/api/buying-pools` — group buying on items (undocumented) |
| Bounties (Item Requests) | [FREE] | `/api/bounties` — shopper want-ads (undocumented) |
| Reviews (Submit Sale / Organizer) | [FREE] | Via `/api/reviews` |
| User Profile Page | [FREE] | `/profile` |
| Shopper Public Profiles | [FREE] | `/shoppers/[slug]` — collection showcase (undocumented) |
| Favorites | [FREE] | Save items for later |
| Notification Center | [FREE] | `/notifications` page |
| Unsubscribe / Preferences | [FREE] | `/unsubscribe` + `/api/unsubscribe` |
| Weekly Treasure Digest (Email) | [FREE] | Item #36 — MailerLite Sunday 6pm |
| Contact Organizer | [FREE] | Via messaging system |
| Entrance Pin (Location Detail) | [FREE] | Item #35 — parking + entrance info |
| Condition Guide | [FREE] | `/condition-guide` — educational page |
| FAQ / Guide / Terms / Privacy | [FREE] | Legal + help pages |
| Pickup Booking (Schedule Pickup) | [FREE] | Shopper-side of item #24 (undocumented) |
| Shopper Loyalty Passport | [FREE] | Item #29 — Gamified repeat-visit system — stamps, badges, early-access perks. Drives shopper retention. SHIPPED S187. |
| Shopper Wishlist Alerts + Smart Follow | [FREE] | Item #32 — Shoppers set category/tag/organizer preferences → push alerts when matching items list. Foundational for shopper retention and intent data. SHIPPED S187. |
| Digital Receipt + Returns | [FREE] | Item #62 — Auto-generate digital receipt with item photos + prices after every POS transaction. Push to shopper's app profile. Optional organizer-set return window (24h/48h/none). SHIPPED S187. |

### Shopper — Gamification [FREE + HUNT_PASS]

| Feature | Tier | Notes |
|---------|------|-------|
| Points System | [FREE] | 1 pt/visit/day, tier-based (undocumented) |
| Streaks (Visit / Save / Purchase) | [FREE] | Daily streak tracking (undocumented) |
| Treasure Hunt (Daily) | [FREE] | Daily clue + category matching (undocumented) |
| Leaderboard (Shoppers + Organizers) | [FREE] | Public rankings (undocumented) |
| **Hunt Pass ($4.99/30 days)** | **[PAID_ADDON]** | **2× streak multiplier, 30-day recurring subscription, Stripe live billing (undocumented)** |
| Near-Miss Nudges | [FREE] | Item #61 — variable-ratio casino-psychology nudges, 4 types, NudgeBar toast (S181) |
| Unsubscribe-to-Snooze (MailerLite) | [SIMPLE] | Item #23 — intercepts MailerLite unsubscribe webhook, sets 30-day snooze via custom field instead of permanent removal. Backend: snoozeService (snooze/reactivate via MailerLite API), snoozeController (webhook + status/reactivate endpoints), snooze route (/api/snooze/webhook unauthenticated, /api/snooze/status + /api/snooze/reactivate authenticated). No schema changes; uses MailerLite custom fields only (S181). Patrick task: create snooze_until date field in MailerLite dashboard, point webhook to /api/snooze/webhook |

### Platform & AI [FREE/SIMPLE]

| Feature | Tier | Notes |
|---------|------|-------|
| AI Sale Planner Chat | [FREE] | `/plan` page, public (no auth), rate-limited — acquisition tool (undocumented) |
| AI Tag Suggestions (Haiku) | [SIMPLE] | Part of Rapidfire, all tiers |
| AI Condition Grade Suggestions | [SIMPLE] | S/A/B/C/D from photo |
| AI SEO Description Optimization | [SIMPLE] | High-intent search term bias |
| User Impact Scoring in Sentry | [Infrastructure] | Item #21 — correlates errors with user tier, points, hunt pass status; impact_level (HIGH/MEDIUM/LOW) for prioritization. Backend: sentryUserContext middleware enriches Sentry errors. Frontend: useSentryUserContext hook syncs context to browser Sentry. Wired globally (index.ts middleware + _app.tsx SentryUserContextSync component). No schema changes (S181) |
| Shopper Referral Rewards | [FREE] | Item #7 — Referral tracking, rewards distribution, email notifications. SHIPPED S187. |
| Shopper Referral Dashboard | [FREE] | `/referral-dashboard` — referral tracking (undocumented) |
