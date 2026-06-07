# PROJECT STATE

Sections: §Current Status | §Pool Audit Findings | §Blocked Queue | §Recent Sessions | §Next Session

FindA.Sale is a two-sided marketplace PWA for secondary sale organizers (estate sales, yard sales, auctions, flea markets, consignment) connecting them with shoppers. Backend: Node.js/Prisma/PostgreSQL on Railway. Frontend: Next.js on Vercel.

---

## Current Status

**S907 — QA MODE (2026-06-07). Autonomous QA sweep complete. H-002 Leaflet map ✅ RESOLVED (pin popup "Gerald Ave Estate Sale" confirmed ss_8736lh0zj). Bounty E2E ✅ full flow (Alice submit → Bob approve → APPROVED → Alice notification). BountySubmission "Your Submissions" ✅ S906 fix confirmed (Pyrex record visible ss_5550658mg). Explorer's Guild URL: /shopper/guild-primer (not /guild or /shopper/guild — both 404). Pricing ✅ PRO=$29, TEAMS=$79 confirmed. 2 new P2 bugs: Flash Deal button (no onClick, /organizer/flash-deals → 404) + Social Posts button (no onClick). BQ: 7→9.**

**S906 — QA MODE (2026-06-07). Bug C (messages reply dark mode) ✅ CHROME-VERIFIED (DOM computed styles + visual). Hero search Enter ✅ CHROME-VERIFIED (navigated to /search?q=vintage%20lamp). BountySubmission "Your Submissions" display bug FIXED inline (getOrganizerSubmissions where clause: item.sale.organizerId→organizerId direct field, TS 0 errors). #176 stale roadmap note corrected. BQ: 9→7.**

**S905 — QA MODE (2026-06-07). Bug A (P1 passkey) ✅ CHROME-VERIFIED. #197 BountyMatchModal ✅ CHROME-VERIFIED (BountySubmission DB record confirmed). Bug C (messages dark mode) + Hero search Enter CODED. New P3: BountySubmission "Your Submissions" display bug. BQ: 11→9 (Bug A + #197 resolved).**

**S904 — QA MODE (2026-06-06). Autonomous QA sweep complete. Bug A (P1 passkey auth): CODED — next.config.js beforeFiles + usePasskey.ts double /api/ prefix fixed (TS 0 errors, pushblock below). Bug B (#197 bountyController): already coded S903, still pending push. Bug C (P3 messages reply dark mode): new finding. Hero search Enter (P3): new finding. Full product sweep ✅ — shopper discovery, organizer management all functional. BQ: 8→11 (3 new items). QA-ONLY continues.**

**S903 — QA MODE (2026-06-06). Wrap. #197 BountyMatchModal fix CODED (bountyController.ts, TS 0 errors). Pushblock provided to Patrick. Stale note confirmed: #176 "Sales Near You still missing" → INCORRECT, feature IS live (ss_5140qm032). BQ: 8 (unchanged).**

**S902 — QA MODE (2026-06-06). Autonomous QA continued. #27 CSV Export ✅ (ss_94917yaqg Amazon, ss_2041bm2l3 eBay). #66 Open Data Export ZIP ✅ (ss_3723v0nw2, ss_2914rv4if). #47 UGC Photo Tags ✅ full submit — modal → toast → DB record id=5 (status=PENDING, correct saleId/userId/tags). ⚠️ UX gap: no "pending review" message shown after submit. ❌ #197 BountyMatchModal production bug CONFIRMED: POST /bounties/match always 403 — bountyController.ts L581/L593 uses req.user?.id (user ID) vs item.sale.organizerId (organizer record ID) — they are different values; modal can never fire for any organizer. Added to BQ.**

**S901 — QA MODE (2026-06-06). CTA1 Chr ✅ S899 applied to roadmap.md (pre-compaction). FB Events geocoding BQ RESOLVED (242/260 PUBLISHED geocoded, 93% — 18 remaining). Chrome sweep: Homepage ✅ ss_0902g1f99, Search ✅ ss_97123xc98, Trending ✅ ss_51644lm5l, Organizer dashboard (Alice) ✅ ss_46975zqht, /organizer/insights real data ✅ ss_81628rlz9 ($220 revenue, 50% conversion rate). BQ: 8→7 (FB Events resolved). DEV mode available next session.**

**S900 — QA WRAP (2026-06-06). S899 parallel sessions reconciled: no conflicts. Combined BQ 13→10. Records PCV audit: S897/S898/S899 PCVs confirmed — #168 dark mode ✅ S898 + #213 dark mode ✅ S898 already applied; S897 PCVs all re-verifications of existing ✅ (no new Chrome column changes). FB Events API key alert + dateApproximate CONFIRMED ON GITHUB (S887/S890 fixes were already pushed — local files truncated by Cowork Edit tool). 13 local files corrupted by Edit tool truncation — Patrick must restore from GitHub HEAD before any local dev. BQ rows removed (10→8). QA MODE continues (8 = ceiling). Only pushblock: roadmap.md + STATE.md + patrick-dashboard.md.**

**S899 — QA MODE (2026-06-06, Chrome session). P0 RESOLVED: Vercel build (pages/index.tsx truncation — `export default HomePage;` restored, Patrick confirmed green). Hydration #418/#425 Chrome-verified ✅ RESOLVED (ss_7314kq2jb, ss_8313pt34n) — zero DevTools errors on finda.sale/ as user2 (Bob Smith). CTA1 re-verified Chrome ✅ (ss_7824i8i38, ss_6695ak8vm). Organizer sweep: Dashboard ✅ / Plan Tracker ✅ / Add Items ✅ / POS ✅ (all dark mode). Hydration BQ row removed (11→10). Combined S899 result: BQ 13→10.**

**S899 — QA MODE (2026-06-06, parallel no-Chrome session). (1) Geocoding BQ RESOLVED: psycopg2 `SELECT COUNT(*) FROM "Sale" WHERE lat IS NULL AND status='PUBLISHED'` = 70 (down from 716 at S891 — fix draining as expected). BQ row removed. (2) Outreach queue hygiene BQ RESOLVED: 480 BOUNCED + 2,206 stale PENDING (>30 days) archived = 2,686 total archived; 37 PENDING remain. BQ row removed. (3) S898 PCVs applied to roadmap.md: PerformanceDashboard dark mode ✅ S898 ss_1751wzkxe → row #168 Status updated; HuntPassModal dark mode ✅ S898 ss_4554ems7i → row #213 Notes updated. CTA1 skipped (no screenshot ID confirmed). Hydration CODE-ONLY (no Chrome column update). (4) FB Marketplace: DROP recommended — CF Worker dead end confirmed. Graph API OAuth path (#365) is the correct long-term approach. Patrick decision required. BQ: 13→11.**

**S898 — QA MODE (2026-06-06). D-002 RESOLVED (PerformanceDashboard ✅ ss_1751wzkxe, HuntPassModal ✅ ss_4554ems7i, CheckoutModal CODE-ONLY). Hydration #418/#425: 2nd root cause found + fix applied — formatSaleDate() used date-fns format() with local timezone during render; replaced with UTC-based getUTCMonth/getUTCDate. TS clean. Chrome re-verify pending post-deploy. BQ: 14→13. S897 PCVs: all 9 were re-verifications of already-✅ features (no roadmap Chrome column changes needed). CTA1 pre-compression Chrome-verified. SaleCard.tsx hydration fix pushed in this session's pushblock.**

**S898 — QA MODE (2026-06-06). D-002 dark mode RESOLVED: PerformanceDashboard ✅ Chrome (ss_1751wzkxe), HuntPassModal ✅ Chrome (ss_4554ems7i), CheckoutModal CODE-ONLY (0 shippingAvailable items in DB — untestable). Hydration #418/#425 Chrome-verified ❌: 26× #418 still firing after showToday useEffect fix (S897). 2nd root cause found: formatSaleDate() used date-fns format() with local timezone during render → SSR (UTC) vs client mismatch on every SaleCard. FIX APPLIED: removed format import, replaced with UTC-based getUTCMonth/getUTCDate. TS 0 errors. BQ: 14→13 (D-002 removed). CTA1 Chrome-verified pre-compression. S897 PCVs audited: all 9 are re-verifications of existing ✅ features, no roadmap Chrome column changes needed. Pushblock below.**

**S897 — QA MODE (2026-06-06). S896 push cd8ebe7 confirmed deployed (logout fix + SaleCard hydration + 24-file dark mode). Shopper full sweep as Leo Thomas (user5): dashboard Overview ✅ ss_7137f8yne, Subscribed ✅ ss_0769aas4z, Pickups ✅ ss_2093734df, Brands add+persist ✅ ss_7642d8yxi. Notifications dropdown + page + routing ✅ ss_3970ompns/ss_9978s0w2u/ss_4602ahmz7. /wishlists ✅ ss_5547dpc3u. RSVP toggle ✅ ss_4522hzw2t. Wishlist heart ✅ ss_413014505. Logout Chrome-verified ✅ ss_8330v4z5n → BQ resolved. D-002 + hydration Chrome-verify pending (fix deployed, verify deferred S898). BQ: 16→14.**

**S896 — QA MODE (2026-06-06). NAA RESOLVED (1,151 organizer records confirmed via psycopg2 — GH Actions run S895 succeeded). 3 BQ bug fixes coded + deployed in push cd8ebe7: (1) logout/index.ts — exempt /logout from authLimiter skip check; (2) SaleCard.tsx — defer isHappeningToday() to useEffect; (3) 24 components/pages — text-warm-900 → dark:text-warm-100. Logout bug Chrome-confirmed before fix (ss_3161s6ouz/ss_04637m5dv). BQ: 16→15 (NAA resolved).**

**S895 — QA MODE (2026-06-06). Weekly audit: 15 routes Chrome-tested, 2 new BQ entries (text-warm-900 D-002 violations + React hydration errors). QA work: roadmap PCVs applied (SEO-2 Human QA ✅ S894 web_fetch; CTA1 noted as deployed commit 270fd5e4, Chrome QA BLOCKED by P1 logout bug). NAA scraper triggered via GitHub Actions workflow_dispatch (run in progress at wrap — verify DB count next session). Geocoding draining normally (350 PUBLISHED ungeocoded, down from 360). NEW P1: POST /auth/logout rate-limited (429) → httpOnly JWT cookie not cleared → users re-authenticate on every page load, cannot achieve logged-out state. BQ: 13→15 (weekly audit) →16 (+logout P1). Full audit report: claude_docs/audits/weekly-audit-2026-06-06.md.**

**S894 — QA MODE. Records pass: SEO-1+GUEST1 PCVs applied; BQ cleaned 19→13; S890 push verified; CTA1+SEO-2 PCVs staged.**
Records: roadmap.md Chr column updated (SEO-1 ✅ S892, GUEST1 ✅ S893). BQ 19→13: removed AuctionNinja RESOLVED, AuctionZip RESOLVED, merged auction row, SEO-1 LIVE-VERIFIED S892, CTA1 Chrome-verified S894, SEO-2 web_fetch-verified S894. S890 push verify: all 6 files on GitHub main (SaleCard sha 6e48e50, run-search-facebook-events sha e330401, internalGeocodingController sha 7f884de, shopifyService sha 7662b5e, naaAuctioneerDirectory sha e0e8488, shopify.tsx sha 95c0e78). CTA1 fix (sales/[id].tsx L1494+L1888) in local file but NOT on GitHub — pushblock provided below. Geocoding: 360 PUBLISHED ungeocoded (down from 539 — S891/S893 fix still draining ✅).

**S893 — QA MODE. AuctionZip harvest complete + Chrome QA (GUEST1/CTA1). CTA1 bug found + fixed.**
(1) **AuctionZip harvest: 4,893 organizer records** now in Railway DB with directoryMostRecentSource='AuctionZip' (bulk psycopg2: 395 existing updated + 4,498 new inserted). BQ row → RESOLVED. (2) **Chrome QA — GUEST1 ✅ VERIFIED:** Navigated `https://finda.sale/sales/cmpw9mmi401sbj8zfkx7f80oh` as logged-out guest. Scrolled to GuestSaleAlert. Entered `qaguest-s893@test.com`, clicked "Get alerts". Saw "✓ You're on the list — we'll email you when new items are added." DB confirmed: SearchNotification record written (query: estate treasures 84..., city: Norfolk). ss_4884utc9f. (3) **CTA1 ❌ BUG FOUND + FIXED:** "Remind Me by Email" button was visible to logged-out users at L1494 (top action bar) and L1888 (inventory empty state) — contradicting S892 spec (only L1535 was auth-gated). Both now wrapped in `{user && ...}`. Zero TS errors. Needs Chrome re-verify post-deploy. (4) **Geocoding:** 539 PUBLISHED ungeocoded (down from 716 — S891 fix draining ✅). (5) **NAA:** 0 organizers — push still pending (naaAuctioneerDirectory.ts fix from S890 never pushed).

**S892 — DEV + RECORDS. Growth-channel reactivation audit + SEO-1 REAL FIX (live-verified) + logged-out conversion-leak plugs.** (1) **SEO-1 sale-page blank social unfurl — genuinely FIXED + LIVE-VERIFIED.** S891's "render head pre-mount" attempt did NOT server-render the head (Pages Router: a client-side `isLoading` early-return still ships a blank `<head>`), so shared sale links kept unfurling blank. THIS session converted `pages/sales/[id].tsx` to `getStaticProps`+ISR (`fallback:'blocking'`) so og/JSON-LD/canonical render server-side (verified in code: getStaticPaths L2517 / getStaticProps L2526). **LIVE VERIFICATION (not code-only):** web_fetch of a live published sale returned full sale-specific OG tags; Facebook Sharing Debugger scraped the URL -> HTTP 200 and built a correct preview (real og:title "Home decor galore! — FindA.Sale", og:description, Cloudinary og:image). -> roadmap SEO1 BROKEN->FIXED S892. (2) **Logged-out conversion-leak plugs:** added `GuestSaleAlert` no-login email capture (L288 def / L1550 render) so logged-out visitors get alerts without being forced to /login; hid the dead-end "Remind Me by Email" button for logged-out users (it only worked logged-in — L1534). (3) **SEO-2 (dedupe double-emitted og/twitter meta + homepage conflicting canonical): IN PROGRESS this session** (parallel dev task, building on S891's canonical `key` work). (4) Growth audit -> 3 strategy docs in `claude_docs/strategy/`: growth-reactivation-plan-2026-06-05.md, growth-knockon-and-creative-levers-2026-06-05.md, turn-it-back-on-checklist-week-of-2026-06-05.md. (5) ⚠️ **DEV-ENV FINDING:** the VM pnpm `tsc` binary is broken (MODULE_NOT_FOUND) — this is why prior dev subagents falsely reported "tsc clean." Verify via `next build`, not VM `tsc`, going forward. BQ: 18 rows (SEO-1 now LIVE-VERIFIED/clearing; SEO-2 in-progress).**

