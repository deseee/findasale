# E10: Session Capacity Baselines

Created: Session 96 (2026-03-09)
Status: Complete
Backlog ref: E10

---

## Question

How much automated work can we get done in each session without losing context?

## Baseline Estimates (200k Context Window)

### Context Budget Allocation

| Category | Estimated Tokens | % of Window |
|----------|-----------------|-------------|
| System prompt + CLAUDE.md + skills metadata | 15,000-25,000 | 8-13% |
| STATE.md + context.md load | 5,000-8,000 | 3-4% |
| Tool definitions (MCP, browser, etc.) | 10,000-15,000 | 5-8% |
| **Available for work** | **~150,000-170,000** | **~75-85%** |

### Work Capacity Per Session Type

**Documentation-only sessions (no code, no subagents):**
- Each doc read + edit cycle: ~3,000-5,000 tokens
- Estimated capacity: 25-40 document edits per session
- Context risk: Low — doc edits are small

**Code sessions (read + edit + verify):**
- Each code file read: 2,000-10,000 tokens
- Each code edit cycle (read + edit + verify): 5,000-15,000 tokens
- Estimated capacity: 10-20 meaningful code changes per session
- Context risk: Medium — large files eat context fast

**Subagent-heavy sessions:**
- Each Skill invocation: 5,000-50,000+ tokens of sub-context (invisible to parent)
- Parent overhead per subagent call: ~2,000-5,000 tokens (prompt + result summary)
- Estimated capacity: 5-10 subagent calls before context pressure
- Context risk: High — subagent results accumulate in parent context

**Research sessions (web search + synthesis):**
- Each web search + fetch: 3,000-8,000 tokens
- Synthesis per topic: 2,000-5,000 tokens
- Estimated capacity: 15-25 research topics per session
- Context risk: Medium — search results are verbose

### Optimal Session Patterns

1. **Batch similar work.** A session that does 15 doc edits is more efficient than
   one that alternates code, docs, research, and subagents.

2. **Front-load heavy reads.** Read large files early when context is fresh.
   Don't re-read files — take notes on first read.

3. **Delegate verbose work to subagents.** Test output, long file reads, and
   web research should happen in subagent context, not parent.

4. **Set a wrap threshold at 70% context.** At 70%, start wrapping up: update
   STATE.md, log files changed, post session summary. Don't push to 95% where
   autocompact risks losing instructions.

5. **One session, one theme.** Don't mix "fix production bugs" with "research
   token monitoring." Theme-focused sessions maintain tighter context.

### Session 95 Data Point

Session 95 completed 10 tasks (all doc edits, zero subagent calls) in one session.
This was the most efficient session type — low token burn, high output volume.
It sets the upper bound for documentation-focused sessions.

## Recommendations

1. Add "session type" to session-log template (docs / code / research / mixed).
2. Track task count per session to build empirical baselines.
3. Target: 8-12 tasks per code session, 15-25 per doc session.
4. Wrap at 70% context, not 95%.
