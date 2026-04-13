# Rolling 96-Hour I/O Capture File — Architecture Design

**Author:** findasale-architect
**Date:** 2026-03-13 (Session 154)
**Status:** Design Complete — Ready for Patrick Decision

---

## Executive Summary

Patrick wants a **persistent I/O capture file** that records all Claude ↔ Patrick conversation I/O across sessions, updated every 12 hours via scheduled tasks, and analyzed for context loss patterns.

This architecture is **feasible but has a critical blocker:** Claude in Cowork mode has **zero programmatic access** to its own conversation history. There are no conversation logs, SQLite session files, or conversation APIs available on the VM.

**Result:** The I/O capture mechanism cannot be fully automated. It must be **hybrid: Claude writes summary entries during sessions + scheduled analysis tasks process what's written.**

This document provides a concrete design for that hybrid model, including schema, scheduled task mechanics, file integrity checks, and CLAUDE.md integration rules.

---

## Question 1: Capture Mechanism Feasibility

### The Blocker

**Can Claude in Cowork mode access its own conversation history programmatically?**

**Answer: No.** Investigation of `/sessions/gifted-zen-euler/` revealed:
- No `.conversations/` directory
- No SQLite session files
- No logs under `/sessions/gifted-zen-euler/.cache/` (only plugin MCP logs, not Claude conversation history)
- No conversation APIs available via any SDK
- Claude CLI does not expose a "fetch my conversation history" endpoint

**The VM only sees the current session's file system and tools.** Claude cannot programmatically read the conversation thread it's currently participating in.

### What IS Actually Possible

1. **Claude writes entries manually during sessions** — At wrap time (or during work), Claude writes a summary entry to the capture file with:
   - SessionId, timestamp, turn count
   - Input/output token estimate (rough)
   - List of file reads, tool calls, key decisions made
   - Files changed (cross-checked against `git status`)
   - Context weight (from `.checkpoint-manifest.json` post-compression)

2. **Scheduled analysis tasks** can:
   - Read the capture file (once entries exist)
   - Calculate rolling 96-hour window statistics
   - Detect suspicious patterns (tokens/session trending up? File reads exploding? Subagent dispatch rate increasing?)
   - Regenerate summaries if format drifts
   - Validate file integrity (all entries timestamped? No truncation?)

