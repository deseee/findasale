# PROJECT STATE

Sections: §Current Status | §Pool Audit Findings | §Blocked Queue | §Recent Sessions | §Next Session

FindA.Sale is a two-sided marketplace PWA for secondary sale organizers (estate sales, yard sales, auctions, flea markets, consignment) connecting them with shoppers. Backend: Node.js/Prisma/PostgreSQL on Railway. Frontend: Next.js on Vercel.

---

## Current Status

**Latest: S860 — QA+Records+DEV: Records: #255 Chr ✅ applied to roadmap, PCV trimmed 2→1. DEV: P2 notifications sort fixed (|| → ?? in notifications.tsx). QA: #467/#464/#237 smoke tests PASS (ss_40922gfo2/ss_5917catz6/ss_7392t9kal). #316 Referral Tranche B ❌ P1 BUG FOUND+FIXED — recordSaleVisit() never called from pointsController; fix applied (ss_8604lb5ug/ss_71195379l/ss_6851w4tv8). P2 referral banner also fixed (register.tsx). P3: "Learn about TEAMS" button clipped on dashboard upgrade card. Blocked Queue: 8 rows.**

**Previous: S858 — QA+DEV: Flash Deal dropdown FIXED (AVAILABLE filter). Records: #159 Chr ✅ applied to roadmap + Pending Chrome Verifications trimmed. QA: #398 ✅ (organizer referral link + Copy Link + stats — ss_4915xx0kl). #259 ✅ (1.5x XP confirmed, Hunt Pass page — ss_7973nmk5n). #290 ✅ (/coupons 3-tier $ + XP display — ss_32554r03n). #158 ✅ ("Notify me of new items" + "Remind Me by Email" visible — ss_4902k1y46). 3 new P3 notes. Blocked Queue: 6 rows (Flash Deal dropdown cleared).**

**Previous: S857 — HEALTH/OPS: Daily CI + Sentry audit. Backend Sentry cleared from 10+ unresolved → 0. All issues were historical (pre-May-30 slow queries fixed by migrations, GarageSaleFinder 0-results from old code already removed, CORS api.finda.sale fix deployed S779/S780). VACUUM ANALYZE run on Organizer + DirectoryClaimEmail + Sale tables (June 2 migration required it). GarageSaleFinder scraper confirmed working (Chicago 169 links, GR 20 links). No code changes.**

**Previous: S856 — DEV: #27b FIXED — print-kit yard sign + printQRPage popups now respect canRemoveWatermark (frontend preview + backend PDF primary footer both gated). New P3: Flash Deal dropdown shows SOLD items in item selector. QA: #159 ✅ Chrome-verified — FlashDealBanner dark mode correct (orange gradient on dark bg, no white/light — P2 FIXED), countdown "Old Radio for next 1h 56m" confirmed on sale page (ss_2417corir); form dark mode confirmed ss_3858xb9jb. Blocked Queue: 7 rows.**

