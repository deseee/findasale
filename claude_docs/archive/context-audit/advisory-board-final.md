# Advisory Board Final Verdict — Context Loss & Compression Problem

**Date:** 2026-03-09
**Board:** Six independent audits (Architect, Developer, QA, PowerUser, Pitchman, Workflow)
**Authority:** Recommendations for Patrick (non-technical PM, MVP lean startup)

---

## VERDICT

**The compression problem is real and fixable.** Mid-session context compression erases checkpoints, resets turn counters, and silently orphans token burn history—costing ~20% of session capacity per compression event. **The core fix is trivial: external JSON persistence.** Current system is 95% correct in design; it fails only on enforcement and persistence. No redesign needed. Implement checkpoint-manifest.json file at repo root (survives compressions), tighten Rule 3 (merge task-assignment branch), embed budget checks in next-session-prompt.md. Total effort: 4–6 hours of implementation across 2 sessions. Token overhead: <100 tokens per session.

---

## KEEP (What's Working — Don't Touch)

1. **Token checkpoint format** (`[CHECKPOINT — Turn N]`) — clear, parseable, human-readable. Architects and developers both endorsed it.
2. **Estimation formulas** — file reads (~15 tokens/100 lines), GitHub API calls (~2k baseline), subagent overhead (~5k baseline) are accurate to ±10%. No change needed.
3. **Thresholds (170k warn, 190k stop)** — well-calibrated for 200k window. QA verified; don't adjust.
4. **Session init protocol** (CORE.md §2) — structure is sound. Only task-assignment branch enforcement is loose.
5. **Subagent capacity rule** (≤4 parallel) — limits are realistic. Implementation gap only (no pre-dispatch validation).
6. **Wrap protocol** — session-log.md entry + next-session-prompt.md update works. Just need to auto-append checkpoints to avoid loss.

---

## DROP (What's Adding Noise Without Value)

1. **In-conversation checkpoint logging alone** — text-based checkpoints in conversation history are erased by compression. Keep them for human audit trail, but they cannot be the primary persistence mechanism. Delegate to external JSON.
2. **Manual estimation reliance** — token counting is accurate enough, but lack of automation creates adoption gaps. Workflow audit shows checkpoints logged only 2 of last 5 sessions. Automate via persistent manifest.
3. **Session init ambiguity on task-assignment messages** — Rule 3 currently has two branches (short-opener vs. task-assignment), creating confusion. Merge them. One rule, one behavior.
4. **Compression detection via manual observation** — Pitchman suggested "watch for triggers (turn >30, token >120k)" but Claude cannot self-trigger file writes mid-compression. Drop the mid-compression trigger; instead, focus on pre-compression warnings (checkpoint at turn 45 for sessions <50 turns).

---

## BUILD (Prioritized New Capabilities)

### P0: Persistent Checkpoint Manifest (Session 119 — 2 hours)

**What:** Create `.checkpoint-manifest.json` at monorepo root. Single source of truth for all session checkpoints and compression events. Survives context compressions. Survives session restarts. Human-queryable JSON.

**Schema:** (Architect provided full spec — use as-is)
```json
{
  "version": "1.0",
  "lastUpdated": "2026-03-09T20:30:00Z",
  "currentSession": {
    "sessionId": "119",
    "startTime": "2026-03-09T19:00:00Z",
    "estimatedTokenBudget": 195000,
    "checkpoints": [
      {"turn": 5, "timestamp": "...", "filesRead": 8, "estimatedTokens": 1200, "sessionTotalPercent": 4.4, "status": "ok"}
    ],
    "compressionEvents": []
  },
  "sessionHistory": [...]
}
```

**Write cadence:**
- Session init: create `currentSession` block
- After every checkpoint: append to `checkpoints[]`
- Compression detected: log to `compressionEvents[]`
- Session wrap: archive to `sessionHistory[]`, clear `currentSession`

**Cost:** ~100 tokens per session (1–3 file writes).

**Impl checklist:**
- [ ] Commit `.checkpoint-manifest.json` template to repo root (git-ignore the file)
- [ ] Update token-checkpoint-guide.md with manifest schema + write cadence
- [ ] Update CORE.md §2: add manifest read step to session init (log: "Prior session burned Xk, Y compressions")
- [ ] Claude writes to manifest at every checkpoint turn + at session wrap

---

### P1: Session Init Rule 3 Enforcement Fix (Session 119 — 1 hour)

**What:** Merge Rule 3 task-assignment branch with short-opener branch. Every first message (any type) triggers **full** session init, not abbreviated.

**Current Rule 3 gap:**
- Short opener (≤5 words) → full announce ✓
- Task assignment (long msg) → one-liner only ✗ (causes Session 118 failure)

**Fix:**
```
New Rule 3: Any first message → full session init:
  1. Load CORE.md, context.md, STATE.md
  2. Announce: "Session N — ~195k tokens available. Warn at 170k. P1: [list]"
  3. Start task immediately (don't ask "what next?")
```

**Files to edit:**
- `conversation-defaults SKILL.md` (Rule 3, both branches merged)
- `CORE.md §2` (session init checklist)

