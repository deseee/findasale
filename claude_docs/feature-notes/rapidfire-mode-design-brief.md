# Rapidfire Mode — Design Brief
**Date:** 2026-03-10
**Status:** Design Complete → Blocked on 6 QA fixes before dev starts
**Agents:** UX · Pitchman · Architect · QA · Advisory Board

---

## Decision: GREEN LIGHT (with conditions)

Advisory Board: unanimous green light. QA: conditional approval — 6 design-level blockers must be resolved before findasale-dev starts coding.

---

## What We're Building

**Rapidfire Mode** — a camera-first batch capture workflow alongside the existing item entry flow.

**Rapidfire (new):** Organizer stays in camera view the entire time. One tap per item. Photos queue in a bottom carousel. AI tags each item in the background while they're already shooting the next one. Post-session review screen to approve/edit AI drafts.

**Regular Mode (existing, enhanced):** Up to 5 photos per item. Edit and approve before moving to next. More deliberate, for higher-value items.

**Mode Toggle:** Visible button in the camera view to switch between the two. No leaving camera required.

---

## Architecture Decisions (Architect)

**ADR saved:** `claude_docs/feature-notes/rapidfire-mode-adr.md`

Key locked decisions:
- New `draftStatus` field on Item: `DRAFT | PENDING_REVIEW | PUBLISHED`
- New `aiErrorLog` JSONB field on Item
- Background AI via node-cron (in-process, acceptable for MVP)
- Simple polling at 2–3 sec intervals (no Socket.io — reserved for auctions)
- Carousel state in React + IndexedDB for persistence across page reloads

**Migration:** `20260311000001_add_item_draft_status`

**New API endpoints:**
- `POST /api/upload/rapidfire` — creates DRAFT item + enqueues AI job (returns itemId immediately)
- `GET /api/items/{itemId}/draft-status` — polling endpoint for AI progress
- `POST /api/items/{itemId}/publish` — organizer approves draft

---

## UX Spec (UX Agent)

**Full spec saved:** `claude_docs/ux-spotchecks/rapidfire-mode-ux-spec.md`

**6 new frontend components:**
1. `CameraView` — fullscreen camera with capture button + mode toggle
2. `ModeToggle` — Rapidfire / Regular pill switch (top-right of camera view)
3. `CaptureButton` — large centered button, 44px+ tap target
4. `Carousel` — bottom scrollable strip with status badges (📷 uploading → ◐ analyzing → ✓ done → ⚠ error)
5. `PreviewModal` — tap carousel item to see AI tags, price suggestion, edit inline
6. `ReviewScreen` — post-session list of all captures, approve/edit/publish

**Timing:**
- Photo appears in carousel within 280ms of shutter
- AI job runs in background (3–10 seconds typical)
- Organizer never waits — camera is ready for next shot immediately

**Carousel persists in IndexedDB** — survives app close and reload.

**Post-session review:** Items sorted by confidence, low-confidence items flagged in yellow, all editable before publish.

---

## QA Blockers (must fix in design before dev starts)

| # | Blocker | What to Do |
|---|---------|-----------|
| B1 | **DRAFT items could leak to public browse** | Add `draftStatus != 'DRAFT'` filter to all public item queries. Create shared `getPublicItems()` helper. P0. |
| B2 | **Organizer can publish before AI completes** | `/publish` endpoint must reject if `draftStatus='DRAFT'`. Disable Publish button on frontend until `PENDING_REVIEW`. P0. |
| B3 | **Carousel mode persistence underspecified** | Rapidfire and Regular carousels are mode-specific, never mixed. Review screen shows only Rapidfire session items. IndexedDB tracks last-used mode. P1. |
| B4 | **`draftStatus` default is wrong** | Change migration default from `PUBLISHED` to `DRAFT` + backfill existing items to `PUBLISHED`. Or use NULL with app-level logic. P1. |
| B5 | **Publish race condition** | Add `optimisticLockVersion INT` to Item. Publish handler checks version; returns 409 if stale. P1. |
| B6 | **No cleanup for abandoned DRAFT items** | Daily cron deletes DRAFT items older than 7 days. Optional warning email to organizer at day 6. P1. |

**QA Warnings (address during dev, not blockers):**
- Polling at scale: add exponential backoff (1s → 2s → 5s as item ages)
- Cloudinary rate limits: confirm tier limits; add client-side upload queue if > 10 pending
- IndexedDB fallback for older Safari iOS (graceful degrade to in-memory only)
- Cleanup local photo blobs from IndexedDB after Cloudinary upload succeeds
- Review screen pagination: 20 items/page with "Load more"

---

## Advisory Board Recommendation

**Core Rapidfire: SHIP IT.**

Board consensus on v1 scope:

| Feature | v1 (ship with Rapidfire) | v2 | Later / Skip |
|---------|--------------------------|-----|--------------|
| Rapidfire Mode (core) | ✅ | | |
| AI Confidence Coaching (Pitchman #3) | ✅ Board pick | | |
| Rapidfire Batching / Auto-lots (Pitchman #4) | ✅ Board pick | | |
| Live Preview Mode (buyers watch capture) | | ✅ | |
| Condition Capture Checklist | | ✅ | |
| Live Market Pricing (eBay comps) | | | ✅ Post-beta |
| Collaborative Capture (2-person sessions) | | | ✅ Post-beta |
| Session Replay (timeline scrubber) | | | Skip |

**Board's required musts before launch:**
1. Carousel failure state must be visually obvious (red icon, not just a spinner)
2. Post-review screen should show organizer edits side-by-side with AI draft (learning loop)
3. A/B test carousel scroll at 50+ items — optimize if lag
4. 90-second tutorial video: carousel → review → publish

---

## Pitchman Highlights (blue-sky ideas)

8 ideas generated. Top 3 worth tracking:

**AI Confidence Coaching** — confidence rings on each carousel thumbnail (green/yellow/red). Teaches organizers what photos the AI needs. 1–2 day build. Board picked for v1.

**Live Preview Mode** — organizer's capture session becomes a live feed buyers can watch. QR code → buyers join read-only carousel in real-time. Items pre-sold before doors open. High business impact, deferred to v2.

**Rapidfire Batching** — AI auto-groups captured items into suggested lots/bundles during the session. Bundles sell faster at higher margins. Board picked for v1 alongside core.

Full 8 ideas in Pitchman output — reference for roadmap planning.

---

## Implementation Sequence (when blockers are resolved)

1. Resolve 6 QA blockers in design docs (update ADR + UX spec)
2. Schema migration + backfill (database package)
3. Query audit — add `getPublicItems()` helper, update all public endpoints
4. New backend endpoints (rapidfire upload, polling, publish)
5. Background AI job + cleanup cron
6. Frontend carousel + mode toggle + review screen
7. IndexedDB persistence layer
8. Cross-browser testing (iOS Safari, Android Chrome)
9. Load test: 50 concurrent sessions

**Estimated dev time:** 10–12 days for core Rapidfire. Add 2–3 days each for Confidence Coaching and Batching.

---

## Open Questions for Patrick

1. Do you want AI Confidence Coaching + Batching in v1, or just core Rapidfire?
2. Should DRAFT items auto-delete after 7 days, or longer? (Affects organizer trust vs. DB hygiene)
3. Should Rapidfire Mode be the default for first-time organizers, or Regular mode?
4. Cloudinary tier — what's the current plan's upload rate limit?
