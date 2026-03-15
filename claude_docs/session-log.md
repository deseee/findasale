# Session Log — Recent Activity

## Recent Sessions

### 2026-03-15 · Session 167 (full wrap)
**Worked on:** Production recovery from S166 MCP truncations. Diagnosed and fixed schema.prisma and itemController.ts truncations (both pushed by MCP in S166 but incomplete). Restored full itemController (939 lines, 13 exports), verified schema complete, applied Neon migrations (now at 82). Railway redeploy triggered via Dockerfile push. CORE.md v4.1 locked with 4 new MCP safety rules (full-file rule, truncation gate, complete instruction blocks, re-staging checklist).
**Decisions:** MCP truncation gate added to CORE.md — all large files must be read before push, size-compared post-push as safety check. All merge conflict resolutions require complete re-stage list + commit + push.ps1 in one block (no partial instructions). CORE.md now authoritative for MCP push patterns.
**Production status:** ✓ Railway healthy | ✓ Vercel healthy | ✓ Neon 82 migrations | Schema + code in sync on GitHub main.
**Files changed:** `claude_docs/CORE.md` (MCP rules + procedures), `packages/backend/Dockerfile.production`, `packages/backend/src/controllers/itemController.ts`, `.last-wrap` timestamp.
**Next up:** Sprint 2 — Cloudinary watermark utility, exportController.ts (estate sales CSV + Facebook JSON + Craigslist text), promote.tsx UI.
**Blockers:** None. Production clean.

### 2026-03-15 · Session 166 (full wrap)
**Worked on:** #27 Listing Factory Sprint 1 (shipped), #64 conditionGrade fold-in (shipped), #31 Brand Kit schema fold-in (schema shipped, UI deferred). CURATED_TAGS vocab (45 tags), listingHealthScore utility (6-factor 0–100), AI tag + grade suggestions via Haiku (non-blocking), review.tsx tag picker + health bar + grade picker. Full 3-sprint spec at `claude_docs/feature-notes/listing-factory-spec.md`.
**Decisions:** #64 YES (conditionGrade grading in Sprint 1). #31 YES schema now, UI in Sprint 3. Health score algorithm locked (photo 40 + title 20 + desc 20 + tags 15 + price 5 + conditionGrade 5 = 100). CURATED_TAGS vocabulary locked (45 tags, 1 free-form custom slot).
**Files changed:** `packages/shared/src/constants/tagVocabulary.ts` (new), `packages/backend/src/utils/listingHealthScore.ts` (new), `packages/backend/src/services/cloudAIService.ts` (modified), `packages/backend/src/controllers/itemController.ts` (modified), `packages/frontend/pages/organizer/add-items/[saleId]/review.tsx` (modified), `packages/database/prisma/schema.prisma` (conditionGrade + brand kit fields), migrations 20260315000001 + 20260315000002 (new).
**Blockers:** Neon migrations not yet applied (prisma migrate deploy needed). Railway build failing from an earlier MCP-truncated schema commit — latest commit (24483a2) has complete schema; redeploy should fix. Session had repeated push/instruction breakdown (see workflow audit item).
**Next up:** Verify Railway deploys from 24483a2. Apply Neon migrations. Session 167 workflow audit. Then Sprint 2 (Cloudinary watermark + export controller).

### 2026-03-14 · Session 164
**Worked on:** #24 Holds-Only Item View — full Architect→Dev→QA pipeline. Added `holdDurationHours` to Sale model (48h default, configurable per-sale). Upgraded reservationController with dynamic hold duration, sale filter/sort params, lightweight hold count endpoint, batch operations (release/extend/markSold) with 50-item cap. Full rewrite of organizer holds page: sale filter dropdown, sort toggle, grouped-by-buyer accordion, batch action bar, item photos/prices/HoldTimer. Dashboard hold count badge wired. Neon migration applied (migration 78). QA passed.
**Decisions:** 48h default hold (was hardcoded 24h). Batch cap at 50. Grouped-by-buyer display with per-item schema (locked session 155).
**Files changed:** `packages/database/prisma/schema.prisma`, `packages/database/prisma/migrations/20260315000000_add_hold_duration_to_sale/migration.sql`, `packages/backend/src/controllers/reservationController.ts`, `packages/backend/src/routes/reservations.ts`, `packages/frontend/pages/organizer/holds.tsx`, `packages/frontend/pages/organizer/dashboard.tsx`
**Scoreboard:** Files changed: 6 | QA findings: 4 (1 fixed, 3 acceptable) | Subagents: 3 (findasale-architect, findasale-dev, findasale-qa) | Push method: GitHub MCP (3 pushes: 759eec1b, 91252745, 44782d4c)
**Next up:** #36 Weekly Treasure Digest (MailerLite MCP), or #27 Listing Factory.
**Blockers:** None. #24 fully shipped.