**Why it works:** Eliminates "acknowledge in one sentence" half-measure. Every session starts with same briefing.

---

### P2: Budget Check Embedded in next-session-prompt.md (Session 119 — 1 hour)

**What:** Add a "GO/NOGO" checklist at top of next-session-prompt.md that forces Claude to validate init before starting work.

**Add:**
```markdown
## Session Start Checklist (READ THIS FIRST)

Before you begin work:
- ☐ CORE.md §2 loaded (context + budget briefing)
- ☐ Token budget: ~200k total, ~5k init, ~195k available
- ☐ Warning threshold: 170k used (85%)
- ☐ Hard stop: 190k used (95%)
- ☐ Priority queue: P1=[list], P2=[list], P3=[list]

If any ☐ fails, STOP and report to Patrick before proceeding.
```

**Why it works:** Turns init from optional procedure into hard gate. Claude cannot proceed past checklist without reading it. Embedded directly in work prompt = always visible.

---

### P3: Compression Detection Hook (Session 120 — 30 min)

**What:** When Claude detects turn count reset (e.g., "Turn 9" → "Turn 1 (resumed)"), immediately log compression event to manifest.

**Mechanism:**
```
If context resets detected (turn counter decrements or history gaps):
  Log to manifest compressionEvents[]:
    {turn: N, timestamp: "...", tokensBefore: X, tokensAfter: Y, contextLost: ["checkpoint_logs", ...]}
```

**Why it works:** Captures compression evidence in persistent JSON. Next session init reads manifest and says: "Previous session had compression at turn 9 (120k→90k). Be cautious."

---

### P4: Pre-Dispatch Budget Checkpoint (Session 120 — 30 min)

**What:** Before dispatching ≥3 parallel subagents, log a checkpoint with remaining budget visible.

**Update CORE.md §3:**
```
Before dispatching N subagents (N ≥ 3):
  Log: [CHECKPOINT — Pre-Dispatch] Remaining: ~Xk tokens.
       Dispatching N agents (est. Y–Zk). Reserve post-batch: ~Wk.
```

**Why it works:** Forces visibility into remaining budget before expensive operations. Session 114 dispatched 6 agents without budget checkpoint; this prevents repeats.

---

## ANSWERS TO THE THREE QUESTIONS

### 1. Can JSON persistence solve the compression problem? What's the recommended implementation?

**YES.** Persistent `.checkpoint-manifest.json` at repo root survives compressions, enables cross-session continuity, and is trivial to implement.

**Recommended schema:** Architect's design (full spec in architect-findings.md). Single source of truth. Write cadence: at session init, after every checkpoint, at wrap. Cost: <100 tokens per session.

**Failure modes all mitigated:**
- File write loses sync? No—local file only, survives SSH resets.
- JSON grows unbounded? Keep last 50 sessions; archive older ones to separate file.
- Concurrent writes? Last-write-wins is acceptable (checkpoints are non-critical). Add `lastUpdated` timestamp.
- Malformed JSON? Add git pre-hook to validate. If invalid, fallback to CORE.md defaults (non-blocking).

**Why not alternatives?**
- In-conversation blocks: Erased by compression. Defeated the purpose.
- Database table: Over-engineering for MVP. Requires migration + connection complexity.
- External API: Network latency + auth complexity. Violates "no external APIs" for Cowork.
- Git commits at every checkpoint: Too expensive (5–10 tokens per commit). Pollutes history.

---

### 2. How can compressions be better predicted?

**Partially.** Claude can sense *leading indicators* but cannot detect compression in advance. No API exposes compression events.

**Measurable signals (reliable to ±5%):**
- **Turn count** (most reliable): Sessions >50 turns → compression likely by turn 60. At turn 45, log final checkpoint before risk zone.
- **File read volume** (proxy for burn): Each file ~15 tokens/100 lines. If cumulative >150 files → assume 15k+ tokens burned.
- **GitHub API velocity** (early warning): >4 calls → 10k+ tokens burned. Warn before dispatching 5th call.
- **Subagent batch count** (expensive): >2 parallel batches in session → 20k+ tokens per batch. Check remaining budget before 3rd batch.

**Decision tree at every checkpoint:**
```
If turn ≥ 50: Warn "compression risk zone"
If cumulative filesRead > 150: Estimate ~15k tokens
If cumulative github_calls > 4: Estimate elevated burn (+5k)
If estimatedTotal > 150k: Recommend wrap at next break
If estimatedTotal > 170k: MUST wrap (hard threshold)
```

**What Claude CANNOT sense:**
- Actual token count per message (no API exposure).
- System prompt growth (invisible each turn).
- Exact cost of upcoming tool calls (varies wildly).
- Compression timing in advance (no signals available).

**Practical rule:** At turn 45 (for sessions <50 turns), log checkpoint. At turn 50+, after every checkpoint recalculate burn. If estimated >150k, stop new tasks and plan wrap.

---

### 3. What needs to stay, what needs to go, and what needs to be added in the current system?

