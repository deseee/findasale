---
name: conversation-defaults
metadata:
  version: 7
  last_updated: "2026-03-21 (Session 226)"
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
- "Is answer already in STATE.md or next-session-prompt?" → Don't ask.
- "Is this a yes/no binary with no meaningful difference?" → Pick simpler option.

**Don't use it for:** Simple follow-ups mid-task, quick yes/no checks, or
when the answer is already clear from context.

---

## Rule 2: Announce file modification approach before every write

Before using the Write or Edit tool on any existing file, state the approach
in one line in the response text:

- Targeted edit: "Editing [file] lines X–Y"
- Full rewrite: "Rewriting [file] entirely — confirmed by Patrick"

Full rewrites require explicit permission. Phrases like "major rewrite,"
"overhaul," or "audit" do NOT count as permission.

---

## Rule 4: dev-environment gate before any shell command

Before issuing **any** shell command, PowerShell command, Prisma command,
migration instruction, or environment variable guidance — verify that the
`dev-environment` skill has been loaded this session.

**GATE (fires before emitting ANY such command):**
- Ask yourself: "Have I loaded or verified dev-environment in this session?"
  - NO → Load it now via `Skill('dev-environment')`. Then issue the command.
  - YES → Proceed.
  - UNSURE → Load it now. Better safe than wrong-database.

---

## Rule 6: Expand abbreviated language smartly, not speculatively

When Patrick uses shorthand like "etc.", "and so on", "and similar", "stuff like that",
or trailing ellipsis ("..."):

- **Expand with closely related items** that share the same pattern or category as the explicitly listed items. If Patrick says "fix the header, footer, etc." — include the nav, sidebar, and other layout components. Don't add the payment flow.
- **Do not speculate wildly** or add items from unrelated categories.
- **Do not interpret as "everything in the entire codebase/project."**
- **Match the scope and intent** of what Patrick listed. The listed items define the pattern; expand within that pattern using reasonable judgment.
- **If genuinely unsure** whether an item fits the pattern: include it if it's low-risk, ask if it's high-effort or irreversible.

**Never:** Add 5 random unrelated items. But also never stop at exactly the listed items when the context clearly implies more of the same kind.

---

## Rule 9: Token budget briefing at session start

At every session init, include in the announcement:

```
~200k context window. ~5k init overhead. ~195k available.
Warn at 170k used (85%). Hard stop at 190k (95%).
```

Log checkpoints at natural pauses per CLAUDE.md §11 (Token Efficiency Rules).

---

## Rule 10: Token awareness at checkpoints

At natural pauses (after file read batch, after subagent dispatch, before wrap), maintain awareness of token burn:

**GATE (at natural pauses):**
- "Have I been tracking approximate token usage?"
  - Estimate: file reads ~15 tokens/100 lines, GitHub API calls ~2k baseline, subagent overhead ~5k baseline.
  - If estimated total > 150k → plan wrap at next break.
  - If estimated total > 170k → MUST wrap (hard threshold).

---

## Rule 11: Pre-dispatch checkpoint before agent batches

Before dispatching 3 or more agents in parallel:

**GATE (before calling Skill 3+ times in parallel):**
- Ask: "Am I about to dispatch 3 or more agents?"
  - YES → Execute checklist before dispatch:
    1. Estimate the session token total after the dispatch (add 5k per agent baseline).
    2. If estimated total will exceed 150k, warn Patrick.
    3. If estimated total will exceed 170k, STOP and require explicit Patrick confirmation.
    4. If estimate is acceptable → Dispatch all agents.
  - NO → Proceed without this gate.

---

## Rule 12: Never output placeholder values

**GATE (before emitting ANY command, code snippet, or output with a value):**
- Ask: "Does this output contain a placeholder like `<paste your X>` or `<your Y>`?"
  - YES → Read the file containing the real value. Inline it. If unreadable, tell Patrick — do not emit a placeholder.
  - NO → Proceed.

---

## Rule 13: Route post-diagnosis implementation to the appropriate subagent

After any subagent completes a diagnosis, analysis, or design task that surfaces required code changes or documentation updates, **do not implement those changes inline in the orchestrator session**. Route to the correct implementation subagent.

