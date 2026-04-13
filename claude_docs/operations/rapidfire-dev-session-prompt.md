# Session Prompt: Rapidfire Mode — Dev Implementation
**Created:** 2026-03-10
**For:** findasale-dev (+ findasale-architect oversight)
**Estimated:** 10–12 days of dev work, start with Phase 1

---

## Context Files to Load First

1. `claude_docs/STATE.md` — current project state
2. `claude_docs/STACK.md` — stack authority
3. `claude_docs/feature-notes/rapidfire-mode-adr.md` — architecture decisions (source of truth)
4. `claude_docs/ux-spotchecks/rapidfire-mode-ux-spec.md` — full UX spec
5. `claude_docs/feature-notes/rapidfire-mode-design-brief.md` — design brief with all decisions locked
6. Load `dev-environment` skill before any shell commands

---

## What Was Designed (Previous Session)

Rapidfire Mode is a camera-first batch item capture workflow. Full design is complete. Patrick approved all decisions. All 6 QA blockers have been resolved in the ADR. Ready to build.

---

## Patrick's Confirmed Decisions

- **v1 scope:** Core Rapidfire + AI Confidence Coaching (confidence rings on carousel thumbnails) + Rapidfire Batching (AI groups items into lots during session)
- **DRAFT item retention:** 7-day auto-delete for abandoned drafts (daily cron)
- **Default mode for new organizers:** Rapidfire is the default
- **Cloudinary rate limit:** Free tier = 500 requests/hour. Client-side upload queue is REQUIRED. Cap at 6 uploads/min.

---

## Multi-Photo Tagging (Regular Mode) — Design Decision

In Regular mode (up to 5 photos per item), AI analyzes **all photos together** after the organizer taps "Done with this item." Vision + Haiku receive the full set in one batch. Do NOT tag after first photo — wait for the complete set. One AI call per item, not one per photo. Haiku synthesizes all angles into one tag set. This gives better accuracy and lower API cost.

---

## QA Blockers — All Resolved

