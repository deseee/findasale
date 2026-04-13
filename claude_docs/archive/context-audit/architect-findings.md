# Architect Audit: Token Checkpoint / Context Loss Problem

**Audit date:** 2026-03-09
**Scope:** Persistent checkpoint storage, compression prediction, architectural cleanest solution
**Author:** Systems Architect
**Status:** Actionable recommendations

---

## Problem Summary

Checkpoints logged in conversation text disappear when context compresses mid-session. New sessions start without proper init, losing cross-session continuity. Current system logs checkpoints as inline markdown `[CHECKPOINT — Turn N]` in session-log.md, but these are erased during compressions and useless for session init.

---

## Finding 1: JSON Persistence Schema — YES, Viable

### Design: Persistent Checkpoint Manifest

Create a **single authoritative JSON file** at monorepo root:

```json
{
  "version": "1.0",
  "lastUpdated": "2026-03-09T20:30:00Z",
  "currentSession": {
    "sessionId": "118",
    "startTime": "2026-03-09T19:00:00Z",
    "estimatedTokenBudget": 195000,
    "checkpoints": [
      {
        "turn": 5,
        "timestamp": "2026-03-09T19:15:00Z",
        "filesRead": 8,
        "estimatedTokens": 1200,
        "toolCalls": [
          {"type": "github_api", "count": 2, "estimatedTokens": 1000},
          {"type": "grep", "count": 3, "estimatedTokens": 150}
        ],
        "sessionTotalEstimate": 8500,
        "sessionTotalPercent": 4.4,
        "status": "ok"
      },
      {
        "turn": 12,
        "timestamp": "2026-03-09T19:45:00Z",
        "filesRead": 5,
        "estimatedTokens": 800,
        "subagentDispatches": [
          {"type": "general-purpose", "count": 2, "estimatedTokens": 10000}
        ],
        "sessionTotalEstimate": 32500,
        "sessionTotalPercent": 16.7,
        "warningLevel": "none"
      }
    ],
    "compressionEvents": []
  },
  "sessionHistory": [
    {
      "sessionId": "117",
      "startTime": "2026-03-09T18:00:00Z",
      "endTime": "2026-03-09T18:45:00Z",
      "finalTokenBurn": 30000,
      "checkpointCount": 0,
      "compressionCount": 0,
      "status": "completed"
    }
  ]
}
```

### File Location

**Path:** `/sessions/epic-awesome-hawking/mnt/FindaSale/.checkpoint-manifest.json` (hidden, monorepo root)

**Rationale:**
- Root level = visible to all subagents and init logic
- Hidden prefix `.checkpoint-` = doesn't clutter git-tracked docs
- Single source of truth = no sync/merge issues

### Write Cadence

**When to write:**
1. **Session init** (before any work) — create new `currentSession` block with `sessionId`, `startTime`, estimated budget
2. **After every checkpoint** (5, 12, 25, wrap turns) — append to `checkpoints[]`
3. **Compression detected** — log to `compressionEvents[]`: `{turn, before_tokens, after_tokens, context_lost}`
4. **Session end/wrap** — archive `currentSession` to `sessionHistory[]`, clear `currentSession`

**Cost:** 1–3 file writes per session (~20 tokens per write). Total overhead ~60–100 tokens per session.

### Schema Validation

```typescript
// Type stub for validation
interface CheckpointManifest {
  version: "1.0";
  lastUpdated: ISO8601;
  currentSession: CurrentSession | null;
  sessionHistory: ArchivedSession[];
}

interface CurrentSession {
  sessionId: string;
  startTime: ISO8601;
  estimatedTokenBudget: number;
  checkpoints: Checkpoint[];
  compressionEvents: CompressionEvent[];
}

interface Checkpoint {
  turn: number;
  timestamp: ISO8601;
  filesRead: number;
  estimatedTokens: number;
  toolCalls?: ToolCall[];
  subagentDispatches?: SubagentDispatch[];
  sessionTotalEstimate: number;
  sessionTotalPercent: number;
  warningLevel: "none" | "approaching_85" | "critical_95";
}

interface CompressionEvent {
  turn: number;
  timestamp: ISO8601;
  tokensBefore: number;
  tokensAfter: number;
  contextLost: string[]; // e.g., ["checkpoint_logs", "early_file_reads", ...]
}

interface ArchivedSession {
  sessionId: string;
  startTime: ISO8601;
  endTime: ISO8601;
  finalTokenBurn: number;
  checkpointCount: number;
  compressionCount: number;
  status: "completed" | "interrupted" | "failed";
}
```

