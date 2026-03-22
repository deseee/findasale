# PROJECT STATE

Compression anchor. Active state only.
Historical detail: `claude_docs/COMPLETED_PHASES.md`

---

## Active Objective

**Session 239 COMPLETE (2026-03-22) — BUG FIXES + WORKFLOW AUTOMATION PLATEAU:**
- ✅ NotificationBell dark mode fixed — all interactive states now have dark: variants. Pushed via MCP (commit fd4d87a)
- ✅ Sale detail page layout fixed — removed duplicate Photos section, moved About into left column, reordered Items before UGC/Map. On Patrick's local disk, needs push.
- ✅ **DECISIONS.md created** (`claude_docs/brand/DECISIONS.md`) — 9 standing design/product decisions (D-001 through D-009) including all-sale-types scope, dark mode, empty states, mobile-first, multi-endpoint testing, sale detail section order, teams cap (pending), loading states, error recovery
- ✅ **Polish Agent skill created** (`findasale-polish`) — post-dev pre-production quality gate. Audits dark mode, mobile, empty/loading/error states, brand voice, multi-endpoint flows. Written to `claude_docs/skills-package/findasale-polish-SKILL.md`
- ✅ **Dev skill patch written** — §14 DECISIONS.md pre-flight, §15 Human-Ready Gate, §16 Multi-Endpoint Testing. In `claude_docs/skills-package/dev-skill-patch-S239.md`
- ✅ **QA skill patch written** — DECISIONS.md compliance check, Beta-Tester Perspective Gate, Multi-Endpoint Testing. In `claude_docs/skills-package/qa-skill-patch-S239.md`
- ✅ **3 scheduled tasks created:**
  - `weekly-full-site-audit` — Sunday 10pm, comprehensive every-route audit (dark mode, mobile, empty states, brand compliance, adversarial)
  - `weekly-brand-drift-detector` — Monday 10am, brand voice drift scan against DECISIONS.md
  - `monday-digest` — Monday 8am, Patrick-readable weekly summary to patrick-dashboard.md
- ✅ Memories saved: design continuity enforcement, multi-endpoint testing, workflow automation plateau
- ⚠️ PENDING PATRICK: Push `packages/frontend/pages/sales/[id].tsx` (sale detail fixes — on local disk)
- ⚠️ PENDING PATRICK: Install 3 skill files from `claude_docs/skills-package/` (Polish Agent + dev/qa patches)
- ⚠️ PENDING PATRICK: Run `weekly-full-site-audit` once manually to pre-approve Chrome MCP tools for automated runs
- ⚠️ PENDING: D-007 Teams tier member cap decision (Patrick input needed)
- Last Updated: 2026-03-22

**Session 238 COMPLETE (2026-03-22) — ROLE WALKTHROUGHS + COPY BROADENING:**
- ✅ Role walkthroughs (shopper, organizer, unauthenticated) via Chrome MCP automation
- ✅ Mobile verification attempted (browser automation — inconclusive, needs real device)
- ✅ Confirmed item detail pages already public (optionalAuthenticate backend, no frontend gate)
- ✅ Broadened pricing/marketing copy: removed estate-sale-only language, added garage sales/yard sales/auctions/flea markets
  - `packages/frontend/pages/pricing.tsx` — updated tier descriptions to include all secondary sales types
  - `packages/frontend/pages/index.tsx` — updated title, meta description, OG tags, schema.org
  - `packages/frontend/pages/about.tsx` — updated mission statement to include all sale types
- ⚠️ Login rate-limited during testing (test agents hammered auth endpoint) — not a real bug, login works per S237 verification
- ⚠️ Mobile real-device test pending (Chrome automation viewport testing unreliable)
- ⚠️ PENDING: Resend quota decision (Brevo free 300/day vs Postmark $15/mo) — weekly digest at risk on Sundays
- ⚠️ PENDING: Review `claude_docs/research/INNOVATION_HANDOFF_S236.md` — confirm Reputation + Condition Tags as P0 pre-beta
- ⚠️ PENDING: Confirm sale-type-aware discovery as Q3 feature
- Commit 345941cd pushed to main (pricing/index/about copy updates)
- Last Updated: 2026-03-22

**Completed Sessions (carry forward knowledge):**

