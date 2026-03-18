# E7: PM Agent / Orchestrator Design

Created: Session 96 (2026-03-09)
Status: Design complete — implementation deferred until message board (E4) proves out
Backlog ref: E7

---

## Context

Patrick wants to shift from hands-on project manager to Owner. A PM agent would
handle task assignment, token monitoring, session planning, and agent routing —
the orchestration work Patrick currently does manually.

## Decision: Don't Create a Separate PM Agent

After building the message board (E4), task state machine (E5), and heartbeat
protocol, the PM function is better served by **behavioral rules in CORE.md**
and **the orchestrator role of the parent session** rather than a standalone agent.

### Rationale

1. **The parent session IS the PM.** In Cowork, the parent session already
   orchestrates subagent calls, reads the message board, tracks task state,
   and reports to Patrick. A separate PM agent would add a layer of indirection
   with no clear benefit.

2. **Token cost.** Every Skill invocation costs 10k-30k tokens. A PM agent
   that runs between every task adds significant overhead. The parent session
   can do PM work for free (it's already in context).

3. **Context loss.** A PM subagent would lose the parent's conversation context.
   It would need to re-read STATE.md, the message board, and the task registry
   every time — duplicating work the parent already has in context.

4. **What a PM agent would do, the parent already does:**
   - Assign tasks → Parent reads TASK_REGISTRY, picks next ready task
   - Monitor tokens → Parent runs /cost, checks context health
   - Design sessions → Parent reads backlog, plans session batches
   - Route conversations → CORE.md §15 (proactive tool suggestion)

## What Changes for Patrick

### Patrick's New Role: Owner

Patrick provides:
- **Strategic direction** — what matters, what to prioritize
- **Go/no-go decisions** — approve or reject advisory board recommendations
- **External actions** — Stripe setup, organizer outreach, legal consults
- **Infrastructure actions** — `.\push.ps1`, env var setup, plugin management

Patrick no longer needs to:
- Decide which agent handles a task (CORE.md routing rules + skill descriptions)
- Track which files changed (session wrap handles this)
- Sequence tasks within a session (backlog + task registry handle this)
- Monitor token health (parent session tracks this)

### Orchestrator Enhancements (Instead of PM Agent)

Add to CORE.md or parent session behavior:

1. **Session planning on start:** Read backlog, identify next session's tasks,
   announce plan to Patrick in 2-3 sentences. Already partially done via Rule 4
   (short opener = session start).

2. **Automatic routing:** When Patrick describes a problem, the parent identifies
   the right agent and invokes it without asking "should I use findasale-dev?"
   Already covered by CORE.md §15.

3. **Token checkpoints:** At 50% and 70% context, the parent assesses remaining
   work and decides whether to continue, compress, or wrap.

4. **Cross-session handoff:** Session wrap produces a next-session-prompt that
   enables the next session to resume seamlessly.

## Future: When a PM Agent Would Make Sense

If Agent Teams become available in Cowork (true parallel execution), a PM agent
as a separate teammate could:
- Coordinate multiple parallel agents working on different features
- Maintain a bird's-eye view while agents work in their own contexts
- Route messages between agents via the mailbox system

This is the Agent Teams pattern described in E16 research. Monitor for availability.

## Implementation

No new skill needed. Instead:
1. CORE.md §3 batch continuation rule (done — E1.5)
2. Message board protocol (done — E4)
3. Task state machine (done — E5)
4. Heartbeat monitoring (done — E5-heartbeat)
5. Session capacity baselines (done — E10)
6. Token-per-goal metric (done — E12.5)

These six pieces together ARE the PM function, distributed across the parent
session's behavioral rules rather than concentrated in a separate agent.
