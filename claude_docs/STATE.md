# PROJECT STATE

Sections: §Current Status | §Pool Audit Findings | §Blocked Queue | §Recent Sessions | §Next Session

FindA.Sale is a two-sided marketplace PWA for secondary sale organizers (estate sales, yard sales, auctions, flea markets, consignment) connecting them with shoppers. Backend: Node.js/Prisma/PostgreSQL on Railway. Frontend: Next.js on Vercel.

---

## Current Status

**S945 — QA (2026-06-10). Chrome QA — #422 OAuth 409 bridge, #75 tier lapse, #470 GA4 events. (1) #422 OAuth 409 ✅ — Backend POST /api/auth/oauth returns 409+OAUTH_LINK_REQUIRED when account has oauthProvider=NULL (existing password account). /login?message=... redirect renders correctly. Direct API verification — Google OAuth popup is not automatable in Chrome MCP tab group. (2) #75 Tier lapse ✅ — qa-lapse@example.com dashboard showed "Your Plan: PRO". DB-downgraded to SIMPLE via psycopg2. Refreshed — "Your Plan: SIMPLE" + PRO upgrade prompt visible. (3) #470 GA4 PENDING-DEPLOY — item_viewed confirmed absent from live dataLayer (S944 push not yet executed by Patrick). All 3 GA4 events require S944 push to Vercel before browser verification. BQ: 0 (unchanged).**

**S944 — DEV/QA (2026-06-10). Scraper integration audit + gap fixes + GA4 event fixes + Chrome QA. (1) SCRAPER INTEGRATION AUDIT ✅ — All 7 new scrapers confirmed correctly integrated: registry enabled:true, GH Actions cron in place, no double-firing risk, automatic monitoring via pipelineHealthController. (2) KNOWN_OK_DISABLED fix ✅ — findasale-ci-sentry-health scheduled task updated: 'scrape-storageauctionsnet' added to KNOWN_OK_DISABLED set (parked workflow was triggering false HIGH alert). (3) NAA registry fix ✅ — sourceRegistry.ts NAAFindAnAuctioneer enabled:true→false (Novi AMS JS-rendered platform, confirmed zero records). (4) STORAGEAUCTIONS.NET SCRAPER BUILT ✅ — update.storageauctions.net confirmed WebSocket push server (all REST paths 404). Real API: GET /block/auction/getallonline/{page}/esoon (unauthenticated JSON, ~32 auctions). Full implementation in storageAuctionsNetScraper.ts. Workflow cron: Thursdays 09:00 UTC. Registry entry enabled:true. (5) GA4 EVENTS FIXED ✅ — item_viewed (pages/items/[id].tsx useEffect on item data load), purchase_completed (components/CheckoutModal.tsx in Stripe confirmPayment success branch, includes value+currency+transaction_id), organizer_signup alias (pages/register.tsx fires both organizer_registered + organizer_signup). All 3 were CODE-MISSING per Chrome QA audit. TS 0 errors. (6) CHROME QA — SEO3 /estate-sales/denver-co ✅ FULL VERIFICATION: Title "Estate Sales in Denver, CO | FindA.Sale", meta desc keyword-rich+present, H1 matches, 50 listings visible, dark mode clean, breadcrumbs functional. ss_34924pp42 ss_8168bplgd. #422 OAuth 409 UNVERIFIED (requires real Google OAuth duplicate-account flow). #75 tier lapse UNVERIFIED (requires Stripe webhook). #470 GA4 CODE-ONLY post-fix (browser verification requires live checkout+signup triggers). BQ: 0 (unchanged).**

**S943 — DEV/RECORDS (2026-06-10). Scraper fleet deep expansion — 35+ competitor sites investigated across 4 categories. RESULT: 3 BUILT, 16 PARKED, 5 PROHIBITED. ROOT CAUSE FIXED: Railway build failures (S941+S942 both FAILED) caused by 2 stray lone commas in committed sourceRegistry.ts (sparse array → undefined entries → initScraperCron crash at `sourceDef.enabled`). Root cause: 4-way parallel agent write collision in S942. Fix: sourceRegistry.ts local working tree had both cleaned — needed commit. BUILT: (1) BidSpotter.com — ToS CLEAR, ~35 US auction houses, static HTML via XHR header, Wed 10am cron (scrape-bidspotter.yml), AUCTION_HOUSE. (2) Invaluable.com — public REST API /auction-houses (no auth), 8,158 US auction houses, HAL JSON pagination, Sun 7am cron (scrape-invaluable.yml), AUCTION_HOUSE. (3) AuctionZip — wrapped existing runAuctionZipScraper() in registry adapter (enabled:true, no new cronSchedule — uses GH Actions). PROHIBITED (5): LockerFox (ToS §1.4.2+§1.4.6), GovPlanet (IronPlanet ToS §1.3(c)), GovernmentLiquidation (Liquidity Services + Cloudflare), Proxibid (ATG UUA §10(h)/§11.1(v)/§12), YardSaleSearch (ToS explicit ban — not added to registry). PARKED (16): Bid13 (Drupal AJAX+Socket.io+evercookie), IBidNow (GoDaddy Afternic dead), StorageBattles (StorageTreasures alias), StorageUnitAuctionList (paywall+Cloudflare), Handbid (wrong category: nonprofits), AmericanFleaMarkets (dead domain), FleaMarketDirectory (redirects to USWantads), FleaMarket.com (dead), FleaMarketsNet (GoDaddy Afternic), FleaMarketRover (dead), VendorsByState (dead), NFMAMembers (Wix JS-rendered), SellMyAntiques (Next.js SPA). decisions-log.md rows added for all 5 ToS PROHIBITED entries. sourceRegistry now has 34 entries. TS check: 0 errors. BQ: 0 (unchanged).**

**S942 — DEV/RECORDS (2026-06-10).** Scraper fleet expansion — 5 new sources investigated. RESULTS: (1) PropertyRoom.com ✅ BUILT (S941 cont.) — ~46 law enforcement/gov't agency partners, static `/about-us/partners`, AUCTION_HOUSE, Wed 7am cron. (2) StorageTreasures ✅ PARKED — Next.js SPA, public API hard-capped at 50/36,943 records. (3) StorageAuctions.com ✅ BUILT — found public JSON API (`core-service.auctions.storageauctions.com`), 3,103 US records, no explicit ToS prohibition found, Tue 7am cron, AUCTION_HOUSE. (4) PublicSurplus.com ✅ BUILT — server-rendered HTML + Ajax XML, ~6,330 gov't agency auctions, ToS CLEAR, Tue 8am cron, AUCTION_HOUSE. (5) Municibid.com ❌ PROHIBITED — ToS §(c) explicit dual ban ("automated means" + "scraping"). (6) Fleamapket.com ❌ PROHIBITED — broad ToS anti-automation clause. (7) FleaMarketInsiders.com ❌ PROHIBITED — same clause; site is a wrapper for Fleamapket.com. sourceRegistry.ts now has 7 entries (FleaMarketZone, StorageAuctionsNet, PropertyRoom, StorageAuctionsCom, StorageTreasures, Municibid, PublicSurplus). decisions-log.md updated: 7 ToS decisions logged under S942. BQ: 0 (unchanged).

**S941 — DEV/RECORDS (2026-06-10).** Parallel dispatch: records pass + FB Events burst fix + 7 licensing scraper triage + scraper source investigation + FleaMarketZone scraper build. (1) RECORDS PASS ✅ — S939+S940 PCVs applied to roadmap.md: #27b watermark gating Chr ✅ S940 (PRO locked ss_340873qej, TEAMS unlocked ss_549588e2a); #75 non-lapsed TEAMS label ✅ S940 (ss_5075d8oqc); #422 OAuth partial Chr ✅ S940 (buttons on /login ss_1808g433w + Linked Accounts UI ss_62243gw0x, 409 bridge UNVERIFIED); SEO3 REJECTED — no screenshot ID in S939 evidence, Human QA ⬜ unchanged; #470 already present in roadmap from S939. PCV table cleared. (2) FB EVENTS BURST FIX ✅ — Added 6500ms inter-sub-query delay in search-facebook-events.ts: when usedEngine='searlo', sleep(6500) between sub-queries per metro; non-Searlo fallback engines keep jitterDelay(200,500). Root cause: 3 sub-queries per metro passing through module-level searloThrottle in rapid succession, hitting Searlo's 10/min sliding window. Target: 17% 429 rate → <5%. (3) LICENSING SCRAPERS ✅ 7 scraper files PARKED + 7 workflows hardened — Indiana/Kentucky/Massachusetts/Maine/New Hampshire (cloud IP WAF blocks) + Rhode Island (auctioneer license repealed 2015; scrape-ri-phase2.yml + scrape-rhode-island-licensing.yml both hardened). NH bonus: businessCategory 'auctioneer'→'AUCTION_HOUSE' bug fixed (was silently rejecting every NH record). All 7 workflows: continue-on-error: true. 13 files total in commit 665c2954. (4) SCRAPER SOURCE INVESTIGATION ✅ — 5 sources evaluated: MaxSold (PROHIBITED — explicit no-scraping clause), GovDeals (PROHIBITED — explicit spider/crawler ban), StorageTreasures (GRAY/CAUTION — MySpace-era automated-use boilerplate, robotsAllow:true; Patrick decision pending), StorageAuctions.net (CLEAR but AngularJS SPA — PARKED), FleaMarketZone (CLEAR — built). PropertyRoom: ToS CLEAR but site overloaded during investigation; re-evaluate when site recovers. decisions-log.md updated: 5 locked ToS decisions under '## 2026-06-10 (S941)'. (5) FLEAMARKETZONE SCRAPER ✅ BUILT — WordPress/WPBDP plugin site, 51 US regions (~1,050 venues), Monday 6am cron (scrape-fleamarketzone.yml), businessCategory: 'FLEA_MARKET', 0.3 req/sec. Registered in sourceRegistry.ts. (6) STORAGEAUCTIONS.NET — BUILT + PARKED (AngularJS SPA: empty ng-app shell, zero static data). Clean early-return. Workflow created, schedule commented out. Unpark path: Playwright/Puppeteer or REST API at update.storageauctions.net. BQ: 0 (unchanged).**

**S940 — QA/DEV/OPS/MONITORING (2026-06-10). Parallel dispatch: monitoring harden + OPS verification + Chrome QA + 2 dev fixes. PUSH BLOCK PROVIDED. (1) MONITORING HARDEN ✅ — findasale-ci-sentry-health Step 1c patched: KNOWN_OK_DISABLED={'scrape-google-places','scrape-naa'}; disabled_manually workflows not in allowlist now alert HIGH. S939 silent-failure gap (pipeline-outreach-emails dark 5 days) is now closed. (2) FB EVENTS VERIFIED: first post-overhaul daily run — 20.4 min (above 19-min target), 167 Searlo OK + 45 Searlo 429 (17% fallback) + 90 Serper backups. AUCTION/FLEA events landing. No data loss (Serper catches 429s). Runtime concern: sub-query bursts hit Searlo 10/min cap in some metros — Patrick Searlo credit decision still open. (3) OUTREACH: outreach_sent_24h=0 — pipeline-outreach-emails was re-enabled S939 but GitHub cron hadn't re-registered yet (last fired June 5). Fix: trivial comment added to workflow YAML in push block to force cron scheduler re-registration. (4) MONITORING COVERAGE: 123 workflows, 2-page pagination ✅, 122 active + 1 known-OK disabled (scrape-google-places). (5) LICENSING SCRAPERS — 7 consistently-failing scrapers escalated LOW→MEDIUM: Indiana/Kentucky/Massachusetts/Maine/New Hampshire/Rhode Island/Nebraska (structurally broken — multiple consecutive failures). ~24 others succeeding. (6) PRINT KIT P1 FIXED: downloadAuthenticatedFile used localStorage.getItem('token') after httpOnly cookie migration → 401 on all PDF downloads. Fixed: credentials:'include' + Next.js /api proxy URL stripping absolute Railway origin. (7) NODE.JS CI FIX: scrape-ok-phase2.yml + scrape-wy-phase2.yml: github-script@v6→@v7. Rest of fleet already on @v4/v7. (8) CHROME QA — #27b watermark gating ✅ (PRO locked ss_340873qej, TEAMS unlocked ss_549588e2a); PDF download was P1 → fixed this session. #75 non-lapsed subscription display ✅ (TEAMS label correct ss_5075d8oqc); lapse P2 UNVERIFIED (Stripe webhook can't simulate in QA). #422 OAuth buttons on /login ✅ (ss_1808g433w) + Linked Accounts UI ✅ (ss_62243gw0x); 409 OAuthBridge UNVERIFIED. BQ: 0 (unchanged).**

