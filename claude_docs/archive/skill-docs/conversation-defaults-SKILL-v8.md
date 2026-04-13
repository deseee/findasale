---
name: conversation-defaults
metadata:
  version: 5
  last_updated: "2026-03-16 (Session 179)"
description: >
  Always-active conversation behavior defaults for Patrick's Cowork sessions.
  Apply these rules at the start of every conversation and before asking any
  clarifying questions. This skill MUST be consulted whenever Claude is about
  to ask the user a question, present choices, or clarify requirements — even
  for simple tasks. Do not skip this skill.
---

# Conversation Defaults

These are standing behavioral rules that override default Claude behavior for
all conversations in this workspace. Read and apply them before doing anything
else.

---

## Rule 1: Use AskUserQuestion for structured clarifying questions

The **AskUserQuestion tool is active and working** as of 2026-03-07. Use it
when structured input would help — offering options, confirming choices, or
gathering requirements before starting multi-step work.

**Use it when:** Format choices, ambiguous scope, multiple valid approaches,
or any multi-step task where clarification upfront saves a wasted turn.

**Self-check gate (before responding to multi-step tasks):**
- "Is Patrick's request ambiguous on approach, scope, or priorities?"
  - YES → Use AskUserQuestion. Stop. Wait for clarification.
  - NO → Proceed with best-fit approach, announce it clearly.
- "Could clarifying upfront save a wasted follow-up turn?"
  - YES → Use AskUserQuestion.
  - NO → Proceed.

**Don't use it for:** Simple follow-ups mid-task, quick yes/no checks, or
when the answer is already clear from context.

**GATE (before manual questions):** Before asking Patrick ANY question, check: Is this a yes/no binary where AskUserQuestion applies? If yes → use the tool, not a manual question.

*History: Tool was disabled 2026-02-28 due to a rendering bug. Bug confirmed
resolved 2026-03-07 (session 91, Cowork Power User sweep).*

---

## Rule 2: Announce file modification approach before every write

Before using the Write or Edit tool on any existing file, state the approach
in one line in the response text:

- Targeted edit: "Editing [file] lines X–Y"
- Full rewrite: "Rewriting [file] entirely — confirmed by Patrick"

Full rewrites require explicit permission. Phrases like "major rewrite,"
"overhaul," or "audit" do NOT count as permission. Only an unambiguous statement
like "rewrite the whole file" or "start fresh" qualifies. If unsure, ask:
"Should I do targeted edits or a full rewrite?"

This rule applies to all file types — code, docs, config, roadmap, skills.
Skipping the announcement is a CORE.md Section 4 violation.

Why this exists: Session 39 — Claude rewrote ROADMAP.md entirely (twice)
without announcing the approach or confirming with Patrick. The diff-only rule
was in CORE.md but had no active enforcement checkpoint in the conversation
flow. This rule closes that gap.

---

## Rule 3: First message of any session = immediate session start

**Any first message** — short opener, status report, completion update, task assignment, or anything else — is a session start signal. ONE response pattern. No branching.

**GATE (fires before first response):**
Before responding to Patrick's first message, ask yourself:
- "Is this my first message in this conversation?"
  - YES → Execute the unified pattern below (all steps, no exceptions)
  - NO → Skip this rule; proceed normally

