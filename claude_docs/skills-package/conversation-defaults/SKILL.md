---
version: 2
last_updated: 2026-03-09 (Session 108)
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

**Any first message** — short opener, status report, completion update, or task assignment — is a session start signal. Load context unconditionally on the first message of every session.

**Response pattern varies by message type:**

**Short opener** (≤5 words, no task content — "hello", "hi", "ok", "let's go"):
1. Reply with one brief, warm greeting sentence.
2. Load context silently (STATE.md, session-log last 2 entries, next-session-prompt.md). Do not narrate the loads.
3. Announce session number, last session summary, and priority queue.
4. Begin the first priority task — no permission needed.

**Status/completion report or task assignment** (long message, contains work context):
1. Load context silently (STATE.md, session-log last 2 entries, next-session-prompt.md). Do not narrate the loads.
2. Acknowledge the update in one sentence.
3. Begin the next priority task from the loaded docs immediately.

**Never ask:** "What would you like to work on today?" — the docs answer that.

**Skip condition (CORE.md §2):** "Skip silently if Patrick has already given a task and context was loaded this session" means skip *re-loading* on subsequent messages after init has already run — it is never a reason to skip init on the first message of a session.

Why this exists: Rule 3 originally only covered short openers (≤5 words). This left a gap: when Patrick's first message was a status report or task assignment, session init was skipped and Claude responded conversationally instead of loading docs and beginning work. Flagged twice in 5 sessions (2026-03-09). Merged to cover all first-message types.

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

## Summary

| Rule | Status |
|------|--------|
| AskUserQuestion tool | Active and working (bug resolved 2026-03-07) |
| Announce file modification approach | Active |
| First message (any type) = session start signal | Active (added 2026-03-06, merged 2026-03-09) |
| dev-environment gate before shell commands | Active (added 2026-03-07) |
| Never hand off git issues to Patrick | Active (added 2026-03-07) |
| Treat abbreviated language as precise | Active (added 2026-03-09) |
| File creation path validation | Active (added 2026-03-09) |
| Message board protocol | Active (added 2026-03-09) |
