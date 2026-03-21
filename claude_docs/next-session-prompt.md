# Next Session Prompt — S225

## Primary Objective: Comprehensive Audit S205–S224

Patrick has requested a systematic audit of ALL sessions from S205 through S224 to verify that:
1. Every bug found in those sessions is fixed and deployed
2. Every fix that was deployed has been Chrome-verified live
3. No regressions introduced by the S224 feature batch

## Audit Scope

Read session-log.md entries for S205–S224. For each session, extract:
- Bugs found (P0/P1/P2/P3)
- Fixes reported as shipped
- Chrome verification status (was it actually verified live?)

Cross-reference against current STATE.md "Remaining unfixed" list.

## Known Outstanding Items (as of S224)

### Patrick Actions Required First:
- [ ] prisma migrate deploy + prisma generate against Neon (#72 Phase 2 dual-role schema)
  Command: cd C:\Users\desee\ClaudeProjects\FindaSale\packages\database
           $env:DATABASE_URL="postgresql://neondb_owner:npg_VYBnJs8Gt3bf@ep-plain-sound-aeefcq1y.c-2.us-east-2.aws.neon.tech/neondb?sslmode=require"
           npx prisma migrate deploy
           npx prisma generate

### Unverified / Possibly Unverified Fixes:
- Inspiration nav link missing from Layout nav (S218 added it, may have been dropped in later commit)
- /pricing page (NEW S224) — needs Chrome verification
- /shopper/favorites (NEW S224) — needs Chrome verification (requires login as shopper)
- /shopper/messages + /organizer/messages (NEW S224) — needs Chrome verification
- FavoriteButton on ItemCard/InspirationGrid/sale detail (NEW S224) — needs Chrome verification
- PWA install banner fix (S224) — needs Chrome verification (dismiss, navigate, confirm no reappear)
- Leaderboard sort (S224) — needs Chrome verification (Frank should be #1 after Railway deploys)

### Feature Gaps Still Open:
- #73 Two-Channel Notification System (gated by #72 Prisma migration)
- #74 Role-Aware Registration Consent Flow (gated by #72)
- #75 Tier Lapse State Logic (gated by #72)

### Pre-Beta Safety Items Remaining:
- #106 Organizer Reputation Scoring
- #107 Chargeback + Collusion Tracking
- #108 Winning Bid Velocity Check
- #109 Off-Platform Transaction Detection

## Session Start Instructions

1. Load STATE.md + this file
2. Ask Patrick if Prisma migration ran (it's the blocker for messaging + auth)
3. Chrome-verify all S224 new features first (pricing, favorites, messages)
4. Then audit S205–S224 session-log entries systematically
5. Flag any bug reported as "fixed" that has no Chrome verification entry
6. Dispatch dev for any confirmed regressions found

## Vercel URL
https://findasale-git-main-patricks-projects-f27190f8.vercel.app

## Test Accounts
- Shopper: user11@example.com / password123
- Organizer PRO: user2@example.com / password123
- Admin: user1@example.com / password123
