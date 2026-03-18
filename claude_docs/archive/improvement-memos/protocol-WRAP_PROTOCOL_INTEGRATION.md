# Session-End Protocol Integration Plan

**For:** findasale-records agent
**Date:** 2026-03-06
**Status:** Design review pending

---

## Overview

Three new documents have been created to solve the chronic commit-loss problem in FindA.Sale sessions:

1. **SESSION_WRAP_PROTOCOL.md** — The complete mandatory protocol Claude must follow before ending any session
2. **VERIFICATION_SCRIPT_SPEC.md** — Technical specification for the automated verification script
3. **This document** — Integration roadmap for updating existing docs and skills

---

## What Problem Are We Solving?

Sessions 82, 83, and earlier have repeatedly ended without committing/pushing work:

- Session 82: Audit files, doc updates, credential fixes never committed
- Session 78–79: ROADMAP regression (v3 stale overwriting v12)
- Session 83: Full subagent fleet audit never pushed
- ROOT CAUSE: No enforced session-end commit check; no automated verification that working tree is clean

**This protocol prevents that by:**
1. Making session wrap **mandatory** (cannot close without passing verification)
2. **Automating** the verification (script runs, not manual checklist)
3. **Gating** the close (if script fails, session cannot end)
4. **Explicitly reporting** what changed (so Patrick knows what to expect)

---

## Documents Created

### 1. SESSION_WRAP_PROTOCOL.md (Main Document)

**Location:** `claude_docs/SESSION_WRAP_PROTOCOL.md`
**Audience:** Claude + Patrick (reference during sessions)
**Size:** ~1,900 lines
**Covers:**

- Pre-session checklist (clean tree, load context, fresh context.md)
- During-session discipline (commit incrementally, no wildly batched commits)
- MCP vs manual push decision tree
- Session-end protocol (7 mandatory steps)
- Failure modes table (what problems this solves)
- Verification script spec (detailed checks)
- Implementation roadmap (what needs to be done)
- Exceptions & edge cases (hotfixes, subagent handoffs, context exhaustion)

**Key sections Claude will reference:**
- "During-Session Discipline" (Rule 1–5, especially Rule 2 and 4)
- "Session End Protocol" (Step 1–6, mandatory before close)

**Key sections findasale-records will use:**
- "For Documentation Updates" (what docs need to be changed)
- "Implementation Roadmap" (Tier 1–3 changes)

---

### 2. VERIFICATION_SCRIPT_SPEC.md (Technical Spec)

**Location:** `claude_docs/VERIFICATION_SCRIPT_SPEC.md`
**Audience:** findasale-dev (implementation guide)
**Size:** ~1,200 lines
**Covers:**

- Environment and dependencies (Node.js, no external packages)
- Invocation syntax (command-line options: --verbose, --quiet, --json)
- 8 checks with exact pseudocode and pass/fail examples
- Integration with Claude session
- Testing guide (4 test cases)
- CLI options documentation
- Error handling
- Performance expectations
- Success criteria

**findasale-dev will use this to:**
- Implement `scripts/verify-session-wrap.js`
- Write all 8 checks
- Test against provided test cases
- Handle error conditions

---

### 3. WRAP_PROTOCOL_INTEGRATION.md (This Document)

**Location:** `claude_docs/WRAP_PROTOCOL_INTEGRATION.md`
**Audience:** findasale-records + project manager (routing plan)
**Covers:**

- What to update in existing docs
- Skill changes needed
- Tier 1–3 implementation plan
- Doc change specifications
- Rollout sequence

---

## Document Updates Required (Tier 1 — Implement Immediately)

### 1.1 Update CORE.md

**File:** `CORE.md`
**Change type:** Add 1 new section
**Location:** After "Behavioral Rules" section, before "Code Standards"

**Add this section:**

