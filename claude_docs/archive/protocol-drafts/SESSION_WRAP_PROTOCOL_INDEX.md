# Session-End Commit Protocol — Document Index

**Created:** 2026-03-06 (workflow efficiency audit)
**Status:** Design complete, ready for implementation
**Problem:** Sessions repeatedly end without committing work (sessions 82, 83, etc.)
**Solution:** Mandatory automated verification gate before session close

---

## Document Map

### 1. SESSION_WRAP_PROTOCOL.md (Start here if you're Claude implementing this)
**Size:** 678 lines | **Audience:** Claude agents | **Tone:** Prescriptive
**Contains:**
- Pre-session start checklist (clean tree, load context, fresh docs)
- During-session discipline rules (incremental commits, not giant batches)
- Session-end protocol (7 mandatory steps)
- Failure modes table (what problems this solves)
- Verification script specification (detailed requirements)
- Exceptions & edge cases (hotfixes, subagents, context exhaustion)

**Read this if:** You're a Claude agent following the protocol during your session
**Reference:** §Session End Protocol (Step 1–6 are mandatory before close)

---

### 2. VERIFICATION_SCRIPT_SPEC.md (Start here if you're findasale-dev implementing the script)
**Size:** 656 lines | **Audience:** findasale-dev | **Tone:** Technical specification
**Contains:**
- Implementation requirements (Node.js, no external dependencies)
- 8 checks with exact pseudocode and example outputs
- CLI options (--verbose, --quiet, --json)
- Testing guide (4 provided test cases)
- Error handling and edge cases
- Performance expectations (<5 seconds)
- Success criteria and implementation checklist

**Read this if:** You're implementing `scripts/verify-session-wrap.js`
**Deliverable:** The script that blocks sessions from closing with uncommitted work
**Effort:** 4–6 hours

---

### 3. WRAP_PROTOCOL_INTEGRATION.md (Start here if you're findasale-records applying changes)
**Size:** 446 lines | **Audience:** findasale-records | **Tone:** Implementation roadmap
**Contains:**
- What documents need to be updated (CORE.md, CLAUDE.md, etc.)
- What skills need to be updated (findasale-workflow, dev-environment, etc.)
- Tier 1 changes (immediate) vs Tier 2 (next session) vs Tier 3 (polish)
- Exact specifications for each change
- Rollout sequence
- Success criteria

**Read this if:** You're updating docs and skills to enforce the protocol
**Changes:** ~15 minutes of editing across 4 files
**Tier 1 blocking:** CORE.md, CLAUDE.md, skill files

---

### 4. WRAP_PROTOCOL_EXECUTIVE_SUMMARY.md (Start here if you're Patrick reviewing this)
**Size:** 227 lines | **Audience:** Patrick (project manager) | **Tone:** Plain English
**Contains:**
- The problem in plain language (work vanishes between sessions)
- The solution at high level (mandatory verification gate)
- What gets built (verification script + doc updates)
- What this prevents (10 different failure modes)
- Timeline and risks
- Bottom line: "Approve this approach?"

**Read this if:** You're deciding whether to approve the protocol design
**Time to read:** 10 minutes
**Decision:** Approve → triggers Phase 1 (findasale-records reviews, findasale-dev builds)

---

### 5. WRAP_PROTOCOL_QUICK_REFERENCE.md (Use this during session wrap)
**Size:** 221 lines | **Audience:** Claude agents | **Tone:** Copy-paste checklist
**Contains:**
- 15-minute session-close checklist (5 steps)
- During-session quick rules (5 rules)
- Failure mode → fix table
- Emergency fix examples
- What Patrick will see in the wrap summary

**Use this:** During the actual session wrap (15 min before close)
**Copy-paste:** The 5-step checklist into your wrap process

---

## For Different Roles

### If You're Patrick (Project Manager)
1. **Read:** WRAP_PROTOCOL_EXECUTIVE_SUMMARY.md (10 min)
2. **Decide:** Approve or request changes
3. **If approved:** Tell findasale-records to begin Phase 1

### If You're Claude (Main Session or Subagent)
1. **Load:** SESSION_WRAP_PROTOCOL.md at session start
2. **Follow:** Rules 1–5 during session (incremental commits)
3. **At wrap:** Use WRAP_PROTOCOL_QUICK_REFERENCE.md (5-step checklist)
4. **Verify:** Session-end protocol §Step 1 (run verification script)
5. **Reference:** Full protocol for edge cases

### If You're findasale-records (Documentation Agent)
1. **Review:** All 5 documents (1–2 hours reading + understanding)
2. **Approve:** Are they implementable? Any questions?
3. **Execute Tier 1:** Update CORE.md, CLAUDE.md, skills (30 min)
4. **Route to findasale-dev:** Pass VERIFICATION_SCRIPT_SPEC.md for implementation
5. **Execute Tier 2:** After script is built, apply polish changes (30 min)

