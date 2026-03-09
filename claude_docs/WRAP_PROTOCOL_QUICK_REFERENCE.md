# Session Wrap Protocol — Quick Reference Card

**Quick guide:** Copy this → paste into session end checklist

---

## 15 Minutes Before Session Close

### Step 1: Fetch Remote Changes (MCP Sync)

If any MCP pushes happened this session, sync local with remote first:
```bash
git fetch origin main
git status --short
```

**Expected:** Still clean. If conflicts appear, resolve with:
```bash
git checkout --theirs [conflicted-file]
git add [conflicted-file]
```

**Why:** MCP doesn't update Patrick's local tree. Files pushed via MCP mid-session need fetching before wrap edits them, or merge conflicts happen at wrap time (see entry #38 in self_healing_skills.md).

### Step 2: Verify All Work is Committed
```bash
git status --short
```
**Expected:** Empty output. If not, commit now:
```bash
git add [files]
git commit -m "[message]"
```

### Step 3: Run Verification Script
```bash
cd /path/to/FindaSale
node scripts/verify-session-wrap.js
```

**Expected output:**
```
✓ ALL CHECKS PASSED. Safe to close session.
```

**If it fails:** Fix the issue it lists, re-run script.

### Step 4: Verify on GitHub
For each commit made this session, visit:
```
https://github.com/deseee/findasale/commits/main
```
**Expected:** Your commits visible in last 10.

### Step 5: Update session-log.md
**File:** `claude_docs/session-log.md`
**Add at top:**
```markdown
### 2026-03-06 (session XXX — [2-3 word summary])
**Worked on:** [1–2 sentences what was accomplished]
**Decisions:** [Key decisions made]
**Token efficiency:** [tasks completed, subagent calls, qualitative burn assessment]
**Next up:** [What's next]
**Blockers:** [Any issues]
```

### Step 6: Report Summary to Patrick
```
## Session Wrap Summary
- Commits: [number]
- Files changed: [list]
- Verification: ✓ All checks passed
- Status: Ready to merge
```

---

## During Session (Do This Continuously)

### Rule 1: Commit After Each Logical Batch
Don't batch 10 changes together. After each fix/feature:
```bash
git add [specific files]
git commit -m "[message]"
```

### Rule 2: Always Commit Before Mentioning Push
1. Edit files
2. Run `git add [files]`
3. Run `git commit -m "[message]"`
4. Verify: `git status --short` (should be empty)
5. **Then** tell Patrick "Ready to push"

### Rule 3: Check Status Every 30–60 Minutes
```bash
git status --short
```
If anything shows up, decide: commit or discard?

### Rule 4: Decide MCP vs Manual Push
- **If ≤3 files AND ≤25k tokens:** Use MCP push
- **If >3 files OR >25k tokens:** Tell Patrick to use `.\push.ps1`

### Rule 4a: Full Push Instructions Are Required
Whenever `.\push.ps1` is mentioned, provide the complete copy-paste block — every changed file as its own explicit `git add [file]` line. Never `git add -A` or `git add .`. Never reconstruct from memory at wrap time; maintain a running changed-files list throughout the session.

```powershell
cd C:\Users\desee\ClaudeProjects\FindaSale
git add [file1]
git add [file2]
git add [file3]
git commit -m "[descriptive message]"
.\push.ps1
```

### Rule 5: Subagents Also Commit
When spawning a subagent, tell it:
```
Before you finish, verify:
  git status --short  # should be empty

If not empty, commit:
  git add [files] && git commit -m "[message]"

Report: "Working tree clean."
```

---

## Failure Modes

| Check | Fails If | Fix |
|-------|----------|-----|
| Working tree clean | Uncommitted files exist | `git add [files] && git commit` |
| context.md fresh | >24 hours old | `node scripts/update-context.js && git add claude_docs/context.md && git commit` |
| No secrets in STATE.md | Plaintext credentials found | Remove credentials, reference `.env` file |
| No secrets in self_healing_skills.md | Plaintext credentials found | Remove credentials |
| session-log.md updated | Today's date not in first entry | Add session entry at top of file |
| No orphan files | `new*.txt`, `*.tmp`, etc. found | Delete or move to archive/ |
| Line endings normalized | `.gitattributes` missing or incomplete | Add `* text=auto eol=lf` to `.gitattributes` |

---

## Emergency Fixes

### If Script Fails (Example: Dirty Tree)
```bash
# See what's dirty
git status --short

# Commit it
git add packages/frontend/pages/search.tsx
git commit -m "fix: search pagination"

# Re-run verification
node scripts/verify-session-wrap.js

# Should now pass
```

### If Script Fails (Example: Stale context.md)
```bash
# Regenerate
node scripts/update-context.js

# Commit
git add claude_docs/context.md
git commit -m "chore: refresh context"

# Re-run verification
node scripts/verify-session-wrap.js
```

### If You Run Out of Context Mid-Session
```bash
# Commit immediately
git add [current files]
git commit -m "WIP: [what you were doing]"

# Update session log with partial summary
# Tell Patrick: "Context exhausted. Latest work committed."

# Next session can continue
```

---

## When to Reference Full Protocol

- **General questions:** SESSION_WRAP_PROTOCOL.md §During-Session Discipline
- **Edge cases:** SESSION_WRAP_PROTOCOL.md §Exceptions & Edge Cases
- **Script details:** VERIFICATION_SCRIPT_SPEC.md
- **What's being updated:** WRAP_PROTOCOL_INTEGRATION.md

---

## Checklist for Session Close

```
Before closing, verify:
 ☐ git status --short is empty
 ☐ node scripts/verify-session-wrap.js passes
 ☐ All commits visible on GitHub
 ☐ session-log.md updated for today
 ☐ Summary message to Patrick is ready
```

If all checked: Safe to close.

---

## For Patrick (Summary You'll See)

At session end, you'll get a message like:

```
## Session 84 Wrap Summary

### Work Done
- Fixed search pagination bug
- Created support knowledge base
- Updated session log

### Commits Made
1. "fix: search pagination off-by-one"
   - packages/backend/src/controllers/searchController.ts
   - packages/frontend/pages/search.tsx

2. "docs: bootstrap support knowledge base"
   - claude_docs/guides/support-kb.md (new)

3. "chore: update session log"
   - claude_docs/session-log.md

### Verification
✓ Git working tree clean
✓ context.md current
✓ No secrets in docs
✓ session-log.md updated
✓ All commits on GitHub

### Status
Ready to merge. No blockers.
```

This tells you exactly what changed and confirms everything is on GitHub. You can review on GitHub before pulling, or just pull and continue.

---

**End of Quick Reference.**
