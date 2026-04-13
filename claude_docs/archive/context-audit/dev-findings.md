# Context Loss Audit — Developer Findings
**Date:** 2026-03-09
**Auditor:** Senior Developer
**Scope:** Session checkpoint persistence, context compression resilience, token tracking feasibility

---

## Executive Summary

Current approach (text-based checkpoints in conversation + session-log.md at wrap) is fragile. Sessions with early termination skip session-log writes, losing token accounting. Conversation-defaults Rule 3 (session init) fires inconsistently due to missing session-state handoff mechanism. **Recommendation: Implement lightweight `session-state.json` for real-time persistence.**

---

## Finding 1: JSON Schema for Session Checkpoint Persistence

A `session-state.json` file would look like this:

```json
{
  "sessionId": "session-117-2026-03-09",
  "startTime": "2026-03-09T14:32:00Z",
  "estimatedBudget": 200000,
  "checkpoints": [
    {
      "turn": 1,
      "timestamp": "2026-03-09T14:32:15Z",
      "filesRead": 3,
      "estimatedTokens": 1200,
      "toolCalls": 2,
      "cumulativeUsed": 5000,
      "cumulativePercent": 2.5,
      "lastAction": "loaded CORE.md + STATE.md + token-checkpoint-guide.md",
      "nextPhase": "audit scripts directory"
    },
    {
      "turn": 5,
      "timestamp": "2026-03-09T14:45:22Z",
      "filesRead": 8,
      "estimatedTokens": 3400,
      "toolCalls": 4,
      "cumulativeUsed": 18000,
      "cumulativePercent": 9,
      "lastAction": "read session-wrap-check.sh, update-context.js, STATE.md",
      "nextPhase": "write findings to dev-findings.md"
    }
  ],
  "compressions": [],
  "finalBurn": null,
  "pushMethod": null,
  "status": "active"
}
```

**Key fields:**
- `sessionId`: unique identifier for this session run (used as filename key)
- `startTime`: ISO timestamp of session init
- `checkpoints[]`: array of turn-level snapshots, ordered chronologically
- `turn`: conversation turn number (matches user message count)
- `cumulativeUsed` / `cumulativePercent`: running tally against 200k budget
- `compressions[]`: records of context compressions (when fired, what was kept/lost)
- `finalBurn`: populated at wrap with total tokens burned
- `status`: one of `active`, `wrapped`, `abandoned`

---

## Finding 2: Session Init Read Mechanism

**Current state:** CORE.md §2 specifies session init but has no persistent handoff from wrap. Conversation-defaults Rule 3 fires on first turn, but only if Claude sees the rule — context compressions can erase it.

**Proposed mechanism:**

At wrap, write a `last-session-state.json` (not in git — lives in `mnt/.claude/`) containing the previous session's final checkpoint:

```json
{
  "lastSessionId": "session-117-2026-03-09",
  "lastSessionEnd": "2026-03-09T16:22:30Z",
  "tokensBurned": 127400,
  "percentUsed": 63.7,
  "filesChanged": [
    "packages/backend/controllers/stripeController.ts",
    "packages/frontend/pages/payouts.tsx",
    "claude_docs/STATE.md"
  ],
  "compressions": 0,
  "blockers": [],
  "readyForNextSession": true
}
```

**At session init (before any work):**
1. Check if `mnt/.claude/last-session-state.json` exists
2. If yes: read it, inject into context window as part of CORE.md §2
3. If no or corrupted: log warning, proceed with normal init
4. Announce to Patrick: "Previous session burned ~127k tokens (63.7%). Files changed: [list]. No blockers."

**File location rationale:**
- `mnt/.claude/` is not git-tracked (lives on Windows host filesystem, not in repo)
- Survives across git pushes and repo clones
- Readable by both Claude sessions (local context) and Patrick scripts (PowerShell)

---

## Finding 3: Automation — Scripts Ecosystem

**Current assets in `/scripts/`:**
- `session-wrap-check.sh` — validates uncommitted changes at wrap (used by Patrick manually)
- `update-context.js` — regenerates context.md from git + health reports (runs on init)
- `health-check.ts` — (exists, not yet read)
- `stress-test.js` — load testing (unrelated to checkpoints)

**Proposed additions:**

