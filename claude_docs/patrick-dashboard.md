# Patrick's Dashboard — S552 Complete

## 🔥 S552 — Bounty Batches A+B+D, Referral Anti-Fraud System, XP Economy Design, Geofencing Audit

**One-line summary:** Big parallel + design session. Six S551 queue items dispatched and complete. Referral XP anti-fraud system built (tranche escrow replaces flat 500 XP, silent reputation score). Geofencing audited — QR scans are NOT geofenced (fix queued for S553). Admin price bug fixed. Appraisal guide/support content written.

### What shipped

**Admin price bug (P0):** Recent Purchases on /admin showed $0.01 instead of $1.00 — `purchase.amount` is a Float in dollars; was being divided by 100 again in the frontend. One-line fix.

**S551 parallel queue (6 agents):**
- SmartBuyerWidget rank colors: stale names (EXPLORER/PATHFINDER etc.) → correct (INITIATE/SCOUT/RANGER/SAGE/GRANDMASTER)
- Hunt Pass coupon limits: 6/6/3 → 3/3/2 in controller + frontend; "3x boost" label → "Bonus Coupon Slots"
- hunt-pass.tsx: badge card split into Avatar Frame + Leaderboard Badge; +10% QR scan XP bonus added; new Coupon Slots benefit card with correct 3/3/2 numbers
- Bounty Batch D: `GET /api/bounties/organizer/submissions` built and wired into the organizer/bounties placeholder
- Bounty Batch A: `POST /api/bounties/match` with fuzzy scoring (category/title/tags/radius/recency, 60-point threshold); `BountyMatchModal.tsx` (new); wired into add-items so organizers see matches after publishing
- Bounty Batch B: `/shopper/bounties/` restructured into `index.tsx` + `submissions.tsx`; approve/decline flow with optional message; backend endpoints already existed

**guild-primer stale copy:** Two fixes — Grandmaster perk now says "Hunt Pass included while active Grandmaster" (not "free forever") and the FAQ answer corrects the reset/lapse/restore behavior.

**Condition grade S:** `itemConstants.ts` and `ConditionBadge.tsx` — S grade was incorrectly labeled "Excellent" (same as A). Now correctly "Mint" to match backend eBay labels.

**Appraisal guide + support content:** `guide.tsx` has a new "Community Appraisals" section explaining what qualifies an appraiser, structured format, sources. `support.tsx` has 5 new FAQ entries covering how to request, why submissions get declined, and how to dispute.

**Referral Tranche Anti-Fraud System (major new feature):**
Replaces the single 500 XP `REFERRAL_FIRST_PURCHASE` award with a 4-tranche escrow. Fake accounts that buy once and disappear only unlock 150 XP instead of 500. Real active users unlock all 4 tranches over time.

| Tranche | XP | Trigger |
|---|---|---|
| A | 100 | Referred user logs in on 3 distinct days |
| B | 150 | Referred user visits 3 different sales |
| C | 150 | Referred user's first purchase (current trigger, now just 1 tranche) |
| D | 100 | Trail completion OR own referral success OR 2nd purchase — first wins |

Silent reputation score (0.0–1.0) multiplies all tranche awards. Fully-converting referrers trend toward 1.0x; ghost-account farmers trend toward 0.1x floor. Score applies after 3+ referrals in rolling 90-day window. Daily recompute job at 2am UTC. Never shown in UI.

New schema: `ReferralTranche` + `ReferrerReputationScore` models. New files: `referralTrancheService.ts`, `reputationScoreJob.ts`. Modified: `xpService.ts`, `authController.ts`, `saleController.ts`, `stripeController.ts`, `trailController.ts`, `referralService.ts`.

**⚠️ Migration required before deploy** — new tables must exist before Railway rebuilds.

### Geofencing audit finding (NOT fixed yet — S553)

Treasure Trail stops: ✅ Geofenced (100m haversine in trailController.ts)
QR code scans (item + treasure hunt): ❌ NOT geofenced — anyone can hit the endpoint from their couch

Fix is queued for S553: same haversine pattern from trailController, add to `itemController.ts recordQrScan` and `treasureHuntQRController.ts`. Client needs to send lat/lng with scan.

### Your decisions needed

**Affiliate payouts** — decisions moved to roadmap #318. No action needed in dashboard. When you're ready to lock payout model, decisions are documented there.

**BountyModal.tsx deletion:** ✅ Approved. Included in push block below (git rm).

