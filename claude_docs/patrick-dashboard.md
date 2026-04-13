# Patrick's Dashboard — Week of April 13, 2026

## What Happened This Week

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

- [ ] **QA workspace invite flow** (doing out-of-session) — see checklist from earlier this session
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

## What's Next (S448)

**S448 opens with Chrome QA audit of everything S447 shipped, then attacks rank staleness P0, then dashboard rethink.**

**S447 COMPLETE — All 3 batches shipped, pushed, migrated ✅**

**What shipped this session:**
- Appraisal cartel cap: 5/day hard limit on XP credits per user
- Nav renamed: "Explorer's Guild" (loyalty) + "Explorer Profile" (passport) sitewide — 15 locations
- XP expiry D-XP-002: schema fields, nightly cron (02:00 UTC), activity tracking, Grandmaster+ exemption
- Bump Post feed sort: bumped posts rise to top of haul feed
- Early Access Cache: replaces Lucky Roll entirely — 100 XP → 48h early access to category items
- Cosmetics repricing D-XP-005: 1,000/2,500/250-500 XP new prices live
- Hunt Pass 3x coupon enforcement: server-side monthly limits (HP=3x, standard=2x)
- Stale reference sweep: zero remaining "Lucky Roll", "Loyalty Passport", or "Explorer Passport" copy
- Coupon amounts corrected: $0.75/$2.00/$5.00 (D-XP-001 compliant)
- Chargeback farming: already done in prior session — just need Stripe event enabled (see below)

**⚠️ Patrick action still needed:**
- Stripe Dashboard → Developers → Webhooks → add `charge.dispute.created` event

**S448 OPEN ISSUE — Rank staleness (P0 bug, live on site):**
Nav shows "Scout" for users who should be "Initiate." XP values inconsistent across pages. Likely root cause: JWT carries stale rank/XP from login and doesn't refresh on XP earn. Next session investigates + fixes.

**NAMING DECISION NEEDED before fix:**
Patrick said: Initiate → Scout → Hunter → Sage → Grandmaster
Prior locked: Scout → Ranger → Sage → Grandmaster (no Initiate base tier)
S448 will surface this for Patrick approval before touching rank code.

---

## Recent Sessions

| Session | Date | Summary |
|---------|------|---------|
| S447 | 2026-04-13 | 3 dispatch batches: Early Access Cache, XP expiry, bump sort, cosmetics repricing, coupon enforcement, nav renames, stale sweep. All pushed + migrated. |
| S446 | 2026-04-13 | XP frontend, 3 micro-sinks, organizer discounts, workspace magic link invite, WorkspaceMember schema fix |
| S445 | 2026-04-13 | XP economy redesign + 5 fraud gates + workspace invite flow |
| S444 | 2026-04-13 | STAFF→MEMBER full rename + workspace permissions fixed |
| S443 | 2026-04-11 | 9 live-site fixes + command center upgrade + appraisal gating |
| S442 | 2026-04-11 | WorkspaceSettings schema fix + test data seed (Alice/Carol teams) |

---

## Brand Audit (still open)

- SharePromoteModal generates "estate sale" copy for ALL sale types
- Homepage meta/SEO omits flea markets and consignment
- Organizer profile meta says "Estate sales by [name]" regardless of sale type

All dispatch-ready, no decisions needed.
