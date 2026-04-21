# Patrick's Dashboard — S536 Complete

## What Happened This Session

S536: Full XP economy security audit (hacker agent, 19 findings) + all P0/P1/P2 fixes shipped + three deferred XP wirings finally wired.

## ✅ Done This Session — Security Hardening (S536 Batch 1)

| What | Details |
|------|---------|
| Cap fail-open → fail-closed | checkDailyXpCap + checkMonthlyXpCap now return 0 on DB error (was returning full cap — anyone could bypass all XP rate limits during DB instability) |
| spendXp() atomic | Now uses updateMany with WHERE guildXp >= amount — prevents concurrent double-spend race |
| REFERRAL_FIRST_PURCHASE secured | 24h holdUntil from payment added; purchaseId linked so chargeback claw-back now works |
| ORGANIZER_REFERRAL_PURCHASE atomic | Status set to CREDITED BEFORE XP fires (was after — race allowed double-award); hardcoded 500 → XP_AWARDS constant |
| Both referral awards purchaseId-linked | REFERRAL_FIRST_PURCHASE and ORGANIZER_REFERRAL_PURCHASE now pass purchaseId to awardXp — chargeback reversal was completely blind to both |
| SALE_PUBLISHED one-time | Added idempotency check — only fires on organizer's very first publish ever (was every publish = free farm) |
| Visit XP race fixed | All concurrent visit checks wrapped in Prisma $transaction to prevent two simultaneous requests both earning XP |
| HAUL_POST cap renamed | HAUL_POST_COUNT:4 → HAUL_POST:60. The old value of 4 meant the cap fired after earning just 4 XP total — effectively blocking after the 1st haul post (which gives 15 XP). Now correctly capped at 60 XP/month (4 posts × 15 XP) |
| ORG_HAUL_FROM_SALE capped | 100 XP/month cap added (was uncapped — coordinated haul ring could spam organizer XP) |
| HP churn hold fail-closed | applyHuntPassChurnHold now returns 30-day hold on DB error (was returning null = no hold) |
| Leaderboard userId removed | Public leaderboard no longer exposes primary DB keys (IDOR enumeration vector) |
| Referral codes now crypto | Math.random() → crypto.randomBytes(4) in referralService |
| Self-referral IP logging | authController logs referrer/referee IP pair post-referral for fraud ring detection |

## ✅ Done This Session — New XP Wirings (S536 Batch 2)

| What | XP | Details |
|------|----|---------|
| HAUL_POST_LIKES | 5 | haulPostController addReaction(): fires when post hits 10+ likes, once per post (PointsTransaction idempotency). UGCPhotoReaction has DB-level unique constraint — duplicate likes blocked. |
| ORG_SHOPPER_SIGNUP | 10 | stripeController: fires on shopper's first-ever purchase (purchaseCount===1), awards to sale organizer. purchaseId idempotency guard. No monthly cap per gamedesign spec. |
| REFERRAL_ORG_FIRST_SALE | 50 | saleController updateSaleStatus: fires on organizer's first published sale. Looks up ReferralReward to find referring shopper. Description-scoped idempotency. Non-blocking. |

## 🚩 Still Open

| Item | Details |
|------|---------|
| phoneVerified missing from User model | REFERRAL_FIRST_PURCHASE (500 XP) gamedesign spec requires phone verification before award fires. Field doesn't exist. Needs phone verification feature OR GameDesign to document exception. |

## ⬜ Still Needs Chrome QA

