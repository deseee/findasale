# PROJECT STATE

FindA.Sale is a two-sided marketplace PWA for secondary sale organizers (estate sales, yard sales, auctions, flea markets, consignment) connecting them with shoppers. Backend: Node.js/Prisma/PostgreSQL on Railway. Frontend: Next.js on Vercel. Mobile: React Native (future).

## Current Status

**Latest: S672 — OAuth Diagnosis (INCOMPLETE — fix attempt failed, clean handoff for next session)**

Confirmed via `GET /api/oauth/providers` and live OAuth probe that NextAuth at runtime is still using `/api/auth/` as basePath despite the handler living at `/api/oauth/[...nextauth].ts`. Patrick changed Vercel env `NEXTAUTH_URL` from `https://finda.sale` to `https://finda.sale/api/oauth` (Production scope), and S672 commit `b98b3d8` stripped the redirect_uri overrides. Force-rebuild without cache did not change behavior — Google sends users back to `/api/auth/callback/google` which has no handler ("Cannot GET"). Conclusion: NextAuth v4 is not honoring `NEXTAUTH_URL.pathname` in this environment. Stop fighting it.

**Additional finding from Vercel env list:** `NEXTAUTH_SECRET`, `GOOGLE_CLIENT_SECRET`, `FACEBOOK_CLIENT_SECRET` all show "Needs Attention" badges — likely empty or invalid in Production scope. Verify these before next-session OAuth test.

**S672 commit shipped (b98b3d8):** stripped `authorization.params.redirect_uri` overrides from `pages/api/oauth/[...nextauth].ts` — diff currently live but irrelevant since the basePath approach didn't work.

**Path forward for next session (recommended Path C):**
1. Move NextAuth handler back to standard location: `pages/api/auth/[...nextauth].ts`
2. Add `packages/frontend/middleware.ts` matching only the three backend paths that should NOT hit NextAuth: `/api/auth/refresh`, `/api/auth/me`, `/api/auth/logout` — rewrite to Railway via NEXT_PUBLIC_API_URL. NextAuth catch-all then handles all other `/api/auth/*`.
3. Vercel env: revert `NEXTAUTH_URL` to `https://finda.sale` (Production scope, also expand to "All Environments" if Preview/Dev need it). Verify `NEXTAUTH_SECRET`, `GOOGLE_CLIENT_SECRET`, `FACEBOOK_CLIENT_SECRET` all have non-empty values.
4. `_app.tsx`: remove `basePath="/api/oauth"` from SessionProvider (or change to `/api/auth`).
5. Google + Facebook consoles already have `/api/auth/callback/[provider]` registered — keep them.
6. Push, redeploy, verify `/api/oauth/providers` becomes `/api/auth/providers` with `callbackUrl: https://finda.sale/api/auth/callback/google`. Live-test Google + Facebook sign-in in incognito.

This is the canonical NextAuth + custom backend pattern. The `/api/oauth/` migration in S667 introduced more friction than the original "catch-all conflict" was worth.

**Previous: S671 — OAuth Revert + S669 Audit P0/P1 Batch Complete (COMPLETE — all pushed)**

Diagnosed root cause of persistent login bounce: `NEXT_PUBLIC_API_URL` pointed browser API calls directly to Railway (cross-domain XHR), blocking SameSite=Lax auth cookies and SameSite=Strict CSRF cookie. Fixed in 5 files: proxy routing (api.ts), refreshToken cookie path (authController.ts), clearCookie paths (auth.ts routes), CSRF bypass for /auth/refresh + /auth/logout (csrf.ts), and an infinite 401 loop guard in the response interceptor (api.ts). All pushed via MCP. Login ✅ VERIFIED in Chrome: signed in as user1@example.com (Alice Johnson), landed on /organizer/dashboard, no bounce.

**S670 items shipped:**
- P0 fix: `packages/frontend/lib/api.ts` — browser baseURL changed from NEXT_PUBLIC_API_URL to `/api` proxy; added guard to prevent 401 interceptor looping on `/auth/refresh` itself
- P0 fix: `packages/backend/src/controllers/authController.ts` — refreshToken cookie path `/auth/refresh` → `/` in all 4 cookie-setting locations (login, oauthLogin, register, refresh)
- P0 fix: `packages/backend/src/routes/auth.ts` — clearCookie path for refreshToken fixed to `/` in logout + refresh error handler; `/auth/refresh` + `/auth/logout` added to CSRF bypass
- P0 fix: `packages/backend/src/middleware/csrf.ts` — `/auth/refresh` and `/auth/logout` added to CSRF skip list

**Note:** Existing users with a stale refreshToken scoped to old path `/auth/refresh` will need to log in fresh once — this is expected and correct.

**Previous: S669 — 7-Lens Audit + Vercel Build Fix + Organizer.stripeOnboarded P0 (COMPLETE — pushed)**