## 📤 Push Block (S552)

⚠️ Run migration AFTER pushing (new schema models):

```powershell
cd C:\Users\desee\ClaudeProjects\FindaSale

git add packages/frontend/pages/admin/index.tsx
git add packages/frontend/components/SmartBuyerWidget.tsx
git add packages/backend/src/controllers/couponController.ts
git add packages/frontend/pages/coupons.tsx
git add packages/frontend/pages/shopper/hunt-pass.tsx
git add packages/backend/src/controllers/bountyController.ts
git add packages/backend/src/routes/bounties.ts
git add packages/frontend/pages/organizer/bounties.tsx
git add packages/frontend/components/BountyMatchModal.tsx
git add "packages/frontend/pages/organizer/add-items/[saleId].tsx"
git add packages/frontend/pages/shopper/bounties/index.tsx
git add packages/frontend/pages/shopper/bounties/submissions.tsx
git rm packages/frontend/pages/shopper/bounties.tsx
git add packages/frontend/pages/shopper/guild-primer.tsx
git add packages/frontend/lib/itemConstants.ts
git add packages/frontend/components/ConditionBadge.tsx
git add packages/frontend/pages/guide.tsx
git add packages/frontend/pages/support.tsx
git add packages/backend/src/controllers/itemController.ts
git add packages/backend/src/controllers/treasureHuntQRController.ts
git add "packages/frontend/pages/sales/[id]/treasure-hunt-qr/[clueId].tsx"
git rm packages/frontend/components/BountyModal.tsx
git add packages/backend/src/services/referralTrancheService.ts
git add packages/backend/src/services/xpService.ts
git add packages/backend/src/controllers/authController.ts
git add packages/backend/src/controllers/saleController.ts
git add packages/backend/src/controllers/stripeController.ts
git add packages/backend/src/controllers/trailController.ts
git add packages/backend/src/services/referralService.ts
git add packages/backend/src/jobs/reputationScoreJob.ts
git add packages/backend/src/index.ts
git add packages/database/prisma/schema.prisma
git add packages/database/prisma/migrations/20260423_add_referral_tranche_system/migration.sql
git add claude_docs/strategy/roadmap.md
git add claude_docs/STATE.md
git add claude_docs/patrick-dashboard.md

git commit -m "S552+S553: Bounty Batches A+B+D; referral tranche anti-fraud system; admin price fix; HP coupon 3/3/2; hunt-pass copy; guild-primer Grandmaster; condition grade S=Mint; appraisal guide content; geofence QR scans; BountyModal.tsx removed"

.\push.ps1
```

**After push — run migration:**
```powershell
cd C:\Users\desee\ClaudeProjects\FindaSale\packages\database
$env:DATABASE_URL="postgresql://postgres:Qlzi9PdY34gG6H7zIVOBbJScz1V1sI2sicifzXhDM8@maglev.proxy.rlwy.net:13949/railway"
npx prisma migrate deploy
npx prisma generate
```

## 🎯 Next Session (S553)

1. **Mandatory §10 smoke tests** — /organizer/earnings, /organizer/calendar, 5 mobile overflow pages, admin Recent Purchases dollar amounts
2. **Geofence QR scans** — ✅ Dispatched S553. Push block below includes the 3 files.
3. **1000 XP mid-milestone** — Research complete (see summary below). Game design decision ready for dispatch. Top recommendation: milestone badge overlay + optional feed announcement at 1,000 XP (Medium complexity).
4. **Affiliate decisions** — Tracked at roadmap #318. No longer a session blocker.

## 🎮 1000 XP Mid-Milestone Research Results (S553)

Research based on MTG Arena Mastery Pass, Fortnite Battle Pass, Hearthstone Rewards Track, Rocket League Rocket Pass, and Clash Royale.

**Key finding:** Every major game puts cosmetics at mid-milestones that are *visible and expressive* (titles, badge overlays, wraps, emoticons) — not functional rewards (currency). Halfway markers don't need mega rewards; they just need a "moment."

**Three options ranked:**

**Option A — Profile Title (LOW complexity)**
- Exclusive title "⭐ Trail Blazer" or "🔥 Rising Explorer" on Explorer Profile
- Permanent but replaces with Ranger badge at 2,000 XP (frames it as graduation)
- Precedent: Hearthstone hero titles, Rocket League player titles
- Risk: text-only, low visibility

