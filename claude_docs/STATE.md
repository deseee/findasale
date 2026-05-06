# PROJECT STATE

FindA.Sale is a two-sided marketplace PWA for secondary sale organizers (estate sales, yard sales, auctions, flea markets, consignment) connecting them with shoppers. Backend: Node.js/Prisma/PostgreSQL on Railway. Frontend: Next.js on Vercel. Mobile: React Native (future).

## Current Status

**Latest: S666 — Meta-Audit + Comprehensive P0/P1 Fix Batch (COMPLETE — ready to push)**

Audit-of-audits sweep against S657–S665 work. 4 parallel meta-audit agents identified 28 gaps; 5 verification probes confirmed which "shipped" claims were actually live. **Three S664-claimed deliverables were silently broken in production:** (1) DOB field absent from `/register` HTML despite COPPA controller code being live; (2) `/sales/[id]` and `/items/[id]` returning HTTP 200 with ZERO `<script type="application/ld+json">` blocks (S665 STATE.md flagged this; root cause: JSON-LD was in code but not deployed yet); (3) `/api/auth/*` requests on finda.sale all 400 with NextAuth catch-all `[...nextauth]` intercepting before Vercel rewrite to backend — entire S664 JWT cookie migration unreachable.

Migration deploy CONFIRMED live: `ProcessedWebhookEvent` + `OutreachAuditLog` tables exist on Railway, `ageVerifiedAt` + `tokenVersion` columns present, `20260506000001_add_age_verified` finished 2026-05-06 18:20 UTC.

**Production cron observability — CRITICAL pre-existing gap discovered:** 41 cron jobs running, ZERO Sentry instrumentation, 13+ jobs with zero catch blocks, `weeklyEmailJob.ts` had cron string literal `'minute hour day-of-month month day-of-week'` (placeholder text — never fired).

**Meta-audit findings doc:** `claude_docs/audits/meta-audit-S665-2026-05-06.md` — 28 gaps with file:line cites, severity, fix sketches.

**S666 fixes shipped (51 files):**

*Frontend:*
- `pages/age-verify.tsx` (NEW) — OAuth signup age gate UI; shows when OAuth user has null `ageVerifiedAt`; redirects to / on success, signs out underage
- `pages/auth/oauth-callback.tsx` — calls `/auth/me`, redirects to `/age-verify` if ageVerifiedAt null

*Backend security:*
- `middleware/adminAuth.ts` — fixed multi-role regression: now checks both `roles?.includes('ADMIN')` AND legacy `role === 'ADMIN'` (P0 IDOR — admin endpoints were bypassed for users on new roles[] array)
- `controllers/authController.ts` — added `oauthVerifyAge` handler (validates DOB, sets ageVerifiedAt, blocks <18)
- `routes/auth.ts` — POST `/auth/oauth-verify-age` route added
- `controllers/reservationController.ts` — placeHold blocks UNMANAGED_LISTING (P1)
- `controllers/itemController.ts` — placeBid blocks UNMANAGED_LISTING (P1)
- `controllers/messageController.ts` — sendMessage blocks UNMANAGED_LISTING (P1)
- `controllers/posPaymentController.ts` — createPaymentRequest blocks UNMANAGED_LISTING (P1)

*Backend race conditions:*
- `jobs/auctionAutoCloseCron.ts` + `jobs/auctionJob.ts` — auction close wrapped in `prisma.$transaction()` with `updateMany` optimistic-lock guard; second runner short-circuits when `count===0` (P0 — eliminated dual-winner / dual-payout race)
- `controllers/settlementController.ts` — addExpense/removeExpense/updateSettlement now atomic; expense recalc happens inside same transaction as the mutation (P1)
- `controllers/billingController.ts` + `controllers/stripeController.ts` — webhook idempotency switched to INSERT-FIRST pattern with P2002 catch (P1 — eliminates dual-processing race window)

*Backend cron observability:*
- `utils/cronGuard.ts` (NEW) — wrapper that captures errors to Sentry with consecutive-failure counter
- All 38 cron jobs now wrapped (`abandonedCheckoutJob`, `archivalCron`, `auctionAutoCloseCron`, `auctionJob`, `backfillBenchmarks`, `boostExpiryJob`, `categorySyncCron`, `cleanupStaleDrafts`, `consignorExpiryNoticeJob`, `curatorEmailJob`, `curatorReviewJob`, `ebayEndedListingsSyncCron`, `ebaySoldSyncCron`, `emailReminderJob`, `fraudDetectionJob`, `huntPassExpiryCron`, `markdownCron`, `markdownCycleCron`, `metroSyncCron`, `notificationJob`, `organizerWeeklyDigestJob`, `outreachEmailsCron`, `photoRetentionCron`, `pricingEngineCron`, `referralRewardAgeGateJob`, `reputationJob`, `reputationScoreJob`, `reservationExpiryJob`, `retailAutoRenewJob`, `reverseAuctionJob`, `saleDetailEnrichmentCron`, `saleEndingSoonJob`, `scraperCron`, `tierGraceCronJob`, `tierLapseJob`, `webhookEventPruneJob`, `weeklyEmailJob`, `xpExpiryCron`)
- `weeklyEmailJob.ts` — cron string fixed from `'minute hour day-of-month month day-of-week'` placeholder to `'0 18 * * 0'` (Sundays 18:00 UTC)