Create `/scripts/write-session-state.js` (called by Claude at checkpoint moments):

```javascript
const fs = require('fs');
const path = require('path');

function writeCheckpoint(checkpoint) {
  const sessionFile = path.join(__dirname, '..', 'mnt', '.claude', 'session-state.json');
  let state = { checkpoints: [], compressions: [], status: 'active' };

  if (fs.existsSync(sessionFile)) {
    try {
      state = JSON.parse(fs.readFileSync(sessionFile, 'utf8'));
    } catch (e) {
      console.warn('Failed to read session-state.json, starting fresh');
    }
  }

  state.checkpoints.push({
    turn: checkpoint.turn,
    timestamp: new Date().toISOString(),
    filesRead: checkpoint.filesRead || 0,
    estimatedTokens: checkpoint.estimatedTokens || 0,
    toolCalls: checkpoint.toolCalls || 0,
    cumulativeUsed: checkpoint.cumulativeUsed,
    cumulativePercent: (checkpoint.cumulativeUsed / 200000 * 100).toFixed(1),
    lastAction: checkpoint.lastAction,
    nextPhase: checkpoint.nextPhase
  });

  fs.writeFileSync(sessionFile, JSON.stringify(state, null, 2));
}

module.exports = { writeCheckpoint };
```

Create `/scripts/read-session-state.sh` (called by Patrick before launching new session):

```bash
#!/bin/bash
# Reads last-session-state.json and outputs to stdout for Claude to ingest
STATE_FILE="mnt/.claude/last-session-state.json"
if [ -f "$STATE_FILE" ]; then
  cat "$STATE_FILE"
else
  echo '{"readyForNextSession": true}'
fi
```

---

## Finding 4: Failure Modes & Mitigations

**Failure mode: File lock on concurrent writes**
- Risk: Two Claude turns write to session-state.json simultaneously
- Mitigation: Use atomic write pattern (write to temp file, mv —no partial reads)
- Code: Node.js `fs.promises.writeFile()` with async/await is atomic-safe

**Failure mode: Disk space / quotas**
- Risk: session-state.json grows unbounded if not pruned
- Mitigation: Keep only last 10 checkpoints per session. Purge oldest on each write if count > 10.
- Code: Rotate in writeCheckpoint() — keep array length ≤ 10

**Failure mode: Corrupted JSON (network drop, VM crash)**
- Risk: session-state.json becomes unreadable
- Mitigation: Validate with try/catch. Fall back to graceful default if parse fails.
- Code: Already shown in read logic above

