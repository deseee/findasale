# Autocompaction + Checkpoint Confusion — S197

**Date:** 2026-03-18
**Session:** S197
**Severity:** Tier 1 (workflow/documentation clarity)

---

## Problem

Two independent session-management mechanisms were conflated, causing confusion in session handoffs:

1. **Subagent Context-Maintenance**: Captured in Dev handoff template as "Context Checkpoint: yes/no" — answers the question "Did the subagent trigger the context-maintenance skill to update STATE.md and session-log.md?"

2. **System Autocompaction**: Triggered independently by the session system when context usage exceeds threshold (~170k tokens). Returns a resumption message and resets the token budget. Causes automatic compression of conversation history.

**The confusion:** Subagents would output "Context Checkpoint: no" in their handoff, and immediately after (or at the next session continuation), the SESSION would autocompact. Patrick saw:
- Handoff says "Context Checkpoint: no"
- System immediately compacts and resumes
- Patrick concluded the two are linked — that "no" means the system will compaction

**Reality:** They are completely independent. The field documents subagent behavior. The autocompaction is triggered by total token count and happens regardless of what the subagent reported.

---

## Root Cause

1. Field name "Context Checkpoint" echoed the compaction concept too closely, making it sound like they were the same mechanism.
2. No clarifying text in the handoff template to separate the concerns.
3. Timing coincidence: subagents often completed work near the context limit, so their handoff + immediate autocompaction appeared causally linked.

---

## Fixes Applied

### Fix 1: Rename Field in findasale-dev SKILL.md
Changed handoff template (line 137) from:
```
### Context Checkpoint
- [yes/no — whether context-maintenance was triggered]
```
to:
```
### Context-Maintenance Triggered
- [yes/no — whether context-maintenance skill was invoked. Independent of system autocompaction.]
```

**Rationale:** Explicit naming ("Triggered") + clarifying note decouples the subagent decision from system autocompaction.

### Fix 2: Add Post-Compression Re-Init Rule to CORE.md §2
Added §2.1 rule requiring full re-run of all 5 init steps after any autocompaction event.

**Rationale:** S197 showed that after autocompaction, the resumed main session skipped steps 3–5 (session-log skim, GitHub sync, context budget announcement). This happened because the resumed session treated autocompaction as a mid-session pause rather than a session boundary. The rule clarifies that autocompaction IS a boundary.

### Fix 3: Documented in Workflow Retrospectives
This file created to preserve the finding for future reference and prevent recurrence.

---

## Session Impact (S197)

- Main session resumed after autocompaction
- Skipped steps 3–5 of init
- Proceeded without session-log skim or budget announcement
- Patrick detected and flagged it

**Fix prevents:** Recurring incomplete-init-after-compress cycles in future sessions.

---

## Related Files

- `claude_docs/skills-package/findasale-dev/SKILL.md` — field rename + clarification
- `claude_docs/CORE.md` — §2.1 added
- `/sessions/[session]/mnt/.skills/skills/findasale-dev/SKILL.md` — mirrors above (read-only in VM)

---

## Testing / Verification

Next session that experiences autocompaction should:
1. Detect the resume message
2. Re-run all 5 init steps before continuing
3. Log the action per §2.1
4. Subagent handoff using updated findasale-dev should show new field name and clarification

---

**Status:** Closed — both fixes applied and documented.
