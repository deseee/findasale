# PROJECT STATE

Sections: §Current Status | §Pool Audit Findings | §Blocked Queue | §Recent Sessions | §Next Session

FindA.Sale is a two-sided marketplace PWA for secondary sale organizers (estate sales, yard sales, auctions, flea markets, consignment) connecting them with shoppers. Backend: Node.js/Prisma/PostgreSQL on Railway. Frontend: Next.js on Vercel.

---

## Current Status

**Latest: S858 — QA+DEV: Flash Deal dropdown FIXED (AVAILABLE filter). Records: #159 Chr ✅ applied to roadmap + Pending Chrome Verifications trimmed. QA: #398 ✅ (organizer referral link + Copy Link + stats — ss_4915xx0kl). #259 ✅ (1.5x XP confirmed, Hunt Pass page — ss_7973nmk5n). #290 ✅ (/coupons 3-tier $ + XP display — ss_32554r03n). #158 ✅ ("Notify me of new items" + "Remind Me by Email" visible — ss_4902k1y46). 3 new P3 notes. Blocked Queue: 6 rows (Flash Deal dropdown cleared).**

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
_⚠️ P0 AGING: #332 at 58 sessions; #335 at 58 sessions — mandatory P0 per CLAUDE.md §10a. S853: 4 P2/P3 bugs (S851 queue) Chrome-verified and cleared._

| Feature | Reason | What's Needed | Session Added |
|---------|--------|---------------|---------------|
| #332 Shopify Cross-Listing | **P0 (58 sessions)** — Requires Shopify OAuth; no test store available | Create free Shopify Partners dev store, connect via OAuth | S791 |
| #335 Consignor Payout Email | **P0 (58 sessions)** — Payout ran S845. SPF fixed S846. Patrick must check deseee@yahoo.com — if email received → ✅ after 58 sessions. | Check deseee@yahoo.com for Jane Thrift payout email. If received → ✅. | S791 |
| Rarity Boost pricing spec gap | **P3** — /coupons Rarity Boost shows "Activate Rarity Boost (50 XP)" with no cash option. Roadmap #290 documented as "15 XP / or $0.15 via card". Spec may be outdated — need product decision on whether cash dual-rail was intentionally removed. | Patrick: confirm Rarity Boost is XP-only at 50 XP (no cash rail) as intended | S858 |
| Email Verification Migration | **P0 (132 sessions, age-escalated 2026-06-03)** — Migration 20260515180000 exists in migrations/ but no prisma migrate deploy recorded S726–S854. Token expiry not enforced in prod DB. | Patrick: cd packages/database && $env:DATABASE_URL="[Railway]" && npx prisma migrate deploy && npx prisma generate | S726 |
| Production DB Re-Seed | **P0 (67 sessions, age-escalated 2026-06-03)** — Seedy2025! rejected for shopper accounts user5–user12+ since S576. Shopper Chrome QA requiring login blocked. | Patrick: cd packages/database && $env:DATABASE_URL="[Railway]" && npx prisma db seed (back up sale cmpbvumj90001e7t7v5sa1iqi first) | S787 |
| eBay Connection for user1 | **P0 (69 sessions, age-escalated 2026-06-03)** — No eBay OAuth on organizer QA account. Blocks #293, #298, all eBay push QA. | Patrick: connect eBay to user1 at /organizer/settings/ebay via OAuth | S785 |
| Bing Webmaster Sitemap | **P0 (71 sessions, age-escalated 2026-06-03)** — Bing/DuckDuckGo not receiving sitemap pings. SEO gap. | Patrick: bing.com/webmasters → Add sitemap → finda.sale/server-sitemap.xml | S783 |

---

## Pending Chrome Verifications

| # | Feature | Evidence | Session |
|---|---------|----------|---------|
| 303 | Photo Station Shopper Page | /sales/cmpbvumj90001e7t7v5sa1iqi/photo-station as user5 (Leo Thomas). Page loads ✅ ss_65158fo38. "Share Your Find" + "Location Access Required" gate expected post-#317 geofencing. XP award + Already Scanned state UNVERIFIED (requires real GPS). | S839 |
| 398 | Organizer Referral Loop | finda.sale/organizer/referrals as Alice Johnson. Referral link REF-7CD8DCC0 displays. Copy Link → "Copied!" toast confirmed. Stats: 1 Organizer Referred, 0 XP Earned. 3-step explainer renders. ss_4915xx0kl. ⚠️ P3: Step 3 copy omits XP component. | S858 |
| 259 | Hunt Pass Page Accuracy (1.5x) | finda.sale/shopper/hunt-pass as Alice Johnson. "1.5x XP on Everything" confirmed (not 2x). ss_7973nmk5n. XP Earning Matrix + "6 hours early" flash deal copy not on page — removed since S530 (intentional UX simplification). | S858 |
| 290 | Hunt Pass Dual-Rail + Coupon Tiers | finda.sale/coupons as Alice Johnson. 3 coupon tiers show $ value + XP cost. Standard: $0.75 / 100 XP, Deluxe: $2.00 / 200 XP, Premium: $5.00 / 500 XP. ss_32554r03n. ⚠️ P3: Rarity Boost 50 XP only (no cash option; spec said 15 XP / $0.15). | S858 |
| 158 | Sale Waitlist | finda.sale/sales/cmpxl4jii017xsot00wwosx1x as Alice Johnson. "Remind Me by Email" bell + "Notify me of new items" both visible on published sale page. ss_4902k1y46. | S858 |

---

## Next Session

**S858 done. Blocked Queue: 6 rows. DEV mode permitted (< 8).**

1. **Records: Apply S858 Chrome marks to roadmap** — #398, #259, #290, #158 all in Pending Chrome Verifications with full evidence. `Skill('findasale-records')` at session start.
2. **#317/#320** — Still UNVERIFIED. Defer.
3. **#335 payout** — Patrick check deseee@yahoo.com.
4. **#332 Shopify** — Blocked on dev store.
5. **5 P0 Patrick-action items** in Blocked Queue: Email Verification Migration, DB Re-Seed, eBay Connection, Bing Sitemap, Rarity Boost spec confirm.
6. **QA targets available** (no Stripe/GPS required): #230 Smart Buyer Widget (needs active/published sale on user1), #255 Rank-Up Notifications.

**Blocked Queue: 6 rows. DEV mode permitted.**

**Patrick actions required:**

1. **Check deseee@yahoo.com** — Jane Thrift payout email (#335). If received → ✅.
2. **Confirm Rarity Boost intent** — /coupons shows Rarity Boost at 50 XP, no cash option. Was the $0.15 cash dual-rail intentionally removed? Say yes or no.
3. **Delete test invite SVPKNKV3:** finda.sale/admin/invites → Delete SVPKNKV3.
4. **GBP phone verification:** business.google.com → "Verify now" → phone code.
5. **Push S858 fixes + docs:**
```
git add claude_docs/STATE.md
git add claude_docs/patrick-dashboard.md
git add claude_docs/strategy/roadmap.md
git add packages/frontend/pages/organizer/dashboard.tsx
git add packages/frontend/pages/organizer/print-kit/[saleId].tsx
git add packages/backend/src/controllers/printKitController.ts
git commit -m "fix: Flash Deal dropdown AVAILABLE filter; #27b print-kit watermark gate; docs: S858 wrap + roadmap #159 Chr"
.\push.ps1
```

## Recent Sessions

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

**QA attempts:** #320 Async eBay Comp: DB-confirmed (6 items with aiSuggestedPrice, organizer prices not overridden per D-005). Chrome UNVERIFIED — CSRF blocks raw fetch, React controlled-input 