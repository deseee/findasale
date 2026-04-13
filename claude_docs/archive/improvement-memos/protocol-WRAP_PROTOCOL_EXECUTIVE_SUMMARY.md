# Session-End Protocol Design — Executive Summary

**For:** Patrick (project manager)
**Date:** 2026-03-06
**Problem:** Sessions repeatedly end without committing work (Sessions 82, 83, etc.)
**Solution:** Mandatory automated verification gate before session close

---

## The Problem (In Plain English)

Over the last 5 sessions:

- **Session 82:** Audit files, doc updates, credential fixes → none committed
- **Session 83:** Full subagent fleet audit → never pushed to GitHub
- **Session 78–79:** ROADMAP regression (old version overwrote new version) → not caught for days
- **Root cause:** No check to ensure work is committed before the session ends

When a session ends, you get a message like "Work is done — here's what changed." But if the files were never committed, they vanish from the local repo when you pull the next time. The work disappears, and the next session starts confused.

---

## The Solution (High Level)

I've designed a **mandatory session-end protocol** that prevents this:

### 1. Automated Verification Script (The Gate)
Before a session can close, an automated script (`verify-session-wrap.js`) checks:

```
✓ Git working tree is clean (all work committed)
✓ context.md is fresh (updated recently)
✓ No secrets leaked in docs (credentials not exposed)
✓ session-log.md updated for today (audit trail is current)
✓ No orphan files (temporary test files cleaned up)
✓ Line endings normalized (no CRLF phantom changes)
✓ All changes are on GitHub (commits actually pushed)

If all checks pass: Session can close
If any check fails: Session cannot close — fix the issue first
```

This script runs automatically 15 minutes before the session ends. If it fails, Claude must fix the problem and re-run it before closing.

### 2. Discipline During the Session
Claude follows a simple rule: **Commit work immediately after each logical batch**, not in one giant batch at the end.

Example:
```
1. Fix bug in search code → Commit immediately
2. Add support documentation file → Commit
3. Fix TypeScript errors → Commit
4. Update session log → Commit

Total: 4 small commits instead of 1 huge batch
```

Small commits are easier to verify and easier for GitHub MCP to push.

### 3. Explicit Handoff to You
When the session ends, you get a detailed summary:

```
## Session Work Summary
- 4 commits made
- Files changed:
  - packages/backend/src/search.ts (modified)
  - claude_docs/support-kb.md (new file)
  - claude_docs/session-log.md (updated)

- Verification: ✓ All checks passed, work is on GitHub
- Status: Ready to merge / deploy
```

No more guessing whether the work made it. You see exactly what changed and can verify it's on GitHub.

---

## What This Prevents

This design prevents:

| Problem | How It's Prevented |
|---------|-------------------|
| Work vanishes between sessions | Verification script checks that commits are on GitHub |
| Stale documentation | Script verifies session-log.md is updated |
| Credentials leaked in docs | Script scans for plaintext secrets |
| CRLF line-ending phantoms | Script verifies `.gitattributes` normalization is active |
| Orphan test files cluttering git | Script checks for temp files and demands cleanup |
| Next session starts confused | Script ensures context is fresh (updated in last 24h) |
| Untracked changes blocking next push | Script forces working tree clean before close |

---

## What Needs to Be Built

### By findasale-dev (Priority 1)
**One script:** `scripts/verify-session-wrap.js`

- Runs all 8 checks (pseudocode provided in VERIFICATION_SCRIPT_SPEC.md)
- Takes ~5 seconds to run
- Outputs clear pass/fail + error messages
- Estimated effort: 4–6 hours

Once this script exists, the protocol is enforceable.

### By findasale-records (Priority 1)
**Update 2 documents:**

1. **CORE.md:** Add "Session wrap is mandatory" rule
2. **CLAUDE.md:** Add "Run verify-session-wrap.js before close" instruction

These are ~5 minutes of editing.

### By Claude (Every Session)
**Run the script** at session end (before closing). If it fails, fix the issue and re-run.

---

## Timeline

**This session (Session 84):**
- [ ] You review + approve the protocol design
- [ ] Records agent updates CORE.md + CLAUDE.md
- [ ] Dev agent builds verify-session-wrap.js

**Next session:**
- [ ] First time running the verification script
- [ ] Tests the gate (should pass if work is done correctly)

**Sessions after:**
- [ ] Verification script runs every session end
- [ ] Zero sessions end with uncommitted work
- [ ] Session-log.md documents that verification ran

---

## Documents You Should Read

Three documents have been created:

1. **SESSION_WRAP_PROTOCOL.md** (1,900 lines)
   - Complete protocol for Claude to follow
   - You don't need to read all of this — it's for Claude to reference
   - The "Failure Modes" table (p. 10) shows what problems it solves

2. **VERIFICATION_SCRIPT_SPEC.md** (1,200 lines)
   - Technical specification for the verification script
   - For findasale-dev to implement from
   - You don't need to read this — it's for developers

3. **WRAP_PROTOCOL_INTEGRATION.md** (500 lines)
   - Change plan for existing docs and skills
   - For findasale-records to execute
   - You don't need to read this — it's a handoff document

---

## What's Different Going Forward

### Nothing Changes for You (Patrick)
- You still say "build X feature"
- You still review work via GitHub
- You still use `.\push.ps1` for final pushes

### Everything Changes for Claude
- Sessions now have a mandatory verification step before close
- Sessions that fail verification cannot close (must fix first)
- Work is guaranteed to be committed before the session ends
- You get explicit file summaries instead of vague "work is done"

### Nothing Changes for Subagents (findasale-dev, findasale-qa, etc.)
- They follow the same protocol (already built into their prompts)
- Work is committed before handing off to next agent

---

## Risk Assessment

**Risk:** Script is too strict and blocks legitimate sessions
**Probability:** Low
**Mitigation:** 4 test cases provided; script is tested before rollout

**Risk:** Script is too slow (>10 seconds)
**Probability:** Low
**Mitigation:** Performance target <5 seconds; optimization built into spec

**Risk:** Verification script never gets implemented
**Probability:** Medium
**Mitigation:** It's prioritized as Tier 1 task for findasale-dev; clear spec provided

**Risk:** Claude forgets to run script
**Probability:** Medium
**Mitigation:** Script runs automatically as part of session-end prompt (built into Claude's instructions)

---

## Bottom Line

**This protocol solves the "work vanishes" problem** by adding a hard gate before sessions close. Sessions cannot end with uncommitted work anymore — the automated script won't allow it.

You'll see three documents in `claude_docs/`:
- `SESSION_WRAP_PROTOCOL.md`
- `VERIFICATION_SCRIPT_SPEC.md`
- `WRAP_PROTOCOL_INTEGRATION.md`

These are ready to be reviewed by findasale-records and routed to findasale-dev for implementation.

**Next step:** Do you approve this approach? If yes, I'll make one change: add these files to a change record and route to findasale-records.

---

## For Records Agent (Handoff Instructions)

If you approve, findasale-records should:

1. **Review** the three documents (1 hour reading)
2. **Approve** them as Tier 1 design (confirm they're implementable)
3. **Route to findasale-dev** with priority: "Implement verify-session-wrap.js per VERIFICATION_SCRIPT_SPEC.md"
4. **Apply Tier 1 doc changes** in CORE.md and CLAUDE.md (30 minutes)
5. **Merge to main** when script is ready

The integration plan (WRAP_PROTOCOL_INTEGRATION.md) contains the exact change specifications for each file.

---

**Questions?** Review SESSION_WRAP_PROTOCOL.md §Exceptions & Edge Cases for edge cases not covered here.