7 parallel audit lenses run (mobile/PWA, performance, shopper competitive, shopper SEO, error states, pricing funnel, email). P0 login crash diagnosed from Railway logs and fixed via migration. Vercel build ERROR from S668 diagnosed and fixed. Chrome authenticated audit UNVERIFIED — auth cookie mechanism blocks programmatic login in Chrome MCP.

**S669 items shipped:**
- P0: `Organizer.stripeOnboarded` missing from production DB — caused "column does not exist" crash on every login. Migration `20260507000003_add_organizer_stripe_onboarded` created + Patrick ran `prisma migrate deploy` ✅
- Build fix: `ItemSearchResults.tsx` — `ItemSearchResult` type not assignable to `UnifiedItemCardItem | Item` (S668 SocialProofBadge wiring introduced mismatch). Fixed: imported `UnifiedItemCardItem`, cast `item as unknown as UnifiedItemCardItem` at line 132. Vercel should build green now.

**Audit findings (code-level — dev dispatch pending S670):**

*Mobile/PWA:*
- ✅ Viewport meta, safe-area-inset, 56px touch targets, manifest.json (8 icons, maskable)
- ❌ P1: `public/sw.js` pre-caches `/offline.html` but file doesn't exist — PWA falls back to network error

*Performance/Core Web Vitals:*
- ❌ P0: `SaleCard.tsx` — `<img loading="lazy">` on all cards including above-fold. Should be `loading="eager"` for first 4 cards (LCP hit)
- ❌ P0: `pages/sales/[id].tsx` — hero image client-side rendered, not in SSR pass (LCP risk)
- ❌ P1: `pages/index.tsx` — feed data fetched client-side via react-query; no ISR/SSG (slow initial paint)
- ✅ Cache-Control headers, PWA runtime caching

*Shopper-side SEO:*
- ❌ P0: Item pages (`/items/[id]`) have zero Product structured data (JSON-LD) — no rich snippets in Google
- ❌ P1: City pages silently `noindex` when empty — prevents Google from crawling new city pages
- ❌ P1: Category pages content-thin (list only, no editorial text) — weak signals for "estate sales in [city]" queries

*Email content:*
- ❌ P1: 6 email templates with CAN-SPAM compliance gaps (missing unsubscribe header in some)
- ❌ P1: "estate sale" banned term appears 5× across email templates (policy violation per decisions-log)
- ❌ P1: Unsubscribe links expose email as plain URL parameter (`?email=user@example.com`) — PII leak in server logs

*Not captured (agents lost to context compression):*
- Error/empty states audit — rerun in S670
- Shopper competitive audit — rerun in S670

*UNVERIFIED (Chrome login blocked):*
- Pricing/upgrade funnel walkthrough (FREE→SIMPLE→PRO→TEAMS)
- Mobile authenticated flows (organizer dashboard, rapid capture, POS)

**Previous: S668 — Multi-Lens Product Audit + P0/P1 Fix Batch (COMPLETE — pushed)**

4-lens audit (CRO, game design, organizer competitive, session integrity) + Lens 5 (organizer onboarding funnel). Two P0s found and fixed. P1s dispatched and shipped.

**S668 items shipped:**
- P0: Login loop — `_app.tsx` SessionProvider basePath `/api/oauth` + `api.ts` 401 redirect guard (fixes S667 NextAuth path migration regression)
- P0: `Item.moderationStatus` not in production DB — migration `20260507000002_add_item_moderation_status` (fixes auctionAutoCloseCron CRON FAIL every 5min)
- P1: SocialProofBadge + CountdownTimer wired into ItemCard/search/ItemSearchResults (existing components, now visible on browse/search)
- P1: Scout→Ranger XP threshold 2000→1200 (xpService, rankUtils, guild-primer — game balance fix)
- P1: Organizer MailerLite enrollment on signup — `addOrganizerSubscriber()` added + called on register/oauthLogin; organizers now enter Beta Onboarding automation
- UX: `index.tsx` — "Running a sale? List it free" subtle text link below hero search bar (tasteful, hidden when searching)
- Env var needed: `MAILERLITE_ORGANIZERS_GROUP_ID` in Railway

**Previous: S667 — S666 Backlog Sweep: All 16 Meta-Audit Items Shipped (COMPLETE — pushed)**

S666 deferred 16 items. Patrick decided: (A) NextAuth → `/api/oauth/`, (B) Sentry Crons for observability. All 16 items dispatched via 7 parallel dev agents, verified, and pushed via `.\push.ps1`.

