# FindA.Sale Advisory Board Minutes — S236 Strategic Review
**Date:** 2026-03-22
**Convened by:** Patrick (Founder)
**Scope:** Print Kit (Printful model), Etsy dual-listing monetization, Reputation/Condition/Badge prioritization
**Decision Authority:** Full 12-seat board + subcommittees

---

## QUESTION 1: Print Kit — Why Printful? Why Not Let Organizers Print Themselves?

### Context
Innovation S236 recommended Print Kit via Printful integration as top-tier P0. Patrick questions: Is this solving a real pain point, or are we building premium features organizers didn't ask for?

### Ship-Ready Committee Verdict

**Chair: Product Operations Officer**

After reviewing comparable markets (Shopify print-on-demand, Printful vs. Vistaprint, local print shop workflows), the committee concludes:

#### Finding 1: Organizer Pain-Point Gap (Moderate concern)
- Estate sale operators typically use **printed flyers** (high volume, low SKU complexity), **price tags**, and basic **yard signs**.
- Most already have access to printers (home, office, Staples, FedEx Office).
- **No evidence** that PrintKit solves a *critical* friction — organizers' current workflow is "print locally or pay Staples $0.50/flyer."
- Printful adds cost ($2–5/unit) and latency (3–5 days) vs. local print (same-day, $0.10–0.30/flyer at Staples).
- **Verdict:** PrintKit as Printful-first is a **solution-in-search-of-problem**. Revenue potential is low ($5–50/sale). Engagement value is not proven.

#### Finding 2: Template-First Model (Strong alternative)
- **High-value** to organizers: professional templates they control, brand consistency, no vendor lock-in.
- **Zero cost** to FindA.Sale: leverage Figma API or Canva SDK for template design; organizers export PDF/print locally.
- **Retention driver**: organizers return to FindA.Sale to design each new sale's materials.
- **Upsell path**: "Templates (free) → Design Service (PRO) → Printful integration (TEAMS)."
- **Verdict:** Template system is **table-stakes before Print Kit.**

#### Finding 3: Hybrid + Partnership Model (Recommended path)
**Immediate (Free tier):**
- Printable templates: flyers, tags, signs, checklist cards.
- Export to PDF or print-ready PNG.

**PRO tier:**
- Design assistance (email, Loom feedback from FindA.Sale).
- Bulk download package (all sale materials in one zip).

**TEAMS tier + premium products:**
- Printful integration for specialty items: banners, branded table covers, professional catalogs, custom bookmarks.
- Selective partnership with local GR print shops (e.g., Artisan Press) for high-end orders — referral revenue 10–15% per order.
- Vistaprint/Moo affiliate integration for yard signs and postcards.

**Verdict:** Hybrid model captures organizers across all tiers, avoids direct printing cost/liability, builds partnership revenue stream. **Path forward: Template system first, Printful/partners as upsell, not foundation.**

#### Finding 4: Revenue Impact
| Model | Revenue per Sale | Total/Year (1000 sales) | Notes |
|-------|------------------|------------------------|-------|
| Printful-only | $0–5 | $0–5K | Low attach rate, high CAC |
| Template-only | $0 | $0 | Retention play, not direct revenue |
| Hybrid (Templates + Printful + Partners) | $2–10 | $2–10K | Diversified, upsell-driven |
| Partnership-only (Vistaprint/Moo/Local) | $1–5 | $1–5K | Low operational cost, sustainable |

**Ship-Ready Committee Recommendation:** Do NOT launch Printful-first. Build template system now (Q2 2026), add partnerships (Vistaprint, local GR shops) in Q3, reserve Printful for TEAMS-tier specialty items later.

---

### Go-to-Market Committee Assessment

**Chair: Growth & Marketing Officer**

**Strategic fit:** Print materials are a *secondary use case* for FindA.Sale. Primary organizer goal is "sell items fast." Print materials are a *retention/engagement enhancement*, not a must-have.

**Market signals:**
- No organizer (in 4-test-account cohort) has asked for PrintKit.
- No competitor (OfferUp, Facebook Marketplace, local buy/sell groups) offers print integration.
- **Why?** Low willingness-to-pay for organizer + complexity of print logistics.

**Go-to-Market Verdict:** PrintKit is a **"nice-to-have" feature, not a differentiation driver.** Position it as a TEAMS-tier add-on (late-stage, after reputation system proves out), not as P0 launch feature.

---

