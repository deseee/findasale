# Decisions Log

Append-only. Max 3 lines per decision. Oldest entries pruned after 30 days.
Only decisions that affect future sessions — not implementation details.

---

## 2026-03-22 (S237) — Transactional Email Provider (Resend → Brevo or Postmark)

**Status:** DEFERRED
**Made by:** Patrick
**Rationale:** Resend free tier (100 emails/day) exhausted by weekly digest job on Sundays. Brevo free tier = 300/day (3x headroom, no cost). Postmark = best deliverability, $15/mo. Migration is a 1-file backend change (notificationService.ts API key + SDK swap). No urgency while user count is low; revisit when daily transactional emails routinely exceed 80 or before general launch.

---

## 2026-03-18 (S198) — Roadmap 13-Column Schema + #51 Implementation Gap

**Status:** APPROVED (schema + gap identification)
**Made by:** findasale-records (audit discovery)
**Rationale:** 13-column enriched tracking schema (# | Feature | Role | Tier | Shipped | DB | API | UI | QA | Chrome | Nav | Human | Notes) adopted for all 146 Completed features. Reveals #51 Sale Ripples as false-positive QA-PASS from S195 (zero implementation on disk — no schema, no API routes, no UI). Human test column shows 📋 for all features (Patrick has never formally executed E2E checklist or mobile gestures guide). Archive re-filed (134 files from archive-old → archive). findasale-records full project docs audit deferred to S199 due to context limits.
**Consequences:** Roadmap v51 now the source of truth for 146 features with detailed column visibility. #51 moved to TIER 1 for immediate implementation (treat as new feature sprint). Patrick human test execution is future blocker for feature promotion to prod. docs audit will remediate stale content + rule violations.

---

## Session 170 — 2026-03-15

### Decision: CLAUDE.md §11 — Subagent-First Implementation Gate (HARD GATE)
**Status:** APPROVED
**Made by:** Patrick (escalation from governance violation)
**Rationale:** Session 170 main window read 940-line itemController, 393-line promote, 256-line items route, then wrote 4 new code files inline. Violated existing "default to subagents" instruction in global CLAUDE.md. Burned ~30k tokens on work that should have been delegated. CLAUDE.md §11 elevated advisory to hard gate with exhaustive allowed/disallowed lists. Exception: only <20 line edits to 1–2 existing files inline.
**Consequences:** Main window is orchestrator only. All feature code must go through subagents. Main window reads specs, decides scope, writes dispatch prompts, reviews output, coordinates pushes. Zero inline code implementation except single targeted edits.

### Decision: CLAUDE.md §9 — File Delivery Rule (ALWAYS USE WORKSPACE + LINKS)
**Status:** APPROVED
**Made by:** Records auditor (governance)
**Rationale:** Files Patrick must view, install, or act on must be saved to workspace folder with clickable `computer://` link. Inline descriptions without links waste time. Rule prevents "find the file" friction.
**Consequences:** All deliverables from sessions must include presentable file cards via MCP tools. Never print paths without links.

### Decision: Comprehensive Sessions 166–170 Review (S171 START TASK)
**Status:** APPROVED
**Made by:** Patrick
**Rationale:** Series of governance + delivery issues detected (inline code, CLAUDE.md drift, communications baseline 5.3/10). Before resuming feature work, conduct full review: (1) did S166–170 deliver promised scope? (2) are rules being followed? (3) is communications/documentation improving? (4) should process change before continuing?
**Consequences:** S171 will start with governance review task, not feature work. Outcome may redirect resource allocation.

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

## 2026-03-15 — Session 176 (Tier + Pricing Audit)

- DECIDED: Platform fee 10% flat rationale documented: matches Etsy (10%), below eBay (10–15%) and EstateSales.NET (~17%). Simplicity + competitive positioning. Advisory board S106 stress-tested 5%/7%; Patrick chose 10% flat post-review.
- DECIDED: Hunt Pass ($4.99/30 days) is confirmed monetization — not a dev experiment. Appears on pricing page. No beta testers yet, no disruption risk.
- DECIDED: pricing-strategy.md archived (stale, showed 5%/7%). Superseded by pricing-and-tiers-overview-2026-03-15.md and complete-feature-inventory-2026-03-15.md.
- DECIDED: BUSINESS_PLAN.md fee references stale (shows 5%/7%). Full rewrite is its own future session.
- OPEN: Virtual Queue tier (PRO vs ENTERPRISE), Affiliate (ENTERPRISE vs defer), Coupons (PRO vs SIMPLE with limits). Subagent input pending S176.
- OPEN: Hunt Pass ($4.99 standalone) vs. future Pro Shopper tier structure. Subagent input pending S176.
