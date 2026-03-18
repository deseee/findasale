# Architect Review: Parallel Path Architecture vs. Subagent Fleet — 2026-03-06

**To:** Patrick
**From:** findasale-architect
**Date:** 2026-03-06
**Status:** RECOMMENDATION

---

## Executive Summary

The current roadmap's "Parallel Path Architecture" (P / CA / CB / CC / CD) **accurately reflects how the project operates**, but the abstraction is now **outdated in naming**. The team has migrated from a generic "Claude" parallel-path model to a **named subagent fleet** that performs the same work with explicit ownership and clearer handoffs.

**Recommendation:** Update the roadmap's architecture section to map old paths (CA/CB/CC/CD) to current subagents, and retain the abstraction because it still serves a strategic purpose—it visually separates **what's being built** (CD) from **what's being managed** (P/CA/CB/CC).

---

## Question 1: CA (Production Readiness) — Ownership & Status

**Historical CA scope:** Security hardening, schema validation, payment stress tests, terms/privacy, user flows.

**Current owners (from STATE.md + COMPLETED_PHASES.md):**
- **findasale-ops** — production infra (Railway, Vercel, Neon), deployment checklist, incident response
- **findasale-qa** — security/QA audits, stress testing, risk identification
- **findasale-records** — documentation (STATE.md, STACK.md, SECURITY.md updates)
- **findasale-ux** — user flow audits, first-time experience

**Assessment:**
CA is **NOT "done" in the sense of "never revisit."** It's an **ongoing operational responsibility**, now distributed across ops + QA + records. The work that CA did (security validation, deployment readiness, state tracking) is now baked into the **session wrap protocol** and **health-scout monitoring**.

**Verdict:** CA as a discrete parallel track is **outdated.** Its work is now owned by:
- findasale-ops (production readiness checks before every deploy)
- findasale-qa (pre-release security/performance audits)
- findasale-records (documentation + STATE.md alignment)

CA can be **renamed to "Ops & QA"** or **removed entirely** since those subagents now own it.

---

## Question 2: CB (AI Image Processing) — Feature Owner in Phase 2+

**Historical CB scope:** Image tagging pipeline, Google Vision integration, Haiku prompting, AI feedback loops.

**Current status (from STATE.md):**
- ✅ CB1–CB5 complete. Cloud AI service (Google Vision → Claude Haiku) shipped.
- ✅ Haiku prompt improved (tags field, category/condition guidance).
- ✅ analyzeItemTags now uses cloudAIService; Ollama fallback intact.
- ✅ Frontend AI tag suggestion panel live on add-items + edit-item pages.

**Next AI features in Phase 2–4 (from roadmap):**
- **Phase 2, Feature 1:** AI Sale Description Writer (1–2 sprints)
- Future: AI Discovery Feed, Buyer-to-Sale Matching (deferred — needs real data)

**Current owner for Phase 2+ AI:**
- **findasale-dev** implements new AI endpoints + components
- **findasale-architect** designs the data contract (what input → output schema should be)
- **findasale-rd** evaluates alternative AI approaches (e.g., could we use a local LLM instead of Haiku for descriptions?)

**Verdict:** CB was a **workstream initialization track.** It set up the AI pipeline infrastructure. **Future AI features are now owned by findasale-dev** when they're built, with architectural sign-off from findasale-architect. CB as a parallel track **can be removed** — its work is complete and owned by standard dev.

---

## Question 3: CC (Business Intel & Content) — Subagent Mapping

**Historical CC scope:** Competitive analysis, pricing analysis, marketing content, investor materials, scheduled intelligence tasks.

**Current CC outputs (from STATE.md):**
- ✅ CC1: Investor materials (exec summary, 12-slide pitch, 3-year model, TAM $150M)
- ✅ CC2: Marketing content (2 blog posts, social templates, 4 email templates, messaging pillars)
- ✅ CC3: Pricing analysis (competitors 13–20% vs. FindA.Sale 5% — recommends flat 5%/7%)
- ✅ CC4: Automated Intelligence (7 scheduled tasks running: competitor monitoring, industry intel, changelog scanning, UX spots, health scout, monthly digest, workflow retrospective)

