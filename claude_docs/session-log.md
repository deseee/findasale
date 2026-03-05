# Session Log — FindA.Sale

Cross-session memory for Claude. Updated at every session end.
Read this at session start to understand recent context without loading extra files.
Keep only the 5 most recent sessions. Delete older entries — git history and STATE.md are the durable record.

---

## Recent Sessions

### 2026-03-05 (session 51 — Phase 26 + 28 + 18 sprint batch)
**Worked on:** Three full sprints in one session. Phase 26: SaleCard + ItemCard full rewrite (LQIP 3-tier blur-up, aspect-square, badge overlays, 2-col mobile grid), SkeletonCards + index.tsx + organizers/[id].tsx updated. Phase 28: `GET /api/feed` personalized activity feed endpoint (follows→sales, fallback to recent), `favoriteCount` (`_count.favorites`) added to `listSales` response, `/feed` page with auth gate + empty states + 2-col grid. Phase 18: `PhotoLightbox.tsx` component (full-screen, keyboard+swipe nav, dot indicators, `getFullUrl` 1600w), wired into `sales/[id].tsx` gallery (replaced `<a target=_blank>` with aspect-square button grid + hover overlay) and `items/[id].tsx` (thumbnail strip with selected-photo state + lightbox). All files pushed to GitHub (commits abe5461, 11d06e1, ac7ebf2, 2225c4d).
**Decisions:** Phase 28 uses no new Prisma schema — `_count.favorites` is an aggregate on the existing Favorite model. Feed falls back to all recent sales when user follows nobody (`personalized: false` flag in response). PhotoLightbox uses `getFullUrl` (1600w WebP) — existing imageUtils helper from Phase 14c.
**Next up:** Sprint I — Phase 19 (Hunt Pass + shopper points). Sprint J — Phase 22 (Creator tier). See next-session-prompt.md for full specs.
**Blockers:** Vercel redeploy still pending (rate limit from earlier). Phase 31 OAuth env vars still need adding once Vercel clears.

### 2026-03-05 (session 49 — Phase 17 delivery + Phase 31 OAuth)
**Worked on:** Built Phase 17 notification delivery — created `followerNotificationService.ts` (queries Follow table, sends Resend email + VAPID push per follower preference), wired fire-and-forget call into `saleController.updateSaleStatus` on DRAFT→PUBLISHED transition. Built Phase 31 OAuth social login — NextAuth v4 (Pages Router), backend `POST /auth/oauth` endpoint (find-or-create by oauthProvider+oauthId), OAuthBridge pattern in `_app.tsx` that hands JWT to AuthContext then clears NextAuth session, Google + Facebook buttons on login + register pages, `next-auth` dep added. All 8 files pushed to GitHub (commits c3e664 + 5fad9af).
**Decisions:** NextAuth v4 over v5 — project uses Pages Router; v5 targets App Router only. OAuthBridge pattern (NextAuth handles OAuth flow only; existing JWT system owns all API auth) — avoids dual-auth conflict without replacing AuthContext.
**Next up:** Add Phase 31 env vars to Vercel once Vercel redeploy clears (NEXTAUTH_SECRET, NEXTAUTH_URL, GOOGLE_CLIENT_ID/SECRET, FACEBOOK_CLIENT_ID/SECRET + OAuth redirect URIs in provider consoles). Then plan next sprint.
**Blockers:** Vercel rate limit still pending. Phase 31 feature is deployed but dormant until env vars are set.

### 2026-03-04 (session 48 — Security fix, Phase 17 audit, Phase 31 schema)
**Worked on:** Fixed HIGH-severity health item: sanitized `console.error` calls in `auth.ts` that could leak reset tokens via Prisma error objects. Audited Phase 17 follow system — discovered notification delivery entirely missing (follow/unfollow endpoints exist, DB schema exists, but sale publish flow never queries Follow table or sends email/push to followers). Phase 31 OAuth schema prep: added `oauthProvider`, `oauthId`, made `password` optional in schema.prisma; created and applied migration `20260304000003_phase31_oauth_fields` to Neon. Fixed Docker crash loop caused by `DIRECT_URL` missing from `docker-compose.yml` backend environment.
**Decisions:** Phase 17 re-flagged as incomplete — "code complete" was inaccurate; notification delivery is the blocking gap. Phase 31 schema-first approach: DB layer done before NextAuth install to avoid migration conflicts later.
**Next up:** Build Phase 17 notification delivery (query Follow table on sale publish, send email via Resend + push via VAPID to followers). Then Phase 31 NextAuth.js v5 install.
**Blockers:** Vercel redeploy still pending (rate limit from prior session).

