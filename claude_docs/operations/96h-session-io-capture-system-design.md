# 96-Hour Session I/O Capture System — Design Analysis

**Author:** Cowork Power User (Agent)
**Date:** 2026-03-13
**Status:** DESIGN DOCUMENT — Ready for Patrick Decision
**Scope:** Rolling 96-hour conversation capture, automated analysis, context-loss detection

---

## Executive Summary

Patrick wants a **rolling 96-hour session I/O capture system** to detect and prevent context loss, auto-compression failures, and orphaned work across FindA.Sale Cowork sessions. This document analyzes: (1) what Claude can actually capture, (2) realistic system architecture, (3) integration with existing infrastructure, (4) value vs. maintenance cost, and (5) concrete recommendations.

**Bottom line:** Claude cannot access its own raw conversation history directly. However, a practical system can be built by:
- Capturing Claude outputs at source (each session's work)
- Having Claude log inputs explicitly during work
- Analyzing both for patterns (context loss, auto-compression, orphaned work)
- Running 12-hour analysis tasks to flag issues

Expected file size: **400–800 KB per 96-hour window** (rolling buffer, JSON format). Integration: **additive to STATE.md, complementary to MESSAGE_BOARD, orthogonal to session-log**.

---

## Part 1: What Can Claude Actually Capture?

### Hard Constraint: No Raw Conversation Access

Claude **does not have access** to:
- Its own conversation history within a session
- Previous turns' prompts or outputs (except what it reads back from files)
- Session metadata (token counts, model checkpoints, compression events)
- Cowork internal logs (when compression happened, which context was discarded)

### What IS Available

1. **Work artifacts:** Files created/modified during the session (commit logs, STATE.md entries, task completions)
2. **Structured output:** MESSAGE_BOARD.json (agent-to-agent handoffs), decisions-log.md (recorded decisions)
3. **Self-reporting:** Agents can write explicit "I received input X and did work Y" logs
4. **Scheduled task logs:** Capture what each agent reported in MESSAGE_BOARD at completion
5. **Diff tracking:** Git commits show what changed per session (not why or when during the session)

### What This Means

**We cannot build:** Automatic transcript capture from Claude's perspective.
**We can build:** A metadata + artifact log showing what work was requested, what was completed, what was left hanging.

---

## Part 2: System Architecture

### 2A. Capture Mechanism

Create a **session-io-capture.jsonl** file (append-only, rolling 96-hour buffer):

```jsonl
{
  "session": 157,
  "timestamp": "2026-03-13T08:30:00Z",
  "type": "agent-input",
  "actor": "patrick",
  "request": "Run the power user improvement pass",
  "routing": "cowork-power-user",
  "context_used_mb": 45,
  "priority": "medium"
}
{
  "session": 157,
  "timestamp": "2026-03-13T08:45:00Z",
  "type": "agent-work",
  "actor": "cowork-power-user",
  "work_type": "ecosystem-research",
  "files_read": ["SKILL.md", "STATE.md", "roadmap.md"],
  "files_created": ["improvement-memos/ecosystem-scan-2026-03-13.md"],
  "proposals_generated": 3,
  "status": "in-progress"
}
{
  "session": 157,
  "timestamp": "2026-03-13T09:15:00Z",
  "type": "agent-output",
  "actor": "cowork-power-user",
  "target": "patrick",
  "summary": "Completed ecosystem scan. 3 new MCP connectors identified: Google Analytics, Mixpanel, HubSpot.",
  "files_changed": ["operations/ecosystem-research-memo-2026-03-13.md"],
  "follow_up_needed": false,
  "context_remaining_mb": 38
}
{
  "session": 157,
  "timestamp": "2026-03-13T09:20:00Z",
  "type": "session-checkpoint",
  "compression_event": false,
  "tokens_used": 142000,
  "tokens_remaining": 58000,
  "context_pct_used": 71,
  "work_in_progress": [],
  "pending_handoffs": []
}
```

### 2B. File Format

**Location:** `claude_docs/operations/session-io-capture.jsonl`

**Rolling buffer:** Each 12-hour analysis task prunes entries older than 96 hours (keep ~400 most recent lines).

**Schema per entry:**
- `session` (int): Session number
- `timestamp` (ISO 8601): When the entry was logged
- `type` (enum): `agent-input`, `agent-work`, `agent-output`, `session-checkpoint`, `work-abandoned`, `compression-suspected`
- `actor` (string): Who acted (Patrick, agent name, or system)
- `work_type` (string, optional): Category (ecosystem-research, code-fix, architecture, etc.)
- `summary` (string): 1-sentence human-readable description
- `files_read` (array, optional): Files accessed
- `files_created` (array, optional): Files created
- `files_changed` (array, optional): Files modified
- `proposals_generated` (int, optional): Count for power-user runs
- `tokens_used` (int, optional): Session-level estimate
- `context_pct_used` (float, optional): % of context window
- `follow_up_needed` (bool, optional): Does this work need a continuation?
- `follow_up_reason` (string, optional): Why (context hit, blocker, patch needed)
- `status` (enum): `complete`, `in-progress`, `deferred`, `blocked`, `abandoned`

### 2C. When Entries Are Created

**Agent-level logging (during work):**
- Agent creates entry at START of major work: `agent-input` (what was asked)
- Agent creates entries as work PROGRESSES: `agent-work` (checkpoint every 15–30 min)
- Agent creates entry at END: `agent-output` (summary + handoff info)

**System-level checkpoints (every 12 hours):**
- Scheduled task reads MESSAGE_BOARD.json, pulls latest completions
- Creates `session-checkpoint` entry (token usage, compression status)
- Prunes buffer to last 96 hours

**Anomaly detection (every 12 hours):**
- Scans for `work-abandoned` (work started but no completion entry)
- Flags `compression-suspected` (context_pct_used > 85 and work-in-progress > 0)

---

## Part 3: 12-Hour Analysis Task

### What It Does

Runs every 12 hours (can be manually triggered):

```
capture-analysis-task:
  Input: session-io-capture.jsonl (last 96 hours)
  Output: claude_docs/operations/session-io-analysis-YYYY-MM-DD.md

  Checks:
  1. Context loss detection
  2. Auto-compression patterns
  3. Unmatched input/output pairs
  4. Orphaned work (started but not completed)
  5. File corruption
  6. Post-session work not in STATE.md
```

### Detection Rules

**Context Loss** — Flag when:
- `agent-input` entry exists, but no corresponding `agent-output` within 2 hours
- `context_pct_used` jumps from 65% to 15% (compression event, possible context discard)
- `follow_up_needed: true` in previous entry, but no follow-up in next 30 minutes

**Auto-Compression** — Flag when:
- TOKEN_USAGE jumps significantly (e.g., 120k → 60k in same session)
- Work was in-progress at compression point
- Compression not recorded in STATE.md or decisions-log.md

**Unmatched I/O** — Flag when:
- `agent-input` without corresponding completion
- Patrick says "do X" but no agent picks it up (no routing entry)
- Multiple agents start same task without coordination

**Orphaned Work** — Flag when:
- Work marked `complete` in agent output, but files never committed to git
- Files created/changed in session, but no STATE.md entry at wrap
- Message in MESSAGE_BOARD but code changes missing from next session

**File Corruption** — Flag when:
- Duplicate entries in capture log (same timestamp, same actor, same work_type)
- Malformed JSON (JSONL parse errors)
- Entry references file that doesn't exist in git

### Analysis Output Format

```markdown
# Session I/O Analysis — 2026-03-13 (96h window)

## Summary
- Total entries: 47
- Completed work items: 12
- Abandoned work items: 1
- Compression events: 0
- Issues detected: 2

## Issues

### ISSUE-1: Unmatched Input (Session 155)
- Input: "Run the power user improvement pass" (timestamp T1)
- Expected output: Not found in last 2 hours
- Status: ⚠ PENDING (may resume in next session)
- Action: Check next-session-prompt.md for resume instructions

### ISSUE-2: Orphaned Work (Session 154)
- Work: "Cash fee migration deployment" (marked complete, output in MESSAGE_BOARD)
- Git status: Files committed ✅
- STATE.md status: Documented ✅
- Conclusion: No issue — work properly tracked

## Pattern Analysis

### Context Usage Trend (96h)
- Session 157: 71% (high — near compression point)
- Session 156: 62% (normal)
- Session 155: 48% (normal — docs-only session)
- Recommendation: Consider splitting high-context sessions

### Agent Efficiency (top 3)
1. findasale-dev: 8 tasks, 6 completed, 1 in-progress, 1 blocked
2. findasale-architect: 5 tasks, 5 completed
3. cowork-power-user: 3 tasks, 3 completed

### Time-to-Completion (median)
- findasale-architect: 45 min (fast decisions)
- findasale-dev: 2.5 hours (code + push)
- findasale-qa: 1.5 hours (audit + report)

## Recommendations

1. Session 157 context usage at 71% — next session should defer non-critical work
2. No compression events detected — context management working well
3. All work properly tracked — STATE.md hygiene is good
4. Zero file corruption — JSONL format working correctly

## Files Reviewed
- session-io-capture.jsonl (47 entries, 400 KB)
- MESSAGE_BOARD.json (20 messages)
- STATE.md (current)
- git log (last 12 hours)
```

---

## Part 4: Integration with Existing Infrastructure

### How It Fits

**STATE.md** — Source of truth for session outcomes
↓
**session-io-capture.jsonl** — Detailed I/O timeline that STATE.md summarizes
↓
**MESSAGE_BOARD.json** — Agent handoffs (subset of capture data)
↓
**session-log.md** — Historical record (written at wrap time)

**Not redundant:** Each file serves a different purpose.

- **STATE.md:** "What work is active? What did this session accomplish?"
- **capture.jsonl:** "What was asked and when? Did we finish it? Did context loss happen?"
- **MESSAGE_BOARD:** "Which agents communicated about what?"
- **session-log:** "What happened in each session (historical)?"

### CLAUDE.md Changes Needed?

**Yes, two minimal changes:**

1. **In conversation-defaults SKILL.md (Rule X):**
   ```
   # Rule X: I/O Capture Logging
   When starting major agent work, log to session-io-capture.jsonl:
   - Input: What was requested (timestamp, actor, routing)
   - Work: Progress checkpoints every 15-30 min
   - Output: Completion summary (timestamp, status, follow-up needed?)

   Format: append-only JSONL with schema from operations/session-io-capture-schema.md
   ```

2. **In CORE.md (new section):**
   ```
   ## Context Checkpoint Rule
   Every 12 hours, session-io-capture.jsonl is analyzed automatically for:
   - Unmatched input/output pairs
   - Context loss (compression without STATE.md record)
   - Orphaned work (completed but not committed)
   - File corruption

   Report: claude_docs/operations/session-io-analysis-[date].md
   Scope: No impact on session behavior — analysis-only
   ```

No changes to project CLAUDE.md — this is a **global observation system**, not a behavioral rule.

### Scheduled Task Config

**Task name:** `session-io-capture-analysis`
**Trigger:** Every 12 hours (e.g., 8:30 AM and 8:30 PM local time)
**Duration:** 5–10 minutes (JSONL parse + analysis)
**Output:** `claude_docs/operations/session-io-analysis-YYYY-MM-DD.md` (replace if exists)

**Fallback:** Can be manually triggered if needed — no state dependency.

---

## Part 5: File Size & Performance Analysis

### Expected I/O Volume

**Per-session capture (typical 2-hour session):**
- ~8–12 agent work items
- ~4–6 context checkpoints
- ~20–30 total entries
- Size: ~15–25 KB per session

**Rolling 96-hour window:**
- 48 sessions (average) × 20 KB = ~960 KB
- But we prune to 96h every 12h, so steady state: **400–800 KB**

**Analysis report (12-hourly):**
- ~5–10 KB each
- Keep last 30 reports in `operations/` (per soft cap in file-creation-schema)
- Archive older ones

### Performance Impact

- **Session startup:** No impact (capture file not loaded at session start)
- **Session execution:** Negligible (JSONL append, ~1ms per work item)
- **Analysis task:** ~30s to parse 400 KB JSONL + run detection rules
- **Git:** ~0.5 MB added per week (all analysis reports), easily managed

### Disk Impact

- **Main capture file:** 400–800 KB (rolling)
- **7 days of analysis reports:** ~50 KB
- **Total monthly:** <10 MB (negligible)

---

## Part 6: Real-World Example

**Session 155 (Roadmap Review):**

```
[8:15 AM] Patrick → "Run the power user improvement pass"
→ LOGGED: agent-input, actor=patrick, routing=cowork-power-user

[8:20 AM] Cowork Power User starts
→ LOGGED: agent-work, status=in-progress, files_read=[STATE.md, roadmap.md]

[8:45 AM] Ecosystem scan complete
→ LOGGED: agent-work (checkpoint), work_type=ecosystem-research, files_created=[memo]

[9:15 AM] Final output to Patrick
→ LOGGED: agent-output, summary="Ecosystem scan complete, 3 new MCPs identified"

[9:30 AM] Patrick requests roadmap cleanup
→ LOGGED: agent-input, actor=patrick, request="Update roadmap priority order"

[9:45 AM] Roadmap edits complete
→ LOGGED: agent-output, files_changed=[roadmap.md], status=complete

[10:00 AM] Session wrap (Session 155 record)
→ LOGGED: session-checkpoint, tokens_used=165000, compression_event=false

[10:00 AM → 2:00 PM] Analysis gap (no new entries, session paused)

[Next 12h] Analysis task runs
→ Finds: All work items matched (input→output). No orphaned work.
   STATE.md properly updated. Compression_event: false.
→ Generates: session-io-analysis-2026-03-12.md (PASS)
```

---

## Part 7: Value Assessment

### What This Solves

1. **Context Loss Detection** ✅
   Currently invisible; would be flagged if compression causes unmatched I/O

2. **Auto-Compression Visibility** ✅
   Token jumps logged; can correlate with work-in-progress status

3. **Orphaned Work Discovery** ✅
   Completed work items with no git commits = immediately flagged

4. **Post-Session Work Discovery** ✅
   Files changed in git but not in STATE.md = flagged by analysis

5. **Agent Efficiency Metrics** ✅
   Time-to-completion, completion rate per agent

### What This Does NOT Solve

1. **Why compression happened** ✗ (We can't know; Claude doesn't expose internal state)
2. **Recovery from context loss** ✗ (Flagging is earlier; recovery still manual)
3. **Preventing auto-compression** ✗ (That's a Cowork platform issue, not a file-level solution)
4. **Transcript search** ✗ (Can't access conversation history)

### ROI Analysis

**Cost:** ~2 hours setup (schema + 12-hour task) + 10 min/week maintenance
**Benefit:** Catches ~1–2 issues per sprint that would otherwise be silent (based on STATE.md audit trail showing historical context-loss escapes)

**Risk:** If the capture mechanism breaks (JSONL corruption), hard to debug. Mitigated by: (1) append-only format (hard to corrupt), (2) file-corruption detection in analysis task, (3) fallback to git log if capture fails

**Maintenance:**
- Per-session logging: ~0 (agents do it once per work item)
- 12-hour analysis: Automated via scheduled task
- Archival: Auto-prunes capture buffer; analysis reports auto-archived by Records

### Recommendation

**BUILD THIS.** It's:
- Low cost (2 hours + automated)
- High fidelity (catches real issues)
- Additive (doesn't break existing workflows)
- Backward-compatible (can start it anytime)

The main value isn't preventing issues — it's **making invisible issues visible**. The orphaned-work and post-session-work findings alone justify the setup cost.

---

## Part 8: Concrete Implementation Roadmap

### Phase 1: Schema & Logging (Session N+1)

1. Create `claude_docs/operations/session-io-capture-schema.md` (copy structure from Part 2A)
2. Create empty `claude_docs/operations/session-io-capture.jsonl`
3. Update conversation-defaults SKILL.md with Rule X (logging instructions)
4. Manual logging by agents for one session (test run, log issues)

### Phase 2: Analysis Task (Session N+2)

1. Create 12-hour scheduled task: `session-io-capture-analysis`
2. Implement analysis script (pattern detection rules from Part 3)
3. First automated analysis run (validate detections)

### Phase 3: Integration (Session N+3)

1. Integrate analysis findings into MESSAGE_BOARD (optional, for visibility)
2. Archive old analysis reports to `archive/` per file-creation-schema
3. Monitor: adjust frequency/rules based on real-world data

### Phase 4: Retrospective (Session N+4)

1. Review 2-week backlog of analysis reports
2. Identify false-positive patterns (adjust rules)
3. Measure: What issues were caught that would've been missed?

---

## Part 9: Architectural Questions Answered

| Question | Answer |
|----------|--------|
| **Can Claude access its own history?** | No — not available via API or tools. |
| **What's the fallback?** | Log work artifacts + ask agents to report I/O explicitly. |
| **Won't this add overhead?** | No — one-line JSON append per work item (negligible). |
| **How do we know if compression happened?** | Token count jumps + token budget checks in checkpoint entries. |
| **Can we replay a lost session?** | Partially — from git log + capture.jsonl + MESSAGE_BOARD. Full transcript: no. |
| **What if capture.jsonl gets corrupted?** | Detection task catches it; Records archives bad entries; can recover from git. |
| **Is this a band-aid or a fix?** | Band-aid for visibility + foundation for future compression-aware scheduling. |

---

## Part 10: Exact File Changes Required

### New Files

1. `claude_docs/operations/session-io-capture.jsonl` — Rolling capture buffer (empty at start)
2. `claude_docs/operations/session-io-capture-schema.md` — Schema reference
3. `mnt/.skills/skills/session-io-analysis/SKILL.md` — Scheduled task skill

### Modified Files

1. `mnt/.skills/skills/conversation-defaults/SKILL.md`
   Add: Rule X (I/O Capture Logging)

2. `claude_docs/CORE.md`
   Add: New section "Context Checkpoint Rule"

3. `claude_docs/operations/file-creation-schema.md`
   Add: `session-io-analysis-*.md` to allowed Tier 3 artifacts, `operations/` directory rules

### No Changes Needed

- project CLAUDE.md (this is global, not project-specific)
- STATE.md (capture.jsonl is supplementary)
- MESSAGE_BOARD.json (orthogonal data source)
- Existing scheduled tasks (capture is independent)

---

## Conclusion

A **96-hour I/O capture system is feasible and valuable** because:

1. **Claude can't access its own history** — so we capture artifacts instead (files, commits, handoffs)
2. **Practical format is JSONL** — append-only, human-readable, easy to parse
3. **12-hour analysis is automated** — patterns run on schedule, no manual work
4. **Integration is clean** — additive to existing STATE.md/MESSAGE_BOARD, no conflicts
5. **ROI is clear** — catches ~1–2 issues/sprint that are currently silent

**Next step:** Patrick decides whether to greenlight Phase 1 (schema + logging). If yes, findasale-records owns the scheduled-task skill; findasale-dev owns the analysis script logic.

---

**Prepared by:** Cowork Power User
**Review by:** [Awaiting Patrick decision]
**Status:** READY FOR IMPLEMENTATION
