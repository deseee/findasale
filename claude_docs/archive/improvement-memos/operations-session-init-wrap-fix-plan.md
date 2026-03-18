# Session Init & Wrap Fix Plan

Created: 2026-03-09 (Session 108)
Status: Active
Owner: findasale-records (all implementation), findasale-ops (verify script)
Audit scope: Sessions 95–107 init/wrap pattern failures

---

## Summary

Seven failure patterns identified across session init and wrap sequences, confirmed
through direct evidence in source files. All seven have specific, bounded fixes.
None require architectural changes. Six are targeted edits to existing docs/skills;
one is a Patrick install action already pending.

---

## Init Gaps

### Init Gap #1 — Rule 3 trigger too narrow

**Root cause:** conversation-defaults Rule 3 originally fired only on ≤5-word
first messages. Status reports, completion updates, and task assignments as
opening messages bypassed session init entirely — Claude responded conversationally
instead of loading STATE.md and beginning work.

**Status:** Fixed in source (Rule 3 expanded 2026-03-09 during Session 107
Power User sweep). Installed skill is still the old version.

**Fix:** Patrick reinstalls conversation-defaults from
`claude_docs/skill-updates-2026-03-09/conversation-defaults-updated.skill/`.
No rule or doc changes needed — source is already correct.

**Owner:** Patrick (install action)
**Effort:** Zero code/doc changes. Already in STATE.md pending actions.

---

### Init Gap #2 — Stale next-session-prompt.md

**Root cause:** next-session-prompt.md is written at wrap, but there is no
verification gate confirming it was actually updated. Sessions 106 and 107 both
ended without touching the file.

**Evidence (confirmed):** File header reads `Written: 2026-03-09 — Session 105
wrap`. Content says "Start Session 106." Session 108 opened two sessions behind
with wrong context. Neither Session 106 nor 107 wrap logs mention updating it.

**Fix (two parts):**

1. **Checklist gate.** Add to `WRAP_PROTOCOL_QUICK_REFERENCE.md` final checklist:
   ```
   ☐ next-session-prompt.md updated (session number, summary, next objective)
   ```

2. **Verify script check.** `scripts/verify-session-wrap.js` must assert that
   next-session-prompt.md was modified in the current session (check
   `Last Updated` header or git diff). Fail wrap if not modified.

**Owner:** findasale-records (checklist edit), findasale-ops (verify script)
**Effort:** Targeted edit to WRAP_PROTOCOL_QUICK_REFERENCE.md + targeted
edit to verify-session-wrap.js

---

### Init Gap #3 — CORE.md §2 skip condition ambiguity

**Root cause:** CORE.md §2 says: "Skip silently if Patrick has already given
a task and context was loaded this session." This was misread as an OR condition
("skip if Patrick gave a task" OR "skip if context was loaded"), causing init to
be skipped on first-message task assignments.

**Status:** Workaround applied in conversation-defaults Rule 3 explanation
(clarifies the skip means subsequent turns only). CORE.md §2 itself still
carries the ambiguous wording and is the authoritative source.

**Fix:** Targeted edit to CORE.md §2. Replace the skip condition line with:

> Skip silently **on subsequent turns** if Patrick has already given a task
> **and** context was loaded in the same session. This skip condition never
> applies to the first message of any session — conversation-defaults Rule 3
> governs first-message handling unconditionally and cannot be bypassed.

**Owner:** findasale-records (CORE.md edit)
**Effort:** Single targeted edit (~2 lines in CORE.md §2)

---

## Wrap Gaps

### Wrap Gap #1 — next-session-prompt not always updated (no hard gate)

**Root cause:** CORE.md §17.3(c) lists next-session-prompt as a required wrap
step, but there is no enforcement checkpoint. The WRAP_PROTOCOL_QUICK_REFERENCE.md
final checklist does not include it. Sessions have been ending with push blocks
issued while next-session-prompt.md sits untouched.

**Fix:** This is the same two-part fix as Init Gap #2 (checklist gate +
verify script check). They should be applied in the same editing pass.