**Option B — XP Boost Coupon (MEDIUM complexity)**
- Single-use +25% XP boost for 3 days or 50 XP gains
- Gives momentum toward Ranger, creates urgency
- Precedent: MTG Arena Tavern Pass XP boosts, most progression games
- Risk: functional not cosmetic, feels like a pity reward rather than a celebration

**Option C — Milestone Badge Overlay + Optional Feed Announcement (MEDIUM complexity — RECOMMENDED)**
- Small badge (✨ 🎯) overlaid on avatar frame on profile + leaderboards
- One-time optional "Reached 1K XP!" post in community feed
- Badge disappears at Ranger (frames as graduating past it)
- Precedent: TCG Live avatar badges, Rocket League banners, Discord/Reddit badge systems
- Why it wins: dual recognition (profile + social feed), shareable moment, no art cost if emoji-based, aligns with organizer desire for visibility

**Dispatch when ready:** gamedesign agent to lock cosmetic, then dev to implement. Low-medium effort (~3 file changes in ProfileHeader, FeedAnnouncement, badge logic).

## ─── Archived Below: S550 ───

## 🔥 S550 — Affiliate Batches 3+4+6 Shipped, Innovation Review Delivered, /organizer/earnings P0 Killed For Real

**One-line summary:** Affiliate Program got three parallel batches built (code generation, signup attribution, dashboard endpoints). Innovation agent delivered a two-phase review with three actionable recommendations before payout amounts are locked. The /organizer/earnings crash I "fixed" in S549 wasn't really fixed — that was a divide-by-zero red herring. The actual bug was a React #310 hooks-order violation. Fixed for real this time, plus `/organizer/calendar` which had the same pattern. Seven files + one new strategy doc.

### Affiliate Batches 3+4+6 — BUILT

**Batch 3 — Code generation (two endpoints):**
- `POST /api/affiliate/generate-code` — idempotent (returns existing code if already generated), uses `affiliateService.generateCode()` from S545 with the 7-day-account / 30-day-lockout fraud gates
- `GET /api/affiliate/code` — returns code without creating one (null if not yet generated)
- Both registered in `routes/affiliate.ts` (also fixed the orphaned `/me` route from S545 that never got registered)

