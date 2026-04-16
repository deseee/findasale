# PROJECT STATE

Compression anchor. Active state only.
Historical detail: `claude_docs/COMPLETED_PHASES.md`

---

## Current Work

**S487 (2026-04-16) — Schema additions + admin page (Soon) removal + Chrome QA of 5 admin pages**

- **Schema additions ✅:** 4 new Prisma models added to schema.prisma (FeatureFlag, PwaEvent, OrganizerScore, ApiUsageLog). OrganizerScore back-reference added to Organizer model. Migration SQL written at `packages/database/prisma/migrations/20260416_admin_tables/migration.sql`. **Patrick must run migrate deploy manually.**
- **(Soon) labels removed ✅:** Removed 4 `(Soon)` span labels from mobile admin nav in `Layout.tsx` and 4 from avatar dropdown in `AvatarDropdown.tsx` — Items, Reports, Feature Flags, Broadcast are now live pages.
- **Organizer_Acquisition_Playbook.md language fixes ✅:** Two targeted copy fixes — EstateSales.NET callback now includes yard sales/auctions/flea markets/consignment; Thrifting Vegas description broadened.
- **Chrome QA — /admin/items ✅:** Page renders with real data, search filter works (typed "Guitar" → only guitar items). Real thumbnails. No app errors.
- **Chrome QA — /admin/broadcast ✅:** Page renders with Audience dropdown (103 users), Subject, Body, character counter, Clear + Send Broadcast buttons. No app errors.
- **Chrome QA — /admin/feature-flags ❌ P1:** Red "Failed to load feature flags" error. Backend API returns 404 — no backend route was implemented for feature flags in S483 (frontend only). Backend CRUD needed before this page works.
- **reports.tsx crash fix ✅:** Line 214 `revenue?.byDay.length` → `revenue?.byDay?.length` (added optional chain to `.length`). Fixes TypeError on initial render when revenue is null. NOT YET DEPLOYED — needs push + Vercel build.
- **Chrome QA — /admin/reports UNVERIFIED:** Crash fix applied but not deployed. Will need re-verify after Vercel deploys. /admin (KPI dashboard) ✅ was verified in session pre-compaction.

**S487 Files changed (6):**
- `packages/database/prisma/schema.prisma` — 4 new models + OrganizerScore back-ref on Organizer
- `packages/database/prisma/migrations/20260416_admin_tables/migration.sql` (NEW) — CREATE TABLE for FeatureFlag, PwaEvent, OrganizerScore, ApiUsageLog
- `packages/frontend/components/Layout.tsx` — 4 `(Soon)` spans removed (Items, Reports, Feature Flags, Broadcast)
- `packages/frontend/components/AvatarDropdown.tsx` — 4 `(Soon)` spans removed
- `packages/frontend/pages/admin/reports.tsx` — line 214: `revenue?.byDay.length` → `revenue?.byDay?.length`
- `Organizer_Acquisition_Playbook.md` — EstateSales.NET callback + Thrifting Vegas language broadened

---

**S486 (2026-04-16) — Video polish pass 2 + landing page strip + meta tags**

- **Video polished (organizer-video-ad.html) ✅:** Second full iteration pass on the 38s animated video.
  - Scene 2 camera lamp enlarged (`.lamp-svg-cam` 76→140px, `.cam-subject` 90→160px with amber frame).
  - Scene 2 review screen: added `height: 100%` + `box-sizing: border-box` so flex actually distributes, photo 130→190px, gap 10→14px, symmetric padding.
  - Scene 2 success screen: same `height: 100%` fix + symmetric padding 48/48, ring 96px, title 22px.
  - Scene 3 payments row: mini-phones 160px, beam min-width 44px, padding 4px — fits in 382px without squish.
  - Font bump across all 5 scenes: headlines +4–8px, bullets 16→20px, CTA logo 42→52px, CTA main 52→60px, CTA URL 18→24px, eBay push button 16→20px.
