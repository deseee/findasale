# PROJECT STATE

This file acts as compression anchor.
STATE.md replaces historical narrative during compression.
Older history may be discarded once summarized.
Update after major changes.

---

## Active Objective

Maintain stable MVP in Grand Rapids.
Prepare for scale to additional metros.

---

## Locked Decisions

- 5% platform fee (regular)
- 7% platform fee (auction)
- Stripe Connect Express
- Leaflet + OSM maps
- Backend geocoding cache
- Cloudinary image storage
- PWA enabled
- Polling for auctions (Socket.io deferred session 36)

---

## Completed

### Phase 1 – Core MVP (verified 2026-03-01)
- Monorepo scaffolded: backend (Express/Prisma), frontend (Next.js 14), database (PostgreSQL), shared
- Docker Compose with postgres, backend, frontend, image-tagger services
- JWT authentication (register/login) with role-based access (USER, ORGANIZER, ADMIN)
- Organizer registration auto-creates linked Organizer profile (businessName, phone, address)
- PostgreSQL ENUM→TEXT migration for Role, SaleStatus, ItemStatus, PurchaseStatus (Prisma compat)
- Sale creation API with city/state/zip fields, geocoding, lat/lng storage
- Nominatim geocoding proxy (backend) with 7-day in-memory cache
- Leaflet/OSM map: homepage pin cluster, sale detail page single pin
- Cloudinary photo upload via backend proxy; photo gallery on sale detail page
- Sale detail page: address, dates, description, organizer badge, share/Nextdoor buttons, action buttons for organizer
- Stripe platform fee schema (5% regular, 7% auction) — configured, not yet E2E tested
- Email digest (Resend) — wired, not yet E2E tested
- PWA manifest in place
- Docker volume mounts + nodemon --legacy-watch + WATCHPACK_POLLING for hot reload on Windows 10

### Phase 2 – Organizer Flows (verified 2026-03-01)
- Add Items: file upload → Cloudinary → item created with photos (fixed files.length crash, fixed URL-only UI)
- CSV Import: bulk item creation from CSV with template download (verified end-to-end)
- Stripe Connect Express onboarding: Setup Payments button → Stripe redirect → return to dashboard (verified)
- Sale ownership enforcement: organizer dashboard now calls GET /sales/mine (own sales only); sale detail page action buttons gated to sale owner not just any organizer
- GET /sales/mine endpoint added (authenticated, filters by organizer.userId)

### Phase 3 – Organizer Profile & Account (verified 2026-03-01)
- Public organizer profile page: /organizers/[id] shows business info + upcoming/past sales with photo cards
- GET /api/organizers/:id endpoint (public, returns organizer + all their sales)
- Organizer name on homepage sale cards and sale detail "Organized by" badge are now clickable links to public profile
- organizer.id exposed in listSales and getSale API responses
- Organizer settings page: /organizer/settings — edit businessName/phone/address (pre-populated), change password with current-password verification
- POST /api/auth/change-password endpoint (authenticated, bcrypt verification)
- Settings gear button added to organizer dashboard header
- getUserProfile (/api/users/me) now includes organizer relation for pre-population
- All other dashboards audited — no additional scoping bugs found

### Phase 5 – UX Audit & End-User Experience Fixes (verified 2026-03-01)
- Fixed JWT payload: added name, points, referralCode to token so AuthContext decodes them correctly (user.name was always undefined before)
- Fixed SSR crash: shopper/dashboard window.location.origin moved to useEffect/state (was crashing server-side render)
- Fixed contact form: wired to real POST /api/contact endpoint (was console.log only); sends email via Resend + confirmation to submitter; removed placeholder "San Francisco" address and phone
- Fixed alert() → useToast for clipboard copy in shopper dashboard
- Added full forgot-password / reset-password flow: pages/forgot-password.tsx, pages/reset-password.tsx, POST /api/auth/forgot-password, POST /api/auth/reset-password; tokens stored in DB with 1-hour expiry; requires DB migration 20260301000002_add_password_reset_tokens
- Schema: added resetToken + resetTokenExpiry columns to User model
- Added confirm password field to register page with min-length (8) validation
- Added redirect-after-login: login page now honours ?redirect= query param before role-based default
- Added referral code auto-fill: register page reads ?ref= URL param and pre-populates referralCode (was never wired to frontend)
- Added mobile hamburger nav to Layout.tsx — hidden on md+, closes on route change, full accessible aria-expanded/aria-controls
- Added skip-to-content link in Layout.tsx (visible on keyboard focus) — keyboard/screen reader accessibility
- Added aria-live="polite" to ToastContext container — screen readers now announce toasts
- Updated footer copy: "San Francisco" → "Grand Rapids, MI"