```markdown
## Session Wrap Discipline

Session wrap is **mandatory** before every session close.

1. **15 minutes before ending:** Run automated verification:
   ```bash
   node scripts/verify-session-wrap.js
   ```

2. If script passes: Proceed with wrap summary (see SESSION_WRAP_PROTOCOL.md §Session End Protocol)

3. If script fails: Fix the issue(s) it lists, re-run script, then proceed.

4. **Session cannot close** until verification passes.

Reference: `claude_docs/SESSION_WRAP_PROTOCOL.md`

This prevents the commit-loss problem where sessions end with uncommitted work.
```

**Rationale:** CORE.md is the authority layer for "how we work here." Session wrap discipline is now a core rule, not optional best practice.

---

### 1.2 Update CLAUDE.md (project-level, at repo root)

**File:** `CLAUDE.md`
**Change type:** Modify existing section OR add new line
**Location:** In the "Session Start" section (currently line ~15–20)

**Current text:**
```
## Session Start
- Load context.md and STATE.md before starting work.
- If context.md is older than 24 hours, regenerate it: `node scripts/update-context.js`
- Run the session warmup task when environment health is unclear.
```

**Updated text:**
```
## Session Start
- Load context.md and STATE.md before starting work.
- If context.md is older than 24 hours, regenerate it: `node scripts/update-context.js`
- Run the session warmup task when environment health is unclear.

## Session Wrap (Mandatory)
Before closing any session, run: `node scripts/verify-session-wrap.js`
See: `claude_docs/SESSION_WRAP_PROTOCOL.md`
Session cannot close until verification passes.
```

**Rationale:** Patrick reads CLAUDE.md at session start. This reminds Claude of the wrap requirement from the start, so it's not a surprise at end.

---

### 1.3 Update findasale-workflow Skill

**File:** `.skills/skills/findasale-workflow/SKILL.md`
**Change type:** Add new sub-section to "Workflow Audit Protocol"
**Location:** After existing "Workflow Audit Protocol" section

**Add this section:**

```markdown
## Session-Wrap Audit (New)

A meta-audit that applies to every session, not just the scheduled workflow audit.

**When:** 15 minutes before closing ANY session (workflow session OR feature session)
**What:** Run the automated verification script
**How:**
  1. Execute: `node scripts/verify-session-wrap.js`
  2. If it passes: session wrap summary is ready to deliver
  3. If it fails: fix issues, re-run, then deliver wrap summary

**Why:** Sessions have repeatedly ended with uncommitted work (sessions 82, 83, etc.).
This script gates the session close until 100% of work is committed and verified.

Reference: `claude_docs/SESSION_WRAP_PROTOCOL.md`
```

**Rationale:** This skill is specifically about workflow efficiency. Session-wrap verification is a workflow efficiency gate, so it belongs here.

---

### 1.4 Update findasale-dev Skill (dev-environment)

**File:** `.skills/skills/dev-environment/SKILL.md`
**Change type:** Add note about session-wrap script existence
**Location:** Near top of skill file, in the "Getting Help" or "Tools" section

**Add this section (or note):**

```markdown
## Verification Scripts

- `scripts/verify-session-wrap.js` — Runs at session end to verify all work is committed.
  Claude will invoke this before closing the session.
  You only need to run it manually if you're debugging or testing locally.
  See: `claude_docs/VERIFICATION_SCRIPT_SPEC.md`
```

**Rationale:** When findasale-dev is building the verification script, it should know where to put it and what it does.

---

## Skill Changes Required (Tier 1)

### 2.1 Create/Update findasale-session-wrap Skill (Optional)

**Consideration:** Do we need a dedicated skill for session wrap, or is it part of the main session?

**Recommendation:** NOT a separate skill. Session wrap is part of every session's end sequence, run by the main Claude agent (or subagent), not a delegated task.

**If we were to create it:**
- **Name:** findasale-session-wrap
- **Trigger:** Patrick says "verify session wrap" or "is the session ready to close?"
- **Purpose:** Run the verification script and report the result
- But this is overkill — better to have Claude do this inline at session end.

