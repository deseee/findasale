# Session Log — FindA.Sale

Cross-session memory for Claude. Updated at every session end.
Read this at session start to understand recent context without loading extra files.
Keep only the 5 most recent sessions. Delete older entries — git history and STATE.md are the durable record.

---

## Recent Sessions

### 2026-03-05 (session 57 — Sprints O–R: Hold UI + Referral + Curator Email + CSV Export)
**Worked on:** Sprint O (Phase 21): pushed `dashboard.tsx` with Manage Holds button (was edited but not pushed). Sprint P (Phase 23): `referralController.ts` + `/api/referrals/dashboard` + `refer/[code].tsx` (localStorage + redirect) + fixed `referral-dashboard.tsx` (user.referralCode in link, added Recent Referrals list). Sprint Q (Phase 30): `curatorEmailJob.ts` (Monday 8AM cron, per-organizer HTML email digest to followers with `notifyEmail=true`, PUBLISHED sales in next 7 days) + registered in `index.ts`. Sprint R (Phase 32): `GET /organizers/me/export/items/:saleId` endpoint (RFC 4180 CSV, ownership check) + Export CSV button in `add-items/[saleId].tsx` (authenticated fetch + blob URL). All pushed to GitHub `deseee/findasale` main.
**Decisions:** Phase 23 was mostly pre-built; missing pieces were `/refer/[code].tsx` redirect page, referral dashboard backend endpoint, and bug in share link URL. Phase 30 uses `Follow.notifyEmail` field (already existed) to filter digest recipients. Phase 32 export route placed before `/:id` wildcard in organizers.ts to avoid Express routing collision. Authenticated blob download required because `<a download>` cannot include `Authorization` headers.
**Next up:** Sprint S — Phase 16 (Advanced photo pipeline).
**Blockers:** Phase 31 OAuth env vars still needed in Vercel. Phase 21/23 Neon migrations may need manual `prisma migrate deploy` if schema has new models.

### 2026-03-05 (session 56 — Sprint M + N: Reviews system + Shopper messaging)
**Worked on:** Sprint M (Phase 15): `reviewController.ts` + `/api/reviews` (POST sale/organizer, GET by target, avg recalc) + `StarRating.tsx` + `ReviewsSection.tsx` + 5pt award on first review. Sprint N (Phase 20): `Conversation` + `Message` Prisma models + `20260305000002_phase20_messaging` migration + `messageController.ts` (getConversations, getThread, sendMessage, replyInThread, getUnreadCount) + `/api/messages` Express router + `messages/index.tsx` inbox + `messages/[id].tsx` iMessage-style thread + `messages/new.tsx` start-conversation page + `useUnreadMessages` hook + BottomTabNav extended to 5 tabs with amber unread badge + "Message organizer" button on sale detail (shoppers only). All 11 Phase 20 files pushed to GitHub.
**Decisions:** Conversation unique constraint `@@unique([shopperUserId, organizerId, saleId])` — one thread per shopper+organizer+sale combo. `/unread-count` route declared before `/:conversationId` in Express to prevent route collision. `prisma.conversation.upsert` for find-or-create semantics. `prisma.$transaction` for atomic reply + `lastMessageAt` update. 15s polling on thread, 30s on inbox and unread badge.
**Next up:** Sprint O — Phase 21 (Reservation/hold UI).
**Blockers:** Phase 20 Neon migration needs manual `prisma migrate deploy` (migration file committed — Railway auto-applies on next deploy, or run manually from `packages/database` with Neon env vars).

### 2026-03-05 (session 54 — Production stabilisation: CORS, NextAuth, Railway 502, seed)
**Worked on:** Full production incident resolution. Fixed CORS (`finda.sale` not in `ALLOWED_ORIGINS`). Fixed NextAuth 500 (`NEXTAUTH_SECRET` + `NEXTAUTH_URL` missing from Vercel). Diagnosed Railway backend 502 — root cause: `EXPOSE 5000` in Dockerfile but Railway was injecting `PORT=8080`, creating a routing mismatch; fixed by setting `PORT=5000` explicitly in Railway Variables. Discovered missing Phase 22 migration (`reputationTier` column was pushed to local DB without a migration file); created and pushed `20260305000001_phase22_reputation_tier`. Seeded Neon production DB with demo data. Logged all fixes in STATE.md Known Gotchas + Dockerfile comment + self_healing_skills.md. Set up `.githooks/pre-push` TypeScript check to prevent future type errors reaching Vercel.
**Decisions:** `PORT=5000` locked in Railway Variables — must stay aligned with `EXPOSE` in Dockerfile. Seed command uses `pnpm run prisma:seed` (ts-node), not tsx.
**Next up:** Sprint M — Phase 15 (Review + rating system UI).
**Blockers:** Phase 31 OAuth env vars still needed in Vercel (`GOOGLE_CLIENT_ID/SECRET`, `FACEBOOK_CLIENT_ID/SECRET`) + OAuth redirect URIs in console.

### 2026-03-05 (session 53 — Sprints I–L: Hunt Pass, Creator Tier, Onboarding, Search)
**Worked on:** Four sprints shipped. Sprint I (Phase 19): `PointsTransaction` schema + `pointsService.ts` + `/api/points` GET+track-visit routes + `PointsBadge.tsx` + `usePoints` hook + profile tier display (Scout/Hunter/Estate Pro) + BottomTabNav badge + visit tracking wired in `sales/[id].tsx`. Sprint J (Phase 22): `reputationJob.ts` (weekly cron, tier recalculation) + `TierBadge.tsx` (compact inline, TRUSTED/ESTATE_CURATOR only) + `GET /api/organizers/me` (progress message) + `reputationTier` in `listSales` + `SaleCard` tier badge + organizer dashboard tier card with benefits checklist. Sprint K (Phase 27): `OnboardingModal.tsx` (3-step, push permission, localStorage gate) + `_app.tsx` OnboardingShower + `ToastContext` points type (amber, bottom-20 above BottomTabNav) + shopper dashboard empty states. Sprint L (Phase 29): `search.ts` backend route (`GET /` unified text search, `GET /categories/:cat`) + `/search` page (tabs, TanStack Query) + `/categories/[category]` page + wired `app.use('/api/search')` in `index.ts` + fixed CORS regex bug (was double-escaped `\/\/`).
**Decisions:** Points toast renders at `bottom-20` (above BottomTabNav). `TierBadge` returns null for `NEW` tier. `OnboardingModal` excluded for ORGANIZER/ADMIN roles. Search uses Prisma `contains` with `mode: 'insensitive'`.
**Next up:** Sprint M — Phase 15.
**Blockers:** Phase 19 Neon migration still pending. Vercel redeploy pending. Phase 31 OAuth env vars still needed.

### 2026-03-05 (session 52 — Opus Research: Workflow Hardening + Self-Improvement)
**Worked on:** Comprehensive research session using Opus. Created 3 new reference docs: `claude_docs/model-routing.md`, `claude_docs/patrick-language-map.md`, `claude_docs/session-safeguards.md`. Updated CORE.md with §11–§13. Added 4 new self-healing entries (#21–#24). Created 2 scheduled tasks: `weekly-industry-intel` (Mondays 9am) and `context-freshness-check` (daily 8am). Added Workflow & Infrastructure track to roadmap.
**Decisions:** Default model: Sonnet. Target split: 60% Sonnet / 30% Haiku sub-agents / 10% Opus. Repair loop hard limit: 3 attempts per error.
**Blockers:** Vercel redeploy pending. Phase 31 OAuth env vars needed.