### Failure Modes & Mitigations

| Failure Mode | Mitigation |
|---|---|
| **File write loses network sync** | Not an issue — file is local only, no network dependency. Survives SSH resets, session reconnects, context compressions. |
| **JSON grows unbounded** | Keep `sessionHistory` to last 50 sessions max. Archive older entries to `session-history-archive.json` after 100 sessions. |
| **Concurrent write collisions** | Rare (single-threaded Claude). If subagents both write, last-write-wins is acceptable (checkpoint data is non-critical). Add `lastUpdated` timestamp to detect stale reads. |
| **Malformed JSON blocks reading** | Add git pre-hook to validate JSON syntax. If invalid, session init falls back to CORE.md defaults. |
| **Patrick manually deletes file** | Session init checks existence; if missing, creates new manifest with empty history. Non-destructive. |

---

## Finding 2: Compression Prediction — Limited but Useful Signals

### What Claude CAN Sense

**Turn count** (most reliable):
- Sessions >50 turns → compression likely by turn 60
- Sessions >100 turns → compression likely by turn 100 (diminishing returns)
- **Signal:** At turn 48, log checkpoint + alert: "Approaching compression risk (>50 turns). Plan wrap at turn 55."

**File read volume** (proxy for token burn):
- Each file read = ~15 tokens per 100 lines
- If cumulative `filesRead > 200 files` across session → likely 20k+ tokens burned
- **Signal:** After checkpoint, sum cumulative file reads. If >150, assume 15k tokens burned.

**Tool call velocity** (GitHub API, Grep):
- GitHub API calls → ~2k tokens minimum per call
- If `toolCalls.github > 5` → likely 10k+ tokens burned
- **Signal:** Track `github_calls` in checkpoint. If >4, warn: "5+ GitHub calls detected. Burn rate elevated."

**Subagent dispatch count** (most expensive):
- Each subagent = 5k–15k tokens baseline
- 3+ parallel subagents → risk of 20k+ tokens per dispatch
- **Signal:** Before dispatching >2 agents, check remaining budget estimate.

### What Claude CANNOT Sense

- **Actual token count per message** — no API exposure in Cowork
- **System prompt growth** — grows each turn, invisible to Claude
- **Compression timing** — no advance warning signal available
- **Exact token cost of upcoming tool calls** — unpredictable (GitHub API size varies wildly)

### Predictive Decision Tree

```
At every checkpoint:
  If turn >= 50:
    Warn "Compression risk zone (>50 turns)"
  If cumulative filesRead > 150:
    Estimate burn ~15k tokens
  If cumulative github_calls > 4:
    Estimate burn elevated (+5k tokens)
  If subagentDispatches > 2 (parallel):
    Estimate burn 20k+ tokens per batch
  If estimatedTotal > 150k:
    Recommend WRAP at next natural break
  If estimatedTotal > 170k:
    MUST WRAP immediately (>85% threshold)
```

### Practical Rule

**At turn 45 (for sessions <50 turns):** Log final checkpoint before risk zone.
**At turn 50+ (any session):** After every checkpoint, recalculate burn. If estimated > 150k, stop new tasks and plan wrap.
**At turn 25+ (if 2+ subagent batches dispatched):** Conservative mode — max 1 subagent per batch.

---

## Finding 3: Architectural Cleanest Solution

### Recommended Implementation: Tiered Checkpoint System

#### Layer 1: Persistent JSON (Checkpoint Manifest)
- **Purpose:** Survive compressions, enable cross-session continuity
- **Owner:** Every session writes checkpoint-manifest.json at start/end
- **Init responsibility:** Cowork init logic reads manifest, logs session continuity in next-session-prompt

#### Layer 2: Conversation Checkpoints (Existing)
- **Purpose:** Readable human audit trail within session
- **Owner:** Claude logs `[CHECKPOINT — Turn N]` inline + to manifest
- **Benefit:** Session-scoped context (visible to Patrick), not erased by compression
- **Cost:** Zero (already implemented)

