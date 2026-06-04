# PROJECT STATE

Sections: §Current Status | §Pool Audit Findings | §Blocked Queue | §Recent Sessions | §Next Session

FindA.Sale is a two-sided marketplace PWA for secondary sale organizers (estate sales, yard sales, auctions, flea markets, consignment) connecting them with shoppers. Backend: Node.js/Prisma/PostgreSQL on Railway. Frontend: Next.js on Vercel.

---

## Current Status

**Latest: S868 — BUG+INFRA: Schema FK audit complete (4 migrations deployed ✅), Foursquare scraper fixed ✅, AuctionNinja partially fixed (selector/URL updated) but GitHub Actions remains Cloudflare-blocked → STILL BROKEN. Blocked Queue +1 (AuctionNinja).**
- **S868 highlights:** Foursquare GitHub Actions secrets were stale → updated → workflow ✅ SUCCESS. AuctionNinja function name fixed + new URL + updated selector, but scraper returns 0 results due to Cloudflare IP block on Actions runners. Full schema FK audit: 4 migrations deployed to Railway prod covering duplicate-index no-op, Favorite cascade delete, 53 FK constraint rules + 32 new indexes, nullable author/sender fields. Sentry DirectoryClaimEmail indexes confirmed already present (migration is safe no-op).
- **#335 RESOLVED S865 (carried note):** S865b push (digest filter + volume fuses + ebayController tail) still pending from Patrick.
- **S867 QA findings (carried):** 3 P2 bugs confirmed (Sale Type filter reset, ZIP copy mismatch, UGC button dark mode), 1 UNVERIFIED (YMAL gap — data-dependent). See Blocked Queue for details.

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
_⚠️ P0 AGING: #332 at 71+ sessions — mandatory P0 per CLAUDE.md §10a. (#335 closed S865.)_
_⚠️ FRICTION AUDIT 2026-06-04: 3 P0s added — truncated working-copy files (still unresolved — confirm git checkout before any push)._
_⚠️ S868: AuctionNinja Cloudflare block added; full schema FK migrations deployed._

| Feature | Reason | What's Needed | Session Added |
|---------|--------|---------------|---------------|
| **TRUNCATED: search.tsx** | **P0** — Working copy is 514 lines vs 564 HEAD. Missing `export default SearchPage` and last 50 lines (EmptyState body, Notify Me Waitlist, closing JSX). Vercel build will fail if pushed. | `git checkout HEAD -- packages/frontend/pages/search.tsx` before next push | Audit 2026-06-04 |
| **TRUNCATED: routes/search.ts** | **P0** — File ends mid-comment `// #455: Anonymous search-qu`, missing notify route registration and `export default router`. Railway build will fail if pushed. | `git checkout HEAD -- packages/backend/src/routes/search.ts` before next push | Audit 2026-06-04 |
| **TRUNCATED: messageController.ts** | **P0** — File ends mid-expression `res.status(500).json`, missing closing for catch block and function. Railway build will fail if pushed. | `git checkout HEAD -- packages/backend/src/controllers/messageController.ts` before next push | Audit 2026-06-04 |
| #332 Shopify Cross-Listing | **P0 (70 sessions)** — Requires Shopify OAuth; no test store available | Create free Shopify Partners dev store, connect via OAuth | S791 |
| OAuth login doesn't supersede existing JWT session | **P1 NEW S865e** — With an existing JWT cookie for account A, clicking "Sign in with Google" as account B completes OAuth but /api/auth/me still returns account A. Only explicit POST /api/auth/logout then OAuth produces B's session. Reproduced twice (user1 cookie persisted through artifactmi OAuth). Confusing + potential cross-account action risk. | findasale-dev: OAuth callback must clear/replace the prior JWT + refresh cookies. | S865 |
| /api/auth/me returns bcrypt password hash | **P1 NEW S865e (security)** — GET /api/auth/me response includes user.password (bcrypt hash) in JSON. Hash exposure to any XSS/extension. | findasale-dev: strip password (and other sensitive fields) from auth/me serializer. | S865 |
| Rarity Boost pricing spec gap | **P3** — /coupons Rarity Boost shows "Activate Rarity Boost (50 XP)" with no cash option. Roadmap #290 documented as "15 XP / or $0.15 via card". Spec may be outdated. | Patrick: confirm Rarity Boost is XP-only at 50 XP (no cash rail) as intended | S858 |
| Email Verification Migration | **P0 (134 sessions, age-escalated)** — Migration 20260515180000 exists in migrations/ but no prisma migrate deploy recorded S726–S862. Token expiry not enforced in prod DB. | Patrick: cd packages/database && $env:DATABASE_URL="[Railway]" && npx prisma migrate deploy && npx prisma generate | S726 |
| eBay Connection for user1 | **P0 (75 sessions, age-escalated)** — No eBay OAuth on organizer QA account. Blocks #293, #298, all eBay push QA. | Patrick: connect eBay to user1 at /organizer/settings/ebay via OAuth | S785 |
| #230 Smart Buyer Widget Human QA | **P3** — Claude QA ✅ S793 confirmed. Human QA pending but blocked: no published sale on any real test organizer account. | Patrick: publish a sale on user1 account, then visit organizer dashboard to verify SmartBuyerWidget shows shopper data | S859 |