These must be reflected in the implementation (they're already in the ADR):

**B1 (P0) — Draft item visibility:** All public item queries MUST filter `draftStatus NOT IN ('DRAFT', 'PENDING_REVIEW')`. Create a shared `getPublicItems()` helper in backend and use it everywhere (browse, search, sale detail). Organizer-facing queries show all statuses.

**B2 (P0) — Publish race:** `/api/items/{itemId}/publish` rejects with 400 if `draftStatus = 'DRAFT'` (AI not done yet). Frontend disables Publish button until status = `PENDING_REVIEW`. Error message: "Item not ready — AI analysis still in progress."

**B3 (P1) — Carousel mode separation:** Rapidfire and Regular carousels are stored separately, never mixed. IndexedDB keys: `rapidfire-batch-{saleId}` and `regular-batch-{saleId}`. Review screen shows only Rapidfire session items. Regular mode items go directly to items list after save.

**B4 (P1) — Migration default:** Migration SQL uses `DEFAULT 'DRAFT'`. Backfill all existing items to `PUBLISHED` in the same migration. See `rapidfire-mode-adr.md` §3 for exact SQL.

**B5 (P1) — Publish race condition:** Add `optimisticLockVersion INT DEFAULT 0` to Item. Publish handler increments it and checks the submitted version matches. Return 409 if stale: "Item was updated. Refresh and try again."

**B6 (P1) — Orphaned draft cleanup:** Daily cron deletes Items where `draftStatus = 'DRAFT' AND createdAt < NOW() - INTERVAL '7 days'`. Log all deletions. Test in dev with 1-hour window first.

---

## Cloudinary Upload Queue (Required, Not Optional)

Free tier = 500 req/hr = ~8.3/min. Implement a client-side upload queue:
- Max 6 concurrent uploads in flight
- If queue depth exceeds 6, show toast: "Uploading previous photos…" and pause new captures
- Resume automatically when queue clears
- Local photo blobs must be deleted from IndexedDB after Cloudinary upload succeeds (storage hygiene)

---

## Implementation Sequence

### Phase 1A — Schema (1 day)
- Migration: `20260311000001_add_item_draft_status`
  - Add `draftStatus String @default("DRAFT")`
  - Add `aiErrorLog Json?`
  - Add `optimisticLockVersion Int @default(0)`
  - Indexes on `draftStatus`, `(saleId, draftStatus)`
  - Backfill: `UPDATE "Item" SET "draftStatus" = 'PUBLISHED' WHERE "draftStatus" IS NULL OR "draftStatus" = 'DRAFT'` (for existing items)
- Update Prisma schema

### Phase 1B — Query Audit (1 day)
- Find all Item queries in backend
- Create `getPublicItems(saleId)` helper: enforces `draftStatus = 'PUBLISHED'`
- Update browse, search, sale-detail endpoints to use helper
- Test: confirm DRAFT items don't appear in public results

### Phase 2 — Backend Endpoints (2–3 days)
1. `POST /api/upload/rapidfire` — create DRAFT item, enqueue AI job, return itemId + thumbnail immediately
2. `GET /api/items/{itemId}/draft-status` — polling endpoint (lightweight, no business logic)
3. `POST /api/items/{itemId}/publish` — validate draftStatus = PENDING_REVIEW, apply organizer edits, set PUBLISHED
4. Background job: `processRapidDraft(itemId)` — Cloudinary upload → Vision → Haiku → PATCH Item → set PENDING_REVIEW
5. Cleanup cron: daily delete DRAFT items > 7 days old

### Phase 3 — Frontend Components (3 days)
1. `ModeToggle` — Rapidfire / Regular pill switch (camera view, top-right)
2. `RapidCarousel` — bottom scrollable strip, status badges (📷 uploading → ◐ analyzing → ✓ done → ⚠ error), confidence rings (Confidence Coaching)
3. `CaptureButton` — large centered, 44px+ tap target, stays ready within 200ms of shutter
4. `PreviewModal` — tap carousel thumbnail to see AI tags, edit inline, publish
5. `ReviewScreen` — post-session list, 20 items/page load-more, approve/edit/publish, low-confidence items flagged yellow
6. Upload queue logic — 6-upload cap, toast when queued, blob cleanup after upload

### Phase 4 — Regular Mode Multi-Photo Fix
- Regular mode: hold all photos until "Done" tap, then send full set to Vision+Haiku in one batch
- Confidence Coaching: show confidence score in modal if < 70% (highlight field yellow)

### Phase 5 — Rapidfire Batching (v1 add-on)
- During Rapidfire session, AI auto-suggests item groupings (e.g., "These 4 items look like a matching set of dishes")
- Show grouping suggestion in review screen — organizer can accept/reject lot groupings
- Design spec TBD — consult findasale-ux before building

### Phase 6 — Testing
- E2E: capture 5 photos → carousel populates → AI tags → review → publish → verify visible to shoppers
- Auth: confirm DRAFT items return 403 to non-organizer
- Load test: 50 concurrent captures, monitor DB query counts and Cloudinary rate
- Cross-browser: iOS Safari, Android Chrome (IndexedDB fallback path)

---

## Key Files to Touch

| File | Change |
|------|--------|
| `packages/database/prisma/schema.prisma` | Add draftStatus, aiErrorLog, optimisticLockVersion |
| `packages/database/prisma/migrations/20260311000001_...sql` | New migration |
| `packages/backend/src/controllers/uploadController.ts` | Add rapidfire endpoint |
| `packages/backend/src/controllers/itemController.ts` | Add draft-status + publish endpoints |
| `packages/backend/src/services/cloudAIService.ts` | Add async batch tagging (multi-photo for Regular mode) |
| `packages/backend/src/jobs/` | New processRapidDraft job + cleanup cron |
| `packages/backend/src/helpers/itemQueries.ts` | New getPublicItems() helper |
| `packages/frontend/pages/organizer/add-items/[saleId].tsx` | Extend camera tab with mode toggle |
| `packages/frontend/components/camera/` | New: RapidCarousel, ModeToggle, CaptureButton, PreviewModal, ReviewScreen |

---

## Existing Reference Code

- AI tagging: `packages/backend/src/services/cloudAIService.ts`
- Upload controller: `packages/backend/src/controllers/uploadController.ts`
- Camera UI (current): `packages/frontend/pages/organizer/add-items/[saleId].tsx`
- Existing jobs: `packages/backend/src/jobs/` — follow existing patterns for cron
- Session 122 AI architecture notes: `claude_docs/feature-notes/ai-tagging-architecture.md`

---

## Success Metrics (After Launch)

- Avg time per item in Rapidfire < 15 seconds (vs 45+ sec manual entry)
- AI tag accuracy > 85% for title + category
- < 5% photo AI failures
- Organizer "Would you use Rapidfire again?" > 4/5

---

Start with Phase 1A. Load dev-environment skill before any migration commands.
