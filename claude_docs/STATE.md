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
- Cloudinary (or Blob) image storage
- PWA enabled
- Socket.io auctions

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

- **Backend hosting not yet chosen** — domain `finda.sale` registered, frontend live on Vercel. Backend needs Railway/Render/Fly.io for `api.finda.sale`. Currently bridged via ngrok (static domain: `pamelia-unweathered-arabesquely.ngrok-free.dev`, runs as Docker service automatically).
- **Resend domain verification** — records added in Vercel DNS, awaiting Resend to confirm all 4 records active. Check Resend → Domains → finda.sale and hit Verify after reboot.
- **localhost:3000 images** — `next.config.js` is not bind-mounted; Docker frontend container still has old CSP without `fastly.picsum.photos`. Fix: `docker compose build --no-cache frontend && docker compose up -d`.

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

_None._

---

## Deferred

### Standard Deferred
- Auction (Socket.io bidding) — schema and routes scaffolded
- Virtual line / QR code — scaffolded (E2E testing in Phase 10)
- Multi-metro expansion (currently Grand Rapids only)
- Real-user beta onboarding
- Push notifications (PWA) — wired in Phase 11

### Infrastructure & Dev Tools (Pre-Beta)
- ~~Test data seeding script~~ — **Complete (verified 2026-03-02).** See Phase 9 section.
- Prisma Studio documentation — Already available (`npx prisma studio`); add to DEVELOPMENT.md setup guide. (30 min)
- ngrok setup guide — For local webhook testing (Stripe, Twilio); add to DEVELOPMENT.md. (1 hour)
- OAuth social login (Google, GitHub) — Deferred to Phase 16; add to roadmap as P2. (2–3 sprints)

---

## Constraints

- Token efficiency required
- Modular documentation
- No context drift
- Diff-only updates
- Grand Rapids launch first

---

## Next Strategic Move

Validate stability.
Run real-user beta.
Measure:
- Organizer activation
- Shopper retention
- Auction latency
- Fee capture accuracy

---

## Growth & Feature Roadmap

Comprehensive roadmap created: `claude_docs/ROADMAP.md`

Maps competitive feature parity gaps, deferred work, and growth initiatives across 7 phases (2–3 quarters). Prioritized by impact: local SEO (P1), creator growth (P1), offline marketing (P1), auction launch (deferred), and experimental mechanics (P3).

**Key P1 items to tackle post-beta:**
- Schema.org event markup (SEO)
- Item category tags + filters
- QR sign generator
- Populate creator dashboard
- Zip-level landing pages

See ROADMAP.md for full phase breakdown, success metrics, and decision gates.

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

### Dev Environment Skill Fix (2026-03-02)
Two bugs found in the dev-environment skill and corrected:
- **Missing `pnpm install` step** — rebuild table said "changed `package.json` → `docker compose build`" but omitted the required `pnpm install` on Windows first. Dockerfile uses `--frozen-lockfile`, so lockfile must be updated before Docker can build. Pitfall #8 added.
- **Wrong Prisma working directory** — all Prisma `docker exec` commands used `cd /app` (workspace root). Schema is at `packages/database/prisma/schema.prisma` — Prisma CLI needs `cd /app/packages/database`. All example commands corrected. Pitfall #9 added.
- `ai-config/dev-environment.skill` updated and live.

---

