# PROJECT STATE

Compression anchor. Active state only.
Historical detail: `claude_docs/COMPLETED_PHASES.md`

---

## Active Objective

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

**NEXT SESSION (S175):**
1. Verify #66 export downloads correctly in staging (Railway green after push)
2. Verify SaleReminder schema migration ran on Neon (`prisma migrate deploy`)
3. Run health-scout on all S174 + #66 code — full pre-beta scan
4. Brand voice session (pre-beta prerequisite — Patrick checklist item)
5. Beta organizer recruitment (Patrick checklist items: identify 5 targets, schedule 1-on-1s)
6. Next roadmap feature: **#66 done** → next candidates are #31 Organizer Brand Kit UI (schema already shipped), #41 Flip Report, or #65 Organizer Mode Tiers

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

**NEXT SESSION (S174):**
1. Verify buyer preview on capture page works in staging after last push
2. Remaining 4 P1 bugs from bug-blitz-2026-03-15.md (entrance pin, batch holds, draft cache, category enum)
3. P2 cleanup pass: status badge clarity, onboarding wizard re-trigger, listing type debt cleanup
4. Consider insights + performance consolidation (product decision needed from Patrick)

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
- **Files pending Patrick push:**
  - packages/frontend/pages/organizer/add-items/[saleId].tsx
  - packages/backend/src/routes/items.ts
  - packages/backend/src/controllers/stripeController.ts
  - packages/backend/src/middleware/auth.ts
  - packages/backend/src/routes/auth.ts
  - packages/backend/src/services/heatmapService.ts
  - packages/backend/src/controllers/heatmapController.ts
  - packages/backend/src/routes/sales.ts
  - packages/frontend/components/HeatmapOverlay.tsx
  - packages/frontend/components/HeatmapLegend.tsx
  - packages/frontend/hooks/useHeatmapTiles.ts
  - packages/frontend/types/heatmap.ts
  - packages/frontend/components/SaleMapInner.tsx
  - packages/frontend/components/SaleMap.tsx
  - packages/frontend/pages/map.tsx
  - claude_docs/strategy/roadmap.md
  - claude_docs/STATE.md
  - claude_docs/STACK.md
  - claude_docs/operations/connector-matrix.md
  - claude_docs/health-reports/bug-blitz-2026-03-15.md
  - claude_docs/feature-notes/heatmap-spec-2026-03-15.md
- **Last Updated:** 2026-03-15 (session 172)

**NEXT SESSION (S173):**
1. Verify Railway build green after heatmap + P0 fixes push
2. Address 8 P1 bugs from bug-blitz-2026-03-15.md
3. Begin #6 Seller Performance Dashboard (Architect sprint first — Stripe MCP now available for real payment data)
4. Remaining agent queue: STACK.md Deploy Risk Matrix (P1), Connector-Matrix.md (P2) — verify these were written this session
5. Stripe MCP tools may now be visible after Cowork restart

---

**Session 171 COMPLETE (2026-03-15) — P0 BUILD FIX + SITEMAP + #8 BATCH OPERATIONS TOOLKIT (5 PHASES, SHIPPED):**
- **Type:** Infrastructure fix + roadmap #8 full implementation
- **Work completed:**
  1. **P0 Railway build fix:** Removed broken `@findasale/shared/src/constants/tagVocabulary` imports from socialController.ts (unused) and tagController.ts (CURATED_TAGS inlined). Already pushed (commit 3d49470).
  2. **Sitemap gap fix:** Added /tags/[slug] URLs to server-sitemap.xml.tsx by fetching from /api/tags/popular. Already pushed (commit 6772906).
  3. **#8 Batch Operations Toolkit — FULLY IMPLEMENTED (5 phases complete):**
     - Phase 1: Backend hardening — status-safe validation matrix, dry-run mode, enhanced responses, bulk tags operation added to POST /api/items/bulk
     - Phase 2: Batch photos API — new POST /api/items/bulk/photos endpoint (add/remove operations)
     - Phase 3: Frontend toolbar expansion — "More Actions" dropdown with Set Category, Set Status, Manage Tags, Manage Photos
     - Phase 4: Modals — BulkConfirmModal, BulkPhotoModal, BulkTagModal, BulkCategoryModal, BulkStatusModal, BulkOperationErrorModal (7 new components)
     - Phase 5: Error handling + feedback — toast messages, per-item error display
  4. **Roadmap updated to v31** — #27 Listing Factory marked DONE, migration count corrected to 82, session history updated.
