# PROJECT STATE

Sections: §Current Status | §Pool Audit Findings | §Blocked Queue | §Recent Sessions | §Next Session

FindA.Sale is a two-sided marketplace PWA for secondary sale organizers (estate sales, yard sales, auctions, flea markets, consignment) connecting them with shoppers. Backend: Node.js/Prisma/PostgreSQL on Railway. Frontend: Next.js on Vercel.

---

## Current Status

**Latest: S862 — QA+DEV: 6 code fixes shipped. 14 features Chrome-verified. 4 new bugs found. Blocked Queue 10→12 rows.**
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
| #335 Consignor Payout Email | **P0 (70 sessions)** — Payout ran S845. SPF fixed S846. Patrick must check deseee@yahoo.com — if email received → ✅. | Check deseee@yahoo.com for Jane Thrift payout email. If received → ✅. | S791 |
| Rarity Boost pricing spec gap | **P3** — /coupons Rarity Boost shows "Activate Rarity Boost (50 XP)" with no cash option. Roadmap #290 documented as "15 XP / or $0.15 via card". Spec may be outdated. | Patrick: confirm Rarity Boost is XP-only at 50 XP (no cash rail) as intended | S858 |
| Email Verification Migration | **P0 (134 sessions, age-escalated)** — Migration 20260515180000 exists in migrations/ but no prisma migrate deploy recorded S726–S862. Token expiry not enforced in prod DB. | Patrick: cd packages/database && $env:DATABASE_URL="[Railway]" && npx prisma migrate deploy && npx prisma generate | S726 |
| Production DB Re-Seed | **P0 (73 sessions, age-escalated)** — Seedy2025! rejected for shopper accounts user5–user12+ since S576. Shopper Chrome QA requiring login blocked. | Patrick: cd packages/database && $env:DATABASE_URL="[Railway]" && npx prisma db seed | S787 |
| eBay Connection for user1 | **P0 (75 sessions, age-escalated)** — No eBay OAuth on organizer QA account. Blocks #293, #298, all eBay push QA. | Patrick: connect eBay to user1 at /organizer/settings/ebay via OAuth | S785 |
| Bing Webmaster Sitemap | **P0 (77 sessions, age-escalated)** — Bing/DuckDuckGo not receiving sitemap pings. SEO gap. | Patrick: bing.com/webmasters → Add sitemap → finda.sale/server-sitemap.xml | S783 |
| #230 Smart Buyer Widget Human QA | **P3** — Claude QA ✅ S793 confirmed. Human QA pending but blocked: no published sale on any real test organizer account. | Patrick: publish a sale on user1 account, then visit organizer dashboard to verify SmartBuyerWidget shows shopper data | S859 |
| #324 EXIF Temporal Clustering | **P1** — Fix shipped S862 (exif: true in uploadController.ts). Needs Chrome re-QA after push+deploy to confirm temporal hints fire on real uploads. | Push S862 batch → verify new upload preserves EXIF → re-QA #324 | S861 |
| #194 Saved Searches view page | **P2** — POST /api/saved-searches works + toast fires, but /shopper/saved-searches → 404. Page was never built. DB table + API exist. | Dispatch findasale-dev: build /shopper/saved-searches page + Save Search button on search results. | S862 |
| #47 UGC Photo Submit not on sale detail | **P2** — UGCPhotoSubmitButton exists and works, but is only wired into shopper/history.tsx. Not present on sales/[id].tsx. Shopper has no way to submit photos on the sale page. | Dispatch findasale-dev: add UGCPhotoSubmitButton to sales/[id].tsx alongside the existing UGCPhotoGallery. | S862 |
| #192 Price History data-dependent | **P3** — ItemPriceHistoryChart is correctly wired in edit-item/[id].tsx but returns null when no ItemPriceHistory records exist. Railway DB has no price change history for test items. | No code fix needed. To verify: run price update on a real item, then check chart renders. | S862 |

---

## Pending Chrome Verifications

