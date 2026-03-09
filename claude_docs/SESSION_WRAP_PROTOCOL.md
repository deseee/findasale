# Session Wrap Protocol — FindA.Sale

**Version:** 1.0
**Effective:** 2026-03-06
**Owner:** findasale-workflow
**Applies to:** All Claude sessions (main flow, subagents, background tasks)

---

## Purpose

Prevent loss of session work by enforcing a mandatory commit-before-close protocol. Sessions have repeatedly ended with uncommitted changes, causing:

- Work to vanish between sessions (session 82 → session 83: audit work never pushed)
- CRLF normalization to revert unpushed changes (session 82, batch 15)
- Stale documentation to obscure actual state (roadmap regression, session 78)
- Subagent work to be orphaned without git history

This protocol ensures **100% of work is committed and pushed before the session ends**.

---

## Pre-Session Start Checklist

**When:** Every session start
**Owner:** Claude (main session or subagent)
**Blocking:** Session cannot proceed if checks fail

### 1. Load All Context Files
- [ ] `claude_docs/STATE.md` — current project state
- [ ] `claude_docs/session-log.md` — recent session history
- [ ] `claude_docs/CORE.md` — behavior rules
- [ ] `CLAUDE.md` (project-level, at repo root)
- [ ] Global `CLAUDE.md` (Patrick's settings, if accessible)

**Verification:** After reading, note in your response: "Context loaded: [files read]"

### 2. Check context.md Freshness
- [ ] Read `claude_docs/context.md` modification time (stat command)
- [ ] If older than 24 hours, **regenerate immediately**: `node scripts/update-context.js`

**Verification:** If regenerated, note: "context.md regenerated (was X hours stale)"

### 3. Verify Git Working Tree is Clean at Start
```bash
cd /path/to/FindaSale
git status --short
```

**Expected output:** Empty (no untracked files, no modifications).

**If not clean:**
- Run: `git diff HEAD --stat` (show what's modified)
- Ask Patrick: "Found uncommitted changes from previous session: [list]. Should I stage and commit these, or discard them?"
- Do NOT proceed until working tree is clean.

**Verification:** Note at session start: "Git working tree clean. Ready to begin."

---

## During-Session Discipline

### Rule 1: Commit Incrementally, Don't Batch Wildly

**Anti-pattern:** Work for 3 hours, then commit everything at once.
**Pattern:** Commit after each logical feature or fix.

Batch sizes:
- **Small fix or doc update:** Commit immediately after editing
- **Feature with 1–3 files:** Commit together
- **Feature with 4+ files:** Break into 2 logical commits

Example:
```
Session work:
1. Fix bug in searchController.ts → Commit immediately: "fix: search pagination off-by-one"
2. Add Support KB file (new file) → Commit: "docs: bootstrap support knowledge base"
3. Fix 5 TS errors across 3 pages → Commit: "chore: fix type errors in guest checkout flow"
```

**Why:** Smaller commits are easier to push (GitHub MCP ≤5 files / ≤25k tokens). If a batch is too large, it either blocks on MCP size limits OR Patrick has to push manually, and that manual push is where work gets lost.

### Rule 2: Always Run `git add [files]` + `git commit` Before Mentioning Push

**Pattern:**
1. Edit files
2. Stage files explicitly: `git add packages/backend/src/search.ts packages/frontend/pages/search.tsx`
3. Create commit: `git commit -m "fix: search pagination off-by-one"`
4. Check status: `git status --short` (should show clean)
5. **Only then** say to Patrick: "Ready to push. Changes: [summary]"

**Anti-pattern:**
- Tell Patrick "Run `git push`" without confirming a commit exists
- Chain commands: `git add ... && git commit ... && git push` (breaks if commit fails silently)
- Assume Patrick will commit — he won't, the session just ends

**Verification:** Before closing the session, run `git status --short`. If not empty, you haven't finished.

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

### Rule 4: Fetch Remote Before Final Wrap Commit

**Trigger:** About to stage and commit wrap files (session-log.md, context.md, .last-wrap)

**Pattern:**
```bash
git fetch origin main
git status --short
```

Expected: Still clean (no merge conflicts if files are unique to this session).

**Why:** If any MCP pushes happened during the session, Patrick's local repo is behind GitHub. Fetching before wrap commit prevents merge conflicts from files that were pushed via MCP mid-session but not yet pulled locally. Example: Records agent pushes `patrick-language-map.md` early, then wrap protocol edits it locally → fetch prevents collision.

**Timing:** Run IMMEDIATELY before editing session-log.md, context.md, or .last-wrap. Not before feature work — only at wrap time.

**If conflicts appear:**
```bash
git status  # see conflicted files
git checkout --theirs [file]  # take remote version for MCP-pushed files
git add [file]
# Then proceed with wrap commit
```

**Known instance:** Session 84 — Records agent MCP-pushed `patrick-language-map.md` and `claude_docs/archive/records-audit-2026-03-06.md` early in session. Wrap protocol locally edited `patrick-language-map.md` + `context.md` later. Patrick had to manually resolve conflicts. See entry #38 in self_healing_skills.md.

### Rule 5: MCP Push Discipline

**Trigger:** After committing a batch, decide: MCP push or manual push?

**MCP is OK if:**
- ≤3 files changed in this commit (hard limit per CORE.md §10)
- Total token count of changed files ≤25,000 (rough: 1 token ≈ 4 chars)
- Files are code/config only (no documentation rewrites)

**Use MCP:**
```
Estimated token count: 4,200 chars ≈ 1,050 tokens
Files: searchController.ts (1.8kb), search.tsx (2.4kb) → Total ≤5k chars ✓
→ Use mcp__github__push_files
```

**Defer to Patrick's push.ps1 if:**
- >3 files changed
- >25k tokens combined
- Changes include documentation rewrites
- Files are >1MB
- Uncertainty about token count

**REQUIRED when deferring to push.ps1 — provide the FULL block:**
Every `.\push.ps1` mention must include a complete, copy-paste-ready block with every changed file as its own explicit `git add [file]` line. Never `git add -A` or `git add .`. Never omit files or say "and the rest" — list every file individually.

```powershell
cd C:\Users\desee\ClaudeProjects\FindaSale
git add [file1]
git add [file2]
git add [file3]
git commit -m "[descriptive message]"
.\push.ps1
```

Maintain a running changed-files list from the first edit of the session. Never reconstruct at wrap time — you will miss files.

**Verification:** After MCP push, verify the commit is on GitHub:
```bash
git log --oneline -1
# Should show: <your commit message>
# Now check GitHub: browse to main branch, confirm commit appears in last 5
```

### Rule 6: Subagent Handoff Includes Commit Status

**When spawning a subagent:**
- Ensure working tree is clean before handing off
- Subagent must ALSO follow this protocol
- At subagent end, working tree must be clean again

**Handoff instruction (add to subagent prompt):**
```
Before you finish, run:
  git status --short

If not empty, commit any changes:
  git add [files]
  git commit -m "[your commit message]"

Then report: "Working tree clean. Ready for next session."
```

---

## Session End Protocol — Mandatory Steps

**When:** 15 minutes before ending the session
**Owner:** Claude (this agent or main session)
**Must complete:** YES — session cannot close without this passing

### Step 1: Run Session-Wrap Verification Script

```bash
PROJECT_ROOT=$(ls -d /sessions/*/mnt/FindaSale 2>/dev/null | head -1)
node "$PROJECT_ROOT/scripts/verify-session-wrap.js"
```

**Script checks:** (see Specification section below)
- [ ] Git working tree is clean
- [ ] All relevant files are committed
- [ ] context.md is current
- [ ] STATE.md has no plaintext secrets
- [ ] session-log.md is updated with this session's work
- [ ] No orphan .txt, .tmp, or debug files exist
- [ ] All files are normalized (no CRLF phantoms)

**Expected output:**
```
✓ Git working tree clean
✓ context.md current (updated 2h ago)
✓ STATE.md has no secrets
✓ session-log.md updated (2026-03-06 16:45:12)
✓ No orphan files found
✓ All line endings normalized
✓ Session wrap complete. Safe to close.
```

**If any check fails:**
```
✗ Git working tree dirty. Uncommitted files:
  - packages/frontend/pages/search.tsx (modified)
  - claude_docs/new-doc.md (untracked)

Action required:
  1. Run: git status --short
  2. Stage/commit: git add [files] && git commit -m "..."
  3. Re-run: node scripts/verify-session-wrap.js
```

### Step 2: Update session-log.md

**File:** `claude_docs/session-log.md`
**Format:** Add an entry for THIS session at the top (push down older entries)

**Template:**
```markdown
### 2026-03-06 (session XXX — [2-3 word description of work])
**Worked on:** [1–2 sentences: what was accomplished]

**Decisions:** [Key decisions made, patterns established]

**Next up:** [What should happen in the next session]

**Blockers:** [Any blocking issues left for Patrick or next session]
```

**Example:**
```markdown
### 2026-03-06 (session 84 — session-end protocol design + audit execution)
**Worked on:** Designed comprehensive session-wrap protocol to prevent future commit loss. Executed 6 of 8 audit work paths from session 83: QA audit (PASS with 3 WARN), UX audit of 5 flows (3 critical, 2 low), Support KB bootstrapped (15 issues), CX onboarding docs created, Records cleanup (6 orphan files archived), Marketing calendar created. Neon credentials rotated as precaution.

**Decisions:** Session wrap verification is mandatory and automated. Subagents will be spawned with commit discipline built in. QA audit revealed 3 critical UX issues in payment flow — recommend fixing before beta.

**Next up:** findasale-ops verification (2 remaining from audit), production readiness checklist. Patrick: review QA findings, confirm launch date.

**Blockers:** QA critical findings may delay launch by 2–3 days if they require schema changes.
```

**Verification:** Paste the session-log entry into your response so Patrick can see it before the session ends.

**Roadmap check:** If any Path P items were completed or CD sprint features shipped this session, update `claude_docs/strategy/roadmap.md` in the same commit as session-log.md. The two files are always updated together — never one without the other after meaningful work.

### Step 3: Report File Changes Explicitly

**Format:** For every commit made this session, list the files:

```
## Session Wrap Summary

### Commits Made This Session
1. "fix: search pagination off-by-one"
   - packages/backend/src/controllers/searchController.ts
   - packages/frontend/pages/search.tsx

2. "docs: bootstrap support knowledge base"
   - claude_docs/guides/support-kb.md (new file)

3. "chore: update session log"
   - claude_docs/session-log.md

### Total Changes
- 3 commits
- 4 files changed (1 new)
- 0 files deleted
- Pushed to GitHub: YES (via push.ps1)
- Working tree clean: YES
```

**Why:** Patrick sees exactly what changed without running `git log`. He can verify against his mental model.

### Step 4: If MCP Pushes Were Used, Verify on GitHub

**For each MCP push this session:**
1. Note the commit message
2. Check GitHub: `https://github.com/deseee/findasale/commits/main`
3. Verify the commit appears in the last 10
4. Spot-check 1–2 files to confirm content matches local

**Report in wrap:**
```
### MCP Pushes This Session
✓ Commit "fix: search pagination" — verified on GitHub
✓ Commit "docs: support KB" — verified on GitHub
```

### Step 5: Confirm No Secrets Leaked

**Check STATE.md:**
```bash
grep -n "password\|token\|key\|secret" claude_docs/STATE.md
```

Expected: Empty or references to `.env` file.
If found: Remove immediately, then re-commit.

**Check self_healing_skills.md:**
```bash
grep -n "DATABASE_URL\|NEON\|API_KEY" claude_docs/self_healing_skills.md
```

Expected: Empty or references to `.env` file only.
If found: Remove immediately, then re-commit.

**Report:**
```
✓ No plaintext secrets in STATE.md
✓ No plaintext secrets in self_healing_skills.md
```

### Step 6: Final Status Check

```bash
git log --oneline -5
git status --short
```

**Expected output:**
```
abc1234 chore: update session log
def5678 docs: support knowledge base
ghi9012 fix: search pagination off-by-one
jkl3456 Merge branch 'main' of github.com:deseee/findasale

On branch main
Your branch is up to date with 'origin/main'.
nothing to commit, working tree clean
```

**Report:**
```
✓ Last 3 commits this session visible in log
✓ Branch up to date with origin/main
✓ Working tree clean
✓ Ready to close.
```

---

## Failure Modes This Protocol Prevents

| Failure Mode | Cause | How Protocol Prevents |
|--------------|-------|----------------------|
| Work vanishes between sessions | Commits made but never pushed | Step 4: verify all commits on GitHub before close |
| CRLF normalization reverts work | Changes committed but not pushed when push.ps1 runs | Rule 2: always commit before mentioning push; Rule 4: verify on GitHub |
| Stale docs obscure actual state | Documentation updated locally but never committed | Rule 3: never accumulate unstaged changes; Step 2: verify session-log updated |
| Subagent work orphaned | Subagent finishes but doesn't commit before handing off | Rule 5: subagent prompt includes commit discipline |
| Secrets leaked in docs | API keys / credentials in STATE.md, self_healing_skills.md | Step 5: grep for secrets before close |
| Merge conflicts block next session | Unstaged changes from previous session left in tree | Step 1: verify clean tree at start |
| "Phantom" CRLF changes block push | autocrlf creates modified files without actual changes | Step 1: pre-verify normalization; verify-session-wrap checks for this |
| Patrick doesn't know what changed | Session ends with vague "work is done" message | Step 3: explicit file list for every commit |
| Revert incidents unprevented | Previous commits unknown/unchecked | Step 3: report commit messages and link to GitHub |
| MCP push fails silently | Large batch pushed without checking size | Rule 4: estimate token count; defer to manual push if >25k |
| Documentation regression | Batch push includes stale doc files | Rule 2: don't include docs in feature batches |

---

## Session-Wrap Verification Script Specification

**File:** `scripts/verify-session-wrap.js`
**Runtime:** Node.js (runs on Windows via PowerShell or Unix terminal)
**Trigger:** Invoked manually by Claude before closing session (Step 1 above)

### Requirements

1. **Output Format:** Plain text, ANSI colors OK (green ✓, red ✗)
2. **Exit Code:** `0` if all checks pass, `1` if any check fails
3. **No Git Push:** Script is read-only, never writes or commits
4. **Idempotent:** Safe to run multiple times, no side effects

### Checks to Perform

#### Check 1: Git Working Tree Clean
```
git status --short
```

**Pass condition:** Empty output (no untracked files, no modifications)
**Fail condition:** Any files listed
**Output if pass:** `✓ Git working tree clean`
**Output if fail:**
```
✗ Git working tree dirty. Uncommitted files:
  - packages/frontend/pages/search.tsx (modified)
  - claude_docs/new-doc.md (untracked)

Action: Stage and commit these files, then re-run script.
```

#### Check 2: context.md Freshness
```
stat claude_docs/context.md | grep Modify
# or: ls -l claude_docs/context.md
```

**Pass condition:** Modified within last 24 hours
**Fail condition:** Modified >24 hours ago
**Output if pass:** `✓ context.md current (updated 2h 15m ago)`
**Output if fail:**
```
✗ context.md is stale (last updated 36h ago)

Action: Run: node scripts/update-context.js
```

#### Check 3: STATE.md No Plaintext Secrets
```
grep -E "(password|token|key|secret|DATABASE_URL|NEON|API_KEY)" claude_docs/STATE.md
```

**Pass condition:** Empty output OR only `.env` references
**Fail condition:** Plaintext credentials found
**Output if pass:** `✓ STATE.md has no secrets`
**Output if fail:**
```
✗ STATE.md contains plaintext secrets:
  Line 99: DATABASE_URL = "postgres://user:pass@...

Action: Remove secrets. Reference .env file location instead.
```

#### Check 4: self_healing_skills.md No Plaintext Secrets
```
grep -E "(password|token|key|secret|DATABASE_URL|NEON|API_KEY)" claude_docs/self_healing_skills.md
```

**Same format as Check 3.**

#### Check 5: session-log.md Updated This Session
```
# Read the first entry (most recent session)
# Check if today's date appears in the header
# e.g., "### 2026-03-06 (session XXX — ..."

head -20 claude_docs/session-log.md | grep "$(date +%Y-%m-%d)"
```

**Pass condition:** Today's date found in first entry
**Fail condition:** Today's date not found
**Output if pass:** `✓ session-log.md updated (2026-03-06 16:45:12)`
**Output if fail:**
```
✗ session-log.md not updated for today (last entry: 2026-03-05)

Action: Add a session-log entry for today before closing.
```

#### Check 6: No Orphan Files
```
# Look for common orphan patterns
find claude_docs -name "new *.txt" -o -name "*.tmp" -o -name "debug-*"
```

**Pass condition:** Empty output
**Fail condition:** Files matching orphan patterns found
**Output if pass:** `✓ No orphan files found`
**Output if fail:**
```
✗ Orphan files found:
  - claude_docs/new 1.txt
  - claude_docs/debug-session.log

Action: Delete or move to archive/ directory.
```

#### Check 7: Line Endings Normalized
```
# Check for CRLF phantoms (files with mixed line endings or unexpected CRLF)
# Strategy: sample .gitattributes and verify rules apply correctly

if [ -f .gitattributes ]; then
  # Verify .gitattributes has text=auto eol=lf for all text files
  grep -E "^\* text.*eol=lf" .gitattributes

  # Warn if it doesn't exist
else
  echo "⚠️  .gitattributes not found or doesn't have eol=lf rule"
fi
```

**Pass condition:** `.gitattributes` exists and contains `* text=auto eol=lf` (or equivalent)
**Fail condition:** Rule missing or `.gitattributes` missing
**Output if pass:** `✓ All line endings normalized (.gitattributes enforces eol=lf)`
**Output if fail:**
```
⚠️  .gitattributes needs update for line ending normalization

Action: Add this to .gitattributes:
  * text=auto eol=lf

Then: git add .gitattributes && git commit -m "chore: enforce LF line endings"
```

#### Check 8: No Recent MCP Pushes Left Uncommitted
```
# If there were any MCP pushes this session, verify they appear in git log
# (This is a soft check — just inform, don't block)

git log --oneline -10 | grep -c "^"
```

**Output:**
```
ℹ Last 10 commits (verify expected commits visible):
  abc1234 chore: update session log
  def5678 docs: support knowledge base
  ghi9012 fix: search pagination off-by-one
  jkl3456 Merge branch 'main' of github.com:deseee/findasale
  ...
```

---

### Final Output

Script should output this on success:

```
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
 Session Wrap Verification — 2026-03-06 16:47:23
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

✓ Git working tree clean
✓ context.md current (updated 2h 15m ago)
✓ STATE.md has no secrets
✓ self_healing_skills.md has no secrets
✓ session-log.md updated (2026-03-06)
✓ No orphan files found
✓ All line endings normalized

Last 5 commits:
  abc1234 chore: update session log
  def5678 docs: support knowledge base
  ghi9012 fix: search pagination off-by-one
  jkl3456 Merge branch 'main' of github.com:deseee/findasale

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
 ✓ ALL CHECKS PASSED. Safe to close session.
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
```

On failure:

```
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
 Session Wrap Verification — 2026-03-06 16:47:23
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

✓ Git working tree clean
✗ context.md is stale (last updated 48h ago)
✓ STATE.md has no secrets

FAILED: 1 check failed

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
 Action Required Before Closing:
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

1. context.md is stale (last updated 48h ago)
   → Run: node scripts/update-context.js
   → Then: git add claude_docs/context.md && git commit -m "chore: refresh context"

2. Re-run script: node scripts/verify-session-wrap.js

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
```

---

## Implementation Roadmap

### Tier 1 Changes (Implement immediately)
1. **Create `scripts/verify-session-wrap.js`** — Core verification script (above spec)
2. **Add to CORE.md:** Session wrap is mandatory (reference this doc)
3. **Add to CLAUDE.md projects section:** "Load SESSION_WRAP_PROTOCOL at every session start"
4. **Update findasale-workflow skill:** Add "session wrap protocol" to the auditing section

### Tier 2 Changes (Next session)
1. **Create `scripts/session-wrap-checklist.md`** — Simpler markdown checklist for Patrick to copy-paste
2. **Add to context.md:** Link to SESSION_WRAP_PROTOCOL (one line summary)
3. **Add to State.md:** "Session wrap is mandatory before close" (one-line note)

### Tier 3 Changes (Polish, post-beta)
1. **Automate script in CI/CD:** Trigger on PR creation (prevent bad pushes)
2. **Add to onboarding:** New subagents get this protocol in their system prompt
3. **Annual audit:** Review protocol effectiveness every 6 months

---

## Exceptions & Edge Cases

### Exception 1: Emergency Hotfix (Production Issue)
If Patrick says "prod is on fire, push immediately," you may:
1. Skip the full session-wrap script
2. Commit the hotfix: `git add [files] && git commit -m "hotfix: [critical issue]"`
3. Use MCP push or PowerShell as appropriate
4. **Still update session-log.md** afterward (even if async)

Example hotfix flow:
```
Patrick: "Payments are broken, Stripe webhook not firing"
Claude: Identifies missing env var, fixes, commits hotfix
Claude: "Hotfix committed. MCP pushing now. Session-log will update async."
Patrick: Verifies on GitHub, deploys
```

### Exception 2: Subagent Spawning (No Clean Handoff Possible)
If you spawn a subagent mid-session and can't wait for it to finish:
1. Ensure **your** working tree is clean before spawning
2. Tell the subagent: "Follow SESSION_WRAP_PROTOCOL before finishing"
3. Note in session-log: "Spawned [agent] mid-session. Check its logs for commit status."

Example:
```
Claude: "Need QA audit. Spawning findasale-qa..."
Claude: session-log: "Spawned findasale-qa (session 85) for pre-beta code audit."

[findasale-qa runs, commits its work, verifies clean]
findasale-qa: "Audit complete. 3 BLOCKER findings. Working tree clean."
Claude: Reads findings, routes to findasale-dev, continues
```

### Exception 3: Context Exhaustion Mid-Session
If you run out of context and can't reach session wrap:
1. Commit current batch immediately: `git add [files] && git commit`
2. Update session-log with partial summary
3. Tell Patrick: "Context exhausted after [X hours]. Latest work committed. Here's what was done."

This ensures work is NOT lost even if the full wrap can't complete.

---

## For Documentation Updates

**When should docs be updated with this protocol?**

- [ ] `CORE.md`: Add one sentence "Session wrap (SESSION_WRAP_PROTOCOL.md) is mandatory before closing"
- [ ] `CLAUDE.md` (project-level): Reference SESSION_WRAP_PROTOCOL in the "Session Start" section
- [ ] `findasale-workflow` skill: Update to include "session-wrap audit" as a meta-task
- [ ] `context.md`: Add one-line pointer to this document in the "Session Basics" section
- [ ] `self-healing-skills.md`: Add entry #37: "Session doesn't end with wrap verification"

---

## For Verification Script Implementation

A separate doc (`VERIFICATION_SCRIPT_REQUIREMENTS.md`) should detail:
- Exact Node.js implementation
- Error handling (what if git command fails?)
- Color codes (ANSI green/red)
- Logging options (--verbose, --quiet)
- Exit codes (0 = pass, 1 = fail)

---

## Summary

This protocol **transforms session wrap from optional best-effort to mandatory, automated, and gated**:

1. **Pre-session:** Verify clean tree, load context
2. **During session:** Commit incrementally, verify as you go
3. **At session end:** Run verify-session-wrap.js — must pass before closing
4. **Report:** Explicit summary of commits, files, and verification
5. **Next session:** Starts with a clean tree and current context

**Key insight:** The session should not be allowed to close if verify-session-wrap.js fails. This is the gate that prevents the chronic commit-loss problem.

---

**Next steps:** Implement verification script, route to findasale-records for doc integration, then enforce in next session.
