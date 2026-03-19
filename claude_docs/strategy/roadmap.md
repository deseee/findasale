# ROADMAP – FindA.Sale

**Last Updated:** 2026-03-18 (v55 — Session 202 continued: Comprehensive Chrome verification pass — 50+ routes tested across all user types (public, organizer SIMPLE/PRO/TEAMS, shopper). 1 confirmed 404 fixed: /organizer/neighborhoods nav link (no page file) → redirected to /neighborhoods. All other routes confirmed loading. Data-loading pages (leaderboard, challenges, encyclopedia) load structurally — content depends on seed data/user activity. Auth-gated pages show loading state correctly.)
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
- **Immediate:** Push `useOrganizerTier.ts` fix to unblock Vercel (see push block from S197 QA session)
- Re-QA #19 Passkey end-to-end (register → login → redirect)
- Build #60 Premium Tier Bundle Sprint 2 (billing + workspace management UX)
- Wave 5 Sprint 3: #54 AI Appraisal (Stripe billing + Claude Haiku vision)
- Open Stripe business account (test keys still in production — recurring)
- Waves 2–4 smoke test remaining features with real beta data

### Claude Automated Checks (Recommended)

These checks run at session start or before any deploy:

| Check | Trigger | Tool | Pass Criteria |
|-------|---------|------|---------------|
| TypeScript build | Pre-deploy, post-feature | `next build` in frontend | Zero TS errors |
| Schema alignment | After any API change | findasale-qa | All frontend API calls match backend route signatures |
| Auth pattern | On new frontend file | findasale-qa | No `@findasale/shared`, no `hooks/useAuth`, no `useSession` |
| Tier gate | On new PRO/TEAMS feature | findasale-qa | Backend has `requireTier`, frontend has `canAccess()` guard |
| Nav wiring | After new page added | findasale-qa | Every feature page has ≥1 nav entry point or dashboard link |
| 404 check | Pre-deploy | findasale-ops | All nav links return non-404 |
| Dark mode | On new page | health-scout | Every page has `dark:` Tailwind variants |
| Rate limit | On new mutation endpoint | health-scout | All write endpoints have rateLimiter middleware |
| Import audit | On new file | health-scout | No cross-package imports violating layer contracts |

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

**TIER 1 — IN-PROGRESS / PARTIAL (Sprint work remaining)**
| # | Feature | Tier | Notes |
|---|---------|------|-------|
| 19 | Passkey / WebAuthn Support | [SIMPLE] | [P0 FIX S199] Concurrent challenge race condition fixed (session-based key replaces fixed 'passkey-auth-current'). P0 fix dispatched to findasale-dev S199; merge + end-to-end re-QA pending. Backend backend + frontend login wired. Register → login → redirect flow testing after merge. |
| 51 | Sale Ripples | [FREE] | [COMPLETE S199 SPRINT 1] Schema + API + frontend complete. rippleService (record/summary/trend), rippleController (3 endpoints), ripples.tsx organizer page. RippleIndicator auto-records view events. Neon migration outstanding (Patrick action). |
| 54 | Crowdsourced Appraisal AI | [PAID_ADDON] | Sprint 2 frontend built S197 (AI path placeholder only). Sprint 3 (Stripe billing + Claude Haiku vision integration) deferred. Base appraisal request/response flow complete. |
| 60 | Premium Tier Bundle | [PRO] | [COMPLETE S199 SPRINT 2] useSubscription hook, UsageBar, TierComparisonTable, PremiumCTA, premium.tsx page. Layout.tsx nav wired. Usage stats endpoint stubbed (optional Sprint 3). Tier comparison matrix + upgrade CTA working. |


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


### Organizer — Core Operations [SIMPLE]

