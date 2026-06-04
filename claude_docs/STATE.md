# PROJECT STATE

Sections: §Current Status | §Pool Audit Findings | §Blocked Queue | §Recent Sessions | §Next Session

FindA.Sale is a two-sided marketplace PWA for secondary sale organizers (estate sales, yard sales, auctions, flea markets, consignment) connecting them with shoppers. Backend: Node.js/Prisma/PostgreSQL on Railway. Frontend: Next.js on Vercel.

---

## Current Status

**Latest: S870 — QA MODE: 4/5 S869 CODE-ONLY fixes Chrome-verified ✅. OAuth supersede UNVERIFIED (needs Patrick + Gmail). AuctionNinja GH schedule disabled (Cloudflare block, pending push). ZIP rate-limit blob parse fixed (pending push). Blocked Queue: 9 rows.**
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
_⚠️ P0 AGING: #332 at 72+ sessions — mandatory P0 per CLAUDE.md §10a._
_S869: 3 P0 truncated files closed (confirmed on GitHub), 3 P2 + 2 P1 bugs fixed and deployed._

| Feature | Reason | What's Needed | Session Added |
|---------|--------|---------------|---------------|
| #332 Shopify Cross-Listing | **P0 (72 sessions)** — Requires Shopify OAuth; no test store available | Create free Shopify Partners dev store, connect via OAuth | S791 |
| Email Verification Migration | **P0 (135 sessions, age-escalated)** — Migration 20260515180000 exists in migrations/ but never deployed. Token expiry not enforced in prod DB. | Patrick: cd packages/database && $env:DATABASE_URL="[Railway]" && npx prisma migrate deploy && npx prisma generate | S726 |
| eBay Connection for user1 | **P0 (76 sessions, age-escalated)** — No eBay OAuth on organizer QA account. Blocks #293, #298, all eBay push QA. | Patrick: connect eBay to user1 at /organizer/settings/ebay via OAuth | S785 |
| OAuth session supersede | **P2 UNVERIFIED S870** — OAuthBridge !user guard fix confirmed in code (\_app.tsx). Chrome QA attempted S870 but requires completing real Google OAuth flow while logged in as a different user. | Patrick: log in as user2 (JWT active), click "Sign in with Google" as artifact account, verify /api/auth/me returns artifact not user2 | S870 |
| "You might also like" black gap | **P2 UNVERIFIED S867** — Section shows empty on all tested sales. Cannot confirm 300px gap without a live active sale with AI-generated recommendations. | Try on a currently-active sale with items | S866 |

| AuctionNinja scraper | **P2** — Cloudflare Bot Fight Mode blocks GitHub Actions runners (AWS ASN). GH schedule disabled S870 with NAA-pattern comment (pending push). Still needs: Railway cron or residential proxy to actually get results. | Move to Railway backend cron (index.ts) — Railway IPs may not be ASN-blocked; test first | S868 |
| Rarity Boost pricing spec gap | **P3** — /coupons Rarity Boost shows "Activate Rarity Boost (50 XP)" with no cash option. Roadmap #290 documented as "15 XP / or $0.15 via card". Spec may be outdated. | Patrick: confirm Rarity Boost is XP-only at 50 XP (no cash rail) as intended | S858 |
| #230 Smart Buyer Widget Human QA | **P3** — Claude QA ✅ S793 confirmed. Human QA pending: no published sale on real test organizer account. | Patrick: publish a sale on user1, then visit organizer dashboard to verify SmartBuyerWidget shows shopper data | S859 |
| #192 Price History data-dependent | **P3** — ItemPriceHistoryChart wired correctly but returns null with no history records. | No code fix needed. To verify: run a price update on a real item, check chart renders. | S862 |

---

## Pending Chrome Verifications

| # | Feature | Evidence | Session |
|---|---------|----------|---------|
| 303 | Photo Station Shopper Page | /sales/cmpbvumj90001e7t7v5sa1iqi/photo-station as user5 (Leo Thomas). Page loads ✅ ss_65158fo38. "Share Your Find" + "Location Access Required" gate expected post-#317 geofencing. XP award + Already Scanned state UNVERIFIED (requires real GPS). | S839 |

