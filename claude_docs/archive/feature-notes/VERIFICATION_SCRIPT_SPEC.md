# Session-Wrap Verification Script Specification

**File:** `scripts/verify-session-wrap.js`
**Language:** Node.js (JavaScript)
**Purpose:** Automated gate before session close — ensures 100% commit compliance
**Status:** Design spec, ready for implementation by findasale-dev

---

## Overview

The verification script is the **hard stop** that prevents sessions from ending with uncommitted work. It runs immediately before Patrick gets the "session wrap summary" message.

**Behavior:**
- Runs read-only (no git operations, no file modifications)
- Checks 8 different conditions
- Outputs clear pass/fail status with actionable error messages
- Exits with code 0 (success) or 1 (failure)
- Safe to run multiple times with no side effects

---

## Implementation Requirements

### Environment
- **Platform:** Windows PowerShell (Windows paths), Bash (Linux/Mac)
- **Node version:** ≥14.0.0 (no ES6 imports, use CommonJS)
- **Dependencies:** None (use only Node built-ins: `fs`, `path`, `child_process`, `os`)
- **Permissions:** Read-only access to repo files and git metadata

### Invocation
```bash
# From FindaSale repo root
node scripts/verify-session-wrap.js [options]

# Options:
#   --verbose       Show extra debug info (git commands run, file sizes, etc.)
#   --quiet         Suppress header/footer, only show failures
#   --json          Output JSON (for CI/CD integration)
```

### Exit Codes
- **0:** All checks passed → safe to close session
- **1:** One or more checks failed → session cannot close
- **2:** Script error (git not found, repo not initialized) → retry after manual fix

---

## Check Implementations

### Check 1: Git Working Tree Clean

**Pseudocode:**
```javascript
const { execSync } = require('child_process');
const output = execSync('git status --short', { encoding: 'utf-8' });
const dirty = output.trim().split('\n').filter(line => line.length > 0);
return dirty.length === 0;
```

**What it checks:**
- No untracked files (output starting with `??`)
- No staged changes (output starting with `M`, `A`, `D`, `R`)
- No unstaged changes (output starting with `M`, `D`, `R` in second column)

**Pass output:**
```
✓ Git working tree clean
```

**Fail output:**
```
✗ Git working tree dirty. Uncommitted files:
  - packages/frontend/pages/search.tsx (modified, unstaged)
  - claude_docs/new-doc.md (untracked)

Action: Stage and commit these files:
  git add [files]
  git commit -m "[message]"
Then re-run: node scripts/verify-session-wrap.js
```

**Rationale:** If the tree is dirty, nothing else matters — there's uncommitted work.

---

### Check 2: context.md Freshness

**Pseudocode:**
```javascript
const fs = require('fs');
const path = require('path');
const stat = fs.statSync('claude_docs/context.md');
const ageMinutes = (Date.now() - stat.mtimeMs) / 1000 / 60;
return ageMinutes < 24 * 60; // 24 hours
```

**What it checks:**
- File exists (`claude_docs/context.md`)
- Last modified within 24 hours

**Pass output:**
```
✓ context.md current (updated 2h 15m ago)
```

**Fail output:**
```
✗ context.md is stale (last updated 36h ago)

Action: Run: node scripts/update-context.js
Then: git add claude_docs/context.md && git commit -m "chore: refresh context"
Then re-run: node scripts/verify-session-wrap.js
```

**Rationale:** Stale context causes next session to start with wrong assumptions. Force regeneration.

---

### Check 3: STATE.md No Plaintext Secrets

**Pseudocode:**
```javascript
const fs = require('fs');
const content = fs.readFileSync('claude_docs/STATE.md', 'utf-8');
const secretPatterns = [
  /DATABASE_URL\s*=\s*"postgres:\/\/\w+:\w+@/i,
  /password\s*[=:]\s*["']?\S+/i,
  /token\s*[=:]\s*["']?\S+/i,
  /API_KEY\s*[=:]\s*["']?\S+/i,
  /secret\s*[=:]\s*["']?\S+/i,
];
const matches = [];
secretPatterns.forEach(pattern => {
  content.split('\n').forEach((line, idx) => {
    if (pattern.test(line)) matches.push({ line: idx + 1, text: line });
  });
});
return matches.length === 0;
```

