# Patrick Decision Summary — Gamification Spec Revision (S259)
## What's Resolved, What Needs Your Input

---

## WHAT WAS COMPLETED

### Rank Advancement Mechanics (RESOLVED)
- ✅ XP thresholds per tier locked (Scout 500, Ranger 2k, Sage 5k, Grandmaster 12k)
- ✅ Time-to-rank calculated (Scout 6–10 months, Ranger 18–24 months, Sage 36–48 months, Grandmaster 60–72 months)
- ✅ Six XP sources designed with multi-archetype support:
  - Purchases ($1 = 1 XP) — primary loop
  - Visits (5 XP/visit, max 2/day) — supports Bargain Hunters
  - Referrals (50 XP one-time) — supports Social Connectors
  - Specialties (25 XP per category) — supports Quality Collectors
  - Challenges (100–500 XP per seasonal challenge)
  - Community actions (10–50 XP per peer-reviewed action)
  - Streaks & anniversary bonuses (1.2x multiplier)
- ✅ NO DECAY policy locked (permanent XP, no seasonal reset of points)
- ✅ Three collector archetypes analyzed for equal retention:
  - Bargain Hunter: 50+ visits/year, $500–$1,500/year → Path to Ranger via visits + small purchases
  - Quality Collector: 10–15 visits/year, $3,000–$8,000/year → Hits Grandmaster in ~2 years
  - Social Connector: 20–30 visits/year, $1,000–$2,000/year + 5–10 referrals/year → Reaches Sage in 2.5 years

### Organizer Reward Redesign (RESOLVED)
- ✅ NO FEE DISCOUNTS (board veto locked)
- ✅ Four organizer tiers designed with shopper-outcome-based advancement (rating, repeat customers, Sage/Grandmaster endorsements — NOT activity volume)
- ✅ Reward table complete:
  - **Trusted Host:** Featured placement, 5 email credits/month
  - **Elite Host:** 4h response SLA, 15 email credits + 5 listing templates/month
  - **Master Host:** Dedicated account manager, unlimited API access, 30 email credits + 10 listing templates/month
- ✅ Master Host advancement tied to "10+ Excellent reviews from Sage/Grandmaster shoppers" (prevents gaming via low-value sales)

### Presale Access Design (RESOLVED)
- ✅ Detailed operational spec for Sage/Grandmaster presale:
  - Scout: 1 sale/week early access
  - Ranger: 3 sales/week early access
  - Sage: 24h presale (all participating sales)
  - Grandmaster: 48h presale (exclusive window)
- ✅ Opt-in for organizers (Elite+ only; Master auto-enrolled)
- ✅ UX design: Presale notification 48h before, countdown timer, "Early Collector" badge on comments
- ✅ Legal language for ToS drafted
- ✅ Organizer adoption metrics (40%+ presale conversion target; 80%+ retention target)

### Hunt Pass ↔ Rank Integration (RESOLVED)
- ✅ Discount structure locked: Scout 5%, Ranger 10%, Sage 15%, Grandmaster free (capped at 1,000 users — THIS NEEDS YOUR SIGN-OFF)
- ✅ Cannibalization mitigation: Alternative mechanic proposed (Hunt Pass = 1.5x XP multiplier, accelerates rank-up)
- ✅ Monitoring metrics defined (Hunt Pass conversion, Grandmaster free uptake)
- ✅ Quarterly review gate (if Hunt Pass revenue drops >10%, revert free Grandmaster to 5% discount)

### Seasonal Expeditions (RESOLVED)
- ✅ Four complete 12-week seasonal designs with themes, challenges, badges, leaderboards, organizer incentives:
  - **Q1 Spring Awakening** (estate clearances, spring cleaning) — 3 challenges, "Spring Legend" top-10 badge
  - **Q2 Summer Adventure** (travel season, regional hopping) — 3 challenges, "Summer Champion" title
  - **Q3 Fall Collection** (curation, specialization, white-whale hunting) — 3–4 challenges, "Fall Sage" featured in gift guides
  - **Q4 Winter Treasures** (gifts, year-end reflection, annual Hall of Fame) — 3–4 challenges, "Hall of Fame" permanent placement for top 100
