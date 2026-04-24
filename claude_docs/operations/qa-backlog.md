# QA Backlog — FindA.Sale
**Last updated:** S561 QA pass (2026-04-24)

---

## 🔍 S561 QA Findings — Batch Pass (findings-only, no fixes)

### Cluster 1 — Nav & Auth Flows

| # | Item | Result | Evidence / Notes |
|---|------|--------|-----------------|
| S534 | AvatarDropdown "Explorer Profile" link (shopper) | ✅ | As Karen: dropdown shows "Explorer Profile" → /shopper/explorer-profile. Desktop ref_182 + mobile ref_219 both correct. ss_2914hd6om |
| S534 | AvatarDropdown CONNECT → Explorer's Guild | ✅ | As Karen: Explorer's Guild → /shopper/guild-primer. As Alice: same. ss_13086r2t9, ss_1997oq62b |
| S540 | AvatarDropdown CONNECT → Rewards | ✅ | As Karen: Rewards → /coupons. As Alice: Rewards → /coupons. Both correct. |
| S542 | Explore nav dropdown | ✅ | Feed / Calendar / Wishlist present. ss_68267lu5f |
| S534 | /shopper/guild-primer loads | ✅ | Title "Explorer's Guild", personalized rank bar (Initiate, 0 XP / 500 XP), Rank Journey section, How to Earn XP, XP table with Hunt Pass column. Dark mode ✅. ss_7558bifrd |
| S534 | Guild Primer → Hunt Pass cross-link | ✅ | "Learn About Hunt Pass" → /shopper/hunt-pass present on page. ref_334 |
| S534 | /shopper/hunt-pass loads — benefit cards | ✅ | All 5 cards: 1.5x XP, Treasure Hunt Pro (+10% QR XP ✅ S551), Golden Trophy Avatar Frame (separate card ✅ S551), Hunt Pass Leaderboard Badge (separate card ✅ S551), More Monthly Coupon Slots (3 Standard / 3 Deluxe / 2 Premium ✅ S551 corrected values). ss_02518ndp0 |
| S544 | Hunt Pass Newsletter → "Coming Soon" amber badge | ✅ | Badge present on newsletter card. ss scroll |
| S534 | Hunt Pass → Guild Primer cross-link | ✅ | "Learn how the Explorer's Guild works →" present. |
| #275 | Hunt Pass cosmetics — nav avatar badge | ✅ | Small trophy badge visible at bottom-right of KA nav avatar. Amber ring effect present. |
| **BUG** | Hunt Pass page CTA for active HP subscriber | ⚠️ P2 | Karen has "Hunt Pass Active" in dropdown but /shopper/hunt-pass shows "Upgrade to Hunt Pass" button — page doesn't detect existing subscription. Should show "Your Pass is Active" / manage state. |
| **⚠️** | Karen XP shows 0 (was 80 XP in S530) | ⚠️ Note | Possible XP reset, data wipe from re-seed, or session/cache issue. Not blocking but worth watching. |
| S541 | /shopper/referrals — "Share & Earn" page | ✅ | Title "Share & Earn", referral link REF-DE2E137A, Copy button, 5 share buttons (SMS/mobile/email/Twitter/link), "Your Referral Stats" section. ss_7068j0rym |
| S540 | /coupons XP Store — shopper tab | ✅ | Standard ($0.75/100 XP/3mo), Premium ($2/200 XP/3mo), Deluxe ($5/500 XP/2mo) with "(Bonus Coupon Slots)" label. Rarity Boost (50 XP) present. Coming Soon: Hunt Pass Discount, Haul Visibility Boost, Seasonal Challenge Access, Username Color. INITIATE · Hunt Pass Active shown after hydration. ss_044759uso |
| S540 | /coupons XP Store — organizer tab (as shopper) | ✅ | Organizer tab accessible per design ("Both tabs are open to everyone"). Discount Codes section shows $1-off 50 XP generator, Max 5/month. Correct copy. ss_044759uso |
| **BUG** | XP Store HP status flash on initial render | ⚠️ P3 | On first render: shows "Hunt Pass Inactive". After hydration: corrects to "INITIATE · Hunt Pass Active". Hydration race condition. ss_137628494 vs ss_137628494 reload |
| **BUG** | Coupon slot counts mismatch: XP Store vs hunt-pass.tsx | ⚠️ P2 | XP Store shows Premium Deal=3/month, Deluxe Deal=2/month. hunt-pass.tsx benefit card shows "3 Standard / 3 Deluxe / 2 Premium". Premium and Deluxe counts are swapped between the two pages. |
| **BUG** | TEAMS workspace setup modal — P1 blocker on organizer dashboard | ❌ P1 | "Welcome to TEAMS!" modal appears on EVERY login for Alice (user1@example.com, TEAMS tier). Modal is fully non-functional: (1) input field does not accept keyboard input, (2) X button does not close modal, (3) Escape key does not close modal, (4) clicking outside modal does not close modal, (5) Next button does not advance even after value injected via JS. Blocks full organizer dashboard access on every login. ss_9308yac3s, ss_7645187sr |
| S529 | Organizer dashboard widgets — visible behind modal | ✅ | Sale Progress (Cataloging, 9/39 tasks, 23%), Sale Pulse (0 Views/Saves/Questions), High-Value Items (empty state correct), Efficiency Coach (Photo→Published 1m, Sell-Through 10%), Bronze Organizer tier badge (1/4 sales to Silver), Past Sales section, Quick action bar (+ New Sale, + Items, POS, Holds, Ripples). All render. ss_3372tv44j, ss_5957w4ihk, ss_66188h4a4 |
| S529 | Organizer dashboard — storefront/sharing widget interaction | UNVERIFIED | Dashboard content visible behind TEAMS modal but interactive testing blocked. Cannot click "Share", "More Options", or other CTAs while modal is present. |