| 31 | Brand Kit save | As Alice (user1/PRO) on /organizer/brand-kit: scrolled to Save Brand Kit, clicked → "Saving..." (ss_2548h9vun) → green toast "Brand Kit updated successfully" (ss_9229rauhl). DB updatedAt confirmed 16:34 UTC. TEAMS Advanced Brand Customization gated ✅. Downloadable Brand Assets section visible ✅. | S866 |
| 194 | Saved Searches | As Bob (user2): saved "vintage" search (ss_6611nk9nv, toast ✅), viewed /shopper/saved-searches (ss_6478xn3zf, persisted ✅), clicked Run Search → results (ss_529648c4m ✅), deleted → empty state (ss_0183ddn2w ✅). Full flow verified. | S866 |
| 47 | UGC Photo Submit button | As Bob (user2) on /sales/cmpbvumj90001e7t7v5sa1iqi: "Tag Your Find" modal opened from sale detail (ss_7093sc6dp ✅). Button in DOM, functional. | S866 |
| — | Sale Type filter persistence | ✅ Chrome-verified S870 — Navigated /search as user2. Set Sale Type = Estate Sale via dropdown. Typed "furniture", clicked Search. URL became ?q=furniture&saleType=ESTATE (persisted). Dropdown still shows "Estate Sale". All 10 results showed "Estate Sale" badge. ss_9039vdcse ss_8858sjoxz | S870 |
| — | ZIP export copy per-button | ✅ Chrome-verified S870 — Navigated /organizer/settings → Help tab as user2. "Download My Data" shows "Limited to once per 24 hours" span. "Download Sale & Item Data (ZIP)" shows "Limited to once per month" span. No shared rate-limit paragraph text. ss_3469lkjs6 | S870 |
| — | UGC button dark mode | ✅ Chrome-verified S870 — Navigated Hammond Estate Sale /sales/cmpie5dtp01nx4n1ht00o5zcn in dark mode. Community Photos section. "Tag Your Find" button computed styles: bg=rgba(120,53,15,0.3) (amber-900/30), border=1.8px solid rgb(249,115,22) (amber), color=rgb(252,211,77) (amber). No white box. ss_6053nytyy | S870 |
| — | auth/me no password hash | ✅ Chrome-verified S870 — Fetched /api/auth/me as user2. Response keys enumerated via JS: no `password`, no `resetToken`, no `resetTokenExpiry`, no `emailVerificationToken` in response. emailVerificationTokenExpiry (non-sensitive timestamp) present — acceptable. | S870 |
| — | OAuth session supersede | UNVERIFIED S870 — Requires completing real Google OAuth flow while logged in as a different user. Cannot test without Patrick + artifactmi@gmail.com. Added to Blocked Queue. | S870 |
_(S862
| 324 | EXIF Temporal Clustering (upload preservation) ✅ | As Alice (user1) on /organizer/add-items: Batch Upload 3 JPEGs with EXIF DateTimeOriginal (14:00:05/14:00:45/16:30:00), clicked Analyze All → 3 drafts created (ss_2118qp0k0, ss_4511e8aq0). Re-downloaded stored Cloudinary images: all 3 timestamps preserved exactly. Test items+photos deleted from DB. | S863 |
| 176 | Browse Sales homepage Type filter ✅ | As Bob (user2) on finda.sale homepage: Type dropdown → Estate Sale = "17 of 20 sales", all Estate badges (ss_48642xh5d); Yard Sale = "3 of 20 sales", Yard badges (ss_73627haye). | S863 | batch of 9 graduated to roadmap S863. Note: S862 evidence had no screenshot IDs — applied on DB/page-content evidence per S862 orchestrator log.)_

---

## Next Session

**S869 done. Blocked Queue: 9 rows — QA MODE (≥8). Chrome QA of 5 S869 fixes is the top priority. Parallel dispatch available on non-Chrome work.**

**Parallel dispatch plan for S870:**
- **[SEQUENTIAL Chrome QA]** Verify 5 S869 CODE-ONLY fixes — one dispatch per fix, must be sequential
- **[PARALLEL: no Chrome]** AuctionNinja Cloudflare investigation — read NAA/AuctionZip workflow precedents, test bypass, disable if unbypassable
- **[PARALLEL: no Chrome]** ZIP rate-limit error swallowed (P2) — fix blob parse error in settings.tsx export handler (~10 lines)



