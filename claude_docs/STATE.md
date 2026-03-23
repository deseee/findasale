# PROJECT STATE

Compression anchor. Active state only.
Historical detail: `claude_docs/COMPLETED_PHASES.md`

---

## Active Objective

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