**Owner:** findasale-records + findasale-ops
**Effort:** Folded into Init Gap #2 batch — no additional effort.

---

### Wrap Gap #2 — Push blocks include uncommitted files

**Root cause:** Push blocks are assembled from a running changed-files list
maintained during the session. Subagent-modified files are not always added
to this list when subagents report back. The push block is issued before
cross-checking against `git status --short`, so stray uncommitted files
(MESSAGE_BOARD.json, auctionJob.ts in Session 107) slip through and block
`push.ps1`.

**Fix:** Add to WRAP_PROTOCOL_QUICK_REFERENCE.md, Rule 4a section
(just before "whenever `.\push.ps1` is mentioned, provide the complete
copy-paste block..."):

> **Before assembling the push block:**
> 1. Run `git status --short`.
> 2. Cross-check output against the running changed-files list.
> 3. Any file in `git status` but absent from the running list is a drift
>    signal — add it and determine why it was missed.
> 4. Issue the push block only after the running list and `git status`
>    output match exactly. Never reconstruct the push block from memory
>    alone.

**Owner:** findasale-records
**Effort:** Targeted edit to WRAP_PROTOCOL_QUICK_REFERENCE.md (~6 lines)

---

### Wrap Gap #3 — Records agent path confusion on skill updates

**Root cause:** findasale-records SKILL.md has no documentation of the
two-file reality for skill updates. There is a source copy (in git, under
`claude_docs/skills-package/` or `claude_docs/skill-updates-YYYY-MM-DD/`)
and an installed copy (under `.skills/skills/`, loaded by Claude at runtime).
The agent wrote to the source but not the installed copy, requiring an
unplanned packaging step to complete the update.

**Fix:** Add a "Skill Update Protocol" section to findasale-records SKILL.md:

---
*Section to add:*

### Skill Update Protocol

Every Claude skill exists in two locations:

- **Source copy** (`claude_docs/skills-package/[skill]/SKILL.md`) — lives
  in git, pushed via push.ps1. This is the durable record.
- **Installed copy** (`.skills/skills/[skill]/SKILL.md`) — what Claude loads
  at runtime. Only updated when Patrick reinstalls the .skill file from the
  Cowork UI.

When updating any skill, both steps are required:

1. Edit the source copy → package it as `.skill` (via `package_skill.py`) →
   push source via MCP or push.ps1.
2. Tell Patrick to reinstall from Cowork UI (provide exact path to .skill file).

**Failure mode A:** Edit only the source → Claude still loads the old installed
skill next session. The update has no effect until reinstall.

**Failure mode B:** Edit only the installed copy → change is lost at next
reinstall. Not in git. Not recoverable.

Packaging is never optional. Reinstall instruction is never optional.

---

**Owner:** findasale-records (SKILL.md edit)
**Effort:** Medium — targeted section addition to records SKILL.md (~20 lines)

---

### Wrap Gap #4 — Subagent files not tracked in main session push block

**Root cause:** CORE.md §17.5 requires tracking all subagent-modified files,
but there is no reconciliation step in the wrap checklist. Subagent file
reports from MESSAGE_BOARD.json are not checked against git status before
the push block is issued. This causes the same missing-file problem as
Wrap Gap #2 but through a different path (subagent drift vs. memory failure).

**Fix:** Add to WRAP_PROTOCOL_QUICK_REFERENCE.md, immediately after Step 2
("Verify All Work is Committed"):

> **Step 2a — Subagent reconciliation (required if any subagents were
> dispatched this session):**
> 1. Read MESSAGE_BOARD.json.
> 2. For every file reported by a subagent as created or modified, verify
>    it appears in `git status --short`.
> 3. A subagent-reported file absent from git status is a drift signal —
>    the subagent may have written to a path outside the repo, the file
>    may have been overwritten, or it was not staged. Investigate before
>    issuing the push block.
> 4. Add any missing subagent files to the running changed-files list before
>    proceeding to Step 3.

**Owner:** findasale-records
**Effort:** Targeted edit to WRAP_PROTOCOL_QUICK_REFERENCE.md (~10 lines)

---

### Wrap Gap #5 — Skill install drift (pattern confirmed across sessions 95–107)

**Root cause:** Rules added to a skill's source file repeatedly fail to reach
the installed copy. This occurred twice: sessions 95–102 (Rules 6–8 added to
conversation-defaults source but never deployed to installed skill — discovered
by Session 103 evaluation), and sessions 103–107 (Rule 3 expanded in source
but installed skill still old — discovered opening Session 108).

The current fix for each occurrence is "Patrick reinstalls." That treats the
symptom but not the cause: there is no mechanism to detect when an installed
skill has drifted from its source.

**Fix:** Add a version line to every skill SKILL.md header:
```
Version: N
Last Updated: YYYY-MM-DD (Session NNN)
```

When any skill is edited, increment the version. At session start, conversation-defaults
Rule 3 (or a new Rule 9) should note the expected version. When a skill is dispatched,
the version mismatch becomes visible in the session context — Claude can flag it to
Patrick rather than silently using a stale installed copy.

This is a medium-effort improvement (add version lines to 18 skill files) but
prevents a recurring class of "rule defined but not deployed" failures.

**Owner:** findasale-records (version line additions to all skill source files)
**Effort:** Medium — 18 files, ~1 line each, plus note in CORE.md §2 about version checking

---

## Implementation Plan

Apply all changes in a single findasale-records dispatch. Group as two commits:

**Commit 1 — Behavioral rule fixes (CORE.md + conversation-defaults note):**
- CORE.md §2: clarify skip condition (Init Gap #3)

**Commit 2 — Wrap protocol hardening (three files):**
- WRAP_PROTOCOL_QUICK_REFERENCE.md: add next-session-prompt gate (Wrap Gap #1),
  git-status-first rule (Wrap Gap #2), subagent reconciliation step (Wrap Gap #4)
- findasale-records SKILL.md: add Skill Update Protocol section (Wrap Gap #3)

**Patrick action (already pending — no new dispatch needed):**
- Reinstall conversation-defaults from skill-updates folder (Init Gap #1)

**findasale-ops (lower priority — can be a separate session):**
- verify-session-wrap.js: add next-session-prompt.md modified check (Init Gap #2 / Wrap Gap #1)

---

## Effort Summary

| Gap | Fix target | Effort | Status |
|-----|-----------|--------|--------|
| Init #1 — Rule 3 narrow | Patrick reinstalls skill | Zero (pending install) | Pending Patrick |
| Init #2 — Stale next-session-prompt | Checklist + verify script | Targeted edit × 2 | Not started |
| Init #3 — CORE §2 ambiguity | CORE.md §2 reword | Targeted edit × 1 | Not started |
| Wrap #1 — No next-session-prompt gate | Same as Init #2 | (same batch) | Not started |
| Wrap #2 — Push block misses files | Quick Reference Rule 4a | Targeted edit × 1 | Not started |
| Wrap #3 — Records path confusion | records SKILL.md new section | ~20-line addition | Not started |
| Wrap #4 — Subagent files not tracked | Quick Reference Step 2a | Targeted edit × 1 | Not started |
| Wrap #5 — Skill install drift | Version lines in 18 skill files | ~1 line × 18 files | Not started |

**Total non-Patrick edits:** 5 files touched + 18 skill version lines.
All within scope of a single findasale-records dispatch.

---

## Session 107 Wrap Audit

Session 107 log (2026-03-11) confirms the push block referenced 10 files but
next-session-prompt.md does not appear in the blockers or push block. No mention
of updating it anywhere in the session wrap. Session 106 log also does not
reference it. Both gaps are covered by Wrap Gap #1 fix.

The session-log itself was correctly updated for sessions 106 and 107, confirming
the checklist works for items that ARE on it — the sole failure is the missing
next-session-prompt gate.

---

Last Updated: 2026-03-09 (Session 108)