**Current owners:**
- **findasale-marketing** — blog posts, social templates, email campaigns, brand voice
- **findasale-rd** — competitive research, technology evaluation, market analysis, feasibility studies
- **findasale-cx** — customer intelligence, feedback synthesis (implied by CX title)
- **Scheduled tasks** — findasale-workflow (bi-weekly review task), health-scout (weekly health check)

**Verdict:** CC is **active and ongoing.** It's best mapped as:

| CC Component | Current Owner |
|---|---|
| CC1 (Investor materials) | findasale-marketing + findasale-rd |
| CC2 (Marketing content) | findasale-marketing |
| CC3 (Pricing analysis) | findasale-rd |
| CC4 (Scheduled intelligence) | findasale-workflow (orchestration) + findasale-rd (research) |

CC **should remain in the roadmap** as an active parallel track, but **rename to "Marketing & Research"** to reflect the split.

---

## Question 4: CD (Innovation & Experience) — Subagent Ownership Model

**Historical CD scope:** Feature pipeline (Phase 2–4), UX design, scarcity signals, QR codes, user engagement features.

**Current CD outputs (from STATE.md + roadmap):**
- ✅ CD1: Fraunces serif font + sage-green palette
- ✅ CD2-P1: Scarcity counter + social proof stats
- ✅ CD2-P2: QR codes (SaleQRCode.tsx, download/print/copy)
- Upcoming Phase 2–4: AI Description Writer, Branded Social Templates, Loyalty Program, Search by Item Type, POS, Dashboard, Referrals, Batch Ops, Premium Tier, Status Updates, Verified Badge

**Current owners (implied by roadmap + skills):**
1. **findasale-architect** — designs the feature (contract, schema, cross-layer impact)
2. **findasale-ux** — specs the flow (user journey, form design, edge cases)
3. **findasale-dev** — implements the code
4. **findasale-qa** — tests and validates
5. **findasale-rd** — researches feasibility if the feature is novel/risky

**Verdict:** CD is **still accurate**, but the execution model is now **serial-specialist** rather than parallel:
```
findasale-architect (design)
  ↓ (handoff)
findasale-ux (spec the flow)
  ↓ (handoff)
findasale-dev (implement)
  ↓ (handoff)
findasale-qa (test)
```

CD **remains in the roadmap** but **clarify that it follows the subagent workflow** (not a solo Claude workstream).

---

## Question 5: Should the Roadmap's Architecture Section Be Updated?

**Current roadmap structure:**
```
## Parallel Path Architecture
P — Patrick (Business + Legal + Beta Recruitment)
CA — Claude: Production Readiness (✅ COMPLETE)
CB — Claude: AI Image Processing (✅ COMPLETE)
CC — Claude: Business Intel & Content (Ongoing)
CD — Claude: Innovation & Experience (Active)
```

**Recommendation: YES, update it — here's the new structure:**

```
## Parallel Path Architecture

The team operates as a **human + subagent fleet** with the following parallel tracks:

**P — Patrick (Human):** Business formation, legal, API credentials, beta recruitment.

**OPS & QA** (findasale-ops, findasale-qa, findasale-records):
- Production readiness checks before every release.
- Security hardening, schema validation, deployment checklists.
- Known gotchas in STATE.md and RECOVERY.md always in sync.

**MARKETING & RESEARCH** (findasale-marketing, findasale-rd, findasale-workflow):
- Competitive analysis, market research, feasibility studies.
- Marketing content (blog, social, email), messaging pillars.
- Scheduled intelligence tasks (weekly health scout, bi-weekly workflow review).

**FEATURES** (findasale-architect → findasale-ux → findasale-dev → findasale-qa):
- Feature design (architect), UX spec (designer), implementation (dev), testing (QA).
- Roadmap phases 2–4 itemized below.
```

