# Feature Gap Inventory — FindA.Sale
## QA & Completion Status Report (2026-03-17)

**Purpose:** Audit all 50+ shipped features (S42–S191) for actual completion state: backend ✅, frontend page ✅, navigation linked ✅, Chrome QA pass ✅.

**Scope:** Waves 1–5, Sessions 42–191. Excludes Sessions 1–41 (verified complete in COMPLETED_PHASES.md).

**Key:** ✅ = Confirmed. ❓ = Unknown/Not mentioned in roadmap. ❌ = Explicitly noted as not done. N/A = Not applicable.

---

## WAVE 5 (S191) — AI & Offline
All Sprint 1 backend-only. Frontend pending Sprint 2.

| # | Feature | Backend | Frontend Page | Nav/Dashboard Linked | Chrome QA'd | Status |
|---|---------|---------|--------------|---------------------|-------------|--------|
| 46 | Treasure Typology Classifier | ✅ | ❌ | ❌ | ❌ | [BACKEND-ONLY] API complete, tag UI pending |
| 52 | Estate Sale Encyclopedia | ✅ | ❌ | ❌ | ❌ | [BACKEND-ONLY] API complete, browse/submit UI pending |
| 54 | Crowdsourced Appraisal API | ✅ | ❌ | ❌ | ❌ | [BACKEND-ONLY] API complete, request form + Stripe pending |
| 60 | Premium Tier Bundle | ✅ | ✅ | ✅ | ❌ | [FRONTEND-WIRED] TeamsOnboardingWizard drafted, billing UI pending |
| 69 | Local-First Offline Mode | ✅ | ❌ | ✅ | ❌ | [BACKEND-ONLY] sync.ts routes complete, offline catalog UI pending |
| 71 | Organizer Reputation Score | ✅ | ✅ | ✅ | ❌ | [FRONTEND-WIRED] ReputationBadge on cards, dashboard UI pending |

---

## WAVE 4 (S190) — Advanced Features & Infrastructure
All complete backend+frontend. QA pending.

| # | Feature | Backend | Frontend Page | Nav/Dashboard Linked | Chrome QA'd | Status |
|---|---------|---------|--------------|---------------------|-------------|--------|
| 13 | TEAMS Workspace | ✅ | ✅ | ✅ | ❌ | [QA-PENDING] Workspace management page wired |
| 15 | Shopper Referral Rewards expansion | ✅ | ✅ | ✅ | ❌ | [QA-PENDING] Web Share API wired to ReferralWidget |
| 17 | Bid Bot Detector + Fraud Score | ✅ | ✅ | ✅ | ❌ | [QA-PENDING] FraudBadge on suspicious bids |
| 19 | Passkey / WebAuthn Support | ✅ | ✅ | ✅ | ❌ | [QA-PENDING] PasskeyManager in security settings |
| 20 | Proactive Degradation Mode | ✅ | ✅ | ✅ | ❌ | [QA-PENDING] DegradationBanner shows latency state |
| 22 | Low-Bandwidth Mode (PWA) | ✅ | ✅ | ✅ | ❌ | [QA-PENDING] Adaptive image quality wired |
| 30 | AI Item Valuation & Comparables | ✅ | ✅ | ✅ | ❌ | [QA-PENDING] ValuationWidget on add-items page |
| 39 | Photo Op Stations | ✅ | ✅ | ✅ | ❌ | [QA-PENDING] PhotoOpMarker on sale map |
| 40 | Sale Hubs | ✅ | ✅ | ✅ | ❌ | [QA-PENDING] /hubs + /organizer/hubs pages wired |
| 44 | Neighborhood Sale Day | N/A | N/A | N/A | ❌ | [QA-PENDING] Included in #40 Sale Hubs implementation |
| 48 | Treasure Trail Route Builder | ✅ | ✅ | ✅ | ❌ | [QA-PENDING] /shopper/trails + /trail/[shareToken] pages |
| 57 | Shiny / Rare Item Badges | ✅ | ✅ | ✅ | ❌ | [QA-PENDING] RarityBadge on ItemCard |
| 58 | Achievement Badges | ✅ | ✅ | ✅ | ❌ | [QA-PENDING] /shopper/achievements page + trigger logic |
| 59 | Streak Rewards | ✅ | ✅ | ✅ | ❌ | [QA-PENDING] Streak indicator in Layout |

---

## WAVE 3 (S189) — Trust & Safety
All shipped, QA pending.

| # | Feature | Backend | Frontend Page | Nav/Dashboard Linked | Chrome QA'd | Status |
|---|---------|---------|--------------|---------------------|-------------|--------|
| 16 | Verified Organizer Badge | ✅ | ✅ | ✅ | ❌ | [QA-PENDING] Blue checkmark on organizer profiles + profiles page |
| 41 | Flip Report | ✅ | ✅ | ✅ | ❌ | [QA-PENDING] /organizer/flip-reports page, sell-through analytics |
| 45 | Collector Passport | ✅ | ✅ | ✅ | ❌ | [QA-PENDING] /shopper/collector-passport page, specialty tracking |
| 47 | UGC Photo Tags | ✅ | ✅ | ✅ | ❌ | [QA-PENDING] Shopper photo submission + moderation queue |
| 50 | Loot Log | ✅ | ✅ | ✅ | ❌ | [QA-PENDING] /shopper/loot-log gallery + social sharing |
| 55 | Seasonal Discovery Challenges | ✅ | ✅ | ✅ | ❌ | [QA-PENDING] /shopper/challenges page, leaderboard + badges |

