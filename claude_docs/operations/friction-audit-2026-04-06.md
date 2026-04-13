# Daily Friction Audit — 2026-04-06 (Monday)

**Automated run. AUTO-DISPATCH from daily-friction-audit.**

---

## Findings Summary

### P1 — S399 Code + Migration Not Deployed

**Category:** deployment-blocker
**Source:** `claude_docs/patrick-dashboard.md`

`patrick-dashboard.md` shows all three S399 deliverables as ⏳ (pending):
- Vercel: review card redesign + feedback system frontend not pushed
- Railway: feedbackController.ts + feedback routes not pushed
- DB: FeedbackSuppression migration not run (`20260405_add_feedback_system`)

S399 shipped on 2026-04-05. If Patrick hasn't run the push block from patrick-dashboard.md, production is behind by a full session: the review card status system (human-readable Ready/Review/Cannot) and all feedback survey infrastructure are live in code but not deployed.

**Action:** No auto-dispatch warranted — this is a Patrick manual action. Surfacing for awareness. If unresolved at next session start, the smoke test will catch it.

---

### P2 — STATE.md SIZE GATE Violation

**Category:** doc-staleness
**Source:** `claude_docs/STATE.md` (1,253 lines)

CLAUDE.md §11 T5: "If STATE.md >250 lines, archive oldest completed-features section." STATE.md is 1,253 lines — 5× the threshold. Sessions S326–S362 (2026-03-28 to 2026-03-31) are fully completed with no remaining action items and should be archived to COMPLETED_PHASES.md. This makes STATE.md harder to scan and increases token cost on every session init.

**Dispatch:** `findasale-records` — archive S326–S362 session summaries from STATE.md to COMPLETED_PHASES.md. Keep S390+ in STATE.md (all have QA or deferred items still relevant).

---

### P2 — QA Backlog Spanning 4+ Sessions

**Category:** process-debt
**Source:** `claude_docs/STATE.md` — Blocked/Unverified Queue + Next Session

Chrome QA is pending for:
- S396: rapidfire hold, photo limit prompt, onboarding modal routes
- S397: add-items sort/toolbar/dark mode/item row/back-nav
- S398: dashboard (buttons, LIVE badge, weather, Other Sales card)
- S399: review card status line, health breakdown, feedback settings form

Plus Blocked/Unverified items from S312 (AI confidence camera mode) and S326 (single-item publish) that have been unverified since late March. The S339 "Mark Sold → POS/Invoice evolution" has been in the queue since 2026-03-29 with no progress.

No auto-dispatch warranted — Chrome QA must be sequentially dispatched at session start per §10c. Flagging so next session prioritizes verification before new dev.

---

### P3 — Missing Friction Audit File (2026-04-03)

**Category:** process-gap
**Source:** `claude_docs/operations/` directory listing

No `friction-audit-2026-04-03.md` found. Last audit file is 2026-04-02. April 3 (Friday) was a weekday — the cron should have run. Likely the scheduled task executed but output was not saved to a file, or the session failed silently. No actionable impact, but worth monitoring.

---

## No Issues Found

- **CLAUDE.md file references:** All key files referenced in the table (STACK.md, SECURITY.md, RECOVERY.md, DECISIONS.md, etc.) are confirmed present in `claude_docs/`.
- **DECISIONS.md staleness:** All entries are from 2026-03-30 or newer — within 30-day policy window.
- **Skill health:** Not audited (requires active session mnt/.skills inspection, not available in this VM context).
- **Merge conflicts / stale branches:** Cannot verify from this context — no git access.

---

## Dispatch Block

### Dispatch 1 — findasale-records (P2)

**Task:** Archive STATE.md to reduce below 250 lines
**Context files:** `claude_docs/STATE.md`, `claude_docs/COMPLETED_PHASES.md`
**Constraints:** Keep S390+ fully intact (all have pending QA or deferred items). Archive S326–S362 session summaries (2026-03-28 to 2026-03-31). Keep the Blocked/Unverified Queue section, Next Session section, and all Standing Notes.
**Acceptance criteria:** STATE.md ≤ 600 lines after archiving (partial reduction given the STATE+session-log+next-session-prompt consolidation means it will be longer than the old 250-line STATE.md, but S326–S362 block is ~300 lines). COMPLETED_PHASES.md updated with archived content.
**Tag:** AUTO-DISPATCH from daily-friction-audit
**Note:** Do not dispatch mid-session — hold for the start of S400 when findasale-records runs as part of normal session wrap prep.

---

*Audit complete. 1 P1 (informational), 2 P2s, 1 P3.*
