# Expert Stack Review — 2026-06-19 (S1013)

Four parallel read-only expert audits (backend perf, DB/schema, frontend/PWA, security/reliability). All findings tool-cited. Severity = by impact (net-new, not aged).

## P0 — fix first
- **Uncapped `limit` on public `GET /api/sales` (`listSales`)** — `saleController.ts:82` schema `limit` has no `.max()`; `parseInt` → `take`. `?limit=100000` runs `take:100000` on Sale + `include: items` → OOM/DB-spill DoS, public/no-auth. Fix: Zod `.max(50)` (pattern exists in citiesController.ts:135). Also `getSalesByCity` uncapped (`saleController.ts:1198`).

## P1 — serious
- **Per-item fan-out in 3 public sale-list endpoints** — `listSales` (`saleController.ts:209-211`), `getSalesByNeighborhood` (`:1165`), `getSalesByCity` (`:1221`) pull every item of every sale just for a max-discount + markdown flag. Fix: `groupBy`/`aggregate` by saleId or precompute on Sale row.
- **`getOrganizerLeaderboard` N+1** — `leaderboardController.ts:88-105`: 100 orgs × 2 counts = 200 queries/request, no cache. Fix: `groupBy`.
- **Non-singleton PrismaClient** — `services/tierGraceService.ts:10` `new PrismaClient()` = second pool, bypasses retry/monitoring. Fix: import shared `lib/prisma`.
- **No response caching on hot reads** — Redis wired (`lib/redis.ts`) but only used for AI cost + rate limit. Feed/`getCities`(full GROUP BY/call)/trending/city pages recompute per anon visitor + crawler. Fix: short-TTL Redis or `Cache-Control: s-maxage`.
- **No `connection_limit` on Railway DATABASE_URL** — Prisma pool uncapped vs max_connections=100; redeploy overlap → P1017 exhaustion. Fix: `?connection_limit=10&pool_timeout=20` (env change, no migration). Reconcile stale PgBouncer comment in lib/prisma.ts.
- **Index over-provisioning on write-hot tables** — Organizer 31 idx/69MB (10 never scanned, 21MB), Sale 26 idx/89MB (3 never scanned). 262k + 369k lifetime UPDATEs pay write amplification. Fix: `DROP INDEX CONCURRENTLY` the confirmed-unused + remove `@@index` lines (EXPLAIN-verify the few that map to low-freq crons first).
- **`POST /api/search/visual` public + Google Vision + no rate limiter** — `routes/search.ts:454` (siblings use searchLimiter). Billing-DoS; documented $201 Google API incident. Fix: strict IP limiter.
- **No process-level `uncaughtException`/`unhandledRejection` handlers** — 0 matches in src. A stray rejection in any cron/socket/fire-and-forget crashes the Railway backend. Fix: process handlers → Sentry + log.

## P2 — real but bounded
- `getSale` loads all organizer reviews to average + all sale items no take — `saleController.ts:462-468`, `:406-417`. Fix: `review.aggregate`, add take.
- Payment/payout endpoints lack `paymentLimiter` (have auth) — `stripeConnect.ts:17`, `settlement.ts:21`, `billing.ts:16-21`, `pos.ts:53`.
- Coupon `/generate*` unthrottled (`coupons.ts:12,14`); `/organizers/:id/claim` unauth+unthrottled (`organizers.ts:1922`).
- Unbounded operational-log tables, no retention — ScrapedSalesJob (+~300/day, 12,191 rows/40d), OutreachAuditLog (~56/day), DirectoryCrawlLog. Fix: 30-day DELETE cron.
- Card images use raw `<img>` Cloudinary WebP fixed-width (125 `<img>` tags) — `imageUtils.ts`, `SaleCard.tsx:168`, `ItemCard.tsx:270`. Biggest LCP/bandwidth lever. Fix: `f_auto` (AVIF) + responsive Cloudinary srcset/sizes (keeps raw-img architecture).

## P3 — polish
- scoutLeaderboard N+1 (`leaderboardController.ts:187-204`); trending N+1 + heavy include (`trendingController.ts`).
- Error handler returns raw `err.message` on 500 (`index.ts:688`); `/health` liveness-only, no DB ping; pricing routes missing `authenticate` before `requireOrganizer` (fails closed).
- ~3.7MB audio/video assets in `public/` (move to CDN); feed/leaderboard client-only (add ISR); a few next/image `unoptimized`/missing `sizes`; Item.embedding 0/143 populated (keep explicit-select discipline; migrate to pgvector if semantic search revived); duplicate `_prisma_migrations` name rows (cosmetic); stray `.fuse_hidden*` temp files.

## Confirmed STRONG (no action)
- Security baseline: JWT cookie auth w/ DB roles + tokenVersion invalidation + suspension gate; admin routes fully gated; ownership checks on sale/item; double-layered auth rate-limiting; Stripe webhook signature verify + INSERT-first idempotency; zero `...req.body` mass-assignment; 30s request timeout + degradationMode + graceful shutdown + global error handler; Sentry (BE+FE) + cronGuard check-ins; CORS allowlist; 1mb body cap; no hardcoded secrets.
- PWA: complete manifest (maskable icons, shortcuts), custom SW + next-pwa workbox, offline.html, InstallPrompt, theme-color/apple meta, preconnect. 30 pages ISR. Cloudinary LQIP/lazy/aspect-ratio/low-bandwidth quality switching. Strong security headers (CSP/HSTS).
