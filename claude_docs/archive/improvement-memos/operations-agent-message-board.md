# Inter-Agent Message Board — Design & Protocol

Created: Session 96 (2026-03-09)
Status: Active
Backlog ref: E4

---

## Purpose

Enable subagents invoked via the `Skill` tool to coordinate work, report findings,
and flag blockers — without burning parent-session tokens on relay overhead.

## How It Works

All subagents share the parent session's filesystem. A single JSON file acts as the
message board. Agents append messages; the parent (or any agent) reads the board to
get status, findings, and requests.

**Board location:** `claude_docs/operations/MESSAGE_BOARD.json`

## Message Format

Each message is a JSON object appended to the `messages` array:

```json
{
  "id": "msg-001",
  "timestamp": "2026-03-09T14:30:00Z",
  "from": "findasale-dev",
  "to": "ALL",
  "type": "status",
  "subject": "Photo upload fix complete",
  "body": "Fixed multer field name mismatch in upload.ts. Files changed: upload.ts, itemController.ts.",
  "refs": ["A3.1"],
  "status": "complete"
}
```

### Fields

| Field | Required | Values |
|-------|----------|--------|
| id | yes | Sequential: msg-001, msg-002, ... |
| timestamp | yes | ISO 8601 |
| from | yes | Agent skill name (e.g., findasale-dev) |
| to | yes | Agent name or "ALL" for broadcast |
| type | yes | status, question, blocker, finding, handoff, decision |
| subject | yes | One-line summary |
| body | yes | Detail (keep under 200 words) |
| refs | no | Backlog item IDs this relates to |
| status | no | pending, acknowledged, resolved |

### Message Types

- **status** — Progress update. "I finished X" or "I'm starting Y."
- **question** — Needs input from another agent. Include `to` field.
- **blocker** — Something prevents progress. Parent should triage.
- **finding** — Discovery during work that others need to know.
- **handoff** — Passing work to another agent. Include what's done and what's next.
- **decision** — Records a decision made during work. Authoritative.

## Protocol Rules

1. **Append-only.** Never delete or modify existing messages. Add a new message to supersede.
2. **Read before write.** Before posting, read the board to avoid duplicate work or stale context.
3. **Keep it lean.** Messages under 200 words. Link to files for detail instead of inlining.
4. **Address responses.** When answering a question, reference the original msg id.
5. **Parent is orchestrator.** The parent session reads the board between subagent calls to route work.

## Agent Behavior

When a subagent is invoked via `Skill`:

1. **On start:** Read MESSAGE_BOARD.json. Check for messages addressed to you.
2. **During work:** Post status/finding/blocker messages as needed.
3. **On complete:** Post a final status message listing all files changed.
4. **If blocked:** Post a blocker message with `to: "ALL"` and stop gracefully.

## Parent Orchestrator Behavior

Between subagent calls, the parent:

1. Reads MESSAGE_BOARD.json for new messages.
2. Routes blockers to the appropriate agent.
3. Sequences handoffs (Agent A → Agent B).
4. Reports board summary to Patrick on request.

## Limitations (Cowork Context)

- Subagents run sequentially, not in parallel. The board enables *asynchronous* coordination across sequential calls, not real-time collaboration.
- Subagents cannot spawn other subagents. The parent must orchestrate.
- The board persists across the session but resets between sessions unless pushed to git.
- Agent Teams (experimental) would enable true parallel execution — revisit when stable.

## Integration with E5 (Task State Machine)

The message board carries coordination messages. The task state machine (separate file)
tracks task lifecycle. They complement each other:

- Message board = communication channel
- Task state machine = work tracking

See: `claude_docs/operations/task-state-machine.md`

---

## Evaluation Criteria (Session 103)

- Are agents posting messages during Skill invocations?
- Is the parent reading the board between calls?
- Does the board reduce token waste vs. inlining all context into subagent prompts?
- Are handoffs working (Agent A posts, Agent B reads on next invocation)?