### Phase 4 – PWA Production Hardening (verified 2026-03-01)
- Generated all PWA icon assets: 72/96/128/144/152/192/384/512px + maskable 192/512px + apple-touch-icon 180px + favicons 16/32px — icons/ folder previously missing entirely
- Fixed manifest.json: added description, categories, lang, maskable icons, PWA shortcuts, `?source=pwa` start_url
- Created pages/_document.tsx: theme-color, apple-mobile-web-app-capable, apple-touch-icon, OG tags, Twitter card, favicon links, preconnect hints for Cloudinary + OSM
- Created pages/offline.tsx: branded offline fallback page wired into next-pwa fallbacks config
- Created pages/404.tsx and pages/500.tsx: branded error pages
- Fixed next.config.js: added register+skipWaiting, 7 runtime cache rules (CacheFirst/StaleWhileRevalidate/NetworkFirst per asset type), security headers (X-Frame-Options, X-Content-Type-Options, HSTS, Referrer-Policy, Permissions-Policy, CSP), Cloudinary image domain, long-lived cache headers for static assets
- Fixed _app.tsx: QueryClient moved into useState (was re-instantiated on every render); added ServiceWorkerUpdateNotifier (controllerchange → toast)
- Created components/InstallPrompt.tsx: captures beforeinstallprompt, shows install banner (Android) or Share-to-homescreen tooltip (iOS), dismissal stored 30 days in localStorage
- Backend hardened: added helmet (security headers), CORS restricted to ALLOWED_ORIGINS env var, global rate limit (200 req/15 min), auth rate limit (10 req/15 min), body size cap (1 MB); helmet + express-rate-limit added to backend package.json

---

## Pending Manual Action

- **Backend hosting: ngrok bridge temporary** — Frontend live on Vercel (finda.sale). Backend running in Docker on Windows, exposed via ngrok static domain `pamelia-unweathered-arabesquely.ngrok-free.dev`. Plan: migrate to Railway/Render/Fly.io before real user traffic. Deferred pending Sprint A completion.
- **Resend domain verification** — ✅ Verified (confirmed 2026-03-04).
- **ROADMAP.md audit** — ✅ Complete (session 38, 2026-03-04). Phases 9/11/12 marked complete, sprint order updated. Next sprint: Phase 12 completion (organizer auction toggle + Stripe 7% webhook).

---

### Sprint 6 – Analytics, Discovery UX & Trust Layer (completed 2026-03-01)
- GET /api/organizers/me/analytics — revenue, fees, sold/unsold counts, per-sale breakdown; lazy-loaded on Analytics tab
- PATCH /api/sales/:id/status — owner-gated, enforces DRAFT→PUBLISHED→ENDED transition; status action buttons on dashboard
- Homepage: keyword search bar + date filter (All/Upcoming/This Weekend/This Month), client-side via useMemo; map updates with filtered pins
- Skeleton component (components/Skeleton.tsx, animated pulse) — replaces all "Loading…" text on homepage, sale detail, organizer dashboard, shopper dashboard
- CheckoutModal: refund policy note above Pay button; /terms: new section 8 "Refund Policy"
- /pages/faq.tsx: accordion FAQ (6 Qs: buying, organizer payouts, fees, auctions, refunds, support); linked from footer and contact page

### Phase 6 – Security & Performance Hardening (verified 2026-03-01)
- Fixed critical Stripe security issue: removed hardcoded placeholder key; now throws error if STRIPE_SECRET_KEY env var missing
- Added pagination to 12+ unpaginated Prisma queries across 6 controllers (affiliateController, itemController, saleController, userController, notificationController, lineController); default `take` limits prevent DoS (50 for subscriptions, 100+ for items/listings, 500+ for queues, 5000 for bulk operations)
- Verified upload routes (/upload/sale-photos, /upload/item-photo) already properly protected with `router.use(authenticate)` middleware
- Replaced 14 browser `alert()` calls with `showToast()` notifications for better UX (payment setup, QR generation, line status, referral copy, sale share, item creation, Nextdoor post); toasts auto-dismiss after 3–4 seconds
- Removed 3 debug console.log statements from production files (og.tsx, add-items page, edit-item page)
- Verified react-leaflet component already has dynamic SSR wrapping (`ssr: false`) — no SSR hydration crashes
- Started Prisma include→select refactoring: converted broad `include: { organizer: true }` to targeted `select: { userId: true }` in itemController (2 locations); 11+ locations remain for follow-up
- Added slideIn animation to toast notifications in globals.css

---

### Phase 8.5 – AI Image Tagger Validation (verified 2026-03-02)
- Removed Gradio UI from image-tagger service (was causing 500 errors due to version conflict); service is now FastAPI-only
- Unit tests: 18 tests for EstateSaleTagger (conftest.py with module-level torch/transformers mocks, test_tagger_simple.py)
- Integration tests: 19 tests for FastAPI endpoints (test_app_simple.py using minimal FastAPI stub)
- Error handling: itemController.ts hardened with retry logic (timeout), warn-and-skip (ECONNREFUSED), X-API-Key header added
- Graceful fallback: app.py catches model init failure and falls back to simulation mode — service stays up
- New backend endpoint: POST /items/:id/analyze — downloads first photo URL, runs tagger, returns suggestedTags
- Frontend: AI tag suggestion banner added to add-items.tsx (on creation) and edit-item/[id].tsx (on-demand via "✨ AI suggest" button)
- Frontend: TAGGER_CATEGORY_MAP maps tagger prefixes → form category values; bestCategoryFromTags() picks best match
- Documentation: TAGGER_DESIGN.md, TAGGER_BENCHMARKS.md, TAGGER_ACCURACY.md, TAGGER_TROUBLESHOOTING.md, DEVELOPMENT.md (new)
- Bug fixes: TypeScript errors fixed in add-items/[saleId].tsx and sales/[id].tsx; next.config.js PWA fallback removed (babel-loader crash)

