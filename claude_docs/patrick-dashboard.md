# Patrick's Dashboard — S535 Complete

## What Happened This Session

S535: Implemented all missing XP earning actions — new constants in xpService.ts, controller wiring across 5 controllers, guild-primer "How to Earn XP" fully rebuilt with Hunt Pass 1.5× column and tiered trail tables.

## ✅ Done This Session (S534+S535 — both unpushed)

| What | Details |
|------|---------|
| 8 new XP_AWARDS constants | FIRST_PURCHASE_EVER(50), HAUL_POST_LIKES(5), SALE_PUBLISHED(10), ORG_SHOPPER_SIGNUP(10), ORG_HAUL_FROM_SALE(3), ORG_FIVE_STAR_REVIEW(10), REFERRAL_ORG_FIRST_SALE(50), BOUNTY_FULFILLMENT_SHOPPER(25) |
| TRAIL_COMPLETE removed | Misleading flat 100 removed. trailController already uses tiered completionBonus() (40/50/60/70/80 by stop count). hasEarnedTrailBonus() updated to match. |
| XP_SINKS fixed | GUIDE_PUBLICATION 50→100, HAUL_VISIBILITY_BOOST 10→80 (matches boostPricing.ts) |
| saleController bug fix | SALE_PUBLISHED was awarding XP_AWARDS.REFERRAL_SIGNUP — now correctly uses XP_AWARDS.SALE_PUBLISHED |
| bountyController wired | BOUNTY_FULFILLMENT_SHOPPER (25 XP) fires when shopper fulfills a bounty |
| reviewController wired | ORG_FIVE_STAR_REVIEW (10 XP) fires when organizer gets a 5-star review |
| haulPostController wired | ORG_HAUL_FROM_SALE (3 XP) fires when shopper publishes haul from organizer's sale |
| stripeController wired | FIRST_PURCHASE_EVER (50 XP) fires on first purchase only (purchaseCount === 1) |
| guild-primer How to Earn rebuilt | Hunt Pass 1.5× column on all tables, new "In-Person: Hunt & Scan" section, tiered Trail Completion Bonus table (40/50/60/70/80 XP), Organizer Bonuses expanded from 2→8 rows, all new actions surfaced |

Also from S534 (still unpushed):

| What | Details |
|------|---------|
| boostPricing.ts repriced | All 9 items + 4 new dual-rail entries |
| hunt-pass.tsx refactored | 997→177 lines — slim CTA, cross-links to /guild-primer |
| guild-primer.tsx created | Full Explorer's Guild walkthrough page at /shopper/guild-primer |
| Layout.tsx + AvatarDropdown | Explorer's Guild links → /shopper/guild-primer |
| RankUpModal dark mode | dark:bg-sage-900/20 → dark:bg-gray-700 |

## 🚩 Deferred (Need Infrastructure Design)

| Item | XP | Why Deferred |
|------|----|----|
| Haul post hits 10+ likes | 5 | No like-count threshold hook exists |
| Shopper signs up to your sale | 10 | No RSVP/signup hook identified — fraud surface needs design |
| Refer organizer — their first sale | 50 | No organizer referral system — needs Architect design |

## ⬜ Needs Chrome QA

| Feature | Where | What to Verify |
|---------|-------|----------------|
| Guild Primer rebuild | /shopper/guild-primer | All expanded tables render, HP column shows, tiered trail table, dark mode, personalized bar if logged in |
| Hunt Pass CTA | /shopper/hunt-pass | Hero, price card, 4 benefits, CTAs, cross-link → /shopper/guild-primer |
| Mobile nav guild link | Mobile (430px) → hamburger | Explorer's Guild → /shopper/guild-primer |
| AvatarDropdown guild link | Desktop → avatar → CONNECT | Explorer's Guild → /shopper/guild-primer |
| RankUpModal dark mode | Trigger rank-up or dev-force | Perks box should be dark:bg-gray-700 |
| #267 RSVP Bonus XP | /sales/[id] → click Going as Karen | 2 XP awarded + Discoveries notification |
| #241 Brand Kit PDFs | /organizer/brand-kit as PRO | All 4 PDF links download (not 404) |
| #7 Referral Rewards | /shopper/referrals as Karen | Page loads, referral link + share buttons |
| #228 Settlement fee % | /organizer/settlement → Receipt step | Shows 2% NOT 200% |
| Per-sale analytics | /organizer/insights → select a sale | Stat cards update to per-sale data |
| #266 AvatarDropdown | As shopper (Karen) → avatar dropdown | "Explorer Profile → /shopper/explorer-profile" |
| S529 Storefront widget | /organizer/dashboard | Copy Link + View Storefront buttons |
| S529 Mobile nav rank | Mobile viewport | Real rank (not hardcoded "Scout") |
| S532 Quick Picker | /workspace/[slug] as TEAMS user | "Quick Add" → modal → tasks appear |

## Still Unverified (Need Special Setup)

| Feature | What's Needed |
|---------|---------------|
| #275 Hunt Pass Cosmetics | Hunt Pass subscriber account |
| #278 Treasure Hunt Pro | Hunt Pass + active QR scan |
| #280 Condition Rating XP | Log in as Bob, set conditionGrade on any item |
| #235 DonationModal | Sale with charity close configured |
| #281 Streak Milestone | Real 5-day consecutive streak |
| #255/#257/#261/#268 | Higher XP rank / trail with stops / Ranger+ |
| #75 Tier Lapse | PRO account with lapsed subscription |

## Your Pending Actions

Push ALL S534+S535 changes in one go (both sessions unpushed — combined push block below).

## Build Status

| Service | Status |
|---------|--------|
| Vercel (frontend) | ✅ Green (last push S533) |
| Railway (backend) | ✅ Green (last push S533) |
| S534+S535 changes | Local — not pushed yet |

## S534+S535 Combined Push Block

```powershell
git add packages/backend/src/services/boostPricing.ts
git add packages/backend/src/services/xpService.ts
git add packages/backend/src/controllers/saleController.ts
git add packages/backend/src/controllers/bountyController.ts
git add packages/backend/src/controllers/reviewController.ts
git add packages/backend/src/controllers/haulPostController.ts
git add packages/backend/src/controllers/stripeController.ts
git add packages/frontend/pages/shopper/hunt-pass.tsx
git add packages/frontend/pages/shopper/guild-primer.tsx
git add packages/frontend/components/Layout.tsx
git add packages/frontend/components/AvatarDropdown.tsx
git add packages/frontend/components/RankUpModal.tsx
git add claude_docs/STATE.md
git add claude_docs/patrick-dashboard.md
git commit -m "S534+S535: Guild Primer, Hunt Pass CTA, XP repricing, 8 new XP constants, controller wiring, tiered trail table"
.\push.ps1
```
