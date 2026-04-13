# Token Tracking Feasibility Assessment

**Date:** 2026-03-09
**Requested by:** Patrick
**Research scope:** Implement token/context usage tracking in Claude Cowork sessions — estimate tokens used, warn at 85% context remaining, help Patrick spot inefficiencies

---

## Feasibility Verdict

**PARTIALLY FEASIBLE** — limited programmatic access, but hybrid approach is viable.

---

## What IS Possible

### 1. Self-Estimated Token Counting (No API Call Required)
Claude can estimate its own token usage within a session using client-side heuristics:
- **Exact count per message:** Impossible (no API exposure in Cowork environment)
- **Ballpark estimates:** Highly viable — apply [tiktoken](https://github.com/openai/tiktoken) or Claude token counting approximations to:
  - Input files read (line count + file size → ~4 tokens per word)
  - System prompts + instructions (known: ~900 tokens for CORE.md + CLAUDE.md + context)
  - Tool outputs (read results, grep results — token-countable)
  - Message history (this conversation → trackable token sum)
- **Accuracy:** ±10–15% margin of error on estimates. Sufficient for 85% warning threshold.

### 2. Context Window Size — Known
- **Current model:** Claude Haiku 4.5 (model ID: `claude-haiku-4-5-20251001`)
- **Context window:** 200,000 tokens (visible in system message at session start)
- **Budget allocation:**
  - System prompt + CORE.md + CLAUDE.md + context briefing: ~900 tokens (fixed)
  - Available work budget: ~195,000 tokens
  - Safe stop point: ~170,000 tokens used (85% of 200k) — leaves 30k for session wrap
  - Emergency stop: 190,000 tokens (95%) — must wrap immediately

### 3. Measurable Workflow Pauses
Tracking is most useful at natural checkpoint moments:
- After file read batches (Glob, Grep, Read — know exact token cost)
- After tool output parsing (JSON results, GitHub API responses — token-countable)
- Between subagent dispatches (know: inputs sent, estimated output size)
- At session wrap (final burn accounting)

---

## What IS NOT Possible

### 1. Real-Time Token Count from Cowork API
- **Claude Cowork environment does NOT expose:**
  - Token counts via environment variables
  - Token counts in tool outputs
  - Real-time usage telemetry
  - Token limit enforcement signals (no warning 15 minutes before hard stop)
- **Workaround:** NOT VIABLE. Would require direct Anthropic API calls, which are not available in Cowork session context.

### 2. Detecting Context Compression Automatically
- **Claude cannot see:** When/why context is compressed, how much was lost
- **Evidence:** Session 114 log shows compression happened (`Compressions: 1`), but only known because compression was logged manually post-hoc
- **Workaround:** Manual logging only (log it when you notice the reset)

### 3. Parallel Task Capacity Guarantees
- Cannot predict how many parallel subagents will fit in remaining budget without running them
- Token cost per subagent is highly variable (1k–15k depending on scope)
- **Safe rule:** Keep <5 subagents per batch, log outputs immediately

### 4. Accurate Forecast of Tool Call Tokens
- GitHub API call → unknown size JSON response
- Grep/Glob → unknown match count before run
- Database schema read → varies by file size
- **Mitigation:** Conservative estimate (assume 2x worst case), or run and immediately log actual

---

## Recommended Approach

### Hybrid Lightweight Tracking (3 Components)

#### Component 1: Checkpoint Logging Macro
Add to every session a simple tracking block at natural pauses:

```
[TOKEN CHECKPOINT — Turn N]
  Files read: 8 (est. 1.2k tokens)
  Tool calls: 3 GH API + 1 Grep (est. 2k tokens)
  Session total est.: 15k / 200k (7.5%)
  Safe to dispatch 2 parallel subagents
```

Cost: ~20 tokens per checkpoint (negligible). Benefit: visibility into burn rate, detect acceleration.

#### Component 2: Session-Start Budget Briefing
At session init, announce:

```
Session 115 context budget: ~200k tokens
Estimated available this session: ~195k
Burn rate target: <20k per 10 turns (sustainable)
Warning threshold: 170k used (85%) — will pause and plan wrap
```

Justification: Patrick sees the math upfront, makes better prioritization decisions.

#### Component 3: Turn-by-Turn Self-Estimate
After major tool outputs (file read, subagent dispatch), log:

```
Turn 5: Read 3 files (CORE.md, STATE.md, session-log.md)
  Est. tokens in: ~2.4k
  Cumulative session: ~8k / 200k (4%)
```

Cost: ~10 tokens per turn. Benefit: early warning if a single task burns unexpectedly.

---

## Risks & Downsides

| Approach | Risk | Mitigation |
|----------|------|-----------|
| **Self-estimation** | ±10-15% error margin could miss 85% threshold by 3k tokens | Use 170k (85%) threshold, not 169k. Build 1-2k safety margin. |
| **Checkpoint logging** | Adds 20 tokens per checkpoint — small overhead | Only log at natural breaks, skip rapid-fire turns |
| **Session-start budget** | False confidence (user thinks there's 195k free, but system prompt grows each turn) | Recount at turn 5, update forecast |
| **Parallel subagent forecasting** | No perfect prediction without running them | Conservative rule: max 4 subagents per batch for safety |

---

## Final Recommendation

### Implement: **YES — Full Hybrid Approach**

**Rationale:**
1. **Low friction cost** — ~30 tokens per session (0.015% overhead) vs. ~20% token loss from surprise compressions
2. **High ROI** — Patrick's complaint "I can't see how much context I have left" solved by Component 2 (briefing) + Component 3 (checkpoints)
3. **No API changes needed** — pure client-side estimation + manual logging
4. **Self-documenting** — CheckPoint logs become part of session-log.md history; Patrick learns burn patterns over time
5. **Opt-in** — can be disabled per-session if Patrick is in a time crunch

### Implementation Checklist
- [ ] Add token-checkpoint template to CORE.md §3 (sample checkpoint format)
- [ ] Create `claude_docs/operations/token-checkpoint-guide.md` (when to log, how to estimate, sample math)
- [ ] Update conversation-defaults skill: prepend session-start budget briefing to init message
- [ ] Log checkpoints at: (a) after file read batch, (b) after subagent dispatch, (c) turn 5, (d) before wrap
- [ ] Track in session-log.md: final session burn (`~Xk tokens used`, `Y checkpoints logged`)

### Success Criteria
- Patrick can see remaining budget at any given turn within ±10% accuracy
- No session surprise-compresses without warning (85% threshold triggers wrap planning)
- Token tracking overhead <1% of total session burn
- Checkpoint logs are readable by future Claudes (useful session history)

---

## Notes for Implementation

**Token estimation formula (conservative):**
- File read (per 100 lines): 15 tokens
- Grep match result: 5 tokens per match
- GitHub API response: assume 2k min, +500 per file
- Subagent output: assume 5k baseline
- System/instruction overhead: 900 tokens (constant)

**Threshold math:**
- Safe threshold: 170k / 200k = 85%
- Hard stop: 190k / 200k = 95%
- Between them: WRAP NOW, don't start new tasks

**Log frequency recommendation:**
- Sessions <50 turns: checkpoint every 5 turns + before wrap
- Sessions 50–100 turns: checkpoint every 10 turns + before wrap
- Sessions >100 turns: manual checkpoints only (high compression risk anyway)
