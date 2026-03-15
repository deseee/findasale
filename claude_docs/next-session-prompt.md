# Next Session Resume Prompt
*Written: 2026-03-14 (session 164 wrap)*
*Session ended: normally*

## What Was Completed This Session
Session 164: #24 Holds-Only Item View fully shipped. Full Architect→Dev→QA pipeline. Added `holdDurationHours` (48h default) to Sale model + Neon migration 78. Backend: dynamic hold duration, sale filter/sort, hold count endpoint, batch operations (release/extend/markSold, 50-item cap). Frontend: full holds page rewrite (sale filter, sort toggle, grouped-by-buyer accordion, batch actions, item photos/prices/HoldTimer). Dashboard badge wired. QA passed. 3 MCP pushes to main.

## Environment Status
- **Vercel** — auto-deploying, all green.
- **Railway** — check logs at session start (was intermittently unstable session 160).
- **Neon migrations** — 78 current. No pending migrations.
- **Roadmap** — v29, #24 shipped. Next priority: **#27 Listing Factory** (locked P2) or **#36 Weekly Treasure Digest** (parallel slot P4).

## Immediate Priority (Single Opus Session — do these in order)

### 1. Start #36 Weekly Treasure Digest (1 sprint)
MailerLite MCP is live and connected. Weekly email to shoppers: top items, trending sales, new listings in your area. Shopper retention + re-engagement loop.
- Use `findasale-marketing` to draft the email template/content
- Use MailerLite MCP to create the automation + subscriber segment
- Wire a backend endpoint or cron to trigger the digest weekly

### 2. If #36 done cleanly: start #27 Listing Factory (2–3 sprints)
Full listing export engine. AI tag auto-suggestion, Listing Health Score, multi-platform export, social templates. Run Brand Voice session first (plugin: discover-brand → guideline-generation → brand-voice-enforcement).

## Open Items (Non-Blocking, Carry Forward)
- **P2:** Item thumbnail images on Review & Publish page break on reload (Cloudinary URLs fail on subsequent navigation).
- **Schema tech debt:** `aiConfidence Float @default(0.5)` should be `Float?` — backfill manual items to null.
- **Brand Voice session** — before Listing Factory (#27) ships.
- **Railway stability** — check logs at session start.
- **QA note from #24:** Pre-existing ownership gap in `updateHold` — organizer can confirm/cancel any hold, not just their own. Low risk (organizers only) but should be tightened eventually.

## Context
- Load STATE.md and CLAUDE.md before starting work
- Load `dev-environment` skill before any shell/Prisma/DB commands
- Load `findasale-deploy` skill before any production deploy
