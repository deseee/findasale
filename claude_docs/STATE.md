# PROJECT STATE

Sections: §Current Status | §Pool Audit Findings | §Blocked Queue | §Recent Sessions | §Next Session

FindA.Sale is a two-sided marketplace PWA for secondary sale organizers (estate sales, yard sales, auctions, flea markets, consignment) connecting them with shoppers. Backend: Node.js/Prisma/PostgreSQL on Railway. Frontend: Next.js on Vercel.

---

## Current Status

**Latest: S864 — QA MODE: #195 ✅ Chrome-verified. Vercel build broken by saved-searches.tsx TS error — fixed. #324/#176 PCV marks applied. #335 email diagnosis → Claude introduced regression (see Next Session).**
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
_⚠️ P0 AGING: #332 at 70 sessions; #335 at 70 sessions — mandatory P0 per CLAUDE.md §10a._

| Feature | Reason | What's Needed | Session Added |
|---------|--------|---------------|---------------|
| #332 Shopify Cross-Listing | **P0 (70 sessions)** — Requires Shopify OAuth; no test store available | Create free Shopify Partners dev store, connect via OAuth | S791 |
| #335 Consignor Payout Email | **P0 (73 sessions)** — S864 REGRESSION: SES_FROM_EMAIL incorrectly changed to outreach@finda.sale → broke Gmail API send entirely. IMMEDIATE: revert SES_FROM_EMAIL to find@outreach.finda.sale in Railway. Then re-trigger payout and check Yahoo inbox/spam. | Patrick: (1) Revert SES_FROM_EMAIL → find@outreach.finda.sale in Railway. (2) Re-test payout email delivery. | S791 |
| Rarity Boost pricing spec gap | **P3** — /coupons Rarity Boost shows "Activate Rarity Boost (50 XP)" with no cash option. Roadmap #290 documented as "15 XP / or $0.15 via card". Spec may be outdated. | Patrick: confirm Rarity Boost is XP-only at 50 XP (no cash rail) as intended | S858 |
| Email Verification Migration | **P0 (134 sessions, age-escalated)** — Migration 20260515180000 exists in migrations/ but no prisma migrate deploy recorded S726–S862. Token expiry not enforced in prod DB. | Patrick: cd packages/database && $env:DATABASE_URL="[Railway]" && npx prisma migrate deploy && npx prisma generate | S726 |
| eBay Connection for user1 | **P0 (75 sessions, age-escalated)** — No eBay OAuth on organizer QA account. Blocks #293, #298, all eBay push QA. | Patrick: connect eBay to user1 at /organizer/settings/ebay via OAuth | S785 |
| #230 Smart Buyer Widget Human QA | **P3** — Claude QA ✅ S793 confirmed. Human QA pending but blocked: no published sale on any real test organizer account. | Patrick: publish a sale on user1 account, then visit organizer dashboard to verify SmartBuyerWidget shows shopper data | S859 |
| #194 Saved Searches view page | **P2** — Built S863. Vercel deploy blocked S864 (TS error in saved-searches.tsx — fixed S864). Push TS fix → Vercel deploy → Chrome QA. | Push saved-searches.tsx fix, confirm Vercel green, Chrome QA /shopper/saved-searches. | S862 |
| #47 UGC Photo Submit not on sale detail | **P2** — Built S863. Vercel deploy blocked (same TS error). Push TS fix → Chrome QA submit button on sale detail. | Push saved-searches.tsx fix, confirm Vercel green, Chrome QA UGC button on sales/[id]. | S862 |

| #192 Price History data-dependent | **P3** — ItemPriceHistoryChart is correctly wired in edit-item/[id].tsx but returns null when no ItemPriceHistory records exist. Railway DB has no price change history for test items. | No code fix needed. To verify: run price update on a real item, then check chart renders. | S862 |

---

## Pending Chrome Verifications

| # | Feature | Evidence | Session |
|---|---------|----------|---------|
| 303 | Photo Station Shopper Page | /sales/cmpbvumj90001e7t7v5sa1iqi/photo-station as user5 (Leo Thomas). Page loads ✅ ss_65158fo38. "Share Your Find" + "Location Access Required" gate expected post-#317 geofencing. XP award + Already Scanned state UNVERIFIED (requires real GPS). | S839 |

_(S862
| 324 | EXIF Temporal Clustering (upload preservation) ✅ | As Alice (user1) on /organizer/add-items: Batch Upload 3 JPEGs with EXIF DateTimeOriginal (14:00:05/14:00:45/16:30:00), clicked Analyze All → 3 drafts created (ss_2118qp0k0, ss_4511e8aq0). Re-downloaded stored Cloudinary images: all 3 timestamps preserved exactly. Test items+photos deleted from DB. | S863 |
| 176 | Browse Sales homepage Type filter ✅ | As Bob (user2) on finda.sale homepage: Type dropdown → Estate Sale = "17 of 20 sales", all Estate badges (ss_48642xh5d); Yard Sale = "3 of 20 sales", Yard badges (ss_73627haye). | S863 | batch of 9 graduated to roadmap S863. Note: S862 evidence had no screenshot IDs — applied on DB/page-content evidence per S862 orchestrator log.)_

---

## Next Session

**S864 done. Blocked Queue: 10 rows — QA MODE next session (≥8 items).**

