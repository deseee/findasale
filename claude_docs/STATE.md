# PROJECT STATE

FindA.Sale is a two-sided marketplace PWA for secondary sale organizers (estate sales, yard sales, auctions, flea markets, consignment) connecting them with shoppers. Backend: Node.js/Prisma/PostgreSQL on Railway. Frontend: Next.js on Vercel. Mobile: React Native (future).

## Current Status

**Latest: S663 — Fortune 1000 Pre-Launch Chrome QA + 9-File Fix Batch (COMPLETE — push pending)**

Full buyer journey Chrome QA (shopper + organizer), plus code audit synthesis. Chrome-verified: shopper browse → sale detail → Place Hold → cart sidebar (end-to-end). Organizer dashboard, Holds page, TEAMS paywall, create-sale form (15 types confirmed). 9 files fixed across two dev batches. **Combined S662+S663 push block in patrick-dashboard.md — push before going live.**

**Fixes shipped (9 files):**
- **Shopper Pickups tab blank (P1)** — `shopper/dashboard.tsx`: added `useQuery` calling `/reservations/shopper`; renders hold cards with photo, title, sale name, expiry countdown, item link; loading skeleton + "No active holds" empty state
- **Cart 404 (P1)** — `shopper/cart.tsx` (NEW): redirect page to `/shopper/dashboard` — fixes broken cart URL
- **CAN-SPAM unsubscribe gap (P1)** — `emailTemplateService.ts`: added FRONTEND_URL const + unsubscribe footer in shared template wrapper — applies to ALL transactional emails automatically
- **No hold-placed email to shopper (P1)** — `saleAlertEmailService.ts`: new `sendHoldPlacedToShopper()` function; `reservationController.ts`: wired into `placeHold()` with fire-and-forget pattern
- **Vaporware "Coming Soon" copy (P2)** — `coupons.tsx`: removed 6 unimplemented feature teasers from Cosmetics & Perks section
- **TODO comments cleaned (P2)** — `add-items/[saleId].tsx`, `workspace.tsx`, `encyclopedia/[slug].tsx`: removed post-launch TODO comments

**Flagged for future sprint:**
- `/unsubscribe` frontend page needed — URL is wired in emails but page doesn't exist yet (P1)
- SSR/SSG for homepage and /sales — P0, no Google indexing without it
- JWT 7-day refresh mechanism — P0 security
- Rate limiting on bulk items endpoint — P0
- Alt text sweep (104+ images) — P0 WCAG 2.1 AA
- Focus traps on 30+ modals — P0 WCAG 2.1 AA
- COPPA age gate — P0 legal
- Cookie consent banner — P1 GDPR
- IDOR fix on mark-sold route — P1 security

---

**Previous: S662 — Pre-Launch Sitewide Audit + 23-File Fix Batch (COMPLETE — merged into S663 push block)**

Full sitewide pre-launch audit run across homepage, sale browsing, item detail, organizer portal, and auth flows. Chrome QA run directly by main session. 24 issues found (6 P0, 10 P1, 8 P2). All dispatched and fixed across 6 parallel dev batches.

