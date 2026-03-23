# PROJECT STATE

Compression anchor. Active state only.
Historical detail: `claude_docs/COMPLETED_PHASES.md`

---

## Active Objective

**Session 246 COMPLETE (2026-03-23) — SHOPPER QA SCAN + CRITICAL BUILD HOTFIXES:**
- ✅ **QA scan: 14 items tested** across Groups A, B, C, D (findasale-qa agent, Chrome MCP)
  - A1–A4 (Loot Log, Loyalty, Trails, Collector Passport): ✅ Pages load, empty states render correctly for user11 (zero data, as expected)
  - B1 (Favorites tab): ✅ Fixed — Array.isArray guard in dashboard.tsx queryFn; tab was showing empty despite card showing "1 Saved Items"
  - B2 (Subscribed tab): ✅ Verified — shows empty (0 follows), dynamic loading confirmed
  - B3 (Purchases tab): ⚠️ PARTIAL — button present, full tab not clicked through
  - B4 (Pickups tab): ⚠️ PARTIAL — button present, full tab not clicked through
  - B5 (Overview tab): ✅ Verified — cards render correctly (0 Purchases, 1 Saved Items, 331 Points)
  - B6 (6 quick-link buttons): ✅ All 6 navigate correctly (Collection, Loyalty, Alerts, Trails, Loot Log, Receipts)
  - C1 (/profile missing buttons): ⚠️ INCONCLUSIVE — page loads, no edit/save buttons in header. Unclear if expected. Needs Patrick clarification: are edit buttons (name/bio/photo) a gap, or on /settings?
  - D1 (message reply E2E): ❌ UNVERIFIED — conversation links in /messages inbox not navigating to thread pages. Root cause unclear (Chrome MCP limitation vs. routing issue).
- ✅ **dashboard.tsx (B1 fix):** Favorites queryFn Array.isArray guard — guarantees `.favorites` array, never returns full API response object. Pushed commit 8b04b15.
- ✅ **messages/index.tsx:** Dark mode CSS cleanup on conversation list items. Pushed commit 8b04b15.
- ✅ **profile.tsx (dark mode):** Dark mode consistency improvements. Pushed commit 8b04b15.
- ✅ **HOTFIX — profile.tsx stray `>` removed:** S246 dev agent introduced a stray `>` between `</div>` and `</td>` in the bids table — broke Vercel JSX parse. Fixed and pushed commit 8918a51. Vercel rebuilding.
- ✅ **HOTFIX — auth.ts `requireAdmin` added:** S244 added `requireAdmin` import in verification.ts but never added the function to auth.ts — broke Railway TypeScript build. Fixed and pushed commit 7bf292e. Railway rebuilding.
- ⚠️ **CARRY-FORWARD:** /profile missing edit buttons — Patrick must clarify: should profile page have name/bio/photo editing, and is it on /settings instead?
- ⚠️ **CARRY-FORWARD:** D1 message reply E2E (organizer → shopper both sides) — still unverified
- ⚠️ **CARRY-FORWARD:** B3/B4 (Purchases, Pickups tabs) — tabs present, content not fully tested
- ⚠️ **CARRY-FORWARD:** Dark mode full pass — not tested in S246 (session time constraints)
- ⚠️ **CARRY-FORWARD:** L-002 (mobile viewport 375px) — carry-forward from S244
- ⚠️ **CARRY-FORWARD:** M2 (13 TODO/FIXME markers in backend) — low priority
- Last Updated: 2026-03-23

**Session 245 COMPLETE (2026-03-23) — SHOPPER DASHBOARD FIXES + QA BEHAVIORAL CORRECTION:**
- ✅ **S244 post-fix verification:** Dark mode badges/avatars (profile.tsx, messages), about page background, meta descriptions — all confirmed live in Chrome MCP
- ✅ **env vars added to packages/backend/.env:** `MAILERLITE_API_KEY` + all `DEFAULT_*` region vars (Grand Rapids defaults). Patrick manual action — done.
- ✅ **Shopper dashboard bugs fixed + pushed (5 files):**
  - `messages/[id].tsx` — error/success toast feedback on reply send (was silently failing)
  - `sales/[id].tsx` — dark mode variants on Message Organizer button, sign-in link, action buttons
  - `hooks/useFollows.ts` — NEW: fetches followed organizers from `GET /api/smart-follows/my`
  - `shopper/dashboard.tsx` — Favorites queryFn extracts `.favorites` array (API returns `{favorites:[], total:N}`); Subscribed tab now dynamic (useFollows hook, real organizer cards)