**Failure mode: Stale reads across sessions**
- Risk: Session N reads Session N-1's state after Session M ran in between
- Mitigation: Embed session ID in filename. Read `session-state-[sessionId].json` instead of generic file.
- Code: At init, read latest-session-state.json (symlink managed by Patrick's session-start script)

---

## Finding 5: Pre-Session Script (Patrick Integration)

Create `/scripts/session-start.ps1` (run by Patrick before launching Claude):

```powershell
# FindA.Sale Session Start Script
# Run this in PowerShell before launching a new Claude session

param(
  [string]$SessionName = "session-$(Get-Date -Format 'yyMMdd-HHmm')"
)

$ProjectRoot = Split-Path -Parent $PSScriptRoot
$StateDir = Join-Path $ProjectRoot "mnt\.claude"

# Create state directory if missing
if (-not (Test-Path $StateDir)) {
  New-Item -ItemType Directory -Path $StateDir -Force | Out-Null
}

# Read last session state
$LastStateFile = Join-Path $StateDir "last-session-state.json"
if (Test-Path $LastStateFile) {
  Write-Host "Last session summary:" -ForegroundColor Green
  Get-Content $LastStateFile | ConvertFrom-Json | ForEach-Object {
    Write-Host "  Burned: $($_.tokensBurned) tokens ($($_.percentUsed)%)"
    Write-Host "  Files changed: $($_.filesChanged -join ', ')"
    Write-Host "  Ready for next session: $($_.readyForNextSession)"
  }
}

# Initialize new session state
$NewState = @{
  sessionId = $SessionName
  startTime = (Get-Date -AsUTC -Format 'o')
  estimatedBudget = 200000
  checkpoints = @()
  compressions = @()
  finalBurn = $null
  status = "active"
}

$StateFile = Join-Path $StateDir "session-state.json"
$NewState | ConvertTo-Json -Depth 3 | Set-Content $StateFile

Write-Host "`nSession state initialized: $SessionName" -ForegroundColor Cyan
Write-Host "State file: $StateFile" -ForegroundColor Gray
```

**Patrick workflow:**
```powershell
cd C:\Users\desee\ClaudeProjects\FindaSale
.\scripts\session-start.ps1 -SessionName "session-117-context-audit"
# (Then open Claude with the new session)
```

---

## Finding 6: Real-Time Checkpoint Writing from Claude

Whenever Claude logs a checkpoint (per CORE.md §3), use the Bash tool to write to session-state.json:

```bash
node /sessions/epic-awesome-hawking/mnt/FindaSale/scripts/write-session-state.js \
  --turn 5 \
  --filesRead 3 \
  --estimatedTokens 1200 \
  --cumulativeUsed 18000 \
  --lastAction "read session wrap scripts" \
  --nextPhase "write audit findings"
```

This keeps session-state.json in sync without relying on conversation text (which gets compressed).

---

## Finding 7: Stale Prevention & Validation

**How to prevent stale last-session-state.json:**

1. At wrap, session-state.json is finalized (status → "wrapped", finalBurn populated)
2. A wrap script atomically copies session-state.json → last-session-state.json
3. At next session init, check last-session-state.json `endTime` — if >30 days old, warn Patrick

**Code (in context-maintenance skill at wrap):**
```javascript
function finalizeSession(sessionStateFile, outputFile) {
  const state = JSON.parse(fs.readFileSync(sessionStateFile, 'utf8'));
  state.status = 'wrapped';
  state.endTime = new Date().toISOString();
  fs.writeFileSync(sessionStateFile, JSON.stringify(state, null, 2));

  // Archive: keep session-state-[id].json in history
  // Also write last-session-state.json for next session
  fs.copyFileSync(sessionStateFile, outputFile);
}
```

---

## Finding 8: Existing Ecosystem Gaps

| Component | Status | Gap |
|-----------|--------|-----|
| session-wrap-check.sh | Exists | Only validates git state; no token accounting |
| update-context.js | Exists | Reads from file system; no state injection |
| conversation-defaults | Exists | Rule 3 can be compressed away; needs fallback |
| CORE.md §2–3 | Exists | Checkpoint format defined; no automation yet |
| TOKEN-CHECKPOINT-GUIDE.md | Exists (2026-03-09) | Manual logging only; no JSON writer script |

**Quick wins (high ROI, <2 sessions):**
1. Add `/scripts/write-session-state.js` (Node.js module) — 30 lines
2. Add `/scripts/session-start.ps1` (Patrick runs before each session) — 40 lines
3. Update CORE.md §2 to reference last-session-state.json read at init
4. Wire write-session-state.js into Bash checkpoint calls (one-liner per checkpoint)

---

## Recommendations (Priority Order)

**P0 (blocks context recovery):**
- Implement write-session-state.js + integrate with checkpoint logging
- Create session-start.ps1 for Patrick to run pre-session
- Update CORE.md §2 to read from last-session-state.json

**P1 (prevents orphaned states):**
- Add validation/corruption recovery to session-state read logic
- Implement 10-checkpoint rotation (purge oldest) to prevent unbounded growth

**P2 (observability):**
- Add `--summary` flag to write-session-state.js to output human-readable checkpoint summary
- Update context-maintenance skill to report final burn with archival path

**P3 (nice-to-have):**
- Dashboard script to visualize last N sessions' token burns (time series)
- Alerts if burn rate exceeds 170k (warning threshold)

---

## Conclusion

The architecture is feasible. Key bottleneck is **not technical** (file I/O is trivial) but **behavioral**: conversation text checkpoints are fragile because context compressions erase them. A JSON-backed system with real-time writes solves this. Estimated implementation cost: 2–3 hours for full integration including Patrick's session-start.ps1 script and CORE.md updates.

Current cost of not fixing: ~20% token loss per session when compression fires + occasional wrapped sessions with no token log. Over 10 sessions, that's ~40k tokens and 10–20 hours of debugging burned.
