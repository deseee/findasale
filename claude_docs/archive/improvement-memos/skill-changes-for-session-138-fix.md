# Exact Skill Changes Required — Session 138 Workflow Failure Fix

**For**: findasale-records agent to implement
**Status**: Ready to apply
**Risk**: Low — confined to skill documentation, no code changes

---

## File 1: findasale-dev SKILL.md

**Change type**: Insert new section

**Location**: After line 110 ("Note in your handoff that a context checkpoint was performed.")
**Before**: Line 113 ("## Handoff Summary")

**Insert this entire section**:

```markdown
---

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

**Pattern example (what to mark in handoff):**
```
### Needs Implementation (via findasale-dev re-invocation)
These findings must be implemented by findasale-dev in a separate invocation.
Do not implement them inline in the orchestrator session.
- review.tsx line 42: wrong query URL endpoint
- itemController.ts line 88: export getDraftItemsBySaleId
- routes/items.ts line 15: route ordering issue
```
```

---

## File 2: conversation-defaults SKILL.md

**Change type**: Insert new rule

**Location**: After line 277 (end of Rule 12 section)
**Before**: Line 280 ("## Fallback: If This Skill Was Not Loaded at Session Start")

**Insert this entire section**:

```markdown
---

## Rule 13: Never implement bug fixes inline after subagent diagnosis

**GATE (before implementing code fixes in this session):**
- Ask yourself: "Was a subagent (findasale-dev, findasale-architect, etc.)
  just invoked to diagnose or spec this work?"
  - NO → Proceed with inline implementation. (Simple fixes, one-off edits.)
  - YES and the handoff explicitly says "implement inline" → Proceed.
  - YES and the handoff says "re-invoke for implementation" or "do not implement
    inline" → STOP. Re-invoke the appropriate subagent with the diagnosis summary
    + "now implement these fixes."

**Why this exists:** Session 138 — the orchestrator received diagnosis from
findasale-dev, then implemented 3 bug fixes inline in the main session window.
This split the work partition, caused context bloat, triggered silent autocompaction
at 77%, and required push reconstruction in the next session. Subagents are optimized
for implementation work (API contracts, error handling, testing, handoff discipline).
Orchestrators are optimized for triage, routing, and orchestration. When diagnosis
is done by a subagent, implementation must also be done by that subagent to avoid
context waste and preserve work tracking. This rule closes the loophole that
caused session 138 to fail. (Added 2026-03-11, Session 139.)
```

---

## File 3: conversation-defaults SKILL.md (Update Summary Table)

**Change type**: Update table

**Location**: Line 309 (the summary table)

**Current line 309:**
```
| Never output placeholder values | Active (added 2026-03-11, Session 137) |
```

**Add after it**:
```
| Never implement bug fixes inline after subagent diagnosis | Active (added 2026-03-11, Session 139) |
```

---

## Implementation Verification Checklist

After applying changes:

1. [ ] findasale-dev SKILL.md: New "Diagnosis-to-Implementation Rule" section inserted
2. [ ] conversation-defaults SKILL.md: Rule 13 inserted before Fallback section
3. [ ] conversation-defaults SKILL.md: Summary table updated with Rule 13
4. [ ] No line wrapping or formatting issues
5. [ ] All section headers match existing style (##, ###, etc.)
6. [ ] Markdown links and code blocks are valid

---

## Testing Notes

**Expected behavior after implementation:**

1. When findasale-dev is invoked to diagnose, it will include in handoff:
   - "These findings must be implemented by re-invoking findasale-dev"

2. When orchestrator reads that handoff, Rule 13 will trigger:
   - Orchestrator will re-invoke findasale-dev instead of implementing inline

3. Result:
   - Implementation happens in dev agent's context, not orchestrator
   - No context bloat in orchestrator
   - Work is tracked cleanly

**Regression test (for Patrick):**
- Next time a diagnosis → implementation task occurs, verify that orchestrator
  re-invokes the dev agent instead of fixing inline.

---

## Files Modified

- `/sessions/sleepy-vibrant-goodall/mnt/.skills/skills/findasale-dev/SKILL.md`
- `/sessions/sleepy-vibrant-goodall/mnt/.skills/skills/conversation-defaults/SKILL.md`

**Total lines added**: ~35 (two new sections + table update)
**Complexity**: Low (documentation only, no code changes)