---

## WAVE 2 (S187) — Discovery & Gamification
Shipped, QA pending. Some confirmed wired in roadmap.md; others need verification.

| # | Feature | Backend | Frontend Page | Nav/Dashboard Linked | Chrome QA'd | Status |
|---|---------|---------|--------------|---------------------|-------------|--------|
| 7 | Shopper Referral Rewards | ✅ | ✅ | ✅ | ❌ | [QA-PENDING] /referral-dashboard page, email notifications |
| 14 | Real-Time Status Updates | ✅ | ✅ | ❓ | ❌ | [QA-PENDING] Organizer mobile widget, SMS/email alerts status unclear |
| 18 | Post Performance Analytics | ✅ | ✅ | ✅ | ❌ | [QA-PENDING] Dashboard card shows "post got N clicks" |
| 25 | Organizer Item Library | ✅ | ✅ | ✅ | ❌ | [QA-PENDING] /organizer/item-library page, cross-sale reuse |
| 29 | Shopper Loyalty Passport | ✅ | ✅ | ✅ | ❌ | [QA-PENDING] /shopper/loyalty-passport page, stamp/badge progression |
| 31 | Organizer Brand Kit | ✅ | ✅ | ✅ | ❌ | [QA-PENDING] /organizer/brand-kit page, color/logo propagation |
| 32 | Shopper Wishlist Alerts | ✅ | ✅ | ✅ | ❌ | [QA-PENDING] /shopper/wishlist-settings page, preference alerts |
| 42 | Voice-to-Tag | ✅ | ✅ | ✅ | ❌ | [QA-PENDING] Rapidfire voice input button, transcription + tags |
| 49 | City Heat Index | ✅ | ✅ | ✅ | ❌ | [QA-PENDING] City-level activity score + weekly metro ranking |
| 51 | Sale Ripples | ✅ | ✅ | ✅ | ❌ | [QA-PENDING] Smart notification — "sale posted 2 miles away" |
| 62 | Digital Receipt + Returns | ✅ | ✅ | ✅ | ❌ | [QA-PENDING] Receipt pushed to shopper profile after POS transaction |

---

## WAVE 1 (S177–S183) — Foundation & Core Tiers
All fully complete and deployment-tested.

| # | Feature | Backend | Frontend Page | Nav/Dashboard Linked | Chrome QA'd | Status |
|---|---------|---------|--------------|---------------------|-------------|--------|
| 65 | Organizer Mode Tiers | ✅ | ✅ | ✅ | ✅ | [FULLY-COMPLETE] Stripe billing + Progressive Disclosure UI. Live on staging. |
| 68 | Command Center Dashboard | ✅ | ✅ | ✅ | ❌ | [QA-PENDING] /organizer/command-center page, PRO-gated. findasale-qa PASS WITH NOTES. |
| 70 | Live Sale Feed | ✅ | ✅ | ✅ | ✅ | [FULLY-COMPLETE] Socket.io live events. Already deployed. |

---

## Analysis

### QA Backlog Summary
- **Wave 5 (S191):** 6 features, all [BACKEND-ONLY] — requires frontend Sprint 2
- **Wave 4 (S190):** 14 features, all [QA-PENDING] — backend + frontend complete
- **Wave 3 (S189):** 6 features, all [QA-PENDING] — backend + frontend complete
- **Wave 2 (S187):** 11 features, all [QA-PENDING] — backend + frontend complete
- **Wave 1:** 2 features [QA-PENDING] (#68 has PASS WITH NOTES), 1 [FULLY-COMPLETE] (#70)

**Total awaiting QA:** 33 features (Waves 2–4)
**Total awaiting frontend Sprint 2:** 6 features (Wave 5)
**Total fully complete + deployed:** 2 features (#65, #70)

### Recommended QA Order
1. **Priority 1 (Foundation):** #68 Command Center Dashboard — finish QA pass, promote to users
2. **Priority 2 (Volume):** Start Waves 2–4 regression QA (33 features) — assign to findasale-qa in batches (10 features per session)
3. **Priority 3 (Blocking):** Wave 5 Sprint 2 frontend for #46, #52, #54, #60, #69, #71 — dispatch to findasale-dev
4. **Priority 4 (Polish):** #14 Real-Time Status Updates — clarify actual wiring status (nav/dashboard link missing from docs)

### Known Gaps
- **#14 Real-Time Status Updates:** Roadmap says "SHIPPED S187" but doesn't specify if organizer widget + SMS alert pages are actually wired. Needs verification.
- **#68 Command Center Dashboard:** findasale-qa gave PASS WITH NOTES — notes not included in this inventory. Retrieve from findasale-qa session log.
- **Wave 5 UI:** All 6 features need frontend page creation + routing. Estimated 2 sprints each based on roadmap.

---

**Inventory generated:** 2026-03-17 (Session 191)
**Source:** `claude_docs/strategy/roadmap.md`, `claude_docs/STATE.md`, git commit history
**Authority:** COMPLETED_PHASES.md + Wave-level shipping records

Next Step: Patrick allocates QA resource. Start with #68 PASS finalization, then batch S187–S190 features into findasale-qa cycles.
