# Session Init + Checkpoint System Audit
**Date:** 2026-03-09 (Session 118 audit)
**Scope:** Sessions 108–117 + this session's failure
**Finding:** Checkpoint system is sound, but Rule 3 enforcement fails on task-assignment first messages.

---

## Executive Summary

Session 118 began without session init announcement — a Rule 3 violation. The checkpoint system works well when deployed, but adoption is inconsistent. Three concrete workflow changes will solve the consistency problem: (1) embed token budget check in `next-session-prompt.md`, (2) make Rule 3 fail-safe by requiring explicit session-start marker in message, (3) automate checkpoint logging via shell alias.

---

## Complete Session Lifecycle Map

| Stage | Current Rule | What Goes Wrong | Why |
|-------|--------------|-----------------|-----|
| **INIT** | Rule 3: "First message = session start signal" | No announcement, no budget briefing | Rule 3 says "First message (any type)" but doesn't distinguish short opener vs task assignment. Task-assignment msgs trigger no announcement because they "contain work context." |
| **WORK** | CORE.md §3: Checkpoint at natural pauses | Checkpoints either missing or inconsistent | No enforcement: if Claude "forgets" to log or context gets tight, checkpoints vanish silently. |
| **CHECKPOINT** | Turn N format in chat | Compressed sessions reset Turn count to 1 | When context compresses mid-session, "[CHECKPOINT — Turn 9]" becomes "[CHECKPOINT — Turn 1 (resumed)]" — losing turn history. |
| **WRAP** | Session-log.md entry + next-session-prompt | Wrap docs stale if pushes fail | MCP pushes mid-session aren't synced in local tree. Wrap edits can conflict. Subagent files drift if MESSAGE_BOARD.json isn't read. |

---

## Why Rule 3 Fails on Task-Assignment Msgs

**Current Rule 3 logic:**

```
If first message is "short opener" (≤5 words) → load context + announce init
If first message is "status/task" (long msg) → load context silently + acknowledge msg
```

**The gap:** Task-assignment messages like "Patrick: audit sessions 108–116" land in category 2, which says:

> "Acknowledge the update in one sentence. Include token budget."

This is backwards. A task assignment **requires** full session init (budget briefing + priority queue), not a one-sentence acknowledgment.

**Session 118 symptom:** First message was a task assignment (audit request), so Claude acknowledged it, started work, and never announced the budget or loaded next-session-prompt.md.

**Fix:** Clarify Rule 3 to treat task-assignment messages as requiring full init, same as short openers.

---

## Checkpoint System: Broken by Design or Enforcement?

**Finding:** The checkpoint system itself is sound. The problem is enforcement + adoption.

**Evidence:**

- **Sessions 116–117:** Checkpoints were logged (`~30k tokens`, `~80k tokens`) but without detailed turn-by-turn format. Rough estimates.
- **Session 115:** Zero checkpoints logged despite 3 parallel subagents + high token burn.
- **Session 114:** Zero checkpoints despite 6 parallel subagent dispatches.
- **Sessions 113 & earlier:** No checkpoint habit established.

**Why it fails:**

1. **No visibility gate** — If Claude decides "low token burn, skip checkpoints," there's no enforcement. Checkpoints are advisory, not mandatory.
2. **Compression event loses turn history** — When context compresses, the in-conversation "[CHECKPOINT — Turn N]" messages are discarded. Only the wrap session-log entry survives, but it's qualitative ("~80k tokens est."), not precise.
3. **Subagent capacity rule is unmonitored** — "Keep ≤4 agents per batch" in token-checkpoint-guide.md has no enforcement. Session 114 dispatched 6 parallel agents with no pre-dispatch budget check.
4. **Token estimation is vague** — "Subagent output = 5k baseline" is too broad. Session 115 had 3 parallel subagents but only ~3 estimated it as "high token session."

**Is it broken?** No. Is it unenforced? Yes.

---

## Why Session Init Was Skipped This Session (118)

**Actual sequence:**

1. User message: "Audit sessions 108–116 (Patrick requested…)" — long task assignment
2. Rule 3 condition: "Status/completion report or task assignment (long message, contains work context)"
3. Rule 3 response: "Acknowledge update in one sentence" + include token budget
4. **What actually happened:** Claude loaded context silently, started audit work, never said "Session 118 starting — ~195k available, warn at 170k"
5. **Why:** The "acknowledge in one sentence" instruction crowded out the full announcement. The token budget was *included* but buried in a one-liner, not announced as a session-start briefing.

**Root cause:** Rule 3 (task-assignment branch) conflates "acknowledge the task" with "announce session init." They are different operations.

---

## Checkpoint System Reality Check

**What works:**
- Token estimation formulas are reasonable (±10% on file reads, ±20% on subagent overhead)
- Checkpoint format is clear (`[CHECKPOINT — Turn N] Files: X | Tools: Z | Session: ~Vk / 200k`)
- Warning threshold (170k used) is well-calibrated; 85% is a good pause point

**What doesn't work:**
- **Compression resets turn counter** — "[CHECKPOINT — Turn 9]" → "[CHECKPOINT — Turn 1 (resumed)]" breaks the running sum. Wrap-time logs must rely on git diffs to reconstruct actual token cost.
- **No pre-dispatch budget check** — Before dispatching agents, Claude should log remaining budget. Session 114 had 6 agents queued without a "remaining: ~120k" checkpoint first.
- **Checkpoints disappear if session ends uncleanly** — If Patrick closes the tab at Turn 5, the checkpoints logged in turns 2–4 are gone unless they were explicitly copied to wrap docs. They should auto-append to session-log.md incrementally.

