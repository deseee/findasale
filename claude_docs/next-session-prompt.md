# Next Session Resume Prompt
*Written: 2026-03-14T23:59:00Z*
*Session ended: normally*

## What Was Completed This Session
Session 162: Chrome audit of Review & Publish page. All 7 checks passed. Two P1 bugs found and fixed live.

## Immediate Priority

### URGENT: Railway backend still restarting randomly (from session 160)
**Not fixed yet.** Main page shows "Error Loading Sales" intermittently. This blocks the 4 features from session 160 that are on GitHub main but haven't been verified on production backend.
1. Check Railway logs for error pattern
2. Fix and stabilize Railway
3. Then test the 4 session 160 features end-to-end: #61 Near-Miss Nudges, #34 Hype Meter, #35 Front Door Locator, #33 Share Card Factory

## Pending Deployment Actions
- **Neon migration:** `20260314193440_add_entrance_pin` (Front Door Locator, #35) — still needs `prisma migrate deploy`
- **Vercel env var:** `NEXT_PUBLIC_CLOUDINARY_CLOUD_NAME=db8yhzjdq` still needed in Vercel project settings

## Open Bugs (Non-Blocking)
- **P2:** Item thumbnail images on Review & Publish page break on page reload — Cloudinary URLs load on first visit but fail on subsequent navigation. Needs investigation.
- **Schema tech debt:** `aiConfidence Float @default(0.5)` should be `Float?` with data migration (backfill manual items to null). Not urgent — masked by `isAiTagged` check in UI.

## After Railway is Stable
- Resume roadmap P1: **#24 Holds** (1 sprint, trust blocker for beta)
- Brand Voice session (on upcoming list)

## Environment Status
- **Vercel GitHub App** — auto-deploying (confirmed session 162)
- **Railway** — unstable (main blocker, carry from session 160)
- **Neon migrations** — 72 current, +1 pending (entrance pin)
- **Roadmap** — v27, next priority after railway fix: #24 Holds

## Context
- Load STATE.md and CLAUDE.md before starting work
