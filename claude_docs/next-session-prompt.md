> ⚠️ DEPRECATED — Content moved to STATE.md "## Next Session". Do not update this file.

# Next Session Prompt — S264

**Date:** 2026-03-24 (S263 complete)
**Status:** XP system bug fixed + live on Railway. Brand drift Batches 3+4 pushed to main, Vercel deploy in progress.

---

## S264 PRIORITY 1 — MANDATORY QA SMOKE TEST (Batches 3+4 Live Verification)

After Patrick's push of Brand Drift Batches 3+4 completes, verify Vercel deployed all 22 files live.

**Test Plan:**
- Navigate to `/trending` — verify "secondary sale" copy in hero, no "estate sale only" language
- Navigate to `/inspiration` — verify copy updated, all 5 sale types represented
- Navigate to `/search` — verify empty state copy, "secondary sale" language
- Check 1–2 additional pages from Batches 3+4 (feed, hubs, tags) — verify rendering correct copy

If ANY page is blank, 404, or shows old copy, flag immediately and dispatch findasale-dev before other work.

---

## S264 PRIORITY 2 — Brand Copy Deep Audit (P3 — Copy Consistency Check)

Once Vercel deployment confirmed live, run a comprehensive audit:

- **Page titles/H1s:** Verify all page titles use "secondary sale" or specific sale types, never "estate sale only"
- **Meta descriptions:** Check OG meta descriptions (og:description, Twitter card) for brand compliance
- **All 5 sale types:** Verify estate sales, yard sales, auctions, flea markets, consignment all mentioned or represented on major pages
- **Copy tone:** Verify professional, inclusive language (no organizer-specific jargon that excludes other sale types)
- **Dark mode:** Spot-check 2–3 updated pages in dark mode — no hardcoded colors, text readable

Create a brief summary: "Batches 3+4 brand compliance: PASS / MINOR ISSUES / NEEDS FIXES" with any issues found.

If issues found, dispatch findasale-dev for targeted copy fixes.

---

## S264 PRIORITY 3 — Explorer's Guild Phase 2 UX Review (Optional, P2)

Once QA passes and brand audit complete, optional deep dive on XP/rank UX:

- **RankBadge visibility:** Does the badge surface well on loyalty page? Visible on profile cards (leaderboard)?
- **RankProgressBar clarity:** Is the XP progress bar intuitive? Does it clearly show current tier + next tier goal?
- **Leaderboard usability:** Any pagination issues? Is it clear how ranking is calculated? Does it show seasonal context?
- **XP sink clarity:** Do coupon/rarity boost redemption UIs make sense to shoppers? Any clarity gaps?

Feedback loop to findasale-gamedesign if UX tweaks recommended.

---

## S264 PRIORITY 4 — End-to-End XP Test (Optional, P3)

Optional: user11 XP testing — simulate a purchase to verify XP award + rank update works end-to-end.

- Log in as user11 (shopper with existing XP seed data)
- Navigate to `/shopper/loyalty` — note current XP + rank
- Create a test purchase (or simulate via Stripe webhook if test env supports)
- Return to `/shopper/loyalty` — verify XP increased + rank updated if threshold crossed

This validates the Phase 2c event wiring (stripeController XP award) works in live environment.

---

## Context

**S263 Complete:** XP system bug (TS2345 in stripeController.ts + prisma singleton) fixed. Railway green. Batches 3+4 pushed by Patrick, Vercel deploy in progress.

**Phase 2 Status:** 2a (schema) + 2b (frontend) + 2c (event wiring) all deployed to Neon + Railway + Vercel. Route bug fixed. RankBadge + RankProgressBar live. leaderboard live.

**Brand Drift Status:** Batches 1+2 live (commit b06242d). Batches 3+4 committed locally by S263, pushed S263. Awaiting Vercel confirmation.

**Platform serves 5 sale types:** estate sales, yard sales, auctions, flea markets, consignment.

---

## Test Accounts (Live on Neon)

All password: `password123`
- `user1@example.com` — ADMIN + SIMPLE organizer
- `user2@example.com` — PRO organizer (Stripe connected)
- `user3@example.com` — TEAMS organizer (Stripe connected)
- `user11@example.com` — Shopper with full XP activity (purchases, referral, bids seeded)