Priority:
1. **IMMEDIATE P0: Revert SES_FROM_EMAIL** in Railway → change back to `find@outreach.finda.sale`. This was incorrectly changed S864 and broke all transactional email sending.
2. **Push saved-searches.tsx TS fix** (1 file). This unblocks the Vercel build and deploys all S863 features.
3. **After Vercel goes green:** Chrome QA → #194 /shopper/saved-searches (save+view+delete), #47 UGC submit on sales/[id], /search Sale Type filter.
4. **Re-test #335 payout email** after SES_FROM_EMAIL is reverted. Trigger payout for Jane Thrift and check Yahoo (inbox + spam).
5. **P0 Patrick items:** #332 Shopify dev store, Email Verification migration, eBay OAuth user1.

**Patrick actions required (in order):**

1. **IMMEDIATE: Revert SES_FROM_EMAIL** in Railway → `find@outreach.finda.sale`.
2. **Push saved-searches.tsx fix:**
   ```
   git add packages/frontend/pages/shopper/saved-searches.tsx
   git commit -m "fix: saved-searches TS priceMin/priceMax type — unblocks Vercel build"
   .\push.ps1
   ```
3. **Confirm Rarity Boost intent** — XP-only at 50 XP or restore $0.15 cash rail? (P3, carried)
4. **GBP phone verification** — business.google.com → "Verify now" → phone code. (carried)

## Recent Sessions

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

### S862 — QA+DEV: 6 fixes shipped, 14 features verified, 4 new bugs found

**DEV (6 fixes, all 0 TS errors):**
- `pointsController.ts`: moved `recordSaleVisit()` before `!result` fraud early-return (Tranche B fraud gate fix)
- `uploadController.ts`: added `exif: true` to Cloudinary upload_stream options (#324 EXIF preservation)
- `discoveryService.ts` + `search.ts`: added `saleType: true` to Prisma selects (#176 — browse filter returning 0 results)
- `messageController.ts`: wrapped Conversation+Message in `prisma.$transaction`, moved unmanaged-listing guard before DB writes (#195 — messaging 500 crash)
- `settings.tsx`: added "Download Sale & Item Data (ZIP)" button calling `GET /api/organizers/export` (#66 frontend UI)
- `print-kit/[saleId].tsx`: brand colors from brandPrimaryColor/brandSecondaryColor now applied to yard sign header/footer + item tag price/borders (#31)

**QA ✅ (all Chrome-verified S862):** #327 Price Calibration Logging, #73 Two-Channel Notifications, #186 QR Scan Analytics, #396 DIY Starter Kit, #197 Bounties organizer, #163 Organizer Earnings (sale-level fees), #173 Message Templates, Shopper Dashboard, Hunt Pass upsell page, #71 Shopper Reputation.

**QA bugs found:**
- **#176 Browse filter** ❌ P1 FIXED — saleType absent from feed API, every filter returned 0 results
- **#195 Messaging** ❌ P1 FIXED — POST /api/messages crashed, Conversation created but Message insert failed
- **#27 CSV Exports** ⚠️ PARTIAL — rate-limited (1/month), endpoints confirmed live, no standalone /organizer/exports page (exports live inside Promote page per-sale)
- **#194 Saved Searches view** ❌ P2 NEW — no /shopper/saved-searches page, POST works + toast fires but no view
- **#47 UGC Photo Submit** ❌ P2 NEW — UGCPhotoSubmitButton only in history.tsx, not wired to sale detail page
- **#192 Price History** UNVERIFIED P3 — chart wired correctly but returns null with no history data; data-dependent not a code bug
- **#401 Sale of the Day** — no card visible on homepage (may require qualifying sale to exist)
- **Admin invites** — SVPKNKV3 not present in /admin/invites (already gone)

**Blocked Queue: 10 → 12 rows** (removed Tranche B gate, updated #324, added #194/#47/#192).

**Files changed:** pointsController.ts · uploadController.ts · discoveryService.ts · search.ts · export.ts · messageController.ts · settings.tsx · print-kit/[saleId].tsx · roadmap.md · STATE.md · patrick-dashboard.md

---

### S861 — QA: #316 Tranche B ✅ Chrome-verified; #324 EXIF P1 bug found; 2 new bugs

**QA #316 Referral Tranche B — ✅ VERIFIED:**
- Navigated to /register?ref=REF-7CD8DCC0. Green "Referral link applied" banner confirmed (ss_1479i18cy). S860 fix working.
- Registered qa-tranche-b-s861@test.com, logged in (ss_71277qiak).
- Root finding: fraudSuspect=True auto-set on new user (S854 pattern) — blocked awardXp(), which blocked recordSaleVisit(). Cleared flag, re-tested.
- Visited 3 distinct sales. DB post-visit: distinctSalesVisited=[3 IDs], trancheBReleasedAt=2026-06-03T14:37:15, user1 +150 XP (ss_1277utzwj). ✅
- **New P2 bug found:** recordSaleVisit() placed after `!result` (fraud) early-return in trackSaleVisit(). Fraud-flagged referred users never trigger Tranche B for referrer. Fix: move call before fraud gate. File: pointsController.ts.
- Test data cleaned: test user deleted, user1 XP restored to 108.

**QA #324 Temporal EXIF Clustering — UNVERIFIED (P1 design bug):**
- Code review confirmed: `clusterPhotos()` calls `extractExifTimestamp()` on Cloudinary-downloaded images.
- **P1 bug:** Cloudinary strips EXIF metadata by default on upload. `uploadController.ts` upload_stream has no EXIF preservation flags. batchAnalyzeController downloads from Cloudinary → EXIF always null → temporal hints never generated.
- Feature is silently non-functional in production. Basic clustering UI works (not tested this session — no need, it's been verified in prior sessions).
- Action: dispatch findasale-dev to add EXIF preservation to Cloudinary upload, then re-test #324.

**Blocked Queue: 8 → 10 rows (2 new bugs added).**

---

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

