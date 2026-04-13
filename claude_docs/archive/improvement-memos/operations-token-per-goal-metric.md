# E12.5: Token-Per-Goal — Universal Success Metric

Created: Session 96 (2026-03-09)
Status: Active
Backlog ref: E12.5

---

## Principle

> "The metric always has to be tokens burned to accomplish the goal."
> — Patrick, Session 95 notes

Every agent evaluation, workflow audit, and session retrospective measures
token cost vs. goal completion. Agents working in isolation that don't
accomplish their goal represent pure waste.

## Metric Definition

**Token Efficiency Ratio (TER):**

```
TER = Tasks Completed / Estimated Token Cost
```

Higher is better. Measured per session.

### How to Estimate Token Cost

Since we can't get exact token counts per task in Cowork, use proxies:

1. **Tool call count** — Each tool call ≈ 1,000-3,000 tokens overhead.
2. **Subagent calls** — Each Skill invocation ≈ 10,000-30,000 tokens.
3. **File reads** — Proportional to file size.
4. **Session duration** — Longer sessions ≈ more tokens (but not linearly).

Use `/cost` at session end for the authoritative total.

### How to Count Tasks

A "task" is a discrete, verifiable deliverable:
- A file created or meaningfully edited
- A bug fixed and testable
- A research question answered with a written finding
- A behavioral rule added to CORE.md / conversation-defaults

Things that are NOT tasks (don't count):
- Re-reading a file already read this session
- Retrying a failed command
- Clarification back-and-forth
- Session setup (loading STATE.md, context.md)

## Session-Log Integration

Add to every session-log entry:

```
Token efficiency: [task count] tasks, [estimated tokens or /cost output], TER: [ratio]
```

Example:
```
Token efficiency: 10 tasks, ~45k tokens, TER: 0.22 tasks/k-token
```

## Evaluation Thresholds

| TER | Rating | Notes |
|-----|--------|-------|
| > 0.3 | Excellent | Doc-heavy sessions, minimal re-reads |
| 0.15-0.3 | Good | Mixed code + docs |
| 0.05-0.15 | Acceptable | Code-heavy or research sessions |
| < 0.05 | Poor | Investigate — retries, re-reads, or stuck agents |

## Session Wrap Protocol Addition

Before wrapping any session, the orchestrator must:

1. Count completed tasks.
2. Run `/cost` (or estimate from tool calls).
3. Calculate TER.
4. Log in session-log.
5. If TER < 0.05: add a retrospective note explaining why.
