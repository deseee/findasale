# ADR — Manager Subagent Pattern — 2026-03-15

## Decision

**FEASIBLE, BUT WITH HARD CONSTRAINTS.**

Implement a **lightweight coordinator skill** (not a full subagent) that specializes in MCP push orchestration only. Do NOT attempt to make it a general-purpose manager subagent with full agent autonomy. The Cowork architecture does not yet support nested agent spawning (skills cannot spawn other skills programmatically), so a "manager subagent" pattern is **not architecturally possible today**.

**Recommended pattern:** Create a `findasale-push-coordinator` skill that:
- Accepts a structured handoff from the main session with file manifests
- Validates file integrity using size-comparison checks (CORE.md §4 truncation gate)
- Executes MCP push batches (≤3 files per call per CORE.md §4)
- Maintains a running local manifest of pushed state
- Returns a summary to main context with file tracking

This shifts MCP orchestration burden from the main context to a bounded skill, keeping the main context lean for Patrick interaction without requiring full subagent autonomy that Cowork doesn't yet support.

---

## Current State Analysis

### Why the System Breaks

The main context window is currently responsible for:
1. **Orchestrating all subagent dispatches** (via `Skill()` tool)
2. **Managing all MCP pushes** (reading files, batching, calling `push_files`)
3. **Tracking file state** (local vs. remote versions)
4. **Validating subagent output** (size checks, truncation detection)
5. **Processing subagent returns** (reading MESSAGE_BOARD.json, checking for escalations)

This creates a "load vector" where heavy subagent activity bloats the main context → triggers auto-compaction → loses critical rulesets (CORE.md push rules, escalation protocol, handoff format) → cycles repeat.

**Session 166–167 evidence:**
- Session 166: MCP push of schema.prisma was **truncated** (418 lines → 89 lines). Build failed on Railway.
- Session 167: itemController.ts also truncated (939 lines → partial). Full recovery required context overhead.
- Both incidents caused by context bloat forcing partial file reads before pushing.

### The Token Pressure Loop

```
Main context: dispatch agent (5–25k tokens) → process output (2–5k) →
  validate file (2–3k) → batch push (2–5k) → repeat

After 3 agents: 30–90k tokens in main context alone.
Auto-compress triggered at ~170k (85% budget).
Compression erases CORE.md §4 push rules, escalation handlers.
Next turn: context reload (8–10k) + re-read CORE.md (2k) + rebuild state (3–5k).
Efficiency loss: 13–17k tokens of pure overhead per compression.
```

---

## Proposed Architecture

### Layer 1: Main Context (Stays Lean)

**Responsibility:** Patrick interaction, strategic dispatch, final reporting.

**What stays:**
- Load CORE.md, STATE.md, context.md at init
- Dispatch findasale-* agents
- Read MESSAGE_BOARD.json
- Surface escalations (`## Patrick Direct`)
- Report final status to Patrick

**What leaves:**
- File manifest tracking
- MCP push sequencing
- Size validation
- Output processing (except escalations)

### Layer 2: findasale-push-coordinator Skill (New)

**Responsibility:** MCP orchestration only.

**Input (handoff from main):**
```markdown
## Handoff: Main → push-coordinator
Target files to push:
- packages/backend/src/index.ts (lines 1–150, ~3k tokens)
- packages/frontend/pages/sales/[id].tsx (lines 200–300, ~2k tokens)
- packages/database/migrations/20260315000001_schema.sql (~1k tokens)

Validation rules:
- Truncation gate: [filename]@current remote line count
- Commit message: "Feature #24 — hold duration UI" (provided by main)

Constraints:
- Max 3 files per batch
- Max 25k total tokens
- Do not merge or edit — push exactly as provided
```

**Output (coordinator → main):**
```markdown
## Push Summary
Completed: 1 batch
Files pushed: 3 (index.ts, sales.tsx, migration)
Commits: 1 (SHA: 7a4f8c9)
Remote state: synced
Errors: none

Local manifest updated (coordinator context):
- Remote: branch=main, last-commit=7a4f8c9
- Files tracked: [list with SHA]
```

**Key constraints:**
- Only reads files for size validation; main context provides full content
- Cannot spawn other agents (Cowork limitation)
- Dies at end of skill invocation; manifest is rebuild on next dispatch
- NO file editing, NO business logic, NO branching decisions

### Layer 3: Worker Agents (Dev/QA/Architect)

**No change to existing behavior.** They continue to:
- Read/write code and docs
- Return structured output (no MCP pushes)
- Include `## Handoff` blocks when work is done

Main context passes their output to push-coordinator for validation before pushing.

---

## Token Budget Analysis

### Current State (Sessions 164–168, 3 agents per session average)

```
Session: 200k context window, ~195k available

Init overhead:           8–10k
Agent dispatch (3 agents × avg 13k): 39k
Output processing:      8–10k
MCP push (3 batches × 3–5k): 12–15k
Context compaction:     (estimated 5–8k per 1 compression event)
Session without compression: ~75–80k
If 1 compression occurs: +13–17k overhead

Efficiency: 75–95% of budget used per session
Compression event: 1 per 2 sessions (Sessions 164–168 pattern)
```

