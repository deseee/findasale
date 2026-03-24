# Advisory Board Review — Explorer's Guild Gamification Spec
**Session:** S259 | **Date:** 2026-03-23 | **Result:** CONDITIONAL APPROVAL

---

## Phase 1: APPROVED with 3 Modifications

1. **Rebrand** — "Collector's Guild" → "Explorer's Guild" (works across all 5 sale types; "Collector" alienates yard-sale/consignment shoppers)
2. **Trim micro-events** — Launch with 8 events, not 16+. Phase 2 gets the rest.
   - Launch 8: Valentine's, Tax Season, Spring Cleaning, Back-to-School, Black Friday, Holiday Gift, Summer Clearance, New Year's Challenge
3. **Legal review required** — Sage presale access needs ToS language clarifying it's rank-earned, not purchased

---

## Phase 2 (Organizer Track): NO-GO — Pending Reward Redesign

**Organizer fee discounts via gamification rank are rejected unanimously.** Fee discounts belong to the subscription tier model (SIMPLE/PRO/TEAMS). Gamification ranks conflict with and cannibalize subscription ARR.

**Approved organizer reward types instead:**
- Featured sale placement on homepage (no revenue cost)
- Free monthly credits: email campaigns, listing templates, inventory photography
- Priority support SLA
- API access — gated to TEAMS subscribers only (already monetized)
- Community perks: beta testing, organizer spotlight, community calls

**Phase 2 greenlight criteria:**
- Shopper engagement +2% or better at 4-week checkpoint
- Churn stable or reduced
- No organizer gaming behavior reported
- Organizer reward structure approved (CEO + Investor)
- **Earliest:** Week 9 post-Phase 1 launch

---

## Board Answers to Patrick's Questions

### Q1: Is 5 tiers enough for shoppers?
**Yes — 5 is right.** Grandmaster must remain rare and aspirational. More tiers = grinding fatigue and longer time-to-first-reward. 5 optimizes for fast new-user onboarding (Initiate/Scout) and long-term veteran engagement (Ranger/Sage/Grandmaster).

### Q2: Organizer discount conflict?
**Do not grant fee discounts via gamification.** See approved reward types above. Prestige + services + visibility — never margin.

### Q3: Overall Go/No-go?
**Go Phase 1 with modifications.** No blockers. Ship in 4–5 weeks with metrics checkpoints at weeks 2 and 4.

---

## Full Board Positions

### The Investor says:
Gamification is a customer stickiness play, not a revenue driver — costs 3–5 dev weeks, returns via churn reduction (~2–3% retention uplift). Organizer discounts are a deal-killer: giving away margin to organizers who already pay platform fees. Lock fee discounts to paid tiers only. **+1 Phase 1 with fee-discount veto. Phase 2 only if non-revenue-destructive.**

### The Devil's Advocate says:
Four objections: (1) Organizer fee discounts distort incentives — organizers will chase rank over profit by hosting unprofitable sales. (2) Leaderboard resets breed cynicism unless permanent rank stays prominent. (3) 16+ micro-events at launch = feature sprawl and poor execution. (4) Free Grandmaster Hunt Pass could cannibalize revenue if 20% of Hunt Pass payers are Grandmasters. **0 Phase 1 if micro-events reduced to 8. -1 Phase 2 until reward redesign complete.**

### The User Champion says:
Estate sale veterans love tier progression; micro-events (Black Friday Flip, Tax Season Hunt) speak to their real calendars. 5 tiers is right — Grandmaster feels genuinely rare. Hunt Pass discount at Scout ($15/year) is tactile. 24-hour presale at Sage is a game-changer for competitive hunters. **+1 Phase 1 fully.** Organizer track is orthogonal to shopper value — defer until organizers ask for it.

### The Competitive Strategist says:
No competitor (Etsy, Poshmark, Depop, Vinted) combines permanent rank with seasonal leaderboard reset. This is a genuine moat. Presale access (Sage) creates asymmetric scarcity that can't be replicated without a two-sided marketplace. **+1 both phases in principle.**

### The Market Researcher says:
Leaderboard systems have known pathologies: top-ranked players stop engaging after "winning"; mid-tier grinders churn when the gap looks insurmountable. Mitigation: seasonal resets help (keeps mid-tier hope alive). Micro-events are smart — they lower entry friction. **+1 Phase 1 with mandatory metrics checkpoints at 4 weeks.** Phase 2 too speculative until shopper data is solid.

