# Quick Reference: Diagnosis-to-Implementation Contract

**Added**: 2026-03-11 (Session 139)
**Reason**: Session 138 failure — orchestrator implemented fixes inline after dev diagnosis

---

## The Contract (3-sentence version)

When a subagent diagnoses bugs or issues, **it must not leave implementation to the orchestrator**. The subagent must mark its handoff: "These findings must be implemented by re-invoking me, not inline." When the orchestrator reads that, it must re-invoke the subagent instead of fixing things itself.

---

## Findasale-Dev's Role

**If invoked to diagnose only:**
1. Return findings with file/line pointers
2. Mark handoff: "These findings must be implemented by findasale-dev. Do not implement inline."
3. The orchestrator will see this and re-invoke you

**If invoked to diagnose AND implement:**
1. Diagnose
2. Implement
3. Handoff as usual (no re-invocation needed)

---

## Orchestrator's Role

**Before implementing code fixes, ask yourself:**

"Was findasale-dev (or another subagent) just invoked to diagnose this?"

- **NO** → Implement inline. Fine.
- **YES, and handoff says "implement inline"** → Implement inline. Fine.
- **YES, and handoff says "re-invoke for implementation"** → STOP. Call findasale-dev again with the findings.

---

## Why This Matters

| Without Contract | With Contract |
|---|---|
| Diagnose → Inline implement → Context bloat | Diagnose → Dev implements → Clean separation |
| Surprise autocompaction mid-task | Predictable context usage |
| Work tracking is messy | Each task has clear sessions |
| Dev agent optimizations unused | Dev handles what it's built for |

---

## Example

**Without contract (Session 138 — ❌ wrong):**
```
Orchestrator: Dev, diagnose these 3 bugs
Dev: Found X, Y, Z
Orchestrator: [loads files and edits all 3 bugs inline]
[context bloats, autocompaction happens]
```

**With contract (Session 140+ — ✅ correct):**
```
Orchestrator: Dev, diagnose these 3 bugs
Dev: Found X, Y, Z. Must be implemented by findasale-dev re-invocation.
Orchestrator: Dev, implement the fixes for X, Y, Z [re-invokes]
Dev: [loads files, edits, checkpoints, handoff]
[no context bloat, clean tracking]
```

---

## Affected Skills

- `findasale-dev/SKILL.md` — Line 111 ff., new "Diagnosis-to-Implementation Rule"
- `conversation-defaults/SKILL.md` — Line 280 ff., new "Rule 13"

Both rules enforce this contract from opposite ends:
- Dev side: marks handoff to signal re-invocation needed
- Orchestrator side: gates prevent inline implementation after diagnosis
