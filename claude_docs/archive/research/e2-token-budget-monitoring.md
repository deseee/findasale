# E2: Token Budget Monitoring — Research & Recommendations

Created: Session 96 (2026-03-09)
Status: Complete
Backlog ref: E2

---

## Question

Is token monitoring implemented? Can we see remaining session/weekly limits?
How many tokens per percentage? How to manage context window health?

## Key Findings

### Built-in Commands (Available Now)

| Command | What it shows | Works in Cowork? |
|---------|---------------|------------------|
| `/cost` | Per-session token spend ($ amount, duration, code changes) | Test needed |
| `/stats` | Usage patterns for Pro subscribers | Test needed |
| `/context` | Context window breakdown: system prompts, tools, memory, messages | Test needed |
| `/compact [focus]` | Manually trigger context compression with optional focus area | Test needed |

### Context Window

- **Size:** 200,000 tokens for Claude Code / Cowork sessions.
- **Autocompact:** Triggers at ~95% usage. Clears old tool outputs first, then summarizes conversation. Key instructions may be lost if only in conversation history (not CLAUDE.md).
- **Prevention:** Put persistent rules in CLAUDE.md. Keep CLAUDE.md lean (~500 lines max). Use `/clear` between unrelated tasks. Delegate verbose operations to subagents.

### Tokens-Per-Percentage Estimate

200,000 tokens / 100% = ~2,000 tokens per 1%.

Rough guidelines:
- A typical message from Patrick: 50-200 tokens
- Claude's response with tool calls: 500-2,000 tokens
- Reading a large file: 2,000-10,000 tokens (tool output)
- A subagent call: 5,000-50,000+ tokens (full sub-context)
- CLAUDE.md + system prompt: ~10,000-20,000 tokens (5-10% baseline)

### Status Line Configuration

The `/statusline` command can show real-time context usage. Custom shell scripts
receive JSON session data and can display token counts, percentage, costs.
This directly answers G7 from the backlog.

### Third-Party Monitoring Tools

- **ccusage** — Usage by date/week/month, grouped by session, filtered by model
- **Claude-Code-Usage-Monitor** — Real-time charts, cost estimates, predictions
- **ccburn** — Python TUI with burn rate visualization

These are CLI tools that Patrick could install separately for dashboard-level visibility.

### Weekly/Monthly Budget Visibility

No built-in way to see remaining Pro plan budget from within a session.
The Claude Console (web) shows usage for team/API accounts. Pro subscribers
don't get a "tokens remaining" view — the plan just throttles when limits hit.

## Recommendations

### Immediate (This Session)

1. **Test `/cost`, `/stats`, `/context` in Cowork** — verify which commands work.
2. **Add to session-wrap protocol:** Run `/cost` at session end, record in session-log.

### Short-Term

3. **Configure statusline** — Show context % in the status bar. Research exact config.
4. **Add context health checkpoint to CORE.md** — "If context exceeds 60%, consider
   `/compact` or delegate remaining work to subagents."

### Medium-Term

5. **Install ccusage** — Patrick can run this on Windows to track weekly burn rate.
6. **Build a session budget template** — estimate token budget per session based on
   planned tasks, set a "stop and wrap" threshold at 80% context.

## Patrick's Questions Answered

**"Can it tell how much we have left in current session?"**
Yes — `/context` shows breakdown. But there's no "remaining %" display by default.
A custom statusline could show this.

**"Weekly limits for all models and sonnet only?"**
Not visible from within sessions. Pro plan throttles at limits. No pre-warning.

**"How many tokens is each % roughly?"**
~2,000 tokens per 1% of the 200k window.