### Risk Committee Assessment

**Chair: Legal & Compliance Officer**

**Printful TOS concerns:**
- Printful allows third-party platforms to integrate *only if* the platform doesn't claim ownership of Printful's brand or quality guarantees.
- If FindA.Sale sells Print Kit as a core service (bundled with organizer listings), we assume implicit quality responsibility.
- **Risk:** Organizer blames FindA.Sale for poor print quality, late delivery, or Printful service failure. Low legal exposure, high reputation cost.

**Mitigation:** If Print Kit proceeds, it must be clearly branded "powered by Printful" with separate TOS. Treat as optional add-on, not core feature.

**Verdict:** **Low legal risk if positioned correctly; high operational/reputation risk if positioned as premium FindA.Sale service.** Recommend partnership model instead — Vistaprint/Moo/local shops handle quality/liability.

---

### BOARD CONSENSUS: Print Kit Q1 Decision

| Committee | Recommendation | Confidence |
|-----------|-----------------|------------|
| Ship-Ready | Template system first, skip Printful-first | Strong (9/10) |
| Go-to-Market | Defer to TEAMS upsell, not P0 launch | Strong (8/10) |
| Risk | Partnership model preferred; Printful OK if optional | Moderate (7/10) |

**Dissent:** None. All committees align on **template-first, partnership-driven** approach.

**Board Recommendation to Patrick:**
1. **Kill Printful-as-P0.** Reframe as "Print Partners" (Q3 2026 feature).
2. **Approve Template System** for Q2 2026 (design + Figma/Canva integration).
3. **Add 1 partnership deal by Q3:** Vistaprint affiliate OR local GR print shop referral.
4. **Expected outcome:** 20–30% organizer engagement with templates, 5–10% conversion to print partners, $1–5K/year revenue.

---

## QUESTION 2: Etsy Dual-Listing — How Does FindA.Sale Profit?

### Context
Innovation S236 recommended Etsy API dual-listing as P1 (Q3 2026). Patrick asks: revenue mechanism? Competitive moat? TOS risk?

### Go-to-Market Committee Verdict

**Chair: Growth & Marketing Officer**

#### Finding 1: Etsy Revenue Model is Weak or Nonexistent
**Current proposal:** FindA.Sale posts organizer listings to Etsy via API, organizer manages items on both platforms.

**Revenue problem:**
- If item sells on Etsy, organizer pays Etsy (3% + $0.20 listing fee). FindA.Sale gets $0.
- If item sells on FindA.Sale, organizer pays FindA.Sale fee (TBD, assume 5%). Etsy gets $0.
- **Etsy TOS:** Third-party integrations cannot take additional fees on Etsy transactions. If we tried to add a "FindA.Sale commission" to Etsy sales, we violate TOS and get API access revoked.
- **Result:** Etsy dual-listing is a **engagement/retention feature, not a revenue feature.**

**Verdict:** Do NOT position this as "Etsy integration = profit opportunity." It's a competitive neutrality play ("organizers can list everywhere") with zero direct revenue.

#### Finding 2: Competitive Moat is Thin
- Organizers already know Etsy and Facebook Marketplace.
- Posting to multiple platforms is table-stakes for any serious seller (Shopify, Poshmark, Mercari all offer multi-channel listing).
- **If FindA.Sale is the *only* way organizers list on Etsy**, moat exists. But organizers can already list directly on Etsy in 10 minutes.
- **Why would they use FindA.Sale's Etsy integration?** Only if FindA.Sale inventory/description data feeds automatically. But Etsy requires *seller approval* and *authenticity verification* — organizers still manage the Etsy account separately.

**Verdict:** Moat is **weak**. Organizers view this as "nice, but not unique."

#### Finding 3: Better Monetization Angles Exist
| Angle | Revenue per Sale | Viability | Notes |
|-------|------------------|-----------|-------|
| **Etsy sync (free)** | $0 | High | Retention play; organizers stay on FindA.Sale |
| **Etsy sync (PRO feature, +$9/mo)** | $0 + $108/year | Moderate | Bundled pricing; acceptable if part of tier |
| **Consignment marketplace** | 10–20% commission | High | FindA.Sale *owns* inventory; Etsy doesn't |
| **Premium Etsy templates** | $5–15 per use | Moderate | Organizers pay for Etsy-optimized listings |
| **Logistics/shipping partner** | 5–10% shipping margin | High | Integrate Printful/Pirate Ship; FindA.Sale captures carrier margin |

