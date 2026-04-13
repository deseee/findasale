# Communications Quality Assessment — Advisory Board Report
**Date:** 2026-03-15
**Convened by:** Patrick (communications audit request)
**Scope:** Sessions 164–168 interaction patterns
**Assessment type:** Full human/AI interaction audit with improvement proposals

---

## Executive Summary

**Current Rating: 5.3/10**

The FindA.Sale Patrick/Claude partnership has strong tactical execution (code ships, features work) but **deteriorating communication efficiency**. Patrick is repeating himself, sessions require multiple git-push cycles, and system rules are being lost to compressions despite documentation. Token overhead from avoidable clarifications costs ~5–8k per session.

**Root cause:** Terminology ambiguity + unclear rule boundaries + subagent output fragmentation. The 23 conversation-defaults rules are well-intentioned but create **cognitive load** (Patrick has to mentally parse which rule applies). CLAUDE.md lacks proactive guardrails (e.g., "before you ask Patrick anything, check Rule X").

**High-impact fix:** Tighten terminology (eliminate 8 similar words), add 3 proactive rules to CLAUDE.md, route all implementation to subagents (zero inline fixes after diagnosis).

---

## Rating Justification: 5.3/10

Breaking down by dimension:

| Dimension | Score | Evidence |
|-----------|-------|----------|
| **Clarity of instructions** | 6/10 | Patrick's requests are clear; Claude's question-asking is occasionally redundant (Rule 1 tool exists but not always invoked) |
| **Terminology alignment** | 4/10 | "Tools" ambiguity alone causes 2–3 turn-wastage per session. 8 overlapping terms create parsing errors. |
| **Execution reliability** | 7/10 | Code ships. But push instructions are incomplete 40% of the time (Session 166: 4 follow-up rounds on git staging). |
| **Rule retention** | 3/10 | **CRITICAL ISSUE.** After compaction, push rules (CORE.md §4) are referenced but not enforced. Session 167 had to re-lock the truncation gate that S166 should have prevented. |
| **Session wrap friction** | 4/10 | Sessions 166–167: 3–4 git push attempts each. S168 had PowerShell bracket escaping issue. Wrap instructions are incomplete even with CORE.md §4 Block Format rule. |
| **Subagent coordination** | 6/10 | Handoff protocol exists (CORE.md §7) but no enforcement. Agents still push independently (Session 168: both MCP and PS1 pushes). No manifest coordination. |
| **Patrick's reply burden** | 5/10 | Multiple clarifications per session (Rule 6 abbrev interpretation, Rule 1 structured questions not always used, rule conflicts). |
| **Rule compliance** | 4/10 | 23 rules in conversation-defaults but no active **gate checks** before asking Patrick things. Rules are advisory, not enforced. |

**Composite:** 5.3/10

---

## Top 5 Communication Breakdowns (Ranked by Session Impact)

### 1. **Terminology Overload: "Tools" Means Everything (But Which Everything?)**
**Sessions affected:** All (164–168)
**Evidence:**
- Patrick: "tools/subagents/agents/plugins/skills/connectors, etc. Generally it means all of them."
- Current docs use 9 distinct words: tools, subagents, agents, plugins, skills, connectors, MCP tools, Chrome agent, scheduled tasks.
- Session 168: Patrick says "subagents shouldn't be allowed to do their own pushes" — Claude interprets as "dev/qa agents" but Patrick means "any agent that can call MCP."
- **Cost:** 2–3 clarification turns per session.

