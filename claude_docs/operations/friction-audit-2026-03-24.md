# Friction Audit — 2026-03-24

**Run by:** daily-friction-audit (auto-dispatch mode)
**Sources read:** STATE.md, logs/session-log.md, escalation-log.md, operations/friction-audit-2026-03-23.md
**Audit date:** 2026-03-24 (Tuesday)

---

## Findings

| # | Finding | Severity | First Seen | Persistence | Action |
|---|---------|----------|-----------|-------------|--------|
| F1 | Session log missing S253–S260 (6 sessions undocumented post-S252) | HIGH | 2026-03-12 (pattern) | **6th consecutive audit** | DISPATCHED → findasale-records |
| F2 | Session log had 7 entries instead of max 5 (rotation not enforced) | LOW | 2026-03-23 | 2nd audit | DISPATCHED → findasale-records (same dispatch as F1) |
| F3 | manifest.json PWA shortcut description still says "Manage your estate sales" (estate-bias carry-forward from S260) | LOW | 2026-03-24 | 1st | FIXED inline — manifest.json line 86 updated |
| F4 | findasale-dev/ux/qa SKILL.md bias unconfirmed (zip archives, not inspectable by agent) — S260 carry-forward | LOW | 2026-03-24 | 1st | DEFERRED — requires Patrick to install/verify skill zip archives via Cowork UI |
| F5 | Profile edit buttons scope — blocked on Patrick clarification (2nd consecutive audit) | LOW (BLOCKED) | 2026-03-23 | 2nd audit | BLOCKED — needs Patrick design decision |

---

## Dispatches This Run

- **findasale-records** (F1 + F2): Reconstruct session log entries S253–S260 from STATE.md; enforce 5-entry rotation (drop S253 and older). → **Result: COMPLETED** — session-log.md now has exactly 5 entries: S260, S259, S258, S256, S255.

- **Inline fix** (F3): `packages/frontend/public/manifest.json` line 86 — "Manage your estate sales" → "Manage your sales: estate sales, yard sales, auctions & more". Within inline exception (1 file, 1 line). → **Result: COMPLETED**.

---

## Blocked Findings

- **F4 (SKILL.md bias — zip archives):** S260 carry-forward notes findasale-dev/ux/qa SKILL.md bias was not confirmed because skill files are zip archives that agents cannot inspect or edit. Fix requires Patrick to open the skill archives, verify the text, and re-package if needed. No agent can resolve this without Patrick action.

- **F5 (Profile edit buttons):** Blocked since 2026-03-23. STATE.md S253 decision block notes: "`/organizer/profile` 404 — DECISION NEEDED." S255 resolved the 404 (redirect to `/organizer/settings`), but the question of whether a read/edit profile page should exist as a distinct page is still unresolved. No agent can make this design call.

---

## Positive Patterns

- **Subagent-first discipline holding strong:** S256–S260 all show correct agent dispatch for code changes. No main-window inline coding violations detected.
- **Agent prompt bias fix delivered:** S260 successfully updated global CLAUDE.md, project CLAUDE.md, findasale-innovation SKILL.md, and findasale-advisory-board SKILL.md to say "secondary sale organizers." A 4-file coordinated fix across both global and project-level files is evidence the repair loop is working.
- **Explorer's Guild Phase 1 shipped clean:** 5 frontend files updated with TypeScript passing. Explorer's Guild branding now consistent across collector-passport, loyalty, onboarding, nav, and dashboard.
- **RPG spec locked in one session (S260):** All 8 open game design decisions resolved in a single session. Spec doc created and committed. This is the right workflow for design-heavy decisions before dev dispatch.
- **QA continuity (CLAUDE.md §10) pattern holding:** S259 began with S258 smoke test. S256 began with prior-session smoke test. The mandatory post-fix live verification rule is being respected.

---

## Persistence Analysis

| Finding Pattern | First Seen | Consecutive Appearances | Trend |
|----------------|------------|------------------------|-------|
| Session log gaps (missing entries) | 2026-03-12 | **6 audits** (03-12, 03-13, 03-16, 03-17, 03-23, 03-24) | RECURRING — structural wrap failure |
| Session log rotation not enforced (>5 entries) | 2026-03-23 | 2 audits | STABLE — fixed by records dispatch |
| Profile edit buttons decision blocked | 2026-03-23 | 2 audits | STABLE — needs Patrick |

---

## Patrick Direct

**⚠️ Session log gaps — 6 consecutive audits without permanent resolution.**

Every friction audit since 2026-03-12 has found missing session-log entries. The records agent reconstructs them each time from STATE.md — but the root cause is never fixed. Today's gap: S253–S260 (6 sessions). This is the **6th straight audit with this finding**.

**Why it matters:** The session log is the primary recency anchor at session start. Missing entries mean Claude re-discovers recent context via STATE.md, which is slower and more expensive. The friction audit was specifically created to catch this — but catching and reconstructing every day is a symptom, not a solution.

**Root cause (confirmed):** Session wraps are completing — STATE.md IS being updated. But session-log.md is being skipped. The wrap protocol requires 4 documents (STATE.md, next-session-prompt.md, session-log.md, patrick-dashboard.md). Under token pressure, session-log gets dropped because it requires structured reconstruction from scratch.

**Recommended action for Patrick:** At the end of each session, before closing, explicitly ask: "Did you update session-log.md?" If not, ask the session to complete the wrap before closing. Alternatively, consider whether the session-wrap scheduled task should be triggered as a mandatory end-of-session action rather than on-demand.

---

*Next scheduled audit: 2026-03-25 (Wednesday)*