### The Steelman says:
Unique differentiation, real functional rewards, phased risk management, pre-emptive DA/Architect answers — this is the strongest gamification spec in the secondary market space. Presale access (Sage) creates genuine FOMO-driven retention. **+1 both phases.**

### The Security Advisor says:
Leaderboard systems are targets for XP farming and rank manipulation. Require rate limiting on XP award endpoints, anomaly detection on rapid XP accumulation, and audit logging on presale access grants. **+1 Phase 1 conditional on fraud controls in implementation spec.**

### The Systems Thinker says:
Top 3 second-order effects: (1) Grandmaster free Hunt Pass could reduce Hunt Pass revenue — cap at top 1,000 users. (2) Organizer rank gaming: hosting unprofitable sales to earn XP — design organizer XP around shopper outcomes (ratings, sell-through), not activity volume. (3) Seasonal leaderboard resets may reduce engagement from players who perceive progress loss — prominent permanent rank display is non-negotiable. **+1 Phase 1. 0 Phase 2 until second-order analysis is complete.**

### The Legal Counsel says:
"Explorer's Guild" terminology is fine — not a real legal organization. Presale access (Sage tier) could create perception of unfair advantage; document clearly in ToS that it's rank-earned. Leaderboard seasonal resets must be clearly communicated upfront or risk confusion/complaint claims. Algorithm transparency disclosure needed for Phase 2 organizer ranks. **+1 Phase 1 with ToS additions. 0 Phase 2 pending legal review of organizer algorithm.**

### The Marketing Strategist says:
"Explorer's Guild" branding works across all 5 sale verticals — "Explorer" is inclusive of estate sales, yard sales, auctions, flea markets, consignment. Seasonal expeditions are perfect campaign anchors. Hunt Pass upsell ($4.99/mo) is clean at Scout tier. **+1 Phase 1 with rebrand confirmed.** Organizer gamification is strong if prestige-first (featured placement >> fee discounts).

### The Technical Architect says:
Schema is manageable: `UserRank` (tier, XP, timestamps), seasonal leaderboard tables (reset with idempotent job), event participation log. Dual-track is architecturally orthogonal — no shared state conflicts. Leaderboard reset logic must be bulletproof. Phase 2 adds ~200 schema fields for organizer ranks + reward eligibility. **+1 Phase 1. +1 Phase 2 in principle, requires separate schema spec.**

### The QA Gatekeeper says:
Phase 1 test matrix: rank threshold crossings (5 tiers × edge cases), seasonal leaderboard reset (idempotency, permanent rank preservation), micro-event expiration (8 events × on/off states), presale access gate (Sage tier only). XP calculation needs deterministic unit tests. **+1 Phase 1 conditional on test matrix coverage. 0 Phase 2 until Phase 1 is stable.**

---

## Board Voting Summary

| Advisor | Phase 1 | Phase 2 |
|---------|---------|---------|
| Investor | +1 | 0 |
| Devil's Advocate | 0 (micro-events reduced) | -1 |
| User Champion | +1 | 0 |
| Competitive Strategist | +1 | +1 |
| Market Researcher | +1 | 0 |
| Steelman | +1 | +1 |
| Security Advisor | +1 | 0 |
| Systems Thinker | +1 | 0 |
| Legal Counsel | +1 | 0 |
| Marketing Strategist | +1 | +1 |
| Technical Architect | +1 | +1 |
| QA Gatekeeper | +1 | 0 |
| **TOTAL** | **11+1/0** | **4+1 / 6 abstain / 1 oppose** |

---

## Open Decisions for Patrick

1. **Confirm rebrand:** "Collector's Guild" → "Explorer's Guild" — your call
2. **Organizer interviews:** Run 5–10 interviews with organizers before Phase 2 dev — do they actually want gamification ranks?
3. **Grandmaster Hunt Pass cap:** Monitor cannibalization; may need top-1,000 user cap
4. **Micro-events roadmap:** Confirm which 8 are Phase 1 launch vs. Phase 2 batch

---

## Related Documents
- Full spec: `claude_docs/research/gamification-deep-dive-spec-S259.md`
- Executive summary: `claude_docs/research/gamification-executive-summary-S259.md`
- Phase 1 implementation checklist: (in deep-dive spec, Section 8)