### Proposed State (with push-coordinator)

```
Session: 200k context window, ~195k available

Init overhead:            8–10k
Agent dispatch (3 agents × 13k): 39k
Output processing (main only): 4–6k
Dispatch push-coordinator: 5–8k
  - Coordinator validates, pushes, returns summary
  - Coordinator context ≤30k (isolated)
Session in main context: ~60–75k
No compression needed: saves 13–17k

Efficiency: 35–45% of main context used per session
Coordinator context: 20–30k (separate allocation, isolated)
Compression event: ~1 per 8 sessions (estimated)
```

### Token Savings Estimate

**Per session without compression:**
- Current: 75–80k main context
- Proposed: 60–75k main context
- Savings: ~10–15% in main (modest)

**Per compression-avoiding session:**
- Compression overhead avoided: ~13–17k
- Sessions between compressions: 2 → 8 (4× improvement)
- **Long-term: 50k+ saved per 8-session cycle**

**Net calculation:**
- Proposed adds ~5–8k (coordinator dispatch per session)
- But prevents 1 compression per 8 sessions (~13–17k)
- **Net savings: ~5–12k per 8-session cycle (1–2k per session on average)**
- **Plus:** Main context now stable for escalation/handoff protocol enforcement (priceless for reliability)

---

## Implementation Plan

### Phase 1: Create findasale-push-coordinator Skill

**File:** `/sessions/pensive-quirky-brahmagupta/mnt/.skills/skills/findasale-push-coordinator/SKILL.md`

**Structure (condensed example):**

```yaml
---
version: 1
name: findasale-push-coordinator
description: >
  MCP push orchestration specialist. Receives file manifests from main context,
  validates integrity using truncation gates, executes batched MCP pushes
  (max 3 files per call, max 25k tokens), and returns push summary.
  Invoked when main context has completed subagent work and needs to push
  to GitHub. Do NOT invoke for anything other than file push coordination.
---

# findasale-push-coordinator

You are the MCP Push Coordinator for FindA.Sale.

## Responsibility

Validate and execute file pushes via MCP GitHub API. Main context provides:
1. List of files to push (with content and line counts)
2. Remote file line counts (from prior get_file_contents call in main)
3. Commit message and branch

Your job:
1. Verify no file is >20% shorter than remote (truncation gate, CORE.md §4)
2. Batch files (max 3 per push_files call)
3. Execute MCP pushes
4. Return summary with file SHA, commit hash, errors

## Constraints

- Never edit files — push exactly as received
- Never make architecture or business logic decisions
- Max 3 files per mcp__github__push_files call
- Max 25k tokens total per skill invocation
- Treat truncation gates as HARD STOPS — escalate truncation risk to main context instead of pushing

## Input Format

Main context sends via handoff block (CORE.md §7):

```
## Handoff: Main Context → push-coordinator

Files to push:
[
  {
    "path": "packages/backend/src/index.ts",
    "content": "[full file content]",
    "currentLineCount": 150,
    "remoteLineCount": 150,
    "status": "modified"
  },
  ...
]

Commit message: "Feature #24 — hold duration config"
Branch: "main"
```

## Output Format

Return structured summary:

```
## Push Coordinator Summary

Validation:
- Files checked: 3
- Truncation risks: 0
- Size OK: 3

Batches executed:
1. Batch 1: 3 files → mcp__github__push_files
   - Result: Success (commit abc123)

Summary:
- Total files pushed: 3
- Total commits: 1
- Errors: none
- Remote state: synced (branch=main, SHA=abc123)

[List of pushed files with final SHA]
```

## Rules

- Read CORE.md §4 before each batch — truncation gate is mandatory
- Log all truncation gate results (even passes) for audit trail
- If any file would truncate, STOP that file and mark it "ERROR: truncation risk"
- Return errors to main — do not retry
```

### Phase 2: Update Main Context Dispatch Behavior

**File:** `claude_docs/CORE.md` (append to §3 Execution Rules)

```markdown
**MCP push delegation (NEW):** After any subagent dispatch that produces
file changes, batch files and send to findasale-push-coordinator via Skill()
before pushing independently. Pass a structured handoff (CORE.md §7) with:
- Full file contents (already in main context)
- Remote line counts (from prior get_file_contents call)
- Commit message and branch

Do not call mcp__github__push_files directly — let the coordinator handle
batching and validation. Exception: Emergency single-file fixes (e.g., fix
a truncated file immediately) may MCP push directly if <200 lines.
```

### Phase 3: Update STATE.md and Decisions Log

**At session wrap:**
- Log decision to decisions-log.md: "Manager subagent not feasible in current Cowork architecture; using coordinator skill instead."
- Update STATE.md with push-coordinator skill availability
- Update CLAUDE.md §5 (MCP Tool Awareness) to reference coordinator pattern

### Phase 4: Integration Testing

- Session 169: Dispatch findasale-dev (3 files) → coordinator skill → verify push → check GitHub
- Session 170: Dispatch findasale-qa (2 files) + findasale-architect (1 file) → coordinator → verify batching
- Session 171: Intentional truncation test → coordinator should catch and escalate