**Fixes shipped (23 files):**
- **useLiveFeed 500 (P0)** — `saleController.ts`: null ref on `fav.user.name` → `fav.user?.name`; ENDED sales now return empty activity array (was showing "17 days ago" on dead sales)
- **next.config.js proxy fix (P0)** — Railway proxy moved from `afterFiles` → `fallback`; was intercepting NextAuth dynamic API routes before they could fire
- **Broken sale card images (P1)** — `SaleCard.tsx`: `onError` handler swaps broken `<img>` to inline SVG camera-frame placeholder
- **Hold button no feedback (P1)** — `HoldButton.tsx`: 1.5s delay before modal closes after success; toast now says "Hold placed on '{title}'! The organizer will confirm via email."
- **Forgot-password shows success on failure (P1)** — `forgot-password.tsx`: added error state; "Check your email" only shown on confirmed 2xx
- **Reset-password bare loading div (P1)** — `reset-password.tsx`: styled spinner + "Verifying your link..." text (dark-mode compatible); password min-length 6→8
- **"Remember me" dead UI (P1)** — `login.tsx`: removed non-functional checkbox that eroded trust; TODO added for backend JWT expiry work
- **Tour CTA href="#" (P1)** — `organizer/dashboard.tsx`: `href="#"` → `href="/guide"`, text → "View Getting Started Guide"
- **Add-items empty state (P1)** — `organizer/add-items/[saleId].tsx`: removed invalid `quantity: 1` from form reset (field doesn't exist in schema); added empty state with camera CTA
- **Edit-sale no-items warning (P1)** — `organizer/edit-sale/[id].tsx`: orange banner when sale has 0 items linking to add-items; pin distance warning copy improved
- **Condition/Category label wrapping (P2)** — `items/[id].tsx`: block `<p>` → inline `<span>` so "Condition: Circulated" stays on one line
- **PWA install prompt spam (P2)** — `InstallPrompt.tsx`: sessionStorage throttle (once per session), 5s delay, requires 3+ visits before first show
- **"Founded by" crew language (P2)** — `shopper/crews/[crewId].tsx`: "Founded by" → "Organized by"
- **SEO sale type ordering (P2)** — `generate-seo-index.ts`: yard sale first per brand rule
- **Settings tab overflow on mobile (P2)** — `organizer/settings.tsx`: `flex-nowrap` + `flex-shrink-0` for horizontal scroll (all 9 tabs preserved)
- **Geolocation banner (P2)** — `CityHeatBanner.tsx`: Haversine check — only shows if featured city is within 50 miles of user
- **Homepage banner null safety (P2)** — `index.tsx`: clarifying comments; conditional renders already correct
- **Support copy institutional (P2)** — `supportController.ts`: "contacting Patrick directly" → "contacting support@finda.sale"
- **TODO copy cleaned (P2)** — `share-card.tsx`, `shopper/dashboard.tsx`, `organizer/workspace.tsx`, `encyclopedia/[slug].tsx`, `ShopperCartDrawer.tsx`: TODOs standardized, "Patrick will lock amounts" language removed
- **affiliateConfig placeholders (P2)** — `affiliateConfig.ts`: PLACEHOLDER language removed; "Payout rules" used instead
- **Admin bid review (P2)** — `adminController.ts`: simplified getBidReviewQueue where clause

**Previous: S661 — Chrome QA: #228 ✅ #94 ✅ | #251 #235 UNVERIFIED**

**#228 Settlement Hub — ✅ VERIFIED** as `artifactmi@gmail.com`. Navigated to `/organizer/settlement/cmnxvyic4001li51qobwidrbl`. All 4 wizard steps (Summary → Expenses → Commission → Payout) render correctly. $0.00 values are correct for test sale with no actual revenue. Settle button is an `<a>` link to `/organizer/settlement/[saleId]` — works as expected.

**#94 /admin/bid-review — ✅ VERIFIED** as `user1@example.com` (ADMIN / Seedy2025!). Page loads at `/admin/bid-review`, shows "No bid IP records — All clear ✅". No 500 error.

**#251 priceBeforeMarkdown — ⚠️ UNVERIFIED** — Code confirmed correct (`priceBeforeMarkdown: true, markdownApplied: true` in saleController getSale select). No production item currently has `markdownApplied=true`, so the strikethrough price UI cannot be visually verified. Queued.

**#235 DonationModal — ⚠️ UNVERIFIED** — Code complete. DonationModal is triggered in SettlementWizard when `availableItems.length > 0` at the Receipt step. Needs a sale with a `SaleDonation` record AND available (unsold) items to test the "Donate Items & Get Tax Receipt" button.

**Organizer profile sale count bug found:** Artifact organizer at `/organizers/artifact` shows "1 sale" but has at least 3 sales in DB (IDs: `cmnxvyic4001li51qobwidrbl`, `cmoarye3d0009ryn9vlqo05i2`, `cmom7h73l000hz36wzbruoa64`). The third sale ("Artifact Downtown Paw Paw") has 80+ items confirmed showing on the sale page. Profile page sale count likely filtering by active/upcoming only — ENDED sales not counted. Low priority.

**CategoryTopFinds sync:** Re-triggered in S660 (returned `{"ok":true}`). Rows not yet verified in DB.

**Patrick actions needed:**
1. Set `CATEGORY_SYNC_ENABLED=true` on Railway (nightly cron won't fire without it)
2. Set `OUTREACH_ENABLED=true` on Railway (3,298 organizers queued)

---

**Previous: S659 — CategorySync Debugging (COMPLETE)**

Diagnosed and fixed multi-layer failure in `categorySyncCron.ts`. Four pushes: manual trigger endpoint, eBay marketplace header, direct OAuth revert, pre-encoded filter syntax for Akamai. pnpm-lock.yaml fixed (svix out of sync). CategoryTopFinds still empty — re-triggered in S660.

---

**Previous: S658 — Comprehensive Pre-Outreach Security Audit + 15 Fixes (COMPLETE)**

Two full hacker audit passes (outreach pipeline + full stack). 15 security items addressed. Migration deployed. Outreach cleared for launch.

**Shipped (code):**
- **Resend webhook signature verification (P1)** — `outreach.ts`: added svix signature check on `/resend-webhook`. Unauthenticated POSTs can no longer suppress organizer emails. `svix` added to `backend/package.json`.
- **Image upload: MIME whitelist + magic bytes + Cloudinary resource_type (P1)** — `uploadController.ts`: multer fileFilter rejects non-image MIME types; magic bytes validation checks actual file signatures (JPEG/PNG/GIF/WebP/HEIC); Cloudinary changed from `resource_type: 'auto'` to `'image'`. All 5 upload endpoints protected.
- **Organizer API: rate limiting + PII stripping (P1)** — `organizers.ts`: 100 req/10min rate limiter on public directory; email/address stripped from unauthenticated responses. Phone/address only returned for authenticated callers.
- **Stripe Connect ownership validation + audit logging (P1)** — `stripeController.ts`: explicit `organizer.userId !== req.user.id` ownership check; `[SECURITY]` audit log on every Connect account link and invalid account clear.
- **Outreach tracking rate limits (P2)** — `outreach.ts`: pixel endpoint 30 req/min, click endpoint 10 req/min.
- **Error log credential redaction (P2)** — `outreachEmailsCron.ts`: catch blocks now log `err.message` only, not full error object (prevents Nodemailer transport config leaking auth details).
- **Subject line newline injection (P3)** — `outreachEmailsCron.ts`: `\r\n\t` stripped from business names before subject rendering.
- **CAN-SPAM audit trail (P2)** — `schema.prisma`: `OutreachAuditLog` model + `OutreachAuditEvent` enum added. `SENT` event wired into cron after successful send. `OPTED_OUT` event wired into unsubscribe handler. Migration `20260506000000_add_outreach_audit_log` deployed to Railway ✅.
- **processedWebhookEvent pruning (P2)** — `webhookEventPruneJob.ts` (NEW): daily at 3am UTC, deletes events >30 days old. Wired into `index.ts`.

**Already secure (no change needed):** Password reset token invalidation ✅, suppression table UPSERT ✅, unsubscribe rate limit ✅, JWT role validation (DB-side) ✅, email verify token cleared after use ✅, CORS ✅, `OUTREACH_ENABLED` gate ✅.

**CLAUDE.md credential check:** Project git is clean (no credentials committed). Global CLAUDE.md with Railway creds is local-only on Patrick's machine — never committed, properly .gitignore'd.

**Patrick actions still needed:**
1. **Enable 2FA on Google Workspace and MailerLite** — outreach infrastructure; compromise = campaign destroyed
2. **Set `OUTREACH_ENABLED=true` on Railway** — pipeline is hardened, 3,298 organizers queued
3. **Set `CATEGORY_SYNC_ENABLED=true` on Railway** — TrendingSection on category pages still empty
4. **Verify #228 Settlement Hub** — log in as `artifactmi@gmail.com`, open ENDED sale, check payout populates at step 2

---

**Previous: S657 — Outreach Security Audit + Fixes + Chrome QA (COMPLETE)**

Full security pre-launch audit of cold outreach pipeline. Two vulnerabilities found and fixed. Chrome QA completed for S656 items.

**Shipped:**
- **Outreach security fix — Open redirect (HIGH)** — `/api/outreach/click` route accepted any `original` URL and redirected without validation — exploitable as a phishing proxy via `finda.sale` domain. Added hostname allowlist (`finda.sale`, `www.finda.sale`) with URL parse validation. Rejects non-`finda.sale` destinations with HTTP 400.
- **Outreach security fix — PII in Railway logs (MEDIUM)** — Two skip-log lines in `outreachEmailsCron.ts` logged raw email addresses to Railway. Replaced `record.emailAddress` with `record.organizerId` in suppressed/blocked-domain log lines.
- **Outreach audit findings (clean):** Tracking pixel uses opaque UUID (no PII in URL ✅), `OUTREACH_SECRET` throws hard if missing (no fallback ✅), `escapeHtml()` applied to businessName before template rendering ✅, JWT payload carries email only for RFC 8058 compliance (LOW risk, unavoidable).

**Chrome QA results:**
- **#382 Sale Type Ordering — ✅ VERIFIED** — Homepage hero, /about, /terms (3 occurrences), footer all confirmed "yard sales, garage sales, estate sales..." (ss_87027k9va, ss_36987t75u)
- **#228 Settlement Hub payout fix — UNVERIFIED** — Code fix confirmed in GitHub (commit e59df721). Browser test requires logging in as `artifactmi@gmail.com` (only account with ENDED sales in production). See Blocked Queue.
- **#379 Craigslist comment fix — ✅ VERIFIED** (code-level — comment fix, no user-visible behavior)

**Patrick actions needed:**
1. Push S657 block (outreach security fixes — see pushblock below)
2. Set `OUTREACH_ENABLED=true` on Railway — 3,298 organizers queued, pipeline is secure and ready
3. Set `CATEGORY_SYNC_ENABLED=true` on Railway (CategoryTopFinds cron has never run — TrendingSection on category pages is empty)
4. To verify #228: log in as `artifactmi@gmail.com` → Organizer Dashboard → Sales → open ENDED sale (`cmnxvyic4001li51qobwidrbl`) → Settlement Hub → confirm payout amount populates at step 2

---

**Previous: S654 — Scraper Hardening + Crash Fix + Nav Bug (COMPLETE)**

Scraper security and stealth improvements, removal of orphaned claim email system, P0 backend crash fix, and Explore nav dropdown repaired.

**Shipped:**
- **Scraper fingerprint hardening** — UA pool updated to Chrome 134/135, Firefox 135/136, Safari 18.3. `getRandomReferer()` centralized in `userAgents.ts` (was duplicated in 3 files). `Accept-Encoding: gzip, deflate, br` added to all HTTP scraper requests. `FindASaleBot/1.0` removed from all fallbacks.
- **Log suppression** — Two identity-leaking log lines in `scraper/index.ts` scrubbed (businessName removed from output). Verbose logs across `httpCache.ts`, `saleDetailEnrichment.ts`, `enrichment.ts` gated behind `LOG_LEVEL=debug`.
- **GitHub Actions DATABASE_URL fix** — Added `DATABASE_URL: ${{ secrets.DATABASE_URL }}` to 4 workflow files (`scrape-estatesalesnet.yml`, `scrape-eventbrite.yml`, `scrape-facebook-events.yml`, `scrape-newspaper-rss.yml`). Previously missing — httpCache conditional GETs were silently failing in Actions (Prisma couldn't initialize).
- **Removed orphaned claim email system** — Deleted `claimEmailService.ts` + `claimEmailCron.ts`. Removed wiring from `index.ts` and `internal.ts`. Decision: one pipeline (`outreachEmailsCron.ts`) is correct. Two cold systems = split deliverability reputation + suppression gap risk.
- **P0 backend crash fix** — `routes/internal.ts` was truncated (pre-existing, introduced in a prior session) — file ended at bare `router` with no routes registered and no `export default`. `app.use('/api/internal', undefined)` caused `TypeError: Router.use() requires a middleware function` crash loop. Restored complete file with all routes + export.
- **Explore nav dropdown** — Two bugs fixed: (1) hover sets open=true, then click was toggling true→false (immediate close). Changed onClick to always open. (2) `mt-1` gap between button and dropdown was triggering `onMouseLeave` mid-hover. Fixed with invisible bridge div covering the gap.

**Files changed:** `userAgents.ts`, `rateLimiter.ts`, `estatesalesnet.ts`, `enrichment.ts`, `facebook-marketplace.ts`, `herePlaces.ts`, `httpCache.ts`, `saleDetailEnrichment.ts`, `scraper/index.ts`, `scrape-estatesalesnet.yml`, `scrape-eventbrite.yml`, `scrape-facebook-events.yml`, `scrape-newspaper-rss.yml`, `internal.ts` (crash fix + claim removal), `index.ts` (claim removal), `claimEmailService.ts` (deleted), `claimEmailCron.ts` (deleted), `Layout.tsx` (nav fix)

---

**Previous: S653 — Sitewide Image Proxy Audit + Security Hardening (COMPLETE)**

Full sitewide audit of scraped photo proxy bypass. Root cause confirmed: `OrganizerSaleCard.tsx` was correctly using `getSaleImageUrl`, but the trending page rendered its own inline card with raw `sale.photoUrls[0]` — never going through the proxy. Fixed all 19 locations across the frontend. Also fixed trending algorithm pulling permanent retail businesses, three security vulnerabilities in the outreach system, and deprecated `onLoadingComplete` across all `<Image>` components.

**Shipped:**
- **Trending page broken images** — `trending.tsx` was using `src={sale.photoUrls[0]}` raw (no proxy). Added `getSaleImageUrl` import and wrapping. Root cause of the "A WHALE" and "Hammonton" broken images confirmed.
- **P0/P1 public discovery pages** — `neighborhoods/[slug].tsx`, `CityRecentSales.tsx`, `CityTopFinds.tsx`, `index.tsx`, `categories/[category].tsx`, `sales/[id].tsx` item photos (was using Cloudinary-only `getOptimizedUrl` for eBay items) — all now proxied correctly.
- **P2 logged-in account pages** (12 files) — `shopper/wishlist.tsx`, `profile.tsx`, `purchases/[id].tsx`, `shopper/bids.tsx`, `shopper/checkout-success.tsx`, `shopper/loot-legend.tsx`, `shopper/history.tsx`, `shopper/explorer-profile.tsx`, `shopper/early-access-cache/items.tsx`, `organizer/add-items/[saleId].tsx`, `organizer/sales/[id]/index.tsx`, `shopper/holds.tsx` — all item photoUrls now use `getItemImageUrl`.
- **Trending algorithm** — `trendingController.ts`: added `endDate <= 90 days out` + `startDate <= 60 days out` filters. Permanent retail businesses (barber shop, Goodwill, consignment stores) had far-future end dates and were flooding "Hot Sales" due to RSVP tie at 0. First version also added `items: { some: {} }` which was too aggressive (scraped sales have no items in DB) — revised to endDate window only.
- **Security P0s** — `outreach.ts`: removed `|| 'default-secret'` JWT fallback (now throws if `OUTREACH_SECRET` missing), added rate limiter (10/hr) to POST `/unsubscribe`. `outreachEmailsCron.ts`: removed base64-encoded email from tracking pixel ID (PII leak — email was visible in server logs and referrer headers).
- **`onLoadingComplete` deprecation** — removed across all `<Image>` components (Next.js 14 deprecated; replaced with `onLoad`). Zero remaining instances.

**Files changed (24):** `pages/trending.tsx`, `pages/neighborhoods/[slug].tsx`, `components/CityRecentSales.tsx`, `components/CityTopFinds.tsx`, `pages/index.tsx`, `pages/categories/[category].tsx`, `pages/sales/[id].tsx`, `next.config.js`, `components/OrganizerSaleCard.tsx`, `pages/shopper/wishlist.tsx`, `pages/profile.tsx`, `pages/purchases/[id].tsx`, `pages/shopper/bids.tsx`, `pages/shopper/checkout-success.tsx`, `pages/shopper/loot-legend.tsx`, `pages/shopper/history.tsx`, `pages/shopper/explorer-profile.tsx`, `pages/shopper/early-access-cache/items.tsx`, `pages/organizer/add-items/[saleId].tsx`, `pages/organizer/sales/[id]/index.tsx`, `pages/shopper/holds.tsx`, `backend/controllers/trendingController.ts`, `backend/routes/outreach.ts`, `backend/jobs/outreachEmailsCron.ts`

---

**Previous: S652 — CF Image Proxy End-to-End Verified (COMPLETE)**

ESN scraped sale photos now load on both browse and detail pages. Root cause of detail page failure was the PWA service worker intercepting requests to `findasale-image-proxy.findasale.workers.dev` and failing silently (same pattern as the documented i.ebayimg.com issue). Fixed by excluding the CF Worker domain from the SW catch-all rule in `next.config.js`. Verified in Chrome with new SW active: main gallery + all 5 thumbnails rendering on the Dudley Donahue Estate auction detail page.

**Previous: S651 — Search Console Audit + Scraper Stealth Innovations + P0 Fix (COMPLETE)**

Search Console fully audited. Four innovation agents shipped. Two P0 crashes found and fixed. Backend is green.

**Shipped:**
- **Soft 404 fix** — `pages/sales/[id].tsx` now returns `{ notFound: true }` for HTTP 404 API responses (was returning HTTP 200 with null props → Google flagged as Soft 404). ✅ Verified in Chrome: `finda.sale/sales/999999999` returns proper 404 page.
- **Playwright stealth scraper** — `saleDetailEnrichment.ts` replaced HTTP fetch with Playwright Chromium + puppeteer-extra-plugin-stealth. Defeats TLS fingerprinting. Import: `import { chromium } from 'playwright-extra'` (named import — default import caused P0 crash, fixed S651).
- **Conditional GETs** — `httpCache.ts` (NEW) stores ETag + Last-Modified in `Sale.scrapedMetadata.httpCache`. `estatesalesnet.ts` sends conditional headers on re-fetch; handles 304 by skipping. Expected 60–80% ESN request reduction.
- **AI listing enrichment** — `listingEnrichmentService.ts` (NEW) calls Claude Haiku to extract categories + price range + 1-sentence summary from scraped sale descriptions. Fire-and-forget trigger in `organizers.ts`. Display in `organizers/[id].tsx` (gray text, scraped sales only). UNVERIFIED — needs a scraped sale with description >50 chars to trigger and populate.
- **Cloudflare Worker image proxy** — `cloudflare/image-proxy/worker.js` (NEW). Deployed at `https://findasale-image-proxy.findasale.workers.dev`. `imageUtils.ts` updated with `getImageProxyUrl()` helper; falls back to Railway if `NEXT_PUBLIC_CF_IMAGE_PROXY_URL` not set. Vercel env var set by Patrick — triggers Vercel redeploy. UNVERIFIED end-to-end until redeploy completes.
- **package.json fix** — Removed `playwright-extra-plugin-stealth@^1.2.4` (nonexistent package) and corrected `playwright-extra` to `^4.3.6`. Lockfile regenerated.
- **wrangler.toml cleanup** — Removed deprecated `type` and `[build]` fields.

**Search Console audit findings:**
- robots.txt: ✅ validated (no blocks on key pages)
- 5xx validation: ✅ validated
- Redirects: intentional www/http variants — no action needed
- Soft 404: ❌ found → fixed same session (above)

**P0 crashes fixed this session:**
1. `saleDetailEnrichment.ts` truncated at line 266 (`const response =`) — Agent A agent truncation. Completed missing ~150 lines.
2. `playwright-extra` default import (`import playwright from 'playwright-extra'`) compiles to `.default.use()` in CJS which throws `TypeError: playwright_extra_1.default.use is not a function`. Fixed to named import `{ chromium }`.

**Files changed:** `packages/backend/src/services/scraper/saleDetailEnrichment.ts`, `packages/backend/src/services/scraper/httpCache.ts` (NEW), `packages/backend/src/services/scraper/sources/estatesalesnet.ts`, `packages/backend/src/services/listingEnrichmentService.ts` (NEW), `packages/backend/src/routes/organizers.ts`, `packages/frontend/pages/organizers/[id].tsx`, `packages/frontend/lib/imageUtils.ts`, `packages/frontend/pages/sales/[id].tsx`, `packages/backend/package.json`, `pnpm-lock.yaml`, `cloudflare/image-proxy/worker.js` (NEW), `cloudflare/image-proxy/wrangler.toml`

## Blocked/Unverified Queue

| Feature | Reason | What's Needed | Session Added |
|---------|--------|---------------|---------------|
| AI listing enrichment | Fire-and-forget — needs a scraped sale with description >50 chars to have loaded since deploy | Check Railway logs for `[listingEnrichmentService]` or query `scrapedMetadata.aiEnriched` in DB | S651 |

---

**Previous: S650 — Image Proxy + Scraper Stealth + robots.txt Fix (COMPLETE)**

---

**Previous: S649 — Cold Outreach Pipeline Activated + Full Deliverability Stack (COMPLETE — e2e verified)**

End-to-end activation of the cold outreach pipeline ahead of Wednesday May 6 launch. Five sub-pushes (S649, S649b, S649c, S649d) plus Workspace + DNS configuration. Pipeline is live, deliverability stack is fully aligned, queue is seeded. Wednesday's cron tick (00:00 UTC May 6 = 8pm EDT May 5) starts the 4-touch sequence at the warmup quota of 20/day.

**Code fixes shipped:**
- `outreachEmailsCron.ts` — Tracking URLs use RAILWAY_BACKEND_URL → BACKEND_URL → RAILWAY_PUBLIC_DOMAIN cascade with fail-fast (was hardcoded `https://finda.sale`, but `/api/outreach/*` lives on Railway not Vercel). Pixel-append bug fixed (was looking for `</body>` in templates that have no body tags — pixel never reached recipients). renderTemplate fixed (single `replace()` left link visible-text as `[preview link]` placeholder; switched to split/join). OUTREACH_FROM_EMAIL split (auth as primary mailbox, FROM as brand-aligned alias). List-Unsubscribe + List-Unsubscribe-Post headers per RFC 2369 + RFC 8058. WARMUP_START moved 2026-05-08 (Friday) → 2026-05-06 (Wednesday) for B2B engagement window.
- `seedDirectoryClaimEmails.ts` (NEW) — Populates DirectoryClaimEmail from Organizer.contactEmail for unmanaged organizers. Placeholder filter rejects junk (`@domain.com`, `@example.com`, wixpress.com Sentry endpoints). 3,656 eligible → 3,259 inserted (39 invalid, 316 placeholder). Total queue: 3,301.
- `triggerOutreachTestEmail.ts` (NEW) — Standalone e2e test creating User+Organizer+DirectoryClaimEmail trio; sends one touch1 via Gmail SMTP using cron's template/URL code; prints verification + cleanup queries. Doesn't touch production queue.
- `routes/outreach.ts` — Added POST handler for RFC 8058 one-click unsubscribe; refactored to shared `handleUnsubscribe` for both GET (link click) and POST (Gmail/Yahoo inbox button).

**Workspace + DNS config:**
- DKIM activated for outreach.finda.sale (Google Admin → Authenticate email → 2048-bit). TXT `google._domainkey.outreach` added to Vercel DNS. Verified live on Cloudflare + Google resolvers.
- "Send mail as" registered in `outreach@finda.sale` Gmail Settings → Accounts → `find@outreach.finda.sale` (treated as alias). Without this, Gmail SMTP rewrites the From header to the auth username — breaking DMARC alignment.

**E2E verification (all four levers proven):**
- Yahoo (deseee@yahoo.com): Primary tab placement, sender displays as `find@outreach.finda.sale`, header-level Unsubscribe button rendered (RFC 8058 recognized).
- Gmail (deseee@gmail.com): Inbox delivery, `signed-by: outreach.finda.sale` confirmed in expanded headers (DKIM aligned), TLS encryption.
- Pixel: opens flip `touch1Opened=true` after image render. Unsubscribe (GET): JWT validates, `EmailSuppression` row written. Unsubscribe (POST one-click): route ready.

**Pre-launch Railway env vars set:** OUTREACH_ENABLED, OUTREACH_WORKSPACE_EMAIL=outreach@finda.sale, OUTREACH_FROM_EMAIL=find@outreach.finda.sale, OUTREACH_WORKSPACE_APP_PASSWORD, OUTREACH_SECRET (rotated to 128-char hex), OUTREACH_PHYSICAL_ADDRESS=219 E Michigan Ave, Suite F, Paw Paw, MI 49079.

**Files changed (4):** `outreachEmailsCron.ts`, `seedDirectoryClaimEmails.ts` (NEW), `triggerOutreachTestEmail.ts` (NEW), `routes/outreach.ts`.

**Patrick actions:** Push S649d block + STATE.md + patrick-dashboard.md (below). Run cleanup query for 4 test row sets. Then S650 audit (see "## Next Session" below).

---

**Previous: S647 — Settlement Hub Fix + Cold Outreach Pipeline + SEO P0/P1 + 75 Guide Drafts (COMPLETE)**

Five tracks shipped:

1. **Settlement Hub (#228)**: `platformFeeAmount` + `netProceeds` computed at creation in `settlementController.ts` (was null → $0 throughout wizard). Orange CTAs in `SettlementWizard.tsx`. Fixed download receipt handler using React `isDownloading` state.
2. **Cold Outreach Pipeline (#374)**: `EmailSuppression` table + DirectoryClaimEmail touch-tracking columns (migration `20260505000000_add_outreach_pipeline`). New files: `suppressionService.ts` (bounce/complaint/opt-out handlers), `outreachEmailsCron.ts` (every 4 hours, 4-touch sequence, daily quota ramp 20→200/day, Workspace SMTP on smtp.gmail.com:587), `outreach.ts` routes (pixel tracking, click tracking, unsubscribe JWT, Resend bounce webhook). Backend wired at startup. Gated by `OUTREACH_ENABLED=true`.
3. **Bug fixes (S565)**: Site-wide click failures (#418) fixed — `CommandCenterCard.tsx` was calling `new Date()` at render time causing SSR hydration mismatch; wrapped date logic in `useMemo`. `/shopper/profile` + `/shopper/collection` SSR 404s fixed (converted `useEffect` redirects to `getServerSideProps`). Sale type ordering reordered across 5 UI locations — Yard Sale first (#382).
4. **SEO P0/P1**: Category pages → `getStaticProps` + ISR (revalidate 300s, Googlebot-visible item grid). Sale pages → Event JSON-LD with AggregateOffer (startDate, endDate, location, item count). City pages → BreadcrumbList JSON-LD. Sitemap `lastmod` now uses `sale.updatedAt`. Homepage canonical `<link>` added.
5. **Help Library #377**: All 75 guide drafts written + saved to `claude_docs/strategy/guides-drafts/<slug>.md` (47 FRESH, 18 THIN, 10 WRAPPER). 13 sections, ~51,500 words. Complete — #377 ready to mark shipped.

**Files changed:** 20 code/schema files + 75 guide drafts.

**Patrick actions:** Push blocks 1–3 + `prisma migrate deploy` + 5 Railway env vars. See "## Next Session — S649" below.

---

**Previous: S646 — CategoryTopFinds + City Own-Data + Bug Fixes + Backend Crash Restored (COMPLETE)**

Innovation research confirmed: eBay Browse API has no geo filter — all 20 metros return identical items. Elegant split implemented: **eBay → category pages**, **own organizer inventory → city pages**.

Four tracks shipped:
1. **CategoryTopFinds** (new): `CategoryTopFinds` Prisma model + migration `20260504120000`, `categorySyncCron.ts` (nightly 05:00 UTC, gated by `CATEGORY_SYNC_ENABLED=true`, 9 FindA.Sale categories → eBay Browse API by categoryId), `/api/categories/:slug/top-finds` route, TrendingSection component wired into `categories/[category].tsx`.
2. **metroSyncCron own-data swap**: queries own `Item` table first (isActive, PUBLISHED, state-matched, last 30 days). If ≥8 own items → skips eBay entirely. If <8 → fills remainder from eBay. Own items keyed as `local-{itemId}` in ebayListingId.
3. **Bug fixes**: `/items/[id]` SSR 500 (extended Prisma select in `getItemById`), Hunt Pass badge (removed "Inactive" text), tier-lapse computed from live DB not JWT.
4. **CityTopFinds crash + backend crash**: null-guarded `toFixed()` on undefined `soldPrice` in `city/[slug].tsx` + `CityTopFinds.tsx`. Restored truncated `organizers.ts` tail (agent truncation → `SyntaxError: Unexpected end of input` on Railway).

**Files changed (12):** `schema.prisma`, `migrations/20260504120000_add_category_top_finds/migration.sql` (NEW), `categorySyncCron.ts` (NEW), `routes/categories.ts` (NEW), `index.ts` (wired cron + route), `metroSyncCron.ts`, `itemController.ts`, `organizers.ts`, `coupons.tsx`, `city/[slug].tsx`, `CityTopFinds.tsx`, `categories/[category].tsx`

**Patrick actions completed:** All 4 push blocks confirmed pushed.

Gmail also activated for `outreach.finda.sale` this session: MX record (`outreach → SMTP.GOOGLE.COM priority 1`) added in Vercel DNS, SPF updated from Smartlead to Google (`v=spf1 include:_spf.google.com ~all`), Google Workspace wizard confirmed "Gmail is activated!", `find@outreach.finda.sale` alias created.

**Files changed (1):** `packages/backend/src/jobs/metroSyncCron.ts` (query fix + debug logging + cron schedule)

**Patrick actions:** Push S645 block below.

---

**Previous: S644 — SmallScreen Partnership Research + ESN Enrichment Workflow Fix (COMPLETE)**

SmallScreen Marketing (Winnipeg, CA — talent agency, secondhand/resale niche) reached out via Commonwealth Picker connection. Surfaced Canada expansion plans (roadmap #366–371) and drafted a reply email to Miles Lisan + Jonathan van Ieperen covering: creator roster questions, deal structure, Canadian vs. US audience split, content type (tutorial vs. haul), organizer-creator distinction, target market geography (ON/BC/AB = Phase 1), honest platform status (beta, CAD billing in development), and Canadian tax flags (GST/HST digital services threshold, cross-border affiliate payout withholding, Stripe Tax). Also fixed two bugs in `enrich-sale-details.yml`: (1) `batches` input was wired to nothing — matrix was hardcoded `[0,1,2]`; replaced with a `setup` job that generates the array dynamically via Python and passes it via `fromJSON`. (2) 30-minute timeout too short for 200-sale batches — extended to 60 minutes.

**Files changed (1):** `.github/workflows/enrich-sale-details.yml` (dynamic matrix + 60min timeout)

**Patrick actions:** Push S644 block below.

---

**Previous: S643 — Help Library Plan + Roadmap Entries (COMPLETE — planning only, no code)**

Built `claude_docs/strategy/guide-and-video-library-plan.md` — 75-guide written + video library covering organizer workflows (rapidfire mode, review queue + pricing, flyers, POS, settlement, eBay, consignment, holds, brand kit, promote page), shopper workflows (discovery, holds, condition grades, Hunt Pass, Guild, community), and trust mechanics (organizer reputation, refer-a-friend, introduce-organizer S635, affiliate, ripples, disputes). Three parallel research agents mapped 50+ organizer surfaces, 42 shopper surfaces, 11 trust/community features. Existing-coverage audit categorizes drafts as **FRESH (47), THIN (18), WRAPPER (10)** — surfaces existing content (`/guide` 14 sections, `/faq` 53 questions, `/condition-guide`, `/shopper/guild-primer`) instead of duplicating. Total writing load ~51,500 words across 75 drafts. Two-step work plan (no phases): (1) draft everything first → (2) site prep + slot in approved drafts. Tone rules locked: plain language, no "AI", inclusive sale types, no founder voice, sender stays "The FindA.Sale Team". Roadmap rows added: **#377** Help Library — Draft All 75 Guides + Video Scripts (write-only, no site work, drafts in `claude_docs/strategy/guides-drafts/<slug>.md`), **#378** Help Library — Site Surface (`/guides` route + FAQ inbound links + slot in, blocked on #377). Roadmap version bumped to v131.

**Files changed (3):** `claude_docs/strategy/guide-and-video-library-plan.md` (NEW, 419 lines), `claude_docs/strategy/roadmap.md` (added rows #377+#378, v131 entry), wrap docs `claude_docs/STATE.md` + `claude_docs/patrick-dashboard.md`.

**Patrick actions:** (1) Push S643 block below (4 files: plan + roadmap + STATE + dashboard). (2) Read the plan and decide whether to dispatch S644 drafting cluster 1 (Photo Workflow, 6 drafts including rapidfire mode + lighting/framing companion). See "## Next Session" below.

---

### S641 — Cold Outreach Deep-Audit + Two-Sided Pipeline Sync (COMPLETE — research only, no code)

Four parallel research dispatches (~57k words, ~80 primary sources) replacing S640's shallow single-search-per-tool premise. Verdict: **BUILD don't BUY** for cold email — all four leading vendors (Smartlead, Instantly, Saleshandy, Snov.io) are campaign-orchestrators that contradict our Postgres-as-source-of-truth design. Workspace + Postgres cron path: 8 dev days, $6/mo, zero portability risk. Tool path: 7 dev days, $30–94/mo, dual-write reconciliation debt by month 3. **S640 nearly signed us up for Smartlead — that would have been wrong** (Smartlead Pro allows only one global webhook, fatal for our per-touch state machine; 49 documented outages in 12 months). If we ever do buy, **Saleshandy is the right tool**, not Smartlead or Instantly. **Critical correction**: shopper-side SEO is NOT deferrable — it's the demand-side marketplace flywheel and runs parallel to the cold-email build, not behind it. Existing scaffolding (`/city/[slug]`, `/categories/`, `/neighborhoods/`, etc.) needs an audit pass for indexing/structured-data/link-graph/SSR completeness. Innovation pilots queued: LinkedIn via Expandi (~$99/mo, defer 2 weeks past email warm-up) + NESA/NAA/NASMM partnership outreach (~$0). RVM permanently killed (FCC 2022). Roadmap entries #374–#376 added. Strategy doc: `claude_docs/strategy/cold-outreach-deep-audit-S641.md`. Evidence: `claude_docs/research/cold-outreach-2026-05/`.

**Patrick actions (carried into S642 push):** (1) Confirm "build, don't buy" so S643 dispatches can launch. (2) Send 19 queued Gmail partnership outreach drafts (NESA, NAA ×2, NASMM, ISA, Nick Loper, Codie Sanchez). (3) Provision second Workspace seat for `outreach@finda.sale` ($6/mo) — needed before S643 Dev build.

---

### S640 — Email Audit + Brand Drift Batch (COMPLETE)

(1) Resend audit complete: `claimEmailService.ts` was firing 200%/day usage but all sends targeted `@system.finda.sale` placeholder addresses — no real organizer received email. Set `CLAIM_EMAIL_ENABLED=false` to stop. (2) `outreach.finda.sale` subdomain DNS records added to Vercel: SPF (`v=spf1 include:_spf.smartlead.ai ~all`) ✅ and DMARC (`v=DMARC1; p=none; rua=mailto:dmarc@outreach.finda.sale`) ✅. DKIM pending Smartlead signup. (3) HERE_API_KEY GitHub Secret confirmed added by Patrick. (4) P2 brand drift batch shipped: 4 files fixed (Layout.tsx, messages/index.tsx, _document.tsx, city/[slug].tsx). **NOTE S641:** the Smartlead SPF entry needs to be removed — S641 audit confirmed we are NOT signing up for Smartlead. Workspace SPF includes get added during S643 Dev build.

---

### S639 — Google Places Billing + Cost Optimizations (COMPLETE)

(1) Discovered $47.22 Google Places API charge on $100 Google Cloud bill. Root cause: enrichment.ts fetching `rating`/`user_ratings_total` fields unnecessarily, no caching, no skip logic. (2) enrichment.ts cost fix pushed by Patrick at 12:32 UTC May 4: removed rating fields from Place Details request, added skip logic when organizer already has both phone AND website, added module-level 30-day TTL cache (`placeIdCache` Map). (3) Google Cloud quota hard cap set: Places API "Requests per day" reduced from Unlimited → 15,000 (~$15/day worst case). Path used: IAM & Admin → Quotas (Maps Platform quotas page had rendering issues). (4) Confirmed Google's $200/month free credit is GONE — replaced by subscription tiers (Starter $100/mo, Essentials $275/mo). Pay as you go is correct plan for current usage. No action needed. (5) All S633–S638 pushes confirmed live on GitHub via commit log. STATE.md was stale — Patrick had been pushing regularly.

**Files changed (1):** enrichment.ts (cost optimization — already on GitHub, commit 12:32 UTC May 4)

**Patrick actions:** None. All work is live.

---

### S638 — Scraper Fleet Reactive Fixes (COMPLETE — confirmed pushed)

Six reactive scraper fleet fixes shipped. (1) herePlaces.ts `baseMmetro`/`baseMretto` typo → `baseMetro`. (2) HERE Places returning same 123 results for all NYC boroughs — added HERE Geocoding API fallback (`geocodeWithHERE()`, 8s timeout, module-level cache). (3) HERE Places running 5–6× per metro — fixed by deduplicating queue items by `(metro, subArea)` before scraping (50 items → 10 unique locations). (4) foursquarePlaces.ts null byte corruption, duplicate block, TS2322 null/undefined — all fixed. (5) Foursquare HTTP 429 on detail API — removed all detail API calls. (6) Railway P2002 on email unique constraint + googlePlaceId — fixed. ARG_MAX `curl -d "$RESULTS"` → file-based curl.

**Files changed (6):** herePlaces.ts, run-here-places.ts, foursquarePlaces.ts, scraper/index.ts, enrichment.ts, enrich-sale-details.yml

**Patrick actions:** None — all pushed, confirmed on GitHub (commit 10:07 UTC May 4).

---

### S637 — Email Acquisition Pipeline: Concurrency + SMTP Verifier
**COMPLETE — Data pipeline: email hit rate 1.4% → 31%**

enrichContactEmails.ts upgraded with pull-queue concurrency (SCRAPE_CONCURRENCY=10, PLACES_CONCURRENCY=5, processWithConcurrency helper). New smtpPermutationVerifier.ts: MX lookup → RCPT TO prefix probing (15 prefixes) → catch-all detection → DB write. No mail sent. PLATFORM_DOMAINS set blocks Facebook/Instagram/HiBid/ctbids/linqapp/instacard etc. BLOCKED_MX_HOSTS set (GoDaddy/Proofpoint/Mimecast/M365 + smaller hosts) writes best-guess info@ immediately instead of timing out. No-match fallback and SMTP-unreachable fallback also write info@ rather than losing the organizer. New smtp-permutation-verify.yml workflow (daily 2am UTC). Live run results: 128 verified, 27 catch-all, 160 no MX, 53 SMTP unreachable, 48 no match — ~31% email hit rate vs ~1.4% HTML-scraper-only. Workflow cohesion audit: all 9 scraper scripts confirmed to exist, all 4 internal routes wired (ingest, enrich-backfill, batch, bulk), ts-node installed, pnpm filter names match — fleet is cohesive.

---

## Recent Sessions (S654–S657)

### S657 — Outreach Security Audit + Fixes + Chrome QA (COMPLETE)

Pre-launch security audit of cold outreach pipeline. Two vulnerabilities fixed: (1) open redirect in `/api/outreach/click` — added `finda.sale` allowlist with URL parse + hostname check; (2) email PII in Railway logs — replaced `record.emailAddress` with `record.organizerId` in two skip-log lines. Chrome QA: #382 Sale Type Ordering fully verified ✅ (homepage, /about, /terms, footer). #228 Settlement Hub UNVERIFIED — code confirmed in GitHub, needs `artifactmi@gmail.com` login with ENDED sale to browser-test.

**Files changed (2):** `packages/backend/src/routes/outreach.ts`, `packages/backend/src/jobs/outreachEmailsCron.ts`

---

### S656 — Settlement Hub P1 Fix + Sale Type Ordering + Craigslist Stub (COMPLETE)

Three roadmap items fixed. #228 Settlement Hub: `SettlementWizard.tsx` payoutAmount useEffect now triggers from step≥2 (was step===3|4) — fixes $0.00 on Receipt tab and empty Payout field. #382 Sale Type Ordering: 5 files reordered so "Yard Sales" leads (About, index, OnboardingModal, terms, Layout footer). #379: Craigslist cron comment corrected (was stale — cron entry was already FacebookMarketplace). All TS checks clean, zero errors.

**Files changed (8):** `SettlementWizard.tsx`, `about.tsx`, `index.tsx`, `OnboardingModal.tsx`, `terms.tsx`, `Layout.tsx`, `scraperCron.ts`, `roadmap.md`

**Patrick actions:** Push S656 block. Set `OUTREACH_ENABLED=true` + `CATEGORY_SYNC_ENABLED=true` on Railway.

---

### S655 — Brand Drift D-001 Remediation + suppressOffTargetOrganizers (COMPLETE)

3 organizers suppressed via suppressOffTargetOrganizers (prior sessions had cleared ~486 bulk). Chrome QA passed on all S654 fixes. 8 D-001 brand drift violations fixed across 9 files — "estate-sale only" framing removed from all public copy. CityHero H1 + CityNearbyLinks footer verified live in Chrome. Vercel deploy READY confirmed via MCP.

**Files changed (9):** `CityHero.tsx`, `CityTopFinds.tsx`, `CityNearbyLinks.tsx`, `OnboardingModal.tsx`, `pages/sales/index.tsx`, `pages/shopper/crews/index.tsx`, `pages/index.tsx`, `referral-dashboard.tsx`, `shopper/referrals.tsx`

---

### S654 — Scraper Hardening + Crash Fix + Nav Bug (COMPLETE)

UA pool updated (Chrome 134/135, Firefox 135/136, Safari 18.3). Log fingerprinting scrubbed. GitHub Actions DATABASE_URL fix (4 workflows). Orphaned claim email system removed (claimEmailService + claimEmailCron). P0 crash fix in `routes/internal.ts` (truncated file → crash loop). Explore nav dropdown fixed (click toggle + hover gap).

---

### S653 — CF Image Proxy Audit + Security Hardening + Proxy Sitewide Audit (COMPLETE)

19 image proxy locations fixed across frontend. Trending algorithm fixed (permanent retail businesses flooding "Hot Sales"). Three security P0s fixed (JWT fallback, rate limiter, PII in pixel ID). `onLoadingComplete` deprecated across all `<Image>` components.

---

## Recent Sessions (S636–S639)

### S637 — Email Acquisition Pipeline: Concurrency + SMTP Verifier
**COMPLETE — Data pipeline: email hit rate 1.4% → 31%**

(1) enrichContactEmails.ts: added `processWithConcurrency<T>` pull-queue helper, SCRAPE_CONCURRENCY=10, PLACES_CONCURRENCY=5. All 3 pass loops converted from sequential to concurrent. (2) smtpPermutationVerifier.ts (NEW): MX lookup via dns.promises, RCPT TO handshake via raw TCP sockets, 15 common prefixes in priority order, catch-all detection via gibberish probe, PLATFORM_DOMAINS blocklist (Facebook/social platforms, HiBid, ctbids, linqapp, instacard, squarespace, wixsite etc.), BLOCKED_MX_HOSTS blocklist (GoDaddy, Proofpoint, Mimecast, M365, hostedemail, ipage, homesteadmail, magicbrain), best-guess info@ fallback on blocked/unreachable/no-match. SMTP_VERIFY=false env var for best-guess-only mode. (3) smtp-permutation-verify.yml (NEW): daily 2am UTC + workflow_dispatch. (4) Workflow cohesion audit: all 9 scraper scripts exist, internal.ts complete (all 4 routes), controller exports all 4 functions, ts-node v10.9.1 installed, pnpm filter names match — fleet cohesive.

**Files changed (3):** enrichContactEmails.ts (concurrency), smtpPermutationVerifier.ts (NEW), smtp-permutation-verify.yml (NEW) — confirmed on GitHub.

**Patrick actions:** No push needed — files confirmed on GitHub. Wrap doc push only (STATE.md + patrick-dashboard.md).

---

### S636 — Email Creative Session
**COMPLETE — No code, no migrations**

Pure copywriting session. Finalized 4 outreach email templates for cold organizer acquisition pipeline. Key decisions: T1 subject locked to "Where do buyers find [Business Name]?" (curiosity gap, earns the open, honest), no exclamation marks throughout, plain language voice consistent across all four touches. T2: direct re-send, no drama. T3: Smart Pricing hook with Hummel/art nouveau lamp specificity. T4: clean break-up. File saved to `claude_docs/strategy/outreach-email-templates-v4.md` (v7). Templates are ready for Dev dispatch to wire into Postgres cron. 0 files changed in codebase.


### S635 — Organizer Referral XP Mechanic
**COMPLETE — Integration: schema, services, UI, achievements**

Implemented full organizer referral economy. New `ShopperOrganizerIntroduction` model tracks which shopper introduced which organizer (unique compound key). xpService.ts gained 7 constants (SHOPPER_INTRODUCED, ORGANIZER_REFERRAL_PRO_UPGRADE, ORGANIZER_REFERRAL_QUALITY_TIER, DISCOVERY_MANUAL, SCOUT_LEADERBOARD tiers, monthly ORGANIZER_CLAIMED cap). referralService.ts added 3 award functions checking monthly caps and applying Hunt Pass multiplier. organizers.ts claim approval endpoint now fires XP awards. achievementService.ts gained 4 cosmetic badges. organizers/[id].tsx now displays founding shoppers. Memory: subagent write verification gate documented.

**Files changed (7):** xpService, referralService, organizers.ts, schema.prisma, migration 20260628, achievementService, organizers/[id].tsx

**Patrick actions:** (1) Push S635 block. (2) Run `prisma migrate deploy` for 20260628 migration.

---

### S634 — RETAIL Scraper Pipeline + Founding Shoppers + Behavioral Overhaul
**COMPLETE — Data pipeline: Foursquare enrichment + UI + docs**

(1) RETAIL scraper chain: added `fetchFoursquareDetails()` in foursquarePlaces.ts to pull hours, website, phone for RETAIL listings, stored in `scrapedMetadata`. sales/[id].tsx now shows "Permanent Storefront · Always Open" + hours block for RETAIL. New backfillFoursquareDetails.ts script enriches existing RETAIL listings (requires Railway DATABASE_URL override + FOURSQUARE_API_KEY). (2) Organizer profile "Discovered by" amber section displays founding shopper avatars. (3) Behavioral system improvements: CLAUDE.md §0 added (mandatory session start: read STATE.md → roadmap → present top 3 items), conversation-defaults updated (friction gate, push verification, evidence-based gates), findasale-dev skill updated (mandatory acceptance criteria block). (4) Vercel build fix: added `scrapedMetadata?: Record<string, unknown> | null` to Sale interface.

**Files changed (7):** foursquarePlaces.ts, osmOverpass.ts, scraper/index.ts, sales/[id].tsx (×2), backfillFoursquareDetails.ts (NEW), organizers/[id].tsx, CLAUDE.md

**Patrick actions:** (1) Push S634 block. (2) After deploy, run backfill script with Railway DATABASE_URL + FOURSQUARE_API_KEY.

---

### S633 — GitHub Actions Workflow Fleet Overhaul + googlePlaceId @Unique P1 Fix
**COMPLETE — Operational: concurrency, timeouts, dedup schema constraint**

Full audit and repair of 11 GitHub Actions workflows. (1) **8 workflows rewritten:** All now have `concurrency` blocks (cancel-in-progress: false, keyed by workflow name). scrape-estatesalesnet.yml timeout extended 10→25 min (confirmed ~19 min in prod). scrape-newspaper-rss.yml cron staggered 02:00→02:30 UTC (avoids clash with Google Places on 1st at 02:00). scrape-foursquare.yml broken METRO_BATCH env var removed. All deprecated *_ORGANIZER_ID secrets removed. (2) **P1 schema fix:** `googlePlaceId String? @unique` on Organizer (was String? without constraint). Migration 20260503100000 created: dedup DELETE (keeps lowest id), DROP old non-unique index, CREATE UNIQUE INDEX IF NOT EXISTS. (3) test-esn-api-access.yml flagged for `git rm` (stale/redundant). TypeScript: zero errors. Bug fix agent dispatched for /items/[id] 500, OG meta missing, Hunt Pass status, tier-lapse banner — fixes still pending.

**Files changed (10):** All 8 GH Actions workflow files, schema.prisma (googlePlaceId @unique), migration 20260503100000 (NEW)

**Patrick actions:** (1) Push S633 block. (2) `git rm .github/workflows/test-esn-api-access.yml` in same commit. (3) Run `prisma migrate deploy` + `prisma generate` on Railway for @unique constraint.

---

---

## Blocked/Unverified Queue

| Feature | Reason | What's Needed | Session Added |
|---------|--------|---------------|---------------|
| CategoryTopFinds TrendingSection | Cron runs at 05:00 UTC — no data until first run | QA after first nightly run; verify TrendingSection renders on a `/categories/[category]` page with real eBay data | S647 |
| Outreach pipeline open/click tracking | Can't verify pixel + click routes without real sends | Verify after `OUTREACH_ENABLED=true` + first cron run: check Railway logs for send attempt, confirm tracking pixel route returns 200 | S647 |
| #251 priceBeforeMarkdown | No production item has `markdownApplied=true` — strikethrough UI cannot be visually confirmed | Find or seed an item with a markdown applied, then verify crossed-out price renders on sale detail page | S661 |
| #235 DonationModal | Needs a Settlement flow with SaleDonation record + AVAILABLE items | Test as PRO organizer with a sale that has a SaleDonation record + unsold items — verify "Donate Items & Get Tax Receipt" button appears at Receipt step | S661 |
| AI listing enrichment | Fire-and-forget — needs a scraped sale with description >50 chars to have loaded since deploy | Check Railway logs for `[listingEnrichmentService]` or query `scrapedMetadata.aiEnriched` in DB | S651 |

---

## Next Session — S662

**First action:** Read STATE.md + roadmap.md BROKEN section. Present top 3 by priority.

**S662 priority order:**
1. **CategoryTopFinds verify** — Query `CategoryTopFinds` count in DB. If >0 rows, open `finda.sale/categories/clothing` in Chrome and confirm TrendingSection renders with eBay items. If 0 rows, re-trigger sync and check Railway logs.
2. **Outreach first-send verification** — Check Railway logs for `[OutreachCron] Sent Touch 1` — `OUTREACH_ENABLED=true` should be set by Patrick this session.
3. **#251 and #235** — Seed or find a markdown item to verify priceBeforeMarkdown; test DonationModal on PRO organizer with unsold items.
4. **Roadmap BROKEN items** — read roadmap.md BROKEN section, advance next priority.

**Patrick must-do before S662:**
1. Set `CATEGORY_SYNC_ENABLED=true` on Railway
2. Set `OUTREACH_ENABLED=true` on Railway

---

## Next Session — S651 (Search Console Audit + Scraper Stealth Innovation Dispatch)

**First action:** Load `dev-environment` skill. Then run Search Console audit + dispatch all scraper stealth innovations in parallel.

**Track 1 — Google Search Console full audit (Chrome MCP)**
Open Search Console at finda.sale. Validate fixes on:
- Server error (5xx): 3 pages — deleted seed sales, page now shows "Sale not found" correctly. Hit "Validate Fix".
- Blocked by robots.txt: 3 `/organizers/[id]` pages — fixed this session (robots.txt push live). Hit "Validate Fix".
- Page with redirect: 3 pages — NOT yet investigated. Drill in, identify URLs, determine if redirects are intentional or broken. Fix if broken.
Also: check if `/sales/[id]` returns a proper HTTP 404 (not 200 with "Sale not found") — important for SEO. Inspect via URL tool in Search Console.

**Track 2 — Scraper stealth innovations (dispatch ALL in parallel)**

Dispatch these 6 as parallel Agent calls in one message:

**Agent A — Playwright + playwright-stealth for enrichment scraper**
Replace HTTP fetch in `saleDetailEnrichment.ts` with Playwright Chromium + `playwright-stealth`. Defeats HTTP/2 TLS fingerprinting at the protocol level — no UA rotation can do this. Chromium IS Chrome: TLS handshake, HTTP/2 frame ordering, canvas fingerprint, navigator properties all real. `playwright-stealth` patches webdriver flag and remaining bot signals. Install: `pnpm add playwright playwright-extra playwright-extra-plugin-stealth` in backend. One browser instance per batch, closed after. Read `saleDetailEnrichment.ts` in full first.

**Agent B — Cloudflare Workers image proxy**
Move `/api/proxy-image` off Railway (static IP) onto a Cloudflare Worker — free tier 100k req/day, every request originates from a different global edge IP. Create `cloudflare/image-proxy/worker.js` with same domain allowlist as `imageProxyController.ts`. Update `imageUtils.ts` `getSaleImageUrl()` to use Worker URL. Patrick deploys via `wrangler deploy`. Read `imageProxyController.ts` + `imageUtils.ts` first.

**Agent C — Session simulation**
In `saleDetailEnrichment.ts` and `estatesalesnet.ts`, before fetching any target URL, build a real navigation chain: (1) fetch ESN homepage, (2) wait 1-3s random, (3) fetch a search results page, (4) wait 1-3s, (5) fetch target URL with search page as Referer. Organic-looking because it IS organic navigation. Lightweight — existing fetch infrastructure, not Playwright. Add `simulateSession(source: string)` helper.

**Agent D — Cache-first conditional GETs**
Add `If-Modified-Since` + `ETag` support to `saleDetailEnrichment.ts` + `estatesalesnet.ts`. Store response headers in `Sale.scrapedMetadata`. On re-fetch: send conditional headers. 304 → skip, log "unchanged". Cuts ESN volume 60-80%, looks like a browser with a warm cache. Verify `scrapedMetadata` field exists in schema before writing.

**Agent E — Residential proxy integration** ⏸ PAUSE (paid service — evaluate later)
Bright Data / Oxylabs / Smartproxy rotate every request through real home internet IPs — the single most effective long-term stealth tool, undetectable at any scale. ~$50-150/month. Hold until revenue or a free trial is available. When ready: build as optional proxy layer gated by `RESIDENTIAL_PROXY_URL` env var in `saleDetailEnrichment.ts` + `estatesalesnet.ts` — if set, proxy; if not, direct. Do NOT dispatch this agent until Patrick confirms budget or trial access.

**Agent F — AI-enriched listing display**
For scraped sale listings that have a `description` but limited structured data, generate AI-enriched display content: (1) auto-tagged categories from description text using Claude Haiku (reuse existing `cloudAIService.ts` pattern), (2) estimated price range from item types mentioned in description (e.g. "furniture, jewelry, tools" → "Items typically $5–$500"), (3) AI-generated 1-sentence sale summary if description is >100 words. Store in `Sale.scrapedMetadata`. Display on organizer profile page and sale detail page. This makes FindA.Sale listings richer than ESN's own pages. Read `cloudAIService.ts` + `organizers.ts` route + `organizers/[id].tsx` before writing anything. Schema gate: confirm `scrapedMetadata` exists on Sale model.

---

## Next Session — S650 (Cold Outreach Pre-Launch Multi-Lens Audit)

**First action:** Load `dev-environment` skill. Then dispatch a multi-lens audit of the cold outreach pipeline before Wednesday's first real send. Pipeline is fully aligned (DKIM ✓, SPF ✓, From-alignment ✓, List-Unsubscribe ✓, Yahoo Primary tab on cold recipient ✓), but no human has reviewed it through adversarial / strategic lenses yet.

**S649 found a P0 product issue at wrap (must address before cron fires):** Patrick visited a test organizer's preview page (`https://finda.sale/organizers/<id>`) and it shows `0 sales`, `No sales listed yet`, `No reviews yet`, `New Organizer` badge. The cold outreach email's value pitch is *"We built [Business Name] a free storefront on FindA.Sale"* — but if 3,301 unmanaged organizers all click through to empty storefronts, the cold pitch flops. Recipients dismiss as low-quality service. **Audit must specifically evaluate what real recipients will see when they click the preview link.**

**Three audit lenses (run in parallel where possible):**

1. **Hacker lens** → `findasale-hacker` skill. Red-team the pipeline. Threat model: spoofed unsubscribe tokens, JWT secret rotation gaps, scraper-injected business names that contain HTML/JS payloads in email templates, EmailSuppression race conditions, RFC 8058 POST CSRF surface, tracking pixel ID enumeration, organizer page enumeration via predictable IDs, leak risk of OUTREACH_WORKSPACE_APP_PASSWORD.

2. **Guru lens (best practices)** → `findasale-advisory-board` skill, route to Risk subcommittee + Go-to-Market subcommittee. Evaluate: deliverability (DKIM-2048 sufficient? DMARC p=none vs p=quarantine?), CAN-SPAM compliance specifics, GDPR for any EU-domiciled organizers we may have scraped, sequence cadence (3/5/7 days appropriate?), template tone given organizer demographics (estate sale operators skew older — does plain text + clear unsubscribe match expectations?), seasonality (May launch — peak estate sale season).

3. **Business strategist lens** → `findasale-advisory-board` skill, route to full board. Evaluate: 20→200/day ramp realistic for solo operator? What's the conversion model (3,301 emails → ? claims)? Should we A/B test subject lines before scaling? What does competitor reaction look like if EstateSales.NET / EstateSales.org notice mass enrollment of their listings? What's the legal exposure of "we built you a storefront" without explicit consent (publicity rights, defamation if business is misrepresented)?

**Recipient preview audit (P0 — required before cron tick):**

Sample organizer pages from each ingest source and screenshot what real recipients will see. Sources to sample:
- ESN (EstateSales.NET) — pull 3 from current DB by `directorySource='estatesalesnet'`
- Google Places — pull 3 by `directorySource='google_places'`
- Foursquare — pull 3 by `directorySource='foursquare'`
- HERE Places — pull 3 by `directorySource='here_places'`

For each: open the preview URL in Chrome MCP, screenshot. Document what's populated (name, address, photos, sales, reviews) vs. what's empty. Identify the cohort that will get the worst recipient experience and decide: (a) backfill data before launch, (b) suppress those organizers from queue, (c) rewrite the email template's pitch to not promise more than the page delivers.

**Pre-launch gate:** Patrick must approve audit findings before the first real cron tick fires. Cron will tick automatically Wednesday 00:00 UTC May 6 (8pm EDT May 5) unless OUTREACH_ENABLED is set false. Consider temporarily setting `OUTREACH_ENABLED=false` on Railway until audit ships, OR setting `OUTREACH_TEST_EMAIL` to redirect all sends to deseee@yahoo.com while audit runs.

**S649 e2e cleanup (non-blocking, run anytime):**
```powershell
@'
DELETE FROM "EmailSuppression" WHERE "emailAddress" IN ('deseee@yahoo.com','deseee@gmail.com');
DELETE FROM "DirectoryClaimEmail" WHERE "organizerId" IN (
  'cmossgqz60002hstogkauqzc4','cmossm21b000212121yz2x4zc',
  'cmostyqmi0002uga89dgacrwg','cmosumnvf0002m6eo4cc5yz0s','cmosuv1xx000294kuu4vyn6x7'
);
DELETE FROM "Organizer" WHERE id IN (
  'cmossgqz60002hstogkauqzc4','cmossm21b000212121yz2x4zc',
  'cmostyqmi0002uga89dgacrwg','cmosumnvf0002m6eo4cc5yz0s','cmosuv1xx000294kuu4vyn6x7'
);
DELETE FROM "User" WHERE id IN (
  'cmossgqry0000hstov97xw8xy','cmossm1u600001212cerf3y0o',
  'cmostyqf40000uga8dhuq45i9','cmosumno80000m6eokv8n0pd9','cmosuv1qm000094ku66ywmyc6'
);
'@ | psql $env:DATABASE_URL
```

**S647 Patrick actions still pending (if not done):**
- Push Block 1, 2, 3 from S647 (see archived section below)
- `prisma migrate deploy` for `20260505000000_add_outreach_pipeline`
- Send 19 queued Gmail partnership outreach drafts
- Set profile photo on `outreach@finda.sale`
- Read guide drafts in `claude_docs/strategy/guides-drafts/`

### Locked context (don't re-derive)
- Architecture: eBay → category pages; own organizer inventory → city pages (S646)
- Verdict: BUILD Workspace + Postgres cron, do NOT sign up for Smartlead/Instantly/Saleshandy/Snov
- 4 email templates locked S636 (`outreach-email-templates-v4.md`)
- DNS: SPF (`_spf.google.com`) + DMARC live on `outreach.finda.sale`, DKIM via Workspace keypair (S646)
- Shopper-side SEO is parallel critical infra (memory: feedback_seo_two_sided_distinction.md)
- `businessCategory` on Organizer is NOT an enum — it's a plain String hardcoded from `PLACES_QUERIES` config. Every Google Places result gets a valid category regardless of what Google actually returned. Category filtering alone cannot distinguish Hilton hotels from thrift stores — name matching is required.
- `toNumber()` returns `null` for null Decimal (not 0) — anti-pattern to watch in settlement/financial calculations

### Patrick pending actions (S647 wrap — carry forward)

**Push Block 1 — Settlement Hub + Sale Type Ordering (7 files)**
```powershell
git add packages/backend/src/controllers/settlementController.ts
git add packages/frontend/components/SettlementWizard.tsx
git add packages/frontend/components/SearchFilterPanel.tsx
git add packages/frontend/pages/index.tsx
git add packages/frontend/pages/organizer/create-sale.tsx
git add "packages/frontend/pages/organizer/edit-sale/[id].tsx"
git add packages/frontend/pages/organizer/settings.tsx
git commit -m "fix(settlement): compute netProceeds at creation, fix download handler (#228) | fix(ui): sale type ordering — yard sale first (#382) | seo: homepage canonical link"
.\push.ps1
```

**Push Block 2 — S565 bugs + SEO + cold outreach pipeline (13 files)**
```powershell
git add packages/frontend/components/CommandCenterCard.tsx
git add packages/frontend/pages/shopper/profile.tsx
git add packages/frontend/pages/shopper/collection.tsx
git add "packages/frontend/pages/categories/[category].tsx"
git add "packages/frontend/pages/sales/[id].tsx"
git add "packages/frontend/pages/city/[slug].tsx"
git add packages/frontend/pages/server-sitemap.xml.tsx
git add packages/backend/src/services/suppressionService.ts
git add packages/backend/src/jobs/outreachEmailsCron.ts
git add packages/backend/src/routes/outreach.ts
git add packages/backend/src/index.ts
git add packages/database/prisma/schema.prisma
git add packages/database/prisma/migrations/20260505000000_add_outreach_pipeline/migration.sql
git commit -m "fix(s565): hydration mismatch + shopper SSR 404s | seo: category ISR + Event JSON-LD + BreadcrumbList + sitemap lastmod | feat(outreach): pipeline — suppression table, 4-touch cron, tracking routes"
.\push.ps1
```

**Push Block 3 — 75 guide drafts + wrap docs**
```powershell
git add claude_docs/strategy/guides-drafts/
git add claude_docs/STATE.md
git add claude_docs/patrick-dashboard.md
git commit -m "docs: 75 help library guide drafts (#377 complete) | wrap S647+S648"
.\push.ps1
```

**After Push Block 2 — Railway migration:**
```powershell
cd C:\Users\desee\ClaudeProjects\FindaSale\packages\database
$env:DATABASE_URL="postgresql://postgres:QvnUGsnsjujFVoeVyORLTusAovQkirAq@maglev.proxy.rlwy.net:13949/railway"
npx prisma migrate deploy
npx prisma generate
```

---

## Next Session — S645 (CHOICE OF TRACK) [COMPLETED]

**Primary goal options for S645 — Patrick chooses one:**

**Track A — Help Library Drafting Cluster 1 (Photo Workflow, 6 drafts).** Dispatch `findasale-marketing` skill with `claude_docs/strategy/guide-and-video-library-plan.md` as context. Output: 6 markdown drafts in `claude_docs/strategy/guides-drafts/` covering rapidfire mode, lighting/framing, retake guidance, multi-angle photos, photo stations, helper sessions. ~7,000 words. Patrick reads + voice-checks before cluster 2 starts. Roadmap row #377.

**Track B — Cold Outreach + Shopper SEO Parallel Specs (S642 plan, deferred).** The original S642 plan (4 parallel agent dispatches: cold outreach spec, shopper SEO audit, partnership outreach polish, LinkedIn pilot setup) is still queued. See archived dispatch prompts below for the full prompts.

**Track C — Bug fixes + Chrome QA carryover.** Pre-existing P1s in Blocked/Unverified Queue: /items/[id] 500, sale social previews blank, Hunt Pass status inconsistency, tier-lapse banner styling. None block beta demos but block real organizer trial signups.

**Track D — SmallScreen Partnership follow-up.** Once Miles/Jonathan reply with roster details, build the affiliate program spec. Roadmap has affiliate on the list but no dedicated row yet — may warrant an #379 entry.

### Tracks B (S642 plan, archived) dispatch prompts

**Agent 1 — Cold Outreach Spec (architect, embed `findasale-architect` skill context)**
Prompt: "Convert `claude_docs/strategy/OUTREACH_EMAIL_ARCHITECTURE.md` into a tightened S643-ready dev spec given S641 audit findings. Drop the Phase-2-Instantly migration assumption. Document IMAP reply parsing path explicitly (S641 architecture audit confirmed Workspace path requires +2–3 days for IMAP vs. tool path's webhook). Verify Workspace 500/day claim against current 2026 Google docs (S641 found this is a reputation milestone, not a technical cap). Update DKIM section — drop Smartlead, use Workspace-generated keypair. Specify the ~8 dev-day breakdown with exact files to create/modify. Output: spec.md ready for findasale-dev S643 dispatch."

**Agent 2 — Shopper SEO Audit (architect, embed `findasale-architect` + `marketing:seo-audit` skill context)**
Prompt: "Audit existing shopper-side discovery SEO infrastructure. Verified-existing pages: `/city/[slug]`, `/cities`, `/categories`, `/categories/[category]`..."