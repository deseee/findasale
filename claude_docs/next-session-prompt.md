# Next Session Prompt — S263

**Date:** 2026-03-24 (S262 complete)
**Status:** Phase 2a+2b+2c ALL deployed. XP route bug found + fixed by QA. Brand drift Batches 3+4 committed locally, pending push after QA.

---

## S263 PRIORITY 1 — QA Smoke Test (All S262 Changes Live)

MANDATORY per CLAUDE.md §10. Verify all S262 work is live on finda.sale via Chrome MCP.

**Test Plan:**
- **Brand Drift Batches 3+4:** City pages (`/city/denver`), map page (`/map`), calendar page (`/calendar`), search empty state, trending page, inspiration page — verify "secondary sale organizer" copy is live, no "estate sale only" language.
- **Encyclopedia Rename:** Verify "Resale Encyclopedia" is live on relevant pages.
- **XP Profile/Leaderboard:** Login as user11 (shopper), navigate to `/shopper/loyalty` — RankBadge + RankProgressBar rendering? Navigate to `/shopper/leaderboard` — top 50 showing? No API 404 errors in console. (Route bug was fixed S262 — verify the fix is live.)
- **Phase 2c XP Events:** Spot-check that `/api/xp/profile` returns non-zero guildXp for user11 (who has seed data purchase/referral activity).

If ANY test fails, flag immediately and dispatch findasale-dev before other work.

---

## S263 PRIORITY 2 — Push Brand Drift Batches 3+4

After QA confirms no regressions on Batches 3+4 pages, push the locally-committed changes:

```powershell
cd C:\Users\desee\ClaudeProjects\FindaSale
git add packages/frontend/pages/trending.tsx
git add packages/frontend/pages/inspiration.tsx
git add packages/frontend/pages/tags/[slug].tsx
git add packages/frontend/pages/categories/index.tsx
git add "packages/frontend/pages/categories/[category].tsx"
git add packages/frontend/pages/search.tsx
git add packages/frontend/pages/feed.tsx
git add packages/frontend/pages/shopper/loot-log.tsx
git add "packages/frontend/pages/shopper/loot-log/public/[userId].tsx"
git add packages/frontend/pages/shopper/trails.tsx
git add packages/frontend/pages/shopper/trails/create.tsx
git add "packages/frontend/pages/trail/[shareToken].tsx"
git add packages/frontend/pages/surprise-me.tsx
git add packages/frontend/pages/shopper/dashboard.tsx
git add "packages/frontend/pages/shoppers/[id].tsx"
git add "packages/frontend/pages/hubs/[slug].tsx"
git add packages/frontend/pages/hubs/index.tsx
git add packages/frontend/components/SaleShareButton.tsx
git add packages/frontend/components/ReferralWidget.tsx
git add packages/frontend/components/SaleOGMeta.tsx
git add packages/frontend/components/SalesNearYou.tsx
git add packages/frontend/pages/api/og.tsx
git add packages/frontend/components/AddToCalendarButton.tsx
git commit -m "feat(brand): D-001 Batches 3+4 — secondary sale copy across shopper pages + components"
.\push.ps1
```

---

## S263 PRIORITY 3 — Brand Drift Deep QA (Copy Consistency Audit)

Separate from Priority 1 smoke test — deep dive on copy consistency:
- Verify ALL page titles/H1/meta descriptions use "secondary sale" or specific sale types, never "estate sale only"
- Check SaleShareButton, ReferralWidget, og-image API for brand voice compliance
- Spot-check 3 key pages for dark mode rendering (no hardcoded colors in new copy)

If copy issues found, dispatch findasale-dev for targeted fixes.

---

## S263 PRIORITY 4 — Explorer's Guild Phase 2 Shopper UX Review (Optional)

Once QA passes, optional deep dive:
- Does the XP system surface well to shoppers? RankBadge visibility on loyalty/profile pages?
- Are XP sink UI components clear (RarityBoost, Coupon redemption)?
- Any usability gaps in leaderboard (pagination, search, sorting)?

Feedback loop to findasale-gamedesign if design tweaks needed.

---

## Context

**Phase 2 Status:** 2a + 2b + 2c ALL deployed to live (Neon + Railway + Vercel). Route bug (double /api prefix) found by QA and fixed. No blockers.

**Brand Drift Status:** Batches 1+2 pushed (commit b06242d). Batches 3+4 committed locally, awaiting S263 QA verification before push.

**Platform serves 5 sale types:** estate sales, yard sales, auctions, flea markets, consignment.

---

## Test Accounts (Live on Neon)

All password: `password123`
- `user1@example.com` — ADMIN + SIMPLE organizer
- `user2@example.com` — PRO organizer (Stripe connected)
- `user3@example.com` — TEAMS organizer (Stripe connected)
- `user11@example.com` — Shopper with full XP activity (purchases, referral, bids seeded)