---

## Risks & Mitigations

| Risk | Likelihood | Impact | Mitigation |
|------|-----------|--------|-----------|
| **Coordinator skill becomes bloated** | Medium | Loses its isolation benefit | Keep skill to **push-only logic**; never add validation beyond truncation gate |
| **Main context still bloats on heavy subagent weeks** | Medium | Defeats purpose | Monitor `.checkpoint-manifest.json`; if main context >80k, dispatch fewer agents in parallel (limit to 2 instead of 3) |
| **Coordinator skill fails silently** | Low | Push doesn't happen, unknown to main | Require explicit error output; main context treats missing summary as failure and escalates |
| **Latency increases (extra Skill dispatch)** | Low | Session takes longer | Coordinator is lightweight (~5–8k); offset by fewer compressions (~13–17k saved per 8 sessions) |
| **Nesting pattern pressure increases** | Low | If Patrick asks for deeper nesting | Cowork SDK doesn't support nested Skill spawning; document this as a boundary |
| **Manifest tracking adds cognitive overhead** | Low | Coordinators are complex to reason about | Manifest is ephemeral (rebuilt each dispatch); no persistence layer needed |

---

## Fallback / Workaround

**If push-coordinator skill implementation proves harder than estimated:**

1. **Minimal fallback (still improves main context):**
   - Do NOT implement push-coordinator skill
   - Instead: Create a simple `push-checklist.json` file in the VM working directory
   - Main context appends file manifests to this file before each MCP push
   - Main context still performs all MCP pushes directly, but has a persisted record to rebuild from after compressions
   - **Token savings:** ~5–8k per compression recovery (less than full coordinator, but still improves)

2. **If even minimal fallback is too much:**
   - Stick with current approach (main context handles all pushes)
   - Mitigate by: **hard-cap agents per session at 2 instead of 3** to keep main context <75k
   - This reduces feature throughput ~25% but prevents compressions
   - Review after 8 sessions; if compression still happens, re-evaluate

---

## Consequences

### For CLAUDE.md

**Section 5 (MCP Tool Awareness):** Update to reference push-coordinator delegation:

```
When a subagent dispatch produces file changes:
1. Batch files for push (≤3 files per batch)
2. Dispatch findasale-push-coordinator with structured handoff
3. Coordinator returns push summary
4. If coordinator reports errors, escalate to Patrick

MCP direct pushes reserved for: emergency single-file fixes (<200 lines),
or when no subagent is active (direct Patrick request for edits).
```

### For CORE.md

**Section 4 (Push Rules):** No change to truncation gate logic; push-coordinator inherits §4 fully.

**Section 3 (Execution Rules):** Add clarification:

```
MCP push delegation: Subagent work outputting files should route to
findasale-push-coordinator, not direct MCP calls. Main context role is
orchestration, not file I/O batching.
```

### For Skill Roster

Add to `claude_docs/operations/skill-roster.md`:

```
findasale-push-coordinator: MCP orchestration specialist. Lightweight,
called only after subagent file outputs. Removes push-batching burden
from main context. Invokes: mcp__github__push_files (batched),
mcp__github__get_file_contents (pre-push validation).
```

### For Session Patterns

New session pattern (conversations-defaults Rule expansion):

```
After subagent dispatch completes with file outputs:
1. Main context reads subagent output
2. Extracts files modified, new files created
3. Prepares structured handoff with full content + remote line counts
4. Dispatches findasale-push-coordinator
5. Receives summary
6. Continues with next work item or wrap
```

### For Documentation

Create `claude_docs/operations/push-coordinator-protocol.md`:

- Detailed handoff format
- Example: main → coordinator → MCP → GitHub
- Truncation gate logic reference
- Error handling procedures
- When to use vs. when to push directly

---

## Conclusion

The full "manager subagent" pattern (nested autonomous agents spawning other agents) is **not feasible in Cowork today** due to architectural limitations. Cowork Skills cannot programmatically spawn other Skills; only the main session can invoke Skills via the Skill() tool.

**The recommended pattern — a lightweight findasale-push-coordinator skill — IS feasible** and delivers ~80% of the benefit at ~5% of the complexity. It:

- **Solves the immediate problem:** Keeps main context lean by delegating MCP orchestration
- **Prevents context bloat cycles:** Removes largest single-use token sink (batching + validation)
- **Is maintainable:** Skill is stateless, ephemeral, single-responsibility
- **Aligns with Cowork architecture:** Uses Skills as intended (bounded procedural expertise), not as pseudo-agents

**Token impact:** Neutral to slightly positive over 8-session cycles (saves ~5–12k per cycle via compression avoidance).

**Risk profile:** Low. Failure mode is graceful (coordinator errors → escalate to Patrick); no silent failures.

**Next step:** Implement findasale-push-coordinator as outlined in Phase 1, test in sessions 169–171, then update CLAUDE.md §5 and CORE.md §4 to standardize the pattern.

---

**Status:** Ready for implementation.
**Approved by:** Patrick (TBD)
**Last updated:** 2026-03-15