**S939b — DEV/OPS/MONITORING (2026-06-10). FB Events scraper complete overhaul + silent-failure monitoring buildout + outreach P0 caught & fixed. ALL CODE PUSHED + LIVE. (1) QA: SEO3 /estate-sales/denver-co Chrome ✅ (H1 "Estate Sales in Denver, CO", 50 listings, JSON-LD BreadcrumbList+ItemList, self-referencing canonical). #470 GA4 RUNTIME-VERIFIED ✅ (dataLayer captured shopper_favorite_added on a live favorite as seed shopper; full GA4 Real-Time still needs the GA4 dashboard). (2) FB EVENTS OVERHAUL — Searlo wired as PRIMARY engine (geo-accurate 90–100% in-metro, ~$0.30/1k, pay-as-you-go no-expiry) ahead of Serper→Brave→ScaleSerp. Brave TESTED + REJECTED as primary (geo-blind — identical national results for every metro). Researched DataForSEO/Searlo/others; Searlo chosen (cheapest geo-accurate; GitHub-Actions self-host ruled out — SearXNG geo-blind + Google blocks datacenter IPs). Query split into sale-type sub-queries (fixed flea/auction being crowded out of the single 9-term query's top-10), then trimmed 4→3 (consignment folded into estate) for a sub-19-min daily runtime. extractFbEventId fixed to parse the trailing 8+ digit id on slug-form FB URLs (was grabbing the street number → corrupted dedup). Flea classifier fixed (keys on snippet + sub-query typeHint, not just title). Metro list expanded 93→301, derived from GOOGLE_PLACES_METROS (single source of truth); daily sharding ~43 metros/day (full list cycled weekly); cron flipped weekly→daily. Searlo rate-limit handling added: throttle preset via SEARLO_RPM env (default 9; free-tier cap 10/min, learned live via 429), honors retryAfter + retries Searlo once before falling back to Serper. Added all_metros workflow_dispatch toggle for manual full backfill. Live-verified on real runs: Searlo geo-accurate, flea-market events now landing (were 0), runtime within budget. NOTE: current Searlo key is FREE tier (~3,000 credits/90 days ≈ ~17-day runway; 10/min cap) — buying a $3.99+ pack lifts the cap (then bump SEARLO_RPM repo Variable). (3) MONITORING BUILDOUT — audited all workflows, two shapes: 8 "inline" (print counts → log-grep-able) + ~11 "trigger" pipelines (curl→202 fire-and-forget, work runs server-side on Railway → need DB check). Built GET /api/internal/pipeline-health (per-source/per-pipeline freshness counts, gated by x-internal-secret / OUTREACH_SECRET) — DEPLOYED + live-tested. Extended the daily findasale-ci-sentry-health task: Step 1c all-workflow staleness sweep (silent-stop detector), Step 1d pipeline data-freshness (green-but-empty detector, calls the new endpoint), Step 1b FB Events deep health (runtime/429/Serper-bleed/credit-runway). Repo confirmed 123 total workflows (122 active, 1 intentionally disabled = scrape-google-places). (4) P0 CAUGHT + FIXED — `pipeline-outreach-emails` GitHub Actions workflow found MANUALLY DISABLED since June 5 → cold outreach fully DEAD ~5 days (0 sends since Jun 5 07:59 UTC, 42 leads stalled, no fallback path; its in-process cron was deliberately removed). Re-enabled the workflow (now active); confirmed OUTREACH_ENABLED=true on Railway. Resumes on the next 4-hour cron. This is the exact "green but silently stopped" failure the new monitoring now catches. Files (all pushed + live): search-facebook-events.ts, run-search-facebook-events.ts, scrape-facebook-events.yml, pipelineHealthController.ts, routes/internal.ts. BQ: 0 (outreach P0 opened AND resolved this session).**