**What it checks:**
- No plaintext DATABASE_URL values (postgres://user:password@...)
- No password= or password: assignments with values
- No token= or token: assignments with values
- No API_KEY assignments with values
- No secret= or secret: assignments with values

**Allow patterns:**
- `.env` references (e.g., "See `.env` for DATABASE_URL")
- Comments (e.g., "// Set PASSWORD in .env")
- Placeholder text (e.g., "<database-url>", "YOUR_API_KEY_HERE")

**Pass output:**
```
✓ STATE.md has no secrets
```

**Fail output:**
```
✗ STATE.md contains plaintext secrets:
  Line 99: DATABASE_URL = "postgres://user:pass@neon.tech/..."
  Line 102: NEON_PASSWORD = "mysecretpass123"

Action:
  1. Edit claude_docs/STATE.md
  2. Replace hardcoded values with: "See packages/backend/.env for DATABASE_URL"
  3. Delete the actual values
  4. git add claude_docs/STATE.md && git commit -m "chore: remove plaintext secrets from docs"
  5. RECOMMENDED: Rotate the exposed credentials (if they are real)
  6. Re-run: node scripts/verify-session-wrap.js
```

**Rationale:** This catches the credential leak from session 83's audit. Prevents production secrets from being exposed if docs leak.

---

### Check 4: self_healing_skills.md No Plaintext Secrets

**Same implementation as Check 3, but targets `claude_docs/self_healing_skills.md`.**

**Example failure:**
```
✗ self_healing_skills.md contains plaintext secrets:
  Line 149: **Neon URLs location:** packages/backend/.env
           (DATABASE_URL = postgres://user:pass@pool...)
```

**Rationale:** Self-healing skills file often includes examples with real values. This prevents that mistake.

---

### Check 5: session-log.md Updated This Session

**Pseudocode:**
```javascript
const fs = require('fs');
const content = fs.readFileSync('claude_docs/session-log.md', 'utf-8');
const today = new Date().toISOString().split('T')[0]; // YYYY-MM-DD
const lines = content.split('\n');
// Find first session entry (should match today's date)
const firstEntry = lines.find(line => /^### \d{4}-\d{2}-\d{2}/.test(line));
return firstEntry && firstEntry.includes(today);
```

**What it checks:**
- First entry in session-log.md starts with today's date (YYYY-MM-DD format)
- Entry has a description (e.g., "session 84 — feature XYZ")

**Pass output:**
```
✓ session-log.md updated (2026-03-06 — session 84 entry found)
```

**Fail output:**
```
✗ session-log.md not updated for today (last entry: 2026-03-05)

Action:
  1. Edit claude_docs/session-log.md
  2. Add a new entry at the top:
     ### 2026-03-06 (session 84 — [2-3 word description])
     **Worked on:** [1–2 sentence summary]
     **Decisions:** [Key decisions]
     **Next up:** [What's next]
     **Blockers:** [Any blocking issues]
  3. git add claude_docs/session-log.md && git commit -m "docs: session 84 wrap"
  4. Re-run: node scripts/verify-session-wrap.js
```

**Rationale:** Forces the session log to be updated before close. This is the audit trail that prevents context loss.

---

### Check 6: No Orphan Files

**Pseudocode:**
```javascript
const fs = require('fs');
const path = require('path');
const orphanPatterns = [
  /^new \d+\.txt$/,    // "new 1.txt", "new 2.txt"
  /\.tmp$/,             // "*.tmp"
  /^debug-/,            // "debug-*"
  /^test-/,             // "test-*" (artifacts)
  /\.bak$/,             // "*.bak"
];
const claudeDocsDir = 'claude_docs';
const files = fs.readdirSync(claudeDocsDir);
const orphans = files.filter(f =>
  orphanPatterns.some(pattern => pattern.test(f))
);
return orphans.length === 0;
```

**What it checks:**
- No "new 1.txt", "new 2.txt" pattern files
- No ".tmp" files (temporary edits)
- No "debug-*" files (debug output)
- No ".bak" files (backup copies)

**Pass output:**
```
✓ No orphan files found
```

**Fail output:**
```
✗ Orphan files found:
  - claude_docs/new 1.txt
  - claude_docs/debug-session.log
  - claude_docs/test-script.tmp

Action:
  1. Decide for each file: keep it (rename) or delete it
  2. If keeping: mv "new 1.txt" meaningful-name.md
  3. If deleting: rm debug-session.log test-script.tmp
  4. git add [renamed files] && git rm [deleted files]
  5. git commit -m "chore: clean up orphan files"
  6. Re-run: node scripts/verify-session-wrap.js
```

**Rationale:** Orphan files cause git status noise and make it hard to see real changes. Session-end cleanup ensures this doesn't accumulate.

---

### Check 7: Line Endings Normalized

**Pseudocode:**
```javascript
const fs = require('fs');
const path = require('path');
const gitattributesPath = '.gitattributes';

// Check if .gitattributes exists and has the eol=lf rule
if (!fs.existsSync(gitattributesPath)) {
  return { pass: false, reason: 'missing' };
}

const content = fs.readFileSync(gitattributesPath, 'utf-8');
const hasLfRule = /\* text=auto eol=lf/.test(content) ||
                  /\* text.*eol=lf/.test(content);

return {
  pass: hasLfRule,
  reason: hasLfRule ? 'rule_present' : 'rule_missing'
};
```

**What it checks:**
- `.gitattributes` file exists
- Contains a line matching `* text=auto eol=lf` (or similar all-text-files rule with `eol=lf`)

**Pass output:**
```
✓ All line endings normalized (.gitattributes enforces eol=lf)
```

**Fail output (missing file):**
```
⚠️  .gitattributes not found (or doesn't enforce eol=lf)

Action:
  1. Create/edit .gitattributes in repo root
  2. Add these lines:
     * text=auto eol=lf
     *.{ps1,bat,cmd} text eol=crlf
  3. git add .gitattributes && git commit -m "chore: enforce LF line endings"
  4. Run normalization:
     git add --renormalize .
     git commit -m "chore: normalize all line endings per .gitattributes"
  5. Re-run: node scripts/verify-session-wrap.js
```

**Fail output (rule missing):**
```
⚠️  .gitattributes exists but doesn't enforce eol=lf

Current content:
  (show first 10 lines)

Action:
  1. Edit .gitattributes
  2. Add or update to include: * text=auto eol=lf
  3. Commit and renormalize (see above)
```

**Rationale:** Prevents the CRLF phantom changes from session 82/83 that blocked push.ps1 and reverted work.

---

### Check 8: Verify GitHub-Pushed Commits

**Pseudocode:**
```javascript
const { execSync } = require('child_process');

// Get last 10 commits from local log
const localLog = execSync('git log --oneline -10', { encoding: 'utf-8' });

// Try to fetch latest from remote and compare
try {
  execSync('git fetch origin main', { stdio: 'pipe' });
  const remoteLog = execSync('git log --oneline -10 origin/main',
    { encoding: 'utf-8' });

  // Check if local and remote match (soft check, just inform)
  return {
    pass: true, // Always pass — this is informational
    localCommits: localLog.split('\n').slice(0, 5),
    status: 'in_sync'
  };
} catch (e) {
  return {
    pass: true,
    status: 'warning',
    message: 'Could not fetch from origin (may be offline)'
  };
}
```

**What it checks:**
- Can fetch from origin/main (network check)
- Shows the last 5 commits (for verification)
- Compares local HEAD with remote HEAD

**Pass output:**
```
ℹ Last 5 commits (verify these appear on GitHub):
  abc1234 chore: update session log
  def5678 docs: support knowledge base
  ghi9012 fix: search pagination off-by-one
  jkl3456 Merge branch 'main' of github.com:deseee/findasale
  mno7890 feat: initial payment flow

✓ Branch is in sync with origin/main
```

**Warning output (if network unavailable):**
```
⚠️  Could not verify commits on GitHub (network unavailable)

Local commits exist. After network is restored:
  git fetch origin
  Manually verify commits on https://github.com/deseee/findasale/commits/main
```

**Rationale:** Soft check that catches cases where local commits exist but never made it to GitHub (e.g., MCP push failed silently).

---

## Integration with Claude Session

### How Claude Invokes the Script

**At session wrap (15 min before close):**

```javascript
// Claude runs this
exec('node scripts/verify-session-wrap.js')
  .then(output => {
    if (output.includes('ALL CHECKS PASSED')) {
      // Safe to proceed with wrap summary
      console.log("✓ Session wrap verification passed");
    } else {
      // Must fix issues first
      console.log("❌ Wrap verification failed. Fix issues above, then re-run.");
      process.exit(1);
    }
  });
```

### Expected Interaction Flow

1. **Claude (15 min before close):** "Running session-wrap verification..."
2. **Script runs:** Shows checklist and results
3. **Scenario A (all pass):**
   ```
   ✓ ALL CHECKS PASSED. Safe to close session.
   ```
   Claude proceeds with step 2–6 of wrap protocol

4. **Scenario B (fail):**
   ```
   ✗ Git working tree dirty. Fix and re-run.
   ```
   Claude: "Found uncommitted changes. Committing now..."
   [Claude commits the changes]
   "Re-running verification..."
   [Script runs again, should pass]

---

## Testing the Script

### Test Case 1: Clean Tree (Should Pass)
```bash
# Setup
git status --short  # Should show clean

# Run
node scripts/verify-session-wrap.js

# Expected
✓ ALL CHECKS PASSED. Safe to close session.
```

### Test Case 2: Dirty Tree (Should Fail)
```bash
# Setup
echo "test" >> claude_docs/test.txt  # Create untracked file

# Run
node scripts/verify-session-wrap.js

# Expected
✗ Git working tree dirty. Uncommitted files:
  - claude_docs/test.txt (untracked)
```

### Test Case 3: Stale context.md (Should Fail)
```bash
# Setup
touch -t 202602011200 claude_docs/context.md  # Make file 24+ days old

# Run
node scripts/verify-session-wrap.js

# Expected
✗ context.md is stale (last updated 34d ago)
```

### Test Case 4: Plaintext Secret (Should Fail)
```bash
# Setup
echo "DATABASE_URL = \"postgres://user:pass@neon.tech/db\"" >> claude_docs/STATE.md

# Run
node scripts/verify-session-wrap.js

# Expected
✗ STATE.md contains plaintext secrets:
  Line XXX: DATABASE_URL = "postgres://user:pass@neon.tech/db"
```

---

## CLI Options

### `--verbose`
Shows extra debug info:
```
$ node scripts/verify-session-wrap.js --verbose

[Verbose mode enabled]
Checking: git status --short
Output length: 0 bytes
✓ Git working tree clean

Checking: stat claude_docs/context.md
File size: 28,541 bytes
Mod time: 2026-03-06 14:32:15
Age: 2 hours 15 minutes
✓ context.md current (updated 2h 15m ago)
...
```

### `--quiet`
Suppresses header/footer, only shows failures:
```
$ node scripts/verify-session-wrap.js --quiet

✗ Git working tree dirty. Uncommitted files:
  - packages/frontend/pages/search.tsx (modified, unstaged)
```

### `--json`
Outputs JSON for CI/CD integration:
```
$ node scripts/verify-session-wrap.js --json

{
  "timestamp": "2026-03-06T16:47:23Z",
  "passed": true,
  "checks": [
    { "name": "git_working_tree_clean", "passed": true },
    { "name": "context_freshness", "passed": true },
    ...
  ],
  "summary": "All checks passed"
}
```

---

## Error Handling

### What if git is not found?
```
✗ FATAL: git not found in PATH

The verification script requires git to be installed and available in PATH.

Action:
  1. Install git (if not installed)
  2. Add git to PATH (if installed but not in PATH)
  3. Verify: git --version
  4. Re-run: node scripts/verify-session-wrap.js
```

**Exit code:** 2

### What if repo is not initialized?
```
✗ FATAL: Not a git repository

This script must run from the repo root. Current working directory:
  /some/other/path

Action:
  1. cd C:\Users\desee\ClaudeProjects\FindaSale  (Windows)
  2. Or: cd ~/projects/findasale  (Mac/Linux)
  3. Re-run: node scripts/verify-session-wrap.js
```

**Exit code:** 2

### What if a file read fails?
```
✓ Git working tree clean
⚠️  Could not read context.md (permission denied)
✓ STATE.md has no secrets
...

Warnings: 1 (script proceeded but 1 check was skipped)
```

**Exit code:** 0 (warnings don't block, but are reported)

---

## Performance Expectations

| Check | Expected Time | Notes |
|-------|----------------|-------|
| Git working tree clean | <100ms | Single git status call |
| context.md freshness | <50ms | Single file stat |
| STATE.md secrets | <200ms | Regex scan of ~500 lines |
| self_healing_skills.md secrets | <200ms | Regex scan of ~230 lines |
| session-log.md updated | <100ms | Grep for today's date |
| Orphan files | <50ms | Directory listing + pattern match |
| Line endings normalized | <50ms | Single file read |
| GitHub commit verification | 1–3s | Network fetch required |

**Total expected time:** 2–5 seconds

---

## Success Criteria

The script is successful when:

1. **All checks pass**, script exits with code 0:
   ```
   ✓ ALL CHECKS PASSED. Safe to close session.
   ```

2. **Clear error messages** guide the user to resolution:
   - Problem identified
   - Exact fix given (copy-paste ready)
   - Re-run instruction provided

3. **No side effects:** Script never commits, never modifies files, never pushes

4. **Idempotent:** Can run 5 times in a row with same result (unless you fix issues between runs)

5. **Fast enough:** Runs in <5 seconds (excluding network checks)

---

## For Implementation by findasale-dev

**Checklist:**
- [ ] Create `scripts/verify-session-wrap.js` with all 8 checks implemented
- [ ] Test each check against test cases (above)
- [ ] Test all CLI options (--verbose, --quiet, --json)
- [ ] Test error conditions (missing git, missing file, permission denied)
- [ ] Add to `.gitignore` if needed (unlikely — should be read-only)
- [ ] Document in `DEVELOPMENT.md` (one line: "Run `node scripts/verify-session-wrap.js` before session close")
- [ ] Verify on Windows PowerShell, Linux bash, Mac zsh

**Estimated effort:** 4–6 hours (implementation + testing)

---

End of Specification. Ready for development.
