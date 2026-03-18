# Orchestrator Task Dependency State Machine

Created: Session 96 (2026-03-09)
Status: Active
Backlog ref: E5

---

## Purpose

Prevent agents from claiming tasks before prerequisites complete. Provide a clear
lifecycle for every work item so the orchestrator (parent session) can route work
correctly and detect stuck tasks.

## Task States

```
pending → ready → claimed → in_progress → complete
                                 ↓
                              blocked → ready (once unblocked)
                                 ↓
                              abandoned (timeout or manual)
```

### State Definitions

| State | Meaning | Who sets it |
|-------|---------|-------------|
| pending | Task exists but prerequisites are not met | Orchestrator |
| ready | All prerequisites met, available to claim | Orchestrator |
| claimed | An agent has picked this up but hasn't started | Agent |
| in_progress | Agent is actively working | Agent |
| complete | Work is done and verified | Agent → Orchestrator confirms |
| blocked | Agent hit an obstacle and cannot continue | Agent |
| abandoned | Task was dropped (timeout, deprioritized) | Orchestrator |

## Transition Rules

1. **pending → ready**: Orchestrator checks prerequisites. All must be `complete`.
2. **ready → claimed**: Agent posts a message board claim. Only one agent per task.
3. **claimed → in_progress**: Agent begins work. Must happen within same session.
4. **in_progress → complete**: Agent posts completion with file list on message board.
5. **in_progress → blocked**: Agent posts blocker on message board with reason.
6. **blocked → ready**: Orchestrator resolves blocker, moves task back to ready.
7. **Any → abandoned**: Orchestrator decision. Logged with reason.

## Prerequisite Tracking

Each task declares its dependencies:

```json
{
  "id": "E5",
  "title": "Task dependency state machine",
  "state": "complete",
  "owner": "findasale-workflow",
  "depends_on": ["E4"],
  "blocked_by": null,
  "files_changed": ["claude_docs/operations/task-state-machine.md"],
  "session": 96
}
```

## Task Registry File

**Location:** `claude_docs/operations/TASK_REGISTRY.json`

The orchestrator maintains this file. It tracks all active tasks from the backlog
with their current state, owner, dependencies, and session.

## Heartbeat & Timeout Protocol

See: `claude_docs/operations/heartbeat-protocol.md`

Integration points:
- If a task stays `in_progress` for the full subagent call without a status message,
  the parent flags it for review.
- If a task stays `claimed` but never moves to `in_progress`, the parent reclaims it.
- Timeout thresholds are soft guidelines since subagents run sequentially.

## Orchestrator Checklist (Between Subagent Calls)

1. Read MESSAGE_BOARD.json for new messages.
2. Read TASK_REGISTRY.json for state changes.
3. For each `pending` task: check if all `depends_on` tasks are `complete`. If yes, move to `ready`.
4. For each `blocked` task: determine if blocker is resolved. If yes, move to `ready`.
5. Select next `ready` task by priority (P0 > P1 > P2 > P3).
6. Invoke appropriate agent skill for the selected task.
7. After agent returns: read board, update registry, repeat.

## Example Flow

```
Session starts:
  E4 (message board)     = pending, depends_on: []      → ready
  E5 (state machine)     = pending, depends_on: [E4]    → pending
  E16 (worktrees)        = pending, depends_on: []      → ready

Orchestrator picks E4 (ready, higher priority):
  E4 → claimed → in_progress → complete

Orchestrator re-evaluates:
  E5 depends_on [E4] → E4 is complete → E5 moves to ready
  E16 still ready

Orchestrator picks E5 (ready):
  E5 → claimed → in_progress → complete
```

---

## Evaluation Criteria (Session 103)

- Are task states being tracked accurately?
- Do dependencies prevent premature work?
- Is the orchestrator following the checklist between calls?
- Does the registry stay in sync with actual work?