| Feature | Where | What to Verify |
|---------|-------|----------------|
| Guild Primer | /shopper/guild-primer | All expanded tables, HP column, tiered trail table, dark mode, personalized bar if logged in |
| Hunt Pass CTA | /shopper/hunt-pass | Hero, price card, 4 benefits, CTAs, cross-link → /shopper/guild-primer |
| Mobile nav guild link | Mobile hamburger | Explorer's Guild → /shopper/guild-primer |
| AvatarDropdown guild link | Desktop → avatar → CONNECT | Explorer's Guild → /shopper/guild-primer |
| RankUpModal dark mode | Trigger rank-up | Perks box dark:bg-gray-700 |
| #267 RSVP Bonus XP | /sales/[id] → Going as Karen | 2 XP + Discoveries notification |
| #241 Brand Kit PDFs | /organizer/brand-kit as PRO | All 4 PDF links download |
| #7 Referral Rewards | /shopper/referrals as Karen | Page loads, referral link + share |
| #228 Settlement fee % | Settlement → Receipt step | 2% NOT 200% |
| Per-sale analytics | /organizer/insights → select sale | Stat cards update |
| #266 AvatarDropdown | As Karen → avatar dropdown | "Explorer Profile → /shopper/explorer-profile" |
| S529 Storefront widget | /organizer/dashboard | Copy Link + View Storefront |
| S529 Mobile nav rank | Mobile viewport | Real rank (not hardcoded Scout) |
| S532 Quick Picker | /workspace/[slug] as TEAMS | Quick Add → modal → tasks appear |

## Build Status

| Service | Status |
|---------|--------|
| Vercel (frontend) | ✅ Green |
| Railway (backend) | ✅ Green |
| S534+S535 changes | ⚠️ Unpushed (include in push below) |
| S536 Batch 1 (security) | ⚠️ Unpushed |
| S536 Batch 2 (wirings) | ⚠️ Unpushed |

## Your Push Blocks

Push these in order. Each one builds on the last.

### Push 1 — S534+S535 (older unpushed work)
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
git commit -m "S534+S535: Guild Primer, Hunt Pass CTA, XP repricing, 8 new XP constants, controller wiring"
.\push.ps1
```

### Push 2 — S536 Security Hardening
```powershell
git add packages/backend/src/services/xpService.ts
git add packages/backend/src/services/referralService.ts
git add packages/backend/src/controllers/haulPostController.ts
git add packages/backend/src/controllers/stripeController.ts
git add packages/backend/src/controllers/saleController.ts
git add packages/backend/src/controllers/authController.ts
git commit -m "Security: XP economy hardening — P0/P1/P2 audit fixes

- Cap enforcement fails closed on DB error (was fail-open — full bypass on DB blip)
- spendXp() atomic via updateMany WHERE guard (prevents concurrent overdraft)
- REFERRAL_FIRST_PURCHASE: 24h payment clearance hold + purchaseId for claw-back
- ORGANIZER_REFERRAL_PURCHASE: status CREDITED before XP fires (prevents double-award race)
- Both referral awards: purchaseId + 72h holdUntil linked (claw-back was blind to these)
- SALE_PUBLISHED XP now one-time only (first publish milestone, not every publish)
- Visit XP race condition: checks wrapped in Prisma transaction to serialize concurrent requests
- HAUL_POST_COUNT cap renamed HAUL_POST: 60 (4 was wrong — fired after 1st post)
- ORG_HAUL_FROM_SALE: 100 XP/month cap added (was uncapped)
- applyHuntPassChurnHold fails closed on error (was fail-open)
- getLeaderboard removes userId from response (IDOR enumeration prevention)
- Referral code generation uses crypto.randomBytes (replaces Math.random)
- Self-referral IP pair logging added to auth for fraud pattern detection
- ORGANIZER_REFERRAL_PURCHASE: 500 added to XP_AWARDS constant (was hardcoded)"
.\push.ps1
```

### Push 3 — S536 XP Wirings + Docs
```powershell
git add packages/backend/src/controllers/haulPostController.ts
git add packages/backend/src/controllers/stripeController.ts
git add packages/backend/src/controllers/saleController.ts
git add claude_docs/STATE.md
git add claude_docs/patrick-dashboard.md
git add claude_docs/strategy/roadmap.md
git commit -m "Feature: Wire deferred XP awards + S536 wrap docs

- HAUL_POST_LIKES (5 XP): fires when haul post hits 10+ likes, once per post
- ORG_SHOPPER_SIGNUP (10 XP): fires on shopper first purchase, awards to sale organizer
- REFERRAL_ORG_FIRST_SALE (50 XP): fires on organizer first published sale, awards to referrer
- STATE.md, patrick-dashboard.md, roadmap.md updated for S536"
.\push.ps1
```
