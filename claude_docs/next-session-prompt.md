# Next Session Resume Prompt
*Written: 2026-03-09T00:00:00Z*
*Session ended: normally*

## Resume From

Session 110 — dispatch **findasale-qa** and **findasale-dev** in parallel to hunt and fix P1 bugs.

## Dispatch Plan (give to both agents)

**findasale-qa — Scoping pass first:**
Read `claude_docs/BACKLOG_2026-03-08.md` §A items A1.3, A1.4, A2.2, A5.1, A5.2, A6.1.
For each bug: confirm it still reproduces on finda.sale production, identify the exact file(s) and line(s) responsible, estimate fix complexity (small/medium/large), flag any dependencies between bugs.
Produce a scoping report before dev starts — do not fix anything yet.

**findasale-dev — Wait for QA scoping, then fix in priority order:**
Once QA delivers scoping report, implement fixes for all P1 bugs in a single continuous pass.
Each fix: minimal diff, no unrelated changes, stage file explicitly by name.

**Bug list:**
- **A1.3** — "Use my location" button broken on map search
- **A1.4** — Search scope unclear (searches all sales vs nearby?)
- **A2.2** — SaleScout logo appearing in PWA install banner (should be FindA.Sale)
- **A5.1/A5.2** — Leaderboard not rendering / data missing
- **A6.1** — Hardcoded "Grand Rapids" city reference (should be dynamic or removed)

## What Was Completed This Session (109)

- Packaged findasale-advisory-board, findasale-hacker, findasale-pitchman as flat `.skill` archives (Session 108 version frontmatter, `zip -j` from inside source dir)
- Presented and confirmed install of all 8 Session 108 updated skills

## Environment Notes

**Still pending from Session 107 — Patrick must do before or during Session 110:**

```powershell
cd C:\Users\desee\ClaudeProjects\FindaSale
git add packages/shared/src/index.ts
git add packages/database/prisma/schema.prisma
git add packages/database/prisma/migrations/20260311000001_add_sale_type_item_listing_type/migration.sql
git add packages/database/prisma/seed.ts
git add packages/backend/src/controllers/saleController.ts
git add packages/backend/src/controllers/itemController.ts
git add packages/backend/src/controllers/stripeController.ts
git add packages/backend/src/jobs/auctionJob.ts
git add packages/frontend/pages/organizer/create-sale.tsx
git add packages/frontend/pages/organizer/add-items/[saleId].tsx
git commit -m "Session 107: B1 full implementation — schema + FeeStructure + backend + frontend."
.\push.ps1
```

Then run Neon migration:
```powershell
# From packages/backend — use real Neon URLs from packages/backend/.env (commented-out lines)
$env:DATABASE_URL="<neon-url>"; $env:DIRECT_URL="<neon-direct-url>"; npx prisma migrate deploy
```

**Session 109 wrap docs to push:**
```powershell
git add claude_docs/STATE.md
git add claude_docs/logs/session-log.md
git add claude_docs/next-session-prompt.md
git commit -m "Session 109 wrap: skill housekeeping complete, prep session 110 P1 bug blitz"
.\push.ps1
```

## Exact Context

Bug details from `claude_docs/BACKLOG_2026-03-08.md` §A — QA should read that file directly rather than relying on this summary. The A3.6 single-item 500 error is still deferred (needs Railway production logs, not yet available).