---

### Cluster 3 — S540 Coupons / Rewards / Loyalty

| # | Item | Result | Evidence / Notes |
|---|------|--------|-----------------|
| S540 | Rewards nav link — avatar dropdown CONNECT | ✅ | Karen: CONNECT → Rewards → /coupons confirmed. ss_0381z7ttc (dropdown), ss_8825uu903 (/coupons) |
| S540 | Rewards nav link — code in 4 locations | ✅ | Layout.tsx confirmed: (1) organizer sidebar "Coupons" line 348, (2) shopper sidebar "Rewards" line 565, (3) avatar dropdown large "Rewards" line 1363, (4) mobile menu "Rewards" line 1582. All href="/coupons". |
| **BUG** | Hunt Pass Active dedup on shopper dashboard | ⚠️ P2 | Dashboard shows HP active status twice: (1) green info banner "✓ Hunt Pass active — you're earning 1.5x XP" and (2) full "✅ Hunt Pass Active" card below wishlists. Same message rendered twice on same page. ss_02965cuvg (both visible on scroll) |
| **BUG** | Orphan referral code in localStorage | ⚠️ P2 | `/refer/[code].tsx` stores `pendingReferralCode` in localStorage then redirects to `/register?ref=CODE`. However `register.tsx` only reads ref from URL param — never reads `pendingReferralCode` from localStorage. If user navigates away from /register URL, the stored code is orphaned and never consumed. |
| **BUG** | /refer/[code] — no auth check for logged-in users | ⚠️ P3 | Logged-in user visiting a referral link (e.g. /refer/REF-DE2E137A) gets redirected to /register — no detection of existing session. Should redirect to home/dashboard with "You're already registered" message. ss_4420mas5w |

---

### Cluster 4 — S549 Mobile Overflow Fixes (412px viewport)

| # | Item | Result | Evidence / Notes |
|---|------|--------|-----------------|
| S549 | /shopper/explorer-profile Add buttons | ✅ | Both Specialties and Keywords input+Add button rows fit cleanly within 412px viewport. No overflow, no clipping. ss_09767adts |
| S549 | /organizer/edit-sale ENDED header | ✅ | "Edit Sale (Ended)" title + 3 action buttons (✓ ENDED, Reopen, Settle This Sale) all on one row, no overflow at 412px. ss_6453lmsjc |
| S549 | /organizer/insights SELECT dropdown | ✅ | "Filter by sale" select: width=476px, right=492px < viewport=522px. No horizontal scroll (scrollWidth=508 < vw=522). No overflow. ss_4165p168c |
| **BUG** | /admin/items pagination overflow — S549 NOT FIXED | ❌ P2 | 21 page buttons rendered in single unbroken row. At 412px: pages 1–6 overflow left edge (x=-218 to -20), pages 17–21 overflow right edge (right=529–726 > vw=522). Horizontal scrollbar visible. S549 fix did not address /admin/items pagination. ss_9296fs0zu |
| **BUG** | /admin/items Price column truncated at 412px | ⚠️ P2 | Price values cut off on right side ($1x, $1x, $8x visible but not full amount). Table layout overflows viewport width, column truncated. |
| S549 | /organizer/workspace tab bar | UNVERIFIED | "No workspace found. Create one first." — Alice (user1) has no OrganizerWorkspace record in DB. Cannot test tab bar without a configured workspace. Needs TEAMS onboarding to complete. |
| **BUG** | TEAMS workspace onboarding modal persists every login | ⚠️ P2 | "Welcome to TEAMS!" modal appears on every login for Alice even after dismiss. Consistent with P1 bug noted in Cluster 1, but dismiss-on-reload aspect confirmed here: modal reappears after fresh login. |

---

### Cluster 5 — S550/S559/S560 New Features

