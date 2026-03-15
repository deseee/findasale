# Decisions Log

Append-only. Max 3 lines per decision. Oldest entries pruned after 30 days.
Only decisions that affect future sessions — not implementation details.

---

## Session 166 — 2026-03-15

### Decision: #64 Condition Grading — Fold into Sprint 1 of Listing Factory
**Status:** APPROVED
**Made by:** Patrick
**Rationale:** Additive schema change (conditionGrade String? on Item). Ships naturally with Sprint 1 tag picker UI. AI suggests S/A/B/C/D grade from photo during Rapidfire; organizer confirms. Coexists with existing `condition` field (backward compat). Adds +5 to health score when graded. Migration: 20260315000001_add_condition_grade_to_item.
**Consequences:** Sprint 1 now includes one schema migration. Health score max becomes 105 (or capped at 100).

### Decision: #31 Brand Kit — Schema fields added now, UI deferred to Sprint 3
**Status:** APPROVED (schema only — UI in Sprint 3)
**Made by:** Patrick
**Rationale:** Three additive fields on Organizer (brandLogoUrl, brandPrimaryColor, brandSecondaryColor). Migration 20260315000002_add_brand_kit_to_organizer added now so Sprint 3 dev can build on them without a separate migration session. No UI built yet — Sprint 3 owns settings page section and watermark logo integration.
**Consequences:** Organizer schema grows by 3 nullable fields. Watermark utility (Sprint 2) will use text overlay until Sprint 3 Brand Kit UI ships.

---

## 2026-03-12 — Session 153 (Cash POS Fee Policy)

- DECIDED: 10% platform fee applies to all cash POS transactions (parity with online/card transactions). Rationale: prevents perverse incentive to route everything through cash to avoid fees; maintains P&L consistency.
- DECIDED: Collection method = accumulate as `cashFeeBalance` on Organizer, deduct from next Stripe payout. Rationale: cleanest automatic collection without separate invoicing overhead.
- DECIDED: 30-day guardrail — if Stripe balance can't cover accumulated cash fees, surface a warning in organizer dashboard. Rationale: protects platform revenue without aggressive enforcement pre-beta.

## 2026-03-11 — Session 146 (Camera Workflow v2 Architecture)

- DECIDED: Background removal via Cloudinary server-side lazy transform (b_remove). Rationale: cost-efficient, no on-device WASM bloat, reduces network roundtrips vs. Remove.bg cloud API.
- DECIDED: Auto-enhance (brightness/saturation) on-device Canvas before upload, non-blocking. Rationale: spotty mobile wifi context, eliminates 2x network latency vs. server-side, enables immediate ✨ badge.
- DECIDED: Face detection on-device TensorFlow.js COCO-SSD (100% privacy). No cloud API. Rationale: spec requirement (private homes), no data sent off-device, organizer confirms before upload.
- DECIDED: AI confidence as `aiConfidence: Float` field on Item, sourced from Vision API in processRapidDraft. Rationale: enables color-coded confidence tinting (green/amber/red) on publishing page.
- DECIDED: Create Photo model (forward-looking, not used until v3), keep photoUrls array backward-compat for v2. Rationale: anticipates future per-photo labels/crops without schema re-migration.
- DECIDED: Aspect ratio crop client-side Canvas before upload + Cloudinary ar:4:3 display transform. Rationale: faster (local), reduces storage, consistent rendering.
- DECIDED: draftStatus enum unchanged (DRAFT → PENDING_REVIEW → PUBLISHED). No schema change required. Rationale: existing implementation already supports workflow.

## 2026-03-11 — Session 143 (Fleet Redesign Phase 2 Execution)

- EXECUTED: All 5 new standalone agents created and on 2-week trial. Rollback conditions defined in trial-rollback-protocol.md.
- EXECUTED: Advisory board restructured to 12 seats + 6 subcommittees per session 141 spec. Async voting protocol active.
- EXECUTED: conversation-defaults v6 — budget-first planning (Rule 17), DA/Steelman co-fire (Rule 18), feedback loop routing (Rule 19).
- EXECUTED: 2 scheduled tasks live — daily-friction-audit (8:30am Mon-Fri), weekly-pipeline-briefing (Mon 9am).
- DECIDED: Fleet redesign complete. Both phases shipped. Next priority returns to beta launch blockers.

## 2026-03-11 — Session 141 (Fleet Redesign)

- DECIDED: Merge CX + Support into Customer Champion. Reason: pre-beta scale doesn't justify split. Revisit at 50 organizers.
- DECIDED: Merge R&D + Pitchman into Innovation. Reason: natural creative-then-evaluate loop; two agents forced double-dispatch for one conceptual task.
- DECIDED: Create findasale-sales-ops agent. Reason: nobody owns organizer acquisition pipeline. Deferred to Phase 2.
- DECIDED: Create findasale-devils-advocate (standalone from board). Reason: contrarian thinking most valuable when automatic. Scoped to direction/strategy only, internalized preflight checklist.
- DECIDED: Create findasale-steelman (standalone from board). Reason: counterbalances DA. Co-fires via shared preflight checklist.
- DECIDED: Create findasale-investor (standalone from board). Reason: quick ROI/cost-benefit analysis for everyday decisions.
- DECIDED: Create findasale-competitor (standalone from board). Reason: unified competitive plugin routing; ad-hoc competitive questions without convening full board.
- DECIDED: Restructure Advisory Board to 12 seats (add Security Advisor, Systems Thinker, Legal Counsel, Marketing Strategist, Technical Architect, QA Gatekeeper). Drop Governance Auditor and Ecosystem Optimizer (redundant with source agents).
- DECIDED: Board subcommittees (Ship-Ready, Risk, Go-to-Market, Governance, Growth, Future Vision) with routing rules.
- DECIDED: Subagent-to-Patrick escalation channel with guardrails (evidence required, cooldown, auto-logging, no action requests).
- DECIDED: Inter-agent handoff protocol with integrity metadata and no-edit pass-through.
- DECIDED: Red-flag veto gate — auth/payment/deletion/security changes require Architect or Hacker sign-off before Dev dispatch.
- DECIDED: Async decision voting (+1/−1) for non-reversible decisions. Dissenting votes always surfaced.
- DECIDED: Cross-agent feedback loops (rollback→Innovation, Customer Champion→Sales-Ops, Competitor→Innovation).
- DECIDED: Budget-first session planning with outcome-bucketed delta tracking. Target ±10% accuracy within 60 sessions.
- DECIDED: decisions-log.md for cross-session decision memory. Max 3 lines/decision, 30-day prune.
- DECIDED: Daily friction audit scheduled task (8:30am Mon-Fri, replaces monthly retrospective). Owned by findasale-workflow.
- DECIDED: Weekly pipeline briefing scheduled task (Monday 9am, owned by sales-ops). Deferred to Phase 2.
- DECIDED: Trial/rollback protocol — explicit rollback plans checked by friction audit, post-mortems feed Innovation.
- DECIDED: DA/Steelman scoped to direction-only with internalized preflight checklist (not purely technical implementation).
- DECIDED: Token budget learning via outcome-bucketed delta tracking (succeeded-on-plan / over-plan / succeeded-after-retry).
- DECIDED: Phase 1 immediate (merges + escalation + handoff + veto gate + decisions-log). Phase 2 in two weeks (new agents + board restructure + context infrastructure).