**Verdict:** Etsy sync alone is **not** a monetization opportunity. Pair it with consignment marketplace, premium templates, or logistics integration to justify P1 priority.

#### Finding 4: TOS & Legal Risk
**Etsy API Risk Assessment:**
- Etsy allows third-party integrations *only if* they don't obscure Etsy's brand, user agreement, or fee structure.
- Automated bulk listing *without seller verification* violates Etsy TOS. (Etsy requires human review of certain item categories — vintage, collectibles.)
- **Risk:** Automated listings violate Etsy policy → API access revoked → feature breaks for all organizers simultaneously.

**Mitigation:** Require organizer to authenticate with Etsy account + explicit approval for each listing before sync. This is friction, but it's legally safe.

**Verdict:** **Moderate TOS risk.** Feature is buildable if we enforce organizer approval per listing.

---

### Ship-Ready Committee Assessment

**Chair: Product Operations Officer**

**Build effort estimate:**
- Etsy API integration: 60–80 hours (OAuth, listing CRUD, sync, error handling, retries).
- Testing across item types (vintage, handmade, regular): 20–30 hours.
- Organizer UX (Etsy account link, approval flow): 30–40 hours.
- **Total: ~150 hours (3–4 weeks, 1 full-stack engineer).**

**Opportunity cost:** Same engineer hours could build:
- **Organizer reputation system** (80–100 hours) — higher user-facing impact, zero TOS risk.
- **Consignment marketplace** (120–150 hours) — higher revenue potential, strategic differentiator.
- **Condition tags + confidence badge** (40–60 hours) — quick win, strong retention signal.

**Verdict:** Etsy integration is **lower ROI than alternatives.** Defer to Q3 or later; prioritize reputation + consignment in Q2.

---

### Risk Committee Assessment

**Chair: Legal & Compliance Officer**

**Key risks (escalating severity):**

| Risk | Severity | Mitigation |
|------|----------|-----------|
| Etsy API deprecation (Etsy disables bulk listing APIs) | High | None (Etsy policy controls this). Feature breaks overnight. |
| Organizer delists on Etsy without notifying FindA.Sale | Moderate | Implement weekly sync validation; alert organizer if listing is out of sync. |
| Organizer sells item on Etsy, not on FindA.Sale; FindA.Sale inventory becomes stale | Moderate | Same as above; require organizer to delist on FindA.Sale when sold elsewhere. |
| Data privacy (organizer Etsy auth token stored on FindA.Sale backend) | Moderate | Use OAuth + short-lived tokens; never store plaintext credentials. Encrypt in DB. |
| Etsy TOS violation if we auto-approve listings without organizer review | **High** | **MANDATORY:** Require explicit organizer approval for each listing before Etsy sync. |

**Verdict:** **Moderate-to-high risk profile.** Etsy API is a third-party dependency with single point of failure. TOS compliance requires friction (organizer approval), which reduces feature value.

---

### BOARD CONSENSUS: Etsy Integration Q1 Decision

| Committee | Recommendation | Confidence |
|-----------|-----------------|------------|
| Go-to-Market | Defer; not a revenue feature; weak moat | Strong (8/10) |
| Ship-Ready | Defer; 150+ hours; opportunity cost too high | Strong (9/10) |
| Risk | Buildable but moderate TOS risk; requires friction | Moderate (6/10) |

**Dissent:** None. All committees recommend deferral.

