# Next Session Resume Prompt
*Written: 2026-03-07 — Session 92*
*Session ended: normally*

## Resume From — AUTONOMOUS MODE

Session 93 should run autonomously. Pick up open work items below in priority order. Batch agents in ≤3. Report completion when queue is exhausted.

---

## Open Work Queue (Priority Order)

### 1. Deploy Neon migration (Patrick action — do first)
Migration `20260310000001_add_item_fulltext_search_indexes` was created this session but NOT yet deployed to Neon production. Patrick must run `prisma migrate deploy` before Sprint 4b frontend can be tested end-to-end.

Read `packages/backend/.env` to extract the actual Neon DATABASE_URL (commented-out `# DATABASE_URL=` lines) and provide the exact `$env:DATABASE_URL="..."` command — never placeholder text.

### 2. TypeScript verification (Patrick action — from PowerShell)
Cowork pnpm environment blocked TypeScript check this session. Patrick should run from Windows PowerShell:
```powershell
cd C:\Users\desee\ClaudeProjects\FindaSale\packages\backend
pnpm tsc --noEmit
```
Report any new errors. Pre-existing errors in other files (abTestController.ts, adminController.ts "Cannot find module") are known and not Sprint 4a regressions.

### 3. Sprint 4b — Frontend search UI
Backend (Sprint 4a) is fully complete. Dispatch findasale-dev to build frontend:
- `packages/frontend/components/ItemSearch.tsx` — search input + filter bar
- `packages/frontend/components/FilterSidebar.tsx` — category/condition/price filters
- `packages/frontend/components/ItemSearchResults.tsx` — results grid
- `packages/frontend/hooks/useItemSearch.ts` — React hook wrapping GET /api/items/search
- `packages/frontend/pages/search.tsx` — full search page

UX spec: `claude_docs/feature-notes/sprint-4-ux-spec-2026-03-07.md`
ADR: `claude_docs/feature-notes/sprint-4-architecture-2026-03-07.md`

### 4. MailerLite backend event wire-up
Dispatch findasale-dev to fire `sale_published` event to MailerLite API when sale status changes to PUBLISHED. Without this, automation exit condition never fires.
API call spec is in `claude_docs/beta-launch/mailerlite-onboarding-automation-2026-03-07.md` → "Event Trigger: Sale Published" section.

### 5. MailerLite Tags → note clarification
Patrick reported no "Tags" tab in MailerLite Subscribers — only a "Fields" tab. Step 2 of onboarding spec (Create "Published Sale" Tag) should be skipped — it's optional and not required for automation to function. Remind Patrick of this at session start if he's still setting up MailerLite.

---

## What Was Completed This Session (92)

- **Legal ToS:** terms.tsx (7 edits) + privacy.tsx (2 edits) — scope expansion + 4 compliance gap fixes. $20-60k exposure addressed.
- **Health scout high findings:** Both confirmed already resolved. No code changes needed.
- **Coupon rate limiting:** POST /api/coupons/validate — 10 req/min, user-ID-keyed. Pre-beta critical finding resolved.
- **Sprint 4a FTS backend:**
  - `packages/database/prisma/migrations/20260310000001_add_item_fulltext_search_indexes/migration.sql` — CREATED
  - `packages/backend/src/services/itemSearchService.ts` — CREATED
  - `packages/backend/src/controllers/searchController.ts` — CREATED
  - `packages/backend/src/routes/items.ts` — MODIFIED (added /search and /categories routes)
- **Skill files verified:** health-scout-improved + findasale-dev-improved confirmed installed.
- **MailerLite spec:** Summarized for Patrick. Tags step is optional/skippable.
- **Marketing:** Week 1 social posts reviewed and presented.

---

## Sprint Queue
- **Sprint 4b** — Frontend search UI (next)
- **Sprint 5** — Seller Performance Dashboard

## Patrick's Manual Beta Items
1. Run `.\push.ps1` to push all session 92 changes
2. Deploy Neon migration 20260310000001 (`prisma migrate deploy`)
3. Run `pnpm tsc --noEmit` in packages/backend to verify Sprint 4a
4. Confirm 5%/7% fee
5. Set up Stripe business account
6. Google Search Console verification
7. Order business cards (files in `claude_docs/brand/`)
8. Start beta organizer outreach
9. Rotate Neon credentials
10. Set up dedicated FindA.Sale Google account (support@finda.sale)
11. Build MailerLite onboarding automation (spec: `claude_docs/beta-launch/mailerlite-onboarding-automation-2026-03-07.md`) — skip Step 2 (Tags tab absent; it's optional)

## Environment Notes
- **Git sync:** Session 92 changes NOT yet pushed — Patrick must run `.\push.ps1`
- **Files changed this session (stage these):**
  - `packages/frontend/pages/terms.tsx`
  - `packages/frontend/pages/privacy.tsx`
  - `packages/backend/src/routes/coupons.ts`
  - `packages/database/prisma/migrations/20260310000001_add_item_fulltext_search_indexes/migration.sql`
  - `packages/backend/src/services/itemSearchService.ts`
  - `packages/backend/src/controllers/searchController.ts`
  - `packages/backend/src/routes/items.ts`
  - `claude_docs/STATE.md`
  - `claude_docs/logs/session-log.md`
  - `claude_docs/operations/next-session-prompt.md`
- **Neon:** 63 migrations applied. Migration 20260310000001 created but NOT deployed.
- **Connectors active:** Stripe MCP, MailerLite MCP, GitHub MCP
- **Skills:** Use `Skill` tool for findasale-* agents — NOT `Agent` tool
- **Parallel agent limit:** Max 3 per dispatch call.
