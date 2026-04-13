# Cowork Context Loss Audit: Poweruser Findings
**Date:** 2026-03-09
**Researcher:** Claude (Haiku 4.5, Cowork session 118)
**Scope:** Token exposure, persistence mechanisms, roadmap impact

---

## Executive Summary

Cowork/Claude Code has **no built-in token usage telemetry in the session context**, but three emerging features partially solve context loss:

1. **Claude Memory Tool (BETA)** — file-system API for cross-session state (available now)
2. **Token Counting API (GA)** — external endpoint for pre-session planning (not in-session)
3. **Scheduled Tasks + Context Hooks** — low-friction automation for state capture

**Verdict:** Implement hybrid approach combining scheduled state-capture task + Memory Tool, defer 1M-token context window benefits until Anthropic releases Cowork support.

---

## Question 1: Token Usage Count Exposure

### Finding: NO in-session API
- Cowork environment does **NOT expose** `usage_count`, token telemetry, or context budget via env vars or tool outputs
- Token Counting API **does exist** (GA) but requires **external HTTP call** — not available in Cowork session context
- Each Cowork session starts with `<budget:token_budget>200000</budget:token_budget>` visible in system reminder, but no runtime refresh

### Token Counting API (External)
Anthropic's official API (`messages.countTokens`) accepts message arrays and returns exact token counts. Useful for **pre-session planning**:
- Patrick can count tokens in `next-session-prompt.md` before starting a session
- Scripts can estimate file batch size before import
- **Not useful for in-session awareness** (would require external API call, breaking encapsulation)

### Recommendation
Self-estimation via token-checkpoint-guide.md remains the only practical in-session approach. No API change unlocks runtime visibility without external calls.

---

## Question 2: Scheduled Tasks Context Injection

### Finding: PARTIAL SUPPORT, WITH GOTCHA
Scheduled tasks can fire pre-session context injections, but with limitations:

**What Works:**
- Scheduled tasks run at cron intervals, each spawning a fresh Cowork session
- Task prompt can reference local files, git state, previous run outputs
- Can write results to persistent files (e.g., `session-state.json`, `MESSAGE_BOARD.json`)
- Known use case: context-update tasks that run 5 min before a deep-work session

**Known Issue:**
- GitHub Issue #29022: `create_scheduled_task` tool sometimes not injected into session context (Windows Cowork)
- Workaround: Use Claude Code API directly or file-based state instead of in-prompt scheduling

**Timing Constraint:**
- Scheduled task fires **between sessions**, not mid-session
- Cannot inject context at Turn 5 mid-flight; only at session init

### Recommendation
**Use scheduled tasks for pre-session state prep only.** Create a daily task:
```
prompt: "Read claude_docs/logs/session-state.json.
         If >85% context used, write alert to MESSAGE_BOARD.json"
schedule: "0 9 * * *" (9 AM daily)
```
Result: Patrick sees state summary at session start without in-session overhead.

---

## Question 3: MCP Tools for Session State Persistence

### Finding: NONE EXPOSED IN COWORK
Cowork has **no MCP tool for persistent state storage**. Available MCPs (GitHub, Stripe, Vercel, scheduled-tasks) do not offer state-snapshots.

**Workaround Architecture:**
1. **File-based state** — write JSON to `claude_docs/logs/session-state.json` at wrap
2. **Git-based versioning** — commit state files, read at session init
3. **Memory Tool (Beta)** — native Claude Code feature, better than files

The three MCP tools used in FindA.Sale (GitHub, MailerLite, Stripe) are data-read only; they don't persist Claude state.

### Community MCP Solutions (Not Integrated)
- `mcp-memory-service` — semantic search over SQLite memories + cloud sync
- `claude-mem` — auto-capture tool outputs, compress, inject at session start
Both exist but require external installation; Cowork doesn't ship them.

### Recommendation
**Memory Tool is superior.** Use it instead of file-based checkpoints.

---

## Question 4: Creative Use of Existing Infrastructure

### Current State
- `MESSAGE_BOARD.json` — unused; could hold cross-session alerts
- `session-log.md` — manual logs of session burns; not auto-loaded
- `session-state.json` — does not exist yet; could be created
- `next-session-prompt.md` — human-written; not auto-injected

### Viable Approach: Checkpoint-at-Wrap Pattern
At session end, write checkpoint to persistent file:
```json
{
  "session": 117,
  "burn_estimate": "15k tokens",
  "open_tasks": ["Records audit", "Fee PDF fix"],
  "compression_events": 1,
  "recommendation": "Start session 118 with findasale-records skill"
}
```

At session start, skill reads file and announces status. Cost: ~5 lines in conversation-defaults skill.

### Viable Approach: Memory Tool (Preferred)
Claude Code now has a `/memories` directory per project. Write session summaries there at wrap:
```
~/.claude/projects/FindaSale/memory/session-117-summary.md
```
Claude auto-reads on session init (no skill needed). Cleaner than files + JSON.

---

## Question 5: Upcoming Anthropic Features

