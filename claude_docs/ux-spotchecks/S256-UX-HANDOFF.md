# S256 UX Handoff — 41 Items + Organizer Onboarding

**Delivered by:** findasale-ux
**Date:** 2026-03-23
**Scope:** S248 walkthrough findings (41 UX items) + organizer onboarding flow redesign
**Status:** Ready for parallel findasale-dev implementation

---

## Deliverables

### Document 1: 41 UX Items Grouped by Feature Area
**File:** `claude_docs/ux-spotchecks/S256-UX-SPECS-41-items-onboarding.md`

Seven batches:
1. **Discovery & Search** (11 items) — homepage, search, map, gallery
2. **Navigation & Global** (8 items) — nav labels, dark mode, footers
3. **Shopper Dashboard** (9 items) — dashboard UX, overview, upgrade
4. **Loyalty & Rewards** (8 items) — loyalty page, collector passport, badges
5. **Wishlists & Collections** (8 items) — favorites, alerts, trails, consolidation
6. **Organizer Dashboard** (9 items) — POS placement, settings parity, workspace
7. **Advanced Tools** (9 items) — inventory, print, reports, command center

**Format:** Each batch includes:
- 8–12 items with ID, description, acceptance criteria, complexity (S/M/L)
- Complexity guide: S = <1hr, M = 1–3hr, L = 3+hr
- Mobile & accessibility considerations built into criteria

**Total Effort Estimate:** ~40–50 dev hours for all 41 items

---

### Document 2: Organizer Onboarding Flow Specification
**File:** `claude_docs/ux-spotchecks/S256-UX-SPECS-41-items-onboarding.md` (same doc, Section 2)

**Current State Issues:**
- Two redundant onboarding modals (OnboardingWizard + OrganizerOnboardingModal)
- Modal can be dismissed without completing Stripe setup
- No persistent recovery path for dismissed users
- Email verification missing
- Mobile layout untested

