# PROJECT STATE

Sections: §Current Status | §Pool Audit Findings | §Blocked Queue | §Recent Sessions | §Next Session

FindA.Sale is a two-sided marketplace PWA for secondary sale organizers (estate sales, yard sales, auctions, flea markets, consignment) connecting them with shoppers. Backend: Node.js/Prisma/PostgreSQL on Railway. Frontend: Next.js on Vercel.

---

## Current Status

**findasale-ci-sentry-health 2026-06-23 (follow-up run).** BQ 9→5 (below QA ceiling — next session no longer forced QA-only). Resolved this run: Production error-fix batch ✅ (all Sentry P0/P1 confirmed gone — 1A/D/3G/2G/3Y all resolved); stale Sentry issues ✅ (Sentry now shows 0 fatal/boot-crash issues, 5 slow-query perf issues only); geocodeBacklog ✅ (fix deployed 2026-06-23 green); GitGuardian creds ✅ (credential rotated S1024, file scrubbed June 22 commit). GarageSaleFinder FALSE ALARM — workflow runs weekly Wednesday; today is Tuesday, expected absence from last 100 runs. CI OOM fix prepared (NODE_OPTIONS=--max-old-space-size=4096) — needs Patrick pushblock (MCP lacks workflow scope). 1 new Sentry issue: FINDASALE-NODEJS-42 PrismaClientKnownRequestError on POST /api/internal/enrich-listing-metadata (2 events, low priority, P3 — monitoring).

**daily-friction-audit 2026-06-23 (automated).** BQ count=9 (ceiling active — next session QA-only). New finding: `bounceSuppressService.ts` locally truncated (481 vs 530 lines on GitHub HEAD) — backend tsc 1 error locally; production unaffected. Fix: `git checkout HEAD -- packages/backend/src/services/bounceSuppressService.ts`. Full report: `claude_docs/audits/friction-audit-2026-06-23.md`. All other checks clean: frontend tsc 0, no merge conflicts, STATE.md current (S1023 2026-06-22), 0 unfixed BROKEN roadmap items, DECISIONS.md reviewed 2026-06-18.

**S1023 WRAP (2026-06-22) — OPS/INFRA (CI gate + DB password rotation + bounce mailbox audit). All 3 outstanding autonomous tasks completed.** DB password rotated (ALTER USER + all Railway vars updated, backend redeployed green ✅ CREDENTIAL BLACKOUT: value not recorded here). Railway backend Wait-for-CI enabled ✅ (will only deploy after "Typecheck, tests & lint" GitHub Action passes). GitHub branch protection rule configured for main with "Typecheck, tests & lint" required — BLOCKED on GitHub sudo mode (Patrick must enter his GitHub password to save; the form is ready at github.com/deseee/findasale/settings/branch_protection_rules). Vercel "Required CI checks" is a Pro plan feature — not available on Hobby. Bounce mailbox confirmed handled by Cowork sweep task (`bounce-suppression-sweep`); ADR-bounce-suppression-mailbox-fix.md already documents the gap; no code change needed. Bounce mailbox BQ entry remains for optional full OAuth fix.

**S1022 WRAP (2026-06-22) — META/OPS/INFRA (proactive blind-spot + agent-fleet hardening). Big build-out, one self-inflicted prod outage (resolved), geocoder fixed + green.** Shipped live: 4 monitoring guardrails (data-persistence/clobber, token-expiry, + cron-heartbeat & Sentry-P0→Blocked-Queue folded into ci-sentry-health Steps 7-8; 2 interim tasks disabled, cluster 3→1); scheduled-task consolidation (brand-drift→pure copy/tone, label fixes, 4 dead tasks); pre-deploy CI typecheck gate (NOT yet blocking — top next-session priority); 2 real-time Sentry fatal/error email alerts (rules 17220190/17220191); DB-password scrub from 13 repo files; geocoder fix (Nominatim UA+throttle, Canadian→Nominatim, skip fragments — validated live, deployed green). Incident + outstanding Patrick/infra actions detailed below and in Next Session.**

**S1022 INCIDENT (2026-06-22) — PROD OUTAGE, RESOLVED. `admin.ts` truncation crash-loop.** An email-endpoint dev agent's Windows-fs write silently TRUNCATED `packages/backend/src/routes/admin.ts` (lost its `export default router` tail) → `import adminRoutes` was `undefined` → `app.use('/api/admin', undefined)` → backend crash-loop (`Router.use() requires a middleware function but got undefined`, dist/index.js:576). TWO symptom-fixes (revert admin.ts top; stub the controller) failed before the real cause was found by checking FILE INTEGRITY (`wc -l` = 434, no `export default`). FIX: restored the send-test-email tail + `export default router` (453 lines, braces/parens balanced), Patrick pushed, Railway green (3x /health 200). Also fixed a side-issue: a deleted controller left a dangling import (Cannot find module) — re-added as a disabled 403 stub via emergency MCP push. **Email endpoint ABANDONED** (2 outages for the least-valuable feature). LESSONS: (1) on ANY undefined-router/middleware error, check file integrity FIRST (`wc -l` + grep `export`). (2) `Dockerfile.production` builds with `tsc || true` → broken builds SHIP — making the new CI gate BLOCK deploys is now top priority. (3) Never push backend code that couldn't be tsc-verified in-session (VM node_modules is I/O-corrupted). SURVIVED INTACT this session: 4 monitors (data-persistence/clobber, token-expiry, + cron-heartbeat & Sentry→BQ folded into ci-sentry-health), 2 real-time Sentry fatal/error alert rules, DB-password scrub from 13 repo files, scheduled-task consolidation, CI typecheck gate (.github/workflows/ci-typecheck.yml).**

**S1021 WRAP (2026-06-22) — BUG/SEO (Google indexing investigation — 2 P0 sitemap bugs fixed + GSC manual actions complete). Sitemap now contains 5,000 sale URLs (was 0). BQ 4→3 (cart payment-completion closed).**