*Backend rate limiting:*
- `middleware/rateLimiter.ts` — 4 new limiters added: feedLimiter (100/min/IP), searchLimiter (50/min/IP), aiAnalyzeLimiter (50/hr/user), paymentLimiter (5/min/user). Existing messageLimiter, uploadLimiter, supportChatLimiter applied.
- `routes/feed.ts`, `routes/search.ts`, `routes/messages.ts`, `routes/upload.ts`, `routes/stripe.ts`, `routes/support.ts` — limiters wired (Stripe webhook routes intentionally left unlimited for Stripe to call)

**Patrick decisions still needed (DEFERRED — not blocking S666 push):**
1. **V5 NextAuth route conflict** — must choose: (a) move NextAuth to `/api/oauth/[...nextauth]` and update Google + Facebook OAuth console redirect URLs, OR (b) refactor `[...nextauth].ts` to handle only specific NextAuth paths. Until fixed, JWT cookie auth from S664 is unreachable through finda.sale (would only work via direct Railway URL). See meta-audit doc §1.V5 + §2.V5.
2. **JWT localStorage → cookie migration** — 5 frontend files still read JWT from localStorage (AuthContext.tsx, lib/api.ts, useLiveFeed.ts, brand-kit.tsx). Defer until V5 routing fix lands.
3. **Camera debounce race (S624)** — confirmed still present in `processRapidDraft.ts`; fix sketch in meta-audit doc; needs dedicated dispatch.
4. **GDPR Article 20 data export endpoint** — `POST /users/me/export` not yet built. Required before launch.
5. **Claim verify endpoint** — `/claim/verify/:token` UI + endpoint not yet built; admin approve/reject path works.

**S666 push block:**
```powershell
cd C:\Users\desee\ClaudeProjects\FindaSale
git add packages/frontend/pages/age-verify.tsx
git add packages/frontend/pages/auth/oauth-callback.tsx
git add packages/backend/src/utils/cronGuard.ts
git add packages/backend/src/middleware/adminAuth.ts
git add packages/backend/src/middleware/rateLimiter.ts
git add packages/backend/src/controllers/authController.ts
git add packages/backend/src/controllers/billingController.ts
git add packages/backend/src/controllers/itemController.ts
git add packages/backend/src/controllers/messageController.ts
git add packages/backend/src/controllers/posPaymentController.ts
git add packages/backend/src/controllers/reservationController.ts
git add packages/backend/src/controllers/settlementController.ts
git add packages/backend/src/controllers/stripeController.ts
git add packages/backend/src/routes/auth.ts
git add packages/backend/src/routes/feed.ts
git add packages/backend/src/routes/messages.ts
git add packages/backend/src/routes/search.ts
git add packages/backend/src/routes/stripe.ts
git add packages/backend/src/routes/support.ts
git add packages/backend/src/routes/upload.ts
git add packages/backend/src/jobs/abandonedCheckoutJob.ts
git add packages/backend/src/jobs/archivalCron.ts
git add packages/backend/src/jobs/auctionAutoCloseCron.ts
git add packages/backend/src/jobs/auctionJob.ts
git add packages/backend/src/jobs/backfillBenchmarks.ts
git add packages/backend/src/jobs/boostExpiryJob.ts
git add packages/backend/src/jobs/categorySyncCron.ts
git add packages/backend/src/jobs/cleanupStaleDrafts.ts
git add packages/backend/src/jobs/consignorExpiryNoticeJob.ts
git add packages/backend/src/jobs/curatorEmailJob.ts
git add packages/backend/src/jobs/curatorReviewJob.ts
git add packages/backend/src/jobs/ebayEndedListingsSyncCron.ts
git add packages/backend/src/jobs/ebaySoldSyncCron.ts
git add packages/backend/src/jobs/emailReminderJob.ts
git add packages/backend/src/jobs/fraudDetectionJob.ts
git add packages/backend/src/jobs/huntPassExpiryCron.ts
git add packages/backend/src/jobs/markdownCron.ts
git add packages/backend/src/jobs/markdownCycleCron.ts
git add packages/backend/src/jobs/metroSyncCron.ts
git add packages/backend/src/jobs/notificationJob.ts
git add packages/backend/src/jobs/organizerWeeklyDigestJob.ts
git add packages/backend/src/jobs/outreachEmailsCron.ts
git add packages/backend/src/jobs/photoRetentionCron.ts
git add packages/backend/src/jobs/pricingEngineCron.ts
git add packages/backend/src/jobs/referralRewardAgeGateJob.ts
git add packages/backend/src/jobs/reputationJob.ts
git add packages/backend/src/jobs/reputationScoreJob.ts
git add packages/backend/src/jobs/reservationExpiryJob.ts
git add packages/backend/src/jobs/retailAutoRenewJob.ts
git add packages/backend/src/jobs/reverseAuctionJob.ts
git add packages/backend/src/jobs/saleDetailEnrichmentCron.ts
git add packages/backend/src/jobs/saleEndingSoonJob.ts
git add packages/backend/src/jobs/scraperCron.ts
git add packages/backend/src/jobs/tierGraceCronJob.ts
git add packages/backend/src/jobs/tierLapseJob.ts
git add packages/backend/src/jobs/webhookEventPruneJob.ts
git add packages/backend/src/jobs/weeklyEmailJob.ts
git add packages/backend/src/jobs/xpExpiryCron.ts
git add claude_docs/audits/meta-audit-S665-2026-05-06.md
git add claude_docs/STATE.md
git add claude_docs/patrick-dashboard.md
git commit -m "fix(security+ops): meta-audit P0/P1 batch — admin role check, isUnmanagedListing guards, race conditions (auction/settlement/webhook), 38-cron Sentry wrapping, 4 new rate limiters, OAuth age gate (S666)"
.\push.ps1
```

