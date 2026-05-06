# PROJECT STATE

FindA.Sale is a two-sided marketplace PWA for secondary sale organizers (estate sales, yard sales, auctions, flea markets, consignment) connecting them with shoppers. Backend: Node.js/Prisma/PostgreSQL on Railway. Frontend: Next.js on Vercel. Mobile: React Native (future).

## Current Status

**Latest: S667 — S666 Backlog Sweep: All 16 Meta-Audit Items Shipped (COMPLETE — pushed)**

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
| JWT cookie migration | Code shipped S667 but not Chrome-tested | Login in browser → verify cookies in DevTools Application tab (should see httpOnly accessToken) | S664/S667 |
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

## Recent Sessions (S663–S667)

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

### S663 — Fortune 1000 Pre-Launch Chrome QA + 9-File Fix Batch (COMPLETE)

Shopper Pickups tab, Cart 404, CAN-SPAM footers, hold-placed email, vaporware copy, TODOs cleaned.

---

## Next Session — S668 (Multi-Lens Product Audit)

**Mandate:** Four parallel auditors, each with a lens prior sessions have not covered. Dispatch all 4 simultaneously. Triage findings → dispatch P0/P1 fixes same session.

**Lens 1 — Sales psychology / CRO expert**
Walk all conversion flows (organizer signup, shopper discovery → hold/purchase). Audit: funnel drop-off points, friction, pricing anchors, scarcity signals, social proof, loss aversion language (ending-soon, limited inventory). Is XP a conversion lever or invisible? Deliverable: ranked gap list with specific copy/UI/flow fixes.

**Lens 2 — Game designer / player psychology**
Audit Explorer's Guild (XP, ranks, badges, Hunt Pass, leaderboard, crews) as someone who plays progression systems. Audit: XP curve shape across all rank tiers (does it flatten and lose players?), sink mechanics (XP expiry, rank resets — punishing or energizing?), Hunt Pass pay-to-win risk, crew mechanical purpose, known exploits or feel-bad moments. Deliverable: game design gaps grounded in player psychology research.

**Lens 3 — Organizer choosing software (competitive buy decision)**
Roleplay a professional organizer evaluating FindA.Sale vs EstateSales.NET, EstateSales.org, HiBid, Facebook Events. Walk organizer onboarding → sale creation → item upload → POS → settlement. Audit: clearest differentiator, obvious dealbreakers, pricing page clarity vs. competitors, what would make them switch vs. stay. Deliverable: competitive gap list + one-paragraph "why switch" pitch grounded in the actual product.

**Lens 4 — Recent session integrity audit (S662–S667)**
Re-audit the last 5 sessions' shipped features for: (a) S667 items — partially implemented or shipped with known gaps not flagged? (b) S666 28-gap list — did all 28 ship or did any fall through? (c) UNVERIFIED queue — anything now assessable with current context? Deliverable: list of anything claimed shipped but not actually complete.

**Session start checklist:**
1. Read STATE.md + `claude_docs/strategy/roadmap.md`
2. Verify Railway + Vercel green (check S667 post-session fixes landed)
3. Dispatch all 4 lenses in parallel (one Agent call per lens — do NOT use Skill tool for parallel work)
4. When all 4 return: triage by severity, dispatch dev fixes for P0/P1 immediately