**Session 236 COMPLETE (2026-03-22) — BETA TESTER READINESS: BUG BLITZ + ROUTE AUDIT + INNOVATION RE-RUN:**
- ✅ Prisma migrate deploy + Railway env vars CONFIRMED DONE (completed S234, verified S236)
- ✅ Stale doc references fixed: removed PENDING items from STATE.md + next-session-prompt.md
- ✅ **QA + UX Audit (post-S233):** /settings 404, /wishlist 404, Manage Plan redirect, pricing contrast, organizer profile identity — all fixed
- ✅ **Comprehensive route audit (167 pages):** Found `/auth/login` → 404 in 10 files (11 instances). All fixed to `/login`. Created `/creator/connect-stripe.tsx` redirect.
- ✅ **Innovation re-run (broader secondary sales framing):** Print Kit TAM 3-4x expansion. Etsy API new P1 (deferred — no revenue model per board). FB Marketplace + Amazon SP-API syndication → REJECT. Sale-type-aware discovery → new P1.
- ✅ **Advisory Board:** Print Kit → deferred (templates approach, no Printful dependency). Etsy dual-listing → deferred. Reputation + Condition Tags + Confidence Badge → approved P0 pre-beta.
- ✅ **CLAUDE.md hardened:** §5 push ban absolute (no size exception), §10 VM temp files clarified, §10 post-fix live verification rule added
- ✅ **Power User audit:** S230-S235 workflow changes holding, 3 doc clarifications applied, findasale-dev skill stale ref fixed
- ✅ All S236 changes pushed to GitHub (31 files in S236 commit + 3 S235 wrap files)
- ⚠️ NEXT SESSION: .gitignore cleanup (_tmp_*, .skills/, .claude/) + commit 80+ untracked doc files in one batch
- ⚠️ NEXT SESSION: Live smoke test of all fixed pages (mandatory per new CLAUDE.md §10 rule)
- ⚠️ NEXT SESSION: Seed realistic test data — real beta testers evaluating this week, not a demo
- Last Updated: 2026-03-22

**Session 235 COMPLETE (2026-03-22) — CONTEXT DOCS UPDATE + RESEARCH + SKILLS AUDIT + PROJECT HYGIENE:**
- ✅ Innovation research: 4 topics, research memos in `claude_docs/research/`, consolidated in `INNOVATION_HANDOFF_2026-03-22.md`
- ✅ Skills scope audit: 8 of 24 skills reframed from estate-sale-only to all secondary sales types
- ✅ Project folder hygiene: 19 temp files deleted, 26 files archived, session-log rotated
- ✅ CLAUDE.md §10 subagent file hygiene rule, file-creation-schema updated
- ✅ All pushed (commit 6c0af66)
- Last Updated: 2026-03-22