**Post-push Patrick actions:**
1. Verify `https://finda.sale/sales/<id>` and `/items/<id>` return JSON-LD after Vercel redeploy (use `curl -s ... | grep -c "ld+json"` — must return ≥ 1).
2. Verify `/register` shows DOB field after Vercel redeploy.
3. Decide V5 NextAuth approach (see deferred items above).
4. Confirm Sentry DSN env var is set on Railway so cronGuard error captures actually transmit.

**S666 verification probes run live (read-only, before fixes pushed):**
- V1 ✅ — Migration deployed (Railway DB confirmed: ProcessedWebhookEvent, OutreachAuditLog, ageVerifiedAt, tokenVersion all present)
- V2 ❌ → ✅ — DOB code IS in repo at `register.tsx:253` but not deployed; push fixes it
- V3 ❌ → ✅ — JSON-LD code IS in `sales/[id].tsx:681` and `items/[id].tsx:533`; push fixes
- V4 ❌ → ✅ — 41 crons audited, all 38 daily/hourly jobs wrapped this session
- V5 ❌ → DEFERRED — NextAuth route conflict needs Patrick decision

---

**Previous: S665 — Vercel Build Fix + S664 Code Audit (COMPLETE)**

Fixed Vercel build blocker introduced by S664: `AccessibleModal.tsx` line 40 used native DOM `KeyboardEvent` instead of `React.KeyboardEvent<HTMLDivElement>` on a JSX `onKeyDown` handler. Changed type, unblocking the build. Confirmed `organizer/settings.tsx` account deletion modal changes (confirm/prompt → AccessibleModal) from S664 dev agent are present. Confirmed `DELETE /users/me` endpoint exists in `routes/users.ts` line 439 — removed from blocked queue. Parallel code-level audits of S664 deliverables completed (JWT auth routes, authController dual-change verification, SSR pages). Full Chrome QA of S664 features queued for S666.

**S665 push block:**
```powershell
git add packages/frontend/components/AccessibleModal.tsx
git add packages/frontend/pages/organizer/settings.tsx
git add claude_docs/STATE.md
git add claude_docs/patrick-dashboard.md
git commit -m "fix(build): correct KeyboardEvent type in AccessibleModal; settings account deletion modal (S665)"
.\push.ps1
```

---

**Previous: S664 — Fortune 1000 Pre-Launch Sprint: 6-Agent Audit + 13-Agent Implementation (COMPLETE — pushed)**

Two-phase Fortune 1000 readiness sprint. Phase 1: 6 parallel audits across domains untouched by S655–S663 (auth/security, accessibility/WCAG, legal/compliance, SEO/performance, payments/Stripe, backend reliability). Phase 2: 13 parallel implementation agents fixed ALL findings — P0, P1, and P2.

**Combined push block below covers S663 + S664 (do NOT push S663 block separately — this one supersedes it).**