| # | Feature | Role | Tier | Shipped | DB | API | UI | QA | Chrome | Nav | Human | Notes |
|---|---------|------|------|---------|----|----|----|----|--------|-----|-------|-------|
| — | Create / Edit / Publish / Archive Sales | ORG | SIMPLE | Ph.1 | ✅ | ✅ | ✅ | 📋PEND | 📋 | ✅ | 📋 | Core workflow |
| — | Sale Types (ESTATE/CHARITY/BUSINESS/CORPORATE) | ORG | SIMPLE | Ph.1 | ✅ | ✅ | ✅ | 📋PEND | 📋 | — | 📋 | Enum validation + validation matrix (Item #5) |
| 5 | Listing Type Schema Validation | ORG | SIMPLE | Ph.1 | ✅ | ✅ | ✅ | 📋PEND | 📋 | — | 📋 | Backend validation for FIXED/AUCTION/REVERSE_AUCTION/LIVE_DROP/POS |
| — | Sale Map with Geocoding | ORG | SIMPLE | Ph.2 | ✅ | ✅ | ✅ | 📋PEND | 📋 | ✅ | 📋 | `/api/geocode` |
| 35 | Entrance Pin / Front Door Locator | BOTH | SIMPLE | Ph.3 | ✅ | ✅ | ✅ | 📋PEND | 📋 | ✅ | 📋 | Shopper convenience, parking + entrance detail |
| — | Sale Calendar View | BOTH | SIMPLE | Ph.1 | ✅ | ✅ | ✅ | 📋PEND | 📋 | ✅ | 📋 | Organizer + shopper views |
| — | Item Add / Edit / Delete / Status | ORG | SIMPLE | Ph.1 | ✅ | ✅ | ✅ | ✅S126 | ✅S125 | ✅ | 📋 | Core CRUD |
| — | Photo Upload (Single + Multi) | ORG | SIMPLE | Ph.1 | ✅ | ✅ | ✅ | 📋PEND | 📋 | — | 📋 | `/api/upload` with Cloudinary |
| — | Rapidfire Camera Mode | ORG | SIMPLE | Ph.8 | ✅ | ✅ | ✅ | 📋PEND | 📋 | ✅ | 📋 | Multi-photo AI draft pipeline |
| — | AI Tag Suggestions + Health Score | ORG | SIMPLE | Ph.8 | ✅ | ✅ | ✅ | ✅S124 | ✅S124 | ✅ | 📋 | Haiku-powered, part of intake |
| — | Condition Grading (S/A/B/C/D) | ORG | SIMPLE | Ph.8 | ✅ | ✅ | ✅ | 📋PEND | 📋 | — | 📋 | AI + manual override |
| — | Item Holds / Reservations | BOTH | SIMPLE | Ph.3 | ✅ | ✅ | ✅ | 📋PEND | 📋 | — | 📋 | `/api/reservations` with expiry |
| — | Hold Duration Configuration | ORG | SIMPLE | Ph.3 | ✅ | ✅ | ✅ | 📋PEND | 📋 | ✅ | 📋 | Per-sale configurable |
| 24 | Holds-Only Item View (Batch Ops) | ORG | SIMPLE | Ph.6 | ✅ | ✅ | ✅ | 📋PEND | 📋 | ✅ | 📋 | Grouped by buyer |
| — | Sale Checklist | ORG | SIMPLE | Ph.7 | ✅ | ✅ | ✅ | 📋PEND | 📋 | — | 📋 | Per-sale custom checklist |
| — | Email Reminders to Shoppers | ORG | SIMPLE | Ph.4 | ✅ | ✅ | ✅ | 📋PEND | 📋 | — | 📋 | `/api/reminders` |
| — | Push Notification Subscriptions | BOTH | SIMPLE | Ph.4 | ✅ | ✅ | ✅ | 📋PEND | 📋 | — | 📋 | `/api/push` VAPID |
| — | Notification Inbox | BOTH | SIMPLE | Ph.5 | ✅ | ✅ | ✅ | 📋PEND | 📋 | ✅ | 📋 | In-app notification center |
| — | Organizer Digest Emails | ORG | SIMPLE | Ph.9 | ✅ | ✅ | ✅ | 📋PEND | 📋 | — | 📋 | Weekly activity summaries |
| — | Basic Organizer Profile | ORG | SIMPLE | Ph.2 | ✅ | ✅ | ✅ | 📋PEND | 📋 | — | 📋 | businessName, phone, bio, website |
| — | Organizer Public Profile Page | ORG | SIMPLE | Ph.3 | ✅ | ✅ | ✅ | 📋PEND | 📋 | ✅ | 📋 | `/organizers/[slug]` |
| — | Password Reset Flow | ORG | SIMPLE | Ph.5 | ✅ | ✅ | ✅ | 📋PEND | 📋 | — | 📋 | Email-based password recovery |
| — | Refund Policy Configuration | ORG | SIMPLE | Ph.6 | ✅ | ✅ | ✅ | 📋PEND | 📋 | ✅ | 📋 | Per-organizer configurable refund window |
| — | Pickup Scheduling | BOTH | SIMPLE | Ph.7 | ✅ | ✅ | ✅ | 📋PEND | 📋 | — | 📋 | Organizer slots + shopper booking |
| — | Sale Waitlist | BOTH | SIMPLE | Ph.7 | ✅ | ✅ | ✅ | 📋PEND | 📋 | — | 📋 | Shopper join + organizer broadcast |
| — | Flash Deals | ORG | SIMPLE | Ph.7 | ✅ | ✅ | ✅ | 📋PEND | 📋 | — | 📋 | Time-limited price drops |
| — | Reviews (Receive + View) | BOTH | SIMPLE | Ph.5 | ✅ | ✅ | ✅ | 📋PEND | 📋 | — | 📋 | Shopper → sale + organizer |
| — | Contact Form | PUB | SIMPLE | Ph.2 | ✅ | ✅ | ✅ | 📋PEND | 📋 | — | 📋 | `/api/contact` |
| — | Stripe Terminal POS (v2) | ORG | SIMPLE | Ph.11 | ✅ | ✅ | ✅ | 📋PEND | 📋 | ✅ | 📋 | Multi-item + cash, 10% fee parity |
| — | Payout Transparency / Earnings Dashboard | ORG | SIMPLE | Ph.9 | ✅ | ✅ | ✅ | 📋PEND | 📋 | ✅ | 📋 | Item-level fee breakdown + PDF |
| 11 | Organizer Referral (Fee Bypass) | ORG | SIMPLE | Ph.6 | ✅ | ✅ | ✅ | 📋PEND | 📋 | — | 📋 | referralDiscountExpiry |
| — | Tiers Backend Infrastructure | ORG | SIMPLE | Ph.10 | ✅ | ✅ | ✅ | 📋PEND | 📋 | — | 📋 | `/api/tiers` — getMyTier, syncTier |
| 65 | Organizer Mode Tiers (Simple/Pro/Teams) | ORG | PRO | S183 | ✅ | ✅ | ✅ | ⚠️S201 | 📋 | ✅ | 📋 | Full infrastructure: SubscriptionTier enum, tierGate.ts, requireTier, Stripe billing, Progressive Disclosure UI. **S201: Flagged for spec clarification — no feature file found.** |
| 71 | Organizer Reputation Score | ORG | SIMPLE | S196 | ✅ | ✅ | ✅ | ✅S201 | ✅S202 | ✅ | 📋 | 1-5 star public score + reputation.tsx frontend. QA re-confirmed S201, human-ready. |
| 22 | Low-Bandwidth Mode (PWA) | BOTH | SIMPLE | S196 | — | ✅ | ✅ | ✅S201 | ✅S202 | ✅ | 📋 | Network API detection, localStorage, LowBandwidthContext. QA re-confirmed S201, human-ready. |
| 19 | Passkey / WebAuthn Login | ORG | SIMPLE | S190 | ✅ | ✅ | ✅ | 🔧S199 | 📋 | ⚠️ | 📋 | P0 concurrent challenge race fixed S199 (session-based key). End-to-end re-QA + merge pending. |
| — | A/B Testing Infrastructure | ORG | SIMPLE | Ph.8 | ✅ | ✅ | ✅ | 📋PEND | 📋 | — | 📋 | Internal optimization tool |
| — | Invites | ORG | SIMPLE | Ph.5 | ✅ | ✅ | ✅ | 📋PEND | 📋 | — | 📋 | Invite-to-sale / invite-to-platform |
| — | Disputes Management | BOTH | SIMPLE | Ph.9 | ✅ | ✅ | ✅ | 📋PEND | 📋 | ✅ | 📋 | Trust & safety |

### Organizer — Analytics & Intelligence [PRO]

| # | Feature | Role | Tier | Shipped | DB | API | UI | QA | Chrome | Nav | Human | Notes |
|---|---------|------|------|---------|----|----|----|----|--------|-----|-------|-------|
| — | Seller Performance Dashboard | ORG | PRO | Ph.9 | ✅ | ✅ | ✅ | 📋PEND | 📋 | ✅ | 📋 | Per-sale analytics + insights |
| — | Organizer Insights (Lifetime) | ORG | PRO | Ph.10 | ✅ | ✅ | ✅ | 📋PEND | 📋 | ✅ | 📋 | Cross-sale totals + benchmarking |
| 8 | Batch Operations Toolkit | ORG | PRO | Ph.6 | ✅ | ✅ | ✅ | 📋PEND | 📋 | ✅ | 📋 | Bulk price/status/category/tag/photo |
| — | CSV Listing Import | ORG | SIMPLE | Ph.2 | ✅ | ✅ | ✅ | 📋PEND | 📋 | — | 📋 | Bulk upload item lists from CSV |
| 27 | CSV / JSON / Text Listing Exports | ORG | PRO | S187 | ✅ | ✅ | ✅ | 📋PEND | 📋 | ✅ | 📋 | Multi-format output (Listing Factory) |
| 66 | Open Data Export (ZIP) | ORG | PRO | Ph.13 | ✅ | ✅ | ✅ | 📋PEND | 📋 | ✅ | 📋 | Items/sales/purchases CSV |
| — | Payout PDF Export | ORG | PRO | Ph.9 | ✅ | ✅ | ✅ | 📋PEND | 📋 | — | 📋 | Financial reporting for tax/accounting |
| — | Stripe Connect Setup | ORG | SIMPLE | Ph.2 | ✅ | ✅ | ✅ | 📋PEND | 📋 | — | 📋 | Payout bank account linking + verification |
| 25 | Organizer Item Library (Consignment Rack) | ORG | PRO | S187 | ✅ | ✅ | ✅ | ✅S195 | ✅S202 | ✅ | 📋 | Upload once, reuse; cross-sale search, price history |
| 42 | Voice-to-Tag | ORG | PRO | S199 | — | ✅ | ✅ | ✅S201 | ✅S202 | — | 📋 | VoiceTagButton.tsx + useVoiceTag.ts complete. Web Speech API integration. Ready for add-items page. QA re-confirmed S201, human-ready. |
| 18 | Post Performance Analytics | ORG | PRO | S187 | ✅ | ✅ | ✅ | ✅S201 | ✅S202 | ✅ | 📋 | UTM tracking on social template downloads. QA re-confirmed S201, human-ready. |
| 41 | Flip Report | ORG | PRO | S189 | ✅ | ✅ | ✅ | ✅S195 | ✅S202 | ✅ | 📋 | Item resale potential scoring |
| 17 | Bid Bot Detector + Fraud Score | ORG | PRO | S190 | ✅ | ✅ | ✅ | ✅S201 | ✅S202 | ✅ | 📋 | FraudBadge on holds page, fraud-signals.tsx. QA re-confirmed S201, human-ready. |
| 13 | TEAMS Workspace | ORG | TEAMS | S190 | ✅ | ✅ | ✅ | ✅S195 | ✅S194 | ✅ | 📋 | Multi-user workspace, role management |
| 68 | Command Center Dashboard | ORG | PRO | S183 | ✅ | ✅ | ✅ | ✅S201 | ✅S202 | ✅ | 📋 | Per-sale widget dashboard. QA re-confirmed S201, human-ready. |

### Organizer — Marketing & Brand Amplification [SIMPLE/PRO mixed]

| # | Feature | Role | Tier | Shipped | DB | API | UI | QA | Chrome | Nav | Human | Notes |
|---|---------|------|------|---------|----|----|----|----|--------|-----|-------|-------|
| 27 | Social Templates (3 tones × 2 platforms) | ORG | SIMPLE | Ph.12 | — | ✅ | ✅ | 📋PEND | 📋 | — | 📋 | Instagram/Facebook copy (brand-spreading) |
| 27 | Cloudinary Watermark on Photo Exports | ORG | SIMPLE | Ph.12 | — | ✅ | ✅ | 📋PEND | 📋 | — | 📋 | Brand protection (brand-spreading) |
| 27 | CSV/JSON Listing Exports (Listing Factory) | ORG | SIMPLE | Ph.12 | — | ✅ | ✅ | 📋PEND | 📋 | — | 📋 | Multi-platform sharing (brand-spreading) |
| 31 | Brand Kit | ORG | PRO | S187 | ✅ | ✅ | ✅ | ✅S195 | 📋 | ✅ | 📋 | Colors, logo, socials (auto-propagates) |
| 33 | Share Card Factory (OG Tags) | ORG | SIMPLE | Ph.10 | — | ✅ | ✅ | 📋PEND | 📋 | — | 📋 | Branded social previews, dynamic OG images |
| — | Message Templates | ORG | PRO | Ph.9 | ✅ | ✅ | ✅ | 📋PEND | 📋 | — | 📋 | Saved organizer reply templates |
| 34 | Hype Meter | ORG | SIMPLE | Ph.11 | — | ✅ | ✅ | 📋PEND | 📋 | — | 📋 | Real-time social proof |
| 18 | Post Performance Analytics | ORG | PRO | S187 | ✅ | ✅ | ✅ | ✅S201 | 📋 | ✅ | 📋 | Social template download UTM tracking. QA re-confirmed S201. |
| 63 | Dark Mode + Accessibility | BOTH | FREE | S182 | — | ✅ | ✅ | ✅S195 | 📋 | — | 📋 | Tailwind dark variants, WCAG 2.1 AA, high-contrast outdoor mode |
| 67 | Social Proof Notifications | BOTH | SIMPLE | S181 | — | ✅ | ✅ | 📋PEND | 📋 | — | 📋 | Engagement aggregation (favorites, bids, holds) |

### Organizer — Sales Tools & Workflow [SIMPLE/PRO mixed]

| # | Feature | Role | Tier | Shipped | DB | API | UI | QA | Chrome | Nav | Human | Notes |
|---|---------|------|------|---------|----|----|----|----|--------|-----|-------|-------|
| 6 | Virtual Queue / Line Management | ORG | SIMPLE | Ph.5 | ✅ | ✅ | ✅ | 📋PEND | 📋 | — | 📋 | Start/call next/join line + SMS; free for all |
| — | Auction Mechanics | ORG | SIMPLE | Ph.12 | ✅ | ✅ | ✅ | 📋PEND | 📋 | — | 📋 | Countdown timer, bid modal, auto-bid, cron closing |
| 37 | Sale Reminders (Calendar + Remind Me) | SHO | SIMPLE | Ph.8 | ✅ | ✅ | ✅ | 📋PEND | 📋 | — | 📋 | Sale alerts for shoppers |
| 28 | Neighborhood Heatmap | BOTH | SIMPLE | Ph.11 | ✅ | ✅ | ✅ | 📋PEND | 📋 | ✅ | 📋 | Density-based Leaflet overlay |
| 14 | Real-Time Status Updates | BOTH | PRO | S187 | ✅ | ✅ | ✅ | ✅S201 | ✅S202 | — | 📋 | Organizer widget, SMS/email alerts, SaleStatusWidget. QA re-confirmed S201, human-ready. |
| 20 | Proactive Degradation Mode | BOTH | PRO | S190 | — | ✅ | ✅ | ✅S201 | ✅S202 | — | 📋 | DegradationBanner + middleware for offline. QA re-confirmed S201, human-ready. |
| 30 | AI Item Valuation & Comparables | ORG | PRO | S190 | ✅ | ✅ | ✅ | ✅S195 | ✅S202 | ✅ | 📋 | ValuationWidget (PRO-gated) on add-items page |
| 39 | Photo Op Stations | ORG | PRO | S190 | ✅ | ✅ | ✅ | ✅S195 | 📋 | ✅ | 📋 | PhotoOpMarker on map, rate-limited |
| 40 | Sale Hubs | ORG | PRO | S190 | ✅ | ✅ | ✅ | ✅S195 | 📋 | ✅ | 📋 | Hub pages + membership UI |
| 16 | Verified Organizer Badge | ORG | PRO | S189 | ✅ | ✅ | ✅ | ✅S195 | 📋 | — | 📋 | VerifiedBadge on sales detail + SaleCard |

### Shopper — Discovery & Search [FREE]

| # | Feature | Role | Tier | Shipped | DB | API | UI | QA | Chrome | Nav | Human | Notes |
|---|---------|------|------|---------|----|----|----|----|--------|-----|-------|-------|
| — | Browse Sales (Homepage + Map) | SHO | FREE | Ph.1 | ✅ | ✅ | ✅ | 📋PEND | 📋 | ✅ | 📋 | `/map`, `/` |
| — | Sale Detail Page | SHO | FREE | Ph.1 | ✅ | ✅ | ✅ | 📋PEND | 📋 | — | 📋 | `/sales/[slug]` |
| — | Item Detail Page | SHO | FREE | Ph.1 | ✅ | ✅ | ✅ | 📋PEND | 📋 | — | 📋 | `/items/[id]` |
| — | Full-Text Search | SHO | FREE | Ph.3 | ✅ | ✅ | ✅ | 📋PEND | 📋 | ✅ | 📋 | Advanced filters + location |
| — | Category Browsing | SHO | FREE | Ph.2 | ✅ | ✅ | ✅ | 📋PEND | 📋 | ✅ | 📋 | `/categories` index + `/categories/[slug]` |
| — | Tag Browsing | SHO | FREE | Ph.4 | ✅ | ✅ | ✅ | 📋PEND | 📋 | ✅ | 📋 | `/tags/[slug]` ISR pages |
| — | Surprise Me / Serendipity Search | SHO | FREE | Ph.5 | ✅ | ✅ | ✅ | 📋PEND | 📋 | — | 📋 | `/surprise-me` random discovery |
| — | Sale Calendar (Upcoming) | SHO | FREE | Ph.4 | ✅ | ✅ | ✅ | 📋PEND | 📋 | — | 📋 | `/calendar` |
| — | iCal / Calendar Export | SHO | SIMPLE | Ph.10 | ✅ | ✅ | ✅ | 📋PEND | 📋 | — | 📋 | Download .ics file for sales + items |
| — | QR Code Signs (Yard + Item Labels) | ORG | SIMPLE | Ph.10 | ✅ | ✅ | ✅ | 📋PEND | 📋 | — | 📋 | Printable QR codes linking to sales/items |
| — | QR Scan Analytics | ORG | SIMPLE | Ph.10 | ✅ | ✅ | ✅ | 📋PEND | 📋 | — | 📋 | Tracking + insights on QR scans |
| 28 | Neighborhood Heatmap | BOTH | SIMPLE | Ph.11 | ✅ | ✅ | ✅ | 📋PEND | 📋 | ✅ | 📋 | Visual density map |
| — | City Pages | SHO | FREE | Ph.12 | ✅ | ✅ | ✅ | 📋PEND | 📋 | — | 📋 | `/cities` + `/city/[slug]` city-level browsing |
| — | Neighborhood Pages | SHO | FREE | Ph.13 | ✅ | ✅ | ✅ | 📋PEND | 📋 | — | 📋 | `/neighborhoods/[slug]` local discovery |
| — | Trending Items / Sales | SHO | FREE | Ph.12 | ✅ | ✅ | ✅ | ✅S194 | ✅S194 | — | 📋 | `/trending` page + API |
| — | Activity Feed | SHO | FREE | Ph.12 | ✅ | ✅ | ✅ | ✅S194 | ✅S194 | — | 📋 | `/feed` page + API |
| — | Route Planning (Multi-Sale) | SHO | FREE | Ph.11 | ✅ | ✅ | ✅ | 📋PEND | 📋 | — | 📋 | `/api/routes` OSRM-based |
| — | Price History Tracking | SHO | FREE | Ph.11 | ✅ | ✅ | ✅ | 📋PEND | 📋 | — | 📋 | `/api/price-history` price trends |
| 49 | City Heat Index | SHO | FREE | S187 | ⚠️ | ✅ | ⚠️ | ✅S195 | ✅S194 | ✅ | 📋 | Weekly "hottest metro" ranking; aggregated sale data |

### Shopper — Engagement & Community [FREE]

| # | Feature | Role | Tier | Shipped | DB | API | UI | QA | Chrome | Nav | Human | Notes |
|---|---------|------|------|---------|----|----|----|----|--------|-----|-------|-------|
| — | Wishlists | SHO | FREE | Ph.5 | ✅ | ✅ | ✅ | 📋PEND | 📋 | — | 📋 | Full CRUD, distinct from favorites |
| — | Saved Searches with notifyOnNew | SHO | FREE | Ph.6 | ✅ | ✅ | ✅ | 📋PEND | 📋 | — | 📋 | Auto-notify on new matches |
| — | Shopper ↔ Organizer Messaging | BOTH | FREE | Ph.5 | ✅ | ✅ | ✅ | 📋PEND | 📋 | — | 📋 | Threaded conversations |
| — | Buying Pools | SHO | FREE | Ph.6 | ✅ | ✅ | ✅ | 📋PEND | 📋 | — | 📋 | Group buying on items |
| — | Bounties (Item Requests) | SHO | FREE | Ph.8 | ✅ | ✅ | ✅ | ✅S194 | 📋 | ✅ | 📋 | Shopper want-ads |
| — | Reviews (Submit Sale / Organizer) | SHO | FREE | Ph.5 | ✅ | ✅ | ✅ | 📋PEND | 📋 | — | 📋 | Via `/api/reviews` |
| — | User Profile Page | SHO | FREE | Ph.5 | ✅ | ✅ | ✅ | 📋PEND | 📋 | — | 📋 | `/profile` |
| — | Shopper Public Profiles | SHO | FREE | Ph.11 | ✅ | ✅ | ✅ | 📋PEND | 📋 | — | 📋 | `/shoppers/[slug]` collection showcase |
| — | Favorites | SHO | FREE | Ph.1 | ✅ | ✅ | ✅ | 📋PEND | 📋 | — | 📋 | Save items for later |
| — | Notification Center | SHO | FREE | Ph.5 | ✅ | ✅ | ✅ | 📋PEND | 📋 | — | 📋 | `/notifications` page |
| — | Email + SMS Validation (Twilio) | BOTH | SIMPLE | Ph.8 | ✅ | ✅ | ✅ | 📋PEND | 📋 | — | 📋 | Phone number verification via SMS |
| — | Unsubscribe / Preferences | SHO | FREE | Ph.5 | ✅ | ✅ | ✅ | 📋PEND | 📋 | — | 📋 | `/unsubscribe` + `/api/unsubscribe` |
| 36 | Weekly Treasure Digest (Email) | SHO | FREE | Ph.8 | ✅ | ✅ | ✅ | 📋PEND | 📋 | — | 📋 | MailerLite Sunday 6pm |
| — | Contact Organizer | SHO | FREE | Ph.5 | ✅ | ✅ | ✅ | 📋PEND | 📋 | — | 📋 | Via messaging system |
| 35 | Entrance Pin (Location Detail) | SHO | SIMPLE | Ph.3 | ✅ | ✅ | ✅ | 📋PEND | 📋 | — | 📋 | Parking + entrance info on map |
| — | Condition Guide | SHO | FREE | Ph.2 | ✅ | ✅ | ✅ | 📋PEND | 📋 | — | 📋 | `/condition-guide` educational page |
| — | FAQ / Guide / Terms / Privacy | PUB | FREE | Ph.1 | ✅ | ✅ | ✅ | 📋PEND | 📋 | — | 📋 | Legal + help pages |
| — | Pickup Booking (Schedule Pickup) | SHO | FREE | Ph.7 | ✅ | ✅ | ✅ | 📋PEND | 📋 | — | 📋 | Shopper-side scheduling |
| 29 | Shopper Loyalty Passport | SHO | FREE | S187 | ✅ | ✅ | ✅ | ✅S195 | ✅S202 | ✅ | 📋 | Stamps, badges, early-access perks |
| 32 | Shopper Wishlist Alerts + Smart Follow | SHO | FREE | S187 | ✅ | ✅ | ✅ | ✅S195 | ✅S202 | ✅ | 📋 | Category/tag/organizer alerts on new items |
| 62 | Digital Receipt + Returns | SHO | FREE | S187 | ✅ | ✅ | ✅ | ✅S201 | ✅S202 | ✅ | 📋 | Auto-generated receipt post-POS, return window. QA re-confirmed S201, human-ready. |
| 45 | Collector Passport | SHO | FREE | S189 | ✅ | ✅ | ✅ | ✅S195 | ✅S202 | ✅ | 📋 | Specialty collection tracking + achievement path |
| 50 | Loot Log | SHO | FREE | S189 | ✅ | ✅ | ✅ | ✅S195 | ✅S202 | ✅ | 📋 | Personal purchase history with photos + prices |

### Shopper — Gamification [FREE + HUNT_PASS]

| # | Feature | Role | Tier | Shipped | DB | API | UI | QA | Chrome | Nav | Human | Notes |
|---|---------|------|------|---------|----|----|----|----|--------|-----|-------|-------|
| — | Points System | SHO | FREE | Ph.9 | ✅ | ✅ | ✅ | 📋PEND | 📋 | — | 📋 | 1 pt/visit/day, tier-based |
| — | Streaks (Visit / Save / Purchase) | SHO | FREE | Ph.9 | ✅ | ✅ | ✅ | 📋PEND | 📋 | — | 📋 | Daily streak tracking |
| — | Treasure Hunt (Daily) | SHO | FREE | Ph.10 | ✅ | ✅ | ✅ | 📋PEND | 📋 | — | 📋 | Daily clue + category matching |
| — | Leaderboard (Shoppers + Organizers) | SHO | FREE | Ph.10 | ✅ | ✅ | ✅ | 📋PEND | 📋 | — | 📋 | Public rankings |
| — | **Hunt Pass ($4.99/30 days)** | SHO | **PAID_ADDON** | Ph.11 | ✅ | ✅ | ✅ | 📋PEND | 📋 | — | 📋 | **2× streak multiplier, recurring Stripe billing** |
| 61 | Near-Miss Nudges | SHO | FREE | S181 | — | ✅ | ✅ | 📋PEND | 📋 | — | 📋 | Variable-ratio casino psychology; 4 types |
| 23 | Unsubscribe-to-Snooze (MailerLite) | SHO | SIMPLE | S181 | — | ✅ | ✅ | 📋PEND | 📋 | — | 📋 | Intercept unsubscribe → 30-day snooze via MailerLite custom fields |
| 59 | Streak Rewards | SHO | FREE | S190 | ✅ | ✅ | ✅ | ✅S195 | 📋 | ✅ | 📋 | Visit/save/purchase streaks wired to Layout |
| 58 | Achievement Badges | SHO | FREE | S190 | ✅ | ✅ | ✅ | ✅S195 | 📋 | ✅ | 📋 | `/shopper/achievements` page |
| 57 | Shiny / Rare Item Badges | SHO | FREE | S190 | ✅ | ✅ | ✅ | ✅S195 | 📋 | — | 📋 | RarityBadge wired to item cards |
| 48 | Treasure Trail Route Builder | SHO | FREE | S190 | ✅ | ✅ | ✅ | ✅S195 | 📋 | ✅ | 📋 | Trail pages + share token, multi-sale routing |
| 55 | Seasonal Discovery Challenges | SHO | FREE | S189 | ✅ | ✅ | ✅ | ✅S195 | 📋 | — | 📋 | Rotating challenges by season/category |

### Wave 5 — Advanced Intelligence Features [PRO/FREE/PAID_ADDON]

| # | Feature | Role | Tier | Shipped | DB | API | UI | QA | Chrome | Nav | Human | Notes |
|---|---------|------|------|---------|----|----|----|----|--------|-----|-------|-------|
| 46 | Treasure Typology Classifier | ORG | PRO | S191 | ✅ | ✅ | ✅ | ✅S201 | ✅S202 | ✅ | 📋 | AI item classification; useTypology.ts, TypologyBadge.tsx. QA re-confirmed S201, human-ready. |
| 51 | Sale Ripples | SHO | FREE | S199 | ✅ | ✅ | ✅ | ✅S202 | ✅S202 | ✅ | 📋 | Social proof activity tracking. RippleIndicator auto-records. ripples.tsx analytics. P1 fix applied S202. **Neon migration pending.** Human-ready after migration. |
| 52 | Estate Sale Encyclopedia | SHO | FREE | S191 | ✅ | ✅ | ✅ | ✅S196 | ✅S202 | ✅ | 📋 | Wiki-style knowledge base; EncyclopediaCard.tsx. Content loading confirmed S202. |
| 54 | Crowdsourced Appraisal (Base) | BOTH | FREE | S191 | ✅ | ✅ | ✅ | ✅S197 | ✅S202 | ✅ | 📋 | Request/submit/vote appraisals; AI Sprint 3 deferred |
| 60 | Premium Tier Bundle | ORG | PRO | S199 | ✅ | ✅ | ✅ | ✅S202 | ✅S202 | ✅ | 📋 | Tier landing page + comparison matrix + upgrade CTA. Sprint 2 frontend complete. P1 fix applied S202. Human-ready. |
| 69 | Local-First Offline Mode | BOTH | PRO | S191 | — | ✅ | ✅ | ✅S197 | ✅S202 | ✅ | 📋 | Service worker sync queue; offline catalog |
| 70 | Live Sale Feed | SHO | SIMPLE | S185 | ✅ | ✅ | ✅ | 📋 | 📋 | — | 📋 | Real-time sale activity feed |
| 47 | UGC Photo Tags | SHO | FREE | S189 | ✅ | ✅ | ✅ | ✅S195 | 📋 | ✅ | 📋 | Shopper-submitted item photos + moderation |
| 7 | Shopper Referral Rewards | SHO | FREE | S187 | ✅ | ✅ | ✅ | ✅S201 | 📋 | ✅ | 📋 | Referral tracking + rewards distribution. QA re-confirmed S201, human-ready. |

### Platform & AI [FREE/SIMPLE]

| # | Feature | Role | Tier | Shipped | DB | API | UI | QA | Chrome | Nav | Human | Notes |
|---|---------|------|------|---------|----|----|----|----|--------|-----|-------|-------|
| — | AI Sale Planner Chat | PUB | FREE | Ph.12 | ✅ | ✅ | ✅ | 📋PEND | 📋 | — | 📋 | `/plan` page, public rate-limited acquisition tool |
| — | AI Tag Suggestions (Haiku) | ORG | SIMPLE | Ph.8 | ✅ | ✅ | ✅ | 📋PEND | 📋 | — | 📋 | Part of Rapidfire, all tiers |
| — | AI Condition Grade Suggestions | ORG | SIMPLE | Ph.8 | ✅ | ✅ | ✅ | 📋PEND | 📋 | — | 📋 | S/A/B/C/D from photo |
| — | AI SEO Description Optimization | ORG | SIMPLE | Ph.8 | ✅ | ✅ | ✅ | 📋PEND | 📋 | — | 📋 | High-intent search term bias |
| 21 | User Impact Scoring in Sentry | BOTH | FREE | S181 | — | ✅ | ✅ | 📋PEND | 📋 | — | 📋 | Error prioritization by tier/points/hunt-pass status |