**Session 234 COMPLETE (2026-03-22) — BUILD FIXES + PASSKEY SECURITY + FEATURES #106-#109 PRE-BETA SAFETY:**
- ✅ pnpm-lock.yaml regenerated — uuid@9 was added but lockfile stale. Fixed Railway/Vercel frozen-lockfile error
- ✅ RippleIndicator.tsx TypeScript error fixed — `session?.user?.role` cast to `any`. Unblocked Vercel build
- ✅ express-rate-limit v8 ERR_ERL_KEY_GEN_IPV6 — added `keyGenerator` to all 4 rate limiters in index.ts
- ✅ Dockerfile cache-busted to unblock Railway redeploy (S234 cache-bust comment)
- ✅ Prisma migrate deploy + prisma generate against Neon — DONE (was blocking #73/#74/#75)
- ✅ Railway env vars set: AI_COST_CEILING_USD=5.00, MAILERLITE_SHOPPERS_GROUP_ID=182012431062533831
- ✅ **P1 PASSKEY SECURITY FIX:** Challenge storage moved from in-memory Map to Redis with atomic getDel — eliminates concurrent session race condition
- ✅ **P2 PASSKEY SECURITY FIX:** Counter update now uses `updateMany` with `counter: { lt: newCounter }` — atomic, rejects replay attacks
- ✅ **P2 PASSKEY SECURITY FIX:** Flow-type tagging added to challenges (auth vs registration)
- ✅ **#106 Rate limit burst capacity:** `rate-limit-redis` added, globalLimiter + authLimiter now use Redis store with in-memory fallback
- ✅ **#107 DB connection pooling:** `schema.prisma` datasource updated with `directUrl = env("DATABASE_URL_UNPOOLED")` — splits pooled runtime from direct migration connection
- ✅ **#108 API timeout guards:** new `packages/backend/src/middleware/requestTimeout.ts` — 30s timeout, 503 response, registered in index.ts
- ✅ **#109 Graceful degradation:** cloudAIService.ts and notificationService.ts wrapped in try/catch — external service failures no longer crash the process
- ✅ **QA Verdict:** CONDITIONAL GO for beta — messages thread, Stripe checkout, admin invites, follow system pass live smoke test. Follow system + edit-sale dates not tested live but code confirmed fixed. All #106-#109 code reviewed clean.
- Last Updated: 2026-03-22

**Session 233 COMPLETE (2026-03-22) — FULL BUG QUEUE DISPATCH (24 QA BUGS + 11 SENTRY ERRORS FIXED):**
- ✅ All 24 bugs from qa-audit-2026-03-22.md dispatched to findasale-dev in 5 parallel batches — all fixed and pushed
- ✅ P0 BUG-01: Messages thread blank — `min-h-screen` → `h-full` fix in `messages/[id].tsx`
- ✅ P0 BUG-02: Stripe checkout 404 — created missing `pages/api/billing/checkout.ts` proxy route
- ✅ HIGH BUG-03: Stripe Customer Portal wired — new backend endpoint + frontend subscription page button
- ✅ HIGH BUG-04: `/admin/invites` crash fixed — `response.invites` destructured correctly
- ✅ HIGH BUG-05: Follow button + follow-status 404 — new `GET /:id/follow-status` backend route added
- ✅ MEDIUM BUG-07: Edit Sale dates now pre-populated from fetched data
- ✅ MEDIUM BUG-10: Photo-ops 404 — remounted as sales subroute
- ✅ MEDIUM BUG-11: Sale detail over-fetch fixed (staleTime: 3000 on react-query)
- ✅ MEDIUM BUG-13: Ripples 403 on shopper page load — ORGANIZER role gate added in RippleIndicator
- ✅ MEDIUM BUG-14: Pricing page now role-differentiates (shoppers see free-access message)
- ✅ MEDIUM BUG-15: TreasureHuntBanner dark mode fixed; billing pages already had dark mode
- ✅ MEDIUM BUG-16: Dual status badges removed from add-items page
- ✅ LOW BUG-17/18: Unicode escape literals fixed in edit-sale
- ✅ LOW BUG-19: AI confidence badge removed from InspirationGrid
- ✅ LOW BUG-22/23: Auth redirects corrected; `/access-denied` page created
- ✅ LOW BUG-24: PWA prompt 7-day localStorage suppression
- ✅ LOW BUG-25: Dead route aliases added to next.config.js
- ✅ S227 missed bug: `requireOrganizer` middleware now allows ADMIN role (was blocking 403 in S227 audit)
- ✅ SENTRY NODEJS-1 (FATAL, 160 events): uuid@13 ESM crash — downgraded to `uuid@^9.0.0`
- ✅ SENTRY NODEJS-3 (30 events): CORS — hardcoded `finda.sale` + `www.finda.sale` as guaranteed allowed origins
- ✅ SENTRY NEXTJS-1 (119 events): map page `.map()` crash — defensive `Array.isArray()` guard
- ✅ SENTRY NEXTJS-3 (121 events): QuotaExceededError — localStorage writes wrapped in try/catch, queue capped at 50
- ✅ SENTRY NEXTJS-5/7 (74 events): Stripe.js SSR load failure — lazy `typeof window` init in CheckoutModal + HuntPassModal
- ✅ SENTRY NEXTJS-6 (21 events): Hooks violation on add-items — all useQuery calls moved above early returns
- ✅ SENTRY NEXTJS-8 (22 events): API base URL was `http://localhost:5000/api` in production — fixed to `/api` in `lib/api.ts`
- ✅ SENTRY NEXTJS-2 (31 events): Leaflet `_leaflet_pos` crash — `typeof window` guard in `SaleMapInner.tsx`
- ✅ SENTRY NEXTJS-4 (11 events): ServiceWorker registration failure — graceful catch in `_app.tsx`
- ⚠️ BUG-20 Sentry 503: Confirmed intermittent — Sentry IS working (11 issues captured). No code fix needed.
- ⚠️ BUG-12/21/06/08: Confirmed already working correctly in codebase — no fix needed
- ⚠️ PENDING: Passkey concurrent session race condition (S200 unverified P0) — queued for findasale-hacker next session
- ⚠️ PENDING: Features #106–#109 pre-beta safety batch (deferred — bug queue took full session)
- ⚠️ PENDING: `prisma migrate deploy + prisma generate` against Neon (still blocking #73/#74/#75 runtime)
- ⚠️ PENDING: Railway env vars `AI_COST_CEILING_USD=5.00`, `MAILERLITE_SHOPPERS_GROUP_ID=182012431062533831`
- Last Updated: 2026-03-22

**Session 232 COMPLETE (2026-03-22) — COMPREHENSIVE LIVE QA AUDIT (24 BUGS, NO-GO):**
- ✅ Full live app QA audit at https://finda.sale — all roles (SHOPPER, ORGANIZER, ADMIN), all major flows
- ✅ Report written: `claude_docs/operations/qa-audit-2026-03-22.md`
- ⛔ **VERDICT: NO-GO for beta** — 2 P0 blockers
- 🔴 P0 BUG-01: `/messages/[conversationId]` page renders blank for all users — `min-h-screen` flex collapse in Layout wrapper
- 🔴 P0 BUG-02: Stripe checkout → `POST /api/billing/checkout` returns 404 HTML (JSON parse error; no Stripe redirect)
- 🟠 HIGH BUG-03: "Manage Plan" → no Stripe Customer Portal (dead end for PRO users)
- 🟠 HIGH BUG-04: `/admin/invites` crashes — `TypeError: n.map is not a function` (response.invites not destructured)
- 🟠 HIGH BUG-05: Follow button fires zero network requests; `/api/organizers/[id]/follow-status` → 404
- Medium/Low: broken Picsum images (BUG-06), unpopulated Edit Sale dates (BUG-07), unpopulated Edit Item category (BUG-08), billing section hardcoded light theme in dark mode (BUG-15), N+1 fetches (BUG-11/12), unicode escapes in badges (BUG-17/18), PWA prompt loop (BUG-24), 9 more
- Total: 2 P0 Critical · 3 High · 10 Medium · 9 Low = 24 bugs
- **Recommended fix order:** BUG-01 → BUG-02 → BUG-03 → BUG-04 → BUG-06 → BUG-07/08 → BUG-15 → BUG-17/18
- Last Updated: 2026-03-22

**Session 231 COMPLETE (2026-03-22) — BUG QUEUE COMPLETION + AVATAR DROPDOWN (P0 UX FIX):**
- ✅ BUG #22 verified live: Chrome test confirmed Nina (ADMIN) gets 200 from `GET /api/organizers/me` — fix working
- ✅ BUG #22 sweep: 54 inline `role !== 'ORGANIZER'` checks across 24 backend files (21 controllers + 3 routes) fixed
- ✅ BUG #30 fixed: `sales/[id].tsx` line 379 — `organizerId={sale.organizer.userId}` → `organizerId={sale.organizer.id}`
- ✅ BUG #31 fixed: `FavoriteButton.tsx` — SVG fill via explicit props instead of Tailwind classes
- ✅ BUG #32 fixed: `favoriteController.ts` — toggle checks DB for existing record before add/remove; verified live (bidirectional)
- ✅ BUG #33 fixed: `OnboardingModal.tsx` — handleSkip writes localStorage synchronously before onComplete()
- ✅ AvatarDropdown.tsx built (new): replaces 20+ inline desktop header auth links — Dashboard, Plan a Sale, Insights (PRO), Workspace (TEAMS), Subscription, Settings, Sign Out. P0 UX fix per nav-dashboard-consolidation-2026-03-20 spec.
- ✅ Layout.tsx: Desktop auth nav Feed link (was Explore → `/`); mobile Pro Tools using TierGatedNavLink
- ✅ Sale page UX: "Back to home" label, ~15 dark mode class additions
- ⚠️ PENDING PATRICK PUSH: `sales/[id].tsx` + 24 BUG #22 sweep backend files (see instructions in chat)
- ⚠️ PENDING: `prisma migrate deploy + prisma generate` against Neon (still blocking #73/#74/#75 runtime — NOT YET DONE)
- ⚠️ PENDING Railway env vars: `AI_COST_CEILING_USD=5.00`, `MAILERLITE_SHOPPERS_GROUP_ID=182012431062533831`
- Last Updated: 2026-03-22

---

**Pricing Model (LOCKED):**
- **SIMPLE (Free):** 10% platform fee, 200 items/sale included, 5 photos/item, 100 AI tags/month
- **PRO ($29/month or $290/year):** 8% platform fee, 500 items/sale, 10 photos/item, 2,000 AI tags/month, unlimited concurrent sales, batch operations, analytics, brand kit, exports
- **TEAMS ($79/month or $790/year):** 8% platform fee, 2,000 items/sale, 15 photos/item, unlimited AI tags, multi-user access, API/webhooks, white-label, priority support
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
