# Push Coordinator Protocol — MCP Orchestration Specialist

**Version:** 1.0
**Status:** Specification (pending findasale-push-coordinator skill creation)
**Relevant ADR:** `feature-decisions/MANAGER_SUBAGENT_ARCHITECTURE.md`
**Authority:** CORE.md §4 (Push Rules), CLAUDE.md §5 (MCP Tool Awareness)

---

## Overview

The Push Coordinator is a lightweight, stateless skill that removes MCP push orchestration burden from the main session context. It validates file integrity using truncation gates, executes batched MCP pushes (≤3 files per call, ≤25k tokens total), and returns a structured summary to main context.

**Why it exists:** Main context was bloated by MCP push batching, validation, and file state tracking. This caused compression events ~1 per 2 sessions (13–17k token overhead each). Delegating to a specialized skill keeps main context lean (~60–75k per session) and prevents compressions (~1 per 8 sessions estimated).

**What it does NOT do:**
- Edit files (push exactly as received)
- Make architecture decisions
- Spawn other agents (Cowork limitation)
- Persist manifest state (ephemeral — rebuilds each dispatch)

**Lifecycle:** Invoked once per batched push → validates → pushes → returns summary → dies. No persistence across sessions.

---

## When to Dispatch

The main context dispatches `findasale-push-coordinator` when:

1. **After subagent file outputs** — A dev/QA/architect agent completes work producing modified or new files
2. **Batch ready** — Main context has prepared a structured handoff with full file contents + remote line counts
3. **No single-file exceptions** — For emergency single-file fixes (<200 lines with simple content), main may MCP push directly without coordinator

Example triggers:
- `"Push these files to GitHub"`
- `"Coordinate the batch push"`
- `"Ready to push after subagent work"`

---

## Handoff Format — Main Context → Coordinator

The main context sends a structured handoff block using CORE.md §7 protocol:

```markdown
## Handoff: Main Context → findasale-push-coordinator

Files to push:
[
  {
    "path": "packages/backend/src/controllers/itemController.ts",
    "content": "[FULL FILE CONTENT — must be complete, not truncated]",
    "currentLineCount": 450,
    "remoteLineCount": 450,
    "status": "modified"
  },
  {
    "path": "packages/database/prisma/schema.prisma",
    "content": "[FULL FILE CONTENT]",
    "currentLineCount": 120,
    "remoteLineCount": 115,
    "status": "modified"
  },
  {
    "path": "packages/frontend/pages/sales/[id].tsx",
    "content": "[FULL FILE CONTENT]",
    "currentLineCount": 180,
    "remoteLineCount": 0,
    "status": "new"
  }
]

Commit message: "Feature #42 — item categorization and search refinement"
Branch: "main"
Repository: "deseee/findasale"

Context:
- Source: dev agent after completing 3 files
- No truncation concerns — all files validated by main before handoff
- Remote line counts from prior get_file_contents call
```

### Handoff Schema Details

| Field | Type | Required | Notes |
|-------|------|----------|-------|
| `path` | string | Yes | Relative to repo root (e.g., `packages/backend/src/index.ts`) |
| `content` | string | Yes | **FULL** file content. Never truncated or partial. |
| `currentLineCount` | int | Yes | Line count of content being pushed |
| `remoteLineCount` | int | Yes | Line count on GitHub (from prior `get_file_contents`). Use 0 for new files. |
| `status` | string | Yes | `modified` or `new`. Coordinator doesn't need to care — just pushes. |
| `commitMessage` | string | Yes | Human-readable, one-line summary. Patrick-provided or subagent-generated. |
| `branch` | string | Yes | Target branch (almost always `main` for FindA.Sale). |
| `repository` | string | Yes | GitHub repo in format `owner/repo` (always `deseee/findasale`). |

---

## Coordinator Workflow

### Phase 1: Intake & Validation

1. **Receive handoff** from main context
2. **Extract files** and metadata
3. **Validate structure** — all required fields present?
4. **Count files** — how many? (must be ≤3 per batch, but handoff may contain multiple batches)

### Phase 2: Truncation Gate (MANDATORY)

For each file, perform the truncation gate check (CORE.md §4):

```
IF (currentLineCount < remoteLineCount × 0.8)
  AND (file was not intentionally deleted by subagent)
THEN
  STOP this file
  Mark: ERROR — truncation risk detected
  Report to main: "File [path] is 20%+ shorter than remote. Possible read failure in main context."
  DO NOT PUSH
ELSE
  PASS — mark file as safe to push
```

**Truncation gate is a HARD STOP.** Even if 1 of 3 files fails, coordinator stops that file and reports error. The other 2 files may still push if they pass.

**Log all truncation checks** (passed and failed) for audit trail. Example:

```
Truncation gate results:
- packages/backend/src/controllers/itemController.ts: PASS (450 / 450 lines)
- packages/database/prisma/schema.prisma: PASS (120 / 115 lines) — content slightly longer than remote OK
- packages/frontend/pages/sales/[id].tsx: PASS (180 / 0 lines) — new file
```

### Phase 3: Batching

Group files into batches of ≤3 files per batch, keeping total token count ≤25k tokens per batch:

```
Batch 1: [file 1, file 2, file 3] → ~18k tokens → push
Batch 2: [file 4, file 5] → ~7k tokens → push
```

If a single file >12k tokens, push it solo.

### Phase 4: MCP Push Execution

For each batch, call `mcp__github__push_files` with:
- `owner`: `deseee`
- `repo`: `findasale`
- `branch`: `main`
- `files`: array of {path, content} objects
- `message`: commit message (shared across all files in batch)

Example MCP call:

```python
mcp__github__push_files(
  owner="deseee",
  repo="findasale",
  branch="main",
  files=[
    {path: "packages/backend/src/index.ts", content: "[full content]"},
    {path: "packages/database/prisma/migrations/20260315_v1.sql", content: "[full content]"}
  ],
  message="Feature #42 — item categorization and search refinement"
)
```

### Phase 5: Result Collection & Summary

After each MCP push call, capture:
- HTTP status (success/failure)
- Commit SHA returned by MCP
- Any error messages from GitHub API

Aggregate results into final summary.

---

## Output Format — Coordinator → Main Context

Return a structured summary block:

```markdown
## Push Coordinator Summary

### Validation Phase
- Files received: 3
- Truncation gate results:
  - packages/backend/src/controllers/itemController.ts: PASS (450/450 lines)
  - packages/database/prisma/schema.prisma: PASS (120/115 lines)
  - packages/frontend/pages/sales/[id].tsx: PASS (180/0 lines, new file)
- Truncation risks detected: 0

### Batching
- Batch strategy: 3 files in 1 batch (~18k tokens combined)
- Total batches to execute: 1

### MCP Push Results
**Batch 1:** 3 files
- MCP call: mcp__github__push_files
- Result: SUCCESS
- Commit SHA: 7a4f8c9d2b1e6f5c3a2d9e8f1b4c6a7
- Files pushed:
  - packages/backend/src/controllers/itemController.ts
  - packages/database/prisma/schema.prisma
  - packages/frontend/pages/sales/[id].tsx

### Summary
- Total files pushed: 3
- Total commits: 1
- Errors: none
- Remote state: synced (main, SHA: 7a4f8c9d2b1e6f5c3a2d9e8f1b4c6a7)

### Next Steps for Main Context
None — push complete. Continue with next work item or wrap.
```

### Summary Schema

| Section | Content | Notes |
|---------|---------|-------|
| Validation Phase | Truncation gate results for each file | Evidence for audit |
| Batching | How files were grouped, token count per batch | Transparency |
| MCP Push Results | One section per batch with commit SHA | Proof of push |
| Summary | Total counts, errors, final remote state | What main context needs to know |
| Next Steps | Action for main context (usually "none") | Clarity on handoff return |

---

## Error Handling

### Truncation Risk (HARD STOP)

**Scenario:** Coordinator detects `currentLineCount < remoteLineCount × 0.8` for any file.