### 2026-03-04 (session 47 — Railway + Neon Infrastructure Migration)
**Worked on:** Migrated backend from local Docker + ngrok to Railway. Fixed 6 TypeScript compilation errors exposed by `tsc --strict` (Prisma compound key naming `saleId_userId`, nullable `userId` on SaleSubscriber, `never` type from always-true `typeof` checks on Prisma Float fields, missing `prisma` import in index.ts SIGINT handler). Fixed Dockerfile binary resolution (`pnpm exec` → `pnpm run` for prisma generate/migrate). Fixed `uuid@13` ESM-only crash by replacing with Node 18 built-in `crypto.randomUUID()`. Railway container now healthy. Ran `prisma migrate deploy` against Neon — all 15 migrations already applied. Set `NEXT_PUBLIC_API_URL` in Vercel to Railway domain.
**Decisions:** `crypto.randomUUID()` preferred over pinning uuid@9 — eliminates the dependency entirely. `pnpm run` (npm scripts) preferred over `pnpm exec` in Docker for binary resolution reliability.
**Next up:** Vercel redeploy (rate-limited, pending a few hours). Verify frontend talks to Railway backend end-to-end. Then Sprint E (Phase 26 — listing card redesign).
**Blockers:** Vercel redeploy rate limit — frontend still points at old backend URL until deploy completes.

### 2026-03-05 (session 42 — Sprint A: Phase 12 Auction Completion)
**Worked on:** Completed Sprint A. Audited all Phase 12 remaining work against code reality. Discovered frontend auction toggles and schema fields were already complete from session 36. Two actual gaps fixed: (1) `stripeController.ts` was using sale-level `isAuctionSale` flag for both price derivation and 7% fee — replaced with item-level `const isAuctionItem = !!item.auctionStartPrice` so the 7% fee applies to any item with `auctionStartPrice` set regardless of sale type; (2) `itemController.ts` `createItem` and `updateItem` were silently dropping `category` and `condition` from req.body — both now extract and persist those fields. Both files pushed to GitHub (2 commits, bf3ac03).
**Decisions:** Item-level auction detection preferred over sale-level — enables mixed sales (some auction items, some fixed-price in same sale). Category/condition bug fix treated as part of Sprint A since it affected the same item creation flow.
**Next up:** Sprint B — Phase 24+25 design system foundation + bottom tab navigation. Load ROADMAP.md Phase 24/25 section before starting.
**Blockers:** None. Both fixes are backend-only, picked up by nodemon automatically — no Docker rebuild needed.

### 2026-03-04 (session 41 — 7-Test Workflow Stress Test)
**Worked on:** Ran all 7 stress tests from next-session-prompt.md to validate guardrails added in sessions 39–40. Tests covered: diff-only gate (CORE §4), session init protocol (CORE §2), MCP push batching (CORE §10), authority hierarchy conflict (CORE §7), Docker command safety (dev-environment skill), dead code detection (context.md accuracy), stale fact detection (polling vs Socket.io). All 7 passed. context.md regenerated locally — stale `contexts/` directory entry now removed.
**Decisions:** Sonnet is sufficient for Sprint A (Phase 12 auction completion — mechanical, 3-4 file edits). Opus recommended for Sprint B (Phase 24+25 design system — cross-cutting visual overhaul). Sprint A goes next via Sonnet.
**Next up:** Sprint A — Phase 12 auction completion: organizer auction toggle + Stripe 7% webhook.
**Blockers:** None. Guardrails verified. context.md fresh.