**Proposed 5-Step Flow:**
1. Email Verification (auto-filled, required)
2. Business Profile (name required, phone/bio optional)
3. Stripe Connect (REQUIRED — can't publish without)
4. Create First Sale (optional, links to create-sale)
5. Success & Next Steps (confirmation, clear CTA)

**Key Improvements:**
- Sticky state (saves after each step)
- Mobile-first design (600px max-width, 44px tap targets)
- Persistent reminder for dismissed users
- Enforcement: Can't publish sale without Stripe
- Clear recovery: Resume button on dashboard card

**Files to Update/Create:**
- Remove: `OrganizerOnboardingModal.tsx`
- Major: `OnboardingWizard.tsx` (add 2 steps, consolidate)
- Major: `pages/organizer/dashboard.tsx` (update rendering logic)
- Create: `OnboardingReminder.tsx` (dismissal card)
- Update: Auth, settings, create-sale endpoints

---

## Key Findings from S248

**Categories:**
- **29 BUG items** (mostly fixed in S255)
- **8 DARK mode violations** (mostly fixed in S255)
- **41 UX items** ← **This spec**
- **14 DATA items** (test data gaps, seeded in S250)
- **17 STRATEGIC** (product decisions, deferred)
- **5 DUP** (page/feature overlap, consolidation decisions)

**Cross-Cutting Issues:**
- Double footers (6 pages) — all fixable with single-line edits
- Gamification mechanics undefined (leaderboard, loyalty, points)
- Feature overlap (favorites vs wishlists vs alerts)
- Shopper vs organizer settings parity gap

---

## Implementation Priority

**Tier 1 (High Impact, Low Risk) — First parallel dispatch:**
- Batch 2: Navigation fixes (OD1, OD2, dark mode labels, footers)
- Batch 3: Dashboard UX (SD1, SD5, SD6, SD7)
- Batch 7: Organizer workspace (OV2, OV3, OS2, OS3)
- **Effort:** ~12–15 dev hours

**Tier 2 (Medium Impact, Medium Risk) — Second dispatch:**
- Batch 1: Discovery (H1, H4, H5, search expansion)
- Batch 4: Loyalty explanations (LY3–LY10 copy)
- Batch 6: Advanced tools (IL2–IL4, PI2, CC6 docs)
- **Effort:** ~18–22 dev hours

**Tier 3 (Consolidation, Strategic) — Requires Patrick decision:**
- Batch 5: Favorites/Wishlists/Alerts overlap (FV1, AL1, PR5) — needs D-xxx decision
- Organizer onboarding flow — may require endpoint changes
- **Effort:** Blocked until decisions made

**Tier 4 (Data-Dependent) — After seed data audit:**
- Batch 3: Dashboard data loading (SD3, SD4, SD9)
- Batch 4: Loyalty data display (LY1, CP1)
- Batch 5: Trails creation (TR1)
- **Effort:** ~10–12 dev hours

---

## QA Checkpoints

Each item includes acceptance criteria. Recommended QA approach:

1. **Mobile-first testing:** Organizers use phones — test all items at 375px width
2. **Dark mode verification:** All items checked in light + dark modes (4.5:1 contrast)
3. **End-to-end flows:** Don't just verify UI — test: button click → navigation → data load
4. **Role testing:** Test shopper vs organizer flows separately (different nav, different modals)

---

## Open Questions for Patrick

1. **Feature Overlap (Batch 5):** How should favorites, wishlists, and alerts differ?
   - Consolidate to single "Saved Items" page?
   - Keep separate but clarify distinction?
   - FV1, AL1, PR5 blocked on decision

2. **Gamification Spec (Batch 4, 6):** What do badges, stamps, milestones actually mean?
   - What do users earn?
   - Why would they care?
   - Is it seasonal?
   - Deferred to strategic session, but copy improvements (LY3–LY10) can proceed

3. **Organizer Settings Parity (Batch 6):** Should shopper settings have organizer features?
   - Current gap: Organizer settings much more complete
   - OS1 blocked on parity audit

4. **Homepage Redesign (Batch 1, H3):** Is current design serving beta users?
   - H3 recommends UX review
   - Can proceed with other items while design team considers redesign

---

## Dependencies

**Zero blocking dependencies for Tier 1 implementation** — all items can proceed in parallel.

**Tier 2 dependencies:**
- H4 (search expansion) may require backend endpoint updates — check with findasale-dev

**Tier 3 dependencies:**
- Organizer onboarding: Requires endpoint verification (POST /organizers/me/onboarding-complete, PATCH /organizers/me)

---

## Files for Dev Dispatch

**Document:** `/sessions/confident-dreamy-hawking/mnt/FindaSale/claude_docs/ux-spotchecks/S256-UX-SPECS-41-items-onboarding.md`

This file is:
- ✅ Complete spec with all acceptance criteria
- ✅ Complexity estimates (S/M/L)
- ✅ Mobile & accessibility notes
- ✅ Edge cases documented
- ✅ Endpoint references included
- ✅ File impact analysis provided
- ✅ Implementation order recommended

**Recommended Dispatch:**
1. Print/share this handoff doc with findasale-dev
2. Dispatch Tier 1 items as batch 1 (3–4 items per agent, parallel runs)
3. Hold Tier 3 (strategic decisions) for Patrick sign-off
4. Queue Tier 4 until seed data audit complete

---

## Session Context

**Related Sessions:**
- S248: Full walkthrough audit (114 findings)
- S249: Bug + dark mode fixes (18 + 8 items)
- S250: Seed data overhaul
- S255: Bug fixes + onboarding modal fix
- S256: THIS SESSION — UX spec production

**Previous State Note:** Dashboard modal logic fixed (S255) to show only one modal at a time. This spec builds on that fix and proposes the full redesign.

---

## Next Steps

1. **Patrick reviews** this handoff + decides on Tier 3 (feature overlap)
2. **findasale-dev receives** Tier 1 batch (parallel dispatch recommended)
3. **QA runs** item tests as code lands (smoke test per PR)
4. **Session 257+** continues with Tier 2 and strategic items

---

**Status:** READY FOR DEV DISPATCH
