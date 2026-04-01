# PROJECT STATE

Compression anchor. Active state only.
Historical detail: `claude_docs/COMPLETED_PHASES.md`

---

## Current Work

**S370 COMPLETE (2026-04-01):** QA all S369 fixes + 4 bugs fixed. 4 files changed, NOT YET PUSHED.

**S370 QA Results:**
- Dashboard greeting ✅ (ss_4723mliw1, ss_9241d0vbz, ss_7467gghly)
- Settle → dashboard ✅ (ss_4723mliw1, ss_7467gghly, ss_9241d0vbz)
- Settle button /organizer/sales ✅ (ss_0317vf3pv, ss_5667rz7te)
- Settlement wizard + dark mode ✅ (ss_64290amld, ss_4500erofx)
- Holds page dark mode ✅ (ss_5909fjyqw)
- Upgrade guard ⚠️ P1 → FIXED (see below)
- #37 Sale Alerts tab filter ✅ (ss_7662vnzuw, ss_1684z25na, ss_48788fik0); trigger UNVERIFIED (needs organizer publish)
- #29 Loyalty Passport ✅ (ss_4536dwars, ss_1469q7jsn, ss_7611iil7t, ss_84910ix70)
- #213 Hunt Pass CTA ✅ hidden for active user (ss_0386yjbib); CTA state UNVERIFIED (user11 has active pass)

**S370 Bugs Fixed:**
1. **Upgrade guard P1** — `organizer/dashboard.tsx` line 804: changed `tierData.progress.nextTier !== null` → `user?.organizerTier !== 'TEAMS'`. Fix was comparing activity tier (BRONZE/SILVER/GOLD) instead of subscription tier. Now hides "Upgrade →" correctly for TEAMS users.
2. **#199 Profile dark mode P2** — `shoppers/[id].tsx`: 36 lines, added `dark:` variants to all profile cards (`bg-white dark:bg-gray-800`), stat cards (`bg-warm-50 dark:bg-gray-700`), text (`text-warm-600 dark:text-gray-400`), borders, container.
3. **#58 Achievements 401 P1** — `hooks/useAchievements.ts`: replaced bare `fetch()` (no auth headers) with authenticated `api` lib. Root cause: same `fetch` vs `api` pattern that caused other 401s.
4. **#131 Share Templates ❌→FIXED** — QA found SaleShareButton.tsx only had Copy Link + Facebook + Twitter. Added Nextdoor (copy+toast+newsfeed), Threads (intent popup), Pinterest (pin dialog), TikTok (copy+toast+TikTok). `SaleShareButton.tsx` is the component on sale pages (not SharePromoteModal.tsx).

**S370 Files Changed (NOT YET PUSHED):**
- `packages/frontend/pages/organizer/dashboard.tsx` — upgrade guard fix
- `packages/frontend/pages/shoppers/[id].tsx` — dark mode variants
- `packages/frontend/hooks/useAchievements.ts` — auth fix
- `packages/frontend/components/SaleShareButton.tsx` — 4 missing share platforms added

**S369 COMPLETE (2026-04-01):** Dashboard QA fixes shipped. Vercel green. QA done S370.

**S369 Implementation Summary:**
- Greeting: dashboard now shows saleType-aware greeting via `getSaleTypeConfig(activeSale.saleType).greeting` (State 2 active sale)
- Upgrade guard: "Upgrade →" link now hidden when `tierData.progress.nextTier === null` (already on highest tier)
- Settle links: "Settle →" link added to ENDED sales in both dashboard State 3 past-sales list and organizer/sales.tsx card actions
- Dark mode holds: OrganizerHoldsPanel.tsx dark mode contrast fixed
- Build fix 1: `SettlementWizard.tsx` was missing `import Link from 'next/link'` — fixed by S369 dev agent
- Build fix 2: `Sale` interface in `dashboard.tsx` was missing `saleType?: string` — found + fixed this session (strict TS caught it during Vercel build)
- Commits: `8cd4647` (S369 dev fixes), `174811502` (Link import fix), `4f4c438` (cache-bust), Patrick's commit (saleType fix + cache-bust cleanup)

