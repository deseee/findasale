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

**S447 dispatched 6 parallel agents — awaiting results:**
1. Architect: Bump Post feed sort spec + device fingerprinting architecture
2. Dev: Appraisal 5/day cartel cap
3. Dev: Chargeback farming (72h XP hold + Stripe webhook)
4. Dev: Nav rename (Explorer Profile, Explorer's Guild)
5. Dev: XP expiry D-XP-002 (schema + cron + in-app warnings)
6. Game Designer: Guaranteed Value Cache spec (Lucky Roll replacement)

**After Batch 1 returns (Batch 2):**
- Bump Post feed sort implementation
- Device fingerprinting implementation
- Lucky Roll → Guaranteed Value Cache (after spec)
- Cosmetics repricing UI (D-XP-005): 1,000/2,500 XP cosmetics
- Hunt Pass 3x coupon slot
- Coupon backend enforcement (server-side monthly limits)

**Existing priorities (still queued):**
1. Review workspace QA results → dispatch fixes
2. "Organizer Special" badge on public sale + shopper item view
3. Price Research Card redesign (spec ready at `claude_docs/design/PRICE_RESEARCH_CARD_UX_SPEC.md`)
4. Brand audit fixes — 3 copy bugs, no decisions needed

---

## Recent Sessions

| Session | Date | Summary |
|---------|------|---------|
| S447 | 2026-04-13 | Explore session: page overlap analysis, naming locked (Explorer Profile/Guild/Hunt Pass), XP gaps identified, 6 parallel agents dispatched |
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
