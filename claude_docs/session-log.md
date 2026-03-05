# Session Log — FindA.Sale

Cross-session memory for Claude. Updated at every session end.
Read this at session start to understand recent context without loading extra files.
Keep only the 5 most recent sessions. Delete older entries — git history and STATE.md are the durable record.

---

## Recent Sessions

### 2026-03-05 (session 54 — Production stabilisation: CORS, NextAuth, Railway 502, seed)
**Worked on:** Full production incident resolution. Fixed CORS (`finda.sale` not in `ALLOWED_ORIGINS`). Fixed NextAuth 500 (`NEXTAUTH_SECRET` + `NEXTAUTH_URL` missing from Vercel). Diagnosed Railway backend 502 — root cause: `EXPOSE 5000` in Dockerfile but Railway was injecting `PORT=8080`, creating a routing mismatch; fixed by setting `PORT=5000` explicitly in Railway Variables. Discovered missing Phase 22 migration (`reputationTier` column was pushed to local DB without a migration file); created and pushed `20260305000001_phase22_reputation_tier`. Seeded Neon production DB with demo data. Logged all fixes in STATE.md Known Gotchas + Dockerfile comment + self_healing_skills.md. Set up `.githooks/pre-push` TypeScript check to prevent future type errors reaching Vercel.
**Decisions:** `PORT=5000` locked in Railway Variables — must stay aligned with `EXPOSE` in Dockerfile. Seed command uses `pnpm run prisma:seed` (ts-node), not tsx. Credentials for production seed live in `packages/backend/.env` — Claude can read these directly rather than asking Patrick to relay them.
**Next up:** Sprint M — Phase 15 (Review + rating system UI).
**Blockers:** Phase 31 OAuth env vars still needed in Vercel (`GOOGLE_CLIENT_ID/SECRET`, `FACEBOOK_CLIENT_ID/SECRET`) + OAuth redirect URIs in console.

### 2026-03-05 (session 53 — Sprints I–L: Hunt Pass, Creator Tier, Onboarding, Search)
**Worked on:** Four sprints shipped. Sprint I (Phase 19): `PointsTransaction` schema + `pointsService.ts` + `/api/points` GET+track-visit routes + `PointsBadge.tsx` + `usePoints` hook + profile tier display (Scout/Hunter/Estate Pro) + BottomTabNav badge + visit tracking wired in `sales/[id].tsx`. Sprint J (Phase 22): `reputationJob.ts` (weekly cron, tier recalculation) + `TierBadge.tsx` (compact inline, TRUSTED/ESTATE_CURATOR only) + `GET /api/organizers/me` (progress message) + `reputationTier` in `listSales` + `SaleCard` tier badge + organizer dashboard tier card with benefits checklist. Sprint K (Phase 27): `OnboardingModal.tsx` (3-step, push permission, localStorage gate) + `_app.tsx` OnboardingShower + `ToastContext` points type (amber, bottom-20 above BottomTabNav) + shopper dashboard empty states. Sprint L (Phase 29): `search.ts` backend route (`GET /` unified text search, `GET /categories/:cat`) + `/search` page (tabs, TanStack Query) + `/categories/[category]` page + wired `app.use('/api/search')` in `index.ts` + fixed CORS regex bug (was double-escaped `\\/\\/`). Commits: 723bafe, 114f55c, 89b732f, 991cb40.
**Decisions:** Points toast renders at `bottom-20` (above BottomTabNav) in a separate container from standard toasts. `TierBadge` returns null for `NEW` tier — no badge shown. `OnboardingModal` excluded for ORGANIZER/ADMIN roles. Search uses Prisma `contains` with `mode: 'insensitive'` — no FTS extension needed. CORS regex fix: `/^https:\/\/findasale[a-z0-9-]*\.vercel\.app$/`.
**Next up:** Sprint M — Phase 15 (Review + rating system UI). Also: Neon migration for Phase 19 `PointsTransaction` table still needs manual run.
**Blockers:** Phase 19 Neon migration still pending (`phase19_points_transaction` — points system will error until table exists). Vercel redeploy pending. Phase 31 OAuth env vars still needed.

### 2026-03-05 (session 52 — Opus Research: Workflow Hardening + Self-Improvement)
**Worked on:** Comprehensive research session using Opus. Created 3 new reference docs: `claude_docs/model-routing.md`, `claude_docs/patrick-language-map.md`, `claude_docs/session-safeguards.md`. Updated CORE.md with §11–§13. Added 4 new self-healing entries (#21–#24). Created 2 scheduled tasks: `weekly-industry-intel` (Mondays 9am) and `context-freshness-check` (daily 8am). Added Workflow & Infrastructure track to roadmap.
**Decisions:** Default model: Sonnet. Target split: 60% Sonnet / 30% Haiku sub-agents / 10% Opus. Repair loop hard limit: 3 attempts per error.
**Blockers:** Same as session 51.

### 2026-03-05 (session 51 — Phase 26 + 28 + 18 sprint batch)
**Worked on:** Three full sprints. Phase 26: SaleCard + ItemCard LQIP rewrite. Phase 28: `/api/feed` + `/feed` page. Phase 18: PhotoLightbox component.
**Decisions:** Phase 28 uses `_count.favorites` aggregate. PhotoLightbox uses `getFullUrl` (1600w WebP).
**Blockers:** Vercel redeploy pending. Phase 31 OAuth env vars needed.

### 2026-03-05 (session 49 — Phase 17 delivery + Phase 31 OAuth)
**Worked on:** Phase 17 notification delivery + Phase 31 OAuth social login (NextAuth v4).
**Decisions:** NextAuth v4 over v5 (Pages Router). OAuthBridge pattern.
**Blockers:** Vercel rate limit. Phase 31 dormant until env vars set.
