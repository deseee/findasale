# PROJECT STATE

Sections: §Current Status | §Pool Audit Findings | §Blocked Queue | §Recent Sessions | §Next Session

FindA.Sale is a two-sided marketplace PWA for secondary sale organizers (estate sales, yard sales, auctions, flea markets, consignment) connecting them with shoppers. Backend: Node.js/Prisma/PostgreSQL on Railway. Frontend: Next.js on Vercel.

---

## Current Status

**Latest: S841 — QA: #321 wishlists hard-nav ✅ Chrome-verified (ss_1258kvk8e ss_839591msq). #461 ⚠️ P2 BUG — FB nudge not wired to single-item PUT (only bulk PATCH); export button UI confirmed. #27b ⚠️ P2 BUG — iCal watermark footer missing from generateIcal(); Chrome-fetch confirmed no footer text. Print Kit PDF watermark CODE-CONFIRMED. Blocked Queue: 6 rows (2 new P2 bugs added).**

**Previous: S840 — Records cleanup + QA: STATE.md trimmed (369→136 lines), #321 ✅ applied to roadmap, #464 UTM drift fixed, #340 CODE-VERIFIED noted. Wishlists flow QA: /shopper/wishlist in-app nav ✅, Sellers tab ✅, /wishlists P2 bug confirmed ❌ + FIXED (wishlists.tsx: authLoading guard added, 0 TS errors). Fix deployed. Blocked Queue: 4 rows.**

**Previous: S839 — QA: S837 nav links all verified, #321 ✅ Encyclopedia Auto-Gen, #317 CODE-VERIFIED, #340 CODE-VERIFIED, #303 PASS WITH NOTES. P2 found: /wishlists auth guard missing isLoading check. Blocked Queue: 4 rows.**

**Previous: S838 — QA batch: #165 ⚠️, #61 ✅, #36 CODE-ONLY, #72 ✅, #308 ⚠️, #25 ✅. Blocked Queue: 4 rows.**

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

