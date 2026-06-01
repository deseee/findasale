# PROJECT STATE

Sections: §Current Status | §Pool Audit Findings | §Blocked Queue | §Recent Sessions | §Next Session

FindA.Sale is a two-sided marketplace PWA for secondary sale organizers (estate sales, yard sales, auctions, flea markets, consignment) connecting them with shoppers. Backend: Node.js/Prisma/PostgreSQL on Railway. Frontend: Next.js on Vercel.

---

## Current Status

**Latest: S842 — DEV+Records: #461 fix written (FB nudge wired to itemController.ts updateItem, 0 TS errors). #27b fix written (iCal watermark footer via canRemoveWatermark() in generateIcal(), 0 TS errors). Roadmap: #193 wishlists ✅ applied (S841 evidence). Records scan: 4 P0 aging violations flagged, 14-item testable QA backlog identified. Blocked Queue: 6 rows. Awaiting push + Chrome QA.**

**Previous: S841 — QA: #321 wishlists hard-nav ✅ Chrome-verified (ss_1258kvk8e ss_839591msq). #461 ⚠️ P2 BUG — FB nudge not wired to single-item PUT (only bulk PATCH). #27b ⚠️ P2 BUG — iCal watermark footer missing from generateIcal(). Blocked Queue: 6 rows (2 new P2 bugs added).**

**Previous: S840 — Records cleanup + QA: STATE.md trimmed (369→136 lines), #321 ✅ applied to roadmap, #464 UTM drift fixed, #340 CODE-VERIFIED noted. Wishlists flow QA: /shopper/wishlist in-app nav ✅, Sellers tab ✅, /wishlists P2 bug confirmed ❌ + FIXED (wishlists.tsx: authLoading guard added, 0 TS errors). Fix deployed. Blocked Queue: 4 rows.**

**Previous: S839 — QA: S837 nav links all verified, #321 ✅ Encyclopedia Auto-Gen, #317 CODE-VERIFIED, #340 CODE-VERIFIED, #303 PASS WITH NOTES. P2 found: /wishlists auth guard missing isLoading check. Blocked Queue: 4 rows.**

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
_⚠️ P0 AGING (S842): #267, #293 at 57 sessions; #332, #335 at 51 sessions — mandatory P0 per CLAUDE.md §10a. All structurally blocked by external dependencies._

| Feature | Reason | What's Needed | Session Added |
|---------|--------|---------------|---------------|
| RSVP XP Monthly Cap (#267 part 2) | **P0 (57 sessions)** — Only 3 platform sales have RSVP; need 5 RSVPs in one month to hit 10 XP cap | Create platform sales with RSVP enabled or wait for organic usage | S785 |
| #293 eBay Listing Data Parity | **P0 (57 sessions)** — PostSaleEbayPanel requires eBay connection + completed ENDED sale with items | Manually end a test sale in DB (UPDATE Sale SET status='ENDED'), connect eBay to user1, test 17-field panel | S785 |
| #332 Shopify Cross-Listing | **P0 (51 sessions)** — Requires Shopify OAuth; no test store available | Create free Shopify Partners dev store, connect via OAuth | S791 |
| #335 Consignor Payout Email | **P0 (51 sessions)** — CODE-VERIFIED S791: sendConsignorPayout() called. Email delivery unverified | Run payout against real email address, check inbox | S791 |
| #461 FB Nudge — single-item path | Fix written S842: nudge added to `itemController.ts` updateItem — fires on SOLD transition when fbExportedAt set. 0 TS errors. | Push then Chrome-verify: mark item SOLD via edit-item, confirm nudge fires | S841 |
| #27b iCal watermark footer | Fix written S842: `canRemoveWatermark()` check + footer added to `generateIcal()` (saleController.ts). 0 TS errors. | Push then Chrome-verify: download .ics from sale, confirm footer appears | S841 |

---

## Pending Chrome Verifications

| # | Feature | Evidence | Session |
|---|---------|----------|---------|
| 303 | Photo Station Shopper Page | /sales/cmpbvumj90001e7t7v5sa1iqi/photo-station as user5 (Leo Thomas). Page loads ✅ ss_65158fo38. "Share Your Find" + "Location Access Required" gate expected post-#317 geofencing. XP award + Already Scanned state UNVERIFIED (requires real GPS). | S839 |

---

## Next Session

**Blocked Queue: 6 rows (below ≥8 ceiling — dev sessions clear). 4 are P0 aging (structurally blocked by external deps).**

**S842 complete.** DEV: #461 + #27b fixes written, 0 TS errors. Records: wishlists ✅ applied to roadmap. Push required before QA.

**Patrick actions required:**

1. **Push block for S842 (5 files):**
   ```powershell
   cd C:\Users\desee\ClaudeProjects\FindaSale
   git add packages/backend/src/controllers/itemController.ts
   git add packages/backend/src/controllers/saleController.ts
   git add claude_docs/strategy/roadmap.md
   git add claude_docs/STATE.md
   git add claude_docs/patrick-dashboard.md
   git commit -m "fix: #461 FB nudge wired to single-item updateItem; #27b iCal watermark footer added to generateIcal()"
   .\push.ps1
   ```

2. **Delete test invite SVPKNKV3:** finda.sale/admin/invites → Delete SVPKNKV3.

3. **GBP phone verification:** business.google.com → "Verify now" → phone code.

4. **#239 legal gate:** Attorney + CPA before live consignor payouts.

**Dispatch stubs (next session — after push + Railway deploy):**

1. **QA #461 post-push:** Navigate as Artifact MI (user1), edit an item with fbExportedAt set, change status → SOLD. Check organizer notification inbox for FB nudge. (Or: mark SOLD via edit-item page for any previously FB-exported item.)

2. **QA #27b post-push:** Fetch /api/sales/[saleId]/calendar.ics or click the iCal download link on a sale page. Confirm ".ics description contains `Shared via FindA.Sale — finda.sale`" for an organizer without TEAMS+watermark-removal enabled.

3. **QA backlog (14 items — Records S842):** Top priority: #32 Shopper Wishlist Alerts, #68 Command Center, #73 Two-Channel Notifications, #91 Auto-Markdown, #125 Inventory CSV Export.

4. **P0 aging quick-win:** #335 Consignor Payout Email — run a test payout against deseee@yahoo.com, check inbox. #293 — UPDATE Sale status='ENDED' via psycopg2, then QA eBay panel.

---

## Recent Sessions

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