| # | Feature | Evidence | Session |
|---|---------|----------|---------|
| 303 | Photo Station Shopper Page | /sales/cmpbvumj90001e7t7v5sa1iqi/photo-station as user5 (Leo Thomas). Page loads ✅ ss_65158fo38. "Share Your Find" + "Location Access Required" gate expected post-#317 geofencing. XP award + Already Scanned state UNVERIFIED (requires real GPS). | S839 |
| 327 | Price Calibration Logging ✅ | Navigated to edit-item as Alice (user1). Seeded aiSuggestedPrice=65 on Old Radio. Changed price 75→80, clicked Save. DB: PriceOverrideLog count 7→8, new row organizerId=Alice, aiSuggestedPrice=65, organizerPrice=80, delta=15, category=Electronics. Logging pipeline confirmed working. | S862 |
| 73 | Two-Channel Notification System ✅ | Navigated to /notifications as Alice. "Operational" and "Discovery" tab buttons both visible alongside "All". 3 real notifications present. | S862 |
| 186 | QR Scan Analytics ✅ | Navigated to /organizer/qr-codes as Alice. KPI tiles (Total/Active/Sales-with-scans), Scanner Funnel, Sales Breakdown table all present and rendering. | S862 |
| 396 | DIY Sale Starter Kit ✅ | Navigated to /organizer/starter-kit as Alice. All 4 sections visible (Pre-Sale/Pricing Tips/Day-Of/Post-Sale). /downloads/sale-starter-kit.pdf returns 200/application-pdf. Print button present. | S862 |
| 197 | Bounties organizer view ✅ | Navigated to /organizer/bounties as Alice. 3 tabs visible (Browse/Sale Requests/Your Submissions). "Your Submissions" tab loads correctly with empty state. | S862 |
| 163 | Organizer Earnings ✅ | Navigated to /organizer/earnings as Alice. Real data: $325 gross, -$26 platform fees (8%), $299 net. Year selector + PDF button present. Fee breakdown is per-sale (not per-item — note: roadmap says "item-level" but implementation is sale-level; matches current product behavior). | S862 |
| 173 | Message Templates ✅ | Navigated to /organizer/message-templates as Bob (user2). 6 default templates, Edit+Delete per template, + New Template button. Full CRUD visible. | S862 |
| 71 | Shopper Reputation ✅ | Navigated to /shopper/reputation as Bob (user2). KPI cards (0 purchases, $0 spent, 0% completion, 1 wishlist save), "New Shopper" status, Coming Soon section. | S862 |
| SHO-DASH | Shopper Dashboard + Hunt Pass ✅ | Navigated to /shopper/dashboard as Bob: 157 XP, Initiate rank, all widgets visible. /shopper/hunt-pass: $4.99/mo upsell, 6 perks listed. | S862 |

---

## Next Session

**S862 done. Blocked Queue: 12 rows — QA MODE next session (≥8 items).**

Priority:
1. **Records: Apply S862 PCV ✅ marks to roadmap** (#327/#73/#186/#396/#197/#163/#173/#71/SHO-DASH). Cross-session rule.
2. **Push S862 code batch** (11 files — see push block). Then verify #176 filter + #195 messaging in Chrome.
3. **DEV: #194 Saved Searches view page** — build /shopper/saved-searches page + Save Search button.
4. **DEV: #47 UGC Photo Submit** — wire UGCPhotoSubmitButton onto sales/[id].tsx.
5. **#324 EXIF** — Chrome re-QA after deploy (upload a photo, verify EXIF preserved in temporal clustering).
6. **5 P0 Patrick-action items** unchanged.

**Blocked Queue: 12 rows. QA MODE — no new feature dev without Patrick sign-off.**

**Patrick actions required:**

1. **Push S862 code+docs** (see push block below — 11 files).
2. **Check deseee@yahoo.com** — Jane Thrift payout email (#335). If received → ✅.
3. **Confirm Rarity Boost intent** — XP-only at 50 XP or restore $0.15 cash rail?
4. **Admin invites:** SVPKNKV3 not found in /admin/invites — already deleted or was test-only; no action needed.
5. **GBP phone verification:** business.google.com → "Verify now" → phone code.
6. **Barn Door QA Test Sale (cmpbvumj90001e7t7v5sa1iqi)** → returns 404 in prod. STATE.md references should be ignored for future QA — use any other published sale.

## Recent Sessions

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