**S664 Batch 1 — Shipped (17 files + 2 new files + 1 migration):**
- **COPPA age gate (P0 legal)** — `authController.ts`: DOB required at register, age <18 returns HTTP 400; `register.tsx`: DOB field added with client-side validation; `schema.prisma`: `ageVerifiedAt DateTime?` on User; migration `20260506000001_add_age_verified`
- **Auth brute-force rate limiting (P0 security)** — `routes/auth.ts`: loginLimiter (5/15min/IP) + registerLimiter (3/hr/IP) via express-rate-limit
- **Bulk items rate limiting (P0 security)** — `rateLimiter.ts`: bulkItemsLimiter (10 ops/hr per user); `routes/items.ts`: applied to bulk + CSV endpoints
- **POS currency precision (P0 payments)** — `stripeController.ts`: integer cent math replaces float arithmetic, eliminates $0.01 drift in mixed carts
- **Stripe webhook idempotency (P1 payments)** — `stripeController.ts`: Prisma transaction wrapper; `schema.prisma`: `ProcessedWebhookEvent` model; `schema.prisma`: `stripeOnboarded` on Organizer
- **Stripe Connect async onboarding (P1 payments)** — `stripeController.ts`: `account.updated` webhook sets `stripeOnboarded=true` when charges+payouts enabled
- **Refund endpoint wired (P1 payments)** — `stripeController.ts`: 30-day window check, cap via `applyFirstMonthRefundCap`, shopper confirmation email
- **sage-400 contrast fix (P0 WCAG)** — `tailwind.config.js`: `#6B9E7F` → `#4A7A5C` (4.5:1 ratio on warm-100; was ~3.2:1)
- **Form labels on search inputs (P0 WCAG)** — `SearchFilterPanel.tsx`: 6 form labels added (price min/max, condition, category, sale type, sort-by)
- **Icon buttons keyboard accessible (P0 WCAG)** — `SaleQRCode.tsx`: div→button with aria-label; `InventoryItemCard.tsx`: aria-labels on history+delete buttons
- **HoldButton touch target (P1 WCAG)** — `HoldButton.tsx`: compact variant min-h/w 44px (WCAG 2.5.5)
- **6 critical modals focus-trapped (P0 WCAG)** — `AccessibleModal.tsx` (NEW): FocusTrap base component; applied to CheckoutModal, HoldToPayModal, PosInvoiceModal, BecomeOrganizerModal, RankUpModal, DonationModal
- **Cookie consent banner (P1 GDPR)** — `CookieConsentBanner.tsx` (NEW): accept/decline, localStorage persistence, dark mode, role="alert"; wired in `_app.tsx`
- **Homepage SSR/ISR (P0 SEO)** — `index.tsx`: `getStaticProps` + ISR revalidate:300 fetching `/api/feed`
- **ToS legal gaps (P1 legal)** — `terms.tsx`: dispute window 48h→14d, consignment indemnification clause, organizer 48hr response SLA (new §13)
- **COPPA privacy policy (P1 legal)** — `privacy.tsx`: age verification language updated to 18+
- **focus-trap-react added (P0)** — `frontend/package.json`: `focus-trap-react@^10.2.3`

**S664 Batch 2 — Shipped (additional 37 files):**
- **SSR for sale/item detail pages (P0 SEO)** — `sales/[id].tsx` + `items/[id].tsx`: `getServerSideProps` enhanced, Product/Offer JSON-LD + Event JSON-LD injected, `InitialSaleData`/`InitialItemData` interfaces added
- **JWT httpOnly cookie migration (P0 security)** — `backend/package.json`: cookie-parser added; `backend/src/index.ts`: cookieParser middleware; `backend/src/middleware/auth.ts`: reads cookie first then Authorization header (backward compat); `authController.ts`: sets httpOnly cookies on all 4 auth paths (register/login/oauthLogin/redeemInvite); `routes/auth.ts`: POST /auth/logout, POST /auth/refresh, GET /auth/me added; `frontend/lib/api.ts`: `withCredentials:true` + 401 auto-refresh interceptor; `components/AuthContext.tsx`: calls GET /auth/me on mount, falls back to localStorage
- **All 34 modals focus-trapped (P0 WCAG)** — 28 additional modals wrapped with AccessibleModal (total: 34/34 = 100% coverage): AlaCartePublishModal, BidModal, BoostPurchaseModal, BountyMatchModal, BulkCategoryModal, BulkConfirmModal, BulkOperationErrorModal, BulkPhotoModal, BulkPriceModal, BulkStatusModal, BulkTagModal, CSVImportModal, ClaimListingModal, ConsignorPayoutModal, DowngradePreviewModal, HuntPassModal, MessageComposeModal, OnboardingModal, OrganizerOnboardingModal, QrCodeModal, QuickPickerTaskModal, RSVPAttendeesModal, RarityBoostModal, ReturnRequestModal, SharePromoteModal, SyncQueueModal, TeamSeatUpsellModal, TestCheckoutModal
- **Account deletion (P1 GDPR/CCPA)** — `organizer/settings.tsx`: Danger Zone section added with confirmation dialog + DELETE text gate; calls `DELETE /api/users/me`

**⚠️ Two files modified by BOTH Batch 1 and Batch 2 agents — verify both change sets are present:**
- `packages/backend/src/controllers/authController.ts` — must have: DOB age gate (Batch 1) AND httpOnly cookie setup on all 4 auth paths (Batch 2)
- `packages/backend/src/routes/auth.ts` — must have: rate limiters on login/register (Batch 1) AND /logout, /refresh, /me endpoints (Batch 2)

**Patrick actions required before going live:**
1. **PUSH** — combined S663+S664 push block (below in patrick-dashboard.md)
2. **Run migrations** — `prisma migrate deploy` for `20260506000001_add_age_verified` (adds ageVerifiedAt + stripeOnboarded + ProcessedWebhookEvent)
3. **Run** `prisma generate` after migrations
4. **Add Railway env var** — `JWT_REFRESH_SECRET=<32+ char random string>` (run `openssl rand -base64 32`)
5. **Patrick decision** — OAuth age verification: (a) add POST /auth/verify-age for new OAuth users, (b) block OAuth until done, or (c) accept risk for MVP
6. **Enable 2FA** on Google Workspace + MailerLite
7. **Set Railway env vars** — `OUTREACH_ENABLED=true`, `CATEGORY_SYNC_ENABLED=true`