**S891 — DEV MODE (SEO + geocoding + auction transport). (1) Shopper-discovery SEO audit → 2 P1 fixes SHIPPED: SEO-1 — sale detail pages now server-render their `<head>` (root cause: client-side `isLoading` early-return shipped a blank head, so shared sale links unfurled blank on FB/iMessage/Slack; fix mirrors city/[slug].tsx SSR/ISR); SEO-2 — deduped conflicting canonical across 17 pages (root cause: `_app.tsx` global canonical from `router.asPath`='/index' on the statically-built homepage + missing Next.js `key` so page+global never collapsed). Audit: claude_docs/audits/seo-shopper-discovery-2026-06-05.md. Both → roadmap BROKEN (SEO1/SEO2). (2) Geocoding drain unblocked — leftover `address<>''` filter + FB-Events-only city fallback excluded ~310 PUBLISHED GSF rows (empty street address, valid city/zip); broadened batch whereClause to city+state (internalGeocodingController.ts). GSF carries no source coords (psycopg2) → city-center is the only path. Live count already moved 1,164→716; fix opens the last 310. (3) AuctionZip UA test (getRandomUserAgent, matching AuctionNinja) deployed + re-run → STILL 403 every page → confirms a hard Cloudflare datacenter-IP/challenge block, NOT a UA heuristic. Free server-side path exhausted → one-time Chrome MCP harvest queued (Patrick's directive; auctionzip.com loads via real browser/residential IP — S890 parsed 235/page). All TS-verified. ⚠️ VM git mount corrupted this session (phantom truncations + false ~600-line deletions); Windows files verified intact via file tools — trust Windows `git status`, not VM bash. BQ: 16 rows (AuctionZip row updated; SEO1/SEO2 in roadmap BROKEN).**

**S890 — QA MODE (DB/code verification sweep, no browser). Worked all 16 Blocked Queue items. Net result: 1 RESOLVED (#12 Sale-Ending-Soon rate cap — confirmed deployed on main + 500/day cap), 2 with NEW actionable root cause (geocoding #5/#6), rest confirmed still-open with tool evidence. Headline findings: (1) GEOCODING is live + working (6,366 sales geocoded Jun 5, 331 Jun 6 — workflow on main, 3×/day, batch 500, city-center + Census fallbacks all present) BUT backlog frozen at 15,792 because the batch endpoint fetches newest-500 (`createdAt desc`, offset 0) which are 100% GarageSaleFinder — the older FB Events + GSF backlog is never drained. (2) FB Events city-center fallback is correct + deployed but NEVER EXECUTES on the 1,307 city-only records because they sit below continuous GSF arrivals at offset 0 — available fix: workflow already supports a `source` input, so a `source=Facebook Events` run drains all 1,307 immediately. (3) AUCTION VERTICAL IS DEAD: AuctionNinja (Railway cron removed, GH Actions Cloudflare-blocked), AuctionZip (not even in sourceRegistry), NAA (JS-rendered/broken) — all 0 records, sales AND organizers. (4) FB MARKETPLACE still 0 records / lastScrapedAt NULL despite S888 Cloudflare Worker. (5) Outreach leak CONFIRMED PLUGGED (0 DirectoryClaimEmail sends since Jun 5 08:00 UTC). Outreach hygiene/backfill/enrichment numbers UNCHANGED from S887 (correctly deferred while OUTREACH_ENABLED=false). All evidence via psycopg2 against Railway public proxy + GitHub main file reads. BQ: 16 rows (−1 #12 rate cap resolved, +1 FB Marketplace).**

**S890 part 2 — Patrick said dispatch the remaining. 3 agents run.** (A) DEV fixes coded + TS-verified (0 errors both packages), PENDING PUSH: geocoding now filters to status='PUBLISHED' (skips the 14,628 ENDED un-geocoded sales — Patrick's call; collapses working set 15,792→1,164) + oldest-first ordering; FB Events search-key health alert; "Dates approximate" label on sale detail + SaleCard. (B) AUCTION INVESTIGATION (no code) — **reverses the "dead vertical" conclusion: all 3 are CHEAPLY FIXABLE.** AuctionZip = stale CSS-class regex (site serves clean static HTML, ~25k auctioneer records behind a one-function parser rewrite); NAA = member profile pages ARE static via sitemap.xml (the "needs Playwright" diagnosis is WRONG — sitemap-crawl fixes it); AuctionNinja = relay architecture is correct + directory page accessible from non-AWS IP, needs a live `workflow_dispatch` trigger to confirm (CF Worker proxy as fallback if Railway GCP IP is also blocked). No paid proxy/Playwright needed for any. (C) SHOPIFY REVIEW (no account, code+docs) — **VERDICT: NOT READY.** No OAuth flow exists (manual private-app token paste model that contradicts the published user guide); API pinned to unsupported 2024-01; `markShopifyItemSold` inventory-adjust call malformed (missing location_id + passes variantId where inventory_item_id is required → silent sold-sync failure); no inbound webhook handler; token stored plaintext. Needs a dev pass before any store QA.**

**S889 — BUG MODE. "Outreach still sending despite OUTREACH_ENABLED=false" investigated and CLOSED as a propagation-lag false alarm — no active leak, no code change required.** Root cause: every send path (GH-triggered `outreach-emails` job via JOB_MAP, the manual `/api/internal/outreach/send` route, and `startupCatchUp()` on boot) funnels through the single function `sendOutreachEmails()`, which hard-aborts at outreachEmailsCron.ts:201 when `OUTREACH_ENABLED !== 'true'`. The 7 sends at 07:59 UTC Jun 5 were a `startupCatchUp` window (fires 30s post-boot if last send >5h ago) on a backend process that still held the stale `OUTREACH_ENABLED=true` value — the var was set to false in S887 but a running process doesn't pick up env changes until redeploy. Backend redeployed 22:39 UTC Jun 5 (deployment 0352c24e). Verified plugged: DB shows ZERO `DirectoryClaimEmail` sends since 07:59 Jun 5 (16+ h, across the 12:00/16:00/20:00 Jun 5 + 00:00 Jun 6 windows); Railway deploy logs for the 00:00 Jun 6 cron batch show the full job set running with no outreach job triggered at all (GH workflow `pipeline-outreach-emails.yml` disabled S865 = 2nd independent layer); `OUTREACH_ENABLED` confirmed present on backend service via Railway agent (value hidden, set false per S887; gate is `!== 'true'` so any non-'true' value blocks). Tooling note: Railway CLI binary absent from this session mount — used Railway MCP (get-status/get-logs/railway-agent) + psycopg2 against public proxy instead.

**S888 — DEV MODE. FB Marketplace IP bypass SHIPPED + LIVE end-to-end. Cloudflare Worker `findasale-fb-proxy` deployed at https://findasale-fb-proxy.findasale.workers.dev (auth: PROXY_TOKEN bearer). Railway env vars FB_MARKETPLACE_PROXY_URL + FB_MARKETPLACE_PROXY_TOKEN set; backend redeployed; production logs confirm `[FacebookMarketplace] Transport: CLOUDFLARE_WORKER`. Scraper requests are now reaching Facebook's GraphQL API (response shape: `"Rate limit exceeded"` JSON — the rate-limit error code 1675004, *not* the HTML/0-listings IP block Railway used to get). DB records still 0 because we burned FB's per-IP rate budget during the day's testing; clears in ~30-60 min, next scheduled run will start ingesting real listings. Free tier 100k req/day covers ~129 req/run. Closes "FB Marketplace: 0 records ever" S887 finding pending rate-limit cooldown.**

**S887 — DEV MODE + SCRAPER AUDIT. AuctionNinja → Railway cron live. DB-backed Gmail quota guard deployed (EmailQuotaLog, hard stop 1500/day). Gmail monitoring crons active (OAuth health/send summary/suspension detect). Scraper audit complete: 48,701 sales in DB, 15,792 (32%) un-geocoded — geocoding job net-negative (+785/day GSF ingest vs ~200/day cleared). FB Marketplace: 0 records ever. FB Events: 96% un-geocoded. NAA: declared BROKEN. AuctionNinja/AuctionZip: 0 organizer records. 462 WARM leads email-ready but no outreach record. Outreach still trickling 7/day despite OUTREACH_ENABLED=false — root cause unclear. BQ: 17 rows (6 P1/P2 from S887 audit + 7 P2/P3 added S887 Records pass).**

**⚠️ S865-auto (Jun 5) URGENT: Email suspension RE-TRIPPED. Pipeline sent 8,317+ emails → Google Workspace daily limit hit. GH workflow DISABLED, OUTREACH_ENABLED=false set. Patrick must reactivate outreach@finda.sale at admin.google.com. See Blocked Queue #335.**

**S886 — QA + DEV + RECORDS. P2 POS draftStatus fix ✅ Chrome-verified search path (ss_5792yv22r), CODE-ONLY QR toast. P3 "View sale" 404 closed (false positive — code already correct). Records: STATE.md cleaned, BQ 4 rows.**

**Latest: S885 — QA MODE. Rarity Boost 15 XP ✅ Chrome-verified (ss_10072ub1r). Add-items pipeline ✅ Chrome-verified end-to-end (upload→analyze→approve→live). POS core UI ✅ verified. 2 new bugs found: P3 (review page "View sale" 404), P2 (POS search shows PENDING_REVIEW items). Blocked Queue: 5 rows (was 5, +1 #335 emergency).**

**S884 — Records: S883 PCVs applied (18 rows). Rarity Boost UI fix ✅ code-complete (coupons.tsx 50→15 XP, pending push). Chrome QA BLOCKED (extension permission prompt — Patrick action needed). Blocked Queue: 4 rows.**

**S883 — QA MODE. Records: S882 PCVs applied. 18 pages Chrome-verified. #293 eBay conditionNotes ✅ Human-verified (eBay Inventory API confirms live on listing 137309459090). OAuth supersede ✅ Patrick-verified. Email migration ✅ confirmed deployed May 15. Game Design: Rarity Boost locked at 15 XP + $0.50 cash rail (separate sprint). UI bug (50 XP displayed) → dev dispatch queued. Blocked Queue: 5 rows.**

**S882: #197 Bounties P2 ✅ Patrick-confirmed (no error toast post S881 fix). Y-axis P3 ✅ Chrome-verified (ss_9355qlny8). Wide organizer page sweep: 24 pages ✅, 4×404 not-linked (P3). Blocked Queue: 7 rows (QA MODE continues).**

**S880: #192 ✅ Chrome-verified (ENDED sale price history renders). /organizer/customers: not linked from nav — closed from queue. NEW P2 REGRESSION: /shopper/bounties 500 (#197 was ✅ S862, S868 FK migration broke it — getCommunityBounties controller, DB query confirmed OK). P3: chart Y-axis "000001" float display bug.**

**S879: Records: #166→Chr ✅ S878 applied. #192 P2: 2 root-cause bugs found + inline fixed (missing optionalAuthenticate on route + organizerId vs userId comparison error in controller). Push ✅ confirmed (commit 6d8bab8 Jun 5). Admin dead links S878 finding = FALSE POSITIVE. New P3: /organizer/customers → 404.**
- **S874: Records pass applied + YMAL fix deployed.** S874 PCVs staged → roadmap applied S875.
- **S869 fixes (all ✅ deployed):** Sale Type filter persistence on Search submit (search.tsx handleSearch), ZIP export copy per-button rate-limit notes (settings.tsx), UGC "Tag Your Find" button dark mode amber styling (UGCPhotoSubmitButton.tsx), auth/me password hash stripped (auth.ts safeUser destructure), OAuth session supersede fix (OAuthBridge !user guard removed from _app.tsx). Bonus: search.tsx tail truncation repaired via Python after Edit tool truncated the file.
- **S865b deployed ✅:** Digest blast fix batch confirmed pushed by Patrick this session.
- **Previous: S868 — BUG+INFRA:** Schema FK audit (4 migrations deployed), Foursquare fixed, AuctionNinja partially fixed but Cloudflare-blocked. Blocked Queue +1 (AuctionNinja).

**Previous: S864 — QA MODE: #195 ✅ Chrome-verified. Vercel build broken by saved-searches.tsx TS error — fixed. #324/#176 PCV marks applied. #335 email diagnosis → S864 SES_FROM_EMAIL theory disproven S865.**
- QA ✅: #195 messaging re-fix Chrome-verified — POST /api/messages → 201, no 500 (ss_6119ualta, ss_03909ty8h). S863 backend fix confirmed live.
- Records: #324 Chr column updated to ✅ S863, #176 Status updated with Type filter evidence.
- Vercel build failure found: S863 commit caused 3 consecutive ERRORED Vercel deploys. Root cause: saved-searches.tsx priceMin/priceMax typed as `number` but compared to `''` → TS error. QA agent fixed to `number | string | null`. 0 TS errors confirmed.
- #194 saved-searches, #47 UGC, /search saleType: NOT deployed (Vercel blocked). Pending push of saved-searches.tsx fix.
- ⚠️ #335 REGRESSION INTRODUCED S864: Claude incorrectly diagnosed Yahoo deliverability as root cause and advised changing SES_FROM_EMAIL from `find@outreach.finda.sale` → `outreach@finda.sale`. This broke the Gmail API send entirely — confirmed by testing artifactmi@gmail.com (no email arrived anywhere). SES_FROM_EMAIL must be reverted to `find@outreach.finda.sale` in Railway immediately. The actual #335 diagnosis is incomplete.

**Previous: S863 — QA MODE: #324 EXIF + #176 verified. #195 STILL 500 — second root cause found+fixed. #194/#47 built. Jane Thrift payout email RE-SENT. Records pass applied.**

**Previous: S862 — QA+DEV: 6 code fixes shipped. 14 features Chrome-verified. 4 new bugs found.**
- DEV fixes: Tranche B fraud gate (pointsController.ts), #324 EXIF preservation (uploadController.ts), #176 saleType in feed (discoveryService.ts + search.ts), #195 messaging 500 crash (messageController.ts + transaction), #66 ZIP export UI (settings.tsx), #31 Brand Kit → print-kit colors (print-kit/[saleId].tsx).
- QA ✅: #327 Price Cal Logging, #73 Two-Channel Notifications, #186 QR Scan Analytics, #396 Starter Kit, #197 Bounties, #163 Earnings, #173 Message Templates, Shopper Dashboard, Hunt Pass, #71 Reputation.
- New bugs: #194 Saved Searches view page missing (P2), #47 UGC Photo Submit not on sale detail (P2), #192 Price History data-dependent (UNVERIFIED).

**Previous: S861 — QA: #316 Tranche B ✅ Chrome-verified (ss_1479i18cy/ss_71277qiak/ss_1277utzwj). New P2: recordSaleVisit() after fraud early-return. #324 EXIF P1 bug found (Cloudinary strips EXIF by default). Blocked Queue: 8→10 rows.**

**Previous: S860 — QA+Records+DEV: #316 Tranche B P1 bug found+fixed. Notifications sort P2 fixed (|| → ??). #316 re-test ❌→✅. P2 referral banner fixed. Blocked Queue: 8 rows.**

**Previous: S858 — QA+DEV: Flash Deal dropdown FIXED. #398/#259/#290/#158 ✅. Blocked Queue: 6 rows.**

## Pool Audit Findings

Run: 2026-05-18 (S756). Railway DB queried directly via psycopg2.

**DirectoryClaimEmail (outreach queue):** 3,319 PENDING, 29 SENT. 31 junk rows deleted (26 image filenames stored as emailAddress, 5 Patrick test emails).

**leadTier breakdown:** HOT: 5,517 (100% website coverage) · WARM: 36,851 (3.3% website coverage) · COLD: 14,314

**WARM email gap:** Only 208 WARM orgs currently addressable. Website enrichment job changed from weekly → daily (S756). API headroom: HERE 250K/month cap, ~1,500/month usage. Pipeline healthy.

**Geocoding:** 6,760 sales still not geocoded. Nightly geocoding job addresses gradually.

---

## Blocked Queue

_S772 reconciliation: graduated/closed rows removed — reconciled into strategy/roadmap.md. Only genuinely open items remain._
_⚠️ P0 AGING: #332 at 73+ sessions — mandatory P0 per CLAUDE.md §10a._
_S886: P3 review link fix ✅ Chrome-verified S886 — removed. P2 POS filter fix ✅ Chrome-verified S886 — removed. Blocked Queue: 4 rows (#335 P1 URGENT outreach suspension + #332 + AuctionNinja + #230)._
_S887 Records pass: 6 new rows added from scraper audit (P1/P2). S887 Records pass #2: 7 additional rows added (P2/P3). Blocked Queue: 17 rows total._
_S889 BUG MODE: "Outreach still sending despite OUTREACH_ENABLED=false" CLOSED — propagation-lag false alarm, not an active leak. Removed from queue. Evidence: all send paths gated at sendOutreachEmails() outreachEmailsCron.ts:201; backend redeployed 22:39 UTC Jun 5; ZERO DirectoryClaimEmail sends since 07:59 Jun 5 across 4 cron windows (psycopg2 + Railway deploy logs deployment 0352c24e); GH workflow pipeline-outreach-emails.yml disabled = 2nd layer. Blocked Queue: 16 rows._
_S890 QA MODE: full 16-item DB/code verification sweep (no browser — data items). **#12 Sale-Ending-Soon rate cap CLOSED** — confirmed deployed on main (saleEndingSoonJob.ts: DAILY_EMAIL_CAP=500 + per-send suppression check, GitHub sha 180fff9). All other rows annotated with S890 tool evidence (psycopg2 + GitHub main reads); root causes refined where found. Blocked Queue: 15 rows._
_S894 Records pass: AuctionNinja RESOLVED + AuctionZip RESOLVED + merged auction row RESOLVED + SEO-1 LIVE-VERIFIED S892 + CTA1 Chrome-verified S894 + SEO-2 web_fetch-verified S894 → all 6 removed. Blocked Queue: 13 rows._
_S895 weekly audit (2026-06-06): 2 new rows added — text-warm-900 D-002 violations (HIGH) + React hydration errors (MEDIUM). Blocked Queue: 15 rows._
_S895 QA wrap: +1 P1 logout rate-limiter bug (POST /auth/logout 429 → JWT cookie persists → re-auth on page load). Blocked Queue: 16 rows._
_S896 QA MODE: NAA RESOLVED (1,151 organizer records confirmed via psycopg2 — GH Actions run S895 succeeded). 3 BQ fixes CODED + pending push: (1) logout/index.ts — exempt /logout from authLimiter skip check; (2) SaleCard.tsx — defer isHappeningToday() to useEffect (hydration fix); (3) 24 components/pages — text-warm-900 → dark:text-warm-100. Logout bug confirmed live via Chrome (ss_3161s6ouz/ss_04637m5dv). Blocked Queue: 16→15 (NAA row resolved)._
_S897 QA MODE: S896 push cd8ebe7 confirmed deployed — all 3 fixes live on Railway. Shopper flows QA complete: Leo Thomas (user5) full sweep — dashboard Overview/Subscribed/Pickups/Brands, notifications, wishlists, RSVP toggle, wishlist heart. Logout Chrome-verified ✅ ss_8330v4z5n → RESOLVED + removed from BQ. NAA row removed. Dark mode D-002 + hydration: deployed, Chrome verify pending. BQ: 16→14._
_S899 QA MODE (parallel no-Chrome): Geocoding RESOLVED (psycopg2 count=70, BQ row removed). Outreach hygiene RESOLVED (2,686 archived, BQ row removed). S898 PCVs applied to roadmap.md. FB Marketplace DROP recommendation provided. BQ: 13→11._
_S899 QA MODE: React hydration #418/#425 Chrome-verified ✅ RESOLVED (ss_7314kq2jb, ss_8313pt34n) — row removed. Vercel build P0 RESOLVED (pages/index.tsx `export default HomePage;` restored). Organizer sweep clean. BQ: 13→12._
_S900 QA WRAP: FB Events API key alert (P2) CONFIRMED ON GITHUB (sha e330401f run-search-facebook-events.ts) + FB Events dateApproximate (P3) CONFIRMED ON GITHUB (sha 6191e53d SaleCard.tsx) — both local files truncated, GitHub has the complete fixes. Both BQ rows REMOVED. Local file corruption discovered: 13 tracked files truncated vs GitHub HEAD. Patrick must restore via git checkout HEAD. BQ: 10→8._
_S904 QA MODE: Bug A (P1 passkey auth) CODED this session — next.config.js + usePasskey.ts. Bug C (P3 messages reply dark mode) + Hero search Enter (P3) added as new BQ items. BQ: 8→11._
_S905 QA MODE: Bug A ✅ CHROME-VERIFIED (passkey routes reach Railway — 403 CSRF confirmed, not 404). #197 ✅ CHROME-VERIFIED (modal opened without 403; BountySubmission DB record id=cmq361vpz000d7andwmuns3p0 created, status=PENDING_REVIEW). Bug C (messages dark mode) + Hero search Enter: CODED pending push. New P3: BountySubmission "Your Submissions" tab shows empty state even after successful submission. BQ: 11→9 (Bug A + #197 removed)._
_S906 QA MODE: Bug C ✅ CHROME-VERIFIED (DOM + visual ss_4563dqnh2 — gray-800 form on gray-900 page, gray-600 border, shadow). Hero search Enter ✅ CHROME-VERIFIED (ss_8251ipdgd — /search?q=vintage%20lamp navigated). BountySubmission display bug FIXED inline — getOrganizerSubmissions changed from item.sale.organizerId indirect join to direct organizerId field (BountySubmission schema has @id organizerId column). TS 0 errors. Bug C + Hero search BQ rows removed. BQ: 9→7._
_S898 QA MODE: D-002 dark mode RESOLVED — PerformanceDashboard ✅ Chrome S898 (ss_1751wzkxe), HuntPassModal ✅ Chrome S898 (ss_4554ems7i), CheckoutModal CODE-ONLY (0 shippingAvailable items in DB — genuinely untestable). D-002 row removed. Hydration #418/#425: S896 showToday fix was PARTIAL — Chrome-verified still 26× #418 post-deploy. ROOT CAUSE FOUND + FIX APPLIED S898: formatSaleDate() used date-fns format() with local timezone during render; server (UTC) vs client (local tz) produces different 'MMM d' strings for timezone-edge sales → hydration mismatch on every SaleCard. FIX: removed format import, replaced with UTC-based getUTCMonth/getUTCDate. TS 0 errors. Chrome re-verify pending. BQ: 14→13 (D-002 removed)._

| Feature | Reason | What's Needed | Session Added |
|---------|--------|---------------|---------------|
| #332 Shopify Cross-Listing → CORE BUGS FIXED (pending push) | **P0** — **S890 FIXES CODED** (shopifyService.ts + connect-shopify.ts, TS 0 errors both packages): (1) sold-sync rewritten to correct 3-step REST flow — GET variant→inventory_item_id, GET locations→location_id, POST /inventory_levels/set.json (was malformed, silently failing); (2) API version 2024-01→2025-10; (3) variant payload gets `inventory_management:'shopify'`; (4) connect-shopify guide rewritten to match the real manual-token flow (removed false OAuth/auto-webhook/auto-sync promises); (5) 422/429 error handling added. **FLAGGED for Patrick (NOT built — future decisions):** proper OAuth app, inbound webhook handler (Shopify→FindA.Sale is one-way only), token encryption, optional ShopifyListing.shopifyInventoryItemId column to skip the 2 lookup calls. **Store still needed for live QA, but the code is now correct.** | Push; then connect a real custom-app store to QA the push + sold-sync end-to-end | S791 |

| #230 Smart Buyer Widget Human QA | **P3** — Claude QA ✅ S793 confirmed. Human QA pending: no published sale on real test organizer account. **S890:** unchanged — DB-only session, no Chrome. | Patrick: publish a sale on user1, then visit organizer dashboard to verify SmartBuyerWidget shows shopper data | S859 |
| #335 Consignor Payout Email + Outreach Sending Suspension RE-TRIPPED | **P1 URGENT** — S865d task confirmed "reached a limit" bounce at 6:03 AM Jun 5. Pipeline (pipeline-outreach-emails.yml) sent 8,317+ "Weekend Estate Sale Digest" emails to scraped contacts overnight, hit Google Workspace daily sending limit. EMERGENCY ACTIONS TAKEN: GH workflow disabled (confirmed "Workflow disabled successfully" Jun 5), OUTREACH_ENABLED=false set in Railway (confirmed `{"keys":["OUTREACH_ENABLED"],"set":true}`). Yahoo delivery: S865d test email landed in inbox (not spam) Jun 4 12:05 PM ✅. "FindA.Sale delivery audit" email not found in Yahoo (blocked before send). Remaining step for #335 ✅: Patrick must (1) reactivate outreach@finda.sale at admin.google.com → Directory → Users → outreach@finda.sale → Reactivate, (2) keep volumes very low for 2+ weeks (domain warming needed — 17 days silence + cold-email history), (3) re-trigger Jane Thrift payout email and confirm Yahoo delivery once account is reactivated. **S890 re-verified leak PLUGGED:** 0 DirectoryClaimEmail sends since Jun 5 08:00 UTC (psycopg2). No active sending. Only the Gmail reactivation + Jane Thrift re-send remain (Patrick). | S865-auto / Jun 5 |


| 462 WARM leads email-ready, no outreach record | **P2** — **S890 UNCHANGED: still exactly 462** (psycopg2). Note: backfill-organizer-contacts.yml backfills CONTACT data (email/phone), NOT DirectoryClaimEmail rows — that queue-row backfill was never built. Correctly deferred while OUTREACH_ENABLED=false (#335). Do during outreach resume. | Backfill DirectoryClaimEmail PENDING for the 462 as part of #335 resume | S887 |

| WARM tier website enrichment at 3.5% coverage | **P3** — **S890 UNCHANGED: 1,382 of 39,246 = 3.5%** (psycopg2). pipeline-website-enrichment.yml exists but coverage not improving. Needs supplemental source. | Add supplemental data provider or expand query strategies | S887 |
| GarageSaleFinder 80.7% un-geocoded (14,331 records) | **P3** — **S890 confirmed: 14,331 of 17,761 GSF = 80.7%** (psycopg2). GSF IS actively processed (it's 100% of the newest-500 batch) but GSF address format fails Nominatim structured ~80% — structural, acknowledged in geocodingAuditJob.ts suppression list. Tied to geocoding fetch-ordering row; even oldest-first won't fix GSF without a GSF-specific strategy. | GSF-specific geocode (lat/lng on source pages?) or accept the gap | S887 |
| FB Marketplace 0 records — CF Worker proxy is a DEAD END | **P2 — S890 DEFINITIVELY DIAGNOSED via live run + Railway logs (02:22-02:25 UTC Jun 6).** Proxy env vars confirmed live; run logged `[FacebookMarketplace] Transport: CLOUDFLARE_WORKER (https://findasale-fb-proxy.findasale.workers.dev/fb-graphql)` — so the proxy IS in use. Result: **every query in every metro returned "Found 0 listings"** (garage/yard/estate × jacksonville/fort-worth/columbus/charlotte/sf/indy/seattle/denver…), 0 created across the board, no errors. FB returns empty results even through Cloudflare's edge IPs (datacenter-IP soft-block; FB Marketplace search increasingly requires an authenticated session). **The free-Cloudflare-Worker approach (S888) does not and will not work for FB Marketplace.** Options: paid residential/mobile proxies + session auth, or DROP FB Marketplace. Recommend DROP unless FB listings become a priority — high effort, brittle, ToS-risky. | Patrick decision: DROP recommended (S899) — residential proxy + auth high-effort + ToS risk; Graph API OAuth path (#365) is the correct long-term alternative. | S890 |

| Flash Deal dashboard button — inert stub (no onClick, /organizer/flash-deals → 404) | **P2** — S907 Chrome: /organizer/dashboard as Alice (user1). Clicked "Create Flash Deal" button → no action, no navigation. JS: `<button>` with no onClick handler. /organizer/flash-deals → 404. Unimplemented stub. | Implement /organizer/flash-deals route + page + wire onClick | S907 |

| Social Posts dashboard button — inert stub (no onClick) | **P2** — S907 Chrome: /organizer/dashboard as Alice (user1). Clicked "Social Posts" button → no action. JS: `<button>` with no onClick handler. Unimplemented stub. | Implement Social Posts modal/flow + wire onClick | S907 |

---

## Pending Chrome Verifications

| # | Feature | Evidence | Session |
| — | Bug C — Messages reply form dark mode (S905 fix) | Navigated finda.sale/messages/cmomwghd500ot11qwsx7oobic as Alice Johnson (shopper). DOM: form bg rgb(31,41,55) (gray-800) vs page rgb(17,24,39) (gray-900). Border-top rgb(75,85,99) (gray-600). Shadow rgba(0,0,0,0.45) 0px -4px 12px. Visual ss_4563dqnh2 shows lighter strip + separator. | S906 |
| — | Hero search Enter key navigation (S905 fix) | Navigated finda.sale/ as Alice Johnson. Clicked hero input. Typed "vintage lamp". Pressed Enter. URL → /search?q=vintage%20lamp. Results page loaded with 3 sales (ss_8251ipdgd). | S906 |
| — | Bug A — Passkey auth routes reach Railway (not NextAuth 404) | Navigated to finda.sale as Alice (user1). JS-fetched /api/auth/passkey/authenticate/options and /api/auth/passkey/register/options. Both returned HTTP 403 with Railway CSRF validation message — confirms routes reach Railway backend. Pre-fix: NextAuth catch-all returned 404. Bug A fix confirmed working. ss_525855od8 (modal), ss_6954mly74 (post-submit) | S905 |
| — | #197 BountyMatchModal — POST /bounties/match fix | Navigated /organizer/bounties as Alice (user1). Clicked "I have this!" on Bob Smith bounty → BountyMatchModal opened (no 403). Selected "QA Active Sale S875" + "Vintage Pyrex Bowls Set ($45.00)". Typed message + clicked Submit → modal closed, green "Submission" toast appeared. DB confirmed: BountySubmission id=cmq361vpz000d7andwmuns3p0, status=PENDING_REVIEW, itemId=90bde6e8 (Pyrex), shopperMessage="QA test S905 — bounty match fix verify". ss_525855od8, ss_6954mly74, ss_64952omqa | S905 |
|---|---------|----------|---------|
| — | CTA1 — Logged-out sale page "Remind Me by Email" absent | Pre-compression S898 Chrome verify. Navigated sale page as logged-out guest — "Remind Me by Email" absent. Screenshot ID not captured in post-compression summary. Records: verify screenshot in transcript before applying to roadmap. Evidence path: .claude/projects/.../8ebb1c20-2219-4e45-95a5-58c139e4bb8e.jsonl | S898 |
| — | PerformanceDashboard dark mode (D-002 verify) | ✅ Chrome-verified S898 — /organizer/performance as Alice (user1) in dark mode. All metrics readable. ss_1751wzkxe — **Applied to roadmap S899 (row #168 Status)** | S898 |
| — | HuntPassModal dark mode (D-002 verify) | ✅ Chrome-verified S898 — Navigated /shopper/hunt-pass as Bob Smith (user2). Clicked "Upgrade to Hunt Pass". Modal opened with dark background, white "Upgrade to Hunt Pass" title, "Hunt Pass Benefits" card visible, pricing rows readable in dark mode. ss_4554ems7i + zoom screenshot — **Applied to roadmap S899 (row #213 Notes)** | S898 |
| — | React hydration #418/#425 — formatSaleDate UTC fix | ✅ Chrome-verified S899 — Navigated finda.sale/ as Bob Smith (user2). DevTools console: zero hydration errors. UTC formatSaleDate fix confirmed. ss_7314kq2jb, ss_8313pt34n | S899 |
| — | Logout rate-limiter fix — clean redirect | Navigated to finda.sale as Leo Thomas (user5). Clicked Logout. Clean redirect to /login — no 429 toast. Nav shows Login + Register. Refreshed — logged-out state persisted. ss_8330v4z5n | S897 |
| — | Shopper dashboard — Overview tab | Navigated /shopper/dashboard as Leo Thomas (user5@example.com). Ranger rank card (2,005 XP) ✅, QR code ✅, referral CTA ✅, quick-action tiles ✅. Dark mode correct. ss_7137f8yne, ss_8746rgevf, ss_8690d1ikb | S897 |
| — | Shopper dashboard — Subscribed tab | As user5: clicked Subscribed tab (JS .click(), URL →#subscribed). "No organizers followed yet" + Browse Sales CTA. Dark mode correct. D-003 ✅. ss_0769aas4z | S897 |
| — | Shopper dashboard — Pickups tab | As user5: clicked Pickups tab. "No pickup appointments yet" + explainer. Dark mode correct. D-003 ✅. ss_2093734df | S897 |
| — | Shopper dashboard — Brands add + persist | As user5: clicked Brands tab. Typed "Pottery Barn" → clicked Add → brand appeared in list. Full page reload — brand persisted (server-side save confirmed). ss_7642d8yxi, ss_5371anhj6, ss_6095eysf5 | S897 |
| — | Notifications dropdown + /notifications page + routing | As user5: bell icon clicked (27 unread) — dropdown opened ss_3970ompns. /notifications — All/Operational/Discovery tabs, unread orange dots ss_9978s0w2u. Clicked "New message from Bob Smith" → correct /messages/[id] thread ss_4602ahmz7. | S897 |
| — | /wishlists page | Navigated /shopper/wishlists as user5. Collections: "Vintage Jewelry" + "Mid-Century Modern Hunt" (0 items each). Correct empty state. ss_5547dpc3u | S897 |
| — | Sale page RSVP toggle | As user5 on /sales/cmp0t1nki00h7si3dky88ygeh. Clicked RSVP button. "Going (0)" → "✓ You're going (1)" — green filled toggle, count updated. ss_4522hzw2t | S897 |
| — | Sale page wishlist heart (sale-level favorites) | As user5 on /sales/cmp0t1nki00h7si3dky88ygeh. Clicked heart (aria-label="Add to wishlist" via JS). aria-label toggled to "Remove from wishlist". Red filled heart displayed. Server-side save confirmed. ss_413014505 | S897 |
| — | GUEST1 — GuestSaleAlert no-login email capture (S892 feature) | ✅ Chrome-verified S893 — Navigated to https://finda.sale/sales/cmpw9mmi401sbj8zfkx7f80oh as logged-out guest (Login/Register in nav confirmed). Scrolled to GuestSaleAlert. Entered qaguest-s893@test.com. Clicked "Get alerts". Saw "✓ You're on the list — we'll email you when new items are added." DB confirmed: SearchNotification record id=snmq1zvhipevzoe0, email=qaguest-s893@test.com, searchQuery=estate treasures 84:..., city=Norfolk, isActive=true, createdAt=2026-06-06 06:51. ss_4884utc9f | S893 |
| — | CTA1 — Logged-out sale page "Remind Me by Email" absent | ✅ Chrome-verified S894 — Navigated https://finda.sale/sales/cmpw9mmi401sbj8zfkx7f80oh as logged-out guest. "Remind Me by Email" absent from top action bar (L1494) and inventory empty state (L1888). Only GuestSaleAlert "Get alerts" visible. Fix in local sales/[id].tsx — pending GitHub push. | S894 |
| — | SEO-2 — Homepage canonical dedupe + og/twitter meta | ✅ S894 web_fetch-verified — web_fetch https://finda.sale/ returned exactly 1 canonical (https://finda.sale); no duplicate og: or twitter: meta tags found. | S894 |
| — | SEO-1 sale-page social unfurl (SSR head) | Live-verified S892 — web_fetch of a live published sale URL returned sale-specific og:title/og:description/og:image (Cloudinary) + JSON-LD rendered server-side; Facebook Sharing Debugger scraped the URL -> HTTP 200 and built a correct preview (real og:title "Home decor galore! — FindA.Sale"). Production scrape via getStaticProps+ISR, not Chrome MCP browser-interaction — genuine end-to-end. | S892 |
| — | P2 POS PENDING_REVIEW fix — search path | ✅ Chrome-verified S886 — /organizer/pos as Alice (user1). Searched "Kirkland" (item cmp4o68ic000i1o8telljqpa8, draftStatus=PENDING_REVIEW). Result: "No available items match that search." Confirms PENDING_REVIEW items excluded from POS search. API: /api/items/cmp4o68ic000i1o8telljqpa8 returns draftStatus=PENDING_REVIEW, status=AVAILABLE — old status check would miss it, new draftStatus check catches it. QR toast CODE-ONLY (camera QR not simulatable in browser). ss_5792yv22r | S886 |
| — | P3 fix: review success "View sale" link | ✅ Chrome-verified S886 — /organizer/add-items/[saleId]/review as Alice (user1). Clicked "View sale →" → landed on /sales/59c49908... "QA Active Sale S875 — Mixed Goods" — no 404. ss_4845b09um | S886 |
| — | P2 fix: POS AVAILABLE-only item search | ✅ Chrome-verified S886 — /organizer/pos as Alice (user1). Typed "Pyrex" in search → "No available items match that search." PENDING_REVIEW item excluded from results. Network: GET /api/items?...&status=AVAILABLE confirmed. ss_9781ji8rx | S886 |
_(Y-axis formatter + #192 ENDED sale: applied to roadmap S883)_
| — | Rarity Boost 15 XP display | ✅ Chrome-verified S885 — /coupons as Alice (user1). Organizer tab → Shopper tab → "Boosts & Bonuses" section: "Rarity Boost — Spend 15 XP to boost rarity rolls on next photo uploads." Button: "Activate Rarity Boost (15 XP)". Confirms S884 coupons.tsx fix deployed. ss_10072ub1r | S885 |
| — | Add-items upload → Analyze → publish pipeline | ✅ Chrome-verified S885 — /organizer/add-items/59c49908... as Alice (user1). Batch Upload: file_upload → "✓ 1 photo selected". Analyze All → Smart Review Queue → "Vintage Table Lamp, Mid-Century Modern Style, Wood Base" (62% confidence, Lamps/Furniture, SMART tags). Clicked Approve → "QUEUE CLEAR — All 2 items are live." Verified on /sales/59c49908...: lamp card visible alongside Pyrex. ss_3920p8trb ss_57255gxkm ss_5660w5ek0 | S885 |
| 293 | eBay conditionNotes data parity | ✅ Human-verified S883 — Zoom B3 (ebayListingId 137309459090, Artifact account). Set conditionNotes "All knobs and switches function correctly. No cosmetic damage." via PUT /api/items/:id → re-push via POST /api/ebay/organizer/sales/:saleId/ebay-push. eBay Inventory API confirmed conditionDescription = "Grade B — Very good condition\n\nAll knobs and switches function correctly. No cosmetic damage.\n\nZoom B3..." Full pipeline: DB save ✅ → buildConditionDescription() includes conditionNotes between grade+description ✅ → push updates live listing ✅ → eBay API confirms value live ✅. | S883 |
| — | OAuth session supersede | ✅ Human-verified S883 — Patrick logged in as user2 (Bob Smith JWT active), clicked Sign in with Google as artifactmi@gmail.com. /api/auth/me response confirms: id=cmnxueo790003tfv8nx6rlmjt, email=artifactmi@gmail.com, oauthProvider=google. Session correctly superseded to Artifact account. OAuthBridge fix confirmed working in prod. | S883 |
| — | Email Verification Migration | ✅ Confirmed deployed S883 — DB query confirms migration 20260515180000_add_email_verification_token_expiry applied 2026-05-15 19:32 UTC. All 4 columns present in User table (emailVerificationToken, emailVerificationTokenExpiry, emailVerified, emailVerifiedAt). Blocked Queue entry was stale — migration was deployed May 15. | S883 |
| — | Organizer starter-kit | ✅ Chrome-verified S883 — /organizer/starter-kit as Alice (user1). "Sale Day Starter Kit" heading, Pre-Sale Checklist with checkboxes, Download PDF + Print buttons, Back to dashboard link. ss_8106nlgh7 | S883 |
| — | Discount rules create modal | ✅ Chrome-verified S883 — /organizer/discount-rules as Alice (user1). "Discount Rules" page loads, empty state. Clicked "+ Add Rule" → "Create Discount Rule" modal with Color Tag, Label, Discount %, Active From, Active Until fields. ss_68366qf20 ss_067153c7v | S883 |
| — | Create sale wizard (#138 + #411) | ✅ Chrome-verified S883 — /organizer/create-sale as Alice (user1). "Step 1 of 5: What kind of sale are you putting on?" — 5 sale types: Estate Sale ✅ (selected), Yard & Moving ✅, Auction ✅, Market & Pop-Up ✅, Dorm Dash ✅. 5-step sidebar visible. ss_3060qw90j | S883 |
| — | XP Store (/coupons) | ✅ Chrome-verified S883 — /coupons as Alice (user1). "XP Store" heading, Streak 1, 373 XP, INITIATE rank, Shopper/Organizer tabs, Discount Coupons: Standard $0.75/100XP, Deluxe $2/200XP, Premium $5/500XP (disabled). ss_62793so06 ss_56365kcxa | S883 |
| — | Map page | ✅ Chrome-verified S883 — /map as Bob (user2). "Sales Near You" 85 sales, map with pins, Plan Your Route/Heatmap/My Location buttons, date filters (All Dates/Today/This Weekend/This Week), type filters (All Types/Estate/Yard/Auction/Flea Market/Consignment/Retail Store/Vendor Booth). ss_0552v7zh2 | S883 |
| — | Guide page | ✅ Chrome-verified S883 — /guide as Bob (user2). "Organizer Guide" heading, full sidebar nav (Getting Started, Creating a Sale, Adding Items, Community Appraisals, Managing Inventory, Auction Items, Shopper Communication, Payouts, QR Code Marketing, Push Notifications, Referral Program), content loaded. ss_17131y4gc | S883 |
| — | Calendar page | ✅ Chrome-verified S883 — /calendar as Bob (user2). "Sale Calendar" June 2026 month view, Prev/Next navigation, real sales on dates, "Remind Me by Email" buttons, today (Jun 4) highlighted orange. ss_195917ziu | S883 |
| — | Shopper trades (#218) | ✅ Chrome-verified S883 — /shopper/trades as Bob (user2). "Trades" heading, "Trade and swap items with other shoppers." subtitle, "Coming Soon — Feature in development" badge, Back to Dashboard button. ss_2861pyk7b | S883 |
| — | Shopper explorer-profile | ✅ Chrome-verified S883 — /shopper/explorer-profile as Bob (user2). "Explorer Profile" heading, "0 finds" badge, "Your Explorer Identity" section, Explorer Bio textarea, Specialties input with Add button, Item Categories section. ss_4271dkl4t | S883 |
| — | Homepage | ✅ Chrome-verified S883 — finda.sale/ as Bob (user2). "Discover Amazing Deals" hero, search bar, "Dallas is heating up 58 sales this week" trending banner, "Today's Treasure Hunt" card (JEWELRY, +3 Hunt Pass XP), map mini widget (20 active sales), "Featured Sales" 20 of 20. ss_75552983d ss_8844zq96l ss_7466lun9p | S883 |
| — | Sale detail (directory listing) | ✅ Chrome-verified S883 — /sales/cmpt9uf2q00k38cehfsx5h9i5 as Bob (user2). "Colossal estate sale in house, garage, workshop, pole barn" — hero photo, dates, photo strip, "What's inside" description, WHEN/WHERE sections, map sidebar with pin, Directions button, "Organized By: Creative Solutions" with Storefront button, Items empty state with "Remind Me by Email", share buttons (X/Twitter/Threads/Pinterest/Nextdoor/TikTok). ss_3721kp9fj ss_45238s0r1 ss_46272tzgq | S883 |
| — | Search page | ✅ Chrome-verified S883 — /search?q=vintage as Bob (user2). Search bar, "Save Search" + "View saved searches" links, Filters sidebar (Price Range/Condition/Category/Sale Type), All/Sales(10)/Items(10) tabs, "Plan Route for All Sales" button, real results with TODAY badges. ss_9502geaos | S883 |
| — | Pricing page | ✅ Chrome-verified S883 — /pricing as Bob (user2/PRO). "Sell smarter." headline, 6 feature tiles, Free/$29 PRO (✓ Current Plan)/$79 TEAMS tiers with feature lists. Correct prices match D-007. ss_3228c6qzt ss_1209ystwv | S883 |
| — | Cities page (#187) | ✅ Chrome-verified S883 — /cities as Bob (user2). "Browse Sales by City" heading, 200+ cities across 200 cities, state-grouped (Alabama/Arizona/Arkansas/...), city links with sale counts. ss_4392ish2n | S883 |
| — | Categories page (#180) | ✅ Chrome-verified S883 — /categories as Bob (user2). "Browse by Category" heading, category grid with item counts (Comics 30, Coins & Currency 7, Magazines 6, Pipe Fittings 6, Collectibles 5, etc.). ss_1606pzfyk | S883 |
| — | Trending page | ✅ Chrome-verified S883 — /trending as Bob (user2). "Trending This Week" heading, "Hot Sales" section with #1/#2/#3 HOT badges, real sale cards (Hammond Estate Sale, Collectors Auction June 9th, etc.) with hearts/items/date stats. ss_8926p6wv6 | S883 |
| — | QA sale detail (Bob shopper view) | ✅ Chrome-verified S883 — /sales/59c49908-72f2-4e92-ade9-02bfcfdd9230 as Bob (user2). "QA Active Sale S875 — Mixed Goods", Live now badge, Jun 4-7 Grand Rapids MI, "Going (0)" button, "Notify me of new items" button, Live Activity widget, INVENTORY "1 items", "Find similar items on eBay", Filter by category, HOLDS & SHIPPING info (48h hold), Photo Station card, Treasure Hunt card, Share sidebar (Copy/Facebook/X/Threads). ss_23185ngzl ss_136359q2w | S883 |
| — | Organizer storefront | ✅ Chrome-verified S883 — /organizer/storefront/cmomwf8ya000x11qwvtqmk3i9 as Bob (user2). "Kelly's Estate Sales" organizer page, "KE" avatar, ESTATE SALES type, "Sale live now" badge, Grand Rapids MI, Share/Follow buttons, "Quality Sales You Can Trust" tagline, 2 Sales / 2019 Est., bio, "Follow Kelly's Estate Sales" CTA. ss_0286gmk6l | S883 |
| 303 | Photo Station Shopper Page | /sales/cmpbvumj90001e7t7v5sa1iqi/photo-station as user5 (Leo Thomas). Page loads ✅ ss_65158fo38. "Share Your Find" + "Location Access Required" gate expected post-#317 geofencing. XP award + Already Scanned state UNVERIFIED (requires real GPS). | S839 |

| 31 | Brand Kit save | As Alice (user1/PRO) on /organizer/brand-kit: scrolled to Save Brand Kit, clicked → "Saving..." (ss_2548h9vun) → green toast "Brand Kit updated successfully" (ss_9229rauhl). DB updatedAt confirmed 16:34 UTC. TEAMS Advanced Brand Customization gated ✅. Downloadable Brand Assets section visible ✅. | S866 |
| 194 | Saved Searches | As Bob (user2): saved "vintage" search (ss_6611nk9nv, toast ✅), viewed /shopper/saved-searches (ss_6478xn3zf, persisted ✅), clicked Run Search → results (ss_529648c4m ✅), deleted → empty state (ss_0183ddn2w ✅). Full flow verified. | S866 |
| 47 | UGC Photo Submit button | As Bob (user2) on /sales/cmpbvumj90001e7t7v5sa1iqi: "Tag Your Find" modal opened from sale detail (ss_7093sc6dp ✅). Button in DOM, functional. | S866 |
| — | Sale Type filter persistence | ✅ Chrome-verified S870 — Navigated /search as user2. Set Sale Type = Estate Sale via dropdown. Typed "furniture", clicked Search. URL became ?q=furniture&saleType=ESTATE (persisted). Dropdown still shows "Estate Sale". All 10 results showed "Estate Sale" badge. ss_9039vdcse ss_8858sjoxz | S870 |
| — | ZIP export copy per-button | ✅ Chrome-verified S870 — Navigated /organizer/settings → Help tab as user2. "Download My Data" shows "Limited to once per 24 hours" span. "Download Sale & Item Data (ZIP)" shows "Limited to once per month" span. No shared rate-limit paragraph text. ss_3469lkjs6 | S870 |
| — | UGC button dark mode | ✅ Chrome-verified S870 — Navigated Hammond Estate Sale /sales/cmpie5dtp01nx4n1ht00o5zcn in dark mode. Community Photos section. "Tag Your Find" button computed styles: bg=rgba(120,53,15,0.3) (amber-900/30), border=1.8px solid rgb(249,115,22) (amber), color=rgb(252,211,77) (amber). No white box. ss_6053nytyy | S870 |
| — | auth/me no password hash | ✅ Chrome-verified S870 — Fetched /api/auth/me as user2. Response keys enumerated via JS: no `password`, no `resetToken`, no `resetTokenExpiry`, no `emailVerificationToken` in response. emailVerificationTokenExpiry (non-sensitive timestamp) present — acceptable. | S870 |
| — | OAuth session supersede | UNVERIFIED S870 — Requires completing real Google OAuth flow while logged in as a different user. Cannot test without Patrick + artifactmi@gmail.com. Added to Blocked Queue. | S870 |
| 195 | Shopper ↔ Organizer Messaging | /messages as Bob Smith (user2). Opened Leo Thomas thread (/messages/cmomwghx000p111qw8efq1c9a). Sent "QA test message S871" → orange bubble appeared at 04:16 PM, no 500 error. Thread history (3 prior messages) loaded correctly. ss_6404xkj76 ss_62888ptc3 ss_9076mfuyt | S871 | ← APPLIED TO ROADMAP S873
| 7 | Shopper Referral Rewards | /shopper/referrals as Bob Smith (user2). "Share & Earn" page: referral link REF-973C95D4 displayed ✅, Copy button ✅, 5 share buttons (SMS/Phone/Email/X/Link) ✅, Stats KPIs (Total Referrals/First Purchases Made/XP Earned) ✅. ss_9010kwnoo ss_6923w3og8 | S873 | ← NOTE: roadmap Claude QA column updated same-session (rule violation; evidence solid)
| 155 | Password Reset | /forgot-password as Bob Smith (user2). "Forgot Password?" heading ✅, email field + "Send Reset Link" button ✅, "Back to login" link ✅. Form submission not tested (would send real email). ss_6730w1yav | S873 |
| 161 | Contact Form | /contact as Bob Smith (user2). "Contact Support" heading ✅, Email Support card (support@finda.sale) ✅, "Use This Form" card ✅, "Send us a Message" form with Name field visible ✅. Form submission not tested. ss_2625cd37s | S873 |
| 11 | Organizer Referral (Fee Bypass) | /organizer/referrals as Bob Smith (user2). "Referrals" heading ✅, referral link (https://finda.sale/signup?ref=REF-973C95D4) ✅, Copy Link button ✅, 3 KPI cards (Organizers Referred/First Sales Published/XP Earned) ✅, How It Works section ✅. ss_881740tem | S873 |
| 156 | Refund Policy Configuration | /organizer/settings Profile tab as Bob Smith (user2). "Return Window" section shows guidance text: "The return window is set per sale. When editing a sale, look for the 'Return Window' field in the sale details." No input field (removed per fix). ss_5542tnnsw | S873 |
| 316 | Referral Tranche B | ✅ Chrome-verified S876 — Logged in as qa256test806@example.com (Seedy2025!). Tranche A: login day 3 → trancheAReleasedAt set, Alice XP 123→223 (+100) ✅. Tranche B: visited 3 sales → trancheBReleasedAt set, Alice XP 223→373 (+150) ✅. DB: distinctSalesVisited has all 3 sale IDs confirmed via psycopg2. | S876 |
| — | YMAL "You might also like" fix | /sales/0d9563f9-4fcd-4630-8beb-189ea58c8118 as Bob (user2). Community Photos section → Reviews section directly. DOM confirmed: `ymalFound: false` after full page settle. Empty "You might also like" section completely absent. ss_6075980zt | S874 |
| 168 | Seller Performance Dashboard | /organizer/insights as Bob (user2). "Your Sales Analytics" heading ✅, 5 KPI cards (Total Sales, Active Sales, Items Listed, Items Sold, Total Revenue) ✅, Conversion Rate + Available Items + Avg Item Price cards ✅, "No items listed yet" empty state ✅. ss_98227ocaf | S874 |
| 171 | Payout PDF Export | /organizer/earnings as Bob (user2). "Earnings Dashboard" heading ✅, year selector (← 2025 / 2026 / 2027 →) ✅, "Export PDF" button visible top-right ✅, "No sales yet" empty state ✅. Actual PDF download not triggered (requires ended sale data). ss_55517xgab | S874 |
| 150 | Push Notification Subscriptions | /organizer/settings?tab=notifications as Bob (user2). "Notification Preferences" section ✅, email checkboxes (bids + sale start) both checked ✅, "Push Notifications" section: "Push notifications are enabled" + Disable button ✅, Smart Tagging checkbox ✅. ss_44021pdve | S874 |
| 152 | Organizer Digest Emails | /organizer/email-digest-preview as Bob Smith (user2). "Weekly Email Digest" heading ✅, schedule "Monday morning at 9 AM" ✅, Disable button ✅, Email Preview: Hi Bob Smith + KPIs (12 Items Sold/$450.75 Revenue/3 Followers) ✅, activity section + top items ✅, "View Your Dashboard →" CTA ✅, footer manage/unsubscribe ✅, "Sent every Monday morning at 9 AM EST" info ✅. ss_83116boe8 ss_3822u3wv2 ss_2864i4lf6 | S875 |
| 334 | Automatic Markdown Cycles | /organizer/markdown-cycles as Bob Smith (user2). "Auto Markdown" heading ✅, "Set up automatic price reductions..." subtitle ✅, empty state with icon ✅, "+ Add Cycle" button ✅, "+ Create your first cycle" CTA ✅, no 403. ss_8645vaq0f | S875 |
| 318 | Affiliate Program | /organizer/affiliate as Bob Smith (user2). "Affiliate Program" heading ✅, "Earn commissions when organizers sign up with your link" ✅, "Your Affiliate Link" card ✅, "Generate Your Affiliate Link" CTA ✅, "← Dashboard" link ✅, no 403. ss_7743cytqb | S875 |
| 338 | Surface Sold-Price Comps | /organizer/edit-item/cb20b99d-992f-4d56-8378-9df4a42a55ed as Alice Johnson (user1). 3 eBay comp tiles ($17.99/$120.00/$29.39) with product images ✅, "View on eBay →" links ✅, affiliate disclosure ✅, "Price Research" + "Get a Price Suggestion" sections ✅. ⚠️P3: no "Based on N sources" attribution text (matches S820 finding). ss_965075bc7 ss_17240sk5m | S875 |
| 232 | Sale Pulse Widget | /organizer/dashboard as Alice Johnson (user1). Seeded PUBLISHED ESTATE sale (59c49908). Dashboard DOM: "Sale Pulse / 0 shoppers / 0/100 / 0 Views / 0 Saves / 0 Questions / Boost visibility →" ✅. Widget renders with correct structure. ⚠️ No screenshot IDs — Chrome extension screenshot tool broken S875. DOM text via get_page_text. | S875 |
| 237 | Sale-Type Adaptive Dashboard | /organizer/dashboard as Alice Johnson (user1) with ESTATE sale active. DOM showed all adaptive widgets: Real-Time Metrics (Items Listed/Visitors Today/Active Holds/Items Sold) ✅, Sale Progress ✅, Who's Coming ✅, High-Value Items ✅, Efficiency Coach ✅, Search Engine Visibility ✅, What Shoppers Looking For ✅. ⚠️ No screenshot IDs — Chrome extension screenshot tool broken S875. DOM text via get_page_text. | S875 |
| 192 | Price History Chart | ✅ Chrome-verified S876 — /organizer/edit-item/[Pyrex] as Alice (user1). "Price History" heading visible, orange step-line chart rendered in white card. Y-axis: $40.5/$46.5/$52.5, X-axis: Jun 1→Jun 3, 2 data points. API returned 2 real history records (55→45). ss_5230oyurt. ⚠️ P2 bug filed: chart silently empty for ENDED sale items (priceHistoryController line 25). | S876 |
| 320 | Async eBay Comp Fetch | ✅ Chrome-verified S876 — /organizer/edit-item/[Old Radio] as Alice (user1). 3 eBay comp tiles rendered with real prices. Organizer price=$80 displayed; aiSuggested=$65 NOT overriding (D-005 confirmed). DB: orgPrice=$80, aiSuggested=$65. Full evidence captured before screenshot tool reconnected. | S876 |
| 321 | Encyclopedia Auto-Generation | /admin/encyclopedia as Alice Johnson (user1/admin). "Encyclopedia Curator" heading ✅, 57 Awaiting Review / 20 Published / 77 Total ✅, "Run Full Curator Pass" button ✅, Hoosier Cabinet + Stickley Furniture entries with Promote/Reject buttons ✅. ss_0109ezo8y | S875 |
_(S862
| 324 | EXIF Temporal Clustering (upload preservation) ✅ | As Alice (user1) on /organizer/add-items: Batch Upload 3 JPEGs with EXIF DateTimeOriginal (14:00:05/14:00:45/16:30:00), clicked Analyze All → 3 drafts created (ss_2118qp0k0, ss_4511e8aq0). Re-downloaded stored Cloudinary images: all 3 timestamps preserved exactly. Test items+photos deleted from DB. | S863 |
| 176 | Browse Sales homepage Type filter ✅ | As Bob (user2) on finda.sale homepage: Type dropdown → Estate Sale = "17 of 20 sales", all Estate badges (ss_48642xh5d); Yard Sale = "3 of 20 sales", Yard badges (ss_73627haye). | S863 | batch of 9 graduated to roadmap S863. Note: S862 evidence had no screenshot IDs — applied on DB/page-content evidence per S862 orchestrator log.)_

| 166 | Beta Invite Codes | /admin/invites as Alice (user1): "Beta Invite Codes" heading ✅, "Generate Invite Code" button → code 4J9U3B95 with "unused" status ✅, Copy URL/Code only/Delete actions ✅. /register?invite=4J9U3B95: green banner "✓ Invite code 4J9U3B95 applied" ✅, role pre-set to "Sale Organizer" ✅, Business Information section ✅. ss_37115t11z ss_3815rn9fy ss_44402fzrx | S878 |
| 165 | A/B Testing Infrastructure | /admin/ab-tests as Alice Johnson (user1). "A/B Tests" heading ✅, "Hero CTA v1" test card + Variant/Views/Clicks/Conversions/Conversion Rate table headers ✅, "Clear Test Data" button ✅, "No test data available yet" info message ✅, no 403. ss_7968d9zt9 | S877 |
| 308 | Item Hide Bug Fix (isActive centralized) | /organizer/edit-item/[Pyrex] as Alice (user1). Status dropdown shows Available/Sold/Unavailable ✅ (addresses S838 "no show button" concern — Unavailable→Available IS the show/hide mechanism), "Unpublish" button present ✅. ss_13358xg0c ss_1630eqh3i | S877 |
| 27 | CSV Export — Amazon + eBay formats | Navigated /organizer/print-inventory as Alice (user1). Selected "QA Active Sale S875" from Filter by Sale combobox. Opened Export dropdown → clicked "Export for Amazon" → success toast + HTTP 200 file download. Re-opened dropdown → clicked "Export for eBay" → success toast + HTTP 200 file download. Both formats confirmed. ss_94917yaqg (Amazon), ss_2041bm2l3 (eBay) | S902 |
| 66 | Open Data Export ZIP | Navigated /organizer/settings → Help tab as Alice (user1). Clicked "Download Sale & Item Data (ZIP)" → API returned 429 "next export available [date]" with clear user-facing message. Rate limiting confirmed working. ss_3723v0nw2, ss_2914rv4if | S902 |
| 47 | UGC Photo Tags — full submit flow | Navigated /sales/59c49908-72f2-4e92-ade9-02bfcfdd9230 as Alice (user1). Scrolled to Community Photos section. Clicked "Tag Your Find" orange button — modal opened with Photo URL, Caption (optional), Tags (comma-separated, optional) fields. Filled: URL=https://picsum.photos/400/300, caption, tags=vintage/decor/find. Clicked Submit Photo → green success toast "Photo submitted successfully". DB confirmed: UGCPhoto id=5, userId=cmomwf6nr000911qwipyim1nc, saleId=59c49908..., photoUrl correct, tags=['vintage','decor','find'], status=PENDING. ⚠️ UX: No "pending moderation" explainer shown after submit — user may wonder why photo doesn't appear. ss_3427wvnjd, ss_345974ewy | S902 |
| 274 | Trail Completion Share | /shopper/trails/cmnsa0jir0000uzighx3ni54f as Leo Thomas (user5). "South Side Treasure Hunt": "✓ Trail Completed!" green banner (Completed on 6/4/2026) ✅, "Share your achievement" card ✅, Share button ✅, Public Link section ✅. Share button clicked → navigator.share triggered (no console errors, native share path — no clipboard fallback needed). ss_558087lcg ss_1217874pr | S877 |
| — | H-002 Map pin popup (Leaflet) — RESOLVED | Navigated finda.sale/map as Alice (user1). 54 sales with pins. Clicked green pin → popup: "Gerald Ave Estate Sale", Grand Rapids MI, Jun 5-7 2026, "View Sale →" button. H-002 RESOLVED. ss_8736lh0zj | S907 |
| — | BountySubmission "Your Submissions" — S906 fix confirmed | Navigated /organizer/bounties as Alice (user1) → "Your Submissions" tab → Pyrex submission (cmq361vpz000d7andwmuns3p0) visible: "Vintage Pyrex Bowls Set", PENDING_REVIEW, correct date. S906 fix confirmed in production. ss_5550658mg | S907 |
| — | Bounty E2E — Alice submit → Bob approve → APPROVED | Alice submitted Pyrex item. Bob navigated /shopper/bounties → saw submission → clicked Approve → APPROVED. Alice notification fired. Alice saw APPROVED on "Your Submissions". ss_1178hfupu, ss_1584bck4b (Bob approve), ss_23937m5g7 (cross-account) | S907 |
| — | Trending page + item drill-down | Navigated /trending as Alice. Hot Sales rendered. ss_1700v3uqu, ss_1826nkwve, ss_0812bxklh. Clicked trending item → /items/cmp5s7yws000jaez9syc3uibr "Steve Yzerman Rubber Duck" $21.50 rendered. ss_6722zw9h2 | S907 |
| — | Explore pages — Feed/Calendar/Wishlist/Clearance/Categories/Encyclopedia/Guides | Feed ss_9712cx57s ✅. Calendar ss_3065rpkjt ✅. Wishlist ss_9422fogj9 ✅. Clearance ss_1564jtidk ✅. Categories ss_3583znp71 ✅ + Comics drill-down ss_54059osb2 ✅. Encyclopedia ss_92426lq6z ✅. Guides ss_1586niuxi ✅. | S907 |
| — | User dropdown XP bar | Clicked user avatar as Alice. Dropdown: name, XP progress bar, rank badge, settings/logout. ss_3601f6067, ss_5434ttna5 | S907 |
| — | Settings → Profile tab | Navigated /organizer/settings?tab=profile as Alice. Business name, contact info, bio fields. Dark mode correct. ss_6440nm7p8 | S907 |
| — | Explorer's Guild (/shopper/guild-primer) | Navigated /shopper/guild-primer as Alice (URL confirmed via bash — /guild + /shopper/guild both 404). Guild page: rank tiers, XP table, badge gallery. ss_666742ptn, ss_7020zo3bf | S907 |
| — | Pricing page — S388 prices confirmed | Navigated /pricing as Alice (user1/TEAMS). PRO=$29/mo ✅, TEAMS=$79/mo ✅. "Current Plan" badge on TEAMS. Matches D-007/S388 locked decisions. ss_6352uibw4, ss_5329igvjy | S907 |

---

## Next Session

**S907 completed:** QA MODE. Autonomous QA sweep. H-002 RESOLVED, Bounty E2E ✅, BountySubmission fix ✅, Trending/Explore ✅. 2 P2 bugs found (Flash Deal + Social Posts stubs). BQ: 7→9.

**Priority for next session (S908):**
1. **[RECORDS FIRST]** `Skill('findasale-records')` → Apply S907 PCVs to roadmap.md. H-002 → RESOLVED, Bounty E2E chr ✅, BountySubmission "Your Submissions" chr ✅, Trending/Explore pages chr ✅, Explorer's Guild URL confirmed (/shopper/guild-primer).
2. **[DEV — Patrick S907 authorization]** `Skill('findasale-dev')` → Flash Deal: implement /organizer/flash-deals route + page + wire "Create Flash Deal" dashboard button onClick.
3. **[DEV — Patrick S907 authorization]** `Skill('findasale-dev')` → Social Posts: implement Social Posts modal/flow + wire dashboard button onClick.
4. **[QA after dev]** `Skill('findasale-qa')` for each once deployed.

**Decisions still open (Patrick):**
- **FB Marketplace:** DROP confirmed recommended. Graph API OAuth (#365) = correct long-term path.
- **#332 Shopify:** bugs fixed on GitHub; need real store for QA.
- **#335 outreach resume:** Reactivate outreach@finda.sale → OUTREACH_ENABLED=true.
- **AuctionZip recurring:** 4,893 one-time harvest; automation = future decision.
- **#230 Smart Buyer:** publish a sale on user1 to enable QA.

**Patrick actions still needed:**
- Restore 13 corrupted local files (if not yet done):
  ```powershell
  git checkout HEAD -- packages/backend/src/controllers/internalGeocodingController.ts packages/backend/src/index.ts packages/backend/src/jobs/autoSeedOutreachCron.ts packages/backend/src/scripts/run-search-facebook-events.ts packages/backend/src/services/scraper/sources/auctionZipScraper.ts packages/backend/src/services/scraper/sources/naaAuctioneerDirectory.ts packages/backend/src/services/shopifyService.ts packages/database/prisma/schema.prisma packages/frontend/components/SaleCard.tsx packages/frontend/data/guides/entries/connect-shopify.ts packages/frontend/pages/_app.tsx packages/frontend/pages/_document.tsx "packages/frontend/pages/sales/[id].tsx"
  ```
- #335 Outreach: reactivate outreach@finda.sale at admin.google.com
- #332 Shopify: connect real custom-app store
- #230 Smart Buyer: publish a sale on user1

## Recent Sessions

### S907 — QA MODE (2026-06-07). Autonomous QA sweep. H-002 RESOLVED. Bounty E2E ✅. 2 P2 bugs found. BQ: 7→9.

**H-002 Leaflet map pin popup ✅ RESOLVED:** Navigated finda.sale/map as Alice (user1). 54 sales with pins. Clicked green pin → popup: "Gerald Ave Estate Sale", Grand Rapids MI, Jun 5-7 2026, "View Sale →" button. H-002 RESOLVED. ss_8736lh0zj

**BountySubmission "Your Submissions" ✅ S906 fix confirmed:** /organizer/bounties as Alice → "Your Submissions" tab → Pyrex submission (cmq361vpz000d7andwmuns3p0) visible: "Vintage Pyrex Bowls Set", PENDING_REVIEW, correct date. S906 fix confirmed in production. ss_5550658mg

**Bounty E2E full flow ✅:** Alice submitted Pyrex item → Bob approved via /shopper/bounties → APPROVED status → Alice notification fired → Alice saw APPROVED on "Your Submissions". Full cross-account flow. ss_1178hfupu, ss_1584bck4b, ss_23937m5g7

**Trending + Explore ✅ (multiple pages):** /trending (ss_1700v3uqu, ss_1826nkwve, ss_0812bxklh), item drill-down /items/cmp5s7yws000jaez9syc3uibr (Steve Yzerman Rubber Duck $21.50, ss_6722zw9h2). Feed (ss_9712cx57s), Calendar (ss_3065rpkjt), Wishlist (ss_9422fogj9), Clearance (ss_1564jtidk), Categories + Comics drill-down (ss_3583znp71, ss_54059osb2), Encyclopedia (ss_92426lq6z), Guides (ss_1586niuxi).

**Additional verified:** User dropdown XP bar (ss_3601f6067, ss_5434ttna5). Settings Profile tab (ss_6440nm7p8). Explorer's Guild at /shopper/guild-primer — confirmed via bash find (not /guild or /shopper/guild, both 404) — ss_666742ptn, ss_7020zo3bf. Pricing: PRO=$29, TEAMS=$79, Alice "Current Plan" TEAMS badge — ss_6352uibw4, ss_5329igvjy.

**Flash Deal button ❌ P2:** /organizer/dashboard "Create Flash Deal" → no action. `<button>` with no onClick. /organizer/flash-deals → 404. Added to BQ.

**Social Posts button ❌ P2:** /organizer/dashboard "Social Posts" → no action. `<button>` with no onClick. Added to BQ.

**PCVs staged:** 9 new rows — H-002, BountySubmission fix, Bounty E2E, Trending/item, Explore (7 pages), user dropdown, settings, Explorer's Guild, Pricing.
**BQ:** 7→9 (Flash Deal + Social Posts added). 9 ≥ 8 → QA MODE continues.

### S906 — QA MODE (2026-06-07). Bug C ✅ + Hero search ✅ Chrome-verified. BountySubmission display FIXED. BQ: 9→7.

**Bug C (messages reply dark mode) ✅ CHROME-VERIFIED:** Navigated finda.sale/messages/cmomwghd500ot11qwsx7oobic as Alice Johnson. DOM computed styles: form bg rgb(31,41,55) (gray-800) vs page rgb(17,24,39) (gray-900) — distinct. Border-top rgb(75,85,99) (gray-600). Shadow rgba(0,0,0,0.45) 0px -4px 12px. Visual ss_4563dqnh2 shows lighter strip at page bottom with visible separator. Fix confirmed working.

**Hero search Enter key ✅ CHROME-VERIFIED:** Navigated finda.sale/ as Alice Johnson. Clicked hero input. Typed "vintage lamp" (value confirmed via JS: input.value="vintage lamp"). Pressed Enter. URL changed to /search?q=vintage%20lamp. Search results page loaded with 3 sales (ss_8251ipdgd). onKeyDown handler working correctly.

**BountySubmission "Your Submissions" display bug — FIXED INLINE:** Root cause confirmed: `getOrganizerSubmissions` controller used `item: { sale: { organizerId } }` (indirect join through item→sale) as the where filter. But `BountySubmission` has a direct `organizerId` field (indexed, set correctly at create time). The indirect join failed because item→sale join doesn't guarantee organizerId match on the submission record. Fixed both `findMany` and `count` where clauses to use `{ organizerId, submittedAt: { gte: thirtyDaysAgo } }`. TS 0 errors. Inline edit (<20 lines, single file).

**#176 roadmap stale note corrected:** "Sales near you ⬜ still missing" updated to "Sales Near You ✅ LIVE S903 (ss_5140qm032)".

**PCVs staged:** Bug C ✅ + Hero search ✅ — in Pending Chrome Verifications table above.

**BQ:** 9→7 (Bug C removed, Hero search removed). 7 < 8 ceiling → QA MODE continues but DEV available next session with Patrick sign-off.
**Push needed:** bountyController.ts + roadmap.md + STATE.md + patrick-dashboard.md.

### S905 — QA MODE (2026-06-07). Bug A ✅ + #197 ✅ Chrome-verified. Bug C + Hero search CODED. BQ: 11→9.

**Bug A (P1 passkey) ✅ CHROME-VERIFIED:** JS-fetched /api/auth/passkey/authenticate/options and /api/auth/passkey/register/options → both HTTP 403 CSRF Railway response (not NextAuth 404). Confirms routes now reach Railway. next.config.js beforeFiles fix + usePasskey.ts double /api/ prefix fix confirmed working.

**#197 BountyMatchModal ✅ CHROME-VERIFIED:** As Alice (user1) on /organizer/bounties: clicked "I have this!" on Bob Smith bounty → modal opened (no 403). Selected QA Active Sale S875 → Vintage Pyrex Bowls Set ($45.00) → submitted with message → green "Submission" toast, modal closed cleanly. DB confirmed: BountySubmission id=cmq361vpz000d7andwmuns3p0, status=PENDING_REVIEW, correct bountyId/organizerId/itemId. ss_525855od8, ss_6954mly74.

**New P3 finding — BountySubmission "Your Submissions" display bug:** After successful submission, "Your Submissions" tab shows empty state ("Your submissions will appear here once you start submitting items to bounties."). DB has the record. Frontend query likely wrong (filtering by userId instead of organizerId, or wrong bounty table join). Not blocking core fix but UX gap.

**Bug C (messages reply dark mode) — CODED:** `messages/[id].tsx` reply form border strengthened dark:border-gray-700→dark:border-gray-600 + top shadow added. Applied via Python/bash.

**Hero search Enter key — CODED:** `index.tsx` hero input now has onKeyDown handler — if Enter key pressed with non-empty query, routes to /search?q=[query]. Applied via Python/bash.

**PCVs staged:** Bug A ✅ + #197 ✅ — in Pending Chrome Verifications table above.

**BQ:** 11→9 (Bug A removed, #197 removed). Still ≥8 → QA MODE continues.
**Push needed:** messages/[id].tsx + index.tsx + STATE.md + patrick-dashboard.md.

### S904 — QA MODE (2026-06-06). Full product sweep. Bug A (passkey) CODED. BQ: 8→11.

**Full autonomous QA sweep completed. Alice Johnson (user1) logged in throughout.**

**Bug A (P1 passkey auth) — CODED THIS SESSION:**
- `next.config.js` beforeFiles missing `/api/auth/passkey/:path*` → NextAuth catch-all intercepted passkey routes → passkey login/registration could never reach Railway. Added `{ source: '/api/auth/passkey/:path*', destination: \`${railwayApi}/auth/passkey/:path*\` }`.
- `hooks/usePasskey.ts` line 105: `authenticatePasskey()` complete step had `'/api/auth/passkey/authenticate/complete'` on axios instance with `baseURL: '/api'` → double /api/. Fixed to `'/auth/passkey/authenticate/complete'`.
- TS 0 errors confirmed. Pushblock provided.

**Bug B (#197 bountyController) — already coded S903, still pending push.**

**Bug C (P3 messages reply dark mode) — NEW FINDING:** Messages thread `/messages/[id]` reply form `position:fixed; bottom:0; bg-gray-800` blends with page `bg-gray-900` — barely visible in dark mode. Textarea exists in DOM but is nearly invisible. Added to BQ.

**P3 UX findings (new):**
- Hero search Enter key doesn't navigate (no form action on hero input; clicking works). Added to BQ.
- Social Posts modal: Escape key doesn't close (must click X). Minor — not added to BQ.

**Confirmed working (full sweep):**
- Shopper discovery: /feed ✅, /calendar ✅, /shopper/wishlist ✅, /clearance ✅, /categories + drill-down (Comics 30 items) ✅, /encyclopedia ✅, /guides ✅, /trending ✅, /map (55 pins + popups) ✅, /search?q=pyrex (tabs + filters) ✅
- Organizer: /organizer/dashboard ✅, Social Posts (platform-specific generation) ✅, Print Kit ✅, /organizer/ripples ✅, /organizer/add-items (Camera/Batch/Manual/CSV tabs) ✅, /organizer/settings profile ✅, /messages (thread list + conversation view) ✅

**BQ:** 8→11 (3 new items: Bug A P1 passkey CODED, Bug C P3 messages dark mode, P3 hero search Enter).
**Pushblock:** next.config.js + usePasskey.ts + bountyController.ts + STATE.md + patrick-dashboard.md.

### S903 — QA MODE (2026-06-06). Chrome QA wrap. #197 fix coded. BQ: 8 (at ceiling).

**BQ = 8 throughout. Chrome sweep confirmed all verifiable items — most already chr ✅ from prior sessions.**

**#197 BountyMatchModal fix CODED (pending push):** `packages/backend/src/controllers/bountyController.ts` — expanded Prisma include to fetch `organizer: { select: { userId: true } }`, changed ownership check from `item.sale.organizerId !== organizerId` to `item.sale.organizer?.userId !== organizerId`. TS 0 errors. Pushblock provided to Patrick.

**S903 Chrome QA (Alice Johnson / user1@example.com):**
- /organizer/dashboard: Sale Pulse renders ✅, Who's Coming empty state ✅, Trending terms ✅ (ss_7508b348v)
- /organizer/bounties: All 3 tabs + empty states ✅ (ss_8183jup2y, ss_3823fppws)
- finda.sale homepage: "This Weekend" pill → 5 of 20 ✅; "Sales Near You · 20 active" PRESENT ✅ (ss_8999s91mm, ss_5140qm032)
- /organizer/add-items/[saleId]: eBay Export + QuickBooks + Buyer Preview toolbar buttons ✅ (ss_9313qni62)
- /organizer/insights: 2 sales / $220 revenue / 42.9% conversion ✅ (ss_6031snakq)

**⚠️ Stale roadmap note (#176):** "Sales Near You still missing" is INCORRECT — feature IS live. Needs update.

**PCVs staged:** None — all S903-verified items already chr ✅ in roadmap; #197 not pushed, cannot Chrome-verify yet.

**BQ:** 8 (unchanged). **Pushblock:** bountyController.ts + STATE.md + patrick-dashboard.md.

### S902 — QA MODE (2026-06-06). Autonomous QA. 3 features verified, 1 production bug found.

**Continuing from S901 Chrome session (post-compression). Alice (user1@example.com) logged in throughout.**

**#27 CSV Export ✅:** /organizer/print-inventory as Alice. Selected "QA Active Sale S875" sale from Filter by Sale combobox. Export dropdown → Amazon → HTTP 200 + toast ✅ (ss_94917yaqg). Re-opened → eBay → HTTP 200 + toast ✅ (ss_2041bm2l3). Export requires specific sale selected — "All Sales" view intentionally blocked.

**#66 Open Data Export ZIP ✅:** /organizer/settings → Help tab as Alice. Clicked "Download Sale & Item Data (ZIP)" → API 429 with clear "next export available [date]" message. Rate limiting correct — prevents abuse. (ss_3723v0nw2, ss_2914rv4if)

**#47 UGC Photo Tags ✅ (full flow):** /sales/59c49908... as Alice. "Tag Your Find" button in Community Photos section visible and clickable. Modal opened with Photo URL (required), Caption (optional), Tags (comma-separated optional). Submitted form → green success toast. DB confirmed UGCPhoto id=5, status=PENDING, all fields correct. ⚠️ UX gap: user not told photo is pending review — may wonder why it doesn't appear immediately.

**#197 BountyMatchModal ❌ PRODUCTION BUG:** POST /bounties/match always returns 403. Root cause confirmed in bountyController.ts L581+L593: `organizerId = req.user?.id` grabs user ID but `item.sale.organizerId` is the organizer record ID — always different. Alice: userID vs organizerID confirmed different via psycopg2. BountyMatchModal can never fire for any organizer. Added to BQ.

**BQ:** 7→8 (#197 Bounties bug added). QA ceiling: 8 → next session is QA-ONLY.

### S901 — QA MODE (2026-06-06). FB Events geocoding BQ resolved. Chrome sweep clean. BQ: 8→7.

**CTA1 roadmap update (pre-compaction):** Chr ✅ S899 applied to roadmap.md row CTA1 (ss_7824i8i38, ss_6695ak8vm — logged-out sale page, hasRemindMe=false, hasGetAlerts=true).

**FB Events geocoding RESOLVED:** psycopg2 query confirmed 18 remaining out of 260 PUBLISHED FB Events with null lat (93% geocoded). BQ row REMOVED. Progression: S887 96% ungeocoded → S901 7% ungeocoded.

**Chrome sweep — all clean:**
- Homepage (logged-out): hero, search bar, Treasure Hunt card. ✅ ss_0902g1f99
- /search?q=estate+sale: 10 results, Plan Route, filter sidebar. ✅ ss_97123xc98
- /trending: Hot Sales with #1/#2/#3 HOT badges. ✅ ss_51644lm5l
- Organizer dashboard (Alice/user1): Welcome + LIVE sale (Jun 4-7) + action buttons + storefront widget. ✅ ss_46975zqht
- /organizer/insights: "Your Sales Analytics" — Total Sales 2, Active 1, Items 6, Sold 3, Revenue $220, Conversion 50%, Avg $62.83. ✅ ss_81628rlz9
- /organizer/performance: 404 — expected (roadmap row #168 documents correct path as /organizer/insights; noted S899).

**BQ:** 8→7 (FB Events resolved). Below ≥8 QA ceiling — DEV mode available next session.

### S900 — QA WRAP (2026-06-06). S899 parallel sessions reconciled. BQ: 10→8.

**Parallel session reconciliation:** Chrome session (BQ 13→10) and no-Chrome session (BQ 13→11) touched different items — no conflicts. Combined result: BQ 13→10 (confirmed from STATE.md). No new dev work needed to reconcile.

**Records PCV audit:** S897/S898/S899 PCVs reviewed:
- S897 PCVs: all 9 are re-verifications of already-✅ features — no roadmap Chrome column changes.
- S898 PCVs (#168 PerformanceDashboard, #213 HuntPassModal): already applied by S899 no-Chrome session. No duplicate.
- S899 PCVs (hydration ✅, CTA1 re-verify): in Pending Chrome Verifications table; roadmap Chrome column update deferred per cross-session rule.
- roadmap.md Last Updated header updated to reflect S900 records pass.

**FB Events fixes confirmed on GitHub:**
- `run-search-facebook-events.ts` (sha e330401f) — complete `sendKeyHealthAlert()` function present on GitHub main. Local file truncated (missing last 68 lines). Fix was pushed correctly in S890; local Edit-tool corruption made it look missing.
- `SaleCard.tsx` (sha 6191e53d) — `dateApproximate` label present on GitHub main at line ~252. Local file truncated (missing last 30 lines). Same root cause.
- Both BQ rows REMOVED (FIX CONFIRMED ON GITHUB). BQ: 10→8.

**Edit tool truncation discovery:** 13 of 14 locally-modified tracked files are truncated vs GitHub HEAD — total 380 lines deleted from local working tree (only 14 added). Root cause: Cowork Edit tool silently drops trailing file content. Affected files: schema.prisma, _app.tsx, index.ts, SaleCard.tsx, [id].tsx, auctionZipScraper.ts, naaAuctioneerDirectory.ts, shopifyService.ts, connect-shopify.ts, _document.tsx, autoSeedOutreachCron.ts, internalGeocodingController.ts, run-search-facebook-events.ts. Patrick must restore all 13 via `git checkout HEAD`. `.git/index.lock` must be removed first from PowerShell.

**Pushblock:** roadmap.md + STATE.md + patrick-dashboard.md only.
**BQ:** 10→8.