| Feature | Reason | What's Needed | Session Added |
|---------|--------|---------------|---------------|
| RSVP XP Monthly Cap (#267 part 2) | Only 3 platform sales have RSVP button; need 5 RSVPs in one month to hit 10 XP cap | Create more platform sales with RSVP enabled, or wait for organic usage | S785 |
| #332 Shopify Cross-Listing | UNVERIFIED S791 — Requires Shopify OAuth connection; no test store available | Connect a Shopify store to an organizer account, then verify cross-listing flow | S791 |
| #293 eBay Listing Data Parity | PostSaleEbayPanel requires eBay connection + completed sale with items | Connect eBay to user1, complete a sale, then test 17-field Edit eBay section | S785 |
| #335 Consignor Payout Email | ✅ CODE-VERIFIED S791 — sendConsignorPayout() called after payout. Gmail API correct service. | Run payout against real email to fully verify delivery. | S791 |
| #461 FB Nudge — single-item path | P2 BUG S841: `notifyFacebookExportedItemSold()` only called in bulk PATCH status handler (items.ts:431), NOT in `updateItem` (itemController.ts). Organizers marking sold via edit-item get no nudge. | Fix: add nudge call to itemController.ts `updateItem` when status transitions to SOLD. | S841 |
| #27b iCal watermark footer | P2 BUG S841: `generateIcal()` (saleController.ts:1084) has zero watermark implementation. Live .ics fetch confirmed: description ends at "View items online: [url]" — no footer. | Fix: add `removeWatermarkEnabled` check + "Shared via FindA.Sale" footer to generateIcal(). | S841 |

---

## Pending Chrome Verifications

| # | Feature | Evidence | Session |
|---|---------|----------|---------|
| 303 | Photo Station Shopper Page | /sales/cmpbvumj90001e7t7v5sa1iqi/photo-station as user5 (Leo Thomas). Page loads ✅ ss_65158fo38. "Share Your Find" + "Location Access Required" gate expected post-#317 geofencing. XP award + Already Scanned state UNVERIFIED (requires real GPS). | S839 |
| wishlists fix | /wishlists hard-nav auth guard | Navigated directly to finda.sale/wishlists as Leo Thomas (user5). Hub loaded with Vintage Jewelry + Mid-Century Modern Hunt collections. No redirect to /login. ss_1258kvk8e ss_839591msq | S841 |

---

## Next Session

**Blocked Queue: 6 rows (below ≥8 ceiling — dev sessions clear).**

**S841 complete.** QA session: #321 ✅ wishlists fix confirmed deployed, 2 P2 bugs found (#461 nudge path gap, #27b iCal watermark missing).

**Patrick actions required:**

1. **Push block for S841 (2 files — docs only):**
   ```powershell
   cd C:\Users\desee\ClaudeProjects\FindaSale
   git add claude_docs/STATE.md
   git add claude_docs/patrick-dashboard.md
   git commit -m "docs: S841 wrap — #321 ✅ wishlists fix verified, #461 P2 nudge path bug, #27b P2 iCal watermark missing"
   .\push.ps1
   ```

2. **Delete test invite SVPKNKV3:** finda.sale/admin/invites → Delete SVPKNKV3.

3. **GBP phone verification:** business.google.com → "Verify now" → phone code.

4. **#239 legal gate:** Attorney + CPA before live consignor payouts.

**Dispatch stubs (next session):**

1. **Apply Pending Chrome Verifications to roadmap** — `Skill('findasale-records')`: apply wishlists hard-nav ✅ (ss_1258kvk8e ss_839591msq) to roadmap Chrome column.

2. **Fix P2 bugs (dispatch to findasale-dev in parallel):**
   - `#461 nudge fix`: In `itemController.ts` `updateItem` function, add `notifyFacebookExportedItemSold(item.id).catch(...)` call when status transitions to `SOLD`. Pattern: items.ts:424-431.
   - `#27b iCal fix`: In `saleController.ts` `generateIcal()`, add `removeWatermarkEnabled` check on the organizer (need to include in the prisma query) and append `\n\nShared via FindA.Sale — finda.sale` to description when watermark is enabled.

3. **QA continues:** #267 RSVP monthly cap (user5/user6, needs 5 RSVPs), #303 Already Scanned (real GPS — VM blocked), #332 Shopify (needs test store).

---

## Recent Sessions

### S841 — QA: #321 wishlists ✅, #461 P2 bug, #27b P2 bug

**#321 wishlists fix Chrome-verified:** Navigated directly to finda.sale/wishlists as Leo Thomas (user5). Hub loaded with 2 collections (Vintage Jewelry, Mid-Century Modern Hunt). No redirect to /login. Fix confirmed deployed. ss_1258kvk8e ss_839591msq

**#461 ⚠️ PASS WITH NOTES (P2 bug):** FB Marketplace "Download Spreadsheet" button present and renders on promote page (ss_6661l9vm1). P2 BUG: `notifyFacebookExportedItemSold()` only wired to bulk PATCH `status` operation (items.ts:431) — NOT wired to single-item `updateItem` (itemController.ts). Marked Antique Chair AVAILABLE→SOLD via edit-item, zero notifications fired in Alice's inbox. Chrome-verified. UNVERIFIED: whether nudge fires via bulk path; UNVERIFIED: fbExportedAt stamped (VM disk full).

**#27b ⚠️ PASS WITH NOTES (P2 bug):** Print Kit PDF watermark CODE-CONFIRMED (printKitController.ts:326 — `!canRemoveWatermark()` → "Find more sales at FindA.Sale" footer). P2 BUG: `generateIcal()` (saleController.ts:1084) has no watermark implementation. Live `.ics` fetch confirmed description ends at `View items online: [url]` — no footer text, no `removeWatermarkEnabled` check. iCal watermark was claimed implemented in S599 but missing from code.

**Files changed:** `claude_docs/STATE.md` · `claude_docs/patrick-dashboard.md`

---

### S840 — Records + QA: STATE.md cleanup, wishlists P2 fix

**Records:** STATE.md trimmed 369→136 lines. Stale S838 Next Session block removed. Roadmap: #321 Claude QA ✅ applied (ss_0551gs4p3 ss_01850j1g8), #464 UTM drift fixed (BROKEN→FIXED S836), #340 CODE-VERIFIED S839 noted. Pool Audit Findings condensed.

**Wishlists QA:** Navigated to /shopper/wishlist as user5 (Leo Thomas) via MY COLLECTION → Wishlist nav click. Items tab ✅, Sellers tab ✅ (correct empty state), 2 collections (Vintage Jewelry/Mid-Century Modern Hunt) present. "+ New Collection" routes to /wishlists hub ✅ via client-side nav. Direct URL /shopper/wishlist ✅ no auth bug. /wishlists hard nav (F5 reload while logged in) → redirected to /login ❌ P2 confirmed. ss_5165fdf0j ss_30826q1k8 ss_2960t250m ss_2592nh65t

**P2 FIXED:** wishlists.tsx line 52: `const { user, isLoading: authLoading } = useAuth()`. Line 63–67: `if (!authLoading && user === null)` + `authLoading` in deps array. 0 TS errors. PENDING DEPLOY (Patrick push required).

**Secondary P3:** /login redirect from /wishlists doesn't include `?redirect=/wishlists` — user loses their place. Low priority, not blocking.

**Files changed:** `claude_docs/STATE.md` · `claude_docs/patrick-dashboard.md` · `claude_docs/strategy/roadmap.md` · `packages/frontend/pages/wishlists.tsx`

---

### S839 — QA: S837 nav links, #321, #303, #317, #340

**S838 roadmap verifications applied:** #61 ✅, #72 ✅, #165 ⚠️ PASS WITH NOTES (P3), #36 CODE-ONLY, #308 ⚠️ PASS WITH NOTES (P3), #25 ✅ Patrick-confirmed.

**S837 nav links verified:** /organizer/referrals ✅, /organizer/markdown-cycles ✅, /organizer/starter-kit ✅, /ai-score ✅, /challenges ✅, /surprise-me ✅, color-rules→discount-rules redirect ✅, /notifications consolidated ✅ (All/Operational/Discovery tabs). P2: /wishlists hard-nav redirects to login — auth guard missing isLoading check.

**#321 Encyclopedia Auto-Gen ✅** — /admin/encyclopedia as user1: 57 Awaiting Review, 20 Published, 77 Total. Hoosier/Stickley/Catalin — AUTO_GENERATED with Promote buttons. Run Full Curator Pass button visible. ss_0551gs4p3 ss_01850j1g8

**#303 Photo Station ⚠️ PASS WITH NOTES** — page loads, "Location Access Required" gate expected. XP/Already Scanned UNVERIFIED (requires real GPS). ss_65158fo38

**#317 CODE-VERIFIED** — itemController.ts:2723 coords check + graceful degradation. **#340 CODE-VERIFIED** — review.tsx:413 + [saleId].tsx:496-499 query param auto-open flow.

**Files changed:** `claude_docs/STATE.md` · `claude_docs/patrick-dashboard.md` · `claude_docs/strategy/roadmap.md`

---

### S838 — QA: #165, #61, #36, #72, #308, #25

**#165 ⚠️ PASS WITH NOTES** — P3: stub Clear button, roles/role inconsistency. **#61 ✅** — NudgeBar confirmed, STREAK_CONTINUATION, variable-ratio. P3: TIER_PROGRESS never generated. **#36 CODE-ONLY ✅** — weeklyEmailJob.ts cron Sunday 6pm confirmed. **#72 ✅** — user2 ORGANIZER+SHOPPER: 22-item nav zero dups, all dashboards load. **#308 ⚠️** — hide fires isActive:false, absent from public pages; P3: no Hidden indicator in organizer list. **#25 ✅ Patrick-confirmed** — eBay Sync Phase B/C + Pull to Sale working.

**Files changed:** `claude_docs/STATE.md` · `claude_docs/patrick-dashboard.md` · `claude_docs/strategy/roadmap.md`

---

### S837 — QA: #166 ✅, #74 ✅, #150 ✅ + nav audit → 11 fixes

**#166 Invites ✅** — Admin invites: generated SVPKNKV3 (Patrick to delete). /register?invite flow ✅. Workspace invite: 201 + toast. **#74 ✅** — Role-aware registration: Shopper vs Organizer forms confirmed. **#150 ✅** — FCM push subscription active (p256dh+auth keys confirmed). Nav audit: 11 AvatarDropdown + BottomTabNav fixes, 6 unlinked features surfaced and nav-wired (#398/#334/#396/#438/#55/#182).

**Files changed:** `claude_docs/STATE.md` · `claude_docs/patrick-dashboard.md`

---

### S836 — DEV+QA: UTM #462/#463/#464 ✅

**Root cause:** Chrome incognito strips utm_* params at browser level. Fix: email links use fsa_* param names. UTMCapture reads fsa_* as primary, maps to utm_* for sessionStorage. Verified via console: sessionStorage fsa_utm confirmed with source/medium/campaign/content. Vercel build failure fixed (dashboard.tsx TS1005 — JSX siblings without Fragment). Blocked Queue: 4 rows.

---

_Older sessions archived. S835 and earlier: see git log._