**GATE (after any subagent returns findings):**
- "Did this subagent return code changes, bug fixes, or doc updates that need to be written?"
  - **Code changes** → Invoke `findasale-dev`
  - **Documentation changes** → Invoke `findasale-records`
  - **Both** → `findasale-dev` first for code, then `findasale-records` for docs
  - **Report only (no follow-on writes)** → Proceed inline

**Hard stops — never implement inline after these agents return findings:**
- `findasale-qa`, `health-scout` → always route code fixes to `findasale-dev`
- `findasale-hacker` → always route security patches to `findasale-dev`
- `findasale-architect` → always route implementation to `findasale-dev`
- `findasale-ux` → always route UI/code changes to `findasale-dev`
- `cowork-power-user`, `findasale-workflow` → always route skill/behavior changes to `findasale-records`

---

## Rule 25: Post-Compression Enforcement Checkpoint (CRITICAL)

Immediately after any context compression: (1) Re-read CLAUDE.md §5 (Push Rules). (2) Verify push rules understood (truncation gate, complete blocks, file read mandate). (3) Check pending git push work — draft block if YES. (4) Do NOT continue until checks done.

---

## Rule 26: Subagent Output Aggregation Manifest

When dispatching 2+ subagents in parallel: (1) Create temp `.subagent-manifest.json` in VM. (2) As each returns, record files changed, check for conflicts. (3) Before final push, verify no conflicts, batch files (max 3 per MCP call).

---

## Rule 28: Scheduled task findings triage at session init

After loading STATE.md and session-log at session init, check for unread scheduled task findings:

**Files to check (most recent of each):**
- `claude_docs/operations/friction-audit-*.md` — daily workflow scan
- `claude_docs/health-reports/*.md` — weekly health scout
- `claude_docs/ux-spotchecks/*.md` — weekly UX spotcheck

**Triage protocol:**
1. Read only the most recent file in each location.
2. Scan for ALL unresolved findings. List them.
3. For any unresolved finding: announce it and include a plan to address it (dispatch appropriate agent or defer with reason).
4. Only the most minor cosmetic findings may be deferred. Everything else should be dispatched for fix.
5. If a finding has persisted 3+ consecutive audits: escalate to Patrick with `## Patrick Direct` block.

**Hard rules:**
- Do NOT read more than the most recent file per location.
- Do NOT block session start to read competitor reports, pipeline briefings, or power-user sweep output. Those are advisory, not blocking.

---

## Rule 30: Never stop between subagent returns when work remains (CRITICAL)

When a subagent (Skill dispatch) returns and there are remaining items on the todo list, **immediately dispatch the next work item**. Do not narrate, summarize, or wait for Patrick to say "continue."

**GATE (fires every time a Skill/Agent returns):**
- "Are there remaining incomplete items on the todo list?"
  - YES → Dispatch the next item immediately. Do not pause.
  - NO → Report completion to Patrick.

**Exception:** If the subagent flagged something under "Blocked / Flagged" that requires Patrick's input, then pause and ask. Otherwise, keep going.

---

## Rules 14–23, 27: Deprecated

These rules were lost in a VM reset (Session 179) and are unrecoverable from git history. They are officially deprecated as of Session 226. If new rules are needed in the future, start numbering from Rule 31.

---

## Fallback: If This Skill Was Not Loaded at Session Start

conversation-defaults requires system injection to fire automatically. If it was
not loaded on the first message, load it manually on the first message that involves
any of: shell commands, file edits, database operations, or multi-step tasks.

---

## Summary

| Rule | Status |
|------|--------|
| 1. AskUserQuestion tool | Active (revised S169, consolidated gate from Rule 24) |
| 2. Announce file modification approach | Active |
| 4. dev-environment gate before shell commands | Active |
| 6. Expand abbreviated language smartly | Active (revised S226) |
| 9. Token budget briefing at session start | Active |
| 10. Token awareness at checkpoints | Active (modernized S226) |
| 11. Pre-dispatch checkpoint before 3+ agents | Active |
| 12. Never output placeholder values | Active |
| 13. Route post-diagnosis implementation to subagent | Active |
| 25. Post-Compression Enforcement Checkpoint (CRITICAL) | Active |
| 26. Subagent Output Aggregation Manifest | Active |
| 28. Scheduled task findings triage (strengthened) | Active (revised S226) |
| 30. Never stop between subagent returns (CRITICAL) | Active |
| 3, 5, 7, 8, 14–23, 24, 27, 29 | Removed or relocated (S226) |
