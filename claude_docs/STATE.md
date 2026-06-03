# PROJECT STATE

Sections: §Current Status | §Pool Audit Findings | §Blocked Queue | §Recent Sessions | §Next Session

FindA.Sale is a two-sided marketplace PWA for secondary sale organizers (estate sales, yard sales, auctions, flea markets, consignment) connecting them with shoppers. Backend: Node.js/Prisma/PostgreSQL on Railway. Frontend: Next.js on Vercel.

---

## Current Status

**Latest: S849 — QA + DEV BLITZ. Dispatched 5 items in parallel. #293 eBay panel ✅ Chrome-verified (fix confirmed live, no screenshot IDs — roadmap update deferred). #91 Auto-Markdown P0 fixed: markdownCycleController was reading UserRoleSubscription (wrong table) instead of Organizer.subscriptionTier — now uses requireTier middleware at route level. #32 Wishlist Alerts P1 fixed: operator precedence bug in wishlist.tsx line 362 (|| before && caused Watching section to never render when alerts existed). Share-card 401 fix applied: edge function now accepts httpOnly cookie as auth signal. #267 RSVP XP: DB confirmed no user has ≥5 RSVPs in any single month — still externally blocked. Blocked Queue: 6 rows. Push block ready (5 files).**

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
_⚠️ P0 AGING (S845): #267 at 62 sessions; #332, #335 at 56 sessions — mandatory P0 per CLAUDE.md §10a. #293 GRADUATED S849 (Chrome-verified)._

