# Session 84 Wrap Analysis — Proposed Diffs for Review

Route through **findasale-records Tier 1** for approval before implementing.

---

## DIFF 1: SESSION_WRAP_PROTOCOL.md — Add Fetch Step (Rule 4 renamed to Rule 5)

**File:** `claude_docs/SESSION_WRAP_PROTOCOL.md`

**Location:** After line 113 (end of Rule 3: "Never Let Unstaged Changes Accumulate")

**Action:** Insert new rule + update numbering of subsequent rules

```diff
### Rule 3: Never Let Unstaged Changes Accumulate

**Red flag:** `git status --short` shows files you edited but haven't committed.

**Daily duty (every 30–60 min of work):**
```bash
git status --short
```

If any untracked files or modifications exist, **stop immediately** and:
1. Decide if the change is intentional (editing a file mid-feature? Commit it.)
2. If accidental, discard: `git restore [file]`
3. If intentional, stage and commit

**Why:** By session end, there should be NO untracked or modified files. The moment the session closes, Patrick gets a message "Work is done — here's what changed." If files are unstaged, he has to guess whether they're intentional work or noise.

+### Rule 4: Fetch Remote Before Final Wrap Commit
+
+**Trigger:** About to stage and commit wrap files (session-log.md, context.md, .last-wrap)
+
+**Pattern:**
+```bash
+git fetch origin main
+git status --short
+```
+
+Expected: Still clean (no merge conflicts if files are unique to this session).
+
+**Why:** If any MCP pushes happened during the session, Patrick's local repo is behind GitHub.
+Fetching before wrap commit prevents merge conflicts from files that were pushed via MCP
+mid-session but not yet pulled locally. Example: Records agent pushes `patrick-language-map.md`
+early, then wrap protocol edits it locally → fetch prevents collision.
+
+**Timing:** Do this IMMEDIATELY before editing session-log.md, context.md, or .last-wrap
+in the wrap protocol. Not before feature work — only at wrap time.
+
+**If conflicts appear:**
+```bash
+git status  # see conflicted files
+git checkout --theirs [file]  # take remote version for MCP-pushed files
+git add [file]
+# Then proceed with wrap commit
+```

-### Rule 4: MCP Push Discipline
+### Rule 5: MCP Push Discipline
```

**Also update:** All subsequent "Rule X" → "Rule X+1" in the §During-Session Discipline section.

---

## DIFF 2: SESSION_WRAP_PROTOCOL.md — Add MCP Coordination Section

**File:** `claude_docs/SESSION_WRAP_PROTOCOL.md`

**Location:** After "During-Session Discipline" section (around line 150), add new section before "Exceptions & Edge Cases"

```diff
+---
+
+## Mid-Session MCP Pushes — Wrap Coordination
+
+### Pattern
+
+If any agent pushed files via `mcp__github__push_files` during this session:
+
+1. **Immediately after the MCP push:** Update `claude_docs/next-session-prompt.md` or `session-log.md` entry with:
+   ```
+   MCP push this session: [list files]. Note: may require git fetch at wrap time.
+   ```
+
+2. **At session wrap (before final `git add` for wrap files):**
+   - Run `git fetch origin main`
+   - If `git status --short` shows any merge conflict markers, resolve with:
+     ```bash
+     git checkout --theirs [conflicted-file]
+     git add [conflicted-file]
+     ```
+   - Proceed with normal wrap commit
+
+### Why
+
+MCP push directly updates GitHub without updating Patrick's local tree. When wrap protocol
+locally edits the same files later, `git merge origin/main` (from push.ps1) finds the
+remote version already exists → merge conflict.
+
+This coordination step syncs the local tree with remote changes **before** wrap edits
+the files, preventing the collision entirely.
+
+### Example
+
+Session 84:
+- Records agent MCP-pushed `claude_docs/patrick-language-map.md` at 1:00 PM
+- Wrap protocol locally edited `patrick-language-map.md` + `context.md` at 3:00 PM
+- Without `git fetch` before wrap commit, `.\push.ps1` merged GitHub version → conflict
+
+**Fix:** Add `git fetch origin main` between 1:00 PM MCP push and 3:00 PM wrap edit.
+
```

---

## DIFF 3: WRAP_PROTOCOL_QUICK_REFERENCE.md — Update Step 1

**File:** `claude_docs/WRAP_PROTOCOL_QUICK_REFERENCE.md`

**Location:** Replace "## 15 Minutes Before Session Close" section (lines 1–30)

```diff
-## 15 Minutes Before Session Close
-
-### Step 1: Verify All Work is Committed
-```bash
-git status --short
-```
-**Expected:** Empty output. If not, commit now:
-```bash
-git add [files]
-git commit -m "[message]"
-```

+## 15 Minutes Before Session Close
+
+### Step 1: Fetch Remote Changes (MCP Sync)
+
+If any MCP pushes happened this session, sync local with remote first:
+```bash
+git fetch origin main
+git status --short
+```
+
+**Expected:** Still empty. If conflicts appear, resolve with:
+```bash
+git checkout --theirs [conflicted-file]
+git add [conflicted-file]
+```
+
+**Why:** MCP doesn't update Patrick's local tree. Files pushed via MCP mid-session need
+fetching before wrap edits them, or merge conflicts happen at wrap time (see entry #38 in self_healing_skills.md).
+
+### Step 2: Verify All Work is Committed
+```bash
+git status --short
+```
+**Expected:** Empty output. If not, commit now:
+```bash
+git add [files]
+git commit -m "[message]"
+```
```

