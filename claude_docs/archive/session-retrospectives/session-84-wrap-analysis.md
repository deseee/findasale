# Session 84 Wrap Analysis — Root Cause + Fixes

**Date:** 2026-03-06
**Issue:** Two-stage push problem: MCP pushed files, then local edits created merge conflicts at wrap
**Impact:** Patrick had to run 3 commits instead of 1

---

## What Happened

1. **Phase 1 — MCP push (early session):** Records agent pushed `claude_docs/archive/records-audit-2026-03-06.md` and `claude_docs/patrick-language-map.md` via `mcp__github__push_files` without pulling these changes locally.

2. **Phase 2 — Local edits (late session):** Wrap protocol edited `.last-wrap`, `RECOVERY.md`, `patrick-language-map.md`, and `context.md` locally without fetching the remote changes first.

3. **Phase 3 — Session wrap:** Called `git add` + `git commit` for wrap files, then Patrick ran `.\push.ps1`.

4. **Collision:** `push.ps1` ran `git fetch + git merge origin/main`. The two files (`records-audit-2026-03-06.md`, `patrick-language-map.md`) were already on GitHub but not in Patrick's local tree → merge conflict.

5. **Resolution:** Patrick ran `git checkout --theirs` on both files, then committed and pushed again.

---

## Root Cause Analysis

### Primary: No "Fetch Before Wrap" Rule

The **SESSION_WRAP_PROTOCOL.md** defines wrap discipline but does NOT include a mandatory fetch step before the final commit.

**Current rule (SESSION_WRAP_PROTOCOL.md §During-Session Discipline, Rule 2):**
```
Verify git status --short is empty. If not, commit now.
```

**Missing step:**
```
Fetch remote changes before final wrap commit.
```

When MCP pushes files mid-session, Patrick's local HEAD falls behind GitHub. At wrap time, the working tree is clean but the repo is in a "ahead + behind" state. The wrap protocol assumes `git status --short` cleanliness means the repo is safe to commit — but it doesn't account for remote drift.

### Secondary: No MCP Push Tracking in Session-Log

When the Records agent pushed files via MCP, there was no notation in the session-log or next-session-prompt saying "these files are now on GitHub but not local."

**Pattern:** If MCP pushes happen mid-session, Patrick needs explicit instructions to fetch before any local edits touch the same files.

### Tertiary: Duplicate File Edits Across Layers

`patrick-language-map.md` was:
1. Created/edited by workflow agent
2. Pushed via MCP
3. Later edited again during session wrap without a local pull

Same file, two edit sources → classic merge conflict.

---

## Why This Pattern Will Repeat

1. **Subagents can push via MCP** (workflow, records, QA agents all do)
2. **Session wrap edits files independently** (STATE.md, context.md, session-log.md)
3. **Wrap protocol does NOT require fetch before wrap commit**
4. **No tracking system** notes which files were MCP-pushed mid-session

This is a structural gap, not a one-time error.

---

## Proposed Fixes

### Fix 1: Mandatory Fetch Before Wrap Commit

**File:** `claude_docs/SESSION_WRAP_PROTOCOL.md`
**Location:** §During-Session Discipline, add after Rule 3

**New Rule 4 (revised numbering):**

```markdown
### Rule 4: Fetch Remote Before Final Wrap Commit

Before updating `session-log.md`, `context.md`, or `.last-wrap` at session wrap:

```bash
git fetch origin main
```

**Why:** If any MCP pushes happened during the session, Patrick's local repo is behind.
Fetching before the final commit prevents merge conflicts from files that were
pushed remotely but not yet pulled locally.

**Timing:** Do this IMMEDIATELY before editing wrap files. Not before feature work — only at wrap time.

**Verification:** After fetch:
```bash
git status --short
# Should still be empty if no merge conflicts exist locally.
# If it shows commits, they're remote-only and will merge cleanly.
```
```

### Fix 2: MCP Push Tracking in Wrap Prompt

**File:** `claude_docs/SESSION_WRAP_PROTOCOL.md`
**Location:** §Exceptions & Edge Cases (add new subsection)

**New Subsection:**

```markdown
## Mid-Session MCP Pushes — Wrap Coordination

### Pattern
If any agent pushed files via `mcp__github__push_files` during this session:

1. **After the MCP push:** Update next-session-prompt.md or session-log.md with:
   ```
   MCP push this session: [files pushed] (may create merge conflicts at wrap).
   ```

2. **At session wrap (before final commit):**
   - Run `git fetch origin main`
   - If `git status` shows merge conflict markers, resolve with `git checkout --theirs [files]`
   - Proceed with wrap commit

### Why
MCP push + local edit of the same file = merge conflict at wrap time.
Fetching preemptively prevents surprise conflicts.
```

### Fix 3: Pre-Wrap Checklist — Explicit Fetch Step