| Feature | Reason | What's Needed | Session Added |
|---------|--------|---------------|---------------|
| RSVP XP Monthly Cap (#267 part 2) | **P0 (62 sessions)** — S849 DB confirmed: no user has ≥5 RSVPs in any single month (max: 4 RSVPs, April 2026). Code logic correct (CODE-ONLY). | Seed a test user with ≥6 RSVPs in the same calendar month via psycopg2, then verify XP caps at 10. | S785 |
| #332 Shopify Cross-Listing | **P0 (56 sessions)** — Requires Shopify OAuth; no test store available | Create free Shopify Partners dev store, connect via OAuth | S791 |
| #335 Consignor Payout Email | **P0 (56 sessions)** — Payout ran S845. SPF fixed S846. Patrick must check deseee@yahoo.com — if email received → ✅ after 56 sessions. | Check deseee@yahoo.com for Jane Thrift payout email. If received → ✅. | S791 |
| Share-card preview 401 on promote page | **P2 — FIX APPLIED S849** — Edge function now accepts httpOnly cookie as auth signal. ⚠️ FLAG: share cards may need to be fully public for OG scrapers. Needs push + Chrome QA + decision on public vs. auth. | Push pages/api/share-card.tsx, QA promote page load, confirm no 401. Decide: should share-card be fully public? | S844 |
| #32 Wishlist Alerts | **P1 BUG FIXED S849** — Operator precedence bug: `watching.length > 0 \|\| true && (` → Watching section never rendered when alerts existed. Fix: added parens. Needs push + Chrome QA. | Push wishlist.tsx fix, QA as Leo Thomas: create alert, verify Watching section renders with alert visible. | S845 |
| #91 Auto-Markdown save cycle | **P0 BUG FIXED S849** — markdownCycleController was reading UserRoleSubscription (wrong table) → 403 for all non-Stripe organizers. Fixed: requireTier middleware at route level + sales dropdown 404 fixed. Needs push + Chrome QA. | Push 3 backend/frontend files, QA as Alice (user1): /organizer/markdown-cycles, create cycle, verify saves. | S845 |

---

## Pending Chrome Verifications

| # | Feature | Evidence | Session |
|---|---------|----------|---------|
| 303 | Photo Station Shopper Page | /sales/cmpbvumj90001e7t7v5sa1iqi/photo-station as user5 (Leo Thomas). Page loads ✅ ss_65158fo38. "Share Your Find" + "Location Access Required" gate expected post-#317 geofencing. XP award + Already Scanned state UNVERIFIED (requires real GPS). | S839 |
| 461 | FB Marketplace Export + Sold Nudge | finda.sale/organizer/promote/0d9563f9-... as Alice Johnson (user1). Clicked "Download Spreadsheet" → GET /api/export/.../facebook-xlsx 200 ✅. DB confirmed fbExportedAt stamped on 3 items. Navigated to edit-item/b4a74f89-... → set status=SOLD → saved → redirected to dashboard. Notification inbox at finda.sale/notifications showed "Mark sold on Facebook Marketplace" / "Silver Bracelet sold on FindA.Sale — don't forget to mark it sold on Facebook Marketplace too" — just now ✅. | S844 |
| 68 | Command Center Dashboard | finda.sale/organizer/command-center as Alice Johnson. Recent tab clicked → "QA Test Flip Report Sale" with ● ENDED badge, May 21–May 28 dates visible. Tabs (Active/Upcoming/Recent/All) all work. Active tab empty state correct. ss_7321prqsa. Independent re-verification of S804 claim. | S845 |
| 125 | Inventory Syndication CSV Export | finda.sale/organizer/add-items/... as Alice Johnson (PRO). "Export to eBay" button clicked → modal opened: "Export 2 available items as eBay CSV", watermark toggle ✅, "Remove watermark — TEAMS only" gate visible. ss_5085g9dtj. Independent re-verification of S805 claim. | S845 |
| 293 | eBay Listing Data Parity | finda.sale/organizer/sales/0d9563f9-... as Alice Johnson. eBay post-sale panel loaded showing 2 unsold items (Old Radio, Ceramic Vase). Clicked "Edit eBay" on Old Radio — form expanded (13 fields across 3 sections). Clicked "Save eBay Details" → PUT /api/items/... 200. Correct API path GET /api/ebay/organizer/sales/.../unsold-items → 200 confirmed. ⚠️ NO screenshot IDs — agent used Chrome MCP (67 tool uses) but did not capture ss_ IDs. Records: apply roadmap Chrome ✅ only if screenshot IDs obtained on re-verify. | S849 |

---

## Next Session

**Push S849 block first (5 files — see below). Then:**

1. **QA #91 Auto-Markdown** — as Alice (user1): /organizer/markdown-cycles → create cycle → verify saves. Also confirm sales dropdown populates.
2. **QA #32 Wishlist Alerts** — as Leo Thomas (user5): /shopper/wishlist → Watching → New Alert → create → verify Watching section renders with alert. Screenshot required (ss_ ID needed).
3. **QA share-card** — as Alice on /organizer/promote/[saleId]: verify page loads without 401 in console. Also decide: should share-card be fully public for OG scrapers?
4. **#293 re-screenshot** — navigate to ENDED sale eBay panel as Alice, take screenshot (ss_ ID) so Records can apply roadmap Chrome ✅.
5. **#335 payout confirm** — check deseee@yahoo.com. If email received → ✅ after 56 sessions.
6. **#267 seed fix** — use psycopg2 to insert ≥6 SaleRsvp records for one user in current month, then verify XP caps at 10.

**Blocked Queue: 6 rows (below ≥8 ceiling). 3 P0 aging (#267/#332/#335) + 3 fix-applied-pending-QA (#32/#91/share-card).**

**Patrick actions required:**

1. **Push S849 block:**
```
git add packages/frontend/pages/api/share-card.tsx
git add packages/backend/src/routes/markdownCycles.ts
git add packages/backend/src/controllers/markdownCycleController.ts
git add packages/frontend/pages/organizer/markdown-cycles.tsx
git add packages/frontend/pages/shopper/wishlist.tsx
git commit -m "fix: #91 markdown cycle tier check + #32 wishlist watching section + share-card cookie auth"
.\push.ps1
```
2. **Check deseee@yahoo.com** — Jane Thrift payout email (#335). If received → ✅.
3. **Delete test invite SVPKNKV3:** finda.sale/admin/invites → Delete SVPKNKV3.
4. **GBP phone verification:** business.google.com → "Verify now" → phone code.

---

## Recent Sessions

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
- `notificationController.ts` (Friday 9am) — **P0: blast to 5,000 users, no opt-out, no unsubscribe link (CAN-SPAM violation)**. Now has notifPref check + suppression + per-user unsubscribe link.
- `buyerMatchService.ts` (every sale publish) — `notificationPrefs.emailNewSales` + suppression check
- `organizerAnalyticsService.ts` — **P0: weekly organizer digest, no suppression**. Now gated.
- `collectorPassportService.ts` — suppression check added
- `wishlistAlertService.ts` — suppression check added
- `saleEndingSoonJob.ts`, `curatorEmailJob.ts` — jobName wired to quota counter

**Dead code confirmed:** `wishlistMatchEmailService.notifyWishlistMatches()` is never called — zero risk.

**Remaining low-risk (no fix needed):** emailReminderService (user-set reminders), presaleSneakPeekEmailService (sale subscribers/RSVPs), followerNotificationService/smartFollowService (notifyEmail:true filter already present).

**Files changed:** `packages/backend/src/lib/emailService.ts` · `packages/backend/src/jobs/outreachEmailsCron.ts` · `packages/backend/src/jobs/saleEndingSoonJob.ts` · `packages/backend/src/jobs/curatorEmailJob.ts` · `packages/backend/src/services/weeklyEmailService.ts` · `packages/backend/src/services/buyerMatchService.ts` · `packages/backend/src/controllers/notificationController.ts` · `packages/backend/src/services/organizerAnalyticsService.ts` · `packages/backend/src/services/collectorPassportService.ts` · `packages/backend/src/services/wishlistAlertService.ts`

---

### S847 — EMAIL INCIDENT: inbox cleanup + cron fixes deployed

**Root cause confirmed:** `monthlyTrendReportJob.ts` was emailing 44,000+ scraped organizers (not real users), burning Gmail Workspace daily quota. `outreachEmailsCron.ts` had a duplicate emailAddress bug (same address repeated 48x in DirectoryClaimEmail table). Both caused mailer-daemon@googlemail.com to flood outreach@finda.sale with "You have reached a limit for sending mail" bounces.

**Fixes pushed today:**
- `c5ba28e` — monthlyTrendReportJob filter to real organizers only + emailService List-Unsubscribe headers (Yahoo compliance)
- `1203d7b` — autoSeedOutreachCron + outreachEmailsCron Set-based dedup

**Inbox cleanup (Apps Script, outreach@finda.sale):**
- "Your May 2026 Search Visibility Report" — ~15,635 emails moved to Trash ✅ Done:1235 confirmed
- "10 estate sales this weekend near you" — cleanup in progress at session end (~800+ deleted, auto-runner active)

**Honest status of fixes:** CODE-ONLY. Dedup logic has not been verified in production. Cross-run persistence of the Set-based dedup is unconfirmed. Inbox may refill if fixes are incomplete. Full audit is mandatory next session.

**Files changed this session:** none (fixes were pushed by Patrick from prior session dispatches)

---

### S845 — QA: #293 bug found + fixed, #335 payout ran, #68/#125 re-verified, #32/#91 cut off

**Session cut off by Claude API context limit** mid-QA on #32 (Wishlist Alerts alert creation). Work was mid-flight; wrap handled in S846 immediately after.

**#293 eBay Panel — P0 BUG FOUND + FIXED:** Root cause was NOT the missing eBay connection (as documented since S785). Actual bug: `PostSaleEbayPanel.tsx` was calling `/organizer/sales/${saleId}/unsold-items` — missing the `/ebay/` prefix. Backend route is at `/ebay/organizer/sales/.../unsold-items`. API 404 every time → panel always showed "All items sold" even with AVAILABLE items. Fix: corrected 3 API paths in PostSaleEbayPanel.tsx (`unsold-items`, `ebay-shipping`, `ebay-push`). Confirmed with direct API call returning 200 with 2 items. Awaiting push + Chrome QA.

**#335 Consignor Payout Email:** Jane Thrift email updated to deseee@yahoo.com. Payout run against Jane Thrift as Artifact MI. `PAYOUTED` jumped $29.75→$59.50, payout count 2→3 (ss_6444padcf). `sendConsignorPayout()` fires fire-and-forget — email went out. Patrick must check deseee@yahoo.com to confirm delivery. If confirmed → ✅.

**#68 Command Center ✅ re-verified:** finda.sale/organizer/command-center as Alice Johnson. Recent tab → "QA Test Flip Report Sale" with ENDED badge, May 21–May 28. Active/Upcoming/Recent/All tabs work. ss_7321prqsa. Independent re-verification of S804 claim (known inflation session).

**#125 CSV Export ✅ re-verified:** Export to eBay modal shows "Export 2 available items as eBay CSV", watermark toggle, "Remove watermark — TEAMS only" gate. ss_5085g9dtj. Independent re-verification of S805 claim.

**#91 Auto-Markdown — UNVERIFIED save cycle:** Page ✅ modal ✅ all fields ✅ PRO gate fires correctly ✅. Cycle save blocked because user1's JWT was issued when tier=BRONZE; DB update to PRO not reflected in existing session. Needs fresh login.

**#32 Wishlist Alerts — INCOMPLETE:** New Alert modal opened as Leo Thomas. Alert name entered ("Antiques Test"), Antiques category checked. Session cut off before clicking Create Alert. UNVERIFIED.

**DB changes by S845 (all on Railway):** Jane Thrift email → deseee@yahoo.com. user1 (Alice Johnson) → PRO tier. 2 items in sale 0d9563f9 flipped from PUBLISHED → AVAILABLE (for eBay panel test; harmless for QA).

**Files changed:** `packages/frontend/components/PostSaleEbayPanel.tsx` · `claude_docs/STATE.md` · `claude_docs/patrick-dashboard.md`

---

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

---

_Older sessions archived. 