**Also update:** Subsequent step numbering (Step 2 → Step 3, Step 3 → Step 4, etc.)

---

## DIFF 4: CORE.md — Add MCP Pushes + Local Edit Warning

**File:** `claude_docs/CORE.md`

**Location:** End of §10. GitHub Push Batching Rule (after line 182)

```diff
This applies to every session wrap and any mid-session push. Never revert to a single
giant push to "save commits" — the token limit will kill it.

+**CRITICAL — MCP Mid-Session → Fetch at Wrap:**
+After any MCP push, **do not edit the same files locally without fetching first.**
+MCP bypasses the local repo (writes directly to GitHub). Remote changes won't sync
+to Patrick's tree until `git fetch`. Pattern:
+
+1. Subagent MCP-pushes files (e.g. `patrick-language-map.md`)
+2. Wrap protocol locally edits those files
+3. At wrap time, run `git fetch origin main` **before** staging wrap files
+4. If conflicts appear, resolve with `git checkout --theirs [file]`
+
+See entry #38 in `self_healing_skills.md` for details and examples.

### MCP vs PowerShell Decision Rule
```

---

## DIFF 5: self_healing_skills.md — Add Entry #38

**File:** `claude_docs/self_healing_skills.md`

**Location:** After entry #37 (line 236), before "Last Updated" line

```diff
### 37. Session Ended Without Committing Work
**Trigger:** Claude finishes meaningful work, updates documentation, but leaves git status dirty without committing changes.
**Fix:** Before ending ANY session, commit all changed files: `git add [specific files] && git commit -m "[message]"`. Verify with `git status --short` (should be empty). Run `bash scripts/session-wrap-check.sh` (or equivalent) and confirm it passes. Do not end the session if the check fails.
**Prevention:** Session wrap protocol (CORE.md §15) is mandatory. Every agent ends with the wrap checklist. Subagents report "Working tree clean" before handoff.
**Known impact:** Sessions that end dirty cause drift discovery in the next session, wasted recovery time, and GitHub/local sync mismatches.

+### 38. MCP Push Mid-Session + Local Edit at Wrap = Merge Conflict
+**Trigger:** One agent (subagent or skill) MCP-pushes files early in session (e.g. `records-audit-*.md`, `patrick-language-map.md`). Wrap protocol later locally edits the same files. Patrick runs `.\push.ps1` → merge conflict on 2+ files when `git merge origin/main` runs.
+**Root cause:** `mcp__github__push_files` writes directly to GitHub without updating Patrick's local tree. When wrap commits local changes to the same files, GitHub has a newer version. `git merge origin/main` (from push.ps1) detects the divergence and raises a conflict.
+**Prevention (primary):** Before final wrap commit, run `git fetch origin main`. This syncs Patrick's local HEAD with GitHub. If files were MCP-pushed, they're now in the local tree and won't conflict when wrap edits them.
+**Prevention (secondary):** Never MCP-push files that will be edited again at wrap time. If wrap protocol touches a file (session-log.md, context.md, patrick-language-map.md), push it via PowerShell + `.\push.ps1` in the same batch, not via MCP mid-session.
+**Fix (if conflict happens):**
+```powershell
+git status  # see conflicted files
+git checkout --theirs [conflicted-file]
+git add [conflicted-file]
+git commit -m "resolve: accept remote version of MCP-pushed file"
+.\push.ps1
+```
+**Known instance:** Session 84 — Records agent MCP-pushed `patrick-language-map.md` and `claude_docs/archive/records-audit-2026-03-06.md` early. Wrap protocol locally edited `patrick-language-map.md` + `context.md` later. Patrick ran `.\push.ps1` → merge conflict. Resolved with `git checkout --theirs [files]` + commit.

```

**Also update:** "Last Updated" line to reflect the new entry.

---

## Implementation Notes

### Tier 1 Review Path

Route to **findasale-records** skill with:
- This file (workflow-retrospectives/session-84-proposed-diffs.md)
- The analysis file (session-84-wrap-analysis.md)

Ask for review of:
1. Correctness of root cause analysis
2. Appropriateness of the `git fetch` step (does it fit Patrick's PowerShell workflow?)
3. Clarity of the MCP coordination instructions
4. Whether entry #38 in self_healing_skills.md is understandable enough

### When Patrick Approves

Apply diffs in this order:
1. SESSION_WRAP_PROTOCOL.md (both diffs)
2. WRAP_PROTOCOL_QUICK_REFERENCE.md
3. CORE.md
4. self_healing_skills.md

Then commit as single batch:
```powershell
git add claude_docs/SESSION_WRAP_PROTOCOL.md `
    claude_docs/WRAP_PROTOCOL_QUICK_REFERENCE.md `
    claude_docs/CORE.md `
    claude_docs/self_healing_skills.md
git commit -m "doc: add MCP push coordination + fetch-at-wrap rule to prevent merge conflicts"
.\push.ps1
```

### Validation

After merge:
1. Next session: have a subagent MCP-push a file mid-session
2. At wrap, verify `git fetch origin main` runs cleanly
3. Confirm session-log.md notes which files were MCP-pushed
4. Wrap should complete without conflicts