**S368 COMPLETE (2026-04-01):** Dashboard Makeover Phase 1 built + deployed. 8 roadmap items (#228, #230-234, #236-237). Migration deployed to Railway. Code pushed — both Vercel and Railway green.

**S368 Implementation Summary:**
- Schema: 4 new models (SaleSettlement, SaleExpense, ClientPayout, SaleTransaction) + field additions to Sale, Item, Organizer
- Migration: `20260401_settlement_hub_dashboard_widgets` deployed to Railway ✅
- Backend: settlementController (7 functions), settlement routes, 3 widget endpoints on organizer routes, high-value toggle on items, lifecycle endpoint on sales
- Shared: settlement.ts types + CONSIGNMENT/OTHER added to SaleType enum
- Frontend: 6 dashboard widgets (SalePulse, SmartBuyer, HighValueTracker, EfficiencyCoaching, WeatherStrip, PostSaleMomentum), settlement wizard (5-step + simple card), 3 wizard sub-components, settlement page, dashboard integration, edit-sale "Settle" button
- Deploy fixes: Purchase.amount (not totalPrice), Follow.userId (not followerId), WeatherStrip type keys, dashboard saleType type, efficiency-stats route ordering (was caught by /:id catch-all)

**S368 Dashboard QA Issues (from Patrick screenshot — S369 P1):**
- Past Sales card: shows sale but only Reopen button, no link to the sale itself, no other sales/drafts card visible
- Manage Holds card: dark mode styling broken (looks washed out / wrong background)
- Organizer Tier card: still shows "Upgrade →" link, no meaningful tier info displayed
- Widget grid (SalePulse, Who's Coming, High-Value, Efficiency Coach): rendering in "between sales" state when they should only show during active sale — need to verify dashboard state logic
- WeatherStrip: not visible (may be correct — no sale within 10 days)
- PostSaleMomentum: not visible in screenshot — need to check if it renders in State 3
- Nav menus: need full audit against spec to verify all items present
- Sale-type adaptive layout: untested — only ESTATE type exists in current data

**S367 COMPLETE (2026-04-01):** Dashboard bug fixes (5 P1s) + Dashboard Makeover architecture + spec. All pushes confirmed on GitHub.

**S366 COMPLETE (2026-04-01):** Camera P1 QA ✅ verified. Review & Publish mobile card width fixed (4 iterations). Dashboard P1/P2 batch. All orphaned organizer pages wired into nav (19 items). Close Sale Early: confirm dialog + reopen flow added. Eastside Collector's Sale 2 manually restored to PUBLISHED via Railway SQL.

**Pending push — S366 full batch:**
Files: `packages/frontend/pages/organizer/dashboard.tsx`, `packages/frontend/components/Layout.tsx`, `packages/frontend/components/OrganizerTierBadge.tsx`, `packages/frontend/components/OrganizerHoldsPanel.tsx`, `packages/backend/src/controllers/saleController.ts`, `packages/frontend/pages/organizer/add-items/[saleId]/review.tsx`, `claude_docs/STATE.md`, `claude_docs/patrick-dashboard.md`

**Dashboard changes:**
- P1: Close Sale Early → confirm dialog added + ENDED→PUBLISHED transition unlocked for organizers
- P1: Manage Holds dark mode fixed (OrganizerHoldsPanel.tsx)
- P1: Analytics FREE → /organizer/ripples (was /pricing)
- P1: Sale card clickable + quick-actions (View Live, Add Items, Holds, POS)
- P1: Metrics linked (Items Listed → add-items, Active Holds → holds)
- P1: Sale Ripples restored to nav (desktop + mobile, all tiers)
- P1: OrganizerTierBadge BRONZE → "Bronze Organizer", upgrade link removed
- P2: Compact all-sales list (up to 5, View all → /organizer/sales)
- P2: QR Codes route fixed

**Nav wiring (19 orphaned pages):**
Active: messages, profile, settings, payouts, item-library, reputation, message-templates, manage-photos, appraisals, command-center, typology, fraud-signals, workspace
Disabled/coming-soon: inventory, promote, send-update, photo-ops, print-kit, line-queue

**Gamification/Tier research locked:**
- OrganizerTierBadge = Phase 31 fee-benefit tiers (BRONZE/SILVER/GOLD), earned by activity, NOT subscription
- verificationStatus = Feature #16 (separate), reputationTier = Feature #71 (separate, ratings-based)
- OrganizerReputation model in schema for #71. S268 decision: zero shopper gamification cross-pollination.

**S365 COMPLETE (2026-04-01):** Camera UI scroll strip + add-mode fixes.

All changes pushed this session:
- Thumbnail scroll strip: LTR with `paddingLeft: calc(50% + 40px)`, auto-scroll to newest on capture. Photos start right of shutter, grow right, older ones scroll left.
- `+` add-mode stale closure fix: added `onPhotoCapture` to `capturePhoto` useCallback deps — was causing 2nd photo to create new item instead of appending
- `+` disabled on temp-* items (append only works on real DB ids)
- Orphan temp entry removed from carousel after successful append
- `hold-analysis` endpoint: cancels AI debounce timer entirely when + is tapped (organizer repositioning)
- `release-analysis` endpoint: restarts fresh 4.5s debounce when + is turned off
- Frontend: `onAddToItem` fires hold on enter, release on exit

Files changed: `RapidCapture.tsx`, `[saleId].tsx`, `itemController.ts`, `routes/items.ts`

---

**S364 COMPLETE (2026-03-31):** S363 verification + camera mobile refactor + scheduled task backlog + orphaned component wiring.

(1) **S363 verified + pushed (commit 18235d33):** Dead files confirmed gone, TS clean. Caught orphaned `setPreCaptureWarning` call from Batch 1 removal — fixed inline.

(2) **Camera UI mobile refactor (pushed):** Pixel 6a showed viewfinder at ~60% height. Collapsed 3-row bottom into single ~80px band: thumbnails LEFT of shutter, stats shrunk to text-xs, + button transparent outline. BrightnessIndicator: 500ms init delay, null → "Checking light..." placeholder, isActive=cameraReady.

(3) **Scheduled task backlog fixes (pushed commit 63e879ce):** 6 independent fixes — password reset email (authController.ts), SharePromoteModal dynamic sale types, item query pagination cap (take:500), snooze log clarity, .env.example Neon comment.

(4) **.gitignore + doc commit (commit 1a2b5552):** .fuse_hidden* + temp root files gitignored. 28 accumulated doc files committed (audits, health reports, friction audits, competitor intel, UX specs, improvement memos).

(5) **Feature #121 wiring (push block ready — NOT YET PUSHED):** OrganizerHoldsPanel.tsx wired into organizer dashboard (holds summary widget). LeaveSaleWarning.tsx wired into sale detail page (shopper navigation guard). Roadmap updated under Features #146 + #24.

⚠️ **Patrick must push Feature #121 wiring:**
```powershell
cd C:\Users\desee\ClaudeProjects\FindaSale
git add packages/frontend/components/LeaveSaleWarning.tsx
git add packages/frontend/components/OrganizerHoldsPanel.tsx
git add packages/frontend/pages/organizer/dashboard.tsx
git add "packages/frontend/pages/sales/[id].tsx"
git add claude_docs/STATE.md
git add claude_docs/strategy/roadmap.md
git commit -m "feat(#121): wire OrganizerHoldsPanel into dashboard, LeaveSaleWarning into sale detail page"
.\push.ps1
```

⚠️ **#37 notifications.tsx still not pushed** (local only since S359).

---

**S360 COMPLETE (2026-03-31):** Railway TS1127 null byte fix + #48 Treasure Trail Chrome-verified.

(1) **Railway TS1127 unblocked:** Two backend files had null bytes appended from prior MCP pushes in S359. `followerNotificationService.ts` (127 null bytes) + `notificationInboxController.ts` both caused `error TS1127: Invalid character` at EOF, blocking Railway build. Fixed: fetched from GitHub, stripped null bytes, pushed clean versions (commits 1e84c0ab + ea4acf36). Railway went green.

(2) **#48 Treasure Trail ✅ Chrome-verified (ss_5655xvb8r):** Vercel wasn't deploying the S359 MCP commits — Vercel Redeploy re-ran old code, and `push.ps1` returned "Everything up-to-date" (no new push event). Fix: pushed Dockerfile.production cache-bust comment as new commit `5a0eed56` → Vercel webhook fired → deployed. Hard reload confirmed: `GET /api/trails → 200` (was `/api/api/trails → 404`). Trail "Grand Rapids Saturday Run" renders with description, stops, Edit/Delete. Double /api/ prefix root cause: S359 changed `import axios` to `import api` but left path as `/api/trails`; `api` lib has `/api` in baseURL already.

(3) **#37 Sale Alerts:** Backend fixes on GitHub (null bytes stripped = clean versions of followerNotificationService.ts + notificationInboxController.ts). `notifications.tsx` tab styling fix NOT YET PUSHED (local only). Full browser QA not yet done — needs browser test after notifications.tsx push.

S360 commits: `1e84c0ab` (followerNotificationService clean), `ea4acf36` (notificationInboxController clean), `ba619fa7` (trail fix), `900cff4d` (trail /api/ prefix fix), `5a0eed56` (Dockerfile cache-bust)

---

**S359 COMPLETE (2026-03-31):** QA backlog run — 3 features QA'd, 2 bugs fixed.

(1) **#37 Sale Alerts** ❌ BUGS FOUND + FIXED (NOT YET PUSHED): (a) No in-app notification when followed organizer publishes — followerNotificationService.ts fixed. (b) Organizer Alerts tab filter broken — notificationInboxController.ts fixed. (c) Notification page tab styling — notifications.tsx fixed. 3 files ready to push.

(2) **#48 Treasure Trail** ❌ P1 BUG FIXED + PUSHED (commit 1c1896369): Trail create ✅, list ✅, dark mode ✅. Detail page showed "Trail Not Found" immediately — root cause: [trailId].tsx imported bare `axios` (no JWT token) → 401 → HTML redirect → JSON parse fail. Fixed: `import api from '../../../lib/api'` + `api.get('/api/trails')`. 2-line fix, pushed via MCP. Verify in browser as S360 first action.

(3) **#46 Typology Classifier** ⚠️ PARTIAL PASS: All 4 add-items tabs ✅, tab switching ✅, Classify fires + persists ✅ (Retro/Atomic 88%). BUGS: (P2) UI doesn't refresh in-place after Classify (needs page reload). (P2) CSV import broken — Zod `.enum().optional()` doesn't accept empty string `""` from app's own template header → "No valid rows found." Fixed test CSV at `FindaSale/test-import.csv` (no status/auction cols). Backend fix needed.

(4) **#199 User Profile** ⚠️ PARTIAL PASS (light mode only): `/shoppers/cmn9opa330009ij7tqwvt463c` (Bob Smith) loads — name, member since 3/27/26, 12-day visit streak, stats, bio, Message button. Dark mode NOT tested.

Files changed S359 NOT YET PUSHED:
- `packages/backend/src/services/followerNotificationService.ts` (#37 fix)
- `packages/backend/src/controllers/notificationInboxController.ts` (#37 fix)
- `packages/frontend/pages/shopper/notifications.tsx` (#37 fix)

Already pushed via MCP:
- `packages/frontend/pages/shopper/trails/[trailId].tsx` (#48 fix — commit 1c1896369)

**S357 COMPLETE (2026-03-31):** Shopper page consolidation — purchases/receipts/loot-log → /shopper/history. Continuation from S356 context limit.

Changes:
- `packages/frontend/pages/shopper/history.tsx` (NEW — 397 lines): consolidated page with List/Gallery/Receipts view tabs, URL query param `?view=list|gallery|receipts`, fetches all 3 data sources
- `packages/frontend/pages/shopper/loot-log/[purchaseId].tsx` (MODIFIED): back-link updated → /shopper/history, title "My History"
- `packages/frontend/components/Layout.tsx` (MODIFIED): 3 nav entries updated href → /shopper/history, label → "My History"; also fixed truncated `export default Layou` → `export default Layout`
- `packages/frontend/components/AvatarDropdown.tsx` (MODIFIED): 1 nav entry updated href + label
- `packages/frontend/pages/shopper/dashboard.tsx` (MODIFIED): 2 Quick Link buttons (Loot Log + Receipts) → 1 "My History" button

Delete via push block: `purchases.tsx`, `receipts.tsx`, `loot-log.tsx`
Preserved: `loot-log/[purchaseId].tsx` (reused as detail page), `loot-log/public/[userId].tsx` (external share URL)

⚠️ **S356 carry-over still pending push + Railway:**
- ⏳ **#153 Organizer Profile social fields** — code on GitHub (a60e912 + cache-bust 994ba10), Railway not deployed
- ⏳ **#41 Flip Report ownership** — code on GitHub (9ec5ea1), Railway not deployed
- ⏳ **#80 Purchase Confirmation** — `packages/backend/src/controllers/userController.ts` edited locally, NEEDS PUSH

**S355 COMPLETE (2026-03-31):** Live Chrome QA of S344 backlog + 2 bug fixes dispatched. QA results: ✅ #7 Referral — renders at /referral-dashboard (no nav link yet); ✅ #89 Print Kit — toast fires correctly; ✅ #149 Remind Me by Email — fires, toggles to Cancel Reminder; ✅ #62 Digital Receipts — page renders, empty state correct; ❌ #184 iCal — FIXED (changed relative path to NEXT_PUBLIC_API_URL); ⚠️ #41 Flip Report — PRO gate correct for SIMPLE user, ownership bug fixed in code. Files: packages/frontend/pages/sales/[id].tsx (iCal), packages/backend/src/controllers/authController.ts (Hunt Pass JWT), packages/frontend/pages/organizer/dashboard.tsx (dedup stats).

**S354 COMPLETE (2026-03-31):** UX skill rewrite + Dashboard State 2 redesign shipped. (1) **findasale-ux skill researched + rewritten:** New SKILL.md grounded in organizer job-to-be-done (JTBD) framework — 5 core organizer jobs identified, skill now produces specs tied to workflow outcomes not wireframes. (2) **Dashboard State 2 redesigned:** Sale Status Widget rebuilt — full-width, sale title + thumbnail + status badge. Next Action Zone added (single context-aware recommended action). Real-Time Metrics block wired to /api/organizers/stats (items listed, visitors today, active holds). Tier Progress card replaced with Subscription card. Revenue display added from stats API. Files: organizer/dashboard.tsx.

**S353 COMPLETE (2026-03-31):** Dashboard/nav polish + deployment verification + UX skill gap identified. (1) **Dashboard dead space fixed:** Organizer dashboard stats (Items Listed, Visitors Today, Active Holds) now render real data from `statsData` — previously fetched but never mounted. (2) **Nav mirroring fixed:** Mobile hamburger now mirrors desktop AvatarDropdown — organizer collapsibles (YOUR SALES, SELLING TOOLS, PRO TOOLS) + shopper sections (MY COLLECTION, EXPLORE & CONNECT with all subitems + Coming Soon badges) added. Orphaned top-level Payouts/Insights/Workspace removed. (3) **Hunt Pass CTA rank-aware:** INITIATE/SCOUT = XP hook, RANGER = early access hook, SAGE/GRANDMASTER = Collector's League hook. (4) **Deployment confirmed:** All code on GitHub ✅, all migrations deployed ✅, all Railway env vars confirmed set (STRIPE_WEBHOOK_SECRET, MAILERLITE_SHOPPERS_GROUP_ID, RESEND_API_KEY, RESEND_FROM_EMAIL). (5) **UX skill gap identified:** findasale-ux produced workflow specs that still missed organizer job-to-be-done logic. S354 P1 is skill research + rewrite. Dashboard State 2 redesign (remove redundant cards, fix revenue source, replace dead tier progress with subscription card, add Next Action Zone) is ready for dev but blocked on skill fix first — UX spec from this session is in claude_docs/ux-spotchecks/ if needed. Files changed: Layout.tsx, organizer/dashboard.tsx, shopper/dashboard.tsx.

**S352 COMPLETE (2026-03-30):** 4 dispatches across Architect + 3 Dev agents. (1) **#84 ExplorerProfile Architect decision RESOLVED:** Option A confirmed — all gamification fields already exist on User (guildXp, explorerRank, huntPassActive, huntPassExpiry). No schema change needed. Decision doc written to packages/database/prisma/EXPLORER_PROFILE_DECISION.md. (2) **#225 Revenue/Metrics API SHIPPED:** GET /api/organizers/stats built (revenue lifetime/current/this-month, item counts, active sale hold count). Wired into organizer dashboard State 2. Zero TS errors. Files: packages/backend/src/routes/organizers.ts, packages/frontend/pages/organizer/dashboard.tsx. (3) **#226 Pre-wire schema SHIPPED:** persistentInventory + masterItemLibraryId + consignor relation added to Item model. Migration created: 20260330_add_item_prewire_fields. ⚠️ Patrick must deploy this migration to Railway. Files: schema.prisma, migration SQL. (4) **#227 XP Profile SHIPPED:** GET /api/xp/profile already existed — service response shape corrected + GRANDMASTER threshold fixed (10000→5000). Shopper dashboard already wired via useXpProfile hook. File: packages/backend/src/services/xpService.ts. All items pending Chrome QA. Roadmap: #84 resolved, #225/#226/#227 added to Building as Shipped S352.

**S351 Dashboard Redesign COMPLETE (2026-03-30):** 3 parallel dev agents, 7 files changed + 2 new components. (1) **Organizer dashboard (organizer/dashboard.tsx):** Full 3-state redesign — State 1 (new organizer): welcome hero, 3-step path, benefit grid, CTAs; State 2 (active sale): Sale Status Widget (full-width, title/thumbnail/status badge/stats), Next Action Zone (single context-aware recommended action), Quick Stats Grid, Tier Progress card, 6-tool Selling Tools grid, 4 shortcuts; State 3 (between sales): congratulations card, past sales archive. State detection via getDashboardState(). Removed old CollapsibleSection nav dumps. OrganizerOnboardingModal wired: shows once to new organizers (State 1), localStorage gate. (2) **Shopper dashboard (shopper/dashboard.tsx):** State-aware hero (A: new shopper welcome, B: returning shopper with pending payments priority zone), Rank Progress Card with exact spec copy formulas per rank (INITIATE→SCOUT→RANGER→SAGE→GRANDMASTER with XP thresholds, progress bars, "best way to earn" per rank), permanent Streak explainer + StreakWidget, Hunt Pass CTA (only when huntPassActive !== true, 3 benefits, $4.99/mo). Preserved ClaimCard + AchievementBadgesSection. (3) **Guidance layer (5 files):** TooltipHelper.tsx (new — ❓ icon, floating tooltip, dark mode, accessible); OrganizerOnboardingModal.tsx (new — 3-screen: Welcome, Photos matter, You're in control, localStorage gate); pricing.tsx tier inline explainers (SIMPLE/PRO/TEAMS plain-English below names); holds.tsx rank badges (⚔️/🐦/🧗/🧙/👑 per rank, Grandmaster "almost always follows through" copy); reservationController.ts adds explorerRank to organizer holds query. ⚠️ TODO placeholders: revenue API, items count, visitor metrics (not in existing API), ExplorerProfile (not in schema). Roadmap updated: #222 + #223 + #224 → Shipped S351 Pending Chrome QA. Deleted misplaced claude_docs/DASHBOARD_CONTENT_SPEC.md. Files: organizer/dashboard.tsx, shopper/dashboard.tsx, TooltipHelper.tsx (NEW), OrganizerOnboardingModal.tsx (NEW), reservationController.ts, pricing.tsx, holds.tsx, strategy/roadmap.md.

**S351 Photo Capture Protocol COMPLETE (#224, 2026-03-30):** 4 phases, 5 files changed (1 new). (1) **Tiered lighting system:** `checkImageQuality()` upgraded — brightness normalized 0–100; Tier 1 (65–95): silent proceed; Tier 2 (40–65 or >95): soft warning toast with "Use This Photo" + "Retake in Better Light" buttons, no auto-dismiss; Tier 3 (<40): hard modal blocking upload, "Retake" auto-launches camera, "Skip" discards. Replaces the old binary isDark toast. (2) **Shot sequence guidance:** `sessionPhotoCount` tracked per session; `ShotGuideToast` component fires after each upload with contextual copy (shot 1→5 per spec, 4s auto-dismiss, "Review & Tag" appears at shot 3+). (3) **PreviewModal AI confidence copy:** high (≥80%): "We identified this as…" + confidence bar; medium (50–79%): "We think this might be…"; low (<50%): "We couldn't identify this — no problem, tell us." Maker's mark detected copy added. (4) **Pre-capture viewfinder indicator:** `BrightnessIndicator.tsx` (NEW) — samples video feed every 500ms via canvas, shows ●●●●● green / ●●●○○ yellow / ●○○○○ red at top of viewfinder, advisory only. Files: add-items/[saleId].tsx, camera/PreviewModal.tsx, camera/RapidCarousel.tsx, RapidCapture.tsx, camera/BrightnessIndicator.tsx (NEW).

**S350 Design Brief COMPLETE (2026-03-30):** Ground-up dashboard redesign brief + organizer guidance layer + photo capture protocol. (1) **dashboard-redesign-brief-s350.md CREATED:** 5-part spec — state-aware organizer layouts (3 states: new/active/between-sales), state-aware shopper layouts (3 states: new/returning/pending-payment), gamification copy (exact per-rank formulas for Initiate→Grandmaster), 11 shared design rules, innovation recommendations (Sale Momentum feed green-lit). Locked decisions: revenue display on dashboard for all tiers/both, tier progress always-visible-compact, Hunt Pass one-placement/7-day-dismiss, analytics inline+PRO-Flip-Report link. Nav shortcuts added (3–5 most-used features) — not nav-as-primary-content, shortcuts only. Rank Unlock Pathway card replaces decorative leaderboard snippet. Urgency color-coding (red <6h, orange <24h, green healthy). (2) **organizer-guidance-spec-s350.md CREATED:** Feature names unchanged — tooltip/explainer copy lives alongside existing labels. Tooltip library for 20+ features, 4 critical workflow guidance flows, 3-screen onboarding modal, error message rewrites, Explorer's Guild buyer intelligence layer (rank badges on holds = Grandmaster "almost always follows through"). (3) **photo-capture-protocol-s350.md CREATED:** 9-shot sequence (hero, back, sides ×2, maker's mark/label, damage closeup, detail/pattern, scale reference, inside/underside), 3-tier lighting system (Tier 1 proceed silently, Tier 2 soft warning allow, Tier 3 hard warning recommend retake), AI feedback copy (high/medium/low confidence, maker's mark detected, damage detected), 12 item-type guides (furniture through clothing). (4) **Roadmap updated:** #222 (Dashboard Redesign), #223 (Organizer Guidance Layer), #224 (Photo Capture Protocol) added to Building — Active Backlog. ⚠️ claude_docs/DASHBOARD_CONTENT_SPEC.md misplaced (UX agent created at root instead of ux-spotchecks/); cannot delete via shell — Records cleanup needed S351. Files: ux-spotchecks/dashboard-redesign-brief-s350.md (CREATED), ux-spotchecks/organizer-guidance-spec-s350.md (CREATED), ux-spotchecks/photo-capture-protocol-s350.md (CREATED), strategy/roadmap.md (updated).

**S348 Nav/Dashboard Redesign COMPLETE (2026-03-30):** 2 parallel dev agents, 5 files changed. Full nav redesign across Layout.tsx, AvatarDropdown.tsx, TierGatedNav.tsx + tier-aware dashboard sections + shopper gamification widgets. (1) **Dual-role deduplication:** Fixed — "My Profile", "Shopper Dashboard", "My Collections" no longer appear twice for organizer+shopper users. (2) **Icons on all nav items:** lucide-react icons added to every link and section header across both menus (amber for organizer, indigo for shopper, purple for Pro Tools, red for Admin). (3) **Section restructure:** "Your Sales", "Selling Tools", "Pro Tools", "My Collection", "Explore & Connect", "Admin" — consistent across mobile + desktop. (4) **Rank badge in AvatarDropdown:** Static "⚔️ Scout" placeholder with XP mini-bar in dropdown header. TODO comment for real data wire. (5) **Brand voice:** Payouts→Earnings, Typology Classifier→Item Tagger, UGC Moderation→Manage Photos, standalone Explorer's Guild link removed. (6) **Coming soon badges:** Sale Hubs, Virtual Queue, Trades. (7) **Tooltips:** 10 confusing items (Holds, POS, Print Inventory, Brand Kit, Flip Report, Webhooks, Item Tagger, Hunt Pass, Explorer Passport, League). (8) **Admin collapsible:** ShieldAlert icon, red styling, all 7 sub-links, ADMIN-only gate. (9) **Organizer dashboard tier sections:** CollapsibleSection component, 5 tier-gated sections (FREE/SIMPLE/PRO/TEAMS), locked state shows upgrade CTA linking to /pricing, placeholder tier via `// TODO: wire to real tier field`. (10) **Shopper dashboard gamification:** 5 widgets (Streak Tracker, Rank/XP Bar, Recent Achievements, Hunt Pass CTA, Leaderboard Snippet) in responsive grid below quick-links. ⚠️ ExplorerProfile model not in schema — Rank/XP widget uses placeholder with TODO. ⚠️ Leaderboard widget uses static placeholder with TODO for API. Files: Layout.tsx, AvatarDropdown.tsx, TierGatedNav.tsx, organizer/dashboard.tsx, shopper/dashboard.tsx.

**S347 Batch 2 COMPLETE (2026-03-30):** 3 parallel agents, 3 more files changed + roadmap updated. (1) **Roadmap updated:** 7 rows updated to reflect S347 Batch 1 completions (#212, #213, #131, #123, #153, #60, #59). (2) **#75 Tier Lapse — CONFIRMED FULLY IMPLEMENTED (no code change needed):** Audit found complete implementation — tierLapseService.ts, tierLapseJob.ts (8AM + 11PM UTC crons), stripeController.ts handles customer.subscription.deleted + invoice.payment_failed, auth.ts middleware sets req.user.subscriptionLapsed, organizer dashboard lapse banner exists. Feature is code-complete, moving to Chrome QA queue. (3) **#124 Rarity Boost XP Sink UI BUILT:** New RarityBoostModal.tsx (sale picker, 15 XP cost, disabled when insufficient XP); useXpSink.ts updated (saleId param added); loyalty.tsx "Coming Soon" placeholder replaced with functional Rarity Boost card. Backend POST /api/xp/sink/rarity-boost was already complete.

**S347 Batch 1 COMPLETE (2026-03-30):** QA deferred to evening. 4 parallel agents, 8 files changed. (1) **#212 Leaderboard badges FIXED:** leaderboardController.ts now includes top-3 userBadges (id, name, iconUrl) in shopper query; leaderboard.tsx adds `> 0` guard on totalItemsSold display. (2) **#59 Streak Rewards:** StreakWidget was already wired into loyalty.tsx — confirmed no change needed (was already there per S346). (3) **#71 Reputation stray-0 on leaderboard FIXED:** `{org.totalItemsSold > 0 && ...}` guard added to leaderboard.tsx. (4) **#213 Hunt Pass CTA FIXED:** dashboard.tsx Hunt Pass card upgraded — now shows 3 benefits (2x XP, 6h early access, exclusive badge), prominent "Upgrade Now" button to /shopper/hunt-pass, pricing visible ($4.99/mo). Only shows when huntPassActive !== true. (5) **#131 Share Templates FIXED:** SharePromoteModal.tsx — Facebook uses sharer popup, Nextdoor = copy+open newsfeed with toast, Threads uses threads.net/intent/post popup, Pinterest uses pin dialog, TikTok = copy+open with toast. (6) **#60 Premium Tier Bundle IMPROVED:** organizer/pricing.tsx updated with correct prices ($49 PRO, $99 TEAMS) and full feature lists (Flip Report, AI Valuation, CSV Export, Brand Kit, Auto-Markdown, Print Kit, etc). (7) **#123 Explorer's Guild Phase 2 IMPROVED:** loyalty.tsx — XP earn tooltip (+5 visit, +10 scan, +25 purchase), rank threshold display (Initiate→Scout 500→Ranger 1500→Sage 2500→Grandmaster 5000), Hunt Pass "$4.99/month" badge. Layout.tsx — "Loyalty" nav label → "Explorer's Guild". (8) **#153 Organizer Profile IMPROVED:** settings.tsx — Facebook, Instagram, Etsy URL fields added (all exist in schema). PARTIAL items 8 of 14 now addressed.

**S346 Batch 1 COMPLETE (2026-03-30):** TS build fixes + 4 BROKEN items cleared. (1) **TS fixes:** `estimatedValue` (non-existent field) → `price` in userController.ts line 442; `name` → `businessName` in routes/users.ts OrganizerSelect; added `profileSlug`, `collectorTitle`, `purchasesVisible` to AuthContext.tsx User interface (fields exist in schema, were missing from frontend type). Both Railway and Vercel unblocked. (2) **#48 Treasure Trail FIXED:** Dark mode contrast on trail/[shareToken].tsx + stale state after edit save in trails/[trailId].tsx. (3) **#13 TEAMS Workspace FIXED:** Member lookup missing workspace relations in workspaceController.ts + invite error handlers parsing wrong field (`error` vs `message`) in workspace.tsx. (4) **#157 Pickup Scheduling FIXED:** All 4 react-query mutations (PickupBookingCard, PickupSlotManager x2, MyPickupAppointments) were returning full axios response instead of `response.data` — onSuccess callbacks silently received wrong shape. (5) **#46 Typology Classifier FIXED:** Missing ANTHROPIC_API_KEY guard in typologyService.ts batchClassify() + dark mode contrast in TypologyBadge.tsx. BROKEN section now clear of all P1 code bugs.

**S346 Batch 2 COMPLETE (2026-03-30):** 5 PARTIAL features improved. (1) **#199 User Profile:** Bid status was hardcoded `PARTICIPATING` in routes/users.ts — now returns real DB value (ACTIVE/WINNING/WON/LOST). Hunt Pass section added to profile.tsx. Push notification toggle moved from profile.tsx to shopper/settings.tsx. (2) **#58 Achievement Badges:** New `AchievementBadgesSection.tsx` component wired into dashboard.tsx, loyalty.tsx, explorer-passport.tsx — badges were only rendering on /shopper/achievements. (3) **#59 Streak Rewards:** Was already on loyalty page per code check — no fix needed. (4) **#29 Loyalty Passport:** Copy rewritten to Explorer's Guild narrative — XP earn guide (Scan +10, Visit +5, Purchase +25), tier names (Initiate/Scout/Ranger/Sage/Grandmaster), coupon/rarity boost explainers updated. (5) **#177 Sale Detail:** Reviews moved inside Organized By card, platform fee display gated to auction items only, item cards now aspect-square with uniform height.

**S345 COMPLETE (2026-03-30):** roadmap.md Decisions Needed cleanup. Removed 9 signed-off features from ## Decisions Needed (kept #82 + #83 legal items). Re-slotted: #188, #49, #64, #122 → UNTESTED Pending Chrome QA; #149/#174/#200 were already in correct sections (no change needed). #90 Sale Soundtrack → Deferred > Advanced Organizer Features. #69 Local-First Offline Mode → Deferred > Infrastructure & Platform. QA deferred per Patrick.

**S344 Batch 2 COMPLETE (2026-03-30):** 5-agent parallel bug-fix + feature batch. (1) **#174+#80 Phase 1+2 shipped:** auctionJob.ts reserve price check (16-line block — if reserve not met, item moves to AUCTION_ENDED + organizer notified); /purchases/[id].tsx new 400+ line persistent confirmation page (hero, item details, pickup info, order details, status badges, auction buyer premium 5%); CheckoutModal now captures purchaseId and redirects to /purchases/${id}; checkout-success.tsx backward-compat redirect added. (2) **#184 iCal FIXED:** Express route ordering fix in routes/sales.ts — /:id/calendar.ics moved before generic /:id catch-all. (3) **#41 Flip Report FIXED:** null-safety on bestCategory.category + itemsSold division-by-zero guard in flipReportService.ts; enhanced error logging in flipReportController.ts. (4) **#7 Referral FIXED:** missing return statements before res.json() on lines 26+38 of referralController.ts — API was hanging silently, frontend showed 0. (5) **#89 Print Kit FIXED:** frontend was POSTing to /organizer/sales/{id}/print-kit (wrong prefix) — corrected to /organizers/{id}/print-kit in print-inventory.tsx. (6) **#62 Digital Receipts FIXED:** receiptController.getMyReceipts now queries Purchase model (status: PAID) directly instead of DigitalReceipt which had no auto-created records. Response shape preserved (issuedAt mapped from createdAt). (7) **#50 Loot Log:** NOT a code bug — user11's purchases are PENDING not PAID. Loot Log correctly filters PAID only. No fix needed.

**S344 COMPLETE (2026-03-30):** 5-agent parallel roadmap batch. (1) **P2 cleanup:** XP language fixed on 3 remaining components (HuntPassModal, TreasureHuntBanner, StreakWidget). EmptyState dark mode contrast added. D-001 "Estate Sale" placeholder copy fixed. (2) **city-heat-index.tsx:** Replaced Coming Soon stub with redirect to /cities per locked decision #49. (3) **#149 Email Reminders frontend:** RemindMeButton enhanced — copy → "Remind me by email", toggle-off "Cancel Reminder" state added, disabled for ended/cancelled sales, dark mode fixed. Wired into sales/[id].tsx replacing inline button. (4) **#200 Shopper Public Profiles full stack:** schema.prisma + new migration (profileSlug @unique, purchasesVisible Boolean @default(true), collectorTitle String?), backend GET /shoppers/:id + PATCH /users/me extended, /shoppers/[id].tsx UI (avatar, rank, collectorTitle badge, recent finds grid), shopper/settings.tsx Public Profile section (title dropdown, slug input, visibility toggle). **Patrick must deploy migration 20260330_add_shopper_profile_fields to Railway.** (5) **#64 My Collections full consolidation:** Favorites tab removed from shopper/dashboard.tsx, BottomTabNav + Layout.tsx nav updated to /shopper/wishlist, /shopper/favorites + /shopper/alerts already redirect from S343. Nav now unified. (6) **Architect spec #174+#80:** Full spec in claude_docs/architecture/AUCTION_WIN_SPEC.md. Key finding: no schema changes needed — all fields exist. Code-only, 3-phase plan (auctionJob+reserve ~3-4h, /purchases/[id] page ~2-3h, organizer UI deferred).

**S343 Part 2 COMPLETE (2026-03-30):** Guild Phase 1 wrap-up + My Collections + BUSINESS_PLAN.md fix. (1) **Guild Items 6 & 7 schema shipped:** SourcebookEntry model (author/sale/organizer FKs, @@unique per author+target, 3 indexes) + Sale.prelaunchAt DateTime? + index added to schema.prisma. Migration SQL at `migrations/20260330_add_sourcebook_and_prelaunch/migration.sql` — Patrick must deploy to Railway manually per CLAUDE.md §6. prisma validate ✅ TypeScript ✅. (2) **Hunt Pass trial banner wired (loot-legend.tsx):** Amber banner, useState dismiss (no localStorage), POST /api/hunt-pass/trial on CTA, toast on success, silent 409 hide. Only shows if huntPassActive !== true. TS ✅. (3) **#64 My Collections shipped:** Renamed Saves/Wishlist → "My Collections" on 6 surfaces (wishlist.tsx, wishlists.tsx, AvatarDropdown.tsx, Layout.tsx, ActivitySummary.tsx, dashboard.tsx). Added collections stub UI (All Saves pill + "+ New Collection" Coming Soon toast). No backend changes. TS ✅. (4) **BUSINESS_PLAN.md truncation fixed:** Last two lines were cut off — restored "Quarterly)" + Author line. (5) **roadmap.old.md:** 179-line deletion confirmed as intentional prior cleanup — including in push block.

**S343 COMPLETE (2026-03-30):** Polish + Guild wiring + architect decisions. (1) **CLAUDE.md §12 hard rule added:** STATE.md + patrick-dashboard.md must always be first two `git add` lines in every wrap push block — fixes the push.ps1 abort that ended S342. (2) **Visit XP frontend wired:** `useEffect` in `sales/[id].tsx` fires `POST /api/sales/:id/visit` on page load (auth-gated, fire-and-forget). Backend was complete from S342. (3) **Sale Soundtrack removed:** `SALE_TYPE_PLAYLISTS` constant + JSX render block deleted from `sales/[id].tsx` (−69 lines). Locked decision: return as organizer-side inline player. (4) **P2 cleanup shipped (11 files):** Points→XP on 9 UI surfaces (hunt-pass.tsx, dashboard.tsx). Messages dark mode contrast fixed (dark:text-gray-300 on empty state). Estate Sale placeholder copy fixed on 6 organizer forms. (5) **Architect approved Items 6 & 7:** SourcebookEntry schema approved with changes (@@unique per author+sale, @@unique per author+organizer, named relations, backend exactly-one-of enforcement). Sale.prelaunchAt nullable DateTime approved. Dev dispatch ready for S344. (6) **#149 confirmed correct** — no stale copy found. (7) **#49 city-heat-index.tsx** — Coming Soon stub, /cities page is the feature. Needs `git rm` in S344 (no nav links). (8) **Hunt Pass trial banner (loot-legend.tsx)** — analysis complete, NOT implemented. S344 P2.

**S342 COMPLETE (2026-03-30):** Roadmap decisions (9 features) + Explorer's Guild Phase 1 foundation + hold bug fix. (1) **Hold bug fixed:** Organizers were blocked from placing holds on ANY sale. Fixed — HoldButton blanket organizer gate removed; backend now only blocks organizer from holding their OWN sale's items. Files: HoldButton.tsx, reservationController.ts. (2) **Explorer's Guild Phase 1 — 5 of 8 items shipped:** P0 scan cap (100 XP/day + duplicate scan prevention), Visit XP wired (POST /api/sales/:id/visit, once/sale/day), Explorer's Guild nav link added to shopper dropdown, 3-screen onboarding modal (localStorage-gated, shows once), Sage threshold lowered 4000→2500 for beta, Hunt Pass 7-day trial backend endpoint. Files: xpService.ts, itemController.ts, saleController.ts, userController.ts, sales.ts, users.ts, AvatarDropdown.tsx, loyalty.tsx. (3) **Phase 1 items deferred to S343:** Item 6 (Sourcebook Editor — needs SourcebookEntry schema), Item 7 (Early Bird 48h — needs Sale.prelaunchAt field), Item 8 frontend (Hunt Pass trial banner in Loot Legend). (4) **Roadmap decisions locked (10 items):** #174+#80 merged (Auction Win + Persistent Purchase Confirmation, payment at winning bid), #200 spec complete, #188 resolved (pages work, stale note), #90 deferred to organizer-side, #49 consolidate into /cities, #64 UX spec complete, #149 copy fix dev pending, #69 deferred, organizer hold = bug (fixed). Full details in decisions-log.md. (5) **Visit XP + Hunt Pass trial frontend wiring** still needed — backend complete, useEffect call in sales/[id].tsx + trial banner in Loot Legend page. S343 P2.

**S339 COMPLETE (2026-03-29):** Hold notification system + 5 bug fixes + product direction. (1) **Hold notification system shipped:** Shopper gets in-app Notification + Resend email on approve/cancel/extend/release via `updateHold` and `batchUpdateHolds`. New `sendHoldStatusToShopper()` in saleAlertEmailService.ts covers 4 action types (confirmed/cancelled/extended/released) with tailored copy and CTA. (2) **Organizer in-app notification on hold placed:** `placeHold` now creates Notification record for organizer (was email-only). (3) **Bug fix — "Item already has active hold" after cancel:** `itemId @unique` on ItemReservation blocked new holds when old CANCELLED/EXPIRED record existed. Fix: `deleteMany` stale records inside placeHold transaction before creating new reservation. (4) **Bug fix — batch extend used 48h hardcoded:** Changed to rank-based `getHoldDurationMinutes()` using shopper's `explorerRank`. Added `explorerRank` to user select in batch query. (5) **Bug fix — markSold notification copy:** Removed incorrect "Thank you for your purchase!" — replaced with neutral "marked as sold by the organizer." (6) **Toast duration ✅ CONFIRMED:** Patrick tested manually — toast fires for full 10 seconds. Removed from unverified queue. (7) **Product direction logged:** Patrick wants markSold to evolve into POS cart integration (for POS organizers) or Stripe invoice/checkout link (for non-POS organizers). Logged for architect spec in future session. Files: reservationController.ts, saleAlertEmailService.ts.

**S332 COMPLETE (2026-03-28):** Hold Button #13 full board review + design finalization + foundation implementation. (1) **Board session unanimous GO (12/12 + 1 advisory):** DA + Steelman + Hacker + Advisory Board all dispatched on abuse/fraud risk, business model, gamification angle, organizer control. Unanimous recommendation: GO with rank-gated durations (no Hunt Pass paywall, no deposit required). (2) **Design finalized:** QR check-in primary, GPS fallback by sale type (outdoor/flea 150m, indoor estate 250m, large/auction 400m). En route grace for shoppers within 10mi but outside geofence (limited holds: Initiate/Scout 1, Ranger 2, Sage/Grandmaster 3). Hold duration by rank: Initiate/Scout 30min/1 hold, Ranger 45min/2 holds, Sage 60min/3 holds, Grandmaster 90min/3 holds. Natural expiry at timer end + navigate-to-different-sale prompt (no continuous GPS polling). Organizer controls: per-sale `holdsEnabled` toggle, view/cancel/extend/edit all active holds. Business model: rank-gated free, no Hunt Pass gate, no deposit. (3) **Architecture spec produced (400+ lines):** staged in VM, locked designs for GPS haversine, QR validation, fraud detection, organizer settings, cron expiry 10min. (4) **Foundation shipped (5 files):** schema (SaleCheckin + OrganizerHoldSettings), migration, reservationController.ts (GPS/QR/fraud/rate-limit gates), 3 new routes (placeHold, checkHoldStatus, organizer endpoints), cron 30min → 10min. (5) **4 P1 gaps remain for S333:** GPS radii by sale type (built flat 100m, needs 150/250/400m), rank-based hold duration (not implemented), en route logic (not implemented), per-sale holdsEnabled toggle (not added to Sale model). Frontend HoldButton + OrganizerHoldsPanel stubs not pushed. (6) **ItemCard.tsx TS fixes:** photoUrls cast + _count cast (union type UnifiedItemCardItem | Item) shipped. Files: ItemCard.tsx (cast fixes), schema.prisma (models), migration, reservationController.ts, routes/reservations.ts, jobs/reservationExpiryJob.ts, decisions-log.md (6 decisions logged).

**S331 COMPLETE (2026-03-28):** Desktop nav search + map sale type filter + edit-sale cover photo. (1) **Desktop nav search ✅ VERIFIED** — Layout.tsx updated. Search icon in nav bar expands to input on click, collapses on Escape/blur. Submits form to `/?q=<term>`. Chrome-verified working (ss_62400ab1c, ss_1378f5bto). (2) **Map sale type filter ✅ VERIFIED** — map.tsx updated with filter pills (All Types / Estate / Yard / Auction / Flea Market / Consignment). Chrome-verified: Estate → 15 sales, Auction → 0 sales (ss_1871l57bx → ss_3209bt61b → ss_57862pvhm). (3) **Edit-sale cover photo section ✅ (CODE-VERIFIED, NOT YET BROWSER-TESTED)** — NEW SaleCoverPhotoManager.tsx component + edit-sale/[id].tsx integration. Section visible in form with upload/preview/remove buttons. (4) ⚠️ **Cover photo useState bug found:** Component uses `useState(initialPhotoUrl)` which only reads the value at mount time. When formData loads async from API, the component doesn't update — seeded photo doesn't show. Fix: add `useEffect` hook to sync state when `initialPhotoUrl` changes. P2 for S331. (5) ⚠️ **Cover photo save behavior:** Currently saves immediately on upload (bypasses "Save Changes" button). Decision pending: should hold in formData and commit only on Save Changes. P2 for S331.

**Decisions logged:**
- Sale cover photo: 1 photo only (not a gallery). Index 0 of `photoUrls[]` array.
- Remind Me: email reminders backend is built. "Push reminders coming soon" copy is stale — should say "Remind me by email."

**Resolved this session:**
- ✅ P2 draft counter mismatch — FIXED: backend `getItemsBySaleId` wasn't returning `draftStatus` field. Added to select clause. Frontend `computeDraftStatus` now uses real DB value instead of guessing.
- ✅ QA Test Item cleanup — deleted via live site UI.
- ✅ Single-item Publish button — VERIFIED WORKING via camera capture → AI tag → Review & Publish → Publish.
- ✅ conditionGrade + tags not loading on Edit Item page — FIXED: `getItemById` select clause was missing both fields. Chrome-verified: grade "B" highlighted correctly.
- ✅ Edit Item / Review & Publish parity — Added Condition Grade, Tags, Suggest Price, Publish/Unpublish to Edit Item page.

**S341 (2026-03-30):** Hold-to-Pay full feature shipped (Railway ✅ Vercel ✅). (1) **Strategic planning:** Innovation, Investor, Game Design, Legal agents all reviewed the Hold-to-Pay monetization opportunity. Key finding: Remote Invoice path is the highest-ROI feature (closes cash-at-pickup fee bypass, ~$5K/month incremental at 50 organizers). 7 architecture decisions locked in decisions-log.md. (2) **Phase 1 — Schema + migration:** HoldInvoice model, InvoiceStatus enum, invoiceId FK on ItemReservation, flashLiquidationEnabled on OrganizerHoldSettings, User/Sale inverse relations. Migration 20260330_add_hold_invoice deployed to Railway. (3) **Phase 2 — Backend:** POST /reservations/:id/mark-sold (bundled Stripe Checkout), GET /reservations/my-invoices, GET /invoices/:invoiceId, GET /items/:itemId/invoice-status, POST /reservations/:id/release-invoice, Stripe webhook handlers (checkout.session.completed → PAID + XP, charge.failed → retry). Bundling: one consolidated invoice per shopper per sale. (4) **Phase 3 — Frontend:** HoldToPayModal.tsx (organizer), ClaimCard.tsx (shopper dashboard, amber/gold), HoldInvoiceStatusCard.tsx (item detail). items/[id].tsx and shopper/dashboard.tsx updated. (5) **Fee model correction** logged: platform fee (10%/8%) is organizer-paid, not shopper-paid. Shoppers pay item price only. Decisions-log.md updated. (6) **Roadmap #221 updated.** Files: schema.prisma, migration, reservationController.ts, reservations.ts, stripeController.ts, HoldToPayModal.tsx, ClaimCard.tsx, HoldInvoiceStatusCard.tsx, items/[id].tsx, shopper/dashboard.tsx, decisions-log.md, roadmap.md.

## Blocked/Unverified Queue

| Feature | Reason | What's Needed | Session Added |
|---------|--------|----------------|---------------|
| #143 PreviewModal onError | Code fix pushed (sha: ffa4a83). 📷 fallback on Cloudinary 503 in place. | Defensive fix only — can't trigger 503 in prod. ACCEPTABLE UNVERIFIED. | S312 |
| #143 AI confidence — Camera mode | cloudAIService.ts fix is code-correct; processRapidDraft passes aiConfidence through. Can't test without real camera hardware in Chrome MCP. | Real device camera capture → Review & Publish → confirm "Good (X%)" or similar. | S314 |
| Single-item publish fix | S326 code fix deployed. S327 confirmed API call fires but no DRAFT items exist to test the button. Manual Entry creates AVAILABLE items, skipping draft pipeline. | Camera-capture an item → go to Review & Publish → click Publish on single item → confirm status changes + toast. | S326/S327 |
| Mark Sold → POS/Invoice evolution | Patrick wants markSold to become POS cart item (POS organizers) or Stripe checkout link (non-POS organizers). | Architect spec needed — touches POS, Stripe, holds, notifications, checkout flow. Future session. | S339 |

**S326 COMPLETE (2026-03-28):** 3 bugs fixed + 1 test item cleanup. (1) **P1 Buyer Preview placeholder — ROOT CAUSE FIXED:** `buildCloudinaryUrl()` in review.tsx was replacing `:` with `_` in aspect ratio transforms (`ar_4_3` → Cloudinary rejects). Removed the `.replace(':', '_')` so it sends correct `ar_4:3`. Chrome-verified: Buyer Preview grid now shows real Cloudinary photos (ss_7201mwej2, ss_6354i4qpv). (2) **Face-detection blob URL fix (secondary):** `handleFaceUploadAnyway` in [saleId].tsx was storing blob URLs instead of Cloudinary URLs returned by API. Now stores `res.data.photoUrl`. (3) **P1 Single-item Publish button — FIXED:** `handlePublishItem` was sending `draftStatus` via generic PUT `/items/:id`, but backend `updateItem` didn't include `draftStatus` in destructured fields — silently dropped. Fix: frontend now uses dedicated `POST /items/:itemId/publish` endpoint for publishing, generic PUT for unpublishing (with `draftStatus` added to backend's accepted fields). Also relaxed publish gate to allow DRAFT + PENDING_REVIEW items (was PENDING_REVIEW-only). NEEDS CHROME VERIFY after deploy. (4) **P2 Nav search — already working:** S322/S323 fixed this. Desktop has no nav search (mobile-only) — logged as P3 gap. (5) **Test item cleanup:** Deleted 2 of 3 test lighters per Patrick, kept 1. Sale now has 14 items. Files: review.tsx, [saleId].tsx, itemController.ts. Pushblock provided.

**S321 COMPLETE (2026-03-28):** Nav full audit + homepage fixes. (1) Review Item modal thumbnail fixed: `thumbnailUrl` dropped during ID swap in [saleId].tsx (lines 701, 757) — now preserved so review modal shows captured photo instead of placeholder. (2) Desktop dropdown full nav audit: added Organizer Tools + Pro Tools collapsible sections (were missing entirely); normalized all links to `px-3 py-2 rounded-md`; added `text-sm` to TierGatedNav.tsx both link states. (3) Shopper menu parity: desktop dropdown had only About/Settings/Sign Out for shopper users — added Shopper Dashboard, My Profile, My Saves, Referrals, Host a Sale CTA, My Explorer Profile collapsible (10 links). (4) Dual-role: "My Dashboard" → "Shopper Dashboard" in mobile; both dashboards shown for dual-role users. (5) Homepage search: itemSearchService.ts now queries item tags + sale tags via PostgreSQL `@>` — "eames", "mid century", "rolex" now searchable. (6) Sales Near You card: redesigned as 2-column layout, sale counts by type, full card links to /map. Files: [saleId].tsx, AvatarDropdown.tsx, Layout.tsx, TierGatedNav.tsx, itemSearchService.ts, index.tsx. All pushed.

**S322 COMPLETE (2026-03-28):** Edit-sale form fixes + bulk publish gate fix. (1) SaleMap restored to Sales Near You card (S321 removed it); collapsed text to single footer line. (2) Homepage search wired to `/api/search?q=...` FTS endpoint — was filtering client-side only; now finds items by name/tags/description. (3) `getSaleType()` fixed to read `sale.saleType` DB field instead of parsing tags. (4) Sale type select dropdown added to edit-sale form. (5) PickupSlotManager dark mode pass. (6) Pro gate on edit-sale fixed: try/catch swallows 403 from markdown-config endpoint so SIMPLE users can save. (7) Save Changes button added at top of form. (8) Form reset bug fixed: `refetchOnWindowFocus: false` + `queryClient.invalidateQueries` on save. (9) Entrance note dark mode fixed in EntrancePinPickerInner.tsx. (10) Root cause of non-saving fields found: `notes`, `treasureHuntEnabled`, `treasureHuntCompletionBadge` were not in `saleCreateSchema` Zod — Zod stripped them silently. Added all 3. (11) `notes` field added to Sale model in schema.prisma + migration `20260328_add_sale_notes`. (12) Review & Publish PRO gate fixed: `POST /items/bulk` was `requireTier('PRO')` — SIMPLE users couldn't publish items. Changed to `requireTier('SIMPLE')`. Files: edit-sale/[id].tsx, EntrancePinPickerInner.tsx, saleController.ts, schema.prisma, migration (NEW), items.ts.

**S323 COMPLETE (2026-03-28):** QA session — S322 verification + 2 bug fixes + Chrome concurrency rule. (1) Edit-sale field persist ✅ — entrance note, approach notes, treasure hunt all saved and reloaded correctly as SIMPLE user (ss_0940ajm6p/ss_2627ysx2a/ss_5529i8hqh). No PRO gate. (2) Review & Publish Publish All — UNVERIFIED (all seeded items are AVAILABLE, Publish All only shows with DRAFT items). (3) Nav menus: Organizer collapsibles ✅, shopper links ✅. P2 bug fixed: duplicate Logout in mobile nav — Layout.tsx had a bare Logout button in `authLinks` AND another in the global footer section; removed the one from `authLinks`. (4) Homepage search ✅ — FTS wired and working: "chair" returns 5 results with item cards, photos, prices, "View Sale →" links. (5) Sales Near You card ✅ — map loads, "View on Map →" links to /map. (6) Search results below-fold UX fixed: index.tsx now auto-scrolls to results heading when query ≥2 chars. (7) Chrome concurrency rule added to CLAUDE.md §10c + findasale-qa.skill packaged. Files: Layout.tsx, index.tsx, CLAUDE.md.

**S349 Nav/Dashboard Pass COMPLETE (2026-03-30):** Continued nav audit from S348 feedback. 4 files changed. (1) **P0 dual-role regression fixed:** AvatarDropdown.tsx + Layout.tsx — Shopper Dashboard was hidden for dual-role users behind `!isOrganizer` condition. Now always shows for users with USER role + "As a shopper" label for dual-role context. (2) **P0 Webhooks regrouped:** Moved from Pro Tools to new TEAMS-gated "Developer Tools" collapsible in both AvatarDropdown.tsx + Layout.tsx. (3) **Mobile nav rewritten:** Removed 8 dead items (UGC Moderation, Typology Classifier, Fraud Signals, Offline Mode, Command Center, Appraisals, Sale Ripples, Item Library). Now matches desktop: amber/purple/indigo sections, icons on all items, MY COLLECTION + EXPLORE & CONNECT collapsible for shoppers. (4) **Organizer dashboard cleaned:** Community defaultOpen=true. "How It Works" gated to zero-sales organizers. Duplicate Creator Tier card removed. "Plan a Sale — Coming Soon" card removed. Webhooks removed from dashboard button grid. (5) **Shopper dashboard dead space removed:** Nav shortcut buttons compacted. Empty "Saved Sales Coming Up" section hidden. "Welcome to FindA.Sale!" gated to zero-purchase users. Duplicate stat cards removed. Sales Near You hides on error. ⚠️ **Design quality assessment (Patrick):** Organizer dashboard is C+ — structured as navigation-menu-on-page rather than data/job-to-be-done dashboard. Gamification is D — rank/XP shows state but not motivating next action. S350 needs ground-up dashboard design brief before any more dev. Files: AvatarDropdown.tsx, Layout.tsx, organizer/dashboard.tsx, shopper/dashboard.tsx.

---

**S354 COMPLETE (2026-03-31):** findasale-ux skill rewrite + Dashboard State 2 redesign shipped. (1) **findasale-ux skill rewritten:** Added 4 mandatory gates — Job-to-be-Done gate (must answer "what is the user trying to DO in 30-60s" before any layout), Code-First gate (read API/schema before speccing any data), Action-First Section rule (every section needs a user action or gets cut), No-Redundancy check (no duplicate nav links as dashboard cards). Ran 3-eval A/B test (new vs old skill), generated static eval viewer, packaged as findasale-ux.skill. Patrick installed. (2) **Dashboard State 2 redesign shipped:** organizer/dashboard.tsx + organizers.ts route updated. Sale Status Widget: urgency tags (red <6h, orange <24h), context-aware primary button (Add Photos / Publish Sale / Close Early / Manage Items). Next Action Zone: 6-condition logic tree (draft+items, high holds, ending soon, draft items, traffic-no-holds, healthy). Real-Time Metrics Panel: LIVE 4-col (items/visitors/holds/sold) vs DRAFT 3-col (drafted/with photos/ready to publish), wired to real statsData. Selling Tools: static 6-item → dynamic 4-item state-aware grid (DRAFT vs LIVE tools, tier gates). Tier card: full card → compact single-line badge + link. Earnings/payout alert: conditional green banner when cashFeeBalance > 0. 2 TS fixes applied (urgency null narrowing, arithmetic ?? unreachable). Files: packages/backend/src/routes/organizers.ts, packages/frontend/pages/organizer/dashboard.tsx.

---

**S358 COMPLETE (2026-03-31):** Vercel/Railway unblocked + #153/#41/#80 fully QA verified.

(1) **Vercel build fix:** `shopper/dashboard.tsx` was truncated at line 640 from a prior MCP push — `<>` fragment at line 192 had no closing tag. Fixed by restoring complete closing structure. TS check: zero errors on that file.

(2) **Railway unblocked:** S357 push triggered "Dockerfile does not exist" transient error. Cache-bust comment pushed to `Dockerfile.production` → Railway went green.

(3) **QA #153 ✅ VERIFIED:** Navigated to `/organizer/settings` Profile tab as user2. Facebook/Instagram/Etsy URL fields present, typed values, saved — toast confirmed, page reload confirmed persistence.

(4) **QA #41 ✅ VERIFIED:** Navigated to `/organizer/flip-report/[saleId]` as user3 (Carol Williams, TEAMS). Page rendered with revenue/items data — no 403. Correct route is `/organizer/flip-report/[saleId]` not `/organizer/sales/[id]/flip-report`.

(5) **QA #80 ✅ VERIFIED:** `/shopper/history` as user11 — all 3 bugs fixed and confirmed in Chrome. Cards show: "Vintage Typewriter #5 / From: Priority Estate Sales / 3/28/2026 / $430.59 / PENDING". Details:
- **Field mapping:** `purchase.itemTitle/organizerName/purchasedDate` → `purchase.item.title`, `purchase.sale.organizer.businessName`, `purchase.createdAt`
- **Gallery fix:** `useLootLog` was calling `/api/loot-log` (double prefix → `/api/api/loot-log` 404). Fixed to `/loot-log`.
- **ReceiptCard dark mode:** Added `dark:` variants throughout (was hardcoded `bg-white`/`text-gray-900`).
- **Thumbnails:** List view now shows `purchase.item.photoUrls[0]` thumbnail with 🏷️ placeholder.
- **Root date bug:** `convertDecimalsToNumbers` in `userController.ts` was missing `instanceof Date` guard — Date objects have no enumerable keys so recursive call returned `{}`. Fixed.
- **Null bytes:** Stripped from `userController.ts`, `useLootLog.ts`, `ReceiptCard.tsx` (pre-existing from prior MCP pushes, caused TS1127 errors).

Files changed S358:
- `packages/frontend/pages/shopper/dashboard.tsx` — truncation fix
- `packages/backend/Dockerfile.production` — cache bust
- `packages/frontend/pages/shopper/history.tsx` — field names + thumbnails + card layout
- `packages/frontend/hooks/useLootLog.ts` — double /api/ prefix fix + null bytes stripped
- `packages/frontend/components/ReceiptCard.tsx` — dark mode + null bytes stripped
- `packages/backend/src/controllers/userController.ts` — instanceof Date guard + null bytes stripped

All pushed. Vercel ✅ Railway ✅.

---

**S361 COMPLETE (2026-03-31):** Camera UX + P3 fixes + null byte sweep.

(1) **AI tagging flow fixed (P1):** Root cause: S351 tiered lighting checks + shot guidance all rendered in page JSX, invisible behind full-screen camera overlay. Fix: quality overlays moved INSIDE RapidCapture via `qualityOverlay` prop. `pollForAI(itemId)` added — polls `GET /items/:id` every 3s for 30s, updates carousel badge DRAFT→PENDING_REVIEW. `processAndUploadRapidPhoto()` no longer blocks flow: Tier 2 shows toast + continues, Tier 3 no longer calls `setCameraOpen(false)`.

(2) **Brightness threshold false positives fixed:** Tier 3 `< 40` fired on all normal indoor photos. Lowered to `< 15` (pitch black only). Normal indoor photos (avg 25–97%) now solidly Tier 1.

(3) **Camera UX improvements shipped:**
- "→ Pub" button removed from RapidCapture.tsx thumbnail strip (was redundant with Review button + thumbnail tap)
- Thumbnails enlarged: `w-20 h-20` → `w-24 h-24` (96×96px)
- "+" button enlarged: `w-6 h-6` → `w-8 h-8` with `text-lg`
- Green "Ready ✓" strip added at bottom of PENDING_REVIEW thumbnails (full-width, `bg-green-500/90`)
- Title/category truncate widths updated to `w-24`
- Auto-enhance: confirmed working (`brightness(1.15) saturate(1.1)`), ✨ badge correct

(4) **P3 fixes shipped (local only — in Patrick's push block):**
- `itemController.ts`: CSV Zod empty string → `undefined` conversion
- `settings.tsx`: Business name loads from `/organizers/me` API
- `[saleId].tsx`: Brightness threshold lowered

(5) **Null byte sweep (global):** `find ... | xargs perl -pi -e 's/\x00//g'` run across all .ts/.tsx files in frontend + shared. tsconfig.json also fixed. Zero TS1127 errors remaining (only pre-existing [trailId].tsx JSX tag mismatch unrelated). useTypology.ts was already fixed via MCP (commit e6e71fde, S361 earlier).

Files changed S361:
- `packages/frontend/pages/organizer/add-items/[saleId].tsx` — brightness fix + pollForAI + quality overlay prop
- `packages/frontend/components/RapidCapture.tsx` — → Pub button removed, qualityOverlay prop added
- `packages/frontend/components/camera/RapidCarousel.tsx` — thumbnails larger, + button larger, Ready ✓ strip
- `packages/backend/src/controllers/itemController.ts` — CSV Zod fix
- `packages/frontend/pages/organizer/settings.tsx` — biz name fix
- `packages/frontend/hooks/useTypology.ts` — null bytes + UI refresh invalidation (pushed via MCP e6e71fde)
- Null bytes stripped from many frontend/shared files (ActivityFeed.tsx, ActivitySummary.tsx, tsconfig.json, tagVocabulary.ts, + others via batch)

---

**S362 COMPLETE (2026-03-31):** Camera QA (partial) + smart crop architecture + repo wipe recovery.

(1) **Camera QA (desktop) ✅ Chrome-verified:** Rapidfire opens, Tier 2 brightness soft warning fires ("Lighting is soft. We'll still try."), photo captures, "Analyzing item with AI…" toast appears, counter updates 0→1, green badge on thumbnail, Review(1) updates. "→ Pub" button confirmed absent. Mobile layout responsive. Thumbnails noticeably larger. Tier 2 = soft continue, Tier 3 = hard block. All core AI flow verified on desktop.

(2) **Smart crop architecture decided:** Upload original always, Cloudinary delivers per context: `c_fill,ar_1:1` for grid (square), `c_fill,ar_3:4` for item detail (portrait), `c_fill,ar_4:3` for preview (landscape). Phase 2: add bounding box request to Haiku AI call for crop centering. Canvas crop approach rejected — would lose original.

(3) **Camera UI improvements shipped (in push block):**
- RapidCapture.tsx: Review button → bottom-left 3-zone flex layout, useless left thumbnail removed from Rapidfire
- RapidCarousel.tsx: "+" button 32px→48px, centered bottom of strip, always visible
- imageUtils.ts: `getLandscape4x3Url()` and `getPortrait3x4Url()` added alongside existing `getThumbnailUrl()`
- ItemCard, LibraryItemCard, ItemSearchResults, ItemListWithBulkSelection, RecentlyViewed, InspirationGrid: applied `getThumbnailUrl()` for 1:1 square grid context
- `pages/items/[id].tsx`: applied `getPortrait3x4Url()` for item detail main photo

(4) **CRITICAL: Repo wipe recovered.** `3ceae665` deleted 1,483 files on push (second occurrence this project). Recovery: `git reset --hard cadddf6e` + `git push origin main --force` via Patrick's PowerShell. 10 S362 files saved to VM temp before reset, restored to disk. Pushblock provided — Patrick must run it. Root cause locked in CLAUDE.md §5: subagent git ban (hard rule).

Files changed S362 (in push block — NOT YET COMMITTED):
- `packages/frontend/components/RapidCapture.tsx`
- `packages/frontend/components/camera/RapidCarousel.tsx`
- `packages/frontend/lib/imageUtils.ts`
- `packages/frontend/components/ItemCard.tsx`
- `packages/frontend/components/LibraryItemCard.tsx`
- `packages/frontend/components/ItemSearchResults.tsx`
- `packages/frontend/components/ItemListWithBulkSelection.tsx`
- `packages/frontend/components/RecentlyViewed.tsx`
- `packages/frontend/components/InspirationGrid.tsx`
- `packages/frontend/pages/items/[id].tsx`

---

## Next Session (S371)

### S371 Priority 1 — Push S370 fixes + smoke verify (mandatory)
Patrick must push S370 first (push block below). After push and Vercel deploys:

1. **Upgrade guard** — Log in as user3@example.com (TEAMS). Verify "Upgrade →" link is GONE. (Fixed: now checks `user?.organizerTier !== 'TEAMS'`)
2. **#199 Profile dark mode** — Navigate to `/shoppers/cmn9opa330009ij7tqwvt463c` in dark mode. Verify no white cards or washed-out stat labels.
3. **#58 Achievements** — Log in as user11@example.com, navigate to `/shopper/achievements`. Verify page loads (was 401).
4. **#131 Share Templates** — Navigate to any published sale, click Share button. Verify Nextdoor, Threads, Pinterest, TikTok options now appear.

### S371 Priority 2 — Unverified queue
- **#37 Sale Alerts trigger** — Need organizer to publish a sale while user11 is logged in. Test: log in as user11, then in a separate tab as user2 and publish a sale — check user11's notification inbox for in-app alert.
- **#213 Hunt Pass CTA** — Find/use a shopper with `huntPassActive = false` to verify CTA card shows 3 benefits + "Upgrade Now" button. (user11 has active pass, couldn't test CTA state.)

### Standing Notes
- All Railway env vars ✅. All migrations deployed ✅.
- Railway backend: https://backend-production-153c9.up.railway.app
- Test accounts: user2 (organizer SIMPLE), user3 Carol Williams (TEAMS), user11 Karen Anderson (shopper, Hunt Pass active), user12 Leo Thomas (shopper). All passwords: password123
- S366 push block still PENDING (see S366 entry above)

### S361 Priority 2: Continue QA backlog
- **#37 Sale Alerts** — after notifications.tsx push deploys: navigate to notification inbox as shopper, verify Alerts tab shows only followed-organizer sale alerts (not all notifications)
- **#199 User Profile dark mode** — `/shoppers/cmn9opa330009ij7tqwvt463c` in dark mode; `bg-warm-50` has no `dark:` variant
- **#58 Achievement Badges** — `/shopper/achievements` page + dashboard widget showing real badge data
- **#29 Loyalty Passport** — `/shopper/loyalty` XP earn guide + rank thresholds
- **#213 Hunt Pass CTA** — visible for non-pass users, hidden when `huntPassActive=true`
- **#131 Share Templates** — Facebook sharer popup, Nextdoor copy+open, Threads intent, Pinterest pin, TikTok copy+open

### S361 Priority 3: P2 dev dispatches (carry from S360)
- **CSV import broken** — Zod `.enum().optional()` rejects empty string `""`. Fix: pre-process `""` → `undefined` in CSVImportModal.tsx before Zod
- **Typology classify no UI refresh** — invalidate item query on classify mutation success
- **Business Name blank** — organizer settings Profile tab field not loading from API on open
- **Social fields on public organizer profile** — `facebookUrl` etc. not verified rendering at `/organizers/[id]`
- **#177 Buy Now modal UX gap** — modal shows no item name or price; needs findasale-ux spec

### S361 Notes
- All Railway env vars ✅. All migrations deployed ✅. Sage threshold 2500 XP (beta only).
- Railway backend URL: https://backend-production-153c9.up.railway.app
- Test accounts: user2 = organizer (SIMPLE), user3 = Carol Williams (TEAMS), user11 = Karen Anderson (shopper), user12 = Leo Thomas (shopper). All passwords: password123
- Null byte pattern: MCP-pushed files accumulate null bytes at end. Strip with `content.rstrip(b'\x00')` before pushing. TS1127 = null bytes.
- `test-import.csv` is in `FindaSale/` workspace folder (Patrick's computer) for manual CSV import testing.
- camera workflow: add-items/[saleId].tsx → RapidCapture.tsx → PreviewModal.tsx → AI classification → confidence display. S351 added BrightnessIndicator.tsx + tiered lighting + shot sequence. Suspect: lighting gate or restructured state broke AI call feedback loop.

