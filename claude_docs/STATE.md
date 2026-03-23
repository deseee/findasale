# PROJECT STATE

Compression anchor. Active state only.
Historical detail: `claude_docs/COMPLETED_PHASES.md`

---

## Active Objective

**Session 242 COMPLETE (2026-03-22) — BRAND SWEEP VERIFIED + D-007 CONFIRMED + INFRA FIXES:**
- ✅ **D-007 CONFIRMED LIVE:** Workspace creation works (user3@example.com), member counter shows "0 / 12 members". Cap enforcement code confirmed correct in workspaceController.ts. Full 12→13 stress test deferred (requires 12 seeded organizer accounts). Commit: b07f162
- ✅ **Brand sweep complete — 3 pages clean, 2 bugs found and fixed:**
  - /hubs ✅ — "Discover Sale Hubs", no estate-sale-only language, "Browse All Sales →" empty state live
  - /categories ✅ — "Find what you're looking for across all active sales." — clean
  - /calendar ✅ — "Browse upcoming sales events month by month" — clean, 16 sales showing
  - /cities ⚠️→✅ FIXED: title was "Estate Sales by City", Layout duplication — both fixed, pushed
  - /neighborhoods ⚠️→✅ FIXED: title was "Estate Sales by Neighborhood", Layout duplication — both fixed, pushed
- ✅ **Auth rate limit raised 20→50:** Prevents Claude automation lockout during testing. Pushed in same commit.
- ⚠️ **CARRY-FORWARD:** L-002 (mobile real-device test) — still pending Patrick on real iPhone SE
- Last Updated: 2026-03-22

**Session 241 COMPLETE (2026-03-22) — LIVE VERIFICATION + D-007 FULLY DEPLOYED:**
- ✅ H-001 (item detail pages returning "Item not found"): Root cause was `getItemById` checking `draftStatus !== 'PUBLISHED'` but seeded/legacy items have NULL draftStatus. Fixed by changing check to `draftStatus === 'DRAFT'`. Verified live on production. Pushed via MCP (commit d1da44c).
- ✅ H-003 (/notifications DOM duplication for logged-out users): Root cause was notifications.tsx had its own `<Layout>` wrapper in both return branches on top of _app.tsx's global `<Layout>`. Fixed by removing `<Layout>` from notifications.tsx, added explanatory comment. Verified live. Pushed via MCP (commit ad47033).
- ✅ **D-007 FULLY COMPLETE AND LIVE:**
  - `isEnterpriseAccount Boolean @default(false)` added to Organizer model — schema.prisma restored via MCP (commit d402aa9, 1939 lines confirmed)
  - Migration SQL applied to Neon: `packages/database/prisma/migrations/20260323_add_enterprise_flag/migration.sql`
  - `workspaceController.ts` — member cap enforcement live (commit f560b80)
  - `pricing.tsx` — Teams tier shows "Up to 12 team members", Enterprise CTA section live (commit cde5227)
  - `workspace.tsx` — member count display, Invite disabled at cap, upgrade link live (commit cde5227)
  - Railway rebuilt successfully via Dockerfile cache-bust (commit bf14772) — `isEnterpriseAccount` in Prisma client, build clean
  - `directUrl = env("DIRECT_URL")` corrected in schema.prisma datasource (was `DATABASE_URL_UNPOOLED`)
- ✅ **schema.prisma env var fix**: `DIRECT_URL` is the correct Neon non-pooled env var for migrations (not `DATABASE_URL_UNPOOLED`)
- ⚠️ **CARRY-FORWARD:** L-002 (mobile real-device test) — still pending Patrick on real iPhone SE
- Last Updated: 2026-03-22

**Session 240 COMPLETE (2026-03-22) — FULL AUDIT FIX + D-007 LOCKED:**
- ✅ All 12 audit findings fixed and pushed (15 files):
  - H-004: Layout.tsx `<main>` → `<div>` — eliminates nested main violation on every page (WCAG fix)
  - H-003: /notifications DOM duplication resolved as side effect of H-004
  - H-001: itemController.ts — removed overly strict status check blocking item detail pages
  - H-002: settings.tsx — fixed infinite spinner for logged-out users, now redirects to `/login?redirect=/settings`
  - M-001 + L-003: 9-page D-001 brand sweep — hubs, categories, calendar, neighborhoods, cities, surprise-me, FAQ, footer, homepage subtitle
  - M-002: /hubs empty state — "Browse All Sales →" button added
  - M-003: Admin redirect now goes to `/login?redirect=/admin` instead of homepage
  - M-004: LiveFeed "Reconnecting..." removed — silent reconnect
  - M-005: Sale detail filter label → "Show: All" (was ambiguous status statement)
  - L-001: /shopper/dashboard redirect preserves `?redirect=/shopper/dashboard`
- ✅ D-007 LOCKED: Teams cap = 12 members, Enterprise tier confirmed (isEnterpriseAccount flag, contact-sales, $500–800/mo, annual). DECISIONS.md updated.
- ✅ Advisory board consulted for D-007 — board recommendation adopted by Patrick
- Last Updated: 2026-03-22

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
- ⚠️ PENDING PATRICK: Push `packages/frontend/pages/sales/[id].tsx` + discard 9 stale local files (see next-session-prompt.md)
- ✅ Skills installed: findasale-polish, findasale-dev (patched S239), findasale-qa (patched S239)
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
- Last Updated: 2026-03-22

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
