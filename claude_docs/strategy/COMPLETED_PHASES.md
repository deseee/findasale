# Completed Phases — FindA.Sale

Historical record of all completed work. **Do not load at session start.**
Read only when investigating past decisions or debugging regressions.

For current state, see STATE.md. For git history, see `git log`.

---

## Phase 1 – Core MVP (verified 2026-03-01)
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

## Phase 2 – Organizer Flows (verified 2026-03-01)
- Add Items: file upload → Cloudinary → item created with photos (fixed files.length crash, fixed URL-only UI)
- CSV Import: bulk item creation from CSV with template download (verified end-to-end)
- Stripe Connect Express onboarding: Setup Payments button → Stripe redirect → return to dashboard (verified)
- Sale ownership enforcement: organizer dashboard now calls GET /sales/mine (own sales only); sale detail page action buttons gated to sale owner not just any organizer
- GET /sales/mine endpoint added (authenticated, filters by organizer.userId)

## Phase 3 – Organizer Profile & Account (verified 2026-03-01)
- Public organizer profile page: /organizers/[id] shows business info + upcoming/past sales with photo cards
- GET /api/organizers/:id endpoint (public, returns organizer + all their sales)
- Organizer name on homepage sale cards and sale detail "Organized by" badge are now clickable links to public profile
- organizer.id exposed in listSales and getSale API responses
- Organizer settings page: /organizer/settings — edit businessName/phone/address (pre-populated), change password with current-password verification
- POST /api/auth/change-password endpoint (authenticated, bcrypt verification)
- Settings gear button added to organizer dashboard header
- getUserProfile (/api/users/me) now includes organizer relation for pre-population
- All other dashboards audited — no additional scoping bugs found

## Phase 5 – UX Audit & End-User Experience Fixes (verified 2026-03-01)
- Fixed JWT payload: added name, points, referralCode to token so AuthContext decodes them correctly
- Fixed SSR crash: shopper/dashboard window.location.origin moved to useEffect/state
- Fixed contact form: wired to real POST /api/contact endpoint; sends email via Resend + confirmation to submitter
- Fixed alert() → useToast for clipboard copy in shopper dashboard
- Added full forgot-password / reset-password flow with 1-hour token expiry
- Added confirm password field to register page with min-length (8) validation
- Added redirect-after-login: login page honours ?redirect= query param
- Added referral code auto-fill: register page reads ?ref= URL param
- Added mobile hamburger nav to Layout.tsx
- Added skip-to-content link + aria-live="polite" to ToastContext container

## Phase 4 – PWA Production Hardening (verified 2026-03-01)
- Generated all PWA icon assets (72–512px + maskable + apple-touch-icon + favicons)
- Fixed manifest.json: description, categories, lang, maskable icons, PWA shortcuts
- Created _document.tsx: theme-color, apple-mobile-web-app-capable, OG tags, Twitter card, preconnect hints
- Created offline.tsx, 404.tsx, 500.tsx
- Fixed next.config.js: register+skipWaiting, 7 runtime cache rules, security headers, Cloudinary image domain
- Fixed _app.tsx: QueryClient moved into useState; ServiceWorkerUpdateNotifier
- Created InstallPrompt.tsx: captures beforeinstallprompt, shows install banner
- Backend hardened: helmet, CORS restricted, global rate limit (200/15min), auth rate limit (10/15min), body size cap (1MB)

## Sprint 6 – Analytics, Discovery UX & Trust Layer (completed 2026-03-01)
- GET /api/organizers/me/analytics — revenue, fees, sold/unsold counts, per-sale breakdown
- PATCH /api/sales/:id/status — owner-gated, enforces DRAFT→PUBLISHED→ENDED transition
- Homepage: keyword search bar + date filter, client-side via useMemo; map updates with filtered pins
- Skeleton component replaces all "Loading…" text
- CheckoutModal: refund policy note; /terms: section 8 "Refund Policy"
- /pages/faq.tsx: accordion FAQ linked from footer and contact page

## Phase 6 – Security & Performance Hardening (verified 2026-03-01)
- Fixed critical Stripe security issue: removed hardcoded placeholder key
- Added pagination to 12+ unpaginated Prisma queries (default take limits)
- Verified upload routes already protected with authenticate middleware
- Replaced 14 browser alert() calls with showToast() notifications
- Removed 3 debug console.log statements from production files
- Started Prisma include→select refactoring (2 locations converted, 11+ remain)
- Added slideIn animation to toast notifications

## Phase 7 – Local SEO & Parity (verified 2026-03-02)
- Item categories + conditions: schema fields, migration, dropdowns, colored pills, filter buttons
- Organizer badges: Badge + UserBadge schema, BadgeDisplay.tsx, award endpoint
- Rating display: avg rating + review count on organizer profile and sale detail
- Zip-level landing pages: /sales/zip/[zip].tsx with sorting
- Email reminders: emailReminderService.ts with 1-day and 2-hour via Resend + node-cron

