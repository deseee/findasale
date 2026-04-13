# Session 138 Workflow Failure Analysis & Fix Proposal

**Date**: 2026-03-11
**Analyzed by**: Cowork Power User Agent
**Status**: Ready for findasale-records implementation

---

## Executive Summary

Session 138 experienced a silent autocompaction mid-task because the orchestrator (main session window) performed implementation work inline **after** findasale-dev had already been invoked for diagnosis. This violated the work-partition contract: diagnosis should trigger implementation, not leave it to the orchestrator.

**Root cause**: No enforcement mechanism exists to prevent split diagnosis/implementation workflows.

**Solution**: Add two complementary rules — one to findasale-dev, one to conversation-defaults — that create a hard contract: "If a subagent diagnoses, the orchestrator must re-invoke the subagent for implementation. Do not implement inline."

---

## What Happened in Session 138

1. **findasale-dev invoked** to diagnose 3 bugs in Rapidfire Mode review page
2. **Dev agent returned** specific findings:
   - `review.tsx`: wrong query URL + broken Edit button navigation
   - `itemController.ts`: new `getDraftItemsBySaleId` export needed
   - `routes/items.ts`: route registration order issue
3. **Orchestrator proceeded inline** to implement all 3 fixes in the main session window
4. **Context bloat**: Orchestrator loaded and edited multiple files sequentially
5. **Autocompaction triggered** at 77% without prior warning to Patrick
6. **Push reconstruction** required in next session

**Patrick's feedback**: "You used the dev agent to find the issues but didn't use the dev agent to fix the issues. Then proceeded to fix all the issues in this session window which caused the autocompact to run."

---

## Root Cause Analysis

### Missing Enforcement Mechanisms

**findasale-dev SKILL.md (current)**:
- Lines 85–139 describe workflow, but do NOT contain a rule prohibiting split diagnosis/implementation
- No explicit directive that diagnosis findings must trigger re-invocation for implementation
- No handoff marker that says "these findings should not be implemented inline"

**conversation-defaults SKILL.md (current)**:
- 12 active rules, all enforced at orchestrator level
- Rule 1: AskUserQuestion for clarification
- Rule 2: Announce file modification approach
- Rule 3: First message session start
- Rule 4: dev-environment gate
- Rule 5: Never hand off git issues
- Rule 6: Treat abbreviated language as precise
- Rule 7: File creation path validation
- Rule 8: Message board protocol
- Rule 9: Token budget briefing
- Rule 10: Checkpoint manifest
- Rule 11: Pre-dispatch checkpoint before 3+ agents
- Rule 12: Never output placeholder values
- **MISSING: Rule preventing inline implementation after subagent diagnosis**

### Why the Pattern Matters

When findasale-dev diagnoses but the orchestrator implements:

1. **Context fragmentation**: Diagnosis overhead (reading task, understanding codebase) is split from implementation overhead (editing multiple files). Both costs persist in the orchestrator window.
2. **Loss of agent specialization**: Dev agent is optimized for implementation patterns (API contracts, error handling, testing, handoff discipline). Orchestrator is not.
3. **No work-partition boundary**: If the orchestrator "just does a quick fix" after diagnosis, the line between when to use subagents and when to inline becomes fuzzy. Each subsequent decision requires re-asking the same question.
4. **Silent compression risk**: The pattern accumulates context without a clear signal to the orchestrator that it's heavy (dev agent would have checkpointed).

---

## Proposed Fix

### Part 1: findasale-dev — Add "Diagnosis-to-Implementation Rule"

**Location**: Insert after "Context Monitoring" (line 110), before "Handoff Summary" (line 113)

**New section**:

```markdown
## Diagnosis-to-Implementation Rule

**Critical pattern: Diagnosis without implementation is incomplete.**

When findasale-dev is invoked ONLY to diagnose bugs or issues (no implementation
request), the subagent must NOT leave implementation to the orchestrator session.

**Why:** Session 138 demonstrated that when the orchestrator implements fixes
inline after receiving diagnosis from dev, context bloats unexpectedly, autocompaction
triggers mid-task, and work becomes harder to track.

**The rule:**
1. If you are invoked to **diagnose only** (e.g., "investigate these 3 bugs,
   tell me what's wrong"), return findings with specific file/line pointers.
2. In your handoff summary, include this directive:
   "These findings must be implemented by re-invoking findasale-dev, not inline
   in the orchestrator session. Do not implement these fixes in this session window."
3. When the orchestrator reads this handoff, it will trigger Rule 13 in
   conversation-defaults, which prevents inline implementation.
```

