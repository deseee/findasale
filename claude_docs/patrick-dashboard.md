# Patrick's Dashboard — S538 Complete

## What Happened This Session

S538: Shopper video pages rebuilt. Previous session had wrong rank icons (⚔️🏹📚 from skill file, not app code) and stale data. All 8 files rebuilt/patched with authoritative data from guild-primer.tsx.

## ✅ Done This Session

| What | Details |
|------|---------|
| guild-xp-ad.html rebuilt | 1,423 lines. Correct icons: 🧭🔍🎯✨👑. Correct XP: visit=5, purchase=10, auction win=20, haul=15, streak=100, referral=500. 7-scene RAF animation, embed mode for guild-primer iframe. |
| shopper-video-ad.html patched | SCOUT icon ⚔️→🔍. Haul post XP +5→+15. |
| hunt-pass-video-ad.html + wrapper | 1,268-line animation (no "6 hours early" — correct "early access before doors open") + 499-line wrapper page. |
| haul-post-video-ad.html + wrapper | 1,329-line animation (15 XP/post, +5 at 10 likes) + 426-line wrapper. |
| treasure-trails-video-ad.html + wrapper | 1,030-line animation (40/50/60/70/80 XP by stops, route map) + 436-line wrapper. |

## 🚩 Still Open

| Item | Details |
|------|---------|
| phoneVerified missing from User model | REFERRAL_FIRST_PURCHASE (500 XP) spec requires phone gate. Field doesn't exist. Needs phone verification feature or GameDesign exception. |

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
| S538 video pages | ⚠️ Unpushed (Push 5 below) |
| S537 changes | ⚠️ Unpushed (Push 1 below) |
| S534+S535 changes | ⚠️ Unpushed (Push 2 below) |
| S536 Batch 1 (security) | ⚠️ Unpushed (Push 3 below) |
| S536 Batch 2 (wirings) | ⚠️ Unpushed (Push 4 below) |

## Your Push Blocks

Push these in order.

### Push 1 — S537 (this session)
```powershell
git add packages/frontend/components/Layout.tsx
git add packages/frontend/next.config.js
git add packages/frontend/pages/_app.tsx
git add CLAUDE.md
git add claude_docs/STATE.md
git add claude_docs/patrick-dashboard.md
git commit -m "S537: Beta badge, www redirect, canonical tag, cred cleanup, dispatch rule, Railway CLI"
.\push.ps1
```

### Push 2 — S534+S535 (older unpushed work)
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
git add packages/frontend/components/AvatarDropdown.tsx
git add packages/frontend/components/RankUpModal.tsx
git commit -m "S534+S535: Guild Primer, Hunt Pass CTA, XP repricing, 8 new XP constants, controller wiring"
.\push.ps1
```

### Push 3 — S536 Security Hardening
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

### Push 4 — S536 XP Wirings + Docs
```powershell
git add packages/backend/src/controllers/haulPostController.ts
git add packages/backend/src/controllers/stripeController.ts
git add packages/backend/src/controllers/saleController.ts
git add claude_docs/strategy/roadmap.md
git commit -m "Feature: Wire deferred XP awards

- HAUL_POST_LIKES (5 XP): fires when haul post hits 10+ likes, once per post
- ORG_SHOPPER_SIGNUP (10 XP): fires on shopper first purchase, awards to sale organizer
- REFERRAL_ORG_FIRST_SALE (50 XP): fires on organizer first published sale, awards to referrer"
.\push.ps1
```

### Push 5 — S538 Shopper Video Pages
```powershell
git add packages/frontend/public/guild-xp-ad.html
git add packages/frontend/public/shopper-video-ad.html
git add packages/frontend/public/hunt-pass-video-ad.html
git add packages/frontend/public/hunt-pass-video.html
git add packages/frontend/public/haul-post-video-ad.html
git add packages/frontend/public/haul-post-video.html
git add packages/frontend/public/treasure-trails-video-ad.html
git add packages/frontend/public/treasure-trails-video.html
git add claude_docs/STATE.md
git add claude_docs/patrick-dashboard.md
git commit -m "Rebuild all shopper video pages with correct rank icons and XP values

- guild-xp-ad.html: Full rebuild 1,423 lines — correct icons 🔍🎯✨, correct XP
  values from guild-primer.tsx (auction win 20 XP, haul 15 XP, streak 100 XP)
- shopper-video-ad.html: Fix SCOUT icon (war-sword→magnifying glass), haul XP +5→+15
- hunt-pass-video-ad.html: New 1,268-line animation — no stale '6 hours early' copy
- hunt-pass-video.html: Converted to proper wrapper (embeds -ad.html in phone frame)
- haul-post-video-ad.html: New 1,329-line animation (15 XP/post, +5 at 10 likes)
- haul-post-video.html: Converted to proper wrapper
- treasure-trails-video-ad.html: New 1,030-line animation (40-80 XP scaling by stops)
- treasure-trails-video.html: Converted to proper wrapper"
.\push.ps1
```
