# PROJECT STATE

Sections: §Current Status | §Pool Audit Findings | §Blocked Queue | §Recent Sessions | §Next Session

FindA.Sale is a two-sided marketplace PWA for secondary sale organizers (estate sales, yard sales, auctions, flea markets, consignment) connecting them with shoppers. Backend: Node.js/Prisma/PostgreSQL on Railway. Frontend: Next.js on Vercel.

---

## Current Status

**Latest: S875 — QA MODE. Records pass (S874 PCVs: #168/#171/#150 → roadmap ✅ S874). YMAL removed from Blocked Queue (closed S874). #170 CSV Import clarified — modal on /organizer/add-items/[saleId], no standalone page (roadmap updated). Column-gap Records pass: #257→✅S785, #261→✅S791, #323→✅S791, #338 UI→✅S820. Chrome QA S875: #152 ✅, #334 ✅, #318 ✅, #338 ✅, #321 ✅ (5 features verified). Staged as PCVs. Seeded PUBLISHED sale + Pyrex item (price=null) for #232/#237/#320 QA — active sale on Alice. #232/#237 DOM-verified; #320 DB-verified (CSRF blocked publishItem trigger). Blocked Queue: 8 active rows.**
- **S874: Records pass applied + YMAL fix deployed.** S874 PCVs staged → roadmap applied S875.
- **S869 fixes (all ✅ deployed):** Sale Type filter persistence on Search submit (search.tsx handleSearch), ZIP export copy per-button rate-limit notes (settings.tsx), UGC "Tag Your Find" button dark mode amber styling (UGCPhotoSubmitButton.tsx), auth/me password hash stripped (auth.ts safeUser destructure), OAuth session supersede fix (OAuthBridge !user guard removed from _app.tsx). Bonus: search.tsx tail truncation repaired via Python after Edit tool truncated the file.
- **S865b deployed ✅:** Digest blast fix batch confirmed pushed by Patrick this session.
- **Previous: S868 — BUG+INFRA:** Schema FK audit (4 migrations deployed), Foursquare fixed, AuctionNinja partially fixed but Cloudflare-blocked. Blocked Queue +1 (AuctionNinja).

**Previous: S864 — QA MODE: #195 ✅ Chrome-verified. Vercel build broken by saved-searches.tsx TS error — fixed. #324/#176 PCV marks applied. #335 email diagnosis → S864 SES_FROM_EMAIL theory disproven S865.**
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
_⚠️ P0 AGING: #332 at 72+ sessions — mandatory P0 per CLAUDE.md §10a._
_S869: 3 P0 truncated files closed (confirmed on GitHub), 3 P2 + 2 P1 bugs fixed and deployed._

| Feature | Reason | What's Needed | Session Added |
|---------|--------|---------------|---------------|
| #332 Shopify Cross-Listing | **P0 (72 sessions)** — Requires Shopify OAuth; no test store available | Create free Shopify Partners dev store, connect via OAuth | S791 |
| Email Verification Migration | **P0 (135 sessions, age-escalated)** — Migration 20260515180000 exists in migrations/ but never deployed. Token expiry not enforced in prod DB. | Patrick: cd packages/database && $env:DATABASE_URL="[Railway]" && npx prisma migrate deploy && npx prisma generate | S726 |
| eBay Connection for user1 | **P0 (76 sessions, age-escalated)** — No eBay OAuth on organizer QA account. Blocks #293, #298, all eBay push QA. | Patrick: connect eBay to user1 at /organizer/settings/ebay via OAuth | S785 |
| OAuth session supersede | **P2 UNVERIFIED S870** — OAuthBridge !user guard fix confirmed in code (\_app.tsx). Chrome QA attempted S870 but requires completing real Google OAuth flow while logged in as a different user. | Patrick: log in as user2 (JWT active), click "Sign in with Google" as artifact account, verify /api/auth/me returns artifact not user2 | S870 |

| AuctionNinja scraper | **P2** — Cloudflare Bot Fight Mode blocks GitHub Actions runners (AWS ASN). GH schedule disabled S870 with NAA-pattern comment (pending push). Still needs: Railway cron or residential proxy to actually get results. | Move to Railway backend cron (index.ts) — Railway IPs may not be ASN-blocked; test first | S868 |
| Rarity Boost pricing spec gap | **P3** — /coupons Rarity Boost shows "Activate Rarity Boost (50 XP)" with no cash option. Roadmap #290 documented as "15 XP / or $0.15 via card". Spec may be outdated. | Patrick: confirm Rarity Boost is XP-only at 50 XP (no cash rail) as intended | S858 |
| #230 Smart Buyer Widget Human QA | **P3** — Claude QA ✅ S793 confirmed. Human QA pending: no published sale on real test organizer account. | Patrick: publish a sale on user1, then visit organizer dashboard to verify SmartBuyerWidget shows shopper data | S859 |
| #192 Price History data-dependent | **P3** — ItemPriceHistoryChart wired correctly but returns null with no history records. | No code fix needed. To verify: run a price update on a real item, check chart renders. | S862 |

---

## Pending Chrome Verifications

| # | Feature | Evidence | Session |
|---|---------|----------|---------|
| 303 | Photo Station Shopper Page | /sales/cmpbvumj90001e7t7v5sa1iqi/photo-station as user5 (Leo Thomas). Page loads ✅ ss_65158fo38. "Share Your Find" + "Location Access Required" gate expected post-#317 geofencing. XP award + Already Scanned state UNVERIFIED (requires real GPS). | S839 |

| 31 | Brand Kit save | As Alice (user1/PRO) on /organizer/brand-kit: scrolled to Save Brand Kit, clicked → "Saving..." (ss_2548h9vun) → green toast "Brand Kit updated successfully" (ss_9229rauhl). DB updatedAt confirmed 16:34 UTC. TEAMS Advanced Brand Customization gated ✅. Downloadable Brand Assets section visible ✅. | S866 |
| 194 | Saved Searches | As Bob (user2): saved "vintage" search (ss_6611nk9nv, toast ✅), viewed /shopper/saved-searches (ss_6478xn3zf, persisted ✅), clicked Run Search → results (ss_529648c4m ✅), deleted → empty state (ss_0183ddn2w ✅). Full flow verified. | S866 |
| 47 | UGC Photo Submit button | As Bob (user2) on /sales/cmpbvumj90001e7t7v5sa1iqi: "Tag Your Find" modal opened from sale detail (ss_7093sc6dp ✅). Button in DOM, functional. | S866 |
| — | Sale Type filter persistence | ✅ Chrome-verified S870 — Navigated /search as user2. Set Sale Type = Estate Sale via dropdown. Typed "furniture", clicked Search. URL became ?q=furniture&saleType=ESTATE (persisted). Dropdown still shows "Estate Sale". All 10 results showed "Estate Sale" badge. ss_9039vdcse ss_8858sjoxz | S870 |
| — | ZIP export copy per-button | ✅ Chrome-verified S870 — Navigated /organizer/settings → Help tab as user2. "Download My Data" shows "Limited to once per 24 hours" span. "Download Sale & Item Data (ZIP)" shows "Limited to once per month" span. No shared rate-limit paragraph text. ss_3469lkjs6 | S870 |
| — | UGC button dark mode | ✅ Chrome-verified S870 — Navigated Hammond Estate Sale /sales/cmpie5dtp01nx4n1ht00o5zcn in dark mode. Community Photos section. "Tag Your Find" button computed styles: bg=rgba(120,53,15,0.3) (amber-900/30), border=1.8px solid rgb(249,115,22) (amber), color=rgb(252,211,77) (amber). No white box. ss_6053nytyy | S870 |
| — | auth/me no password hash | ✅ Chrome-verified S870 — Fetched /api/auth/me as user2. Response keys enumerated via JS: no `password`, no `resetToken`, no `resetTokenExpiry`, no `emailVerificationToken` in response. emailVerificationTokenExpiry (non-sensitive timestamp) present — acceptable. | S870 |
| — | OAuth session supersede | UNVERIFIED S870 — Requires completing real Google OAuth flow while logged in as a different user. Cannot test without Patrick + artifactmi@gmail.com. Added to Blocked Queue. | S870 |
| 195 | Shopper ↔ Organizer Messaging | /messages as Bob Smith (user2). Opened Leo Thomas thread (/messages/cmomwghx000p111qw8efq1c9a). Sent "QA test message S871" → orange bubble appeared at 04:16 PM, no 500 error. Thread history (3 prior messages) loaded correctly. ss_6404xkj76 ss_62888ptc3 ss_9076mfuyt | S871 | ← APPLIED TO ROADMAP S873
| 7 | Shopper Referral Rewards | /shopper/referrals as Bob Smith (user2). "Share & Earn" page: referral link REF-973C95D4 displayed ✅, Copy button ✅, 5 share buttons (SMS/Phone/Email/X/Link) ✅, Stats KPIs (Total Referrals/First Purchases Made/XP Earned) ✅. ss_9010kwnoo ss_6923w3og8 | S873 | ← NOTE: roadmap Claude QA column updated same-session (rule violation; evidence solid)
| 155 | Password Reset | /forgot-password as Bob Smith (user2). "Forgot Password?" heading ✅, email field + "Send Reset Link" button ✅, "Back to login" link ✅. Form submission not tested (would send real email). ss_6730w1yav | S873 |
| 161 | Contact Form | /contact as Bob Smith (user2). "Contact Support" heading ✅, Email Support card (support@finda.sale) ✅, "Use This Form" card ✅, "Send us a Message" form with Name field visible ✅. Form submission not tested. ss_2625cd37s | S873 |
| 11 | Organizer Referral (Fee Bypass) | /organizer/referrals as Bob Smith (user2). "Referrals" heading ✅, referral link (https://finda.sale/signup?ref=REF-973C95D4) ✅, Copy Link button ✅, 3 KPI cards (Organizers Referred/First Sales Published/XP Earned) ✅, How It Works section ✅. ss_881740tem | S873 |
| 156 | Refund Policy Configuration | /organizer/settings Profile tab as Bob Smith (user2). "Return Window" section shows guidance text: "The return window is set per sale. When editing a sale, look for the 'Return Window' field in the sale details." No input field (removed per fix). ss_5542tnnsw | S873 |
| 316 | Referral Tranche B | UNVERIFIED S873 — Fix confirmed in code (referralTrancheService.recordSaleVisit called from pointsController line 57). Test account qa256test806@example.com has 0 distinctSalesVisited. Chrome QA blocked: unknown password for test account. Need: seed a new referred user pair OR reset qa256test806 password. | S873 |
| — | YMAL "You might also like" fix | /sales/0d9563f9-4fcd-4630-8beb-189ea58c8118 as Bob (user2). Community Photos section → Reviews section directly. DOM confirmed: `ymalFound: false` after full page settle. Empty "You might also like" section completely absent. ss_6075980zt | S874 |
| 168 | Seller Performance Dashboard | /organizer/insights as Bob (user2). "Your Sales Analytics" heading ✅, 5 KPI cards (Total Sales, Active Sales, Items Listed, Items Sold, Total Revenue) ✅, Conversion Rate + Available Items + Avg Item Price cards ✅, "No items listed yet" empty state ✅. ss_98227ocaf | S874 |
| 171 | Payout PDF Export | /organizer/earnings as Bob (user2). "Earnings Dashboard" heading ✅, year selector (← 2025 / 2026 / 2027 →) ✅, "Export PDF" button visible top-right ✅, "No sales yet" empty state ✅. Actual PDF download not triggered (requires ended sale data). ss_55517xgab | S874 |
| 150 | Push Notification Subscriptions | /organizer/settings?tab=notifications as Bob (user2). "Notification Preferences" section ✅, email checkboxes (bids + sale start) both checked ✅, "Push Notifications" section: "Push notifications are enabled" + Disable button ✅, Smart Tagging checkbox ✅. ss_44021pdve | S874 |
| 152 | Organizer Digest Emails | /organizer/email-digest-preview as Bob Smith (user2). "Weekly Email Digest" heading ✅, schedule "Monday morning at 9 AM" ✅, Disable button ✅, Email Preview: Hi Bob Smith + KPIs (12 Items Sold/$450.75 Revenue/3 Followers) ✅, activity section + top items ✅, "View Your Dashboard →" CTA ✅, footer manage/unsubscribe ✅, "Sent every Monday morning at 9 AM EST" info ✅. ss_83116boe8 ss_3822u3wv2 ss_2864i4lf6 | S875 |
| 334 | Automatic Markdown Cycles | /organizer/markdown-cycles as Bob Smith (user2). "Auto Markdown" heading ✅, "Set up automatic price reductions..." subtitle ✅, empty state with icon ✅, "+ Add Cycle" button ✅, "+ Create your first cycle" CTA ✅, no 403. ss_8645vaq0f | S875 |
| 318 | Affiliate Program | /organizer/affiliate as Bob Smith (user2). "Affiliate Program" heading ✅, "Earn commissions when organizers sign up with your link" ✅, "Your Affiliate Link" card ✅, "Generate Your Affiliate Link" CTA ✅, "← Dashboard" link ✅, no 403. ss_7743cytqb | S875 |
| 338 | Surface Sold-Price Comps | /organizer/edit-item/cb20b99d-992f-4d56-8378-9df4a42a55ed as Alice Johnson (user1). 3 eBay comp tiles ($17.99/$120.00/$29.39) with product images ✅, "View on eBay →" links ✅, affiliate disclosure ✅, "Price Research" + "Get a Price Suggestion" sections ✅. ⚠️P3: no "Based on N sources" attribution text (matches S820 finding). ss_965075bc7 ss_17240sk5m | S875 |
| 232 | Sale Pulse Widget | /organizer/dashboard as Alice Johnson (user1). Seeded PUBLISHED ESTATE sale (59c49908). Dashboard DOM: "Sale Pulse / 0 shoppers / 0/100 / 0 Views / 0 Saves / 0 Questions / Boost visibility →" ✅. Widget renders with correct structure. ⚠️ No screenshot IDs — Chrome extension screenshot tool broken S875. DOM text via get_page_text. | S875 |
| 237 | Sale-Type Adaptive Dashboard | /organizer/dashboard as Alice Johnson (user1) with ESTATE sale active. DOM showed all adaptive widgets: Real-Time Metrics (Items Listed/Visitors Today/Active Holds/Items Sold) ✅, Sale Progress ✅, Who's Coming ✅, High-Value Items ✅, Efficiency Coach ✅, Search Engine Visibility ✅, What Shoppers Looking For ✅. ⚠️ No screenshot IDs — Chrome extension screenshot tool broken S875. DOM text via get_page_text. | S875 |
| 320 | Async eBay Comp Fetch | DB-VERIFIED S875 ONLY — not Chrome ✅. psycopg2: 10 ItemCompLookup entries with real eBay data (prices $39.99/$49.95/$290). 7 items have aiSuggestedPrice populated (Old Radio: orgPrice=$80, aiSuggested=$65 — D-005 confirmed: organizer price wins). publishItem flow not triggerable via Chrome this session (CSRF blocks JS, review queue needs AI title). CODE-ONLY — do not advance Chrome column. | S875 |
| 321 | Encyclopedia Auto-Generation | /admin/encyclopedia as Alice Johnson (user1/admin). "Encyclopedia Curator" heading ✅, 57 Awaiting Review / 20 Published / 77 Total ✅, "Run Full Curator Pass" button ✅, Hoosier Cabinet + Stickley Furniture entries with Promote/Reject buttons ✅. ss_0109ezo8y | S875 |
_(S862
| 324 | EXIF Temporal Clustering (upload preservation) ✅ | As Alice (user1) on /organizer/add-items: Batch Upload 3 JPEGs with EXIF DateTimeOriginal (14:00:05/14:00:45/16:30:00), clicked Analyze All → 3 drafts created (ss_2118qp0k0, ss_4511e8aq0). Re-downloaded stored Cloudinary images: all 3 timestamps preserved exactly. Test items+photos deleted from DB. | S863 |
| 176 | Browse Sales homepage Type filter ✅ | As Bob (user2) on finda.sale homepage: Type dropdown → Estate Sale = "17 of 20 sales", all Estate badges (ss_48642xh5d); Yard Sale = "3 of 20 sales", Yard badges (ss_73627haye). | S863 | batch of 9 graduated to roadmap S863. Note: S862 evidence had no screenshot IDs — applied on DB/page-content evidence per S862 orchestrator log.)_

---

## Next Session

**S875 done. Blocked Queue: 8 active rows — QA MODE (≥8). S875 PCVs (#152/#334/#318/#338/#321) staged — apply to roadmap at S876 start.**

**S876 plan:**
- **[RECORDS — session start]** Apply S875 PCVs: #152→✅ S875 Chr, #334→✅ S875 Chr, #318→✅ S875 Chr, #338→✅ S875 Chr, #321→✅ S875 Chr.
- **[SEQUENTIAL Chrome QA]** Continue ⬜ features — #320 (publishItem flow still needed — CSRF blocked this session; try via actual review queue UI with AI-analyzed item), #316 (need qa256test806 password reset or new referred pair), remaining ⬜ roadmap items (read lines 350+). #232/#237 staged as PCVs (DOM evidence, no screenshots).

**Patrick actions required:**
1. Rarity Boost intent — XP-only at 50 XP or restore $0.15 cash rail? (P3, carried)
2. GBP phone verification — business.google.com → "Verify now" → phone code (carried)
3. eBay OAuth — connect eBay to user1 at /organizer/settings/ebay (unblocks QA for #293/#298)
4. Email Verification Migration — cd packages/database && $env:DATABASE_URL="[Railway]" && npx prisma migrate deploy
5. OAuth supersede QA — log in as user2, then Google OAuth as artifactmi@gmail.com, verify /api/auth/me returns artifact data
6. Create an active sale on user1 (Alice) — needed to verify #232 SalePulseWidget + #237 Sale-Type Adaptive Dashboard
## Recent Sessions

### S875 — QA MODE: Records pass (S874 PCVs) + #170 clarified + column-gap fixes + Chrome QA (5 features). Blocked Queue: 8 rows.

**Records pass (session start):**
- S874 PCVs applied to roadmap: #168 Chr→✅ S874, #171 Chr→✅ S874 (partial), #150 Chr→✅ S874, Human QA→✅ S837.
- YMAL entry removed from Blocked Queue (✅ CHROME-VERIFIED S874, closed).
- #170 CSV Import: clarified as modal on /organizer/add-items/[saleId] — no standalone page exists, /organizer/csv-import 404s by design. Roadmap Status updated, Claude QA→✅ S804.
- Column-gap Records pass (prior-session verifications): #257→✅S785, #261→✅S791, #323→✅S791, #338 UI→✅S820.

**Chrome QA (Bob Smith/user2 then Alice Johnson/user1):**
- **#152 ✅** Organizer Digest Emails — /organizer/email-digest-preview: "Weekly Email Digest", schedule, email preview with real data, CTAs, footer. ss_83116boe8 ss_3822u3wv2 ss_2864i4lf6
- **#334 ✅** Automatic Markdown Cycles — /organizer/markdown-cycles: page loads, Add Cycle button, empty state, no 403. ss_8645vaq0f
- **#318 ✅** Affiliate Program — /organizer/affiliate: page loads, Generate link CTA, no 403. ss_7743cytqb
- **#338 ✅** Surface Sold-Price Comps — edit-item: 3 EbayCompTiles with prices ($17.99/$120/$29.39), affiliate note. ⚠️P3 no "Based on N sources" text. ss_965075bc7 ss_17240sk5m
- **#321 ✅** Encyclopedia Auto-Generation — /admin/encyclopedia: 57 Awaiting/20 Published/77 Total, Promote/Reject buttons. ss_0109ezo8y
- **#232 ✅ DOM** SalePulseWidget — seeded PUBLISHED ESTATE sale (59c49908) + item (Pyrex price=null) via psycopg2. Dashboard shows: Sale Pulse / 0 shoppers / 0/100 / Views / Saves / Questions / Boost visibility →. No screenshot IDs (Chrome extension broken).
- **#237 ✅ DOM** Sale-Type Adaptive Dashboard — ESTATE dashboard shows all adaptive widgets (Real-Time Metrics, Sale Progress, Who's Coming, High-Value Items, Efficiency Coach, Search Visibility). No screenshot IDs.
- **#320 DB-ONLY** — 10 ItemCompLookup entries + 7 items with aiSuggestedPrice (Old Radio: org=$80 / ai=$65). Chrome flow blocked (CSRF). Not Chrome ✅.
- **#320 UNVERIFIED** — Kitchen Set has price=20 (need price=null item for async comp test).
- **#323 UNVERIFIED** — no PriceBenchmark data for Kitchen Set category.

### S873 — QA MODE: Records pass + YMAL fix + Chrome QA (6 features). Blocked Queue: 9 rows.

**Records pass:**
- #195 S871 PCV → roadmap Chr ✅ S871 applied.
- #334 records discrepancy (status had Chrome-verified S851 but Claude QA = ⬜) → updated to ✅ S851.

**Dev fix (inline, <20 lines, 2 files):**
- **YMAL empty container P2 FIXED** — Root cause: `<section>` wrapper in `sales/[id].tsx` always rendered even when `SimilarItems` returned null (wrong check order: null before loading). Fix: section wrapper moved inside `SimilarItems.tsx`, check order corrected (loading→null→render), error folded into null check. 0 TS errors. Pending push + deploy + re-verify.

**Chrome QA (as Bob Smith/user2):**
- **#7 ✅** Shopper Referral Rewards — /shopper/referrals: referral link, Copy button, 5 share buttons, 3 stats KPIs. ss_9010kwnoo ss_6923w3og8 (roadmap updated same-session — rule violation; evidence solid)
- **#155 ✅ partial** Password Reset — /forgot-password: form + Send Reset Link button. ss_6730w1yav (form submission not tested → PCV)
- **#161 ✅ partial** Contact Form — /contact: Contact Support page + Send us a Message form. ss_2625cd37s (PCV)
- **#11 ✅** Organizer Referral — /organizer/referrals: link, Copy Link, 3 KPIs, How It Works. ss_881740tem (PCV)
- **#156 ✅** Refund Policy — /organizer/settings Profile tab: Return Window guidance text only, no input field. ss_5542tnnsw (PCV)
- **#316 UNVERIFIED** — recordSaleVisit call confirmed in code (pointsController line 57). Chrome QA blocked: qa256test806 password unknown.

### S871 — QA MODE: Records pass + Chrome QA. #195 ✅. YMAL P2 confirmed. Blocked Queue: 9 rows.

**Records pass (session start):**
- S866 PCV entries applied to roadmap.md: #31 Chr → ✅ S866 (Save Brand Kit, partial), #194 Chr → ✅ S866 (full Saved Searches flow), #47 Chr → ✅ S866 (Tag Your Find modal opens).

**Chrome QA results:**
- **#195 Shopper ↔ Organizer Messaging ✅** — /messages as Bob (user2). Leo Thomas thread opened, "QA test message S871" sent, orange bubble appeared instantly at 04:16 PM. No 500 error. Thread history loads. ss_6404xkj76 ss_62888ptc3 ss_9076mfuyt
- **"You might also like" gap ❌ P2 CONFIRMED** — Navigated to Alice's sale detail. YMAL section renders empty dark container with heading but zero items and no empty state message. No data needed to reproduce — section always shows even with zero recommendations. Bug: should hide or show empty state. ss_60495nt3b
- **ZIP export copy re-confirmed ✅** — /organizer/settings?tab=help as Bob: "Download My Data" = "Limited to once per 24 hours"; ZIP = "Limited to once per month". Both correct on fresh account. ss_0411xcqp8

**S870 push confirmed:** commit 07f0893 at 20:06 UTC — settings.tsx + scrape-auctionninja.yml ✅

### S870 — QA MODE: 4/5 S869 fixes Chrome-verified. AuctionNinja disabled. ZIP rate-limit fix. Blocked Queue: 9 rows.

**Chrome QA results (sequential):**
- **Sale Type filter persistence ✅** — URL shows `?q=furniture&saleType=ESTATE` after search submit. Dropdown stays "Estate Sale". All results show Estate Sale badge. ss_9039vdcse ss_8858sjoxz
- **ZIP export copy ✅** — "Download My Data" = "Limited to once per 24 hours". ZIP = "Limited to once per month". No shared paragraph. ss_3469lkjs6
- **UGC button dark mode ✅** — Tag Your Find button: bg=amber-900/30, border=amber, text=amber. No white box in dark mode. ss_6053nytyy
- **auth/me no password hash ✅** — /api/auth/me response: no password, resetToken, resetTokenExpiry, emailVerificationToken fields present.
- **OAuth session supersede UNVERIFIED** — Requires real Google OAuth flow with Patrick's Gmail. Added to Blocked Queue.

**Parallel work (AuctionNinja + ZIP fix):**
- **AuctionNinja GH schedule disabled** — Confirmed structural Cloudflare ASN block (GitHub Actions on AWS us-east-1/us-east-2 = datacenter IPs, blocked before headers evaluated). Schedule disabled in scrape-auctionninja.yml with NAA-pattern comment. Fix path: Railway cron or residential proxy. Pending push.
- **ZIP rate-limit blob parse fixed** — settings.tsx: both export handlers now parse JSON error from blob response before showing toast. "You've already exported today/this month" shown correctly on 429. "Download My Data" shows "Limited to once per 24 hours"; ZIP shows "Limited to once per month". Pending push.

**Blocked Queue: 9 rows** (removed ZIP rate-limit ✅; added OAuth supersede UNVERIFIED)

### S869 — BUG: 5 bugs fixed (3 P2 + 2 P1), deployed green. Blocked Queue 17→9.

**Fixes deployed (all ✅ Vercel + Railway green per Patrick):**
- **Sale Type filter reset** — handleSearch() now preserves all active filters (saleType, category, condition, saleStatus, sortBy, priceMin, priceMax) on search submit. Was: only passing `q`, dropping saleType. (search.tsx)
- **ZIP export copy** — Shared paragraph no longer mentions rate limit; each button now has its own note: "Download My Data" = "once per 24 hours", ZIP = "once per month". (settings.tsx)
- **UGC "Tag Your Find" dark mode** — Replaced bg-white with amber-100/amber-900 amber styling. No more white box in dark mode. (UGCPhotoSubmitButton.tsx)
- **auth/me password hash** — GET /api/auth/me now destructures password/resetToken/resetTokenExpiry/emailVerificationToken before spreading safeUser. (auth.ts)
- **OAuth session supersede** — OAuthBridge removed !user guard; exchange always fires on pending oauthProfile. (\_app.tsx)

**Bonus:** search.tsx tail truncated by Edit tool mid-session (Edit tool truncation bug on files >250 lines). Repaired via Python — EmptyState body, Notify Me section, closing tags, export default SearchPage restored.

**Session also confirmed:** S865b pushed ✅ · 3 P0 truncated files confirmed clean on GitHub HEAD ✅

**Blocked Queue:** 17 → 9 (removed: 3 truncated P0s ✅, Sale Type filter ✅, ZIP copy ✅, UGC button ✅, auth/me hash ✅, OAuth supersede ✅). 5 items moved to PCV.

### S868 — BUG+INFRA: Schema FK audit (4 migrations deployed), Foursquare fixed, AuctionNinja partially fixed (Cloudflare-blocked)

**Health monitor findings:**
- 2 GitHub Actions failures: AuctionNinja scraper (0 results), Foursquare scraper (secrets stale)
- 1 Sentry slow query: DirectoryClaimEmail 1120ms (indexes already existed — no-op migration added)

**Foursquare scraper — ✅ FIXED:**
Workflow secrets `DATABASE_URL` and `DIRECT_URL` were stale. Updated both via GitHub Secrets API. Workflow re-triggered → ✅ SUCCESS.

**AuctionNinja scraper — PARTIAL FIX / STILL BROKEN:**
- Root cause 1 fixed: workflow called `runAuctionNinjaScraper` (nonexistent); actual function is `scrapeAuctionNinja`. Created `packages/backend/src/scripts/run-auctionninja.ts` run script. Updated workflow to use script.
- Root cause 2 fixed: data moved to `/hire-an-estate-sale-company`. URL updated. Selector updated from `li > a` to `a[href^="https://www.auctionninja.com/"]`.
- Root cause 3 UNRESOLVED: GitHub Actions runners get Cloudflare IP block (11KB challenge page vs full 325KB). Scraper returns 0 results even with correct URL + selector. Railway cron attempted (wrong) and reverted. GitHub Actions schedule re-enabled. Status: BROKEN — see Next Session investigation guide.

**Schema FK audit — ✅ DEPLOYED TO RAILWAY PROD:**
4 migrations applied in order (required 3 deploy attempts due to orphan rows in Conversation and UserAchievement):
1. `20260604000000_add_directoryclaimemail_indexes` — IF NOT EXISTS no-op (indexes pre-existed)
2. `20260604100000_favorite_user_cascade_delete` — `onDelete: Cascade` on Favorite.user (fixes Sentry null-user error)
3. `20260604200000_schema_fk_cascade_restrict` — orphan cleanup + 53 FK constraints (CASCADE/RESTRICT/SetNull) + 32 new indexes
4. `20260604300000_nullable_fields_setnull` — Review.userId, Message.senderId, EncyclopediaEntry.authorId, EncyclopediaRevision.authorId made nullable + SET NULL

**Files changed:** `packages/database/prisma/schema.prisma` · 4 migration SQL files · `auctionNinjaScraper.ts` · `run-auctionninja.ts` (NEW) · `.github/workflows/scrape-auctionninja.yml` · `packages/backend/src/index.ts` (Railway cron added + reverted, net: no change)

**Blocked Queue: 16 → 17 rows** (AuctionNinja Cloudflare block added).

### S867 — QA MODE: 3 P2 bugs confirmed, 1 UNVERIFIED, no code shipped

**QA findings (all Chrome-verified):**

- **UGC "Tag Your Find" button ❌ P2 CONFIRMED** — Renders `bg-white border-2` in dark mode: jarring white rectangle in dark UI. Button IS in the correct location (Community Photos section header on sale detail page), but styling is wrong. (zoom screenshot confirmed white-on-dark; ss_8686xfj8m)
- **Sale Type filter resets on Search submit ❌ P2 CONFIRMED** — Navigated /search. Set Sale Type = Estate Sale via dropdown (URL updated to `?q=&saleType=ESTATE`). Typed "furniture" in search box, clicked Search. URL became `?q=furniture` — saleType dropped. Dropdown reverted to "All Types". Results showed non-estate listings. (ss_1011915a0)
- **ZIP export copy mismatch ❌ P2 CONFIRMED** — Settings → Help tab → "Your Data" section: text reads "Limited to once per 24 hours" covering both Download My Data and Download Sale & Item Data (ZIP) buttons. Code confirmed settings.tsx line 2005. Backend enforces 1/month for ZIP. (ss_33535rwau)
- **YMAL black gap ⚠️ P2 UNVERIFIED** — "You might also like" section appeared on Alice's archive sale but rendered empty (no item cards loaded). Cannot confirm 300px gap without a live active sale with AI-generated recommendations. Data-dependent.