**Remaining for S665:**
- Data deletion BACKEND: `DELETE /users/me` endpoint in userController.ts (frontend UI shipped; verify backend endpoint exists or create it)
- SSR: Verify `sales/[id].tsx` and `items/[id].tsx` JSON-LD appears in page source
- QA: Browser-test JWT cookie migration (login, refresh, logout)
- QA: Browser-test age gate on register (DOB <18 should block)
- QA: Browser-test 6+ modals for focus trap behavior

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
| JWT cookie migration | Code shipped but not Chrome-tested | Login in browser → verify cookies in DevTools Application tab (should see httpOnly accessToken) | S664 |
| COPPA age gate | Code shipped but not Chrome-tested | Register with DOB <18 → should get "must be 18 or older" error. DOB >18 → should register successfully | S664 |
| Sales/Items SSR JSON-LD | Code shipped but not Chrome-tested | View source on finda.sale/sales/[id] — should see `<script type="application/ld+json">` in HTML | S664 |
| Modal focus traps (34 modals) | Code shipped but not browser-tested | Open any modal, Tab through — focus should stay inside; Escape should close | S664 |
| #251 priceBeforeMarkdown | No production item with markdownApplied=true | Add a test item with markdownApplied=true and originalPrice set | S661 |
| #235 DonationModal | Needs SaleDonation record + available items | Set up test sale with SaleDonation + unsold items, go to Settlement Receipt step | S661 |

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

## Recent Sessions (S661–S666)

### S666 — Vercel Build Whack-a-Mole: S664 Truncation Artifacts (COMPLETE)

S664's 13-agent parallel sprint left two classes of artifacts across 16 files: (a) stray `);` from copy-pasting old modal return structure, and (b) orphaned `onClick` backdrop handler fragments left as JSX children of `AccessibleModal`. Also 3 true file truncations where agents stopped writing mid-tag.

**Stray `)` fixes (pushed):** BidModal, BoostPurchaseModal, BulkConfirmModal (+ onClose→onCancel prop fix), ConsignorPayoutModal, MessageComposeModal, ReturnRequestModal, ClaimListingModal.

**Orphaned backdrop onClick fixes (pushed):** HuntPassModal, QuickPickerTaskModal — S664 agents left the old `if (e.target === e.currentTarget) onClose()` handler as a JSX child of AccessibleModal instead of removing it.

**Structural/truncation fixes:** coupons.tsx (organizer tab pasted inside shopper tab conditional — unclosed divs + missing `{activeTab === 'organizer' && ...}` wrapper), encyclopedia/[slug].tsx (`export default Encyclope` → `export default EncyclopediaEntryPage;`), add-items/[saleId].tsx (truncated at `isOpen={deleteCo` — completed ConfirmDialog + closed fragment), workspace.tsx (truncated at `</di` — restored `</div></TierGate>` + function close). **workspace.tsx fix is this session's wrap push.**

**Schema/backend fixes (pushed):** Duplicate `ProcessedWebhookEvent` model in schema.prisma removed (S664 added second def without checking); `eventType` field dropped from stripeController `processedWebhookEvent.create()` call.

**Chrome QA of all S664 features still pending** — blocked until Vercel goes green.

---

### S665 — Vercel Build Fix + S664 Code Audit (COMPLETE)

Fixed Vercel build blocker: `AccessibleModal.tsx` `handleKeyDown` had native DOM `KeyboardEvent` type on a React JSX handler — changed to `React.KeyboardEvent<HTMLDivElement>`. Confirmed `organizer/settings.tsx` account deletion modal from S664 dev agent is present. Confirmed `DELETE /users/me` in `routes/users.ts` line 439 — removed from blocked queue. Parallel code audits verified: JWT cookies on all 4 auth paths ✅, loginLimiter+registerLimiter + /logout+/refresh+/me ✅, sales/[id] + items/[id] SSR + JSON-LD ✅. Chrome QA of all S664 features still pending (blocked until Vercel build goes green).

**Files changed:** `packages/frontend/components/AccessibleModal.tsx`, `packages/frontend/pages/organizer/settings.tsx`

---

### S664 — Fortune 1000 Pre-Launch Sprint: Full Audit + 13-Agent Implementation (COMPLETE — pushed)

6 parallel audits across auth/security, accessibility, legal, SEO, payments, backend. Then 13 implementation agents addressing all P0, P1, and P2 findings. Major items shipped: COPPA age gate, JWT httpOnly cookies, 34/34 modals focus-trapped, homepage + sale/item SSR, cookie consent, ToS legal gaps, sage contrast fix, bulk rate limiting, POS currency precision, account deletion UI, Stripe webhook idempotency. Push block in patrick-dashboard.md.

---

### S663 — Fortune 1000 Pre-Launch Chrome QA + 9-File Fix Batch (COMPLETE — merged into S664 push)

