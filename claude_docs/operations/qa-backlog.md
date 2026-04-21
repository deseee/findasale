# QA Backlog — FindA.Sale
**Last updated:** S530 wrap (2026-04-21)

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

## ❌ Bugs Found S530

| # | Feature | Severity | Bug |
|---|---------|----------|-----|
| #266 | Avatar dropdown nav link | P2 | Dropdown shows "My Profile → /organizer/profile" instead of "Explorer Profile → /shopper/explorer-profile". S528 rename not applied to AvatarDropdown. Fix: update the nav link label and href in the dropdown component. |
| #228 | SettlementWizard fee label | P1 | Receipt step shows "Platform Fee (200%)" — decimal-to-percent formatting bug. $25/$1250 = 2% but renders as 200%. S528 fix introduced the regression. Fix: check the % calculation in Receipt step — likely multiplying decimal by 100 twice. ss_4284srfjk |
| per-sale | Analytics filter (S528) | P1 | /organizer/insights per-sale filter shows identical data for "All Sales" and any individual sale selection. Subtitle updates but all 8 stat cards show same numbers. Endpoint exists but data is not scoped. (Pre-compaction finding) |
| #241 | Brand Kit PDF generators | P1 | All 4 PDF download buttons on /organizer/brand-kit link to /api/brand-kit/organizer/[type] — all return 404. UI is fully built (Business Cards, Letterhead, Social Headers, Yard Sign buttons present). Backend endpoints don't exist. |
| #7 | Shopper Referral Rewards | P1 | /shopper/referrals → 404. /shopper/referral → 404. No referral link anywhere on shopper dashboard or nav. Feature page does not exist despite being in backlog as shipped. |
| #267 | RSVP Bonus XP | P0 | RSVP XP not firing. Clicked "📅 Going" on Downtown Downsizing Sale 17 as Karen (confirmed no Hunt Pass). No Discoveries notification in /shopper/notifications after click. XP went from 80→85 (+5) — does not match expected 2 XP. Source of +5 XP unexplained. RSVP award mechanism broken. ss_9247vqrq4 |

## 🔔 DECISION NEEDED — S530

| Item | Current State | Options |
|------|--------------|---------|
| /coupons organizer section tier gate | "Shopper Discount Codes" (50 XP) section visible to PRO organizers. Patrick indicated this should be TEAMS-only. | GATE to TEAMS only / Keep on PRO / Remove |

## ⚠️ S530 UNVERIFIED

| Feature | Reason | What's Needed |
|---------|--------|---------------|
| #235 DonationModal | Bob's ended sale (Estate type) has no charity donations — no donation step appears in wizard | Need a sale with charity close configured to reach DonationModal |
| S529 storefront widget | Pending push — not on production | Push S529, then verify /organizer/dashboard shows Copy Link + View Storefront |
| S529 mobile nav rank | Pending push + requires mobile viewport | Push S529, resize to mobile, verify Layout.tsx reads real rank from useXpProfile |
| S529 card reader content | Pending push | Push S529, then verify /faq, /organizer/guide, /support pages show S700/S710 hardware info |
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
| 241 | Brand Kit Expansion | PRO | /organizer/brand-kit or similar | 4 PDF generators (biz cards, letterhead, social headers, branded yard sign), PRO gate | ❌ S530 — P1, UI present, all 4 PDF endpoints (/api/brand-kit/organizer/[type]) return 404 |
| 242 | QR/Barcode Item Labels | SIMPLE | /organizer/edit-item/[id] | Print Label button present, QR codes link to correct item pages | ✅ S525 |
| 249 | SIMPLE Concurrent Sales Gate | SIMPLE | /organizer/create-sale | As SIMPLE with 1 active sale, create a 2nd → amber block + Upgrade CTA appears | ✅ S525 |
| 228 | Settlement Hub | SIMPLE | /organizer/settlement/[saleId] | Full wizard: expenses, client payout, platform fee line visible, dark mode | ⚠️ S525 — wizard flow ✅, platform fee missing from receipt |
| 253 | SettlementWizard Transfer ID | SIMPLE | Settlement wizard receipt step | clientPayoutStripeTransferId displayed + failure reason banner | UNVERIFIED — needs Stripe Connect |
| 264 | Tier Progress Widget | SIMPLE/PRO | /organizer/dashboard | SIMPLE sees PRO pitch; PRO sees TEAMS pitch; TEAMS: widget hidden | ✅ S525 |
| 224 | Camera Flow Enhancement | SIMPLE | /organizer/rapid-capture | Lighting tiers, shot guidance copy, AI confidence copy on PreviewModal | ✅ S530 — redirect to /organizer/sales works |
| 223 | Organizer Guidance Tooltips | ALL | /organizer/pricing, /organizer/holds | TooltipHelper on tier names, Grandmaster copy on holds | ⚠️ S530 — pricing tooltips ✅ all tiers; holds Grandmaster copy UNVERIFIED (empty holds page) |
| 75 | Tier Lapse Logic | PRO | Dashboard when subscription lapsed | Lapse banner, features suspend, re-sub restores | Pending |

### Shopper Features

| # | Feature | Tier | Where | What to verify |
|---|---------|------|-------|----------------|
| 7 | Shopper Referral Rewards | FREE | /shopper/referrals | Referral link displays, WhatsApp/SMS/Twitter/Email/copy share buttons, stats | ❌ S530 — P1, page doesn't exist (/shopper/referrals → 404), no dashboard link |
| 251 | Crossed-Out Price (priceBeforeMarkdown) | SIMPLE | Any item card or detail | Set priceBeforeMarkdown on item → crossed-out original price appears | ❌ S525 — set $65 in DB, item detail shows flat $45.00, no strikethrough |
| 252 | Verified Purchase Badge | FREE | Sale item reviews | Submit review as shopper who purchased item → ✓ Verified Purchase badge shows | ✅ S525 — "Verified Purchase" text rendered on Karen's review (confirmed via page text + JS rect) |
| 254 | Hunt Pass 1.5x XP Multiplier | PAID_ADDON | Purchase as Hunt Pass subscriber | XP awarded is 1.5× standard; hunt-pass.tsx shows 1.5× everywhere | Pending |
| 255 | Rank-Up Notifications | FREE | Notifications after rank-up | Earn enough XP to rank up → congratulatory notification appears | Pending — needs XP trigger |
| 256 | Referral Signup XP | FREE | Sign up with referral code | Referrer gets 20 XP notification; first purchase gives referrer 30 XP | Pending |
| 257 | Scout Hold Duration | FREE | Hold as Scout rank user | Hold shows 45 min (not 30) | Pending |
| 259 | Hunt Pass Page Accuracy | PAID_ADDON | /shopper/hunt-pass | "1.5×" everywhere, XP matrix table present, flash deals say "6 hours early" | ✅ S530 |
| 261 | Treasure Hunt XP Rank Multiplier | FREE | Scan QR as Ranger+ | ~38 XP for Ranger (1.5×), ~44 for Sage, ~50 for Grandmaster | Pending |
| 267 | RSVP Bonus XP | FREE | RSVP to a sale | 2 XP awarded; cap 10 XP/month | ❌ S530 — P0, award not firing; no Discoveries notification; XP delta unexplained |
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
| 266 | Explorer Profile rename | Layout, AvatarDropdown | Page ✅, redirect ✅. AvatarDropdown nav link still shows "My Profile → /organizer/profile" | ⚠️ S530 — partial. AvatarDropdown fix still needed |
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
