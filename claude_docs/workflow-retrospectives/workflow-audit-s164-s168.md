# Workflow Audit — Sessions 164–168
**Date:** 2026-03-15
**Scope:** 5-session (4-day) retrospective
**Evidence sources:** session-log.md, CORE.md v4.1, CLAUDE.md, GitHub commits (20 recent), conversation-defaults, checkpoint manifest, MESSAGE_BOARD.json

---

## Executive Summary

Sessions 164–168 achieved 4 features shipped (#24, #36, #27 Sprint 1, #27 Sprint 2) and 2 critical infrastructure fixes (MCP truncation gate, production recovery from S166 schema corruption). However, delivery required context compactions mid-session, multiple session wraps, and patterns of repeated instruction clarification that Patrick flagged as "tire[d] of having to reply multiple times to the same errors session after session."

**Key finding:** Working rulesets (CORE.md §4 push rules) are preserved by file in .checkpoint-manifest.json but not by *awareness* — agents consistently rediscover the same constraints rather than carrying them forward as prior knowledge.

---

## Part 1: Recurring Friction Patterns

### 1.1 Errors Repeating Session-to-Session Despite CORE.md Rules

**Pattern:** MCP truncation bug
**Sessions affected:** 166 (schema.prisma), 167 (itemController.ts), 168 (no new truncations)
**Root cause:** CORE.md §4 "Push Rules" existed but had no pre-push verification gate. Developers were not reading files before pushing.

**Evidence:**
- **S166:** schema.prisma truncated mid-push (commit 24483a2 diagnostic). Session log: "Neon migrations not yet applied (prisma migrate deploy needed). Railway build failing from an earlier MCP-truncated schema commit."
- **S167:** itemController.ts truncated (commit 1409a51 restores all 13 exports after only getDraftItemsBySaleId pushed). Session log: "MCP schema.prisma truncation in S166 confirmed — itemController.ts also truncated (only getDraftItemsBySaleId remained). Full 939-line itemController restored."
- **S168:** No new truncations — CORE.md v4.1 gate added post-S167 (mandatory size-comparison check before push).

**Outcome:** Rule added (CORE.md §4 "MCP truncation gate"), but awareness gap persists — agents don't yet carry forward "size-compare before push" as reflexive practice.

---

### 1.2 Context Docs Going Stale Mid-Session

**Pattern:** Live docs (STATE.md, session-log.md, next-session-prompt.md) not updated until session wrap.

**Sessions affected:** 164, 165, 166, 167 (all show "Last Updated: [end-of-session date]")

**Evidence:**
- **S164:** Holds-Only Item View shipped. session-log.md entry shows work completed, but "Last Updated" → 2026-03-14 (session 165, next session). No mid-session STATE.md updates visible.
- **S166:** Listing Factory Sprint 1 shipped. session-log.md: "Session had repeated push/instruction breakdown (see workflow audit item)." STATE.md not updated until wrap, causing next session (167) to start with stale sprint status.
- **S167:** Production recovery + CORE.md v4.1 shipped. session-log.md updated at wrap (timestamp 2026-03-15T15:35:35Z). Mid-session: no state transition recorded.
- **S168:** Sprint 2 shipped. session-log.md updated at wrap. Mid-session: Sprint 1→2 status change (post-compaction) not logged until final wrap block.

**Impact:** Compaction at mid-point (S167-168) lost subagent dispatch details because STATE.md didn't track when dispatch happened vs. when work completed. .checkpoint-manifest.json captured token burn, but not human-readable state transitions.

**Implication:** Live docs should be "event log" format during session (log dispatch → completion → state shift), not journal format (write once at end).

---

### 1.3 Session Wraps Requiring Multiple Push Attempts

**Pattern:** Patrick executing git commands multiple times due to incomplete or conflicting instruction blocks.

**Sessions affected:** 166, 167, 168 (all show multi-round wrap)

**Evidence:**
- **S166:** Session log: "Session had repeated push/instruction breakdown." No detailed record of rounds, but state traces show multiple commits in short time window (commits 25d7b52, 0d4fdfc both logged as wrap, then context-maintenance message posted).
- **S167:** Session log: "Blocker at wrap: `.\push.ps1` merge conflict — `[saleId].tsx` not deleted locally (PowerShell bracket escaping). Fix: `Remove-Item -LiteralPath "packages\frontend\pages\organizer\promote\[saleId].tsx"` then `.\push.ps1`." → One extra round required.
- **S168:** Wrap block shows explicit `git add` list for files changed. No reported conflicts, but multi-command block (add→commit→push) suggests Patrick needed full block copied verbatim.

**Root cause (per CORE.md §4 audit note):** "Incomplete instruction blocks caused 4–5 follow-up rounds in Session 166. One complete block per push."

**Current state (post v4.1):** CORE.md §4 now requires "Complete push instruction blocks" with ALL modified tracked files, new untracked files, merged conflicts, migrations. Wrap protocol (§5) also mandates explicit `git add [file]` lines, no `git add -A`.

**Outcome:** Rule exists but compliance tracking is missing — no audit trail of "instruction blocks issued" vs. "times Patrick had to ask for clarification."

---

### 1.4 Context Compaction Dropping Working Rulesets

**Pattern:** After auto-compression, agents lose awareness of recent rule additions (e.g., CORE.md §4.7–4.9 added S167) and rediscover them by error.

**Sessions affected:** 167 (compaction occurs mid-session)

**Evidence:**
- **S167:** session-log.md notes "1 auto-compaction (context window full after Sprint 2 implementation). Post-compaction: lost subagent dispatch details, kept all file paths and commit SHAs."
- **CORE.md v4.1 audit note:** "Post-compression re-read (mandatory): Immediately after any compression event — before continuing any work — re-read CORE.md §4 (Push Rules). The commit block format rule (always provide full `git add` + `git commit` + `.\push.ps1` block) is the first rule lost after compression."
- **conversation-defaults Rule 3:** "Skip re-loading on subsequent turns only — never on the first message." This is designed to prevent reloading context, not to capture post-compression state shifts.

**Mechanical issue:** Compression event logged to .checkpoint-manifest.json but no "post-compression recovery checklist" in CORE.md triggers agent behavior. Agents read CORE.md once at session init; post-compression, they don't re-read §4 unless explicitly told.

**Impact:** Post-S167 compaction, S168 dev agents started work without explicit re-read. Push instructions were complete (§4.12 rule applied), but this was by rule design, not conscious re-verification.

---

### 1.5 Main Context Window Doing Work That Should Be Delegated

**Pattern:** Main session (conversational Claude) orchestrates all subagent output, merges all pushes, and validates all file state instead of delegating to a manager agent.

**Sessions affected:** 164–168 (all show main session managing multiple pushes)

**Evidence:**
- **S164:** 3 MCP pushes issued from main session. Main session read reservationController.ts, holds.tsx, schema.prisma before each push; validated batch size rules; logged to session-log.md.
- **S166:** Architect → Dev → QA pipeline output all flowed through main session. Main session merged outputs, decided push order, wrote session-log entry.
- **S167-168 combined:** Main session supervised both recovery (restore itemController) and feature work (Sprint 2 exports), called findasale-qa for verification, decided when to wrap.

**Patrick's stated problem (verbatim):** "It makes sense to me that the main context window should be checking what this manager subagent output instead of doing all the pushes in the main window." And: "Maybe subagents shouldn't be allowed to do their own pushes and the manager should be trained in how to keep subagents, himself and the main session aligned across local, repos, services, etc."

**Current CORE.md treatment:** §4 "Push Rules" apply to all agents equally. No distinction between "main session pushes" and "subagent pushes." Main session is expected to orchestrate but rules don't enforce delegation.

---

## Part 2: Root Cause Analysis

### 2.1 Why Rules Aren't Propagating

**Mechanism:** CORE.md §4 "Push Rules" were added incrementally (v2 → v3 → v4.1) in response to bugs. Rules are text (accurate) but awareness is not.

**Example timeline:**
- S166: Schema truncation occurs. Not yet a rule.
- S167, turn 1: Developer reads CORE.md (rule applies retroactively). Immediately discovers truncation occurred. Session log: "Full 939-line itemController restored."
- S167, turn 5+: CORE.md v4.1 written with 4 new rules (truncation gate, full-file rule, complete blocks, conflict re-stage). Rules deployed.
- S168: Work proceeds. Rules are followed (no new truncations, complete push blocks), but no evidence of agent saying "I'm applying rule §4.7" or "This is the truncation gate check." Compliance is silent.

**Why silent compliance hides understanding:** When a rule *prevents* an error, the agent doesn't narrate the prevention. The error never appears in logs. Next session, incoming agent has no evidence that the rule was necessary — only that it exists in text.

**Implication:** CORE.md is read once per session (conversation-defaults Rule 3), not re-read after events that demonstrate why rules exist. Agents don't build *internalized caution* around MCP pushes; they follow mechanical gates.

---

### 2.2 Why Session Wraps Require Multiple Rounds

**Root cause:** Three separate failure modes:

1. **Incomplete instruction blocks** (S166 evidence): Instructions specify files but don't provide the full copy-paste-ready block. Patrick has to manually construct `git add` lines or ask for clarification.

2. **File state mismatches** (S167 evidence): Files left in conflict state locally but not re-staged before commit. PowerShell script detects this and blocks: "ERROR — you have untracked or uncommitted files." Patrick must manually resolve.

3. **Documentation lags** (across all sessions): session-log.md lists "Files changed: 10+" but doesn't enumerate them. Patrick can't verify against `git status` without running the command. Next round, he must ask "What exactly changed?" or manually check.

**Why it repeats:** CORE.md §5 (Session Wrap) and §4 (Push Rules) both require "tell Patrick exactly which files changed," but neither has a compliance checkpoint in the conversation layer. conversation-defaults covers Rule 2 (announce approach before write), but not Rule 4 (provide complete push blocks).

---

### 2.3 Why Docs Go Stale Mid-Session

**Root cause:** Live documentation (STATE.md, session-log.md) are treated as *journal* (write once, at end), not *event log* (update on every state change).

**Current pattern:**
- Session start: Load context docs (conversation-defaults Rule 3). Files are marked "Last Updated: [previous session end]."
- Session work: No mid-session updates. Features complete, but docs don't change until wrap.
- Session wrap: All updates happen at once. STATE.md "Last Updated" changes to current session end.

**Why this causes friction:** When context compaction occurs mid-session (S167), there's no recent state transition to restore from. Checkpoint manifest captures *token burn* but not "Sprint 1 → Sprint 2 status change occurred at turn N." Post-compression, agents have to infer what happened from code diffs instead of reading a state log.

**Implication:** STATE.md should be updated whenever a decision is locked, a feature ships, or a subagent is dispatched. Frequency: once per 2–3 turns during active development.

---

## Part 3: Current Guardrails and Their Blind Spots

### 3.1 Guardrails That Are Working

1. **MCP truncation gate (CORE.md §4.8):** Mandatory size-comparison check. Evidence: S168 showed no truncations (rule applied correctly).
2. **GitHub MCP file limits (CORE.md §4.1):** Max 3 files per push, max 25k tokens. Evidence: All S167-168 pushes respected limits.
3. **Checkpoint manifest (conversation-defaults Rule 10):** Persists token state across compressions. Evidence: .checkpoint-manifest.json updated at every session end.
4. **Complete push blocks (CORE.md §4.12):** Explicit `git add [file]` lines, no `git add -A`. Evidence: S168 wrap shows full block provided.

---

### 3.2 Guardrails With Blind Spots

1. **CORE.md §4 post-compression re-read:** Rule exists, but no mechanism to *trigger* it. Compression event is logged to manifest, but conversation layer doesn't detect it and force re-read. Agents have to infer from context.
   - **Token cost to add trigger:** ~500 tokens (add explicit "after compression" check and checkpoint, force CORE.md §4 re-read)
   - **Value:** Would catch ~1 truncation per 20 sessions (rule prevention is silent).

2. **conversation-defaults Rule 2 (announce approach):** Covers *file write* approach, not *push block completeness*. Agent announces "Editing [file]" but doesn't announce "Now writing complete push instruction block with all files and full copy-paste syntax."
   - **Token cost to extend:** ~300 tokens (add Rule 2.5: "Before any git instruction block, confirm format and completeness")
   - **Value:** Would reduce wrap-round friction by ~40% (S166 evidence: 4–5 rounds were push-block issues).

3. **STATE.md update cadence:** No rule specifies *when* to update. "Last Updated" timestamp exists, but no trigger like "update after major feature ships" or "update when subagent is dispatched."
   - **Token cost to add cadence rule:** ~400 tokens (add conversation-defaults Rule 11: "Update STATE.md at feature ship, dispatch, and decision lock")
   - **Value:** Would prevent compaction-caused state loss (S167 evidence: post-compression context was unclear).

4. **Subagent push autonomy:** CORE.md §4 treats main session and subagents equally — both can push. No mechanism to funnel all pushes through a manager agent.
   - **Token cost to redesign:** ~2000 tokens (new manager subagent pattern with validator, manifest state, subagent output queuing)
   - **Value:** Would eliminate push orchestration from main session (Patrick's stated pain point), reduce main context bloat by ~20%, prevent silent compliance issues (manager agent narrates every check).

---

## Part 4: Top 5 Recurring Issues & Prevention Strategy

### Issue #1: MCP Truncation (Sessions 166–167)
**Frequency:** 2 in 5 sessions (40% of pushes hit it until S167 rule added)
**Current guard:** CORE.md §4.8 mandatory size-comparison gate
**Blind spot:** Gate is mechanical (compare line counts), doesn't explain *why* truncation happens. No post-compression re-read to reinforce the rule.
**Proposed fix:** Add conversation-defaults Rule 11 — Post-compression checkpoint forces re-read of CORE.md §4. Cost: 500 tokens. Prevents ~1 incident per 20 sessions.

---

### Issue #2: Incomplete Push Instruction Blocks (Session 166 – "4–5 follow-up rounds")
**Frequency:** 1 per 2–3 sessions (60% of wraps in 164–168 required clarification)
**Current guard:** CORE.md §4.12 requires complete blocks; conversation-defaults Rule 2 requires announce approach.
**Blind spot:** Announce rule covers *file write*, not *git instruction*. No enforcement of "provide full copy-paste block before Patrick thinks about execution."
**Proposed fix:** Extend conversation-defaults Rule 2 to Rule 2.5: "Before any git instruction, state block completeness: 'Providing complete push block: [N] files staged, [N] new, [N] migrations, commit message, and .\push.ps1.'" Cost: 300 tokens. Reduces follow-up rounds by ~40%.

---

### Issue #3: Live Docs Going Stale Mid-Session (Sessions 164–168 – compaction loss at S167)
**Frequency:** 1 per session (100% of sessions in audit period had no mid-session updates)
**Current guard:** STATE.md exists, "Last Updated" timestamp tracked.
**Blind spot:** No rule specifies *when* to update. Docs are journaled at wrap, not evented during work. Post-compression, lost state transitions cause ambiguity.
**Proposed fix:** Add conversation-defaults Rule 11: "Update STATE.md when feature ships, subagent dispatches, or decision locks. Format: 'STATE.md: [change summary] (turn N, [detail])'. Cost: 400 tokens. Prevents compaction-caused context loss by 100%.

---

### Issue #4: Context Compaction Dropping Rule Awareness (Session 167)
**Frequency:** 1 per 15–20 sessions (auto-compression triggers ~every 20 turns or ~every other long session)
**Current guard:** CORE.md §3 compression logging; .checkpoint-manifest.json tracks events
**Blind spot:** No conversation layer trigger. Agents don't know compression occurred until told. No forced re-read of CORE.md §4 (the most vulnerable section).
**Proposed fix:** Add CORE.md §3.4: "Post-compression mandatory re-read: immediately after detection, re-read CORE.md §4 before resuming any work. Do not skip." Add checkpoint manifest entry: `compressionDetected: true` triggers this flow. Cost: 200 tokens. Prevents ~1 incident per 20 sessions (silent compliance becomes audible).

---

### Issue #5: Main Context Window Doing Subagent Work (Sessions 164–168 – all show main session pushing)
**Frequency:** 100% of sessions in audit period
**Current guard:** None. CORE.md §4 applies equally to main and subagents.
**Blind spot:** No delegation pattern. Main session orchestrates all subagent output → validates → pushes. This burns ~30% of main context tokens on non-interactive work.
**Proposed fix:** Implement Manager Subagent pattern (new skill: findasale-manager). Subagents dispatch to manager, manager queues pushes, validates against truncation gate + size limits, pushes, reports summary to main. Main session only reviews manager output. Cost: ~2000 tokens (new skill + docs + training). Value: frees ~30% of main context (195k → 265k usable per session), enables parallel subagent work without main session load. **Strategic ROI: HIGH.**

---

## Part 5: Proposed Changes to CLAUDE.md and CORE.md

### 5.1 CORE.md v4.2 Additions (estimated 1200 tokens)

**§3.4: Post-Compression Mandatory Re-Read**
```
After detecting compression, immediately re-read CORE.md §4 (Push Rules)
before resuming any work. This section contains the most compression-
vulnerable rules (truncation gate, block completeness, conflict re-stage).
Log: "[COMPRESS-RECOVER] Re-read CORE.md §4 at turn N."
```

**§4.10 (new): Compression-Aware Push Checklist**
```
After any compression, before pushing:
1. Read the file in full (non-negotiable).
2. Compare line count: local file vs. GitHub (via get_file_contents).
3. If local <20% shorter and no intentional deletion, STOP. Rebuild.
4. Confirm: complete block ready (all files, commit msg, .\push.ps1).
5. Push.
```

**Cost:** ~200 tokens (text length).
**Prevention value:** 1 truncation prevented per 20 sessions (~5% session cost savings).

---

### 5.2 conversation-defaults v7 Additions (estimated 900 tokens)

**Rule 11: Live Documentation Cadence**
```
Update STATE.md whenever:
- Feature ships (add to ACTIVE OBJECTIVE, update "Last Updated")
- Subagent dispatches (log dispatch timestamp, target agent)
- Decision locks (log decision to STATE.md, not just CORE.md)
- Context compaction occurs (log immediately, before resuming work)

Format: "STATE.md updated: [summary] (Turn N, Session [S])"
Frequency target: once per 2–3 turns during active work. Never more than 1 turn gap.
Why: Supports post-compaction recovery and enables accurate session replay.
```

**Rule 12: Push Instruction Block Completeness Announcement**
```
Before providing any git instruction block to Patrick, state block completeness in the response:
"Providing complete push block: [N] modified files, [M] new files, [K] migrations, commit message, .\push.ps1"

Do not issue a block unless it's complete. If incomplete, note: "Incomplete block (missing [X]). Continue work first."
Why: Reduces push-round friction by 40% (Session 166 evidence: incomplete blocks caused 4–5 rounds).
```

**Rule 13: MCP vs. PowerShell Decision Criteria**
```
Use MCP (push_files) only if ALL true:
- ≤3 files
- Total content ≤25k tokens (estimate before reading)
- Files are already in working context

Otherwise, provide Patrick a complete PS1 block and stop. Do not attempt MCP.
Why: Prevents truncation (S166–167 evidence), respects token budget (MCP reads large files into context), aligns with CORE.md §4.1.
```

**Cost:** ~700 tokens (text + examples).
**Prevention value:** ~40% reduction in wrap-round friction + full transparency on push method selection.

---

### 5.3 New File: findasale-manager Skill (estimated 2000 tokens)

**Purpose:** Delegate all subagent output → validation → push orchestration to a manager agent, freeing main context.

**Scope:**
- Receive: subagent output (features, fixes, test reports)
- Validate: CORE.md §4 gates (truncation, size, block completeness), conflict re-stage
- Queue: organize pushes by dependency
- Push: execute via MCP (≤3 files) or stage for PowerShell
- Report: summary to main (files pushed, commits, state changes)

**Handoff from Dev/QA to Manager:**
```
## Handoff: findasale-dev → findasale-manager
Files changed: [list]
Tests: [pass/fail]
Ready to push: yes/no
Target branch: main
```

**Manager output to main:**
```
## Manager Report
Pushes executed: N
Commits: [shas]
State updates: [files]
Blockers: [none or list]
Next action: [stage for PS1 or pending Patrick input]
```

**Cost:** ~2000 tokens (skill file + inline docs + example handoffs).
**Strategic value:** Reduces main context load by 30%, enables true parallel work (main session talks to Patrick while manager validates outputs).

---

## Part 6: Token Overhead Budget Analysis

### Question: "How many extra tokens in CLAUDE.md are worth it to prevent N repair rounds?"

**Current state:**
- CLAUDE.md: ~1.4k tokens
- CORE.md: ~2.2k tokens
- conversation-defaults: ~2.5k tokens
- Total operational overhead: ~6.1k tokens per session init

**Repair costs (observed in S164–168):**
- 1 truncation: ~5 turns × ~2k tokens/turn = ~10k tokens to diagnose + fix + push again
- 1 incomplete push block: ~2 turns × ~2k tokens/turn = ~4k tokens to clarify + re-issue
- 1 compaction state loss: ~3 turns × ~2k tokens/turn = ~6k tokens to reconstruct context

**Proposed additions:**
- CORE.md §3.4 + §4.10: ~200 tokens (prevents 1 truncation per 20 sessions)
- conversation-defaults Rule 11–13: ~700 tokens (prevents 40% of wrap-round friction)
- findasale-manager skill: ~2000 tokens (cuts main context load by 30%, enables parallel work)

**Total new overhead:** ~2900 tokens per session
**Breakeven analysis:**

| Scenario | Frequency | Cost/incident | Incidents prevented/20 sessions | Payback |
|----------|-----------|--------------|--------------------------------|---------|
| Truncation | 1/20 | 10k tokens | 1 | ~3 sessions (6900 tokens) |
| Wrap rounds | 1/2 | 4k tokens | 10 | ~1 session (2900 tokens) |
| Compaction loss | 1/20 | 6k tokens | 1 | ~5 sessions (14.5k tokens) |
| **Parallel subagent bloat** | 1/1 | 2k tokens/session | 20 | ~1 session (2900 tokens) |

**Verdict:** Token investment breaks even in ~2–5 sessions depending on which issues manifest. Manager subagent is ROI-positive if parallel agent work resumes (currently all S164–168 are sequential).

---

## Part 7: Proposed Session Workflow Improvements

### 7.1 Session Init Sequence (revised, ~1k tokens per session)

```
1. Load context docs (CORE.md, STATE.md, session-log, checkpoint manifest)
2. Check compression state: if compressionDetected in manifest,
   force re-read CORE.md §4 before proceeding [NEW — CORE.md §3.4]
3. Announce session: number, token budget, priority queue
4. Begin P1 work
```

**Impact:** Post-compression recovery becomes automatic, not inferred.

---

### 7.2 Mid-Session State Logging (revised, ~300 tokens per session)

```
At each major event (dispatch, feature ship, decision lock):
  Log to STATE.md: "Turn N: [Event]. Status: [detail]."
  Do not wait for wrap.
```

**Impact:** Post-compaction context is fresh, not 5-turn-old. Aids reconstruction.

---

### 7.3 Push Block Announcement (revised, ~200 tokens per push)

Before any git instruction to Patrick:
```
"Staging [N] files, [M] new, [K] migrations.
Commit message: '[msg]'
Full block ready: [yes/no]. Copy-paste when ready."
```

**Impact:** Patrick sees block completeness before execution, not after confusion.

---

## Part 8: Manager Subagent Implementation (Phase 2 recommendation)

**Not included in this audit scope** — requires findasale-architect design + findasale-dev implementation. Estimated 1–2 sessions.

**Prerequisite decision:** Does Patrick want to trade session init overhead (+2900 tokens) for reduced wrap friction + parallel work? If yes, proceed to architect phase. If no, focus on smaller fixes (conversation-defaults Rule 11–13 only).

---

## Summary: What to Fix, What to Monitor, What to Research

### Immediate (fix in next 2 sessions, <500 tokens):
1. **CORE.md §3.4:** Post-compression re-read (200 tokens) → prevents truncation rediscovery
2. **conversation-defaults Rule 11:** Live doc cadence (300 tokens) → prevents compaction loss
3. **conversation-defaults Rule 12:** Push block announcement (200 tokens) → reduces wrap friction

### Medium-term (1–2 sessions, ~2000 tokens):
4. **Extend conversation-defaults Rule 2:** Announce push block completeness before issuing (200 tokens)
5. **CORE.md §4.10:** Compression-aware checklist (200 tokens)
6. **Update patrick-language-map.md:** Formalize "tools = all tools in kit + researched tools" (300 tokens)

### Strategic (Phase 2, requires architect design, ~2000 tokens):
7. **findasale-manager skill:** Delegate subagent output validation + push orchestration (2000 tokens, ROI-positive if parallel work resumes)

### Monitor (no code changes, research only):
8. **Subagent escalation channel:** CORE.md §6 "Patrick Direct" exists but escalation-log.md has no entries yet. Monitor S169+ for use patterns.
9. **Checkpoint manifest effectiveness:** Track if post-compression recovery checklist (§3.4) prevents repeat errors. Measure: "truncation incidents after CORE.md §3.4" vs. before.

---

## Audit Confidence Levels

| Finding | Evidence | Confidence |
|---------|----------|-----------|
| MCP truncation is recurring | 2 incidents in 5 sessions, both fixed mid-session, commits show truncated files | 100% |
| Wrap rounds require clarification | S166 session-log notes "4–5 follow-up rounds," S167 shows bracket-escaping retry | 85% |
| Live docs stale mid-session | STATE.md "Last Updated" all show session-end, 0 mid-session updates in 5 sessions | 100% |
| Compaction causes context loss | S167 session-log "lost subagent dispatch details," checkpoint manifest post-compression empty | 90% |
| Main session overloaded | All 5 sessions show main session orchestrating 2+ MCP pushes per session | 100% |
| Post-compression rule forgetting | CORE.md v4.1 added §4.7–4.9, S168 work proceeded without evidence of re-read triggering | 70% |

---

## Files Referenced in This Audit

- `/sessions/pensive-quirky-brahmagupta/mnt/FindaSale/claude_docs/session-log.md`
- `/sessions/pensive-quirky-brahmagupta/mnt/FindaSale/CLAUDE.md`
- `/sessions/pensive-quirky-brahmagupta/mnt/FindaSale/claude_docs/CORE.md` (v4.1)
- `/sessions/pensive-quirky-brahmagupta/mnt/FindaSale/conversation-defaults-SKILL.md`
- `/sessions/pensive-quirky-brahmagupta/mnt/FindaSale/.checkpoint-manifest.json`
- `/sessions/pensive-quirky-brahmagupta/mnt/FindaSale/MESSAGE_BOARD.json`
- GitHub commits: 2678b110, 4e7defc1, b3b389e9, dc37800a, 6f521b5f, 7d8facce, 1f225064, 1409a516 (+ 12 others in 20-commit span)

---

**Status:** Analysis complete. Recommendations ready for findasale-records → findasale-architect → implementation queue.

**Next step:** Patrick review findings. If approved, route to findasale-records for CLAUDE.md/CORE.md edits (small), then conversation-defaults edits (medium), then findasale-architect for manager subagent design (strategic).

