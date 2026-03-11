---
version: 6
last_updated: 2026-03-11 (Session 143)
name: conversation-defaults
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

**Don't use it for:** Simple follow-ups mid-task, quick yes/no checks, or
when the answer is already clear from context.

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

**Single unified pattern (all first messages):**
1. Load context silently: STATE.md, session-log (last 2 entries), next-session-prompt.md, `.checkpoint-manifest.json`, decisions-log.md. Do not narrate the loads.
2. Acknowledge in one sentence. If short opener, add warmth. If task/status, confirm receipt. Either way: one sentence.
3. Announce: session number, token budget ("~200k context window. ~5k init overhead. ~195k available. Warn at 170k used."), last session summary, and priority queue.
4. Begin Priority 1 immediately. If P1 is blocked (requires Patrick's external input), begin Priority 2 and name P1 as blocked. Never end init with a question.

**Never ask:** "What would you like to work on today?" — the docs answer that.

**Skip condition (CORE.md §2):** Skip re-loading on subsequent turns only — never on the first message.

Why this exists: Two-branch pattern (short opener vs. task assignment) caused inconsistent enforcement — the task-assignment branch omitted the token budget announcement. Six independent agent audits (Session 118) confirmed this as a top failure mode. Merged to single path. (v3, 2026-03-09.)

---

## Rule 4: dev-environment gate before any shell command

Before issuing **any** shell command, PowerShell command, Prisma command,
migration instruction, or environment variable guidance — verify that the
`dev-environment` skill has been loaded this session.

- If not yet loaded: load it immediately, then issue the command.
- If already loaded: apply its rules without reloading.

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

- **Merge conflicts:** Read the file → Edit to remove markers → push via MCP
- **Stale local state:** Push correct version via MCP, tell Patrick to run `.\push.ps1`
- **Uncommitted changes blocking pull:** Tell Patrick `git checkout -- <files>` only when the correct versions are already on remote

**Never say:** "Manually resolve the conflict," "Open the file and remove the markers,"
or "Run `git merge --abort` and fix it yourself."

**Always do:** Diagnose and fix the issue using Read + Edit + MCP push before reporting completion.

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
- **If scope matters for the task:** Ask one clarifying question — "You mentioned X, Y, etc. — should I include anything beyond X and Y, or just those?"
- **If scope doesn't matter:** Proceed with only the items explicitly stated.

**Never:** Silently add 5 extra items to a list because Patrick said "etc." after listing 3.

Why this exists: Patrick flagged that "etc." was being over-expanded, changing task
scope beyond what he intended. Abbreviated instructions are potentially precise, not
vague. (Added 2026-03-09, backlog E11.)

---

## Rule 7: File creation path validation

Before creating any new file in `claude_docs/`, verify the path against
`claude_docs/operations/file-creation-schema.md`:

1. **Correct directory?** Research → `research/`, operations → `operations/`, etc.
2. **Correct naming?** Authority = UPPERCASE, living = kebab-case, one-time = kebab-case-date.
3. **Research docs?** Must include backlog ID prefix (e.g., `e2-topic.md`).
4. **Root-level?** Only Tier 1 authority docs go in `claude_docs/` root.

If the path doesn't match the schema, fix it before writing. Don't ask Patrick
about file paths — just follow the schema.

Why this exists: Session 95 audit (E17) found inconsistent naming across 115 files.
The schema prevents further drift. (Added 2026-03-09.)

---

## Rule 8: Message board protocol

When invoking a subagent via `Skill` tool, include this instruction in the dispatch:
"Read `claude_docs/operations/MESSAGE_BOARD.json` on start. Post a status message
on completion listing all files changed."

After each Skill return, read MESSAGE_BOARD.json for new messages before continuing.

Why this exists: E4 inter-agent communication foundation (session 96). (Added 2026-03-09.)

---

## Rule 9: Token budget briefing at session start

At every session init, include a token budget briefing in the announcement:

```
~200k context window. ~5k init overhead. ~195k available.
Warn at 170k used (85%). Hard stop at 190k (95%).
```

This is embedded in Rule 3's unified pattern (step 3).
Log checkpoints at natural pauses per CORE.md §3 and `operations/token-checkpoint-guide.md`.

Why this exists: Session 115 research confirmed token tracking is low-cost (30 tokens/session)
and high-ROI (prevents 20% token loss from surprise compressions). (Added 2026-03-09, Session 116.)

---

## Rule 10: Checkpoint manifest reads and writes

`.checkpoint-manifest.json` at repo root is the persistent token state store. It survives compressions and session transitions.

- **At session init:** Read `.checkpoint-manifest.json`. Restore last session history. Write new `currentSession` entry (new sessionId, reset counters, set `startedAt`).
- **At each checkpoint log:** Write the checkpoint to `checkpoints[]` in the manifest.
- **At context compression:** IMMEDIATELY write to `compressionEvents[]` before doing anything else.
- **At session wrap:** Write final token burn to `sessionHistory[]`.

If the manifest file is missing or corrupted: create a fresh one using the schema from CORE.md §3.

Why this exists: Session 118 advisory board audit found that in-conversation checkpoints are erased by compressions. JSON file persists across both compressions and session transitions. (Added 2026-03-09, Session 118.)

---

## Rule 11: Pre-dispatch checkpoint before agent batches

Before dispatching 3 or more agents in parallel:
1. Write a checkpoint to `.checkpoint-manifest.json` `checkpoints[]`.
2. Estimate the session token total after the dispatch (add 5k per agent baseline).
3. If estimated total will exceed 150k, warn Patrick: "Dispatching N agents will push session to ~Xk tokens (Yk% of budget). Proceed?"
4. If estimated total will exceed 170k, require explicit Patrick confirmation before dispatching.

Why this exists: Multi-agent batches are the largest single token spike in any session (5–15k per agent). Pre-dispatch checkpoint ensures state is saved before the spike, and budget check prevents surprises. (Added 2026-03-09, Session 118.)

---

## Rule 12: Never output placeholder values

Before emitting any command, code snippet, or output with a value:

- Ask: "Does this output contain a placeholder like `<paste your X>` or `<your Y>`?"
  - YES → Stop. Is the real value readable from a VM file?
    - YES → Read the file. Inline the real value instead.
    - NO → Tell Patrick the file is unreadable and ask him to provide the value. Do not emit a placeholder.
  - NO → Proceed.

Common cases: Neon `DATABASE_URL` → read from `packages/backend/.env`; file paths → derive from project structure.

Flagged by Patrick on 2026-03-11 as a core violation. No exceptions.

Why this exists: Prevents broken commands and credentials-in-docs footguns.

---

## Rule 13: Route post-diagnosis implementation to the appropriate subagent

After any subagent completes a diagnosis, analysis, or design task that surfaces required code changes or documentation updates, do not implement those changes inline. Route to the correct implementation subagent.

**When to route:**
- **Code changes** (bug fixes, feature implementation, refactors, security patches) → **Invoke `findasale-dev`**
- **Documentation changes** (SKILL.md, CLAUDE.md, STATE.md, CORE.md, etc.) → **Invoke `findasale-records`**
- **Both** → Invoke `findasale-dev` first, then `findasale-records`

**Hard stops — never implement inline after these agents return findings:**
- `findasale-qa`, `health-scout` → route code fixes to `findasale-dev`
- `findasale-hacker` → route security patches to `findasale-dev`
- `findasale-architect` → route implementation to `findasale-dev`
- `findasale-ux` → route UI/code changes to `findasale-dev`

Why this exists: Session 138 — findasale-dev diagnosed 3 bugs, fixes were implemented inline. This consumed full context, triggered autocompact, and required push reconstruction. Inline implementation after subagent diagnosis is the largest preventable cause of context bloat. (Added 2026-03-11, Session 138.)

---

## Rule 14: Surface all `## Patrick Direct` escalation blocks

When a subagent returns output containing a `## Patrick Direct` section, present it to Patrick verbatim.

**GATE (after every subagent returns):**
- Does this output contain a `## Patrick Direct` block?
  - YES → Present it to Patrick verbatim before any other commentary. Auto-append it to `claude_docs/escalation-log.md`.
  - NO → Proceed normally.

**Hard rule:** Never summarize, filter, or omit an escalation block. Suppressing a `## Patrick Direct` is a CORE.md violation.

Why this exists: Fleet redesign session 141 — escalation channel established to give subagents a safety valve when the main session misjudges priority, ignores findings, or operates on stale context. (Added 2026-03-11, Session 142.)

---

## Rule 15: Inter-agent handoff pass-through

When a subagent produces a `## Handoff:` block for another agent, pass it to the receiving agent WITHOUT editing or summarizing.

**GATE (after subagent returns with a handoff):**
- Does this output contain a `## Handoff:` block?
  - YES → When dispatching the receiving agent, include the handoff block verbatim in the dispatch prompt. Do not paraphrase or omit fields.
  - NO → Proceed normally.

Why this exists: Fleet redesign session 141 — context degrades at every handoff when the main session summarizes instead of passing through. (Added 2026-03-11, Session 142.)

---

## Rule 16: Load decisions-log.md at session init

Add `claude_docs/decisions-log.md` to the session init file list (Rule 3, step 1).

**GATE (at session init, after loading STATE.md):**
- Have I loaded decisions-log.md?
  - NO → Read it. Note any decisions from the last 7 days that affect today's work.
  - YES → Proceed.

Before making any decision that affects future sessions, check decisions-log.md for prior decisions on the same topic. If a prior decision exists and hasn't been explicitly reversed, honor it.

Why this exists: Fleet redesign session 141 — decisions made in session N get lost by session N+3. The log provides cross-session decision memory. (Added 2026-03-11, Session 142.)

---

## Rule 17: Budget-first session planning

At session init (after Rule 3 step 3), estimate token budget for planned work:

1. List planned work items from next-session-prompt.md or Patrick's request.
2. Estimate tokens per item: survey (5-10k), targeted edit (3-8k/file), subagent dispatch (5-15k/agent), file read batch (1-2k/100 lines), MCP push (2-5k/call).
3. Sum estimates. Compare to available budget.
4. If planned work exceeds 80% of available budget: flag to Patrick, propose cuts or deferrals.

At session wrap, log the actual vs. estimated token burn in `.checkpoint-manifest.json` `sessionHistory[]` with a `budgetDelta` category: "succeeded-on-plan" (within ±20%), "over-plan" (>120%), or "succeeded-after-retry".

Reference: `claude_docs/operations/budget-first-session-planning.md`

Why this exists: Fleet redesign session 141 — budget surprises caused 3 premature session wraps in the prior 10 sessions. Pre-planning eliminates this. (Added 2026-03-11, Session 143.)

---

## Rule 18: DA/Steelman co-fire

When dispatching `findasale-devils-advocate`, ALWAYS also dispatch `findasale-steelman` in the same parallel batch (and vice versa). They are designed as a pair.

**Exception:** Patrick explicitly asks for only one of them (e.g., "just poke holes, don't steelman it").

Why this exists: Fleet redesign session 141 — DA and Steelman are counterbalances. Hearing only one side produces biased advice. (Added 2026-03-11, Session 143.)

---

## Rule 19: Feedback loop routing

After reading MESSAGE_BOARD.json (Rule 8), check for entries with a `feedbackLoop` field. If found, include the feedback signal in the next dispatch to the target agent.

**Known feedback loops:**
- Rollback → Innovation (post-mortem learning)
- Customer Champion → Sales-Ops (friction/churn signals)
- Competitor → Innovation (threat-as-opportunity)
- QA → Dev (regression patterns)
- Hacker → Architect (security findings)
- Workflow → [responsible agent] (friction audit findings)

Reference: `claude_docs/operations/cross-agent-feedback-loops.md`

Why this exists: Fleet redesign session 141 — intelligence was siloed in agents with no cross-pollination. (Added 2026-03-11, Session 143.)

---

## Summary

| Rule | Status |
|------|--------|
| AskUserQuestion tool | Active and working (bug resolved 2026-03-07) |
| Announce file modification approach | Active |
| First message = unified single-path session start | Active (v3 unified 2026-03-09, Session 118) |
| dev-environment gate before shell commands | Active (added 2026-03-07) |
| Never hand off git issues to Patrick | Active (added 2026-03-07) |
| Treat abbreviated language as precise | Active (added 2026-03-09) |
| File creation path validation | Active (added 2026-03-09) |
| Message board protocol | Active (added 2026-03-09) |
| Token budget briefing at session start | Active (added 2026-03-09, Session 116) |
| Checkpoint manifest reads/writes | Active (added 2026-03-09, Session 118) |
| Pre-dispatch checkpoint before 3+ agents | Active (added 2026-03-09, Session 118) |
| Never output placeholder values | Active (added 2026-03-11, Session 137) |
| Route post-diagnosis implementation to appropriate subagent | Active (added 2026-03-11, Session 138) |
| Surface all `## Patrick Direct` escalation blocks | Active (added 2026-03-11, Session 142) |
| Inter-agent handoff pass-through | Active (added 2026-03-11, Session 142) |
| Load decisions-log.md at session init | Active (added 2026-03-11, Session 142) |
| Budget-first session planning | Active (added 2026-03-11, Session 143) |
| DA/Steelman co-fire | Active (added 2026-03-11, Session 143) |
| Feedback loop routing | Active (added 2026-03-11, Session 143) |