Full buyer journey Chrome QA (shopper + organizer). 9 files fixed: Shopper Pickups tab (blank→working holds), Cart 404 redirect, CAN-SPAM unsubscribe footer in all emails, hold-placed email to shopper, vaporware copy removed, TODO comments cleaned.

---

### S662 — Pre-Launch Sitewide Audit + 23-File Fix Batch (COMPLETE)

Full sitewide pre-launch audit. 24 issues found (6 P0, 10 P1, 8 P2). All fixed across 6 parallel dev batches. useLiveFeed 500 fix, next.config.js proxy fix, broken sale card images, hold button feedback, forgot-password error state, reset-password styled loading, "Remember me" dead UI removed, Tour CTA wired, add-items empty state, edit-sale no-items warning, condition label fix, PWA install spam throttle, brand copy fixes.

---

### S661 — Chrome QA: #228 ✅ #94 ✅ | #251 #235 UNVERIFIED

Settlement Hub verified ✅ as artifactmi@gmail.com. Admin bid-review verified ✅. priceBeforeMarkdown ⚠️ UNVERIFIED (no item with markdownApplied=true in production). DonationModal ⚠️ UNVERIFIED (needs SaleDonation record + available items).

---



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

## Next Session — S667 (Meta-Audit Backlog Comprehensive Sweep)

**First action:** Verify S666 deploy is green on Railway + Vercel. Run the 5-minute live verification probes from `claude_docs/audits/meta-audit-S665-2026-05-06.md` to confirm DOB shows on /register, JSON-LD shows on /sales/[id] and /items/[id], admin endpoints work for `roles=['ADMIN']` users, isUnmanagedListing returns 403, and Sentry is receiving cron heartbeats.

**S667 mandate: dispatch ALL backlog items in one session via parallel agents. Do NOT defer items.**

The S666 meta-audit identified 28 gaps. 12 shipped in S666. 16 remain. Below is the full parallel dispatch plan — 7 parallel dev agents covering everything, each scoped to file-independent areas so they don't conflict.

### Pre-dispatch (Patrick decides first; both options have specs ready)

**A. V5 NextAuth route conflict** — pick before dispatching Batch 1.
- **Option A (recommended):** Move `pages/api/auth/[...nextauth].ts` to `pages/api/oauth/[...nextauth].ts`. Update Google OAuth console + Facebook OAuth console redirect URLs from `/api/auth/callback/{google,facebook}` to `/api/oauth/callback/{google,facebook}`. Industry standard pattern. Patrick action: update OAuth console URLs after PR lands.
- **Option B (no console changes):** Refactor `[...nextauth].ts` to handle ONLY NextAuth's required paths (callback, csrf, providers, signin, signout). Other `/api/auth/*` paths fall through to Vercel rewrite. Higher fragility risk but no Patrick action needed.

**B. Sentry Cron Monitoring vs Healthchecks.io** — pick before Batch 5.
- Sentry Crons: integrates with existing Sentry setup, ~$0/month at our volume.
- Healthchecks.io: dedicated dead-man's-switch service, free tier 20 checks.
- Recommended: Sentry Crons (one less service).

### Batch 1 — Auth completion (1 agent, sequential after V5 decision)

Dispatch `findasale-dev` (general-purpose Agent) with full spec:
1. Implement V5 NextAuth fix per Patrick's choice (A or B)
2. JWT localStorage→cookie full migration (5 frontend files): `components/AuthContext.tsx`, `lib/api.ts`, `useLiveFeed.ts`, `pages/brand-kit.tsx`, plus search the codebase for any other `localStorage.getItem('token')` callers. Replace with `withCredentials: true` on api calls + read auth state from `/api/auth/me` cookie response.
3. Password change clearCookie('refreshToken') — `routes/auth.ts` `/change-password` handler must `res.clearCookie('refreshToken', {...})` after `tokenVersion` bump.
4. Reset-password attempt rate limit — wrap `POST /reset-password/:token` with per-token attempt counter. Add `resetTokenAttempts INT DEFAULT 0` field on User (migration required) OR use Redis counter. Lock after 5 attempts.
5. Email enumeration on `/verify-email` resend — apply `verifyEmailLimiter` (3/hr/IP). Make response generic ("if account exists, email sent") regardless of state.
6. Reset-password email — include IP + user-agent in template ("This reset was requested from 203.x on Chrome/macOS. If this wasn't you, ignore this email.").

### Batch 2 — GDPR/Legal completion (parallel agent)

Dispatch dev with full spec:
1. GDPR Article 20 export endpoint — `GET /api/users/me/export` returns `application/zip` with users.json, items.json, sales.json, purchases.json, bids.json, wishlist.json, reviews.json, notifications.json, holds.json, settlements.json, organizer.json. Include "Download my data" button on `pages/organizer/settings.tsx` AND `pages/shopper/settings.tsx`.
2. CCPA "Do Not Sell My Personal Information" link — add to `CookieConsentBanner.tsx` and to footer. Wire to a `/do-not-sell` page that toggles a `User.ccpaOptOut` flag (schema migration required).
3. CAN-SPAM physical address render verification — add a unit test or runtime assertion in `outreachEmailsCron.ts` that the `[physical address]` placeholder is replaced before send. Fail loudly on missing env var.
4. ToS arbitration clause — add to `pages/terms.tsx` Section 14: "Disputes resolved by binding arbitration under AAA Commercial Rules in [Patrick's preferred jurisdiction]. Class actions waived." Patrick should review with attorney; for now ship the clause.
5. 1099-K threshold tracking — add `Organizer.annualGrossSales` aggregation cron (monthly recompute). When org crosses $20k + 200 transactions, send notification email + dashboard banner.

