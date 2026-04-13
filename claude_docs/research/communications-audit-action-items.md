# Communications Audit — Action Items for Session 169+

**Date:** 2026-03-15
**Assessment rating:** 5.3/10 → Target: 7+/10 within 3 sessions
**Effort:** Implementation is doc changes only (no code work)

---

## Immediate Actions (Apply Today)

### 1. Update conversation-defaults Skill (3 new rules)
**File:** `/mnt/.skills/skills/conversation-defaults/SKILL.md`

Add after Rule 23:

```markdown
## Rule 24: Proactive Gate Check Before Asking Questions

Before asking Patrick ANY clarifying question:
1. Does Rule 1 (AskUserQuestion) apply? → YES: use it, don't ask manually
2. Does Rule 6 (abbrev as precise) apply? → assume his list is complete
3. Does Rule 7 (file path validation) apply? → validate yourself
4. Is the answer in next-session-prompt.md or STATE.md? → don't ask
5. Is this a yes/no with no meaningful difference? → pick the simpler option

If all gates pass, ask. Otherwise proceed.

Why: 40% of manual questions can be answered by existing rules or docs.

---

## Rule 25: Post-Compression Enforcement Checkpoint (CRITICAL)

Immediately after any compression event:
1. Re-read CORE.md §4 (Push Rules) — no exceptions
2. Check: truncation gate understood? Complete push blocks? File-read mandate?
3. If pending work needs a git push: draft complete block before continuing
4. Do NOT proceed until checks complete

Why: S167 proved push rules are first lost after compression.

---

## Rule 26: Subagent Output Aggregation Manifest

When dispatching 2+ subagents:
1. Create temporary `.subagent-manifest.json` tracking file changes
2. As each returns, check for conflicts with other agents' changes
3. Before final push: verify manifest shows zero conflicts
4. Batch all subagent files together (max 3 per MCP call)

Why: S168 had MCP + PS1 pushes without coordination. This prevents it.
```

**Update summary table at end:** Add these 3 rules.

**Time to implement:** 15 minutes

---

### 2. Update patrick-language-map.md (Unified Terminology)
**File:** `/mnt/FindaSale/claude_docs/operations/patrick-language-map.md`

**Already done.** Section added: "Unified Tool Terminology (Updated 2026-03-15)"

Maps "tools" catch-all to specific terms. Reduces confusion from 9 overlapping terms to 5.

---

### 3. Update Root CLAUDE.md (3 new sections)
**File:** `/mnt/FindaSale/CLAUDE.md`

Add after section 5 (MCP Tool Awareness):

```markdown
## 6. Push Instruction Complete Block Guarantee

Every git instruction block given to Patrick must be copy-paste-ready and complete.

Format (exact):
```powershell
cd C:\Users\desee\ClaudeProjects\FindaSale
git add packages/backend/src/controllers/itemController.ts
git add packages/backend/src/utils/cloudinaryWatermark.ts
git commit -m "Add cloudinary watermark and restore itemController"
.\push.ps1
```

Never:
- List files but omit block format
- Use placeholders
- Omit .\push.ps1
- Provide partial instructions
- Use && (bash only)

Enforcement: Patrick will flag incomplete blocks immediately.

---

## 7. Subagent Push Ban (Experimental — Sessions 169–171)

For next 3 sessions, subagents are NOT authorized to push via MCP.

Only the main session context window executes push_files calls.

Why: S168 had MCP + PS1 pushes without coordination.

How:
- Subagents return output with file changes listed
- Main session reads MESSAGE_BOARD.json
- Main session batches files into consolidated pushes (max 3 per call)
- Main session provides Patrick one comprehensive push block at wrap

Success metric: Reduce multi-round git-push cycles from 3–4 per session to 1–2.

Review date: 2026-03-25 (after S169, S170, S171).

---

## 8. Rule Enforcement Checkpoints (Gate Layer)

CORE.md and conversation-defaults rules are now ACTIVE GATES, not advisory references.

Enforcement points:
- Before file write: check Rule 3 (diff-only) + Rule 7 (file path)
- Before asking Patrick: check Rule 1 (AskUserQuestion) + Rule 6 (abbrev)
- After subagent return: check Rule 13 (route implementation) + Rule 14 (escalation)
- After compression: check Rule 25 (post-compression enforcement)
- Before MCP push: check Rule 26 (manifest conflict check)

Non-compliance = Patrick flags immediately. No excuses.
```

**Time to implement:** 20 minutes

---

## Follow-Up Actions (Sessions 169–171 Trial)

### Daily Monitoring
- **Checkpoint manifest:** Track `.subagent-manifest.json` conflict detection
- **Push cycles:** Log how many `.\push.ps1` runs per session (target: ≤2)
- **Reply count:** Track how many times Patrick says "can you clarify?" or "I need..." (target: ≤4/session)

### Weekly Review (Monday mornings)
- Check escalation-log.md for new rule violations
- Check .checkpoint-manifest.json for budget accuracy (session-history delta tracking)
- Adjust any gate rules if false positives appear

### End of Trial (2026-03-25)
- Analyze data
- Decide whether to keep each proposal or rollback
- Update docs based on evidence
- Recommend permanent improvements to CORE.md

---

## Expected Outcomes

| Metric | Current | Target (Week 1) |
|--------|---------|-----------------|
| Push instruction completeness | 60% | 100% |
| Git-push cycles per session | 3–4 | 1–2 |
| Patrick clarification requests | 6–8 | 2–4 |
| Token overhead from friction | 14–17k | 3–5k |
| Compression events | ~1/3 sessions | Rare (1/10+) |

---

## If Anything Breaks

- **Rule 24–26 cause false positives:** Adjust gate thresholds (all rules have "if unsure, ask Patrick" escape hatch)
- **Subagent push ban prevents necessary work:** Escalate to Patrick directly, don't silently work around it
- **Post-compression gate is too strict:** Allow push-without-re-read if last compression was 5+ sessions ago (add time threshold)
- **Manifest conflicts block progress:** Log to escalation-log, ask Patrick for manual staging resolution

---

## Files Affected

**Read-only (reference):**
- CORE.md
- STATE.md
- session-log.md

**Modified:**
- conversation-defaults/SKILL.md (add Rules 24–26)
- patrick-language-map.md (add unified terminology) ✓ DONE
- CLAUDE.md (add §6–8)

**New (trial data tracking):**
- .checkpoint-manifest.json (tracks subagent manifest conflicts)
- escalation-log.md (surfaces rule violations)

---

**Assessment source:** communications-quality-assessment-2026-03-15.md
**Authority:** Advisory Board Communications Subcommittee
**Approval:** Ready for Patrick review + session 169 deployment