3. **What gets captured:**
   - **Input captured implicitly** via `filesRead`, `toolCalls`, `estimatedInputTokens` per session
   - **Output captured implicitly** via `estimatedOutputTokens`, `filesChanged`, `decisions` per session
   - **Real conversation text is NOT captured** (Claude can't read it; would need manual paste-in)
   - **Blockers/context loss incidents ARE captured** explicitly when Claude logs them at wrap

---

## Question 2: File Size Estimation

### Token Math

**Typical session:** 60–90 minutes
**Tokens per session:** 50k–100k
**Breakdown:**
- Input (user messages + file reads + tool results): ~40k–70k
- Output (Claude responses + full function calls): ~20k–35k

**Per-session capture entry (JSON):**
```json
{
  "sessionId": "154",
  "date": "2026-03-13",
  "startedAt": "2026-03-13T18:05:30Z",
  "completedAt": "2026-03-13T20:15:00Z",
  "estimatedTokens": {
    "input": 55000,
    "output": 28000,
    "total": 83000
  },
  "metrics": {
    "turns": 12,
    "filesRead": 28,
    "toolCalls": 34,
    "subagentsDispatched": 1,
    "filesChanged": 4,
    "compressions": 0,
    "contextLossIncidents": 0
  },
  "decisions": ["rolling-96hr capture design"],
  "summary": "Architecture design for I/O capture system. 7 questions answered. Design-ready; awaiting Patrick decision.",
  "blockers": [],
  "flaggedItems": []
}
```

**Per-entry size:** ~1–1.5 KB (JSON)

**Rolling 96-hour window:**
- Sessions per day: 3–5 (estimate from historical log: sessions 151–157 = 7 sessions over 2 days ≈ 3.5/day)
- 96 hours = 4 days → ~12–20 sessions
- File size: **12–30 KB** (ideal case)
- **Pathological case:** 5 sessions/day × 4 days = 20 sessions = **~25–30 KB**

**Recommendation: Keep rolling window size capped at 50 KB.** When file exceeds 50 KB, archive oldest session and regenerate the rolling window.

### Format Choice: JSONL (JSON Lines)

Each session entry is one line — easier to append, easier to parse iteratively, easier to roll over.

```
{"sessionId":"154","date":"2026-03-13",...}\n
{"sessionId":"153","date":"2026-03-12",...}\n
{"sessionId":"152","date":"2026-03-12",...}\n
```

Alternative considered: Single large JSON array with a manifest header. Rejected because appending to a single-array JSON file requires read-modify-write (risky under concurrent task runs).

---

## Question 3: Schema Design

### Main Capture File Schema (JSONL)

**File location:** `claude_docs/operations/io-capture-rolling-96h.jsonl`

**Entry schema (one per session):**

```json
{
  "sessionId": "string (e.g., '154')",
  "date": "YYYY-MM-DD",
  "startedAt": "ISO8601 timestamp",
  "completedAt": "ISO8601 timestamp or null if ongoing",
  "durationMinutes": "number",
  "estimatedTokens": {
    "input": "number (estimated from file reads + tool results)",
    "output": "number (estimated from Claude response length)",
    "total": "number (input + output)",
    "checkpointedAt": "ISO8601 when checkpoint was logged (from .checkpoint-manifest.json)"
  },
  "metrics": {
    "turns": "number of user → Claude interactions in this session",
    "filesRead": "number of Read tool calls",
    "filesWritten": "number of files modified (git status count)",
    "toolCalls": "total unique tool invocations (GitHub, Stripe, file ops, etc.)",
    "subagentsDispatched": "number of Skill() invocations to custom agents",
    "gitPushesAttempted": "number of git push operations",
    "compressions": "number of context compressions (0 if no compression)",
    "contextLossIncidents": "count of explicit context loss flagged by Claude"
  },
  "decisions": [
    "list of architectural or operational decisions made this session"
  ],
  "filesChanged": [
    "list of file paths modified (from git status + subagent handoffs)",
    "relative to repo root"
  ],
  "subagents": [
    {
      "name": "findasale-architect",
      "dispatched": true,
      "output": "brief summary of what this agent accomplished"
    }
  ],
  "summary": "human-readable 2-3 sentence summary of session objective and completion status",
  "blockers": [
    "explicit list of unresolved blockers handed to next session"
  ],
  "flaggedItems": [
    {
      "severity": "P0 | P1 | P2 | P3",
      "title": "brief title",
      "note": "explanation"
    }
  ],
  "compressionLog": "null or detailed text of [COMPRESS] event if compression occurred",
  "contextCheckpoint": "tokens used from .checkpoint-manifest.json@session end",
  "gitCommits": [
    {
      "hash": "git SHA (first 7 chars)",
      "message": "commit message",
      "filesInCommit": ["array of paths"]
    }
  ]
}
```

### Manifest Header (First Entry)

Store metadata about the rolling window itself:

```json
{
  "sessionId": "manifest",
  "createdAt": "ISO8601",
  "lastUpdated": "ISO8601",
  "windowSizeHours": 96,
  "maxEntriesBeforeArchive": 20,
  "schema": "rolling-96h-v1",
  "archiveTarget": "claude_docs/archive/io-capture-archive-YYYY-MM-DD.jsonl",
  "integrityChecksum": "CRC32 of all non-manifest lines concatenated"
}
```

---

## Question 4: Corruption Detection

### Scheduled Task: `validate-io-capture` (runs every 12 hours)

**Goal:** Verify file integrity and regenerate if corrupted.

**Algorithm:**

1. **Read the file line-by-line**
   ```bash
   IFS=$'\n' read -ra lines < <(cat /path/to/io-capture-rolling-96h.jsonl)
   ```

2. **Parse each line as JSON**
   - If any line fails JSON parse → flag as **CORRUPTION: unparseable line N**
   - If sessionId missing or non-unique → **CORRUPTION: missing/duplicate sessionId**
   - If timestamp not ISO8601 or out of order (newer entries above older) → **CORRUPTION: timestamp order**

3. **Validate timestamp window**
   - Extract `startedAt` from all entries (skip manifest)
   - Calculate time delta between oldest and newest
   - If delta > 96 hours + 1 day buffer → **STALE: window has decayed, oldest entries should be archived**

4. **Cross-check against `.checkpoint-manifest.json`**
   - For each sessionId in io-capture, verify it exists in checkpoint-manifest's sessionHistory or currentSession
   - If sessionId in capture file but not in manifest → **WARNING: orphaned session entry** (may indicate logs written before manifest update)

5. **Integrity checksum (CRC32)**
   - Recalculate CRC32 of all non-manifest entries concatenated
   - Compare to stored checksum in manifest
   - If mismatch → **CORRUPTION: checksum failed** (file was manually edited or truncated)

6. **If corruption detected:**
   - Archive the corrupted file to `claude_docs/archive/io-capture-corrupted-TIMESTAMP.jsonl`
   - Write an escalation entry to `escalation-log.md`:
     ```
     ## CORRUPTION DETECTED — io-capture-rolling-96h.jsonl

     **Timestamp:** 2026-03-13T18:30:00Z (task: validate-io-capture)
     **Failure mode:** Line 5 unparseable JSON
     **Action taken:** Archived corrupted file to `archive/io-capture-corrupted-20260313T183000Z.jsonl`
     **Recovery:** Regenerate file from `.checkpoint-manifest.json` sessionHistory

     Patrick action: Review archive/io-capture-corrupted-*.jsonl and decide whether to investigate root cause.
     ```

### Failure Modes

| Mode | Root Cause | Detection | Recovery |
|------|-----------|-----------|----------|
| Truncation | Disk full / OS crash | File ends mid-JSON | Restore from backup; if none, rebuild from manifest |
| Unparseable line | Manual edit gone wrong | `jq` fails on line N | Delete corrupted line; if >1 line, archive entire file |
| Duplicate sessionId | Claude wrote twice to same session | `jq '.sessionId' \| sort \| uniq -d` | Archive newer duplicate; keep older |
| Out-of-order timestamps | Lines appended in wrong order | Timestamp[N] > Timestamp[N+1] | Re-sort file by startedAt; regenerate checksums |
| Checksum mismatch | File edited outside task | CRC32(entries) ≠ stored | Flag as manual edit; escalate to Patrick |
| Window decay (>96h old) | No capture entries written in 96h | `NOW - oldest_startedAt > 96h` | Archive oldest sessions; trim file |

---

## Question 5: Scheduled Task Mechanics

### Task 1: `write-io-capture-session` (triggered at wrap time, manually by Claude)

**When:** Claude calls this at the end of every session wrap (like it updates STATE.md)

**What it does:**
1. Appends a new JSONL entry to `io-capture-rolling-96h.jsonl`
2. Entry includes all metrics gathered during the session (from checkpoint-manifest, git status, session notes)
3. Recalculates CRC32 checksum of all entries and updates manifest header

**Who writes:** Claude (during wrap)

**Command:** (Claude uses Read → Write pattern; no separate task invocation needed)

```bash
# Pseudo-code for what Claude does at wrap
cat >> /path/to/io-capture-rolling-96h.jsonl << EOF
{
  "sessionId": "154",
  "date": "2026-03-13",
  ...
}
EOF
```

### Task 2: `validate-io-capture` (scheduled every 12 hours)

**When:** 12-hour intervals (e.g., 6:00 AM and 6:00 PM local time)

**What it does:**
1. Reads `io-capture-rolling-96h.jsonl`
2. Runs corruption detection algorithm (Question 4)
3. If file is valid:
   - Calculate rolling 96-hour statistics (token trends, compression events, context loss incidents)
   - Append one-line summary to `claude_docs/operations/io-capture-analysis.log`:
     ```
     2026-03-13T18:30:00Z — VALID — 12 sessions in window — avg 75k tokens/session — 0 compressions — 0 context losses
     ```
4. If window exceeded 50 KB, archive oldest session (invoke Records agent if needed)
5. If corruption detected, escalate (see Question 4)

**Who runs:** Scheduled task (Node.js script or bash wrapper)

**Script location:** `scripts/validate-io-capture.js` or `.scripts/validate-io-capture.sh`

---

## Question 6: Where Does This File Live?

**Location:** `claude_docs/operations/io-capture-rolling-96h.jsonl`

**Rationale:**
- Lives in `operations/` (per file-creation-schema.md — "Process docs, protocols, tools, JSON configs")
- Not in root `claude_docs/` (would violate Tier 1/1.5 rules)
- Not gitignored (it's session data, but it's useful to commit it periodically so Patrick can review trends across multiple machines/sessions)
- **Accompanying files:**
  - `claude_docs/operations/io-capture-analysis.log` — timestamped validation results (append-only; archived monthly by Records)
  - `.checkpoint-manifest.json` — already exists; acts as the source of truth for session metadata

**Should it be in git?**
- **Yes, but sparingly:** Commit it with the wrap (let Patrick run `.\push.ps1`). It's not sensitive data. Over time it'll be useful to see trends across weeks.
- **Alternative:** gitignore it and rely on `.checkpoint-manifest.json` as the backup source of truth (simpler, but loses the detailed I/O records).
- **Recommendation:** Don't gitignore. It's valuable history. Just periodically archive old sessions (Records job).

---

## Question 7: CLAUDE.md Enforcement

### New Rule for Root CLAUDE.md

Add to `/sessions/gifted-zen-euler/mnt/FindaSale/CLAUDE.md` (Project Execution Contract):

```markdown
---

## 9. I/O Capture Integration (Rolling 96-Hour Window)

Every session wrap must include a call to write an I/O capture entry.

**What Claude writes:**
- Session ID, date, start/end time, duration
- Token estimates (from `.checkpoint-manifest.json` post-wrap)
- Metrics: turns, files read, tool calls, subagents dispatched, files changed, compressions
- Decisions made, blockers identified, context loss incidents (if any)
- Files changed (cross-check against `git status`)
- Summary line (2–3 sentences)

**How to write:**
1. Before final wrap, populate all metrics
2. Append JSONL entry to `claude_docs/operations/io-capture-rolling-96h.jsonl`
3. Update checksum in manifest header
4. Announce to Patrick: "I/O capture written; ready for git push"

**Template for minimal entry (if session is short):**

```json
{"sessionId":"154","date":"2026-03-13","startedAt":"2026-03-13T18:05:30Z","completedAt":"2026-03-13T20:15:00Z","durationMinutes":129,"estimatedTokens":{"input":55000,"output":28000,"total":83000},"metrics":{"turns":12,"filesRead":28,"toolCalls":34,"subagentsDispatched":1,"filesChanged":4,"compressions":0,"contextLossIncidents":0},"decisions":["rolling-96hr capture design"],"filesChanged":["claude_docs/operations/rolling-96-hour-io-capture-architecture.md"],"summary":"Architecture design for I/O capture system. Feasibility analysis complete; hybrid model (manual Claude writes + scheduled analysis) recommended. Design-ready; awaiting Patrick decision.","blockers":[],"flaggedItems":[]}
```

**Failure mode:** If Claude cannot write the entry (e.g., file permissions, corruption), escalate to Patrick with explicit file path and error message.
```

---

## Integration with Existing Infrastructure

### Checkpoints + I/O Capture

The `.checkpoint-manifest.json` already stores session-level token counts. I/O capture **extends** this with:
- Per-session file reads, tool calls, subagent counts
- Explicit decision log + blocker tracking
- Rolling window (manifest stores all-time history; io-capture stores 96h window only)

**Relationship:**
- **Manifest:** Source of truth for all-time session history, token checkpoints, compression events
- **I/O capture:** Operational view for recent sessions (last 96 hours) + high-level trends

### Message Board Integration

Any context loss incident discovered during a session should be logged to MESSAGE_BOARD.json with a flag like:

```json
{
  "id": "msg-154-context-loss-flag",
  "from": "findasale-architect",
  "to": "patrick",
  "timestamp": "2026-03-13T18:30:00Z",
  "type": "flag",
  "message": "CONTEXT LOSS DETECTED — compression at turn 35 dropped 12 files from context. Recovered from session-log.md and resumed cleanly. I/O capture logged incident."
}
```

Then that incident gets picked up by the 12-hour validation task and tracked in io-capture-analysis.log.

---

## Implementation Plan (Not Execution — Architect Design Only)

### Phase 1: File Setup (1 turn)
1. Create `claude_docs/operations/io-capture-rolling-96h.jsonl` with manifest header
2. Backfill 1 entry from latest session (153) as proof of concept
3. Create `claude_docs/operations/io-capture-analysis.log` (empty, header comment only)

### Phase 2: Claude Integration (next 3 sessions)
1. Update root CLAUDE.md with Rule 9 (I/O capture)
2. **Session 155 wrap:** First live write to io-capture (from this session's metrics)
3. Validate entry format, checksum calculation, append behavior

### Phase 3: Scheduled Task Setup (Week of 2026-03-17)
1. Create `scripts/validate-io-capture.js`
2. Add scheduled task via `create_scheduled_task` (every 12 hours: 6am + 6pm local)
3. Monitor first 3 runs for false positives

### Phase 4: Ongoing (After Phase 3 ships)
- Claude writes entry every session (automatic, part of wrap)
- Task validates every 12 hours (automatic)
- Records archives old sessions when window exceeds 50 KB (monthly or as-needed)

---

## Blockers & Open Questions

### Resolved Blockers
- ✅ **Can Claude access its own conversation history?** No, but hybrid model works.
- ✅ **What format minimizes file size?** JSONL + rolling window (50 KB cap).
- ✅ **Where to store the file?** `claude_docs/operations/` (existing tier).

### Remaining Questions (For Patrick)

1. **Should I/O capture be committed to git?** (Recommendation: yes, but archive old sessions monthly)
2. **Who runs the scheduled validation task?** (Recommendation: scheduled-tasks MCP, 12-hour interval)
3. **Do we need detailed conversation text, or is metrics enough?** (This design assumes metrics-only; if you want transcript summaries, requires manual Claude logs during session)
4. **What's the escalation path if validation fails?** (Recommendation: append to escalation-log.md, Patrick reviews at next wrap)

---

## Summary: Why This Design Works

| Aspect | Why It Works |
|--------|-------------|
| **Feasibility** | No programmatic conversation API exists; hybrid model is the only viable path. |
| **Size** | 12–20 sessions per 96h ≈ 25–30 KB; well under any storage/performance concern. |
| **Schema** | JSONL format is append-friendly and easy to validate line-by-line. |
| **Integrity** | CRC32 checksum detects corruption; timestamp validation catches out-of-order writes. |
| **Automation** | 12-hour validation task is lightweight and detects decay/corruption early. |
| **Integration** | Fits into existing CORE.md wrap protocol; adds minimal overhead (<1 turn per session). |
| **Enforcement** | One new CLAUDE.md rule makes it part of the session contract. |

---

## Next Steps

**For Patrick:**

1. **Review this design.** Any changes before implementation?
2. **Decide on git commit strategy.** (Include in pushes? Ignore? Monthly archive?)
3. **Approve Phase 1 file creation.** (Manifest + backfill from session 153 data)
4. **If approved, dispatch findasale-records to set up Phase 1.**

**For findasale-architect (if approved):**
- Write ADR capturing this design as a locked decision in STACK.md
- Update next-session-prompt.md with Phase 1 handoff for next dispatcher

---

**Status:** Architecture design complete. Awaiting Patrick go/no-go.
