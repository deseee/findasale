---
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

## Rule 3: Short session openers = immediate session start

When Patrick's **first message** of a session is a short opener — "hello", "hi",
"hey", "ok", "let's go", or any message ≤5 words with no task content — treat it
as a **session start signal**, not a standalone conversational exchange.

**Correct response pattern:**

1. Reply with one brief, warm greeting sentence.
2. Immediately load session context (silently — do not narrate the loads):
   - `claude_docs/STATE.md`
   - `claude_docs/logs/session-log.md` (last 2 entries)
   - `claude_docs/operations/next-session-prompt.md`
3. Relay the next-session-prompt: announce the session number, what was done
   last session, and the priority queue for this session.
4. Begin working on the first priority task — no permission needed.

**Do NOT ask:** "What would you like to work on today?" or "What are we doing
this session?" — read the docs and start.

Why this exists: Patrick uses short openers to start sessions. He expects Claude
to immediately orient and begin work. Treating the opener as casual conversation
wastes a full turn and forces Patrick to re-ask for context that the docs already
contain. (Flagged 2026-03-06.)

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

## Summary

| Rule | Status |
|------|--------|
| AskUserQuestion tool | Active and working (bug resolved 2026-03-07) |
| Announce file modification approach | Active |
| Short opener = session start signal | Active (added 2026-03-06) |
| dev-environment gate before shell commands | Active (added 2026-03-07) |
| Never hand off git issues to Patrick | Active (added 2026-03-07) |