## Phase 8 – Email & SMS Validation (verified 2026-03-02)
- SMS reminder integration via Twilio alongside email reminders
- E2E test suite: 14 tests across 5 suites
- SaleSubscriber phone field = SMS opt-in

## Phase 8.5 – AI Image Tagger Validation (verified 2026-03-02)
- Removed Gradio UI (version conflict). Service is FastAPI-only.
- Unit tests: 18 tests. Integration tests: 19 tests.
- Graceful fallback: simulation mode if model init fails
- Frontend AI tag suggestion banner on add-items and edit-item pages

## Phase 9 – Dev Tooling & AI Photo Workflow (verified 2026-03-02)
- DB seed: 100 users, 10 organizers, 25 sales, 300 items, etc. Idempotent.
- Docker seed decoupled from docker compose up
- Cross-platform Prisma binaryTargets
- Homepage status filter: PUBLISHED only
- dev-environment skill created
- AI Photo Workflow: POST /api/upload/analyze-photo via Ollama qwen3-vl:4b

## Phase 13 – Schema.org SEO & Local Ranking (verified 2026-03-02)
- Sale detail: Event JSON-LD with AggregateOffer + BreadcrumbList
- City page: ItemList JSON-LD. Zip page: ItemList JSON-LD.
- next-sitemap: robots.txt disallow for auth routes, zip pages in sitemap

## Phase 9 – Creator Dashboard (verified 2026-03-02)
- Full rewrite of /creator/dashboard.tsx: referral link, stats, affiliate links table, inline sale search

## RAM++ Tagger Swap (verified 2026-03-02)
- WD-ViT was actually google/vit-base-patch16-224 (wrong domain). Swapped to RAM++ via HF API.
- Action required: Add HF_TOKEN to .env

## Phase 9.5 – Backend Stability (verified 2026-03-02)
- Fixed Docker crash loop: npx nodemon → pnpm --filter backend run dev
- Moved nodemon + tsx to dependencies

## Phase 10 – QR Sign, Analytics, Virtual Line, iCal (verified 2026-03-02)
- QR Marketing Kit PDF via pdfkit
- Virtual line bug fixes + shopper endpoints
- QR scan analytics: qrScanCount on Sale model
- iCal: GET /api/sales/:id/calendar.ics
- Organizer line queue management page

## Phase 9 – Affiliate Conversion Tracking (verified 2026-03-04)
- affiliateController prisma import fix, JSON response, conversions field
- Schema: conversions on AffiliateLink, affiliateLinkId on Purchase
- stripeController reads affiliateLinkId, increments conversions in webhook
- Creator dashboard: Conversions + Conv. Rate stat cards

## Phase 12 – Auction Launch (verified 2026-03-05)
- auctionJob.ts: cron.schedule('*/5 * * * *', endAuctions)
- AuctionCountdown.tsx: live per-second countdown, triggers query invalidation
- BidModal.tsx: bid modal with validation
- Stripe 7% fee now item-level (!!item.auctionStartPrice)
- category/condition persistence bug fixed in itemController

## Phase 11 – PWA Push Notifications (verified 2026-03-04)
- PushSubscription model, pushController, subscribe/unsubscribe endpoints
- webpush utility, push alongside SMS reminders
- usePushSubscription hook, sw-push.js handlers
- web-push package added

## SaleScout → FindA.Sale Rebrand (2026-03-03)
- Full codebase rebrand, about.tsx + terms.tsx rewritten
- finda.sale DNS on Vercel nameservers, Resend verified
- Docker rebuilt with findasale credentials

## Pre-Beta Audit — All Fixes Complete (verified 2026-03-04)
- C1-C7: Role whitelist, referralCode JWT, AffiliateLink schema fixes, Stripe idempotency, schema drift
- H1-H11: getSale expanded, uploadController Promise.allSettled, email normalization, weekend filter, mobile cards, lazy loading, CSV Zod validation, global error handler, Stripe webhook guard, CAN-SPAM unsubscribe, Resend verified
- Beta-Blocker Burn-Down: alt text, email digest E2E, Stripe E2E, production domain — all closed
- Frontend Drift Audit: 11 stale pages pushed, Vercel build clean
- M-Series Audit: Prisma singleton, Stripe webhook verification, integer-cent math, DB transactions, JWT exp check, withRetry helper, iCal guard

## Session-Level Fixes (2026-03-04)
- Session 35: Component drift fixes (SaleCard, Layout, index.tsx, city/[city].tsx), password reset token removed from console log, 3DS redirect handling
- Session 37: Activation sprint — migrations applied, VAPID keys, uploadController fix, hooks bind mount, SW Stripe fix
- Session 40: Deep workflow audit — 9 doc fixes, CORE.md Section 10 upgrade, conversation-defaults Rule 3
- Session 41: 7-test workflow stress test — all passed

---

Last Updated: 2026-03-05