**Post-session fixes (pushed via MCP):**
- `packages/frontend/pages/organizer/settings.tsx` — `link.parentChild` → `link.parentNode` (TS error blocking Vercel)
- `packages/backend/src/routes/auth.ts` — `ipKeyGenerator` helper in `resetPasswordLimiter` (ERR_ERL_KEY_GEN_IPV6 on startup)
- `packages/backend/Dockerfile.production` — cache-bust bumped 2026-05-06 → 2026-05-07 (forced Railway rebuild)
- Facebook OAuth redirect URI updated: `/api/auth/callback/facebook` → `/api/oauth/callback/facebook` ✅
- Google OAuth redirect URI updated in Google Cloud Console ✅
- CCPA migration (`20260507000001_add_ccpa_opt_out`) — `prisma migrate deploy` run ✅
- Stripe Tax: `automatic_tax: {enabled: true}` is wired but intentionally NOT activated in Stripe Dashboard. One dashboard toggle activates it if ever needed — no code changes required.

**Railway:** ✅ Green (backend active, IPv6 rate-limit warning resolved)
**Vercel:** ✅ Green

**S667 items completed:**

*Auth (Batch 1):*
- `/api/oauth/[...nextauth].ts` — NextAuth moved from `/api/auth/`; resolves V5 routing conflict blocking JWT cookie auth
- `AuthContext.tsx` — removed localStorage JWT reads, now calls `GET /api/auth/me` with `credentials:'include'` on mount
- `lib/api.ts` — `withCredentials:true` on axios instance, 401 interceptor calls `/auth/refresh` once then redirects
- All cookies now have `secure: true` unconditionally (was conditional on NODE_ENV)
- Old file `packages/frontend/pages/api/auth/[...nextauth].ts` deleted (`git rm`)
- 15 frontend files still use localStorage JWT — non-blocking, flagged for future sweep

*GDPR/Legal (Batch 2):*
- `userController.ts` — `exportMyData()`: 24h rate limit, queries all user data, returns JSON download
- `routes/users.ts` — `GET /me/export` + `POST /me/do-not-sell` routes
- `pages/do-not-sell.tsx` (NEW) — CCPA opt-out page
- `organizer/settings.tsx` — "Download My Data" button
- `terms.tsx` — Section 15 arbitration clause (AAA, Kent County MI, class action waiver, 30-day opt-out)
- `outreachEmailsCron.ts` — CAN-SPAM address: `'219 E Michigan Ave, Suite F, Paw Paw, MI 49079'`
- `schema.prisma` — `ccpaOptOut Boolean @default(false)` on User
- Migration: `20260507000001_add_ccpa_opt_out` ✅ deployed

*Stripe + Auction (Batch 3):*
- `stripeController.ts` — `charge.refunded` webhook handler + `automatic_tax:{enabled:true}` on PaymentIntent/Checkout
- `tierLapseService.ts` — dunning grace: was immediate downgrade, now `TIER_GRACE_DAYS` env (default 7)
- `itemController.ts` — bid validation: type check + positive + must exceed currentHighBid

*SEO + Accessibility (Batch 4):*
- Canonical URLs on 5 pages: `sales/[id]`, `items/[id]`, `organizers/[id]`, `categories/[category]`, `search`
- `globals.css` — `@media (prefers-reduced-motion: reduce)` block

*Observability (Batch 5):*
- `cronGuard.ts` — Sentry Cron check-ins (`in_progress`/`ok`/`error` per run) on all 38 cron jobs
- `prisma.ts` — slow-query listener (>1000ms → Sentry), connection pool monitor (>8 busy → Sentry)
- `index.ts` — SIGTERM/SIGINT graceful shutdown (30s drain), deliverabilityMonitorJob wired
- `deliverabilityMonitorJob.ts` (NEW) — weekly cron, bounce rate alert if >2% in 7 days

*Scraper hardening (Batch 6):*
- `dedupe.ts` — `normalizeAddress()` (suffix/directional normalization), multi-level dedup pipeline
- `processRapidDraft.ts` — camera race fix: optimistic lock with `updatedAt` snapshot; organizer-set values win on conflict
- `geocodingAuditJob.ts` (NEW) — daily 6AM UTC, Sentry alert if any source has >10% null geocoding
- `dedupe.test.ts` (NEW) — 20+ unit tests for normalizeAddress + checkDuplicate
- `backend/package.json` — jest/ts-jest/@types/jest added

*Claim/Content/Games (Batch 7):*
- `organizers.ts` — `GET /organizers/claim/verify/:token` (24h expiry, sets VERIFIED status)
- `pages/claim/verify/[token].tsx` (NEW) — loading/success/expired/invalid states
- `uploadController.ts` — NSFW detection via Cloudinary AWS Rekognition; auto-deletes flagged images
- `itemController.ts` — Cloudinary orphan cleanup when item deleted
- `admin/feature-flags.tsx` — D-006: "Enable AI camera tagging" → "Enable Smart camera tagging"
- `routes/admin.ts` — `GET /admin/xp-velocity` endpoint (flags users >500 XP/hr in 7-day window)
- `pages/admin/xp-velocity.tsx` (NEW) — admin table of flagged users
- `claude_docs/API_RESPONSE_FORMAT.md` (NEW) — standard response shapes reference