---

## Verification Script Implementation (Tier 1 — Dev Agent)

**Deliverable:** `scripts/verify-session-wrap.js`
**Implementation guide:** `claude_docs/VERIFICATION_SCRIPT_SPEC.md` (provides all pseudocode and test cases)
**Estimated effort:** 4–6 hours
**Owner:** findasale-dev

**Checklist for findasale-dev:**
- [ ] Implement all 8 checks (exact pseudocode provided in spec)
- [ ] Add CLI options: --verbose, --quiet, --json
- [ ] Test each check (4 test cases provided)
- [ ] Test error conditions
- [ ] Verify on Windows PowerShell + Linux bash
- [ ] Performance target: <5 seconds total

**Note:** This is the critical piece. Without this script, the protocol is just guidance (still better than nothing, but not a hard gate).

---

## Documentation Updates (Tier 2 — Next Session)

### 3.1 Update context.md

**File:** `claude_docs/context.md`
**Change type:** Add 1–2 line pointer
**Location:** Top of file, in "Quick Reference" section

**Add:**
```
- Session wrap (mandatory): See `SESSION_WRAP_PROTOCOL.md`
```

**Rationale:** context.md is the entry point for new info. One-liner there is enough since the full details are in SESSION_WRAP_PROTOCOL.md.

---

### 3.2 Update STATE.md

**File:** `claude_docs/STATE.md`
**Change type:** Add note in "Session Basics" section
**Location:** Near the top

**Add:**
```
### Session Wrap Protocol
Session wrap is mandatory before every close. Run:
  node scripts/verify-session-wrap.js
See: SESSION_WRAP_PROTOCOL.md
```

**Rationale:** STATE.md is read at every session start. This reminder sets expectations.

---

### 3.3 Update DEVELOPMENT.md (if exists)

**File:** `DEVELOPMENT.md` (in repo root, if it exists)
**Change type:** Add one-line note
**Location:** In the "Development Tools" or "Scripts" section

**Add:**
```
- `scripts/verify-session-wrap.js` — Verifies session readiness before close (mandatory before session wrap)
```

---

## Skill Changes (Tier 2)

### 4.1 Update context-maintenance Skill

**File:** `.skills/skills/context-maintenance/SKILL.md`
**Change type:** Add awareness of session-wrap script
**Location:** In the skill's description

**Update description:**
```
The context-maintenance skill ensures docs stay fresh and sessions wrap cleanly.
It includes: context.md regeneration, doc freshness checks, and session-wrap verification.
Reference: SESSION_WRAP_PROTOCOL.md, VERIFICATION_SCRIPT_SPEC.md
```

**Rationale:** context-maintenance is related (both are about session health), so awareness is good.

---

## Self-Healing Skills Update (Tier 2)

### 5.1 Add Entry #37 to self_healing_skills.md

**File:** `claude_docs/self_healing_skills.md`
**Change type:** Add new numbered entry
**Location:** At the end of the list, before "Last Updated"

**Add:**

```markdown
### 37. Session Doesn't End With Wrap Verification
**Trigger:** Session ends with uncommitted work or status unclear
**Pattern:** "Here's what got done" without verifying clean tree or running verification script
**Fix:** Before ending any session, run: node scripts/verify-session-wrap.js
If script fails, fix the issues it lists. Re-run script until it passes.
**Prevention:** Session wrap is now mandatory. Cannot close without passing verification.
**Reference:** SESSION_WRAP_PROTOCOL.md, VERIFICATION_SCRIPT_SPEC.md
```