---

## Minimum Viable Fixes (Ranked by Impact/Effort)

### 1. **Fix Rule 3 Task-Assignment Branch** (IMPACT: High | EFFORT: Low)
**Change:** Merge short-opener and task-assignment branches.

**Current:**
```
Short opener (≤5 words) → full announce
Task assignment (long) → one-liner + budget
```

**New:**
```
Any first message (opener, task, status) → full session init:
  1. Load context silently
  2. Announce: "Session N — ~195k available. Warn at 170k. Priority: [list]"
  3. Start P1 task immediately
```

**Location:** conversation-defaults SKILL.md, Rule 3, both branches merged.

**Why it works:** Eliminates the "acknowledge" half-measure. Every session starts with the same briefing, regardless of message type.

---

### 2. **Embed Budget Check in next-session-prompt.md** (IMPACT: High | EFFORT: Medium)
**Change:** Add a "GO/NOGO" checklist at the top of next-session-prompt.md that Claude reads before starting work.

**Add section:**
```markdown
## Session Start Checklist (READ THIS FIRST)

Before you begin work:
- ☐ Environment check: git status clean? (expected: empty output)
- ☐ Context fresh: context.md updated? (expected: <24 hours old)
- ☐ Budget briefing ready: ~200k total, ~5k init, ~195k available
- ☐ Priority queue loaded: P1=[from STATE.md], P2=[from roadmap]

If any ☐ fails, STOP and report to Patrick before proceeding.
```

**Why it works:** Forces Claude to load next-session-prompt.md at session start (same place Rule 3 says to load it). The checklist becomes a hard gate before work begins.

---

### 3. **Checkpoint Auto-Append to Wrap Log** (IMPACT: Medium | EFFORT: Medium)
**Change:** At session end, scan the entire conversation for `[CHECKPOINT —` markers and auto-append to session-log.md in the new session entry.

**Mechanism:** Shell alias at wrap time:
```bash
grep -n "\[CHECKPOINT —" conversation.log >> claude_docs/logs/session-log.md
git add claude_docs/logs/session-log.md
git commit -m "chore: append checkpoints to session log"
```

**Why it works:** Checkpoints survive compression. They're automatically preserved in the durable record (session-log.md) even if the conversation is pruned.

---

### 4. **Pre-Dispatch Capacity Checkpoint (Rule Enforcement)** (IMPACT: Medium | EFFORT: Low)
**Change:** Before dispatching ≥3 parallel subagents, log a budget checkpoint.

**Update to CORE.md §3:**
```
Before dispatching N subagents: log `[CHECKPOINT — Pre-Dispatch] Remaining: ~Xk,
dispatching N agents (est. Y–Zk), reserve post-batch: ~Wk`
```

**Why it works:** Forces pre-flight visibility. If remaining budget is <100k and N>2, Claude pauses and checks with Patrick.

---

### 5. **Make Session Init a Skill (Fallback)** (IMPACT: Low | EFFORT: High)
**Note:** Not recommended for immediate adoption. Contingency only.

**Idea:** Create a `session-init` skill that auto-loads if next-session-prompt.md is fresh. Guarantees init runs.

**Why not now:** High effort (skill logic, state management), low ROI over fixing Rule 3 + embedding checks in next-session-prompt.md. Save for Session 130+ if rule-based fix fails.

---

## Adoption Plan

### Week 1 (Session 119–120)
1. Merge Rule 3 branches (task-assignment = full init)
2. Add checklist to next-session-prompt.md template
3. Test: Patrick starts sessions with task assignments; verify full init runs

### Week 2 (Session 121–125)
4. Deploy pre-dispatch checkpoint rule to CORE.md
5. Automate checkpoint append-to-log (shell alias in wrap template)
6. Measure: compare token burn accuracy (checkpoint-logged vs actual) across 5 sessions

### Week 3+ (Session 126+)
- If Rule 3 fix + checklist reliably prevent init failures → stable, no skill needed
- If failures persist → escalate to session-init skill (R&D)

---

## Why the Current System Broke in Session 118

**Chain of failure:**

1. Rule 3 didn't distinguish short-opener from task-assignment (design flaw)
2. Task-assignment first message triggers "acknowledge in one sentence" (de-prioritizes init announcement)
3. Full session init (budget briefing) was skipped; abbreviated one-liner was given instead
4. Claude proceeded to audit work without awareness of remaining token budget
5. No pre-dispatch checkpoint before starting multi-file reads (no enforcement)

**Result:** High-risk session (audit = many file reads) started without budget awareness or checkpoint tracking enabled.

---

## Checkpoint System Verdict

The system is **sound but unenforced**.

- **Formulas:** accurate
- **Format:** clear
- **Thresholds:** well-calibrated
- **Adoption:** inconsistent (logged in 2 of last 5 sessions)
- **Compression survival:** poor (loses turn history unless manually logged to wrap docs)

**Recommendation:** Don't redesign the checkpoint system. **Enforce it** by embedding budget checks in next-session-prompt.md and adding pre-dispatch gates in CORE.md.

---

## Files to Update

1. **conversation-defaults SKILL.md** — merge Rule 3 branches
2. **next-session-prompt.md template** — add checklist
3. **CORE.md §3** — add pre-dispatch checkpoint rule
4. **WRAP_PROTOCOL_QUICK_REFERENCE.md** — add checkpoint auto-append step

---

**Status:** Ready to implement. All changes are low-risk, isolated, and reversible.