| UGC button visually buried | **P2 CONFIRMED S867** — "Tag Your Find" renders as white box (bg-white) in dark mode: jarring white rectangle in dark UI (ss_zoom confirmed). Not invisible but wrong—needs accent color. | Fix: replace bg-white with accent color styling | S866 |
| "You might also like" black gap | **P2 UNVERIFIED S867** — Section shows empty on all tested sales (one had no inventory, one was archive). YMAL section exists but loads no items. Cannot confirm 300px gap without a live sale with AI recommendations loading. | Try on a currently-active sale with items | S866 |
| Sale Type filter resets on Search submit | **P2 CONFIRMED S867** — onChange sets `?saleType=ESTATE`, Search button click resets to `?q=furniture` only. Reproduced: selected Estate Sale → typed "furniture" → clicked Search → URL dropped saleType, results showed all types (ss_1011915a0). | Fix search.tsx: include saleType in form submit payload | S866 |
| ZIP export rate-limit error swallowed | **P2** — When export is rate-limited, axios receives JSON error in blob response type → parse fails → generic fallback shown instead of "You've already exported recently." | Fix: parse JSON error body from blob response in export handler | S866 |
| ZIP export copy: 24h vs 1-month mismatch | **P2 CONFIRMED S867** — Help tab "Your Data" section shows "Limited to once per 24 hours" covering both Download buttons including ZIP. Code confirmed settings.tsx line 2005. Backend enforces 1/month. (ss_33535rwau) | Align copy to match enforcement: "once per month" for ZIP button | S866 |
| #192 Price History data-dependent | **P3** — ItemPriceHistoryChart is correctly wired in edit-item/[id].tsx but returns null when no ItemPriceHistory records exist. Railway DB has no price change history for test items. | No code fix needed. To verify: run price update on a real item, then check chart renders. | S862 |
| AuctionNinja scraper | **P2** — GitHub Actions runners get Cloudflare IP block (11KB challenge page, 0 results). Function name, URL, and selector are all correct. | Investigate NAA precedent; test User-Agent bypass; if unbypassable follow NAA pattern — disable schedule with comment | S868 |

---

## Pending Chrome Verifications

| # | Feature | Evidence | Session |
|---|---------|----------|---------|
| 303 | Photo Station Shopper Page | /sales/cmpbvumj90001e7t7v5sa1iqi/photo-station as user5 (Leo Thomas). Page loads ✅ ss_65158fo38. "Share Your Find" + "Location Access Required" gate expected post-#317 geofencing. XP award + Already Scanned state UNVERIFIED (requires real GPS). | S839 |