#### Layer 3: Compression Detection Hook (New)
- **Purpose:** Log compressions immediately when detected
- **Trigger:** If Claude notices context reset (turn count unchanged, no new messages in history)
- **Action:** Append to `compressionEvents[]` in manifest

#### Layer 4: Session Init Briefing (Refresh)
- **Purpose:** Load manifest, brief Patrick on budget + prior compression events
- **Owner:** conversation-defaults skill (already exists)
- **Update:** Add manifest-read step to CORE.md §2 Session Init

### Why This Works

1. **Non-invasive** — no changes to existing conversation flow. Just adds file write at checkpoints.
2. **Zero API dependency** — pure local file I/O, survives session reconnects.
3. **Survives compressions** — manifest written to disk before compression can erase it.
4. **Cross-session continuity** — next session reads manifest, resumes knowledge of prior burn rates.
5. **Human-readable** — JSON is queryable; Patrick can inspect `.checkpoint-manifest.json` to understand session patterns.
6. **Fail-safe** — if manifest is corrupted or missing, session init defaults to CORE.md budget (no blocking error).

### Implementation Checklist

- [ ] **Create `.checkpoint-manifest.json` template** (commit to repo root, .gitignore it)
- [ ] **Add manifest write to Claude checkpoint logic:**
  - At session init: create `currentSession` block
  - After each checkpoint: append to `checkpoints[]`
  - At session wrap: archive to `sessionHistory[]`
- [ ] **Update CORE.md §2 Session Init:** add step "Read .checkpoint-manifest.json, log session continuity"
- [ ] **Update conversation-defaults skill:** prepend "Manifest loaded — prior session: Xk tokens, N compressions"
- [ ] **Add compression detection to CORE.md §3:** if context reset detected, log `compressionEvent` immediately
- [ ] **Document in token-checkpoint-guide.md:** when/how to write manifest, schema, recovery steps

### Why Not Alternatives?

| Alternative | Why Not |
|---|---|
| **In-conversation JSON blocks** | Erased by compression. Defeated the purpose. |
| **Database table (Postgres)** | Over-engineering for MVP. Requires DB migration, connection in Cowork env (risky). |
| **Separate persistent storage (external API)** | Adds network latency, auth complexity, cost. Violates "no external APIs" for Cowork tooling. |
| **Git commits at every checkpoint** | Too expensive (5–10 tokens per commit setup). Pollutes git history. |
| **Encrypted session state in cookies** | Cookies erased on session end. Doesn't solve cross-session problem. |

---

## Deployment Path

### Phase 1 (This Session)
1. Commit `.checkpoint-manifest.json` template to repo root
2. Update token-checkpoint-guide.md with schema + write cadence
3. Update CORE.md §2: add manifest read to session init

### Phase 2 (Next Session)
1. Implement checkpoint write logic in Claude workflow (before every checkpoint, write manifest)
2. Update conversation-defaults skill with manifest-read briefing
3. Log all checkpoints to manifest for 3–5 sessions (validation run)

### Phase 3 (Session +5)
1. Analyze manifest patterns — are compressions predictable?
2. Refine burn-rate prediction rules if data shows patterns
3. Document lessons learned in RECOVERY.md

---

## Summary

**Question 1: Can JSON files solve compression problem?**
Yes. Persistent `.checkpoint-manifest.json` at repo root survives compressions, enables cross-session continuity. Schema defined above. Write cadence: at session init + after every checkpoint + at wrap. Failure modes all mitigated.

**Question 2: How to predict compressions?**
Partially. Turn count, file read volume, GitHub API calls, and subagent count are measurable signals. No API for true prediction, but decision tree above triggers wrap planning at turn 50+ or 150k+ tokens. Compression detection must be manual (Claude notices context reset).

**Question 3: Cleanest architectural solution?**
Tiered approach: (1) Persistent JSON manifest, (2) in-conversation checkpoints, (3) compression detection hook, (4) session init briefing refresh. Non-invasive, zero external APIs, survives compressions, cross-session continuity intact. Implementation overhead ~100 tokens per session.

---

**Status:** READY TO IMPLEMENT. No blockers. Recommend Phase 1 this session, Phase 2 next.