### Phase 9 – Dev Tooling & AI Photo Workflow (verified 2026-03-02)
- **DB seed complete** — `packages/database/prisma/seed.ts` fully rewritten: 100 users (90 shoppers/10 organizers), 10 organizers (Grand Rapids businesses), 25 sales with varied statuses/dates, 300 items across 12 categories/5 conditions, 50 purchases, 60 subscribers, 80 sale favorites, 100 item favorites, 30 reviews, 40 user badges, 15 referrals, 20 line entries, 10 affiliate links. Idempotent (clears all tables before re-seeding).
- **Docker seed decoupled** — Seed no longer runs automatically on `docker compose up`. Seed is preserved at `packages/database/prisma/seed.ts` and can be run manually: `docker exec findasale-backend-1 sh -c "cd /app && npx tsx packages/database/prisma/seed.ts"`. Docker command now runs only `prisma db push && prisma generate && nodemon`.
- **Cross-platform Prisma** — `binaryTargets = ["native", "windows", "debian-openssl-3.0.x"]` added to schema.prisma for Windows + Docker Linux compatibility.
- **Homepage status filter** — `saleController.ts` `listSales` now defaults `status: 'PUBLISHED'`; DRAFT/ENDED sales no longer appear on homepage.
- **dev-environment skill** — Created at `.skills/skills/dev-environment/SKILL.md`; captures Windows 10/Docker/PowerShell env, Ollama models, AIDER, rebuild vs restart rules.
- **AI Photo Workflow implemented** — `POST /api/upload/analyze-photo` (authenticated, multer single image) calls Ollama `qwen3-vl:4b` via `host.docker.internal:11434`, returns `{ title, description, category, condition, suggestedPrice }`. `OLLAMA_URL` + `OLLAMA_VISION_MODEL` env vars added to docker-compose.yml; `extra_hosts: host.docker.internal:host-gateway` added so Docker can reach Windows host Ollama. `add-items.tsx` rewritten with AI Photo Scan zone at top of form — organizer picks photo, form pre-fills while spinner shows, organizer reviews and submits. Graceful error handling for Ollama down (503), timeout (504), unparseable JSON (422).

### Phase 13 – Schema.org SEO & Local Ranking (verified 2026-03-02)
- Sale detail page: added `url`, `image`, dynamic `eventStatus`, `AggregateOffer` wrapper, BreadcrumbList JSON-LD; fixed duplicate `og:image` (now uses sale photo if available)
- City page: upgraded JSON-LD from bare `Place` to `ItemList` of Events with full Event entries + BreadcrumbList
- Zip page: added `ItemList` JSON-LD, richer meta description using city/state, updated H1
- `next-sitemap.config.js`: added robots.txt disallow rules for auth routes (`/organizer/`, `/shopper/`, `/creator/`, etc.) + exclude list for static sitemap
- `server-sitemap.xml.tsx`: added zip landing pages + `/faq` to dynamically generated sitemap

### Phase 9 – Creator Dashboard (verified 2026-03-02)
- Full rewrite of `/creator/dashboard.tsx`: referral link hero card with copy-to-clipboard (all users), stats row (CREATOR-only), inline sale search + generate affiliate link form with dropdown picker, affiliate links table with per-row copy button, non-CREATOR "become a creator" panel, how-it-works steps section
- Removed broken `/creator/generate-link` link (flow now inlined)

### RAM++ Tagger Swap (verified 2026-03-02)
- Code review of `tagger.py` confirmed WD-ViT was actually `google/vit-base-patch16-224` (ImageNet-1000, wrong domain — not estate sale fine-tuned). Formal accuracy audit skipped.
- Added `ram-plus-api` model type to `tagger.py`: `_generate_tags_ram_api()` calls HuggingFace Inference API, `_map_hf_tags_to_estate_format()` maps RAM++ labels → `category:label` format
- `app.py` auto-selects RAM++ when `HF_TOKEN` env var is present
- `requirements.txt`: added `requests>=2.31.0`
- `docker-compose.yml`: added `HF_TOKEN: ${HF_TOKEN:-}` to image-tagger service
- `.env.example`: documented `HF_TOKEN` with HuggingFace token instructions
- `TAGGER_ACCURACY.md`: updated with decision gate result and activation steps
- **Action required:** Add `HF_TOKEN=hf_...` to `.env`, then `docker compose build --no-cache image-tagger && docker compose up -d`

