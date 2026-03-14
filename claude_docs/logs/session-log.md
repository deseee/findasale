# Session Log — FindA.Sale

Cross-session memory for Claude. Updated at every session end.
Read this at session start to understand recent context without loading extra files.
Keep only the 5 most recent sessions. Delete older entries — git history and STATE.md are the durable record.

**Entry template (all fields required):**
- **Worked on:** (what was done)
- **Decisions:** (choices made)
- **Token efficiency:** (tasks completed ÷ estimated effort — e.g., "10 doc edits, no subagents, low token burn" or "3 features, 2 subagent calls, medium burn" — qualitative until measurement tooling exists)
- **Token burn:** (~Xk tokens used, Y checkpoints logged — see CORE.md §3 for format)
- **Next up:** (what comes next)
- **Blockers:** (what's stuck)

---

## Recent Sessions

## Session 162 — 2026-03-14 — Review & Publish Chrome Audit + P1 Bug Fixes

**Worked on:** Chrome audit of Review & Publish page (7 checks). All checks passed: link visible, page loads without errors, 16 items shown, Publish All correctly absent, Back to Capture link works, Visible/Hidden labels correct, Near-Miss Nudge (#61) working. Two P1 bugs diagnosed and fixed live. Bug 1: unicode separator `\u00B7` rendering as literal text (JSX text node issue) — fixed with `{' · '}` character in review.tsx line 415. Bug 2: Manual Entry items showing "Low (50%)" instead of "Manual" — root cause discovered: Prisma schema has `aiConfidence Float @default(0.5)`, every manual item gets 0.5. Fixed using existing `isAiTagged` boolean field — updated `confidenceLabel()` and `confidenceBorderClass()` to check `isAiTagged` first, only show percentage for AI-tagged items. Added `isAiTagged: boolean` to Item interface and backend select clauses. Bug 3 open (P2): thumbnail images break on page reload — Cloudinary URLs load on first visit but fail on subsequent navigation, root cause unknown.

**Decisions:** Use `isAiTagged` field to distinguish manual vs AI items on frontend. Schema cleanup (change `aiConfidence` to nullable `Float?`) deferred post-beta. Manual items don't need percentage confidence displayed — only AI-tagged items show the confidence percentage.

**Token efficiency:** Inline fixes, no subagent dispatches. Two focused edits (frontend + backend), verified live in Chrome. Low burn.

**Token burn:** ~50k tokens (est.), 0 checkpoints.

**Next up:** Fix Railway backend restarts (session 160 carry-forward). Then validate 4 features (#61, #34, #35, #33) end-to-end on production. Resume roadmap P1: #24 Holds.

**Blockers:** Railway unstable (blocks session 160 feature validation). P2 thumbnail issue needs investigation.

---

## Session 158 — 2026-03-13 — Repo Root Cleanup + Token Statusline Research

**Worked on:** (1) Token statusline investigation — confirmed Cowork desktop UI does not pass `context_window` JSON to statusline scripts; bar stays at `Tokens: waiting...` indefinitely. Statusline script stored in `scripts/statusline-token-usage.sh`, CLAUDE.md §4 updated with session-init reinstall block to handle VM ephemerality. Token estimates calibrated from 19 sessions: avg ~13.6k/agent (prior 5k default was 2.6× too low), updated in conversation-defaults Rule 17, packaged as installable .skill. (2) Records audit of repo root — 5 unauthorized orphaned files identified and removed: `AGENT_QUICK_REFERENCE.md`, `CAMERA_WORKFLOW_V2_IMPLEMENTATION_STATUS.md`, `STRIPE_WEBHOOK_HARDENING.md`, `fleet-redesign-proposal-v1.md`, `docs/CD2_PHASE2_TREASURE_HUNT.md`. All archived with index entries. `docs/` directory and `skill-updates/` directory removed.
**Decisions:** Token statusline is a dead end for Cowork (no JSON feed). Per-agent token estimates locked: simple 5–8k, mid-weight 10–15k, heavy 15–25k, unknown 13k average. Repo root should contain only project infrastructure files (CLAUDE.md, README.md, package.json, push.ps1, railway.toml, pnpm files, scripts/, claude_docs/, packages/).
**Token efficiency:** Two subagent dispatches (findasale-records). Inline research for statusline. Low-medium burn.
**Token burn:** ~40k tokens (est.), 0 checkpoints.
**Next up:** Resume feature work — next priority per roadmap is #24 (Holds, 1 sprint). See roadmap.md for Phase 4 queue.
**Blockers:** Vercel GitHub App integration still needs reconnect (flagged session 149). Migration `20260311000003_add_camera_workflow_v2_fields` deploy status still unclear.

---

## Session 152 — 2026-03-12 — POS v2 Post-Go-Live Fixes

**Worked on:** Four targeted fixes to the Stripe Terminal POS after go-live testing revealed issues: (1) **Duplicate itemId guard** — both `createTerminalPaymentIntent` and `cashPayment` now reject duplicate itemIds (each physical item can only be charged once per transaction). (2) **Error messages humanized** — `terminalController.ts` was surfacing raw DB UUIDs in error strings. Fixed to use `item.title` in both payment flows; required adding `title: true` to the cashPayment `dbItems` select since it previously only fetched `id` and `status`. (3) **POS item search fixed** — `getItemsBySaleId` was ignoring all query params except `saleId`. The frontend was already sending the correct `?q=...&status=AVAILABLE&limit=10` — the backend simply discarded them. Fixed with Prisma `contains` + `insensitive` for title/SKU search, status filter, limit cap, and added `sku: true` to select. (4) **Inline cash numpad** — replaced the cash received button (which opened the shared global numpad at top of page) with an always-visible inline 3×4 numpad inside the cash payment card. Independent `cashNumpadValue` state syncs to `cashReceived` via useEffect. Real-time change/short display. Global numpad simplified to price-only.
**Decisions:** Cash numpad is fully independent from the price numpad — separate state, no mode switching needed. Search bug was entirely backend-side; no frontend changes required. Error humanization required touching both card and cash flows separately since each had its own dbItems select shape.
**Token efficiency:** All inline work — no subagent dispatches for code. Session wrap via findasale-records. Low burn.
**Token burn:** ~35k tokens (est.), 0 checkpoints.
**Next up:** Cash collection mechanism decision — how does FindA.Sale collect 10% platform fee on cash sales? Card sales auto-collected via Stripe Connect; cash sales have no fee collection path today. Needs findasale-investor + advisory board analysis before implementing.
**Blockers:** Business decision on cash fee collection outstanding. Neon migration `20260312000002_add_purchase_pos_fields` still pending deploy.

---

## Sessions 147–148 — 2026-03-12 — Rapidfire P1 Fixes + Phase 5 Wiring

**Worked on:** Diagnosed and fixed two bugs in the Rapidfire camera UI that caused "+" buttons and photo-count badges to be invisible on mobile. Bug 1: Outer thumbnail wrapper in `RapidCarousel.tsx` was a `<button>` — browsers eject inner `<button>` elements during HTML parsing (invalid HTML per spec), destroying absolute positioning context. Fix: changed to `<div>`, all touch/mouse handlers preserved. Bug 2: `add-items/[saleId].tsx` had Phase 5 (add-photo-to-item) wired as a stub — `onAddPhotoToItem={() => {}}` was a no-op, `addingToItemId` hardcoded to `null`. Fix: added state, full toggle logic, and Phase 5 append pipeline using `/upload/sale-photos` → `POST /items/:id/photos` (endpoint already existed as `addItemPhoto` controller). Skip optimistic temp entry in append-mode to prevent flicker. Also diagnosed Railway vs Vercel platform confusion — Railway is backend-only and correctly did not redeploy. Vercel appears to have a broken GitHub App integration (deployment predates latest commits).
**Decisions:** Outer carousel wrapper must be `<div>`, not `<button>` — always check for nested button HTML invalidity when inner buttons don't render. Phase 5 append pipeline uses existing backend endpoint, no backend changes needed. Vercel + Railway use GitHub App integration (under Settings → Applications), not traditional webhooks.
**Token efficiency:** One subagent dispatch (findasale-records for session wrap). File reads + targeted fixes. Low-medium burn.
**Token burn:** ~40k tokens (est.), 0 checkpoints.
**Next up:** Verify Vercel GitHub App reconnect → confirm "+" buttons live on Patrick's phone. Verify migration `20260311000003_add_camera_workflow_v2_fields` deployed to Neon. Fix P0 QA bug in `review.tsx` (draftStatus filter using wrong endpoint).
**Blockers:** Vercel not auto-deploying — GitHub App integration appears disconnected. Migration `20260311000003` deploy status unknown.

---

## Session 141 — 2026-03-11 — Fleet Redesign Proposal v1

**Worked on:** Comprehensive fleet redesign planning session. Drafted, reviewed (2 rounds), and finalized `fleet-redesign-proposal-v1.md` with 22 approved decisions. Round 1 reviewers: architect, qa, hacker, pitchman, power-user, workflow. Round 2 reviewers: architect, hacker, pitchman, power-user. Two open questions resolved mid-session (token budget learning, DA trigger scope).
**Decisions:** Merge CX+Support → Customer Champion. Merge R&D+Pitchman → Innovation. New agents: sales-ops, devils-advocate, steelman, investor, competitor. Board restructured to 12 seats + 6 subcommittees. Escalation channel with guardrails. Handoff protocol with integrity metadata. Red-flag veto gate. Async voting. Trial/rollback protocol. Cross-agent feedback loops. Daily friction audit. Budget-first sessions with outcome-bucketed learning. decisions-log.md. DA/Steelman scoped to direction-only with preflight checklist. Phased rollout approved.
**Token efficiency:** Planning-only session. 10 subagent dispatches across 2 review rounds. No code changes. Medium-high burn for high strategic output.
**Token burn:** ~120k tokens (est.), 0 checkpoints.
**Next up:** Phase 1 rollout — 6 parallel dispatches (2 merges, escalation channel, handoff protocol, veto gate, decisions-log). QA verification. Then Phase 2.
**Blockers:** Patrick git push needed for proposal + session docs. Neon migration still pending. Beta-blocking items unchanged.

---

## Session 138 — 2026-03-11 — Plugin Skill Fleet Audit & Routing Update

**Cowork Power User audit complete.** All 15 findasale-* SKILL.md files updated with Plugin Skill Delegation sections. Two stale data bugs fixed (5%/7% fee → 10% flat in architect + qa; Docker reference removed from architect). plugin-skill-routing.md created at claude_docs/operations/.

**Advisory board** approved for forward strategic lens: added product-management:roadmap-management and data:create-viz.

**Main session** routing documented: plugin-skill-routing.md is now the routing reference for when to use findasale-* vs. plugin skills directly.

**Deferred for planning session:** findasale-sales-ops agent (organizer outreach, pipeline review, trial-to-insight). Proposed stack: sales:call-prep, sales:pipeline-review, sales:daily-briefing, sales:account-research, customer-support:customer-research, data:explore-data. Patrick to evaluate post-beta.

**Files changed:**
- /mnt/.skills/skills/findasale-*/SKILL.md (all 15 — delegation sections added)
- claude_docs/operations/plugin-skill-routing.md (created)
- claude_docs/logs/session-log.md (this entry)