- **Files changed (pending Patrick push):**
  - packages/backend/src/routes/items.ts (enhanced bulk endpoint + new bulk/photos endpoint)
  - packages/frontend/pages/organizer/add-items/[saleId].tsx (expanded toolbar + modal wiring)
  - packages/frontend/components/BulkActionDropdown.tsx (NEW)
  - packages/frontend/components/BulkCategoryModal.tsx (NEW)
  - packages/frontend/components/BulkConfirmModal.tsx (NEW)
  - packages/frontend/components/BulkOperationErrorModal.tsx (NEW)
  - packages/frontend/components/BulkPhotoModal.tsx (NEW)
  - packages/frontend/components/BulkStatusModal.tsx (NEW)
  - packages/frontend/components/BulkTagModal.tsx (NEW)
  - claude_docs/feature-notes/batch-operations-toolkit-spec.md (NEW)
- **Last Updated:** 2026-03-15 (session 171)

**NEXT SESSION:** Resume with pending files push. Run Patrick's `.\push.ps1` for all 10 files above. After merge, verify Railway/Vercel build health, test batch operations in staging/prod. Next feature: roadmap selection.

---

**Session 170 COMPLETE (2026-03-15) — SPRINT 2 GAP CLOSURE + SPRINT 3 INITIATION + CLAUDE.MD §11 ENFORCEMENT:**
- **Type:** Gap closure + feature implementation + governance hardening
- **Work completed:**
  1. **Sprint 2 gap closure — Social Templates:** New backend endpoint `GET /api/social/:itemId/template?tone=casual&platform=instagram` (socialController.ts + social.ts route). Frontend social template UI added to promote.tsx (item picker, tone/platform selectors, live preview, copy button). Spec was live in S166-168 but never built.
  2. **Sprint 3 initiation — Tag SEO Pages:** New backend endpoints `GET /api/tags/popular` and `GET /api/tags/:slug/items` (tagController.ts + tags.ts route). New ISR frontend page `/tags/[slug].tsx` with SEO metadata, JSON-LD ItemList schema, responsive item grid.
  3. **CLAUDE.md §11 — Subagent-First Implementation Gate:** Converted advisory into hard gate. Main window is orchestrator only — ALL code implementation goes through subagents. Only exception: single targeted edits to 1–2 files totaling <20 lines. Session 170 identified main window had read 940-line itemController + 393-line promote + 256-line items route, then wrote 4 new backend code files inline, burning ~30k tokens. Patrick demanded enforcement. §11 now specifies allowed/disallowed lists exhaustively.
  4. **CLAUDE.md §9 — File Delivery Rule:** All files Patrick needs to view/install/act on must be saved to workspace folder with clickable `computer://` link. Never describe contents inline without providing link.
  5. **conversation-defaults v8:** Rule 27 (subagent-first gate) packaged as .skill file for Patrick to install.
- **Key behavioral failure caught:** Main window violated existing "default to subagents" instruction by implementing features inline instead of dispatching. Patrick escalated. CLAUDE.md §11 created as hard gate with explicit penalties. This was the focus of S170.
- **Files changed (pending Patrick push):**
  - CLAUDE.md (§9 file delivery rule + §11 subagent-first gate with allowed/disallowed lists)
  - .checkpoint-manifest.json (S170 session entry)
  - packages/backend/src/controllers/socialController.ts (new)
  - packages/backend/src/routes/social.ts (new)
  - packages/backend/src/controllers/tagController.ts (new)
  - packages/backend/src/routes/tags.ts (new)
  - packages/backend/src/index.ts (2 import + 2 route registration lines)
  - packages/frontend/pages/organizer/promote/[saleId].tsx (social template UI added)
  - packages/frontend/pages/tags/[slug].tsx (new ISR page)
  - conversation-defaults.skill (packaged for install)
- **Last Updated:** 2026-03-15 (session 170)

**NEXT SESSION: Comprehensive Sessions 166–170 Review**
Patrick wants S171 to begin with thorough review: comparing what was delivered vs asked for, workflow quality, CLAUDE.md enforcement, communications clarity. Focus on: (1) Are we shipping the right things? (2) Are processes working? (3) Is governance being followed? After review, if good, proceed to roadmap + context-mode planning.