### Phase 9.5 – Backend Stability & Dev Environment (verified 2026-03-02)
- **Fixed persistent backend crash loop** — `docker-compose.yml` was calling `npx nodemon` from workspace root `/app` where pnpm doesn't hoist binaries, so npx couldn't find nodemon. Root cause: monorepo structure + Docker pnpm layout mismatch.
- **Solution deployed** — Changed Docker compose service command from `npx nodemon packages/backend/src/index.ts` to `pnpm --filter backend run dev` which respects pnpm workspace scope and finds nodemon in `/app/node_modules/.bin` after install.
- **Dependency fix** — Moved `nodemon` and `tsx` from devDependencies to dependencies in `packages/backend/package.json` so they are present in production Docker image (required for live reload in containerized dev environment).
- **Updated dev-environment skill** — Added diagnosis section with correct root cause analysis and `--no-cache` rebuild guidance for Docker compose troubleshooting.
- **Backend is now stable** — `docker compose up` succeeds; backend starts, watches for changes, reloads on file modification.

---

### Beta-Blocker Burn-Down (2026-03-02)
- **#1 alt text — closed.** Audited all 27 image tags. Fixed 3 non-descriptive `preview-${i}` alts in organizer photo upload flows (`create-sale.tsx`, `add-items.tsx`, `add-items/[saleId].tsx`).
- **#2 email digest E2E — closed.** `packages/backend/src/__tests__/weeklyDigest.e2e.ts` — 12 tests. Manual trigger (`_triggerDigest.ts`) ran against Docker backend after circular-dep fix; digest executed. Resend dashboard verification deferred as non-blocking — test coverage sufficient for launch.
- **#3 Stripe E2E — closed (verified 2026-03-02).** `packages/backend/src/__tests__/stripe.e2e.ts` — 17 tests covering Connect onboarding, regular 5% fee, auction 7% fee, webhook succeeded/failed, invalid signature, unhandled events. Manual payment verified: $265.75 charged, $13.29 fee (5% ✓), transfer to connected account confirmed in Stripe dashboard.
- **#4 production domain — closed (2026-03-03).** Domain: finda.sale. ngrok bridge: pamelia-unweathered-arabesquely.ngrok-free.dev. All 4 beta-blockers closed.

---

## In Progress

None — session 39 work complete. Next: Sprint A (Phase 12 auction) + Sprint B (Phase 24+25 design system).

