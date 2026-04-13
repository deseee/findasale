# Patrick's Dashboard — Week of April 13, 2026

## What Happened This Week

**S449** (2026-04-13) — Full rank perks system + P0/P1/P4 fixes:
- **Rank perks system shipped:** `rankUtils.ts`, hold enforcement (rank-based duration snapshot), wishlist cap (server-side), legendary early access (0/0/2/4/6h by rank), Hall of Fame endpoint + page, RankBenefitsCard + RankUpModal, `getRankDashboardConfig()`
- **3 new migrations:** rankUpHistory, holdDurationMinutes, legendary fields — need Railway deploy
- **Rank staleness P0:** JWT rank sync + AuthContext.updateUser() — nav rank updates live on XP earn
- **Scout Reveal:** interestedUsers returned + results panel on item page
- **Organizer discount badge:** Teal pill on item detail + subtle pill on sale listing cards
- **Haul post test data seeded:** 3 posts for Alice (IDs 2-4) — Bump Post + Haul Unboxing QA-ready
- **Two push blocks** — first (10 files, S449 P0-P4), second (20 files, rank perks system)

**S448** (2026-04-13) — QA audit + Scout Reveal bug + rank naming locked:
- Scout Reveal is a hollow stub — XP spent, toast fires, nothing revealed. Backend never queries interest data. Full flesh-out queued for S449.
- Rank naming locked: **Initiate → Scout → Ranger → Sage → Grandmaster** (prior session dropped Initiate — that was the error; Ranger was always correct)
- "Save Passport" → "Save Profile" copy fix shipped
- Stripe sandbox: COMPLETED ✅
- Bump Post + Haul Unboxing: unverified (no test haul posts in DB)

**S447** (2026-04-13) — 3 dispatch batches, all shipped ✅

**S446** (2026-04-13) — XP frontend + workspace invite flow:
- Hunt Pass cancellation wired to Stripe webhook (exploit gate closed)
- XP earning rates + coupon tiers updated across 6 frontend pages
- 3 micro-sinks: Scout Reveal (5 XP), Haul Unboxing Animation (2 XP), Bump Post (10 XP)
- Organizer-funded discounts: 200/400/500 XP = $2/$4/$5 off; blocks shopper coupon stacking
- Workspace magic link invite: `/join?token=` page, Resend email, MyTeamsCard on dashboards, welcome banner
- WorkspaceMember schema properly fixed: `organizerId` nullable, `userId` added — no ghost organizer accounts for shoppers/new users
- ⚠️ Bump Post feed sorting pending (DB field set, feed sort not yet implemented)

**S445** (2026-04-13) — XP economy redesign + workspace flows:
- 5 P0 fraud gates shipped (appraisal cap, referral gate, HP claw-back, device fingerprinting, chargeback)
- Workspace invite banner, staff delete, owner permissions gate, template fixes

**S444** (2026-04-13) — STAFF→MEMBER rename + workspace permissions fix.

---

## Action Items for Patrick

- [ ] **Push S449 push block** (10 files — see block in STATE.md or session summary)
- [ ] **Run S447 pending migrations** on Railway if not done: `20260413_xp_expiry_system` + `20260413_early_access_cache`
- [ ] **Stripe Dashboard → Webhooks → add `charge.dispute.created` event** (S447, still open)
- [ ] **Decide: Bounties rewards — dollars, XP, or both?** (S440 open, still blocking)

---

## XP System — Current State

**Coupon tiers (locked D-XP-001):**
- 100 XP → $0.75 off $10+ | 2x/mo standard, 3x/mo Hunt Pass
- 200 XP → $2.00 off $25+ | 2x/mo standard, 3x/mo Hunt Pass
- 500 XP → $5.00 off $50+ | 1x/mo all users

**Micro-sinks (new S446):**
- Scout Reveal: 5 XP → see who flagged interest first on an item
- Haul Unboxing: 2 XP → celebratory animation on haul post share
- Bump Post: 10 XP → bumps haul post to feed top for 24h (feed sort pending)

**Organizer-funded discounts (new S446):**
- Spend 200/400/500 XP in item edit → puts $2/$4/$5 off the item
- Shopper coupon doesn't stack — best single discount wins

---

## What's Next (S450)

**Must push first:**
1. Push block 1 (10 files — rank staleness, Scout Reveal, discount badge)
2. Push block 2 (20 files — rank perks system, Hall of Fame, legendary access)
3. Run all pending migrations on Railway (5 total if S447 still outstanding)

**QA priority after deploy:**
- Rank sync: earn XP → verify nav rank updates instantly (no re-login)
- Scout Reveal: spend 5 XP on item page → verify interestedUsers panel renders
- Discount badge: visit item with discount → verify teal pill shows
- Bump Post: login as Alice, bump haul post ID 2 → verify 10 XP deducted + bumpedUntil set
- Haul Unboxing: Alice, haul post ID 3 → verify 2 XP deducted + animation unlocked
- Hall of Fame: visit /shopper/hall-of-fame → verify page loads (will be empty until users hit Grandmaster)
- Hold duration: place hold as Scout → verify 45min expiry (not 30min)

**Remaining rank perks (not yet wired):**
- RankUpModal trigger — currently built but not connected to AuthContext rank-change event
- Dashboard card visibility — `getRankDashboardConfig()` exists but dashboard doesn't consume it yet
- Legendary item flag in organizer UI — organizers have no UI to mark items as Legendary yet
- Confirmation dialog skip — client-side, Ranger/Sage/Grandmaster hold auto-confirm logic

**MyTeamsCard happy path:** Still needs a workspace member test user. Invite Alice to a workspace, accept via magic link, reload shopper dashboard.

---

## Recent Sessions

| Session | Date | Summary |
|---------|------|---------|
| S449 | 2026-04-13 | Rank staleness P0, Scout Reveal P1, discount badge P4, dashboard/perks specs, haul test data. 10 files. |
| S448 | 2026-04-13 | QA audit. Scout Reveal bug ID'd. Rank naming locked. 1-line fix. |
| S447 | 2026-04-13 | 3 dispatch batches: Early Access Cache, XP expiry, bump sort, cosmetics repricing, coupon enforcement, nav renames. |
| S446 | 2026-04-13 | XP frontend, 3 micro-sinks, organizer discounts, workspace magic link invite, WorkspaceMember schema fix |
| S445 | 2026-04-13 | XP economy redesign + 5 fraud gates + workspace invite flow |
| S444 | 2026-04-13 | STAFF→MEMBER full rename + workspace permissions fixed |

---

## Brand Audit (still open)

- SharePromoteModal generates "estate sale" copy for ALL sale types
- Homepage meta/SEO omits flea markets and consignment
- Organizer profile meta says "Estate sales by [name]" regardless of sale type

All dispatch-ready, no decisions needed.
