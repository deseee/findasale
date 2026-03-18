# E16: Worktrees & Multi-Terminal Workflow Research

Created: Session 96 (2026-03-09)
Status: Complete
Backlog ref: E16

---

## Question

Can Claude Code / Cowork use git worktrees for parallel work branches? Can
multiple terminals be orchestrated? Would this reduce session time enough
to justify complexity?

## Findings

### 1. Git Worktrees in Cowork

Cowork runs in a lightweight Linux VM. The Agent tool supports an
`isolation: "worktree"` parameter that creates a temporary git worktree
so a subagent works on an isolated copy of the repo. Key behavior:

- The worktree is automatically cleaned up if the agent makes no changes.
- If changes are made, the worktree path and branch are returned in the result.
- This is designed for the `Agent` tool (general-purpose subagents), not
  the `Skill` tool (our fleet agents).

**Implication for FindA.Sale:** We could use worktree-isolated Agent calls
for tasks where we want complete isolation (e.g., experimental refactors,
security testing). But our primary fleet uses `Skill` invocations, which
share the parent filesystem — worktrees don't apply there.

### 2. Agent Teams (Experimental)

Claude Code has an experimental Agent Teams feature:

- Multiple teammates run as separate Claude Code sessions in parallel.
- Each teammate has its own context window.
- They can message each other directly via a mailbox system.
- Requires `CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS` flag.
- Not available in Cowork mode (Cowork is a separate product surface).

**Implication:** Agent Teams would be the ideal solution for true parallel
work, but it's not available in our environment. Monitor for Cowork
integration in future releases.

### 3. Multiple Terminal Sessions

Cowork does not expose multiple terminal sessions. The Bash tool runs in a
single shell context. There's no built-in way to run multiple persistent
terminal sessions simultaneously.

**Workaround:** Patrick could run Claude Code CLI in one terminal while
Cowork runs in the desktop app — but this creates coordination overhead
and risks conflicting file edits.

### 4. Practical Parallel Patterns in Cowork

Given current constraints, the best patterns are:

**A. Sequential subagent calls with message board coordination (our E4 pattern)**
- Agents run one at a time via Skill tool
- Coordinate via shared MESSAGE_BOARD.json
- Parent orchestrates sequencing
- No parallelism but clean handoffs

**B. Worktree-isolated Agent calls for independent research**
- Use `Agent` tool with `isolation: "worktree"` for research tasks
- Research doesn't need shared state, so isolation is fine
- Results come back to parent for integration

**C. Multiple concurrent Agent calls (limited parallelism)**
- The Agent tool documentation says: "Launch multiple agents concurrently
  whenever possible, to maximize performance"
- Multiple Agent tool calls in a single message run in parallel
- This works for independent research tasks
- Does NOT work for tasks that share filesystem state

## Recommendation

**For now:** Stick with sequential Skill invocations + message board (E4).
Use parallel Agent calls for independent research batches (e.g., Session 100
G-batch could fire multiple research agents simultaneously).

**Monitor:** Agent Teams in Cowork. When it ships, it would enable true
parallel development (Dev + QA working simultaneously, Architect reviewing
while Dev implements).

**Low priority:** Git worktree isolation via Agent tool. Useful for
experimental/destructive work but not for our standard fleet workflow.

## Token Cost Assessment

| Pattern | Token Cost | Parallelism | Coordination |
|---------|-----------|-------------|--------------|
| Sequential Skill + message board | Medium | None | Clean |
| Parallel Agent calls (research) | Higher per-call, lower wall-time | Yes | None needed |
| Worktree-isolated Agent | Higher (full context per agent) | Possible | Complex |
| Agent Teams (future) | Highest (N full sessions) | Full | Built-in mailbox |

The token cost of parallelism is real — each parallel agent burns its own
context. For our Pro plan budget, sequential + message board is the most
token-efficient approach. Reserve parallelism for research batches where
wall-time matters more than token cost.