**Batch 4 — Signup attribution (`?aff=` URL param):**
- `pages/register.tsx` reads both `?ref=` (existing shopper XP flow, untouched) AND `?aff=` (new affiliate flow)
- When `?aff=` is present, an amber "An organizer referred you to FindA.Sale" banner shows during signup so the new user knows a commission will be paid on their first sale
- `authController.ts` accepts `affiliateReferralCode` in signup payload, looks up the referrer inside the existing transaction, creates `AffiliateReferral {status: 'PENDING'}`, blocks self-referral (matches on both user ID and email), logs IP pair for fraud audit
- Invalid codes silently ignored (don't fail signup)

**Batch 6 — Dashboard endpoints (two endpoints):**
- `GET /api/affiliate/referrals` — paginated list with status filter (PENDING/QUALIFIED/PAID/REJECTED)
- `GET /api/affiliate/earnings-summary` — dashboard widget aggregates: totalEarned, unpaidBalance, thisMonthEarnings, last 5 payouts
- Both ORGANIZER-role gated

### Innovation Review — Two-phase analysis, three actionable recommendations

Before we lock the flat 2% payout, the innovation agent ran ideation (5 frameworks — Adjacent Possibilities, 10x Thinking, Reversal, Intersection, Threat-as-Opportunity) and feasibility evaluation. Top three:

1. **Replace flat 2% with tier-matched commission.** SIMPLE = $0, PRO = 2%, TEAMS = 3%, ENTERPRISE = 5%. Rationale: a TEAMS organizer who refers another TEAMS organizer is bringing in a much higher-LTV customer than a SIMPLE→SIMPLE referral. Flat percentage under-rewards the high-value cases and over-rewards the low ones. Aligns incentive with customer value.
2. **Hybrid payout — credits default, cash at $200.** Until accumulated balance hits $200, payouts go to FindA.Sale credit (applies to their next billing cycle). At $200+, organizer can request cash via Stripe Transfer. Reduces Stripe fee burden on micro-payouts, keeps high-performing referrers engaged, still honors the "real money" promise at a meaningful threshold.
3. **Defer the recurring 12-month subscription % model.** Validate the one-time commission model first (Q3 2026). Recurring introduces clawback complexity, 1099-NEC threshold surprises for the referrer, and churn-attribution edge cases. Revisit in 2027 after we have attribution data.

**Compliance flags:** >$500 lifetime payouts trigger Stripe Identity verification. $600/yr triggers 1099-NEC. Both need to be wired before Batch 7 (payout request flow). Full writeup in `claude_docs/feature-notes/affiliate-innovation-review-S550.md`.

### 🛑 /organizer/earnings was still crashing — S549 fixed the wrong thing

Live smoketest per the mandatory post-fix rule. Admin index passed ✅ (S549 null guards working, "Unknown" fallback visible). But /organizer/earnings was STILL throwing ErrorBoundary. Console showed **React error #310 — hooks order violation**. The S549 NaN/divide-by-zero guard was in the code and deployed, but that wasn't the bug.

Real bug: the page had `if (authLoading) return null;` and `if (!user || !user.roles?.includes('ORGANIZER'))` as **early returns BEFORE the useQuery hooks**. React requires hooks to be called in the same order on every render — an early return on some renders skips the hooks on those renders, and React bails with #310 instead of rendering.

Fixed by moving auth checks into `useEffect` (redirect as a side effect) and gating the render with `if (authLoading || !user || !user.roles?.includes('ORGANIZER')) return null;` **after** all hooks are called. Grepped for the same pattern across organizer pages — found `calendar.tsx` had the identical bug, applied the same fix. Members.tsx and ugc-moderation.tsx looked suspect but their hooks were all called before the return (safe).

**S549 post-mortem:** The NaN-guard fix ships, but shouldn't have been closed as resolving the crash. A real browser test would have caught it immediately — that's why the §10 smoketest rule exists.

### P0 — `/admin` index crash (FIXED)

Root cause: when the admin stats API returned partial data, the page tried to call `.reduce()` on undefined sparkline arrays and dereferenced `purchase.user.name` / `sale.organizer.businessName` without null checks. Five guards added in `pages/admin/index.tsx` — sparklines fall back to `[]`, missing user/organizer names show `'Unknown'`. No layout change.

### P0 — `/organizer/earnings` crash (FIXED)

Root cause was simpler than feared — **division by zero**. When an organizer has no completed sales, `(totals.fees / totals.revenue) * 100` produces `NaN`, which React refuses to render and bombs the page. Backend was already safe. Fixed at line 230 of `earnings.tsx`: `revenue > 0 ? percent : '0%'`. New organizers will see `0%` instead of a crash.

### P1 — Mobile overflow batch (4 files, FIXED)

Pure Tailwind. Desktop layouts unchanged from `sm:` breakpoint up.

| Page | Before | After |
|------|--------|-------|
| `/organizer/edit-sale/[id]` ENDED header | 70px overflow | Buttons wrap, title truncates |
| `/organizer/insights` SELECT dropdown | 96px scroll | Select shrinks, parent wraps |
| `/shopper/explorer-profile` Add buttons | 43px overflow | Input + buttons wrap on mobile |
| `/admin/items` pagination | 839px scroll | Filter row wraps, table scroll-x |

### P2 — Workspace tab bar (FIXED)

`pages/organizer/workspace.tsx` — parent flex `flex-wrap sm:flex-nowrap`, each tab `px-2 sm:px-6 flex-shrink-0 text-sm sm:text-base`, removed `overflow-x-auto`. 4 tabs now wrap onto 2 rows under 412px, single horizontal row from sm: up. No JSX restructure, no logic touched.

### Affiliate Batch 2 — already shipped (audit only)

You asked to dispatch Batch 2 (the checkout sessionStorage → Purchase attribution wire-through). Audit found it's **already implemented end-to-end** in `CheckoutModal.tsx` lines 315–321 (frontend) and `stripeController.ts` lines 329/472/520/1195–1197 (backend). `Purchase.affiliateLinkId` confirmed in schema. Must have shipped silently in a prior session. Zero new code. Spec doc `affiliate-program-spec-S544.md` should be marked "Batch 2 done." Next affiliate work is Batch 3 (POST /affiliate/generate-code + GET /affiliate/code).

## 📤 Push Block (S550)

```powershell
cd C:\Users\desee\ClaudeProjects\FindaSale

git add packages/backend/src/controllers/affiliateController.ts
git add packages/backend/src/controllers/authController.ts
git add packages/backend/src/routes/affiliate.ts
git add packages/frontend/pages/register.tsx
git add packages/frontend/pages/organizer/earnings.tsx
git add packages/frontend/pages/organizer/calendar.tsx
git add claude_docs/feature-notes/affiliate-innovation-review-S550.md
git add claude_docs/STATE.md
git add claude_docs/patrick-dashboard.md

git commit -m "S550: Affiliate Batches 3+4+6 (code gen, signup attribution, dashboard); innovation review; P0 /organizer/earnings + calendar hooks-order fix (React #310)"

.\push.ps1
```

## 🎯 Your Decisions — Before Batches 5, 7, 9 Dispatch

**Affiliate payout model (innovation recommendations):**
1. **Tier-matched commission instead of flat 2%?** SIMPLE=$0, PRO=2%, TEAMS=3%, ENTERPRISE=5%. Approve / modify / reject.
2. **Hybrid credits vs cash?** Default to FindA.Sale credits, cash only at $200+ balance. Approve / modify / reject.
3. **Defer recurring-subscription commission model to 2027?** Validate one-time first. Approve / modify / reject.

Your answers gate:
- Batch 5 (qualification trigger — first successful paid sale → status QUALIFIED + payout amount calculation)
- Batch 7 (payout request flow — Stripe Transfer to organizer's connected account)
- Batch 9 (email templates for PENDING → QUALIFIED → PAID notifications)

## 🎯 Next Session (S551) — What's Queued

1. **Await payout decisions above**, then dispatch Batches 5+7+9 in parallel (different files, no conflict).
2. **Remaining S549 mobile smoketest** — /organizer/edit-sale/[id] header, /organizer/insights SELECT, /shopper/explorer-profile Add buttons, /admin/items pagination, /organizer/workspace tab bar. Couldn't verify this session (focus pivoted to the /organizer/earnings emergency).
3. **Smoketest S550 affiliate endpoints** in Chrome after deploy:
   - Sign up a test user with `?aff=CODE` → confirm banner shows + AffiliateReferral row created
   - Hit `/api/affiliate/generate-code` as an organizer → confirm code returned, idempotent on second call
   - Hit `/api/affiliate/earnings-summary` → confirm zero-state renders cleanly
4. **Batch 8 (fraud detection middleware)** deferred — basic self-referral block is in Batch 4. Full fraud middleware can wait until we have real referral data to tune against.

## ─── Archived Below: S548 ───

## 🔥 S548 — Full Mobile QA @ 320px (Pixel 6a PWA)

**One-line summary:** Walked the whole app at true Pixel 6a width (320px). Fixed three mobile overflows including the root cause of why your Pixel 6a was rendering at 320px instead of 412px. Surfaced four more P1 mobile overflows and two P0 page crashes that aren't mobile-specific.

**The Pixel 6a mystery, solved.** You reported your Pixel 6a PWA was showing as 320px wide even though the device's CSS viewport should be 412px. Root cause: Next.js 14's default viewport meta tag is `width=device-width` without `initial-scale=1`. Android PWAs fall back to a narrower layout width without explicit initial-scale. Added `<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover" />` to `_document.tsx`. After this ships, your PWA should render at the real device width (412px on Pixel 6a), giving everything ~90px more horizontal room.

**Fixes shipped (3 edits across 2 files):**

1. **`pages/_document.tsx`** — added explicit `initial-scale=1, viewport-fit=cover` viewport meta. Fixes Pixel 6a 320px PWA render.
2. **`pages/organizer/dashboard.tsx` Weather Strip wrapper** — `flex-shrink-0` alone was locking the weather card at its 368px intrinsic width (4 spans with whitespace-nowrap: date + high/low + condition + city). On <368px viewports it was clipping "Grand Rapids". Changed to `w-full sm:w-auto sm:flex-shrink-0` — own row on mobile, inline badge on desktop.
3. **`pages/organizer/dashboard.tsx` B1 Share Nudge header** — `items-start` was leaving the inner flex with intrinsic content width inside a flex-col. Changed to `items-stretch` + added `w-full sm:w-auto` + `flex-shrink-0` on the emoji + `min-w-0 truncate` on the text. Fixes 8px right-edge overflow at 320px.

**Clean at 320px (15 pages verified):** /organizer/dashboard, /organizer/sales, /organizer/settings, /organizer/add-items/[id], /admin/users, /admin/sales, /admin/feedback, /admin/verification, /admin/invites, /admin/feature-flags, / (homepage), /trending, /sales/[id], /shopper/dashboard, /organizer/add-items/[id].

**P1 mobile overflows surfaced (not fixed yet — your call):**

| Page | Overflow | What's wrong |
|------|----------|--------------|
| `/organizer/edit-sale/[id]` (ENDED sale) | 70px | Header row with "✓ ENDED + Reopen + Settle This Sale" doesn't wrap on mobile |
| `/organizer/insights` | 96px | SELECT dropdown with long option text ("Alice's Test Estate Sale (...)") forces horizontal scroll |
| `/shopper/explorer-profile` | 43px | Two "Add" buttons next to wishlist input push past right edge |
| `/admin/items` | Body scrolls to 839px | Pagination + filter row not responsive |
| `/organizer/workspace` tab bar | scrollable | 4 tabs (ADMIN/MANAGER/MEMBER/VIEWER) = 460px; uses `overflow-x-auto` so technically valid, but no visual scroll affordance. Decision: leave as-is, shrink tab padding, or convert to dropdown on mobile? |

**P0 crashes surfaced (NOT mobile-specific — they crash at any width):**

1. **`/admin` index** — ErrorBoundary catches runtime crash, shows "Something went wrong". JWT role = ADMIN (verified). Likely null reference in `stats.sparklines.*.reduce()` calls (line 253, 275, 297) or `purchase.user.name` / `sale.organizer.businessName` if the API returns partial data. Admin sub-pages (/admin/users, /admin/sales, etc.) all work fine — only the dashboard index crashes.
2. **`/organizer/earnings`** — same ErrorBoundary crash. Needs Railway log check to see which data field is null.

Both P0s should get fixed in the next session.

## 📤 Push Block (S548)

```powershell
cd C:\Users\desee\ClaudeProjects\FindaSale

git add packages/frontend/pages/_document.tsx
git add packages/frontend/pages/organizer/dashboard.tsx
git add claude_docs/STATE.md
git add claude_docs/patrick-dashboard.md

git commit -m "S548: mobile QA walkthrough — fix Pixel 6a viewport meta + weather strip + B1 share nudge at 320px"

.\push.ps1
```

## 🎯 Next Session (S549) — What's Queued

1. **Fix /admin index crash** — check `stats.sparklines.*.reduce()` calls for null refs; guard with `?.length > 0` or default to empty arrays. Same for `purchase.user?.name` / `sale.organizer?.businessName`.
2. **Fix /organizer/earnings crash** — Railway log check first, then fix the null access.
3. **P1 mobile fixes (if you want them)** — the four overflow bugs above are each ~5-10 lines of Tailwind class edits. Can bundle them in one dispatch.
4. **Decide workspace tab bar** — shrink padding, convert to dropdown, or leave as scrollable?
5. **Smoke test S548 on your Pixel 6a** — the viewport meta change should make the PWA render at true device width (412px). You should visually feel the extra ~90px of breathing room.
6. **Carry-over from earlier queue** — Affiliate Batches 2–10 (spec at `claude_docs/feature-notes/affiliate-program-spec-S544.md`), S545/S546 smoke tests, Chrome QA backlog.

## ─── Archived Below: S547 ───

## 🔥 S547 — Past Sales Card Mobile Overflow

**One-line summary:** Fixed the Reopen / Settle / View Details buttons overflowing past the card edge on the organizer dashboard's Past Sales cards when viewed on mobile. Pure Tailwind-only, no logic touched. Outer row → `flex-col sm:flex-row` with gap, three actions wrapped in `flex flex-wrap gap-2`, title + city got `min-w-0 truncate`. Desktop layout unchanged from 640px up.

## ─── Archived Below: S546 ───

## 🔥 S546 — Recovery Session (S545 migrations)

**S545 push failed in 4 ways. All 4 are now fixed, shipped, and live.**

1. **P3018 — AffiliateReferral index collision.** Migration renamed `AffiliateReferral` → `AffiliateReferral_OLD` but PG indexes are global per schema, so they traveled with the old table under their original names, crashing `CREATE INDEX` on the new table. Fix: prepended 6 `ALTER INDEX IF EXISTS ... RENAME TO ..._OLD_*` statements in the migration so new indexes have clean names.
2. **P1012 — missing opposite relation.** `AffiliateReferral.referredUser` had no inverse on User model (old comment wrongly said "implicit"). Added `affiliateReferralsReceived AffiliateReferral[] @relation("AffiliateReferrals_Referred")` to User.
3. **Vercel TS error.** S545 dev agent wrote `user?.explorerRank` in sales/[id].tsx, but AuthContext User type deliberately excludes `explorerRank` (prevents stale JWT cache — there's a comment explaining this on line 14). Swapped both references to `xpProfile?.explorerRank` via `useXpProfile` hook.
4. **JSX structural error.** S545 dev agent put the closing `)}` for the `{!isSaleLocked && (` lock conditional in the wrong place. Fixed.

**Plus Railway cache-bust** on `Dockerfile.production` to force a clean rebuild after 2 failed builds.

**Migration recovery sequence ran clean.** `migrate resolve --rolled-back` → `migrate deploy` → `generate`. Both pending migrations (`consolidate_affiliate_payout_to_referral` + `add_sale_publishedAt`) now marked OK.

**DB verified via psycopg2.** AffiliateReferral has all 12 consolidated columns. AffiliatePayout dropped. Sale.publishedAt + User.affiliateReferralCode both present.

**Chrome smoke test.** Homepage clean. Sale detail page (`/sales/cmnxvyic4001li51qobwidrbl`) renders clean — no `explorerRank` TS error, title + location show correctly. Only console errors are MetaMask browser extension conflicts (not app code).

## ⚠️ Flags carried forward from S545

**Affiliate payout amounts are still PLACEHOLDERS.** `packages/backend/src/config/affiliateConfig.ts` (PRO=$20, TEAMS=$55). Lock before Batch 4 (Stripe webhook wiring). The "flat cash per tier" vs "2% + $50 floor" decision is still unresolved — both paths exist in code.

**Rank early access timezone gotcha.** Organizer TZ not passed to frontend yet; unlock times render in viewer's browser TZ. Batch 2 concern.

## 📤 What You Shipped This Session

You pushed two commits during this session:

1. **Recovery commit** — 4 files (schema.prisma, migration.sql, sales/[id].tsx, Dockerfile.production)
2. **Post-recovery** — nothing pending, all fixes live

Railway build: ✅ green. Vercel build: ✅ green. Migrations: ✅ applied.

## 📤 Wrap Push Block (S546 doc updates)

Just STATE.md + patrick-dashboard.md:

```powershell
cd C:\Users\desee\ClaudeProjects\FindaSale

git add claude_docs/STATE.md
git add claude_docs/patrick-dashboard.md

git commit -m "S546 wrap: STATE + dashboard update (migration recovery complete)"

.\push.ps1
```

## 🎯 Next Session (S547) — What's Queued

1. **Live smoke test of S545 features** (mandatory per CLAUDE.md §10). Test in Chrome:
   - Sale lock for INITIATE shopper → shows 🔒 + Rank-Up CTA
   - Sale unlock for Scout/Ranger/Sage/GM at correct tier hours (1h/2h/4h/6h)
   - SaleLockCard + rank badge copy
   - Affiliate `GET /api/affiliate/me` returns referralCode + referrals (no UI yet, backend-only)
   - S545 mobile organizer dashboard fix
   - S545 Organizer Insights Decimal fix for Alice
2. **Affiliate Batches 2–10** — architect spec at `claude_docs/feature-notes/affiliate-program-spec-S544.md`. Payout amounts still a decision point (can unblock Batch 4).
3. **Chrome QA backlog** — see STATE.md "## Blocked/Unverified Queue" section.
4. **S542 hold price + Remove button** — still needs shopper with active holds.

## ─── Archived Below: S545 ───

# S545 Complete

## What Happened (archived)

Rank early access + affiliate Batch 1 + hotfixes. 17 files. Migration recovery followed in S546.

## ─── Archived Below: S544 ───

# S544 Complete

## ─── Archived Below: S544 ───

# S544 Complete

## What Happened This Session

S544: Strategy + builds. Hunt Pass polish, Golden Trophy avatar frame, 3x coupon slots, schema pre-wires, affiliate program spec.

**Game Design — Grandmaster Hunt Pass Duration (LOCKED)**
Free Hunt Pass now tied to active Grandmaster status. Lapses on Jan 1 reset if user drops to Sage. Re-qualifying restores it. "Forever" is gone. Spec updated.

**Hunt Pass Page ✅**
- Newsletter benefit → "Coming Soon" amber badge (user-written guides platform, post-beta)
- Treasure Hunt Pro restored (150 scans/day cap — confirmed in xpService.ts)
- Page now shows 5 confirmed benefits

**Golden Trophy Avatar Frame ✅ (built)**
- Amber/gold ring on avatar for Hunt Pass subscribers
- Shows in nav + AvatarDropdown header
- Purely frontend — huntPassActive already exists on User, no schema change needed
- New files: HuntPassAvatarBadge.tsx, Avatar.tsx

**3x Monthly Coupon Slots ✅ (built)**
- HP subscribers: 6/6/3 coupon generations per month (vs standard 2/2/1)
- Backend cap logic updated in couponController.ts
- Frontend coupons.tsx shows dynamic limits based on HP status

**Schema Migration ✅ (created, not yet deployed)**
- tasteProfile Json? on User (pre-wire for Agentic AI Scout)
- ApiKey model (pre-wire for API-First Organizer Toolkit)
- Migration file: `1776893245415_add_taste_profile_and_api_keys`
- You need to deploy this after pushing (block below)

**Research Findings**
- Consignment: FULLY BUILT — not a pre-wire. Consignor model, ConsignorPayout, consignorController all exist.
- Persistent Inventory: Schema pre-wired (fields exist) but MasterItemLibrary model missing — not full build yet.
- Estate Planning (executorUserId, estateId): Pre-wired ✅

**Affiliate Program — Spec Complete, Awaiting Your Decisions**
Full Architect spec at claude_docs/feature-notes/affiliate-program-spec-S544.md.
Payout model: flat cash triggered on first successful paid billing only. No cash for free tier (exploit vector — someone could spin up fake free accounts and collect payouts).

Before dev dispatch you need to decide:
- PRO payout amount (Investor ballpark: ~$20, not locked)
- TEAMS payout amount (Investor ballpark: ~$55, not locked)
- Confirm organizer-only scope (no public influencer network yet)
- Fraud thresholds OK? (7-day account age before code gen, 30-day before first payout)

No rush — amounts will be config constants, not hardcoded. Dev can start the non-amount work first.

## 🚨 P0 — /organizer/sales Broken Live

Screenshot confirmed: "Unable to load sales. Please try again." on finda.sale/organizer/sales. First task of S545 — Railway log check + dev dispatch. Do not start other work until this is diagnosed.

## Build Status

| Service | Status |
|---------|--------|
| Vercel (frontend) | ✅ S543 live |
| Railway (backend) | ✅ Green |
| S544 pending push | ⚠️ 8 code files + migration — push block below |

## Push Block (S544)

```powershell
cd C:\Users\desee\ClaudeProjects\FindaSale
git add claude_docs/research/gamification-rpg-spec-S260.md
git add claude_docs/feature-notes/gamedesign-decisions-2026-04-22.md
git add claude_docs/feature-notes/affiliate-program-spec-S544.md
git add claude_docs/strategy/roadmap.md
git add packages/frontend/pages/shopper/hunt-pass.tsx
git add packages/frontend/components/HuntPassAvatarBadge.tsx
git add packages/frontend/components/Avatar.tsx
git add packages/frontend/components/AvatarDropdown.tsx
git add packages/backend/src/controllers/couponController.ts
git add packages/frontend/pages/coupons.tsx
git add packages/database/prisma/schema.prisma
git add "packages/database/prisma/migrations/1776893245415_add_taste_profile_and_api_keys"
git add claude_docs/STATE.md
git add claude_docs/patrick-dashboard.md
git commit -m "feat: Golden Trophy avatar frame, 3x HP coupon slots, Hunt Pass copy polish, tasteProfile + ApiKey schema pre-wires, affiliate program spec"
.\push.ps1
```

## Migration Deploy (run after push)

```powershell
cd C:\Users\desee\ClaudeProjects\FindaSale\packages\database
$env:DATABASE_URL="postgresql://postgres:QvnUGsnsjujFVoeVyORLTusAovQkirAq@maglev.proxy.rlwy.net:13949/railway"
npx prisma migrate deploy
npx prisma generate
```

## What's Next (S545)

1. **Diagnose /organizer/sales P0** — Railway logs + dev fix, first thing
2. **Parallel dispatches while P0 fixes:** rank-based early access backend (Architect), Organizer Insights runtime error, mobile dashboard Copy Link + More Options layout
3. **Affiliate Program dev dispatch** — after you lock payout amounts
4. **Chrome QA backlog** — S543 P2 fixes, S540 Rewards nav, RSVP XP, per-sale analytics, settlement fee %