**Action:**
1. STOP — do not push that file
2. Mark file in output: `ERROR — truncation risk, local count [X] < remote count [Y] × 0.8`
3. Report to main: "Truncation detected in [filename]. This usually means main context's file read was incomplete. Recommend main context re-read the file in full and re-queue."
4. If other files in batch pass truncation gate, still push them (don't hold entire batch)

**Main context responsibility:** Read the flagged file in full, verify nothing was truncated, re-prepare handoff, and re-dispatch coordinator.

### MCP Call Failure

**Scenario:** `mcp__github__push_files` returns an error (rate limit, API error, auth failure, etc.).

**Action:**
1. Log error details (API response, timestamp, batch number)
2. Retry the batch once (one retry only)
3. If retry fails, report to main: "MCP push failed for Batch X: [error]. Recommend escalating to Patrick."
4. Do NOT attempt to retry indefinitely — that wastes tokens

**Main context responsibility:** Investigate MCP API status, verify credentials, and re-dispatch if transient failure or escalate to Patrick if persistent.

### Incomplete Handoff

**Scenario:** Handoff block is malformed (missing fields, invalid JSON, etc.).

**Action:**
1. Report immediately: "Handoff validation failed: [specific issue]"
2. Return without pushing anything
3. Main context must fix and re-dispatch

---

## Constraints & Rules

**Always follow these:**

1. **Never edit files** — push exactly as received in handoff
2. **Never make logic decisions** — if a file looks wrong, don't try to fix it, escalate
3. **Max 3 files per MCP call** — CORE.md §4 requirement
4. **Max 25k tokens total per batch** — CORE.md §4 requirement
5. **Truncation gate is MANDATORY** — do not skip even for "obviously fine" files
6. **Log all results** — coordinator output is audit trail; be verbose on validation
7. **One retry for MCP failures** — not indefinite retries
8. **Stateless** — no persistent manifest; each dispatch is independent
9. **Died at end** — coordinator invocation ends after returning summary; no hanging connections

---

## Integration with Main Context

### When Main Dispatches Coordinator

```
Main context completes subagent work
  → reads subagent output
  → extracts files modified / created
  → reads each file in full from local disk
  → calls get_file_contents on GitHub for remote line counts
  → prepares structured handoff with full content + line counts
  → dispatches findasale-push-coordinator via Skill()

Coordinator validates, batches, pushes
  → returns summary

Main context receives summary
  → checks for errors
  → if any errors, escalate to Patrick or retry as needed
  → if clean, continue with next work item or wrap
```

### When Main Pushes Directly (Exception)

Main context may bypass coordinator for:
- **Emergency single-file fixes** (<200 lines, simple content, no subagent involved)
- **Quick patches** that don't wait for a full batch

Example:
```
Main context detects typo in deployed file
  → reads file in full
  → gets remote line count
  → performs truncation gate check locally
  → calls mcp__github__push_files directly
  (No need for coordinator for 1 simple file)
```

---

## Example Walkthrough: Main → Coordinator → GitHub

### Initial State

- 3 files modified by dev agent
- Remote versions on GitHub known
- Handoff prepared, ready to push

### Step 1: Main Context Prepares Handoff

```markdown
## Handoff: Main Context → findasale-push-coordinator

Files to push: [3 files with content, line counts]
Commit message: "Refactor: extract itemService logic into standalone module"
Branch: "main"
```

### Step 2: Main Dispatches Coordinator

```
Main: Skill('findasale-push-coordinator', handoff_block)
```

### Step 3: Coordinator Validates

```
Received 3 files
Truncation gate: PASS, PASS, PASS
Total tokens: ~22k
Batching: 1 batch of 3 files
```

### Step 4: Coordinator Executes MCP

```
mcp__github__push_files(
  owner="deseee",
  repo="findasale",
  branch="main",
  files=[{path: ..., content: ...}, ...],
  message="Refactor: extract itemService logic into standalone module"
)
→ Result: Success, commit 7a4f8c9d
```

### Step 5: Coordinator Returns Summary

```markdown
## Push Coordinator Summary

Validation Phase: 3 files, 0 truncation risks
MCP Push Results: Batch 1 SUCCESS, commit 7a4f8c9d, 3 files pushed
Summary: 3 files pushed, 1 commit, no errors
```

### Step 6: Main Context Processes Summary

```
Main: Received summary, no errors
Main: Continue with next task
```

### Step 7: GitHub State

Main branch now contains all 3 files. Vercel + Railway auto-deploy.

---

## Session Lifecycle

### Session Start

- Load CORE.md §4 and CLAUDE.md §5 (MCP awareness)
- Note that findasale-push-coordinator is available
- Do NOT invoke coordinator yet (no subagent work done yet)

### Mid-Session Work

- Dispatch findasale-dev, findasale-qa, etc. (subagents)
- Subagents produce file outputs
- Main context batches → dispatches coordinator

### Repeat

- More subagent work
- More batched pushes to coordinator
- Continue until session wraps

### Session Wrap

- Finalize all pending pushes (coordinator or direct MCP)
- Update STATE.md and session-log.md
- Provide Patrick with final git status
- NO unpushed work should remain at wrap

---

## Metrics & Monitoring

Track coordinator usage to measure impact:

| Metric | Baseline | Expected After Coordinator |
|--------|----------|---------------------------|
| Main context size per session | 75–80k tokens | 60–75k tokens |
| Compression events per 8 sessions | ~4 | ~1 |
| Overhead per compression avoided | — | ~13–17k tokens saved |
| Coordinator dispatch overhead | — | ~5–8k tokens per push batch |
| Net savings per 8-session cycle | — | ~5–12k tokens (~1–2k/session) |

Session 169+ will be first to measure actual impact.

---

## Related Files & References

- **ADR:** `claude_docs/feature-decisions/MANAGER_SUBAGENT_ARCHITECTURE.md` — full architectural decision
- **CORE.md §4:** Push Rules, truncation gate mandate, MCP limits
- **CLAUDE.md §5:** MCP Tool Awareness, MCP vs PowerShell guidance
- **SECURITY.md:** Credential protection (relevant to ensuring .env not pushed)

---

## Status

**Ready for implementation:** findasale-push-coordinator skill should be created at `/mnt/.skills/skills/findasale-push-coordinator/SKILL.md` and registered in skill manifest.

**Testing:** Sessions 169–171 will validate end-to-end workflow.

**Last updated:** 2026-03-15
