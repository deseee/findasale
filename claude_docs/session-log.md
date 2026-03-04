# Session Log — FindA.Sale

Cross-session memory for Claude. Updated at every session end.
Read this at session start to understand recent context without loading extra files.
Keep only the 5 most recent sessions. Delete older entries — git history and STATE.md are the durable record.

---

## Recent Sessions

### 2026-03-04 (session 36 — Phase 9/11/12 Feature Sprint)
**Worked on:** Implemented Phase 9 (affiliate conversion tracking), Phase 12 (auction cron + frontend), and Phase 11 (PWA push notifications). Phase 9: fixed affiliateController prisma import, added `conversions` + `affiliateLinkId` to schema, wired Stripe metadata attribution, built `affiliate/[id].tsx` redirect page, updated creator dashboard stats, wired sessionStorage ref in CheckoutModal. Phase 12: fixed auctionJob.ts cron (was never scheduled), built AuctionCountdown + BidModal components, wired live countdown on sale detail. Phase 11: PushSubscription schema + migration, pushController/routes/webpush utility, usePushSubscription hook, sw-push.js service worker, PushSubscriber in _app.tsx, push sends in emailReminderService. Fixed Vercel build (pnpm-lock.yaml pushed after extended git conflict resolution). Fixed migration 20260304000001 with IF NOT EXISTS guards. Added self-healing skills 14–16 (MCP+untracked conflict, PowerShell bracket wildcards, git lock files).
**Decisions:** sessionStorage over cookies for affiliate attribution (no cookie-parser). Polling over Socket.io for auction UI (not installed; sufficient for MVP). Lazy require('web-push') so server starts without package.
**Next up:** Run `prisma migrate deploy` in Docker (both migrations 000001 + 000002 pending). Generate VAPID keys, add to .env files. Docker rebuild backend. Then smoke-test push subscriptions.
**Blockers:** Migrations not yet applied — need `docker exec findasale-backend-1 sh -c "cd /app/packages/database && npx prisma migrate deploy"`. VAPID keys not yet generated — `npx web-push generate-vapid-keys`.

### 2026-03-04 (session 35 — Bug Burn-Down + Component Drift Fixes)
**Worked on:** Component drift spot-check on SaleCard/CheckoutModal/Layout — found and fixed stale shared `Sale` type, nested anchor invalid HTML in SaleCard, and mobile-only nav array duplication in Layout. Fixed homepage index.tsx and city/[city].tsx to use `<SaleCard>` instead of inline JSX. Burned down remaining open bugs: removed password reset token from console log (HIGH), added 3D Secure redirect handling in purchases.tsx, reduced React Query staleTime 60s→20s. All 4 fixes pushed in 3 commits. Verified M-series ST1/ST2/E1/E2 and Vercel/Stripe rebrand items already closed (confirmed by Patrick). Session wrap queued next session as research-only: sample code for Phase 12 auctions, Phase 9 creator dashboard, Phase 11 push notifications.
**Decisions:** All audit findings are now closed. Feature sprint is the next move. Next session is research-only — sample code from open source before building.
**Next up:** Research session — find Socket.io auction patterns, creator referral analytics patterns, and PWA push notification patterns before coding Phase 12/9/11.
**Blockers:** None. All fixes on GitHub main. Vercel should be clean.

### 2026-03-04 (session 34 — Frontend Drift Audit + Vercel Build Fix)
**Worked on:** Completed systematic GitHub ↔ local drift audit of the entire `pages/` directory. Identified 11 stale files via size comparison (local vs GitHub byte counts). Root cause: early-draft pages with direct Prisma imports / npm qrcode package / stub code had never been updated on GitHub as the architecture evolved. Two files were directly causing Vercel TypeScript build failures (`index.tsx` had broken Prisma path, `organizer/dashboard.tsx` imported `qrcode` package not installed in repo). Fixed all 11 files. Also fixed `next.config.js` (SW rule ordering for ngrok + Stripe CSP). All changes pushed via GitHub MCP in 10 commits.
**Decisions:** Local repo is authoritative — GitHub had drifted significantly. Use size comparison (`wc -c` locally vs GitHub dir listing) as fast drift detection before reading every file. Proactive full-directory audit beats whack-a-mole build failures.
**Next up:** Trigger a Vercel deploy to confirm build is clean. Then either tackle remaining M-series findings (ST1, ST2, E1, E2) or move to real-user beta onboarding.
**Blockers:** None. All 11 files on GitHub main. Vercel build should be unblocked.

### 2026-03-04 (session 32 — M-Series Medium Audit Findings + GitHub Push Batching Rule)
**Worked on:** Completed 7 medium-severity audit findings from `audit-remaining-areas-2026-03-03.md`. E3: extracted shared Prisma singleton to `lib/prisma.ts`, removed `new PrismaClient()` from 10 files. ST3: Stripe webhook now verifies `on_behalf_of` vs organizer's `stripeConnectId`. ST4: fee math now uses integer cents (`Math.round(price * 100)`) to eliminate float rounding. DB2: user + organizer creation wrapped in `prisma.$transaction()`. E7: AuthContext checks JWT `exp` before any API call. EM2/EM3: `withRetry()` helper with exponential backoff for Resend + Twilio. P1: iCal guard for missing `startDate`/`endDate`. EC1 + DB1 already clean — verified, no fix needed. All 14 files pushed in 6 batched GitHub commits. Discovered and permanently fixed the GitHub push token-overflow issue: added Section 10 to CORE.md mandating max 3 files per `push_files` call.
**Decisions:** GitHub `push_files` must never batch more than 3 files — exceeding this hits the output token limit. Files >200 lines push alone. Rule is now in CORE.md Section 10 as a permanent behavioral constraint.
**Next up:** Remaining M-series findings (ST1, ST2, E1, E2, E4, E5, E6, PF1, S1) from `audit-remaining-areas-2026-03-03.md` — or skip to real-user beta.
**Blockers:** None. All changes on GitHub main.

### 2026-03-04 (session 31 — H1-H11 Pre-Beta Audit Fixes + Track B Docker Gap)
**Worked on:** Fixed all 11 high-severity pre-beta audit findings. H1: organizer badges/rating in getSale. H2: Promise.allSettled for partial upload success. H3: email/name normalization on auth. H4: weekend filter Saturday edge case. H5: mobile card views for 3 dashboard tables. H6: loading="lazy" on 16 frontend files (Python script introduced JSX arrow-operator bug in SaleCard.tsx — caught and fixed). H7: Zod CSV row validation. H8: global Express error handler. H9: Stripe webhook secret guard. H10: CAN-SPAM one-click unsubscribe (email link + backend endpoint + /unsubscribe page). H11: Resend domain — already verified, no action needed. Track B: tested all 5 Docker-from-VM options — accepted gap, documented in RECOVERY.md entry 17. All 27 changed files pushed to GitHub via MCP.
**Decisions:** Docker-from-VM gap is permanent unless Patrick manually enables TCP socket in Docker Desktop settings. Working pattern remains copy-paste PowerShell.
**Next up:** Activate fixes in Docker. Then begin M1-M19 medium findings or move to real-user beta.
**Blockers:** None. All fixes pushed.