**Patrick actions required:**
1. **Push S870 code** — see push block below (settings.tsx + scrape-auctionninja.yml)
2. Rarity Boost intent — XP-only at 50 XP or restore $0.15 cash rail? (P3, carried)
3. GBP phone verification — business.google.com → "Verify now" → phone code (carried)
4. eBay OAuth — connect eBay to user1 at /organizer/settings/ebay (unblocks QA for #293/#298)
5. Email Verification Migration — cd packages/database && $env:DATABASE_URL="[Railway]" && npx prisma migrate deploy
6. OAuth supersede QA — log in as user2, then Google OAuth as artifactmi@gmail.com, verify /api/auth/me returns artifact data

## Recent Sessions

### S870 — QA MODE: 4/5 S869 fixes Chrome-verified. AuctionNinja disabled. ZIP rate-limit fix. Blocked Queue: 9 rows.

**Chrome QA results (sequential):**
- **Sale Type filter persistence ✅** — URL shows `?q=furniture&saleType=ESTATE` after search submit. Dropdown stays "Estate Sale". All results show Estate Sale badge. ss_9039vdcse ss_8858sjoxz
- **ZIP export copy ✅** — "Download My Data" = "Limited to once per 24 hours". ZIP = "Limited to once per month". No shared paragraph. ss_3469lkjs6
- **UGC button dark mode ✅** — Tag Your Find button: bg=amber-900/30, border=amber, text=amber. No white box in dark mode. ss_6053nytyy
- **auth/me no password hash ✅** — /api/auth/me response: no password, resetToken, resetTokenExpiry, emailVerificationToken fields present.
- **OAuth session supersede UNVERIFIED** — Requires real Google OAuth flow with Patrick's Gmail. Added to Blocked Queue.

**Parallel work (AuctionNinja + ZIP fix):**
- **AuctionNinja GH schedule disabled** — Confirmed structural Cloudflare ASN block (GitHub Actions on AWS us-east-1/us-east-2 = datacenter IPs, blocked before headers evaluated). Schedule disabled in scrape-auctionninja.yml with NAA-pattern comment. Fix path: Railway cron or residential proxy. Pending push.
- **ZIP rate-limit blob parse fixed** — settings.tsx: both export handlers now parse JSON error from blob response before showing toast. "You've already exported today/this month" shown correctly on 429. "Download My Data" shows "Limited to once per 24 hours"; ZIP shows "Limited to once per month". Pending push.

**Blocked Queue: 9 rows** (removed ZIP rate-limit ✅; added OAuth supersede UNVERIFIED)

### S869 — BUG: 5 bugs fixed (3 P2 + 2 P1), deployed green. Blocked Queue 17→9.

**Fixes deployed (all ✅ Vercel + Railway green per Patrick):**
- **Sale Type filter reset** — handleSearch() now preserves all active filters (saleType, category, condition, saleStatus, sortBy, priceMin, priceMax) on search submit. Was: only passing `q`, dropping saleType. (search.tsx)
- **ZIP export copy** — Shared paragraph no longer mentions rate limit; each button now has its own note: "Download My Data" = "once per 24 hours", ZIP = "once per month". (settings.tsx)
- **UGC "Tag Your Find" dark mode** — Replaced bg-white with amber-100/amber-900 amber styling. No more white box in dark mode. (UGCPhotoSubmitButton.tsx)
- **auth/me password hash** — GET /api/auth/me now destructures password/resetToken/resetTokenExpiry/emailVerificationToken before spreading safeUser. (auth.ts)
- **OAuth session supersede** — OAuthBridge removed !user guard; exchange always fires on pending oauthProfile. (\_app.tsx)

**Bonus:** search.tsx tail truncated by Edit tool mid-session (Edit tool truncation bug on files >250 lines). Repaired via Python — EmptyState body, Notify Me section, closing tags, export default SearchPage restored.

**Session also confirmed:** S865b pushed ✅ · 3 P0 truncated files confirmed clean on GitHub HEAD ✅

**Blocked Queue:** 17 → 9 (removed: 3 truncated P0s ✅, Sale Type filter ✅, ZIP copy ✅, UGC button ✅, auth/me hash ✅, OAuth supersede ✅). 5 items moved to PCV.

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


---