**Why this update works:**
- ✅ Maps old abstractions to actual subagents
- ✅ Shows the **specialist handoff workflow** (not a nebulous "Claude doing everything")
- ✅ Separates **maintenance work** (ops/qa) from **feature work** (architect→dev→qa)
- ✅ Keeps the roadmap readable (doesn't add 12 new acronyms)

---

## Question 6: Phase 2–4 Features Requiring Architect Review

Scanning the roadmap for **features that cross layer boundaries or introduce new infrastructure:**

| Phase | Feature | Layers Touched | Architect Input Needed? | Risk |
|-------|---------|---|---|---|
| 2/1 | AI Sale Description Writer | Backend (new endpoint) + Frontend (new component) | **YES** — new API contract, Haiku prompt design, response caching strategy | Medium (AI quality unknowns, token cost) |
| 2/2 | Branded Social Templates | Frontend (new page) + Cloudinary | **YES** — watermarking integration, QR embedding, asset caching | Low (Cloudinary already locked) |
| 2/3 | Shopper Loyalty Program | Database (new model: Coupon?), Backend (endpoints), Frontend (claim flow) | **YES** — schema design, email integration (Resend already in place), tracking logic | Medium (coupon redemption edge cases) |
| 2/4 | Search by Item Type | Database (index on category?), Backend (new query), Frontend (new filter UI) | **MAYBE** — if it requires adding composite index or new full-text search, yes. If it's just exposing category filter, no. | Low-Medium (query performance on 300+ items per sale) |
| 3/5 | Stripe Terminal POS | Backend (Terminal API integration) + Frontend (new device UI) | **YES** — new Stripe service integration, POS security model, offline-first caching | High (new payment flow, real-world hardware) |
| 3/6 | Seller Performance Dashboard | Backend (new analytics endpoints, maybe aggregation job) + Frontend (charts/stats) | **MAYBE** — if aggregation is real-time expensive, needs cron job design. Otherwise standard. | Medium (data freshness, large-scale aggregation) |
| 3/7 | Shopper Referral Rewards | Database (tracking model), Backend (distribution logic), Frontend (UI) | **YES** — schema design (ReferralReward model?), webhook/cron timing, email coordination | Medium (fraud prevention, coupon double-spend) |
| 3/8 | Batch Operations Toolkit | Backend (new bulk endpoints), Frontend (batch uploader + progress UI) | **YES** — transaction design (atomicity of bulk pricing updates?), rate limiting on bulk uploads, idempotency keys | Medium (concurrent edit conflicts) |
| 4/9 | Premium Organizer Tier | Database (feature gate field on Organizer?), Backend (license check middleware), Frontend (paywall) | **YES** — feature-gating strategy (field-based vs. separate table?), billing integration (new Stripe product?), grace-period logic | Medium-High (subscription lifecycle, downgrade scenarios) |
| 4/10 | Real-Time Status Updates | Backend (new Socket.io namespace or polling), Frontend (widget update) | **YES** — decide Socket.io vs. polling (Socket.io already locked for live bidding, so likely yes). Mobile notification delivery. | Medium (realtime infra scaling) |
| 4/11 | Shopper Referral Expansion | (iteration on 3/7) | No — already designed in 3/7 | Low |
| 4/12 | Verified Organizer Badge | Database (new Badge or field), Backend (award endpoint), Frontend (UI display) | **MAYBE** — if it's a simple boolean field, no. If it requires audit workflow + badge revocation, yes. | Low-Medium (governance model) |

---

## Flagged for Architect Input Before Dev Starts

**High Priority (Design Needed This Sprint):**

1. **Phase 2/1 — AI Sale Description Writer**
   - **Decision needed:** Use same Haiku chain as image tagging, or a dedicated LLM (Claude 3.5 Sonnet for better prose)?
   - **Contract needed:** `POST /api/sales/:id/generate-description` → returns description + confidence score. Cache policy?
   - **Schema impact:** New field on `Sale` model: `aiGeneratedDescription`? Or just temp output?
   - **Recommendation:** architect to meet with findasale-rd to evaluate model choice (cost vs. quality). Then findasale-architect defines the contract.

2. **Phase 3/5 — Stripe Terminal POS**
   - **Decision needed:** Where does Terminal API auth live (organizer-specific key, or central)?
   - **Contract needed:** Device registration, transaction flow, offline fallback strategy.
   - **New infrastructure:** Terminal device → WiFi registration → payment intent flow. All new.
   - **Recommendation:** Full architecture review. Partner with findasale-ops to verify Railway can handle device webhooks. High risk.

3. **Phase 3/8 — Batch Operations Toolkit**
   - **Decision needed:** Bulk pricing updates — transactional (all succeed or all fail) or forgiving (best-effort)?
   - **Contract needed:** `POST /api/bulk/update-prices` with idempotency key, progress polling endpoint.
   - **Schema impact:** New BulkOperation log table for audit trail?
   - **Recommendation:** Architect to design transaction strategy before dev touches anything.

4. **Phase 4/9 — Premium Organizer Tier**
   - **Decision needed:** Feature gating strategy (boolean `isPremium` field vs. separate `SubscriptionTier` table)?
   - **Contract needed:** New Stripe product. Subscription lifecycle (trial → paid → downgrade → churn handling).
   - **Schema impact:** Multiple new fields or new table. Migration plan needed.
   - **Recommendation:** Architect to design feature gate + billing integration contract. Then findasale-rd to verify Stripe billing APIs.

**Medium Priority (Quick Review Sufficient):**

5. **Phase 2/3 — Shopper Loyalty Program** — Architect to confirm: coupon model (single-use vs. multi-use token)?
6. **Phase 3/7 — Shopper Referral Rewards** — Architect to confirm: reward distribution timing (immediate vs. end-of-month)?
7. **Phase 3/6 — Seller Performance Dashboard** — Architect to confirm: if aggregation queries are expensive, needs cron job design.

**Low Priority (Dev Can Start, Architecture Review Optional):**

8. **Phase 2/2 — Branded Social Templates** — findasale-dev can start once findasale-ux provides design spec.
9. **Phase 2/4 — Search by Item Type** — Low-complexity feature, findasale-dev can implement after ux spec.
10. **Phase 4/10 — Real-Time Status Updates** — Use existing Socket.io infrastructure; findasale-dev can implement.
11. **Phase 4/11, 4/12** — Iterations; no new architecture questions.

---

## Recommendations

### 1. Update Roadmap Architecture Section ✓
Replace CA/CB/CC/CD with subagent names and indicate workflow (Architect → UX → Dev → QA).

### 2. Schedule Architect Reviews for Phase 2–4 Kickoff ✓
Create a pre-sprint checklist:
- **Phase 2 kickoff:** AI Description Writer (2/1), Loyalty Program (2/3), Batch Ops (3/8)
- **Phase 3 kickoff:** POS (3/5), Referrals (3/7)
- **Phase 4 kickoff:** Premium Tier (4/9)

### 3. Add "Architect Review Required" Flag to Roadmap ✓
Mark features that **must** go through findasale-architect before findasale-dev starts.

### 4. Keep the Abstraction (P / Ops & QA / Marketing & Research / Features) ✓
It's useful for roadmap comprehension. Don't flatten it to a single feature list.

---

## Conclusion

The parallel-path model is **still sound**. It organizes work into **orthogonal concerns** (business / operations / research / product). The names just need updating to reflect the subagent fleet.

**Next step:** Update roadmap per recommendations above. No structural change needed—just better naming and clearer Architect checkpoints.

---

**Prepared by:** findasale-architect
**Date:** 2026-03-06
**Confidence:** HIGH (based on completed phases + skill definitions + state.md audit)
