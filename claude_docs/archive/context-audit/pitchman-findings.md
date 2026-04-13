# Context Loss Mitigation — Blue-Sky Pitches

**Date:** 2026-03-09 | **Context Window:** ~200k tokens | **Problem:** Mid-session compression wipes checkpoints; no cross-session memory.

---

## 1. JSON Flight Recorder (Zero-Overhead Logging)

**Pitch:** Write a minimal event log every tool call + every 5 turns. Capture only:
- Turn count
- Active tool names (no args)
- Tokens estimated (from file reads: `file_size / 4`)
- Current working context (breadcrumb: "In frontend/Button refactor, last file read: Button.tsx")
- File roster (what's been read/written this session)

**Schema (≈100 bytes per entry):**
```json
{
  "turn": 42,
  "timestamp": "2026-03-09T14:23:45Z",
  "tools_used": ["mcp__github__get_file_contents"],
  "estimated_tokens": 3400,
  "breadcrumb": "Refactoring Button → Checkbox integration",
  "files_touched": ["frontend/Button.tsx", "shared/types.ts"],
  "compression_signal": false
}
```

**Zero-overhead trick:** Append-only file, no parsing overhead. Structured so `next-session-prompt.md` can `cat` and summarize in 2 seconds.

**Effort:** Low | **Wow Factor:** 6/10

---

## 2. Compression Predictor — Trigger Early Dumps

**Pitch:** Watch for trigger patterns:
- Turn depth > 30 (historical: compression hits ~35-40)
- Token estimate > 120k (check flight recorder)
- File read count > 20 (indicates deep exploration)
- Tool call backlog > 8 active in last 3 turns (multi-branch exploration)

When ANY trigger fires → **auto-dump to STATE.md.compressed**:
```
## Session Checkpoint [Turn 28]
- Active task: "Refactor database migrations"
- Files read: 12 total (migration runner, Prisma schema, 10 samples)
- Last tool: mcp__github__get_file_contents (migrations/001_init.sql)
- Decision tree: Explored 3 migration patterns; settled on approach X
- Next steps: Implement pattern X, test harness, docs
```

**Reality check:** Claude can't self-trigger file writes mid-compression. But it CAN announce "WARNING: Context at 85% — recommend saving now" and Patrick can hit a button.

**Effort:** Med | **Wow Factor:** 7/10

---

## 3. Session Heartbeat — Scheduled Checkpoint Task

**Pitch:** Patrick enables a 15-minute recurring task (via `create_scheduled_task`):
```
task: "findasale-context-checkpoint"
schedule: "*/15 * * * *"
prompt: "Write current session state to /mnt/FindaSale/.session-heartbeat. Include: turn count, last 3 tool calls, estimated tokens, active files, current objective."
```

**Benefit:** Survives session crash. If Claude goes silent or context resets, Patrick sees last checkpoint and can inject it as context in next message.

**Constraint:** Scheduled tasks run in *isolation* — they can't introspect the active chat. So heartbeat is "best guess" from file state + git log. But it's better than zero.

**Effort:** Low | **Wow Factor:** 5/10

---

## 4. Structured Session Handoff via next-session-prompt.md

**Pitch:** Include a machine-readable JSON preamble:
```markdown
<!-- SESSION_STATE -->
{
  "session_id": "epic-awesome-hawking-2026-03-09",
  "last_turn": 67,
  "last_task": "Implement rate limiter in backend/middleware",
  "files_modified": ["src/middleware/rateLimiter.ts", "src/types/index.ts"],
  "estimated_tokens_used": 145000,
  "context_loss_detected": true,
  "recovery_action": "reload CLAUDE.md + STATE.md, then:",
  "next_immediate_steps": [
    "Read rateLimiter.ts to resume implementation",
    "Test middleware in /test/middleware.test.ts",
    "Push via mcp__github__push_files (≤3 files)"
  ]
}
<!-- /SESSION_STATE -->

# Session Handoff — [Task Name]
[Human-readable summary follows]
```

Claude reads the JSON block first, restores context type in 2 seconds, re-anchors to the task. No manual annotation needed.

**Effort:** Low | **Wow Factor:** 8/10

---

## 5. Radically Left-Field: Token Budget Registry

**Pitch:** What if *each session* started with a pre-allocated "carbon budget" file that tracks spend in real-time?

```json
{
  "session_start_budget": 200000,
  "hard_limit": 180000,
  "soft_warning": 160000,
  "spend_log": [
    { "turn": 1, "delta": 8000, "cumulative": 8000 },
    { "turn": 5, "delta": 15000, "cumulative": 23000 }
  ],
  "projection": "At current burn rate, compression at turn 44"
}
```

**Crazy part:** Claude *ignores* the budget but *sees* it. When Patrick reads the projection, he can say: "You have ~12 turns before compression; wrap up now or I'll file-dump before then."

Turns the invisible cliff into a *negotiated boundary*.

**Effort:** Med | **Wow Factor:** 9/10

---

## 6. "Suspension Pods" — Micro-Archive Pattern

**Pitch:** When a deep exploration starts (e.g., "audit all backend files"), pre-emptively save a tar/zip:
```
.session-suspensions/
  - exploration-2026-03-09-14-30-audit-backend.zip
    └─ Contains: all files read, tool outputs, decision log
```

If compression hits, Patrick can say: "Load suspension pod audit-backend" and Claude unzips into a fresh work folder and resumes.

**Reality:** Still manual, but compression becomes *pausing* not *erasure*. Next session just continues.

**Effort:** High | **Wow Factor:** 8/10

---

## Recommendation

**Start with #4 (Structured Handoff) + #2 (Compression Predictor).**

They're low-friction, save Patrick effort, and turn context loss from binary (happens/doesn't) into *managed* (warns + recovers). Pair with flight recorder (#1) as the telemetry backbone.

#5 (Budget Registry) is the wildest idea but requires culture shift (Patrick doing *active coaching* on token spend). Worth piloting in a future sprint.

