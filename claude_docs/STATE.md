# PROJECT STATE

Compression anchor. Active state only.
Historical detail: `claude_docs/COMPLETED_PHASES.md`

---

## Active Objective

**Session 261 COMPLETE (2026-03-24) — PHASE 2 ARCHITECT SIGN-OFF + SKILL BIAS FIXED + GAME DESIGNER AGENT:**
- ✅ **Dashboard copy** — already correct from S260 ("Manage your sales and track earnings." line 301). No new change needed.
- ✅ **Skill bias fixed** — findasale-ux + findasale-qa SKILL.md updated and repackaged. findasale-dev was already clean. Patrick needs to install findasale-ux.skill + findasale-qa.skill via Cowork UI.
- ✅ **Phase 2 architect sign-off complete** — all 7 schema decisions approved/modified. Key finding: ItemRarity enum + FraudSignal table already exist — no new tables needed for those. New additions: `User.guildXp`, `User.explorerRank`, `User.seasonalResetAt`, `RarityBoost` table, extended `PointsTransaction` + `Coupon`. Single migration file, all LOW risk. Handoff: `claude_docs/feature-notes/explorer-guild-phase2-architect-S261.md`.
- ✅ **7 game design decisions locked** — all resolved by new findasale-gamedesign agent (Patrick not asked). Hunt Pass free-forever at Grandmaster; flat +2% rarity boosts; no XP sink caps; Jan 1 UTC seasonal reset; optional Loot Legend photos; no organizer fee discounts; email-only referral verification; price-bracket rarity guide with auto-adjustment.
- ✅ **findasale-gamedesign skill created** — reusable game designer agent for future XP/rarity/rank questions. Packaged and ready to install.
- 📋 **Carry-forward:** Brand drift batch (P0 SEO + P1 copy, 14 files, approved but not dispatched). Phase 2 dev dispatch (fully unblocked — Patrick runs migration first).
- Last Updated: 2026-03-24