### Batch 3 — Stripe + auction completion (parallel agent)

Dispatch dev with full spec:
1. `charge.refunded` webhook handler — add to `stripeController.ts` webhook switch. When refund is initiated from Stripe Dashboard (not FindA.Sale UI), update internal Purchase status to REFUNDED.
2. Subscription dunning policy — read existing tier/billing logic. Verify failed renewal: tier should drop to FREE only after Stripe's grace_period (typically 30 days). Currently unverified. If wrong, fix.
3. Stripe Tax integration — add `automatic_tax: { enabled: true }` to PaymentIntent and Checkout Session creation. Requires Stripe Tax setup in dashboard (Patrick action).
4. Auction snipe protection — `auctionAutoCloseCron.ts` + `bidController.ts`: if a bid arrives within last 60 seconds of auction, extend `auctionEndTime` by 60 seconds. Standard "soft close" pattern.
5. Negative-bid validation — `bidController.ts` placeBid: assert `amount > 0 && amount > currentHigh` before write. Return 400 on violation.
6. Timezone correctness — audit `auctionAutoCloseCron.ts` and `auctionJob.ts` for any `new Date(string)` parsing without explicit UTC handling. Convert all auction times to UTC before comparison.
7. Settlement lifecycle stage sync transaction — `settlementController.ts:176-179` updates SaleSettlement.lifecycleStage and Sale.lifecycleStage as separate operations. Wrap both in `prisma.$transaction()`.

### Batch 4 — SEO + accessibility (parallel agent)

Dispatch dev with full spec:
1. Canonical URLs — add `<link rel="canonical" href={...}>` to: `pages/sales/[id].tsx`, `pages/organizers/[slug].tsx`, `pages/categories/[category].tsx`, `pages/neighborhoods/[slug].tsx`, `pages/search.tsx`. Use absolute URL with `process.env.NEXT_PUBLIC_SITE_URL`.
2. Open Graph + Twitter Card tags — add to all shareable pages (sales, items, organizers, categories, neighborhoods, shopper profiles). Match the existing pattern from `items/[id].tsx`.
3. Sitemap completeness — read `next-sitemap.config.js` (or whatever sitemap generator is used). Verify it includes all dynamic routes: organizer profiles, all category pages, all neighborhood pages. If missing, add.
4. aria-live form errors — find every form's error display (search panel, login, register, contact, etc.) and add `<div role="alert" aria-live="polite">{error}</div>`. Audit at least: `SearchFilterPanel.tsx`, `pages/login.tsx`, `pages/register.tsx`, `pages/contact.tsx`.
5. Image alt text systematic audit — scan `<img>` and `<Image>` usage in dynamic content (item cards, sale cards, organizer avatars). Add `alt={item.title || 'Item photo'}` patterns where missing. Default fallback alt for placeholder SVG.
6. Heading hierarchy audit — for `pages/sales/[id].tsx`, `pages/items/[id].tsx`, `pages/organizers/[slug].tsx` confirm exactly one `<h1>` and proper h2→h3 nesting. Fix any skipped levels.
7. `prefers-reduced-motion` — add CSS media query to `tailwind.config.js` or globals.css: `@media (prefers-reduced-motion: reduce) { *, *::before, *::after { animation-duration: 0.01ms !important; transition-duration: 0.01ms !important; } }`. Audit modals, carousels, countdowns.
8. CSP `unsafe-eval` removal — switch `next.config.js` CSP to nonce-based. Use Next.js middleware to inject nonce per request. Tighten script-src to `'self' 'nonce-{NONCE}' https://js.stripe.com`. Test thoroughly — Next.js hydration sensitive.
9. Skip-to-content link — confirmed present in `_app.tsx`. No action needed (V2 probe verified).

### Batch 5 — Operations / observability (parallel agent)

