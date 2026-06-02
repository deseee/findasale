# PROJECT STATE

Sections: §Current Status | §Pool Audit Findings | §Blocked Queue | §Recent Sessions | §Next Session

FindA.Sale is a two-sided marketplace PWA for secondary sale organizers (estate sales, yard sales, auctions, flea markets, consignment) connecting them with shoppers. Backend: Node.js/Prisma/PostgreSQL on Railway. Frontend: Next.js on Vercel.

---

## Current Status

**Latest: S844 — DEV+QA: #461 ✅ fully Chrome-verified end-to-end. S831 fix: apiBase changed to /api proxy (SameSite=Lax was blocking cookies on direct Railway URL). Export 200, fbExportedAt stamped, SOLD saved, nudge "Mark sold on Facebook Marketplace" visible in inbox. #27b ✅ applied to roadmap. Share-card 401 on promote page found (new P2). Blocked Queue: 4 rows.**

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
_⚠️ P0 AGING (S844): #267, #293 at 59 sessions; #332, #335 at 53 sessions — mandatory P0 per CLAUDE.md §10a. All structurally blocked by external dependencies._

| Feature | Reason | What's Needed | Session Added |
|---------|--------|---------------|---------------|
| RSVP XP Monthly Cap (#267 part 2) | **P0 (59 sessions)** — Only 3 platform sales have RSVP; need 5 RSVPs in one month to hit 10 XP cap | Create platform sales with RSVP enabled or wait for organic usage | S785 |
| #293 eBay Listing Data Parity | **P0 (59 sessions)** — PostSaleEbayPanel requires eBay connection + completed ENDED sale with items | Manually end a test sale in DB (UPDATE Sale SET status='ENDED'), connect eBay to user1, test 17-field panel | S785 |
| #332 Shopify Cross-Listing | **P0 (53 sessions)** — Requires Shopify OAuth; no test store available | Create free Shopify Partners dev store, connect via OAuth | S791 |
| #335 Consignor Payout Email | **P0 (53 sessions)** — CODE-VERIFIED S791: sendConsignorPayout() called. Email delivery unverified | Run payout against real email address, check inbox | S791 |
| Share-card preview 401 on promote page | **P2 S844** — `GET /api/share-card/...` returns 401 immediately on page load. Separate from export fix. | `findasale-dev`: investigate share-card endpoint auth — likely same cross-domain cookie issue or missing auth header | S844 |

---

## Pending Chrome Verifications

| # | Feature | Evidence | Session |
|---|---------|----------|---------|
| 303 | Photo Station Shopper Page | /sales/cmpbvumj90001e7t7v5sa1iqi/photo-station as user5 (Leo Thomas). Page loads ✅ ss_65158fo38. "Share Your Find" + "Location Access Required" gate expected post-#317 geofencing. XP award + Already Scanned state UNVERIFIED (requires real GPS). | S839 |
| 461 | FB Marketplace Export + Sold Nudge | finda.sale/organizer/promote/0d9563f9-... as Alice Johnson (user1). Clicked "Download Spreadsheet" → GET /api/export/.../facebook-xlsx 200 ✅. DB confirmed fbExportedAt stamped on 3 items. Navigated to edit-item/b4a74f89-... → set status=SOLD → saved → redirected to dashboard. Notification inbox at finda.sale/notifications showed "Mark sold on Facebook Marketplace" / "Silver Bracelet sold on FindA.Sale — don't forget to mark it sold on Facebook Marketplace too" — just now ✅. | S844 |

---

## Next Session

**Blocked Queue: 4 rows (well below ≥8 ceiling — dev sessions clear). All 4 are P0 aging (structurally blocked by external deps) + 1 new P2.**

**S844 complete.** #461 ✅ fully Chrome-verified. #27b ✅ applied to roadmap. Share-card 401 is new P2.

**Patrick actions required:**

1. **Delete test invite SVPKNKV3:** finda.sale/admin/invites → Delete SVPKNKV3.

2. **GBP phone verification:** business.google.com → "Verify now" → phone code.

3. **#239 legal gate:** Attorney + CPA before live consignor payouts.

**Dispatch stubs (next session):**

1. **DEV: Share-card 401 (P2):** `Skill('findasale-dev')` → investigate `GET /api/share-card/...` returning 401 on promote page load. Likely same-origin cookie issue or endpoint auth misconfiguration. Expected output: share card preview loads for organizers on promote page + push block.

2. **QA backlog:** #32 Shopper Wishlist Alerts, #68 Command Center, #91 Auto-Markdown, #125 Inventory CSV Export.

3. **P0 aging quick-win:** #335 Consignor Payout Email — run a test payout against deseee@yahoo.com, check inbox. #293 — UPDATE Sale status='ENDED' via psycopg2, then QA eBay panel.

---

## Recent Sessions

### S844 — DEV+QA: #461 ✅ Chrome-verified end-to-end, #27b ✅ roadmap applied, share-card P2 found

**Root cause corrected:** STATE.md S843 misdiagnosed #461 blocker as `localStorage.getItem('token')`. Actual bug: `apiBase = process.env.NEXT_PUBLIC_API_URL` — direct Railway URL is cross-domain, SameSite=Lax blocks the `accessToken` cookie. Fix: `const apiBase = '/api'` (1-line change to `promote/[saleId].tsx:324`). Next.js fallback proxy already wired (`/api/:path*` → Railway).

**#461 ✅ Chrome-verified:** Navigated to finda.sale/organizer/promote/0d9563f9-... as Alice Johnson (user1@example.com). Clicked "Download Spreadsheet" → `GET /api/export/.../facebook-xlsx` → **200**. DB confirmed `fbExportedAt` stamped on 3 items (psycopg2). Navigated to edit-item/b4a74f89 (Silver Bracelet), set status → SOLD, saved → redirected to dashboard. Notification inbox showed **"Mark sold on Facebook Marketplace" / "Silver Bracelet sold on FindA.Sale — don't forget to mark it sold on Facebook Marketplace too."** — unread, just now.

**#27b ✅ applied:** roadmap.md Chrome column updated (evidence: ss_4410s6brw, S843). Removed from Pending Chrome Verifications.

**New P2:** Share-card preview endpoint returns 401 on promote page load (fires before any user interaction). Separate from export fix. Added to Blocked Queue.

**Note on QA account confusion:** user1@example.com = Alice Johnson (admin+organizer, owns the QA sale). user2@example.com = Bob Smith. Session spent significant time on auth due to wrong account. Seed account reference: user1=Alice Johnson, user2=Bob Smith. Sale `0d9563f9-...` belongs to user1.

**Files changed:** `packages/frontend/pages/organizer/promote/[saleId].tsx` · `claude_docs/STATE.md` · `claude_docs/patrick-dashboard.md` · `claude_docs/strategy/roadmap.md`

---

### S843 — QA: #27b ✅ iCal watermark verified, #461 UNVERIFIED, P2 downloadFile bug found

**#27b ✅ Chrome-verified:** Fetched /api/sales/0d9563f9-4fcd-4630-8beb-189ea58c8118/calendar.ics in Chrome as Alice Johnson (Kelly's Estate Sales, SIMPLE tier). DESCRIPTION field confirmed: ends with `\n\nShared via FindA.Sale — finda.sale`. canRemoveWatermark()=false for SIMPLE → footer appended. ss_4410s6brw ss_0944l9m2y. Added to Pending Chrome Verifications for records to apply next session.

**#461 UNVERIFIED:** Fix code is correct (CODE-ONLY). Blocker: `downloadFile` in promote/[saleId].tsx uses `localStorage.getItem('token')` — returns null since cookie auth migration (P0 security fix). Export endpoint returns 401, fbExportedAt never stamped. QA can't complete until downloadFile is fixed.

**P2 bug found:** All promote-page exports (FB Marketplace XLSX/JSON, EstateSales.NET CSV, Craigslist TXT) broken for ALL production users. `downloadFile` sends `Authorization: Bearer null`. Added to Blocked Queue. Root cause: stale localStorage JWT pattern, fix is trivial (credentials:'include' + CSRF header).

**Files changed:** `claude_docs/STATE.md` · `claude_docs/patrick-dashboard.md`

---

### S842 — DEV: #461 FB nudge fix + #27b iCal watermark fix + Records roadmap scan

**#461 Fix written:** `itemController.ts` line 34 — import `notifyFacebookExportedItemSold`. Lines 1278-1283 — nudge fires on `status === 'SOLD' && item.status !== 'SOLD' && item.fbExportedAt`. Fire-and-forget `.catch()`. Matches bulk handler pattern (items.ts:431). 0 TS errors. Awaiting push + Chrome QA.

**#27b Fix written:** `saleController.ts` line 16 — import `canRemoveWatermark`. Line 1091 — organizer select extended with `removeWatermarkEnabled`. Lines 1107-1108 — footer `\n\nShared via FindA.Sale — finda.sale` appended unless `canRemoveWatermark()` returns true. Matches marketingKitController/printKitController pattern. 0 TS errors. Awaiting push + Chrome QA.

**Records S842:** Roadmap #193 wishlists Chr ✅ applied (ss_1258kvk8e ss_839591msq, S841 evidence). P0 aging violations: #267/#293 (S785, 57 sessions), #332/#335 (S791, 51 sessions). 14-item testable QA backlog identified (top 5: #32, #68, #73, #91, #125).

**Files changed:** `packages/backend/src/controllers/itemController.ts` · `packages/backend/src/controllers/saleController.ts` · `claude_docs/strategy/roadmap.md` · `claude_docs/STATE.md` · `claude_docs/patrick-dashboard.md`

---

### S841 — QA: #321 wishlists ✅, #461 P2 bug, #27b P2 bug

**#321 wishlists fix Chrome-verified:** Navigated directly to finda.sale/wishlists as Leo Thomas (user5). Hub loaded with 2 collections (Vintage Jewelry, Mid-Century Modern Hunt). No redirect to /login. Fix confirmed deployed. ss_1258kvk8e ss_839591msq

**#461 ⚠️ P2 bug confirmed:** `notifyFacebookExportedItemSold()` only wired to bulk PATCH (items.ts:431) — NOT to single-item `updateItem` (itemController.ts). Marked Antique Chair AVAILABLE→SOLD via edit-item, zero notifications fired in Alice's inbox.

**#27b ⚠️ P2 bug confirmed:** `generateIcal()` has no watermark logic. Live `.ics` fetch confirmed description ends at `View items online: [url]` — no footer. Print Kit PDF watermark CODE-CONFIRMED (printKitController.ts:326).

**Files changed:** `claude_docs/STATE.md` · `claude_docs/patrick-dashboard.md`

---

### S840 — Records + QA: STATE.md cleanup, wishlists P2 fix

**Records:** STATE.md trimmed 369→136 lines. Roadmap: #321 Claude QA ✅ applied, #464 UTM drift fixed (BROKEN→FIXED S836), #340 CODE-VERIFIED noted.

**Wishlists QA:** /shopper/wishlist in-app nav ✅, Sellers tab ✅. /wishlists hard nav → redirected to /login ❌ P2 confirmed. Fix: wishlists.tsx authLoading guard added, 0 TS errors. DEPLOYED. ss_5165fdf0j ss_30826q1k8 ss_2960t250m ss_2592nh65t

**Files changed:** `claude_docs/STATE.md` · `claude_docs/patrick-dashboard.md` · `claude_docs/strategy/roadmap.md` · `packages/frontend/pages/wishlists.tsx`

---

### S839 — QA: S837 nav links, #321, #303, #317, #340

**S837 nav links verified:** /organizer/referrals ✅, /organizer/markdown-cycles ✅, /organizer/starter-kit ✅, /ai-score ✅, /challenges ✅, /surprise-me ✅, /notifications consolidated ✅.

**#321 ✅** — /admin/encyclopedia: 57 Awaiting Review, 20 Published, 77 Total. ss_0551gs4p3 ss_01850j1g8. **#303 ⚠️** — page loads, GPS-gated. **#317/#340 CODE-VERIFIED.**

**Files changed:** `claude_docs/STATE.md` · `claude_docs/patrick-dashboard.md` · `claude_docs/strategy/roadmap.md`

---

### S838 — QA: #165, #61, #36, #72, #308, #25

**#165 ⚠️** P3: stub Clear button. **#61 ✅** NudgeBar, STREAK_CONTINUATION. **#36 CODE-ONLY** weeklyEmailJob cron confirmed. **#72 ✅** dual-role nav zero dups. **#308 ⚠️** hide fires isActive:false, no Hidden indicator. **#25 ✅ Patrick-confirmed** eBay Sync Phase B/C + Pull to Sale.

**Files changed:** `claude_docs/STATE.md` · `claude_docs/patrick-dashboard.md` · `claude_docs/strategy/roadmap.md`

---

_Older sessions archived. S837 and earlier: see git log._
