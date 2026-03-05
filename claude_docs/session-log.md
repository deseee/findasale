# Session Log — FindA.Sale

Cross-session memory for Claude. Updated at every session end.
Read this at session start to understand recent context without loading extra files.
Keep only the 5 most recent sessions. Delete older entries — git history and STATE.md are the durable record.

---

## Recent Sessions

### 2026-03-05 (session 52 — Opus Research: Workflow Hardening + Self-Improvement)
**Worked on:** Comprehensive research session using Opus. Three parallel research agents investigated: model routing (Opus/Sonnet/Haiku pricing + sub-agent `model` parameter), MCP connectors and uptime monitoring, stress testing and CLAUDE.md best practices. Created 3 new reference docs: `claude_docs/model-routing.md` (session model + sub-agent routing matrix), `claude_docs/patrick-language-map.md` (Patrick's command vocabulary mapped to expected Claude actions), `claude_docs/session-safeguards.md` (circuit breakers, repair loop limits, common error defenses). Updated CORE.md with §11–§13 referencing new docs. Added 4 new self-healing entries (#21–#24: PowerShell syntax, Prisma non-interactive, repair loops, write-before-read). Created 2 scheduled tasks: `weekly-industry-intel` (Mondays 9am) and `context-freshness-check` (daily 8am). Added Workflow & Infrastructure track to roadmap.
**Decisions:** Default model is Sonnet. Target split: 60% Sonnet / 30% Haiku sub-agents / 10% Opus sessions. Repair loop hard limit: 3 attempts per error. Ollama embedding service deferred to post-Phase 29. External uptime monitoring (StatusGator/UptimeRobot) queued for Patrick setup. Pre-commit validation skill queued for next Sonnet session.
**Next up:** Sprint I — Phase 19 (Hunt Pass + shopper points). Also queued: stress test suite skill, pre-commit validation skill (both Sonnet-tier).
**Blockers:** Same as session 51 — Vercel redeploy pending, Phase 31 OAuth env vars pending.

### 2026-03-05 (session 51 — Phase 26 + 28 + 18 sprint batch)
**Worked on:** Three full sprints in one session. Phase 26: SaleCard + ItemCard full rewrite (LQIP 3-tier blur-up, aspect-square, badge overlays, 2-col mobile grid), SkeletonCards + index.tsx + organizers/[id].tsx updated. Phase 28: `GET /api/feed` personalized activity feed endpoint (follows→sales, fallback to recent), `favoriteCount` (`_count.favorites`) added to `listSales` response, `/feed` page with auth gate + empty states + 2-col grid. Phase 18: `PhotoLightbox.tsx` component (full-screen, keyboard+swipe nav, dot indicators, `getFullUrl` 1600w), wired into `sales/[id].tsx` gallery (replaced `<a target=_blank>` with aspect-square button grid + hover overlay) and `items/[id].tsx` (thumbnail strip with selected-photo state + lightbox). All files pushed to GitHub (commits abe5461, 11d06e1, ac7ebf2, 2225c4d).
**Decisions:** Phase 28 uses no new Prisma schema — `_count.favorites` is an aggregate on the existing Favorite model. Feed falls back to all recent sales when user follows nobody (`personalized: false` flag in response). PhotoLightbox uses `getFullUrl` (1600w WebP) — existing imageUtils helper from Phase 14c.
**Next up:** Sprint I — Phase 19 (Hunt Pass + shopper points). Sprint J — Phase 22 (Creator tier). See next-session-prompt.md for full specs.
**Blockers:** Vercel redeploy still pending (rate limit from earlier). Phase 31 OAuth env vars still need adding once Vercel clears.

### 2026-03-05 (session 49 — Phase 17 delivery + Phase 31 OAuth)
**Worked on:** Built Phase 17 notification delivery — created `followerNotificationService.ts` (queries Follow table, sends Resend email + VAPID push per follower preference), wired fire-and-forget call into `saleController.updateSaleStatus` on DRAFT→PUBLISHED transition. Built Phase 31 OAuth social login — NextAuth v4 (Pages Router), backend `POST /auth/oauth` endpoint (find-or-create by oauthProvider+oauthId), OAuthBridge pattern in `_app.tsx` that hands JWT to AuthContext then clears NextAuth session, Google + Facebook buttons on login + register pages, `next-auth` dep added. All 8 files pushed to GitHub (commits c3e664 + 5fad9af).
**Decisions:** NextAuth v4 over v5 — project uses Pages Router; v5 targets App Router only. OAuthBridge pattern (NextAuth handles OAuth flow only; existing JWT system owns all API auth) — avoids dual-auth conflict without replacing AuthContext.
**Next up:** Add Phase 31 env vars to Vercel once Vercel redeploy clears.
**Blockers:** Vercel rate limit still pending.

### 2026-03-04 (session 48 — Security fix, Phase 17 audit, Phase 31 schema)
**Worked on:** Fixed HIGH-severity health item: sanitized `console.error` calls in `auth.ts` that could leak reset tokens. Audited Phase 17 follow system — discovered notification delivery entirely missing. Phase 31 OAuth schema prep: added `oauthProvider`, `oauthId`, made `password` optional; created and applied migration to Neon. Fixed Docker crash loop caused by `DIRECT_URL` missing from `docker-compose.yml`.
**Decisions:** Phase 17 re-flagged as incomplete — notification delivery was the blocking gap. Phase 31 schema-first approach.
**Next up:** Build Phase 17 notification delivery. Then Phase 31 NextAuth install.
**Blockers:** Vercel redeploy still pending.

### 2026-03-04 (session 47 — Railway + Neon Infrastructure Migration)
**Worked on:** Migrated backend from local Docker + ngrok to Railway. Fixed 6 TypeScript compilation errors. Fixed Dockerfile binary resolution. Fixed `uuid@13` ESM-only crash by replacing with `crypto.randomUUID()`. Railway container now healthy. Ran `prisma migrate deploy` against Neon.
**Decisions:** `crypto.randomUUID()` preferred over pinning uuid@9. `pnpm run` preferred over `pnpm exec` in Docker.
**Next up:** Vercel redeploy. Then Sprint E (Phase 26).
**Blockers:** Vercel redeploy rate limit.