### Session 37 — Activation Sprint: Migrations + VAPID + Upload Fix + SW Fix (verified 2026-03-04)
- Applied Phase 9 + 11 DB migrations in Docker (000001 affiliate conversions, 000002 push subscriptions). Migration 000002 required `prisma migrate resolve --applied` — table already existed from prior `db push`.
- Generated VAPID keys; added to root `.env`, `packages/frontend/.env.local`, Vercel env vars, and `docker-compose.yml` (both backend + frontend services).
- Fixed `uploadController.ts` — stale version missing `upload` multer export + wrong handler names (`uploadSalePhotos`, `uploadItemPhoto`, `analyzePhotoWithAI`). Routes were importing names that didn't exist; backend crash-looped on startup.
- Fixed `docker-compose.yml` — added `./packages/frontend/hooks:/app/packages/frontend/hooks` bind mount (was missing; frontend couldn't resolve `usePushSubscription`).
- Rebuilt backend with `--no-cache` to install `web-push` into container.
- Confirmed push notifications working on Vercel production: SW registered (count=1), VAPID key present, permission prompt appeared for first user. One-prompt-per-browser is correct design.
- Fixed `next.config.js` SW rule — Stripe `clover/stripe.js` was blocked by workbox NetworkOnly (CORS failure in SW fetch context → `no-response`). Removed explicit Stripe NetworkOnly rule; excluded all `*.stripe.com` from pages catch-all so SW never intercepts Stripe at all.
- Fixed Vercel build TypeScript error — `Uint8Array<ArrayBufferLike>` → `Uint8Array<ArrayBuffer>` in `usePushSubscription.ts`.

### Phase 9 – Affiliate Conversion Tracking (verified 2026-03-04)
- Fixed `affiliateController.ts`: prisma import (`../lib/prisma`), JSON response replacing redirect, `conversions` added to `getCreatorStats`
- Schema: `conversions Int @default(0)` on AffiliateLink, `affiliateLinkId String?` on Purchase, FK constraint
- Migration: `20260304000001_add_affiliate_conversions` (idempotent with IF NOT EXISTS guards)
- `stripeController.ts`: reads `affiliateLinkId` from body, stores on Purchase, increments conversions in webhook
- `pages/affiliate/[id].tsx`: click tracking → sessionStorage → redirect to sale
- `pages/creator/dashboard.tsx`: Conversions + Conv. Rate stat cards added
- `components/CheckoutModal.tsx`: reads `affiliateRef` from sessionStorage, passes to createPaymentIntent
- **Pending:** `prisma migrate deploy` to apply 20260304000001 in Docker

### Phase 12 – Auction Launch (verified 2026-03-04)
- `auctionJob.ts`: added `cron.schedule('*/5 * * * *', endAuctions)` — was never scheduled before
- `components/AuctionCountdown.tsx`: live per-second countdown, red under 1hr, triggers query invalidation on expiry
- `components/BidModal.tsx`: bid modal with validation, login prompt if unauthenticated
- `pages/sales/[id].tsx`: 🔨 Auction badge on items, replaced static time display with live AuctionCountdown

### Phase 11 – PWA Push Notifications (verified 2026-03-04)
- Schema: `PushSubscription` model added (userId, endpoint, p256dh, auth, @@unique([userId, endpoint]))
- Migration: `20260304000002_add_push_subscriptions`
- `pushController.ts` + `routes/push.ts`: subscribe/unsubscribe endpoints (authenticated)
- `utils/webpush.ts`: lazy-loaded web-push utility, no-op if VAPID keys missing
- `index.ts`: `/api/push` route registered
- `emailReminderService.ts`: push notifications sent alongside SMS reminders
- `hooks/usePushSubscription.ts`: auto-subscribes logged-in users
- `public/sw-push.js`: push event + notificationclick service worker handlers
- `pages/_app.tsx`: PushSubscriber component wired inside provider tree
- `packages/backend/package.json`: web-push + @types/web-push added (pnpm-lock.yaml pushed)
- **Pending:** `prisma migrate deploy`, VAPID key generation, backend Docker rebuild

### Session 35 — Bug Burn-Down + Component Drift Fixes (verified 2026-03-04)

**Component drift fixes (SaleCard, Layout, index.tsx, city/[city].tsx):**
- Shared `Sale` type updated to match real API shape (startDate/endDate/organizer.{id,businessName}/photoUrls/etc.)
- `SaleCard.tsx`: added `organizer.id`, fixed nested anchor invalid HTML (outer `<div>` + sibling organizer link), `line-clamp-2`, em-dash date separator
- `pages/index.tsx`: replaced 30-line inline card JSX with `<SaleCard>`, removed unused `formatSaleDate`/`format`/`Link`
- `Layout.tsx`: replaced mobile-only `navLinks` JSX variable with `staticNavLinks` data array shared by desktop + mobile nav
- `city/[city].tsx`: replaced inline sale card JSX with `<SaleCard>`, removed local `Sale` interface + `formatSaleDate` + `format` import; imports shared `Sale` type

**Bug fixes pushed (3 commits):**
- `72379f9` — `routes/auth.ts`: password reset token removed from console log (HIGH severity); changed to `console.warn` without token
- `517f843` — `pages/shopper/purchases.tsx`: 3DS redirect handling via `useEffect` on `router.query` (Stripe `redirect_status`/`payment_intent` params); `_app.tsx` staleTime 60s→20s
- `b7d207b` — `city/[city].tsx`: inline card drift fix

**Verified already complete (confirmed by Patrick):**
- Vercel project rename ✅ | Stripe business name ✅ | M-series ST1/ST2/E1/E2 (all closed as H8/H9/C5/C6)

### Session 34 — Frontend Drift Audit Complete (verified 2026-03-04)

**Root cause:** GitHub had 11 stale frontend pages — early-draft versions with direct Prisma imports / qrcode npm package / stub implementations. Local versions (correct API-based) had never been pushed. Detected via size comparison: `find ... wc -c` locally vs GitHub directory listing sizes.

**Files pushed (all stale → local correct versions):**
- `next.config.js` — SW/ngrok NetworkOnly rule, unpkg CacheFirst, Stripe CSP (m.stripe.network) — commits 5d06cd4e, fc41bfdb
- `claude_docs/CORE.md` — MCP vs PowerShell push decision rule — commit 1ac3a942
- `pages/city/[city].tsx` — removed broken Prisma import — commit 82c66d11
- `pages/items/[id].tsx` — removed stale Prisma import — commit 5c501605
- `pages/unsubscribe.tsx` — new page (was missing from GitHub) — commit 70e1c7d9
- `pages/organizers/[id].tsx` — removed stale Prisma/getServerSideProps — commit d5bc73f
- `pages/organizer/add-items/[saleId].tsx` — stub → full 469-line implementation — commit 6cc7659
- `pages/index.tsx` — removed stale Prisma/getServerSideProps (was causing Vercel build failure) — commit 4296a9ca
- `pages/organizer/dashboard.tsx` — stub with `import QRCode from 'qrcode'` → 762-line full dashboard (was causing Vercel build failure) — commit 41392f2
- `pages/organizer/add-items.tsx`, `pages/organizer/create-sale.tsx`, `pages/shopper/dashboard.tsx`, `pages/shopper/purchases.tsx`, `pages/profile.tsx` — all stale stubs → full implementations — commit 406635d

**Vercel build errors fixed:** `Cannot find module 'qrcode'`, `has no exported member named 'prisma'`. Build should now be clean.

**Zero Prisma imports remain in local frontend pages** — confirmed by grep before audit.

---

### Session 33 — E-Series, PF1, S1 Audit Fixes + Vercel Build Fix (verified 2026-03-04)

**Audit findings closed (from audit-remaining-areas-2026-03-03.md):**
- **E4 (AuthRequest deduplication):** Removed locally-defined `interface AuthRequest` from 11 files; all now import from `middleware/auth.ts` single source of truth. `Request` preserved in express imports for files with public endpoints.
- **E5 (Frontend validation errors):** `frontend/lib/api.ts` response interceptor now detects `400 + errors[]` (Zod shape) and attaches `error.validationMessage` with per-field dot-path messages joined by ` • `.
- **E6 (Offline page error boundary):** `pages/offline.tsx` wrapped in React class `OfflineErrorBoundary`; page content extracted to `OfflineContent` function component.
- **PF1 (Duplicate count query):** `listSales` now uses `Promise.all([findMany, count])` for parallel DB queries instead of serial round-trips.
- **S1 (JSON-LD category/condition):** `pages/sales/[id].tsx` adds `category` and `itemCondition` (schema.org OfferItemCondition URL) to each item offer in JSON-LD. `conditionMap` handles NEW/LIKE_NEW/GOOD/FAIR/POOR.

**Latent bug caught and fixed:**
- `notificationController.ts` used `req: Request` in `unsubscribeByEmail` but only imported `Response` from express. Fixed by adding `Request` to import before push.

**routes/users.ts cleanup:** Removed stray `new PrismaClient()` instance; now uses `import { prisma } from '../lib/prisma'` shared singleton.

**All remaining M-series audit findings closed. Vercel build unblocked.**

### Pre-Beta Audit — All Fixes Complete (verified 2026-03-04)

**C1-C7 (verified 2026-03-03):**
- C1: Role whitelist in authController.ts — `safeRole` prevents ADMIN self-assignment
- C2: referralCode decoded from JWT in AuthContext.tsx — both useEffect and login() calls updated
- C3: getSale includes category + condition on items select
- C4: AffiliateLink schema — added userId, composite @@unique([userId, saleId]), Sale→affiliateLinks one-to-many
- C5: Stripe idempotency key — `pi-${itemId}-${req.user.id}` passed to paymentIntents.create
- C6: Verified clean — price always from DB, only itemId from req.body
- C7: Verified already implemented — createRefund checks organizer ownership
- Schema drift also fixed: SaleSubscriber (@@id→@id, userId nullable), Favorite (removed updatedAt not in DB)
- DB reset via migrate reset --force, seed fixed, Prisma client regenerated. Smoke tests via Claude in Chrome: all pass.
- RECOVERY.md entries 12–16 added.

**H1-H11 (verified 2026-03-04):**
- H1: getSale — expanded organizer select to include badges/rating; separate review query for avgRating
- H2: uploadController — switched Promise.all → Promise.allSettled; partial batch success with `partialErrors`
- H3: authController — email.trim().toLowerCase() + name.trim() on register + login
- H4: Weekend filter — fixed Saturday/Sunday edge case in homepage date filter
- H5: Organizer dashboard — mobile card views for all 3 tables (sales, analytics, line entries)
- H6: lazy loading — `loading="lazy"` added to all 16 frontend files with img tags
- H7: CSV import — Zod schema per-row validation with rowErrors collection; rejects empty parse batch
- H8: Global Express error handler — added after all routes in index.ts
- H9: Stripe webhook — STRIPE_WEBHOOK_SECRET guard before constructEvent
- H10: CAN-SPAM unsubscribe — one-click unsubscribe link in reminder emails, public backend endpoint, new /unsubscribe frontend page
- H11: Resend domain verification — confirmed verified in Resend dashboard (no code change needed)
- All 27 changed files pushed to GitHub via MCP (deseee/findasale, main)

---

## Deferred

### Standard Deferred
- Socket.io live bidding — polling sufficient for MVP (session 36 decision)
- Virtual line SMS — scaffolded, Twilio E2E untested
- Multi-metro expansion (currently Grand Rapids only)
- Real-user beta onboarding
- Video-to-inventory (room walkthrough) — vision models not ready, revisit late 2026

### Infrastructure & Dev Tools (Pre-Beta)
- ~~Test data seeding script~~ — **Complete (verified 2026-03-02).** See Phase 9 section.
- Prisma Studio documentation — Already available (`npx prisma studio`); add to DEVELOPMENT.md setup guide. (30 min)
- ngrok setup guide — For local webhook testing (Stripe, Twilio); add to DEVELOPMENT.md. (1 hour)
- OAuth social login (Google, Facebook, Apple) — Promoted to Phase 31 (P1). NextAuth.js v5.

---

## Constraints

- Token efficiency required
- Modular documentation
- No context drift
- Diff-only updates
- Grand Rapids launch first

---

## Next Strategic Move

Five-pillar growth phase. Immediate priorities:
1. **Sprint A:** Phase 12 completion — organizer auction toggle + Stripe 7% webhook (revenue unlock)
2. **Sprint B:** Phase 24+25 — Design system foundation + bottom tab navigation (visual overhaul, parallel to Sprint A)
3. **Sprint C:** Phase 14 — Rapid capture carousel + background AI processing (organizer workflow)
4. **Sprint D:** Phase 17 — Organizer reputation + follow system (trust foundation)

Full roadmap: `claude_docs/ROADMAP.md` (rewritten 2026-03-04 v2)

---

## Growth & Feature Roadmap

See ROADMAP.md for full phase breakdown organized around five pillars:
1. Organizer Photo/Video Workflow (Phases 14–16)
2. UI/UX Design Overhaul (Phases 24–27)
3. Social & Discovery Layer (Phases 17, 28–30)
4. Shopper Engagement Engine (Phases 18–21)
5. Creator-Led Growth + Distribution (Phases 22–23, 31–32)

**Completed feature phases:**
- Phase 9: Creator dashboard + affiliate conversion tracking ✅
- Phase 11: PWA push notifications ✅
- Phase 12 (partial): Auction UI + cron ✅

### Phase 7 – Local SEO & Parity (verified 2026-03-02)
- Item categories: added `category` + `condition` fields to Item schema; migration 20260301000003_add_item_category created
- Item category UI: dropdowns added to /organizer/add-items.tsx and /organizer/edit-item/[id].tsx with 12 categories + 5 condition levels
- Item display: category + condition badges rendered as colored pills on item cards in sale detail page
- Category filtering: clickable filter buttons on sale detail page with counts; items grid filters client-side by selected category
- Organizer badges: created Badge + UserBadge schema integration; badges displayed on organizer profile and sale detail page
- Badge awarding: POST /organizers/admin/award-badges endpoint evaluates 3 badges (first-time, verified at 5+ sales, top-rated at 4.5+ avg with 3+ reviews)
- Badge display component: BadgeDisplay.tsx with emoji icons + responsive sizing (sm/md/lg)
- Rating display: avg rating + review count shown on organizer profile and sale detail page alongside badges
- Zip-level landing pages: created /sales/zip/[zip].tsx page with sorting (upcoming first / all) + active/upcoming/past sections
- Zip code filtering: added `zip` query parameter to listSales endpoint in backend (GET /sales?zip=12345)
- Email reminders: created emailReminderService.ts with 1-day and 2-hour reminder emails via Resend
- Email reminder job: emailReminderJob.ts runs hourly via node-cron; checks for sales starting in next 26 hours (1-day) and next 2.5 hours (2-hour reminders)
- Reminder logic: fetches subscribers from SaleSubscriber table, formats sale details, sends HTML emails with call-to-action buttons
- Job registration: imported emailReminderJob.ts in backend index.ts to auto-start on server launch

### Phase 8 – Email & SMS Validation (verified 2026-03-02)
- SMS reminder integration: extended emailReminderService.ts to send SMS via Twilio alongside email reminders
- SMS templating: added getSMSTemplate() with 1-day and 2-hour variants; compact format includes sale name, time, address
- Twilio client initialization: lazy-loaded getTwilioClient() with graceful fallback if credentials missing; shared with notificationController
- SMS delivery: sendReminderSMS() function sends SMS to subscribers with phone numbers via Twilio API
- Reminder orchestration: processReminderEmails() now sends both email + SMS for each subscriber (SMS only if phone provided)
- Rate limiting: 200ms delay implemented between SMS sends to respect Twilio rate limits
- E2E test suite: created src/__tests__/emailReminders.e2e.ts with comprehensive test coverage (14 tests across 5 suites)
- Test coverage: email delivery, SMS delivery, combined processing, rate limiting, error handling, metrics tracking
- Documentation: created docs/EMAIL_SMS_REMINDERS.md with configuration, architecture, testing, monitoring, and troubleshooting guides
- Database: SaleSubscriber model already has `phone` field (optional) — presence indicates SMS opt-in; subscription API handles both channels
- Logging: comprehensive logging for successful sends, failures, and skips (missing email/phone); integrates with backend monitoring

**P0 Item Validated:** Email digest (sendWeeklyDigest in notificationController) wired and working; confirmed Resend integration active.

---

### Session 18 – GitHub MCP Workflow Setup (verified 2026-03-02)
- Defined GitHub MCP integration strategy: issues for roadmap tracking, feature branches + PR-to-main as deploy gate, beta-blocker label as launch checklist
- Resolved fine-grained PAT permissions issue; documented Claude desktop config path: `C:\Users\desee\AppData\Local\Packages\Claude_pzs8sxrjxfjjc\LocalCache\Roaming\Claude\claude_desktop_config.json`
- Created 4 beta-blocker issues (#1 alt text, #2 email digest E2E, #3 Stripe E2E, #4 production domain)
- Created 4 Phase 10 issues (#5 QR sign generator, #6 scan analytics, #7 virtual line E2E, #8 SMS line updates)
- Created branch `phase-10/qr-sign-generator` off main — ready to work

---

### Phase 10 – QR Sign, Analytics, Virtual Line, iCal (in progress 2026-03-02)

**Issue #5 — QR Marketing Kit PDF (complete)**
- New dependency: `pdfkit@^0.15.0` added to `packages/backend/package.json` (requires Docker rebuild)
- Created `packages/backend/src/controllers/marketingKitController.ts`: `POST /api/sales/:id/generate-marketing-kit` (auth: organizer owner)
  - Generates QR code PNG buffer (UTM URL: `?utm_source=qr_sign&utm_medium=print&utm_campaign=[saleId]`)
  - Returns PDF (LETTER size) with blue header, sale title, location, dates, QR image, organizer name
  - pdfkit lazy-loaded via `require('pdfkit')` inside handler to prevent startup crash before Docker rebuild
- Frontend: "Download Marketing Kit" button (orange) added to organizer action row on sale detail page
  - Blob download via `api.post(..., { responseType: 'blob' })` with progress state

**Issue #7 + #8 — Virtual Line Bug Fixes + Shopper Endpoints (complete)**
- Fixed: `req.user?.organizerProfile?.id` was always undefined (auth middleware never attached it)
  - All organizer checks now use `getOrganizerForSale()` helper that queries Prisma directly
- Fixed: incorrect status values `CALLED`/`SERVED` → `NOTIFIED`/`ENTERED` (schema-correct)
- Added `sendSMS()` helper wrapping Twilio (no-op if unconfigured)
- New organizer endpoint: `POST /lines/:saleId/broadcast` — SMS position update to all WAITING people
- New shopper endpoints: `POST /lines/:saleId/join`, `GET /lines/:saleId/my-position`, `DELETE /lines/:saleId/leave`
- Routes file updated with all new endpoints

**Issue #6 — QR Scan Analytics (complete)**
- Schema: added `qrScanCount Int @default(0)` to Sale model
- Migration: `packages/database/prisma/migrations/20260302000001_add_qr_scan_count/migration.sql`
- New public endpoint: `POST /api/sales/:id/track-scan` — increments counter, returns 204
- Frontend: fires track-scan when `utm_source=qr_sign` in URL (useEffect, non-fatal)
- Analytics endpoint (`GET /organizers/me/analytics`): now includes `qrScanCount` per sale
- Dashboard analytics table: added "QR Scans" column + total row

**Phase 11 prep — iCal / Add to Calendar (complete)**
- `generateIcal` added to `saleController.ts`: public `GET /api/sales/:id/calendar.ics`, returns RFC 5545 `.ics` text/calendar
- Route registered in `routes/sales.ts` (public, no auth)
- Frontend: "Add to Calendar" button (teal) added to sale detail page header — direct `<a href>` to backend `.ics` endpoint, visible to all users

**Organizer Line Queue Management Page (complete)**
- Created `packages/frontend/pages/organizer/line-queue/[id].tsx`
  - Real-time status board (auto-polls every 5 s)
  - Stats row: Waiting / Notified / Entered / Cancelled counts
  - Actions: Start/Reset Line, Call Next, Broadcast Positions
  - Queue table: position, name, phone, status badge, Mark Entered button (NOTIFIED rows only)
  - Cancelled entries shown in collapsed `<details>` section
- "Manage Queue" button (yellow) added to organizer action row on sale detail page

**Docker rebuild + migration: complete (2026-03-02)**
- pdfkit installed in container ✓
- qrScanCount migration applied ✓

---

### SaleScout → FindA.Sale Rebrand + DNS + Deployment (2026-03-03)
- Full codebase rebrand complete: all frontend pages, backend, docker-compose, package.json, docs.
- about.tsx fully rewritten with fresh narrative. terms.tsx rewritten with marketplace-style language (Etsy/eBay patterns).
- finda.sale DNS: Vercel nameservers confirmed active in Spaceship. DNS resolving correctly.
- Resend domain: verified (confirmed 2026-03-04). Vercel project rename: ✅. Stripe business name: ✅.
- Docker: volume wiped, rebuilt with findasale credentials. Containers named `findasale-*`. Database re-seeded.
- finda.sale live on Vercel and loading FindA.Sale branding.

### Seed Bug Fixes (2026-03-03)
- ✅ Fixed: organizer users 0–9 now seeded with `role: 'ORGANIZER'` (was always `'USER'`).
- ✅ Fixed: `stripeConnectId` now always `null` in seed — organizers go through real Stripe Connect onboarding.

### Session 32 — M-Series Medium Audit Findings (2026-03-04)
- E3: Prisma singleton extracted to `lib/prisma.ts`; `new PrismaClient()` removed from 10 files
- ST3: Stripe webhook verifies `on_behalf_of` vs organizer's `stripeConnectId`
- ST4: Integer-cent fee math (`Math.round(price * 100)`)
- DB2: `prisma.$transaction()` wraps user + organizer creation
- E7: AuthContext checks JWT `exp` before API calls
- EM2/EM3: `withRetry()` helper with exponential backoff
- P1: iCal guard for missing `startDate`/`endDate`
- GitHub push batching rule added to CORE.md (Section 10): max 3 files per `push_files` call

Last Updated: 2026-03-04 (session 40 — deep workflow audit, doc fixes, dead code cleanup)
Status: All doc fixes applied. Stress test planned for session 41.
