# PROJECT STATE

Compression anchor. Active state only.
Historical detail: `claude_docs/COMPLETED_PHASES.md`

---

## Active Objective

**Session 169 COMPLETE (2026-03-15) — STRATEGIC AUDIT + WORKFLOW OVERHAUL:**
- **Type:** Research/planning session + implementation (minimal code, max audit/design)
- **6 parallel research agents dispatched:** workflow audit (sessions 164–168), tool ecosystem eval, cowork ecosystem audit, communications quality (5.3/10 baseline), manager subagent architecture ADR, Sprint 2 QA
- **3 implementation agents dispatched:** findasale-dev (watermark URL slash + UTC date fixes), findasale-records (CORE.md v4.2, CLAUDE.md §9-10 push block guarantee + subagent push ban), skill-creator (push-coordinator skill template)
- **Sprint 2 QA verdict:** PASS WITH NOTES — 1 BLOCKER (watermark URL slash in cloudinaryWatermark.ts) fixed, 1 WARN (UTC dates in exportController) fixed, 2 NOTEs acceptable
- **Decisions locked:**
  - Subagent push ban experimental: Sessions 169–171 (CLAUDE.md §10 now active)
  - Push-coordinator lightweight skill approved (ADR confirms full manager pattern not yet feasible in Cowork)
  - Plugin categories: keep ALL enabled (Patrick override of ecosystem audit recommendation)
  - Claude Code CLI: use as handoff system with Cowork, not standalone replacement
- **New skills designed:** conversation-defaults v7 (3 new rules + 3 revised), findasale-push-coordinator (80% benefit of full manager pattern)
- **Files on remote (MCP-pushed S169):** cloudinaryWatermark.ts + exportController.ts fixes (pushed by dev agent)
- **Files pending Patrick push:** conversation-defaults v7 INSTALL, push-coordinator INSTALL, claude_docs updates (workflow-audit, tool-eval, qa-verdict, etc.)
- **Last Updated:** 2026-03-15 (session 169)

**NEXT SESSION: Feature Resume + Verification**
- Patrick pushes all changed files (conversation-defaults v7 + push-coordinator + claude_docs via `.\push.ps1`)
- Patrick installs conversation-defaults v7 and push-coordinator skill
- Verify Railway + Vercel deployed Sprint 2 correctly
- Test push-coordinator skill with first real subagent output (start S169-171 experiment)
- Resume feature work per STATE.md roadmap

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