---

**Previous: S666 — Meta-Audit + Comprehensive P0/P1 Fix Batch (COMPLETE — pushed)**

Audit-of-audits sweep against S657–S665 work. 4 parallel meta-audit agents found 28 gaps; 5 verification probes confirmed which "shipped" claims were live. Three S664 deliverables were silently broken: (1) DOB field absent from `/register` HTML; (2) `/sales/[id]` + `/items/[id]` returning 200 with zero JSON-LD blocks; (3) `/api/auth/*` all 400 — NextAuth catch-all intercepting before Vercel rewrite to backend.

Migration deploy CONFIRMED: `ProcessedWebhookEvent` + `OutreachAuditLog` tables exist, `ageVerifiedAt` + `tokenVersion` present, `20260506000001_add_age_verified` live.

**S666 critical fixes shipped (51 files):**
- `adminAuth.ts` — multi-role regression fixed: checks `roles?.includes('ADMIN')` AND legacy `role === 'ADMIN'`
- `authController.ts` — `oauthVerifyAge` handler (validates DOB, sets ageVerifiedAt, blocks <18)
- `routes/auth.ts` — POST `/auth/oauth-verify-age` added; resetPasswordLimiter + verifyEmailLimiter added
- Auction close wrapped in `prisma.$transaction()` with optimistic-lock guard (P0 — dual-winner race eliminated)
- `settlementController.ts` — addExpense/removeExpense/updateSettlement now atomic
- Stripe webhook idempotency switched to INSERT-FIRST with P2002 catch
- `cronGuard.ts` (NEW) — Sentry error wrapper, consecutive-failure counter
- All 38 cron jobs wrapped with cronGuard
- `weeklyEmailJob.ts` — cron string fixed from `'minute hour day-of-month month day-of-week'` placeholder to `'0 18 * * 0'`
- 4 new rate limiters: feedLimiter, searchLimiter, aiAnalyzeLimiter, paymentLimiter
- `pages/age-verify.tsx` (NEW) — OAuth signup age gate UI
- `pages/auth/oauth-callback.tsx` — redirects to `/age-verify` if ageVerifiedAt null

---

**Previous: S665 — Vercel Build Fix + S664 Code Audit (COMPLETE)**

Fixed `AccessibleModal.tsx` `handleKeyDown` using native DOM `KeyboardEvent` instead of `React.KeyboardEvent<HTMLDivElement>`. Confirmed `DELETE /users/me` in `routes/users.ts` line 439. Code audits verified JWT cookies on all 4 auth paths ✅, loginLimiter+registerLimiter ✅, /logout+/refresh+/me ✅, JSON-LD in sales/items ✅.

---

**Previous: S664 — Fortune 1000 Pre-Launch Sprint: 6-Audit + 13-Agent Implementation (COMPLETE)**

6 parallel audits → 13 implementation agents fixing all P0/P1/P2. COPPA age gate, JWT httpOnly cookies, 34/34 modals focus-trapped (AccessibleModal), homepage + sale/item SSR + JSON-LD, cookie consent banner, ToS legal gaps, sage contrast fix (3.2:1 → 4.5:1), bulk rate limiting, POS currency precision, account deletion UI, Stripe webhook idempotency, `ProcessedWebhookEvent` model, `ageVerifiedAt` schema field + migration `20260506000001_add_age_verified`.

---

**Previous: S663 — Fortune 1000 Pre-Launch Chrome QA + 9-File Fix Batch (COMPLETE)**

Full buyer journey QA. 9 files fixed: Shopper Pickups tab, Cart 404 redirect, CAN-SPAM unsubscribe footer in all emails, hold-placed email to shopper, vaporware copy removed, TODO comments cleaned.

---

**Previous: S662 — Pre-Launch Sitewide Audit + 23-File Fix Batch (COMPLETE)**

24 issues found (6 P0, 10 P1, 8 P2), all fixed. useLiveFeed 500 fix (null ref on `fav.user.name`), next.config.js proxy fix (moved Railway proxy to `fallback`), broken sale card images (onError SVG placeholder), hold button feedback (1.5s delay + toast), forgot-password error state, reset-password styled loading, "Remember me" dead UI removed, Tour CTA href="#" → /guide, add-items empty state, edit-sale 0-items warning, condition label fix, PWA install spam throttle, `prefers-reduced-motion` CSS, brand copy fixes.

---

**Previous: S661 — Chrome QA: #228 ✅ #94 ✅ | #251 #235 UNVERIFIED (COMPLETE)**

#228 Settlement Hub — ✅ VERIFIED as `artifactmi@gmail.com`. All 4 wizard steps render. #94 /admin/bid-review — ✅ VERIFIED as `user1@example.com`. #251 priceBeforeMarkdown — ⚠️ UNVERIFIED (no item with markdownApplied=true in prod). #235 DonationModal — ⚠️ UNVERIFIED (needs SaleDonation record + available items).

