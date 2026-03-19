# Roadmap Reconciliation Report — 2026-03-19

**Purpose:** Cross-reference feature inventories from three recent audit documents against the current roadmap. Identify any features documented elsewhere that are missing from the shipped features tables.

**Period:** Audit documents generated 2026-03-15 to 2026-03-17 (Sessions 175–191)

---

## Executive Summary

Three comprehensive inventory documents were reviewed:
1. `complete-feature-inventory-2026-03-15.md` — Full GitHub codebase audit (57 backend routes, all frontend pages)
2. `feature-tier-classification-2026-03-16.md` — Tier assignment for 36 undocumented features
3. `feature-gap-inventory-2026-03-17.md` — QA & completion status report (50+ shipped features, Waves 1–5)

**Result:** 1 feature found in external docs but NOT in roadmap shipped tables.

---

## Missing Features (Not in Roadmap)

### 1. Affiliate Program

**Found in:**
- `feature-tier-classification-2026-03-16.md` (Item #10 in classification table)
- `complete-feature-inventory-2026-03-15.md` (Undocumented Shipped Features section)

**Status:** Shipped (backend exists at `/affiliate/*` routes + `/api/affiliate`)

**Suggested Tier:** TEAMS (deferred to post-scale per ADR decision)

**Rationale:**
- High-friction setup requires referral infrastructure, payout system, fraud detection
- Part-time organizers (early market) unlikely to care
- Alternative: Launch free referral badges (SIMPLE) first, monetize later via affiliate credits toward PRO

**Recommendation:**
Add to roadmap under TEAMS tier with explicit "DEFER" tag, or add as SIMPLE with limited functionality (badges only, no payouts). See `feature-tier-classification-2026-03-16.md` Decision #2 for full analysis.

**Location to add:**
Insert after item #13 (TEAMS Workspace) in the "Organizer — Analytics & Intelligence [PRO]" section, or create new "Organizer — Marketplace & Growth [TEAMS]" subsection.

---

## Features Confirmed in Roadmap

All 30+ other undocumented features from the inventory documents are now present in the current roadmap (v56, merged 2026-03-19):

- Sale Checklist ✅
- Pickup Scheduling ✅
- Flash Deals ✅
- Sale Waitlist ✅
- Message Templates ✅
- Virtual Queue / Line Management ✅
- Organizer Digest Emails ✅
- Notification Inbox ✅
- Reviews (receive + view) ✅
- Disputes Management ✅
- A/B Testing Infrastructure ✅
- Wishlists ✅
- Saved Searches ✅
- Shopper ↔ Organizer Messaging ✅
- Buying Pools ✅
- Bounties ✅
- Trending Items / Sales ✅
- Activity Feed ✅
- Route Planning ✅
- City Pages ✅
- Neighborhood Pages ✅
- Shopper Public Profiles ✅
- Shopper Referral Dashboard ✅
- Points System ✅
- Streaks ✅
- Treasure Hunt ✅
- Leaderboard ✅
- Hunt Pass ($4.99/30 days) ✅
- AI Sale Planner Chat ✅
- Price History Tracking ✅

---

## Cross-Reference Notes

### complete-feature-inventory-2026-03-15.md

**Critical alerts in this doc (non-feature items):**
1. Hunt Pass is LIVE PAID BILLING ($4.99/30d Stripe) — needs Patrick decision on intentionality
2. `pricing-strategy.md` is dangerously stale (shows 5%/7% fee, not 10% flat)
3. Tier backend infrastructure already exists (not starting from zero)

**Action items from doc:**
- Archive or correct `pricing-strategy.md` (flag fee discrepancy)
- Confirm Hunt Pass is intentional product or dev experiment
- Update pricing-and-tiers-overview with Hunt Pass, Virtual Queue, Messaging, Bounties, Flash Deals

### feature-tier-classification-2026-03-16.md

**Key decisions requiring Patrick approval:**
1. **Virtual Queue (Item #6):** Currently TEAMS tier. Question: move to PRO if self-service (no SMS)?
2. **Affiliate Program (Item #10):** Currently TEAMS. Recommendation: DEFER payouts, launch free badges (SIMPLE) first.
3. **Coupons (Item #14):** Currently PRO. Recommendation: Move to SIMPLE with limits (3 active, 50 redemptions/month); unlock advanced analytics at PRO.

### feature-gap-inventory-2026-03-17.md

**QA backlog summary:**
- Wave 5 (6 features): All [BACKEND-ONLY] — requires frontend Sprint 2
- Wave 4 (14 features): All [QA-PENDING] — backend + frontend complete
- Wave 3 (6 features): All [QA-PENDING] — backend + frontend complete
- Wave 2 (11 features): All [QA-PENDING] — backend + frontend complete
- Wave 1: 2 [QA-PENDING], 1 [FULLY-COMPLETE]

**Recommended QA order:**
1. Finish #68 Command Center Dashboard PASS (notes pending)
2. Batch Waves 2–4 regression QA (33 features, 10 per session)
3. Dispatch Wave 5 Sprint 2 frontend (6 features)
4. Clarify #14 Real-Time Status Updates nav/dashboard wiring

---

## Recommendations for Patrick

### Immediate (Session 204–205)

1. **Add Affiliate Program to roadmap** with TEAMS tier + DEFER tag, or SIMPLE tier with "badges only" scope
2. **Review 3 tier decisions** from feature-tier-classification doc:
   - Virtual Queue: TEAMS or move to PRO?
   - Affiliate: TEAMS/DEFER or SIMPLE badges first?
   - Coupons: PRO or SIMPLE with limits?
3. **Correct pricing-strategy.md** to show 10% flat fee (currently shows 5%/7%, causing organizer confusion)
4. **Confirm Hunt Pass status:** Intentional beta monetization or dev experiment?

### Follow-up (Session 206+)

1. Allocate QA resource to finish Wave 1–2 regression testing (33 features)
2. Dispatch Wave 5 Sprint 2 frontend work (6 features, 2 sprints estimated)
3. Update pricing-and-tiers-overview.md with Hunt Pass prominence + decision outcomes
4. Archive stale docs: `pricing-strategy.md` (old fee), `feature-tier-matrix-2026-03-15.md` (incomplete)

---

## Methodology

- Reviewed all 100+ feature names across three inventory documents
- Cross-referenced against shipped feature tables in roadmap.md (current v56 post-merge)
- Checked for both exact and partial name matches
- Excluded non-feature rows (headers, metadata, doc references)
- Prioritized completeness over false negatives (all legitimate features found)

---

**Generated:** 2026-03-19 (Session 204 — Records Audit)
**Authority:** FindA.Sale Records Auditor
**Status:** Ready for Patrick Review