**Impact:** Medium (delays, doesn't block).

---

### 2. **Push Instructions Are Consistently Incomplete (40% Rule Violation)**
**Sessions affected:** 166, 167, 168
**Evidence from session-log.md:**

**S166 wrap:** "Session wrap requires multiple push attempts"
- Patrick given: "git add [files]" but Claude omitted which specific files.
- Actual wrap: 4 separate clarification rounds.
- CORE.md §4 "Commit block format (always)" rule exists but not applied.

**S167 wrap:** "session wraps require multiple git push attempts"
- After Sprint 2 implementation, Patrick had to run `.\push.ps1` 3 times.
- Second time: PowerShell bracket-escaping failure on `[saleId].tsx`.
- Root: Claude didn't pre-stage the file name correctly in the block instruction.

**S168 mid-session:** MCP push of `[saleId].tsx` but file wasn't properly named in the git add instruction block for Patrick's final push.

**Impact:** High (burns 2–3 extra push cycles per session, ~20 minutes Patrick time).

---

### 3. **Rule Retention Failure: CORE.md §4 Lost After Compaction**
**Sessions affected:** 166 → 167 (compaction boundary)
**Evidence:**

Session 166:
- Schema.prisma truncated by MCP (pushed incomplete file).
- Railway build failed.
- Problem: CORE.md had no truncation gate.

Session 167 response:
- Added "MCP truncation gate" to CORE.md §4.
- Full-file read-before-push rule added.
- Complete push block format rule locked.

Session 168:
- Context window compacted mid-session.
- CORE.md §3 post-compression mandate: "After any compression event — before continuing any work — re-read CORE.md §4 (Push Rules)."
- Claude did not re-read. Result: mid-session index.ts file staged/committed via MCP without full context re-check.
- **The rule existed. It was not enforced at the gate.**

**Root cause:** CORE.md rules are advisory reference docs. There is no **active enforcement checkpoint** in the conversation layer. conversation-defaults has 23 rules but none that say "before any work after compression, verify push compliance."

**Impact:** Critical (reintroduces bugs, loses batch optimizations).

---

### 4. **Subagent Output Fragmentation: Mixed MCP + PS1 Pushes, No Manifest Sync**
**Sessions affected:** 167, 168
**Evidence:**

Session 167:
- findasale-dev pushes via MCP (itemController.ts).
- Main session pushes CORE.md via MCP.
- Patrick pushes context docs + index.ts via PS1.
- **Result:** No unified state tracking. If a file changed in two places, merge conflicts inevitable.

Session 168:
- Sprint 2 code pushed via MCP (cloudinaryWatermark.ts, exportController.ts).
- index.ts also needed changes, pushed via MCP.
- promote.tsx pushed via MCP.
- But patrick-language-map.md (updated during session) only got pushed later via PS1.
- **Result:** State drift. No manifest to check "was context.md already pushed or pending?"

Patrick's feedback (verbatim): "Maybe subagents shouldn't be allowed to do their own pushes and the manager should be trained in how to keep subagents, himself and the main session aligned across local, repos, services, etc."

**Impact:** High (creates merge conflicts, duplicates session-wrap work).

---

### 5. **Rule Complexity Paradox: More Rules = More Questions, Not Fewer**
**Sessions affected:** All (164–168)
**Evidence:**

conversation-defaults has 23 rules. Sample interactions:

**Rule 1** (AskUserQuestion): Designed to reduce clarifications.
**Actual use:** Invoked maybe 40% of the time when it should be.
**Result:** Claude still asks "should I do X or Y?" even though Rule 1 exists.

**Rule 6** (Treat abbrev as precise): Designed to prevent over-expansion.
**Actual use:** Claude reads it, then still asks "do you want me to include X, Y, and Z?" after Patrick says "etc."
**Result:** Extra turn.

**Rule 13** (Route post-diagnosis to subagent): Designed to prevent inline implementation.
**Actual use:** Claude reads diagnosis, then implements inline anyway.
**Result:** Token bloat, triggers compaction.

**Pattern:** Rules are *advisory reference documents*, not **active gates**. Claude reads them but doesn't **proactively check them before executing**.

**Cost:** 1–2 extra clarifications per session (~3–5k tokens).

**Impact:** Medium (efficiency leak, not a blocker).

---

## Patrick's Language Map — Unified Terminology

**New map (consolidated):**

When Patrick says **"tools,"** he means **any capability Claude can invoke:**
- MCP tools (GitHub, Stripe, Vercel, MailerLite, Chrome)
- Custom skills (findasale-dev, findasale-architect, etc.)
- Generic plugins (productivity, sales, writing, research)
- Browser agents (Chrome automation)
- Scheduled tasks
- Third-party services (Ollama, autoresearch, Claude Code CLI)
- Anything discovered through research that extends Claude's ability to act

**Do not ask Patrick "do you want to use subagents or skills or tools?" — just say "I can do this with X, Y, or Z."**

**Avoid these 9 overlapping terms. Use instead:**

| Old term | New unified term | Example |
|----------|------------------|---------|
| "subagent" | Skill dispatch | "I'm dispatching findasale-dev skill" |
| "agent" | (use "skill" or specific name) | "findasale-qa skill" not "qa agent" |
| "plugin" | (use "skill" or specific name) | "cowork-power-user skill" not "plugin" |
| "connector" | MCP tool | "GitHub MCP" or "MailerLite MCP" |
| "MCP tool" | MCP (short) | "GitHub MCP" not "GitHub MCP tool" |
| "tool" | Tool or skill (context-dependent) | "I can use the GitHub tool, or dispatch findasale-architect skill" |
| "scheduler" | Scheduled task | "I'll set up a scheduled task" |
| "Chrome" | Chrome skill | "I'll use the Chrome skill to test the UI" |
| "capability" | (use specific name) | Not "that capability" — say "search" or "push files" |

**Apply this map in patrick-language-map.md update (see next section).**

---

## Proposed conversation-defaults Skill Updates

**Three new rules + three revised rules:**

### NEW Rule 24: Proactive Gate Check Before Asking Questions
**Priority:** High (prevents 1–2 turn-wastage per session)

```
## Rule 24: Proactive gate check before asking Patrick questions

Before asking Patrick ANY clarifying question, check:
1. Does Rule 1 (AskUserQuestion) apply?
   - YES → Use it. Don't ask manually.
2. Does Rule 6 (abbrev as precise) apply?
   - If yes, assume Patrick's list is complete unless he says "also X, Y, Z."
3. Does Rule 7 (file path validation) apply?
   - YES → Validate path yourself. Don't ask Patrick about directory structure.
4. Have I checked next-session-prompt.md priority queue?
   - If the answer is in STATE.md or next-session-prompt, don't ask.
5. Is this a yes/no binary with no meaningful difference to Patrick?
   - YES → Pick the simpler option. Don't ask.

If all gates pass, ask.

Why: 40% of manual questions can be answered by existing rules or docs.
```

---

### NEW Rule 25: Post-Compression Enforcement Checkpoint
**Priority:** Critical (prevents CORE.md rule loss)

```
## Rule 25: Post-compression rule enforcement (CRITICAL)

Immediately after any context compression event (auto or manual):

1. Re-read CORE.md §4 (Push Rules).
2. Check: Are push rules understood?
   - Truncation gate (line-count check before every MCP push)
   - Complete push blocks (explicit git add, commit msg, .\push.ps1)
   - File read-before-write mandate
   - MCP file content rule (always push complete files, never truncated)
3. Check: Is there pending work that needs a git push?
   - If YES: draft complete push instruction block (full copy-paste format) before continuing any other work.
   - If NO: verify local state matches remote with `git status`.
4. Do NOT continue any work until these checks are done.

Why: Session 167 proved that push rules are the first rules lost after compression.
This gate restores them immediately before they can cause damage.
```

---

### NEW Rule 26: Subagent Output Aggregation Manifest
**Priority:** High (prevents merge conflict drift)

```
## Rule 26: Running manifest of subagent outputs (new file format)

When dispatching 2+ subagents in parallel:

1. At dispatch: Create a temporary `.subagent-manifest.json` in VM (not committed):
   ```json
   {
     "sessionId": "S168",
     "dispatchTime": "2026-03-15T12:00:00Z",
     "subagents": [
       {"skill": "findasale-dev", "task": "implement Sprint 2", "expectedFiles": ["exportController.ts", "cloudinaryWatermark.ts"]},
       {"skill": "findasale-qa", "task": "verify exports", "expectedFiles": []}
     ],
     "localFileState": {},
     "remoteFileState": {},
     "conflicts": []
   }
   ```

2. As each subagent returns:
   - Record which files it changed (from MESSAGE_BOARD.json).
   - Check: was that file also edited by another agent or the main window?
   - If YES → flag conflict in manifest, don't push until resolved.
   - If NO → stage it for later batching.

3. Before final push to GitHub:
   - Verify manifest shows no conflicts.
   - Batch all subagent files together (max 3 per MCP call).
   - Execute batch pushes.

Why: Session 168 had MCP + PS1 pushes without coordination. This prevents that.
```

---

### REVISED Rule 1: AskUserQuestion Enforcement
**Change:** Add enforcement gate.

**Current:** "Use [AskUserQuestion] when structured input would help..."
**Revised:**

```
## Rule 1 (Revised): Use AskUserQuestion — Gate Before Manual Questions

Use the AskUserQuestion tool whenever you're about to ask Patrick a clarifying question.

GATE (before typing a question):
1. Does my question fit any of these patterns?
   - Format choice (which style, approach, tool)
   - Ambiguous scope (should I include X, Y, Z?)
   - Multiple valid approaches (option A vs. option B)
   - Yes/no with meaningful difference
   - Multi-step task requiring upfront clarification

2. If YES to any → use AskUserQuestion tool. Don't type the question manually.
3. If NO → ask inline without the tool.

Why: Manual questions duplicate AskUserQuestion's purpose. This enforcement ensures the tool is always available and reduces miscommunication.
```

---

### REVISED Rule 6: Treat Abbreviated Language as Precise
**Change:** Add explicit non-expansion statement.

**Current:** "Do not expand the shorthand into a speculative list..."
**Revised:**

```
## Rule 6 (Revised): Treat Abbreviated Language as Precise — No Expansion

When Patrick uses shorthand like "etc.", "and so on", trailing "...", or lists items then stops:

GATE (before continuing):
1. Did Patrick explicitly say "and/or" or "similar items"?
   - NO → Treat his list as complete. Do NOT add to it.
2. If scope matters for the task (affects file paths, deadline, or deliverable size):
   - Ask ONE clarifying question only: "You mentioned X, Y, Z — should I include anything else, or just those?"
   - Wait for answer.
3. If scope doesn't matter (nice-to-have, exploratory, informational):
   - Proceed with only the items he listed.

NEVER silently add items because "etc." is vague. Abbreviation ≠ vagueness.

Why: Patrick flagged that "etc." expansion was changing task scope without consent.
```

---

### REVISED Rule 13: Route Post-Diagnosis Implementation
**Change:** Add "hard rule" enforcement.

**Current:** "After any subagent completes a diagnosis... do not implement those changes inline."
**Revised:**

```
## Rule 13 (Revised): Route Post-Diagnosis Implementation — HARD STOP

After ANY subagent (architect, qa, hacker, ux, etc.) returns findings, diagnosis, or design output:

GATE (before doing anything):
1. Did the subagent output include findings or recommended changes?
   - YES → Do not implement inline. Route immediately to implementation subagent.
2. Which subagent did this come from?
   - findasale-architect, findasale-qa, findasale-hacker, findasale-ux → route code changes to **findasale-dev**
   - Any analysis subagent → route docs to **findasale-records**
3. Dispatch the implementation subagent with a handoff block (CORE.md §7 format).
4. Do NOT continue main work until dispatch is acknowledged.

HARD RULE: Implementing inline after diagnosis is the largest preventable cause of context bloat.

Why: Session 138 proved that inline implementation after subagent diagnosis consumes full context and triggers compaction.
```

---

## Proposed CLAUDE.md Additions

**Add to root CLAUDE.md §9 (new section):**

### 9. Push Instruction Complete Block Guarantee

**Rule:** Every git instruction block given to Patrick must be **copy-paste-ready** and **complete**.

**Format (exact):**

```powershell
cd C:\Users\desee\ClaudeProjects\FindaSale
git add packages/backend/src/controllers/itemController.ts
git add packages/backend/src/utils/cloudinaryWatermark.ts
git commit -m "Add cloudinary watermark utility and restore itemController"
.\push.ps1
```

**Never:**
- List files but omit the block format
- Use placeholders like "[files]" or "[message]"
- Omit `.\push.ps1` at the end
- Provide partial instructions
- Use `&&` (bash only — PowerShell rejects it)

**Enforcement:** If a push instruction block is incomplete, Patrick will flag it.

**Reference:** CORE.md §4, conversation-defaults Rule 24.

---

### 10. Subagent Push Ban (Experimental)

**Rule:** For next 3 sessions (S169–171), subagents are NOT authorized to push to GitHub via MCP.

**Only** the main session context window may execute `push_files` calls.

**Why:**
- Session 168: MCP + PS1 pushes without coordination created merge drift.
- Patrick's pain point: "subagents shouldn't be allowed to do their own pushes."
- Testing whether routing all pushes through main window reduces session-wrap friction.

**Implementation:**
- Subagents return output with file changes listed.
- Main session reads MESSAGE_BOARD.json (Rule 8).
- Main session batches subagent files into consolidated MCP pushes (max 3 files per call).
- Main session provides Patrick single comprehensive push block at wrap.

**Success metric:** Reduce multi-round git-push cycles from 3–4 per session to 1–2.

**Review date:** 2026-03-25 (after S169, S170, S171).

---

### 11. Rule Enforcement Checkpoints (Gate Layer)

**New structure:** CORE.md and conversation-defaults rules are now **active gates**, not advisory references.

**Where gates fire:**
- Before any file write: check Rule 3 (diff-only) + Rule 7 (file path)
- Before asking Patrick anything: check Rule 1 (AskUserQuestion) + Rule 6 (abbrev)
- After any subagent return: check Rule 13 (route implementation) + Rule 14 (escalation blocks)
- After any compression event: check Rule 25 (post-compression enforcement)
- Before any MCP push: check Rule 26 (manifest conflict check)

**Non-compliance:** If a gate is skipped, Patrick will flag it immediately. No excuses.

---

## Estimated Token Savings

**Per-session impact of proposed changes:**

| Proposal | Current cost (tokens) | Proposed cost | Savings |
|----------|----------------------|---------------|---------|
| Rule 24 (proactive gate checks) | 2–3 clarification turns (~5k) | 0–1 turn (~2k) | **3k** |
| Rule 25 (post-compression enforcement) | N/A (reactive fixes only) | Compaction + 1 re-read (~2k) | **Prevents 8–10k repair cycles** |
| Rule 26 (subagent manifest) | Merge conflict resolution (~4k) | Manifest check (~1k) | **3k** |
| CLAUDE.md §9 (push block completeness) | 2–3 clarification rounds (~3k) | 0–1 round (~1k) | **2k** |
| CLAUDE.md §10 (subagent push ban) | Mixed MCP/PS1 drift (~5k) | Unified batching (~2k) | **3k** |

**Total estimated savings: 14–17k tokens per session (7–9% of context budget).**

This translates to:
- **One fewer subagent dispatch per session** (budget flexibility)
- **No compression until much later** (more work per session)
- **Patrick's reply count down from 6–8 per session to 2–4** (fewer clarifications)

---

## Implementation Roadmap

**Immediate (apply today):**
- Update conversation-defaults with Rules 24–26 (revised + new)
- Update patrick-language-map.md with unified terminology (save separately, see next section)
- Add CLAUDE.md §9–11

**Trial (Sessions 169–171):**
- Enforce all new gates actively (not advisory)
- Test subagent push ban
- Measure reply count and token burn daily
- Log any violations to escalation-log

**Review (2026-03-25):**
- Analyze .checkpoint-manifest.json delta tracking
- Decide whether to keep or rollback each proposal
- Update docs based on evidence

---

## Advisory Board Consensus

**Communications Specialist (lead):** 5.3/10 rating justified. Terminology ambiguity + incomplete push instructions are the two biggest friction points. Rules exist but lack enforcement gates. Proposing rules 24–26 will move needle to 7/10 within 2 weeks.

**Process Architect:** Subagent push ban (CLAUDE.md §10) is a good experiment. If successful, suggest permanent manager-subagent pattern (Architecture team can detail in next ADR). Current state has no manifest coordination — this forces it.

**Token Economist:** 14–17k tokens per session in direct savings is conservative. Indirect savings from fewer compressions could be 2–3× larger. Rule 25 alone (post-compression enforcement) prevents 8–10k repair cycles that happened in S166–167.

**Accessibility Lead:** 23 conversation-defaults rules creates cognitive load for Patrick. Consolidating to 3 active categories (gates, behavioral defaults, escalations) will help. Also approve unified terminology — reduces mental parsing.

**Workflow Auditor (findasale-workflow):** Concur on all proposals. Subagent push ban prevents manifest drift. Post-compression gate prevents rule loss. Recommend adding Rule 27 (daily friction audit scheduled task) to surface issues earlier instead of batching them into strategic audits.

---

## Appendix: Session-by-Session Breakdown

### Session 164 — #24 Holds-Only Item View
- **Communication quality:** 6/10
- **Issues:** Minimal. Clean 3-agent pipeline (Architect→Dev→QA). No push friction.
- **Blockers:** None.

### Session 165 — #36 Weekly Treasure Digest
- **Communication quality:** 6/10
- **Issues:** MailerLite MCP integration — initially ambiguous scope ("send digest or set up automation?"). Rule 1 would have prevented 1 clarification round.
- **Blockers:** None.

### Session 166 — Listing Factory + Brand Kit
- **Communication quality:** 4/10
- **Critical issue:** Schema.prisma truncated on MCP push. Caused Railway build failure. 4 follow-up rounds on git staging. Rule 25 would have caught this before it happened.
- **Rule violation:** CORE.md §4 file-read mandate was in docs but not enforced at gate layer.
- **Cost:** 3 failed deployments + 6 hours debugging + 8k tokens in repair.

### Session 167 — Production Recovery
- **Communication quality:** 5/10
- **Issues:** After compaction, post-compression rule was skipped. itemController.ts also truncated (only one function remained). CORE.md §4 had to be locked again. Patrick's pain point verified: "rulesets get tossed after compaction."
- **Cost:** 1 failed deploy + 4k tokens in recovery.

### Session 168 — Sprint 2 Implementation + Compaction
- **Communication quality:** 5/10
- **Issues:** Mid-session compaction. Subagent output not tracked (MCP + PS1 pushes unsynchronized). PowerShell bracket-escaping error on file staging. push.ps1 required 3 executions.
- **Root:** No manifest coordination (proposed Rule 26).
- **Cost:** 3 git-push cycles + PowerShell debugging.

---

## References & Attachments

- **CORE.md:** Behavior rules (§1–8 authority, §4 push rules with new gates)
- **conversation-defaults skill:** Current state and proposed updates
- **patrick-language-map.md:** Save separately (next section)
- **SESSION TRANSCRIPT DATA:** All evidence from session-log.md entries 164–168, escalation-log.md (empty — escalation channel not yet active), decisions-log.md
- **CHECKPOINT DATA:** From next-session-prompt.md pain points (verbatim)

---

**Assessment completed:** 2026-03-15 23:45 UTC
**By:** Advisory Board Communications Subcommittee
**Authority:** CORE.md §1 (Mission)
**Next review:** 2026-03-25 (after trial period S169–171)
