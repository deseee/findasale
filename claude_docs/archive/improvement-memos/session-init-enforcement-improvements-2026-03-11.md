# Improvement Memo — Session Init Enforcement Strengthening
**Date:** 2026-03-11
**Found by:** Cowork Power User (audit triggered by Patrick)
**Category:** Workflow / Skill Optimization
**Priority:** High

---

## Summary

Session 137 initialization exposed a critical enforcement gap: conversation-defaults and dev-environment rely on system-layer injection or proactive Claude behavior to trigger, but neither was reliably active. When subagent dispatch happened, Claude skipped session init entirely and issued a Prisma command with a placeholder URL instead of reading `.env` from the VM.

Root cause: **No automatic gates** for shell commands or session-start rules. Everything is "honor system."

Fixes 1–2 below can be implemented immediately by FindA.Sale. Fixes 3–4 require Cowork platform changes.

---

## Improvement 1: Self-Reinforcing Enforcement in dev-environment (Auto-Executable)

**Impact:** HIGH — dev-environment becomes harder to skip, prevents placeholder-URL pattern
**Effort:** Quick win (20-line addition)
**Route to:** findasale-records (for Tier 1 review)

### Current State

dev-environment has a "Self-Correction Clause" but it depends on conversation-defaults Rule 4 to trigger. When Rule 4 is not loaded, Claude has no gate.

### Proposed Change

Add a **pre-command verification paragraph** in dev-environment, at the top before "Host Machine":

```markdown
## Before Any Command (Mandatory Check)

If you are about to write ANY shell command, PowerShell command, Prisma command,
or environment variable guidance in your response:

1. **Stop.** Verify you have read the sections below (especially "Database Setup" and "Prisma Commands").
2. **Confirm:** You are not about to issue a placeholder command like `prisma migrate deploy <paste your URL>`. Always read `packages/backend/.env` from the VM and inline the real URL.
3. **Proceed** only after confirming you know which database (local vs. Neon) the command will hit.

This clause overrides conversation-defaults Rule 4 if Rule 4 is not loaded.
```

### Why This Works

- Makes dev-environment **self-defending** even if conversation-defaults is not injected
- Shifts from "optional gate" to "mandatory clause"
- Frames the check as immediate/proactive, not delegated to a conversation layer
- Does not require external changes to Cowork

### Implementation

Edit `/sessions/quirky-ecstatic-mayer/mnt/.skills/skills/dev-environment/SKILL.md`:
- Insert the "Before Any Command" section after the Self-Correction Clause, before "Host Machine"
- Keep the existing content intact

---

## Improvement 2: Honesty Update to conversation-defaults v4 (Auto-Executable)

**Impact:** MEDIUM — Clarifies dependency, guides manual loading as fallback
**Effort:** Quick win (15-line update)
**Route to:** findasale-records (for Tier 1 review)

### Current State

conversation-defaults frontmatter says "Always-active conversation behavior defaults" and Rule 3 says "Apply these rules at the start of every conversation."

This creates false confidence — the rules only apply if they are injected into system context.

### Proposed Change

Update the SKILL.md frontmatter and Rule 3 header:

**Current frontmatter:**
```yaml
description: >
  Always-active conversation behavior defaults for Patrick's Cowork sessions.
  Apply these rules at the start of every conversation and before asking any
  clarifying questions. This skill MUST be consulted whenever Claude is about
  to ask the user a question, present choices, or clarify requirements — even
  for simple tasks. Do not skip this skill.
```

**Proposed frontmatter (v4):**
```yaml
description: >
  Cowork session behavior rules. For these rules to apply, this skill must be
  injected into Cowork system context at session start. If not injected,
  **manually load this skill or reference it explicitly** before ambiguous
  decisions (file writes, shell commands, subagent dispatch, context budgeting).
  Rules 1–11 define behavior for all conversations. See "Fallback" section if
  rules are not system-injected.
```

**Add a new "Fallback" section after the Summary (line 213), before end:**

```markdown
---

## Fallback (If This Skill Is Not System-Injected)

If you are in a session where this skill was **not automatically loaded by Cowork
at init time**, apply these rules manually:

1. **At session start:** Load context (STATE.md, session-log, checkpoint-manifest) silently. Announce session number, token budget, priority queue. Begin Priority 1.
2. **Before shell commands:** Load `dev-environment` skill. Apply its Neon `.env` read-and-inline procedure.
3. **Before file writes:** Announce the modification approach (targeted edit or full rewrite).
4. **Before dispatching agents:** Check context weight. Write checkpoint if dispatching 3+ agents.

Ideally, this skill should be system-injected at session start. If it is not, apply
the rules above manually as a workaround.
```

### Why This Works

- Honesty about the dependency, builds trust
- Provides a **manual fallback** if system injection fails
- Guides users (and future agents) to explicit loading as a recovery pattern
- Does not require external changes to Cowork

---

## Improvement 3: Add Command Pre-Flight Hook to Cowork (External)

