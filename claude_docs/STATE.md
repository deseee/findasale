# PROJECT STATE

Sections: §Current Status | §Pool Audit Findings | §Blocked Queue | §Recent Sessions | §Next Session

FindA.Sale is a two-sided marketplace PWA for secondary sale organizers (estate sales, yard sales, auctions, flea markets, consignment) connecting them with shoppers. Backend: Node.js/Prisma/PostgreSQL on Railway. Frontend: Next.js on Vercel.

---

## Current Status

**Latest: S856 — DEV: #27b FIXED — print-kit yard sign + printQRPage popups now respect canRemoveWatermark (frontend preview + backend PDF primary footer both gated). New P3: Flash Deal dropdown shows SOLD items in item selector. QA: #159 ✅ Chrome-verified — FlashDealBanner dark mode correct (orange gradient on dark bg, no white/light — P2 FIXED), countdown "Old Radio for next 1h 56m" confirmed on sale page (ss_2417corir); form dark mode confirmed ss_3858xb9jb. Blocked Queue: 7 rows.**

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
_⚠️ P0 AGING: #332 at 58 sessions; #335 at 58 sessions — mandatory P0 per CLAUDE.md §10a. S853: 4 P2/P3 bugs (S851 queue) Chrome-verified and cleared._

| Feature | Reason | What's Needed | Session Added |
|---------|--------|---------------|---------------|
| #332 Shopify Cross-Listing | **P0 (58 sessions)** — Requires Shopify OAuth; no test store available | Create free Shopify Partners dev store, connect via OAuth | S791 |
| #335 Consignor Payout Email | **P0 (58 sessions)** — Payout ran S845. SPF fixed S846. Patrick must check deseee@yahoo.com — if email received → ✅ after 58 sessions. | Check deseee@yahoo.com for Jane Thrift payout email. If received → ✅. | S791 |
| Flash Deal SOLD items in dropdown | **P3** — Flash Deal form item selector shows SOLD items (Vintage Lamp status=SOLD appeared in dropdown alongside AVAILABLE items). Organizer can create a deal on a sold item — deal creates in DB but banner can't show (item not in public inventory). | Dispatch findasale-dev: filter FlashDealForm item selector to AVAILABLE items only | S856 |
| Email Verification Migration | **P0 (132 sessions, age-escalated 2026-06-03)** — Migration 20260515180000 exists in migrations/ but no prisma migrate deploy recorded S726–S854. Token expiry not enforced in prod DB. | Patrick: cd packages/database && $env:DATABASE_URL="[Railway]" && npx prisma migrate deploy && npx prisma generate | S726 |
| Production DB Re-Seed | **P0 (67 sessions, age-escalated 2026-06-03)** — Seedy2025! rejected for shopper accounts user5–user12+ since S576. Shopper Chrome QA requiring login blocked. | Patrick: cd packages/database && $env:DATABASE_URL="[Railway]" && npx prisma db seed (back up sale cmpbvumj90001e7t7v5sa1iqi first) | S787 |
| eBay Connection for user1 | **P0 (69 sessions, age-escalated 2026-06-03)** — No eBay OAuth on organizer QA account. Blocks #293, #298, all eBay push QA. | Patrick: connect eBay to user1 at /organizer/settings/ebay via OAuth | S785 |
| Bing Webmaster Sitemap | **P0 (71 sessions, age-escalated 2026-06-03)** — Bing/DuckDuckGo not receiving sitemap pings. SEO gap. | Patrick: bing.com/webmasters → Add sitemap → finda.sale/server-sitemap.xml | S783 |

---

## Pending Chrome Verifications