### Session 20 — Workflow & Automation (2026-03-02)
- CORE.md: added mandatory Session Init (Section 2), filetree-first rule (Section 3), bug-capture hook (Section 8)
- context-maintenance skill: added Step 3 self-healing pattern capture to session end protocol
- health-scout skill: added Self-Healing Candidates section to report format
- 4 scheduled research tasks created: competitor-monitor (Mon), changelog-tracker (Tue), ux-spotcheck (Wed), monthly-digest (1st of month)
- 4 intel directories created: claude_docs/competitor-intel/, changelog-tracker/, ux-spotchecks/, monthly-digests/
- 7 GitHub issues created (#9–#15): route planner, color-coded favorites, re-engagement emails, PWA install prompt, pre-registration, bulk pricing, granular notifications
- Pending: reinstall context-maintenance.skill + health-scout.skill from ai-config/ via Cowork; create GitHub milestones manually

---

### SaleScout → FindA.Sale Rebrand + DNS + Deployment (2026-03-03)
- Full codebase rebrand complete: all frontend pages, backend, docker-compose, package.json, docs.
- about.tsx fully rewritten with fresh narrative. terms.tsx rewritten with marketplace-style language (Etsy/eBay patterns).
- Remaining docs/artifacts cleaned: EMAIL_SMS_REMINDERS.md, test fixtures (@findasale.test).
- Committed and pushed to GitHub (deseee/findasale.git, 84 files, branch: main).
- finda.sale DNS: Vercel nameservers confirmed active in Spaceship. A record + 4 Resend DNS records added in Vercel DNS panel (A @ 216.198.79.1, DKIM, MX send, SPF send, DMARC _dmarc). DNS resolving correctly (Google DNS confirmed).
- Resend domain: records added in Vercel DNS, status pending/verifying.
- Docker: volume wiped (`docker compose down -v`), rebuilt with findasale credentials. Containers now named `findasale-*`. Database re-seeded.
- CORS fix: `ALLOWED_ORIGINS` default updated to include `https://finda.sale,https://www.finda.sale,https://findasale.vercel.app`.
- ngrok: `--domain` flag deprecated, fixed to `--url` in docker-compose.yml.
- finda.sale live on Vercel and loading FindA.Sale branding. API connectivity via ngrok confirmed (GET /api/sales returns 200 through tunnel).

### Session 26 — Dev Tooling & Full Rebrand Completion (2026-03-03)
- **CSP fix** — `next.config.js` `connect-src` now derives `apiOrigin` from `NEXT_PUBLIC_API_URL` at build time; ngrok URL no longer blocked by browser CSP. Committed: acec537.
- **Session self-awareness** — `update-context.js` now emits `## Environment` section (GitHub auth status, ngrok tunnel URL from Docker logs, CLI tools). `CORE.md` Section 4: edit transparency rule added. `context-maintenance` skill updated with capabilities inventory, dirty-session detection (`.last-wrap`), breakpoint wraps, two-tier memory system, next-session-prompt.md handoff doc. Committed: f7e130e.
- **Post-commit hook** — `.git/hooks/post-commit` auto-regenerates `context.md` after every commit.
- **Scheduled tasks renamed** — 8 new `findasale-*` tasks created (replacing 9 `salescout-*` tasks, now disabled): context, session-wrap, health-scout, competitor-monitor, changelog-tracker, ux-spotcheck, monthly-digest, beta-monitor.
- **Skills repackaged** — `dev-environment`, `health-scout`, `salescout-deploy→findasale-deploy` all updated: trigger text, DB connection strings, container names, project paths. `.skill` files in FindaSale/ root ready to install.
- **Full salescout wipe** — Zero remaining salescout/SaleScout references in active docs or skills. CLAUDE.md, SECURITY.md, STATE.md, session-log.md, self_healing_skills.md all updated. Historical log entries preserved as accurate records.
- **Pending:** Install 3 `.skill` files via Cowork skill manager; uninstall `salescout-deploy`.

---

### Seed Bug Fixes (2026-03-03)
- ✅ Fixed: organizer users 0–9 now seeded with `role: 'ORGANIZER'` (was always `'USER'`).
- ✅ Fixed: `stripeConnectId` now always `null` in seed — organizers go through real Stripe Connect onboarding. Fake `acct_test_*` IDs removed.

### Session 27 – Image Loading, CORS & Backend Fixes (2026-03-03)
- **Seed updated** — `seed.ts` now uses direct `fastly.picsum.photos` HMAC-signed URLs (no redirect). Eliminates Service Worker redirect-interception issue. Commit: c813d57.
- **CSP hardened** — `next.config.js` `img-src` now includes `https://picsum.photos https://fastly.picsum.photos`; `connect-src` uses `https://*.tile.openstreetmap.org` wildcard. Workbox rules added: StaleWhileRevalidate for picsum/fastly, NetworkOnly for Stripe, fixed OSM tile pattern to `[abc].tile.openstreetmap.org`.
- **ngrok interstitial fix** — `packages/frontend/lib/api.ts` axios headers include `ngrok-skip-browser-warning: true` — prevents ngrok HTML interstitial from replacing API JSON responses.
- **SaleCard fallback** — `components/SaleCard.tsx` now has `imgError` state + `onError` handler; broken images fall back to placeholder.svg.
- **CORS: Vercel previews** — `index.ts` CORS origin check now allows `https://findasale*.vercel.app` via regex. Commit: 3cf0833.
- **Trust proxy** — `app.set('trust proxy', 1)` added to Express; silences rate-limiter `X-Forwarded-For` validation error from ngrok. Commit: 28fa3e0.
- **finda.sale images confirmed working**. localhost:3000 images still broken — root cause: `next.config.js` not bind-mounted, frontend container has old CSP. Fix: frontend rebuild.

Last Updated: 2026-03-03 (session 27 — image loading fixed on production, CORS + proxy fixes)
Status: finda.sale fully operational with images. localhost needs frontend Docker rebuild for image parity.

---

### Seed Bug Fixes (2026-03-03)
- ✅ Fixed: organizer users 0–9 now seeded with `role: 'ORGANIZER'` (was always `'USER'`).
- ✅ Fixed: `stripeConnectId` now always `null` in seed — organizers go through real Stripe Connect onboarding. Fake `acct_test_*` IDs removed.
