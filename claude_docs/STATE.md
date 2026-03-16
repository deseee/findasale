# PROJECT STATE

Compression anchor. Active state only.
Historical detail: `claude_docs/COMPLETED_PHASES.md`

---

## Active Objective

**Session 179 COMPLETE (2026-03-16) — BILLING QA PASS + SKILL RECONSTRUCTION + PACKAGING PROTOCOL:**
- **GitHub QA audit of S178:** All changes verified — schema gate in dev skill, CORE.md §9, Rule 28, MESSAGE_BOARD gitignored ✅
- **Architect sign-off Sprint 2 billing (#65):** GO — all tier gates correct, schema accurate, middleware order correct ✅
- **Hacker security review Sprint 2 billing:** PASS WITH NOTES — 2 P0 fixes required before Railway deploy (not blocking QA) ✅
- **findasale-qa Sprint 2 billing:** PASS — all 7 files clean, approved for main branch ✅
- **conversation-defaults v5 reconstructed:** Rules 13+24-26 recovered from v4 package + S169 doc. Rules 14-23 confirmed permanently lost (never in git). Pushed to GitHub ✅
- **Skill packaging protocol established:** CORE.md §9 updated with mandatory packaging steps. Both skills packaged as .skill ZIPs and pushed to `claude_docs/skills-package/` ✅
- **Last Updated:** 2026-03-16 (session 179)

**Pending — Patrick action items:**
- [ ] Install conversation-defaults.skill via Cowork (click "Copy to your skills" card)
- [ ] Install findasale-dev.skill via Cowork (click "Copy to your skills" card)
- [ ] Fix Hacker P0-1: increment tokenVersion in syncTier.ts on webhook tier sync → dispatch findasale-dev next session
- [ ] Fix Hacker P0-2: add STRIPE_SECRET_KEY startup check in index.ts → dispatch findasale-dev next session
- [ ] Set 5 Stripe env vars on Railway (from STATE.md S177 section)
- [ ] Set MAILERLITE_SHOPPERS_GROUP_ID=182012431062533831 on Railway
- [ ] Verify RESEND_API_KEY and RESEND_FROM_EMAIL on Railway
- [ ] Open Stripe business account (currently on test keys)

**Next session options (ranked):**
1. **Fix Hacker P0s** (findasale-dev) — tokenVersion increment + STRIPE_SECRET_KEY check — required before billing goes live
2. **Session log catch-up** (S172, S174, S177 missing from session-log.md)
3. **Next roadmap batch:** #43 OG Images, #38 Entrance Pin, #61 Near-Miss Nudges

---

**Session 178 COMPLETE (2026-03-16) — #65 SPRINT 2 SHIPPED + WORKFLOW FIXES + SKILL GATE:**
- **#65 Sprint 2 — SHIPPED:** Full Stripe billing infrastructure built and TS-fixed through 4 build cycles:
  - `packages/backend/src/controllers/billingController.ts` (NEW) — checkout, webhook, subscription GET, cancel
  - `packages/backend/src/lib/syncTier.ts` (NEW) — priceId → SubscriptionTier mapper
  - `packages/backend/src/routes/billing.ts` (NEW) — billing route registration
  - `packages/backend/src/index.ts` (MODIFIED) — raw body middleware before json() parser, billing routes registered
  - `packages/backend/src/routes/items.ts` (MODIFIED) — requireTier('PRO') on /bulk
  - `packages/backend/src/routes/export.ts` (MODIFIED) — requireTier('PRO') on export routes
  - `packages/backend/src/routes/insights.ts` (MODIFIED) — requireTier('PRO') on /organizer
  - `packages/frontend/pages/organizer/upgrade.tsx` (NEW) — tier comparison page, Stripe checkout CTA
  - `packages/frontend/pages/organizer/subscription.tsx` (NEW) — subscription management page
  - `packages/frontend/pages/organizer/settings.tsx` (MODIFIED) — subscription tab added
- **upgrade.tsx TS fix:** `user?.organizerProfile` → `user?.organizerTier` (field doesn't exist on User type; correct field is `organizerTier?: string`) ✅
- **Recurring push blocker fixed:** MESSAGE_BOARD.json git rm --cached + .gitignore — permanently untracked ✅
- **Schema read gate added to dev SKILL.md:** Mandatory grep schema.prisma before any Prisma field reference ✅
- **Skill update process documented:** CORE.md §9 — editing SKILL.md in git ≠ active skill updated; .skill reinstall required ✅
- **Brand voice guide rewritten:** `claude_docs/brand/brand-voice-guide-2026-03-16.md` — expanded beyond estate sales to all 7 sale types ✅
- **Last Updated:** 2026-03-16 (session 178)

**Pending — Patrick action items:**
- [ ] Run push block: `git add packages/frontend/pages/organizer/upgrade.tsx` + commit + `.\push.ps1`
- [ ] Reinstall updated skills via Cowork (conversation-defaults.skill + findasale-dev.skill)
- [ ] QA Sprint 2 billing endpoints (mandatory before beta — touches payment flows)
- [ ] **Set `MAILERLITE_SHOPPERS_GROUP_ID=182012431062533831` on Railway** (session 165)
- [ ] **Verify `RESEND_API_KEY` and `RESEND_FROM_EMAIL` on Railway** (session 165)
- [ ] **Open Stripe business account** (currently on test keys)

**Next session options (ranked):**
1. **QA Sprint 2** (findasale-qa) — mandatory before production use
2. **Session log catch-up** (S171–S177, 7 sessions behind — friction audit HIGH)
3. **Next roadmap batch:** #43 OG Images, #38 Entrance Pin, #61 Near-Miss Nudges

---

**Session 177 COMPLETE (2026-03-16) — #65 SPRINT 1 SHIPPED + MAP FIX + #5 BUILD FIX + BRAND VOICE + STRIPE PRODUCTS:**
- **Map fix (friend report):** CSP `connect-src`/`img-src` — added `tile.openstreetmap.org` (bare domain) + `maps.googleapis.com`. Added `position: relative` to map container in index.tsx to fix Leaflet z-index bleed ✅
- **#5 Listing Type Schema Debt — BUILD FIX:** Removed broken `@findasale/shared` imports from `saleController.ts` and `itemController.ts`. Inlined `SaleType` + `ListingType` enums directly. Railway green (commit 6d70efff) ✅
- **#65 Sprint 1 — SHIPPED:** Full subscription tier infrastructure deployed:
  - `packages/database/prisma/schema.prisma` — `SubscriptionTier` enum (SIMPLE/PRO/TEAMS) + 5 Organizer fields
  - `packages/database/prisma/migrations/20260316000000_add_subscription_tiers/migration.sql` — Neon migration applied ✅
  - `packages/shared/src/tierGate.ts` — `hasAccess()`, `TIER_RANK`, `FEATURE_TIERS`
  - `packages/shared/src/index.ts` — exports tierGate
  - `packages/backend/src/middleware/requireTier.ts` — Express middleware factory
  - `packages/backend/src/middleware/auth.ts` — attaches `organizerProfile` for tier checks
  - `packages/backend/src/controllers/authController.ts` — JWT embeds `subscriptionTier` on all 3 auth paths
- **Neon migration applied:** `20260316000000_add_subscription_tiers` + `20260315235851_add_sale_reminder` both applied ✅
- **Stripe products created (via MCP):** Pro Monthly ($29), Pro Annual ($290), Teams Monthly ($79), Teams Annual ($790), 7-day trial coupon (btQhQIH2)
- **Brand voice guide created:** `claude_docs/brand/brand-voice-guide-2026-03-16.md` ✅
- **Roadmap v38:** All [ENT]/[ENTERPRISE] → [TEAMS]. Teams ships on schedule (no deferral). No founding organizer program. 7-day trial approved ✅
- **ADR-065 docs created:** `ADR-065-IMPLEMENTATION-PLAN.md`, `ADR-065-QUICK-REFERENCE.md`, `ADR-065-PATRICK-DECISIONS.md`
- **All files on GitHub main** — 4 MCP push batches (7366ea8, e1d940f, fcba9c1, cd5cdc2)
- **Last Updated:** 2026-03-16 (session 177)

**NEXT SESSION (S178) — #65 SPRINT 2:**
1. **Stripe billing endpoints** — checkout session, subscription webhook handler, syncTier utility
2. **requireTier() applied** — wire PRO/TEAMS middleware to batch ops, analytics, export, brand kit routes
3. **Upgrade UI** — `/organizer/upgrade` page (tier comparison, Stripe checkout CTA, 7-day trial flow)
4. **Subscription management page** — current plan, cancel, upgrade/downgrade

**Patrick action items (still pending):**
- [ ] **Set 5 Stripe env vars on Railway** (Sprint 2 needs these before billing endpoints work):
  - `STRIPE_PRO_MONTHLY_PRICE_ID=price_1TBZjpLTUdEUnHOTblzuy25L`
  - `STRIPE_PRO_ANNUAL_PRICE_ID=price_1TBZjuLTUdEUnHOT60xJgL4j`
  - `STRIPE_TEAMS_MONTHLY_PRICE_ID=price_1TBZjyLTUdEUnHOTVQyBVx0Q`
  - `STRIPE_TEAMS_ANNUAL_PRICE_ID=price_1TBZk1LTUdEUnHOTRAcyRJ10`
  - `STRIPE_TRIAL_COUPON_ID=btQhQIH2`
- [ ] **Set `MAILERLITE_SHOPPERS_GROUP_ID=182012431062533831` on Railway** (session 165)
- [ ] **Verify `RESEND_API_KEY` and `RESEND_FROM_EMAIL` on Railway** (session 165)
- [ ] **Open Stripe business account** (currently on test keys)

---

**Session 176 COMPLETE (2026-03-15) — FULL TIER AUDIT + ROADMAP TIER-TAG + PRICING LOCKED:**
- **Full tier audit completed:** Roadmap.md (v35→v37) audited against GitHub codebase. All 47 features slotted into organizer/user tiers (SIMPLE/PRO/ENTERPRISE). Shipped features moved to separate section and removed from pipeline ✅
- **Tier framework locked:** SIMPLE (free) / PRO ($29/mo or $290/yr) / ENTERPRISE (defer Q4 2026) ✅
- **Pricing scheme locked:** Platform fee 10% flat (matches Etsy, below eBay/EstateSales.NET). Hunt Pass $4.99/30d = confirmed intentional monetization ✅
- **Features tagged + prioritized:** Virtual Queue [SIMPLE], Social Templates [SIMPLE], Flash Deals [SIMPLE] (brand-spreading hooks). Coupons [SIMPLE] 3 active max / [PRO] unlimited. Affiliate [DEFER] ✅
- **Shoppers tier:** 100% free indefinitely (no gating) ✅
- **Documentation created (5 new files):**
  - `claude_docs/strategy/complete-feature-inventory-2026-03-15.md` (47 features with tiers + est. hours)
  - `claude_docs/strategy/pricing-and-tiers-overview-2026-03-15.md` (framework + tier breakdown)
  - `claude_docs/operations/pricing-analysis-2026-03-15.md` (10% flat fee rationale + competitor analysis)
  - `claude_docs/operations/feature-tier-classification-2026-03-16.md` (SIMPLE/PRO/ENTERPRISE matrix)
  - `claude_docs/feature-notes/feature-tier-matrix-2026-03-15.md` (detailed tier matrix)
- **Stale docs archived:** `pricing-strategy-STALE-archived-2026-03-15.md` (moved to archive/) ✅
- **Files changed:** roadmap.md (v37), decisions-log.md (S176 entries), MESSAGE_BOARD.json, .checkpoint-manifest.json, archive-index.json
- **Last Updated:** 2026-03-16 (session 176)

---

**Session 174 COMPLETE (2026-03-15) — INSIGHTS/PERFORMANCE CONSOLIDATION + P1/P2 BUG SWEEP + #37 REMINDER BUTTON + #66 OPEN DATA EXPORT SHIPPED:**
- **Customer Champion decision:** Insights + Performance consolidation — merged `/organizer/performance` into `/organizer/insights` with per-sale breakdown as expandable section. `/organizer/performance` now redirects. Feature COMPLETE ✅
- **Insights+Performance consolidation built:** Lifetime stats on top, per-sale drill-down inline. Tested in Railway staging ✅
- **Buyer preview on capture page:** Confirmed working in staging after last push ✅
- **#37 Sale Calendar & Reminders:** Added "Remind Me" button to calendar page via `RemindMeButton.tsx` component. Email reminder service was already in place. Feature COMPLETE ✅
- **P1 bugs fixed (4 remaining, all now complete):**
  1. Draft item count cache race — FIXED: `inMutationFlight` ref guard, enabled guard on items query, `onMutate`/`onSettled` on all 3 mutations, `invalidateQueries` on face upload path
  2. Entrance pin coordinate validation — FIXED: backend `saleController.ts` returns 400 if pin >0.05° from sale; frontend warning threshold tightened to 0.0045°
  3. Category enum validation — confirmed already fixed in prior session ✅
  4. Batch hold transaction safety — confirmed already fixed in prior session ✅
- **P2 bugs fixed (7):**
  1. Bulk delete now requires confirmation modal before executing
  2. Edit-sale page title conditional: shows "(Live)" + warning banner if sale is PUBLISHED
  3. Onboarding wizard: localStorage guard prevents re-launch after completion
  4. Add-items page header: shows sale title + updated `<title>` tag
  5. Entrance pin guard: shows amber warning if geocoding failed (instead of silently hiding)
  6. Draft status badge: dual badge (item status + draft status) with distinct colors
  7. API error messages: internal enum names mapped to user-friendly labels
- **#66 Open Data Export — SHIPPED (end of S174):**
  - NEW: `packages/backend/src/controllers/exportController.ts` — GET /api/organizer/export, streams ZIP with items.csv, sales.csv, purchases.csv
  - NEW: `packages/backend/src/routes/export.ts` (route registration)
  - MODIFIED: `packages/backend/src/index.ts` (route registration)
  - MODIFIED: `packages/frontend/pages/organizer/dashboard.tsx` (Export My Data button added)
  - Feature COMPLETE ✅ — Trust signal + CCPA/GDPR requirement. One-click ZIP export on organizer dashboard.
- **Build fixes (end of S174):**
  - Fixed TS errors in `reminderController.ts`: `'../prisma'` → `'../lib/prisma'`, `authenticateToken` → `authenticate`
  - Fixed `reminders.ts` auth middleware: same auth middleware rename
- **SaleReminder schema shipped:** Migration 20260315000003 added to Neon (email-reminder tracking). Requires `prisma migrate deploy` on next Railway push.
- **Roadmap items marked COMPLETE:**
  - **#37 Sale Calendar & Reminders** — calendar page already existed; "Remind Me" button now added = DONE ✅
  - **#6 Seller Performance Dashboard** — was already built live; insights+performance consolidation now done = DONE ✅
  - **#66 Open Data Export** — ZIP export (items.csv, sales.csv, purchases.csv), organizer dashboard button = DONE ✅
- **Files changed this session:**
  - `packages/backend/src/controllers/saleController.ts`
  - `packages/backend/src/controllers/exportController.ts` (new)
  - `packages/backend/src/controllers/reminderController.ts` (build fix)
  - `packages/backend/src/routes/export.ts` (new)
  - `packages/backend/src/routes/reminders.ts` (build fix)
  - `packages/backend/src/index.ts` (2 route registrations)
  - `packages/frontend/pages/organizer/add-items/[saleId].tsx`
  - `packages/frontend/pages/organizer/edit-sale/[id].tsx`
  - `packages/frontend/pages/organizer/insights.tsx`
  - `packages/frontend/pages/organizer/performance.tsx` (redirect)
  - `packages/frontend/pages/organizer/dashboard.tsx` (onboarding wizard guard + Export My Data button)
  - `packages/frontend/pages/calendar.tsx` (Remind Me wired)
  - `packages/frontend/components/RemindMeButton.tsx` (new)
  - `packages/backend/src/routes/items.ts` (error label mapping)
- **Last Updated:** 2026-03-15 (session 174)

---

**Session 173 COMPLETE (2026-03-15) — SMOKE TESTS + PERFORMANCE DASHBOARD FIXES + P1 BUG BLITZ:**
- **Smoke tests (3):** Add Items page ✅, Performance Dashboard ✅ (with fixes), Vercel/Railway ✅ green
- **Performance dashboard (#6):** Fixed double `/api` prefix in URL (performance.tsx L131), fixed `recommendations` null crash (optional chaining), dashboard link added, route confirmed live on Railway
- **Add Items page fixes:** Sticky toolbar moved above table (was at offsetTop 2161px — never stuck), sale name added to header, buyer preview empty grid fixed (was filtering PENDING_REVIEW only → now shows all items), buyer preview added to capture page via `?preview=true` query param
- **P1 bugs fixed (4):** saleId missing → redirect to dashboard guard, bulk mutation now shows skipped count + reason, Stripe account creation returns typed errors (400/503) instead of generic 500, bulk photo endpoint returns `skipped[]` + HTTP 207
- **Build fixes (2):** TS implicit `any` on skipped.map callback, missing `useEffect` import in review.tsx
- **Insights vs Performance:** Confirmed two separate pages — `/organizer/insights` (aggregate cross-sale totals, CD2 Phase 3) vs `/organizer/performance` (per-sale charts, roadmap #6). Consolidation deferred.
- **Remaining P1 bugs (4):** entrance pin coordinate validation, batch hold re-verification (transaction safety), draft item count cache race, category enum validation — queued for S174
- **Last Updated:** 2026-03-15 (session 173)

---

**Session 172 COMPLETE (2026-03-15) — BUG BLITZ P0 FIXES + #28 HEATMAP + DOC AUDIT:**
- **TypeScript build fix:** `Array.from(new Set(...))` in add-items/[saleId].tsx line 1428.
- **Prisma build fix:** Removed invalid `not: null` filters on non-nullable `lat`/`lng` Float fields in `heatmapService.ts`.
- **P0 bug fixes (4):** Bulk items ownership 403→404 leak, null-price bulk skip reporting, AVAILABLE status race condition on purchase, tokenVersion not incremented on password reset.
- **#28 Neighborhood Heatmap — FULLY BUILT:**
  - NEW: `packages/backend/src/services/heatmapService.ts` (grid computation, 6h cache, 5-tier density)
  - NEW: `packages/backend/src/controllers/heatmapController.ts`
  - NEW: `packages/frontend/components/HeatmapOverlay.tsx` (Leaflet circleMarker, click-to-zoom)
  - NEW: `packages/frontend/components/HeatmapLegend.tsx`
  - NEW: `packages/frontend/hooks/useHeatmapTiles.ts`
  - NEW: `packages/frontend/types/heatmap.ts`
  - MODIFIED: `packages/backend/src/routes/sales.ts` (added /heatmap route)
  - MODIFIED: `packages/frontend/components/SaleMapInner.tsx`, `SaleMap.tsx`, `pages/map.tsx` (toggle wired)
- **Doc audit:** Verified #34 Hype Meter + #35 Front Door Locator + all beta agent tasks DONE. Roadmap corrected v32. Bug blitz report: `claude_docs/health-reports/bug-blitz-2026-03-15.md` (4 P0, 8 P1, 8 P2). STACK.md deploy risk matrix written. Connector matrix updated — Stripe MCP NOW CONNECTED (S172).
- **Last Updated:** 2026-03-15 (session 172)

---

**Session 171 COMPLETE (2026-03-15) — P0 BUILD FIX + SITEMAP + #8 BATCH OPERATIONS TOOLKIT (5 PHASES, SHIPPED):**
- **P0 Railway build fix:** Removed broken `@findasale/shared/src/constants/tagVocabulary` imports. Already pushed (commit 3d49470).
- **Sitemap gap fix:** Added /tags/[slug] URLs to server-sitemap.xml.tsx. Already pushed (commit 6772906).
- **#8 Batch Operations Toolkit — FULLY IMPLEMENTED (5 phases complete):** Status-safe validation, dry-run mode, bulk tags, batch photos API, frontend toolbar + 7 modals, error handling.
- **Roadmap updated to v31** — #27 Listing Factory marked DONE.
- **Last Updated:** 2026-03-15 (session 171)

---

**Session 170 COMPLETE (2026-03-15) — SPRINT 2 GAP CLOSURE + SPRINT 3 INITIATION + CLAUDE.MD §11 ENFORCEMENT:**
- **Sprint 2 gap closure — Social Templates:** New backend endpoint + frontend social template UI on promote.tsx.
- **Sprint 3 initiation — Tag SEO Pages:** tagController.ts + tags.ts route + ISR `/tags/[slug].tsx`.
- **CLAUDE.md §11 — Subagent-First Implementation Gate:** Hard gate added. Main window is orchestrator only.
- **Last Updated:** 2026-03-15 (session 170)

---

**Session 167 COMPLETE (2026-03-15) — PRODUCTION UNBLOCK + CORE.MD v4.1:**
- **Production:** Railway back online. Neon at 82 migrations. Full itemController restored.
- **CORE.md v4.1:** 4 new MCP push rules (truncation gate, full-file read-before-push).
- **Last Updated:** 2026-03-15 (session 167)

---

**Session 165 COMPLETE (2026-03-15) — #36 WEEKLY TREASURE DIGEST: SHIPPED:**
- Activated existing weeklyEmailJob cron (Sundays 6pm). Resend integration. MailerLite Shoppers group (ID: 182012431062533831).
- **Last Updated:** 2026-03-15 (session 165)

---

**Session 164 COMPLETE (2026-03-14) — #24 HOLDS-ONLY ITEM VIEW: FULL BUILD + SHIP:**
- Full Architect→Dev→QA pipeline. Schema + backend + frontend. 3 MCP pushes. Neon migration 78 applied.
- **Last Updated:** 2026-03-14 (session 164)
