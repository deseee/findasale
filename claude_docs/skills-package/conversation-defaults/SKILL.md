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

## Rule 1: Do NOT use the AskUserQuestion tool

**The AskUserQuestion tool (multiple-choice question format) is currently broken.**
Using it causes the conversation to hang and become unresponsive.

Do not call AskUserQuestion under any circumstances, even if it seems like the
most natural way to gather input. This applies to all situations: clarifying
requirements, offering options, confirming choices, asking follow-up questions.

**Instead, ask questions as plain conversational text** — write them directly
in your response as normal sentences. You can still offer numbered or lettered
options in plain text (e.g., "Would you prefer A) a Word doc or B) a PDF?"),
but do not use the structured tool that renders interactive buttons.

### Example — what NOT to do
Calling the `AskUserQuestion` tool with `questions: [...]` parameters.

### Example — what to do instead
Write directly in your reply:
> "Before I start, a couple of quick questions: What format should the output
> be — Word doc, PDF, or something else? And roughly how long should it be?"

This feels slightly more informal but works reliably and keeps the conversation
moving.

---

## Rule 2: Periodic check — is the tool fixed yet?

This workaround was put in place on **2026-02-28** because AskUserQuestion was
hanging conversations.

**Check monthly** whether the bug has been resolved:

1. At the start of a session on or after the dates below, attempt a simple
   internal test: note whether recent Cowork release notes or Patrick mentions
   that the tool works again.
2. If Patrick says the tool is working, or if you observe it has been fixed,
   remind him to **delete or disable this skill** (or update Rule 1 to remove
   the restriction).

**Suggested check dates:**
- 2026-03-28
- 2026-04-28
- 2026-05-28

If today's date is on or after one of these and this skill hasn't been updated,
briefly mention at the start of the session: *"Just a heads-up — it's been
about a month since the AskUserQuestion workaround was put in place. Want me
to test whether it's working again?"*

## Rule 3: Announce file modification approach before every write

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

---

## Rule 4: Short session openers = immediate session start

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

## Rule 5: dev-environment gate before any shell command

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

## Summary

| Rule | Status |
|------|--------|
| AskUserQuestion tool disabled | Active (bug reported 2026-02-28) |
| Free-form questions instead | Active |
| Monthly fix-check reminder | Active, next: 2026-03-28 |
| Short opener = session start signal | Active (added 2026-03-06) |
| dev-environment gate before shell commands | Active (added 2026-03-07) |
