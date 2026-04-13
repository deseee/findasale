# Daily Friction Audit — 2026-03-30

**Run by:** daily-friction-audit scheduled task (automated)
**Session:** N/A (scheduled, no user present)
**State freshness:** STATE.md current as of S339 (2026-03-29) ✅

---

## Summary

4 findings. No P0/P1 blockers. 3 × P2 housekeeping, 1 × P3 code hygiene.
S339 code committed and pushed (git log confirms `589e813`). Build should be green.

---

## Findings

### [P2] CLAUDE.md reference table: wrong path for WRAP doc
**Category:** doc-staleness
**File:** `FindaSale/CLAUDE.md` — Reference Docs table at bottom
**Detail:** Entry reads `WRAP_PROTOCOL_QUICK_REFERENCE.md` (implied root), but the file actually lives at `claude_docs/operations/WRAP_PROTOCOL_QUICK_REFERENCE.md`. An agent following this reference literally would look for the file at `claude_docs/WRAP_PROTOCOL_QUICK_REFERENCE.md` and report it missing.
**Suggested fix:** Update the table entry to `operations/WRAP_PROTOCOL_QUICK_REFERENCE.md`
**Subagent:** findasale-records

---

### [P2] 6 stale locked worktrees from dead session
**Category:** git-hygiene
**Detail:** `git worktree list` shows 6 locked worktrees from session `happy-youthful-lamport` (no longer active). All locked, so `git worktree prune` will NOT remove them. They don't block work but accumulate disk space and pollute branch listings with `worktree-agent-*` branches.
**Worktrees:**
- `worktree-agent-a149904c` (locked)
- `worktree-agent-a29f7731` (locked)
- `worktree-agent-a2b4ad92` (locked)
- `worktree-agent-a39344c2` (locked)
- `worktree-agent-ad41a56d` (locked)
- `worktree-agent-ada8ad64` (locked)

**Cleanup command Patrick can run:**
```powershell
cd C:\Users\desee\ClaudeProjects\FindaSale
git worktree remove --force .claude/worktrees/agent-a149904c
git worktree remove --force .claude/worktrees/agent-a29f7731
git worktree remove --force .claude/worktrees/agent-a2b4ad92
git worktree remove --force .claude/worktrees/agent-a39344c2
git worktree remove --force .claude/worktrees/agent-ad41a56d
git worktree remove --force .claude/worktrees/agent-ada8ad64
git worktree prune
```
**Subagent:** Patrick manual action (can't be auto-fixed via MCP)

---

### [P2] 32 untracked files + 3 modified tracked docs not committed
**Category:** doc-staleness / git-hygiene
**Detail:**
- 3 modified tracked files: `claude_docs/strategy/BUSINESS_PLAN.md`, `claude_docs/strategy/roadmap.md`, `claude_docs/strategy/roadmap.old.md`
- 32 untracked files accumulating from automated task outputs: 10 audit reports, 2 friction audits, 1 health report, competitor intel, improvement memos, marketing content, frontend/database/skills-package files, `human-QA-walkthrough-findings.md`
- These are non-code doc files. No build impact. But they represent work done that isn't captured in git history.

**Suggested action:** Include these in the next session wrap push block. Assign to findasale-records at S340 wrap.
**Subagent:** findasale-records (at wrap)

---

### [P3] fraudDetectionJob.ts not wired to cron
**Category:** code-quality
**File:** `packages/backend/src/jobs/fraudDetectionJob.ts:23`
**Detail:** TODO comment: `// TODO: Integrate with node-cron`. The fraud detection job is built but never imported or started in `packages/backend/src/index.ts`. Fraud scoring logic is dead code until wired. Low urgency pre-beta but worth scheduling.
**Subagent:** findasale-dev (low priority, S341+)

---

### [P3] 12 source-level TODO comments (informational)
**Category:** code-quality
**Detail:** All known, all owned. Notable:
- `authController.ts:422` — password reset email not sent (sends link but no email)
- `[saleId].tsx:160` — TensorFlow face detection not implemented (uses Cloudinary AI fallback)
- `fraudDetectionJob.ts:23` — see P3 above
- 9 others are Phase 2 or billing gates, all appropriate placeholders

No action needed this session.

---

## Dispatch Block (auto-generated)

### → findasale-records

```
AUTO-DISPATCH from daily-friction-audit (2026-03-30)

Task: Fix CLAUDE.md reference table path (P2)

Context:
- File: /FindaSale/CLAUDE.md (project root)
- Reference Docs table at bottom of file
- Current entry: `WRAP_PROTOCOL_QUICK_REFERENCE.md`
- Correct entry: `operations/WRAP_PROTOCOL_QUICK_REFERENCE.md`
- The file exists at `claude_docs/operations/WRAP_PROTOCOL_QUICK_REFERENCE.md`

Required change: One-line fix to the Reference Docs table.
Old: | Wrap protocol | `WRAP_PROTOCOL_QUICK_REFERENCE.md` |
New: | Wrap protocol | `operations/WRAP_PROTOCOL_QUICK_REFERENCE.md` |

Constraints: CLAUDE.md is a root file. Edit only this one entry. Push in next session wrap.
Acceptance criteria: Reference table entry matches actual file path.
```

---

## STATE.md Impact

No STATE.md update required from this audit. Findings are housekeeping, not current-work changes.
Patrick-dashboard.md is current (S339). No update needed.

---

**Next audit:** 2026-03-31 (automated)