### 1M Token Context Window (March 2026)
- **Status:** GA on Claude API, but **NOT YET in Cowork**
- **When available in Cowork:** Unknown (Anthropic has not announced)
- **Impact if released:** Changes math entirely. 1M tokens = 5x more room, compression risk drops to <5%
- **Price:** 2x input, 1.5x output for requests >200k tokens
- **Implication for FindA.Sale:** Safe to wait; current 200k sufficient for structured work sessions

### Memory Tool (Beta, Available Now)
- **Status:** Shipping in Claude Code + Claude API with `context-management-2025-06-27` beta header
- **How it works:** Cowork automatically reads/writes to `~/.claude/projects/<project>/memory/`
- **200-line limit on MEMORY.md:** Forces index + detail-file pattern
- **Impact:** Solves cross-session context loss without scheduled tasks or file gymnastics
- **Recommendation:** Switch from checkpoint-logging to Memory Tool now (before 1M tokens arrives)

### Context Caching (March 2026)
- **Status:** Shipping on Claude API (reduces cost for repeated prompts)
- **Cowork status:** NOT mentioned in release notes; unlikely to expose
- **Relevance to FindA.Sale:** None (caching is API-layer; Cowork abstracts it)

---

## Recommended Implementation

### Phase 1: Memory Tool (Immediate — Next Session)
Replace manual checkpoint logging with Claude Code Memory Tool:

1. **At session wrap:** Claude writes to `memory/session-{N}-summary.md`
   - Session burn (actual, not estimated)
   - Completed objectives
   - Blockers/open items
   - Next-session priorities

2. **At session init:** Cowork auto-loads `memory/` files (no action needed)
   - Conversation-defaults skill reads MEMORY.md index
   - Surfaces prior-session context in opening message

3. **Cost:** ~0 tokens (native feature, no MCP overhead)

### Phase 2: Scheduled State Task (Optional — Session 119)
Create a daily scheduled task to check memory directory and alert if >80% context burned in previous session:

```md
Task: check-session-health
Schedule: 0 8 * * 1-5 (weekday mornings)
Action:
  - Read memory/last-session-summary.md
  - If burn > 160k, write alert to memory/wrap-warning.md
  - Include "Consider splitting next session"
```

Cost: ~5 min runtime every weekday, triggers awareness before deep session.

---

## What Does NOT Exist (Hard Stops)

| Feature | Status | Why Not Available |
|---------|--------|-------------------|
| Real-time token API in Cowork | Does not exist | Would require HTTP middleware breaking sandbox |
| Compression detection | Does not exist | Cowork doesn't expose compression events |
| Context budget alerts | Does not exist | No telemetry in session scope |
| 1M token Cowork | Not yet | Anthropic hasn't released; API-only for now |
| Persistent MCP state | Does not exist | MCPs are read-only in Cowork; no write API |

---

## Risk Assessment

### Hypothesis: "Memory Tool will solve token loss entirely"
**Risk:** Memory Tool has 200-line hard limit on MEMORY.md. If Patrick's session summaries exceed 200 lines, Claude only sees first 200 lines on next session init. Mitigation: split summaries into topic files (one per feature area).

### Hypothesis: "Scheduled tasks will catch context loss before it happens"
**Risk:** Scheduled task is out-of-band; if Patrick starts a session manually without waiting for the task, context planning is skipped. Mitigation: document "wait 1 min after 9 AM for context check" or make it optional.

### Hypothesis: "Token Counting API can replace self-estimation"
**Risk:** Token Counting API is external; requires network call. If Cowork loses internet mid-session, estimation fails silently. Mitigation: keep manual estimation formula as fallback.

---

## Session Wrap Notes for Patrick

**To implement Phase 1 (Memory Tool):**
1. Stop using "[CHECKPOINT — Turn N]" format
2. Instead, write final summary to `memory/session-{N}-summary.md` at wrap
3. On next session init, Cowork will surface it auto-magically
4. No config change needed; Memory Tool is built-in

**To implement Phase 2 (Optional):**
Use `create_scheduled_task` with task prompt that reads memory files and alerts on high burn.

**Token Counting API (For pre-session planning only):**
If Patrick wants exact counts on next-session-prompt.md before session start, use Anthropic's official SDK:
```python
response = client.messages.count_tokens(
  model="claude-opus-4-6",
  system=NEXT_SESSION_PROMPT,
  messages=[...]
)
print(f"Session init will cost {response.input_tokens} tokens")
```

---

## Sources

- [Token Counting API](https://platform.claude.com/docs/en/build-with-claude/token-counting)
- [Claude Memory Tool (Official)](https://code.claude.com/docs/en/memory)
- [Scheduled Tasks Docs](https://code.claude.com/docs/en/scheduled-tasks)
- [1M Token Context (Announcement)](https://platform.claude.com/docs/en/build-with-claude/context-windows)
- [Memory Tool API Reference](https://platform.claude.com/docs/en/agents-and-tools/tool-use/memory-tool)