**Rationale:** This is now a discovered self-healing pattern (we've seen it fail multiple times). Document it for future reference.

---

## Rollout Sequence

### Phase 1: Documentation (This Session)
- [ ] Finalize SESSION_WRAP_PROTOCOL.md (this document)
- [ ] Finalize VERIFICATION_SCRIPT_SPEC.md (this document)
- [ ] Create WRAP_PROTOCOL_INTEGRATION.md (this document)
- [ ] Route all three to findasale-records for review

### Phase 2: Tier 1 Changes (Next Session)
- [ ] findasale-records: Update CORE.md, CLAUDE.md, findasale-workflow skill, dev-environment skill
- [ ] findasale-dev: Implement scripts/verify-session-wrap.js
- [ ] findasale-records: Commit all changes together

### Phase 3: Tier 2 Changes (Session After Next)
- [ ] Update context.md, STATE.md, DEVELOPMENT.md
- [ ] Update context-maintenance skill
- [ ] Add self-healing entry #37
- [ ] Test full wrap protocol in a real session

### Phase 4: Enforcement (Session After Phase 3)
- [ ] Every future session starts with SESSION_WRAP_PROTOCOL.md in context
- [ ] Verification script is always run at session end
- [ ] Protocol is enforced for all subagents (QA, Dev, OPS, etc.)

---

## Dependency Chain

```
SESSION_WRAP_PROTOCOL.md
    ↓
VERIFICATION_SCRIPT_SPEC.md (technical details)
    ↓
scripts/verify-session-wrap.js (implementation by findasale-dev)
    ↓
CORE.md + CLAUDE.md (enforce in rules)
    ↓
Every future session
```

**Critical path:**
1. findasale-records reviews the protocol docs
2. findasale-dev implements the script
3. findasale-records updates the rules
4. Next session is the first to enforce it

**Timeline:** Can be done in 2–3 sessions total (design + implementation + first enforcement).

---

## Success Criteria

The integration is successful when:

1. ✓ SESSION_WRAP_PROTOCOL.md is merged to main branch
2. ✓ VERIFICATION_SCRIPT_SPEC.md is merged to main branch
3. ✓ `scripts/verify-session-wrap.js` is implemented and tested
4. ✓ CORE.md includes session-wrap requirement
5. ✓ CLAUDE.md includes session-wrap requirement
6. ✓ First post-integration session runs verification script and passes
7. ✓ Session-log.md documents that wrap verification ran (entry: "Run verification script ✓")
8. ✓ Zero sessions end with uncommitted work in next 5 sessions (metric: git status clean at wrap time)

---

## Risks & Mitigation

| Risk | Probability | Mitigation |
|------|-------------|-----------|
| Verification script too slow (>10s) | Medium | Optimize checks; profile in VERIFICATION_SCRIPT_SPEC.md testing |
| Script false-positives (blocks legitimate work) | Low | Test all 4 test cases thoroughly before rollout |
| Patrick forgets to run script | Low | Build it into Claude's session-end prompt automatically |
| Git/node not available when script runs | Low | Script handles gracefully with exit code 2 + clear error |
| Breaking change to existing workflow | Low | Script is additive — doesn't change how work is done, just gates the close |

---

## Sign-Off Checklist (for findasale-records)

- [ ] SESSION_WRAP_PROTOCOL.md is complete and actionable
- [ ] VERIFICATION_SCRIPT_SPEC.md is complete and implementable
- [ ] All Tier 1 doc changes are specified above
- [ ] All Tier 1 skill changes are specified above
- [ ] Implementation roadmap is realistic
- [ ] Rollout sequence is clear
- [ ] Success criteria are measurable
- [ ] All three documents are ready for handoff to findasale-dev

---

## Next Actions

1. **findasale-records:** Review all three documents for completeness
2. **Patrick:** Approve the protocol (optional — this is operationally sound)
3. **findasale-dev:** Implement verification script per VERIFICATION_SCRIPT_SPEC.md
4. **findasale-records:** Apply Tier 1 doc/skill changes
5. **Next session:** Run verification script at session end for first time

---

End of Integration Plan.
