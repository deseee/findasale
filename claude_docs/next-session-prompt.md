# Next Session Resume Prompt
*Written: 2026-03-15 (session 166 wrap)*
*Session ended: normally*

## What Was Completed This Session
Session 166: #27 Listing Factory spec created and fully architected. 3-sprint phased plan in `claude_docs/feature-notes/listing-factory-spec.md`. Sprint 1 (AI tags + health score): no schema changes, tag picker + health bar on review.tsx. Sprint 2 (export + watermark): Cloudinary watermark, exportController (PDF/CSV/JSON), social templates, promote.tsx. Sprint 3 (pages + SEO): /tags/[slug] ISR pages, sitemap, optional #64/#31 fold-in. Sprint 1 dev dispatched to findasale-dev agent.

## Environment Status
- **Vercel** — auto-deploying, all green.
- **Railway** — check logs at session start (was intermittently unstable session 160).
- **Neon migrations** — 78 current. No pending migrations for Sprint 1/2.
- **Roadmap** — v29, #24 shipped (session 164), #36 shipped (session 165), #27 spec complete (session 166). Next priority: **#27 Listing Factory Sprint 1 dev** (in progress) → **Sprint 1 QA** → **Sprint 2 dev**.

## Immediate Priority (Single Opus Session — do these in order)

### 1. Wait for #27 Sprint 1 dev to complete
- Monitor findasale-dev agent progress on Sprint 1 implementation (tag picker UI + health score bar on review.tsx)
- Once dev posts completion, dispatch findasale-qa for Sprint 1 QA pass

### 2. Once Sprint 1 QA passes: start Sprint 2 dev
- Cloudinary watermark utility + integration
- exportController.ts (PDF/CSV/JSON formats)
- Social template endpoint + promote.tsx UI
- No schema changes needed

### 3. Patrick decisions pending (non-blocking, carry forward)
- **#64 fold-in:** Architect recommends YES (improves listing grading integrity). Confirm go/no-go.
- **#31 Brand Kit fold-in:** Architect recommends defer to Phase 5 (post-Sprint 2). Confirm defer decision.
- **EstateSales.NET CSV format:** Verify 3-column format (name|category|quantity) so Sprint 2 exportController handles it correctly.

## Open Items (Non-Blocking, Carry Forward)
- **P2:** Item thumbnail images on Review & Publish page break on reload (Cloudinary URLs fail on subsequent navigation).
- **Schema tech debt:** `aiConfidence Float @default(0.5)` should be `Float?` — backfill manual items to null.
- **Brand Voice session** — recommended before Listing Factory ships (can run in parallel with Sprint 1/2 dev).
- **Railway stability** — check logs at session start.
- **QA note from #24:** Pre-existing ownership gap in `updateHold` — organizer can confirm/cancel any hold, not just their own. Low risk (organizers only) but should be tightened eventually.

## Context
- Load STATE.md and CLAUDE.md before starting work
- Load `dev-environment` skill before any shell/Prisma/DB commands
- Load `findasale-deploy` skill before any production deploy
