# Cowork Power User Audit — Session Initialization Failure
**Date:** 2026-03-11
**Triggered by:** Patrick flagged "core violation" — session started without loading `conversation-defaults` or `dev-environment`, then Claude issued Prisma migrate command with placeholder URL instead of reading `.env` and inlining the real value
**Audit scope:** Why initialization failed, root causes, recommended fixes

---

## Executive Summary

Session 137 started with **three linked initialization failures**:

1. **conversation-defaults did not fire** — Rule 3 (unified single-path session start) was not applied
2. **dev-environment did not auto-load** — Rule 4 (dev-environment gate before shell commands) was not triggered
3. **Prisma command issued with placeholder** — Claude gave `prisma migrate deploy <paste your Neon DATABASE_URL from packages/backend/.env>` instead of reading `.env` from the VM and inlining the real URL (a documented dev-environment violation)

The failures are **not** due to skill content issues — the skills are correctly written. The failures are due to **Claude's internal session startup behavior and command-issuance patterns**, which do not reliably trigger skills at the conversation layer.

---

## Finding 1: conversation-defaults Rule 3 Not Applied

### What Should Have Happened

Per conversation-defaults v3, Rule 3 states:

> **First message of any session = immediate session start**
>
> **Any first message** — short opener, status report, completion update, task assignment, or anything else — is a session start signal. ONE response pattern. No branching.
>
> **Single unified pattern (all first messages):**
> 1. Load context silently: STATE.md, session-log (last 2 entries), next-session-prompt.md, `.checkpoint-manifest.json`. Do not narrate the loads.
> 2. Acknowledge in one sentence. If short opener, add warmth. If task/status, confirm receipt. Either way: one sentence.
> 3. Announce: session number, token budget ("~200k context window. ~5k init overhead. ~195k available. Warn at 170k used."), last session summary, and priority queue.
> 4. Begin Priority 1 immediately. If P1 is blocked (requires Patrick's external input), begin Priority 2 and name P1 as blocked. Never end init with a question.

### What Actually Happened

Session 137 first message was a subagent dispatch request: "You are a subagent for Patrick's FindA.Sale Cowork session. Your job is to invoke and run the `cowork-power-user` skill..."

Claude responded by **reading the cowork-power-user SKILL.md and executing its instructions**, without first:
- Loading STATE.md, session-log, or checkpoint-manifest
- Announcing session number, token budget, or priority queue
- Acknowledging the setup phase

The conversation-defaults Rule 3 unified pattern was **never invoked**.

### Root Cause Analysis

**Likely cause: Skill system precedence or missing detection.**

- The system-reminder at the start of the session contained the FindA.Sale CLAUDE.md files (global + project instructions) **but not the active conversation-defaults skill v3**.
- While the skill file exists at `/sessions/quirky-ecstatic-mayer/mnt/.skills/skills/conversation-defaults/SKILL.md`, its rules are **not visible to Claude unless they are explicitly loaded in the conversation or injected as system context**.
- The session init does not appear to have **automatically invoked or injected** conversation-defaults at the conversation layer.
- **Precedence issue:** The system-reminder tells Claude "read these instructions" for CLAUDE.md files, but does not list conversation-defaults as an active system-layer rule.

### Evidence

The skill exists and is correctly written (last updated session 118). It is listed in context.md as "Always-active conversation behavior defaults." However, it was not enforced during the session init.

---

## Finding 2: dev-environment Rule 4 Not Triggered

### What Should Have Happened

Per conversation-defaults v3, Rule 4 states:

> **dev-environment gate before any shell command**
>
> Before issuing **any** shell command, PowerShell command, Prisma command, migration instruction, or environment variable guidance — verify that the `dev-environment` skill has been loaded this session.
>
> - If not yet loaded: load it immediately, then issue the command.
> - If already loaded: apply its rules without reloading.

When Claude was about to issue the Prisma migrate command, it should have:
1. Recognized this as a Prisma command
2. Verified dev-environment was loaded
3. Found it was not
4. Loaded it immediately via `Skill('dev-environment')`
5. Then, with dev-environment loaded, issued the command correctly

### What Actually Happened

Claude issued the command directly with a placeholder:

```
prisma migrate deploy <paste your Neon DATABASE_URL from packages/backend/.env>
```

This violated the explicit rule in dev-environment that states:

> **The wrong-database trap:** Always confirm which DB a command will hit before running it.
> ⚠️ **Neon URLs are commented out in `.env`.** The active `DATABASE_URL=` line is local. Neon URLs are on lines starting with `# DATABASE_URL=` and `# DIRECT_URL=`. Claude must read the file from the VM and inline the real values — never use `Select-String "^DATABASE_URL="` as it returns the local URL.

### Root Cause Analysis

**Likely cause: Rule 4 is a conversation-layer rule with no command-issuance checkpoint.**

- Rule 4 exists in conversation-defaults (not dev-environment itself) as a meta-enforcement rule
- It relies on Claude to **proactively check** before writing a command
- This is an "honor system" enforcement — there is no automatic gate or interrupt that fires when Claude writes a shell command
- Since conversation-defaults was not loaded at session init, Rule 4 was not in Claude's active context

**Secondary issue: dev-environment doesn't auto-trigger.**

- dev-environment is described as "Load this skill before issuing any shell commands," but it does not have a triggering mechanism that auto-fires when a shell command appears
- Unlike a @mention decorator or an event hook, skills are manually invoked (via Skill tool) or triggered via description keywords in the user's message
- Since the system-reminder did not include dev-environment as an active system rule, Claude had no automatic gate

---

## Finding 3: Prisma Migrate Command with Placeholder URL

### The Violation

The command issued:

```powershell
cd C:\Users\desee\ClaudeProjects\FindaSale\packages\database; `
npx prisma migrate deploy <paste your Neon DATABASE_URL from packages/backend/.env>
```

**Violation summary:**
- ❌ Placeholder URL instead of real inlined URL
- ❌ No read of `packages/backend/.env` from the VM to extract the real Neon DATABASE_URL
- ❌ Instruction to Patrick to manually paste (shifts responsibility, violates dev-environment spirit)

### What Should Have Been Done

Per dev-environment §107–113 (migrate deploy pre-flight):

> 1. Claude reads `packages/backend/.env` from the VM — finds the `# DATABASE_URL=` commented Neon line
> 2. Claude inlines the actual URL directly into the command — no PowerShell extraction
> 3. Verify the expected migration folder exists in `prisma/migrations/` before running

The correct approach:

1. Read `packages/backend/.env` from the VM using the Read tool
2. Extract the commented Neon `DATABASE_URL=` or `DIRECT_URL=` line
3. Inline the real URL into the PowerShell command
4. Verify migration folder exists
5. Provide the ready-to-paste command in chat

### Root Cause

This is a **direct consequence of Finding 2** — dev-environment was not loaded, so the pre-flight procedure was not known or enforced.

---

## Workflow Issue: Subagent Dispatch vs. Session Init Collision

Patrick's request was:

> "You are running as a subagent for Patrick's FindA.Sale Cowork session. Your job is to invoke and run the `cowork-power-user` skill."

This creates an **ambiguous activation mode**:
- Is this a **new session start** (requiring conversation-defaults init)?
- Is this a **mid-session subagent dispatch** (which should skip re-init per conversation-defaults skip condition)?

Claude interpreted this as a **mid-session dispatch** and skipped the full init sequence. However:
- The actual session had **not** previously gone through the conversation-defaults Rule 3 init
- So skipping it here was incorrect

The ambiguity arises because:
1. **conversation-defaults Rule 3** says "any first message of any session = session start signal"
2. **conversation-defaults skip condition (CORE.md §2)** says "skip re-loading on subsequent turns only — never on the first message"
3. The system-reminder indicated this is "a subagent for Patrick's FindA.Sale Cowork session," which is phrased like a mid-session role but is actually the first turn

**The system-reminder is the trigger:** It tells Claude its role upfront, which causes it to skip the session init and jump directly to skill execution.

---

## Recommended Fixes

### Fix 1: Inject conversation-defaults as System Layer (High Priority)

**Problem:** conversation-defaults is written correctly but is not injected as a system-layer rule at session init.

**Solution:**
- Add conversation-defaults Rules 1–11 to the system-reminder that is injected at the start of each session, **before CLAUDE.md files**
- Or: Ensure the Cowork session initialization explicitly loads conversation-defaults before any other skill or instruction
- This would make Rule 3 (unified session start) and Rule 4 (dev-environment gate) active from the first message, not optional

**Ownership:** Cowork infrastructure / session initialization layer (external to FindA.Sale)

**Impact:** HIGH — Would prevent similar init failures in future sessions

---

### Fix 2: Strengthen dev-environment as a Standalone Enforcement Checkpoint (High Priority)

**Problem:** dev-environment is written correctly but relies on conversation-defaults Rule 4 as an enforcement gate. Since Rule 4 doesn't fire, dev-environment is invisible.

**Solution:**
- Add a **meta-enforcement clause to dev-environment SKILL.md** that explicitly states:
  - "Before writing any shell command in the response, verify this clause has been read"
  - Include a one-line summary of the Neon `.env` read-and-inline procedure
  - This makes dev-environment self-reinforcing even if Rule 4 doesn't fire
- Alternatively: Ask Cowork to add a pre-command hook that fires whenever a shell command appears in Claude's response

**Ownership:** FindA.Sale (dev-environment skill maintainer)

**Impact:** MEDIUM-HIGH — dev-environment would become harder to skip, though still not foolproof without system-layer enforcement

---

### Fix 3: Add Explicit "First Message" Marker to Subagent Dispatch (Medium Priority)

**Problem:** The phrasing "You are running as a subagent" causes Claude to assume mid-session context, skipping init. But if the session has not previously initialized, this is wrong.

**Solution:**
- If this is **truly a first message**, prefix the dispatch with:
  ```
  [SESSION START — AGENT INIT MODE]

  You are running as a subagent for Patrick's FindA.Sale Cowork session...
  ```
- Or: Cowork UI could provide a flag indicating whether this is session-start mode vs. mid-session dispatch

**Ownership:** FindA.Sale ops / Patrick (how to phrase subagent requests) or Cowork infrastructure

**Impact:** MEDIUM — Clarifies intent and prevents ambiguous activation modes

---

### Fix 4: Review conversation-defaults v3 Skill Description (Low Priority)

**Problem:** The description says "Always-active conversation behavior defaults" and references being "always consulted," but it only fires reliably if injected as system context. This creates false confidence.

**Suggested wording update:**

**Current:**
```
Always-active conversation behavior defaults for Patrick's Cowork sessions.
Apply these rules at the start of every conversation and before asking any
clarifying questions.
```

**Proposed:**
```
Cowork session behavior rules — must be injected into system context at session
start for Rules 1–11 to apply. If not injected, **load this skill explicitly
before any ambiguous decisions** (file writes, shell commands, agent dispatch).
Apply these rules at the start of every conversation and before asking any
clarifying questions.
```

This is honest about the dependency and guides manual loading as a fallback.

**Ownership:** FindA.Sale (conversation-defaults maintainer)

**Impact:** LOW — Clarifies expectations but doesn't prevent failures

---

## Cross-Skill Coherence Analysis

### Skill Interaction Chain (Ideal vs. Actual)

**Ideal flow (if all enforcement gates worked):**

1. **Session start** → conversation-defaults Rule 3 fires → loads STATE.md, announces session, begins Priority 1
2. **Before shell command** → conversation-defaults Rule 4 fires → checks dev-environment loaded → yes → proceed
3. **Prisma migrate deploy** → dev-environment procedure applied → read `.env` → inline Neon URL → execute

**Actual flow (what happened):**

1. **Subagent dispatch** → no session init → conversation-defaults never loaded
2. **Before shell command** → dev-environment check skipped → no gate
3. **Prisma migrate deploy** → placeholder URL issued instead of real URL

### Skill Dependencies

| Skill | Depends On | Status |
|-------|-----------|--------|
| conversation-defaults | System-layer injection | ❌ Not injected |
| dev-environment | conversation-defaults Rule 4 | ❌ Rule 4 not loaded |
| cowork-power-user | conversation-defaults + dev-environment | ⚠️ Partially broken input |

### Gap: No System-Layer Enforcement for Shell Commands

**Critical gap identified:** There is no automatic checkpoint that fires when Claude writes a shell command. The flow relies entirely on:
1. conversation-defaults being injected at session start, AND
2. Claude proactively checking Rule 4 before writing the command

If (1) fails, (2) cannot happen.

**Recommendation:** Work with Cowork to add a pre-command hook or validation layer that intercepts shell commands before they are issued and verifies dev-environment context has been read.

---

## Session Wrap Implications

Since this session was specifically to audit the Power User skill and investigate init failures:

- ✅ Root causes identified (system-layer injection gap, no automatic command gates)
- ✅ Three fixes proposed (system injection, self-reinforcing dev-environment, dispatch clarity)
- ⚠️ Fixes 1 & 3 require external (Cowork) changes; Patrick cannot fix unilaterally
- ✅ Fixes 2 & 4 can be implemented by FindA.Sale immediately

---

## Inventory of Files Reviewed

- `/sessions/quirky-ecstatic-mayer/mnt/.skills/skills/cowork-power-user/SKILL.md` ✅ (correctly written, not the problem)
- `/sessions/quirky-ecstatic-mayer/mnt/.skills/skills/conversation-defaults/SKILL.md` ✅ (correctly written, not injected)
- `/sessions/quirky-ecstatic-mayer/mnt/.skills/skills/dev-environment/SKILL.md` ✅ (correctly written, not triggered)
- `/sessions/quirky-ecstatic-mayer/mnt/FindaSale/CLAUDE.md` ✅ (correctly written)
- `/sessions/quirky-ecstatic-mayer/mnt/.claude/CLAUDE.md` ✅ (correctly written)
- `/sessions/quirky-ecstatic-mayer/mnt/FindaSale/context.md` ✅ (correctly written)
- `/sessions/quirky-ecstatic-mayer/mnt/FindaSale/STATE.md` ✅ (correctly written)

---

## Blockers / Next Steps for Patrick

1. **Immediate:** Review Fixes 2 & 4 above and approve update to dev-environment and conversation-defaults SKILL.md files (can be done this session)
2. **After Cowork:** File issue with Cowork team about system-layer injection of conversation-defaults and command-pre-flight hook (Fixes 1 & 3)
3. **Future sessions:** If subagent dispatch causes init skip again, manually load `conversation-defaults` and `dev-environment` at the start of the dispatch (as a workaround)

---

**End of Audit**
