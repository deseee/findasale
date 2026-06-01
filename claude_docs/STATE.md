# PROJECT STATE

Sections: §Current Status | §Pool Audit Findings | §Blocked Queue | §Recent Sessions | §Next Session

FindA.Sale is a two-sided marketplace PWA for secondary sale organizers (estate sales, yard sales, auctions, flea markets, consignment) connecting them with shoppers. Backend: Node.js/Prisma/PostgreSQL on Railway. Frontend: Next.js on Vercel.

---

## Current Status

**Latest: S840 — Records cleanup + QA: STATE.md trimmed (369→136 lines), #321 ✅ applied to roadmap, #464 UTM drift fixed, #340 CODE-VERIFIED noted. Wishlists flow QA: /shopper/wishlist in-app nav ✅, Sellers tab ✅, /wishlists P2 bug confirmed ❌ + FIXED (wishlists.tsx: authLoading guard added, 0 TS errors). Fix PENDING DEPLOY. Blocked Queue: 4 rows.**

**Previous: S839 — QA: S837 nav links all verified (/organizer/referrals, /organizer/markdown-cycles, /organizer/starter-kit, /ai-score, /challenges, /surprise-me ✅ with ss evidence), #321 ✅ Encyclopedia Auto-Gen, #317 CODE-VERIFIED, #340 CODE-VERIFIED, #303 PASS WITH NOTES (photo-station loads; XP/Already Scanned UNVERIFIED — requires real GPS). P2 found: /wishlists auth guard fires before auth loads on hard navigation (missing isLoading check). Blocked Queue: 4 rows.**

**Previous: S838 — QA batch: #165 PASS WITH NOTES (P3), #61 ✅, #36 CODE-ONLY ✅, #72 ✅ FULL PASS (user2 dual-role), #308 PASS WITH NOTES (P3), #25 ✅ Patrick-confirmed. Blocked Queue: 4 rows.**

**Previous: S837 and earlier — QA+DEV: #166 ✅, #74 ✅, #150 ✅ + nav audit → 11 fixes. S836: UTM #462/#463/#464 ✅. S835: #167 disputes ✅. S833: #279 Rare Finds ✅. S832: 6 features Chrome-verified (#135 #302 #300 #301 #288 #297). Blocked Queue stable 4–5 rows across sessions.**

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

---

## Pending Chrome Verifications

| # | Feature | Evidence | Session |
|---|---------|----------|---------|
| 303 | Photo Station Shopper Page | /sales/cmpbvumj90001e7t7v5sa1iqi/photo-station as user5 (Leo Thomas). Page loads ✅ ss_65158fo38. "Share Your Find" + "Location Access Required" gate expected post-#317 geofencing. XP award + Already Scanned state UNVERIFIED (requires real GPS). | S839 |

---

## Next Session

**Blocked Queue: 4 rows (below ≥8 ceiling — dev sessions clear).**

**S840 complete.** Records cleanup + wishlists P2 bug fixed.

**Patrick actions required:**

1. **Push block for S839+S840 (4 files):**
   ```powershell
   cd C:\Users\desee\ClaudeProjects\FindaSale
   git add claude_docs/STATE.md
   git add claude_docs/patrick-dashboard.md
   git add claude_docs/strategy/roadmap.md
   git add packages/frontend/pages/wishlists.tsx
   git commit -m "fix: wishlists.tsx auth guard — add authLoading guard to prevent redirect before /me resolves; docs: S840 wrap"
   .\push.ps1
   ```

2. **Verify wishlists fix post-deploy:** After push, navigate directly to finda.sale/wishlists while logged in. Should load the hub page, not redirect to login.

3. **Delete test invite SVPKNKV3:** finda.sale/admin/invites → Delete SVPKNKV3.

4. **GBP phone verification:** business.google.com → "Verify now" → phone code.

5. **#239 legal gate:** Attorney + CPA before live consignor payouts.

**Dispatch stubs (next session — QA continues):**

1. **Verify wishlists fix** — After Patrick pushes, navigate to finda.sale/wishlists directly as logged-in user. Expected: hub page loads. If ✅ update Pending Chrome Verifications.

2. **QA next targets:** #267 RSVP monthly cap (user5/user6, need 5 RSVPs in one month), #303 Already Scanned (real GPS — VM can't test), #332 Shopify (needs test store).

3. **Dev batch (P3):** nudgeService.ts TIER_PROGRESS case. ab-tests.tsx stub buttons + roles/role inconsistency.

---

## Recent Sessions

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