**Rationale**: Explicitly states the boundary. Dev agents know this rule; orchestrators respect it because it's enforced by conversation-defaults.

---

### Part 2: conversation-defaults — Add Rule 13

**Location**: Insert after Rule 12 "Never output placeholder values" (line 277), before "Fallback" section (line 280)

**New rule**:

```markdown
## Rule 13: Never implement bug fixes inline after subagent diagnosis

**GATE (before implementing code fixes in this session):**
- Ask: "Was a subagent (findasale-dev, findasale-architect, etc.) just invoked
  to diagnose or spec this work?"
  - NO → Proceed with inline implementation. (Simple fixes, one-off edits.)
  - YES and the handoff says "implement inline" → Proceed with inline implementation.
  - YES and handoff says "re-invoke for implementation" or "do not implement inline"
    → STOP. Re-invoke the appropriate subagent with the diagnosis summary + "now implement these fixes."

**Why this exists:** Session 138 — the orchestrator received diagnosis from findasale-dev,
then implemented 3 bug fixes inline in a single session. This split work partition,
caused context bloat, triggered silent autocompaction at 77%, and required push
reconstruction in the next session. Subagents are optimized for implementation work;
orchestrators are optimized for triage, routing, and orchestration. When diagnosis
is done by a subagent, implementation must also be done by that subagent to avoid
context waste and preserve work tracking. (Added 2026-03-11, Session 139.)
```

**Rationale**: Creates a hard gate at the orchestrator level. Prevents the "just do it here" pattern that caused session 138's failure.

---

### Part 3: Context Weight Warning — Optional Enhancement

Both skills should include a note about warning Patrick when context is heavy. Currently:

- findasale-dev (lines 99–109): "Context Monitoring" section mentions tracking work intensity but does NOT include a warning threshold that triggers a message to Patrick.
- conversation-defaults (lines 207–219): "Token budget briefing" exists but is about session init, not mid-session warnings.

**Proposed enhancement** (optional, not critical for this fix):

In findasale-dev, update "Context Monitoring" section:

```markdown
## Context Monitoring

Track your own work intensity. After completing each logical batch of changes
(or after loading and editing 8+ files), assess whether the session context is
getting heavy. Signs: you're loading large files repeatedly, the task has grown
beyond its original scope, or you've been running for many tool calls.

**Warning threshold**: If you estimate session usage will exceed 150k tokens,
add this message to your next response:
"Context approaching 150k tokens (75% of 200k budget). Session will auto-checkpoint
before continuing if usage exceeds 170k."

When context is getting full:
1. Finish your current atomic task (don't leave files half-edited).
2. Write the handoff summary below.
3. Trigger the `context-maintenance` skill to update STATE.md and session-log.md
   with what was completed.
4. Note in your handoff that a context checkpoint was performed.
```

This gives Patrick a mid-flight warning before autocompaction happens.

---

## Implementation Checklist

- [ ] findasale-dev SKILL.md: Add "Diagnosis-to-Implementation Rule" section
- [ ] conversation-defaults SKILL.md: Add Rule 13 "Never implement bug fixes inline after subagent diagnosis"
- [ ] (Optional) Update "Context Monitoring" in findasale-dev to include warning threshold

---

## Expected Impact

**Session 138 would have played out differently:**

1. findasale-dev invoked to diagnose → returns findings + "re-invoke for implementation"
2. Orchestrator reads handoff, triggers Rule 13 gate
3. Orchestrator re-invokes findasale-dev: "Implement these 3 fixes: [diagnosis summary]"
4. Dev agent handles implementation in its own context, with checkpointing discipline
5. No context bloat in orchestrator, no surprise autocompaction
6. Work tracking is clean: diagnosis session + implementation session, both logged

**Estimated tokens saved**: 25–40k per comparable session (context that would have been wasted on inline implementation stays available for other work).

**Risk of change**: Low. The rule formalizes a contract that should exist anyway. Subagents that diagnose without implementing will see more re-invocations, but that's correct behavior.

---

## Route to findasale-records

This analysis and proposed changes should be reviewed and implemented by findasale-records.
The changes are confined to two skill SKILL.md files and do not require code changes.

**Files to update**:
- `/sessions/sleepy-vibrant-goodall/mnt/.skills/skills/findasale-dev/SKILL.md`
- `/sessions/sleepy-vibrant-goodall/mnt/.skills/skills/conversation-defaults/SKILL.md`

**Priority**: High (fixes a recurring session failure pattern)

**Timeline**: Can be implemented in the next session without blocking other work.