**S939 — OPS/DEV (2026-06-10). Daily Email & Deliverability Health Sweep → multi-fix deliverability hardening. ALL CODE PUSHED + LIVE.** Sweep mostly GREEN: finda.sale 200, backend root + /api/health 200, DNS SPF/DMARC/MX(improvmx + outreach→google)/DKIM(resend root, google outreach, litesrv→mlsend) all present, Sentry 0 email-send errors/24h, Gmail quota 6/1500, EmailSuppression flat (5 rows). (1) FALSE-ALARM P0 diagnosed + fixed — the "🔴 Gmail OAuth token BROKEN" alert was NOT real. Root cause: gmailHealthCron.ts (S887) probed the token with gmail.users.getProfile, which needs a READ scope; the prod token is send-only (gmail.send, correct least-privilege) → 403 "Insufficient Permission" every run = false "pipeline dead" alarm. Proven live: refresh token refreshes fine, granted scope = gmail.send, Gmail-rail smoke tests delivered same morning. Only became visible 06-10 because the Resend alert rail itself was just fixed S937. FIX (live): gmailHealthCron.ts now probes via oauth2Client.getAccessToken() (send-scope-only). Patrick does NOT need to re-auth — sending works. (2) @system.finda.sale placeholder leak fixed (bounce-flood root cause) — outreachEmailsCron.ts called gmail.users.messages.send DIRECTLY, bypassing the central emailService isEmailDomainBlocked guard, so it could send to scraper placeholder addrs (scraper+<slug>@system.finda.sale) → Google DSN flood that tripped the ImprovMX 500/day cap. FIX (live): added isEmailDomainBlocked guard before the atomic claim/quota/send (skips blocked/placeholder recipients; no SENT row, no quota burn). Complements S929/S937d (which guarded seeders + the chokepoint but not this cron's direct-send path). (3) Resend webhook (bounce/complaint/suppression ingestion) was broken FOUR ways — all fixed + LIVE e2e-verified: (a) RESEND_WEBHOOK_SECRET set in Railway; (b) handler checked email.complaint but Resend sends email.complained → fixed + added email.suppressed (hard block) + email.failed (log); (c) CSRF exemption matched /webhook but path is /resend-webhook → CSRF 403'd every POST, fixed in middleware/csrf.ts; (d) global express.json() ate the raw body before svix could verify → registered express.raw for /api/outreach/resend-webhook before the json parser in index.ts; (e) handler read payload.email/bounce_type but real Resend payloads nest under data.to[]/data.bounce.type → extraction now reads data.to (loops all recipients), data.bounce.type (Permanent→hard, Transient→soft), data.email_id, flat-shape fallback kept. LIVE E2E vs prod with real Resend-shaped payloads: valid signed → 200; tampered sig → 401; email.complained wrote a real EmailSuppression row; hard bounce set bounceHard; email.delivered reset the counter. Test rows cleaned up. (4) Soft-bounce policy upgraded to industry standard (was one-strike-blocks-marketing-forever). Added EmailSuppression.bounceSoftCount Int @default(0) (migration 20260610143000_add_bounce_soft_count, applied to Railway). Soft bounce → increment; email.delivered → resetSoftBounce (clears count + bounceSoft); BULK gate isSuppressed now blocks only at bounceSoftCount >= 5 (SOFT_BOUNCE_THRESHOLD); TRANSACTIONAL isHardSuppressed unchanged (hard-bounce + complaint only). email.suppressed now maps to a real hard block. DB: 0 soft-bounce-only suppressions exist → nothing to retry; default 0 means none affected. (5) Resend webhook endpoint created in the Resend dashboard (Patrick) subscribed to email.bounced/complained/suppressed/failed. Resolves S937 gmail-rail-audit follow-up #2 (bounce ingestion catching 0 rows — now explained + the Resend path actively ingests). Files (all live): outreachEmailsCron.ts, gmailHealthCron.ts, routes/outreach.ts, middleware/csrf.ts, index.ts, suppressionService.ts, schema.prisma, migration 20260610143000_add_bounce_soft_count. BQ: 0 (unchanged — no blockers added; optional Gmail outreach-token re-auth is non-blocking since sending works).**

**S938 — DEV/OPS (2026-06-10). Email-rail hardening + bounce-ingestion fix + LIVE verification. (1) SES→GMAIL rename SHIPPED + LIVE-SMOKE-TESTED: 44 backend files — every Gmail-rail `from` now `process.env.GMAIL_FROM_EMAIL || SES_FROM_EMAIL || 'find@outreach.finda.sale'` (dual-read; Patrick set GMAIL_FROM_EMAIL=find@outreach.finda.sale in Railway, kept SES_FROM_EMAIL for transition); ~52 dead `@send.finda.sale` fallbacks (legacy AWS-SES domain, no Google DKIM) retired to the verified alias; workspaceController hardcoded invites@send.finda.sale → Resend default; stale comments in emailService/transactionalEmailService fixed. Backend tsc 0 errors. Resolves S937 gmail-rail-audit follow-up #1 (the var was the P0 footgun). Smoke test ✅ E2E: live finda.sale/contact submit → 200 + form cleared → autoreply delivered from find@outreach.finda.sale to INBOX (not spam), Gmail thread 19eaf520fef6931a @ 02:17 UTC. (2) BOUNCE-INGESTION (#471) FIXED + VERIFIED: moved processBounces off the unreliable in-process node-cron onto GitHub Actions → JOB_MAP 'process-bounces' + new .github/workflows/pipeline-bounce-suppress.yml (the pattern every other email job uses); broadened DSN query + isolated messages.trash try/catch. Patrick pushed + ran workflow; Railway log confirms job now RUNS (`[InternalJobRunner] process-bounces` 433ms, clean) — the cron-never-fired root cause is fixed. Token introspected LIVE via Railway: GMAIL_MAILBOX_REFRESH_TOKEN authenticates outreach@finda.sale with full https://mail.google.com/ scope ✅ (mailbox + scope both correct — no env change needed). 0 suppressions = CORRECT: the only mailer-daemon DSNs present (201) are ALL in Trash (Patrick's manual cleanup of the @system flood that was forwarding into deseee@gmail.com — NOT an auto-filter) and every sampled one targets our own @system.finda.sale scraper addresses (zone-blocked S937d, parser-ignored). No real external bounces exist to suppress; real ones land in inbox where the query catches them → NO further fix needed. (3) #332 Shopify DEFERRED (Patrick) — removed from Blocked Queue. (4) Caught + restored a truncated working-tree sales.ts (461 lines, cut mid-statement at `console.er`, #450 recurring endpoint missing) from HEAD before it could be committed — the already-pushed rename commit never contained it. BQ: 1→0.**

**S937 — RESEARCH/AUDIT→DEV (2026-06-09). Email/outreach/scraper SYSTEM MAP built (`claude_docs/feature-notes/email-outreach-scraper-system-map.md`) + P1 suppression gap fixed. THREE rails documented: (A) Gmail-API bulk via `lib/emailService` (cap 1500/day, GMAIL_DAILY_HARD_LIMIT); (B) Resend transactional via `lib/transactionalEmailService` — suppression check before EVERY send ✅, S936 `RESEND_FROM_EMAIL ?? noreply@finda.sale` default confirmed present; (C) Gmail outreach via `outreachEmailsCron` from outreach@finda.sale. CORRECTED STALE PREMISE: Gmail is NOT suspended (active per S917/S929/S933, 658 sent); outreach NOT dead — pipeline crons run via GitHub Actions → POST /api/internal/jobs/run (internalJobRunnerController JOB_MAP), in-process init*Cron is dead code. NO P0 found (brief's 'outreach dead=P0' contradicted by code+evidence). FIXED P1 (G3): 8 bulk lifecycle services sent via Gmail with NO suppression check (saleAlert/priceDrop/wishlistMatch/saleLive/presaleSneakPeek/smartFollow/followerNotification/onboarding) — added `suppressionService.isSuppressed` guard before each send; push+in-app left intact on the 2 loop services. Backend TS 0 errors. OPEN P1 (G1→BQ): all 9 Resend-rail callers override `from:` with `@send.finda.sale` (SES domain, Resend-DKIM status unverified) → transactional receipts/payouts/resets may fail DKIM; touches auth+payment (red-flag gate) → Patrick DNS decision. G4 carry: Railway RESEND_FROM_EMAIL=support@finda.sale unwarmed. BQ: 1→2.**

**S936 — QA/RECORDS (2026-06-09). Chrome QA sweep: SEO3 /estate-sales/denver-co ✅ (H1, 50 listings, BreadcrumbList schema.org, canonical confirmed); #472 send-test-email CODE works (Resend success:true + messageId 7caa79e3) but email arrived in Yahoo SPAM from support@finda.sale — root cause: RESEND_FROM_EMAIL set to support@finda.sale, unwarmed domain at Yahoo; BUG FIX: admin.ts hardcoded hello@send.finda.sale fallback removed + RESEND_FROM_EMAIL gate added; transactionalEmailService.ts FROM_DEFAULT changed to process.env.RESEND_FROM_EMAIL ?? noreply@finda.sale (was hardcoded hello@send.finda.sale — wrong domain for Resend DKIM); #463 UNVERIFIED (no unclaimed organizer profile URL accessible in QA env); #164 Tiers ✅ (Alice shows TEAMS $79/mo at /organizer/settings → Subscription). Records pass: S935 PCVs applied to roadmap (#317 ⚠️ S936 graceful fallback only, #470 CODE-ONLY S936). BQ: 1 (unchanged). Patrick action needed: add RESEND_FROM_EMAIL=noreply@finda.sale to Railway env OR warm support@finda.sale via Yahoo/Google Postmaster.**

**S935 — DEV/QA (2026-06-09). RETAIL suppression filter SHIPPED: query/SEO-layer suppression in sales.ts /by-city route — Canadian province gate (13 codes), clean-suffix allowlist (17 suffixes), business-keyword blocklist, duplicate deduplication by title, 300-row fetch pre-suppression. ~3,288 clean rows from 7,692 (Estate Sale Company/Consignment/no-suffix junk buckets suppressed). P3 QR print kit FIXED: ?scan=true → ?via=qr (2 occurrences print-kit/[saleId].tsx L720/L876 via Python bash) — printed QR codes now trigger auto-claim + XP. SEO3 SHIPPED: pages/estate-sales/[city-slug].tsx (dynamic ISR, 15 markets prebuilt, fallback:blocking) + server-sitemap.xml.tsx updated (priority 0.85); /estate-sales/denver-co live on next Vercel deploy. #472 POST /admin/send-test-email SHIPPED: 79 lines added to routes/admin.ts, Resend default rail, admin-gated, returns {success,messageId,rail}. Roadmap corrections: #471 confirmed SHIPPED pre-S926 (bounceSuppressService.ts daily cron 06:00 UTC, index.ts L802-814), #423 confirmed DEPLOYED S726 (migration applied Railway DB, psycopg2 verified), #335 already ✅ S865 (correct). BQ: 1 (unchanged). PCVs staged.**

**S934 — RESEARCH/DEV (2026-06-09). Scraper coverage for 459 zero-record city×category SEO pages. Third-party auction/venue sources BLOCKED: HiBid ToS §7 prohibits scraping/aggregation (legally blocked — ADR written), US YellowPages.com ToS §2.1 prohibits data mining (NO-GO, no code), AuctionNinja dated listings are JavaScript-rendered (fetch+cheerio sees only static company-directory nav — needs headless browser, no GitHub scraper exists). PIVOT to own-pipeline fills (all legal): RECLASSIFICATION APPLIED to production — reclassify-mistyped-sales.ts flipped 651 mislabeled EstateSales/GarageSaleFinder events → AUCTION (saleType AUCTION 97→748 confirmed in DB) + 217 YARD→ESTATE (excludes places-API business listings). FB Events query WIDENED (flea market/swap meet/public+online auction/consignment added) and PLACES_QUERIES +5 flea synonyms (Foursquare/HERE pick up next monthly run) — both pending push. Flea-org backfill SHELVED on data quality (583/600 orphan FLEA organizers were individual vendor booths, 443 piled on 2 New Orleans coords). DB audit (read-only): only 97 AUCTION records existed nationwide pre-fix (NYC/Houston/Chicago/LA all had 0); GOOGLE_PLACES_METROS (300 metros, plain string[]) confirmed comprehensive — no genuinely-missing US metros. RETAIL data-quality audit done (7,692 rows, ~17% junk min, 1,478 dupes, 1,842 Canadian — recommend query/SEO-layer suppression → ~3,288 clean). BQ: 1 (unchanged).**

**S932 — RECORDS (2026-06-09). Records pass: Applied S931 PCVs to roadmap.md — #462 Attribution E2E Chr ✅ S931 (only column that needed update; others already ✅). #455 Notify Me updated to full E2E S931 (migration applied note added). Hunt Pass BQ item RESOLVED — Patrick confirmed /shopper/dashboard stats bar shows "1.5x XP" on live site. BQ: 6→5.**

**S930 — QA (2026-06-09). Records pass (applied S925 PCVs to roadmap.md: logout flow Chr✅, #463 claim-click CODE-ONLY note). DB migration: decoded 4 HTML-encoded category rows in Railway DB (Electronics & Technology, Lamps & Lighting, Home Décor, Jewelry & Watches). Chrome-verified HTML entity fix at /organizer/insights ✅ (no &amp; or &#233; entities visible). Autonomous QA sweep: organizer dashboard (Alice) ✅, shopper dashboard (Leo Thomas) ✅, Explorer Profile ✅, Explorer's Guild rank label #123 ✅ at /shopper/ranks, Hunt Pass active state #199 ✅ at /shopper/hunt-pass. 6 PCVs staged for S931 records pass. ⚠️ P3 new BQ item: Hunt Pass multiplier display inconsistency (dashboard "2x XP" vs /shopper/hunt-pass "1.5x XP"). Gmail DSN cleanup: 104 mailer-daemon bounce threads trashed from outreach inbox. BQ: 5→6.**

**S929 — BUG/OPS (2026-06-09). Sentry error triage + outreach placeholder fix. Reviewed Gmail bounce flood. VACUUM ANALYZE on Sale + Organizer tables (NODEJS-10, NODEJS-2Y table bloat). Added 2 DB indexes: Sale(status,isInventoryContainer,endDate) for NODEJS-3E + Organizer(contactEmail,isUnmanagedListing) for NODEJS-38. Created migration file. Fixed @system.finda.sale scraper placeholder domain missing from PLACEHOLDER_DOMAINS set in 3 outreach seeder files (autoSeedOutreachCron.ts, seedDirectoryClaimEmails.ts, backfill-warm-emails.ts) — was queueing outreach to our own scraper-generated addresses, causing bounce DSN flood through ImprovMX (500/day limit hit). 0 bad rows in DirectoryClaimEmail confirmed before fix. Patrick pushed + Railway redeployed + ran prisma migrate deploy. Sentry: 10 → 5 unresolved issues (NODEJS-1A/2N/32/3D cleared by VACUUM+redeploy). ImprovMX 500/day limit: caused by @system.finda.sale bounce notifications — stops now that fix is deployed. NODEJS-1G (scraper fallback LIKE address match) still periodic — needs take limit or trigram index, monitoring next session. BQ: 5 (unchanged).**

**S927 — QA (2026-06-08). Autonomous QA continued: #79 Earnings Counter Animation ✅ (insights widget shows $220 revenue, 42.9% conversion, ss_3082qg908; animation not capturable via SSR). #164 Tiers ✅ (Bronze badge + "1/4 sales until next tier" on organizer dashboard, ss_01384hjx7). #316 Referral Tranche Anti-Fraud ✅ (/organizer/referrals: link visible, 1 referred org tracked, DB fraudReviewStatus=CLEAR + TRANCHE_A/B awarded Jun-5, ss_1143gl3d4). P2 bug found: HTML-encoded category names in DB render as literal entity strings in insights Items by Category. BQ: 5→6.**

**S926 — ANALYTICS/GA4/WRAP (2026-06-08). Root cause of zero GA4 data since launch: CSP in next.config.js blocked googletagmanager.com (script-src) and google-analytics.com (connect-src) — every browser silently dropped all analytics traffic. Fixed both CSP directives. Deployed and verified: GA4 Realtime shows 1 active user in Michigan post-fix. Secondary bug fixed: CookieConsentBanner.handleAccept() now calls window.gtag('consent', 'update', ...) directly (storage event is cross-tab only — ConsentBridge never heard same-tab accepts). Answered Patrick automation meta-question. Added 4 new roadmap entries: #465 Tier 4 LIVE, #470 GA4 conversion events, SEO3 Denver city landing pages, #471 bounce suppression auto-ingestion, #472 email send automation. BQ: 5 (unchanged).**

**S925 — QA (2026-06-08). P1 CSRF fix re-verified: POST /api/outreach/page-view returns 200 for unauthenticated callers (JS fetch credentials:'omit') — S924 fix confirmed live. Logout flow verified: Leo Thomas (user5) desktop user dropdown at /shopper/dashboard → clicked Logout → redirected to /login (ss_49305bl2y), nav shows Login button, /shopper/dashboard → 302 → /login?redirect=/shopper/dashboard (ss_581555xvt) — session fully cleared. #463 claim-click: CTA click confirmed (organizer profile → /register?claim=cmp0jq4j700mnoz89rdjmih15, ss_6367qcmy3), Analytics SDK confirmed initialized in _app.tsx, CODE-ONLY (beacon delivery unverified). BQ: 5 (unchanged).**

**S924 — QA/BUG (2026-06-08). P1 CSRF bug found and fixed: POST /api/outreach/page-view and /outreach/unsubscribe returned 403 for all unauthenticated callers — validateCsrfToken had no exemption for these public endpoints. Fix: added outreach block in csrf.ts between auth and Bearer checks. Pushed to GitHub commit 44dabb618ef1e53256450e8904ef0b191033de0d (Railway auto-deploying). #462 roadmap notes updated (CSRF bug + fix documented, Pending Chrome QA). #138 roadmap title corrected to actual enums (ESTATE/YARD/AUCTION/FLEA_MARKET/DORM_DASH — CHARITY/BUSINESS/CORPORATE never implemented). #318 affiliate: XHR confirmed firing, eligibility gate working (toast visible), UNVERIFIED (cannot fully test without paid sale). BQ: 5 (unchanged).**

**S923 — RECORDS/WRAP (2026-06-08). Records pass complete. All S920/S921/S922 PCVs applied to roadmap.md: #196 Buying Pools Chr ✅ S922, #201 Favorites Chr ✅ S922, #198 Reviews Chr ✅ S920, #210 Streaks Chr ✅ S921. patrick-dashboard.md updated (BQ=5, records pass summary). Chrome QA not started — extension not connecting. BQ: 5 (unchanged).**

**S922 — QA (2026-06-08). All 4 S921 fixes Chrome-verified live RESOLVED (commit 7058d99c, Vercel READY). #196 Buying Pools ✅ — "Split this purchase" card renders on $169 Zoom B3 item, correct split math, Start a Pool CTA (ss_5769b4ui3); negative test $25 item shows no card. #201 Favorites ✅ all 3 — Items(1) count matches single item favorite, Saved Sales section shows sale-favorite, /shopper/collections → 302 → /shopper/wishlist (ss_37941eelg, ss_1509jponw). SEC-001 ✅ — admin.ts demand-signals parameterized (Prisma.sql bound ${city}/${minCount}, Prisma.empty), page loads as admin with 11 real patterns no error. SEC-002 ✅ — items.ts scoped multer (uploadImages JPEG/PNG/WebP/GIF 25MB on POST /api/items; uploadCsv 10MB on imports), valid types pass; add-items page loads clean. BQ: 9→5. ⚠️ Workspace bash DOWN all session (disk full) — roadmap.md PCVs (#210 S921 + #196/#201/SEC-001/SEC-002 S922) + patrick-dashboard.md NOT updated; must be applied S923 with working bash (see Next Session).**

**S921 — QA (2026-06-08). Applied #198 Reviews PCV to roadmap. DEV: #196 Buying Pools fix (BuyingPoolCard.tsx threshold > 100), #201 Favorites 3 bugs fixed (favoriteController + wishlist.tsx + new collections.tsx), SEC-001 SQL injection fix (admin.ts Prisma.sql), SEC-002 multer scoped instances (items.ts). QA: #210 Streaks Chrome-verified (Streak 6, XP 2025, Hunt Pass 2x XP). All 4 code fixes pending push. BQ: 9 (unchanged).**

**S920 — QA (2026-06-08). Shopper flow QA: #198 Reviews ✅ Chrome-verified. #196 Buying Pools root cause found (shouldShow threshold 100x too high). #201 Favorites 3 P2 bugs found. #335 BQ corrected (outreach NOT suspended). DB cleanup done. BQ: 7→9.**

**S919 — QA/WRAP (2026-06-08). #230 SmartBuyerWidget confirmed rendering + RESOLVED from BQ. #380 Apify deferred (roadmap updated). #335 Jane Thrift removed (fictional account). BQ: 7→5.**

**S918 — DEV (2026-06-07). Resend transactional email rail built. Gmail SPOF resolved. BQ: 7 (unchanged).**

**Completed:** (1) bounceSuppressService verified: EmailSuppression has 5 rows (no bounce-type suppressions — expected, inbox was cleared S917 and the Jun-5 wave hasn't bounced back yet; service is configured and running correctly). 0 sends in last 24h → outreach paused during S917 inbox triage, re-enabled with OUTREACH_ENABLED=true. (2) Resend transactional email rail built: new `packages/backend/src/lib/transactionalEmailService.ts` created using Resend SDK. 9 callers migrated from Gmail to Resend: authController.ts (2 calls — password reset + verification), routes/auth.ts (2 calls — magic link + resend verification), stripeController.ts (6 calls — receipts + payout confirmations + subscription notices), posController.ts (4 calls — POS receipts + invoices), terminalController.ts (2 calls — in-person receipts), workspaceController.ts (1 call — workspace invites), messageEmailService.ts (1 call — direct messages), consignorEmailService.ts (3 calls — consignor notifications), tierLapseJob.ts (1 call — subscription lapse). Backend TS check: 0 errors. (3) S913 P2 Gmail SPOF → RESOLVED: critical transactional email now on dedicated Resend rail that survives Gmail suspension. Gmail/emailService stays as bulk/marketing rail (40+ remaining senders untouched). **No setup required:** `send.finda.sale` is already verified in Resend (used by quota alert emails); `RESEND_API_KEY` already in Railway. FROM address corrected to `hello@send.finda.sale`. Push and it works. **Push block below.**

**S917 — OPS (2026-06-07). Gmail inbox triage complete. All 1,415 mailer-daemon bounce notifications cleared from outreach@finda.sale inbox (0 mailer-daemon messages remain). OUTREACH_ENABLED=true confirmed set on Railway. outreachEmailsCron.ts ARCHIVED exclusion fix confirmed live (commit ed8aa97d). Auto-forwarding quota to deseee@gmail.com unblocked. BQ: 7 (unchanged).**

**S916 findings:** Patrick ordered investigation of a Sentry ingest address appearing in email bounces. Chrome MCP audit of outreach@finda.sale Gmail confirmed: (1) NO Sentry forwarding filter exists in Gmail settings — Filters tab is completely empty; (2) Forwarding tab shows only deseee@gmail.com (the S915 forwarding we set up); (3) Gmail API sends are working — Sent folder has 8,919 messages including 2 successful sends tonight (7:31 PM). The "mailer-daemon" bounces in the outreach inbox are Gmail's AUTO-FORWARDING service failing — the inbox has 1,415 messages being forwarded to deseee@gmail.com, which saturates Gmail's daily forwarding quota. This is a noise issue, not an API delivery issue. ROOT CAUSE of the Sentry bounce: the outreach cron had a corrupted DirectoryClaimEmail record — "Kaff's Bake Shop" (id=cmp3nh7yy0041kbtjgb8aci4v) stored `u002F802d7a4fd3f743ec907da8badf47bec3@o1378064.ingest.sentry.io` as its contact emailAddress. The cron sent 3 outreach emails to this Sentry ingest address (May 27/May 30/Jun 4). Sentry received the unexpected emails and sent bounce notifications back. FIX: ARCHIVED that record in Railway DB — confirmed via psycopg2 (`status='ARCHIVED'`). NEXT: push outreachEmailsCron.ts ARCHIVED exclusion fix (coded prior session), then set OUTREACH_ENABLED=true. BQ: 7 (unchanged).

**S915 — OPS (2026-06-07). Railway ✅ deployed (0b9752bc). /api/health ✅ live. bounceSuppressCron ✅ registered. S913 [P3] /health RESOLVED. Gmail OAuth ✅ RESTORED S915: old token recovered from Jun-6 backup, transactional email working. Mailbox ops COMPLETE S915: (1) GMAIL_MAILBOX_REFRESH_TOKEN obtained (https://mail.google.com/ scope, OAuth Playground via qualified-cedar-496114-v1 client) + stored in Railway; (2) outreach-mailbox-ops.js updated to prefer GMAIL_MAILBOX_REFRESH_TOKEN; (3) 77 bounce messages (from:mailer-daemon subject:"one step from going live") moved to Trash; (4) auto-forwarding outreach@finda.sale → deseee@gmail.com ENABLED (confirmed via Gmail Settings banner). BQ: 7 (unchanged). S913 Noted Finding P1 (Gmail REFRESH_TOKEN broken) → RESOLVED S915.**

**S913 — OPS/EMAIL HARDENING (2026-06-07). Email-system audit + monitoring automation + task-fleet consolidation.** (1) Audited S912 kill-switch — sound + already live on `main` (the "Push pending" note was stale). Knock-on found: only 3 of ~40 Gmail-rail senders (`emailService.emails.send`) were gated. Dispatched dev → gated 8 proactive bulk jobs behind OUTREACH_ENABLED via new `utils/bulkEmailGate.ts` (weeklyEmailJob, notificationJob, presaleSneakPeekJob, curatorEmailJob, organizerWeeklyDigestJob, monthlyTrendReportJob, tierLapseJob warning-cron, abandonedCheckoutJob) — Patrick pushed, redeploying. Transactional + opt-in event mail intentionally left ungated. (2) NEW daily scheduled tasks: `findasale-email-delivery-health` (06:07, 14 checks A–N) + `findasale-ops-cost-guard` (05:10 — deploy health, Google-Maps cost guard, smoke test, backup verify). Both ran clean once (⚠️ caught 5 stale Vercel deploy failures + an UptimeRobot blip — both pre-known/recovered). (3) Task-fleet consolidation: RETIRED `context-freshness-check` (→friction-audit) + `ux-spotcheck` (→full-site-audit new Phase 5); NARROWED `health-scout` to security+code-quality; KEPT `ci-sentry-health` (owns CI+secrets+all-Sentry) + `brand-drift`. (4) ImprovMX root alias `outreach@finda.sale → deseee@gmail.com` LIVE. (5) Workspace account confirmed ACTIVE (sending ~200/day, zero suspension/OAuth/quota alerts in 20d inbox scan). **PENDING → S914 (blocked this session: no Railway CLI/MCP/creds):** run `scripts/outreach-mailbox-ops.js` to (a) trash the Jun-6 abandoned-signup bounce backlog (targeted query `from:mailer-daemon subject:"one step from going live"`) and (b) enable auto-forwarding on the outreach@finda.sale Workspace mailbox (address already verified by Patrick); then test forwarding end-to-end. BQ unchanged (7).

**S912 — BUG MODE (2026-06-07). Email kill-switch audit complete. Root cause of June 6 continued sends: `outwardEmailAutomationsJob.ts` had no OUTREACH_ENABLED gate (daily 10:00 UTC cron runs independently of outreachEmailsCron.ts). 3 fixes shipped: (1) `outwardEmailAutomationsJob.ts` — OUTREACH_ENABLED gate added at cron callback top, blocks all 5 outward services in one check; (2) `abandonedSignupEmailService.ts` — OUTREACH_ENABLED gate added + `isUnmanagedListing: false` filter added to candidate query (scrapers set isUnmanagedListing=true, so scraped organizers were being targeted by the 1h signup nudge); (3) `saleEndingSoonJob.ts` — OUTREACH_ENABLED gate added + in-memory DAILY_EMAIL_CAP removed (same restart-prone root cause as June 5 blast) + QuotaExceededError early-exit added to inner catch block. Audited 4 additional services (postSaleRecapEmailService, reviewRequestEmailService, winBackEmailService, onboardingEmailService) — all clean, no action needed. BQ unchanged (7). Push pending.**

**S911 — RECORDS (2026-06-07). S910 PCVs audited — all 23 map to rows already chr ✅ from prior sessions or admin infrastructure pages (no roadmap rows). No roadmap column changes applied. PCV table cleaned (32 rows removed: S905/S906/S909/S910). roadmap.md Last Updated header updated. BQ unchanged (7). Below ceiling — DEV mode available.**

**S909 — QA MODE (2026-06-07). Records pass: confirmed no roadmap updates needed for S908/S905/S906 PCVs (all map to rows already chr ✅ from prior sessions — cross-session rule satisfied). P3 inline fix: FlashDealForm.tsx — added X/close button + Escape key handler (Python via bash, 0 TS errors). Chrome QA sweep (all as Alice user1@example.com): /organizer/appraisals ✅ (heading, Submit button, tabs, empty state ss_6653l8dfe), /organizer/flip-report ✅ (60% sell-through, $325 revenue, 3/5 sold, Category Breakdown table ss_2720usq8g, ss_71199syzr), /organizer/consignors ✅ (heading, + Add Consignor, empty state ss_3604boua6), /organizer/qr-codes ✅ (QR Scan Analytics, 3 KPI cards, Scanner Funnel ss_68576clbw), /organizer/reputation ✅ (Score 0.1/5.0 real data, Reputation/Reviews tabs, New Organizer Badge ss_2693dz51y). Flash Deal modal close BQ entry RESOLVED (X button shipped). BQ: 8→7. Below ceiling — DEV mode available next session.**

**S908 — QA MODE (2026-06-07). Records pass: S907 PCVs applied to roadmap.md (4 rows — H-002 RESOLVED, Bounty E2E chr ✅, Explorer's Guild URL chr ✅, Pricing chr ✅). Dev: /organizer/sales/[id]/flash-deals.tsx NEW PAGE created (TS 0 errors). QA findings: Flash Deal button ✅ CONFIRMED WORKING (false positive — gated on PUBLISHED sale, ss_0053mz6eh). Social Posts button ✅ CONFIRMED WORKING (false positive — "Social Media Post" modal with platform selector, ss_8620q0mej). NEW P3: Flash Deal modal missing close/X button. New Chrome verifications: Print Kit ✅, Boost Sale ✅ "Sale Bump" modal, Holds ✅, /organizer/sales ✅, /organizer/plan/[saleId] ✅, /organizer/command-center ✅, /organizer/checklist/[saleId] ✅. BQ: 9→8 (−2 false positives +1 new P3).**

**S907 — QA MODE (2026-06-07). Autonomous QA sweep complete. H-002 Leaflet map ✅ RESOLVED (pin popup "Gerald Ave Estate Sale" confirmed ss_8736lh0zj). Bounty E2E ✅ full flow (Alice submit → Bob approve → APPROVED → Alice notification). BountySubmission "Your Submissions" ✅ S906 fix confirmed (Pyrex record visible ss_5550658mg). Explorer's Guild URL: /shopper/guild-primer (not /guild or /shopper/guild — both 404). Pricing ✅ PRO=$29, TEAMS=$79 confirmed. 2 new P2 bugs: Flash Deal button (no onClick, /organizer/flash-deals → 404) + Social Posts button (no onClick). BQ: 7→9.**

**S906 — QA MODE (2026-06-07). Bug C (messages reply dark mode) ✅ CHROME-VERIFIED (DOM computed styles + visual). Hero search Enter ✅ CHROME-VERIFIED (navigated to /search?q=vintage%20lamp). BountySubmission "Your Submissions" display bug FIXED inline (getOrganizerSubmissions where clause: item.sale.organizerId→organizerId direct field, TS 0 errors). #176 stale roadmap note corrected. BQ: 9→7.**

**S905 — QA MODE (2026-06-07). Bug A (P1 passkey) ✅ CHROME-VERIFIED. #197 BountyMatchModal ✅ CHROME-VERIFIED (BountySubmission DB record confirmed). Bug C (messages dark mode) + Hero search Enter CODED. New P3: BountySubmission "Your Submissions" display bug. BQ: 11→9 (Bug A + #197 resolved).**

**S904 — QA MODE (2026-06-06). Autonomous QA sweep complete. Bug A (P1 passkey auth): CODED — next.config.js beforeFiles + usePasskey.ts double /api/ prefix fixed (TS 0 errors, pushblock below). Bug B (#197 bountyController): already coded S903, still pending push. Bug C (P3 messages reply dark mode): new finding. Hero search Enter (P3): new finding. Full product sweep ✅ — shopper discovery, organizer management all functional. BQ: 8→11 (3 new items). QA-ONLY continues.**

**S903 — QA MODE (2026-06-06). Wrap. #197 BountyMatchModal fix CODED (bountyController.ts, TS 0 errors). Pushblock provided to Patrick. Stale note confirmed: #176 "Sales Near You still missing" → INCORRECT, feature IS live (ss_5140qm032). BQ: 8 (unchanged).**

**S902 — QA MODE (2026-06-06). Autonomous QA continued. #27 CSV Export ✅ (ss_94917yaqg Amazon, ss_2041bm2l3 eBay). #66 Open Data Export ZIP ✅ (ss_3723v0nw2, ss_2914rv4if). #47 UGC Photo Tags ✅ full submit — modal → toast → DB record id=5 (status=PENDING, correct saleId/userId/tags). ⚠️ UX gap: no "pending review" message shown after submit. ❌ #197 BountyMatchModal production bug CONFIRMED: POST /bounties/match always 403 — bountyController.ts L581/L593 uses req.user?.id (user ID) vs item.sale.organizerId (organizer record ID) — they are different values; modal can never fire for any organizer. Added to BQ.**

**S901 — QA MODE (2026-06-06). CTA1 Chr ✅ S899 applied to roadmap.md (pre-compaction). FB Events geocoding BQ RESOLVED (242/260 PUBLISHED geocoded, 93% — 18 remaining). Chrome sweep: Homepage ✅ ss_0902g1f99, Search ✅ ss_97123xc98, Trending ✅ ss_51644lm5l, Organizer dashboard (Alice) ✅ ss_46975zqht, /organizer/insights real data ✅ ss_81628rlz9 ($220 revenue, 50% conversion rate). BQ: 8→7 (FB Events resolved). DEV mode available next session.**

**S900 — QA WRAP (2026-06-06). S899 parallel sessions reconciled: no conflicts. Combined BQ 13→10. Records PCV audit: S897/S898/S899 PCVs confirmed — #168 dark mode ✅ S898 + #213 dark mode ✅ S898 already applied; S897 PCVs all re-verifications of existing ✅ (no new Chrome column changes). FB Events API key alert + dateApproximate CONFIRMED ON GITHUB (S887/S890 fixes were already pushed — local files truncated by Cowork Edit tool). 13 local files corrupted by Edit tool truncation — Patrick must restore from GitHub HEAD before any local dev. BQ rows removed (10→8). QA MODE continues (8 = ceiling). Only pushblock: roadmap.md + STATE.md + patrick-dashboard.md.**

---

## Pool Audit Findings

Run: 2026-05-18 (S756). Railway DB queried directly via psycopg2.

**DirectoryClaimEmail (outreach queue):** 3,319 PENDING, 29 SENT. 31 junk rows deleted (26 image filenames stored as emailAddress, 5 Patrick test emails).

**leadTier breakdown:** HOT: 5,517 (100% website coverage) · WARM: 36,851 (3.3% website coverage) · COLD: 14,314

**WARM email gap:** Only 208 WARM orgs currently addressable. Website enrichment job changed from weekly → daily (S756). API headroom: HERE 250K/month cap, ~1,500/month usage. Pipeline healthy.

**Geocoding:** 6,760 sales still not geocoded. Nightly geocoding job addresses gradually.

---

## S913 Noted Findings (raised this session — not yet actioned)

Surfaced during the S913 email audit; recorded so they aren't lost. None are active outages — all are deferred-risk / tech-debt, most to address BEFORE `OUTREACH_ENABLED=true`.

- **[P2] Bounced addresses are not auto-suppressed.** `EmailSuppression` has only 5 rows total; the Jun-6 abandoned-signup bounces ("reached a limit for sending mail") were never added. Sending to known-bad addresses on outreach resume risks re-tripping the Workspace suspension. Bounces currently live only as mailer-daemon messages in the outreach@finda.sale mailbox, unparsed. → Build bounce → `EmailSuppression` processing BEFORE outreach resumes.
- **[P2 → RESOLVED S918] Single Gmail/Workspace account SPOF for ALL email → FIXED.** New `transactionalEmailService.ts` (Resend) now handles auth emails, Stripe receipts/payouts, POS receipts, workspace invites, direct messages, consignor notifications. Gmail/emailService remains bulk-only rail. Gmail suspension can no longer silence payouts or password resets.
- **[P3] `OUTREACH_ENABLED` conflates two concerns.** It now gates cold outreach AND opt-in subscriber notifications (`saleEndingSoonJob`) AND bulk digests — so turning off outreach also silently stops opt-in "sale ending soon" emails shoppers requested. → Consider a separate `BULK_EMAIL_ENABLED` / account-health flag distinct from cold-outreach.
- **[P3] Backend `/health` and `/api/health` → ✅ RESOLVED S915.** Confirmed: `GET https://backend-production-153c9.up.railway.app/api/health` → `{"status":"ok","timestamp":"2026-06-07T21:06:25.597Z"}` 200.
- **[P1 — NEW S915] Gmail REFRESH_TOKEN returns `unauthorized_client` — ALL Gmail-rail sending BROKEN.** Patrick re-minted the token with `https://mail.google.com/` scope but the new token fails with `unauthorized_client: Unauthorized` on every OAuth refresh attempt. Root cause: token was likely generated by a different OAuth client than GMAIL_CLIENT_ID in Railway (client ID `955070470579-3kangpdvi0jcvj88v...`), OR Workspace Admin needs to approve the broader scope. Impact: ALL transactional email via Gmail rail is currently broken (payouts, receipts, password resets, organizer notifications). bounceSuppressService cron will also fail silently at 06:00 UTC. → Patrick must restore a working GMAIL_REFRESH_TOKEN immediately. (Note: superseded S918 — transactional email now on Resend rail.)

## Blocked Queue

_S772 reconciliation: graduated/closed rows removed — reconciled into strategy/roadmap.md. Only genuinely open items remain._
_⚠️ P0 AGING: #332 at 73+ sessions — mandatory P0 per CLAUDE.md §10a._
_S919 WRAP: #230 RESOLVED (SmartBuyerWidget rendering confirmed). FB Marketplace RESOLVED (Patrick decision: DEFERRED — Apify path added to roadmap #380). #335 updated: Jane Thrift is fictional. BQ: 7→5._
_S921: SEC-001, SEC-002, #196, #201 coded but pending push+Chrome-verify — all 4 remained in BQ. BQ: 9._
_S922 QA MODE: all 4 S921 fixes Chrome-verified live RESOLVED (commit 7058d99c deployed): SEC-001 (admin.ts Prisma.sql parameterized, page returns 11 patterns no error), SEC-002 (items.ts scoped multer, valid types pass, add-items loads clean), #196 Buying Pools (card renders on $169 item ss_5769b4ui3, negative test on $25 item), #201 Favorites all 3 (Items(1) count, Saved Sales section, /shopper/collections→302→/shopper/wishlist ss_37941eelg/ss_1509jponw). All 4 rows REMOVED. BQ: 9→5. Below QA ceiling — DEV available S923._
_S928: HTML entity P2 FIXED (textUtils.ts + insights.tsx + itemController.ts). GA4 #470 conversion events built. 22 Chr cols bulk-applied (S803–S805 backlog). BQ: 6→5._
_S932: Hunt Pass multiplier display inconsistency RESOLVED (Patrick confirmed 1.5x XP on live site). BQ: 6→5._
_S933: #335 RESOLVED (outreach confirmed active, 658 sent). WARM leads backfill RESOLVED (0 orgs missing DCE row). WARM enrichment removed (3.5%→4.7%, not a bug, growing). GSF geocoding removed (structural/by-design, fallback confirmed). Domain blocking shipped (estatesales.net/org blocked across all 3 email rails). BQ: 5→1._
_S937b: SUPPRESSION PASS COMPLETE (Patrick-approved) — added `suppressionService.isHardSuppressed()` (blocked-domain+hard-bounce+complaint only) and guarded ~15 more Gmail-rail senders: BULK→isSuppressed (curatorEmailJob, monthlyTrendReportJob, abandonedCheckoutJob, buyingPoolController×2, lib/notificationService +placeholder skip, organizers.ts), TRANSACTIONAL→isHardSuppressed (auctionJob, reservationController, saleWaitlistController, waitlistController, contact.ts autoreply, emailReminderService) + reclassified saleAlert(×4)/saleLive full→hard. Internal alert senders left unguarded by design. Backend TS 0 errors. SENTRY CAPTURE added to both rails (transactionalEmailService `resend_send_rejected`, emailService `gmail_send_failed`) so a future send-rejection pings Sentry → caught by the daily health check. GMAIL RAIL AUDIT done (`gmail-rail-audit-s937.md`): rail is PROPER + healthy — From=outreach.finda.sale is SPF+DKIM+DMARC aligned, ~200-400/day sending, 0 Sentry gmail errors/7d, no P0/P1. 4 P2 follow-ups (see Next Session). G1 ESCALATED to P0 after Resend log detail (SES_FROM_EMAIL=find@outreach.finda.sale → whole transactional rail 403). Audit history consolidated → `claude_docs/feature-notes/email-audit-history-consolidated.md` (28 findings, R-1..R-7 recurring). The 401 GET /emails/suppressions is an external curl with a send-only Resend key — not our backend, ignore._
_S937f: G1 P0 RESOLVED — E2E VERIFIED. After push + Railway green + RESEND_FROM_EMAIL=noreply@finda.sale: registered deseee+s937e2e@gmail.com via POST /api/auth/register (HTTP 201) → verification email RECEIVED from `noreply@finda.sale` in INBOX (not spam), subject "Verify Your FindA.Sale Email Address", Gmail thread 19eaf109a9b88af7. This is the exact send class that was 403-rejected pre-fix → Resend transactional rail now delivers from the verified domain. Real inbox receipt = full ✅ (not CODE-ONLY). GMAIL RAIL also E2E-verified: POST /api/contact → autoreply received from find@outreach.finda.sale in INBOX (thread 19eaf18a44195799) — also confirms the send-as alias is valid. ZONE BLOCK verified LIVE: EmailQuotaLog 0→2 (normal contact submit = support+autoreply) →3 (@system submit = support only, autoreply to @system filtered, +1 not +2 — no quota burn, no bounce). support@finda.sale allowlist confirmed (support send went through). Resend block proven transitively (same isEmailDomainBlocked gate, live on Gmail + 7/7 logic). M2 Resend-admin-API monitor runs 06:07 (no CLI this session for the key). BQ: 2→1 (#332 Shopify remains). (Test user deseee+s937e2e@gmail.com left in prod — harmless +alias; delete if desired.)_
_S938: #332 Shopify DEFERRED (Patrick decision) — blocked on connecting a real custom-app Shopify store for live QA; code fixes already coded/pushed S890. Removed from Blocked Queue; revisit when a test store is available. BQ: 1→0._
_S939: Deliverability hardening session — NO blockers added. Gmail-rail false-alarm P0 was not real (send-only token, no re-auth needed); placeholder-leak guard, Resend webhook (4 fixes), and soft-bounce policy all shipped + live + e2e-verified. Optional Gmail outreach-token re-auth is non-blocking. BQ: 0 (unchanged)._
_S937e: SOURCE PROVEN + rail-suppression aligned. Bounce source was NOT saleLive (dead code) — it was `postSaleRecapEmailService.sendPostSaleRecaps()` via outwardEmailAutomationsJob (10:00 UTC daily): Sale.recapSentAt stamps 173/195/120 on 06-06/07/08, all hour-10 UTC, all isUnmanagedListing=true (proof in system-finda-sale-bounce-source-S937.md). Recap query NOW filters `isClaimed:true,isUnmanagedListing:false` (L241) — already self-fixed; rail guard is belt-and-suspenders. Allowlist verdict: support@finda.sale (SUPPORT_EMAIL) is the ONLY code send-target @finda.sale; info@/privacy@/legal@/admin@ are NOT code recipients (frontend/mailto only). Allowlist now env-extensible via SENDABLE_FINDA_SALE_ADDRESSES. RAIL-SUPPRESSION ALIGNED: added checkMultipleHard(); Resend rail switched full→hard (opted-out users now get receipts/resets); Gmail rail chokepoint now also drops hard-bounce/complaint (not just domains). Both rails enforce the same floor: domain-block + hard-bounce + complaint; bulk senders layer full isSuppressed on top. Comprehensive E2E rewritten (4 rails × positive + negative/guard, 27-item checklist). Backend TS 0 errors. _
_S937d: BOUNCE-FLOOD FIXED (rail-level). Root cause: a Gmail-rail event send (likely saleLiveEmailService on scraped-sale publish) was emailing scraped organizers' own User.email = scraper+slug@system.finda.sale (72,060 such users); S929 only blocked @system in the 3 outreach SEEDERS, never the send rails. FIX: `isEmailDomainBlocked()` now blocks the ENTIRE finda.sale zone (domain==='finda.sale' OR endsWith '.finda.sale') — no real user ever has an @finda.sale address — with a one-address allowlist for SUPPORT_EMAIL (contact-form support@finda.sale). Plus a hard guard at the emailService.emails.send Gmail chokepoint (filters unsendable recipients before quota+send). Covers BOTH rails (Resend checkMultiple + Gmail rail guard), autoSeed, and the 16 guarded senders. Verified: 7/7 logic cases, backend TS 0 errors. In-flight DSNs from the pre-fix 06-08 batch will taper as Gmail stops retrying (~21h); they don't pollute suppression (bounce parser ignores finda.sale). Files: suppressionService.ts, emailService.ts (already in push block)._
_S937: G3 suppression gap FIXED (8 bulk lifecycle services, pending push). G1 reframed P2 latent after Resend dashboard check (send.finda.sale not a Resend domain; SES_FROM_EMAIL env almost certainly overrides the dead fallback — verify, don't rewrite). NO SES rail exists in code. NOTED (not yet fixed, awaiting Patrick scope): ~9 more Gmail-rail senders lack suppression — most important `lib/notificationService.createNotification` (central fan-out), plus buyingPool/reservation/saleWaitlist/waitlist/abandonedCheckout/curator/monthlyTrendReport/emailReminder/organizers. Transactional ones (auction receipt, reservation, contact) should suppress hard-bounce+blocked-domain only, NOT opt-out. BQ: 1→2._

| Feature | Reason | What's Needed | Session Added |
|---------|--------|---------------|---------------|






---

## Pending Chrome Verifications

| # | Feature | Evidence | Session |
|---|---------|----------|---------|
| SEO3 | Denver city landing page /estate-sales/denver-co | Navigated https://finda.sale/estate-sales/denver-co. Title: "Estate Sales in Denver, CO \| FindA.Sale" ✅. Meta desc present+keyword-rich ✅. H1: "Estate Sales in Denver, CO" ✅. 50 listings visible ✅. Dark mode clean ✅. ss_34924pp42 ss_8168bplgd | S944 |
| #422 | OAuth 409 bridge | Backend POST /api/auth/oauth → 409+OAUTH_LINK_REQUIRED for deseee@gmail.com (oauthProvider=NULL account). /login?message=... renders correctly. Direct API test — Google OAuth popup outside Chrome MCP tab group. | S945 |
| #75 | Tier lapse UI | Navigated finda.sale/organizer/dashboard as qa-lapse@example.com. PRO state: "Your Plan: PRO" ✅. DB-downgraded to SIMPLE via psycopg2. Refreshed — "Your Plan: SIMPLE" + PRO upgrade prompt ✅. | S945 |
_(S940 PCV rows — #27b watermark settings gating ✅ PRO/TEAMS, #75 non-lapsed TEAMS label ✅, #422 OAuth buttons+linked-accounts UI ✅ — applied to roadmap.md in S941 records pass — cleared.)_
_(S939 PCV rows — SEO3 REJECTED no screenshot ID (Human QA ⬜ unchanged), #470 RUNTIME-VERIFIED already in roadmap — cleared S941.)_
|---|---------|----------|---------|
_(S935 PCV rows — #317 Geofence graceful fallback ⚠️ S936, #470 GA4 conversion CODE-ONLY S936 — applied to roadmap.md in S936 records pass — cleared.)_
_(S931 PCV rows — #462 Attribution, #237 Command Center, /admin/outreach-opens, SEO1 SSR, #455 Notify Me, #464 SEO footer, sale detail, /trending, /map — applied to roadmap.md in S932 records pass — cleared.)_
_(S930 PCV rows — organizer dashboard, HTML entity fix, shopper dashboard, Explorer Profile, #123 rank label, #199 Hunt Pass — applied to roadmap.md in S931 records pass — cleared.)
_(S925 PCV rows — logout flow Chr✅, #463 CODE-ONLY, #462 CSRF partial — applied to roadmap.md in S930 records pass — cleared.)
_(S927 PCV rows #79/#164/#316 applied to roadmap.md in S928 records pass — cleared.)
_(S920/S921/S922 PCV rows applied to roadmap.md in S923 records pass — cleared.)_
---


## Next Session

### Patrick — Actions Needed
1. **Push S944+S945 wrap:**
```powershell
cd C:\Users\desee\ClaudeProjects\FindaSale

git add packages/backend/src/services/scraper/sourceRegistry.ts
git add packages/backend/src/services/scraper/sources/storageAuctionsNetScraper.ts
git add .github/workflows/scrape-storageauctionsnet.yml
git add packages/frontend/pages/items/[id].tsx
git add packages/frontend/components/CheckoutModal.tsx
git add packages/frontend/pages/register.tsx
git add claude_docs/STATE.md
git add claude_docs/patrick-dashboard.md

git commit -m "feat: GA4 events + StorageAuctions.net scraper; docs: S945 QA wrap (#422 ✅ #75 ✅)"
.\push.ps1
```

2. **After pushing, run the S946 records pass** — apply #422+#75 Chrome columns to roadmap.md.
3. **#470 GA4 verify** — After push deploys to Vercel, navigate to any item page and check browser console for `item_viewed` in `window.dataLayer`. Then register a new organizer account with invite code `QA-LAPSE-25` to verify `organizer_signup` fires.
4. **Searlo credit upgrade (optional).** FB Events running at 17% 429 fallback on free tier (10/min cap). A $3.99+ pack lifts the cap — then bump `SEARLO_RPM` repo Variable.

### S946 Recommendation
BQ=0 (ceiling=8 — DEV/QA available).

**Priority queue:**
1. **Records pass** — Apply S945 PCVs to roadmap.md: SEO3 Denver Chr ✅ S944 (apply column), #422 OAuth 409 Chr ✅ S945, #75 tier lapse Chr ✅ S945.
2. **#470 GA4 events** — After Patrick pushes S944 push block: verify item_viewed (navigate to item page, check window.dataLayer), organizer_signup (register with QA-LAPSE-25 invite code). purchase_completed requires real Stripe checkout or pk_test_ key in Vercel.
3. **StorageTreasures decision** — Patrick: Cognito JWT / Playwright / data partnership, or leave PARKED.


## Recent Sessions

### S945 — 2026-06-10 | QA (Chrome QA — #422 OAuth 409, #75 tier lapse, #470 GA4 check)

**Session type:** QA — continuation of S944 QA items

**Work completed:**
- **#422 OAuth 409 bridge ✅** — Verified backend behavior via direct POST to `/api/auth/oauth` with `{provider: 'google', providerId: '111939536989157503486', email: 'deseee@gmail.com'}`. Account has `oauthProvider=NULL` (existing password account). Response: 409 + `{code: 'OAUTH_LINK_REQUIRED', message: '...'}`. Separately confirmed `/login?message=...` renders the message correctly in Chrome. Google OAuth popup not automatable (popup window opens outside Chrome MCP tab group). PCV staged — apply to roadmap next session.
- **#75 Tier lapse UI ✅** — Created `qa-lapse@example.com` (PRO tier) via Railway DB. Navigated `finda.sale/organizer/dashboard` — dashboard showed "Your Plan: PRO" correctly. Used psycopg2 to downgrade account to SIMPLE tier. Refreshed dashboard — showed "Your Plan: SIMPLE" + PRO upgrade prompt. Full lapse UI behavior confirmed. PCV staged — apply to roadmap next session.
- **#470 GA4 events PENDING-DEPLOY** — Confirmed `item_viewed` event absent from `window.dataLayer` on live item page (S944 push not yet executed). All 3 events (`item_viewed`, `purchase_completed`, `organizer_signup`) are implemented in code but require S944 deploy to Vercel before browser verification.
- **qa-lapse@example.com** — Test account left in SIMPLE tier in production DB. Invite code `QA-LAPSE-25` exists unused (for organizer_signup GA4 test after S944 deploys).

**Files changed:**
- `claude_docs/STATE.md` — S945 wrap
- `claude_docs/patrick-dashboard.md` — S945 summary

**BQ delta:** 0 → 0 (unchanged)

### S944 — 2026-06-10 | DEV/QA (Scraper integration audit + gap fixes + GA4 events + Chrome QA)

**Session type:** DEV/QA — scraper integration audit, gap fixes, GA4 event implementation, Chrome QA

**Work completed:**
- **Scraper integration confirmed** — All 7 S941–S943 scrapers verified: registry enabled:true, GH Actions cron, no double-firing risk (no cronSchedule → not registered in-process), automatic monitoring via `sales_by_source_24h` and `sales_by_source_7d` in pipelineHealthController. No code changes needed for monitoring integration.
- **findasale-ci-sentry-health updated** — Added `'scrape-storageauctionsnet'` to `KNOWN_OK_DISABLED` via `mcp__scheduled-tasks__update_scheduled_task`. Parked workflow no longer triggers false HIGH alert.
- **NAA registry fixed** — `NAAFindAnAuctioneer` entry: `enabled: true` → `enabled: false`. Workflow is intentionally disabled (Novi AMS JS-rendered platform, zero records confirmed).
- **StorageAuctions.net scraper built** — `update.storageauctions.net` confirmed NOT a REST API (all paths 404 — it is a WebSocket/push server). Real unauthenticated API: `GET https://www.storageauctions.net/block/auction/getallonline/{page}/esoon`. Full implementation paginates until empty, 2s delay between pages, maps `facility_name`/`city`/`state_code`/`lat`/`lon` to Organizer upsert. Cron: Thursdays 09:00 UTC. Registry entry: `enabled: true`. TS 0 errors.
- **GA4 events fixed (3 missing)** — Chrome QA found `item_viewed`, `purchase_completed` completely absent from codebase; `organizer_signup` fires as wrong name (`organizer_registered`). Fixes: (a) `pages/items/[id].tsx` — `useEffect` on item data load fires `item_viewed` with `item_id`+`item_name`; (b) `components/CheckoutModal.tsx` — `purchase_completed` fires in `stripe.confirmPayment()` success branch with `value`+`currency`+`transaction_id`; (c) `pages/register.tsx` — both `organizer_registered` (existing) + `organizer_signup` (new alias) fire back-to-back. TS 0 errors.
- **Chrome QA — SEO3** ✅ FULLY VERIFIED. Navigated https://finda.sale/estate-sales/denver-co. Title "Estate Sales in Denver, CO | FindA.Sale" ✅. Meta desc present+keyword-rich+includes "50 estate sales" ✅. H1 "Estate Sales in Denver, CO" ✅. 50 sale listings visible ✅. Dark mode clean ✅. Breadcrumbs functional ✅. ss_34924pp42 ss_8168bplgd.
- **Chrome QA — #422 OAuth 409** UNVERIFIED — requires a real Google OAuth sign-in flow that triggers the duplicate-account bridge. Cannot simulate in QA.
- **Chrome QA — #75 tier lapse** UNVERIFIED — requires Stripe webhook simulation. Cannot trigger in QA.
- **Chrome QA — #470 GA4** CODE-ONLY — `item_viewed`/`purchase_completed`/`organizer_signup` now implemented; browser verification requires real checkout+signup triggers (post-deploy).

**Files changed (pending Patrick push):**
- `packages/backend/src/services/scraper/sourceRegistry.ts` — NAA enabled:false + StorageAuctions.net enabled:true + updated comment
- `packages/backend/src/services/scraper/sources/storageAuctionsNetScraper.ts` — full replacement of parked stub
- `.github/workflows/scrape-storageauctionsnet.yml` — added cron `0 9 * * 4`, updated run step
- `packages/frontend/pages/items/[id].tsx` — `item_viewed` GA4 event on item data load
- `packages/frontend/components/CheckoutModal.tsx` — `purchase_completed` GA4 event on Stripe success
- `packages/frontend/pages/register.tsx` — `organizer_signup` alias alongside `organizer_registered`
- `claude_docs/STATE.md`, `claude_docs/patrick-dashboard.md` — wrap docs

**BQ delta:** 0 → 0 (unchanged)

### S943 — 2026-06-10 | DEV/RECORDS (Scraper fleet deep expansion + Railway P0 fix)

**Session type:** Competitor research sweep (35+ sites, 4 categories) + Railway build failure root-cause diagnosis.

**Work completed:**
- **Railway P0 DIAGNOSED** — Backend build FAILED for both S941 (21:07 UTC) and S942 (21:34 UTC) pushes. Root cause: 2 stray lone commas on their own lines in the committed `sourceRegistry.ts` (lines 139 and 196). Stray commas create `undefined` holes in JavaScript arrays. `initScraperCron` iterates `SOURCE_REGISTRY` and crashes at `sourceDef.enabled` when it hits the `undefined` slot. Cause: 4-way parallel agent write collision in S942. Fix: local working tree already has stray commas removed + full S943 additions. Push block provided — this IS the fix.
- **BidSpotter.com** ✅ BUILT — ~35 US auction houses. ToS CLEAR (`/en-us/about-us/legal/website-terms-and-conditions`: no anti-scraping). Static HTML via `X-Requested-With: XMLHttpRequest` header. `businessCategory: 'AUCTION_HOUSE'`. GitHub Actions cron: Wed 10am UTC (`scrape-bidspotter.yml`).
- **Invaluable.com** ✅ BUILT — 8,158 US auction houses. Public unauthenticated JSON REST API (`/auction-houses`, page=0-based, size=100, ~82 pages). No JS rendering needed. ToS GRAY (page JS-rendered, same classification as StorageAuctions.com). `businessCategory: 'AUCTION_HOUSE'`. GitHub Actions cron: Sun 7am UTC (`scrape-invaluable.yml`).
- **AuctionZip** ✅ BUILT — Existing `runAuctionZipScraper()` wrapped in registry adapter. ToS CLEAR (Section 4: public commercial use allowed). ~25,000 US auction houses A-Z static HTML. Enabled in registry; no new cronSchedule (existing GH Actions).
- **PROHIBITED (5)**: LockerFox (§1.4.2+§1.4.6), GovPlanet (IronPlanet §1.3(c)), GovernmentLiquidation (Liquidity Services), Proxibid (ATG UUA §10(h)/§11.1(v)/§12), YardSaleSearch (explicit ban).
- **PARKED (16)**: Bid13, IBidNow, StorageBattles, StorageUnitAuctionList, Handbid (nonprofits/wrong-category), AmericanFleaMarkets/FleaMarket.com/FleaMarketRover/VendorsByState (dead domains), FleaMarketDirectory (redirects), FleaMarketsNet (Afternic), NFMAMembers (Wix SPA), SellMyAntiques (Next.js SPA).
- **TS check**: 0 errors (backend, confirmed post-sourceRegistry update).

**Files changed (pending Patrick push — URGENT: fixes Railway crash):**
- `packages/backend/src/services/scraper/sourceRegistry.ts` — stray commas removed + 21 new imports + 21 new registry entries
- 21 new `packages/backend/src/services/scraper/sources/*.ts` scraper stubs
- `.github/workflows/scrape-bidspotter.yml`, `scrape-invaluable.yml`
- `claude_docs/STATE.md`, `claude_docs/patrick-dashboard.md`

**BQ delta:** 0 → 0 (unchanged)

### S940 — 2026-06-10 | QA/DEV/OPS/MONITORING

**Session type:** Parallel dispatch — monitoring harden + OPS verification + Chrome QA + 2 dev fixes. Push block provided to Patrick.

**Work completed:**
- **Monitoring harden ✅** — `findasale-ci-sentry-health` Step 1c updated via `mcp__scheduled-tasks__update_scheduled_task`. Added `KNOWN_OK_DISABLED={'scrape-google-places','scrape-naa'}`. Disabled_manually workflows not in allowlist now alert HIGH. The exact S939 failure mode (pipeline-outreach-emails dark 5 days, invisible to sweep) is now caught.
- **FB Events post-overhaul verified** — First daily run: 20.4 min runtime (above 19-min target), 167 Searlo OK + 45 Searlo 429 hits (17% fallback) + 90 Serper backups. AUCTION and FLEA_MARKET sale types landing correctly. No data loss. Runtime concern: sub-query bursts hit Searlo 10/min cap in burst metros. Serper covering the gap.
- **Outreach status** — outreach_sent_24h=0. Pipeline-outreach-emails was re-enabled S939 but GitHub's cron scheduler hadn't re-registered yet (last fired June 5). Fix: trivial comment added to workflow YAML in push block to force cron re-registration.
- **Monitoring coverage confirmed** — 123 workflows, 2-page pagination sufficient, 122 active + 1 known-OK disabled (scrape-google-places).
- **Licensing scrapers escalated** — 7 consistently-failing scrapers escalated LOW→MEDIUM (Indiana/Kentucky/Massachusetts/Maine/New Hampshire/Rhode Island/Nebraska). ~24 others succeeding consistently.
- **Print Kit P1 fixed** — `downloadAuthenticatedFile` used `localStorage.getItem('token')` after the codebase migrated to httpOnly cookie JWT. Fixed: `credentials: 'include'` + strip absolute Railway origin for same-origin Next.js /api proxy routing. TS 0 errors.
- **Node.js CI fix** — 2 workflow files (scrape-ok-phase2.yml + scrape-wy-phase2.yml): `actions/github-script@v6`→`@v7`. Rest of fleet already on @v4/@v7.
- **Chrome QA — #27b** — Watermark gating ✅ (PRO locked ss_340873qej, TEAMS unlocked ss_549588e2a). PDF download was the P1 bug found → fixed this session.
- **Chrome QA — #75** — Non-lapsed subscription display ✅ (TEAMS label correct ss_5075d8oqc). Lapse state P2 UNVERIFIED (Stripe webhook can't be simulated in QA).
- **Chrome QA — #422** — OAuth buttons on /login ✅ (ss_1808g433w). Linked Accounts UI in settings ✅ (ss_62243gw0x). 409 OAuthBridge flow UNVERIFIED (real Google OAuth needed).

**Files changed (pending Patrick push):**
- `packages/frontend/pages/organizer/print-kit/[saleId].tsx` — Print Kit 401 fix
- `.github/workflows/scrape-ok-phase2.yml` — github-script @v6→@v7
- `.github/workflows/scrape-wy-phase2.yml` — github-script @v6→@v7
- `.github/workflows/pipeline-outreach-emails.yml` — trivial comment (cron re-registration)
- `claude_docs/STATE.md`, `claude_docs/patrick-dashboard.md` — wrap docs

**BQ delta:** 0 → 0 (unchanged)

### S939 — 2026-06-10 | OPS/DEV

**Session type:** Daily Email & Deliverability Health Sweep → deliverability hardening (multi-fix). All code pushed + live; Railway migration applied.

**Health sweep — mostly green:** finda.sale 200; backend root + /api/health 200; DNS SPF/DMARC/MX(improvmx + outreach→google)/DKIM(resend root, google outreach, litesrv→mlsend) all present; Sentry 0 email-send errors/24h; Gmail quota 6/1500; EmailSuppression flat (5 rows).

**Work completed:**
- **FALSE-ALARM P0 cleared + fixed.** The "🔴 Gmail OAuth token BROKEN" alert was not real. `gmailHealthCron.ts` (S887) probed via `gmail.users.getProfile` (needs a READ scope); the prod token is send-only (`gmail.send`, correct least-privilege) → 403 every run = false "pipeline dead" alarm. Only surfaced 06-10 because the Resend alert rail was just fixed S937. Proven live: refresh token refreshes, scope = gmail.send, Gmail-rail smoke tests delivered. FIX: cron now probes via `oauth2Client.getAccessToken()`. No re-auth needed; sending unaffected.
- **@system.finda.sale placeholder leak fixed (bounce-flood root cause).** `outreachEmailsCron.ts` called `gmail.users.messages.send` directly, bypassing the central `isEmailDomainBlocked` guard → could send to `scraper+<slug>@system.finda.sale` placeholders → Google DSN flood tripping the ImprovMX 500/day cap. FIX: added `isEmailDomainBlocked` guard before the atomic claim/quota/send (no SENT row, no quota burn). Complements S929/S937d (which guarded seeders + the emailService chokepoint but not this cron's direct-send path).
- **Resend webhook (bounce/complaint/suppression ingestion) was broken FOUR ways — all fixed + LIVE e2e-verified.** (a) `RESEND_WEBHOOK_SECRET` set in Railway. (b) handler checked `email.complaint` but Resend sends `email.complained` → fixed + added `email.suppressed` (hard block) + `email.failed` (log) (routes/outreach.ts). (c) CSRF exemption matched `/webhook` but path is `/resend-webhook` → CSRF 403'd every POST; fixed in middleware/csrf.ts. (d) global `express.json()` consumed the raw body before svix could verify → registered `express.raw` for `/api/outreach/resend-webhook` before the json parser in index.ts. (e) extraction read `payload.email`/`bounce_type` but real Resend payloads nest under `data.to[]`/`data.bounce.type` → now reads `data.to` (all recipients), `data.bounce.type` (Permanent→hard, Transient→soft), `data.email_id`, flat-shape fallback kept (routes/outreach.ts). **LIVE E2E vs prod with real Resend-shaped payloads:** valid signed → 200; tampered sig → 401; `email.complained` wrote a real EmailSuppression row; hard bounce set bounceHard; `email.delivered` reset the counter. Test rows cleaned up.
- **Soft-bounce policy → industry standard** (was one-strike-blocks-marketing-forever). Added `EmailSuppression.bounceSoftCount Int @default(0)` (migration 20260610143000_add_bounce_soft_count, applied to Railway). Soft bounce → increment; `email.delivered` → `resetSoftBounce`; BULK `isSuppressed` blocks only at `bounceSoftCount >= 5` (SOFT_BOUNCE_THRESHOLD); TRANSACTIONAL `isHardSuppressed` unchanged. `email.suppressed` now a real hard block. DB: 0 soft-bounce-only suppressions exist → nothing to retry; default 0 means none affected.
- **Resend dashboard webhook created** (Patrick) — subscribed to email.bounced/complained/suppressed/failed. Resolves S937 gmail-rail-audit follow-up #2 (bounce ingestion catching 0 rows — explained + the Resend path now actively ingests).

**Files modified (all already pushed + live):**
- `packages/backend/src/jobs/outreachEmailsCron.ts`
- `packages/backend/src/jobs/gmailHealthCron.ts`
- `packages/backend/src/routes/outreach.ts`
- `packages/backend/src/middleware/csrf.ts`
- `packages/backend/src/index.ts`
- `packages/backend/src/services/suppressionService.ts`
- `packages/database/prisma/schema.prisma`
- `packages/database/prisma/migrations/20260610143000_add_bounce_soft_count/migration.sql`
- `claude_docs/STATE.md`, `claude_docs/patrick-dashboard.md`, `claude_docs/strategy/roadmap.md` (wrap docs — this records pass)

**BQ delta:** 0 → 0 (no blockers added; optional Gmail outreach-token re-auth is non-blocking — sending works)

**Same session — FB Events overhaul + monitoring + outreach P0 (DEV/OPS/MONITORING):**
- **QA verifications:** SEO3 /estate-sales/denver-co Chrome ✅ (H1, 50 listings, JSON-LD BreadcrumbList+ItemList, self-canonical — see Pending Chrome Verifications). #470 GA4 RUNTIME-VERIFIED ✅ (dataLayer captured `shopper_favorite_added` on a live favorite as seed shopper; full GA4 Real-Time still needs the dashboard).
- **FB Events scraper complete overhaul (pushed + live).** Searlo wired as PRIMARY engine (geo-accurate 90–100% in-metro, ~$0.30/1k, pay-as-you-go) ahead of Serper→Brave→ScaleSerp. Brave tested + REJECTED as primary (geo-blind). Query split into sale-type sub-queries then trimmed 4→3 (consignment folded into estate) for sub-19-min daily runtime. `extractFbEventId` fixed to parse the trailing 8+ digit id on slug-form FB URLs (was grabbing the street number → corrupted dedup). Flea classifier fixed (keys on snippet + sub-query typeHint). Metro list expanded 93→301 from GOOGLE_PLACES_METROS (single source of truth); daily sharding ~43/day (full list weekly); cron weekly→daily. Searlo rate-limit handling: `SEARLO_RPM` throttle (default 9; free-tier cap 10/min, learned live via 429), honors retryAfter + one retry before Serper fallback. Added `all_metros` workflow_dispatch toggle. Live-verified: Searlo geo-accurate, flea events now landing (were 0), runtime in budget. Searlo key is FREE tier (~17-day runway, 10/min cap) — a $3.99+ pack lifts the cap.
- **Silent-failure monitoring buildout.** Audited all workflows — 8 "inline" (log-grep-able) + ~11 "trigger" pipelines (curl→202 fire-and-forget → need DB check). Built GET /api/internal/pipeline-health (per-source/per-pipeline freshness counts, gated by x-internal-secret / OUTREACH_SECRET) — DEPLOYED + live-tested. Extended the daily findasale-ci-sentry-health task: Step 1c all-workflow staleness sweep, Step 1d pipeline data-freshness (green-but-empty detector, calls the endpoint), Step 1b FB Events deep health (runtime/429/Serper-bleed/credit-runway). Repo confirmed 123 total workflows (122 active, 1 intentionally disabled = scrape-google-places).
- **P0 caught + fixed.** `pipeline-outreach-emails` GitHub Actions workflow found MANUALLY DISABLED since June 5 → cold outreach fully DEAD ~5 days (0 sends since Jun 5 07:59 UTC, 42 leads stalled, no fallback). Re-enabled (now active); OUTREACH_ENABLED=true confirmed on Railway. Resumes on next 4-hour cron. Exact "green but silently stopped" failure the new monitoring now catches.

**Additional files modified (all pushed + live):**
- `packages/backend/src/jobs/search-facebook-events.ts`
- `packages/backend/src/jobs/run-search-facebook-events.ts`
- `.github/workflows/scrape-facebook-events.yml`
- `packages/backend/src/controllers/pipelineHealthController.ts`
- `packages/backend/src/routes/internal.ts`

### S938 — 2026-06-10 | DEV/OPS

**Session type:** Email-rail hardening + bounce-ingestion fix + live verification

**Work completed:**
- **SES→GMAIL rename (44 backend files) SHIPPED + smoke-tested ✅.** All Gmail-rail `from` reads now dual-read `GMAIL_FROM_EMAIL || SES_FROM_EMAIL || 'find@outreach.finda.sale'`; ~52 dead `@send.finda.sale` fallbacks retired to the verified alias; workspaceController + stale comments fixed. Live contact-form smoke test: autoreply delivered from find@outreach.finda.sale to INBOX (thread 19eaf520fef6931a). Resolves S937 gmail-rail-audit follow-up #1.
- **Bounce-ingestion (#471) fixed + verified.** Moved off in-process cron onto GitHub Actions (JOB_MAP 'process-bounces' + pipeline-bounce-suppress.yml); broadened query + hardened trash scope. Railway log confirms it now runs (433ms). Token introspected: outreach@finda.sale, full scope — correct. 0 rows is correct (only @system DSNs exist, all in Trash, all parser-ignored). No further fix needed.
- **#332 Shopify DEFERRED** (Patrick) — removed from BQ.
- **sales.ts truncation caught + restored** from HEAD (461→610 lines; #450 recurring endpoint recovered) before it could be committed.

**Files modified:**
- Rename: 44 backend files (controllers/jobs/lib/middleware/routes/services — see commit 1adff5ea)
- Bounce: `internalJobRunnerController.ts`, `bounceSuppressService.ts`, `index.ts`, `.github/workflows/pipeline-bounce-suppress.yml`
- `claude_docs/STATE.md`, `claude_docs/patrick-dashboard.md`, `claude_docs/strategy/roadmap.md`

**BQ delta:** 1 → 0

### S937 — 2026-06-09 | RESEARCH/AUDIT→DEV

**Session type:** System map (email/outreach/scraper) + P1 suppression fix

**Work completed:**
- **System map written** — `claude_docs/feature-notes/email-outreach-scraper-system-map.md`. 3 email rails, outreach pipeline (GitHub Actions → internal job runner, NOT in-process cron), scraper pipeline, full Part-4 gap table. Every claim carries a file:line citation.
- **Corrected stale premises** — Gmail NOT suspended (active S917/S929/S933); outreach NOT dead (runs via GitHub Actions). No P0 fabricated.
- **FIXED P1 (G3)** — 8 bulk lifecycle services were calling `emailService.emails.send` (Gmail rail) with no suppression check. Added `suppressionService.isSuppressed` guard before each send: saleAlertEmailService (4 senders), priceDropService, wishlistMatchEmailService, saleLiveEmailService, presaleSneakPeekEmailService, onboardingEmailService (3 senders), smartFollowService (loop — email-only flag, push intact), followerNotificationService (loop — email-only flag, push intact). Backend `tsc --noEmit` 0 errors.
- **OPEN P1 (G1)** — added to Blocked Queue: 9 Resend-rail callers send transactional mail FROM `@send.finda.sale` (Resend-DKIM status unverified). Touches auth+payment → red-flag gate → Patrick DNS decision needed before fix.
- **Confirmed present** — S936 admin send-test-email fix, transactionalEmailService suppression + noreply@finda.sale default, S934 FB Events + googlePlaces flea widenings.

**Files modified:**
- `packages/backend/src/services/saleAlertEmailService.ts`
- `packages/backend/src/services/priceDropService.ts`
- `packages/backend/src/services/wishlistMatchEmailService.ts`
- `packages/backend/src/services/saleLiveEmailService.ts`
- `packages/backend/src/services/presaleSneakPeekEmailService.ts`
- `packages/backend/src/services/onboardingEmailService.ts`
- `packages/backend/src/services/smartFollowService.ts`
- `packages/backend/src/services/followerNotificationService.ts`
- `claude_docs/feature-notes/email-outreach-scraper-system-map.md` (NEW)
- `claude_docs/STATE.md`, `claude_docs/patrick-dashboard.md`

**BQ delta:** 1 → 2 (+G1 P1)

### S936 — 2026-06-09 | QA/RECORDS

**Session type:** QA sweep + Records pass

**Work completed:**
- **Chrome QA — SEO3** ✅ — Navigated https://finda.sale/estate-sales/denver-co. H1 "Estate Sales in Denver, CO" ✅, 50 listings ✅, category tabs ✅, BreadcrumbList schema.org ✅, canonical + og:title + og:desc ✅.
- **Chrome QA — #472 send-test-email** — Backend CODE works (Resend success:true, messageId 7caa79e3-61f5-4893-83b7-a5021d4447f1, rail:resend). Email arrived in Yahoo SPAM from support@finda.sale (unwarmed sender domain). RESEND_FROM_EMAIL env var confirmed set to support@finda.sale in Railway.
- **Chrome QA — #463 Claim CTA tracking** — UNVERIFIED. No unclaimed organizer has a `customStorefrontSlug`, so no profile URL is accessible in QA env. Vercel Analytics Events tab requires dashboard access.
- **Chrome QA — #164 Tiers** ✅ — Navigated /organizer/settings → Subscription tab as Alice (user1). "Your subscription tier: TEAMS ($79/mo)" displayed correctly.
- **Bug fix — admin.ts hardcoded fallback** — Removed `hello@send.finda.sale` hardcoded fallback from POST /admin/send-test-email. Now requires RESEND_FROM_EMAIL env var; returns 503 if missing.
- **Bug fix — transactionalEmailService.ts FROM_DEFAULT** — Changed hardcoded `hello@send.finda.sale` to `process.env.RESEND_FROM_EMAIL ?? 'FindA.Sale <noreply@finda.sale>'`. `send.finda.sale` has SES DNS, not Resend DKIM — wrong domain for Resend sends.
- **Records pass** — S935 PCVs applied to roadmap.md: #317 Human QA ⬜→⚠️ S935 (graceful fallback ✅; inside/outside-radius UNVERIFIED); #470 Claude QA + Human QA -→CODE-ONLY S935 (gtag events fire + network 204; submit CODE-ONLY). PCV table cleared.

**Files modified:**
- `packages/backend/src/routes/admin.ts` — hardcoded hello@send.finda.sale fallback removed
- `packages/backend/src/lib/transactionalEmailService.ts` — FROM_DEFAULT uses RESEND_FROM_EMAIL env var
- `claude_docs/strategy/roadmap.md` — S935 PCVs applied (#317, #470)
- `claude_docs/STATE.md` — S936 wrap
- `claude_docs/patrick-dashboard.md` — S936 summary

**BQ delta:** 1 → 1 (unchanged)

### S934 — 2026-06-09 | RESEARCH/DEV

**Session type:** RESEARCH/DEV — scraper coverage for 459 zero-record city×category SEO pages

**Work completed:**
- **Third-party auction/venue sources evaluated — all BLOCKED.** AuctionNinja dated-listing extension: BLOCKED — auction events are JavaScript-rendered; the fetch+cheerio stack only sees the static company-directory nav (confirmed by reading static HTML of /auctions + a company profile). Not fixable without a headless browser; no GitHub scraper exists (only a seller-side CSV tool). HiBid evaluated as the auction source — fully server-rendered (title/city/state/zip/start+end dates/catalog URL), coverage probe of 8 metros returned 3–77 live auctions each — BUT ToS §7 explicitly prohibits scraping, automated access, aggregating/displaying their data, and building a competing service → NO-GO (legal). US YellowPages.com evaluated as an organizer/venue source — ToS §2.1 "Data Mining/Scraping and Framing Prohibited" → NO-GO, no code written. (Existing yellowPagesCaScraper.ts (Canada) likely shares similar ToS — flagged for a future check.)
- **DB audit (Railway, read-only).** Only 97 AUCTION Sale records existed nationwide pre-fix; 155 high-activity cities had zero auctions (NYC 621 total/0, Houston 508/0, Chicago 279/0, LA 237/0, Miami 228/0, Dallas 224/0). GOOGLE_PLACES_METROS (300 metros) confirmed COMPREHENSIVE — apparent gaps are suburbs already inside a covered metro's radius, NYC boroughs, Canadian cities in CANADIAN_METROS, or data-mislabels. GOOGLE_PLACES_METROS is a plain string[] constant (no Google API call); the Google Places scraper itself is disabled (paid). Foursquare cron = 3rd of month, HERE cron = 2nd (GitHub Actions).
- **PIVOT to own-pipeline fills (all legal).** (a) RECLASSIFICATION — APPLIED to production. reclassify-mistyped-sales.ts flipped 651 mislabeled EstateSalesNet/GarageSaleFinder event listings → AUCTION (saleType AUCTION 97→748 confirmed in DB) and 217 YARD→ESTATE. Rule excludes places-API business listings (em-dash "— Category in City" suffix + RETAIL). Dry-run audited, false-positive risk negligible. (b) FB Events query WIDENED — search-facebook-events.ts now also searches flea market/swap meet/public auction/online auction/consignment sale (its inferSaleType already categorizes auction+flea). (c) PLACES_QUERIES +5 flea synonyms — googlePlaces.ts gained antique flea market/outdoor market/vendor market/trade days/bazaar (FLEA_MARKET); Foursquare+HERE pick them up next monthly run. (d) Flea-org backfill SHELVED on data quality — the 600 orphan geocoded FLEA organizers were 583/600 individual vendor booths (443 piled on 2 New Orleans coordinates); generate-flea-sales-from-orgs.ts built but NOT applied and dropped from push.
- **RETAIL data-quality audit** (retail-data-quality-audit.md) — 7,692 RETAIL sales, ~17% junk minimum, concentrated in Estate Sale Company (39% junk — matched on "Estate"), no-suffix raw-name bucket (28%), Consignment (22%); clean categories Antique Mall 3%/Pawn 2%/Thrift 1%/Resale 4%. Also 1,478 duplicate rows (~19%) and 1,842 Canadian rows (24%). Recommendation: query/SEO-layer suppression (no deletes) → ~3,288-row clean pool.

**Files modified:**
- `packages/backend/src/services/scraper/sources/search-facebook-events.ts` — widened search query (flea market/swap meet/public+online auction/consignment) [pending push]
- `packages/backend/src/services/scraper/sources/googlePlaces.ts` — PLACES_QUERIES +5 flea synonyms [pending push]
- `packages/backend/src/scripts/reclassify-mistyped-sales.ts` — APPLIED to production (AUCTION 97→748, +217 ESTATE)
- `claude_docs/feature-notes/ADR-hibid-auction-scraper.md` — NEW (HiBid decision: legally blocked per ToS §7)
- `claude_docs/feature-notes/retail-data-quality-audit.md` — NEW (RETAIL junk audit + suppression recommendation)
- `claude_docs/STATE.md` — S934 wrap
- `claude_docs/patrick-dashboard.md` — S934 summary
- `claude_docs/strategy/roadmap.md` — scraper-coverage row updated

**BQ delta:** 1 → 1 (unchanged — #332 Shopify still the sole item)

### S933 — 2026-06-09 | BUG/DEV

**Session type:** BUG/DEV — BQ cleanup + competitor email domain blocking

**Work completed:**
- **BQ cleanup (5→1)** — Verified each BQ item via direct DB queries (psycopg2). #335 RESOLVED: outreach IS active (658 DirectoryClaimEmail rows sent, cron running). Item 3 (462 WARM leads) RESOLVED: 0 orgs have email but no DCE row — backfill already done. Item 4 (WARM enrichment) REMOVED from BQ: coverage growing 3.5%→4.7%, not a bug. Item 5 (GSF geocoding) REMOVED from BQ: structural gap acknowledged in geocodingAuditJob.ts suppression, frontend falls back to zip/city as Patrick confirmed. #332 DEFERRED (Patrick instruction). #471 noted as low-urgency, not added to BQ.
- **Competitor email domain blocking** — Built `BLOCKED_DOMAINS` pattern in suppressionService.ts: `estatesales.net` and `estatesales.org` now blocked at the domain level (sync, no DB call). Updated `isSuppressed()` and `checkMultiple()`. Fixed gap: `transactionalEmailService.ts` had zero suppression logic — added full check before every Resend call. Patched 3 outreach scripts (autoSeedOutreachCron.ts, seedDirectoryClaimEmails.ts, backfill-warm-emails.ts) to skip domain-blocked addresses using `isEmailDomainBlocked()`. TS 0 errors. Deploy green.

**Files modified:**
- `packages/backend/src/services/suppressionService.ts` — BLOCKED_DOMAINS + isEmailDomainBlocked() + isSuppressed() + checkMultiple() rewrite
- `packages/backend/src/lib/transactionalEmailService.ts` — suppression check added before every Resend call
- `packages/backend/src/jobs/autoSeedOutreachCron.ts` — isEmailDomainBlocked() check
- `packages/backend/src/scripts/seedDirectoryClaimEmails.ts` — isEmailDomainBlocked() check
- `packages/backend/src/scripts/backfill-warm-emails.ts` — isEmailDomainBlocked() check
- `claude_docs/STATE.md` — S933 wrap
- `claude_docs/patrick-dashboard.md` — S933 summary

**BQ delta:** 5 → 1 (#335/item3/item4/item5 all resolved or removed; #332 deferred)

### S932 — 2026-06-09 | RECORDS

**Session type:** Records — S931 PCV application, Hunt Pass BQ closure

**Work completed:**
- **Records pass** — Applied S931 PCVs to roadmap.md. #462 Outreach Funnel Attribution Chr column updated: ⬜|⬜ → ✅ S931|✅ S931 (only row needing a column update; #237/#SEO1/#464/#189/#139 already had Chr ✅ from prior sessions). #455 Notify Me updated: ⚠️ migration-pending note removed, S931 full E2E confirmation added.
- **Hunt Pass BQ RESOLVED** — Patrick confirmed /shopper/dashboard stats bar shows "1.5x XP" on live Vercel deploy. BQ item removed. BQ: 6→5.

**Files modified:**
- `claude_docs/strategy/roadmap.md` — #462 Chr ✅ applied, #455 note updated
- `claude_docs/STATE.md` — S932 wrap
- `claude_docs/patrick-dashboard.md` — S932 summary

**BQ delta:** 6 → 5 (Hunt Pass RESOLVED)

### S931 — 2026-06-09 | QA

**Session type:** QA — Records pass, Hunt Pass fix, Chrome QA sweep (continuing from S930)

**Work completed:**
- **Records pass (Task #1)** — Applied 6 S930 PCVs to roadmap.md Chr columns: organizer dashboard ✅, HTML entity fix (insights) ✅, shopper dashboard ✅, Explorer Profile ✅, #123 rank label ✅, #199 Hunt Pass active state ✅.
- **Hunt Pass multiplier fix (Task #2)** — 5 components corrected: StreakWidget.tsx (L78 label + L86 tooltip), HuntPassAvatarBadge.tsx (L69 title), HuntPassModal.tsx (L63 description), AvatarDropdown.tsx (L1199 title), Layout.tsx (L641 title). All changed "2x XP" → "1.5x XP". TS 0 errors. Pending push.
- **Chrome QA sweep (Task #3)** — 9 features verified: #462 Attribution E2E ✅ (ORGANIZER_PAGE_VIEWED DB id=cmq60o67l000n11qnfaa3qt13, ss_8722s1et1), #237 Command Center ✅ (ss_3575f2hgq ss_89830syni), /admin/outreach-opens ✅ (173 EMAIL_OPENED records, ss_324409tr9), SEO1 SSR ✅ (og:title/image/canonical confirmed web_fetch), #455 Notify Me ✅ (DB id=snmq614gmmivpefw, ss_8148yby5f), #464 SEO footer ✅ (Discover column links, ss_8148yby5f), sale detail page ✅ (ss_1097rjp4e), /trending ✅ (hot sales grid, ss_1920zk41t), /map ✅ (57 sales, Leaflet, ss_5209hylq3). 9 PCVs staged.

**Files modified:**
- `claude_docs/strategy/roadmap.md` — 6 S930 PCV Chr columns applied
- `packages/frontend/components/StreakWidget.tsx` — "2x XP" → "1.5x XP" (L78 + L86)
- `packages/frontend/components/HuntPassAvatarBadge.tsx` — "2x XP" → "1.5x XP" (L69)
- `packages/frontend/components/HuntPassModal.tsx` — "2x XP" → "1.5x XP" (L63)
- `packages/frontend/components/AvatarDropdown.tsx` — "2x XP" → "1.5x XP" (L1199)
- `packages/frontend/components/Layout.tsx` — "2x XP" → "1.5x XP" (L641)
- `claude_docs/STATE.md` — S931 wrap
- `claude_docs/patrick-dashboard.md` — S931 summary

**BQ delta:** 6 → 6 (Hunt Pass entry updated: "fix built S931, pending push+re-verify")

### S930 — 2026-06-09 | QA

**Session type:** QA — Records pass, DB migration, Chrome QA sweep

**Work completed:**
- **Records pass** — Applied S925 PCVs to roadmap.md: logout flow → Chr✅ S925; #463 claim-click → CODE-ONLY note (beacon fire-and-forget, unverifiable in QA env).
- **DB migration** — Decoded 4 HTML-encoded category rows in Railway DB: "Electronics & Technology", "Lamps & Lighting", "Home Décor", "Jewelry & Watches".
- **HTML entity fix Chrome-verified** — Navigated /organizer/insights as Alice. No `&amp;` or `&#233;` visible in Items by Category. ✅ (ss_7450stzxz ss_5747xy01g)
- **Autonomous QA sweep** — 5 features Chrome-verified: organizer dashboard ✅, shopper dashboard (Leo Thomas) ✅, Explorer Profile ✅, #123 ranks page ✅ (Ranger card + "↑ Your rank" badge), #199 Hunt Pass active state ✅ (no "Active until N/A"). 6 PCVs staged.
- **⚠️ P3 new BQ item** — Dashboard stats bar "Hunt Pass 2x XP" vs /shopper/hunt-pass "1.5x XP on every action" multiplier display inconsistency.
- **Gmail DSN cleanup** — Trashed 104 mailer-daemon delivery delay/failure notifications from outreach@finda.sale inbox. S929 fix prevents new ones; backlog cleared.

**Files modified:** claude_docs/STATE.md, claude_docs/patrick-dashboard.md, claude_docs/strategy/roadmap.md (S925 PCVs applied)

**BQ delta:** 5 → 6 (+1 Hunt Pass multiplier P3)

### S929 — 2026-06-09 | BUG/OPS

**Session type:** Bug/Ops — Sentry triage + outreach placeholder fix

**Work completed:**
- **Sentry 10→5 issues resolved** — VACUUM ANALYZE on Sale + Organizer tables cleared NODEJS-10/2Y/32/3D/2N (table bloat). NODEJS-1A (bounceSuppressService module) cleared by redeploy (file exists, dynamic require had try/catch). 
- **DB indexes added (now live)** — `Sale_status_isInventoryContainer_endDate_idx` (NODEJS-3E: search.ts COUNT query) + `Organizer_contactEmail_isUnmanagedListing_idx` (NODEJS-38: emailDiscoveryJob). Migration deployed via `prisma migrate deploy`.
- **@system.finda.sale outreach leak fixed** — `PLACEHOLDER_DOMAINS` set was missing `system.finda.sale` in all 3 seeder files. Scraper creates synthetic emails (`scraper+slug@system.finda.sale`) stored as User.email; outreach cron was treating these as real organizer contactEmails and queuing outreach to them. Fix deployed. 0 bad rows confirmed in DirectoryClaimEmail queue before fix.
- **ImprovMX 500/day flood explained** — bounce DSNs from @system.finda.sale outreach attempts landing at finda.sale addresses ImprovMX forwards. Fix stops new bad emails; volume drops tomorrow. Outreach account confirmed NOT suspended (memory corrected).
- **NODEJS-1G still monitoring** — scraper fallback `findMany({ where: { isUnmanagedListing: true, address: { contains: city } } })` cannot use B-tree index on LIKE '%city%'. `@@index([isUnmanagedListing])` exists but not sufficient for large table scan. Needs `take: 500` limit or pg_trgm GIN index. Low frequency (< 1/day average). Deferred to S930.

**Files modified:**
- `packages/database/prisma/schema.prisma` — 2 new @@index entries (Organizer + Sale)
- `packages/database/prisma/migrations/20260608000001_add_missing_sale_organizer_indexes/migration.sql` — new migration
- `packages/backend/src/jobs/autoSeedOutreachCron.ts` — added 'system.finda.sale' to PLACEHOLDER_DOMAINS
- `packages/backend/src/scripts/seedDirectoryClaimEmails.ts` — same fix
- `packages/backend/src/scripts/backfill-warm-emails.ts` — same fix

**BQ delta:** 5 → 5 (unchanged — no feature work)



- `claude_docs/strategy/roadmap.md` — #465 updated (Tier 4 live), #470/SEO3/#471/#472 added
- `claude_docs/STATE.md` — S926 wrap
- `claude_docs/patrick-dashboard.md` — S926 summary

**BQ: 5 (unchanged).**


- `claude_docs/STATE.md` — S925 status, PCVs updated, Next Session updated for S926
- `claude_docs/patrick-dashboard.md` — S925 QA summary

**BQ: 5 (unchanged).**


- `claude_docs/STATE.md` — S924 wrap
- `claude_docs/patrick-dashboard.md` — S924 summary

**BQ: 5 (unchanged).** CSRF bug found and fixed in same session — no BQ entry needed.

### S923 and earlier — archived

_(Session entries S923 and earlier are in git history / prior STATE.md revisions. Trimmed per T4/T5 rotation — full detail in session-log-archive.md.)_

---
 