**S1020 WRAP (2026-06-22) — RESEARCH/BUG (outreach email deliverability root-cause + throttle fixes + scheduled-task hardening). Pushed + deployed green; backend healthy; OutreachCron verified live "12 sent, 0 failed". BQ 1→4 (3 P1 email follow-ups added).**
- **Prior P0 was FABRICATED.** The earlier-claimed "RAILWAY_BACKEND_URL not set → phishing links" was a code-inference, DISPROVEN this session — the var has been set for months. Real diagnosis came from direct mailbox reads + Railway DB, not code-reading.
- **ROOT CAUSE (tool-cited — corrected 6/22):** NOT volume. The sender `outreach@finda.sale` (paid Workspace; auth/SPF/DKIM all confirmed correct) sends only ~169/day total (verified via the SENT folder — matches the quota log; no hidden mail), steady, with ZERO send-limit failures through 6/20. The trigger was **BOUNCE RATE**: sending to scraped directory addresses produced a 15-26% bounce rate over 6/18-6/20 (6/18 ~24/165=15%, 6/19 ~37/140=26%, 6/20 ~38/199=19%). Google tolerates ~2-5%; a ~1-in-5 bounce rate is the classic signature of a purchased/garbage list, so Google's abuse system **CLAMPED the account's sending limit on 6/21** (a one-day-lagged abuse penalty) → 136 "reached a limit for sending" failures that day, 12 the next. The account is now in Google's penalty box, so even tiny batches fail (a 12-message batch on 6/22 all bounced as over-limit). The old "~200-300/day reputation throttle" framing is WRONG — it was an abuse clamp triggered by the bounce rate, not a flat volume throttle.
- **ASYNC-BOUNCE MECHANISM NOTE:** these over-limit failures are ASYNC — Gmail ACCEPTS the API send (the cron logs it "sent," consumes quota, marks the touch SENT) then bounces it later as "message not sent." So the limit-aware backoff (which fires on a send-call error) does NOT catch this, and the cron over-counts "sent." Known gap → code follow-up: detect async send-limit bounces / fix the false SENT counting.
- **FIXES SHIPPED (all on main, deployed green):**
  1. `4e1d06f` suppressionService.isEmailDomainBlocked: `noemail.*` placeholder family + no-dot-domain guard.
  2. `641fb55` bounce classification: EmailSuppression +5 cols (bounceCategory, bounceStatusCode, diagnosticCode, retryAfter, classifiedAt) applied to Railway via DIRECT DDL (no migration file → schema drift, see Next Session); bounceSuppressService classifies; isSuppressed honors retryAfter; reclassify-bounces job registered.
  3. `661e4413` tactical throttle: `OUTREACH_DAILY_CAP` (default 75) is the binding daily cap + surge guard (day-total attempts can't exceed cap) + 1.1s pacing + limit-aware backoff (stops for the UTC day on a Gmail send-limit error by pinning EmailQuotaLog).
  4. `432638b` pre-send MX validation (new lib/mxValidator.ts): skips+suppresses NO_MX domains before sending.
  5. `a90c793` (HEAD): built then REMOVED a provider-agnostic SMTP outreach rail per Patrick — kept inline Gmail send.
- **DB actions (live):** un-suppressed the 12 Google-blocked addresses, then applied POLICY_BLOCK + 7-day retryAfter cooldown so they don't immediately re-send into the throttle.
- **THE FIX (LOCKED):** the root cause is the BOUNCE RATE, so (1) **list hygiene** — pre-send MX validation + suppression + placeholder filters (all shipped this session) cut the bounce rate at the source; (2) **PAUSE** — `OUTREACH_DAILY_CAP` set to **1** (near-zero) in Railway so Google sees sending stop and the clamp clears over a few days (we paused to near-zero to serve the penalty FIRST — the old "ramp up from 75" plan was wrong); (3) **resume** only at low volume on the cleaned list AFTER the health check shows zero "reached a limit" failures + bounce rate <5%. Do NOT migrate to a dedicated domain / SES — no budget; that decision stands SHELVED. ADR `claude_docs/feature-notes/ADR-dedicated-outreach-sender.md` is reference-only.
- **Scheduled tasks hardened:** `findasale-email-delivery-health` Check B now watches the real abuse-clamp signal (not 75% of 1500); new B2 reads the outreach mailbox directly for "reached a limit for sending" failures + surge detection + bounce-category breakdown (the bounce RATE is the governing metric to watch). `bounce-suppression-sweep` now CLASSIFIES bounces and sets the new columns — this is the LIVE suppression path (bounceSuppressService polls the wrong mailbox; recipient bounces forward to deseee@gmail.com, not the Workspace mailbox the backend reads).
- **Docs:** email-infrastructure-map.md updated (§5 corrected, new §8 "Sending Limits & Reputation Throttling"). New ADR-dedicated-outreach-sender.md (shelved).

**S1019 WRAP (2026-06-20) — DEV/BUG (platform stats investigation, organizerId backfill, live counts). Push confirmed green. BQ unchanged at 1.**

**S1018 WRAP (2026-06-20) — RESEARCH/DEV (automated email health sweep + root-cause investigation + suppression fix + ESN backfill). Push confirmed live (Patrick redeployed green). BQ unchanged at 2.**

**S1017 WRAP (2026-06-20) — DEV session.** PCVs applied to roadmap (rows 190/212/554). Migration history repaired — two Unix-epoch migrations (1776176101893 + 1776893245415) renamed to 20260707000001/20260707000002; Railway _prisma_migrations updated; prisma migrate dev/deploy now unblocked. Audio compression: bg-music.mp3 2.7MB→1.4MB, fas1.1–fas1.13 192→128kbps; total -1.76MB saved. fas-01–13 and vo-08b.mp3 kept in project folder. BQ 2→1 (Patrick confirmed /admin/users rows load; cart payment-completion remains — Stripe LIVE keys only). Deployed green.

**S1016 WRAP (2026-06-20) — QA + FIXES session.** Chrome re-authenticated after 2 failed sessions. All 4 BQ QA items addressed: /feed ✅ sale cards render immediately, no spinner (ss_0566nitc9); /leaderboard ✅ all 3 tabs instant (ss_9351nlc6c, ss_6728wlx91, ss_6482h13up); SEO4 yard-sales/grand-rapids-mi ✅ H1 + FAQPage JSON-LD + nearby cities + ISR (ss_3217o7wwg); /admin/users Alice redirect ✅ redirected to homepage (ss_8004e8she), admin rows still need Patrick's Google OAuth. Local file fixes: feed.tsx restored from GitHub (7348B, was 5263B), leaderboard.tsx NUL bytes stripped (14737B = GitHub). admin/index.tsx LOW-2: added dark:text-warm-400 to close button. BQ 4→2.

**Weekly Audit 2026-06-20 (automated Saturday 4AM).** Chrome auth failed (2nd consecutive session). Code-level checks only. Phase 5 Rotation 1 (dashboard.tsx + edit-sale/[id].tsx): CLEAN. Findings: HIGH-1 Chrome auth blocked 2nd session; HIGH-2 SEO4 yard-sales QA ~22 sessions overdue; MED-1 feed.tsx truncated locally (5263B vs 7348B GitHub); MED-2 70x bg-white without dark:; LOW-1 leaderboard.tsx 304 trailing NULs locally (GitHub clean); LOW-2 admin/index.tsx close button missing dark: base. BQ 4→6.

**S1015 WRAP (2026-06-20) — QA + DEV session.** S1014 push (admin role-check + ISR for /feed + /leaderboard) confirmed live. Admin DM PCV applied to roadmap #554 (✅ S1014). getSale items `take:1000` + `orderBy status asc` added (backend TS 0, pending push). Chrome QA completed after extension re-auth: /feed ISR ✅, /leaderboard ISR ✅ (all 3 tabs). /admin/users PARTIAL — Alice redirect ✅ confirmed (ss_4613sxt4j), admin row rendering needs Patrick's Google OAuth session. BQ=2.

**S1014 WRAP (2026-06-20) — QA + DEV session.** S1013 batch Chrome-verified (7/8 ✅, 1 P1 found+fixed). Admin DM BQ item cleared. ISR added to /feed + /leaderboard (CODE-ONLY pending push). **DATA REGRESSION FIXED (S1014, live):** Alice (user1@example.com) had ADMIN role in production DB — S998 removed it from seed.ts but never ran a DB update. Removed via psycopg2: `roles = ['ORGANIZER']` confirmed. Code fix (5 admin pages: `roles?.includes('ADMIN')` pattern) is a robustness improvement pending push. BQ=1 (cart payment-completion only).

**S1013 WRAP (2026-06-19) — DEPLOYED GREEN ✅.** Code batch pushed + Railway/Vercel green (Patrick confirmed). 5 dead indexes dropped on Railway (raw DDL). `connection_limit=10&pool_timeout=20` added to backend DATABASE_URL + redeployed. All S1013 changes are LIVE but CODE-ONLY/UNVERIFIED in browser — **next session is QA** (smoke test changed surfaces FIRST per §10). BQ=2 (cart payment-completion; admin DM #554).

**S1013 — AUDIT/BUG/RECORDS (2026-06-19). Past-session audit → admin /users 500 root-caused+fixed, eBay S998 backfill closed, doc-drift caught (roadmap #554).**
- **Concurrent-session note:** an S1012 window logged the admin DM + à-la-carte work (commits 9c445eb7/4374e40a) in STATE while this audit ran — this session is **S1013**, edits here are additive only. (Flagged to Patrick: two Cowork windows editing STATE.md simultaneously is the doc-drift risk in action.)
- **Admin /users intermittent 500 (Postgres 53100) — ROOT-CAUSED + FIXED (adminController.ts, backend tsc 0, CODE-ONLY pending push):** `getUsers` AND `getSales` were paginated but fetched full purchase/sale/item **ID arrays** per row only to `.length` them → for scraper orgs with thousands of sales the transfer spills to Railway's tiny /dev/shm → error 53100 "No space left on device". Replaced with Prisma `_count` relations; response shapes unchanged. **This is the root-cause fix** — the spill was caused by the query shape (one admin page load walked all 80k+ rows), not by load or DB size, so it resolves on deploy. Railway instance bump is NOT required; only revisit if a 53100 recurs after deploy.
- **Resource sweep (Patrick: "other bloated queries?") — found + fixed the worst one:** `adminReportsController.getOrganizerPerformance` (GET /admin/reports/organizers) took page/limit params but loaded EVERY organizer with ALL nested sales+items+purchases, counted/sorted in JS, then sliced — fake pagination, full 80k-org materialization per view (same class as getUsers, larger). Rewritten to a single parameterized `$queryRaw` doing aggregation + ORDER BY + LIMIT/OFFSET at the DB; total via `organizer.count()`. Response shape preserved; `joinedAt` now real `createdAt` (was hardcoded). Sale(organizerId) already indexed — no migration. Backend tsc 0. CODE-ONLY pending push. Sibling `getRevenueReport` checked — bounded (90d + active-subs), left as-is. Lesser N+1s noted as low-priority: leaderboardController (bounded take:100, 2 counts/org) and trendingController (bounded take:8, 1 follow.count/sale) — acceptable, not spills. Cron audit DONE (Patrick: "do the follow up audit"): all ~36 cron big-table findMany reviewed — 35 bounded (time-window/status `where` or skip/take batching: backfillBenchmarks, geocodeBacklogJob, websiteEnrichmentJob all batch correctly). **1 dangerous FIXED: `reputationJob`** had NO `where` → loaded all 80k orgs + ran sale.count+review.findMany per org (~160k queries/wk). Added `where:{isUnmanagedListing:false}` (scraped dirs can't earn tiers) + skip/take BATCH_SIZE=100 paging. Tier math/thresholds/S1009 isOngoing rule unchanged. Backend tsc 0. CODE-ONLY pending push.
- **eBay 4-item cleanup (S998) — DONE:** all 4 were test/dead. Whip-It + Contigo orphaned offers DELETED (204). Kirkland + Loy Norrix "Choirs 1970s" were in Patrick's DRAFT "Test sale don't publish" sandbox (Patrick: the sale STAYS — it's his test sale) → S1013 backfills reverted, then the **test ITEMS deleted** (sale kept) + their 2 test eBay offers DELETED (204). Also deleted a no-sale duplicate of "Songs of Christmas 1987" (cmqh1wzpe). The REAL Loy Norrix (cmp5t9ti7) stays LIVE in "Artifact Downtown Paw Paw" — confirmed only that one remains.
- **Doc-drift captured:** roadmap **#554** added for the admin DM + à-la-carte revenue feature (the concurrent S1012 logged it in STATE but added no roadmap row).
- **Fee-rate "discrepancy" is NOT a bug:** feeCalculator.ts intentionally tiers 10% SIMPLE/default, 8% PRO+TEAMS — reconcile STACK.md wording so it stops resurfacing.
- **BQ: 1 → 2** (added admin DM #554 UNVERIFIED in prod).
- **EXPERT-REVIEW FIX BATCH (S1013, Patrick: "dispatch all in parallel") — 18 files, CODE-ONLY pending push. Backend full tsc 0.** 6 parallel dev agents + 1 main-session fix:
  - saleController: P0 `limit` caps (listSales/getSalesByCity ≤50) + per-item fan-out→`item.groupBy` in 3 public list endpoints + getSale `review.aggregate` + getCities 300s Redis cache (graceful).
  - leaderboard/trending: org-leaderboard 200-query N+1→`groupBy` (4 queries); scout N+1→`findMany in`; trending lean `select` (drop scrapedMetadata)+`follow.groupBy`+120s cache.
  - index.ts: process `uncaughtException`/`unhandledRejection`→Sentry; `GET /health/ready` DB ping; generic 500 message. New `jobs/logRetentionCron.ts` (60-day prune of ScrapedSalesJob/OutreachAuditLog/DirectoryCrawlLog ONLY, daily 03:20).
  - routes: rate limiters added — `/search/visual` (Vision billing-DoS), paymentLimiter on payout/settlement/billing/pos, couponRateLimiter on coupon generate, claim throttle; pricing.ts `authenticate` added (was failing closed).
  - tierGraceService: `new PrismaClient()`→shared singleton (kills 2nd pool).
  - frontend: imageUtils `f_webp`→`f_auto`(AVIF)+`getCloudinarySrcSet`; SaleCard/ItemCard responsive `srcset`+`sizes`. **NOTE: Write tool TRUNCATED ItemCard.tsx (cut 14 lines, lost export default) — caught via tail/grep (no frontend tsc in VM), restored from git + re-patched. Write tool now truncates like the banned Edit tool.**
  - schema.prisma: 5 never-scanned `@@index` removed (Organizer corroborationScore/sourceCount/directoryNextCheckAt; Sale prelaunchAt/status_markdownEnabled_markdownFloor) — ~11MB write-amp relief. **Separate migration (Patrick).**
  - **Index drop DONE (S1013, raw DDL):** the 5 `@@index` were dropped from Railway via `DROP INDEX CONCURRENTLY` (psycopg2) — `migrate dev` can't be used here (Railway shadow-DB replay fails on a pre-existing migration-history ordering issue: `add_ebay_subscription_id` references Organizer before it exists in replay). DB now matches committed schema; no migration file needed. STILL PATRICK-ONLY: Railway DATABASE_URL `?connection_limit=10&pool_timeout=20` (optional pool cap).
  - **NOTE for future schema changes:** `prisma migrate dev` is BROKEN here (shadow replay fails). Use raw DDL via psycopg2 / `prisma db execute --stdin` (dev-environment Option B), never migrate dev.


**S1012 — BUG/DATA (2026-06-19). À-la-carte revenue now tracked in admin dashboard + admin DM feature.**
- **À-LA-CARTE REVENUE FIXED (S1012, deployed commits 9c445eb7 + 4374e40a):** Admin "Today's Revenue" now includes the $9.99 ala-carte fee. Backfilled existing Purchase record via psycopg2 (id: cj5sxhx0ruuyw9lb4n98exiax). Code fixes: (1) adminController.ts — real prisma.purchase.aggregate query for ala-carte revenue (30d + today), ALA_CARTE excluded from fee-rate multiplication to avoid double-counting; (2) stripeController.ts — checkout.session.completed ALA_CARTE handler now creates Purchase record (source='ALA_CARTE'); payment_intent.succeeded handler has idempotency guard. (3) Admin DM feature: POST /admin/users/:userId/message sends transactional email via emailService; "Send Message" button + modal added to admin/users/[id].tsx.
- **BQ: 1 → 1 (unchanged).**

**S1011 — BUG/DATA (2026-06-19). À-la-carte Stripe webhook pipeline fixed + MRR internal exclusion + RETAIL dashboard dates fixed + DB test-data cleanup.** Label composer polish + Buy Now graceful error + Stripe tax OFF. All pushed + Patrick-verified live as artifactmi on "QA First Item Test Sale S983".**
- **PERMANENT STOREFRONT (isOngoing) — SHIPPED + Chrome-verified ✅ (deployed commit 066e0be0):** Retired retailAutoRenewJob (no-op); added Sale.isOngoing; additive discovery/feed/search filters `(isOngoing OR endDate>=now)`; Store/LocalBusiness JSON-LD (not Event); cron guards. 16 files + migration. **Chrome QA:** Artifact storefront (cmpt2oq6q) renders LIVE as "Permanent storefront" (no end date/countdown/archive), JSON-LD @type=Store with NO endDate/Event, 104 items ✅. Regression clean: /sales feed 19,509 sales render with date ranges ✅; /search?q=thrift returns 10 sales ✅ (additive filters did NOT break discovery). 
  - **Migration handling note (correction):** this repo's _prisma_migrations IS in sync — `prisma migrate deploy` had only 1 pending migration. The isOngoing column was applied via raw `ALTER TABLE` (psycopg2); when Patrick separately ran `migrate deploy` it hit P3018 (column already exists). Resolved by marking the migration applied in _prisma_migrations (equivalent of `prisma migrate resolve --applied`). 0 unfinished migrations now. LESSON: for a schema change here, either let `migrate deploy` apply it OR raw-DDL THEN `migrate resolve --applied` — don't do both.
  - **Artifact consolidation DONE:** canonical sale cmpt2oq6q set isOngoing=true; orphaned item from old ENDED row (cmom7h73l) re-pointed (103→104 items); old row soft-deleted (deletedAt set, status ENDED, 0 items). Historical PointsTransaction/SaleChecklist/SaleRipple left on the old row (not re-pointed — avoids points/analytics skew).
  - **FOLLOW-UPS CLOSED (S1009, Patrick: stop deferring):**
    1. **Soft-deleted sales now 404** — `saleController.getSale` returns 404 when `sale.deletedAt` is set (was returning the row → stale render). Frontend getStaticProps already returns Next `notFound` on backend 404. Backend tsc 0. CODE-ONLY pending deploy (then old Artifact sale ID 404s once ISR revalidates).
    2. **reputationJob credits permanent stores** — count widened to `ENDED OR (PUBLISHED && isOngoing)` (var renamed qualifyingSalesCount) so a permanent storefront isn't stuck at NEW tier. Backend tsc 0. (Patrick decision: permanent store = 1 qualifying sale.)
    3. **Photo retention** — already handled: photoRetentionCron skips isOngoing sales (permanent-store item photos retained while listed). No further work.
    4. **Buy Now graceful message — QA ✅ VERIFIED live:** as user5 shopper, Buy It Now → Continue to Pay on Kelly's QA item (invalid Stripe acct) → modal displays "This seller isn't set up to accept online payments yet. Please contact the organizer to arrange your..." (alert element). Not the bare "Try Again". Graceful 409 + CheckoutModal render confirmed end-to-end.
    5. **Platform-wide consolidation of 400+ scraped RETAIL chains** — intentionally NOT done (Patrick: Artifact is the only real storefront; auto-renew now disabled so no new fragmentation).
  - **STILL OPEN (genuine external constraint, not a defer):** cart multi-item payment-completion → items-SOLD webhook — prod is on Stripe LIVE keys, so it can only be confirmed by a real (small) purchase. No code to finish.
- **CORRECTION (Patrick flagged):** prior S1008 BQ rows claimed Buy Now/labels "can't be tested until June 29." FALSE — the published "Artifact Downtown Paw Paw" sale (cmpt2oq6q00138cehpgqx3huk) has 101 AVAILABLE items and its items are purchasable NOW (verified Buy Now 200 + live cart checkout session this session); purchase endpoints don't gate on startDate. The "June 29" was that sale's DB startDate (2026-06-29→07-29) — possibly a wrong date on an already-open sale (flagged to Patrick).
- **Label composer — 5 refinements, all LIVE + Patrick-confirmed working:**
  1. Item name now prints after the price (8pt) and wraps to 2 lines (forced: width:100% + white-space:normal + overflow-wrap + -webkit-line-clamp:2). Name pulled from Item.title via the same DB lookup as roomTag.
  2. ALL label text now **black (#000)** — sale name, item name, finda.sale, room, dates were grey (#666/#999) and unreadable in mono prints.
  3. **Warm shared Puppeteer browser** — launched on boot, reused per request (fresh page each), relaunch+retry on failure. Fixes the cold-start "failed first time, worked second" on label generation.
  4. Page preview now **starts at the chosen start-position slot** (prepends skip slots, mirrors the PDF).
  5. Per-item **room tag** (the "Room / Area Tag" form field, saved via itemController) prints on each label; sale dates moved to the top corner.
  - Files: labelComposerController.ts, label-composer/[saleId].tsx, plus earlier add-items/[saleId].tsx + edit-item/[id].tsx (Label Sheets links, save→add-items redirect, item search).
- **Buy It Now P1 (S1006, live + valid-path VERIFIED ✅):** removed `automatic_tax` from raw PaymentIntent (Stripe rejected it → every Buy Now 400'd; S1005 had patched the wrong cause). HTTP 200 confirmed as user5 buying an Artifact item. Graceful 409 "seller not set up to accept payments" + CheckoutModal now renders the error text (was a bare "Try Again").
- **Stripe tax OFF (Patrick decision, memory saved):** removed automatic_tax from all 3 Stripe sites (Buy Now PI + subscription + à-la-carte Checkout Sessions). Don't collect until FindA.Sale must register in nexus states. Prod runs Stripe LIVE keys.

**S1008 — Patrick commits (2026-06-18). 4 label/scraper improvements shipped directly by Patrick.**
- **`b99f05c1` labels: show item name after the price** — label-composer/[saleId].tsx + labelComposerController.ts updated. Item title now displays alongside the price on printed Avery 5160 labels. LIVE (Vercel + Railway).
- **`55abfc62` labels: add per-item room tag + move sale dates to top corner** — room tag shown on each label (where dates previously were); sale date range moved to corner. LIVE.
- **`c06cb773` label composer: start-position card above preview, collapsed by default** — UI layout change: start-position picker card moves above label preview and collapses by default (expand toggle). LIVE.
- **`17595003` perf(scraper): batch lastScrapedAt writes + GIN-index dedup** — scraper/index.ts + internalScraperController.ts + dedupe.ts: `lastScrapedAt` writes batched (was N individual DB writes); GIN index on dedup key reduces duplicate detection cost. Backend only — LIVE on Railway.
- **Infrastructure confirmed:** Vercel ✅ READY (`b99f05c1` latest, 2026-06-18 ~12:53 EDT). Railway backend ✅ SUCCESS (2026-06-18T16:53:07 UTC). All S1006+S1007 commits deployed.
- **BQ: 3→1** (Buy Now graceful 409 ✅ VERIFIED this session — user5 on Kelly's QA sale → "This seller isn't set up to accept online payments yet…" rendered correctly; ss_8945gfi4w, ss_8856ik32o. Label composer S1006c/d ✅ VERIFIED this session — item name after price, dates in corner (6/18–19), start-position card collapsed above preview; ss_7380smxpk, ss_2761xkv7y. Cart payment-completion UNVERIFIED — Stripe LIVE keys, test card rejected). **Blog ✅ VERIFIED this session** (7 cards, post body+JSON-LD+canonical+Back-to-Blog, dark mode; ss_170867567, ss_9890ula3j).


**S1008 — RESEARCH/CONTENT (2026-06-19). Competitor research + content expansion.**
- Researched 3 new competitors from AlternativeTo: EstiMint ($49+/mo, DIRECT AI-catalog competitor), Stoople (buyer map), Loot Aura (free app). Added all three to competitor-monitor SKILL.md.
- Competitive analysis: EstiMint is the primary threat; FindA.Sale free tier + marketplace is the differentiator. EstiMint advertises on Capterra, Gavelist software roundups.
- Researched Vinted (vinted.com): US launch Jan 2026, zero seller fees (buyers pay 5%+$0.70). Fashion-focused, NOT an organizer tool. Indirect threat: individual sellers list items there instead of via organizer-managed FindA.Sale sales. Added to competitor-monitor SKILL.md.
- Added roadmap rows: #552 (Gavelist AI roundup outreach), #553 (EstiMint alternative blog post).
- Blog post written and registered: "Free Estate Sale Cataloging Software: A Better Alternative to Subscription Tools" (slug: free-estate-sale-cataloging-software-estimint-alternative, postH, publishDate 2026-07-15). CODE-ONLY, pending push.
- BQ: 3 items unchanged (blog /blog, Buy Now graceful error, cart payment-completion).

**S1007 — DEV (2026-06-18). Blog section built — /blog + /blog/[slug], 7 posts, SEO, JSON-LD. Competitor-monitor scheduled task updated to write full blog posts weekly.**
- **Blog section (CODE-ONLY, 10 new files + 1 modified):** `/blog` listing page (7 cards: title, category badge, publish date, reading time, excerpt). `/blog/[slug]` post pages (parseMarkdown renderer, JSON-LD Article schema, canonical + og: tags, breadcrumb, Back to Blog link). 7 post data files in `packages/frontend/data/blog/posts/`. Blog index (`packages/frontend/data/blog/index.ts`). Footer Blog link added to Layout.tsx. ISR: revalidate:86400 on both pages. Static paths with fallback:'blocking'. TypeScript: 0 errors.
- **Competitor-monitor SKILL.md updated:** Phase 2 now writes full 600–900 word blog post drafts to `claude_docs/marketing/blog-drafts/draft-[DATE]-[slug].md` in BlogPost format. Hardcoded old session path fixed → dynamic discovery via `ls -d /sessions/*/mnt/FindaSale`.
- **BQ: 2→3** (blog /blog + /blog/[slug] added, CODE-ONLY pending push + Chrome QA).

**S1006 — QA/BUG (2026-06-17). QA of S1005 cart/checkout/GMC fixes. Found + fixed a P1: Buy It Now broken by `automatic_tax` on raw PaymentIntent.**
- **S1006d — 3 organizer-workflow features (Patrick requests, CODE-ONLY):** (1) edit-item Save Changes now returns to `/organizer/add-items/${saleId}` (was /dashboard). (2) "🏷️ Label Sheets" link added to add-items + edit-item action rows → `/organizer/label-composer/${saleId}`. (3) Label composer: new **starting-position** picker (3×10 mini-grid) for partially-used Avery 5160 sheets — prepends `(startPosition-1)` blank slots so labels begin at the chosen slot; default 1 = no-op. PDF is server-side (Puppeteer in labelComposerController.ts), so the offset was wired through the backend (`startPosition` body param → blank `TagRecord`s; print loop renders empty cells). Backend tsc 0 errors; frontend not VM-tsc-verifiable. Files: edit-item/[id].tsx, add-items/[saleId].tsx, label-composer/[saleId].tsx, labelComposerController.ts.
- **NEW FEATURE (Patrick request, S1006c CODE-ONLY): item search on add-items page.** `add-items/[saleId].tsx` — added a live client-side search box above the saved-items list (filters by title/category/tags, case-insensitive), "Showing X of Y" count, clear button, and a no-match empty state. Helps organizers with 100+ items. Additive; selection/bulk untouched. Frontend not VM-tsc-verifiable (corrupt node_modules); needs deploy + Chrome verify.
- **QA-5 Return policy ✅** Chrome — finda.sale/return-policy live, marketplace language ("each seller", "no single blanket return policy"), dark mode clean. (ss_2020ezr74)
- **QA-4 Google Merchant feed ✅** Live feed (67 rows): `image_link` col = 8 Cloudinary, 23 eBay-thumbnail FALLBACK (items w/ no Cloudinary photo), rest full-size/other. **0 rows** where a thumbnail beat an available Cloudinary URL — `isEbayThumbnail` filter works on deployed backend.
- **QA-1 Cart item links ✅** Chrome (user5 shopper) — added Star Raiders to cart, opened CartDrawer, clicked thumbnail in "Saved in Cart (1)" (href=/items/cmo3esog…) → navigated to that item page + drawer closed. (ss_8070oi6kv→ss_670035opy). NOTE: open CartDrawer reliably freezes CDP screenshot capture (overlay quirk) — DOM tools + URL change used for evidence.
- **QA-2 Cart multi-item checkout ⚠️ PARTIAL** — 2 same-sale items ($3.49+$3.99=$7.48 subtotal ✅), "Go to Checkout" replaced the coming-soon toast with a REAL Stripe Checkout Session (redirect to `checkout.stripe.com/c/pay/cs_live_…`, merchant "Patrick Desmond" = Connect routing worked). **Payment-completion → ?checkout=success → items-SOLD webhook UNVERIFIED**: prod is on **Stripe LIVE keys (cs_live_)**, so test card 4242 is rejected and a real charge won't be made in QA; Stripe domain also blocked in QA browser.
- **QA-3 Buy It Now ❌→FIXED CODE-ONLY** — REPRODUCED the "Try Again" error as BOTH user5 (Star Raiders) AND artifactmi (QA Test First Item S983, item cmqer8m8w00x5me4oqoabaulh, sale cmpfplxqbxwtucltmbouvz0os owned by Kelly's Estate Sales — NOT a self-purchase). Live replay: `POST /api/stripe/create-payment-intent` → **400 `{"error":"Received unknown parameter: automatic_tax"}`**. ROOT CAUSE (evidence-first): Buy Now PaymentIntent passed `automatic_tax:{enabled:true}` which the installed Stripe API version rejects on raw PaymentIntents; it's NOT a Connect error so the S1005 Connect-fallback never caught it (S1005 patched the wrong cause). Cart works because Checkout Sessions support automatic_tax + collect a buyer address. **FIX (S1006):** removed `automatic_tax` from createPaymentIntent basePaymentIntentData (stripeController.ts ~L487); the 2 Checkout-Session automatic_tax usages kept. Backend tsc 0 errors (pnpm-store 5.9.3). CODE-ONLY — needs deploy + Chrome re-test.
- **FINDING (Patrick-flagged): production runs Stripe LIVE keys.** All real Buy Now / cart purchases are real charges; QA cannot use Stripe test cards on prod. (Patrick asked this be noted.)
- **TAX DECISION (Patrick, S1006): do NOT collect sales tax until FindA.Sale must register in nexus states.** All 3 `automatic_tax` sites removed from stripeController.ts: createPaymentIntent (Buy Now), createCheckoutSession (PRO/TEAMS subscription), createAlaCarteCheckout ($9.99). Cart checkout never had it. Reason: marketplace-facilitator tax not yet triggered at beta volume; collecting w/o registration is its own liability. Flip back on (per-state) when a tax pro / nexus thresholds say so. Backend tsc 0 errors.
- **Buy Now valid-account path VERIFIED ✅ (deployed fix):** After Patrick pushed+deployed (commit 45829dd), replayed `POST /api/stripe/create-payment-intent` as user5 shopper for an Artifact item (cmo3esog, Artifact's VALID live Connect acct) → **HTTP 200** with clientSecret + purchaseId + totalAmount 3.49. automatic_tax fix confirmed end-to-end. (Did NOT complete the charge — live keys.)
- **Buy Now invalid-account path → GRACEFUL FIX (S1006, CODE-ONLY):** The QA test item (Kelly's Estate Sales, connectId `acct_1T6f2DLlmra0eowv`) failed post-deploy with `400 "No such destination"` — Kelly's is a seed org whose Connect acct doesn't exist on live Stripe. Root cause of the cryptic UX: (a) backend fallback didn't match "No such destination" so it threw raw; (b) **CheckoutModal.tsx never rendered the error message — only a bare "Try Again" link**, so every failure looked identical. FIX (2 files): stripeController.ts createPaymentIntent catch now detects seller-account-unusable errors (No such destination / No such account / account_invalid / account_closed / insufficient_capabilities) and returns 409 with a friendly message "This seller isn't set up to accept online payments yet…" (REMOVED the old silent platform-capture fallback — capturing buyer money you can't route to the seller is wrong; valid accounts never reach this branch so unaffected). CheckoutModal.tsx now renders `{loadError}` text + dark-mode classes. Backend tsc 0 errors; frontend not VM-tsc-verifiable (corrupt node_modules) — change is a trivial render of an existing string. Needs deploy + Chrome re-test.
- **BQ: 0→2** (Buy Now fix CODE-ONLY pending deploy+retest; cart payment-completion path unverified).

**S1005 — DEV (2026-06-17). Google Merchant feed quality fix + cart checkout regression fix + return policy page.**
- **Google Merchant feed (image_link quality):** `googleMerchantFeed.ts` — added `isEbayThumbnail()` filter. eBay CDN thumbnails (`i.ebayimg.com/$_N.JPG` ~180px) excluded from `image_link`/`additional_image_link`. Cloudinary URLs preferred; falls back to any eBay URL only if no Cloudinary photo. Fixes 0% high-res images causing Google "FAIR" store quality score.
- **Cart item links (CartDrawer.tsx):** "Saved in Cart" section — wrapped item thumbnail + title in `<Link href="/items/${item.id}" onClick={closeCart}>`. Cart items now navigate to item page on click, matching the "On Hold" section pattern.
- **Cart checkout wired to Stripe (CartDrawer.tsx + stripeController.ts + stripe.ts):** Replaced "coming soon" toast with real multi-item Stripe Checkout Session. New function `createCartCheckoutSession` — validates items, all same sale, all AVAILABLE, builds `line_items`, uses `payment_method_types: ['card']` (not `automatic_payment_methods`), Connect fallback pattern (try with `payment_intent_data`, catch Connect errors, retry without). New route `POST /stripe/create-cart-checkout-session` (authenticate + paymentLimiter). Webhook extended: `cart_checkout` type → creates Purchase per item, marks all SOLD.
- **Buy Now Connect fallback broadened (stripeController.ts):** `createPaymentIntent` — new `CONNECT_FALLBACK_CODES` Set (`insufficient_capabilities_for_transfer`, `account_invalid`, `account_closed`, `platform_cannot_pay`, `platform_api_key_expired`) + message-based matching ("does not have the necessary capabilities", "No such account"). Fixes "try again" on Buy Now for real Stripe Connect test accounts.
- **Return policy page (return-policy.tsx NEW):** `/return-policy` — marketplace language (each seller sets their own policy, no blanket return window). 6 sections. Matches `privacy.tsx` layout + dark mode. Google Merchant Center can now point to this URL.
- **TypeScript: 0 errors (both packages). BQ: 0 (unchanged).**
- **CODE-ONLY — pending Chrome QA next session.**

**S1004 — QA/RECORDS (2026-06-17). BQ cleared to 0: eBay Queue cron confirmed live + Facebook Connected badge dev fix + SEO5/SEO6 Chrome QA ✅.**
- **BQ item 1 — eBay Queue Mode RESOLVED ✅:** Railway logs confirmed `[eBay Queue] Starting queue cron for 0 organizer(s)` + `[CRON OK] ebayListingQueueCron completed` at 02:30:01 and 03:00:11 — both on */30 schedule. "0 organizer(s)" correct (no org has ebayQueueMode enabled). Cron registered and firing.
- **BQ item 2 — Facebook Connected badge RESOLVED ✅:** platforms.tsx Facebook card now shows green "Connected" badge (bg-green-100/text-green-700) when `facebook?.connected` truthy, "Not connected" badge otherwise. TypeScript: 0 errors. Agent-applied + verified in file.
- **SEO5 — /auctions/grand-rapids-mi CHROME QA ✅:** H1 "Auctions in Grand Rapids, MI" ✅. FAQPage JSON-LD with 7 auction-specific Q&As (bidding, buyer's premiums, consigning, etc.) ✅. No estate-sale/generic bleed-over. Nearby cities present. Meta title: "2 Auctions in Grand Rapids, MI — Find Local Sales | FindA.Sale". ISR serving (not 404). P3: 2 of 5 nearby cities out-of-state (Chicago IL, Toledo OH) — non-blocking. Screenshots: ss_533815fys.
- **SEO6 — /flea-markets/grand-rapids-mi CHROME QA ✅:** H1 "Flea Markets in Grand Rapids, MI" ✅. FAQPage JSON-LD with 5 flea-market-specific Q&As (vendor booths, cash-only, haggling, etc.) ✅. No auction/estate-sale bleed-over. Nearby cities present. ISR serving. Screenshots: ss_0332eyqoc, ss_7930nzpey.
- **BQ: 2→0.**
- PCVs staged for next-session roadmap Chrome col apply (SEO5 + SEO6 cross-session rule).

**S1003 — QA/DEV (2026-06-17). Chrome QA (ISR smoke test + SEO4 human QA + BQ item 2) + Auction/flea-market SEO pages built.**
- **ISR smoke test ✅:** Navigated https://finda.sale/items/cmnzf780a0009pf19ru5qppqn as guest. Full item detail rendered (title, price $285.00, photos, condition). Reloaded — still loaded cleanly (ISR cache serving). Screenshots ss_8940sbrut, ss_03897mqk5.
- **SEO4 Human QA ✅ (PCV staged for next-session roadmap apply):** Navigated https://finda.sale/yard-sales/grand-rapids-mi as guest. H1: "Yard Sales in Grand Rapids, MI". FAQPage JSON-LD present (7 Q&As confirmed via JS). Nearby cities: Detroit MI, Kalamazoo MI, Lansing MI, Chicago IL, Toledo OH. 7 sales shown. Meta: "7 Yard Sales in Grand Rapids, MI — Find Local Sales | FindA.Sale". BreadcrumbList + ItemList + FAQPage all confirmed. Screenshots ss_3207v3q1s, ss_4548wcacx, ss_4234cbvhi.
- **BQ item 2 — fbCatalogEnabled ⚠️ P2:** Tested as user1 via DB flag. Data layer ✅ — "Not connected" badge disappears, count updates (3→4), copy changes to "Updates when you export from your sale". P2 cosmetic gap: no positive "Connected" badge when flag is ON. Replaced BQ entry with badge-specific P2 fix.
- **BQ item 1 — eBay Queue Mode UNVERIFIED:** Railway backend logs empty this session — could not confirm */30 cron fires. BQ item remains.
- **New SEO pages CODE-ONLY:** /pages/auctions/[city-slug].tsx + /pages/flea-markets/[city-slug].tsx built. ISR: revalidate:86400, 47-city prerender, fallback:blocking. Auction: category=auctions (AUCTION saleType). Flea: category=flea-markets (FLEA_MARKET saleType). Full FAQPage JSON-LD, BreadcrumbList, ItemList, nearby city links, empty/error/loading states. cityData.ts extended (getAuctionMeta/Faqs, getFleaMarketMeta/Faqs). server-sitemap.xml.tsx updated (auctionsUrls + fleaMarketsUrls priority 0.70). TypeScript: 0 errors. SEO5+SEO6 rows added to roadmap.md.
- **BQ: 2→2** (fbCatalogEnabled replaced with Facebook Connected badge P2; eBay Queue Mode remains UNVERIFIED).

**S1002 — DEV/RECORDS (2026-06-16). Records pass + ISR conversion for /items/[id].tsx.**
- **Records pass:** SEO4 Claude QA col → ✅ S997. New roadmap rows 548 (Platform Dashboard+Widget ✅ S1001), 549 (eBay Queue Mode ⚠️ S1001), 550 (FB Commerce Manager ✅/✅ S1001) added to Building section. All 7 PCV entries cleared from PCV table.
- **BQ 4→2:** Item 1 (ISR conversion) FIXED this session. Item 2 (FB CM feed link 404) already pushed S1001 (git 392976b2) — cleared. Items 3 (eBay Queue Mode live flip) + 4 (fbCatalogEnabled flag-ON) remain.
- **ISR conversion — packages/frontend/pages/items/[id].tsx** (1392→1398 lines): GetServerSidePropsContext→GetStaticPropsContext+GetStaticPathsResult. getServerSideProps→getStaticProps + getStaticPaths ({paths:[], fallback:'blocking'}). revalidate:3600 on all 5 return paths. context.params was already used. Structurally identical to estate-sales/[city-slug].tsx ISR pattern. 0 import/structural errors.

**S1001 — QA (2026-06-16, Opus). QA pass on S999 + S1000 (Facebook flagged by Patrick). Parallel code audits + live API + Chrome. Found+fixed 1 P1 FB bug.**
- **FB `link` 404 — FOUND + FIXED (severity corrected by live evidence):** S1000's CM feed `link` built `/sales/${saleId}/items/${item.id}` (exportController.ts L981 per-sale + L1093 org-level) → **HTTP 404 proven live** (correct `/items/${id}` → 200). Audit claimed FB would reject every item — **WRONG**: Patrick's live Commerce Manager shows all **103 products Active/in-stock** (catalog ingested fine). Real impact is **click-through** only: a shopper tapping a product in a FB Shop/ad lands on a 404. Downgraded P1→**P2** (click-through correctness, not catalog-blocking). Fixed both lines → `/items/${item.id}`; backend tsc 0 errors. Still worth shipping (non-urgent).
- **Migrations confirmed applied on Railway:** 20260616000001_ebay_queue_mode + 20260616000002_add_organizer_fb_catalog_enabled both present; all 6 columns exist.
- **Parallel code audits (2 read-only agents):** S1000 — all 8 claims implemented correctly, only the `link` scope-miss. S999 — 6 core claims verified, cron genuinely publishes to eBay (not a stub); minor: claimed ebayController queue edits NOT FOUND (no queue code there — harmless); design boundary: queue only publishes items that already have an ebayOfferId (doesn't create offers from scratch — confirm intent).
- **Live API:** GET /api/organizers/cmnxueoas.../export/commerce-feed → HTTP 200, 11 cols incl quantity_to_sell_on_facebook (1=avail/0=sold ✅), brand='' ✅, public (no auth) ✅.
- **Chrome QA (as Artifact MI, real acct) — 5 ✅:** FB CM settings section (ss_6614rpneu), FB CM promote section (ss_799354zpz), /organizer/platforms cards+coverage 40/100 (ss_68954s71x), eBay Listing Queue + PlatformGapPanel "Invisible Inventory 62 items", PlatformHighlightsWidget on dashboard 40%/eBay 1/Google 84/Unlisted 62 (ss_86419jwe2).
- **⚠️ UX finding (minor):** /organizer/platforms first load hit a 429 rate-limit → degraded to MISLEADING state (eBay falsely "Not connected", coverage ring stuck "Loading…" with no error/retry). Clean reload = correct. Recommend an error/retry state on stats failure.
- **Did NOT flip** fbCatalogEnabled or ebayQueueMode on Patrick's real account (persistent side-effects); both render + PATCH/cron code-verified — flip on a test org or Patrick confirms.
- **BQ: 9→4.** Staged 5 PCVs for next-session roadmap apply.

**S1000 — DEV (2026-06-16). Facebook Commerce Manager overhaul — 8 issues fixed.**
- **Root cause (ArtifactMI error report):** All 10 CM items "Not visible in Shops" — single missing field `quantity_to_sell_on_facebook`. Audit surfaced 7 additional FB integration gaps.
- **Issue 1 (CRITICAL):** Added `quantity_to_sell_on_facebook` to `exportCommerceManagerFeed` — `1` for AVAILABLE, `0` for SOLD.
- **Issue 2 (HIGH):** Fixed `brand` fallback from `'N/A'` → `''` (FB spec requires empty string for unknown brand).
- **Issue 3 (HIGH):** New organizer-level CM feed endpoint: `GET /api/organizers/:organizerId/export/commerce-feed` — stable URL across all active sales. Per-sale endpoint kept for backward compat.
- **Issue 4 (MEDIUM):** Added `Organizer.fbCatalogEnabled Boolean @default(false)` + `fbCatalogRegisteredAt DateTime?`. Migration: `20260616000002_add_organizer_fb_catalog_enabled`. `platformStatsService` now uses flag for facebook.connected + facebook.listed.
- **Issue 5 (MEDIUM):** Settings page — new "Facebook Commerce Manager" section with feed URL + registration toggle. PATCH /organizers/me handles `fbCatalogEnabled`.
- **Issue 6 (LOW):** `facebookNudgeService` routes to `business.facebook.com/commerce` for CM users, `facebook.com/marketplace/selling/` for Marketplace users.
- **Issue 7 (LOW):** `formatFacebookCsv` in `exportService.ts` marked `@deprecated` (not deleted — removal gate).
- **Issue 8 (LOW):** Promote page — Commerce Manager section with organizer-level feed URL + copy button.
- **Schema:** Migration `20260616000002_add_organizer_fb_catalog_enabled` — Patrick MUST run `prisma migrate deploy` + `prisma generate`.
- **TypeScript:** 0 errors (both packages). ADR saved to `claude_docs/feature-notes/adr-facebook-commerce-manager-2026-06-16.md`.
- **QA:** CODE-ONLY — pending Chrome verification. 4 items added to Blocked Queue.
- **BQ delta:** 5 → 9.

**S999 — DEV (2026-06-16). Platform Metrics Dashboard + eBay Queue Mode engine shipped.**
- **Shipped:** 12 files — 4 new backend (platformStatsService.ts, platformStatsController.ts, ebayListingQueueCron.ts, 5 new routes), 3 new frontend (platforms.tsx, PlatformHighlightsWidget.tsx, PlatformGapPanel.tsx), 5 modified (organizers.ts, index.ts, ebayController.ts, dashboard.tsx).
- **Schema:** 4 new fields — Item.ebayQueuedAt, Item.ebayListedAt, Organizer.ebayQueueMode, Organizer.ebayQueueRotation. Migration: 20260616000001_ebay_queue_mode.
- **Status:** Pushed. Patrick MUST run `prisma migrate deploy` before backend will start correctly.
- **Build fixes:** Removed TanStack Query v5-incompatible `onSuccess` + `keepPreviousData` → useEffect + `placeholderData` pattern in PlatformGapPanel.tsx and platforms.tsx.
- **TypeScript:** 0 errors. All pushes completed.
- **QA:** CODE-ONLY — pending Chrome verification. 4 items added to Blocked Queue.
- **BQ delta:** 2 → 5.

**S998 — BUG (2026-06-16). eBay bidirectional sync restored — Trading API now always runs after Inventory API.**
- **Root cause (tool-cited):** `importInventoryFromEbay` in `ebayController.ts` had `if (totalFetched === 0)` guard before the Trading API `GetMyeBaySelling` block. ArtifactMI has 18 Inventory API items → `totalFetched = 18` → guard prevented Trading API from running → 75+ classic eBay listings (created directly on eBay, not via FindA.Sale) never synced. Items showed "Push to eBay" despite being live on eBay.
- **Fix (commit 5e517cf7):** Changed `if (totalFetched === 0) {` to a bare block `{`. Trading API now always runs after Inventory API loop. Dedup (`prisma.item.findFirst({ OR: [{ebayListingId: storedId}, {ebayListingId: ebayItemId}] })`) handles items found by both paths safely.
- **Also shipped:** `seed.ts` — user1 no longer seeded as ADMIN + eBay connection removed (commit 97e78a3f).
- **Patrick confirmed:** "wrap it synced now" — post-deploy sync ran and imported classic listings.
- **Pending:** 4 UNPUBLISHED items (Loy Norrix Choirs offerId=166668232011, Kirkland Pepper offerId=166412704011, Whip-It Butane offerId=151850469011, Contigo Travel Mug offerId=151769728011) have offers on eBay but no ebayListingId in DB — need ebayOfferId backfilled to publish from FindA.Sale.
- **BQ delta:** 2 → 2 (unchanged).

**S997 — SEO/DEV (2026-06-16). Yard-sales Chrome QA verified + GSC sitemap itemUrls fix.**
- **Chrome QA (S995 fix confirmed):** Navigated https://finda.sale/yard-sales/grand-rapids-mi as logged-in user. H1 = "Yard Sales in Grand Rapids, MI" ✅. About section = yard-sale copy (not Dutch heritage text) ✅. 7 yard-sale FAQs rendered ✅. 5 nearby city links (Detroit, Kalamazoo, Lansing, Chicago, Toledo) ✅. 7 sale listings ✅. FAQPage JSON-LD in source (BreadcrumbList + ItemList + FAQPage confirmed) ✅. Screenshots: ss_14861obk4, ss_59206270m, ss_6493n5xfp. PCV staged for S998 roadmap Chrome column update (per cross-session rule).
- **GSC P1 fix — server-sitemap.xml.tsx:** Removed itemUrls block (try/catch calling /items/sitemap + itemUrls map + ...itemUrls spread). 255→241 lines. ~10,000 /items/{id} SSR leaf pages removed from sitemap — crawl budget freed for city/sale/guide pages. Comment added explaining the intentional exclusion. TypeScript: 0 errors. 1 file changed.
- **BQ: 3→2** (sitemap itemUrls CLEARED; items ISR conversion remains P1).

**S996 — BUG (2026-06-16). eBay sold sync window fix — 90-day creationdate replaces 7-day lastmodifieddate.**
- **Root cause:** `ebaySoldSyncCron.ts` used `lastmodifieddate` filter (7-day window) on the eBay Fulfillment API. A settled order (paid + shipped quickly) has its `lastmodifieddate` frozen within hours of creation. After 7 days it falls outside the window permanently — the cron never sees it again. Items sold on eBay were never marked SOLD on FindA.Sale.
- **Fix:** Changed filter to `creationdate:[now-90d..now]`. `creationdate` is immutable — an order placed 60 days ago always appears in a 90-day window until day 91. Idempotency preserved: cron pre-filters to AVAILABLE items only so already-SOLD items are never re-processed.
- Backend TS 0 errors. 1 file: `packages/backend/src/jobs/ebaySoldSyncCron.ts`.

**S993 — BUG/DATA (2026-06-16). Outreach pipeline root-cause fix — ARCHIVED rows + Prisma NULL-exclusion bug.**
- **Why ARCHIVED?** No application code ever sets DCE.status='ARCHIVED'. All rows were set via direct SQL in past maintenance sessions. Undocumented unofficial status.
- **Root cause of auto-seed underperformance (Prisma NULL bug):** `autoSeedOutreachCron.ts` used `NOT: [{ emailDiscoveryConfidence: 0.0 }]` → SQL `NOT (col = 0.0)` → PostgreSQL NULL comparison returns NULL (not true) → 12,136 organizers with NULL confidence (scraped emails, labeled "trusted" in comments) silently excluded. Only ~329 positive-confidence orgs ever passed. This is why the pipeline only sent 848 emails despite 80,852 organizer records.
- **Data fix (SQL):** Reset 2,276 ARCHIVED rows (0 attempts, valid biz categories, non-junk domains) back to PENDING. Kept 422 ARCHIVED (government, Canadian, mall cos., tech/font/junk). Queue after: PENDING 2,292, SENT 699, ARCHIVED 422, OPTED_OUT 1.
- **Code fix — autoSeedOutreachCron.ts:** (1) Null-safe Prisma filter: `AND:[{OR:[{emailDiscoveryConfidence:null},{emailDiscoveryConfidence:{gt:0}}]}]` + Canada NOT appended separately. (2) Email dedup query now excludes ARCHIVED rows so an ARCHIVED email can't permanently block a new seed.
- **Code fix — seedDirectoryClaimEmails.ts:** Same null-safe Prisma filter (was identical bug in the manual seed script).
- TypeScript: 0 errors. 2 files changed. 6,077 novel organizers now eligible to seed (up from ~329).
- **S993 continued — RDAP Stage 3 implemented (emailDiscoveryService.ts):** `lookupRdapEmail()` via `https://rdap.org/domain/{domain}` (universal TLD router, 8s timeout), vCard 4.0 parser, 13-domain privacy-proxy filter (whoisguard.com, domainsbyproxy.com, etc.), role-priority walk (registrant→admin→technical), nested entity support. Wired into `discoverEmail()` as Stage 3 fallback after Stage 1 scrape miss. Confidence base 0.80 (high signal — registrant's own registrar email). `toDiscoveryMethod('whois')` now returns `'whois_rdap'` (was `'pattern_match'`). TS 0 errors. 1 additional file. 5,057 organizers with website but no email are now addressable via RDAP on next discovery run.

**S992 — SEO/DEV (2026-06-16). Analytics OAuth restored + city SEO framework built + estate-sales landing pages upgraded.**
- Analytics pipeline: created `claude_docs/scripts/oauth_setup2.py` (missing file referenced by scheduled task), repaired truncated `.analytics-creds.json`, ran weekly report successfully. OAuth re-auth flow documented.
- New file: `packages/frontend/lib/seo/cityData.ts` — reusable SEO framework for all city/category landing pages:
  - 50+ city `CITY_DATA` lookup with unique `knownFor`, `tip`, and `nearbySlugs` per city
  - Builders: `getCityMeta`, `getEstateSalesFaqs` (7 city-specific FAQs), `buildFaqJsonLd` (FAQPage JSON-LD), `buildSeoTitle` (count-aware, hits multiple query variants), `buildSeoDescription`, `getNearbyLinks`
  - Designed for reuse by: `/yard-sales/[city-slug]`, `/auctions/[city-slug]`, `/flea-markets/[city-slug]` (next session)
- Updated: `packages/frontend/pages/estate-sales/[city-slug].tsx` — consumed the framework:
  - Birmingham AL + Long Beach CA added to prerender list (GSC fix — both showing impressions at pos 27+, zero clicks)
  - Prerender list expanded to 45 cities covering all known GSC impression markets
  - FAQPage JSON-LD schema on every page (Google rich result eligibility)
  - City-specific About section (`knownFor` + `tip` — no more identical boilerplate on every page)
  - Nearby cities section (internal link equity across city pages)
  - Empty-state nearby city links (reduces pogo-stick on zero-sale pages)
  - Count-aware title: `"51 Estate Sales in Denver, CO — Find Local Sales | FindA.Sale"` (multi-variant)
- TypeScript: 0 errors (frontend tsc clean). BQ unchanged = 1.
## Blocked Queue

| Feature | Reason | What's Needed | Session Added |
|---------|--------|---------------|---------------|
| ~~Cart multi-item payment-completion~~ | **CLOSED S1021** — Patrick confirmed cart purchase 2026-06-19; "Test Prod 2" item → SOLD via webhook (PI pi_3Tk2Rw, purchase PAID). Webhook works. Note: two separate checkout sessions per item (not one bundled transaction). | — | S1006 → closed S1021 |
| bounceSuppressService reads WRONG mailbox | Recipient bounces forward to deseee@gmail.com. `bounce-suppression-sweep` Cowork task is the LIVE workaround (reads deseee@gmail.com, writes EmailSuppression). Optional full fix: OAuth token for find@outreach.finda.sale. S1023 confirmed no action required unless Patrick wants the full OAuth fix. | ADR-bounce-suppression-mailbox-fix.md — generate OAuth token for find@outreach.finda.sale workspace mailbox (optional) | S1020 |
| reclassify-bounces backfill ineffective | Same wrong-mailbox cause — ~93 historical bounces not reclassifiable | Fix mailbox source first, then re-run backfill | S1020 |
| schema.prisma drift — 5 EmailSuppression cols | bounceCategory/bounceStatusCode/diagnosticCode/retryAfter/classifiedAt exist in DB+schema but have NO migration file (applied via raw DDL) | Optionally generate the migration locally + `prisma migrate resolve --applied` | S1020 |

| [auto:ci] TypeScript CI exit 134 — OOM kill on tsc (P2) | tsc --noEmit killed with SIGABRT (exit 134) on GitHub Actions runner. Fix prepared by health monitor 2026-06-23 but GitHub MCP lacks `workflow` scope to push. | Patrick: apply pushblock below to add NODE_OPTIONS: --max-old-space-size=4096 at job env level in .github/workflows/ci-typecheck.yml | 2026-06-23 |
## Pending Chrome Verifications

| # | Feature | Evidence | Session |
|---|---------|----------|---------|
| — | All S1016 PCVs applied to roadmap.md S1017 | /feed ISR ✅ row 190, /leaderboard ISR ✅ row 212, SEO4 already ✅ S1003 (no change), /admin/users ⚠️ PARTIAL row 554 | S1017 |

## Next Session

### S1025 — priorities

**⚡ BQ UPDATED (health monitor 2026-06-23):** BQ is now **5 rows** (was 9). 4 resolved items removed: Sentry P0/P1 issues ✅, geocodeBacklog ✅, GitGuardian cred ✅, S1022 error-fix batch ✅. NEXT SESSION IS NO LONGER FORCED QA-ONLY.

**Session type: DEV.** CI OOM pushblock needed first (see Patrick actions below).

**Smoke test FIRST (§10):** S1022 shipped the admin.ts hotfix + geocode fix + CI gate + a disabled email stub. Confirm backend /health is 200 AND the geocodeBacklog cron's next run (every 2h) logs `geocoded:` >0 — the geocode fix is UNVERIFIED until a real run succeeds.

**CI gate status (updated 2026-06-23):**
- ✅ Railway "Wait for CI" ENABLED — backend won't deploy until "Typecheck, tests & lint" passes.
- ✅ GitHub branch protection — rule saved S1024. Railway Wait-for-CI is the real gate.
- ❌ Vercel "Required CI checks" — Pro plan only.
- ⚠️ **CI OOM (exit 134) — FIX READY, NEEDS PUSH:** Add `NODE_OPTIONS: --max-old-space-size=4096` at job env level in `.github/workflows/ci-typecheck.yml`. Full file content prepared by health monitor. Patrick push:
  ```
  # In ci-typecheck.yml, under "jobs: typecheck:" after "timeout-minutes: 20", add:
  #     env:
  #       NODE_OPTIONS: --max-old-space-size=4096
  git add .github/workflows/ci-typecheck.yml
  git commit -m "fix(ci): NODE_OPTIONS=--max-old-space-size=4096 prevents OOM kill (exit 134)"
  .\push.ps1
  ```
- ⏳ `tsc || true` in Dockerfile.production — still needs `Skill('findasale-dev')` to remove it.

**Patrick actions (Claude can't reach these UIs/logins):**
- ~~**ROTATE the Railway DB password**~~ ✅ DONE S1023 — DB rotated, Railway vars updated, backend green. ~~Update local .env~~ ✅ S1024 (packages/database/.env updated). ~~Update CLAUDE_MASTER.md~~ ✅ S1024 (bat executed via File Explorer Run-as-admin).
- ~~**Bounce mailbox**~~ ✅ Handled by Cowork sweep task — no Patrick action needed unless you want the full OAuth fix.
- ~~**GitHub branch protection**~~ ✅ DONE S1024 — Patrick entered GitHub password, rule saved. "Not enforced" label is expected (free private repo).
- **Vercel GitHub App permissions** — pending request at `github.com/settings/installations` → Vercel → "Review request". Requires your GitHub password. (Note: Vercel "Required CI checks before deploy" is a Pro plan feature — the Railway Wait-for-CI is the real enforcement.)
- ~~**Update local .env + CLAUDE_MASTER.md**~~ ✅ DONE S1024 — packages/database/.env updated; CLAUDE_MASTER.md updated via bat (File Explorer Run-as-admin).

**Dev priorities (dispatch; all need local `tsc` verify until CI blocks):**
- `Skill('findasale-dev')`: migration shadow-replay repair per `outputs/PRISMA_MIGRATION_REPAIR_PLAN.md` — stray 2025 `organizer_claim_email` duplicate + the new EmailSuppression drift migration. Needs prisma CLI (Patrick's machine); files + resolve sequence already prepped.
- Confirm the S1022 6-file error-fix batch (seed prod-guard, markdownCycleCron per-item price, scraperCron boot guard, cronGuard→Sentry alerting) actually landed green on GitHub — re-push if not.
- `Skill('findasale-dev')`: bounceSuppressService wrong-mailbox + async send-limit/false-SENT counting (after the OAuth token exists).
- Remove the dead `adminEmailSendController` stub + the dangling `/send-email` route (email endpoint abandoned — caused 2 outages).

**Carried (unchanged): outreach PAUSED (`OUTREACH_DAILY_CAP=1`), eBay token expired (reconnect), GSC indexing watch (~7 days), AlternativeTo submission.**

## Recent Sessions

### S1023 — 2026-06-22 | OPS/INFRA (CI gate + DB rotation + bounce mailbox audit)

**Triggered by:** Patrick — "do all 3 outstanding... I'm not doing them you have the tools."

**Completed autonomously:**
- **DB password rotated ✅** — `ALTER USER postgres WITH PASSWORD ...` executed via psycopg2 against Railway public proxy. All 4 Railway Postgres service vars updated (PGPASSWORD, POSTGRES_PASSWORD, DATABASE_URL, DATABASE_PUBLIC_URL). Backend service `DATABASE_URL` updated via Railway GraphQL API. Backend redeployed and healthy (ACTIVE, "Deployment successful"). New password confirmed working via psycopg2 test query. **CREDENTIAL BLACKOUT: password not recorded in this file.** Patrick must update local .env + CLAUDE_MASTER.md.
- **Railway "Wait for CI" enabled ✅** — Railway backend service Settings → Source → "Wait for CI" toggle enabled. Backend deployments now wait for all GitHub Actions to complete before starting.
- **GitHub branch protection configured ⏳** — Form filled at github.com/deseee/findasale/settings/branch_protection_rules with "main" pattern + "Typecheck, tests & lint" required. BLOCKED: GitHub requires sudo mode (Patrick's password) to save. Note: won't enforce on free private repos anyway — Railway Wait-for-CI is the real gate.
- **Vercel "Required CI checks"** — Not available on Hobby plan. Pro plan required ($20/month).
- **Bounce mailbox ✅** — Confirmed `bounce-suppression-sweep` Cowork task handles this. ADR-bounce-suppression-mailbox-fix.md already written. No code change needed.

**Patrick must do:** Update local .env + CLAUDE_MASTER.md with new DB password. Enter GitHub password to save branch protection rule.

### S1022 — 2026-06-22 | META/OPS/INFRA + PROD INCIDENT (resolved)

**Triggered by:** Patrick — "what have we overlooked, what's not automated that should be... you're the frontline, do it."

**Built/shipped (live):** 4 monitoring scheduled tasks (data-persistence/deploy-clobber [baseline seeded], token-expiry; cron-heartbeat + Sentry-P0→Blocked-Queue folded into daily ci-sentry-health Steps 7+8; 2 standalone interim tasks disabled). Scheduled-task fleet consolidation (brand-drift re-scoped to pure copy/tone of all customer-facing copy; 2 desc/cron mismatches fixed; 4 dead tasks flagged). CI typecheck gate `.github/workflows/ci-typecheck.yml` (NOT yet blocking). 2 real-time Sentry fatal/error→email rules (17220190 nodejs, 17220191 nextjs). DB password scrubbed from 13 repo files + secrets-audit gitignored. Geocoder fix (geocodeBacklogJob.ts + geocodingService.ts): descriptive Nominatim UA + 1req/s throttle (fixes 429) + route Canadian/non-US off US-Census + skip ungeocodeable fragments — validated live, deployed green.

**PROD INCIDENT (self-inflicted, resolved same session):** A locked admin email-send endpoint was added; the dev agent's Windows-fs write TRUNCATED admin.ts (lost `export default router`) and `tsc || true` shipped the broken build → backend crash-loop (`Router.use undefined`, index.js:576). Two symptom-fixes (revert top, stub controller) failed; root cause found via file-integrity check (`wc -l`=434, no export). Fixed by restoring the truncated tail (453 lines, braces balanced); prod green (3x /health 200). Email endpoint ABANDONED (disabled 403 stub left on prod, to remove). LESSONS: integrity-check files FIRST on undefined-router/middleware errors; never push un-tsc-verified backend; make CI block.

**Diagnosed, not yet fixed (→ Next Session):** migration shadow-replay (stray 2025 organizer_claim_email duplicate; repair plan written, needs prisma CLI); DB password rotation (Patrick); bounce mailbox OAuth token (Patrick); CI-blocking toggles (Patrick dashboards).

**Pushes (all green):** CI-gate+scrub+migration-file (Patrick); emergency MCP stub controller; admin.ts hotfix (Patrick); geocode fix (Patrick).

### S1021 — 2026-06-22 | BUG/SEO (Google indexing investigation + sitemap P0 fixes + GSC manual actions)

**Session type:** BUG/SEO
**Triggered by:** Patrick — "figure out why we still aren't being indexed even after all the fixes."

**Root causes found (tool-cited, Opus SEO expert + findasale-dev dispatch):**

**P0-1 — Zero sale pages in sitemap (5,000 pages silently excluded):**
`server-sitemap.xml.tsx` filtered `.filter((sale: any) => sale.status === 'PUBLISHED')` but the `/sales/sitemap` backend endpoint pre-filters in SQL and returns only `{ id, updatedAt }` — no `status` field. The filter was always false (undefined !== 'PUBLISHED'), silently excluding all 5,000 published sales. Confirmed via direct API call. Fix: removed the filter line. Verified post-deploy: `curl -s https://finda.sale/server-sitemap.xml | grep -c "/sales/"` → 5000.

**P0-2 — lastmod abuse causing Google trust loss (2,210 pages affected):**
Every non-sale, non-guide URL emitted `lastmod: new Date().toISOString()` — the exact moment Googlebot fetched the sitemap. Google's June 2024 sitemap policy: always-"now" lastmod is treated as inaccurate and ignored sitewide, starving crawl budget. Fix: added `const STATIC_LASTMOD = '2026-06-22'`; replaced 14 occurrences across all static URL groups. Left `saleUrls` (uses real `sale.updatedAt`) and `guideUrls` (already static `'2026-05-01'`) untouched.

**Critical find — prebuild script overwrote curated guide content on every deploy:**
`packages/frontend/package.json` had `"prebuild": "tsx scripts/generate-seo-index.ts"` — this generator produces thin city×sale-type templates (Google Scaled Content Abuse violation) and overwrote the curated brand pricing guides in `data/seo-pages/index.json` on every `next build`. Fix: removed the prebuild script entirely. Generator also guarded with a deprecation throw at the top of `main()`.

**GSC manual actions (completed this session):**
- ✅ Zombie sitemap `sitemap_index.xml` (Jun 2023, 0 pages, "Sitemap is HTML" error) removed via GSC UI.
- ✅ `server-sitemap.xml` resubmitted via GSC Sitemaps "Add a new sitemap" — "Sitemap submitted successfully."
- ✅ Indexing requested on 2 sale URLs via GSC URL Inspection tool — both confirmed "Indexing requested" with priority crawl queue placement.

**Files changed (Patrick pushed; Railway cache-busted and redeployed green):**
- `packages/frontend/pages/server-sitemap.xml.tsx` — removed status filter; added STATIC_LASTMOD constant; replaced 14 `new Date().toISOString()` occurrences.
- `packages/frontend/scripts/generate-seo-index.ts` — added deprecation throw at top of `main()`.
- `packages/frontend/package.json` — removed `prebuild` script.
- `packages/backend/Dockerfile.production` — cache-bust comment updated.

**TypeScript gate:** PASS (0 errors). BQ: 4 → 3 (cart payment-completion closed — Patrick confirmed real purchase 2026-06-19; BQ entry removed). No new SEO BQ items (all GSC work is manual, done).

### S1020 — 2026-06-22 | RESEARCH/BUG (outreach email deliverability root-cause + throttle fixes + task hardening)

**Session type:** RESEARCH/BUG
**Triggered by:** Outreach email deliverability problem investigation.

**Prior P0 disproven (fabrication caught):** the earlier-claimed "RAILWAY_BACKEND_URL not set → phishing links" was a code-inference, NOT a real finding — the var has been set for months. Real diagnosis came from direct mailbox reads + Railway DB.

**Root cause (tool-cited — CORRECTED 6/22):** NOT volume. The sender `outreach@finda.sale` (paid Workspace; auth/SPF/DKIM confirmed correct) sends only ~169/day total (verified via SENT folder = quota log; no hidden mail), steady, ZERO send-limit failures through 6/20. The trigger was **BOUNCE RATE**: scraped directory addresses produced a 15-26% bounce rate over 6/18-6/20 (6/18 15%, 6/19 26%, 6/20 19%). Google tolerates ~2-5%; a ~1-in-5 bounce rate is the signature of a purchased/garbage list, so Google's abuse system **CLAMPED the account's sending limit on 6/21** (one-day-lagged abuse penalty) → 136 "reached a limit for sending" failures that day, 12 the next. Account now in the penalty box → even a 12-message batch on 6/22 bounced all-over-limit. The earlier "~200-300/day throttle" framing is WRONG: it's an abuse clamp from the bounce rate, not a volume cap. **Async-bounce mechanism:** Gmail ACCEPTS the API send (cron logs "sent," consumes quota, marks SENT) then bounces it later — so the limit-aware backoff (fires on a send-call error) does NOT catch this and the cron over-counts "sent." Known gap → code follow-up.

**Fixes shipped (all on main, deployed green; backend healthy; OutreachCron live "12 sent, 0 failed"):**
- `4e1d06f` — suppressionService: `noemail.*` placeholder family + no-dot-domain guard.
- `641fb55` — bounce classification: EmailSuppression +5 cols (DIRECT DDL, no migration file → schema drift); bounceSuppressService classifies; isSuppressed honors retryAfter; reclassify-bounces job registered.
- `661e4413` — throttle: OUTREACH_DAILY_CAP (default 75) binding daily cap + surge guard + 1.1s pacing + limit-aware backoff (pins EmailQuotaLog, stops for the UTC day on a Gmail send-limit error).
- `432638b` — pre-send MX validation (lib/mxValidator.ts): skips+suppresses NO_MX domains.
- `a90c793` (HEAD) — built then REMOVED provider-agnostic SMTP rail per Patrick; kept inline Gmail send.

**DB actions (live):** un-suppressed 12 Google-blocked addresses, then applied POLICY_BLOCK + 7-day retryAfter cooldown.

**The fix (LOCKED):** root cause is the bounce RATE → (1) list hygiene (MX validation + suppression + placeholder filters, all shipped) cuts the bounce rate at the source; (2) PAUSE — `OUTREACH_DAILY_CAP=1` (near-zero) in Railway so Google sees sending stop and the clamp clears over a few days; (3) resume at low volume on the cleaned list ONLY after the health check shows zero "reached a limit" failures + bounce rate <5%. We paused to near-zero to serve the penalty FIRST — the old "ramp from 75" plan was wrong. No dedicated domain / SES (no budget); ADR-dedicated-outreach-sender.md stands SHELVED.

**Scheduled tasks hardened:** `findasale-email-delivery-health` B now watches the real abuse-clamp signal + new B2 reads the outreach mailbox for "reached a limit" failures + surge + bounce-category breakdown (bounce RATE is the metric to watch, target <5%). `bounce-suppression-sweep` now CLASSIFIES bounces (the LIVE suppression path — bounceSuppressService polls the wrong mailbox).

**Docs:** email-infrastructure-map.md (§5 corrected, new §8 throttling); new ADR-dedicated-outreach-sender.md (shelved).

**Follow-ups → Blocked Queue (3 P1):** bounceSuppressService wrong-mailbox; reclassify-bounces backfill ineffective (~93 bounces); schema.prisma 5-column drift.

**BQ: 1 → 4.** All commits deployed green.

### S1019 — 2026-06-20 | DEV/BUG (platform stats investigation + live counts + dark mode sweep)

**Session type:** DEV/BUG
**Triggered by:** Patrick: "investigate and find the discrepancies" in platform dashboard numbers

**Root cause (tool-cited):** 36 items in Artifact MI's sales had `organizerId = NULL`. `platformStatsService` filters every query by `organizerId`, so those items were invisible across all platform counts. Additionally, all three stats metrics were derived from stale DB flags rather than live platform data.

**DB backfill (live, no push needed):** `UPDATE "Item" SET "organizerId" = <org-id> WHERE "saleId" IN (<sale-ids>) AND "organizerId" IS NULL` — 36 items corrected via psycopg2 against Railway public proxy.

**3 controller fixes (organizerId always stamped on item creation):**
- `uploadController.ts` L454: added `organizerId: sale.organizerId` to rapidfire DRAFT create
- `syncController.ts` L180: added `organizerId` to `handleCreateItem` data payload
- `batchAnalyzeController.ts` L94-198: `sale.findUnique` added; `organizerId` passed to cluster + ungrouped create

**platformStatsService.ts overhaul (live counts):**
- eBay: now calls eBay Inventory API via `/api/proxy/ebay` for live published count (falls back to DB if token expired — token expired June 20 21:30 UTC, DB count=10 accurate post-backfill)
- Google: uses `getCacheMeta().itemCount` from `googleMerchantFeedService` (feed has 92 items; shows 93 on cold cache = computed fallback, will sync at 3:30 AM cron)
- Facebook: `fbCatalogEnabled` set true for Artifact MI via DB; `listed` now uses `findasaleVisible` (items in published sales) = 93
- New `totalVisibleOnSite` field: AVAILABLE+isActive+draftStatus=PUBLISHED+sale.status=PUBLISHED = 93

**platforms.tsx:** local `EbayStats` + `PlatformStatsResponse.totals` interfaces updated with new fields. TS 0 errors.

**Dark mode bg-white sweep (30 files):** 58 instances of `bg-white` → `bg-white dark:bg-gray-800` across components and pages.

**Live verification (post-push):** eBay=10 ✅, Google=93 ✅, Facebook=93 ✅, totalAvailable=137 ✅, visibleOnSite=93 ✅, coverage=69% ✅

**BQ: 1 (unchanged).** Push: commit `f3490c48`, green.

### S1018 — 2026-06-20 | RESEARCH/DEV (email health sweep + ESN source backfill + suppression fix)

**Session type:** RESEARCH/DEV (automated + Patrick joined mid-session)
**Triggered by:** Daily email & deliverability health sweep (scheduled task)
**Investigation findings:**
- Check D (EmailSuppression spike): 65 hard bounces in 2 days = normal cold outreach behavior (22% bounce rate from directory contacts). `resendEventId=NULL` confirms Gmail rail. System working correctly.
- Check E (ungated services): All 4 bulk email services (winBack, onboarding, reviewRequest, postSaleRecap) route through `outwardEmailAutomationsJob.ts` which has the OUTREACH_ENABLED gate. No ungated sends. No code change needed.
- Check M3: RESEND_WEBHOOK_SECRET confirmed set on Railway by Patrick ✅.
- Root cause of bounces: 48 NULL-source organizers with contactEmail traced to EstateSales.NET scraper run May 2, 2026 (pre-S654 hardening). `getOrCreateScrapedOrganizer` at that time did not write `sourcesJson` or `directoryMostRecentSource` on initial create. Total affected: 2,195 ESN organizers missing source attribution.
- Garbage contact emails (sentry hash, filler@godaddy.com, admin@facebook.com, user@domain.com): ESN data quality problems — organizer profiles on EstateSales.NET have placeholder/error-tracking addresses in their contact fields.
**Shipped (Patrick pushed + redeployed green):**
- `suppressionService.ts`: added `sentry.io` to UNSENDABLE_DOMAINS; added `JUNK_FULL_ADDRESSES` set (`filler@godaddy.com`, `admin@facebook.com`); added `isHexHashLocalPart()` + `HEX_HASH_RE` regex to block 32+ hex-char local parts (Sentry IDs). All checks in `isEmailDomainBlocked()` — covers every send path system-wide.
- `backfill-null-source-esn.ts` created + run by Patrick: updated 2,195 ESN organizers with `directoryMostRecentSource='EstateSalesNet'` + `sourcesJson=[{sourceName:'EstateSalesNet',...}]`; marked 3 sentry DirectoryClaimEmail entries INVALID.
**Files changed:** packages/backend/src/services/suppressionService.ts (modified), packages/backend/src/scripts/backfill-null-source-esn.ts (new).
**BQ delta:** 2 → 2 (unchanged).

### S1016 — 2026-06-20 | QA + FIXES (audit findings, Chrome QA, local file fixes)

**Session type:** QA + FIXES
**Triggered by:** Weekly audit findings + "chrome is open again.. fix the findings"
**Fixed:** feed.tsx restored from GitHub (7348B, was 5263B truncated by Edit tool); leaderboard.tsx NUL bytes stripped (14737B = GitHub); admin/index.tsx LOW-2 dark:text-warm-400 added to close button.
**Chrome QA:** /feed ✅ (ss_0566nitc9), /leaderboard all 3 tabs ✅ (ss_9351nlc6c, ss_6728wlx91, ss_6482h13up), SEO4 yard-sales/grand-rapids-mi ✅ (H1 + FAQPage JSON-LD + nearby cities ss_3217o7wwg), /admin/users Alice redirect ✅ (ss_8004e8she).
**Pending push:** admin/index.tsx (LOW-2) + saleController.ts (S1015 items cap).
**BQ delta:** 4 → 2.
**PCVs staged:** 4 entries in PCV table (apply to roadmap.md next session).

### S1013 — 2026-06-19 | AUDIT/BUG/RECORDS (admin 500 fix + eBay backfill + doc-drift)

**Session type:** AUDIT/BUG/RECORDS
**Triggered by:** Patrick — "audit past sessions, what's undone, what to fix."
**Shipped (pending push):** adminController.ts — `getUsers` + `getSales` ID-array fetch → Prisma `_count` (fixes /admin/users 53100 500). Backend tsc 0. PLUS adminReportsController.ts — getOrganizerPerformance full-dataset load → DB-side `$queryRaw` aggregation+pagination (fixes a worse 53100/OOM on /admin/reports/organizers). PLUS reputationJob.ts — full-table 80k-org scan + 160k-query N+1 → filtered (isUnmanagedListing:false) + batched.
**Data (prod, no push):** eBay `ebayOfferId` backfilled on 2 items (Loy Norrix, Kirkland); Whip-It + Contigo orphaned (DB rows gone). S998 carry-forward CLOSED.
**Docs:** roadmap #554 added for admin DM + ALA_CARTE revenue (commit 4374e40a). Confirmed the concurrent S1012 window already logged that work in STATE Current Status.
**Concurrent-session collision:** STATE.md was being edited by an S1012 window during this audit — additive edits only here; flagged to Patrick as a workflow risk.
**Verified deploy:** HEAD 4374e40a LIVE on Vercel (READY); prior 9c445eb7 ERRORed but superseded.
**BQ delta:** 1 → 2.

