# Patrick's Dashboard — Week of April 13, 2026

## What Happened This Week

**S446** (2026-04-13) — XP frontend implementation:
- Hunt Pass cancellation now fully wired to Stripe webhook (exploit gate closed)
- All XP earning rates and coupon tier values updated across 6 frontend pages
- 3 micro-sinks built: Scout Reveal (5 XP on item detail), Haul Unboxing Animation (2 XP), Bump Post (10 XP)
- Organizer-funded discounts live: spend 200/400/500 XP to put $2/$4/$5 off an item; blocks shopper coupons from stacking
- ⚠️ Bump Post feed sorting pending — DB field is set correctly but haul posts feed doesn't sort by bump yet

**S445** (2026-04-13) — XP economy redesign + workspace flows:
- 5 P0 fraud gates shipped (appraisal cap, referral gate, HP claw-back, device fingerprinting, chargeback)
- Workspace invite banner, staff delete, owner permissions gate, template fixes

**S444** (2026-04-13) — STAFF→MEMBER rename + workspace permissions fix.

---

## Action Items for Patrick

- [ ] **PUSH everything** — comprehensive pushblock below (29 files: S446 + S445-B + S444 pending)
- [ ] **Run migrations** — 2 new ones from S446 (micro-sinks + organizer discounts). Command in pushblock below.
- [ ] **QA workspace invite flow** (doing out-of-session) — checklist from S446 session
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

## What's Next (S447)

1. Review workspace QA results → dispatch fixes
2. Bump Post feed sort (Architect spec → Dev dispatch)
3. "Organizer Special" badge on public sale + shopper item view
4. Price Research Card redesign (spec ready at `claude_docs/design/PRICE_RESEARCH_CARD_UX_SPEC.md`)
5. Brand audit fixes — 3 copy bugs, no decisions needed

---

## Recent Sessions

| Session | Date | Summary |
|---------|------|---------|
| S446 | 2026-04-13 | XP frontend: earning rates, coupon tiers, 3 micro-sinks, organizer discounts, HP webhook |
| S445 | 2026-04-13 | XP economy redesign + 5 fraud gates + workspace invite flow |
| S444 | 2026-04-13 | STAFF→MEMBER full rename + workspace permissions fixed |
| S443 | 2026-04-11 | 9 live-site fixes + command center upgrade + appraisal gating |
| S442 | 2026-04-11 | WorkspaceSettings schema fix + test data seed (Alice/Carol teams) |
| S441 | 2026-04-11 | 8-issue fix batch: bounties, achievements, reputation P0, haul posts, price research card |

---

## Brand Audit (still open)

- SharePromoteModal generates "estate sale" copy for ALL sale types
- Homepage meta/SEO omits flea markets and consignment
- Organizer profile meta says "Estate sales by [name]" regardless of sale type

All dispatch-ready, no decisions needed.