| # | Item | Result | Evidence / Notes |
|---|------|--------|-----------------|
| S550 | Affiliate backend routes | ✅ | Direct Railway calls to all 4 affiliate endpoints return 401 (auth-gated = routes deployed). No 404s. |
| #309 | /organizer/consignors — Consignor Portal | ❌ P1 | All API calls 404. Root cause: consignors.tsx uses `api.get('/api/consignors')` but api.ts baseURL already includes `/api` → double prefix → `backend/api/api/consignors`. All 4 operations (list/create/update/delete) broken. Color-rules and locations pages use correct paths — consignors.tsx is the only file with this bug. |
| #310 | /organizer/color-rules — Color Coding Rules | ✅ | Page loads, empty state correct ("No color coding rules yet"), "Add Rule" modal opens and renders correctly. Route confirmed functional. ss via JS React props verification |
| #311 | /organizer/locations — Location Management | ⚠️ P2 | Page renders empty state and "Add Location" button, but on load throws "Workspace not found" error. Root cause: locations page requires OrganizerWorkspace record; Alice (user1) has no workspace (TEAMS modal never completes). Dependent on P1 TEAMS onboarding fix. |
| S560 | /admin/encyclopedia — Curator UI page load | ✅ | Page loads with real data: 57 awaiting review, 20 published, 77 total entries. Entry list shows Title/Category/Triggered By/Created/Preview columns. ss_6309qnxwa |
| S560 | /admin/encyclopedia — Promote/Reject buttons | ✅ | Each row has green "Promote" + red "Reject" action buttons. Confirmed via DOM inspection. |
| S560 | /admin/encyclopedia — "Run Full Curator Pass" button | ✅ | Button fires correctly: goes disabled + text changes to "Running Curator Pass..." → completes in ~5s → resets to enabled. Route `POST /admin/curator/run` confirmed deployed (CSRF-gated 403 on direct call). ss_4764jy322 |
| **BUG** | /admin/encyclopedia — action buttons cut off at viewport edge | ⚠️ P2 | Promote/Reject buttons are clipped at the right edge of the table — not visible without horizontal scroll. Table lacks overflow handling at default viewport width. |
| **BUG** | /admin/encyclopedia — no success toast after Curator Pass | ⚠️ P3 | After "Run Full Curator Pass" completes, no success toast or confirmation message is shown. Silent success. onClick clears error state and refreshes data but never sets a success message. |
| S550 | /shopper/bounties/submissions — page + empty state | ✅ | Navigated as Karen. Page loads: "My Bounty Submissions" title, subtitle correct, All/Pending/Approved/Declined tabs present, empty state "No submissions yet / Post a bounty and organizers will match items to it." renders correctly. ss_9611tddbg |
| S550 | /shopper/bounties/submissions — "Complete Purchase" flow | UNVERIFIED | No BountySubmissions exist in DB (table empty). Cannot test APPROVED submission → "Complete Purchase" button flow. Needs test data seeded: 1 APPROVED BountySubmission linked to Karen's bounty. |

---

## ✅ S531 Fixes — Verified S561

| # | Feature | Result | Evidence |
|---|---------|--------|----------|
| #266 | AvatarDropdown nav link | ✅ | As Karen: dropdown shows "Explorer Profile" → /shopper/explorer-profile. ss_2914hd6om (Cluster 1) |
| #7 | Shopper Referral Rewards | ✅ | /shopper/referrals loads: "Share & Earn" title, referral link REF-DE2E137A, 5 share buttons, stats section. ss_7068j0rym |
| #228 | SettlementWizard fee % | ✅ | Receipt step shows "Platform Fee (0%)" = -$0.00. NOT "200%". Bug is fixed. ss_1876ssi5u |
| per-sale | Analytics filter | ✅ | Selected "ended" sale → header changed to "Filtered to one sale", stat cards showed Total Revenue $27.29 / Net Revenue $25.93 / Conversion Rate 20.0% / Unique Buyers 2 / Avg Cart Value $204.23. ss_0793lrq0p |
| #241 | Brand Kit PDFs | ✅ | fetch() from brand-kit page with JWT → HTTP 200, content-type: application/pdf. All 4 links present: business-card, letterhead, social-headers, yard-sign. |
| #267 | RSVP Bonus XP | ✅ | RSVPd to "Estate Sale: Vintage Textiles, Books, Home Furnishings" as Karen. PointsTransaction created: type=RSVP, points=2. Discoveries notification fired immediately: "Going to this sale!" (bell 4→5). ss_77974sk7l (RSVP confirmed), ss_1247c2s9h (Discoveries notification) |

---

## ✅ S530 Verified This Session