**Session 260 COMPLETE (2026-03-23) — RPG SPEC LOCK + EXPLORER'S GUILD PHASE 1 COPY:**
- ✅ **RPG economy spec complete** — all 8 open decisions resolved. `claude_docs/research/gamification-rpg-spec-S260.md` created. Seasonal reset floors, streak XP formula, Sage payoffs (Sourcebook/Early Bird/Sage Coupon), wins-only auction XP, honor-system social share, 3 XP sinks, 4-tier rarity system (Common/Uncommon/Rare/Legendary) all locked.
- ✅ **Agent prompt bias fixed** — global CLAUDE.md + project CLAUDE.md + findasale-innovation SKILL.md + findasale-advisory-board SKILL.md all updated to "secondary sale organizers (estate sales, yard sales, auctions, flea markets, consignment)."
- ✅ **Roadmap updated** — #122 (Explorer's Guild Phase 1, copy/rebrand, no schema) and #123 (Phase 2, XP economy, schema) added to `claude_docs/strategy/roadmap.md`.
- ✅ **Explorer's Guild Phase 1 copy dispatched + complete** — 5 frontend files updated: collector-passport.tsx (Collector→Explorer labels), loyalty.tsx (collect→explore language), OnboardingWizard.tsx (estate sale bias removed), Layout.tsx (nav "My Collection"→"My Explorer Profile"), dashboard.tsx (🏺→🗺️, "Collection"→"Explorer"). TypeScript clean.
- ✅ **`/organizer/onboarding` 404 clarified** — NOT a bug. OnboardingWizard is a modal component (fixed inset-0 overlay), not a page route. No fix needed.
- 📋 **Carry-forward:** Dashboard copy "Manage your estate sales" (1 line, dispatch findasale-dev). findasale-dev/ux/qa SKILL.md bias not confirmed (zip archives — flag for skill-creator pass). Phase 2 XP economy (roadmap #123, requires schema changes, multi-session).
- Last Updated: 2026-03-23

**Session 259 COMPLETE (2026-03-23) — SMOKE TEST + GAMIFICATION DEEP DIVE:**
- ✅ **S258 smoke test (9/10 PASS)** — My Saves, trending buttons, inspiration footer, collector-passport dark mode, contact form, TreasureHuntBanner dismiss, ActivitySummary dark mode, domain strings, /pricing redirect all confirmed live. User2 login failed → organizer pages (/organizer/onboarding, /organizer/pricing) UNVERIFIED — carry forward.
- ✅ **2 bugs fixed + pushed (commit efe96ee):** Purchases tab now clickable (Link wrapper, dark mode classes). YourWishlists.tsx dark mode fixed (hardcoded `bg-white` → `dark:bg-gray-800` + all text/badge classes corrected).
- ✅ **Explorer's Guild gamification spec complete** — 6 research docs in `claude_docs/research/`. Board reviewed + issued CONDITIONAL APPROVAL.
- ✅ **Phase 1 APPROVED (3 mods):** (1) Rebrand "Collector's Guild"→"Explorer's Guild". (2) 8 micro-events at launch (not 16+). (3) Legal review on Sage presale access ToS language.
- ✅ **Phase 2 NO-GO** until organizer reward redesign — fee discounts rejected unanimously. Approved alternative rewards: featured placement, service credits, API access (TEAMS-gated), community perks.
- ✅ **Game design research complete:** Soft reset (annual January) confirmed, weekly streaks over daily, Loot Legend as Sage alternative payoff.
- ✅ **XP economy researched:** 25 XP sources tabled. Flat per-item (not dollar-tied). Top viral accelerators: referrals, auction wins, photo uploads of finds, social shares.
- 📋 **8 game designer decisions still open** — see next-session-prompt.md for full list
- ⚠️ **Patrick design direction (S260):** Loot Legend should NOT be gated — all users get a shareable collection page; earned items populate it. Coupons + auction fees are available as reward/redemption currency. RPG economy research needed (loot tables, XP sinks, item rarity). Abuse prevention design required before dev dispatch.
- ⚠️ **Agent prompt bias fix NOT done** — carry forward from S259. Still need to update CLAUDE.md + SKILL.md files to say "secondary sale organizers" not "estate sale operators."
- Last Updated: 2026-03-23

**Session 258 COMPLETE (2026-03-23) — UX BATCHES + ONBOARDING + STRATEGIC INITIATIVES:**
- ✅ **Dev Batch A (shopper pages)** — 6 UX fixes shipped: AvatarDropdown "My Wishlists"→"My Wishlist", contact page copy shortened, inspiration page double footer removed, trending page wishlist/favorite button added to item cards, typology page dark mode text fix, collector-passport.tsx dark mode class added.
- ✅ **Dev Batch B (functional fixes)** — 6 fixes shipped: TreasureHuntBanner dismiss button + localStorage persistence (`onboarding_dismissed_at`), ActivitySummary skeleton dark mode fix, contact form subject field added, `findasale.com`→`finda.sale` domain fix in 4 files (admin/invites.tsx, tags/[slug].tsx, AddToCalendarButton.tsx, contact.tsx), SD6/SD8/FR1 confirmed already correct (no changes needed).
- ✅ **Dev Batch C (organizer onboarding)** — OnboardingWizard.tsx restructured to 5-step flow (Email Verification stub → Business Profile → Stripe → Create Sale → Success stub). Step progress indicator added ("Step X of 5"). localStorage dismissal tracking added. OrganizerOnboardingModal.tsx removed (legacy). _app.tsx OrganizerOnboardingShower removed.
- ✅ **Q2 My Saves consolidation** — wishlist.tsx restructured: 3 tabs→2 tabs (Items + Sellers). Page renamed "My Saves". AvatarDropdown.tsx, Layout.tsx, ActivitySummary.tsx nav labels updated to "My Saves".
- ✅ **Q3 Premium page consolidation** — /organizer/pricing.tsx created (new consolidated discovery page, all tiers, Stripe CTAs, current plan highlight). /pricing.tsx converted to redirect → /organizer/pricing. /organizer/premium.tsx and /organizer/upgrade.tsx already redirecting from prior sessions.
- ✅ **Advisory Board reviewed 3 strategic questions:** Gamification (Patrick rejected deletion approach), Feature overlap Q2 (Approved), Premium pages Q3 (Approved).
- ✅ **Innovation Agent produced 3 gamification narrative concepts:** Treasure Map Collector's Guild (rank: Initiate→Scout→Ranger→Sage→Grandmaster), Antiquarian's Collection Quest (prestige/expertise), Estate Sale Seasonal Challenge Circuit (seasonal resets). Recommendation: blend Concepts 1+3 with more research next session.
- ⚠️ **Patrick feedback logged:** Agent prompts inject "estate sale" bias — platform serves estate sales, yard sales, auctions, flea markets, consignment. Next session: fix agent prompt bias toward "secondary sale organizers." Removal gate tone too quick to delete — need real justification beyond "couldn't think of narrative."
- 📋 **S259 PRIORITY 1 (MANDATORY):** Smoke test all S258 changes live via Chrome MCP (finda.sale) — per CLAUDE.md §10
- 📋 **S259 PRIORITY 2:** Gamification narrative session — blend Concepts 1+3, research competitive inspiration, produce unified spec before dev work
- 📋 **S259 PRIORITY 3:** Fix agent prompt bias in CLAUDE.md or relevant skills — "secondary sale organizers" not just "estate sale operators"
- 📋 **S259 PRIORITY 4:** Guild narrative copy/label implementation — once narrative finalized + Patrick approves
- Last Updated: 2026-03-23

**Session 256 COMPLETE (2026-03-23) — UX POLISH BATCH + SD4 FIX:**
- ✅ SD4 FIXED — `/api/streaks/profile` now returns `streakPoints`, `visitStreak`, `huntPassActive`, `huntPassExpiry` from User model (was only returning UserStreaks table data). Commit `b7b05c3`.
- ✅ OD1/OD2 — Nav labels updated: "My Dashboard"→"Shopper Dashboard", "My Profile"→"Organizer Profile", "My Dashboard"→"Organizer Dashboard". Commit `6dafd59`.
- ✅ OV3 — Payouts link added to organizer nav dropdown. Commit `6dafd59`.
- ✅ S3 — shopper/settings.tsx double footer fixed (nested Layout wrapper removed). Commit `6dafd59`.
- ✅ H5 — ThemeToggle added to desktop header (was mobile-only). Commit `af48ac2`.
- ✅ SD5 — Hunt Pass info card added to shopper dashboard Overview tab top; Upgrade button tooltip added. Commit `af48ac2`.
- ✅ SD7 — "Browse upcoming sales" EmptyState nudge repositioned after ActivitySummary. Commit `af48ac2`.
- ✅ PR2 — Points/tier explainer text added to profile.tsx under Hunt Pass section. Commit `af48ac2`.
- ✅ CP2 — Help text added for Specialties and Keywords on collector-passport.tsx. Commit `af48ac2`.
- ✅ WH1 — Testing help text (RequestBin, ngrok, Zapier) added inside webhook form. Commit `af48ac2`.
- ✅ OV2 — Duplicate Reputation Score card removed from organizer dashboard. Commit `af48ac2`.
- ✅ ODB1 — POS button promoted to primary action area above the fold on organizer dashboard. Commit `af48ac2`.
- ✅ UX specs created: `claude_docs/ux-spotchecks/S256-UX-SPECS-41-items-onboarding.md` + `S256-UX-HANDOFF.md`
- ⚠️ **Live QA not yet run** — MANDATORY first task S257: smoke test all S256 changes via Chrome MCP (finda.sale)
- ⚠️ **Remaining from S256 spec:** SD1 (tab restructure — complex), LY1-LY10 (gamification — strategic), P4 (17 strategic items → advisory/innovation), remaining Tier 2+ UX batches from S256-UX-SPECS
- Last Updated: 2026-03-23

**Session 255 COMPLETE (2026-03-23) — BUG FIX BATCH + DECISIONS:**
- ✅ `/organizer/profile` → redirect to `/organizer/settings` (profile page retired, D-confirmed)
- ✅ `/organizer/inventory` → "Coming Soon" Persistent Inventory stub (deferred post-beta)
- ✅ `/organizer/premium` → redirect to `/organizer/subscription`
- ✅ Organizer dashboard double modal fixed (single modal on fresh load)
- ✅ Bids page photo placeholder (fallback shown when photoUrls empty)
- ✅ All 5 QA checks PASS — verified live via Chrome MCP
- ✅ Persistent Inventory added to roadmap.md deferred section
- ✅ Confirmed: all 29 S248 bugs + 8 dark mode violations resolved
- ⚠️ Remaining S248: SD4 (streak/points data) + P2 (organizer onboarding flow)
- **S256 PRIORITY 1:** 41 UX items from S248 → findasale-ux spec → parallel dev batches
- **S256 PRIORITY 2:** Organizer onboarding flow — findasale-ux spec first, then findasale-dev
- **S256 PRIORITY 3:** SD4 streak/points data fix
- **S256 PRIORITY 4:** 17 strategic S248 items → advisory board / innovation
- Last Updated: 2026-03-23

**Session 253 COMPLETE (2026-03-23) — S252 SMOKE TEST CONTINUATION + 3 BUG FIXES:**
- ✅ **3 dev fixes pushed** (commit 011d18b): `/api/bids` route created (GET, auth, Prisma nested select, computed status active/winning/outbid/closed), `/organizer/upgrade` → `/pricing` redirect (D-012), `authLimiter` max raised 50→100
- ✅ **Rate limiter fix deployed** — confirmed live (Railway/Vercel "A new version is available" banner appeared mid-session)
- ✅ **Item 8 PASS** — /organizer/settings loads with full write controls (7 tabs, editable fields, Save Changes)
- ✅ **Items 10a/b/c PASS** — /shopper/loyalty, /shopper/collector-passport, /shopper/bids each exactly 1 footer
- ✅ **Item 5 re-verify PASS** — /shopper/bids now renders bid data (Tiffany Lamp $320, Ansel Adams Print $280 visible)
- ✅ **S253-P1 /organizer/sales PASS** — 1 footer, page loads correctly
- ✅ **S253-P2 dashboard tabs PASS** — Overview/Sales tab switching works desktop + mobile 375px
- ❌ **Item 7 FAIL** — /organizer/profile 404s (page doesn't exist)
- ❌ **Item 9b FAIL** — /organizer/premium renders own legacy pricing page, does NOT redirect to /organizer/subscription
- ⚠️ **S253-P1 /organizer/inventory BLOCKED** — 404s, can't test footer
- **5 P1 bugs found in QA:**
  1. `/organizer/profile` — 404 (page doesn't exist)
  2. `/organizer/premium` — no redirect to `/organizer/subscription` (legacy page still rendering)
  3. `/shopper/bids` — item photos missing (0 img elements in DOM, alt text only)
  4. Organizer dashboard — double onboarding modals stack simultaneously (every fresh load as user2)
  5. Shopper onboarding modal "Skip" — navigates to `/login` instead of closing modal
- **2 P2 bugs found in QA:**
  6. `/organizer/premium` — feature comparison list text invisible (checkmarks visible, text blank)
  7. `/organizer/inventory` — 404 (page doesn't exist)
- ⚠️ **S254 PRIORITY 1:** Fix `/organizer/premium` → redirect to `/organizer/subscription` (same getServerSideProps pattern as upgrade.tsx, ~10 lines)
- ⚠️ **S254 PRIORITY 2:** Fix bids photos (investigate `photoUrls` in seeded items + verify `/api/bids` response includes populated URLs)
- ⚠️ **S254 PRIORITY 3:** Fix double onboarding modals on organizer dashboard
- ⚠️ **S254 PRIORITY 4:** Fix shopper "Skip" button navigating to `/login`
- ⚠️ **DECISION NEEDED:** `/organizer/profile` 404 — create read-only page, redirect to `/organizer/settings#profile`, or clean up any nav links pointing here?
- ⚠️ **DECISION NEEDED:** `/organizer/inventory` 404 — create page, redirect to `/organizer/sales`, or clean up links?
- Last Updated: 2026-03-23

**Session 252 COMPLETE (2026-03-23) — LIVE SMOKE TEST + DECISIONS EXECUTED:**
- ✅ **Smoke test COMPLETE** — Verified login, homepage, dashboard, loyalty passport, collector passport, leaderboard all passing live
- ✅ **5 bugs fixed in live test:** Loot Log blank (API response transform), Dashboard tabs (router.push + hash), /shopper/notifications 404 (NotificationBell nav), /shopper/bids 404 (created page), TreasureTrail auth bug (useTrails hook axios call)
- ✅ **All D-012 through D-016 decisions executed:** Pricing copy updated, CTAs consolidated, Profile/Settings split verified, Shopper settings scoped correctly
- ✅ **Wishlist consolidation LIVE** — `/shopper/wishlist` unified page (3 tabs: Saved Items, Collections, Watching), nav updated, `/shopper/favorites` + `/shopper/alerts` now redirect to wishlist
- ✅ **Sale Interests moved to shopper settings** (D-012 final step) — moved from organizer profile to `/shopper/settings` as "Followed Organizers" (Patrick authorized)
- ✅ **Double footer root cause found + fixed** — shopper pages had individual Layout wrappers causing duplication with _app.tsx Layout. Fixed: loyalty, collector-passport, alerts, trails, bids (5 files).
- ✅ **TR1/OP1/OS3 confirmed NOT bugs** — TR1 (Create Trail 404) = route works, OP1 (Verification) = correctly routes to settings?tab=verification, OS3 (Workspace URL) = /workspace/[slug] works
- Last Updated: 2026-03-23

**Session 250 COMPLETE (2026-03-23) — SEED DATA OVERHAUL:**
- ✅ **S249 item-library.tsx Vercel fix** — `user?.organizerProfileId` → `user?.id` (commit d12fb1b). Vercel confirmed GREEN.
- ✅ **Seed data overhaul COMPLETE** — All 14 DATA items from S248 walkthrough now covered. seed.ts rewritten (828 lines). Seed ran clean on Neon with zero errors.
  - 100 users, 10 organizers (3 tiers: 1×SIMPLE admin, 1×PRO, 1×TEAMS), 25 sales, 308 items (3 auction)
  - 54 purchases (6 for user11), 9 bids (user11 active bidder), 8 badge types, wishlists + alerts, follows + smart follows
  - Notifications (6 types), TreasureTrail (3-stop GR loop), ShopperStamps + milestone, CollectorPassport
  - Referral chain (user12→user11→user13), 3 MissingListingBounties, UserStreaks, OrganizerReputations
  - PointsTransactions, Conversations + Messages, 3 FraudSignals (admin command center)
  - Stripe-enabled: user2 (PRO) + user3 (TEAMS) have stripeConnectId + stripeCustomerId
- Last Updated: 2026-03-23

**Session 249 COMPLETE (2026-03-23) — WALKTHROUGH BUG + DARK MODE FIX BATCH:**
- ✅ **18 bug fixes shipped:** FAQ characters (F1-F3), shopper tier message (P1), access denied redirect (P7), search expanded to items+organizers (H4), leaderboard organizer links (L8), contact form submit (C2), "sales near you" error state (SD3), dashboard stat buttons navigate (SD6), follow seller end-to-end (SD9), workspace domain→finda.sale (OS2), flip report empty state (FR1), item library auth fix (IL1), print inventory verified (PI1)
- ✅ **8 dark mode violations fixed:** SD2 (overview), SD8 (pickups), M4 (route builder), AL2 (alerts), TY1 (typology), PY1 (payouts), ST1 (sales tab), H13 (organizer pages pass)
- ⚠️ **Carry-forward:** Double footers (I2, CP3, LY11, AL5, TR2, S3) + TR1/OP1/OS3 missing routes — decisions needed from Patrick
- Last Updated: 2026-03-23

**Session 248 COMPLETE (2026-03-23) — REMOVAL GATE + 114-ITEM WALKTHROUGH AUDIT:**
- ✅ **Vercel deployment verified GREEN** — all S247 commits deployed successfully
- ✅ **Security triage:** C1 (admin verification routes), H1 (JWT fallback), H2 (/api/dev) — all already fixed in codebase. Health report from 03-22 was pre-fix.
- ✅ **CLAUDE.md §7 Removal Gate added:** Subagents must return "DECISION NEEDED" blocks instead of executing removals. Orchestrator triages FIX/REDIRECT/REPLACE silently; only REMOVE goes to Patrick.
- ✅ **D-010 added to DECISIONS.md:** "No Autonomous Removal of User-Facing Content" — standing decision with tightened dead-code exemption ("not wired into nav" ≠ dead).
- ✅ **findasale-dev skill updated:** §17 Removal Gate added. Packaged as .skill for install.
- ✅ **findasale-qa skill updated:** Decision Point Protocol added. Packaged as .skill for install.
- ✅ **114-item walkthrough findings documented:** Patrick's full-site walkthrough organized into S248-walkthrough-findings.md. Categories: 29 BUG, 8 DARK, 41 UX, 14 DATA, 17 STRATEGIC, 5 DUP.
- ⚠️ **Patrick action needed:** Install findasale-dev.skill and findasale-qa.skill via Cowork UI
- Last Updated: 2026-03-23

**Session 247 COMPLETE (2026-03-23) — ROLE-BASED NAV FIX + ORGANIZER PROFILE + DESTRUCTIVE REMOVAL PATTERN:**
- ✅ Root cause found and fixed for organizer profile blank since S237
- ✅ AvatarDropdown, Layout.tsx, profile.tsx, AuthContext.tsx all updated
- ✅ Vercel build fix pushed (fcfa835)
- Last Updated: 2026-03-23

**Session 246 COMPLETE (2026-03-23) — SHOPPER QA SCAN + CRITICAL BUILD HOTFIXES:**
- ✅ QA scan: 14 items tested (9 passed, 1 fixed, 1 inconclusive, 3 unverified)
- ✅ B1 Favorites fix pushed (Array.isArray guard)
- ✅ HOTFIX: profile.tsx stray `>` + auth.ts `requireAdmin`
- Last Updated: 2026-03-23

---

**Pricing Model (LOCKED):**
- **SIMPLE (Free):** 10% platform fee, 200 items/sale included, 5 photos/item, 100 AI tags/month
- **PRO ($29/month or $290/year):** 8% platform fee, 500 items/sale, 10 photos/item, 2,000 AI tags/month, unlimited concurrent sales, batch operations, analytics, brand kit, exports
- **TEAMS ($79/month or $790/year):** 8% platform fee, 2,000 items/sale, 15 photos/item, unlimited AI tags, multi-user access, API/webhooks, white-label, priority support, **12-member cap (D-007 LOCKED)**
- **ENTERPRISE (Custom, $500–800/mo):** Unlimited members, dedicated support, SLA (D-007 LOCKED)
- **Overages:** SIMPLE $0.10/item beyond 200; PRO $0.05/item beyond 500; TEAMS $0.05/item (soft cap)
- **Shopper Monetization:** 5% buyer premium on auction items ONLY; Hunt Pass $4.99/mo (PAUSED); Premium Shopper (DEFERRED to 2027 Q2)
- **Post-Beta:** Featured Placement $29.99/7d, AI Tagging Premium $4.99/mo (SIMPLE), Affiliate 2-3%, B2B Data Products (DEFERRED)
- **Sources:** pricing-and-tiers-overview-2026-03-19.md (complete spec), BUSINESS_PLAN.md (updated), b2b-b2e-b2c-innovation-broad-2026-03-19.md (B2B/B2C strategy)

**DB test accounts (Neon production - current):**
- `user1@example.com` / `password123` → ADMIN role, SIMPLE tier organizer
- `user2@example.com` / `password123` → ORGANIZER, PRO tier ✅
- `user3@example.com` / `password123` → ORGANIZER, TEAMS tier ✅
- `user11@example.com` / `password123` → Shopper

---

## Active Infrastructure

### Connectors
- **Stripe MCP** - query payment data, manage customers, troubleshoot payment issues. Connected S172.
- **MailerLite MCP** - draft, schedule, and send email campaigns directly from Claude.
- *CRM deferred - Close requires paid trial. Spreadsheet/markdown for organizer tracking until beta scale warrants it.*

### Scheduled Automations (11 active)
Competitor monitoring, context freshness check (weekly Mon), UX spots, health scout (weekly), monthly digest, workflow retrospective, weekly Power User sweep, daily friction audit with action loop (Mon-Fri 8:38am), weekly pipeline briefing (Mon 9am), session warmup (on-demand), session wrap (on-demand). Managed by findasale-records + findasale-workflow + findasale-sales-ops agents.