**Single unified pattern (all first messages):**
1. Load context silently: STATE.md, session-log (last 2 entries), next-session-prompt.md, `.checkpoint-manifest.json`. Do not narrate the loads. Note any `.skill` reinstalls needed if SKILL.md files were edited last session.
2. Acknowledge in one sentence. If short opener, add warmth. If task/status, confirm receipt. Either way: one sentence.
3. Announce: session number, token budget ("~200k context window. ~5k init overhead. ~195k available. Warn at 170k used (85%). Hard stop at 190k (95%)."), last session summary, and priority queue.
4. Begin Priority 1 immediately. If P1 is blocked (requires Patrick's external input), begin Priority 2 and name P1 as blocked. Never end init with a question.

**Never ask:** "What would you like to work on today?" — the docs answer that.

**Skip condition (CORE.md §2):** Skip re-loading on subsequent turns only — never on the first message.

Why this exists: Two-branch pattern (short opener vs. task assignment) caused inconsistent enforcement — the task-assignment branch omitted the token budget announcement and produced shorter init sequences. Six independent agent audits (Session 118) identified this as a top failure mode. Merged to a single path: identical steps regardless of message type. (v3, 2026-03-09.)

---

## Rule 4: dev-environment gate before any shell command

Before issuing **any** shell command, PowerShell command, Prisma command,
migration instruction, or environment variable guidance — verify that the
`dev-environment` skill has been loaded this session.

**GATE (fires before emitting ANY such command):**
- Ask yourself: "Have I loaded or verified dev-environment in this session?"
  - NO → Load it now via `Skill('dev-environment')`. Then issue the command.
  - YES and I see my own load call → Proceed; it's loaded.
  - UNSURE → Load it now. Better safe than wrong-database.

This applies on the **first command of any session**, mid-sprint, in follow-up
corrections, and in subagent handoffs. The trigger is the act of writing the
command, not the start of the session.

Why this exists: Session 89 — Claude issued a `docker exec` command (Docker is
retired) without loading dev-environment first, a direct CORE.md §16 violation.
Moving enforcement to conversation-defaults ensures it fires at the conversation
layer without requiring Claude to proactively remember §16 mid-sprint.
(Added 2026-03-07, approved by Patrick.)

---

## Rule 5: Never tell Patrick to manually resolve git issues

When encountering any git problem — merge conflicts, stale branches, rebase errors,
uncommitted file conflicts — **always use available tools to fix it yourself**.

**GATE (before escalating or asking Patrick to fix git):**
- Ask: "Can I use Read + Edit + MCP push to fix this myself?"
  - YES → Do it. Diagnose, read the file, edit, push.
  - NO → Ask: "Is this genuine repo corruption (not a merge conflict or stale state)?"
    - YES → Escalate with full diagnosis of what `git status` shows.
    - NO → It's fixable. Try again.
- "Am I about to tell Patrick to manually fix something?" → STOP. Fix it yourself first.

Examples:
- **Merge conflicts:** Read the file → Edit to remove markers → push via MCP
- **Stale local state:** Push correct version via MCP, tell Patrick to run `.\push.ps1`
- **Uncommitted changes blocking pull:** Tell Patrick `git checkout -- <files>` only when the correct versions are already on remote

**Never say:** "Manually resolve the conflict," "Open the file and remove the markers,"
or "Run `git merge --abort` and fix it yourself."

**Exception:** Genuine repo corruption requiring `git init` — escalate with full diagnosis.

Why this exists: Session 89 — Claude told Patrick to manually fix conflict markers
in session-log.md. Patrick: "I shouldn't have to manually fix your mistakes."
(Added 2026-03-07.)

---

## Rule 6: Treat abbreviated language as precise, not vague

When Patrick uses shorthand like "etc.", "and so on", "and similar", "stuff like that",
or trailing ellipsis ("..."):

- **Do not expand** the shorthand into a speculative list of additional items.
- **Do not assume** the abbreviation means "and everything else in this category."
- **Treat it as:** "there may be more, but I've given you the important ones."
- **If scope matters for the task:** (1) Did Patrick say "and/or" or "similar"? NO → list is complete. (2) Ask ONE question. (3) If scope doesn't matter, proceed with listed items only.
- **If scope doesn't matter:** Proceed with only the items explicitly stated.

**Never:** Silently add 5 extra items to a list because Patrick said "etc." after listing 3.

Why this exists: Patrick flagged that "etc." was being over-expanded, changing task
scope beyond what he intended. Abbreviated instructions are potentially precise, not
vague. (Added 2026-03-09, backlog E11. Revised 2026-03-15, Session 169.)

---

## Rule 7: File creation path validation

Before creating any new file in `claude_docs/`, verify the path against
`claude_docs/operations/file-creation-schema.md`:

**GATE (before calling Write to create a new file in claude_docs/):**
- Ask: "Does this file go in `claude_docs/`?"
  - NO → Create it in the appropriate directory. (Skip rest of this rule.)
  - YES → Check 4 questions before writing:
    1. **Correct directory?** Research → `research/`, operations → `operations/`, etc. ✓
    2. **Correct naming?** Authority = UPPERCASE, living = kebab-case, one-time = kebab-case-date. ✓
    3. **Research docs?** Must include backlog ID prefix (e.g., `e2-topic.md`). ✓
    4. **Root-level?** Only Tier 1 authority docs go in `claude_docs/` root. ✓
  - If ANY answer is NO → Fix the path first, then write.
  - If ALL answers are YES → Write the file.

If unsure about the schema, read `claude_docs/operations/file-creation-schema.md` first. Don't ask Patrick
about file paths — just follow the schema.

Why this exists: Session 95 audit (E17) found inconsistent naming across 115 files.
The schema prevents further drift. (Added 2026-03-09.)

---

## Rule 8: Message board protocol

When invoking a subagent via `Skill` tool, include this instruction in the dispatch:
"Read `claude_docs/operations/MESSAGE_BOARD.json` on start. Post a status message
on completion listing all files changed."

**GATE (before dispatching any subagent):**
- Ask: "Am I about to invoke a Skill (subagent)?"
  - YES → Add the message board instruction to the dispatch. Then call Skill.
  - NO → Skip this rule.
- Ask: "Did a Skill just complete?"
  - YES → Read MESSAGE_BOARD.json for new messages before responding or continuing.
  - NO → Skip.

**Note:** `MESSAGE_BOARD.json` is in `.gitignore` and is NOT git-tracked. Agents should still read and write it normally — it just won't appear in `git status` or block pushes.

Why this exists: E4 inter-agent communication foundation (session 96). (Added 2026-03-09.)

---

## Rule 9: Token budget briefing at session start

At every session init, include in the announcement:

```
~200k context window. ~5k init overhead. ~195k available.
Warn at 170k used (85%). Hard stop at 190k (95%).
```

Log checkpoints at natural pauses per CORE.md §3 and `operations/token-checkpoint-guide.md`.

Why this exists: Session 115 research confirmed token tracking is low-cost (30 tokens/session) and high-ROI (prevents ~20% token loss from surprise compressions). (Added 2026-03-09, Session 116.)

---

## Rule 10: Checkpoint manifest reads and writes

`.checkpoint-manifest.json` at repo root is the persistent token state store. It survives compressions and session transitions.

**GATE (at each critical moment):**
- At session init: Ask "Have I read `.checkpoint-manifest.json` yet?"
  - NO → Read it. Restore last session history. Write new `currentSession` entry (new sessionId, reset counters, set `startedAt`).
- At each checkpoint: Ask "Should I log a checkpoint now?" (natural pause, major work completed)
  - YES → Write to `checkpoints[]` in the manifest before continuing.
- At context compression: Ask "Am I being compressed?"
  - YES → IMMEDIATELY write to `compressionEvents[]` before doing anything else.
- At session wrap: Ask "Am I signing off?"
  - YES → Write final token burn to `sessionHistory[]`.

If the manifest file is missing or corrupted: create a fresh one using the schema from CORE.md §3.

Why this exists: Session 118 advisory board audit found that in-conversation checkpoints are erased by compressions. JSON file persists across both compressions and session transitions. (Added 2026-03-09, Session 118.)

---

## Rule 11: Pre-dispatch checkpoint before agent batches

Before dispatching 3 or more agents in parallel:

**GATE (before calling Skill 3+ times in parallel):**
- Ask: "Am I about to dispatch 3 or more agents?"
  - YES → Execute checklist before dispatch:
    1. Write a checkpoint to `.checkpoint-manifest.json` `checkpoints[]`.
    2. Estimate the session token total after the dispatch (add 5k per agent baseline).
    3. If estimated total will exceed 150k, warn Patrick: "Dispatching N agents will push session to ~Xk tokens (Yk% of budget). Proceed?"
    4. If estimated total will exceed 170k, STOP and require explicit Patrick confirmation before dispatching.
    5. If estimate is acceptable → Dispatch all agents.
  - NO → Proceed without this gate.

Why this exists: Multi-agent batches are the largest single token spike in any session (5–15k per agent). Pre-dispatch checkpoint ensures state is saved before the spike, and budget check prevents surprises. (Added 2026-03-09, Session 118.)

---

## Rule 12: Never output placeholder values

**GATE (before emitting ANY command, code snippet, or output with a value):**
- Ask: "Does this output contain a placeholder like `<paste your X>` or `<your Y>`?"
  - YES → Ask: "Is the real value readable from a VM file?"
    - YES → Stop. Read the file. Inline the real value instead. Emit corrected output.
    - NO → Stop. Tell Patrick the file is unreadable and ask him to provide the value. Do not emit a placeholder.
  - NO → Proceed.

Common cases:
- Neon `DATABASE_URL` → read from `packages/backend/.env` (commented line starting with `# DATABASE_URL=postgresql://neondb`)
- File paths → derive from the project structure, don't guess

If the file genuinely cannot be read, stop and say so explicitly.
Do not emit a placeholder and continue as if the command is complete.

Flagged by Patrick on 2026-03-11 as a core violation. No exceptions.

---

## Rule 13: Route post-diagnosis implementation to the appropriate subagent

After any subagent completes a diagnosis, analysis, or design task that surfaces required code changes or documentation updates, **do not implement those changes inline in the orchestrator session**. Route to the correct implementation subagent.

**After ANY subagent returns findings: GATE before doing anything. Route code to dev, docs to records. Implementing inline after diagnosis is the largest preventable cause of context bloat.**

**GATE (after any subagent returns findings):**
- Ask: "Did this subagent return code changes, bug fixes, or doc updates that need to be written?"
  - YES → Ask: "What type of change?"
    - **Code changes** (bug fixes, feature implementation, refactors, security patches) → **Invoke `findasale-dev`**
    - **Documentation changes** (SKILL.md, CLAUDE.md, STATE.md, CORE.md, etc.) → **Invoke `findasale-records`**
    - **Both** → Invoke `findasale-dev` first for code, then `findasale-records` for docs
  - NO (subagent only produced a report, analysis, or recommendation with no required follow-on writes) → Proceed inline

**Hard stops — never implement inline after these agents return findings:**
- `findasale-qa`, `health-scout` → always route code fixes to `findasale-dev`
- `findasale-hacker` → always route security patches to `findasale-dev`
- `findasale-architect` → always route implementation to `findasale-dev`
- `findasale-ux` → always route UI/code changes to `findasale-dev`
- `findasale-dev` (diagnosis-only invocation) → re-invoke `findasale-dev` to implement
- `cowork-power-user`, `findasale-workflow` → always route skill/behavior changes to `findasale-records`

**Routing reference:**
| Diagnosing agent | Fix type | Implementation agent |
|------------------|----------|----------------------|
| findasale-qa / health-scout | Bug or vulnerability | findasale-dev |
| findasale-hacker | Security patch | findasale-dev |
| findasale-architect | Architecture implementation | findasale-dev |
| findasale-ux | UI/UX code change | findasale-dev |
| findasale-dev (diagnosis only) | Code fix | findasale-dev (re-invoke) |
| cowork-power-user / findasale-workflow | Skill or behavior file update | findasale-records |
| Any agent | STATE.md / CORE.md / doc update | findasale-records |

Why this exists: Session 138 — findasale-dev diagnosed 3 Rapidfire review page
bugs. Fixes were implemented inline in the orchestrator window instead of
re-dispatching dev. This consumed the full context budget, triggered a silent
autocompact at 77%, and required push reconstruction in the subsequent session.
Inline implementation after subagent diagnosis is the single largest preventable
cause of context bloat in multi-agent sessions. (Added 2026-03-11, Session 138.
Revised 2026-03-15, Session 169. Approved by Patrick.)

---

## Rule 14–23: Reconstructed Rules Status

Rules 14–23 were added to conversation-defaults in Cowork-installed packages (Sessions 138–169) but were never committed to git. The VM reset (Session 179) lost the installed version. These rules are unrecoverable from the git history alone.

**Known lost rules (by reference from commit messages):**
- Rules 20–22 existed in Session 144 (file governance context, archive vault rules)
- Rules 14–19, 21–23 remain lost (no commit references found)

**Recommendation:** Patrick should consult notes from Sessions 138–169 if they were saved externally, or treat Rules 14–23 as deprecated and start fresh in Session 180 if new rules are needed for future workflow patterns.

**Current working hypothesis (not confirmed):**
- Rule 14–15: Likely related to state machine gating or pre-diagnosis checks
- Rule 16–19: Likely related to output formatting, error handling, or escalation
- Rule 20–22: Archive vault + file governance (mentioned in commit 7f75893)
- Rule 23: Likely related to session finalization or cleanup

---

## Rule 24: Proactive Gate Check Before Asking Questions

Before asking Patrick ANY question, check: (1) Does Rule 1 apply? Use it. (2) Does Rule 6 apply? Assume list is complete. (3) Is answer in STATE.md or next-session-prompt? Don't ask. (4) Is this a yes/no binary with no meaningful difference? Pick simpler option.

Why: 40% of manual questions answered by existing rules/docs. (Added 2026-03-15, Session 169.)

---

## Rule 25: Post-Compression Enforcement Checkpoint (CRITICAL)

Immediately after any context compression: (1) Re-read CORE.md §4. (2) Verify push rules understood (truncation gate, complete blocks, file read mandate). (3) Check pending git push work — draft block if YES. (4) Do NOT continue until checks done.

Why: Session 167 proved push rules are first lost after compression. (Added 2026-03-15, Session 169.)

---

## Rule 26: Subagent Output Aggregation Manifest

When dispatching 2+ subagents in parallel: (1) Create temp `.subagent-manifest.json` in VM. (2) As each returns, record files changed, check for conflicts. (3) Before final push, verify no conflicts, batch files (max 3 per MCP call).

Why: Session 168 had uncoordinated MCP + PS1 pushes. (Added 2026-03-15, Session 169.)

---

## Rule 27: [LOST — No Record Found]

Rule 27 was likely added in Sessions 138–169 but was never committed to git and is unrecoverable from available sources.

---

## Rule 28: Scheduled task findings triage at session init

After loading STATE.md and session-log at session init (Rule 3, step 1), check for unread scheduled task findings:

**Files to check (most recent of each):**
- `claude_docs/operations/friction-audit-*.md` — daily workflow scan
- `claude_docs/health-reports/*.md` — weekly health scout
- `claude_docs/ux-spotchecks/*.md` — weekly UX spotcheck
- `claude_docs/operations/MESSAGE_BOARD.json` — agent message board

**Triage protocol:**
1. Read only the most recent file in each location (not all historical files).
2. Scan for findings rated 🔴 HIGH or P0/P1. List them.
3. If any HIGH/P0/P1 findings exist: add them to the session's priority queue BEFORE sprint work begins. Flag to Patrick: "Scheduled task found [X] — adding to priority queue."
4. If only MEDIUM/P2 findings exist: note them in one sentence. Do not block sprint work.
5. If no findings or only LOW: proceed without comment.

**Hard rules:**
- Do NOT read more than the most recent file per location — prevents token waste.
- Do NOT block session start to read competitor reports, pipeline briefings, or power-user sweep output. Those are advisory, not blocking.
- Do NOT add findings triage to the token budget announcement — it runs silently unless a HIGH finding is discovered.

**Blocking findings (must triage before sprint work):**
- 🔴 HIGH in friction audit (workflow-breaking patterns)
- P0/P1 in health scout (security/critical bugs)
- P0/P1 in UX spotcheck (broken user flows)

**Non-blocking (note only):**
- MEDIUM/P2 friction findings
- Competitor intel
- Pipeline briefings
- Power user proposals

Why this exists: Patrick identified (S178) that 11 scheduled tasks generate daily/weekly findings but findings were never being actioned — they accumulated in files. This rule closes the gap between signal generation and signal review. (Added 2026-03-16, Session 178.)

---

## Fallback: If This Skill Was Not Loaded at Session Start

conversation-defaults requires system injection to fire automatically. If it was
not loaded on the first message, load it manually on the first message that involves
any of: shell commands, file edits, database operations, or multi-step tasks.

Manual load triggers (keywords in Patrick's message): "fix", "run", "deploy",
"migrate", "build", "push", "implement", "create", "update", "check", "debug".

When loaded mid-session via fallback, apply all rules from the current message
forward — session init does not need to be re-run.

---

## Summary

| Rule | Status |
|------|--------|
| 1. AskUserQuestion tool | Active (revised 2026-03-15, Session 169) |
| 2. Announce file modification approach | Active |
| 3. First message = unified single-path session start | Active (v3 unified 2026-03-09, Session 118) |
| 4. dev-environment gate before shell commands | Active (added 2026-03-07) |
| 5. Never hand off git issues to Patrick | Active (added 2026-03-07) |
| 6. Treat abbreviated language as precise | Active (revised 2026-03-15, Session 169) |
| 7. File creation path validation | Active (added 2026-03-09) |
| 8. Message board protocol | Active (added 2026-03-09) |
| 9. Token budget briefing at session start | Active (added 2026-03-09, Session 116) |
| 10. Checkpoint manifest reads/writes | Active (added 2026-03-09, Session 118) |
| 11. Pre-dispatch checkpoint before 3+ agents | Active (added 2026-03-09, Session 118) |
| 12. Never output placeholder values | Active (added 2026-03-11, Session 137) |
| 13. Route post-diagnosis implementation to subagent | Active (revised 2026-03-15, Session 169) |
| 14–23. [LOST — not in git history] | UNRECOVERABLE |
| 24. Proactive Gate Check Before Asking Questions | Active (added 2026-03-15, Session 169) |
| 25. Post-Compression Enforcement Checkpoint (CRITICAL) | Active (added 2026-03-15, Session 169) |
| 26. Subagent Output Aggregation Manifest | Active (added 2026-03-15, Session 169) |
| 27. [LOST — no record found] | UNRECOVERABLE |
| 28. Scheduled task findings triage at session init | Active (added 2026-03-16, Session 178) |
