# Next Session Prompt — S262

**Date:** 2026-03-24 (S261 complete)
**Status:** Phase 2 fully unblocked. Schema signed off. All design decisions locked. Ready to build.

---

## S262 PRIORITY 1 — Explorer's Guild Phase 2 Backend (FULLY UNBLOCKED)

Everything is decided. Architecture: `claude_docs/feature-notes/explorer-guild-phase2-architect-S261.md`.

**Step 1 — Patrick runs migration first:**
```powershell
cd C:\Users\desee\ClaudeProjects\FindaSale\packages\database
$env:DATABASE_URL="postgresql://neondb_owner:npg_VYBnJs8Gt3bf@ep-plain-sound-aeefcq1y.c-2.us-east-2.aws.neon.tech/neondb?sslmode=require"
npx prisma migrate deploy
npx prisma generate
```

**Step 2 — Dispatch findasale-dev for:**
- Phase 2a (backend): `xpService.ts`, `xpController.ts`, wire XP events into existing purchase/sale/referral controllers
- Phase 2b (frontend): `RankBadge`, `RankProgressBar`, leaderboard page, XP sink components
- Phase 2c (fraud): Extend `fraudDetectionService.ts` with XP fraud signal types

Route any game design questions to `findasale-gamedesign` skill (installed this session).

---

## S262 PRIORITY 2 — Brand Drift Batch (14 Files, 1 Session)

Audit from 2026-03-24 found 30 brand drift violations across city/neighborhood/map/calendar pages.
Batch 1 (P0 SEO) + Batch 2 (P1 organizer copy) = ~14 single-line changes.
Full audit: `claude_docs/audits/brand-drift-2026-03-24.md`

**One decision needed before dispatch:** "Estate Sale Encyclopedia" section rename (SEO implications — Patrick call).

---

## S262 PRIORITY 3 — Install New Skills

Patrick should install these 3 .skill files via Cowork UI before next session:
- `findasale-ux.skill` — bias fixed (all 5 sale types in description)
- `findasale-qa.skill` — bias fixed (brand voice checklist updated)
- `findasale-gamedesign.skill` — NEW: routes all XP/rarity/rank decisions away from Patrick

---

## Explorer's Guild — Full Status

**DONE (Phase 1):** Copy rebrand on 5 frontend files. RPG spec locked (S260). Architect sign-off + all design decisions locked (S261).

**TODO (Phase 2):** XP earn/sink system, rank display, leaderboard, rarity boost UI, abuse prevention dashboard. Schema additions: `User.guildXp`, `User.explorerRank`, `User.seasonalResetAt`, `RarityBoost` table, extended `PointsTransaction` + `Coupon`.

---

## Context

Last push: S261 wrap. Dashboard copy was already correct from S260 — no new code change.
**Platform serves 5 sale types:** estate sales, yard sales, auctions, flea markets, consignment.

---

## Test Accounts (Live on Neon)

All password: `password123`
- `user1@example.com` — ADMIN + SIMPLE organizer
- `user2@example.com` — PRO organizer (Stripe connected)
- `user3@example.com` — TEAMS organizer (Stripe connected)
- `user11@example.com` — Shopper with full activity