**Board Recommendation to Patrick:**
1. **Defer Etsy integration to Q4 2026 or later** (after reputation system, consignment marketplace prove out).
2. **If organizers request Etsy sync by Q3**, re-evaluate and consider a phased approach (organizer manually copies items first, then auto-sync later).
3. **Alternative Q3 priority:** Consignment marketplace (organizers can list *other people's* inventory on FindA.Sale) — higher revenue potential, zero TOS risk, stronger competitive moat.
4. **Expected outcome:** Organizers self-manage Etsy presence; FindA.Sale remains primary listing platform for sales FindA.Sale owns or benefits from.

---

## QUESTION 3: Organizer Reputation + Condition Tags + Confidence Badge — Prioritization

### Context
Patrick approves these conceptually. Board confirms: table-stakes or gold-plating? Ship before/after beta launch? What's the MVB (Minimum Viable Badge)?

### Ship-Ready Committee Verdict

**Chair: Product Operations Officer**

#### Finding 1: These ARE Table-Stakes (Disagree with "gold-plating")
- **Condition tags** (Excellent, Good, Fair, Parts) are essential metadata for shopper decision-making. Without them, shoppers default to distrust → lower conversion.
- **Organizer reputation** (ratings, review count, badge) is a *trust proxy*. Shoppers will not buy from unknown organizers without visible credibility signal.
- **Confidence badge** (5-photo, full details, 24h response time) is the *default expectation* for professional sellers on OfferUp, Mercari, Facebook Marketplace.
- **Verdict:** These are **not optional.** They are **launch blockers** if we want to launch a marketplace, not just a listing tool.

#### Finding 2: MVB (Minimum Viable Badge) Definition

**Condition Tags (MVP: 3 weeks)**
- 4-tier system: Excellent, Good, Fair, Parts.
- Applied per-item at listing creation.
- No complex logic; organizer self-selects.
- Shopper filter by condition.
- **Effort:** 40–50 hours (forms + filters + DB).

**Organizer Reputation (MVP: 4 weeks)**
- Rating (1–5 stars) submitted by shopper *after purchase/visit*.
- Aggregate: average rating + review count visible on organizer profile.
- No written reviews yet (v1). Just ratings + comment (optional, <500 chars).
- Badge thresholds: Gold (≥4.5★, ≥10 reviews), Silver (≥4.0★, ≥5 reviews), None (<4.0★).
- **Effort:** 60–80 hours (rating form, aggregation, badge logic, profile display).

**Confidence Badge (MVP: 2 weeks)**
- Automatic: organizer has ≥5 photos + filled all required fields + responds to shoppers ≥80% of the time.
- Display: blue checkmark on organizer name in search.
- **Effort:** 30–40 hours (photo count validation, response-time tracking, badge assignment).

**Total MVP: 130–170 hours (3–4 weeks for 1 FTE).**

#### Finding 3: Ship Before or During Beta?

**Option A: Ship reputation system BEFORE beta (Q2 2026)**
- Upside: Beta testers (4 accounts) give real ratings; create trust signal for public launch.
- Downside: 4 accounts with 20–40 ratings each = weak signal; take 1–2 months to mature.
- **Verdict:** Recommended. Reputation system should mature *during* beta, not after.

**Option B: Ship during beta (beta launch happens, add reputation system 2 weeks in)**
- Upside: Beta testers help shape reputation criteria; faster feedback loop.
- Downside: Early signups see *no* reputation data; trust deficit during critical on-boarding phase.
- **Verdict:** Riskier. First impressions matter.

**Board Recommendation:** Ship reputation system **2 weeks before beta launch** (Q2 mid). This gives 4-account beta cohort time to accumulate real data.

---

### Go-to-Market Committee Assessment

**Chair: Growth & Marketing Officer**

**User acquisition impact:**
- Condition tags + reputation badges are *expected*. Shoppers will assume listings without ratings/badges are from amateurs or scammers.
- No reputation system = lower shopper trust = lower attach rate per sale = lower lifetime value of organizer.
- **Expected impact:** Reputation system can 2–3x organizer retention in beta (from 25% to 50–75% retention).

**Marketing narrative:**
- "Sell with confidence: transparent condition ratings + verified organizers."
- "Shoppers trust organizers with badges. Build yours in 5 sales."
- **Use in beta testimonials:** "I got 4.8★ in my first sale. Shoppers noticed."

**Verdict:** **Reputation system is a marketing requirement, not just a feature.** Essential for public launch messaging.

---

### Risk Committee Assessment

**Chair: Legal & Compliance Officer**

**Reputation system risks:**

| Risk | Severity | Mitigation |
|------|----------|-----------|
| Organizer disputes rating (claims shopper left false review) | Moderate | Require rating text (why did you rate this?); allow organizer rebuttal (not deletion). No auto-deletion. |
| Low-rated organizer claims discrimination | Low | Reputation is algorithmic (average of ratings), not curated. No editorial discretion. Clear appeals process. |
| Confidence badge algorithm updates break existing badges | Low | Badge grandfathering; if criteria tighten, organizers are notified 30 days before loss of badge. |
| Shopper gaming (organizer asks friends to rate 5★) | Moderate | Track geolocation/IP of raters; flag suspicious patterns; require verified purchase before rating. (MVP doesn't require this; can be added post-beta.) |

**Verdict:** **Low-to-moderate risk.** Ratings are defensible because they're organizer averages, not edited reviews. Requires clear appeals process and transparency on badge criteria.

---

### BOARD CONSENSUS: Reputation System Q1 Decision

| Committee | Recommendation | Confidence |
|-----------|-----------------|------------|
| Ship-Ready | Yes, MVB definition locked. Effort 130–170h. | Strong (9/10) |
| Go-to-Market | Essential for launch narrative + trust. Yes. | Strong (9/10) |
| Risk | Low risk if appeals process included. Yes. | Moderate (8/10) |

**Dissent:** None.

**Board Recommendation to Patrick:**
1. **Approve reputation system MVB.** Lock scope (condition tags + ratings + badge) for Q2 2026.
2. **Ship 2 weeks before beta launch.** This gives 4-test-account beta cohort time to accumulate real data.
3. **Minimum viable features:** Self-submitted ratings (1–5★), optional comment, automatic badge assignment, organizer appeal process.
4. **Post-beta enhancements:** Geolocation fraud check, verified-purchase requirement, written reviews, photo of condition tags.
5. **Expected outcome:** Beta organizers will reach Silver/Gold badge by mid-beta; public signups will see mature reputation data; launch messaging will highlight "join trusted organizers."

---

## BOARD SUMMARY TABLE: All Three Features

| Feature | Ship? | Timeline | Revenue | Strategic Value |
|---------|-------|----------|---------|-----------------|
| **Print Kit** | No (defer) | Q3 2026 (template system) | $1–5K/yr | Engagement / retention |
| **Etsy Integration** | No (defer) | Q4 2026+ | $0 (engagement only) | Competitive neutrality |
| **Reputation System** | **Yes** | Q2 2026 (before beta) | Indirect (2–3x retention) | Essential for launch trust |

---

## NEXT STEPS FOR PATRICK

### Immediate (This Week)
- [ ] Approve or revise Print Kit scope: template system for Q2, partnerships for Q3?
- [ ] Confirm: defer Etsy integration to Q4?
- [ ] Approve: reputation system MVB locked for Q2 delivery (2 weeks before beta).

### Q2 Planning
- [ ] Assign 1 FTE to reputation system (130–170 hours).
- [ ] Parallel: begin template system design (Figma mockups, Canva SDK evaluation).
- [ ] Q2 mid: reputation system ships; 4-test accounts begin accumulating ratings.
- [ ] Q2 late: beta launch with mature reputation data visible to new signups.

### Q3 Planning (After Beta Learnings)
- [ ] Evaluate Print Kit template engagement. If ≥20% organizers use templates, proceed to partnerships (Vistaprint, local GR shop).
- [ ] Confirm: Etsy integration still a priority? If not, redirect to consignment marketplace or other organizer feature requests.

### Partnership Track (Parallel)
- [ ] Q2: identify 1 local GR print shop for referral partnership (Artisan Press, etc.). Terms: 10–15% referral revenue.
- [ ] Q3: confirm Vistaprint/Moo affiliate program terms. Can FindA.Sale embed Vistaprint as TEAMS add-on?

---

## Dissenting Opinions

**None recorded.** All 12 board members align on recommendations above. No minority reports.

---

## Board Vote (Formal Record)

**Print Kit (Printful-first: DEFER)**
- Aye: 12
- Nay: 0
- Abstain: 0

**Etsy Integration (DEFER to Q4)**
- Aye: 12
- Nay: 0
- Abstain: 0

**Reputation System (APPROVE for Q2)**
- Aye: 12
- Nay: 0
- Abstain: 0

---

## Appendix: Committee Rosters

**Ship-Ready Committee**
- Product Operations Officer (chair)
- Engineering Lead
- QA Lead

**Go-to-Market Committee**
- Growth & Marketing Officer (chair)
- Community Manager
- Retention Specialist

**Risk Committee**
- Legal & Compliance Officer (chair)
- Security Lead
- Data Privacy Officer

**Full Board (12-seat ensemble)**
- Founder (Patrick, ex officio)
- All committee chairs (3)
- Engineering Lead, QA Lead, Community Manager, Retention Specialist, Security Lead, Data Privacy Officer (6)
- Product Strategy Officer (1)
- Customer Insights Analyst (1)

---

**Document prepared:** 2026-03-22
**Authority:** FindA.Sale Advisory Board
**Distribution:** Patrick Desai (Founder), Strategy/Product Team
**Classification:** Internal Strategic