**File:** `claude_docs/WRAP_PROTOCOL_QUICK_REFERENCE.md`
**Location:** §15 Minutes Before Session Close

**Update Step 1:**

Old:
```markdown
### Step 1: Verify All Work is Committed
```bash
git status --short
```
**Expected:** Empty output.
```

New:
```markdown
### Step 1: Fetch Remote Changes (Before Final Wrap Commit)

If any MCP pushes happened this session, sync local first:
```bash
git fetch origin main
git status --short
# Should still be empty if no conflicts.
# If conflicts appear, resolve with: git checkout --theirs [files]
```

### Step 2: Verify All Work is Committed
```bash
git status --short
```
**Expected:** Empty output.
```

### Fix 4: Update CORE.md GitHub Push Batching Rule

**File:** `claude_docs/CORE.md`
**Location:** §10. GitHub Push Batching Rule

**Add at end of section (before "This applies to..."):**

```markdown
**Critical:** After any MCP push, **DO NOT edit the same files locally without fetching first.**
MCP bypasses the local repo — remote changes won't be in Patrick's tree until `git fetch`.
Pattern: MCP push → note in session-log → fetch at wrap before editing wrap files.
```

### Fix 5: Self-Healing Skills Entry — MCP Push + Local Conflict

**File:** `claude_docs/self_healing_skills.md`
**Add new entry after #37:**

```markdown
### 38. MCP Push Mid-Session + Local Edit at Wrap = Merge Conflict

**Trigger:** MCP pushed files (e.g. `records-audit-*.md`, `patrick-language-map.md`) early in session. Later, wrap protocol locally edits the same files. Patrick runs `.\push.ps1` → merge conflict on 2+ files.

**Root cause:** MCP push writes directly to GitHub without updating Patrick's local tree. When wrap commits local changes to the same files, `git merge origin/main` (from push.ps1) finds the remote version and collides.

**Prevention (primary):** Before final wrap commit, run:
```bash
git fetch origin main
```
This syncs Patrick's tree with GitHub before wrap edits files. If files were MCP-pushed, they'll be in the local HEAD and won't conflict.

**Prevention (secondary):** Never MCP-push files that will be edited again at wrap time (e.g. `patrick-language-map.md`). If wrap protocol will edit a file, push it via PowerShell + `.\push.ps1` in the same commit batch, not via MCP mid-session.

**Fix (if conflict happens):**
```powershell
git checkout --theirs [conflicted-files]
git add [conflicted-files]
git commit -m "resolve: accept remote versions of MCP-pushed files"
.\push.ps1
```

**Known instance:** Session 84 — Records agent MCP-pushed `patrick-language-map.md`. Wrap protocol locally edited it → conflict on push. Patrick resolved with `git checkout --theirs`.
```

---

## Implementation Summary

| File | Change | Tier | Proposed? |
|------|--------|------|-----------|
| SESSION_WRAP_PROTOCOL.md | Add Rule 4: "Fetch Remote Before Final Wrap Commit" | 1 | Yes |
| SESSION_WRAP_PROTOCOL.md | Add subsection: "Mid-Session MCP Pushes — Wrap Coordination" | 1 | Yes |
| WRAP_PROTOCOL_QUICK_REFERENCE.md | Update Step 1 to include `git fetch origin main` | 1 | Yes |
| CORE.md §10 | Add warning: "After MCP push, fetch before editing same files" | 1 | Yes |
| self_healing_skills.md | Add entry #38: "MCP Push Mid-Session + Local Edit = Conflict" | 2 | Yes |

---

## Why This Fixes the Pattern

1. **Mandatory fetch at wrap time** prevents local/remote divergence from accumulating
2. **MCP push tracking** in session-log makes it visible which files need watching
3. **Pre-wrap checklist** makes fetch a routine step, not an afterthought
4. **Self-healing entry** documents the collision pattern for future detection
5. **CORE.md warning** reminds future subagents not to MCP-push files that wrap will edit

---

## Testing Recommendations

Run the following after merging these changes:

1. **Dry run:** Spawn a subagent (findasale-records) to push a new doc file via MCP mid-session. At wrap time, verify `git fetch origin main` runs cleanly without conflicts.

2. **Conflict scenario:** Deliberately MCP-push `patrick-language-map.md` in one session, edit it locally at wrap in the next. Confirm `git fetch` reveals the conflict and `git checkout --theirs` resolves it cleanly.

3. **Document the pattern in session-log:** Verify session-log.md entry notes "MCP push: X files" when MCP pushes happen, and wrap checklist references it.

---

## Status

All proposed changes are Tier 1 (structural rules). Route through **findasale-records** for review before implementation. Patrick approval recommended on the fetch-before-commit rule to confirm it fits the PowerShell workflow.