| 31 | Brand Kit save | As Alice (user1/PRO) on /organizer/brand-kit: scrolled to Save Brand Kit, clicked → "Saving..." (ss_2548h9vun) → green toast "Brand Kit updated successfully" (ss_9229rauhl). DB updatedAt confirmed 16:34 UTC. TEAMS Advanced Brand Customization gated ✅. Downloadable Brand Assets section visible ✅. | S866 |
| 194 | Saved Searches | As Bob (user2): saved "vintage" search (ss_6611nk9nv, toast ✅), viewed /shopper/saved-searches (ss_6478xn3zf, persisted ✅), clicked Run Search → results (ss_529648c4m ✅), deleted → empty state (ss_0183ddn2w ✅). Full flow verified. | S866 |
| 47 | UGC Photo Submit button | As Bob (user2) on /sales/cmpbvumj90001e7t7v5sa1iqi: "Tag Your Find" modal opened from sale detail (ss_7093sc6dp ✅). Button in DOM, functional. | S866 |
_(S862
| 324 | EXIF Temporal Clustering (upload preservation) ✅ | As Alice (user1) on /organizer/add-items: Batch Upload 3 JPEGs with EXIF DateTimeOriginal (14:00:05/14:00:45/16:30:00), clicked Analyze All → 3 drafts created (ss_2118qp0k0, ss_4511e8aq0). Re-downloaded stored Cloudinary images: all 3 timestamps preserved exactly. Test items+photos deleted from DB. | S863 |
| 176 | Browse Sales homepage Type filter ✅ | As Bob (user2) on finda.sale homepage: Type dropdown → Estate Sale = "17 of 20 sales", all Estate badges (ss_48642xh5d); Yard Sale = "3 of 20 sales", Yard badges (ss_73627haye). | S863 | batch of 9 graduated to roadmap S863. Note: S862 evidence had no screenshot IDs — applied on DB/page-content evidence per S862 orchestrator log.)_

---

## Next Session

**S868 done. Blocked Queue: 17 rows — QA MODE next session (>=8 items). No new feature dev without Patrick sign-off.**

Priority:
1. **AuctionNinja scraper Cloudflare fix — INVESTIGATE BEFORE TOUCHING ANYTHING:**
   - Read `.github/workflows/scrape-naa.yml` first — precedent for Cloudflare-blocked scraper (NAA schedule disabled with documented comment).
   - Read `.github/workflows/scrape-auctionzip.yml` — AuctionZip runs from Actions successfully; what's different?
   - Check whether `getRandomUserAgent()` is being passed correctly in the GitHub Actions run.
   - If truly IP-blocked with no bypass: follow NAA pattern — disable schedule with comment. Do NOT move scraper to Railway.
   - Files to examine in order: `scrape-naa.yml` → `scrape-auctionzip.yml` → `auctionNinjaScraper.ts` → `run-auctionninja.ts`
2. **Push S865b batch** (still pending from S865 — digest blast fix, ebayController tail restore).
3. **Dispatch findasale-dev (3 targeted P2 fixes, can batch):**
   - Sale Type filter reset: include saleType in search.tsx form submit payload
   - ZIP export copy: change "once per 24 hours" → "once per month" in settings.tsx line 2005 (ZIP button only)
   - UGC button: replace `bg-white border-2 text-gray-700` with accent color styling in sales/[id].tsx
4. **P0 Patrick items:** #332 Shopify dev store, Email Verification migration, eBay OAuth user1.
5. **Confirm P0 truncated files resolved:** Run `git status` on local repo — confirm search.tsx (564 lines), routes/search.ts, messageController.ts are clean vs HEAD before any push.

**Patrick actions required (in order):**

1. **Push S868 schema migrations batch:**
   ```
   git add packages/database/prisma/schema.prisma
   git add packages/database/prisma/migrations/20260604000000_add_directoryclaimemail_indexes/migration.sql
   git add packages/database/prisma/migrations/20260604100000_favorite_user_cascade_delete/migration.sql
   git add packages/database/prisma/migrations/20260604200000_schema_fk_cascade_restrict/migration.sql
   git add packages/database/prisma/migrations/20260604300000_nullable_fields_setnull/migration.sql
   git add packages/backend/src/services/scraper/sources/auctionNinjaScraper.ts
   git add packages/backend/src/scripts/run-auctionninja.ts
   git add .github/workflows/scrape-auctionninja.yml
   git add claude_docs/STATE.md
   git add claude_docs/patrick-dashboard.md
   git commit -m "infra: full FK cascade/restrict audit (4 migrations) + Favorite cascade delete + AuctionNinja scraper URL+selector fix + run script"
   .\push.ps1
   ```
   Note: Migrations are already deployed to Railway prod DB (applied this session). This push just syncs the files to GitHub.