| # | Feature | Evidence | Session |
|---|---------|----------|---------|
| 303 | Photo Station Shopper Page | /sales/cmpbvumj90001e7t7v5sa1iqi/photo-station as user5 (Leo Thomas). Page loads ✅ ss_65158fo38. "Share Your Find" + "Location Access Required" gate expected post-#317 geofencing. XP award + Already Scanned state UNVERIFIED (requires real GPS). | S839 |
| 461 | FB Marketplace Export + Sold Nudge | finda.sale/organizer/promote/0d9563f9-... as Alice Johnson (user1). Clicked "Download Spreadsheet" → GET /api/export/.../facebook-xlsx 200 ✅. DB confirmed fbExportedAt stamped on 3 items. Navigated to edit-item/b4a74f89-... → set status=SOLD → saved → redirected to dashboard. Notification inbox at finda.sale/notifications showed "Mark sold on Facebook Marketplace" / "Silver Bracelet sold on FindA.Sale — don't forget to mark it sold on Facebook Marketplace too" — just now ✅. | S844 |
| 68 | Command Center Dashboard | finda.sale/organizer/command-center as Alice Johnson. Recent tab clicked → "QA Test Flip Report Sale" with ● ENDED badge, May 21–May 28 dates visible. Tabs (Active/Upcoming/Recent/All) all work. Active tab empty state correct. ss_7321prqsa. Independent re-verification of S804 claim. | S845 |
| 125 | Inventory Syndication CSV Export | finda.sale/organizer/add-items/... as Alice Johnson (PRO). "Export to eBay" button clicked → modal opened: "Export 2 available items as eBay CSV", watermark toggle ✅, "Remove watermark — TEAMS only" gate visible. ss_5085g9dtj. Independent re-verification of S805 claim. | S845 |
| 91 | Auto-Markdown (Smart Clearance) | finda.sale/organizer/markdown-cycles as Alice Johnson (user1). /api/markdown-cycles GET 200 (no 403 — tier fix confirmed). Clicked 'Create your first cycle', filled Days=5 %=10. POST /api/markdown-cycles → 201. '5 days: 10% off' card rendered with Active badge. ss_8165qwvge ss_1962w2cmm | S850 |
| 32 | Shopper Wishlist Alerts + Smart Follow | finda.sale/shopper/wishlist as Leo Thomas (user5). Watching section rendered with 'Antiques Test' alert (Category: antiques, Active badge). Operator precedence fix confirmed. ss_8348w7ewi | S850 |
| 267 | RSVP Bonus XP Cap | RSVP #5 to finda.sale/sales/cmpxl4jii017xsot00wwosx1x as Leo Thomas → POST /api/sales/.../rsvp 200 → DB confirmed PointsTransaction +2 XP (total=10). RSVP #6 to FORTY YEARS OF TREASURES → POST 200 → NO PointsTransaction (cap enforced, 0 XP). DB-confirmed. ss_964678bs1 ss_049890h4o | S850 |
| SC | Share-card 401 fix | finda.sale/organizer/promote/0d9563f9-... as Alice Johnson. Page loads ✅. fetch /api/share-card?... credentials:include → 200 image/png (no 401). Share Card section renders with theme/format pickers. ss_1053f6yd7 ss_63157cn5o | S850 |
| 293 | eBay Listing Data Parity | finda.sale/organizer/sales/0d9563f9-... as Alice Johnson (S850 re-verify). PostSaleEbayPanel loaded: '2 items didn't sell — list on eBay?'. Old Radio + Ceramic Vase with Edit eBay + Classify buttons visible. API GET /api/ebay/organizer/sales/.../unsold-items → 200 confirmed (S849). ss_85819up9q ss_832940555 | S850 |
| 309 | Consignor Portal Delete | finda.sale/organizer/consignors as Alice Johnson (user1). Added consignor, clicked Delete → in-app modal appeared (NOT window.confirm). Confirmed → "Consignor deleted" toast, list cleared. ss_1713d6g2g (P1 window.confirm bug confirmed FIXED) | S854 |
| 311 | Multi-Location Transfer + 409 | finda.sale/organizer/locations as Alice Johnson. Transfer modal opened showing item + destination dropdown ✅. DELETE with items → backend returned 409 "Location has assigned items or sales. Reassign them first." UI hides Delete button when items > 0 ✅. ss_1244f5bhu | S854 |
| 289 | Shopper Coupon Monthly Cap | POST /api/coupons/generate-from-xp as user5 (Leo Thomas, Hunt Pass active). Attempts 1-3: 200, codes 10AEDC3E/0C52C6BE/AFFF3CAC generated (3/3 Hunt Pass limit). Attempt 4: 429 "Monthly limit reached for this tier (3/month). Try a different tier or come back next month." DB-confirmed 3 coupons. | S854 |
| 312 | XP Spend Path | finda.sale/coupons as user5. XP Store page loads, 3 tiers visible, Generate buttons present. Spent 300 XP (3×100). Page reload shows 2,000→1,700 XP ✅ ss_4903pjd48. Hunt Pass "Bonus Coupon Slots" shown. ⚠️ P3: Generate button stays enabled after cap hit (no disabled UI state). | S854 |
| 316 | Referral Tranche Anti-Fraud | Registered qa-tranche-s854@example.com with user5 ref code REF-419CCE51. Tranche A: seeded loginsOnDistinctDays=2, then backend /api/auth/login 200 → DB confirmed loginsOnDistinctDays=3, trancheAReleasedAt=2026-06-03T07:13:52, REFERRAL_TRANCHE_A +100 XP to user5 (1720→1820). Tranche B: seeded 2 visits, POST /api/sales/cmpxo2stv.../visit 200 → DB confirmed distinctSalesVisited=[3 IDs], trancheBReleasedAt=2026-06-03T07:18:46, REFERRAL_TRANCHE_B +150 XP to user5 (1820→1970). Both tranches fire correctly. C/D blocked (Stripe/trail required). | S854 |