---

**Previous: S659 — CategorySync Debugging (COMPLETE)**

Fixed multi-layer failure in `categorySyncCron.ts`. eBay marketplace header, direct OAuth revert, pre-encoded filter syntax. pnpm-lock.yaml fixed. CategoryTopFinds re-triggered in S660.

---

**Previous: S658 — Comprehensive Pre-Outreach Security Audit + 15 Fixes (COMPLETE)**

Resend webhook signature verification (svix), image upload MIME whitelist + magic bytes, Cloudinary `resource_type: 'image'`, Stripe Connect ownership validation + audit logging, outreach rate limits, error log credential redaction, subject line newline injection fix, CAN-SPAM audit trail (`OutreachAuditLog` model + migration `20260506000000_add_outreach_audit_log` ✅ deployed), processedWebhookEvent pruning cron.

---

**Previous: S657 — Outreach Security Audit + Fixes + Chrome QA (COMPLETE)**

Open redirect fix in `/api/outreach/click` (added finda.sale allowlist). PII in Railway logs fixed. #382 Sale Type Ordering ✅ VERIFIED in Chrome (yard sales first across all 5 locations).

---

**Previous: S654 — Scraper Hardening + Crash Fix + Nav Bug (COMPLETE)**

UA pool updated (Chrome 134/135, Firefox 135/136, Safari 18.3). Log fingerprinting scrubbed. GitHub Actions DATABASE_URL fix (4 workflows). Orphaned claim email system removed (`claimEmailService` + `claimEmailCron`). P0 crash fix in `routes/internal.ts` (truncated file → crash loop). Explore nav dropdown fixed.

---

**Previous: S653 — CF Image Proxy Audit + Security Hardening (COMPLETE)**

19 image proxy locations fixed across frontend. Trending algorithm fixed (permanent retail flooding "Hot Sales"). Three security P0s fixed. `onLoadingComplete` deprecated across all `<Image>` components.

---

**Previous: S652 — CF Image Proxy End-to-End Verified (COMPLETE)**

ESN scraped sale photos load on browse and detail pages. SW intercept fix (excluded CF Worker domain from SW catch-all in `next.config.js`).

---

**Previous: S651 — Search Console Audit + Scraper Stealth + P0 Fix (COMPLETE)**

Soft 404 fix (`{ notFound: true }` for 404 API responses). Playwright stealth scraper in `saleDetailEnrichment.ts`. Conditional GETs in `httpCache.ts`. AI listing enrichment (`listingEnrichmentService.ts`). Cloudflare Worker image proxy deployed. P0 crashes fixed: playwright-extra default import, truncated saleDetailEnrichment.ts.

---

**Previous: S649 — Cold Outreach Pipeline Activated (COMPLETE — e2e verified)**

Full cold outreach pipeline live. DKIM activated for outreach.finda.sale. "Send mail as" `find@outreach.finda.sale` alias registered. E2E verified: Yahoo primary tab, Gmail signed-by DKIM, pixel flip, unsubscribe JWT. 3,301 organizers in queue. Railway env vars set: OUTREACH_ENABLED, OUTREACH_FROM_EMAIL, OUTREACH_PHYSICAL_ADDRESS.

---

**Previous: S647 — Settlement Hub Fix + Cold Outreach Pipeline + SEO P0/P1 + 75 Guide Drafts (COMPLETE)**