2. **Push S865b batch (digest blast fix — the actual #335 trigger):**
   ```
   git add packages/backend/src/jobs/organizerWeeklyDigestJob.ts
   git add packages/backend/src/services/organizerAnalyticsService.ts
   git add packages/backend/src/jobs/curatorEmailJob.ts
   git add packages/backend/src/jobs/monthlyTrendReportJob.ts
   git add packages/backend/src/services/weeklyEmailService.ts
   git add packages/backend/src/controllers/ebayController.ts
   git add claude_docs/strategy/roadmap.md
   git commit -m "fix: gate organizer digest + recipient filter + volume fuses on all bulk email jobs (May 18 blast root cause) + restore ebayController tail"
   .\push.ps1
   ```
3. **Confirm Rarity Boost intent** — XP-only at 50 XP or restore $0.15 cash rail? (P3, carried)
4. **GBP phone verification** — business.google.com -> "Verify now" -> phone code. (carried)

## Recent Sessions

### S868 — BUG+INFRA: Schema FK audit (4 migrations deployed), Foursquare fixed, AuctionNinja partially fixed (Cloudflare-blocked)

**Health monitor findings:**
- 2 GitHub Actions failures: AuctionNinja scraper (0 results), Foursquare scraper (secrets stale)
- 1 Sentry slow query: DirectoryClaimEmail 1120ms (indexes already existed — no-op migration added)

**Foursquare scraper — ✅ FIXED:**
Workflow secrets `DATABASE_URL` and `DIRECT_URL` were stale. Updated both via GitHub Secrets API. Workflow re-triggered → ✅ SUCCESS.

**AuctionNinja scraper — PARTIAL FIX / STILL BROKEN:**
- Root cause 1 fixed: workflow called `runAuctionNinjaScraper` (nonexistent); actual function is `scrapeAuctionNinja`. Created `packages/backend/src/scripts/run-auctionninja.ts` run script. Updated workflow to use script.
- Root cause 2 fixed: data moved to `/hire-an-estate-sale-company`. URL updated. Selector updated from `li > a` to `a[href^="https://www.auctionninja.com/"]`.
- Root cause 3 UNRESOLVED: GitHub Actions runners get Cloudflare IP block (11KB challenge page vs full 325KB). Scraper returns 0 results even with correct URL + selector. Railway cron attempted (wrong) and reverted. GitHub Actions schedule re-enabled. Status: BROKEN — see Next Session investigation guide.

**Schema FK audit — ✅ DEPLOYED TO RAILWAY PROD:**
4 migrations applied in order (required 3 deploy attempts due to orphan rows in Conversation and UserAchievement):
1. `20260604000000_add_directoryclaimemail_indexes` — IF NOT EXISTS no-op (indexes pre-existed)
2. `20260604100000_favorite_user_cascade_delete` — `onDelete: Cascade` on Favorite.user (fixes Sentry null-user error)
3. `20260604200000_schema_fk_cascade_restrict` — orphan cleanup + 53 FK constraints (CASCADE/RESTRICT/SetNull) + 32 new indexes
4. `20260604300000_nullable_fields_setnull` — Review.userId, Message.senderId, EncyclopediaEntry.authorId, EncyclopediaRevision.authorId made nullable + SET NULL

**Files changed:** `packages/database/prisma/schema.prisma` · 4 migration SQL files · `auctionNinjaScraper.ts` · `run-auctionninja.ts` (NEW) · `.github/workflows/scrape-auctionninja.yml` · `packages/backend/src/index.ts` (Railway cron added + reverted, net: no change)

**Blocked Queue: 16 → 17 rows** (AuctionNinja Cloudflare block added).

### S867 — QA MODE: 3 P2 bugs confirmed, 1 UNVERIFIED, no code shipped

**QA findings (all Chrome-verified):**

- **UGC "Tag Your Find" button ❌ P2 CONFIRMED** — Renders `bg-white border-2` in dark mode: jarring white rectangle in dark UI. Button IS in the correct location (Community Photos section header on sale detail page), but styling is wrong. (zoom screenshot confirmed white-on-dark; ss_8686xfj8m)
- **Sale Type filter resets on Search submit ❌ P2 CONFIRMED** — Navigated /search. Set Sale Type = Estate Sale via dropdown (URL updated to `?q=&saleType=ESTATE`). Typed "furniture" in search box, clicked Search. URL became `?q=furniture` — saleType dropped. Dropdown reverted to "All Types". Results showed non-estate listings. (ss_1011915a0)
- **ZIP export copy mismatch ❌ P2 CONFIRMED** — Settings → Help tab → "Your Data" section: text reads "Limited to once per 24 hours" covering both Download My Data and Download Sale & Item Data (ZIP) buttons. Code confirmed settings.tsx line 2005. Backend enforces 1/month for ZIP. (ss_33535rwau)
- **YMAL black gap ⚠️ P2 UNVERIFIED** — "You might also like" section appeared on Alice's archive sale but rendered empty (no item cards loaded). Cannot confirm 300px gap without a live active sale with AI-generated recommendations. Data-dependent.

**Notes:**
- Sale `cmpbvumj90001e7t7v5sa1iqi` (former QA sale) now 404 — use Alice's sale `0d9563f9-4fcd-4630-8beb-189ea58c8118` for organizer QA.
- S866 missing from Recent Sessions log — was a QA session; evidence captured in PCV table (#31, #194, #47) and Blocked Queue (P2 entries).

### S865 — BUG/AUDIT+QA: #335 root-caused, resolved, and ✅✅ END-TO-END VERIFIED

**Final outcome:** #335 closed after 73 sessions. Roadmap row marked Claude QA ✅ S865 + Human QA ✅ S865 (Patrick personally confirmed payout email receipt in his Yahoo inbox).

**S865d/e (after fixes):** Suspension auto-lifted ~16:00 UTC (external test 19e9361c9d4b6667, no bounce — suspended-era bounces came <60s). Outreach re-enabled: OUTREACH_ENABLED=true + GH workflow enabled (both verified). End-to-end #335 test: logged into finda.sale as Artifact via Google OAuth, POST /api/consignors/cqa333testjanethrift01/payout → 201 (payout cmpzq2ylq000fg36hlx87d1m1, $29.75 Cash) → Gmail Sent 12:41 PM no bounce → Yahoo INBOX delivery confirmed. Test payout deleted post-verification (Patrick-approved). 2 NEW P1s queued: OAuth login doesn't supersede existing JWT session (had to logout user1 cookie before artifact OAuth took); /api/auth/me returns bcrypt password hash.

#### Original S865 audit chain (earlier in session)

**Audit chain (all tool-verified):**
- Railway env verified: SES_FROM_EMAIL already find@outreach.finda.sale (S864 "regression" never persisted / was misdiagnosed). Gmail refresh token VALID (live token exchange, scope gmail.send). DNS healthy (SPF/DKIM/DMARC on outreach.finda.sale all present).
- Live send test with prod creds + exact emailService.ts format: Gmail API accepted (msg 19e91905c1d8a024) -> bounced 30s later by mailer-daemon: "You have reached a limit for sending mail."
- Chrome: deseee@yahoo.com last received find@outreach.finda.sale mail May 17. outreach@finda.sale inbox: 1,400+ limit bounces, first ones May 18, 100% of sends bouncing since — payouts, password resets, verifications, all outreach. June 3 volume only 32 sends, still all bounced -> sustained clamp, re-tripped by cron sending every 4h for 17 days.
- May 17-18 sent folder: "We built X a storefront" blasts with duplicates (same business up to 4x; junk targets e.g. The Walt Disney Company).

**Mitigation (done in-session):** GH Actions pipeline-outreach-emails.yml disabled via UI. Railway OUTREACH_ENABLED=false (redeploy 34ff3f85). Clamp expected to lift ~24-48h after sends stop; scheduled re-test task created (fires 2026-06-05).

**DEV (1 agent, root causes DB-confirmed):** outreachEmailsCron.ts — (RC-1) kill switch now inside sendOutreachEmails() (was registration-only; GH job-runner path bypassed it); (RC-2) atomic claim-before-send via conditional updateMany — DB evidence showed one org with 5 SENT audit events but attemptCount=2 (sent-marking happened after send; crashes enabled repeat blasts); (RC-3) in-process overlap guard (manual route had no lock); (RC-4) 184 shared-address org records noted — existing dedup layers + atomic claim neutralize at send time. Also: messageController.ts truncated tail restored to match GitHub main.

**Process notes:** Railway CLI installed in VM via npm (mnt/.claude binary not mounted this session). Email failures are invisible to the app — all catch blocks swallow; bounces only visible in the outreach@finda.sale mailbox (gmail.send scope cannot read it; used Chrome).

---

### S864 — QA MODE: #195 ✅, Vercel build fixed, #335 regression introduced

**QA ✅:**
- #195 messaging re-fix Chrome-verified: POST /api/messages → 201, no 500 (ss_6119ualta, ss_03909ty8h).

**Records:**
- #324 roadmap Chr column → ✅ S863. #176 Status updated with Type filter S863 evidence.
- S863 PCV table entries graduated.

**Vercel build failure found + fixed:**
- 3 consecutive ERRORED Vercel deploys on S863 commit. Root cause: saved-searches.tsx priceMin/priceMax typed `number`, compared to `''` → TS compile error.
- Fix: changed to `number | string | null`. 0 TS errors confirmed. Not yet pushed.

**⚠️ #335 REGRESSION (Claude error):**
- Incorrectly diagnosed SES_FROM_EMAIL as root cause and advised changing from `find@outreach.finda.sale` → `outreach@finda.sale`.
- This broke Gmail API send entirely. Confirmed: no email arrives anywhere (tested artifactmi@gmail.com and Yahoo).
- Must revert SES_FROM_EMAIL → `find@outreach.finda.sale` next session before any email testing.

**Files changed:** claude_docs/strategy/roadmap.md · claude_docs/STATE.md · packages/frontend/pages/shopper/saved-searches.tsx (TS fix, not yet pushed)

---

### S863 — QA MODE: 2 verified, #195 re-fixed, 2 features built, payout email re-sent

**QA ✅ (Chrome + DB evidence):**
- #324 EXIF: 3 EXIF-tagged JPEGs uploaded via Batch Upload as Alice → Analyze All → re-downloaded stored Cloudinary images → DateTimeOriginal preserved exactly (ss_2118qp0k0, ss_4511e8aq0). Test data cleaned.
- #176 homepage Type filter: Estate 17/20, Yard 3/20, badges match (ss_48642xh5d, ss_73627haye).

**QA ❌ → re-fixed:**
- #195 messaging STILL 500 in prod (ss_4465t8wly). Railway logs: PrismaClientValidationError in sendMessage. Root cause: S862 guard did `sale.findUnique({select:{isUnmanagedListing}})` but the field is on Organizer, not Sale. Fix: select `organizer:{select:{isUnmanagedListing}}`. messageController.ts, 0 TS errors. Lesson: S862 dev skipped schema preflight; TS didn't catch it (VM Prisma client types loose).

**New bug found+fixed:** /search Sale Type filter silently ignored server-side — saleType absent from search route zod schema. Added schema field + where clause (search.ts).

**DEV (2 parallel agents, both 0 TS errors):**
- #194: built pages/shopper/saved-searches.tsx (list/delete/run, empty+loading+error states) + Save Search button on search.tsx with correct {name,filters} payload.
- #47: UGCPhotoSubmitButton wired onto sales/[id].tsx alongside UGCPhotoGallery, gated to logged-in users, with empty state.
- Inline: homepage handleSaveSearch payload fixed ({query}→{name,filters} — was 400 on every save).

**#335:** Jane Thrift payout email re-sent directly via Gmail API using production creds (msg 19e9093c5a587f21). Exact replica of sendConsignorPayout template, $29.75 Cash, Artifact workspace.

**Records:** 9 S862 PCV marks applied to roadmap (#327/#73/#186/#396/#197/#163/#173/#71 + note). Queue: Bing row removed (done), Re-Seed row removed (user5–12 no longer exist — Patrick), #324 graduated to PCV. Queue 12→10 rows.

**Files changed:** messageController.ts · search.ts (backend routes) · index.tsx · search.tsx · saved-searches.tsx (NEW) · sales/[id].tsx · STATE.md · patrick-dashboard.md · roadmap.md

---