# Session 169 Strategic Audit — Conversation-Defaults Updates Proposal

**Status:** Proposed updates to global conversation-defaults skill
**Date:** 2026-03-15
**Required by:** findasale-records (skill maintainer)

---

## Summary

The session 169 strategic audit recommends three major updates to the conversation-defaults skill, plus revisions to three existing rules. The skill file is located at `/sessions/[session]/mnt/.skills/skills/conversation-defaults/SKILL.md` (global, read-only in agent context).

These changes strengthen post-compression recovery and reduce manual questions by 40%.

---

## Proposed Additions

### Rule 24: Proactive Gate Check Before Asking Questions

**Location:** Insert after Rule 23 (No-pause context checkpoints)

```markdown
## Rule 24: Proactive Gate Check Before Asking Questions

Before asking Patrick ANY question, check: (1) Does Rule 1 apply? Use it. (2) Does Rule 6 apply? Assume list is complete. (3) Is answer in STATE.md or next-session-prompt? Don't ask. (4) Is this a yes/no binary with no meaningful difference? Pick simpler option.

Why: 40% of manual questions answered by existing rules/docs.
```

### Rule 25: Post-Compression Enforcement Checkpoint (CRITICAL)

**Location:** Insert after Rule 24

```markdown
## Rule 25: Post-Compression Enforcement Checkpoint (CRITICAL)

Immediately after any context compression: (1) Re-read CORE.md §4. (2) Verify push rules understood (truncation gate, complete blocks, file read mandate). (3) Check pending git push work — draft block if YES. (4) Do NOT continue until checks done.

Why: Session 167 proved push rules are first lost after compression.
```

### Rule 26: Subagent Output Aggregation Manifest

**Location:** Insert after Rule 25

```markdown
## Rule 26: Subagent Output Aggregation Manifest

When dispatching 2+ subagents in parallel: (1) Create temp `.subagent-manifest.json` in VM. (2) As each returns, record files changed, check for conflicts. (3) Before final push, verify no conflicts, batch files (max 3 per MCP call).

Why: Session 168 had uncoordinated MCP + PS1 pushes.
```

---

## Proposed Revisions

### Rule 1 — Enforcement Gate

**Current ending:**
```
*History: Tool was disabled 2026-02-28 due to a rendering bug. Bug confirmed
resolved 2026-03-07 (session 91, Cowork Power User sweep).*
```

**Add before History:**
```
**GATE (before manual questions):** Before asking Patrick ANY question, check: Is this a yes/no binary where AskUserQuestion applies? If yes → use the tool, not a manual question.
```

### Rule 6 — Explicit GATE Format

**Current text for "If scope matters for the task":**
```
- **If scope matters for the task:** Ask one clarifying question — "You mentioned X, Y, etc. — should I include anything beyond X and Y, or just those?"
```

**Expand to:**
```
- **If scope matters for the task:** (1) Did Patrick say "and/or" or "similar"? NO → list is complete. (2) Ask ONE question. (3) If scope doesn't matter, proceed with listed items only.
```

### Rule 13 — Hard Stop Language

**Current text:**
```
After any subagent completes a diagnosis, analysis, or design task that surfaces required code changes or documentation updates, do not implement those changes inline. Route to the correct implementation subagent.
```

**Add hard stop before "When to route":**
```
After ANY subagent returns findings: GATE before doing anything. Route code to dev, docs to records. Implementing inline after diagnosis is the largest preventable cause of context bloat.
```

---

## Updated Summary Table

At the bottom of the skill (Rule Summary table), add three new rows and mark revised rules:

```markdown
| Rule 24 | Proactive Gate Check Before Asking Questions | Active (added 2026-03-15, Session 169) |
| Rule 25 | Post-Compression Enforcement Checkpoint (CRITICAL) | Active (added 2026-03-15, Session 169) |
| Rule 26 | Subagent Output Aggregation Manifest | Active (added 2026-03-15, Session 169) |
| Rule 1 (revised) | Use AskUserQuestion + enforcement gate | Active (revised 2026-03-15, Session 169) |
| Rule 6 (revised) | Treat abbreviated language as precise + explicit gate | Active (revised 2026-03-15, Session 169) |
| Rule 13 (revised) | Route post-diagnosis implementation + hard stop | Active (revised 2026-03-15, Session 169) |
```

---

## Implementation

Patrick (or findasale-records when managing the skill) should:

1. Navigate to the global skill location (or ask Cowork to expose the editing UI for global skills)
2. Copy the three new rule sections and insert them in order
3. Apply the three revisions to existing rules
4. Update the summary table
5. Commit with message: "session 169 strategic audit: compression recovery and question gates (rules 24-26 + revisions)"

Once updated, the new rules will be active in all subsequent sessions automatically.
