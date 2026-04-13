# Heartbeat & Timeout Protocol for Agent Monitoring

Created: Session 96 (2026-03-09)
Status: Active
Backlog ref: E5 (heartbeat component)

---

## Purpose

Detect stuck, silent, or ineffective subagent calls so the orchestrator can
intervene early rather than burning tokens on unproductive work.

## How Heartbeats Work in Cowork

Cowork subagents (via `Skill` tool) run synchronously — the parent waits for
the subagent to return. True "heartbeat polling" isn't possible. Instead, we
use **output-based health signals**:

### Signal 1: Message Board Activity

A healthy subagent posts at least one message to MESSAGE_BOARD.json during
its execution. If the agent returns without any new messages, flag it.

**Check:** After each Skill invocation, the orchestrator reads MESSAGE_BOARD.json
and verifies at least one new message from the invoked agent exists.

### Signal 2: File Change Reporting

Per CORE.md E3 rule, subagents must report all files changed. If an agent
claims completion but reports zero files changed and zero messages posted,
treat as suspicious — either:
- The work was trivial (acceptable)
- The agent didn't actually do anything (needs investigation)

### Signal 3: Task State Progression

Check TASK_REGISTRY.json after each agent call:
- Task should have moved from `claimed` → `in_progress` → `complete` or `blocked`
- If task is still `claimed` after agent returns = agent didn't engage with it
- If task is `in_progress` with no file changes = agent may be stuck

## Timeout Thresholds

These are soft guidelines for the orchestrator's judgment:

| Scenario | Threshold | Action |
|----------|-----------|--------|
| Agent returns, no board messages | Immediate | Log warning, check files changed |
| Agent returns, task still "claimed" | Immediate | Re-assign or investigate |
| Task in "blocked" state, no resolution path | Next orchestrator cycle | Escalate to Patrick or downscope |
| Task in "in_progress" across sessions | Session start | Review — likely stale, reset to "ready" |

## Orchestrator Post-Call Checklist

After every Skill invocation:

1. Read MESSAGE_BOARD.json — any new messages from the invoked agent?
2. Read TASK_REGISTRY.json — did the task state advance?
3. Check agent's reported file list — does it match what's on the board?
4. If all three are empty: log a warning in the board and consider re-running.

## Stuck Agent Recovery

If an agent appears stuck:

1. **Don't retry blindly.** Read the agent's last board message for clues.
2. **Downscope.** Can the task be broken into smaller pieces?
3. **Re-assign.** Would a different agent handle this better?
4. **Escalate.** Post a blocker message and tell Patrick.
5. **Abandon.** Mark the task as `abandoned` with a reason in the registry.

## Cross-Session Staleness

At session start, the orchestrator should:

1. Scan TASK_REGISTRY.json for any task in `in_progress` or `claimed`.
2. These are stale from a previous session — reset to `ready`.
3. Post a board message: "Resetting stale tasks from previous session."

---

## Evaluation Criteria (Session 103)

- Were any stuck agents detected via this protocol?
- Did the post-call checklist catch any silent failures?
- Was cross-session staleness properly handled?
