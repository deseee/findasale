# Next Session Prompt — S227

## Primary Objective: Projects-First Workflow — Phase 2 & Phase 3

Phase 1 (Build & Fix) is complete and pushed. This session implements the remaining two phases.

## Phase 2 — Friction Audit + QA Validation (~1 hour)

### 2a. Update daily-friction-audit scheduled task
- Add auto-dispatch action loop: ALL findings (HIGH, MEDIUM, LOW) auto-dispatch the appropriate agent (findasale-records for doc staleness, findasale-dev for code issues) in the same run.
- Only the most minor cosmetic findings may persist 1-2 days without action.
- If a finding persists 3+ consecutive audits → escalate to Patrick with `## Patrick Direct` block.
- If auto-dispatched fix fails → re-classify finding as BLOCKED with error reason, escalate next session start.

### 2b. Reduce context-freshness-check to weekly
- Change scheduled task frequency from daily to weekly. Projects auto-loads mean daily freshness checks are less critical.

### 2c. Run a test QA audit
- Pick one feature (suggestion: /favorites or /pricing) and run the new QA dispatch pattern:
  1. Identify roles × tiers × operations
  2. Generate specific test scenarios
  3. Batch by page into focused dispatches
  4. Track results in conversation
- This validates the QA DISPATCH GATE added to CLAUDE.md §7.

### 2d. Verify Phase 1 changes
- Confirm subagent routing still works (dispatch one small task to findasale-dev).
- Confirm conversation-defaults v7 is active (check if Patrick installed the .skill file).
- Confirm CORE.md is no longer being loaded (it should be superseded by root CLAUDE.md).

## Phase 3 — Cleanup (only after Phase 2 is QA'd)

### 3a. Delete from active use (keep in git history):
- `.checkpoint-manifest.json`
- `MESSAGE_BOARD.json`

### 3b. Archive skills:
- `context-maintenance` — merge essential logic (STATE.md + session-log sync) into `findasale-records`, then archive standalone skill.
- `findasale-push-coordinator` — push rules are in CLAUDE.md now; dedicated agent adds overhead without value.

### 3c. Remove CORE.md from active use
- Content now lives in root CLAUDE.md. CORE.md stays in git history but should not be loaded or referenced.

## Pre-Session Checklist

1. Load STATE.md
2. Confirm Patrick installed conversation-defaults.skill (ask if unclear)
3. Check if S225 push block was completed (InstallPrompt.tsx, _app.tsx, InspirationGrid.tsx)
4. Check scheduled tasks list to find daily-friction-audit and context-freshness-check task IDs

## Reference

- Proposal: `claude_docs/operations/projects-first-workflow-proposal.md`
- Board review: 11-0-1 Go with modifications (all addressed in proposal)
- Phase 1 commits: a5e58dd, c8a5242, 3b2c879

## Vercel URL
https://findasale-git-main-patricks-projects-f27190f8.vercel.app

## Test Accounts
- Shopper: user11@example.com / password123
- Organizer PRO: user2@example.com / password123
- Admin: user1@example.com / password123