---

**Session 167 COMPLETE (2026-03-15) — PRODUCTION UNBLOCK + CORE.MD v4.1:**
- **Production:** Railway back online (Dockerfile.production pushed; commit bc38ade). Vercel confirmed healthy. Neon at 82 migrations (20260315000001 + 20260315000002 both applied).
- **Diagnosis & Repair:** MCP schema.prisma truncation in S166 confirmed — itemController.ts also truncated (only getDraftItemsBySaleId remained). Full 939-line itemController restored (all 13 exports) and pushed (commit 1409a51).
- **CORE.md v4.1 locked:** 4 new MCP push rules added: full-file read-before-push, truncation gate (size-comparison check), complete push instruction blocks, merge conflict re-staging. Pushed commits 5b1d88d + 1f22506.
- **Production Status:** ✓ Railway green | ✓ Vercel green | ✓ Neon 82/82 migrations applied | ✓ Schema complete + pushed
- **Sprint 2 starting:** Cloudinary watermark, exportController.ts, promote.tsx. No schema changes.
- **Last Updated:** 2026-03-15 (session 167)

---

**Session 165 COMPLETE (2026-03-15) — #36 WEEKLY TREASURE DIGEST: SHIPPED:**
- **Activated existing weeklyEmailJob cron** (Sundays 6pm) — built but never wired. Personalized picks based on purchase/favorite history. 8 items per user, category-matched from upcoming PUBLISHED sales within 14 days.
- **Email delivery:** Resend integration active. Dynamic subject ("8 Estate Sale Finds This Week (New Arrivals)"), category badges (warm yellow), larger fonts for older audience (15px body, 18px prices), relative date labels ("Tomorrow", "In 2 days"), preference management footer (Manage frequency / Update interests / Unsubscribe).
- **MailerLite integration:** New Shoppers group created (ID: 182012431062533831). New shoppers auto-enrolled on registration via `addShopperSubscriber()` in authController.ts (both email + OAuth paths). Fire-and-forget, non-blocking.
- **Files changed:** `packages/backend/src/index.ts`, `packages/backend/src/controllers/authController.ts`, `packages/backend/src/services/mailerliteService.ts`, `packages/backend/src/services/weeklyEmailService.ts`, `CLAUDE.md` (§6 no-pause checkpoint rule).
- **MCP pushes:** 2 total (18e7178 + fc2cdd2). All changes on GitHub main.
- **Last Updated:** 2026-03-15 (session 165)

---

**Session 164 COMPLETE (2026-03-14) — #24 HOLDS-ONLY ITEM VIEW: FULL BUILD + SHIP:**
- **Full Architect→Dev→QA pipeline completed** for #24 Holds-Only Item View.
- **Schema:** Added `holdDurationHours Int @default(48)` to Sale model. Migration `20260315000000_add_hold_duration_to_sale` applied to Neon (migration 78).
- **Backend:** Upgraded `reservationController.ts` — dynamic hold duration from sale config (was hardcoded 24h), sale filter + sort params on organizer holds endpoint, new `getOrganizerHoldCount` lightweight count endpoint, new `batchUpdateHolds` (release/extend/markSold) with 50-item cap + ownership validation.
- **Frontend:** Full rewrite of `holds.tsx` — sale filter dropdown, sort toggle (Expiring Soon / Recently Added), grouped-by-buyer accordion, batch action bar (Release/Extend/Mark Sold) with checkbox selection, item photos + prices + HoldTimer countdown. Dashboard badge wired via `/reservations/organizer/count`.
- **QA passed:** Batch size limit added (50 max), `as any` casts acceptable, pre-existing ownership gap in updateHold noted (not introduced by #24).
- **3 MCP pushes completed:** Push 1 (759eec1b) migration+routes+controller, Push 2 (91252745) holds.tsx+dashboard.tsx, Push 3 (44782d4c) schema.prisma.
- **Files changed:** `packages/frontend/next.config.js`, `packages/frontend/components/ItemOGMeta.tsx`, `packages/frontend/pages/_document.tsx`, `packages/frontend/pages/items/[id].tsx`
- **All changes on GitHub main** (commits 4d06379, 64058eb, 698b4ed, 4d50c15). Vercel auto-deployed.
- **Last Updated:** 2026-03-14 (session 163)