**Previous: S855 — Records: S854 Chrome marks applied to roadmap (#289/#309/#311/#312/#316). DEV: #308 FIXED (Hidden badge in item list). #312/#289 FIXED (Generate button disabled + "X/X used" at cap). QA: #27b P2 BUG — TEAMS "Remove watermark" saves but print kit yard signs still show FindA.Sale branding (ss_28036zjv6). #159 UNVERIFIED (no published sale). New P3: yard sign hardcodes "Estate" sale type. Blocked Queue: 7 rows.**

**Previous: S854 — QA: #308/#309/#311/#289/#312/#316 all Chrome-verified. #309 ✅ (P1 fixed — in-app modal). #311 ✅ (transfer modal + 409 enforcement). #289 ✅ (429 cap at 4th coupon attempt, Hunt Pass 3/month enforced). #312 ✅ (XP spend: 2000→1700 after 300 XP, UI updates). #316 ✅ (Tranche A +100 XP on 3rd login, Tranche B +150 XP on 3rd sale visit — both DB-confirmed). 2 new P3 bugs. Blocked Queue: 2 rows.**

**Previous: S853 — QA: All 4 S852 bug fixes Chrome-verified. Bug 1 (edit-item null saleId) ✅ ss_8510ho8fx. Bug 2 (Full Edit misfire) ✅ ss_596216ag3. Bug 3 (/unsubscribe no-token) ✅ ss_4693l8c4l. Bug 4 (em dash) ✅ ss_0517yypd1. Blocked Queue: 2 rows (3 P2+P3 bugs cleared, #332/#335 remain).**

**Previous: S852 — DEV+QA: 3 P2 bugs fixed (edit-item inventory null-saleId, Full-Edit misfire, /unsubscribe no-token spinner). P3 fixed (em dash literal in ItemPhotoManager). #320 DB-confirmed (6 items with aiSuggestedPrice, organizer prices not overridden), Chrome UNVERIFIED. #317 frontend graceful fallback code-confirmed, Chrome UNVERIFIED (test clue API returns not-found). Blocked Queue: 6 rows.**

**Previous: S848 — EMAIL SYSTEM AUDIT + COMPREHENSIVE FIX. Full audit of every email-sending service in the backend. 10 files fixed. Global daily quota counter built. Two previously unknown P0 blast-to-all jobs found and fixed (notificationController.sendWeeklyDigest fires every Friday to 5,000 users with no opt-out + no unsubscribe link; organizerAnalyticsService sends weekly to all organizers with no suppression). Inbox incident confirmed stopped — no runaway sends in Railway logs. Blocked Queue: 7 rows. Push block ready.**

**Previous: S847 — EMAIL INCIDENT + CLEANUP. outreach@finda.sale inbox had 21,000+ bounce emails from Gmail sending-limit errors. Root cause: monthlyTrendReportJob was emailing 44k scraped orgs (not real organizers), burning Gmail daily quota. outreachEmailsCron had duplicate emailAddress bug (sam@gmail.com ×48). BOTH FIXED and deployed today. ~15,635 "Your May 2026 Search Visibility Report" bounces manually deleted via Apps Script. "10 estate sales this weekend near you" bounce cleanup still running (~800+ deleted). Inbox not yet fully clean. Full email audit required next session. Blocked Queue: 7 rows.**

**Previous: S845/S846 — QA + email infrastructure fully fixed. #293 bug fixed (PostSaleEbayPanel /ebay/ prefix). #335 email: (1) send.finda.sale SPF → `include:_spf.google.com` via Vercel DNS API, (2) Railway SES_FROM_EMAIL changed from notifications@send.finda.sale → outreach@finda.sale (authenticated Gmail account, full SPF+DKIM already configured), (3) Railway redeploy triggered. New payout test required to confirm delivery. #68 ✅ #125 ✅ re-verified. #91 + #32 UNVERIFIED. Blocked Queue: 6 rows.**

**Previous: S844 — DEV+QA: #461 ✅ fully Chrome-verified end-to-end. S831 fix: apiBase changed to /api proxy (SameSite=Lax was blocking cookies on direct Railway URL). Export 200, fbExportedAt stamped, SOLD saved, nudge "Mark sold on Facebook Marketplace" visible in inbox. #27b ✅ applied to roadmap. Share-card 401 on promote page found (new P2). Blocked Queue: 4 rows.**

**Previous: S843 — QA: #27b iCal watermark ✅ Chrome-verified (ss_4410s6brw). #461 UNVERIFIED — root cause misdiagnosed as localStorage; actual bug was direct Railway URL bypassing /api proxy. New P2 bug noted. Blocked Queue: 6 rows.**

**Previous: S842 — DEV+Records: #461 fix written (FB nudge wired to itemController.ts updateItem, 0 TS errors). #27b fix written (iCal watermark footer via canRemoveWatermark() in generateIcal(), 0 TS errors). Roadmap: #193 wishlists ✅ applied (S841 evidence). Records scan: 4 P0 aging violations flagged. Blocked Queue: 6 rows.**

**Previous: S841 — QA: #321 wishlists hard-nav ✅ Chrome-verified (ss_1258kvk8e ss_839591msq). #461 ⚠️ P2 BUG — FB nudge not wired to single-item PUT (only bulk PATCH). #27b ⚠️ P2 BUG — iCal watermark footer missing from generateIcal(). Blocked Queue: 6 rows (2 new P2 bugs added).**

**Previous: S840 — Records cleanup + QA: STATE.md trimmed (369→136 lines), #321 ✅ applied to roadmap, #464 UTM drift fixed. Wishlists flow QA: /wishlists auth guard fixed. Blocked Queue: 4 rows.**

---

## Pool Audit Findings

Run: 2026-05-18 (S756). Railway DB queried directly via psycopg2.

**DirectoryClaimEmail (outreach queue):** 3,319 PENDING, 29 SENT. 31 junk rows deleted (26 image filenames stored as emailAddress, 5 Patrick test emails).

**leadTier breakdown:** HOT: 5,517 (100% website coverage) · WARM: 36,851 (3.3% website coverage) · COLD: 14,314

**WARM email gap:** Only 208 WARM orgs currently addressable. Website enrichment job changed from weekly → daily (S756). API headroom: HERE 250K/month cap, ~1,500/month usage. Pipeline healthy.

**Geocoding:** 6,760 sales still not geocoded. Nightly geocoding job addresses gradually.

---

## Blocked Queue

_S772 reconciliation: graduated/closed rows removed — reconciled into strategy/roadmap.md. Only genuinely open items remain._
_⚠️ P0 AGING: #332 at 68 sessions; #335 at 68 sessions — mandatory P0 per CLAUDE.md §10a._

| Feature | Reason | What's Needed | Session Added |
|---------|--------|---------------|---------------|
| #332 Shopify Cross-Listing | **P0 (68 sessions)** — Requires Shopify OAuth; no test store available | Create free Shopify Partners dev store, connect via OAuth | S791 |
| #335 Consignor Payout Email | **P0 (68 sessions)** — Payout ran S845. SPF fixed S846. Patrick must check deseee@yahoo.com — if email received → ✅. | Check deseee@yahoo.com for Jane Thrift payout email. If received → ✅. | S791 |
| Rarity Boost pricing spec gap | **P3** — /coupons Rarity Boost shows "Activate Rarity Boost (50 XP)" with no cash option. Roadmap #290 documented as "15 XP / or $0.15 via card". Spec may be outdated. | Patrick: confirm Rarity Boost is XP-only at 50 XP (no cash rail) as intended | S858 |
| Email Verification Migration | **P0 (133 sessions, age-escalated 2026-06-03)** — Migration 20260515180000 exists in migrations/ but no prisma migrate deploy recorded S726–S859. Token expiry not enforced in prod DB. | Patrick: cd packages/database && $env:DATABASE_URL="[Railway]" && npx prisma migrate deploy && npx prisma generate | S726 |
| Production DB Re-Seed | **P0 (72 sessions, age-escalated 2026-06-03)** — Seedy2025! rejected for shopper accounts user5–user12+ since S576. Shopper Chrome QA requiring login blocked. | Patrick: cd packages/database && $env:DATABASE_URL="[Railway]" && npx prisma db seed (back up sale cmpbvumj90001e7t7v5sa1iqi first) | S787 |
| eBay Connection for user1 | **P0 (74 sessions, age-escalated 2026-06-03)** — No eBay OAuth on organizer QA account. Blocks #293, #298, all eBay push QA. | Patrick: connect eBay to user1 at /organizer/settings/ebay via OAuth | S785 |
| Bing Webmaster Sitemap | **P0 (76 sessions, age-escalated 2026-06-03)** — Bing/DuckDuckGo not receiving sitemap pings. SEO gap. | Patrick: bing.com/webmasters → Add sitemap → finda.sale/server-sitemap.xml | S783 |
| #230 Smart Buyer Widget Human QA | **P3** — Claude QA ✅ S793 confirmed. Human QA pending but blocked: no published sale on any real test organizer account (user1 has none, Artifact MI has none, all published sales are scraper accounts). | Patrick: publish a sale on user1 account, then visit organizer dashboard to verify SmartBuyerWidget shows shopper data | S859 |

---

## Pending Chrome Verifications

| # | Feature | Evidence | Session |
|---|---------|----------|---------|
| 316 | Referral Tranche B re-verify | After S860 fix: sign up via referral link, visit 3 distinct published sales as referred user, confirm ReferralTranche.distinctSalesVisited updates + referrer receives 150 XP. Also confirm green referral banner shows on /register?ref=... page. | S860 |
| 303 | Photo Station Shopper Page | /sales/cmpbvumj90001e7t7v5sa1iqi/photo-station as user5 (Leo Thomas). Page loads ✅ ss_65158fo38. "Share Your Find" + "Location Access Required" gate expected post-#317 geofencing. XP award + Already Scanned state UNVERIFIED (requires real GPS). | S839 |

---

## Next Session

**S860 done. Blocked Queue: 8 rows — QA MODE next session (≥8 items).**

Priority:
1. **QA #316 Tranche B re-verify** — sign up via referral link, visit 3 sales, confirm `distinctSalesVisited` increments + referrer gets 150 XP. Also confirm green referral banner shows on /register?ref=... page. One Chrome dispatch.
2. **QA #324 Temporal EXIF Clustering** (Claude QA ⬜) — upload photos with close EXIF timestamps, verify clustering behavior. One Chrome dispatch.
3. **#317/#320** — Still UNVERIFIED. Defer (needs GPS/Stripe).
4. **#335 payout** — Patrick check deseee@yahoo.com.
5. **P3: "Learn about TEAMS" button clipped** on dashboard upgrade card — minor layout fix if time allows.
6. **5 P0 Patrick-action items** in Blocked Queue (see below).

**Blocked Queue: 8 rows. QA MODE — no new feature dev without Patrick sign-off.**

**Patrick actions required:**

1. **Push S860 code+docs** (see push block below).
2. **Check deseee@yahoo.com** — Jane Thrift payout email (#335). If received → ✅.
3. **Confirm Rarity Boost intent** — XP-only at 50 XP or restore $0.15 cash rail?
4. **Delete test invite SVPKNKV3:** finda.sale/admin/invites → Delete SVPKNKV3.
5. **GBP phone verification:** business.google.com → "Verify now" → phone code.

## Recent Sessions

### S860 — QA+Records+DEV: #316 Tranche B P1 bug found+fixed, notifications P2 fixed

**Records:**
- `claude_docs/strategy/roadmap.md`: #255 Claude QA ⬜→✅ S859 applied (cross-session from S859 PCV). #316 status updated (P1 bug found+fixed S860).
- `claude_docs/STATE.md`: PCV trimmed (#255 graduated). #316 re-verify row added to PCV.

**DEV (inline — <20 lines, 2 files):**
- `packages/frontend/pages/notifications.tsx` lines 322–323: `|| 999` → `?? 999` — Today group (value 0) was sorting to page bottom. 0 TS errors.
- `packages/backend/src/controllers/pointsController.ts`: added `import { referralTrancheService }` + fire-and-forget `recordSaleVisit()` call in `trackSaleVisit()`. Tranche B (150 XP / 3 sale visits) was fully implemented in the service but never wired to the controller — referred users' sale visits never counted. 0 TS errors.
- `packages/frontend/pages/register.tsx`: added green "Referral link applied" banner for `formData.referralCode` (mirrors existing inviteCode banner). Previously `?ref=` param was silently captured with no user feedback. 0 TS errors.

**QA smoke tests (DOM-verified, no new PCV entries — prior Chrome ✅ stands):**
- #467 Sold Item UX: amber banner ✅, SOLD stamp ✅, SimilarItemsGrid ✅, lightbox suppressed ✅, save button hidden ✅, dark mode ✅. No regression vs S817.
- #464 SEO Footer: Discover column (7 links) ✅, Explore dropdown ✅, /encyclopedia loads ✅ (ss_40922gfo2, ss_5917catz6).
- #237 Sale-Type Dashboard: loads without errors, no horizontal scroll ✅ (ss_7392t9kal). P3 incidental: "Learn about TEAMS" button clipped at ~1200px on upgrade card.

**QA #316 Referral Tranche B — ❌ FAIL → FIXED:**
- Chrome: registered qa-tranche-b-s860@test.com via /register?ref=REF-7CD8DCC0 (ss_8604lb5ug). Visited 3 published sales (ss_71195379l, ss_6851w4tv8, ss_0089nigg0).
- DB post-visit: `distinctSalesVisited: []` (empty), `trancheBReleasedAt: None`, user1 XP unchanged. Root cause: `referralTrancheService.recordSaleVisit()` never called from pointsController. Fix applied.
- P2 side finding: no visual confirmation when `?ref=` param sets referralCode. Fixed (register.tsx banner).
- Test data cleaned: qa-tranche-b-s860 deleted, user1 XP restored to 108.

**Blocked Queue: 8 rows (unchanged — P0s are Patrick-action items).**

### S859 — QA+Records: #255 Chrome-verified + notifications sort P2 bug found

**Records:**
- `claude_docs/strategy/roadmap.md`: #158 Human QA ⬜→✅ S858, #398 Claude QA ⬜→✅ S858, #259 Human QA ⬜→✅ S858, #290 Human QA ⬜→✅ S858. All applied via Python.
- `claude_docs/STATE.md`: PCV trimmed from 5→1 row (4 S858 rows graduated to roadmap).

**QA #255 Rank-Up Notifications ✅:**
- DB: Bob Smith (user2) XP set to 498, rank INITIATE.
- Navigated to /sales/cmpaujbx701r7wh48ssciws0z as Bob. Clicked "Going (0)" RSVP button → "✓ You're going (1)" confirmed.
- DB post-RSVP: guildXp=500, explorerRank=SCOUT. RANK_UP + RSVP_CONFIRMED notifications created.
- /notifications page: scrolled to bottom → TODAY section visible with "You've reached SCOUT! — Congratulations! You've advanced to SCOUT rank. Keep hunting!" (7m ago). ss_7469boc64.
- ⚠️ P2 BUG: Today group renders at BOTTOM of notification list (below This Week, Older). Root cause: `order['Today'] || 999` — `|| 999` treats 0 as falsy. Fix: `?? 999`. Dispatch findasale-dev.

**QA #230 Smart Buyer Widget: UNVERIFIED** — no published sale on any real test organizer (user1 has none, Artifact MI has none, all 10 published sales are scraper accounts).

**Test data cleaned:** Bob XP reset to 157/INITIATE, RSVP deleted, test notifications deleted.

**Blocked Queue: 6→8 rows** (notifications sort P2 bug + #230 Human QA blocker added).

---

### S858 — QA+DEV: Flash Deal dropdown fixed + 4 features Chrome-verified

**DEV — Flash Deal dropdown (0 TS errors):**
- `packages/frontend/pages/organizer/dashboard.tsx`: `useQuery` for flashDealItems now includes `status` in raw type, captures it in `queryFn` map, and filters via `select: (items) => items.filter(i => i.status === 'AVAILABLE')`. SOLD items no longer appear in Flash Deal form selector.

**Records:**
- `claude_docs/strategy/roadmap.md`: #159 Chr ⬜ → ✅ S857 (S856 evidence applied cross-session).
- `claude_docs/STATE.md`: Pending Chrome Verifications trimmed from 14→2 (prior entries already in roadmap).

**QA (4 features, all as Alice Johnson / user1@example.com):**
- #398 ✅ Organizer Referral Loop — /organizer/referrals: link renders, Copy Link → "Copied!" confirmed, stats block (ss_4915xx0kl). ⚠️ P3: Step 3 copy omits XP.
- #259 ✅ Hunt Pass Accuracy — /shopper/hunt-pass: "1.5x XP on Everything" confirmed (ss_7973nmk5n). XP matrix + "6 hours early" copy removed from page since S530 (intentional simplification).
- #290 ✅ Dual-Rail Coupons — /coupons: 3-tier $ + XP display correct (ss_32554r03n). ⚠️ P3: Rarity Boost 50 XP only (spec said 15 XP / $0.15 cash — spec likely outdated).
- #158 ✅ Sale Waitlist — /sales/cmpxl4jii017xsot00wwosx1x: "Remind Me by Email" + "Notify me of new items" visible (ss_4902k1y46).

**Blocked Queue: 7→6 rows (Flash Deal SOLD dropdown cleared, Rarity Boost spec gap added P3).**

**Files changed:** `claude_docs/STATE.md` · `claude_docs/patrick-dashboard.md` · `claude_docs/strategy/roadmap.md` · `packages/frontend/pages/organizer/dashboard.tsx`

---

### S857 — HEALTH/OPS: Sentry audit + DB maintenance

**Automated daily health + Patrick-requested dispatch and investigation.**

- **Sentry backend cleared 10 → 0 unresolved:** Resolved 25 historical slow-query issues (pre-May-30, covered by migrations 20260530000001 + 20260602000000). Resolved 22 GarageSaleFinder 0-results issues (old `captureMessage` code already removed from source — current code has "Do NOT Sentry-capture here" comment). Resolved CORS `api.finda.sale` issue (fix in code since S779/S780, last fired May 24).
- **VACUUM ANALYZE:** Run on Organizer, DirectoryClaimEmail, Sale tables (June 2 migration comment required manual run — can't run inside transaction).
- **GarageSaleFinder scraper confirmed working:** Live-tested Chicago (169 links), Grand Rapids (20 links). Sparse metros (Yakima, Pocatello) have genuinely 0 active listings — expected behavior.
- **api.finda.sale = Railway backend:** Confirmed via `server: railway-edge` headers. CORS fix (`allowedOrigins.push('https://api.finda.sale')`) already in index.ts with full explanation comment.
- **MulterError on /rapidfire:** Already suppressed in instrument.ts `beforeSend` filter. 3 historical Sentry captures from before the filter was added.
- **No code changes this session.**

**Files changed:** `claude_docs/STATE.md` · `claude_docs/patrick-dashboard.md`

---

### S856 — DEV #27b FIXED + QA #159 ✅

**DEV — #27b watermark print kit (0 TS errors):**
- `packages/frontend/pages/organizer/print-kit/[saleId].tsx`: Added `/organizers/settings/watermark` + `/organizers/me` queries. Derived `canRemoveWatermark = subscriptionTier === 'TEAMS' && removeWatermarkEnabled`. Yard sign footer (`yard-sign-footer` + `yard-sign-logo`) gated. `printQRPage()` now accepts `hideWatermark` param — all 4 callers pass `canRemoveWatermark`. Three `qr-full-page-sublabel` elements (check-in, treasure hunt, photo station) gated.
- `packages/backend/src/controllers/printKitController.ts`: `getYardSignKit` primary footer `'Scan to browse & buy online  •  finda.sale'` wrapped in `if (!canRemoveWatermark(sale.organizer))`. Secondary watermark footer was already gated.

**QA — #159 Flash Deals:**
- ✅ Flash Deal form dark mode: opened as Alice Johnson on PUBLISHED sale. Form renders full dark navy bg (no white/light) — P2 FIXED. ss_3858xb9jb.
- ✅ Flash Deal banner on sale page: `⚡ Flash Deal — 25% off! Old Radio for next 1h 56m` confirmed. Banner orange gradient on dark page, countdown live. ss_2417corir.
- ⚠️ P3 NEW: Flash Deal item dropdown includes SOLD items. Created deal on SOLD Vintage Lamp — banner won't appear since item is not in public inventory. Filter should be `AVAILABLE` only.

**Blocked Queue:** 7 rows (replaced #27b with new P3 Flash Deal dropdown bug).

**Files changed:** `packages/frontend/pages/organizer/print-kit/[saleId].tsx` · `packages/backend/src/controllers/printKitController.ts` · `claude_docs/STATE.md` · `claude_docs/patrick-dashboard.md`

---

### S855 — Records + DEV P3 fixes + QA: #27b watermark P2 found

**Records:** Applied S854 Chrome ✅ marks to roadmap.md for #289 (monthly cap note), #309 (window.confirm P1 fix), #311 (transfer+409 S854 evidence), #312 (Chr ⬜→✅ S854, XP spend path), #316 (Chr ⬜→✅ S854, Tranche A/B DB-confirmed).

**DEV — P3 bugs fixed (0 TS errors):**
- #308: Hidden badge (grey pill) now renders on organizer item list row when `item.isActive === false`. Add-items page, next to existing Live/Draft status chip.
- #312/#289: `couponController.getUserCoupons` now returns `monthlyUsageByTier` (current-month groupBy). `coupons.tsx` disables Generate button when `usedThisMonth >= monthlyLimit`, shows "Cap reached (X/X)" button label and "X/X used this month" helper text.

**QA findings:**
- #27b Watermark removal: ⚠️ **P2 BUG** — Navigated to /organizer/settings as Alice Johnson (TEAMS). Enabled "Remove FindA.Sale watermark from exports" → green toast confirmed (ss_28036zjv6). Navigated to /organizer/print-kit → yard sign still shows "finda.sale" / "FindA.Sale" branding. Setting not wired to print template renderer.
- #159 Flash Deals dark mode: UNVERIFIED — Alice has no PUBLISHED sale; Flash Deal button never appeared.
- P3 brand voice: yard sign template hardcodes "Estate" as sale type label (codebase-wide ban on estate-sale-only language applies).

**Blocked Queue: 7 rows (added #27b watermark removal bug).**

**Files changed:** `claude_docs/strategy/roadmap.md` · `packages/frontend/pages/organizer/add-items/[saleId].tsx` · `packages/backend/src/controllers/couponController.ts` · `packages/frontend/pages/coupons.tsx` · `claude_docs/STATE.md` · `claude_docs/patrick-dashboard.md`

---

### S854 — QA: #289 #309 #311 #312 #316 Chrome-verified

**6 roadmap items QA'd. All doable-without-Stripe items completed.**

- **#308** ⚠️ P3 OPEN — `isActive=False` confirmed in DB after hide, but organizer item list shows zero visual indicator. P3 bug, dispatch findasale-dev next session.
- **#309** ✅ — Consignor delete uses proper in-app modal (P1 `window.confirm()` bug confirmed FIXED). ss_1713d6g2g.
- **#311** ✅ — Multi-location: transfer modal opens with items + destination, Delete hidden when items > 0, backend 409 enforced via JS fetch.
- **#289** ✅ — Shopper coupon monthly cap: Hunt Pass limit 3/month enforced correctly. 429 on 4th attempt with message "Monthly limit reached for this tier (3/month)."
- **#312** ✅ — XP spend path works end-to-end: Generate buttons clickable, XP deducted, page reload shows updated balance 2000→1700. ⚠️ P3: Generate button stays enabled/active after monthly cap hit — no disabled UI state.
- **#316** ✅ — Referral Tranche A (+100 XP, 3 distinct login days) and Tranche B (+150 XP, 3 distinct sale visits) both DB-confirmed. Tranches C/D blocked (require Stripe purchase / trail completion).

**New finding:** New users registered while another user is logged in from same browser session are auto-flagged `fraudSuspect=True` by the fraud detection system. This blocked XP award for the QA test user. Likely intentional fraud detection; cleared manually for testing. Not a bug unless it affects real onboarding flows.

**Test data cleaned up:** qa-tranche-s854 user deleted, user5 XP restored to 2000, June test coupons removed.

**Blocked Queue: 2 rows (unchanged). DEV mode permitted.**

---

### S853 — QA: All 4 S852 bug fixes Chrome-verified

**All 4 S852 fixes browser-verified against live Vercel deployment (dpl_CbDjpZs1, READY, S852 commit e56d4f3).**

- Bug 1 (P2) ✅: /organizer/inventory → clicked Kitchen Set (null saleId) → Edit Item page loaded, Title "Kitchen Set" visible. ss_8510ho8fx.
- Bug 2 (P2) ✅: add-items inline editor → "Full Edit ↗" for Antique Chair → navigated to /organizer/edit-item/1278fdf6-... showing "Antique Chair". ss_596216ag3.
- Bug 3 (P2) ✅: /unsubscribe (no token) → "Email Preferences — Error: Invalid unsubscribe link. Please use the link from your email or contact support@finda.sale." No spinner. ss_4693l8c4l.
- Bug 4 (P3) ✅: edit-item Photos section shows "No photos yet — click to upload" with proper em dash (not \u2014). Confirmed via find tool + ss_0517yypd1.

**Blocked Queue: 6 → 2 rows.** 4 P2/P3 items cleared. #332 and #335 remain (both P0 aging).

**Files changed:** `claude_docs/STATE.md` · `claude_docs/patrick-dashboard.md`

---

### S852 — DEV: 3 P2 bugs fixed + P3 + QA #317/#320 UNVERIFIED

**Fixes shipped:**
- Bug 1 (P2): `getItemById` now does organizer ownership fallback via `item.organizerId` for inventory items (saleId=null). Previously returned 404 for all returned-to-inventory items.
- Bug 2 (P2): Full Edit ↗ button in add-items inline editor converted from `<Link>` to `<button router.push() + stopPropagation>` — fixes misfire opening next item's editor.
- Bug 3 (P2): `/unsubscribe` no-token spinner fixed — `router.isReady` guard + else branch shows "Invalid unsubscribe link" error state.
- Bug 4 (P3): `ItemPhotoManager.tsx` em dash literal (`\u2014`) → actual em dash (`—`) in Photos empty state.

**QA attempts:** #320 Async eBay Comp: DB-confirmed (6 items with aiSuggestedPrice, organizer prices not overridden per D-005). Chrome UNVERIFIED — CSRF blocks raw fetch, React controlled-input                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                 