| # | Feature | Result | Evidence |
|---|---------|--------|----------|
| #266 | Explorer Profile page | ✅ | /shopper/explorer-profile loads, title "Explorer Profile", page content correct. ss_2869f4nqu |
| #266 | Old URL redirect | ✅ | /shopper/explorer-passport → /shopper/explorer-profile redirect works. |
| #270 | ExplorerGuildOnboardingCard | ✅ | Card renders on /shopper/dashboard as Karen (INITIATE). +5 XP check-in, +10 XP purchase shown correctly. ss_5437okcli |
| Coupons | Shopper /coupons view | ✅ | 3 tiers (Standard $0.75/100 XP, Premium $2/200 XP, Deluxe $5/500 XP) render. XP balance shows. No organizer section bleeding through. ss_5295sjpyt |
| profileSlug | XP gate in settings | ✅ | /shopper/settings shows "🔒 Costs 1500 XP to unlock" + "Need 1470 more XP" warning. Input disabled. ss_0138pazxx |
| #200 | Shopper public profile | ✅ | /shoppers/[userId] loads Karen's profile. No collectorTitle field. DB confirms column removed. ss_0375t806k |
| S529 | Avatar dropdown rank | ✅ | Dropdown shows compact "Initiate" + 30 XP progress bar. Confirmed live on production. ss_8776p61an |
| #224 | rapid-capture redirect | ✅ | /organizer/rapid-capture correctly redirects to /organizer/sales. ss_0476cyovv |
| #259 | Hunt Pass Page Accuracy | ✅ | /shopper/hunt-pass shows "1.5×" throughout, XP matrix table with correct multiplier math, "6-Hour Early Access to Flash Deals" copy confirmed. |
| #279 | Rare Finds Pass | ✅ | /shopper/rare-finds loads, rarity filters (All / Common / Rare / Very Rare / Ultra Rare) present, empty state correct. |
| #282 | Explorer Profile Completion XP | ✅ | Karen at 30 XP. Filled specialty + category + keyword in /shopper/explorer-profile. Dashboard confirmed 80 / 500 XP. +50 XP one-time award fires correctly. |
| #223 | Organizer Guidance Tooltips (partial) | ⚠️ | /organizer/pricing — TooltipHelper present on all 3 tier name columns (SIMPLE, PRO, TEAMS), content correct. Holds page Grandmaster copy UNVERIFIED (holds list empty — no test data). |
| #272 | Post-Purchase Share | ⚠️ | /shopper/loot-log/[id] shows "Share Your Find!" button. navigator.share wired. Desktop automation cannot trigger native Share dialog — dialog appearance unverifiable. Mechanism present; UX outcome unverified. |

## ❌ Bugs Found S530 (all fixed S531)

| # | Feature | Severity | Status | Bug |
|---|---------|----------|--------|-----|
| #266 | Avatar dropdown nav link | P2 | ✅ FIXED S531 | Dropdown showed "My Profile → /organizer/profile" for all users. Now role-conditional: shoppers see "Explorer Profile → /shopper/explorer-profile". |
| #228 | SettlementWizard fee label | P1 | ✅ FIXED S531 | Receipt step showed "Platform Fee (200%)". Root cause: backend returns commissionRate as integer (8), frontend was doing ×100 again. Removed double-multiply. |
| per-sale | Analytics filter (S528) | P1 | ✅ FIXED S531 | Per-sale filter showed identical data for all selections. Fixed: stat cards now conditionally show PerformanceMetrics data when saleId selected. Also fixed TS type mismatch (Insights→PerformanceMetrics). |
| #241 | Brand Kit PDF generators | P1 | ✅ FIXED S531 | All 4 PDF routes returned 404. Root cause: `authenticate` middleware blocked browser href requests (no auth header). Swapped to `optionalAuthenticate`; PRO gate stays in controller. |
| #7 | Shopper Referral Rewards | P1 | ✅ FIXED S531 | /shopper/referrals page created using existing useReferral hook + backend endpoints. |
| #267 | RSVP Bonus XP | P0 | ✅ FIXED S531 | RSVP routes were registered in rsvpController but never registered in sales.ts Express router. Also added DISCOVERY notification dispatch on RSVP creation. |

## 🔒 DECISION RESOLVED — S531

| Item | Decision |
|------|----------|
| /coupons organizer section tier gate | NOT TEAMS-only. Available to all organizer tiers. Frontend: `{isOrganizer && (`, backend: `requireOrganizer` only. No code change made. (Patrick confirmed S531 init.) |

## ⚠️ S530 UNVERIFIED

| Feature | Reason | What's Needed |
|---------|--------|---------------|
| #235 DonationModal | Bob's ended sale (Estate type) has no charity donations — no donation step appears in wizard | Need a sale with charity close configured to reach DonationModal |
| S529 storefront widget | Pushed — pending Chrome QA | Verify /organizer/dashboard shows Copy Link + View Storefront buttons |
| S529 mobile nav rank | Pushed — requires mobile viewport | Resize to mobile, verify Layout.tsx reads real rank from useXpProfile (not hardcoded Scout) |
| S529 card reader content | Pushed — pending Chrome QA | Verify /faq, /organizer/guide, /support pages show S700/S710 hardware only (no M2, no Tap to Pay) |
| Organizer Insights error | Bob loads fine; error is user-specific | Test as Alice (user1@example.com) — the original "failed to load" reporter |
| #275 Hunt Pass Cosmetics | Karen (user11) does not have Hunt Pass — sees "Upgrade to Hunt Pass" | Need Hunt Pass subscriber account to verify amber avatar ring + 🏆 leaderboard badge |
| #278 Treasure Hunt Pro | Requires Hunt Pass subscriber | Need Hunt Pass account + active QR scan to verify +10% XP bonus |
| #280 Condition Rating XP | Session ended before organizer switch | Login as Bob (user2), set conditionGrade on any item, verify +3 XP fires |
| #281 Streak Milestone XP | Requires 5 consecutive daily visits | Needs real multi-day streak — cannot simulate in automation |
| #255 Rank-Up Notifications | Requires XP threshold crossing | Karen needs ~415 more XP to reach Scout; cannot artificially trigger |
| #257 Scout Hold Duration | Karen is INITIATE (85 XP) | Needs Scout+ account to test 45-min hold duration |
| #268 Trail Completion XP | Karen's trail has 0 stops | Need trail with all stops completed to trigger 100 XP once-only award |
| #261 Treasure Hunt XP Rank Multiplier | Requires QR scan at active sale | Need Ranger+ account + live QR scan |
| #75 Tier Lapse Logic | Needs organizer with lapsed PRO subscription | No lapsed test account available |

