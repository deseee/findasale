# Decisions Log

Append-only. Max 3 lines per decision. Oldest entries pruned after 30 days.
Only decisions that affect future sessions — not implementation details.

---

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
