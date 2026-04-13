# Cowork Power User Audit Summary — Session Init Failures
**Audit Date:** 2026-03-11
**Report Files:**
- Full audit: `claude_docs/audits/cowork-power-user-session-init-audit-2026-03-11.md`
- Fixes memo: `claude_docs/improvement-memos/session-init-enforcement-improvements-2026-03-11.md`

---

## What Happened

Session 137 started with a subagent dispatch request to run the cowork-power-user skill. Claude responded by:
1. ❌ Skipping session init (no context load, no token budget announcement)
2. ❌ Not loading dev-environment before a Prisma command
3. ❌ Issuing `prisma migrate deploy <paste your Neon DATABASE_URL>` with a placeholder instead of reading `.env` from the VM and inlining the real URL

**This was a documented violation** of:
- conversation-defaults Rule 3 (unified session start)
- conversation-defaults Rule 4 (dev-environment gate before shell commands)
- dev-environment §107–113 (Neon `.env` read-and-inline procedure)

---

## Root Cause (Not a Skill Content Issue)

The skills themselves are correctly written. The issue is **enforcement**.

**Problem:** Both conversation-defaults and dev-environment rely on:
1. Being injected as system context at session start (conversation-defaults), OR
2. Claude proactively checking before writing commands (dev-environment Rule 4)

If (1) doesn't happen, (2) can't happen. When the subagent dispatch said "You are a subagent," Claude assumed this was mid-session and skipped init entirely.

**Result:** No gates, no checks, no enforcement. Placeholder URL issued.

---

## Three Causes Identified

| # | Problem | Cause | Fix Owner |
|---|---------|-------|-----------|
| 1 | conversation-defaults not injected as system rule | Cowork session init doesn't inject it | Cowork team |
| 2 | dev-environment Rule 4 not active | Depends on conversation-defaults, which wasn't loaded | (Depends on Fix 1) |
| 3 | No automatic command pre-flight gate | Relies on Claude to remember, no system-layer enforcement | Cowork team |

---

## Recommended Fixes (Grouped by Effort)

### Immediate (This Week) — Patrick Can Do These

**Fix A: Self-reinforcing dev-environment** (20 lines)
- Add "Before Any Command (Mandatory Check)" section to dev-environment SKILL.md
- Makes dev-environment self-defending even if conversation-defaults doesn't load
- File: `/sessions/.../dev-environment/SKILL.md`

**Fix B: conversation-defaults v4 + Fallback** (15 lines)
- Update frontmatter to admit system injection is required
- Add "Fallback" section with manual rules if not injected
- File: `/sessions/.../conversation-defaults/SKILL.md`

**Fix C: Trigger keywords** (1 line)
- Add explicit trigger keywords to conversation-defaults description
- Allows "load conversation defaults" to find it manually
- File: same as Fix B

**Status:** Can route to findasale-records this week for Tier 1 review

### External (Requires Cowork) — File Issues

**Fix D: Subagent dispatch clarity** (Session task)
- Prefix first-message subagent dispatch with `[SESSION START — SUBAGENT INIT MODE]`
- Prevents Claude from interpreting it as mid-session
- File: None (workflow change)

**Fix E: Cowork pre-flight hook** (Multi-session)
- Request Cowork add a validation layer that intercepts shell commands
- Checks for dev-environment context before allowing command through
- Blocks placeholder patterns
- **This is the high-impact fix** — prevents the entire class of "placeholder command" errors

**Fix F: Cowork system injection of conversation-defaults** (Multi-session)
- Request Cowork inject conversation-defaults as system context at session start
- Makes Rules 1–11 active from first message, no manual loading needed
- **This is the foundational fix** — makes everything else work

---

## Impact Summary

**If you implement Fixes A–D (Patrick can do):**
- ✅ dev-environment becomes self-defending
- ✅ conversation-defaults admits its dependency, provides fallback
- ✅ Subagent dispatch is unambiguous
- ⚠️ Still vulnerable if Cowork system injection doesn't happen

**If Cowork also implements Fixes E–F:**
- ✅ Shell commands automatically validated before issuance
- ✅ conversation-defaults Rules 1–11 active from session start
- ✅ Init failures become nearly impossible

---

## Quick Reference: Files to Update

1. `/sessions/quirky-ecstatic-mayer/mnt/.skills/skills/dev-environment/SKILL.md`
   - Add "Before Any Command (Mandatory Check)" section after Self-Correction Clause

2. `/sessions/quirky-ecstatic-mayer/mnt/.skills/skills/conversation-defaults/SKILL.md`
   - Update frontmatter (1 paragraph)
   - Add "Fallback" section at end
   - Add trigger keywords to description

3. (Optional) Manual workflow change: prefix subagent dispatches with `[SESSION START — SUBAGENT INIT MODE]`

---

## Next Steps

1. **Review the full audit:** `cowork-power-user-session-init-audit-2026-03-11.md`
2. **Review the fixes memo:** `session-init-enforcement-improvements-2026-03-11.md`
3. **Approve Fixes A–D:** Route to findasale-records for Tier 1 review
4. **File Cowork issues:** Create tickets for Fixes E–F (command pre-flight hook + system injection)
5. **Optional:** Update session-wrap protocol to document subagent dispatch phrasing (Fix D)

---

## Why This Matters

Session init failures are **high-impact** because they:
- Disable all conversation-defaults rules (11 active safeguards gone)
- Disable dev-environment gates (worst-database-trap exposure)
- Miss context loads (STATE.md, session-log, checkpoint-manifest)
- Miss token budget tracking
- Leave agents operating in a "no rules" state

Fixing this prevents future sessions from:
- Issuing database commands against the wrong DB
- Missing priority queue awareness
- Losing token tracking and context history
- Skipping security gates (Rule 5, Rule 6, etc.)

---

**End of Summary**
