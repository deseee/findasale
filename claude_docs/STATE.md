# PROJECT STATE

Compression anchor. Active state only.
Historical detail: `claude_docs/COMPLETED_PHASES.md`

---

## Active Objective

**Session 172 IN PROGRESS (2026-03-15) — BUILD FIX + DOC SYNC:**
- TypeScript `Array.from(new Set(...))` fix applied to `packages/frontend/pages/organizer/add-items/[saleId].tsx` line 1428 (was `[...new Set(...)]` which fails without `downlevelIteration`).
- STATE.md and roadmap updated: #8 Batch Operations Toolkit confirmed complete, roadmap v32.
- S171 push confirmed merged (commits 909fe20 + 4ceadf2 on main). STATE.md "pending push" note was stale.
- **Next:** Select next roadmap feature (#28 Neighborhood Heatmap or #6 Seller Performance Dashboard) or parallel slot (#34 Hype Meter, #35 Front Door Locator).
- **Last Updated:** 2026-03-15 (session 172)

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