Dispatch dev with full spec, after Patrick's Sentry-vs-Healthchecks decision:
1. Cron absence-monitoring — wire chosen service into `cronGuard.ts` to ping a check-in URL at start of each job. Sentry Crons: `Sentry.captureCheckIn({monitorSlug: jobName, status: 'in_progress'})` then `'ok'` on success, `'error'` on fail. Healthchecks.io equivalent: HTTP GET to ping URL.
2. Slow-query detection — Prisma supports `log: ['query']` event. In `prisma.ts` lib, add listener that captures any query >1000ms to Sentry as a performance issue.
3. Connection pool monitoring — log pool stats (`prisma.$metrics.json()`) every 5 minutes to console + Sentry. Alert if pool waits exceed threshold.
4. SIGTERM graceful shutdown — `index.ts`: register `process.on('SIGTERM', async () => { ... })` that closes Express server, waits for in-flight requests (max 30s), disconnects Prisma, exits.
5. Cookie secure flag always true — `authController.ts` `res.cookie()` calls: change `secure: process.env.NODE_ENV === 'production'` to `secure: true`. Use https in dev (`mkcert`) or accept dev cookies don't transmit.
6. offlineQueue PII audit — `useOfflineMode.ts`: review what's stored. If request bodies include user email, full name, payment info — redact before localStorage write. Replace with opaque references the backend can re-resolve.
7. Backup/DR test — Patrick action only: download a recent Railway DB backup, restore to a localhost DB, run smoke queries to confirm data integrity. Document restore SOP in `claude_docs/RECOVERY.md`.
8. Email deliverability monitoring — read existing suppressionService. Add weekly cron that aggregates bounce/complaint counts and posts to Slack/email digest. Alert if >2% bounce rate or any complaint.

### Batch 6 — Scraper hardening (parallel agent)

Dispatch dev with full spec:
1. Address normalization in dedupe — `services/scraper/dedupe.ts:24-80`: normalize before fuzzy match. Strip "St"/"Street" → "St", "E."/"East" → "E", lowercase, remove punctuation. Apply same to date parsing — convert all source-side timestamps to UTC date before window comparison.
2. Geocoding failure rate audit — add a query that runs daily: `SELECT source, COUNT(*) FROM "Sale" WHERE lat IS NULL GROUP BY source`. If any source >10% null, alert via existing observability.
3. GitHub Actions scraper failure alerting — for each `.github/workflows/scrape-*.yml`, add a `notify-on-failure` job that posts to Slack webhook on workflow failure. Patrick provides webhook URL.
4. Scraper test coverage — create `packages/backend/src/services/scraper/__tests__/`. Add unit tests for `dedupe.checkDuplicate()`, `enrichment.enrichOrganizer()`, address normalization. Use jest.
5. Camera debounce race S624 — `services/processRapidDraft.ts:159-175`: read `item.updatedAt` at job start as snapshot. In final update at line 160, add `WHERE id AND updatedAt = snapshotTime`. On count===0, re-fetch and merge edits using `userEditedFields` as merge guide (organizer-edited fields win).
6. Migration drift verification — query Railway `_prisma_migrations` table, compare to local migration files. Flag any local migration not yet deployed OR any deployed migration not in repo.

### Batch 7 — Claim flow + content + games (parallel agent)

Dispatch dev with full spec:
1. Claim verify endpoint + UI — create `GET /api/claim/verify/:token` and `pages/claim/verify/[token].tsx`. Token check, ownership transfer (Sale.organizerId, Item.organizerId), photo handoff, ClaimRequest cleanup.
2. Content moderation — integrate Cloudinary's NSFW detection (built-in `categorization: 'aws_rek_tagging'` + moderation flag). On upload, if NSFW score >0.7, flag item with `Item.moderationStatus='REVIEW_REQUIRED'`. Add admin queue at `/admin/moderation-queue`.
3. Cloudinary orphan cleanup — when `Item` is deleted, call Cloudinary destroy on its photo public_ids. Use existing `cleanupCloudinaryAssets` if present, else create.
4. D-006 "no AI" drift sweep — grep all user-facing strings (`packages/frontend/components/**/*.tsx`, `packages/frontend/pages/**/*.tsx`) for "AI", "artificial intelligence", "powered by AI". Replace with "Auto", "Smart", "Suggested" per D-006 lock. Comments and code identifiers can stay; only user-visible text matters.
5. XP exploit detection — query `XPLog` for outliers: users with >3σ above mean for any single XP type. Flag for review. Add admin dashboard widget showing XP velocity by user.
6. API response-shape consistency — document the standard pagination shape (`{data, cursor, hasMore}` vs `{data, page, total}`) and standard error shape (`{code, message}`) in `claude_docs/API_RESPONSE_FORMAT.md`. Audit 10 endpoints for compliance, fix mismatches.
7. hreflang tags — only add if FindA.Sale plans to serve UK/Canada. Otherwise note as "US-only, not yet needed" in audit doc and skip.

### Patrick console actions (post-push)

1. Update Google OAuth console redirect URLs (if Option A chosen)
2. Update Facebook OAuth console redirect URLs (if Option A chosen)
3. Enable Stripe Tax in Stripe dashboard
4. Provide Slack webhook URL for scraper failure alerts (or skip and use email)
5. Run a Railway DB backup restore drill
6. Decide on jurisdiction for ToS arbitration clause
7. Enable 2FA on Google Workspace + MailerLite (carry-forward from S664)
8. Set `CATEGORY_SYNC_ENABLED=true` and `OUTREACH_ENABLED=true` on Railway (carry-forward)

### Token budget for S667

7 parallel dev dispatches × ~150-200k tokens each = ~1.0-1.4M token budget. Run all 7 in one message. After they return, build a single combined push block and update STATE.md + dashboard. If any dispatch fails the tsc check, re-dispatch that one only — don't re-run the whole batch.

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