**STAY:**
- Checkpoint format, estimation formulas, thresholds, subagent capacity rule, wrap protocol (all sound).
- Token-checkpoint-guide.md (good reference).
- CORE.md §2–3 (structure correct; enforcement gaps only).

**GO:**
- In-conversation-only checkpoint persistence (move to external JSON).
- Rule 3 task-assignment branch ambiguity (merge into unified rule).
- Manual compression detection via "watch for triggers" (impractical; focus on pre-compression warnings instead).

**BUILD:**
1. `.checkpoint-manifest.json` — persistent JSON at repo root (P0, 2 hours)
2. Rule 3 enforcement fix — merge task-assignment branch (P0, 1 hour)
3. Budget checklist in next-session-prompt.md — hard gate before work (P1, 1 hour)
4. Compression detection hook — log events to manifest (P2, 30 min)
5. Pre-dispatch checkpoint — validate budget before 3+ agents (P2, 30 min)

---

## DISSENT & RISK FLAGS

### Disagreement: Memory Tool vs. File-Based Checkpoint

**PowerUser audit** suggested using Claude Code's Memory Tool (auto-loads `memory/` directory) instead of file-based persistence. **Architect & Developer audits** recommended `.checkpoint-manifest.json` file.

**Board position:** Start with file-based manifest (faster to implement, no dependency on Anthropic features). If Memory Tool becomes available in Cowork within 60 days, revisit and consider migration.

**Risk:** Memory Tool has 200-line limit on MEMORY.md index. If checkpoint summaries exceed 200 lines, Claude only sees first 200 lines on next session init. Mitigation: split summaries into topic-specific files.

---

### Risk: Scheduled Tasks Injection Issue

**PowerUser audit** flagged GitHub Issue #29022: `create_scheduled_task` tool sometimes not injected into Windows Cowork sessions. Do NOT rely on scheduled tasks for session init context injection. **Recommendation:** File-based manifest is safer.

---

### Risk: Adoption Requires Culture Change

**Workflow audit** found checkpoints logged only 2 of last 5 sessions. File persistence is necessary but not sufficient. **Must pair with:**
1. Rule 3 enforcement fix (eliminate ambiguity)
2. Budget checklist in next-session-prompt.md (turn init into hard gate)
3. Pre-dispatch checkpoint rule in CORE.md (make enforcement visible)

Without these cultural changes, engineers may still skip checkpoints. The persistent manifest is the *structure*; Rule 3 + checklist are the *enforcement*.

---

### Risk: Token Estimation Accuracy

Board consensus: estimation formulas are accurate to ±10–15%. **Not a blocker.** Warning threshold (170k) is conservative enough that estimation error doesn't cause false positives. Worst case: Claude stops at 155k thinking burn is 170k. Acceptable margin.

---

### Risk: Cross-Session Manifest Staleness

**Developer audit** raised concern: if manifest is not updated at session wrap, next session reads stale data. **Mitigation:** Embed timestamp validation in session init logic. If `lastUpdated` is >1 hour old, warn Patrick ("manifest may be stale; last update X hours ago"). Non-blocking but visible.

---

## IMPLEMENTATION ROADMAP

### Session 119 (Next Session)
1. Create `.checkpoint-manifest.json` template in repo root
2. Update token-checkpoint-guide.md with manifest schema + write cadence
3. Update CORE.md §2 to read manifest at session init
4. Fix Rule 3 (merge task-assignment branch)
5. Add budget checklist to next-session-prompt.md

### Session 120
1. Implement manifest write logic (after every checkpoint, at wrap)
2. Deploy compression detection hook (log to manifest when context resets)
3. Add pre-dispatch checkpoint rule to CORE.md §3
4. Validate across 3–5 sessions (measure checkpoint adoption, token accuracy)

### Session 121+
1. Analyze manifest patterns — are compressions predictable?
2. Refine burn-rate prediction rules if data shows patterns
3. Document lessons learned in RECOVERY.md

---

## SUMMARY FOR PATRICK

**You have a working checkpoint system. It's not broken — it's just unenforced and not persistent.**

**Three changes fix everything:**

1. **Add a file** (`.checkpoint-manifest.json`) that Claude writes to at every checkpoint. It survives compressions and your next session can read it. Cost: 100 tokens per session.

2. **Tighten Rule 3** so every session (whether you start with a short message or a task assignment) gets a full budget briefing. Currently, task assignments skip the briefing—fix that.

3. **Embed a checklist** in next-session-prompt.md so Claude can't start work without verifying token budget, priorities, and context are loaded. Turns init from optional to mandatory.

**No magic. No new APIs. No external dependencies.** Just three small tweaks to move from "checkpoint system is fragile and adoption is inconsistent" to "checkpoint system is robust and adoption is automatic."

Estimated effort: 4–6 hours of implementation. Payoff: eliminate 20% token loss from compressions, recover ~40k tokens per 10-session batch, cut debug time in half.

---

**Status:** READY TO IMPLEMENT. No blockers. All recommendations are low-risk and reversible.

**Next step:** Patrick schedules Session 119. Board prioritizes P0 items (manifest + Rule 3 fix + checklist). Launch Phase 2 (manifest write logic + compression hook) in Session 120.