- **Landing page stripped (finda-sale-landing.html) ✅:** Removed hero H1+subtitle, 3 feature cards, testimonial, 3 FAQ rows, "Two sides. One app." eyebrow. Kept: logo, video, "Built for organizers. Loved by shoppers." + split, Free Forever offer, 2 FAQs, CTA, footer.
- **SEO meta tags added ✅:** Canonical URL, Open Graph (og:title/description/url/image/site_name), Twitter cards, theme-color (#D97706), keywords, author, robots, favicon/apple-touch-icon refs, JSON-LD SoftwareApplication structured data with Offer + Audience.

- **Pipeline wiring ✅:** Landing deployed at `finda.sale/video` via Next.js rewrite (`next.config.js` rewrites: `/video` → `/video.html`). Canonical + og:url + twitter:url + JSON-LD url all updated to `https://finda.sale/video`. Uses existing icon system (`/icons/favicon-32x32.png`, `/icons/apple-touch-icon.png`, `/favicon.ico`). Fixed pre-existing broken `og:image` refs in `trending.tsx` + `map.tsx` by adding `og-default.png` (1200×630).
- **Post-deploy fixes (Patrick reported blank iframe + width overflow) ✅:**
  - CSP `frame-src` in `next.config.js` line 203 was missing `'self'` — same-origin iframe was being blocked by CSP, leaving the phone frame empty. Added `'self'` so `/video` can embed `/organizer-video-ad.html`.
  - `.video-wrapper iframe` scale tightened: `0.821` → `0.82` (desktop: 390×0.82 = 319.8px cleanly fits 320px wrapper); mobile `0.744` → `0.7425` (390×0.7425 = 289.58px fits 290px wrapper).
- **File hygiene:** Canonical copies now live at `packages/frontend/public/video.html` + `packages/frontend/public/organizer-video-ad.html`. Repo-root copies should be removed to avoid edit-the-wrong-file trap.

**S486 Files changed (6):**
- `packages/frontend/public/video.html` (NEW — canonical landing; iframe scale fixed 0.821→0.82 desktop, 0.744→0.7425 mobile)
- `packages/frontend/public/organizer-video-ad.html` (NEW — 38s demo video embed)
- `packages/frontend/public/og-default.png` (NEW — 1200×630 social share image, fixes broken refs in trending/map)
- `packages/frontend/next.config.js` — `/video` → `/video.html` rewrite + CSP `frame-src 'self'` added (unblocks same-origin iframe)
- `claude_docs/STATE.md` — this wrap
- `claude_docs/patrick-dashboard.md` — this wrap

**S486 Files to delete (duplicates after move):**
- `finda-sale-landing.html` (root) — superseded by `public/video.html`
- `organizer-video-ad.html` (root) — superseded by `public/organizer-video-ad.html`

---

**S485 (2026-04-15) — Animated video iteration (organizer-video-ad.html)**

- **Video polished across 2 sessions (S485 + continuation) ✅:** Full iterative refinement of `organizer-video-ad.html`. Final state: 38-second 9:16 animated HTML5 video, 5 scenes.
- **Visual fixes:** Lamp larger in review card (90×112px), review photo area taller (130px), shutter moved lower (padding-bottom 30px), "Not anymore!" exclamation added, phones equal height (flex:1 on body), bullet font 16px, subline font 24px.
- **Layout fix:** Phone swap no longer shifts layout — CSS grid stacking (`.phone-states`) keeps both states in same grid cell, opacity transitions instead of display:none toggle.
- **Timing tuned:** Counter starts at 75 (not 0), 1.3s animation. Checkmarks fire as counter hits 100. Subline at 15900ms. Scene 3 starts at 19500ms (2.5s earlier than before). Bullets appear after shopper phone settles. Total DURATION 38s.
- **Copy fixes:** "Not anymore!" with !, `https://finda.sale` URL, eBay confirm sub-line removed, beam label "Paid" padded with en-spaces + min-width:48px so beam never shifts.
- **Grey text standardized:** All grey text rgba(255,255,255,0.60) matching CTA scene.

**S485 Files changed (1):**
- `organizer-video-ad.html` — polished 38s animated video (multiple rounds of timing/visual iteration)

---

**Next Session — S487:**
- Audit Organizer Acquisition Playbook for: (1) estate sale / AI specific language, (2) any other narrowing language that excludes yard sales, auctions, flea markets, consignment. Strip and broaden. Patrick is frustrated this language keeps drifting back session after session — treat it as a hard rule not just a preference. See memory: `feedback_no_estate_ai_language.md` for the full rule.
- Synthesis: The True Plan — single 90-day action plan (Week 1 / Month 1 / Month 2-3) with owners, tools, budgets, success metrics. No hedging.
- Create og-image.png (1200×630) and favicon.png for the landing page — currently referenced in meta tags but not yet in `/public` or whatever serves the root.

---

**S484 (2026-04-15) — Organizer acquisition playbook + animated video brief**

- **Organizer Acquisition Playbook ✅:** Rebuilt twice this session. First pass wrong scope (cold outreach). Second pass correct: demand generation — organizers arrive pre-sold, sales conversation is just a trial offer. Covers community presence, before/after video asset, ringless voicemail (awareness touch not pitch), social proof flywheel, referral mechanics, probate attorney/consultant network. No "AI" language anywhere. Peer-to-peer tone throughout. Saved to `Organizer_Acquisition_Playbook.md` in repo root.
- **Animated video research ✅:** Tested Runway (paywall), Kling (1 free then paywall), Google Flow/Veo 3.1 (free — 50 credits/day, 20/generation, 9:16 supported). Settled on animated HTML5/React build instead of AI video — more brand-accurate, no watermark, no credits, free.
- **Video prompts written ✅:** 10 scene prompts for Veo 3.1 (Clip 1 iterated 4x based on feedback). Format locked: 25-second vertical 9:16 TikTok/Shorts, 3 AI clips + real screen recording. Structure: 0–5s chaos → 5–15s screen recording → 15–22s POS → 22–25s CTA.
- **Brand assets pulled ✅:** Colors, fonts, features extracted from tailwind.config.js + globals.css + finda.sale/organizer/pricing. Ready for next session animated build.

**S484 Brand Assets (for next session animated video):**
- Background: `#F9F7F4` (warm-100)
- Primary text: `#1A1A1A` (warm-900)
- Accent/CTA: `#D97706` (amber-600)
- Muted/secondary: `#8B7355` (warm-500)
- Success/sold: `#059669`
- Sage accent: `#6B9E7F`
- Dark mode bg: `#1C1C1E` / text: `#F5F5F0`
- Headings: Montserrat (globals.css) / Fraunces (tailwind config)
- Body: Inter

**S484 Pricing features to highlight (from finda.sale/organizer/pricing):**
- Photo-to-listing (auto-tag → publish) — all tiers, core demo moment
- QR codes + POS + social posts — all tiers
- Built-in payments (shopper pays on their phone)
- Virtual Queue — PRO+
- "Sell smarter." tagline
- CTA: "Try it free"

**S484 Guru Research — Acquisition Strategy Intelligence:**

**Gurus to study (prioritized):**
- Tier 1 (now): Alex Hormozi ($100M Leads — Core Four + Lead Getters + Grand Slam Offer/risk reversal), Nick Huber (Sweaty Startup — local-first, GMB, Nextdoor, physical presence)
- Tier 2 (30 days): Codie Sanchez (audience acquisition, media-first, tributaries), Noah Kagan (48hr validation, AppSumo launch), Russell Brunson (full funnel: RVM→video→trial→month-2 upsell)
- Tier 3 (90 days): Justin Welsh (founder as brand), Sam Parr/Shaan Puri (who already has my customers — EstateSales.NET has 50k organizers)
- Also study: Paul Yonover (Dream 100), Dan Henry (B2B SaaS cold email)

**Innovation ideas approved (from S484 agent dispatch):**
- Risk-reversal guarantee: "first 3 items free, don't move 2 in 30 days = refund month 1" — BUILD NOW (15 lines)
- Probate attorney referral loop with tracking links + profile badge — BUILD NOW (~150 lines)
- ProductHunt + AppSumo launch — BUILD NOW (no code, potential $4,900 immediate)
- Month-2 upsell email triggered by feature limit behavior — BUILD NOW (30 lines)
- EstateSales.NET partnership/migration offer — RESEARCH (ops + legal, not dev)
- 48-hour concierge sprint with 5 organizers → case study — BUILD NOW (no code)
- Copy reframe: "Save time" → "Finish. Then go on vacation." — A/B test NOW
- Estate Sale Insider podcast (bi-weekly, zero competition in this space) — BUILD NOW
- Justin Welsh 5-part TikTok screen recording series — BUILD NOW

**Influencer target list (S484):**
- Gary Vaynerchuk — "Trash Talk" garage sale series, 34M YT subs, explicitly loves yard/estate sales. Shopper-side pitch: "app to find sales near you." 
- Lara Spencer — HGTV Flea Market Flip + new "That Thrifting Show," massive TV audience
- Mike Wolfe — American Pickers, History Channel antiques audience
- Flea Market Flipper (Rob & Melissa Stephenson) — dedicated reseller community, teach flipping as business
- Hairy Tornado — full-time YouTube/Whatnot reseller
- Ralli Roots (Ryan & Alli) — $200 → 6-figure reselling income, garage sale hauls
- Treasure Hunting with Jebus — 727K YouTube subscribers
- Thrifting Vegas — specifically covers estate sales + garage sales for resale profit
- Whatnot platform — $6B+ GMV, estate/vintage category, integration + influencer partnership play

**Two-sided influencer strategy:** Shopper-side influencers (Gary Vee, Flea Market Flipper) drive BUYERS to browse FindA.Sale → organizers see traffic → organizers adopt. Same flywheel as Airbnb (travelers pull hosts).

**ICP (ideal first organizer):** Solo or 2-person team, 6-20 sales/year, currently using spreadsheets + phone photos + Venmo, tech-comfortable, frustrated by setup time. ASEL professional member profile. NOT: 1-sale/year hobbyist. NOT: national liquidation enterprise.

**S484 Files changed (2):**
- `Organizer_Acquisition_Playbook.md` (rebuilt v3 — Koerner/Outscraper methodology + guru framework summary + influencer flywheel + ICP section)
- `organizer-video-ad.html` (NEW — 25-second animated HTML5 marketing video, 9:16 vertical, 5 scenes, brand-accurate, self-contained)

---

**S483 (2026-04-15) — eBay settings bugs + Admin dashboard rebuild + Cost protection docs + Organizer signals spec**

**S483 Part 1 — eBay settings page bugs (3 fixes + sticky bar):**
- **Bug A — oz input spinners ✅:** Weight tier oz inputs changed from `type="number"` to `type="text"` in settings/ebay.tsx (lines 398, 544). Removes browser spin buttons.
- **Bug B — Policy dropdown not persisting ✅:** Dropdown onChange refactored to atomic `setMapping` with inline policy lookup + `value={tier.policyId || ''}` controlled binding. Selection now sticks.
- **Bug C — "Use suggested defaults" range fix ✅:** `ebayPolicyParser.ts` line 83 changed from `(lb + 1) * 16` to `(lb + 1) * 16 - 1`. Now: 1+ lb → 16–31 oz, 2+ lb → 32–47 oz, 3+ lb → 48–63 oz, 4+ lb → 64–79 oz, 5+ lb → 80–95 oz, 6+ lb → 96+.
- **Bug D — Sticky save bar z-index:** Already `z-50` from S469. No change needed.

**S483 Part 2 — Admin dashboard rebuild (7 parallel agents):**
- **Admin dashboard index ✅:** Rebuilt `pages/admin/index.tsx` with 6-row KPI layout: Row 1 money KPIs (Today's Revenue, MRR, 30-day Transaction Revenue, Hunt Pass Revenue), Row 2 platform KPIs (Users, Organizers with tier breakdown, Sales, Items), Row 3 Conversion Funnel (Signups→Have Organizer→Created Sale→Published Sale→Paid Tier with % at each step), Row 4 sparklines (7-day signups/revenue/sales via inline div bars), Row 5+6 Quick Links + Recent Activity unchanged. Graceful fallbacks for undefined fields.
- **Admin reports page ✅:** Implemented `pages/admin/reports.tsx` from Coming Soon. Tab 1: Organizer Performance table (sortable by revenue/sales/sellThrough/lastActive, tier badges, sell-through color coding, CSV export). Tab 2: Revenue breakdown by period (7d/30d/90d) with summary cards + daily bar chart + detail table.
- **Admin items page ✅:** Implemented `pages/admin/items.tsx` from Coming Soon. Global item search (300ms debounce) + status filter. Results: photo thumbnail, title, price, status badge, organizer, sale, date. "View" → `/organizer/edit-item/[id]`. Pagination.
- **Admin broadcast page ✅:** Implemented `pages/admin/broadcast.tsx` from Coming Soon. Audience selector (ALL/ORGANIZERS/SHOPPERS/PRO_ORGANIZERS/TEAMS_ORGANIZERS) with live recipient count preview. Subject + body + character counter. Confirmation dialog before send. Success/error states.
- **Admin feature flags page ✅:** Implemented `pages/admin/feature-flags.tsx` from Coming Soon. Flags table with toggle (optimistic UI + rollback), tier restricted badge, last updated/by, inline new-flag form with key validation. Empty state shows suggested flags. NOTE: Requires FeatureFlag schema table (see below — schema pending).
- **Backend admin controller ✅:** Upgraded `adminController.ts` `getStats` to return tierBreakdown, mrr, mrrByTier, transactionRevenueLast30d/Today, huntPassRevenueLast30d, aLaCarteRevenueLast30d, conversion funnel, 7-day sparklines. Added `getAdminItems`. Added `ebayRateLimit` status to stats response.
- **Backend reports controller ✅:** New `adminReportsController.ts` — `getOrganizerPerformance` (paginated, sortable), `getRevenueReport` (breakdown by 7d/30d/90d).
- **Backend broadcast controller ✅:** New `adminBroadcastController.ts` — `sendBroadcast` (Resend, audience-filtered), `getRecipientsPreview`.
- **eBay rate limiter ✅:** New `packages/backend/src/lib/ebayRateLimiter.ts` — in-memory daily counter (same pattern as aiCostTracker.ts), default soft cap 4,500/day (env `EBAY_API_DAILY_LIMIT`), returns 429 + `code: EBAY_RATE_LIMITED` when limited. `ebayController.ts` instrumented: rate limit gate at top of `pushSaleToEbay()`, `trackEbayCall()` after successful API calls in push + policy fetch + merchant location.
- **Routes updated ✅:** `routes/admin.ts` — added GET /reports/organizers, GET /reports/revenue, POST /broadcast, GET /broadcast/preview, GET /items.

**S483 Part 3 — Cost protection & signals docs:**
- **Cost protection playbook ✅:** `claude_docs/operations/cost-protection-playbook.md` — 8 services (Cloudinary, Google Vision, Anthropic, Railway, Vercel, eBay API, Stripe, Resend) with risk ratings, exact URLs, step-by-step instructions, quick-action checklist, viral spike response plan.
- **Organizer signals spec ✅:** `claude_docs/strategy/organizer-signals-spec.md` — 4 proactive expansion signals (fee savings breakeven, capacity trajectory, feature gap, velocity acceleration) + full churn risk scoring (30% activity / 40% engagement / 30% business, seasonal override). Schema for OrganizerScore table included.

**S483 Architect schema designs (PENDING implementation — schema.prisma not yet updated):**
- **FeatureFlag:** id, key (unique), description, enabled, tierRestricted, updatedAt, updatedBy
- **PwaEvent:** id, eventType, userId?, sessionId?, createdAt (append-only)
- **OrganizerScore:** id, organizerId (unique), expansionScore, expansionTier, expansionTopSignal, churnScore, churnBand, churnTopSignal, scoredAt, createdAt, updatedAt
- **ApiUsageLog:** id, service, dateKey, callCount, estimatedCostCents, unique(service, dateKey)

These tables are required before: feature flags backend CRUD, PWA event tracking, OrganizerScore daily cron, persistent API cost tracking (replace in-memory counters).

**S483 Files changed (15 total):**

*eBay bugs (2):*
- `packages/frontend/pages/organizer/settings/ebay.tsx` — oz inputs type="text", dropdown atomic state fix
- `packages/backend/src/utils/ebayPolicyParser.ts` — weight tier range boundary fix

*Admin backend (4, 2 new):*
- `packages/backend/src/controllers/adminController.ts` — getStats upgrade + getAdminItems + eBay rate limit status
- `packages/backend/src/controllers/adminReportsController.ts` (NEW) — organizer performance + revenue reports
- `packages/backend/src/controllers/adminBroadcastController.ts` (NEW) — send broadcast + preview
- `packages/backend/src/routes/admin.ts` — 5 new routes

*eBay rate limiter (2, 1 new):*
- `packages/backend/src/lib/ebayRateLimiter.ts` (NEW) — in-memory daily counter
- `packages/backend/src/controllers/ebayController.ts` — rate limit gate + trackEbayCall instrumentation

*Admin frontend (5):*
- `packages/frontend/pages/admin/index.tsx` — rebuilt KPI dashboard; TS fix: sparklines map callbacks use `stats.sparklines?.signups ?? [0]` (control-flow narrowing lost in callbacks)
- `packages/frontend/pages/admin/reports.tsx` — implemented from Coming Soon
- `packages/frontend/pages/admin/items.tsx` — implemented from Coming Soon
- `packages/frontend/pages/admin/broadcast.tsx` — implemented from Coming Soon
- `packages/frontend/pages/admin/feature-flags.tsx` — implemented from Coming Soon

*Docs (2 new):*
- `claude_docs/operations/cost-protection-playbook.md` (NEW)
- `claude_docs/strategy/organizer-signals-spec.md` (NEW)

---

**S482 (2026-04-15) — Camera UI overhaul: settings pill, toast fix, pinch zoom, fullscreen iPad**

**S482 What happened:**
- **Toast positioning fix ✅:** Standard toasts were `top-4 right-4` — inside the header zone. Changed to `top-14 md:top-20` to clear header on all screen sizes.
- **Camera settings panel built ✅:** Full collapsible settings system in RapidCapture.tsx:
  - X button always top-left (never covered)
  - Gear button top-right opens vertical pill dropping down from gear
  - Pill contains: Flash/Torch cycle (Off→On→Auto→Torch), White balance (sub-chips extend left), Timer (Off/2s/5s), Corner guides toggle, Level indicator toggle, Switch camera
  - Flash and torch combined into single button cycling Off→On→Auto→Torch (torch step skipped if unsupported)
  - Tap-outside backdrop closes pill
  - White balance sub-chips positioned as child of pill, extend left from WB button
- **Camera fullscreen on iPad ✅:** Changed `md:` breakpoints to `lg:` on outer container modal treatment — iPads (768px) now stay fullscreen.
- **Settings button z-index fix ✅:** Two bugs found and fixed:
  1. Viewfinder (`flex-1 relative overflow-hidden`) had no z-index, painting over top bar in DOM order → added `z-0`
  2. Settings panel had `z-19` (invalid Tailwind class, compiled to nothing) → changed to `z-30`
- **Level indicator fixed ✅:** Was a static line. Now reads `deviceorientation` gamma, rotates 80px bar, amber ≤±2°, white ±2–10°, red >±10°. iOS 13+ permission request. Cleanup on unmount.
- **Pinch-to-zoom fixed ✅:** Browser was claiming pinch gesture as page zoom. Added `touch-none` (touch-action: none) to viewfinder div.
- **Zoom pill added ✅:** Always-visible `0.5×/1×/2×/3×` pill centered at bottom corner bracket level (`bottom-6 left-1/2`). Only levels device supports are shown. Hidden if zoom not supported.
- **Hunt Pass modal + unlock flow:** Discussed but not dispatched — Patrick noted it fires too much, needs session-level throttle matching other modals.

**S482 Files changed (2):**
- `packages/frontend/components/RapidCapture.tsx` — full camera settings overhaul (multiple passes)
- `packages/frontend/components/ToastContext.tsx` — toast position top-4 → top-14 md:top-20

---

**S481 (2026-04-15) — AI camera improvements + trails security + Hubs nav move**

**S481 What happened:**
- **Trails security fix ✅:** `/shopper/trails` public endpoint exposed all trails (anyone could see/edit/delete). Fixed: new authenticated `GET /trails/mine` endpoint (trailController.ts `getMyTrails`) filtering by `userId`. Route registered BEFORE `/:trailId` to prevent Express route conflict. Frontend `useMyTrails` hook updated to `/trails/mine`. `[trailId].tsx` fetch updated to direct lookup. Edit/Delete buttons wrapped in `user?.id === trail.userId` ownership guard.
- **Hubs nav move ✅:** Market Hubs moved from general organizer section to TEAMS block in both AvatarDropdown.tsx and Layout.tsx. Icon color changed from `text-purple-400` to `text-gray-400` to match TEAMS section style.
- **AI camera improvements batch (7 items) ✅:** cloudAIService.ts + processRapidDraft.ts + review.tsx:
  - TEXT_DETECTION added to Vision API (catches brand marks on glass/dark items; combined with LABEL_DETECTION)
  - Sparse-label fallback: if <3 specific labels detected, Haiku instructed to reason from silhouette/shape
  - Anti-anchor pricing: removed "estate sale / 20–50% of retail" framing entirely; replaced with secondary market comp-grounded language + non-round example JSON (`{"low":7,"high":23,"suggested":14}`)
  - Comp-based price refinement in processRapidDraft: fetches 5 recent SOLD items by detected category → `suggestPrice` override; best-effort fallback
  - Improved conditionGrade visual checklist: scratches, chips, fading, rust, missing parts, repair signs
  - Tag grouping by type: suggested tags now rendered in Material/Era/Brand/Style/Other groups
  - Within-session tag suppression: tags removed ≥2 times hidden from suggestions for that session
  - Condition-adjusted pricing: selecting a condition grade silently calls `/items/ai/price-suggest` and updates price field; grades with disabled cursor while refreshing
- **TS fix:** processRapidDraft.ts comp map callback explicit type (was implicit `any`)

**S481 Files changed (9):**
- `packages/backend/src/controllers/trailController.ts` — added `getMyTrails` function
- `packages/backend/src/routes/trails.ts` — `GET /mine` route registered before `/:trailId`
- `packages/frontend/hooks/useTrails.ts` — `useMyTrails` → `/trails/mine`
- `packages/frontend/pages/shopper/trails/[trailId].tsx` — direct fetch + ownership guard on Edit/Delete
- `packages/frontend/components/AvatarDropdown.tsx` — Hubs moved to TEAMS block, grey icon
- `packages/frontend/components/Layout.tsx` — Hubs moved to TEAMS block (mobile nav), grey icon
- `packages/backend/src/services/cloudAIService.ts` — TEXT_DETECTION, sparse-label fallback, anti-anchor pricing, improved conditionGrade prompt, non-round example JSON
- `packages/backend/src/jobs/processRapidDraft.ts` — comp-based price refinement post-AI, TS explicit type
- `packages/frontend/pages/organizer/add-items/[saleId]/review.tsx` — tag grouping, within-session suppression, condition-adjusted pricing handler + grade button wiring

---

**S480 (2026-04-15) — S468 status card fix + photo lightbox + Item 5 verified + eBay toast fix**

**S480 What happened:**
- **S468 status card fix ✅:** `GET /api/ebay/connection` (ebayController.ts L1325–1338) now returns `fulfillmentPolicyId`, `returnPolicyId`, `paymentPolicyId`, `policiesFetchedAt`. Frontend condition (settings.tsx L851) changed from gating on all 3 policy ID fields to `ebayStatus?.policiesFetchedAt`. Business Policies card now shows green ✓ when policies have been synced.
- **Photo lightbox ✅:** `ItemPhotoManager.tsx` — added `lightboxUrl` state, Escape key handler, `cursor-zoom-in` + `onClick` on photo thumbnails, full-screen overlay with close button and stopPropagation. Patrick verified: "lightbox works."
- **Item 5 reconciliation ✅ (already done in S467):** STATE.md said "dispatch dev next session" — verified full implementation exists in ebayController.ts (L3687–3850: `syncEndedListingsForOrganizer` with GetMultipleItems batches of 20) and `ebayEndedListingsSyncCron.ts` (4h cron). No dispatch needed.
- **NudgeBar organizer suppression ✅:** `NudgeBar.tsx` already had `user?.role === 'ORGANIZER'` guard — confirmed rendering suppressed for organizers via Chrome (screenshot ss_2621nxuyu).
- **eBay save bar browser-confirmed ✅:** `/organizer/settings/ebay` sticky save bar confirmed rendering in actual browser via JS hot-pink injection (Patrick: "it's pink"). Screenshot tool has ~115px blind spot at viewport bottom due to browser chrome offset — bar exists and is functional despite being off-screen in tool captures.
- **eBay push error toast fix (P2) ✅:** `edit-item/[id].tsx` `onSuccess` handler was checking `result?.error` but backend sends `result.code` + `result.message` — `error` field never exists. Fixed to check `result?.code?.includes('NOT_CONNECTED')`, `result?.code?.includes('POLICIES')`, fallback to `result?.message`. Live push fired and confirmed `NO_FULFILLMENT_POLICY_MATCH` response correctly parsed.
- **USED grade-S → USED_EXCELLENT code-verified:** `mapGradeToInventoryCondition` (ebayController.ts L2493–2510) confirmed: grade S + condition=USED returns `USED_EXCELLENT`. Live verification UNVERIFIED (test item has weight=null, triggering `NO_FULFILLMENT_POLICY_MATCH` before condition logic runs).
- **S469 P2 bug noted:** Sticky "Save setup" bar visually hidden behind footer when scrolled to page bottom (z-index issue). Save still works. P2, not blocking.

**S480 Files changed (4):**
- `packages/backend/src/controllers/ebayController.ts` — added 4 policy fields to /api/ebay/connection response
- `packages/frontend/pages/organizer/settings.tsx` — changed Business Policies condition to `policiesFetchedAt`
- `packages/frontend/components/ItemPhotoManager.tsx` — lightbox implementation
- `packages/frontend/pages/organizer/edit-item/[id].tsx` — eBay push error toast: result.error → result.code/message

---

**S469 (2026-04-15) — eBay Phase 1-3 Foundation: Policy Mapping + Weight-Tier Routing + Draft Mode + Setup UI**

**S469 What happened:**
- Patrick flagged the push-first-policy approach as a shortcut. Real-world organizer (Patrick himself) has 22 shipping policies named by weight tier ("8oz Ground Advantage", "1+ lb Ground Advantage", "6+ lb Ground Advantage", "Freight 150+ lb Freight", etc.). eBay also supports 10 description templates per seller.
- Laid out 3-layer architecture: (1) EbayPolicyMapping model with default + weight-tier + shipping-class + category overrides, (2) merchant location routing (sale address / organizer address / existing eBay location), (3) description template injection + draft mode toggle.
- Dispatched three parallel agents (non-overlapping file ownership):
  - **Agent A** (schema + parser): New `EbayPolicyMapping` model, migration `20260415_ebay_policy_mapping`, `ebayPolicyParser.ts` utility (classifyPolicy, parseWeightTiers, matchWeightTier, toOunces). Weight-tier parser handles "8oz", "1+ lb", "N+ lb" — last "N+ lb" promoted to Infinity.
  - **Agent B** (backend): Added `fetchAllEbayPolicies`, `fetchEbayMerchantLocations`, `getEbaySetupData`, `saveEbayPolicyMapping`, `resolvePoliciesForItem`. Modified push flow to per-item routing with priority: category override → HEAVY_OVERSIZED → FRAGILE → weight tier → UNKNOWN → default → EbayConnection fallback. Description template `{{DESCRIPTION}}` placeholder injection. Draft mode wraps publishOffer call.
  - **Agent C** (frontend): New `/organizer/settings/ebay.tsx` (729 lines) — 8 sections: page shell, default policies, weight-tier matrix (editable with "Use suggested defaults"), shipping classification overrides, category overrides, description template, draft mode + merchant location radio, sticky save bar. Added "Advanced eBay Setup →" link in settings.tsx.
- All three agents returned zero TypeScript errors. Main session verified schema fields + new exports + route registration.
- Agent A flagged: pnpm workspace symlink issue prevented `prisma generate` in VM — Patrick must run manually after migrate deploy.

**S469 Files changed (7):**
- `packages/database/prisma/schema.prisma` — added `EbayPolicyMapping` model + `ebayPolicyMapping` relation on Organizer
- `packages/database/prisma/migrations/20260415_ebay_policy_mapping/migration.sql` (NEW)
- `packages/backend/src/utils/ebayPolicyParser.ts` (NEW, 172 lines)
- `packages/backend/src/controllers/ebayController.ts` — policy routing, template injection, draft mode, new endpoints
- `packages/backend/src/routes/ebay.ts` — `GET /setup-data`, `POST /policy-mapping`
- `packages/frontend/pages/organizer/settings/ebay.tsx` (NEW, 729 lines)
- `packages/frontend/pages/organizer/settings.tsx` — "Advanced eBay Setup" link

**S469 Patrick manual actions REQUIRED (schema change):**
```powershell
cd C:\Users\desee\ClaudeProjects\FindaSale\packages\database
$env:DATABASE_URL="postgresql://postgres:QvnUGsnsjujFVoeVyORLTusAovQkirAq@maglev.proxy.rlwy.net:13949/railway"
npx prisma migrate deploy
npx prisma generate
```

---

**S468 (2026-04-15) — eBay policy sync UI + /sync-policies route**

**S468 What happened:**
- Audited Patrick's Celestion listing showing "Free Standard Shipping" — confirmed the push flow was ALREADY correct: lines 1648–1650 of ebayController.ts use `conn.paymentPolicyId/fulfillmentPolicyId/returnPolicyId` from DB, with a hard validation gate at line 1392.
- Schema already had all policy fields: `paymentPolicyId`, `fulfillmentPolicyId`, `returnPolicyId`, `policiesFetchedAt`, `merchantLocationKey`. No migration needed.
- `fetchAndStoreEbayPolicies()` was already implemented — just needed `export` keyword added.
- Added `POST /api/ebay/sync-policies` route — authenticated organizer endpoint to manually re-fetch policies from eBay Account API.
- Added policy sync status UI to organizer settings page: green ✓ when all 3 policies synced, amber warning with eBay link when missing, "Sync from eBay" button.
- Both packages: zero TypeScript errors verified by main session.

**S468 Files changed (3):**
- `packages/backend/src/controllers/ebayController.ts` — added `export` to `fetchAndStoreEbayPolicies`
- `packages/backend/src/routes/ebay.ts` — added import + `POST /sync-policies` route
- `packages/frontend/pages/organizer/settings.tsx` — policy status card + sync button

---

**S467 (2026-04-15) — eBay listing quality batch (6-item queue) + sitewide organizer rarity filter fix**

**S467 What happened:**
- **P0 sitewide bug found & fixed:** All 7 organizer-facing pages called public `/items?saleId=` endpoint which runs Hunt Pass rarity filter. ULTRA_RARE/RARE items created within 6h were invisible to the organizer on their own management pages (Celestion $285, ULTRA_RARE, 1.8h old — disappeared). Fixed by switching all organizer management pages to `/items/drafts` (authenticated, no rarity filter). Public browsing and Buyer Preview remain unaffected.
- **S466 6-item queue completed:** Items 1–4 and 6 shipped. Item 5 (reconciliation) has Architect spec ready, dev dispatch next session.
- **Item 1** (category honor): No bug — current code already respects DB value.
- **Item 2** (condition → eBay enum): Grade S + condition=USED now sends USED_EXCELLENT not NEW.
- **Item 3** (aspect auto-fill): Brand checks item.brand first; MPN checks item.mpn; tags matched against enum. No more Brand="RIC" on speakers.
- **Item 4** (toast on success): Fixed 3 files — was checking `result.success` instead of `result.status === 'success'`.
- **Item 5** (reconciliation spec): Architect spec written — `claude_docs/specs/ebay-listing-reconciliation-spec.md`. Hybrid cron+on-demand. No schema changes needed. ~150 lines. Dispatch dev next session.
- **Item 6** (watermark QR): Resized 130→85px, moved g_south→g_south_east (bottom-right corner).
- **No migrations this session. No schema change.**

**S467 Files changed (19 + 2 new):**
- `packages/backend/src/controllers/ebayController.ts` — condition fix + aspect auto-fill + reconciliation function
- `packages/backend/src/utils/cloudinaryWatermark.ts` — QR 130→85px, g_south→g_south_east
- `packages/backend/src/routes/ebay.ts` — GET /sync-ended-listings route
- `packages/backend/src/index.ts` — cron startup wiring
- `packages/backend/src/jobs/ebayEndedListingsSyncCron.ts` — NEW 4h cron
- `packages/frontend/pages/organizer/add-items/[saleId].tsx` — /items → /items/drafts
- `packages/frontend/pages/organizer/sales/[id]/index.tsx` — /items → /items/drafts
- `packages/frontend/pages/organizer/print-kit/[saleId].tsx` — /items → /items/drafts
- `packages/frontend/pages/organizer/promote/[saleId].tsx` — /items → /items/drafts
- `packages/frontend/pages/organizer/print-inventory.tsx` — /items → /items/drafts
- `packages/frontend/pages/organizer/bounties.tsx` — /items → /items/drafts
- `packages/frontend/pages/organizer/dashboard.tsx` — /items → /items/drafts
- `packages/frontend/components/PostSaleEbayPanel.tsx` — toast result.status fix
- `packages/frontend/pages/organizer/edit-item/[id].tsx` — toast result.status fix
- `packages/frontend/pages/organizer/add-items/[saleId]/review.tsx` — toast result.status fix
- `claude_docs/specs/ebay-listing-reconciliation-spec.md` — NEW Architect spec
- `packages/backend/src/controllers/ebayController.ts` — push price priority inverted (organizer price wins over AI)

---

**S464 (2026-04-14) — ebayNeedsReview full implementation, billing webhook fix, Stripe env cleanup, eBay two-pass retry**

Files (7):
- `packages/database/prisma/schema.prisma` — Item.ebayNeedsReview Boolean
- `packages/database/prisma/migrations/20260414_ebay_needs_review/migration.sql` (NEW)
- `packages/backend/src/controllers/ebayController.ts` — 25005/25021 two-pass retry, offer PUT merge
- `packages/backend/src/controllers/itemController.ts` — ebayListingId + ebayNeedsReview select
- `packages/backend/src/controllers/billingController.ts` — STRIPE_BILLING_WEBHOOK_SECRET fix
- `packages/frontend/pages/organizer/pricing.tsx` — Stripe price IDs from env
- `packages/frontend/pages/organizer/sales/[id]/index.tsx` — amber "eBay Category Needed" badge

**S464 Patrick manual actions OUTSTANDING:**
```powershell
cd C:\Users\desee\ClaudeProjects\FindaSale\packages\database
$env:DATABASE_URL="postgresql://postgres:QvnUGsnsjujFVoeVyORLTusAovQkirAq@maglev.proxy.rlwy.net:13949/railway"
npx prisma migrate deploy
npx prisma generate
```

Vercel env cleanup: delete old NEXT_PUBLIC_STRIPE_PRO_MONTHLY_PRICE_ID and NEXT_PUBLIC_STRIPE_PRO_ANNUAL_PRICE_ID; confirm live publishable key; confirm Railway STRIPE_TEAMS_MONTHLY_PRICE_ID.

---

## Recent Sessions

- **S487 (2026-04-16):** Schema additions (4 tables: FeatureFlag, PwaEvent, OrganizerScore, ApiUsageLog) ✅. (Soon) nav labels removed from Layout + AvatarDropdown ✅. Chrome QA: /admin/items ✅, /admin/broadcast ✅, /admin/feature-flags ❌ P1 (backend API missing — 404), /admin/reports fix applied (revenue?.byDay?.length) + UNVERIFIED pending deploy. Acquisition Playbook language broadened. 6 files.
- **S486 (2026-04-16):** Video polish pass 2 (scene 2 lamp enlarged, review/success `height: 100%` fix, scene 3 payments row sized to fit beam label, font bump across all 5 scenes). Landing page stripped to essentials — logo, video, split, Free Forever offer, 2 FAQs, CTA, footer. SEO meta tags added: canonical, Open Graph, Twitter cards, theme-color, robots, favicon, JSON-LD SoftwareApplication schema. 4 files.
- **S485 (2026-04-15):** Animated video polished across 2 sessions. Final state: 38-second 9:16 animated HTML5 video, 5 scenes. Phones no longer shift during payment swap (CSS grid stacking), counter starts at 75, bullets appear after shopper phone settles, beam label width stabilized. 1 file.
- **S484 (2026-04-15):** Organizer acquisition playbook rebuilt v3 (Koerner/Outscraper methodology at scale — 5k+ contacts, $285/mo; + guru framework mapping for 8 gurus; + influencer flywheel strategy with 8 named targets; + ICP definition). 25-second animated HTML5 video built (9:16 vertical, 5 scenes, brand-accurate, self-contained). RVM scale corrected: 5k–20k contacts, not 25. Two-sided flywheel identified: shopper influencers (Gary Vee) pull buyers → buyers pull organizers (Airbnb model). 9 innovation ideas approved with BUILD NOW / DEFER verdicts. 2 files.
- **S483 (2026-04-15):** eBay settings bugs (3 fixes). Admin dashboard rebuild — 5 Coming Soon pages delivered (reports, items, broadcast, feature-flags, index KPIs), 3 new backend controllers (adminReports, adminBroadcast, ebayRateLimiter), getStats upgraded with MRR/funnel/sparklines. Cost protection playbook + organizer signals spec written. Architect schema designs for 4 tables (FeatureFlag, PwaEvent, OrganizerScore, ApiUsageLog) — not yet in schema.prisma. 15 files. Chrome QA pending.
- **S481 (2026-04-15):** Trails security fix (public endpoint → authenticated /mine + ownership guard). Hubs nav moved to TEAMS block (grey icons). AI camera batch: TEXT_DETECTION for dark/glass, sparse-label fallback, comp-grounded pricing (anti-anchor), conditionGrade visual checklist, tag grouping by type, within-session suppression, condition-adjusted pricing. 9 files. Zero TS errors.
- **S480 (2026-04-15):** S468 status card fix ✅ (4 fields added to /api/ebay/connection). Photo lightbox ✅ (ItemPhotoManager). Item 5 reconciliation verified already done in S467. NudgeBar organizer suppression ✅. eBay save bar browser-confirmed ✅ (hot-pink injection). eBay push error toast P2 fixed (result.code/message not result.error). USED_EXCELLENT code-verified, live UNVERIFIED (weight=null). 4 files.
- **S479 (2026-04-15):** Chrome QA of S467/S468/S469. S467 rarity filter ✅, S469 Advanced Setup page ✅ (all 8 sections render), S468 ⚠️ PARTIAL — sync works, status card broken (settings.tsx reads fields missing from /api/ebay/connection payload). Fix routed next session. 0 code changes.
- **S469 (2026-04-15):** eBay Phase 1-3 foundation — 3 parallel agents shipped EbayPolicyMapping model + weight-tier parser + per-item policy routing + draft mode + full setup page (8 sections). Handles 22+ shipping policies via weight-tier matching. Migration applied. 7 files. Zero TS errors.
- **S468 (2026-04-15):** eBay policy sync: confirmed push flow already uses DB policy IDs. Added export + POST /sync-policies route + settings UI (policy status card + sync button). No schema changes. Zero TS errors. 3 files.
- **S467 (2026-04-15):** eBay listing quality batch (6/6 items done) + P0 sitewide organizer rarity filter fix (7 pages). Condition/aspect/toast/watermark fixes. Reconciliation spec ready. 13 files changed. No migrations.
- **S466 (2026-04-14):** Add Items filter fix (getDraftItemsBySaleId) + eBay price priority inversion (organizer price wins). 2 files.
- **S465 (2026-04-14):** Roadmap graduation pass (v106 → v107) — 31 features moved to SHIPPED & VERIFIED. #245 Feedback Widget deprecated → Rejected. STATE.md compacted from 1603 → ~250 lines (S428–S449 archived to COMPLETED_PHASES.md). All go-live env blockers cleared.
- **S464 (2026-04-14):** ebayNeedsReview full implementation (amber badge on sale detail when all 5 category suggestions fail). Billing webhook secret fix (P0). Stripe env cleanup. eBay two-pass retry (25021 + 25005 independent passes). Migration needed: `20260414_ebay_needs_review`.
- **S463 (2026-04-14):** Static eBay category picker retired. Live Taxonomy API picker shipped. ebayCategoryMap.ts deleted. eBay sync architecture spec produced (GetMultipleItems batch replacement for GetItem loop recommended).
- **S462 (2026-04-14):** eBay Listing Data Parity Phase A + B + C. 17 new Item fields (weight, dimensions, UPC/EAN/ISBN/MPN/brand, conditionNotes, best offer, subtitle). HTML sanitizer. Catalog product match. Auto-fill identifiers.
- **S461 (2026-04-14):** eBay push end-to-end working after 6 rounds of fixes. Contigo travel mug published successfully (Patrick-verified).
- **S460 (2026-04-14):** eBay push UI in 3 locations (sale detail, edit-item, review page). QR watermark default. PostSaleEbayPanel shipped. Shipping classification (SHIPPABLE/HEAVY_OVERSIZED/FRAGILE/UNKNOWN).
- **S459 (2026-04-14):** eBay webhook + enrichment fully operational.
- **S458 (2026-04-14):** Pull to Sale UX + eBay field extraction + GetItem enrichment pass.
- **S457 (2026-04-13):** Pull to Sale fixed for eBay inventory items.
- **S456 (2026-04-14):** eBay inventory import fully operational — Trading API, photos, dedup cleanup. Patrick-verified.
- **S455 (2026-04-13):** eBay inventory import + terminology cleanup (library→inventory) + OAuth/cart fixes.
- **S454 (2026-04-13):** Hunt Pass → recurring Stripe Subscription. Go-live audit fixes. Patrick-verified purchase flow.
- **S452 (2026-04-13):** eBay + Stripe go-live prep — bidirectional sync, policy IDs, env audit.
- **S451 (2026-04-13):** Dashboard layout lock (Hero→Action→QR→Hunt Pass→Tabs order). 5th action button (My QR). Compass icon for Initiate. Patrick-verified layout. ⚠️ Catastrophic push incident documented (VM git index desync — recovered).
- **S450 (2026-04-13):** Dashboard character sheet rebuild. P0 rank staleness fixed (JWT no longer caches explorerRank; Nav fetches fresh via useXpProfile). Rank names locked: Initiate/Scout/Ranger/Sage/Grandmaster (0/500/2000/5000/12000). /shopper/ranks page shipped.
- **Pre-S450:** See `claude_docs/COMPLETED_PHASES.md` for S428–S449 summaries and full archived wrap blocks.

---

## Go-Live Blockers

**All P0/P1 env blockers cleared S465.** Remaining items are polish and QA.

| Priority | Item | Owner | Notes |
|----------|------|-------|-------|
| ✅ | ~~Run S464 ebayNeedsReview migration~~ | Patrick | DONE S465 |
| ✅ | ~~Register live Stripe webhooks~~ | Patrick | DONE S465 — both endpoints live, correct event sets, screenshot-verified |
| ✅ | ~~Confirm webhook signing secrets match Railway~~ | Patrick | DONE S465 — Patrick confirmed |
| ✅ | ~~Vercel: `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY` live~~ | Patrick | DONE S465 — `pk_live_51T3kXh...` verified |
| ✅ | ~~Railway: `STRIPE_HUNT_PASS_PRICE_ID` live~~ | Patrick | DONE S465 — `price_1TLtY1...` verified |
| ✅ | ~~Railway: `STRIPE_GENERIC_ITEM_PRODUCT_ID` live~~ | Patrick | DONE S465 — `prod_UKZ2G21VhLJ3CE` verified |
| ✅ | ~~MailerLite + Resend env vars on Railway~~ | Patrick | DONE S465 — `RESEND_API_KEY`, `MAILERLITE_API_KEY`, `MAILERLITE_SHOPPERS_GROUP_ID` all present |
| P2 | Chrome QA: eBay push with book/clothing/furniture categories | Claude/Patrick | Verifies S461–S464 hold beyond Contigo |
| P2 | Chrome QA: PostSaleEbayPanel end-to-end (ENDED sale) | Claude | |
| P2 | Chrome QA: watermark layout after S465 fix | Patrick/Claude | Confirm QR stacks above text, both bigger, no overlap |
| P3 | Archive ~14 junk Stripe test products | Patrick | Catalog cleanup |

**Go-Live env gate is CLOSED.** The platform can accept live payments end-to-end. Remaining blockers are behavioral verification (Chrome QA) and cleanup, not prerequisites.

---

## Next Session Priority

**TOP PRIORITY — Push S487 files:**

**0a. Push S487 schema + migration (2 files):**
```powershell
git add packages/database/prisma/schema.prisma
git add "packages/database/prisma/migrations/20260416_admin_tables/migration.sql"
git commit -m "S487: Add FeatureFlag, PwaEvent, OrganizerScore, ApiUsageLog schema + migration"
.\push.ps1
```

**0b. Push S487 frontend fixes (3 files):**
```powershell
git add packages/frontend/components/Layout.tsx
git add packages/frontend/components/AvatarDropdown.tsx
git add packages/frontend/pages/admin/reports.tsx
git commit -m "S487: Remove (Soon) labels from admin nav, fix reports.tsx crash on null revenue"
.\push.ps1
```

**0c. Push S487 playbook (1 file):**
```powershell
git add Organizer_Acquisition_Playbook.md
git commit -m "S487: Broaden acquisition playbook language to include all sale types"
.\push.ps1
```

**0d. Push wrap docs:**
```powershell
git add claude_docs/STATE.md
git add claude_docs/patrick-dashboard.md
git commit -m "S487 wrap: STATE + dashboard updated"
.\push.ps1
```

**1. Patrick manual — run migration for 20260416_admin_tables:**
```powershell
cd C:\Users\desee\ClaudeProjects\FindaSale\packages\database
$env:DATABASE_URL="postgresql://postgres:QvnUGsnsjujFVoeVyORLTusAovQkirAq@maglev.proxy.rlwy.net:13949/railway"
npx prisma migrate deploy
npx prisma generate
```
Creates FeatureFlag, PwaEvent, OrganizerScore, ApiUsageLog tables in Railway DB.

**2. Dev dispatch — feature flags backend API (P1):**
Chrome QA confirmed `/admin/feature-flags` page exists but backend returns 404. Need backend routes:
- `GET /api/admin/feature-flags` — list all flags
- `POST /api/admin/feature-flags` — create new flag
- `PATCH /api/admin/feature-flags/:id` — toggle enabled + update
- `DELETE /api/admin/feature-flags/:id` — remove flag

Uses the new `FeatureFlag` Prisma model (migration must be applied first).

**3. Chrome QA — /admin/reports (after Vercel deploy of reports fix):**
Verify the `revenue?.byDay?.length` fix resolved the TypeError crash. Navigate to https://finda.sale/admin/reports as admin, confirm page loads without error banner.

**4. Chrome QA — /admin/feature-flags (after backend API + migration):**
Once backend routes exist and migration is applied, verify flags list loads, toggle works, new flag form submits.

**5. Patrick manual — delete The_True_Plan.md from workspace (file cannot be deleted programmatically).**

**6. Outstanding migrations (still pending from prior sessions):**
- S469: EbayPolicyMapping — same `npx prisma migrate deploy` + `npx prisma generate` block as above
- S464: ebayNeedsReview — same

**7. Remaining S467 QA (carry over):**
- USED grade-S item push → confirm eBay gets USED_EXCELLENT (needs item with weight set).
- Watermark QR 85px bottom-right (UNVERIFIED).

**8. eBay Chrome QA queue:**
- Full "push a real item" — book, clothing, furniture — verify condition/aspect/price land correctly.
- PostSaleEbayPanel end-to-end (ENDED sale).

**9. Cost protection checklist (Patrick manual — see `claude_docs/operations/cost-protection-playbook.md`):**
- Cloudinary: spending cap + 75% alert
- Anthropic: $50/month spend limit at console.anthropic.com/settings/limits
- Google Vision: 2,000/day quota + $25 budget alert in GCP
- Stripe: enable Radar rules + dispute notifications

**Carry-forward queue (lower priority):**
- Bump Post feed sort (needs Architect sign-off before dev dispatch)
- Price Research Card redesign (`claude_docs/design/PRICE_RESEARCH_CARD_UX_SPEC.md`)
- Brand audit copy: SharePromoteModal, homepage meta, organizer profile meta
- Referral fraud gate (D-XP-004)
- RankUpModal — built but not connected to AuthContext rank-change event
- Legendary item flag — no organizer UI to mark items Legendary yet

**Deferred:**
- Device fingerprinting Phase 2 (FingerprintJS — defer until beta scale justifies)
- Bounty redesign Phase 2
- Flea Market Events full implementation (ADR-014 locked, not yet staffed)
- Stripe Connect webhook config (items not marking SOLD after POS card payment — P2 since S421)
- Bounties dollars vs XP: open decision

**Postponed QA queue:**
- S436 earnings/qr-codes/staff
- S430 Yahoo spam test, iOS geolocation, print label
- S431 trail detail + trail stops on map
- S427 full invoice flow
- S433 auction reserve/proxy/soft-close/bid history/cron

---

## Blocked/Unverified Queue

| Feature | Reason | What's Needed | Session Added |
|---------|--------|----------------|---------------|
| /admin/feature-flags | Backend API missing (404). Frontend exists, backend routes were never built. | Dispatch dev: GET/POST/PATCH/DELETE /api/admin/feature-flags using FeatureFlag model. Re-QA after migration + deploy. | S487 |
| /admin/reports | Crash fix applied (revenue?.byDay?.length), not yet deployed. | Verify after Vercel build: navigate to /admin/reports as admin, confirm no crash. | S487 |
| #143 PreviewModal onError | Defensive fix only — can't trigger Cloudinary 503 in prod. ACCEPTABLE UNVERIFIED. | N/A | S312 |
| #143 AI confidence — Camera mode | Requires real camera hardware in Chrome MCP. | Real device camera capture → Review & Publish → confirm "Good (X%)" copy. | S314 |
| Single-item publish fix | S326 fix deployed; no DRAFT items exist to exercise button (Manual Entry skips draft pipeline). | Camera-capture → Review & Publish → single Publish → confirm SOLD + toast. | S326/S327 |
| ValuationWidget (S406) | No draft items in user2 sales. Requires TEAMS tier + draft. | TEAMS organizer + draft item → Review → verify ValuationWidget + dark mode. | S406 |
| Treasure Trails check-in (S404) | No trail data in DB. | Create trail → shopper /trails/[id] → check in at stop → verify XP awarded. | S406 |
| Review card redesign (S399) | No draft items for any test organizer. | Camera-capture → Review → confirm Ready/Needs Review/Cannot Publish cards. | S406 |
| Camera thumbnail refresh (S400/S401) | Requires real camera hardware in Chrome MCP. | Capture in rapidfire → confirm thumbnail strip live-updates. | S406 |
| POS camera/QR scan (S405) | Camera hardware required. | Organizer POS → QR tile → scan sticker → confirm added to cart. | S406 |
| ebayNeedsReview amber badge (S464) | Needs migration run + push attempt that exhausts all 5 category suggestions with 25005. | Run migration → push "Whip-It butane" item → confirm badge. | S464 |
| eBay push USED_EXCELLENT condition | Test item has weight=null → NO_FULFILLMENT_POLICY_MATCH before condition logic runs. | Set weight on test item, configure default policy → push → confirm eBay gets USED_EXCELLENT. | S480 |
| eBay push watermark QR (S467) | Needs a successful eBay push to verify photo watermark placement. | Successful push → check eBay listing photos → confirm QR is 85px bottom-right. | S480 |
| Post-Sale eBay Panel (S460/#292) | Needs sale in ENDED status with unsold items. | End test sale → sale detail → verify PostSaleEbayPanel renders, toast, shipping badges. | S460 |
| eBay Listing Data Parity (S462/#293) | 17 new fields built but not Chrome-QA'd. Patrick planned self-QA. | Edit eBay → fill UPC/weight/dims → save → push → verify on eBay. | S462 |
| Live category picker (S463/#294) | Built but not Chrome-QA'd. | Item editor → category search → verify Taxonomy API results + depth levels. | S463 |

---

## Standing Notes

- Railway backend: `https://backend-production-153c9.up.railway.app`
- Vercel frontend: `https://finda.sale`
- Test accounts: user1 (TEAMS), user2 (organizer SIMPLE), user3 Carol Williams (TEAMS), user11 Karen Anderson (shopper, Hunt Pass active), user12 Leo Thomas (shopper). All passwords: `password123`.
- **Survivor accounts (survive database nuke):** Admin → `deseee@gmail.com` | Teams Organizer → `artifactmi@gmail.com`. See `packages/database/prisma/survivor-seed.ts`.
- eBay: production credentials live in Railway. Browse + Trading + Taxonomy + Catalog APIs all live.
- POS test prerequisite: Organizer must have Stripe Connect configured; shopper must be linked via QR scan first.
- DB: Railway PostgreSQL (`maglev.proxy.rlwy.net:13949/railway`) — migration commands in CLAUDE.md §6.
- Backend route mounts: `app.use('/api/organizers', ...)`, `/api/sales`, `/api/trails`, `/api/boosts`, `/api/lucky-roll`.
- **Stripe Connect webhook (P2 — unresolved since S421):** Configure Stripe Dashboard → Events on Connected accounts → `payment_intent.succeeded` → `/api/webhooks/stripe` → Railway `STRIPE_CONNECT_WEBHOOK_SECRET`. Without it, items don't mark SOLD after POS card payment.
- **STATE.md compacted S465 (2026-04-14):** Sessions S428–S449 archived to `COMPLETED_PHASES.md`. Prior compaction S?/2026-04-10 archived S427 and older. ~1350 lines removed this pass.
