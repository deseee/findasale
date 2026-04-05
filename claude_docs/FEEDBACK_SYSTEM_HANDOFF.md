# Feedback System Handoff Summary

**For:** Patrick (FindA.Sale PM)
**Date:** 2026-04-05
**Status:** Ready to show `findasale-dev`

---

## What's Done

UX spec for the replacement feedback system is complete and ready for dev. Full spec lives in `FEEDBACK_SYSTEM_SPEC.md`.

---

## What Changes (From User POV)

### Out
- Floating feedback button (bottom-right, always visible, looks "beta")

### In
- **Settings menu link** — "Send Feedback" in Help & Support section. Tap it, fill a simple form, submit.
- **Smart surveys** — After meaningful actions (first sale published, item marked sold, first purchase, etc.), users see a 1–2 question survey. They can dismiss or submit. "Don't ask again" checkbox suppresses future surveys of that type.

---

## The 10 Survey Moments

**For Organizers:**
1. **First sale published** — "How confident do you feel about the photos?"
2. **10th item added** — "Rate your experience adding photos"
3. **First item marked sold** — "How did you connect with the buyer?"
4. **First POS/Hold-to-Pay checkout** — "Was the payment process smooth?"
5. **First settings change** — "Was that easy to find?"

**For Shoppers:**
1. **First purchase completed** — "How easy was checkout?"
2. **First item favorited** — "Why this item?"
3. **First bid placed** — "How confident are you in the final price?"
4. **First haul posted** — "How fun was sharing it?"
5. **First organizer followed** — "What drew you to them?"

All surveys are **optional** (tap the X or wait 10 seconds → dismisses). All include a "Don't ask again" checkbox. Only 1 survey shows per session. Max 1 per user per 24 hours.

---

## Technical Highlights (For Dev)

### New Tables
- `FeedbackSuppression` — Tracks which surveys users have opted out of (userId + surveyType)
- `User` extensions — Add `firstSalePublished` flag, `lastSurveyShownAt` timestamp

### Key Architecture Decision
**Portal-based modals** — Render at body level, not inside page containers. This avoids the z-index/overlay issues you've had before (modal gets clipped, trapped behind other elements, etc.). All survey modals use the same portal pattern.

### Trigger Pattern
All triggers are **action-based**, not page-load-based. After an action completes (publish sale, mark item sold, etc.), the code calls `useFeedbackSurvey().showSurvey('OG-1')`. The hook checks: role, suppression, cooldown, frequency caps. If all pass → survey shows. If not → silent skip.

---

## Why This Design

**Problem:** Floating button looks unfinished, competes with FABs, is always nagging.

**Solution:** Two-tier approach:
- **Passive**: Settings menu link. Users can ask for the form anytime.
- **Active**: Smart surveys fire at moments when users are most engaged and opinion is fresh (right after completing something).

**Friction reduction:**
- Button-based answers (not 5-star sliders) — faster to respond
- 10-second auto-dismiss — users who ignore it don't have to close it
- "Don't ask again" saves them from future surveys on the same topic
- No spam: max 1 per session, 1 per 24h, 30-min cooldown between

**Data quality:**
- Every survey asks about a specific action they just completed (not generic "rate app" questions)
- Responses are contextual and actionable
- You can filter feedback by survey type and see patterns

---

## Implementation Path

1. **Dev:** Build components, hooks, API endpoints, trigger integration (will take ~1–2 sprints)
2. **QA:** Test each trigger fires at the right moment, suppression persists, focus management, mobile UX
3. **Staging:** Turn on for small % of users, monitor response rates and completion times
4. **Rollout:** Full ship once confident

---

## Files & References

- **Full spec:** `claude_docs/FEEDBACK_SYSTEM_SPEC.md` (implementation checklist, component architecture, all 10 surveys)
- **Current widget code:** `packages/frontend/components/FeedbackWidget.tsx` (will be removed)
- **Existing endpoints:** `packages/backend/src/controllers/feedbackController.ts` (extend, not rewrite)

---

## Key Design Rules (Don't Skip These)

1. **Portal-based modals** — Non-negotiable. Avoids z-index hell.
2. **DB-backed suppression** — Not localStorage. Survives clears.
3. **After-action triggers** — Not on page load. User completes action first.
4. **Focus management** — Use focus-lock lib or manual trap. Mobile: swipe-down also dismisses.
5. **No tier surprises** — OG-4 (POS) only shows for SIMPLE+ tiers. Check tier before showing.

---

## Ready to Hand Off to Dev?

**Yes.** All trigger moments identified. Copy finalized. Architecture locked (portal modals, suppression DB, trigger pattern). 10 surveys named, scoped, and defined. Schema ready. No unknowns blocking dev start.

Show `findasale-dev` the `FEEDBACK_SYSTEM_SPEC.md` file. They have everything needed.
