# PROJECT STATE

Sections: §Current Status | §Pool Audit Findings | §Blocked Queue | §Recent Sessions | §Next Session

FindA.Sale is a two-sided marketplace PWA for secondary sale organizers (estate sales, yard sales, auctions, flea markets, consignment) connecting them with shoppers. Backend: Node.js/Prisma/PostgreSQL on Railway. Frontend: Next.js on Vercel.

---

## Current Status

**Latest: S850 — QA BLITZ: #91 ✅ #32 ✅ share-card ✅ #267 ✅ #293 re-screenshot ✅. All 4 S849 fixes Chrome-verified. #91: POST /api/markdown-cycles 201, cycle renders. #32: Watching section renders with Antiques Test alert. Share-card: 200 image/png confirmed via credentials:include fetch. #267 RSVP cap: RSVP #5 → +2 XP (total=10), RSVP #6 → 0 XP (capped) — DB-confirmed. #293 ss_ IDs obtained: ss_85819up9q ss_832940555. Roadmap: #68 Chr ✅ S845 + #125 Chr ✅ S845 applied. Blocked Queue: 2 rows (down from 6).**

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
_⚠️ P0 AGING: #332 at 56 sessions; #335 at 56 sessions — mandatory P0 per CLAUDE.md §10a. S850: #267 ✅ #32 ✅ #91 ✅ share-card ✅ all graduated (Chrome-verified S850)._

| Feature | Reason | What's Needed | Session Added |
|---------|--------|---------------|---------------|
| #332 Shopify Cross-Listing | **P0 (56 sessions)** — Requires Shopify OAuth; no test store available | Create free Shopify Partners dev store, connect via OAuth | S791 |
| #335 Consignor Payout Email | **P0 (56 sessions)** — Payout ran S845. SPF fixed S846. Patrick must check deseee@yahoo.com — if email received → ✅ after 56 sessions. | Check deseee@yahoo.com for Jane Thrift payout email. If received → ✅. | S791 |

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

---

## Next Session

**S850 done. Records: apply #91/#32/#267/share-card/#293 Chrome ✅ to roadmap.md from Pending Chrome Verifications table.**

1. **Records: apply Chrome ✅ marks** — Read Pending Chrome Verifications table, verify all 5 S850 entries have full evidence (URL+user+element+outcome+ss_ ID), apply to roadmap.md Chr column: #91, #32, #267, SC (share-card row), #293.
2. **#335 payout confirm** — Patrick must check deseee@yahoo.com. If Jane Thrift payout email received → ✅ after 56 sessions. Remove from Blocked Queue.
3. **#332 Shopify** — Still blocked on external Shopify dev store. No action needed unless Patrick creates one.
4. **Next dev work** — Consult roadmap.md for next BROKEN/Pending items.

**Blocked Queue: 2 rows (#332/#335 only). ✅ Well below ≥8 ceiling — DEV mode permitted next session.**

**Patrick actions required:**

1. **Check deseee@yahoo.com** — Jane Thrift payout email (#335). If received → ✅.
2. **Delete test invite SVPKNKV3:** finda.sale/admin/invites → Delete SVPKNKV3.
3. **GBP phone verification:** business.google.com → "Verify now" → phone code.
4. **Push S850 wrap docs:**
```
git add claude_docs/STATE.md
git add claude_docs/patrick-dashboard.md
git add claude_docs/strategy/roadmap.md
git commit -m "docs: S850 wrap — #91/#32/#267/share-card ✅ Chrome-verified, Blocked Queue 6→2"
.\push.ps1
```

---

## Recent Sessions

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

**#125 CSV Export ✅ re-verified:** Export to eBay modal shows "Export 2 available items as eBay CSV", watermark toggle, "Remove watermark — TE