- ✅ **QA behavioral correction (CRITICAL):** Claude was marking features ✅ Correct based on API shape inspection alone — NOT browser testing with real data. Three fixes applied:
  - `findasale-qa` SKILL.md updated: Chrome MCP Unavailable Protocol + stricter "What Not To Do" rules. Packaged via skill-creator.
  - `conversation-defaults` SKILL.md updated: Rule 32 — no substitutes for browser testing. Packaged via skill-creator.
  - `feedback_qa_methodology_gap.md` memory updated: S245 API-inspection-as-proxy pattern documented.
  - **Patrick action required: Install both updated .skill files from workspace folder**
- ⚠️ **UNVERIFIED (need real browser test with seeded data):** Loot Log, Loyalty, Trails, Collector Passport — user11 has zero entries in all four. API shape confirmed via curl only. NOT browser-tested.
- ⚠️ **UNVERIFIED:** Missing buttons on /profile page — Patrick reported after S245 push. Not yet diagnosed.
- ⚠️ **CARRY-FORWARD:** Message reply end-to-end (organizer → shopper) — still incomplete
- ⚠️ **CARRY-FORWARD:** M2 (13 TODO/FIXME markers in backend) — low priority
- ⚠️ **CARRY-FORWARD:** L-002 (mobile viewport test) — formal pass pending
- Last Updated: 2026-03-23

**Session 244 COMPLETE (2026-03-22) — HEALTH SCOUT FIX + DARK MODE AUDIT + META CLEANUP:**
- ✅ **POST-FIX LIVE VERIFICATION (QA Agent):** All S243 fixes confirmed live — item detail pages, LiveFeed, Reviews dark mode, message thread footer, About page, tooltips, premium page, plan page. All PASS.
- ✅ **M1 FIXED — unbounded findMany in exportController:** Added `take: 5000` to 3 queries in `packages/backend/src/controllers/exportController.ts` (query limits: `findMany({ where: {...}, take: 5000 })`).
- ✅ **C1 + H1 + H2 verified (no code changes needed):** Unauthenticated admin verification routes (C1), JWT fallback (H1), /api/dev NODE_ENV guard (H2) — all already fixed in codebase from previous sessions.
- ✅ **Dark mode badge/avatar fixes:** `profile.tsx` — badge/bid status/message variants dark-mode-aware. `messages/index.tsx` + `messages/[id].tsx` — amber avatar now proper contrast dark mode.
- ✅ **About page dark mode consistency:** `about.tsx` — dark:bg-gray-900 (was dark:bg-gray-800) to match site-wide dark background.
- ✅ **Meta descriptions broadened (all sale types):**
  - `/cities/index.tsx` — "estate sales, yard sales, garage sales, and more"
  - `/neighborhoods/index.tsx` — "estate sales, yard sales, garage sales, and more"
  - `/neighborhoods/[slug].tsx` — metaDesc broadened to include all sale types
- Last Updated: 2026-03-22

**Session 242 COMPLETE (2026-03-22) — BRAND SWEEP + D-007 + 13 UX BUG FIXES + QA SKILL REWRITE:**
- ✅ D-007 confirmed live: workspace creation works (user3@example.com TEAMS), member counter shows "0 / 12 members". Commit: b07f162
- ✅ Brand sweep (5 pages): /hubs, /categories, /calendar clean. /cities and /neighborhoods title tags + Layout duplication fixed.
- ✅ Auth rate limit raised 20→50.
- ✅ **13 UX bugs fixed from Patrick's 10-minute clickthrough.** 3 parallel dev agents dispatched. 9 code files changed.
- ✅ **QA skill rewritten (findasale-qa v2):** Chrome MCP clickthrough-first methodology replaces code-audit-first approach.
- ✅ **Critical feedback memory saved:** QA methodology gap — Claude tested code correctness but not product usability.
- Last Updated: 2026-03-22

**Completed Sessions (carry forward knowledge):**

**Session 241 COMPLETE (2026-03-22) — LIVE VERIFICATION + D-007 FULLY DEPLOYED**
**Session 240 COMPLETE (2026-03-22) — FULL AUDIT FIX + D-007 LOCKED**
**Session 239 COMPLETE (2026-03-22) — BUG FIXES + WORKFLOW AUTOMATION PLATEAU**
**Session 238 COMPLETE (2026-03-22) — ROLE WALKTHROUGHS + COPY BROADENING**
**Session 236 COMPLETE (2026-03-22) — BETA TESTER READINESS: BUG BLITZ + ROUTE AUDIT + INNOVATION RE-RUN**

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