- ✅ Leaderboard resets Q1 Day 1; permanent rank persists; seasonal badges are permanent once earned

### Micro-Events (RESOLVED)
- ✅ Board requirement: 8 events at launch (not 16+)
- ✅ Phase 1 launch 8 (Valentine's, Tax Season, Back-to-School, Black Friday, Holiday Gift, New Year, Picnic, Spooktacular)
- ✅ Phase 2 deferred 8 (Earth Day, Graduation, Pride, Fashion, Labor Day, Antique, Gratitude, Black History)
- ✅ Event system designed: Static `EVENTS.ts` registry (hardcoded, Phase 1) vs. Dynamic DB registry (Phase 2 if needed)

### Technical & Phase 1 Scope (RESOLVED)
- ✅ Schema footprint: 5 new tables (UserRank, SeasonalLeaderboard, SeasonalChallenge, GuildXPTransaction, UserSeasonalProgress)
- ✅ XP calculation: Hybrid sync/async (purchases synchronous, everything else async via Bull queue)
- ✅ Phase 1 = Permanent ranks + XP service + 4 seasonal expeditions + 8 micro-events + Hunt Pass integration (4–5 weeks)
- ✅ Phase 1 exclusions: Organizer ranks, presale routing, admin event UI (Phase 2)
- ✅ Phase 2 conditional gate: 4 live metrics (rank penetration ≥25%, engagement lift ≥10%, Hunt Pass conversion ≥1.5%, churn reduction ≥5%)

---

## WHAT NEEDS YOUR DECISION (FIVE TENSIONS)

### TENSION 1: Grandmaster Free Hunt Pass Revenue vs. User Delight

**Decision Required:** Cap free Hunt Pass at 1,000 users, or let it run uncapped?

| Option | Revenue Impact | User Sentiment | Recommendation |
|--------|-----------------|-----------------|-----------------|
| **A: Uncapped** | ~$60k/year loss | Positive; feels rewarding | High user impact, but hurts margin |
| **B: Capped at 1,000** | ~$40k/year loss | Acceptable; "achievement cap" feels right-sized | RECOMMENDED: protects revenue, reward feels earned |
| **C: Capped at 100** | ~$6k/year loss | Resentment; too exclusive | Protects margin, but alienates near-Grandmasters |

**My Recommendation:** Option B (capped at 1,000). Balances user gratitude with business economics.

**Your Call:** Pick A, B, or C.

---

### TENSION 2: Seasonal Leaderboard Resets vs. Veteran Dropout Risk

**Decision Required:** How do you want to handle veteran players (top 50–200 on Q1 leaderboard) resetting to zero on Q2 Day 1?

| Option | Churn Risk | Complexity | Recommendation |
|--------|-----------|-----------|-----------------|
| **A: Strict Reset** | ~10–15% of top 200 may drop | Low (simple leaderboard) | Cleanest mechanic, documented churn risk |
| **B: Soft Reset (XP multiplier)** | ~5% of top 200 | Medium (requires multiplier logic) | Reduces churn, but feels "unfair" to new players |
| **C: Retirement Leaderboard** | ~2% | Medium (two leaderboards) | Veteran-focused, sees them; complexity adds maintenance cost |

**My Recommendation:** Option A (strict reset) for Phase 1. Measure churn. If >10% of top 200 drop, add Option C (Retirement Leaderboard) in Phase 2.

**Your Call:** Accept the churn risk (A), mitigate with multiplier (B), or preemptively add Retirement Leaderboard (C)?

---

### TENSION 3: Visit XP Parity vs. Purchase-Driven Business Model

**Decision Required:** How much XP should visits award? (Affects Bargain Hunter accessibility to Ranger tier)

| Option | Bargain Hunter Path to Ranger | Hunt Pass Discount Cost | Engagement Impact |
|--------|--------|--------|--------|
| **A: Keep 5 XP/visit** | 18 months via visits | ~$300–400/year in discounts for non-spenders | High; Bargain Hunters feel valued |
| **B: Reduce to 1 XP/visit** | 90 months (impossible) | Protected revenue | Low; Bargain Hunters churn out |
| **C: Keep 5, but cap at 100 visits/month** | 24 months (achievable) | ~$150–200/year in discounts | Balanced; cost is bounded |

**My Recommendation:** Option C (keep 5 XP/visit, cap at 100/month). Serves Bargain Hunters without unlimited cost.

**Your Call:** What's your TAM breakdown? If 40%+ of your base are Bargain Hunters, you can't ignore them. Cost this trade-off.

---

### TENSION 4: Sage Presale as Defensible Moat vs. Phase 2 Implementation Complexity

**Decision Required:** Should Sage/Grandmaster presale access be the "big feature" of Phase 2, or defer it further?

| Option | Phase 1 Effort | Phase 2 Complexity | Defensibility |
|--------|--------|--------|--------|
| **A: Ship presale in Phase 2** | +0 days | +15% Phase 2 effort (~5 dev-days) | High; unique feature, hard to replicate |
| **B: Manual presale (Marketing curates)** | +0 days | +0 dev days (Marketing-managed) | Medium; doesn't scale, feels ad-hoc |
| **C: Presale for Elite+ hosts only** | +0 days | +8% Phase 2 effort (~2–3 dev-days) | Medium; scoped; can measure before full rollout |

**My Recommendation:** Option C (presale for Elite+ hosts in Phase 2). Reduces complexity, lets you measure if feature resonates before scaling.

**Your Call:** Are you willing to pay 5+ dev-days for a feature that might have 5% penetration? Or defer it?

---

### TENSION 5: Organizer Fee Discounts (via Gamification) vs. Board Revenue Veto

**Decision Required:** The board unanimously rejected organizer fee discounts. Organizers will ask for them in Phase 2 interviews. Do you want to defend the veto, or offer a small service-credit alternative?

| Option | Revenue Impact | Organizer Sentiment | Maintenance Burden |
|--------|--------|--------|--------|
| **A: Defend board veto** | $0 loss | Resentment initially, then acceptance | Lowest; no new systems |
| **B: Offer small service credits** | ~$1–2k/year (value of free email/templates) | Positive; feels recognized | Medium; need admin UI to track/manage |
| **C: Offer 0.5% fee discount (Master only)** | ~$4k/year loss | Positive; but sets precedent for more | High; slippery slope to more discounts |

**My Recommendation:** Option A initially (defend board veto). After 5–10 organizer interviews in Phase 2, revisit with Option B if adoption is slow.

**Your Call:** Can you defend "no organizer fee discounts"? Or do you want to allocate budget to service credits as a morale/adoption tool?

---

## SIGN-OFF CHECKLIST

Before dev dispatch, confirm:

- [ ] **Tension 1:** Grandmaster free Hunt Pass capped at 1,000 users? (Y/N/Other)
- [ ] **Tension 2:** Seasonal leaderboard strict reset (accept churn risk)? (Y/N/Other)
- [ ] **Tension 3:** Visit XP stays at 5/visit with 100/month cap? (Y/N/Other)
- [ ] **Tension 4:** Sage presale deferred to Phase 2 with Elite+ scope? (Y/N/Other)
- [ ] **Tension 5:** Defend organizer fee discount veto initially? (Y/N/Other)

Once you confirm the above, forward this spec to `findasale-dev` with confidence.

---

## WHAT DEV RECEIVES

The revised spec (gamification-revised-spec-S259.md) includes:
- ✅ Implementation-ready rank system with thresholds
- ✅ Multi-archetype XP design (addresses all three collector types equally)
- ✅ Organizer reward table (no fee discounts, services + prestige)
- ✅ Four complete seasonal expeditions with challenges + badges
- ✅ 8 Phase 1 micro-events + 8 Phase 2 deferred
- ✅ Phase 1 scope boundaries (4–5 weeks, what ships/doesn't ship)
- ✅ Phase 2 conditional gates (4-week metrics checkpoint)
- ✅ Technical specs (schema, XP calculation, event orchestration)
- ✅ Five unresolved tensions surfaced for Patrick (not glossed over)

Dev can begin immediately after you confirm the five tensions.

---

**Prepared by:** Innovation Agent
**Date:** 2026-03-23 (Session 259)
**Next Step:** Patrick confirms tensions; forward to `findasale-dev` skill.