---

Priority: P0 (blocker) → P1 (must ship) → P2 (polish) → P3 (minor)

---

## ✅ S525 Verified This Session

| # | Feature | Result | Evidence |
|---|---------|--------|----------|
| S518-A | PostSaleMomentumCard items | ✅ | Navigated to /organizer/dashboard as Alice. PostSaleMomentumCard showed Items Sold=11, Sell-Through=22% for "Downtown Downsizing Sale 21" (sale-specific, not lifetime). |
| S518-B | Legendary chip dismissal | ✅ | Navigated to /organizer/add-items/[saleId]/review as Alice. Clicked "⭐ Legendary?" chip on $75+ Abstract Painting ($185). Chip dismissed visually after click. |
| S518-C | Efficiency Coach label | ✅ | Navigated to /organizer/dashboard as Alice. Efficiency Coach showed "Top 50%" (not "Top 100%"). |
| S518-E | Workspace team chat | ✅ S523 | Chat tabs already verified S523. |
| #249 | SIMPLE Concurrent Sales Gate | ✅ | Navigated to /organizer/create-sale as Grace (SIMPLE, 1 active sale). Amber block appeared with "Upgrade to list more" CTA. |
| #264 | Tier Progress Widget | ✅ | SIMPLE (Grace) sees PRO pitch; PRO (Bob) sees TEAMS pitch; TEAMS (Alice): widget hidden. All correct. |
| #242 | QR/Barcode Item Labels | ✅ | Navigated to /organizer/edit-item/[id] as David (SIMPLE). "Print Label" button present; QR code visible in label preview linking to correct item URL. |
| #276 | Brand Follow | ✅ | Navigated to /shopper/dashboard Brands tab as Karen. BrandFollowManager rendered. Added "Pottery Barn" — appeared in followed list. Removed — disappeared. Reloaded — state persisted. |
| #277 | Haul Posts | ✅ | Feed ✅ (Community Hauls, 3 cards, like 12→13). Create ✅. Like/unlike ✅. Nav link ✅ — found in avatar dropdown → EXPLORE section as "Haul Posts" → /shopper/haul-posts. |
| #252 | Verified Purchase Badge | ✅ | Set verifiedPurchase=true on Karen's review via DB. Navigated to /sales/[DDS1] as Karen. Page text confirms "Karen AndersonVerified Purchase" rendered; JS rect confirms element at y=100 (visible). |
| #228 | Settlement Hub wizard flow | ⚠️ | 5-step wizard navigates correctly (Summary→Expenses→Commission→Payout→Receipt). Dark mode ✓. BUT: platform fee line missing from Receipt step (see bug below). |
| #64 | Save/Wishlist | ✅ | /shopper/wishlist shows "My Collections", no "Favorites" tab present. Nav heart → /shopper/wishlist. /shopper/favorites redirects to /shopper/wishlist correctly. |
| #49 | City Heat Index | ✅ | /city-heat-index redirects to /cities. Page loads "Sales by City" correctly. |
| #200 | Shopper Public Profiles | ⚠️ | Profile renders at /shoppers/[CUID] with name, purchases (8), badges, stats, Recent Finds. purchasesVisible ✅. But: collectorTitle/rank not shown on profile card, slug-based URL (/shoppers/karen-anderson) returns "Shopper not found" — backend resolves by CUID only. |
| W-2 | Workspace Chat UX | ✅ | Navigated to /workspace/test as Alice. Chat tabs appear per sale (DDS1, LES11, Alice's Test, etc.). Clicked tab → message input appeared. Typed "QA test S525" → input cleared on Send (message sent). 15s poll confirmed via network requests. |
| W-3 | Team Members avatars | ✅ | All 6 workspace members show initials avatars (A=green, rest=tan). No "?" placeholders. |

## ❌ Bugs Found S525

| # | Feature | Severity | Bug |
|---|---------|----------|-----|
| #235 | Charity Close + Tax Receipt PDF | P1 | No DonationModal visible anywhere in settlement wizard. No PRO gate upsell CTA. Feature appears unbuilt or unlinked. UNVERIFIED S530 — can't reach donation step without charity-close sale. |
| #224 | Camera Flow Enhancement | ✅ S530 | /organizer/rapid-capture correctly redirects to /organizer/sales. |
| #270 | Explorer's Guild Onboarding Card | ✅ S530 | Card renders for Karen (INITIATE). XP values correct (+5 check-in, +10 purchase). |
| #228 | Settlement Hub platform fee | P1 | S528 fix introduced new bug: "Platform Fee (200%)" — decimal formatting error. Fix: receipt step multiplying percentage twice. ss_4284srfjk |
| #251 | Crossed-Out Price (priceBeforeMarkdown) | P2 | Set priceBeforeMarkdown=65 on item (price=45) in DB. Item detail page shows flat $45.00 — no strikethrough original price rendered anywhere on item detail or sale listing card. |
| #277 | Haul Posts nav link | ✅ RESOLVED | Nav link found in avatar dropdown → EXPLORE → "Haul Posts". Not a bug. |
| #253 | SettlementWizard Transfer ID | UNVERIFIED | Blocked — requires Stripe Connect setup. |
| #266 | Explorer Profile nav link (partial) | P2 | Page and redirect both ✅ S530. Remaining: AvatarDropdown still shows "My Profile → /organizer/profile" instead of "Explorer Profile → /shopper/explorer-profile". |
| #188 | Neighborhood Pages | ✅ S527 | /neighborhoods loads correctly. Verified S527. |
| #200 | Shopper Public Profiles | ✅ S530 | collectorTitle removed from DB and profile (S528 migration). Profile loads at /shoppers/[userId]. P3: badge icons render as circle placeholders, not actual imagery. |
| W-5 | Workspace Create Sale | P3 | "Create Sale" quick action links to /organizer/dashboard, not /organizer/create-sale and not workspace-linked. User lands on dashboard, not on create flow. |

## 🔴 Hot — S518 Fixes Just Deployed (Verify This Session)

| # | Feature | Where | What to verify | Role | S525 Status |
|---|---------|-------|----------------|------|-------------|
| S518-A | PostSaleMomentumCard items | /organizer/dashboard (State 3) | Items Sold + Sell-Through % show sale-specific counts, not lifetime totals | Alice (ADMIN organizer with ended sale) | ✅ S525 |
| S518-B | Legendary chip dismissal | /organizer/add-items/[saleId]/review | Click "⭐ Legendary?" chip on $75+ item → chip dismisses after click (not just fires mutation) | Alice, item ≥$75 | ✅ S525 |
| S518-C | Efficiency Coach label | /organizer/dashboard | "Top 100%" is now replaced by actual percentile rank (e.g. "Top 72%") | Any organizer | ✅ S525 |
| S518-D | Pricing downgrade button | /pricing or /organizer/subscription → pricing link | "Downgrade to Free" button navigates to /organizer/subscription instead of doing nothing | Grace (SIMPLE) | SKIP — Patrick decision pending |
| S518-E | Workspace team chat | /workspace/test | Team Communications shows chat tabs (not "Create a sale" empty state) after fix | Alice | ✅ S523 |

---

## 🟡 Unverified — Blocked on Test Conditions

| # | Feature | Blocker | What's Needed |
|---|---------|---------|---------------|
| S516 | Bump Post feed sort | Need active SALE_BUMP boost | Buy a boost, then verify boosted sale floats above organic in feed |
| S516 | RankUpModal no auto-dismiss | Can't artificially trigger rank-up | Earn enough XP to cross rank threshold, verify modal requires manual close |
| S515 | Sale Pulse vs Ripples count | Need active sale with view data | Compare views on Sale Pulse widget vs /organizer/ripples for same active sale |
| S515 | Who's Coming populated state (#230) | Need shopper to favorite/save a test sale | Have a shopper save a sale, then verify widget shows them on organizer dashboard |
| S516 | Pricing downgrade flow | Grace is SIMPLE, can't downgrade | Need PRO organizer to test DowngradePreviewModal + confirm flow |

---

## 🏗️ Workspace — /workspace/test

| # | Issue | Status | Notes |
|---|-------|--------|-------|
| W-1 | Team Communications empty state bug | ✅ Fixed S518 | Was checking upcomingSales only; test workspace has only past sales. Fixed to allSales. Push needed. |
| W-2 | Team Communications chat UX | ✅ S525 | Chat tabs appear per sale. Message input clears on send (confirmed send fires). 15s poll confirmed via network requests. |
| W-3 | Team Members show as "?" | ✅ S525 | All 6 members show initials avatars (not "?"). Alice = green A, others = tan initials. Working as intended. |
| W-4 | Tasks vs. Sale Checklist | ✅ Clarified | Workspace Tasks = freeform team assignment. Sale Checklist = /organizer/plan/[saleId]. No integration planned. |
| W-5 | "Create a sale" in workspace → wires to workspace? | ⚠️ S525 | "Create Sale" button links to /organizer/dashboard, not /organizer/create-sale. Not workspace-linked. Bug filed above. |

---

## 📋 Feature QA Queue (Shipped — Pending Chrome Verification)

### Organizer Features

| # | Feature | Tier | Where | What to verify |
|---|---------|------|-------|----------------|
| 235 | Charity Close + Tax Receipt PDF | PRO | /organizer/settlement/[saleId] | DonationModal 3-step wizard, PRO gate upsell CTA, receipt step in SettlementWizard | ❌ S525 — no DonationModal found anywhere in wizard |
| 241 | Brand Kit Expansion | PRO | /organizer/brand-kit | 4 PDF generators (biz cards, letterhead, social headers, branded yard sign), PRO gate | ⬜ FIXED S531 — auth fixed, pending Chrome QA |
| 242 | QR/Barcode Item Labels | SIMPLE | /organizer/edit-item/[id] | Print Label button present, QR codes link to correct item pages | ✅ S525 |
| 249 | SIMPLE Concurrent Sales Gate | SIMPLE | /organizer/create-sale | As SIMPLE with 1 active sale, create a 2nd → amber block + Upgrade CTA appears | ✅ S525 |
| 228 | Settlement Hub | SIMPLE | /organizer/settlement/[saleId] | Full wizard: expenses, client payout, platform fee shows correct % (2%, not 200%), dark mode | ⬜ FIXED S531 — fee % double-multiply removed, pending Chrome QA |
| 253 | SettlementWizard Transfer ID | SIMPLE | Settlement wizard receipt step | clientPayoutStripeTransferId displayed + failure reason banner | UNVERIFIED — needs Stripe Connect |
| 264 | Tier Progress Widget | SIMPLE/PRO | /organizer/dashboard | SIMPLE sees PRO pitch; PRO sees TEAMS pitch; TEAMS: widget hidden | ✅ S525 |
| 224 | Camera Flow Enhancement | SIMPLE | /organizer/rapid-capture | Lighting tiers, shot guidance copy, AI confidence copy on PreviewModal | ✅ S530 — redirect to /organizer/sales works |
| 223 | Organizer Guidance Tooltips | ALL | /organizer/pricing, /organizer/holds | TooltipHelper on tier names, Grandmaster copy on holds | ⚠️ S530 — pricing tooltips ✅ all tiers; holds Grandmaster copy UNVERIFIED (empty holds page) |
| 75 | Tier Lapse Logic | PRO | Dashboard when subscription lapsed | Lapse banner, features suspend, re-sub restores | Pending |

### Shopper Features

| # | Feature | Tier | Where | What to verify |
|---|---------|------|-------|----------------|
| 7 | Shopper Referral Rewards | FREE | /shopper/referrals | Referral link displays, WhatsApp/SMS/Twitter/Email/copy share buttons, stats | ⬜ FIXED S531 — page created, pending Chrome QA |
| 251 | Crossed-Out Price (priceBeforeMarkdown) | SIMPLE | Any item card or detail | Set priceBeforeMarkdown on item → crossed-out original price appears | ❌ S525 — set $65 in DB, item detail shows flat $45.00, no strikethrough |
| 252 | Verified Purchase Badge | FREE | Sale item reviews | Submit review as shopper who purchased item → ✓ Verified Purchase badge shows | ✅ S525 — "Verified Purchase" text rendered on Karen's review (confirmed via page text + JS rect) |
| 254 | Hunt Pass 1.5x XP Multiplier | PAID_ADDON | Purchase as Hunt Pass subscriber | XP awarded is 1.5× standard; hunt-pass.tsx shows 1.5× everywhere | Pending |
| 255 | Rank-Up Notifications | FREE | Notifications after rank-up | Earn enough XP to rank up → congratulatory notification appears | Pending — needs XP trigger |
| 256 | Referral Signup XP | FREE | Sign up with referral code | Referrer gets 20 XP notification; first purchase gives referrer 30 XP | Pending |
| 257 | Scout Hold Duration | FREE | Hold as Scout rank user | Hold shows 45 min (not 30) | Pending |
| 259 | Hunt Pass Page Accuracy | PAID_ADDON | /shopper/hunt-pass | "1.5×" everywhere, XP matrix table present, flash deals say "6 hours early" | ✅ S530 |
| 261 | Treasure Hunt XP Rank Multiplier | FREE | Scan QR as Ranger+ | ~38 XP for Ranger (1.5×), ~44 for Sage, ~50 for Grandmaster | Pending |
| 267 | RSVP Bonus XP | FREE | RSVP to a sale | 2 XP awarded; Discoveries notification fires; cap 10 XP/month | ⬜ FIXED S531 — routes registered + notification added, pending Chrome QA |
| 268 | Trail Completion XP | FREE | Complete all stops on a trail | 100 XP once-only awarded | Pending |
| 269 | Legendary Flash Deal Gating | FREE/PAID | Flash deal starting <6h | Initiate: hidden; Sage+/Hunt Pass: visible | Pending |
| 270 | Explorer's Guild Onboarding Card | FREE | /shopper/dashboard (new/Initiate) | Dismissible card for INITIATE rank; dismiss persists (localStorage) | ✅ S530 — card renders for Karen (INITIATE), XP values correct |
| 272 | Post-Purchase Share Your Haul | FREE | /checkout-success or /purchases/[id] | "Share Your Haul" section renders, Web Share API works | ⚠️ S530 — button present on /shopper/loot-log/[id], navigator.share wired; desktop dialog unverifiable |
| 273 | Rank Achievement Share | FREE | /shopper/notifications | Share button on rank-type notifications | Pending |
| 274 | Trail Completion Share | FREE | /shopper/trails/[trailId] | Celebration + share button after all stops scanned | Pending |
| 275 | Hunt Pass Cosmetic Add-ons | PAID_ADDON | Avatar, leaderboard, hunt-pass page | Amber ring on avatar, 🏆 badge on leaderboard | UNVERIFIED S530 — Karen has no Hunt Pass (confirmed "Upgrade to Hunt Pass" shown) |
| 276 | Brand Follow | FREE | /shopper/dashboard Brands tab | BrandFollowManager renders, follow/unfollow works | ✅ S525 |
| 277 | Haul Posts | FREE | /shopper/haul-posts + /shopper/haul-posts/create | Feed page, create page, like/unlike, nav link present | ⚠️ S525 — feed/create/like ✅, nav link missing from all nav locations |
| 278 | Treasure Hunt Pro (Hunt Pass) | PAID_ADDON | QR scan as Hunt Pass subscriber | +10% XP bonus, 150 daily cap | Pending |
| 279 | Rare Finds Pass | PAID_ADDON | /shopper/rare-finds | Early visibility filter, RareFindsFeed widget on dashboard | ✅ S530 — page loads, rarity filters present, empty state correct |
| 280 | Condition Rating XP | SIMPLE | Set condition grade on item | 3 XP awarded once per item when conditionGrade first set | Pending |
| 281 | Streak Milestone XP | FREE | Visit 5+ consecutive days | 5/10/20 XP at 5/10/20-day streaks | Pending |
| 282 | Collector Passport Completion XP | FREE | Fill specialties+categories+keywords | 50 XP once-only | ✅ S530 — Karen 30→80 XP after filling specialty+category+keyword |

### Navigation / Core

| # | Feature | Where | What to verify |
|---|---------|-------|----------------|
| 266 | Explorer Profile rename | Layout, AvatarDropdown | Page ✅, redirect ✅, AvatarDropdown shopper link now "Explorer Profile → /shopper/explorer-profile" | ⬜ FIXED S531 — AvatarDropdown role-conditional, pending Chrome QA |
| 200 | Shopper Public Profiles | /shoppers/[id] | profileSlug, purchasesVisible, collectorTitle renders | ✅ S530 — collectorTitle removed, profile loads. P3: badge icons show as circles |
| 64 | Save/Wishlist | /shopper/wishlist or My Collections nav | Nav unified, favorites tab removed, redirects work | ✅ S525 |
| 188 | Neighborhood Pages | /neighborhood/[name] | 14 GR neighborhood pages load, content correct, links work | ❌ S525 — page file doesn't exist, all URLs 404 |
| 49 | City Heat Index | /city-heat-index | Redirects to /cities correctly | ✅ S525 |

### eBay / Integrations

| # | Feature | Where | What to verify |
|---|---------|-------|----------------|
| 25 | Persistent Inventory + eBay Sync | /organizer/inventory, /organizer/settings/ebay | Import flow, Pull to Sale, direct push, post-sale panel. S464 ebayNeedsReview flow |

---

## 🔧 Partial / Known Issues

| # | Feature | Issue | Notes |
|---|---------|-------|-------|
| 172 | Stripe Connect Setup | Full e2e payout not verified | Connect account → make sale → money arrives in bank |
| 132 | À La Carte Single-Sale Fee | End-to-end flow not verified | Purchase flow, receipt, organizer sees payment |
| 27 | CSV/JSON Exports | PRO gate verified; real data not re-verified | Need purchase data to verify purchases.csv rows |
| 66 | Open Data Export (ZIP) | purchases.csv header-only | Need real purchases to verify full content |
| 31 | Brand Kit | Colors/logo load; auto-propagation not tested | Upload brand kit → verify propagates to social templates |
| 174 | Auction Mechanics | Pending QA | Reserve price check, winner checkout link, organizer close notification |
| 146 | Item Holds | Partial | HoldButton + countdown verified. Full E2E with GPS gate + expiry not retested since S338 |
| 122 | Explorer's Guild Phase 1 | Partial | Rank + character sheet verified. XP cap, visit XP, onboarding modal not yet. |

---

## 🛠️ Railway MCP — Remove Recommendation

Railway OAuth is firing **twice on every prompt** with no Cowork-native replacement in the registry. The Railway MCP provides: `list-projects`, `list-services`, `redeploy`, `accept-deploy`, `get-deployment`, `get-runtime-logs`. 

**Recommendation: Remove the Railway plugin.** Operations using it:
- Deployment status → covered by Vercel MCP + GitHub MCP commit checks
- Runtime logs → Patrick can check Railway dashboard directly; psycopg2 covers DB queries
- Force redeploy → Patrick uses `.\push.ps1` which triggers auto-deploy

The double-OAuth per prompt is a worse UX trade-off than the occasional convenience. Uninstall via Cowork plugin manager.

---

*Generated S518. Update by adding `S[N] verified ✅` or `S[N] bug found ❌` in the Notes column.*