**Impact:** VERY HIGH — Prevents placeholder commands, catches dev-environment misses
**Effort:** Multi-session (requires Cowork infrastructure change)
**Route to:** Cowork team (file GitHub issue)

### Proposal

Request Cowork to add a **validation layer that intercepts shell commands** before they are issued in responses:

```
When Claude writes a shell command in a response:
1. Check: Is dev-environment (or equivalent environment-gate skill) in active context?
2. If no: Block the command. Suggest loading the skill first.
3. If yes: Check for placeholder patterns (e.g., <paste your...>, [your value here]).
4. If found: Block and suggest inlining real values.
5. If clear: Allow the command through.
```

### Why This Works

- Shifts from "honor system" to **automatic enforcement**
- Prevents the specific "placeholder URL" pattern
- Catches both conversation-defaults Rule 4 misses AND dev-environment skips
- Works regardless of which skill is (or is not) loaded

### Fallback (If Cowork Doesn't Support This)

Ask Cowork to expose a `@verify-shell-command` or `@before-command` hook that skills can register. Then dev-environment and conversation-defaults can register themselves as pre-command validators.

---

## Improvement 4: Clarify Subagent Dispatch Language (External)

**Impact:** MEDIUM — Prevents ambiguous "mid-session" interpretation
**Effort:** Session task (Patrick can update workflow)
**Route to:** Patrick (or codify in session-wrap protocol)

### Proposal

When dispatching a subagent **at the very start of a session** (before any turns have been completed):

**Instead of:**
```
You are running as a subagent for Patrick's FindA.Sale Cowork session.
Your job is to invoke and run the `cowork-power-user` skill.
```

**Use:**
```
[SESSION START — SUBAGENT INIT MODE]

You are running as a subagent for Patrick's FindA.Sale Cowork session.
Your job is to invoke and run the `cowork-power-user` skill.
```

### Why This Works

- Explicitly signals that this is a **first message**, not a mid-session dispatch
- Prevents Claude from assuming it should skip session init
- Makes the intent unambiguous to both Claude and human readers

### Implementation

- Patrick can add this to his subagent dispatch requests manually
- Or: Add it to `claude_docs/operations/MESSAGE_BOARD.json` as a template for standard dispatch phrasing
- Or: Codify in conversation-defaults Rule 3 as a "subagent first message" variant

---

## Improvement 5: Add Skill Triggering Keyword to conversation-defaults (Auto-Executable)

**Impact:** MEDIUM — Makes conversation-defaults more findable
**Effort:** Quick win (1-line update)
**Route to:** findasale-records (for Tier 1 review)

### Proposal

Add triggering keyword to conversation-defaults description:

**Current:**
```yaml
description: >
  Always-active conversation behavior defaults...
```

**Proposed:**
```yaml
description: >
  Always-active conversation behavior defaults...
  Trigger on: session start, first message, ambiguous decisions, shell commands,
  subagent dispatch, token budgeting, file writes. Also: "load conversation defaults",
  "apply rules", "session init".
```

### Why This Works

- If system injection fails, a user can say "load conversation defaults" and Claude will find this skill
- Adds explicit keywords for mid-session recovery
- Costs nothing (just description text)

---

## Implementation Schedule

| Improvement | Owner | Timeline | Blocker? |
|-------------|-------|----------|----------|
| 1: Self-reinforcing dev-environment | Patrick/records | This week | No |
| 2: conversation-defaults v4 + Fallback | Patrick/records | This week | No |
| 5: Trigger keywords | Patrick/records | This week | No |
| 3: Cowork pre-flight hook | Cowork team | TBD (external) | Yes, if system injection continues to fail |
| 4: Subagent dispatch clarity | Patrick | This week | No |

---

## Expected Outcomes

If Improvements 1, 2, and 5 are implemented:
- ✅ dev-environment becomes self-defending
- ✅ conversation-defaults provides manual fallback
- ✅ Future sessions have a manual recovery path
- ⚠️ Still vulnerable to system-layer injection gaps (requires Improvement 3 or Cowork fix)

If Improvements 3–4 are also completed (external):
- ✅ Shell commands automatically validated
- ✅ Subagent dispatch unambiguous
- ✅ Init failures become nearly impossible

---

## Appendix: Files Requiring Updates

1. `/sessions/quirky-ecstatic-mayer/mnt/.skills/skills/dev-environment/SKILL.md` — Add "Before Any Command" section
2. `/sessions/quirky-ecstatic-mayer/mnt/.skills/skills/conversation-defaults/SKILL.md` — Update frontmatter + add "Fallback" section
3. (Optional) `/sessions/quirky-ecstatic-mayer/mnt/FindaSale/claude_docs/operations/MESSAGE_BOARD.json` — Add subagent dispatch template

---

**Next Steps:** Route Improvements 1, 2, 5 to findasale-records for Tier 1 review. File issue with Cowork about Improvements 3–4.