---

## Next Session

**S856 done. Blocked Queue: 7 rows. DEV mode permitted (< 8).**

1. **Fix Flash Deal SOLD-item dropdown** (`Skill('findasale-dev')`): FlashDealForm item selector shows SOLD items. Filter query to AVAILABLE only. File: `packages/frontend/pages/organizer/dashboard.tsx` — find where saleItems are passed to FlashDealForm and add status filter.
2. **Apply #159 Chr ✅ to roadmap** — Records: update Chr column → ✅ S856 (ss_2417corir).
3. **#317/#320** — Still UNVERIFIED. Defer.
4. **#335 payout** — Patrick check deseee@yahoo.com.
5. **#332 Shopify** — Blocked on dev store.
6. **4 P0 Patrick-action items** in Blocked Queue: Email Verification Migration, DB Re-Seed, eBay Connection, Bing Sitemap.

**Blocked Queue: 7 rows. DEV mode permitted.**

**Patrick actions required:**

1. **Check deseee@yahoo.com** — Jane Thrift payout email (#335). If received → ✅.
2. **Delete test invite SVPKNKV3:** finda.sale/admin/invites → Delete SVPKNKV3.
3. **GBP phone verification:** business.google.com → "Verify now" → phone code.
4. **Push S856 fixes + docs:**
```
git add claude_docs/STATE.md
git add claude_docs/patrick-dashboard.md
git add packages/frontend/pages/organizer/print-kit/[saleId].tsx
git add packages/backend/src/controllers/printKitController.ts
git commit -m "fix: #27b print-kit canRemoveWatermark gates frontend preview + backend PDF footer; docs: S856 wrap"
.\push.ps1
```

## Recent Sessions

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

**QA attempts:** #320 Async eBay Comp: DB-confirmed (6 items with aiSuggestedPrice, organizer prices not overridden per D-005). Chrome UNVERIFIED — CSRF blocks raw fetch, React controlled-input blocks null-price save via DOM. `aiSuggestedPrice` not in `getItemById` select. #317 Geofence QR: Frontend graceful fallback code-confirmed (`catch` → proceed without coords). Chrome UNVERIFIED — test clues in DB return "not found" from API (no linked items/hunt configured).

**TypeScript:** 0 errors frontend, 0 errors backend.

**Files changed:** `packages/backend/src/controllers/itemController.ts` · `packages/frontend/pages/organizer/add-items/[saleId].tsx` · `packages/frontend/pages/unsubscribe.tsx` · `packages/frontend/components/ItemPhotoManager.tsx` · `claude_docs/STATE.md` · `claude_docs/patrick-dashboard.md`

---

### S851 — QA PASS + Records housekeeping

**Records:** Applied S850 Chrome ✅ marks to roadmap.md for #91, #32, #267, #293, and share-card 401 fix (#33). Fixed stale #316 status (both occurrences) from "Pending push + migration" → "Shipped S552/S735 — code + migration live." Fixed #206 to note intentional redirect to /faq.

**QA verified:** #334 Automatic Markdown Cycles ✅ (post-S849 tier fix confirmed, no 403, cycle card renders — ss_78175awmd). #280 Condition Rating XP ✅ (conditionGrade B set on Old Radio, reloaded persists, XP 93→98 +5 confirmed via Organizer Special widget — ss_5053gn0a0, ss_2855apltb). #206 confirmed intentional redirect to /faq per condition-guide.tsx router.replace call.

**4 new bugs discovered and queued:**
- P2: edit-item shows "Item not found" for returned-to-inventory items (saleId=null) — all 3 inventory items affected
- P2: add-items inline editor "Full Edit ↗" button opens next item's editor instead of navigating to edit-item page
- P2: /unsubscribe without ?token= shows infinite spinner — no error state
- P3: \u2014 unicode escape renders literally in edit-item Photos empty state

**Files changed:** `claude_docs/STATE.md` · `claude_docs/patrick-dashboard.md` · `claude_docs/strategy/roadmap.md`

---

### S850 — QA BLITZ: #91 ✅ #32 ✅ #267 ✅ share-card ✅ #293 ✅

**All 4 S849 fixes Chrome-verified.** #91 Auto-Markdown: POST /api/markdown-cycles → 201, '5 days: 10% off' cycle rendered (ss_8165qwvge ss_1962w2cmm). #32 Wishlist Alerts: Watching section renders with Antiques Test alert, Active badge visible (ss_8348w7ewi). Share-card: fetch credentials:include → 200 image/png confirmed, no 401 (ss_1053f6yd7 ss_63157cn5o). #267 RSVP cap: seeded 4 RSVP txns (8 XP) via psycopg2, RSVP #5 Chrome → +2 XP (→10, cap hit), RSVP #6 Chrome → 0 XP DB-confirmed (ss_964678bs1 ss_049890h4o). #293 re-screenshot: PostSaleEbayPanel loaded with 2 items, Edit eBay buttons visible (ss_85819up9q ss_832940555). Roadmap: #68 Chr ✅ S845 + #125 Chr ✅ S845 applied. Blocked Queue: 6→2 rows.

**Files changed:** `claude_docs/STATE.md` · `claude_docs/patrick-dashboard.md` · `claude_docs/strategy/roadmap.md`

---

### S849 — QA + DEV BLITZ: #293 ✅, #91 P0 fixed, #32 P1 fixed, share-card fixed

**5 parallel dispatches.** #293 Chrome-verified (no ss_ IDs — roadmap update deferred). #267 DB-confirmed still blocked (max 4 RSVPs in any month, cap threshold never reached). Share-card 401 fixed (cookie-first auth in edge function). #91 P0 root cause: markdownCycleController read UserRoleSubscription instead of Organizer.subscriptionTier — all non-Stripe organizers got 403. Fixed via requireTier middleware. #32 P1 root cause: operator precedence bug (`||` before `&&`) caused Watching section to never render when alerts existed. One-line fix.

**New bugs found:** #32 alert DELETE returns 403 (P2 — separate from rendering fix). Share-card public/auth question needs product decision.

**Files changed:** `packages/frontend/pages/api/share-card.tsx` · `packages/backend/src/routes/markdownCycles.ts` · `packages/backend/src/controllers/markdownCycleController.ts` · `packages/frontend/pages/organizer/markdown-cycles.tsx` · `packages/frontend/pages/shopper/wishlist.tsx` · `claude_docs/STATE.md` · `claude_docs/patrick-dashboard.md`

---

### S848 — EMAIL SYSTEM AUDIT + COMPREHENSIVE FIX

**Full audit completed.** Every email-sending service in the backend audited. Incident confirmed stopped — no runaway sends in Railway logs. Two previously unknown P0 blast-to-all jobs discovered and fixed.

**Global daily quota counter built (`emailService.ts`):** Every send now logs `[EmailService] Send #N today (jobName → recipient)`. Threshold warnings at 1,500/1,800/1,950 via console.error in Railway logs. `getDailyEmailCount()` exported for future admin route. No more flying blind.

**Fixes applied (10 files):**
- `outreachEmailsCron.ts` — DB-backed cross-run dedup (in-memory Set left duplicate-address rows vulnerable across 4-hour windows)
- `weeklyEmailService.ts` (Sunday 6pm) — `notificationPrefs.emailWeeklyDigest` opt-out + suppression check
- `notificationController.ts` (Friday 9am) — 