Settlement Hub (#228): `platformFeeAmount` + `netProceeds` computed at creation. Cold Outreach Pipeline: EmailSuppression + touch-tracking columns (migration `20260505000000`), `outreachEmailsCron.ts`, suppressionService. SEO: category pages ISR, sale pages Event JSON-LD. 75 guide drafts written to `claude_docs/strategy/guides-drafts/`.

---

## Blocked/Unverified Queue

| Feature | Reason | What's Needed | Session Added |
|---------|--------|---------------|---------------|
| JWT httpOnly cookies | ✅ VERIFIED S670 — login worked through proxy, cookies set correctly | — | S664/S667 |
| COPPA age gate | Code shipped but not Chrome-tested | Register with DOB <18 → should get "must be 18 or older" error | S664 |
| Sales/Items SSR JSON-LD | Code shipped but not Chrome-tested | View source on finda.sale/sales/[id] — should see `<script type="application/ld+json">` | S664 |
| Modal focus traps (34 modals) | Code shipped but not browser-tested | Open any modal, Tab through — focus should stay inside | S664 |
| Claim verify flow | Code shipped S667 but not browser-tested | Hit `/claim/verify/[token]` with a real token, verify organizer status updates | S667 |
| NSFW detection | Code shipped S667 but not browser-tested | Upload an image via organizer flow, confirm Cloudinary moderation runs | S667 |
| #251 priceBeforeMarkdown | No production item with markdownApplied=true | Seed item with markdownApplied=true, verify strikethrough price renders | S661 |
| #235 DonationModal | Needs SaleDonation record + available items | PRO organizer sale with SaleDonation + unsold items, verify Receipt step | S661 |
| AI listing enrichment | Fire-and-forget — needs scraped sale with description >50 chars | Check Railway logs for `[listingEnrichmentService]` or query `scrapedMetadata.aiEnriched` | S651 |
| CategoryTopFinds TrendingSection | Cron runs 05:00 UTC — no data until first run | QA after first nightly run; verify TrendingSection renders on `/categories/[category]` | S647 |
| Outreach pipeline open/click tracking | Can't verify without real sends | After `OUTREACH_ENABLED=true` + first cron run: check Railway logs, confirm pixel route 200 | S647 |

---

## Recent Sessions (S666–S670)

### S670 — P0 Login Bounce Fixed + Chrome Verified (COMPLETE — MCP pushed)

Root cause of login bounce: browser API calls bypassed the Next.js proxy, going cross-domain to Railway and breaking SameSite cookie restrictions. Fixed in 5 files across frontend + backend. Also patched an infinite 401 loop in the response interceptor (api.post('/auth/refresh') was triggering its own interceptor, flooding the refresh endpoint with 90+ calls per page load — now guarded). All 5 files pushed to GitHub via MCP. Vercel deployed and Chrome-tested: login as user1@example.com → /organizer/dashboard ✅ no bounce.

---

### S669 — 7-Lens Audit + Build Fix + Organizer.stripeOnboarded P0 (COMPLETE — pushed)

7-lens parallel audit (mobile/PWA, performance, shopper competitive, shopper SEO, error states, pricing funnel, email). P0 discovered from Railway logs: `Organizer.stripeOnboarded` column missing from production DB — was crashing every login. Migration created + deployed. Vercel build ERROR (S668 SocialProofBadge wiring introduced `ItemSearchResult` type mismatch) — fixed in `ItemSearchResults.tsx`. Chrome authenticated audit fully blocked: auth cookie flow (httpOnly cross-domain) cannot be established via Chrome MCP's programmatic fetch approach. All authenticated flows remain UNVERIFIED. Audit findings documented above; dev dispatch is S670 first action.

---

### S668 — Multi-Lens Product Audit + P0/P1 Fix Batch (COMPLETE — pushed)

5-lens parallel audit. Lens 1 (CRO): SocialProofBadge + CountdownTimer were built but never deployed — now wired into browse/search item cards. Lens 2 (Game design): Scout→Ranger XP curve too steep — fixed 2000→1200. Lens 3 (Organizer competitive): onboarding email gap found — organizers never enrolled in MailerLite automation on signup, now fixed. Lens 4 (Session integrity): #336 race fix confirmed present, #228 roadmap row stale. Lens 5 (Onboarding funnel): 3-email drip automation exists in MailerLite but organizers were never subscribed — enrollment fix shipped. Two P0s found and fixed: login loop from S667 SessionProvider basePath mismatch, and Item.moderationStatus missing from prod DB crashing auctionAutoCloseCron every 5 min. Homepage: subtle "Running a sale? List it free" text link added below search bar. Patrick direction: no fake social proof, no copy bloat — lean into being new and fresh.

---

### S667 — S666 Backlog Sweep: All 16 Meta-Audit Items Shipped (COMPLETE — pushed)

All 16 S666-deferred items dispatched in 7 parallel dev batches. NextAuth → `/api/oauth/`. AuthContext + api.ts off localStorage. GDPR export + CCPA opt-out page + schema migration. ToS arbitration. CAN-SPAM address fixed. Stripe refund webhook + dunning grace. Canonical URLs on 5 pages. `prefers-reduced-motion`. Sentry Crons on all 38 jobs. Slow-query + pool monitoring. SIGTERM graceful shutdown. Deliverability monitor. Address normalization + 20 tests. Camera race fix. Geocoding audit cron. Claim verify endpoint + page. NSFW detection. Cloudinary orphan cleanup. XP velocity admin page. D-006 "AI" → "Smart". API_RESPONSE_FORMAT.md. Post-session: settings.tsx TS fix, ipKeyGenerator rate limiter fix, Railway cache-bust, OAuth redirects updated, CCPA migration deployed.

---

### S666 — Meta-Audit + Comprehensive P0/P1 Sweep (COMPLETE — pushed)

28 gaps found by 4 meta-audit agents. Key discoveries: admin role regression (IDOR), isUnmanagedListing missing on 4 controllers, auction dual-winner race, settlement non-atomic, weekly email cron with placeholder string never firing. All fixed. 38 cron jobs wrapped with Sentry. 4 new rate limiters. OAuth age gate UI added.

---

### S665 — Vercel Build Fix + S664 Code Audit (COMPLETE)

`AccessibleModal.tsx` KeyboardEvent type fix (native DOM → React.KeyboardEvent). Confirmed account deletion backend endpoint exists. Code-level audit of S664 batch verified all key changes present.

---

### S664 — Fortune 1000 Pre-Launch Sprint (COMPLETE — pushed)

6 parallel audits + 13 implementation agents. COPPA age gate, JWT httpOnly cookies, 34/34 modals focus-trapped, SSR + JSON-LD on sale/item pages, cookie consent, ToS gaps, sage contrast fix, POS currency precision, Stripe webhook idempotency, account deletion UI.

---

### S665 — Vercel Build Fix + S664 Code Audit (COMPLETE)

`AccessibleModal.tsx` KeyboardEvent type fix. Confirmed account deletion endpoint. Code-level audit of S664 batch verified all key changes present.

---

## Recent Sessions (S666–S671)

### S671 — OAuth Login Investigation (INCOMPLETE — Google/Facebook OAuth still broken)

Entire session consumed by OAuth `redirect_uri_mismatch` and followup issues. Root cause chain:

1. **redirect_uri_mismatch**: NextAuth v4 internally hardcodes `/api/auth/` in callback URLs regardless of handler file location. Since S667 moved the handler to `/api/oauth/[...nextauth].ts`, the fix is explicit `authorization.params.redirect_uri` override in GoogleProvider and FacebookProvider pointing to `/api/oauth/callback/[provider]`.

2. **Bad fix attempted**: A general-purpose agent concluded the move to `/api/oauth/` was unnecessary and that moving back to `/api/auth/` was safe. That was wrong. Moving NextAuth back to `/api/auth/[...nextauth].ts` created a catch-all that intercepted `POST /api/auth/refresh` and `GET /api/auth/me` (backend Railway routes), both returning 400. Result: immediate logout after every login attempt.

3. **Revert shipped**: `pages/api/oauth/[...nextauth].ts` restored with `redirect_uri` overrides for both providers. `pages/api/auth/[...nextauth].ts` deleted via `git rm`. `_app.tsx` SessionProvider basePath reverted to `/api/oauth`. Pushed and deployed.

4. **Error page fix**: Added `pages.error: '/login'` to NextAuth config — NextAuth v4 hardcodes `/api/auth/error` for errors, which no longer exists. This routes OAuth errors to login page instead of a broken URL.

5. **Rate limiter triggered**: All the failed `/auth/oauth` calls during the bad deployment triggered the backend's in-memory rate limiter. "Too many authentication attempts, please try again later." Railway restart needed to clear it.

6. **Status at wrap**: Rate limit still active. OAuth login unverified end-to-end. Railway backend needs restart to clear rate limit before next test.

**Files changed this session:**
- `packages/frontend/pages/api/oauth/[...nextauth].ts` — redirect_uri overrides + `error: '/login'` in pages config
- `packages/frontend/pages/_app.tsx` — basePath reverted to `/api/oauth`
- `packages/frontend/pages/api/auth/[...nextauth].ts` — DELETED (`git rm`)

**Google/Facebook Console state at wrap:** Both `/api/auth/callback/[provider]` AND `/api/oauth/callback/[provider]` are registered. Both being registered is fine. The `/api/oauth/` ones are what matter and are correctly registered.

**S671 continuation — S669 audit P0/P1 batch (16 files, all MCP pushed):**
Root cause: subagent writes to VM mount don't always flush to Windows git staging before `.\push.ps1`. MCP `push_files` reads Windows path directly, bypassing the sync window. Process rule added to `feedback_subagent_write_verification.md`.

Files: `SaleCard.tsx` (P0 LCP — eager loading above-fold), `feed.tsx`, `public/offline.html` (P1 — sw.js gap), `city/[slug].tsx` (P1 — noindex fix), `notifications.tsx`, `search.tsx`, `sales/[id].tsx` (hero LCP), `index.tsx` (P0 ISR revalidate:300 + priority), `shopper/dashboard.tsx` (error banner), `mailerliteService.ts`, `weeklyEmailService.ts`, `emailReminderService.ts`, `buyerMatchService.ts`, `organizerAnalyticsService.ts`, `curatorEmailJob.ts`, `waitlistController.ts` — all 6 email services: token-based unsubscribe replacing raw `?email=` PII (P1 compliance).

---

### S670 — P0 Login Bounce Fixed + Chrome Verified (COMPLETE — MCP pushed)

Root cause of login bounce: browser API calls bypassed the Next.js proxy, going cross-domain to Railway and breaking SameSite cookie restrictions. Fixed in 5 files across frontend + backend. Also patched an infinite 401 loop in the response interceptor (api.post('/auth/refresh') was triggering its own interceptor, flooding the refresh endpoint with 90+ calls per page load — now guarded). All 5 files pushed to GitHub via MCP. Vercel deployed and Chrome-tested: login as user1@example.com → /organizer/dashboard ✅ no bounce.

---

### S669 — 7-Lens Audit + Build Fix + Organizer.stripeOnboarded P0 (COMPLETE — pushed)

7-lens parallel audit (mobile/PWA, performance, shopper competitive, shopper SEO, error states, pricing funnel, email). P0 discovered from Railway logs: `Organizer.stripeOnboarded` column missing from production DB — was crashing every login. Migration created + deployed. Vercel build ERROR (S668 SocialProofBadge wiring introduced `ItemSearchResult` type mismatch) — fixed in `ItemSearchResults.tsx`. Chrome authenticated audit fully blocked: auth cookie flow (httpOnly cross-domain) cannot be established via Chrome MCP's programmatic fetch approach. All authenticated flows remain UNVERIFIED. Audit findings documented above; dev dispatch is S670 first action.

---

### S668 — Multi-Lens Product Audit + P0/P1 Fix Batch (COMPLETE — pushed)

5-lens parallel audit. Lens 1 (CRO): SocialProofBadge + CountdownTimer were built but never deployed — now wired into browse/search item cards. Lens 2 (Game design): Scout→Ranger XP curve too steep — fixed 2000→1200. Lens 3 (Organizer competitive): onboarding email gap found — organizers never enrolled in MailerLite automation on signup, now fixed. Lens 4 (Session integrity): #336 race fix confirmed present, #228 roadmap row stale. Lens 5 (Onboarding funnel): 3-email drip automation exists in MailerLite but organizers were never subscribed — enrollment fix shipped. Two P0s found and fixed: login loop from S667 SessionProvider basePath mismatch, and Item.moderationStatus missing from prod DB crashing auctionAutoCloseCron every 5 min. Homepage: subtle "Running a sale? List it free" text link added below search bar. Patrick direction: no fake social proof, no copy bloat — lean into being new and fresh.

---

### S667 — S666 Backlog Sweep: All 16 Meta-Audit Items Shipped (COMPLETE — pushed)

All 16 S666-deferred items dispatched in 7 parallel dev batches. NextAuth → `/api/oauth/`. AuthContext + api.ts off localStorage. GDPR export + CCPA opt-out page + schema migration. ToS arbitration. CAN-SPAM address fixed. Stripe refund webhook + dunning grace. Canonical URLs on 5 pages. `prefers-reduced-motion`. Sentry Crons on all 38 jobs. Slow-query + pool monitoring. SIGTERM graceful shutdown. Deliverability monitor. Address normalization + 20 tests. Camera race fix. Geocoding audit cron. Claim verify endpoint + page. NSFW detection. Cloudinary orphan cleanup. XP velocity admin page. D-006 "AI" → "Smart". API_RESPONSE_FORMAT.md. Post-session: settings.tsx TS fix, ipKeyGenerator rate limiter fix, Railway cache-bust, OAuth redirects updated, CCPA migration deployed.

---

### S666 — Meta-Audit + Comprehensive P0/P1 Sweep (COMPLETE — pushed)

28 gaps found by 4 meta-audit agents. Key discoveries: admin role regression (IDOR), isUnmanagedListing missing on 4 controllers, auction dual-winner race, settlement non-atomic, weekly email cron with placeholder string never firing. All fixed. 38 cron jobs wrapped with Sentry. 4 new rate limiters. OAuth age gate UI added.

---

## Next Session — S672

**FIRST ACTION: Restart Railway backend** to clear the in-memory rate limiter before testing anything.
Go to railway.app → your project → backend service → ⋮ menu → Restart.

**Then: verify OAuth login in incognito.**

**Patrick actions before S672:**
```powershell
cd C:\Users\desee\ClaudeProjects\FindaSale
git pull
git add claude_docs/STATE.md
git add claude_docs/patrick-dashboard.md
git commit -m "docs: S671 wrap — OAuth revert + S669 audit P0/P1 batch shipped via MCP"
.\push.ps1
```

**S672 priorities (in order):**

1. **P0 — Verify OAuth login works** after Railway restart clears rate limit. Test Google in incognito. If still broken, run full OAuth diagnostic (check Vercel function logs for `/api/oauth/callback/google`).

2. **OAuth diagnostic prep (if still broken):** Check: (a) Vercel env `NEXT_PUBLIC_API_URL` correct? (b) Railway backend `/auth/oauth` accepting OAuth payload? (c) Railway logs from NextAuth JWT callback?

3. **Remaining S669 audit item (not in the 16-file batch):**
   - P0: Product JSON-LD on `/items/[id]` pages — structured data still missing

4. **Add `MAILERLITE_ORGANIZERS_GROUP_ID`** env var in Railway (pending since S668)

5. **Chrome authenticated audit** (organizer dashboard, rapid capture, pricing funnel) — still in Unverified Queue
