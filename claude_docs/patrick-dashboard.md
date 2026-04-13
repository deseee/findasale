# Patrick's Dashboard — Week of April 13, 2026

## What Happened This Week

**S445** ran two concurrent windows on 2026-04-13:
- **Window A (XP/fraud):** Full XP economy redesign — coupon tier restructure, 5 P0 fraud gates (appraisal cap, referral gate, HP claw-back, device fingerprinting). 2 migrations applied to Railway. All decisions locked in `claude_docs/feature-notes/gamedesign-decisions-2026-04-13.md`. Forecast Polls killed (Michigan gambling law).
- **Window B (workspace flow):** Workspace invitation banner on dashboard, staff delete endpoint, fix for "Already a member" re-invite bug, owner self-delete protection, TeamMember creation on invite accept, workspace page crash fix (undefined role), permissions gate (non-owners see read-only), template apply field name fix, 4 workspace templates seeded into DB.

**S444** completed the STAFF→MEMBER rename and workspace permissions fix.

---

## Action Items for Patrick

- [ ] **PUSH Window B workspace changes** (10 files — pushblock in STATE.md under S445 Window B)
- [ ] **PUSH permissions fix from S444** if not done yet (3 backend files — see S444 pushblock in STATE.md)
- [ ] **QA workspace invite flow** — invite → banner → accept → member in staff list; test 5-Person template apply
- [ ] **QA `/organizer/members`** — invite modal, role dropdowns, role change on cards
- [ ] **QA `/organizer/workspace`** — permissions tabs switch, save persists
- [ ] **Decide: Bounties rewards — dollars, XP, or both?** (S440 open, still blocking)

---

## XP System — What's New (S445)

**Coupon tiers changed:**
- 100 XP → $0.75 off $10+ (2x/mo standard, 3x/mo Hunt Pass)
- 200 XP → $2.00 off $25+ (2x/mo standard, 3x/mo Hunt Pass)
- 500 XP → $5.00 off $50+ (1x/mo all users)

**5 fraud gates now live (migrations applied):**
1. Appraisal selections capped at 5/day per user
2. Referral 500 XP requires referred organizer's first real buyer
3. 72-hour XP hold on purchases + chargeback claw-back webhook
4. Hunt Pass cancel = 30-day redemption hold on HP-earned XP
5. Device fingerprinting on signup — multi-account fraud blocked at XP award

**Forecast Polls:** Killed. Michigan gambling law. Never coded, nothing to remove.

---

## What's Next (S446)

S446 should focus on the XP frontend implementation:
1. Wire Hunt Pass cancellation → Stripe webhook (10-min fix in stripeController.ts)
2. Update Hunt Pass page + coupon UI to show new tier values
3. Audit + update all XP earning rate displays (hardcoded old values likely in several pages)
4. Implement 3 micro-sinks: Scout Reveal (5 XP), Haul Unboxing (2 XP), Bump Post (10 XP)
5. Organizer-funded discounts (200 XP = $2 off one item)

Full spec: `claude_docs/feature-notes/gamedesign-decisions-2026-04-13.md`

**Invited member onboarding** — banner now built and live on dashboard. Invite → accept flow is end-to-end. QA still needed in Chrome.

**Price Research Card redesign** — UX spec ready: `claude_docs/design/PRICE_RESEARCH_CARD_UX_SPEC.md`.

---

## Recent Sessions

| Session | Date | Summary |
|---------|------|---------|
| S445-B | 2026-04-13 | Workspace invite banner, staff delete, permissions gate, template seed + fix |
| S445-A | 2026-04-13 | XP economy redesign + 5 P0 fraud gates + Forecast Polls killed |
| S444 | 2026-04-13 | STAFF→MEMBER full rename + workspace permissions fixed |
| S443 | 2026-04-11 | 9 live-site fixes + command center upgrade + appraisal gating |
| S442 | 2026-04-11 | WorkspaceSettings schema fix + test data seed (Alice/Carol teams) |
| S441 | 2026-04-11 | 8-issue fix batch: bounties, achievements, reputation P0, haul posts, price research card |
| S440 | 2026-04-11 | Massive nav/UX session — bounties V3, subscriptions, leaderboard, messages dual-role |

---

## Brand Audit (still open from last week)

- SharePromoteModal generates "estate sale" copy for ALL sale types — 3 audits open
- Homepage meta/SEO omits flea markets and consignment
- Organizer profile meta says "Estate sales by [name]" regardless of sale type

All routable to dev, no decisions needed.
