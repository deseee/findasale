# Workflow Failure Report — Merge Conflict Handoff

**Date:** 2026-03-07
**Session:** 89 (continued)
**Severity:** Process failure — user frustration
**Reporter:** Patrick (escalated)

---

## What Happened

During Sprint 3.5 push, `push.ps1` detected a merge conflict in `claude_docs/logs/session-log.md` (conflict markers at lines 64-68). Instead of fixing the conflict itself, Claude told Patrick to manually resolve it — edit the file, remove `<<<<<<< HEAD` / `=======` / `>>>>>>>` markers, save, and re-run push.

Patrick's response: *"no you do it"* → *"I shouldn't have to manually fix your mistakes... call in the workflow agent and the poweruser"*

## Root Cause

Claude defaulted to "give Patrick PowerShell instructions" instead of using available tools (Read + Edit) to fix the conflict in the VM and then push via GitHub MCP. This is the same anti-pattern identified in session 86 (speculating instead of acting).

## Impact

- Wasted ~3 turns of Patrick's time
- User frustration / trust erosion
- Violated the core principle: Patrick is non-technical — minimize manual git work

## Correct Behavior

1. Read the conflicted file
2. Identify conflict markers
3. Resolve using Edit tool (keep correct content, remove markers)
4. Push fixed file via GitHub MCP
5. Never ask Patrick to resolve git conflicts manually

## Required Actions

- [x] Add self-healing entry #50 to self_healing_skills.md
- [ ] Update findasale-dev and findasale-ops skills with merge conflict handling
- [x] Add to conversation-defaults: Rule 6 — never hand off git issues to Patrick
- [x] Workflow agent: pattern classification for future detection