### If You're findasale-dev (Implementation Agent)
1. **Review:** VERIFICATION_SCRIPT_SPEC.md (1 hour reading + understanding)
2. **Build:** scripts/verify-session-wrap.js (4–6 hours)
3. **Test:** Run all 4 provided test cases
4. **Verify:** Script exits 0 (pass), 1 (fail), or 2 (error)
5. **Commit:** Push to main with findasale-records' doc changes

---

## Rollout Sequence

### Phase 1: Design Review (This session)
- [x] Create 5 documents
- [x] Finalize specifications
- [ ] Patrick approves (waiting)
- [ ] findasale-records begins review

### Phase 2: Implementation (Next 1–2 sessions)
- [ ] findasale-dev implements verify-session-wrap.js (4–6 hours)
- [ ] findasale-records applies Tier 1 doc/skill changes (30 min)
- [ ] Test script on Windows + Linux

### Phase 3: Enforcement (Session after Phase 2)
- [ ] Verification script is live
- [ ] First session runs script at wrap
- [ ] Script must pass before session can close
- [ ] session-log documents wrap verification ✓

### Phase 4: Polish & Stability (Weeks 2–4)
- [ ] Tier 2 doc changes (polish)
- [ ] Monitor script for edge cases
- [ ] Subagent onboarding updated
- [ ] Zero sessions with uncommitted work (success metric)

---

## Key Concepts

### The Gate (Mandatory Verification Script)
Before a session can close, `verify-session-wrap.js` must pass. It checks:
- Git working tree is clean
- context.md is fresh
- No plaintext secrets in docs
- session-log.md updated
- No orphan files
- Line endings normalized
- Commits are on GitHub

If any check fails: session cannot close (must fix and re-run).

### Incremental Commits (During Session)
Don't batch 10 changes at the end. Commit after each logical piece:
```
1. Fix bug → commit immediately
2. Add docs → commit immediately
3. Fix types → commit immediately
```

Small commits are easier to verify and easier to push (MCP limits: 5 files / 25k tokens).

### Explicit Reporting (At Session End)
Patrick gets a detailed summary showing exactly what changed and confirming it's on GitHub:
```
Commits made:
- fix: search pagination
- docs: support KB
- chore: update session log

Verification: ✓ All checks passed
Status: Ready to merge
```

No more "work is done" with no detail. Complete transparency.

---

## Success Criteria

Protocol is successful when:

1. ✓ All 5 documents are merged to main
2. ✓ scripts/verify-session-wrap.js is implemented and tested
3. ✓ CORE.md includes "session wrap is mandatory" rule
4. ✓ CLAUDE.md includes "run verify-session-wrap.js" instruction
5. ✓ First post-implementation session runs script and PASSES
6. ✓ Zero sessions end with uncommitted work (metric: git status clean at wrap)
7. ✓ session-log entries document wrap verification ✓

---

## Common Questions

**Q: Does this change how Patrick works?**
A: No. Patrick still says "build X" and uses `.\push.ps1`. The protocol is transparent to him (he just sees better summaries).

**Q: Does this slow down sessions?**
A: No. Verification script runs in ~5 seconds. Incremental commits save time vs. giant end-of-session batches.

**Q: What if the verification script finds an issue?**
A: Claude fixes it (usually <2 min: commit a file, update session-log, done) and re-runs the script.

**Q: What about edge cases (hotfixes, emergency situations)?**
A: SESSION_WRAP_PROTOCOL.md §Exceptions & Edge Cases covers these. Hotfixes can skip full verification; context exhaustion has a fallback.

---

## File Locations

All documents are in `claude_docs/`:

```
claude_docs/
├── SESSION_WRAP_PROTOCOL.md                 (main protocol — 678 lines)
├── VERIFICATION_SCRIPT_SPEC.md              (technical spec — 656 lines)
├── WRAP_PROTOCOL_INTEGRATION.md             (change plan — 446 lines)
├── WRAP_PROTOCOL_EXECUTIVE_SUMMARY.md       (for Patrick — 227 lines)
├── WRAP_PROTOCOL_QUICK_REFERENCE.md         (cheat sheet — 221 lines)
└── SESSION_WRAP_PROTOCOL_INDEX.md           (this file — for navigation)
```

The verification script to implement is: `scripts/verify-session-wrap.js`

---

## Next Action

**Patrick:** Review WRAP_PROTOCOL_EXECUTIVE_SUMMARY.md. Approve or request changes?

**If approved:**
1. findasale-records: Begin Phase 1 review
2. findasale-dev: Build verify-session-wrap.js per VERIFICATION_SCRIPT_SPEC.md
3. findasale-records: Apply Tier 1 doc changes
4. Next session: Run protocol for first time

---

**Questions?** Check the full protocols for details:
- General questions → SESSION_WRAP_PROTOCOL.md
- Technical details → VERIFICATION_SCRIPT_SPEC.md
- Implementation plan → WRAP_PROTOCOL_INTEGRATION.md
- Plain English → WRAP_PROTOCOL_EXECUTIVE_SUMMARY.md
